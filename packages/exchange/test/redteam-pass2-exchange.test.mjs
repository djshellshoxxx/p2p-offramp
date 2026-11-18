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
import { makeBroker, FAST, until, loopbackRelayFixture } from '../../relay/test/support/harness.mjs';
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
// ---------------------------------------------------------------------------------------------------------------
// RED TEAM pass 1 (Team D). Harness above is copied verbatim from exchange.test.mjs. Each finding was a
// { todo: 'REDTEAM-...' } test asserting the SECURE behaviour; EX1-EX3 are fixed (team-c) and now ordinary tests.
// Repro: node --import ./scripts/test-support/register-tsx.mjs --test <this file>
void toOffered; void takeBody; void world; void transition;

/** Same as world(), but the advert fields and exchange options can be chosen. */
async function worldAd(adOver, options = {}) {
  const clock = { now: NOW };
  const seller = await party(), buyer = await party(), third = await party();
  const make = who => {
    const book = createOrderBook({ nowSeconds: () => clock.now, verifier: who.crypto });
    return { book, ex: createTermsExchange({ provider, selfPublicKey: who.pub, ads: book, registry, hashTerms, now: () => clock.now, sha256: nodeSha256, ...options }) };
  };
  const s = make(seller), b = make(buyer);
  const ad = await createAdEvent(seller.crypto, adFor(seller.pub, adOver), NOW);
  assert.equal(s.book.ingest(ad), 'accepted'); assert.equal(b.book.ingest(ad), 'accepted');
  return { clock, seller: { ...seller, ...s }, buyer: { ...buyer, ...b }, third, ad, key: adBookKey(seller.pub, ORDER), address: adAddress(seller.pub, ORDER) };
}
let nonceSeq = 0;
const freshNonce = () => (++nonceSeq).toString(16).padStart(64, '0');

// ---------------------------------------------------------------------------------------------------------------
// RED TEAM pass 2 (Team D) against e8830d6. Harness lines above copied from redteam-exchange.test.mjs.
// Repro: node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap packages/exchange/test/redteam-pass2-exchange.test.mjs
const sybilTake = async (w, over = {}) => {
  const sybil = await party();
  const wrap = await craft(sybil, w.seller, w.address, 'take-request', { buyerAddress: `0x${'66'.repeat(20)}`, buyerMessagingKey: sybil.pub },
    { nonce: freshNonce(), ...over });
  return { sybil, wrap, result: await w.seller.ex.receive(wrap, w.seller.secret) };
};
/** A second advert by the same seller, ingested into both books. */
async function secondAd(w, orderId = 'b2'.repeat(32)) {
  const ad = await createAdEvent(w.seller.crypto, adFor(w.seller.pub, { orderId }), NOW);
  assert.equal(w.seller.book.ingest(ad), 'accepted'); assert.equal(w.buyer.book.ingest(ad), 'accepted');
  return { key: adBookKey(w.seller.pub, orderId), address: adAddress(w.seller.pub, orderId), orderId };
}
/** Delays the seller's first `publicKey` call after arm(), so a local send can be held mid-flight. */
function gatedProvider() {
  let enter, release, armed = false;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  return { entered, arm() { armed = true; }, release() { armed = false; release(); },
    provider: { ...provider, async publicKey(secret) { if (armed) { armed = false; enter(); await held; } return provider.publicKey(secret); } } };
}

// Admission policy (exchange.ts header). A seller-side session the seller has neither selected nor answered is untrusted
// intake (its cancelled tombstone too). It is displaced only once it holds no replay id and no local send is in flight;
// otherwise the newcomer is refused. Seller-side inbound messages must expire within ttl + skew (900 + 120 s at the
// defaults) and no later than the advert. Defaults: 16 sessions and 8 intake per advert; 64 sessions, 48 intake in total.
const HOLD = NOW + 900 + 120; // latest expiry a buyer may give a message received at NOW

