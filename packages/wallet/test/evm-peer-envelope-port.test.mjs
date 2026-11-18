// createEvmPeerAcceptancePort: the exchange PeerAcceptancePort over the candidate v2 carrier and encrypted replay ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { RegistryService } from '../../domain/src/registry.ts';
import { TERMS_REVIEW_FORMAT, reviewTermsBytes } from '../../domain/index.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { encodeEnvelope } from '../../exchange/src/messages.ts';
import { evmTermsHash } from '../src/evm-terms.ts';
import { peerAcceptanceHash } from '../src/evm-peer-acceptance.ts';
import { CandidatePeerReplayLedger, MAX_PEER_REPLAY_TERMS } from '../src/evm-peer-replay.ts';
import { createEvmPeerAcceptancePort, evmTermsFromReviewed, parseCandidatePeerEnvelope } from '../src/evm-peer-envelope.ts';

const dir = new URL('../../domain/test/fixtures/local-evm-scenario/', import.meta.url);
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const registry = new RegistryService();
assert.equal((await registry.load(new Uint8Array(await readFile(new URL('registry.json', dir))), scenario.registrySha256)).ok, true);
const sha256 = async bytes => { const d = createHash('sha256').update(bytes).digest(); return d.buffer.slice(d.byteOffset, d.byteOffset + 32); };
const set = scenario.sets.native;
const reviewed = (await reviewTermsBytes(registry, new TextEncoder().encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms: set.terms,
  privateAgreement: set.privateAgreementInput })), sha256)).value;
const TERMS_HASH = set.expectedEvmTermsHash;
const NOW = '1699990000';
const key = n => Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(n))).toString('hex');
const SELLER_KEY = key(1), BUYER_KEY = key(2), OTHER_KEY = key(3);
const AD = `30078:${SELLER_KEY}:p2p-offramp:v1:${set.terms.orderId}`;
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const signDigest = (hex, digest) => {
  const sig = secp256k1.sign(Buffer.from(digest, 'hex'), Buffer.from(hex, 'hex'), { prehash: false, format: 'recovered', lowS: true });
  return Uint8Array.from([...sig.subarray(1), sig[0] + 27]);
};
const signerFor = role => ({ requests: [], async sign(request) { this.requests.push(request); return signDigest(scenario.testOnlyKeys[role].privateKeyHex, request.digest); } });
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
const PASS = 'synthetic peer port passphrase';
async function setup(t) {
  const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false }), session = val(await vault.create(PASS));
  const s = { vault, session, ledger: new CandidatePeerReplayLedger(vault, session) };
  s.reopen = async () => { s.ledger.dispose(); vault.lockAll(); s.ledger = new CandidatePeerReplayLedger(vault, val(await vault.unlock(session.profileId, PASS))); };
  t.after(() => { s.ledger.dispose(); vault.dispose(); });
  return s;
}
const portOf = (ledger, role) => createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: ledger, signer: signerFor(role) });
const sendRequest = (role, over = {}) => ({ role, reviewed, termsHash: TERMS_HASH, sender: role === 'seller' ? SELLER_KEY : BUYER_KEY,
  recipient: role === 'seller' ? BUYER_KEY : SELLER_KEY, notAfterSeconds: reviewed.acceptBeforeSeconds, ...over });
const envelopeFor = (role, acceptance, over = {}) => encodeEnvelope({ v: 2, type: role === 'seller' ? 'terms-offer' : 'terms-accept', ad: AD,
  orderId: set.terms.orderId, sender: role === 'seller' ? SELLER_KEY : BUYER_KEY, recipient: role === 'seller' ? BUYER_KEY : SELLER_KEY,
  nonce: 'ab'.repeat(32), expiresAtSeconds: '1699990600', termsHash: TERMS_HASH,
  body: role === 'seller' ? { terms: 'reviewed document bytes', acceptance } : { revision: set.terms.revision, acceptance }, ...over });
const contextFor = (role, over = {}) => ({ role, sender: role === 'seller' ? SELLER_KEY : BUYER_KEY, recipient: role === 'seller' ? BUYER_KEY : SELLER_KEY,
  ad: AD, orderId: set.terms.orderId, revision: set.terms.revision, termsHash: TERMS_HASH, nowSeconds: NOW, ...over });

test('evmTermsFromReviewed reproduces the G16 digest of the reviewed terms', () => {
  assert.equal(evmTermsHash(scenario.domain, evmTermsFromReviewed(reviewed)), TERMS_HASH);
});

