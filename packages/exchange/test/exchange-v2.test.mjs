// Protocol v2 (D1 Option B) exchange: opt-in wallet proofs on offer/accept, seller-first, durable tombstones and replay.
// Real NIP-17 crypto, real EIP-712 EOA signatures (published SYNTHETIC scenario keys) and the real encrypted replay ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { RegistryService } from '../../domain/src/registry.ts';
import { TERMS_REVIEW_FORMAT, reviewTermsBytes } from '../../domain/index.ts';
import { evmTermsHash } from '../../wallet/src/evm-terms.ts';
import { createEvmPeerAcceptancePort, parseCandidatePeerEnvelope } from '../../wallet/src/evm-peer-envelope.ts';
import { CandidatePeerReplayLedger } from '../../wallet/src/evm-peer-replay.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { createUnsignedEvent, createSeal, createGiftWrap, unwrapGiftWrap, createLocalNobleNostrProvider } from '../../nostr-crypto/index.ts';
import { createAdEvent, createOrderBook } from '../../relay/index.ts';
import {
  createRelayEventCrypto, createTermsExchange, adAddress, adBookKey, encodeEnvelope, envelopeTags, parseEnvelope,
  parseEnvelopeV2, parseVersionedEnvelope, MAX_ENVELOPE_V2_BYTES,
} from '../index.ts';

const dir = new URL('../../domain/test/fixtures/local-evm-scenario/', import.meta.url);
const registryBytes = new Uint8Array(await readFile(new URL('registry.json', dir)));
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const registry = new RegistryService(); assert.equal((await registry.load(registryBytes, scenario.registrySha256)).ok, true);
const provider = createLocalNobleNostrProvider();
const NOW = 1_699_990_000; // acceptBefore is 1_700_000_000
const set = scenario.sets.native;
const ORDER = set.terms.orderId;
const ZERO = `0x${'0'.repeat(40)}`;
const utf8 = new TextEncoder();
const termsBytes = () => utf8.encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms: set.terms, privateAgreement: set.privateAgreementInput }));
const hashTerms = r => evmTermsHash({ chainId: r.network.chainId, verifyingContract: r.deployment.address }, {
  orderId: r.orderId, revision: r.revision, networkId: r.network.id, deploymentId: r.deployment.id, seller: r.seller, buyer: r.buyer,
  assetKind: r.asset.kind, asset: r.asset.address ?? ZERO, amountBaseUnits: r.amountBaseUnits, privateAgreementHash: r.privateAgreementSha256,
  capabilitiesHash: r.capabilitiesSha256, sellerNonce: r.sellerNonce, acceptBeforeSeconds: r.acceptBeforeSeconds, escrowExpirySeconds: r.escrowExpirySeconds });
const nodeSha256 = async bytes => { const d = createHash('sha256').update(bytes).digest(); return d.buffer.slice(d.byteOffset, d.byteOffset + 32); };
const reviewed = (await reviewTermsBytes(registry, termsBytes(), nodeSha256)).value;
const TERMS_HASH = set.expectedEvmTermsHash;
assert.equal(hashTerms(reviewed), TERMS_HASH);

const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fail = (result, code) => { assert.equal(result.ok, false, `expected ${code}, got ${JSON.stringify(result)}`); assert.equal(result.code, code); };
const signDigest = (keyHex, digest) => {
  const sig = secp256k1.sign(Buffer.from(digest, 'hex'), Buffer.from(keyHex, 'hex'), { prehash: false, format: 'recovered', lowS: true });
  return Uint8Array.from([...sig.subarray(1), sig[0] + 27]);
};
/** SYNTHETIC local wallet: signs only for its own scenario account. */
const signerFor = role => ({ calls: 0, async sign(request) {
  this.calls++;
  assert.equal(request.account, scenario.testOnlyKeys[role].address);
  return signDigest(scenario.testOnlyKeys[role].privateKeyHex, request.digest);
} });

const PASS = 'synthetic exchange v2 replay passphrase';
class Store {
  rows = new Map();
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row)); }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next));
  }
}
const disposers = [];
test.after(() => { for (const dispose of disposers.reverse()) dispose(); });
/** One party's durable replay ledger in its own encrypted vault; `reopen` locks and unlocks it (fresh ledger, same history). */
async function durable() {
  const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
  const session = ok(await vault.create(PASS));
  const holder = { vault, profileId: session.profileId, ledger: new CandidatePeerReplayLedger(vault, session) };
  holder.reopen = async () => {
    holder.ledger.dispose(); vault.lockAll();
    holder.ledger = new CandidatePeerReplayLedger(vault, ok(await vault.unlock(holder.profileId, PASS)));
  };
  disposers.push(() => { holder.ledger.dispose(); vault.dispose(); });
  return holder;
}
const portFor = (role, holder, signer = signerFor(role)) =>
  createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: holder.ledger, signer });
const noLedger = { admitEoa() { throw new Error('unused'); }, tombstone() { throw new Error('unused'); } };
/** A signing-only port used to craft adversarial carriers. */
const craftPort = role => createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: noLedger, signer: signerFor(role) });

async function party() { const k = await provider.generate(); return { secret: k.secretKey, pub: k.publicKey, crypto: await createRelayEventCrypto(provider, k.secretKey) }; }
const adFor = (maker, at = NOW) => ({ app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:31337', assetId: 'native', amountMin: '1000000000000000000',
  amountMax: '2000000000000000000', currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(at + 1800), maker });