// REDTEAM-P2-EX3 (was a todo repro against e8830d6): with the DEFAULT per-ad cap (16), 16 throwaway keys evicted an honest
// buyer's session before a (human) seller had offered; the seller's offer then failed. Now the honest session is kept
// while its take is live, throwaway takes beyond the advert's intake cap are refused, and the offer succeeds.
test('REDTEAM-P2-EX3 throwaway takes cannot evict an honest buyer session the seller has not answered yet', async () => {
  const w = await worldAd({});
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const flood = [];
  for (let i = 0; i < 16; i++) flood.push((await sybilTake(w)).result);
  assert.equal(flood.filter(r => r.ok).length, 7, 'advert intake (8) holds the honest session plus 7 throwaway keys');
  for (const r of flood.slice(7)) fail(r, 'LIMIT_EXCEEDED');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
  const offer = await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret);
  assert.equal(offer.ok, true, `honest session evicted by sybils: ${JSON.stringify(offer)}`);
  assert.equal(ok(await w.buyer.ex.receive(offer.value.recipientWrap, w.buyer.secret)).state, 'offered');
});

test('P2-EX3 seller-side inbound expiry is capped at ttl + skew and at the advert, so a flood cannot hold an advert longer', async () => {
  const w = await worldAd({ expiresAtSeconds: String(NOW + 1800) });
  fail((await sybilTake(w, { expires: NOW + 3600 })).result, 'MALFORMED');
  fail((await sybilTake(w, { expires: HOLD + 1 })).result, 'MALFORMED');
  const longest = await sybilTake(w, { expires: HOLD }); ok(longest.result);
  const short = await worldAd({ expiresAtSeconds: String(NOW + 600) });
  fail((await sybilTake(short, { expires: NOW + 601 })).result, 'MALFORMED'); // within the hold window but after the advert
  const admitted = await sybilTake(short, { expires: NOW + 600 }); ok(admitted.result);
  fail(await short.seller.ex.receive(await craft(admitted.sybil, short.seller, short.address, 'cancel', { reason: 'withdrawn' }, { nonce: freshNonce(), expires: NOW + 601 }), short.seller.secret), 'MALFORMED');
  // Recovery is bounded by the window: a full advert accepts the honest buyer once the flood's ids have expired.
  for (let i = 0; i < 7; i++) ok((await sybilTake(w, { expires: HOLD })).result);
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  fail(await w.seller.ex.receive(take.recipientWrap, w.seller.secret), 'LIMIT_EXCEEDED');
  w.clock.now = HOLD; // honest take built at NOW lives until NOW + 900, so the buyer takes again now
  ok(await w.buyer.ex.cancel(take.sessionId, 'withdrawn', w.buyer.secret));
  const again = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(again.recipientWrap, w.seller.secret));
});

test('P2-EX3 a take followed by a late cancel holds a slot for at most two windows', async () => {
  const w = await worldAd({ expiresAtSeconds: String(NOW + 3600) }, { maxSessionsPerAd: 1 });
  const held = await sybilTake(w, { expires: HOLD }); ok(held.result);
  w.clock.now = HOLD - 1;
  ok(await w.seller.ex.receive(await craft(held.sybil, w.seller, w.address, 'cancel', { reason: 'withdrawn' }, { nonce: freshNonce(), expires: w.clock.now + 1020 }), w.seller.secret));
  w.clock.now = HOLD + 1020 - 2;
  fail((await sybilTake(w, { expires: w.clock.now + 900 })).result, 'LIMIT_EXCEEDED'); // inside the second window
  w.clock.now = HOLD + 1020;
  ok((await sybilTake(w, { expires: w.clock.now + 900 })).result); // both of the key's ids expired: the slot is free
});

test('P2-EX3 a seller with a shortened local TTL still admits default-TTL buyers', async () => {
  const w = await worldAd({}, { messageTtlSeconds: 300 });
  ok((await sybilTake(w, { expires: HOLD })).result);
  fail((await sybilTake(w, { expires: HOLD + 1 })).result, 'MALFORMED');
});

test('P2-EX3 a selected session is never displaced, even after its take-request expired', async () => {
  const w = await worldAd({});
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  assert.equal(ok(w.seller.ex.select(take.sessionId)).selected, true);
  assert.equal(ok(w.seller.ex.select(take.sessionId)).selected, true, 'select is idempotent');
  w.clock.now = NOW + 901; // the honest take (expiry NOW + 900) has expired; the advert lives until NOW + 1800
  const flood = [];
  for (let i = 0; i < 16; i++) flood.push((await sybilTake(w, { expires: NOW + 1500 })).result);
  assert.equal(flood.filter(r => r.ok).length, 8, 'a selected session is not intake'); for (const r of flood.slice(8)) fail(r, 'LIMIT_EXCEEDED');
  assert.equal(w.seller.ex.session(take.sessionId).selected, true);
  ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  // select is seller-only, needs a live `taken` session and changes nothing else.
  fail(w.buyer.ex.select(take.sessionId), 'NOT_SELLER');
  fail(w.seller.ex.select(take.sessionId), 'OUT_OF_ORDER');
  fail(w.seller.ex.select('nope'), 'UNKNOWN_SESSION');
  w.clock.now = NOW + 1800; fail(w.seller.ex.select(flood[0].value.sessionId), 'AD_EXPIRED');
});