test('encode signs TradeTerms then PeerAcceptance with the local wallet and emits the exact candidate v2 carrier', async t => {
  const s = await setup(t), signer = signerFor('seller');
  const port = createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: s.ledger, signer });
  const wire = await port.encode(sendRequest('seller'));
  assert.deepEqual(signer.requests.map(r => [r.purpose, r.role, r.account]), [['trade-terms', 'seller', set.terms.seller], ['peer-acceptance', 'seller', set.terms.seller]]);
  assert.equal(signer.requests[0].digest, TERMS_HASH);
  assert.equal(signer.requests[1].digest, peerAcceptanceHash(scenario.domain, wire.binding));
  assert.deepEqual(wire.binding, { v: 1, termsHash: TERMS_HASH, role: 'seller', account: set.terms.seller, ownMessagingKey: SELLER_KEY,
    counterpartyMessagingKey: BUYER_KEY, notAfterSeconds: reviewed.acceptBeforeSeconds });
  assert.match(wire.termsSignature, /^0x[0-9a-f]{130}$/); assert.match(wire.bindingSignature, /^0x[0-9a-f]{130}$/);
  assert.ok(parseCandidatePeerEnvelope(envelopeFor('seller', wire)));
  assert.ok(Object.isFrozen(wire));
});

test('encode refuses: no signer, wrong domain, wrong terms hash, a wallet signing for another account, malformed signatures', async t => {
  const s = await setup(t);
  assert.equal(await createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: s.ledger }).encode(sendRequest('seller')), null);
  const otherDomain = createEvmPeerAcceptancePort({ domain: { ...scenario.domain, chainId: '1' }, replayLedger: s.ledger, signer: signerFor('seller') });
  assert.equal(await otherDomain.encode(sendRequest('seller')), null);
  assert.equal(await portOf(s.ledger, 'seller').encode(sendRequest('seller', { termsHash: 'cd'.repeat(32) })), null);
  assert.equal(await portOf(s.ledger, 'buyer').encode(sendRequest('seller')), null, 'the buyer wallet cannot produce a seller proof');
  for (const bad of [new Uint8Array(64), new Uint8Array(65), 'not bytes']) {
    const port = createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: s.ledger, signer: { sign: async () => bad } });
    assert.equal(await port.encode(sendRequest('seller')), null);
  }
  assert.equal(await portOf(s.ledger, 'seller').encode(sendRequest('seller', { recipient: SELLER_KEY })), null, 'own and counterparty key must differ');
  assert.throws(() => createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: {} }), /INVALID_OPTIONS/);
  assert.throws(() => createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: s.ledger, signer: {} }), /INVALID_OPTIONS/);
});

test('verify + admit: trusted context only; recorded then duplicate; single-use verification tokens', async t => {
  const s = await setup(t), port = portOf(s.ledger, 'seller');
  const text = envelopeFor('seller', await port.encode(sendRequest('seller')));
  const verified = await port.verify(text, reviewed, contextFor('seller'));
  assert.deepEqual({ ...verified }, { role: 'seller', termsHash: TERMS_HASH, bindingHash: peerAcceptanceHash(scenario.domain, parseCandidatePeerEnvelope(text).body.acceptance.binding),
    account: set.terms.seller, ownMessagingKey: SELLER_KEY, counterpartyMessagingKey: BUYER_KEY, notAfterSeconds: reviewed.acceptBeforeSeconds,
    effectiveNotAfterSeconds: '1699990600' });
  assert.ok(Object.isFrozen(verified));
  assert.deepEqual(await port.admit(verified), { ok: true, value: 'recorded' });
  assert.deepEqual(await port.admit(verified), { ok: false, code: 'UNAVAILABLE' }, 'a verification token admits once');
  assert.deepEqual(await port.admit({ ...verified }), { ok: false, code: 'UNAVAILABLE' }, 'a forged copy is not a verification');
  assert.deepEqual(await port.admit(await port.verify(text, reviewed, contextFor('seller'))), { ok: true, value: 'duplicate' });
  for (const over of [{ role: 'buyer' }, { sender: OTHER_KEY }, { recipient: OTHER_KEY }, { ad: AD.replace(SELLER_KEY, OTHER_KEY) },
    { orderId: 'ef'.repeat(32) }, { revision: '2' }, { termsHash: 'cd'.repeat(32) }, { nowSeconds: '1699990600' }, { nowSeconds: '01' }]) {
    assert.equal(await port.verify(text, reviewed, contextFor('seller', over)), null, JSON.stringify(over));
  }
  assert.equal(await port.verify(text.replace('"v":2', '"v":1'), reviewed, contextFor('seller')), null);
  const otherDomain = createEvmPeerAcceptancePort({ domain: { ...scenario.domain, verifyingContract: '0x' + '55'.repeat(20) }, replayLedger: s.ledger });
  assert.equal(await otherDomain.verify(text, reviewed, contextFor('seller')), null, 'reviewed terms must name the trusted domain');
});

