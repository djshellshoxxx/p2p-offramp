// Intentionally RED at exchange source 0054543. Run explicitly; not part of npm test.
// Reproduces PR #16 findings using the actual registry/review and Noble crypto.
// Synthetic local-EVM fixture only; no network, wallets, live funds or persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService, TERMS_REVIEW_FORMAT } from '../../../packages/domain/index.ts';
import { evmTermsHash } from '../../../packages/wallet/src/evm-terms.ts';
import { createLocalNobleNostrProvider, createRelayEventCrypto } from '../../../packages/nostr-crypto/index.ts';
import { createAdEvent, createOrderBook } from '../../../packages/relay/index.ts';
import { createTermsExchange, adBookKey } from '../../../packages/exchange/index.ts';

const fixture = new URL('../../../packages/domain/test/fixtures/local-evm-scenario/', import.meta.url);
const scenario = JSON.parse(await readFile(new URL('scenario.json', fixture), 'utf8'));
const registry = new RegistryService();
assert.equal((await registry.load(new Uint8Array(await readFile(new URL('registry.json', fixture))), scenario.registrySha256)).ok, true);
const provider = createLocalNobleNostrProvider();
const NOW = 1_699_999_900;
const set = scenario.sets.native;
const buyerAddress = set.terms.buyer;
const replacementAddress = `0x${'22'.repeat(20)}`;
const bytes = new TextEncoder().encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms: set.terms, privateAgreement: set.privateAgreementInput }));
const sha256 = async input => {
  const digest = createHash('sha256').update(input).digest();
  return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
};
const hashTerms = r => evmTermsHash({ chainId: r.network.chainId, verifyingContract: r.deployment.address }, {
  orderId: r.orderId, revision: r.revision, networkId: r.network.id, deploymentId: r.deployment.id,
  seller: r.seller, buyer: r.buyer, assetKind: r.asset.kind, asset: r.asset.address ?? `0x${'00'.repeat(20)}`,
  amountBaseUnits: r.amountBaseUnits, privateAgreementHash: r.privateAgreementSha256, capabilitiesHash: r.capabilitiesSha256,
  sellerNonce: r.sellerNonce, acceptBeforeSeconds: r.acceptBeforeSeconds, escrowExpirySeconds: r.escrowExpirySeconds,
});
const ok = result => { assert.equal(result.ok, true, `setup failed: ${result.code}`); return result.value; };

function pauseOnce(fn) {
  let armed = false, entered, release;
  const reached = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  return {
    arm() { armed = true; }, reached, release,
    async call(...args) {
      if (armed) { armed = false; entered(); await gate; }
      return fn(...args);
    },
  };
}

async function world(options = {}, adExpiry = NOW + 1800) {
  const clock = { now: NOW };
  async function party() {
    const key = await provider.generate();
    const crypto = await createRelayEventCrypto(provider, key.secretKey);
    const book = createOrderBook({ nowSeconds: () => clock.now, verifier: crypto });
    const ex = createTermsExchange({ provider, selfPublicKey: key.publicKey, ads: book, registry, hashTerms,
      now: () => clock.now, sha256, ...options });
    return { pub: key.publicKey, secret: key.secretKey, crypto, book, ex };
  }
  const seller = await party(), buyer = await party();
  const ad = await createAdEvent(seller.crypto, { app: 'p2p-offramp', v: 1, orderId: set.terms.orderId,
    revision: 1, networkId: 'eip155:31337', assetId: 'native', amountMin: '1000000000000000000', amountMax: '2000000000000000000',
    currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(adExpiry), maker: seller.pub }, NOW);
  assert.equal(seller.book.ingest(ad), 'accepted');
  assert.equal(buyer.book.ingest(ad), 'accepted');
  return { seller, buyer, clock, key: adBookKey(seller.pub, set.terms.orderId), close() {
    seller.ex.close(); buyer.ex.close(); seller.crypto.dispose(); buyer.crypto.dispose(); seller.secret.fill(0); buyer.secret.fill(0);
  } };
}