async function world({ sellerOptions = {}, buyerOptions = {}, at = NOW } = {}) {
  const clock = { now: at };
  const seller = await party(), buyer = await party(), third = await party();
  const ad = await createAdEvent(seller.crypto, adFor(seller.pub, at), at);
  const make = (who, options) => {
    const book = createOrderBook({ nowSeconds: () => clock.now, verifier: who.crypto });
    assert.equal(book.ingest(ad), 'accepted');
    return createTermsExchange({ provider, selfPublicKey: who.pub, ads: book, registry, hashTerms, now: () => clock.now, sha256: nodeSha256, ...options });
  };
  const sellerLedger = await durable(), buyerLedger = await durable();
  const w = { clock, ad, make, sellerLedger, buyerLedger, third, key: adBookKey(seller.pub, ORDER), address: adAddress(seller.pub, ORDER) };
  w.v2 = (who, holder, role, extra = {}) => make(who, { protocolVersion: 2, peerAcceptance: portFor(role, holder), ...extra });
  w.seller = { ...seller, ex: w.v2(seller, sellerLedger, 'seller', sellerOptions) };
  w.buyer = { ...buyer, ex: w.v2(buyer, buyerLedger, 'buyer', buyerOptions) };
  return w;
}
async function toOffered(w) {
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  const got = ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  return { id: take.sessionId, take, offer, got };
}
const contentOf = async (wrap, who) => (await unwrapGiftWrap(wrap, who.secret, provider, { now: NOW })).rumor.content;
/** Hand-build any v1 or v2 message from any key. */
async function craft(from, to, envelope, over = {}) {
  const full = { ad: adAddress(over.adAuthor ?? (envelope.type === 'terms-offer' ? from.pub : to.pub), ORDER), orderId: ORDER, sender: from.pub, recipient: to.pub,
    nonce: over.nonce ?? 'cd'.repeat(32), expiresAtSeconds: String(over.expires ?? NOW + 600), termsHash: TERMS_HASH, ...envelope };
  const content = over.content ?? encodeEnvelope(full);
  const rumor = createUnsignedEvent(from.pub, { kind: 14, created_at: NOW, tags: envelopeTags(full), content });
  return createGiftWrap(await createSeal(rumor, from.secret, to.pub, provider, NOW), to.pub, provider, NOW);
}
const offerText = () => new TextDecoder().decode(termsBytes());
async function acceptance(role, sender, recipient, over = {}) {
  const wire = await craftPort(role).encode({ role, reviewed, termsHash: TERMS_HASH, sender, recipient, notAfterSeconds: over.notAfterSeconds ?? reviewed.acceptBeforeSeconds });
  assert.ok(wire); return structuredClone(wire);
}

test('options: protocol v2 requires a complete PeerAcceptancePort; default and v1 keep the v1 exchange with no acceptances', async () => {
  const w = await world();
  const base = { provider, selfPublicKey: w.seller.pub, ads: createOrderBook({ nowSeconds: () => NOW, verifier: w.seller.crypto }), registry, hashTerms, now: () => NOW };
  assert.throws(() => createTermsExchange({ ...base, protocolVersion: 2 }), /INVALID_OPTIONS/);
  assert.throws(() => createTermsExchange({ ...base, protocolVersion: 2, peerAcceptance: { encode() {}, verify() {}, admit() {} } }), /INVALID_OPTIONS/);
  assert.throws(() => createTermsExchange({ ...base, protocolVersion: 3, peerAcceptance: portFor('seller', w.sellerLedger) }), /INVALID_OPTIONS/);
  assert.throws(() => createTermsExchange({ ...base, protocolVersion: 1, peerAcceptance: portFor('seller', w.sellerLedger) }), /INVALID_OPTIONS/);
  for (const options of [{}, { protocolVersion: 1 }]) {
    const ex = createTermsExchange({ ...base, ...options });
    assert.equal(ex.acceptances('anything'), null);
    ex.close();
  }
  assert.equal(w.seller.ex.acceptances('unknown'), null);
});

test('v2 two-party: seller proof on the offer, buyer proof on the accept; both bindings verified, admitted and readable on both sides', async () => {
  const w = await world();
  const { id, offer, got } = await toOffered(w);
  assert.equal(got.state, 'offered'); assert.equal(got.termsHash, TERMS_HASH);
  // The wire is the reviewed candidate v2 carrier: the wallet parser accepts it, the v1 parser refuses it.
  const offerContent = await contentOf(offer.recipientWrap, w.buyer);
  const parsed = parseCandidatePeerEnvelope(offerContent);
  assert.equal(parsed.v, 2); assert.equal(parsed.type, 'terms-offer'); assert.equal(parsed.body.acceptance.binding.role, 'seller');
  assert.equal(parsed.body.acceptance.binding.ownMessagingKey, w.seller.pub); assert.equal(parsed.body.acceptance.binding.counterpartyMessagingKey, w.buyer.pub);
  assert.equal(parsed.body.acceptance.binding.notAfterSeconds, reviewed.acceptBeforeSeconds);
  assert.equal(parseEnvelope(offerContent), null);
  assert.equal(parseVersionedEnvelope(offerContent).v, 2);
  const buyerView = w.buyer.ex.acceptances(id);
  assert.equal(buyerView.bothVerified, false); assert.equal(buyerView.buyer, null);
  assert.deepEqual([buyerView.seller.role, buyerView.seller.account, buyerView.seller.termsHash], ['seller', set.terms.seller, TERMS_HASH]);
  assert.equal(buyerView.seller.effectiveNotAfterSeconds, String(NOW + 900), 'effective deadline is the earliest: the envelope expiry');
  assert.equal(w.seller.ex.acceptances(id).seller.bindingHash, buyerView.seller.bindingHash, 'seller recorded its own verified binding');

  const accept = ok(await w.buyer.ex.accept(id, termsBytes(), w.buyer.secret));
  assert.equal(accept.state, 'accepted');
  const acceptContent = await contentOf(accept.recipientWrap, w.seller);
  assert.equal(parseCandidatePeerEnvelope(acceptContent).body.acceptance.binding.role, 'buyer');
  const done = ok(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret));
  assert.deepEqual([done.type, done.state, done.termsHash], ['terms-accept', 'accepted', TERMS_HASH]);
  for (const ex of [w.seller.ex, w.buyer.ex]) {
    const view = ex.acceptances(id);
    assert.equal(view.bothVerified, true); assert.equal(view.state, 'accepted'); assert.equal(view.termsHash, TERMS_HASH);
    assert.equal(view.seller.account, set.terms.seller); assert.equal(view.buyer.account, set.terms.buyer);
    assert.equal(view.buyer.ownMessagingKey, w.buyer.pub); assert.equal(view.buyer.counterpartyMessagingKey, w.seller.pub);
    assert.ok(Object.isFrozen(view) && Object.isFrozen(view.seller) && Object.isFrozen(view.buyer));
    assert.doesNotMatch(JSON.stringify(view), /Signature|0x[0-9a-f]{130}/, 'no signature bytes are exposed');
    assert.equal('funded' in view || 'economicPreparationAllowed' in view, false);
  }
  // v1 take/reject/cancel envelopes are unchanged in a v2 session: the take was a plain v1 envelope.
  fail(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret), 'DUPLICATE');
});