test('admit fails closed on a conflicting binding and on a tombstone, which survives ledger reopen', async t => {
  const s = await setup(t), seller = portOf(s.ledger, 'seller'), buyer = portOf(s.ledger, 'buyer');
  val(await seller.admit(await seller.verify(envelopeFor('seller', await seller.encode(sendRequest('seller'))), reviewed, contextFor('seller'))));
  // Same (termsHash, seller) with a different counterparty key: conflict.
  const conflicting = envelopeFor('seller', await seller.encode(sendRequest('seller', { recipient: OTHER_KEY })), { recipient: OTHER_KEY });
  assert.deepEqual(await seller.admit(await seller.verify(conflicting, reviewed, contextFor('seller', { recipient: OTHER_KEY }))), { ok: false, code: 'CONFLICT' });
  // Same binding with a shorter signed expiry is also a different statement.
  const shorter = envelopeFor('seller', await seller.encode(sendRequest('seller', { notAfterSeconds: '1699999999' })));
  assert.deepEqual(await seller.admit(await seller.verify(shorter, reviewed, contextFor('seller'))), { ok: false, code: 'CONFLICT' });
  assert.deepEqual(await seller.tombstone(TERMS_HASH), { ok: true, value: undefined });
  const buyerText = envelopeFor('buyer', await buyer.encode(sendRequest('buyer')));
  assert.deepEqual(await buyer.admit(await buyer.verify(buyerText, reviewed, contextFor('buyer'))), { ok: false, code: 'CONFLICT' });
  await s.reopen();
  const reopened = portOf(s.ledger, 'buyer');
  assert.deepEqual(await reopened.admit(await reopened.verify(buyerText, reviewed, contextFor('buyer'))), { ok: false, code: 'CONFLICT' });
  assert.deepEqual(await reopened.tombstone(TERMS_HASH), { ok: true, value: undefined }, 'repeat tombstone is idempotent');
  assert.deepEqual(await reopened.tombstone('not a hash'), { ok: false, code: 'UNAVAILABLE' });
});

test('ledger operations are serialized: concurrent admissions for both roles never collide on the ledger guard', async t => {
  const s = await setup(t), seller = portOf(s.ledger, 'seller'), buyer = portOf(s.ledger, 'buyer');
  const a = await seller.verify(envelopeFor('seller', await seller.encode(sendRequest('seller'))), reviewed, contextFor('seller'));
  const b = await buyer.verify(envelopeFor('buyer', await buyer.encode(sendRequest('buyer'))), reviewed, contextFor('buyer'));
  // The ledger refuses overlapping operations (busy guard); one port serializes its own concurrent work.
  const port = createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: { admitEoa: (...args) => s.ledger.admitEoa(...args), tombstone: hash => s.ledger.tombstone(hash) } });
  const one = await port.verify(envelopeFor('seller', await seller.encode(sendRequest('seller'))), reviewed, contextFor('seller'));
  const two = await port.verify(envelopeFor('buyer', await buyer.encode(sendRequest('buyer'))), reviewed, contextFor('buyer'));
  assert.deepEqual(await Promise.all([port.admit(one), port.admit(two), port.tombstone('ab'.repeat(32))]),
    [{ ok: true, value: 'recorded' }, { ok: true, value: 'recorded' }, { ok: true, value: undefined }]);
  assert.deepEqual(await seller.admit(a), { ok: true, value: 'duplicate' });
  assert.deepEqual(await buyer.admit(b), { ok: true, value: 'duplicate' });
  // A throwing ledger maps to UNAVAILABLE and does not wedge the queue.
  const broken = createEvmPeerAcceptancePort({ domain: scenario.domain, replayLedger: { admitEoa: async () => { throw new Error('x'); }, tombstone: async () => { throw new Error('x'); } } });
  assert.deepEqual(await broken.tombstone(TERMS_HASH), { ok: false, code: 'UNAVAILABLE' });
  assert.deepEqual(await broken.tombstone(TERMS_HASH), { ok: false, code: 'UNAVAILABLE' });
});

test('a full ledger (64 termsHashes, no eviction) is LIMIT_EXCEEDED, distinct from UNAVAILABLE, for admit and tombstone', async t => {
  const s = await setup(t), seller = portOf(s.ledger, 'seller');
  for (let i = 0; i < MAX_PEER_REPLAY_TERMS; i++) val(await s.ledger.tombstone(i.toString(16).padStart(64, '0')));
  assert.deepEqual(await seller.tombstone(TERMS_HASH), { ok: false, code: 'LIMIT_EXCEEDED' });
  const verified = await seller.verify(envelopeFor('seller', await seller.encode(sendRequest('seller'))), reviewed, contextFor('seller'));
  assert.ok(verified);
  assert.deepEqual(await seller.admit(verified), { ok: false, code: 'LIMIT_EXCEEDED' });
  // An already held termsHash is still served: a repeat tombstone is idempotent.
  assert.deepEqual(await seller.tombstone('0'.repeat(64)), { ok: true, value: undefined });
});