test('P2-EX3 documented precondition: an unselected, unanswered session whose take expired may be displaced by new intake', async () => {
  const w = await worldAd({}, { maxSessionsPerAd: 2, maxIntakeSessionsPerAd: 2 });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  ok((await sybilTake(w, { expires: HOLD })).result);
  fail((await sybilTake(w, { expires: HOLD })).result, 'LIMIT_EXCEEDED');
  w.clock.now = NOW + 901;
  ok((await sybilTake(w, { expires: NOW + 1500 })).result); // displaces the oldest idle intake: the honest one
  assert.equal(w.seller.ex.session(take.sessionId), null);
  fail(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret), 'UNKNOWN_SESSION');
  // Its take cannot be replayed to resurrect it: the id expired together with the obligation.
  fail(await w.seller.ex.receive(take.recipientWrap, w.seller.secret), 'EXPIRED');
});

test('P2-EX3 an offer in flight pins its session against displacement', async () => {
  const gate = gatedProvider();
  const w = await worldAd({}, { maxSessionsPerAd: 2, maxIntakeSessionsPerAd: 2, provider: gate.provider });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  w.clock.now = NOW + 901; // unselected and expired: displaceable unless a local send is in flight
  gate.arm();
  const pending = w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret);
  await gate.entered;
  try {
    ok((await sybilTake(w, { expires: NOW + 1500 })).result);
    fail((await sybilTake(w, { expires: NOW + 1500 })).result, 'LIMIT_EXCEEDED');
  } finally { gate.release(); }
  assert.equal(ok(await pending).state, 'offered');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'offered');
});

// REDTEAM-P2-EX2 (was a todo repro against e8830d6): replay ids of evicted or purged sessions were retained (correctly)
// but still counted against the global total that refuses every session-opening message, so fresh keys could block every
// new buyer of every advert for up to 3600 s. Now no session leaves its slot while it holds a live replay id, an
// attacker's sessions hold at most 2 ids each (take, cancel) and at most maxIntakeSessions of them exist, so retained
// ids never outlive their capacity. This test fails on the pre-fix code (honest take on the second advert refused).
test('REDTEAM-P2-EX2 retained replay ids of evicted sybil sessions cannot block new honest buyers', async () => {
  const w = await worldAd({}, { maxSessions: 8, maxSessionsPerAd: 4, maxIntakeSessionsPerAd: 4, maxSeenMessages: 20, maxSeenMessagesPerSession: 4 });
  const other = await secondAd(w);
  const outcomes = [];
  for (let i = 0; i < 10; i++) {
    const sybil = await party();
    const t = await w.seller.ex.receive(await craft(sybil, w.seller, w.address, 'take-request', takeBody(sybil), { nonce: freshNonce() }), w.seller.secret);
    const c = await w.seller.ex.receive(await craft(sybil, w.seller, w.address, 'cancel', { reason: 'withdrawn' }, { nonce: freshNonce() }), w.seller.secret);
    outcomes.push([t.ok, c.ok]);
  }
  assert.deepEqual(outcomes.slice(0, 4), Array(4).fill([true, true]), 'four take/cancel pairs fill the advert with tombstones');
  for (const [t] of outcomes.slice(4)) assert.equal(t, false, 'tombstones that still hold replay ids are not displaced');
  assert.ok(w.seller.ex.sessionCount <= 4); assert.equal(w.seller.ex.replayIdCount, 8);
  // Another advert of the same seller is isolated from the flood.
  const take = ok(await w.buyer.ex.take(other.key, set.terms.buyer, w.buyer.secret));
  const got = await w.seller.ex.receive(take.recipientWrap, w.seller.secret);
  assert.equal(got.ok, true, `honest take refused: ${JSON.stringify(got)}`);
  // The flooded advert recovers once the flood's ids expire (NOW + 600), well inside its lifetime (NOW + 1800).
  w.clock.now = NOW + 601;
  const late = await party();
  ok(await w.seller.ex.receive(await craft(late, w.seller, w.address, 'take-request', takeBody(late), { nonce: freshNonce(), expires: NOW + 1200 }), w.seller.secret));
  assert.ok(w.seller.ex.replayIdCount <= 2);
});