test('no downgrade: a v2 session refuses v1 offers and v1 accepts; a v1 session refuses v2 offers and accepts', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  // v1-style offer (no binding) to a v2 buyer.
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, { v: 1, type: 'terms-offer', body: { terms: offerText() } }), w.buyer.secret), 'VERSION_MISMATCH');
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'taken');
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  // A v1-style accept (bare revision) never yields accepted in a v2 session.
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, { v: 1, type: 'terms-accept', body: { revision: '1' } }), w.seller.secret), 'VERSION_MISMATCH');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'offered'); assert.equal(w.seller.ex.acceptances(take.sessionId).buyer, null);

  // A v1 exchange refuses v2 carriers as malformed.
  const v1Seller = await party(), v1Buyer = await party();
  const ad = await createAdEvent(v1Seller.crypto, adFor(v1Seller.pub), NOW);
  const book = who => { const b = createOrderBook({ nowSeconds: () => NOW, verifier: who.crypto }); assert.equal(b.ingest(ad), 'accepted'); return b; };
  const s1 = createTermsExchange({ provider, selfPublicKey: v1Seller.pub, ads: book(v1Seller), registry, hashTerms, now: () => NOW, sha256: nodeSha256 });
  const b1 = createTermsExchange({ provider, selfPublicKey: v1Buyer.pub, ads: book(v1Buyer), registry, hashTerms, now: () => NOW, sha256: nodeSha256 });
  const t1 = ok(await b1.take(adBookKey(v1Seller.pub, ORDER), set.terms.buyer, v1Buyer.secret));
  ok(await s1.receive(t1.recipientWrap, v1Seller.secret));
  const v2Offer = await craft(v1Seller, v1Buyer, { v: 2, type: 'terms-offer', body: { terms: offerText(), acceptance: await acceptance('seller', v1Seller.pub, v1Buyer.pub) } });
  fail(await b1.receive(v2Offer, v1Buyer.secret), 'MALFORMED');
  ok(await b1.receive(ok(await s1.offer(t1.sessionId, termsBytes(), v1Seller.secret)).recipientWrap, v1Buyer.secret));
  const v2Accept = await craft(v1Buyer, v1Seller, { v: 2, type: 'terms-accept', body: { revision: '1', acceptance: await acceptance('buyer', v1Buyer.pub, v1Seller.pub) } });
  fail(await s1.receive(v2Accept, v1Seller.secret), 'MALFORMED');
  assert.equal(s1.session(t1.sessionId).state, 'offered');
  s1.close(); b1.close();
});

test('seller-first: a buyer accept is refused without a recorded verified seller binding, when sending and when receiving', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  fail(await w.buyer.ex.accept(take.sessionId, termsBytes(), w.buyer.secret), 'SELLER_FIRST');
  // A validly signed buyer carrier that arrives before any seller binding is recorded.
  const early = await craft(w.buyer, w.seller, { v: 2, type: 'terms-accept', body: { revision: '1', acceptance: await acceptance('buyer', w.buyer.pub, w.seller.pub) } });
  fail(await w.seller.ex.receive(early, w.seller.secret), 'SELLER_FIRST');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
  assert.deepEqual([w.seller.ex.acceptances(take.sessionId).seller, w.seller.ex.acceptances(take.sessionId).buyer], [null, null]);
});

test('signature swap, wrong or swapped messaging keys, wrong role and a binding re-carried by another key are refused', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offerWith = async (mutate, from = w.seller) => {
    const proof = await acceptance('seller', w.seller.pub, w.buyer.pub); mutate(proof);
    return craft(from, w.buyer, { v: 2, type: 'terms-offer', body: { terms: offerText(), acceptance: proof } }, { adAuthor: w.seller.pub, nonce: 'ef'.repeat(32) });
  };
  const refusedOffers = [
    [p => { [p.termsSignature, p.bindingSignature] = [p.bindingSignature, p.termsSignature]; }, 'ACCEPTANCE_INVALID'],
    [p => { [p.binding.ownMessagingKey, p.binding.counterpartyMessagingKey] = [p.binding.counterpartyMessagingKey, p.binding.ownMessagingKey]; }, 'ACCEPTANCE_INVALID'],
    [p => { p.binding.counterpartyMessagingKey = w.third.pub; }, 'ACCEPTANCE_INVALID'],
    [p => { p.binding.role = 'buyer'; }, 'ACCEPTANCE_INVALID'],
    [p => { p.binding.account = set.terms.buyer; }, 'ACCEPTANCE_INVALID'],
  ];
  for (const [mutate, code] of refusedOffers) fail(await w.buyer.ex.receive(await offerWith(mutate), w.buyer.secret), code);
  // A valid seller binding signed for the seller's own key cannot be re-carried by a third key (the v2 parser binds the
  // advert author to the offer sender, so this is refused before routing).
  fail(await w.buyer.ex.receive(await offerWith(() => {}, w.third), w.buyer.secret), 'MALFORMED');
  // A valid seller binding over a different messaging key (signed by the seller wallet) cannot ride the seller's channel.
  const foreign = await acceptance('seller', w.third.pub, w.buyer.pub);
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, { v: 2, type: 'terms-offer', body: { terms: offerText(), acceptance: foreign } }, { nonce: '12'.repeat(32) }), w.buyer.secret), 'ACCEPTANCE_INVALID');
  // The buyer's own wallet cannot sign the seller role.
  const buyerAsSeller = await craftPort('buyer').encode({ role: 'seller', reviewed, termsHash: TERMS_HASH, sender: w.seller.pub, recipient: w.buyer.pub, notAfterSeconds: reviewed.acceptBeforeSeconds }).catch(() => null);
  assert.equal(buyerAsSeller, null);
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'taken');
  assert.equal(w.buyer.ex.acceptances(take.sessionId).seller, null);

  // Accept side: wrong role, swapped keys and swapped signatures are refused by the seller.
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  const acceptWith = async (mutate, role = 'buyer', nonce = '34'.repeat(32)) => {
    const proof = role === 'buyer' ? await acceptance('buyer', w.buyer.pub, w.seller.pub) : await acceptance('seller', w.buyer.pub, w.seller.pub);
    mutate(proof);
    return craft(w.buyer, w.seller, { v: 2, type: 'terms-accept', body: { revision: '1', acceptance: proof } }, { nonce });
  };
  fail(await w.seller.ex.receive(await acceptWith(() => {}, 'seller'), w.seller.secret), 'ACCEPTANCE_INVALID');
  fail(await w.seller.ex.receive(await acceptWith(p => { [p.termsSignature, p.bindingSignature] = [p.bindingSignature, p.termsSignature]; }, 'buyer', '56'.repeat(32)), w.seller.secret), 'ACCEPTANCE_INVALID');
  fail(await w.seller.ex.receive(await acceptWith(p => { p.binding.ownMessagingKey = w.seller.pub; p.binding.counterpartyMessagingKey = w.buyer.pub; }, 'buyer', '78'.repeat(32)), w.seller.secret), 'ACCEPTANCE_INVALID');
  // The seller's own binding replayed back as an accept.
  const sellerProof = JSON.parse(await contentOf(offer.recipientWrap, w.buyer)).body.acceptance;
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, { v: 2, type: 'terms-accept', body: { revision: '1', acceptance: sellerProof } }, { nonce: '9a'.repeat(32) }), w.seller.secret), 'ACCEPTANCE_INVALID');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'offered'); assert.equal(w.seller.ex.acceptances(take.sessionId).buyer, null);
});

