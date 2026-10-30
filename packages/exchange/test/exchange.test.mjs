import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../../domain/src/registry.ts';
import { TERMS_REVIEW_FORMAT } from '../../domain/index.ts';
import { evmTermsHash } from '../../wallet/src/evm-terms.ts';
import { createUnsignedEvent, createSeal, createGiftWrap, createLocalNobleNostrProvider } from '../../nostr-crypto/index.ts';
import { createRelayPool, createAdEvent, createOrderBook, AD_KIND } from '../../relay/index.ts';
import { startFakeRelay } from '../../relay/test/support/fake-relay.mjs';
import { makeBroker, FAST, until } from '../../relay/test/support/harness.mjs';
import { createRelayEventCrypto, createTermsExchange, adAddress, adBookKey, encodeEnvelope, envelopeTags, transition } from '../index.ts';

// SYNTHETIC local scenario (packages/domain/test/fixtures/local-evm-scenario): same-author regression fixture, not a golden vector.
const dir = new URL('../../domain/test/fixtures/local-evm-scenario/', import.meta.url);
const registryBytes = new Uint8Array(await readFile(new URL('registry.json', dir)));
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const loaded = await new RegistryService().load(registryBytes, scenario.registrySha256);
assert.equal(loaded.ok, true);
const registry = new RegistryService(); assert.equal((await registry.load(registryBytes, scenario.registrySha256)).ok, true);

const provider = createLocalNobleNostrProvider();
const NOW = 1_699_990_000; // before the fixture's acceptBefore (1_700_000_000)
const set = scenario.sets.native;
const ORDER = set.terms.orderId;
const ZERO = `0x${'0'.repeat(40)}`;
const utf8 = new TextEncoder();
const docFor = (terms = set.terms, agreement = set.privateAgreementInput) => ({ format: TERMS_REVIEW_FORMAT, terms, privateAgreement: agreement });
const termsBytes = (doc = docFor()) => utf8.encode(JSON.stringify(doc));
/** The hash the escrow will compute for the reviewed terms: packages/wallet evmTermsHash over the registry-derived domain. */
const hashTerms = r => evmTermsHash({ chainId: r.network.chainId, verifyingContract: r.deployment.address }, {
  orderId: r.orderId, revision: r.revision, networkId: r.network.id, deploymentId: r.deployment.id, seller: r.seller, buyer: r.buyer,
  assetKind: r.asset.kind, asset: r.asset.address ?? ZERO, amountBaseUnits: r.amountBaseUnits, privateAgreementHash: r.privateAgreementSha256,
  capabilitiesHash: r.capabilitiesSha256, sellerNonce: r.sellerNonce, acceptBeforeSeconds: r.acceptBeforeSeconds, escrowExpirySeconds: r.escrowExpirySeconds });
const nodeSha256 = async bytes => { const d = createHash('sha256').update(bytes).digest(); return d.buffer.slice(d.byteOffset, d.byteOffset + 32); };

async function party() { const k = await provider.generate(); return { secret: k.secretKey, pub: k.publicKey, crypto: await createRelayEventCrypto(provider, k.secretKey) }; }
const adFor = (maker, over = {}) => ({ app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:31337', assetId: 'native', amountMin: '1000000000000000000',
  amountMax: '2000000000000000000', currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(NOW + 1800), maker, ...over });

