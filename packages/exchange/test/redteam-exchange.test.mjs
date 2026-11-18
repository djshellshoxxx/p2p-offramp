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

// REDTEAM-EX1: an offer is bound to its advert only by orderId, buyer address and amount range. The ad's signed
// networkId, assetId and fiat currency are never compared with the reviewed terms, so the amount range is compared
// across assets with different decimals. A bait-and-switch offer passes exchange review on both sides.
test('REDTEAM-EX1 offer for another network/asset/currency than the advert is refused', async () => {
  // Ad: 'test-usd' (ERC-20, 6 dp) on another network, priced in EUR; the range happens to contain 1e18 base units.
  const w = await worldAd({ networkId: 'other-net', assetId: 'test-usd', currency: 'EUR' });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  // Offer (crafted by the real seller key): NATIVE asset on 'local-evm', priced in USD.
  const wrap = await craft(w.seller, w.buyer, w.address, 'terms-offer', { terms: new TextDecoder().decode(termsBytes()) },
    { termsHash: set.expectedEvmTermsHash, nonce: freshNonce() });
  const got = await w.buyer.ex.receive(wrap, w.buyer.secret);
  assert.equal(got.ok, false, `buyer accepted mismatched offer as reviewed: ${JSON.stringify(got.ok && [got.value.state, got.value.reviewed.network.id, got.value.reviewed.asset.id, got.value.reviewed.agreement.fiatCurrency])}`);
  const offer = await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret);
  assert.equal(offer.ok, false, 'seller-side review accepted an offer that contradicts its own advert');
});

// REDTEAM-EX2: one peer key fills the GLOBAL replay memory (`seen`) with take/cancel pairs. Entries are evicted only
// at their sender-chosen expiry (<= now + 3600 s); at capacity every exchange operation, including offers in honest
// sessions that already exist, fails LIMIT_EXCEEDED. Default capacity 1024 = 512 take/cancel pairs from ONE key.
// Shown with maxSeenMessages 16 for runtime; the code path is identical at the default.
test('REDTEAM-EX2 one peer cannot freeze the exchange by filling the replay memory', async () => {
  // Since REDTEAM-P2-EX2 the attacker is capped earlier: seller-side messages must expire within ttl + skew, and a key
  // cannot re-take over its own unanswered tombstone while that tombstone still holds replay ids.
  const w = await worldAd({}, { maxSeenMessages: 16 });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const body = { buyerAddress: `0x${'77'.repeat(20)}`, buyerMessagingKey: w.third.pub };
  fail(await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'take-request', body, { nonce: freshNonce(), expires: NOW + 3600 }), w.seller.secret), 'MALFORMED');
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const t = await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'take-request', body, { nonce: freshNonce(), expires: NOW + 900 }), w.seller.secret);
    const c = await w.seller.ex.receive(await craft(w.third, w.seller, w.address, 'cancel', { reason: 'withdrawn' }, { nonce: freshNonce(), expires: NOW + 900 }), w.seller.secret);
    codes.push(t.ok ? 'ok' : t.code, c.ok ? 'ok' : c.code);
  }
  assert.deepEqual(codes.slice(0, 2), ['ok', 'ok']);
  assert.ok(codes.slice(2).every(code => code === 'OUT_OF_ORDER'), JSON.stringify(codes));
  assert.equal(w.seller.ex.replayIdCount, 3);
  w.clock.now = NOW + 300; // inside the ad lifetime and the attacker's window
  const offer = await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret);
  assert.equal(offer.ok, true, `honest offer refused: ${JSON.stringify(offer)}`);
});

// REDTEAM-EX3: session slots were global (default 64), with no per-peer bound and no eviction of idle 'taken'
// sessions before ad expiry. Throwaway keys (free) locked out every new buyer of the seller for the ad lifetime.
// Policy since REDTEAM-P2-EX3 (exchange.ts header): a flood holds the advert only until its own take-requests expire
// (at most 3600 s; here 600 s), then the honest newcomer displaces the oldest idle intake, well inside the ad lifetime.
// While the flood's takes are live the newcomer is refused rather than an admitted buyer being pushed out.
test('REDTEAM-EX3 throwaway keys cannot exhaust seller session capacity for honest buyers beyond their take lifetime', async () => {
  const w = await worldAd({}, { maxSessions: 4 });
  const flood = [];
  for (let i = 0; i < 4; i++) {
    const sybil = await party();
    flood.push(await w.seller.ex.receive(await craft(sybil, w.seller, w.address, 'take-request', { buyerAddress: `0x${'66'.repeat(20)}`, buyerMessagingKey: sybil.pub }, { nonce: freshNonce() }), w.seller.secret));
  }
  assert.equal(flood.filter(r => r.ok).length, 3, 'intake is capped below maxSessions'); fail(flood[3], 'LIMIT_EXCEEDED');
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  fail(await w.seller.ex.receive(take.recipientWrap, w.seller.secret), 'LIMIT_EXCEEDED');
  w.clock.now = NOW + 601; // flood takes expired at NOW + 600; the honest take lives until NOW + 900, the ad until NOW + 1800
  const got = await w.seller.ex.receive(take.recipientWrap, w.seller.secret);
  assert.equal(got.ok, true, `honest take refused: ${JSON.stringify(got)}`);
});