test('expiry: the effective deadline is min(acceptBefore, binding notAfter, envelope expiry); late carriers and late accepts are refused', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const short = await acceptance('seller', w.seller.pub, w.buyer.pub, { notAfterSeconds: String(NOW + 10) });
  const wrap = await craft(w.seller, w.buyer, { v: 2, type: 'terms-offer', body: { terms: offerText(), acceptance: short } });
  w.clock.now = NOW + 10;
  fail(await w.buyer.ex.receive(wrap, w.buyer.secret), 'ACCEPTANCE_INVALID');
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'taken');
  w.clock.now = NOW + 5;
  assert.equal(ok(await w.buyer.ex.receive(wrap, w.buyer.secret)).state, 'offered');
  assert.equal(w.buyer.ex.acceptances(take.sessionId).seller.effectiveNotAfterSeconds, String(NOW + 10));
  // The buyer cannot accept once the seller's signed binding has lapsed.
  w.clock.now = NOW + 10;
  fail(await w.buyer.ex.accept(take.sessionId, termsBytes(), w.buyer.secret), 'EXPIRED');
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'offered');
});

test('expired envelope and expired buyer binding are refused by the seller', async () => {
  const w = await world();
  const { id } = await toOffered(w);
  const late = await craft(w.buyer, w.seller, { v: 2, type: 'terms-accept', body: { revision: '1', acceptance: await acceptance('buyer', w.buyer.pub, w.seller.pub, { notAfterSeconds: String(NOW + 20) }) } });
  w.clock.now = NOW + 20;
  fail(await w.seller.ex.receive(late, w.seller.secret), 'ACCEPTANCE_INVALID');
  w.clock.now = NOW + 601;
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, { v: 2, type: 'terms-accept', body: { revision: '1', acceptance: await acceptance('buyer', w.buyer.pub, w.seller.pub) } }, { nonce: '01'.repeat(32) }), w.seller.secret), 'EXPIRED');
  assert.equal(w.seller.ex.session(id).state, 'offered');
});

test('reject durably tombstones the termsHash: re-offer and re-receipt are refused in a new session and after the ledger is reopened', async () => {
  const w = await world();
  const { id } = await toOffered(w);
  const rejected = ok(await w.buyer.ex.reject(id, 'declined', w.buyer.secret));
  assert.equal(ok(await w.seller.ex.receive(rejected.recipientWrap, w.seller.secret)).state, 'rejected');
  // New session (same pair re-takes after a reject): the seller's own ledger refuses the tombstoned terms.
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  fail(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret), 'REPLAY_REFUSED');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
  // A seller instance with a fresh ledger can still sign, but the buyer's ledger refuses the tombstoned terms.
  const fresh = await durable(), freshSeller = w.v2(w.seller, fresh, 'seller');
  ok(await freshSeller.receive(take.recipientWrap, w.seller.secret));
  const reoffer = ok(await freshSeller.offer(take.sessionId, termsBytes(), w.seller.secret));
  fail(await w.buyer.ex.receive(reoffer.recipientWrap, w.buyer.secret), 'REPLAY_REFUSED');
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'taken');
  // Ledger reopen (lock + unlock, new ledger, new port, new exchange) keeps the tombstone on both sides.
  await w.buyerLedger.reopen(); await w.sellerLedger.reopen();
  const buyer2 = w.v2(w.buyer, w.buyerLedger, 'buyer'), seller2 = w.v2(w.seller, w.sellerLedger, 'seller');
  const take2 = ok(await buyer2.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller2.receive(take2.recipientWrap, w.seller.secret));
  fail(await seller2.offer(take2.sessionId, termsBytes(), w.seller.secret), 'REPLAY_REFUSED');
  const fresh2 = w.v2(w.seller, await durable(), 'seller');
  ok(await fresh2.receive(take2.recipientWrap, w.seller.secret));
  fail(await buyer2.receive(ok(await fresh2.offer(take2.sessionId, termsBytes(), w.seller.secret)).recipientWrap, w.buyer.secret), 'REPLAY_REFUSED');
  // And an accept for the tombstoned terms is impossible: the buyer never reached offered.
  fail(await buyer2.accept(take2.sessionId, termsBytes(), w.buyer.secret), 'SELLER_FIRST');
});

test('cancel after an offer durably tombstones the termsHash on both sides', async () => {
  const w = await world();
  const { id } = await toOffered(w);
  const cancelled = ok(await w.seller.ex.cancel(id, 'withdrawn', w.seller.secret));
  assert.equal(ok(await w.buyer.ex.receive(cancelled.recipientWrap, w.buyer.secret)).state, 'cancelled');
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  fail(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret), 'REPLAY_REFUSED');
  const freshSeller = w.v2(w.seller, await durable(), 'seller');
  ok(await freshSeller.receive(take.recipientWrap, w.seller.secret));
  fail(await w.buyer.ex.receive(ok(await freshSeller.offer(take.sessionId, termsBytes(), w.seller.secret)).recipientWrap, w.buyer.secret), 'REPLAY_REFUSED');
  // A buyer-side cancel of a never-offered session has no terms to tombstone and stays a plain v1 cancel.
  const w2 = await world();
  const t2 = ok(await w2.buyer.ex.take(w2.key, set.terms.buyer, w2.buyer.secret));
  ok(await w2.seller.ex.receive(t2.recipientWrap, w2.seller.secret));
  const c2 = ok(await w2.buyer.ex.cancel(t2.sessionId, 'withdrawn', w2.buyer.secret));
  assert.equal(parseEnvelope(await contentOf(c2.recipientWrap, w2.seller)).v, 1);
  assert.equal(ok(await w2.seller.ex.receive(c2.recipientWrap, w2.seller.secret)).state, 'cancelled');
});