/** A seller, a buyer and bystanders, each with their own order book and exchange over one shared clock. */
async function world(options = {}) {
  const clock = { now: NOW };
  const seller = await party(), buyer = await party(), third = await party();
  const make = who => {
    const book = createOrderBook({ nowSeconds: () => clock.now, verifier: who.crypto });
    return { book, ex: createTermsExchange({ provider, selfPublicKey: who.pub, ads: book, registry, hashTerms, now: () => clock.now, sha256: nodeSha256, ...options }) };
  };
  const s = make(seller), b = make(buyer);
  const ad = await createAdEvent(seller.crypto, adFor(seller.pub), NOW);
  assert.equal(s.book.ingest(ad), 'accepted'); assert.equal(b.book.ingest(ad), 'accepted');
  return { clock, seller: { ...seller, ...s }, buyer: { ...buyer, ...b }, third, ad, key: adBookKey(seller.pub, ORDER), address: adAddress(seller.pub, ORDER) };
}
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fail = (result, code, review) => { assert.equal(result.ok, false, `expected ${code}, got ${JSON.stringify(result)}`); assert.equal(result.code, code); if (review) assert.equal(result.review, review); };
/** Hand-build any message from any key, bypassing the exchange's own checks. */
async function craft(from, to, address, type, body, over = {}) {
  const envelope = { v: 1, type, ad: address, orderId: ORDER, sender: from.pub, recipient: to.pub, nonce: over.nonce ?? 'ab'.repeat(32),
    expiresAtSeconds: String(over.expires ?? NOW + 600), termsHash: over.termsHash ?? null, body, ...over.envelope };
  const rumor = createUnsignedEvent(from.pub, { kind: 14, created_at: NOW, tags: over.tags ?? envelopeTags(envelope), content: over.content ?? encodeEnvelope(envelope) });
  return createGiftWrap(await createSeal(rumor, from.secret, to.pub, provider, NOW), to.pub, provider, NOW);
}
const takeBody = who => ({ buyerAddress: set.terms.buyer, buyerMessagingKey: who.pub });
async function toOffered(w) {
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  const got = ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  return { id: take.sessionId, take, offer, got };
}

test('two-party exchange over the fake relay with real crypto: ad -> take -> offer -> local review -> accept; hash equals the escrow evmTermsHash', async () => {
  const fake = await startFakeRelay();
  const pools = [];
  try {
    const w = await world();
    const mkPool = who => { const p = createRelayPool({ broker: makeBroker().broker, relays: [{ endpointId: 'relay-a', url: fake.wsUrl }], verifier: who.crypto, timing: FAST, nowSeconds: () => NOW }); pools.push(p); return p; };
    const sellerPool = mkPool(w.seller), buyerPool = mkPool(w.buyer);
    /** Subscribe for events addressed to `who`, return everything not yet delivered once the relay says EOSE, then close. */
    const pull = async (pool, who) => {
      const got = []; let eose = false;
      const sub = pool.subscribe([{ kinds: [1059], '#p': [who.pub], since: NOW - 250_000, limit: 50 }], { onEvent: e => got.push(e), onEose: () => { eose = true; } });
      assert.equal(sub.ok, true); await until(() => eose); sub.value.close(); return got;
    };
    // Discovery: the buyer finds the seller's advert through the pool; it goes through the real verifier into a fresh book.
    const adPool = mkPool(w.buyer); const fresh = createOrderBook({ nowSeconds: () => NOW, verifier: w.buyer.crypto });
    assert.equal((await sellerPool.publish(w.ad)).ok, true);
    const found = []; let adEose = false;
    adPool.subscribe([{ kinds: [AD_KIND], '#t': ['p2p-offramp-ad-v1'], since: NOW - 3600, limit: 50 }], { onEvent: e => found.push(e), onEose: () => { adEose = true; } });
    await until(() => adEose); assert.equal(fresh.ingest(found[0]), 'accepted');
    const [listed] = fresh.list(); assert.equal(listed.authority, 'relay-discovery-only');

    const take = ok(await w.buyer.ex.take(listed.key, set.terms.buyer, w.buyer.secret));
    assert.equal((await buyerPool.publish(take.recipientWrap)).ok, true);
    const [takeWrap] = await pull(sellerPool, w.seller);
    assert.equal(ok(await w.seller.ex.receive(takeWrap, w.seller.secret)).state, 'taken');

    const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
    assert.equal((await sellerPool.publish(offer.recipientWrap)).ok, true);
    const [offerWrap] = await pull(buyerPool, w.buyer);
    const received = ok(await w.buyer.ex.receive(offerWrap, w.buyer.secret));
    assert.equal(received.type, 'terms-offer'); assert.equal(received.state, 'offered');
    // Local review ran on the buyer: the registry-reviewed value is what the UI would show.
    assert.equal(received.reviewed.network.id, 'local-evm'); assert.equal(received.reviewed.buyer, set.terms.buyer);
    // The trade identity equals what the escrow computes (G16 EIP-712 digest), not a relay-supplied value.
    assert.equal(received.termsHash, set.expectedEvmTermsHash);
    assert.equal(received.termsHash, evmTermsHash(scenario.domain, set.terms));

    const accept = ok(await w.buyer.ex.accept(take.sessionId, termsBytes(), w.buyer.secret));
    assert.equal(accept.state, 'accepted');
    assert.equal((await buyerPool.publish(accept.recipientWrap)).ok, true);
    const [acceptWrap] = (await pull(sellerPool, w.seller));
    const done = ok(await w.seller.ex.receive(acceptWrap, w.seller.secret));
    assert.deepEqual([done.type, done.state, done.termsHash], ['terms-accept', 'accepted', set.expectedEvmTermsHash]);
    assert.equal(w.seller.ex.session(take.sessionId).terms.hash, w.buyer.ex.session(take.sessionId).terms.hash);

    // Relay saw only the public ad and opaque kind-1059 wraps addressed to one pubkey; no terms, address or payment text.
    const wire = JSON.stringify(fake.events);
    assert.deepEqual([...new Set(fake.events.map(e => e.kind))].sort(), [1059, AD_KIND]);
    for (const secretText of ['SYNTHETIC test payment', set.terms.buyer, set.terms.sellerNonce, 'terms-accept']) assert.equal(wire.includes(secretText), false, secretText);
    // An accept is communication only: the exchange exposes no funding/authority state.
    assert.equal('funded' in done, false);
    // Replaying the same wrap through the relay again is recognised.
    fail(await w.seller.ex.receive(acceptWrap, w.seller.secret), 'DUPLICATE');
  } finally { pools.forEach(p => p.close()); await fake.stop(); }
});