// ---- team-c fix coverage for EX1-EX3 ----
test('EX1 each advert binding (network, asset, currency) is enforced on both sides; registry id or CAIP-2 network both bind', async () => {
  for (const over of [{ networkId: 'eip155:1' }, { assetId: 'test-usd' }, { currency: 'EUR' }]) {
    const w = await worldAd(over);
    const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
    ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
    fail(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret), 'AD_MISMATCH');
    const wrap = await craft(w.seller, w.buyer, w.address, 'terms-offer', { terms: new TextDecoder().decode(termsBytes()) }, { termsHash: set.expectedEvmTermsHash, nonce: freshNonce() });
    fail(await w.buyer.ex.receive(wrap, w.buyer.secret), 'AD_MISMATCH');
    assert.equal(w.buyer.ex.session(take.sessionId).state, 'taken');
  }
  for (const networkId of ['local-evm', 'eip155:31337']) {
    const w = await worldAd({ networkId });
    const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
    ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
    const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
    assert.equal(ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret)).state, 'offered');
  }
});

test('EX2 replay memory is bounded per session: one key is capped, honest new buyers and live sessions proceed, replays stay exact', async () => {
  const w = await worldAd({}, { maxSeenMessages: 16, maxSeenMessagesPerSession: 4 });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const body = { buyerAddress: `0x${'77'.repeat(20)}`, buyerMessagingKey: w.third.pub };
  const attack = [];
  for (let i = 0; i < 8; i++) {
    for (const [type, msg] of [['take-request', body], ['cancel', { reason: 'withdrawn' }]]) {
      const wrap = await craft(w.third, w.seller, w.address, type, msg, { nonce: freshNonce(), expires: NOW + 1020 });
      attack.push([wrap, await w.seller.ex.receive(wrap, w.seller.secret)]);
    }
  }
  assert.equal(attack.filter(([, r]) => r.ok).length, 2, 'attacker holds one take and one cancel');
  for (const [, r] of attack.slice(2)) fail(r, 'OUT_OF_ORDER');
  fail(await w.seller.ex.receive(attack[0][0], w.seller.secret), 'DUPLICATE');
  // A different honest buyer can still open a session, and the existing session can still offer.
  const other = await party();
  ok(await w.seller.ex.receive(await craft(other, w.seller, w.address, 'take-request', { buyerAddress: set.terms.buyer, buyerMessagingKey: other.pub }, { nonce: freshNonce() }), w.seller.secret));
  ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  // Replay memory survives the session: the attacker's cancelled session cannot be revived by replaying its take.
  w.clock.now = NOW + 1000;
  fail(await w.seller.ex.receive(attack[0][0], w.seller.secret), 'DUPLICATE');
  w.clock.now = NOW + 1020;
  fail(await w.seller.ex.receive(attack[0][0], w.seller.secret), 'EXPIRED');
  assert.throws(() => createTermsExchange({ provider, selfPublicKey: w.seller.pub, ads: w.seller.book, registry, hashTerms, now: () => NOW, maxSeenMessagesPerSession: 0 }), RangeError);
  assert.throws(() => createTermsExchange({ provider, selfPublicKey: w.seller.pub, ads: w.seller.book, registry, hashTerms, now: () => NOW, maxIntakeSessionsPerAd: 0 }), RangeError);
});

test('EX3 per-advert session cap displaces only expired idle intake of that advert; offered sessions are never evicted', async () => {
  const w = await worldAd({}, { maxSessionsPerAd: 2 });
  const { id } = await toOffered(w);
  const sybils = [];
  const sybilTake = async expires => {
    const sybil = await party();
    return w.seller.ex.receive(await craft(sybil, w.seller, w.address, 'take-request', { buyerAddress: set.terms.buyer, buyerMessagingKey: sybil.pub }, { nonce: freshNonce(), expires }), w.seller.secret);
  };
  sybils.push(ok(await sybilTake(NOW + 600)));
  fail(await sybilTake(NOW + 600), 'LIMIT_EXCEEDED'); // the first sybil's take is live: it is not displaced
  w.clock.now = NOW + 601;
  sybils.push(ok(await sybilTake(NOW + 1500)));
  assert.equal(w.seller.ex.sessionCount, 2);
  assert.equal(w.seller.ex.session(id).state, 'offered');
  assert.equal(w.seller.ex.session(sybils[0].sessionId), null);
  assert.equal(w.seller.ex.session(sybils[1].sessionId).state, 'taken');
  ok(await w.seller.ex.offer(sybils[1].sessionId, termsBytes(), w.seller.secret));
  const late = await party();
  fail(await w.seller.ex.receive(await craft(late, w.seller, w.address, 'take-request', { buyerAddress: set.terms.buyer, buyerMessagingKey: late.pub }, { nonce: freshNonce(), expires: NOW + 1500 }), w.seller.secret), 'LIMIT_EXCEEDED');
  assert.equal(w.seller.ex.session(id).state, 'offered');
});