test('replay ledger: a conflicting second binding for the same (termsHash, role) fails closed; an identical resend is a no-op', async () => {
  const w = await world();
  const { id } = await toOffered(w);
  // A second buyer key takes the same advert naming the same buyer address: the same terms would bind different keys.
  const other = w.v2(w.third, await durable(), 'buyer');
  const take = ok(await other.take(w.key, set.terms.buyer, w.third.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  fail(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret), 'REPLAY_REFUSED');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
  // The original session completes. Then both parties restart (new exchanges, same durable ledgers) and the identical
  // bindings are re-sent in a new session: the ledger treats them as duplicates and the session progresses again.
  const accept = ok(await w.buyer.ex.accept(id, termsBytes(), w.buyer.secret));
  ok(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret));
  const seller2 = w.v2(w.seller, w.sellerLedger, 'seller'), buyer2 = w.v2(w.buyer, w.buyerLedger, 'buyer');
  const take2 = ok(await buyer2.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller2.receive(take2.recipientWrap, w.seller.secret));
  const offer2 = ok(await seller2.offer(take2.sessionId, termsBytes(), w.seller.secret));
  ok(await buyer2.receive(offer2.recipientWrap, w.buyer.secret));
  const accept2 = ok(await buyer2.accept(take2.sessionId, termsBytes(), w.buyer.secret));
  assert.equal(ok(await seller2.receive(accept2.recipientWrap, w.seller.secret)).state, 'accepted');
  assert.equal(seller2.acceptances(take2.sessionId).bothVerified, true);
  assert.equal(seller2.acceptances(take2.sessionId).seller.bindingHash, w.seller.ex.acceptances(id).seller.bindingHash);
});

test('replay across sessions: a carrier from one session cannot be admitted in another', async () => {
  const w = await world();
  const { offer } = await toOffered(w);
  // The exact wrap again is a rumor replay; re-carrying its proof to another buyer key fails the binding's key check.
  fail(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret), 'DUPLICATE');
  const proof = JSON.parse(await contentOf(offer.recipientWrap, w.buyer)).body.acceptance;
  const other = w.v2(w.third, await durable(), 'buyer');
  const take = ok(await other.take(w.key, set.terms.buyer, w.third.secret));
  fail(await other.receive(await craft(w.seller, w.third, { v: 2, type: 'terms-offer', body: { terms: offerText(), acceptance: proof } }), w.third.secret), 'ACCEPTANCE_INVALID');
  assert.equal(other.session(take.sessionId).state, 'taken');
});

test('v2 byte budget: oversize carriers are refused on build and on parse', async () => {
  const w = await world();
  const real = portFor('seller', w.sellerLedger);
  const bloated = { ...real, async encode(request) { const wire = await real.encode(request); return { ...wire, termsSignature: '0x' + 'ab'.repeat(MAX_ENVELOPE_V2_BYTES / 2) }; } };
  const seller = w.make(w.seller, { protocolVersion: 2, peerAcceptance: bloated });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller.receive(take.recipientWrap, w.seller.secret));
  fail(await seller.offer(take.sessionId, termsBytes(), w.seller.secret), 'LIMIT_EXCEEDED');
  assert.equal(seller.session(take.sessionId).state, 'taken');
  const text = encodeEnvelope({ v: 2, type: 'terms-offer', ad: w.address, orderId: ORDER, sender: w.seller.pub, recipient: w.buyer.pub, nonce: 'ab'.repeat(32),
    expiresAtSeconds: String(NOW + 600), termsHash: TERMS_HASH, body: { terms: offerText(), acceptance: await acceptance('seller', w.seller.pub, w.buyer.pub) } });
  assert.equal(parseEnvelopeV2(text).v, 2);
  const padded = size => text + ' '.repeat(size - Buffer.byteLength(text));
  assert.equal(parseEnvelopeV2(padded(MAX_ENVELOPE_V2_BYTES)).v, 2);
  assert.equal(parseEnvelopeV2(padded(MAX_ENVELOPE_V2_BYTES + 1)), null);
  assert.equal(parseVersionedEnvelope(padded(MAX_ENVELOPE_V2_BYTES + 1)), null);
  const big = await craft(w.seller, w.buyer, {}, { content: padded(MAX_ENVELOPE_V2_BYTES + 1) });
  const result = await w.buyer.ex.receive(big, w.buyer.secret);
  assert.equal(result.ok, false); assert.ok(['WRAP_INVALID', 'MALFORMED'].includes(result.code), result.code);
  assert.equal(w.buyer.ex.session(take.sessionId).state, 'taken');
});

test('the v2 parser is exact: extra keys, wrong ad author, missing proof or non-hex signatures are null', async () => {
  const w = await world();
  const env = { v: 2, type: 'terms-offer', ad: w.address, orderId: ORDER, sender: w.seller.pub, recipient: w.buyer.pub, nonce: 'ab'.repeat(32),
    expiresAtSeconds: String(NOW + 600), termsHash: TERMS_HASH, body: { terms: offerText(), acceptance: await acceptance('seller', w.seller.pub, w.buyer.pub) } };
  assert.ok(parseEnvelopeV2(encodeEnvelope(env)));
  const variants = [e => { e.body.extra = 1; }, e => { e.body.acceptance.scheme = 'eoa'; }, e => { delete e.body.acceptance; },
    e => { e.body.acceptance.termsSignature = 'zz'; }, e => { e.body.acceptance.binding = []; }, e => { e.type = 'terms-reject'; },
    e => { e.termsHash = null; }, e => { [e.sender, e.recipient] = [e.recipient, e.sender]; }, e => { e.v = 3; }];
  for (const mutate of variants) {
    const copy = structuredClone(env); mutate(copy);
    assert.equal(parseEnvelopeV2(JSON.stringify(copy)), null, mutate.toString());
  }
  assert.equal(parseEnvelopeV2(encodeEnvelope({ ...env, v: 1 })), null);
});