test('negative: an impostor cannot send an offer; the seller key cannot be claimed inside an envelope', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const doc = new TextDecoder().decode(termsBytes());
  fail(await w.buyer.ex.receive(await craft(w.third, w.buyer, w.address, 'terms-offer', { terms: doc }, { termsHash: set.expectedEvmTermsHash }), w.buyer.secret), 'NOT_SELLER');
  // Claiming sender = seller inside the envelope while sealing with the impostor key: the seal author must match.
  fail(await w.buyer.ex.receive(await craft(w.third, w.buyer, w.address, 'terms-offer', { terms: doc }, { termsHash: set.expectedEvmTermsHash, envelope: { sender: w.seller.pub } }), w.buyer.secret), 'MALFORMED');
  // The buyer cannot offer to the seller either.
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, w.address, 'terms-offer', { terms: doc }, { termsHash: set.expectedEvmTermsHash }), w.seller.secret), 'NOT_SELLER');
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'taken');
  fail(await w.buyer.ex.offer(take.sessionId, termsBytes(), w.buyer.secret), 'NOT_SELLER');
});

test('negative: replayed, duplicated and expired messages are refused; bounds are enforced without eviction of live ids', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  fail(await w.seller.ex.receive(take.recipientWrap, w.seller.secret), 'DUPLICATE');
  // Same rumor re-wrapped under a fresh one-time key (a relay or attacker re-delivering) is still the same message.
  const t1 = await craft(w.third, w.seller, w.address, 'take-request', takeBody(w.third), { nonce: 'a1'.repeat(32) });
  const t2 = await craft(w.third, w.seller, w.address, 'take-request', takeBody(w.third), { nonce: 'a1'.repeat(32) });
  assert.notEqual(t1.id, t2.id);
  ok(await w.seller.ex.receive(t1, w.seller.secret));
  fail(await w.seller.ex.receive(t2, w.seller.secret), 'DUPLICATE');
  // Expired: a message delivered after its own expiry.
  const late = await craft(w.third, w.seller, w.address, 'take-request', takeBody(w.third), { expires: NOW + 10 });
  w.clock.now = NOW + 11;
  fail(await w.seller.ex.receive(late, w.seller.secret), 'EXPIRED');
  w.clock.now = NOW;
  // Lifetime above the cap is malformed, so a sender cannot extend the replay window.
  fail(await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'take-request', takeBody(w.third), { expires: NOW + 4000 }), w.seller.secret), 'MALFORMED');
  // Garbage, wrong recipient and tag tampering.
  fail(await w.seller.ex.receive({ not: 'a wrap' }, w.seller.secret), 'WRAP_INVALID');
  fail(await w.seller.ex.receive(take.selfWrap, w.seller.secret), 'WRAP_INVALID');
  assert.equal(ok(await w.buyer.ex.receive(take.selfWrap, w.buyer.secret)).own, true);
  fail(await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'take-request', takeBody(w.third), { tags: [['p', w.seller.pub], ['a', w.address]] }), w.seller.secret), 'MALFORMED');
  fail(await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'take-request', { ...takeBody(w.third), extra: 1 }), w.seller.secret), 'MALFORMED');
  // Bounded sessions: a flood of takers cannot grow state past the cap, and a refused take is not remembered.
  const small = await world({ maxSessions: 2 });
  const takers = [await party(), await party(), await party()];
  const results = [];
  for (const [i, t] of takers.entries()) results.push(await small.seller.ex.receive(await craft(t, small.seller, small.address, 'take-request', takeBody(t), { nonce: String(i).repeat(64) }), small.seller.secret));
  assert.deepEqual(results.map(r => r.ok), [true, true, false]); fail(results[2], 'LIMIT_EXCEEDED');
  assert.equal(small.seller.ex.sessionCount, 2);
});

