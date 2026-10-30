import nodeTest from 'node:test';
const test = (name, run) => nodeTest(name, { timeout: 10000 }, run);
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../../domain/src/registry.ts';
import { TERMS_REVIEW_FORMAT } from '../../domain/index.ts';
import { evmTermsHash } from '../../wallet/src/evm-terms.ts';
import { createLocalNobleNostrProvider } from '../../nostr-crypto/index.ts';
import { createAdEvent, createOrderBook } from '../../relay/index.ts';
import { createTermsExchange, createRelayEventCrypto, adBookKey } from '../index.ts';

// Synthetic local scenario, real pinned providers. No network or chain transaction.
const dir = new URL('../../domain/test/fixtures/local-evm-scenario/', import.meta.url);
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const registry = new RegistryService();
assert.equal((await registry.load(new Uint8Array(await readFile(new URL('registry.json', dir))), scenario.registrySha256)).ok, true);
const provider = createLocalNobleNostrProvider();
const terms = scenario.sets.native.terms;
const now0 = 1_699_990_000;
const zero = `0x${'0'.repeat(40)}`;
const bytes = new TextEncoder().encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms, privateAgreement: scenario.sets.native.privateAgreementInput }));
const sha256 = async value => { const digest = createHash('sha256').update(value).digest(); return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength); };
const hashTerms = value => evmTermsHash({ chainId: value.network.chainId, verifyingContract: value.deployment.address }, {
  orderId: value.orderId, revision: value.revision, networkId: value.network.id, deploymentId: value.deployment.id,
  seller: value.seller, buyer: value.buyer, assetKind: value.asset.kind, asset: value.asset.address ?? zero,
  amountBaseUnits: value.amountBaseUnits, privateAgreementHash: value.privateAgreementSha256,
  capabilitiesHash: value.capabilitiesSha256, sellerNonce: value.sellerNonce,
  acceptBeforeSeconds: value.acceptBeforeSeconds, escrowExpirySeconds: value.escrowExpirySeconds,
});
function barrier() {
  let enter, release, armed = false;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  return { entered, arm() { armed = true; }, release() { armed = false; release(); },
    async wait() { if (armed) { armed = false; enter(); await held; } } };
}
function delayed(method) {
  const gate = barrier();
  return { gate, provider: { ...provider, async [method](...args) { await gate.wait(); return provider[method](...args); } } };
}
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
function refused(result, code) { assert.equal(result.ok, false); assert.equal(result.code, code); }
async function world(options = {}) {
  const start = options.start ?? now0;
  const clock = { now: start };
  async function party(maxSeenMessages) {
    const key = await provider.generate();
    const crypto = await createRelayEventCrypto(provider, key.secretKey);
    const book = createOrderBook({ nowSeconds: () => clock.now, verifier: crypto });
    const ex = createTermsExchange({ provider: options.provider ?? provider, selfPublicKey: key.publicKey,
      ads: book, registry, hashTerms, now: () => clock.now, sha256: options.sha256 ?? sha256,
      ...(maxSeenMessages === undefined ? {} : { maxSeenMessages }) });
    return { secret: key.secretKey, pub: key.publicKey, crypto, book, ex };
  }
  const seller = await party(options.sellerMaxSeen), buyer = await party(options.buyerMaxSeen);
  async function addAd(orderId = terms.orderId) {
    const ad = await createAdEvent(seller.crypto, { app: 'p2p-offramp', v: 1, orderId, revision: 1,
      networkId: 'eip155:31337', assetId: 'native', amountMin: '1000000000000000000', amountMax: '2000000000000000000',
      currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(start + (options.adLifetime ?? 1800)), maker: seller.pub }, start);
    assert.equal(seller.book.ingest(ad), 'accepted'); assert.equal(buyer.book.ingest(ad), 'accepted');
    return adBookKey(seller.pub, orderId);
  }
  const key = await addAd();
  return { clock, seller, buyer, key, addAd, close() { seller.ex.close(); buyer.ex.close(); seller.crypto.dispose(); buyer.crypto.dispose(); } };
}
async function offered(w) {
  const take = ok(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offer = ok(await w.seller.ex.offer(take.sessionId, bytes, w.seller.secret));
  return { id: take.sessionId, offer };
}

for (const method of ['publicKey', 'signSchnorr']) {
  test(`take refuses ad expiry while ${method} is pending without admitting a session`, async () => {
    const d = delayed(method), w = await world({ provider: d.provider });
    try {
      d.gate.arm(); const pending = w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret);
      await d.gate.entered; w.clock.now += 1800; d.gate.release();
      refused(await pending, 'AD_EXPIRED'); assert.equal(w.buyer.ex.sessionCount, 0);
    } finally { d.gate.release(); w.close(); }
  });
}
test('accept refuses a deadline crossed during signing and retains offered state', async () => {
  const d = delayed('publicKey'), w = await world({ provider: d.provider, start: Number(terms.acceptBeforeSeconds) - 100 });
  try {
    const { id, offer } = await offered(w); ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
    d.gate.arm(); const pending = w.buyer.ex.accept(id, bytes, w.buyer.secret);
    await d.gate.entered; w.clock.now = Number(terms.acceptBeforeSeconds); d.gate.release();
    refused(await pending, 'EXPIRED'); assert.equal(w.buyer.ex.session(id).state, 'offered');
  } finally { d.gate.release(); w.close(); }
});
test('receive refuses an ad that expires during signer lookup', async () => {
  const d = delayed('publicKey'), w = await world({ provider: d.provider });
  try {
    const take = ok(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret));
    d.gate.arm(); const pending = w.seller.ex.receive(take.recipientWrap, w.seller.secret);
    await d.gate.entered; w.clock.now += 1800; d.gate.release();
    const result = await pending;
    assert.equal(result.ok, false); assert.ok(['EXPIRED', 'AD_EXPIRED'].includes(result.code));
    assert.equal(w.seller.ex.sessionCount, 0);
  } finally { d.gate.release(); w.close(); }
});
for (const replacementAddress of [terms.buyer, `0x${'2'.repeat(40)}`]) {
  test(`pending offer review cannot bind to a replacement session (${replacementAddress === terms.buyer ? 'same' : 'different'} address)`, async () => {
    const gate = barrier(), w = await world({ sha256: async value => { await gate.wait(); return sha256(value); } });
    try {
      const { id, offer } = await offered(w);
      gate.arm(); const pending = w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret);
      await gate.entered;
      ok(await w.buyer.ex.cancel(id, 'withdrawn', w.buyer.secret));
      ok(await w.buyer.ex.take(w.key, replacementAddress, w.buyer.secret));
      gate.release(); refused(await pending, 'OUT_OF_ORDER');
      const session = w.buyer.ex.session(id);
      assert.equal(session.buyerAddress, replacementAddress); assert.equal(session.state, 'taken'); assert.equal(session.terms, null);
    } finally { gate.release(); w.close(); }
  });
}
test('outgoing replay capacity refuses before state change and expired ids free capacity', async () => {
  const w = await world({ buyerMaxSeen: 2 });
  try {
    const take = ok(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret));
    ok(await w.buyer.ex.cancel(take.sessionId, 'withdrawn', w.buyer.secret));
    refused(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret), 'LIMIT_EXCEEDED');
    assert.equal(w.buyer.ex.session(take.sessionId).state, 'cancelled');
    w.clock.now += 901;
    ok(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret));
  } finally { w.close(); }
});
test('concurrent outgoing completions share one replay slot', async () => {
  const d = delayed('publicKey'), w = await world({ provider: d.provider, buyerMaxSeen: 1 });
  try {
    const second = await w.addAd('f'.repeat(64)); d.gate.arm();
    const pending = [w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret), w.buyer.ex.take(second, terms.buyer, w.buyer.secret)];
    await d.gate.entered; d.gate.release();
    const results = await Promise.all(pending);
    assert.equal(results.filter(result => result.ok).length, 1);
    refused(results.find(result => !result.ok), 'LIMIT_EXCEEDED'); assert.equal(w.buyer.ex.sessionCount, 1);
  } finally { d.gate.release(); w.close(); }
});
test('concurrent incoming completions share one replay slot', async () => {
  const d = delayed('publicKey'), w = await world({ provider: d.provider, sellerMaxSeen: 1 });
  try {
    const second = await w.addAd('f'.repeat(64));
    const a = ok(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret));
    const b = ok(await w.buyer.ex.take(second, terms.buyer, w.buyer.secret));
    d.gate.arm(); const pending = [w.seller.ex.receive(a.recipientWrap, w.seller.secret), w.seller.ex.receive(b.recipientWrap, w.seller.secret)];
    await d.gate.entered; d.gate.release(); const results = await Promise.all(pending);
    assert.equal(results.filter(result => result.ok).length, 1);
    refused(results.find(result => !result.ok), 'LIMIT_EXCEEDED'); assert.equal(w.seller.ex.sessionCount, 1);
  } finally { d.gate.release(); w.close(); }
});