test('fail closed on a faulty port: mismatched verification, unavailable admit or tombstone never change state', async () => {
  const w = await world();
  const real = portFor('buyer', w.buyerLedger);
  const lying = { ...real, async verify(...args) { const v = await real.verify(...args); return v && { ...v, account: set.terms.buyer }; } };
  const buyer = w.make(w.buyer, { protocolVersion: 2, peerAcceptance: lying });
  const take = ok(await buyer.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  fail(await buyer.receive(offer.recipientWrap, w.buyer.secret), 'ACCEPTANCE_INVALID');
  assert.equal(buyer.session(take.sessionId).state, 'taken');
  buyer.close();

  const unavailable = { ...real, async admit() { return { ok: false, code: 'UNAVAILABLE' }; } };
  const buyer2 = w.make(w.buyer, { protocolVersion: 2, peerAcceptance: unavailable });
  const take2 = ok(await buyer2.take(w.key, set.terms.buyer, w.buyer.secret));
  // The seller's session for this pair is offered; give the second instance its own seller.
  const seller2 = w.v2(w.seller, await durable(), 'seller');
  ok(await seller2.receive(take2.recipientWrap, w.seller.secret));
  const offer2 = ok(await seller2.offer(take2.sessionId, termsBytes(), w.seller.secret));
  fail(await buyer2.receive(offer2.recipientWrap, w.buyer.secret), 'REPLAY_UNAVAILABLE');
  assert.equal(buyer2.session(take2.sessionId).state, 'taken'); assert.equal(buyer2.acceptances(take2.sessionId).seller, null);
  buyer2.close();

  const noTombstone = { ...real, async tombstone() { throw new Error('store down'); } };
  const buyer3 = w.make(w.buyer, { protocolVersion: 2, peerAcceptance: noTombstone });
  const seller3 = w.v2(w.seller, await durable(), 'seller');
  const take3 = ok(await buyer3.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller3.receive(take3.recipientWrap, w.seller.secret));
  ok(await buyer3.receive(ok(await seller3.offer(take3.sessionId, termsBytes(), w.seller.secret)).recipientWrap, w.buyer.secret));
  fail(await buyer3.reject(take3.sessionId, 'declined', w.buyer.secret), 'REPLAY_UNAVAILABLE');
  fail(await buyer3.cancel(take3.sessionId, 'withdrawn', w.buyer.secret), 'REPLAY_UNAVAILABLE');
  assert.equal(buyer3.session(take3.sessionId).state, 'offered');
  // A receive-only port (no wallet) refuses to encode, so the send is refused before anything is wrapped.
  const receiveOnly = createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: w.buyerLedger.ledger });
  const buyer4 = w.make(w.buyer, { protocolVersion: 2, peerAcceptance: { ...real, encode: receiveOnly.encode } });
  const seller4 = w.v2(w.seller, await durable(), 'seller');
  const take4 = ok(await buyer4.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller4.receive(take4.recipientWrap, w.seller.secret));
  ok(await buyer4.receive(ok(await seller4.offer(take4.sessionId, termsBytes(), w.seller.secret)).recipientWrap, w.buyer.secret));
  fail(await buyer4.accept(take4.sessionId, termsBytes(), w.buyer.secret), 'ACCEPTANCE_INVALID');
  assert.equal(buyer4.session(take4.sessionId).state, 'offered'); assert.equal(buyer4.acceptances(take4.sessionId).buyer, null);
  buyer4.close();
});

// ---- Fix pass: withdrawal races, reordered cancel, prompt suppression, ledger capacity, re-check coverage ----

/** Whether `holder`'s durable ledger holds the tombstone: re-admitting the already recorded seller binding is then a CONFLICT, otherwise a duplicate. */
async function ledgerTombstoned(w, holder, offerContent) {
  const probe = createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: holder.ledger });
  const verified = await probe.verify(offerContent, reviewed, { role: 'seller', sender: w.seller.pub, recipient: w.buyer.pub, ad: w.address, orderId: ORDER,
    revision: reviewed.revision, termsHash: TERMS_HASH, nowSeconds: String(NOW) });
  assert.ok(verified);
  const result = await probe.admit(verified);
  if (result.ok) { assert.equal(result.value, 'duplicate'); return false; }
  assert.equal(result.code, 'CONFLICT'); return true;
}
/** D1 rule 7 plus the lane rule: a withdrawal either commits (and the accept is refused) or never touches the ledger. */
function assertExclusive(label, withdrawal, accept, view, tombstoned) {
  const outcome = JSON.stringify({ withdrawal: withdrawal.ok || withdrawal.code, accept: accept.ok || accept.code, bothVerified: view.bothVerified, tombstoned });
  if (withdrawal.ok) {
    assert.equal(accept.ok, false, `${label}: ${outcome}`); assert.equal(view.bothVerified, false, `${label}: ${outcome}`);
    assert.equal(tombstoned, true, `${label}: ${outcome}`); assert.notEqual(view.state, 'accepted', `${label}: ${outcome}`);
  } else {
    assert.equal(accept.ok, true, `${label}: ${outcome}`); assert.equal(view.state, 'accepted', `${label}: ${outcome}`);
    assert.equal(tombstoned, false, `${label}: a refused withdrawal left a tombstone under an accepted session ${outcome}`);
  }
  assert.equal(view.bothVerified && tombstoned, false, `${label}: bothVerified over a tombstoned termsHash ${outcome}`);
}

test('race: a seller cancel concurrent with receipt of the buyer accept never leaves bothVerified over a tombstoned termsHash', async () => {
  for (const cancelFirst of [false, true]) {
    for (let round = 0; round < 3; round++) {
      const w = await world();
      const { id, offer } = await toOffered(w);
      const accept = ok(await w.buyer.ex.accept(id, termsBytes(), w.buyer.secret));
      const pending = cancelFirst
        ? [w.seller.ex.cancel(id, 'withdrawn', w.seller.secret), w.seller.ex.receive(accept.recipientWrap, w.seller.secret)]
        : [w.seller.ex.receive(accept.recipientWrap, w.seller.secret), w.seller.ex.cancel(id, 'withdrawn', w.seller.secret)];
      const settled = await Promise.all(pending);
      const [cancel, receive] = cancelFirst ? settled : [settled[1], settled[0]];
      const view = w.seller.ex.acceptances(id);
      assertExclusive(`seller cancel ${cancelFirst ? 'first' : 'second'} #${round}`, cancel, receive, view,
        await ledgerTombstoned(w, w.sellerLedger, await contentOf(offer.recipientWrap, w.buyer)));
    }
  }
});