test('negative: tampered terms bytes never reach accept', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  // Honest seller refuses to offer terms that fail local review (amount above the ad range / broken agreement hash).
  fail(await w.seller.ex.offer(take.sessionId, termsBytes(docFor({ ...set.terms, amountBaseUnits: '3000000000000000000' })), w.seller.secret), 'AD_MISMATCH');
  fail(await w.seller.ex.offer(take.sessionId, termsBytes(docFor(set.terms, { ...set.privateAgreementInput, paymentInstructions: 'other' })), w.seller.secret), 'REVIEW_FAILED', 'AGREEMENT_HASH_MISMATCH');
  fail(await w.seller.ex.offer(take.sessionId, utf8.encode('{"not":"terms"}'), w.seller.secret), 'REVIEW_FAILED');
  // A hostile seller key hand-crafts: terms altered after the hash was computed -> buyer detects HASH_MISMATCH.
  const tampered = new TextDecoder().decode(termsBytes(docFor({ ...set.terms, amountBaseUnits: '1000000000000000001' })));
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, w.address, 'terms-offer', { terms: tampered }, { termsHash: set.expectedEvmTermsHash }), w.buyer.secret), 'HASH_MISMATCH');
  // Terms naming a different buyer address or order do not bind this session.
  const otherBuyer = new TextDecoder().decode(termsBytes(docFor({ ...set.terms, buyer: scenario.sets.erc20.terms.seller })));
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, w.address, 'terms-offer', { terms: otherBuyer }, { termsHash: set.expectedEvmTermsHash, nonce: 'ee'.repeat(32) }), w.buyer.secret), 'REVIEW_FAILED');
  assert.equal(w.buyer.ex.session(take.sessionId).terms, null);
  // Good offer, then the buyer's accept must carry exactly the reviewed bytes.
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  fail(await w.buyer.ex.accept(take.sessionId, termsBytes(docFor({ ...set.terms, amountBaseUnits: '1000000000000000001' })), w.buyer.secret), 'TERMS_MISMATCH');
  fail(await w.buyer.ex.accept(take.sessionId, new Uint8Array([...termsBytes(), 32]), w.buyer.secret), 'TERMS_MISMATCH');
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'offered');
  assert.equal(ok(await w.buyer.ex.accept(take.sessionId, termsBytes(), w.buyer.secret)).state, 'accepted');
});