test('P2-EX2 a key cannot refresh its unanswered slot by cancelling and re-taking', async () => {
  const w = await worldAd({}, { maxSessionsPerAd: 1 });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const cancel = ok(await w.buyer.ex.cancel(take.sessionId, 'withdrawn', w.buyer.secret));
  ok(await w.seller.ex.receive(cancel.recipientWrap, w.seller.secret));
  fail((await sybilTake(w)).result, 'LIMIT_EXCEEDED'); // the tombstone keeps the slot while its ids live
  const again = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  fail(await w.seller.ex.receive(again.recipientWrap, w.seller.secret), 'OUT_OF_ORDER');
  fail(await w.seller.ex.receive(take.recipientWrap, w.seller.secret), 'DUPLICATE');
  fail(await w.seller.ex.receive(cancel.recipientWrap, w.seller.secret), 'DUPLICATE');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'cancelled'); assert.equal(w.seller.ex.replayIdCount, 2);
  // Once the tombstone's ids expire the pair may take again (the buyer cancels its local attempt first).
  w.clock.now = NOW + 901;
  ok(await w.buyer.ex.cancel(take.sessionId, 'withdrawn', w.buyer.secret));
  const later = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(later.recipientWrap, w.seller.secret));
  assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
});

test('P2-EX2 an answered session may be re-taken at once after cancel; the seller engaged with it', async () => {
  const w = await worldAd({}, { maxSessionsPerAd: 1 });
  const { id, got } = await toOffered(w); void got;
  const cancel = ok(await w.buyer.ex.cancel(id, 'withdrawn', w.buyer.secret));
  ok(await w.seller.ex.receive(cancel.recipientWrap, w.seller.secret));
  const again = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(again.recipientWrap, w.seller.secret));
});

test('P2-EX2 the original single-advert flood: no ghost ids, and the advert recovers after the flood expires', async () => {
  const w = await worldAd({}, { maxSeenMessages: 20 });
  const flood = [];
  for (let i = 0; i < 20; i++) flood.push((await sybilTake(w)).result);
  assert.equal(flood.filter(r => r.ok).length, 8); for (const r of flood.slice(8)) fail(r, 'LIMIT_EXCEEDED');
  assert.equal(w.seller.ex.sessionCount, 8); assert.equal(w.seller.ex.replayIdCount, 8, 'every retained id belongs to a held session');
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  fail(await w.seller.ex.receive(take.recipientWrap, w.seller.secret), 'LIMIT_EXCEEDED'); // documented: the newcomer waits
  w.clock.now = NOW + 601;
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
});