test('race: on the buyer, its own accept concurrent with a received seller cancel, or with its own reject, is exclusive', async () => {
  for (const withdrawFirst of [false, true]) {
    for (const kind of ['received-cancel', 'own-reject']) {
      const w = await world();
      const { id, offer } = await toOffered(w);
      const withdraw = kind === 'received-cancel'
        ? (async () => { const c = ok(await w.seller.ex.cancel(id, 'withdrawn', w.seller.secret)); return () => w.buyer.ex.receive(c.recipientWrap, w.buyer.secret); })()
        : Promise.resolve(() => w.buyer.ex.reject(id, 'declined', w.buyer.secret));
      const start = await withdraw;
      const doAccept = () => w.buyer.ex.accept(id, termsBytes(), w.buyer.secret);
      const settled = await Promise.all(withdrawFirst ? [start(), doAccept()] : [doAccept(), start()]);
      const [withdrawal, accept] = withdrawFirst ? settled : [settled[1], settled[0]];
      assertExclusive(`buyer ${kind} ${withdrawFirst ? 'first' : 'second'}`, withdrawal, accept, w.buyer.ex.acceptances(id),
        await ledgerTombstoned(w, w.buyerLedger, await contentOf(offer.recipientWrap, w.buyer)));
    }
  }
});

test('reordered delivery: a seller cancel naming a termsHash that arrives before its offer tombstones it on the buyer', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  const cancel = ok(await w.seller.ex.cancel(take.sessionId, 'withdrawn', w.seller.secret));
  // The relay delivers the cancel first.
  const got = ok(await w.buyer.ex.receive(cancel.recipientWrap, w.buyer.secret));
  assert.deepEqual([got.type, got.state, got.termsHash], ['cancel', 'cancelled', TERMS_HASH]);
  fail(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret), 'OUT_OF_ORDER');
  // Even in a new session (re-take) the late offer is refused, also by a restarted exchange over the reopened ledger.
  const retake = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  fail(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret), 'REPLAY_REFUSED');
  assert.equal(w.buyer.ex.session(retake.sessionId).state, 'taken'); assert.equal(w.buyer.ex.acceptances(retake.sessionId).seller, null);
  await w.buyerLedger.reopen();
  const buyer2 = w.v2(w.buyer, w.buyerLedger, 'buyer');
  ok(await buyer2.take(w.key, set.terms.buyer, w.buyer.secret));
  fail(await buyer2.receive(offer.recipientWrap, w.buyer.secret), 'REPLAY_REFUSED');
  fail(await buyer2.accept(retake.sessionId, termsBytes(), w.buyer.secret), 'SELLER_FIRST');
});

test('reordered delivery: an untrusted buyer cancel naming a termsHash never tombstones the seller ledger', async () => {
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, { v: 1, type: 'cancel', body: { reason: 'withdrawn' } }), w.seller.secret), 'HASH_MISMATCH');
  assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
  ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
});

test('prompts: a withdrawn termsHash is refused before the wallet is asked to sign, on re-offer and on accept', async () => {
  const w = await world();
  const sellerSigner = signerFor('seller');
  const seller = w.v2(w.seller, w.sellerLedger, 'seller', { peerAcceptance: portFor('seller', w.sellerLedger, sellerSigner) });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller.receive(take.recipientWrap, w.seller.secret));
  ok(await w.buyer.ex.receive(ok(await seller.offer(take.sessionId, termsBytes(), w.seller.secret)).recipientWrap, w.buyer.secret));
  assert.equal(sellerSigner.calls, 2);
  const rejected = ok(await w.buyer.ex.reject(take.sessionId, 'declined', w.buyer.secret));
  ok(await seller.receive(rejected.recipientWrap, w.seller.secret));
  const retake = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller.receive(retake.recipientWrap, w.seller.secret));
  fail(await seller.offer(retake.sessionId, termsBytes(), w.seller.secret), 'REPLAY_REFUSED');
  assert.equal(sellerSigner.calls, 2, 'no signing prompt for terms this exchange already withdrew');

  // A buyer whose reject could not be recorded (store down) fails closed: it never signs an accept of those terms.
  const w2 = await world();
  const buyerSigner = signerFor('buyer'), real = portFor('buyer', w2.buyerLedger, buyerSigner);
  const buyer = w2.make(w2.buyer, { protocolVersion: 2, peerAcceptance: { ...real, async tombstone() { return { ok: false, code: 'UNAVAILABLE' }; } } });
  const t2 = ok(await buyer.take(w2.key, set.terms.buyer, w2.buyer.secret));
  ok(await w2.seller.ex.receive(t2.recipientWrap, w2.seller.secret));
  ok(await buyer.receive(ok(await w2.seller.ex.offer(t2.sessionId, termsBytes(), w2.seller.secret)).recipientWrap, w2.buyer.secret));
  fail(await buyer.reject(t2.sessionId, 'declined', w2.buyer.secret), 'REPLAY_UNAVAILABLE');
  assert.equal(buyer.session(t2.sessionId).state, 'offered');
  fail(await buyer.accept(t2.sessionId, termsBytes(), w2.buyer.secret), 'REPLAY_REFUSED');
  assert.equal(buyerSigner.calls, 0);
  assert.equal(buyer.acceptances(t2.sessionId).bothVerified, false);
});