test('negative: acceptance of a different revision or different terms is refused by the seller', async () => {
  const w = await world();
  const { id } = await toOffered(w);
  const rev2 = { ...set.terms, revision: '2' }; // a different G16 trade: its hash differs
  const rev2Hash = evmTermsHash(scenario.domain, rev2); assert.notEqual(rev2Hash, set.expectedEvmTermsHash);
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, w.address, 'terms-accept', { revision: '2' }, { termsHash: rev2Hash }), w.seller.secret), 'HASH_MISMATCH');
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, w.address, 'terms-accept', { revision: '2' }, { termsHash: set.expectedEvmTermsHash, nonce: '11'.repeat(32) }), w.seller.secret), 'REVISION_MISMATCH');
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, w.address, 'terms-accept', { revision: '1' }, { termsHash: scenario.sets.erc20.expectedEvmTermsHash, nonce: '22'.repeat(32) }), w.seller.secret), 'HASH_MISMATCH');
  assert.equal(w.seller.ex.session(id).state, 'offered');
  const accept = ok(await w.buyer.ex.accept(id, termsBytes(), w.buyer.secret));
  assert.equal(ok(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret)).state, 'accepted');
  // Terminal: nothing more is accepted for this session, and a late cancel cannot undo an accept.
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, w.address, 'cancel', { reason: 'withdrawn' }, { nonce: '33'.repeat(32) }), w.seller.secret), 'OUT_OF_ORDER');
  fail(await w.buyer.ex.cancel(id, 'withdrawn', w.buyer.secret), 'OUT_OF_ORDER');
});

test('negative: an expired ad cannot be taken, offered on or accepted', async () => {
  const w = await world();
  const { id, offer } = await toOffered(w);
  w.clock.now = NOW + 1800; // ad expiry
  fail(await w.buyer.ex.accept(id, termsBytes(), w.buyer.secret), 'AD_EXPIRED');
  fail(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret), 'AD_EXPIRED');
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, w.address, 'terms-accept', { revision: '1' }, { termsHash: set.expectedEvmTermsHash, expires: NOW + 1800 }), w.seller.secret), 'EXPIRED');
  const w2 = await world();
  w2.clock.now = NOW + 1800;
  fail(await w2.buyer.ex.take(w2.key, set.terms.buyer, w2.buyer.secret), 'AD_EXPIRED');
  // A take sealed while the ad was live but delivered after expiry is refused by the seller.
  const w3 = await world();
  const take = ok(await w3.buyer.ex.take(w3.key, set.terms.buyer, w3.buyer.secret));
  w3.clock.now = NOW + 800; // within the message ttl (900 s), still live
  assert.equal(ok(await w3.seller.ex.receive(take.recipientWrap, w3.seller.secret)).state, 'taken');
  w3.clock.now = NOW + 1801;
  fail(await w3.seller.ex.offer(take.sessionId, termsBytes(), w3.seller.secret), 'AD_EXPIRED');
  assert.ok(offer);
  // Terms whose acceptBefore has passed are refused at review time.
  const w4 = await world(); const t = ok(await w4.buyer.ex.take(w4.key, set.terms.buyer, w4.buyer.secret));
  ok(await w4.seller.ex.receive(t.recipientWrap, w4.seller.secret));
  w4.clock.now = NOW + 1700; // ad lives (NOW + 1800) but acceptBefore is 1_700_000_000 > now: still fine
  assert.equal(ok(await w4.seller.ex.offer(t.sessionId, termsBytes(), w4.seller.secret)).state, 'offered');
});

