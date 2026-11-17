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
const sybilTake = async (w, nonceOver) => {
  const sybil = await party();
  const wrap = await craft(sybil, w.seller, w.address, 'take-request', { buyerAddress: `0x${'66'.repeat(20)}`, buyerMessagingKey: sybil.pub }, { nonce: nonceOver ?? freshNonce() });
  return { wrap, result: await w.seller.ex.receive(wrap, w.seller.secret) };
};

// REDTEAM-P2-EX3: idle-taken eviction (least recently admitted) is attacker-driven. With the DEFAULT per-ad cap (16),
// 16 throwaway keys evict an honest buyer's session before a (human) seller has offered; the seller's offer then fails.
test('REDTEAM-P2-EX3 throwaway takes cannot evict an honest buyer session the seller has not answered yet', { todo: 'REDTEAM-P2-EX3' }, async () => {
  const w = await worldAd({});
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  for (let i = 0; i < 16; i++) ok((await sybilTake(w)).result);
  const offer = await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret);
  assert.equal(offer.ok, true, `honest session evicted by sybils: ${JSON.stringify(offer)}`);
});

// REDTEAM-P2-EX2: replay ids of evicted/purged sessions are retained (correctly, for replay safety) but still count
// against the global total, which refuses every session-OPENING message. Fresh keys (one take each) fill it, so the
// seller admits no new buyer for up to 3600 s. Defaults: 1024 takes (e.g. 64 keys x 16). Shown with maxSeenMessages 20.
test('REDTEAM-P2-EX2 retained replay ids of evicted sybil sessions cannot block new honest buyers', { todo: 'REDTEAM-P2-EX2' }, async () => {
  const w = await worldAd({}, { maxSeenMessages: 20 });
  for (let i = 0; i < 20; i++) ok((await sybilTake(w)).result);
  assert.ok(w.seller.ex.sessionCount <= 16, 'per-ad cap evicted sybil sessions');
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  const got = await w.seller.ex.receive(take.recipientWrap, w.seller.secret);
  assert.equal(got.ok, true, `honest take refused: ${JSON.stringify(got)}`);
});

// Lead question: can an evicted session's messages be replayed? Expected NO (ids kept until expiry). Regression check.
test('pass 2 check: an evicted session cannot be resurrected by replaying its take-request', async () => {
  const w = await worldAd({}, { maxSessionsPerAd: 2 });
  const first = await sybilTake(w); ok(first.result);
  ok((await sybilTake(w)).result); ok((await sybilTake(w)).result); // evicts `first`
  assert.equal(w.seller.ex.session(first.result.value.sessionId), null);
  fail(await w.seller.ex.receive(first.wrap, w.seller.secret), 'DUPLICATE');
});