test('ledger capacity: a full replay ledger is REPLAY_FULL, distinct from an unavailable store', async () => {
  const w = await world();
  const real = portFor('buyer', w.buyerLedger);
  const full = { ...real, async admit() { return { ok: false, code: 'LIMIT_EXCEEDED' }; }, async tombstone() { return { ok: false, code: 'LIMIT_EXCEEDED' }; } };
  const buyer = w.make(w.buyer, { protocolVersion: 2, peerAcceptance: full });
  const take = ok(await buyer.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const offer = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret));
  fail(await buyer.receive(offer.recipientWrap, w.buyer.secret), 'REPLAY_FULL');
  assert.equal(buyer.session(take.sessionId).state, 'taken');
  buyer.close();
  // Tombstones of new terms fail the same way once the ledger is full.
  const fullTombstones = w.make(w.buyer, { protocolVersion: 2, peerAcceptance: { ...real, async tombstone() { return { ok: false, code: 'LIMIT_EXCEEDED' }; } } });
  const seller2 = w.v2(w.seller, await durable(), 'seller');
  const t2 = ok(await fullTombstones.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller2.receive(t2.recipientWrap, w.seller.secret));
  ok(await fullTombstones.receive(ok(await seller2.offer(t2.sessionId, termsBytes(), w.seller.secret)).recipientWrap, w.buyer.secret));
  fail(await fullTombstones.reject(t2.sessionId, 'declined', w.buyer.secret), 'REPLAY_FULL');
  fail(await fullTombstones.cancel(t2.sessionId, 'withdrawn', w.buyer.secret), 'REPLAY_FULL');
  assert.equal(fullTombstones.session(t2.sessionId).state, 'offered');
});

test('the exchange re-checks every field of the port answer: a lying verify never records a binding', async () => {
  const lieCases = at => {
    const expires = String(at + 900);
    return [
      ['role', v => ({ ...v, role: 'buyer' }), 'ACCEPTANCE_INVALID'],
      ['termsHash', v => ({ ...v, termsHash: 'ab'.repeat(32) }), 'ACCEPTANCE_INVALID'],
      ['bindingHash', v => ({ ...v, bindingHash: 'not hex' }), 'ACCEPTANCE_INVALID'],
      ['ownMessagingKey', (v, w) => ({ ...v, ownMessagingKey: w.third.pub }), 'ACCEPTANCE_INVALID'],
      ['counterpartyMessagingKey', (v, w) => ({ ...v, counterpartyMessagingKey: w.third.pub }), 'ACCEPTANCE_INVALID'],
      ['notAfterSeconds format', v => ({ ...v, notAfterSeconds: '01' }), 'ACCEPTANCE_INVALID'],
      ['effective format', v => ({ ...v, effectiveNotAfterSeconds: 'soon' }), 'ACCEPTANCE_INVALID'],
      ['effective > notAfter', v => ({ ...v, notAfterSeconds: String(BigInt(v.effectiveNotAfterSeconds) - 1n) }), 'ACCEPTANCE_INVALID'],
      ['effective > envelope expiry', v => ({ ...v, effectiveNotAfterSeconds: String(BigInt(expires) + 1n) }), 'ACCEPTANCE_INVALID'],
      ['effective <= now', (v, w) => ({ ...v, effectiveNotAfterSeconds: String(w.clock.now) }), 'EXPIRED'],
    ];
  };
  const run = async (w, label, lie, code) => {
    const real = portFor('buyer', w.buyerLedger);
    let verifyCalls = 0;
    const lying = { ...real, async verify(...args) { verifyCalls++; const v = await real.verify(...args); assert.ok(v, label); return lie(v, w); } };
    const buyer = w.make(w.buyer, { protocolVersion: 2, peerAcceptance: lying });
    const take = ok(await buyer.take(w.key, set.terms.buyer, w.buyer.secret));
    fail(await buyer.receive(w.offerWrap, w.buyer.secret), code);
    assert.equal(verifyCalls, 1, label);
    assert.equal(buyer.session(take.sessionId).state, 'taken', label); assert.equal(buyer.acceptances(take.sessionId).seller, null, label);
    buyer.close();
  };
  const w = await world();
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  w.offerWrap = ok(await w.seller.ex.offer(take.sessionId, termsBytes(), w.seller.secret)).recipientWrap;
  for (const [label, lie, code] of lieCases(NOW)) await run(w, label, lie, code);
  // effective > acceptBefore needs an envelope that outlives acceptBefore: an advert opened just before it.
  const late = await world({ at: Number(reviewed.acceptBeforeSeconds) - 500 });
  const lateTake = ok(await late.buyer.ex.take(late.key, set.terms.buyer, late.buyer.secret));
  ok(await late.seller.ex.receive(lateTake.recipientWrap, late.seller.secret));
  late.offerWrap = ok(await late.seller.ex.offer(lateTake.sessionId, termsBytes(), late.seller.secret)).recipientWrap;
  const past = String(BigInt(reviewed.acceptBeforeSeconds) + 1n);
  await run(late, 'effective > acceptBefore', v => ({ ...v, notAfterSeconds: past, effectiveNotAfterSeconds: past }), 'ACCEPTANCE_INVALID');
});

test('concurrency: two distinct valid accept carriers received at once commit exactly one accept', async () => {
  const w = await world();
  const { id } = await toOffered(w);
  const carrier = async nonce => craft(w.buyer, w.seller, { v: 2, type: 'terms-accept', body: { revision: '1', acceptance: await acceptance('buyer', w.buyer.pub, w.seller.pub) } }, { nonce });
  const [a, b] = [await carrier('11'.repeat(32)), await carrier('22'.repeat(32))];
  const results = await Promise.all([w.seller.ex.receive(a, w.seller.secret), w.seller.ex.receive(b, w.seller.secret)]);
  assert.equal(results.filter(r => r.ok).length, 1, JSON.stringify(results.map(r => r.ok || r.code)));
  assert.equal(results.find(r => !r.ok).code, 'OUT_OF_ORDER');
  assert.equal(w.seller.ex.acceptances(id).bothVerified, true);
});

test('build self-parse: a port carrier the v2 parser would refuse is never wrapped or verified', async () => {
  const w = await world();
  const real = portFor('seller', w.sellerLedger);
  let verifyCalls = 0;
  const odd = { ...real, async encode(request) { return { ...await real.encode(request), extra: true }; }, async verify(...args) { verifyCalls++; return real.verify(...args); } };
  const seller = w.make(w.seller, { protocolVersion: 2, peerAcceptance: odd });
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await seller.receive(take.recipientWrap, w.seller.secret));
  fail(await seller.offer(take.sessionId, termsBytes(), w.seller.secret), 'ACCEPTANCE_INVALID');
  assert.equal(verifyCalls, 0);
  assert.equal(seller.session(take.sessionId).state, 'taken'); assert.equal(seller.acceptances(take.sessionId).seller, null);
});