test('negative: a message from a third pubkey, or from the wrong side, changes nothing', async () => {
  const w = await world();
  const { id } = await toOffered(w);
  for (const [type, body, hash] of [['terms-accept', { revision: '1' }, set.expectedEvmTermsHash], ['terms-reject', { reason: 'declined' }, set.expectedEvmTermsHash], ['cancel', { reason: 'withdrawn' }, null]]) {
    fail(await w.seller.ex.receive(await craft(w.third, w.seller, w.address, type, body, { termsHash: hash, nonce: type.length.toString(16).repeat(64).slice(0, 64) }), w.seller.secret), 'UNKNOWN_SESSION');
    fail(await w.buyer.ex.receive(await craft(w.third, w.buyer, w.address, type, body, { termsHash: hash, nonce: type.length.toString(16).repeat(64).slice(0, 64) }), w.buyer.secret), 'NOT_SELLER');
  }
  // The seller cannot accept on the buyer's behalf, and a second taker cannot accept someone else's offer.
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, w.address, 'terms-accept', { revision: '1' }, { termsHash: set.expectedEvmTermsHash, nonce: '44'.repeat(32) }), w.buyer.secret), 'NOT_COUNTERPARTY');
  assert.equal(ok(await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'take-request', takeBody(w.third), { nonce: '55'.repeat(32) }), w.seller.secret)).state, 'taken');
  fail(await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'terms-accept', { revision: '1' }, { termsHash: set.expectedEvmTermsHash, nonce: '66'.repeat(32) }), w.seller.secret), 'OUT_OF_ORDER');
  assert.equal(w.seller.ex.session(id).state, 'offered'); assert.equal(w.buyer.ex.session(id).state, 'offered');
  // Out of order on the right session: duplicate offer and a cancel after reject.
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, w.address, 'terms-offer', { terms: new TextDecoder().decode(termsBytes()) }, { termsHash: set.expectedEvmTermsHash, nonce: '77'.repeat(32) }), w.buyer.secret), 'OUT_OF_ORDER');
  const reject = ok(await w.buyer.ex.reject(id, 'declined', w.buyer.secret));
  assert.equal(ok(await w.seller.ex.receive(reject.recipientWrap, w.seller.secret)).state, 'rejected');
  fail(await w.buyer.ex.accept(id, termsBytes(), w.buyer.secret), 'OUT_OF_ORDER');
});

test('state machine table and the cancel path', async () => {
  assert.equal(transition(null, 'take-request', 'buyer'), 'taken');
  assert.equal(transition(null, 'take-request', 'seller'), null);
  assert.equal(transition(null, 'terms-offer', 'seller'), null);
  assert.equal(transition('taken', 'terms-accept', 'buyer'), null);
  assert.equal(transition('offered', 'terms-offer', 'seller'), null);
  assert.equal(transition('accepted', 'cancel', 'seller'), null);
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  fail(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret), 'OUT_OF_ORDER');
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const cancel = ok(await w.seller.ex.cancel(take.sessionId, 'declined', w.seller.secret));
  assert.equal(ok(await w.buyer.ex.receive(cancel.recipientWrap, w.buyer.secret)).state, 'cancelled');
  fail(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret), 'OUT_OF_ORDER');
  // A cancelled session can be re-taken with a fresh take-request.
  assert.equal(ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret)).state, 'taken');
  w.buyer.ex.close(); fail(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret), 'CLOSED');
});

for (const operation of ['take', 'offer', 'accept', 'reject', 'cancel', 'receive']) {
  test(`close during ${operation} signer lookup refuses the pending result and keeps sessions empty`, async () => {
    let armed = false, entered, release;
    const reached = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    // The real provider is frozen; replace the method on a new wrapper rather than
    // violating Proxy invariants for a non-configurable, non-writable property.
    const delayedProvider = {
      ...provider,
      async publicKey(secret) {
        if (armed) { entered(); await gate; }
        return provider.publicKey(secret);
      },
    };
    const w = await world({ provider: delayedProvider });
    let ex = w.buyer.ex, pending, id;
    if (operation !== 'take') {
      const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
      id = take.sessionId;
      if (operation === 'receive') {
        ex = w.seller.ex;
        armed = true;
        pending = ex.receive(take.recipientWrap, w.seller.secret);
      } else {
        ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
        if (operation === 'offer') ex = w.seller.ex;
        else {
          const offer = ok(await w.seller.ex.offer(id, termsBytes(), w.seller.secret));
          ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
        }
      }
    }
    if (operation !== 'receive') {
      armed = true;
      if (operation === 'take') pending = ex.take(w.key, set.terms.buyer, w.buyer.secret);
      if (operation === 'offer') pending = ex.offer(id, termsBytes(), w.seller.secret);
      if (operation === 'accept') pending = ex.accept(id, termsBytes(), w.buyer.secret);
      if (operation === 'reject') pending = ex.reject(id, 'declined', w.buyer.secret);
      if (operation === 'cancel') pending = ex.cancel(id, 'withdrawn', w.buyer.secret);
    }
    await reached;
    ex.close();
    release();
    fail(await pending, 'CLOSED');
    assert.equal(ex.sessionCount, 0);
    if (id !== undefined) assert.equal(ex.session(id), null);
    w.seller.ex.close(); w.buyer.ex.close();
  });
}