test('P2-EX2 intake is isolated per advert: floods on five adverts leave a sixth open (defaults)', async () => {
  const w = await worldAd({});
  const flooded = [{ key: w.key, address: w.address, orderId: ORDER }];
  for (let i = 0; i < 4; i++) flooded.push(await secondAd(w, (0xc0 + i).toString(16).repeat(32)));
  const open = await secondAd(w, 'd5'.repeat(32));
  for (const ad of flooded) {
    let admitted = 0;
    for (let i = 0; i < 10; i++) {
      const sybil = await party();
      const r = await w.seller.ex.receive(await craft(sybil, w.seller, ad.address, 'take-request', takeBody(sybil), { nonce: freshNonce(), envelope: { orderId: ad.orderId } }), w.seller.secret);
      if (r.ok) admitted++; else assert.equal(r.code, 'LIMIT_EXCEEDED');
    }
    assert.equal(admitted, 8);
  }
  assert.equal(w.seller.ex.sessionCount, 40);
  const take = ok(await w.buyer.ex.take(open.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
});

test('P2-EX2 tombstones count as intake, so a flood across adverts leaves room for the user\'s own buyer-side takes', async () => {
  // maxSessions 4 -> intake cap 3 (a quarter reserved). The seller is flooded on one advert and is also a buyer elsewhere.
  for (const withCancel of [false, true]) {
    const w = await worldAd({}, { maxSessions: 4 });
    const flood = [];
    for (let i = 0; i < 4; i++) {
      const sybil = await party();
      const t = await w.seller.ex.receive(await craft(sybil, w.seller, w.address, 'take-request', takeBody(sybil), { nonce: freshNonce() }), w.seller.secret);
      if (t.ok && withCancel) ok(await w.seller.ex.receive(await craft(sybil, w.seller, w.address, 'cancel', { reason: 'withdrawn' }, { nonce: freshNonce() }), w.seller.secret));
      flood.push(t);
    }
    assert.equal(flood.filter(r => r.ok).length, 3); fail(flood[3], 'LIMIT_EXCEEDED');
    const maker = await party();
    const foreign = await createAdEvent(maker.crypto, adFor(maker.pub), NOW);
    assert.equal(w.seller.book.ingest(foreign), 'accepted');
    const own = ok(await w.seller.ex.take(adBookKey(maker.pub, ORDER), set.terms.buyer, w.seller.secret));
    assert.equal(w.seller.ex.session(own.sessionId).role, 'buyer');
    assert.equal(w.seller.ex.sessionCount, 4);
    // Buyer-side sessions are never displaced by intake.
    w.clock.now = NOW + 601;
    ok((await sybilTake(w, { expires: NOW + 1200 })).result);
    assert.equal(w.seller.ex.session(own.sessionId).state, 'taken');
  }
});

test('P2-EX2/EX3 bounds hold under a randomized flood with expiry and honest progress', async () => {
  const caps = { maxSessions: 8, maxSessionsPerAd: 4, maxSeenMessages: 32, maxSeenMessagesPerSession: 4 };
  const w = await worldAd({}, caps);
  const other = await secondAd(w);
  let seed = 7; const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret)); ok(w.seller.ex.select(take.sessionId));
  for (let step = 0; step < 60; step++) {
    const sybil = await party(); const address = rand(2) === 0 ? w.address : other.address;
    const env = address === w.address ? {} : { orderId: other.orderId };
    const expires = Math.min(w.clock.now + 30 + rand(990), NOW + 1800);
    const t = await w.seller.ex.receive(await craft(sybil, w.seller, address, 'take-request', takeBody(sybil), { nonce: freshNonce(), expires, envelope: env }), w.seller.secret);
    if (t.ok && rand(2) === 0) ok(await w.seller.ex.receive(await craft(sybil, w.seller, address, 'cancel', { reason: 'withdrawn' }, { nonce: freshNonce(), expires, envelope: env }), w.seller.secret));
    if (!t.ok) assert.equal(t.code, 'LIMIT_EXCEEDED');
    if (rand(4) === 0) w.clock.now += rand(200);
    assert.ok(w.seller.ex.sessionCount <= caps.maxSessions);
    assert.ok(w.seller.ex.replayIdCount <= caps.maxSessions * caps.maxSeenMessagesPerSession);
    assert.equal(w.seller.ex.session(take.sessionId).state, 'taken', 'the selected honest session survives');
    if (w.clock.now >= NOW + 1500) break;
  }
  ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
});

// Lead question: can an evicted session's messages be replayed? Expected NO. Under the admission policy a session is
// displaced only after its take-request expired, so the replay is refused as EXPIRED; while live it is a DUPLICATE.
test('pass 2 check: an evicted session cannot be resurrected by replaying its take-request', async () => {
  const w = await worldAd({}, { maxSessionsPerAd: 2, maxIntakeSessionsPerAd: 2 });
  const first = await sybilTake(w); ok(first.result);
  const second = await sybilTake(w, { expires: HOLD }); ok(second.result);
  fail((await sybilTake(w)).result, 'LIMIT_EXCEEDED'); // both takes still live: nobody is displaced
  w.clock.now = NOW + 601;
  ok((await sybilTake(w, { expires: NOW + 1500 })).result); // displaces `first`, whose take expired at NOW + 600
  assert.equal(w.seller.ex.session(first.result.value.sessionId), null);
  fail(await w.seller.ex.receive(first.wrap, w.seller.secret), 'EXPIRED');
  fail(await w.seller.ex.receive(second.wrap, w.seller.secret), 'DUPLICATE');
});