for (const terminal of ['cancelled', 'accepted']) {
  test(`late take cannot replace a newer ${terminal} session`, async () => {
    const d = delayed('publicKey'), w = await world({ provider: d.provider });
    try {
      d.gate.arm(); const pending = w.buyer.ex.take(w.key, `0x${'2'.repeat(40)}`, w.buyer.secret);
      await d.gate.entered;
      const { id, offer } = await offered(w);
      if (terminal === 'cancelled') ok(await w.buyer.ex.cancel(id, 'withdrawn', w.buyer.secret));
      else {
        ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
        ok(await w.buyer.ex.accept(id, bytes, w.buyer.secret));
        refused(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret), 'OUT_OF_ORDER');
      }
      d.gate.release(); refused(await pending, 'OUT_OF_ORDER');
      const session = w.buyer.ex.session(id);
      assert.equal(session.state, terminal); assert.equal(session.buyerAddress, terms.buyer);
    } finally { d.gate.release(); w.close(); }
  });
}
test('oversized offer is rejected before copying, review, or signing', async () => {
  const d = delayed('publicKey'), w = await world({ provider: d.provider });
  const Native = Uint8Array;
  try {
    const take = ok(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret));
    ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
    const input = new Native(16385); let copied = false;
    // Observe only this oversized input; do not proxy the frozen crypto provider.
    globalThis.Uint8Array = new Proxy(Native, { construct(target, args) {
      if (args[0] === input) copied = true;
      return Reflect.construct(target, args, target);
    } });
    d.gate.arm();
    refused(await w.seller.ex.offer(take.sessionId, input, w.seller.secret), 'LIMIT_EXCEEDED');
    assert.equal(copied, false); assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
  } finally { globalThis.Uint8Array = Native; d.gate.release(); w.close(); }
});