async function offer(w) {
  const take = ok(await w.buyer.ex.take(w.key, buyerAddress, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offered = ok(await w.seller.ex.offer(take.sessionId, bytes, w.seller.secret));
  return { id: take.sessionId, offered };
}

for (const [label, address] of [['different address', replacementAddress], ['same address, new generation', buyerAddress]]) {
  test(`pending review refuses a replacement session: ${label}`, { timeout: 10_000 }, async () => {
    const reviewGate = pauseOnce(sha256);
    const w = await world({ sha256: reviewGate.call });
    try {
      const { id, offered } = await offer(w);
      reviewGate.arm();
      const pending = w.buyer.ex.receive(offered.recipientWrap, w.buyer.secret);
      await reviewGate.reached;
      ok(await w.buyer.ex.cancel(id, 'withdrawn', w.buyer.secret));
      ok(await w.buyer.ex.take(w.key, address, w.buyer.secret));
      const before = w.buyer.ex.session(id);
      assert.equal(before.state, 'taken'); assert.equal(before.terms, null);
      reviewGate.release();
      const result = await pending;
      const after = w.buyer.ex.session(id);
      assert.equal(result.ok, false, JSON.stringify({ expected: 'stale review refused', result: result.ok,
        currentBuyer: after.buyerAddress, reviewedBuyer: after.terms?.reviewed.buyer, state: after.state }));
      assert.deepEqual(after, before);
    } finally { reviewGate.release(); w.close(); }
  });
}

test('take refuses ad expiry reached during signer lookup', { timeout: 10_000 }, async () => {
  const lookup = pauseOnce(secret => provider.publicKey(secret));
  const w = await world({ provider: { ...provider, publicKey: lookup.call } }, NOW + 10);
  try {
    lookup.arm(); const pending = w.buyer.ex.take(w.key, buyerAddress, w.buyer.secret);
    await lookup.reached; w.clock.now = NOW + 10; lookup.release();
    const result = await pending;
    assert.equal(result.ok, false, JSON.stringify({ expected: 'AD_EXPIRED', result: result.ok, sessionCount: w.buyer.ex.sessionCount }));
    assert.equal(result.code, 'AD_EXPIRED'); assert.equal(w.buyer.ex.sessionCount, 0);
  } finally { lookup.release(); w.close(); }
});

test('accept refuses the exact terms deadline reached during signer lookup', { timeout: 10_000 }, async () => {
  const lookup = pauseOnce(secret => provider.publicKey(secret));
  const w = await world({ provider: { ...provider, publicKey: lookup.call } });
  try {
    const { id, offered } = await offer(w);
    ok(await w.buyer.ex.receive(offered.recipientWrap, w.buyer.secret));
    lookup.arm(); const pending = w.buyer.ex.accept(id, bytes, w.buyer.secret);
    await lookup.reached; w.clock.now = Number(set.terms.acceptBeforeSeconds); lookup.release();
    const result = await pending;
    assert.equal(result.ok, false, JSON.stringify({ expected: 'EXPIRED', result: result.ok, state: w.buyer.ex.session(id).state }));
    assert.equal(result.code, 'EXPIRED'); assert.equal(w.buyer.ex.session(id).state, 'offered');
  } finally { lookup.release(); w.close(); }
});

test('outgoing replay capacity refuses a second message without state changes', { timeout: 10_000 }, async () => {
  const w = await world({ maxSeenMessages: 1 });
  try {
    const take = ok(await w.buyer.ex.take(w.key, buyerAddress, w.buyer.secret));
    const before = w.buyer.ex.session(take.sessionId);
    const result = await w.buyer.ex.cancel(take.sessionId, 'withdrawn', w.buyer.secret);
    assert.equal(result.ok, false, JSON.stringify({ expected: 'LIMIT_EXCEEDED', result: result.ok, state: w.buyer.ex.session(take.sessionId).state }));
    assert.equal(result.code, 'LIMIT_EXCEEDED'); assert.deepEqual(w.buyer.ex.session(take.sessionId), before);
  } finally { w.close(); }
});
