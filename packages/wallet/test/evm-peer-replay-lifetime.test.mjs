// D1 replay-ledger lifetime: per-peer/per-ad quotas, expiry retirement with a high-water mark, legacy migration,
// key rotation and backup freshness. Real encrypted vault/backup services over an atomic in-memory store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { decodeBase64url, encodeBase64url } from '../../schemas/index.ts';
import { RegistryService } from '../../domain/index.ts';
import { evmTermsHash, keccak256 } from '../src/evm-terms.ts';
import { createPeerAcceptanceVerifier } from '../src/evm-peer-verifier.ts';
import { CandidatePeerReplayLedger, MAX_PEER_REPLAY_TERMS, MAX_PEER_REPLAY_TERMS_PER_AD, MAX_PEER_REPLAY_TERMS_PER_PEER,
  MAX_PEER_REPLAY_TOMBSTONES, PEER_REPLAY_FORMAT, PEER_REPLAY_FORMAT_V2, PEER_REPLAY_PRIORITY_RESERVE, PEER_REPLAY_RECORD_ID,
  PEER_REPLAY_RETIRE_SKEW_SECONDS } from '../src/evm-peer-replay.ts';

const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const registryJSON = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url), 'utf8'));
const pass = 'synthetic peer replay lifetime passphrase', clone = value => structuredClone(value);
const SELLER = '0x' + '88'.repeat(20), BUYER = '0x' + '99'.repeat(20), NOW = 1_699_990_000, ACCEPT_BEFORE = 1_700_000_000;
const KEY_A = '1b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f', KEY_B = '4d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
// Other valid x-only points (BIP-340 public keys of secrets 3..).
const { schnorr } = await import('@noble/curves/secp256k1.js');
const keyOf = n => Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(n))).toString('hex');
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const err = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); };
class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return clone(this.rows.get(id)); }
  async add(row) { this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
}
// Contract-wallet accounts on a fake chain that approves every ERC-1271 query: distinct verified evidence is cheap.
const raw = structuredClone(registryJSON);
raw.networks[0].deployments[0].runtime.keccak256 = Buffer.from(keccak256(Buffer.from('6000', 'hex'))).toString('hex');
const registryBytes = new TextEncoder().encode(JSON.stringify(raw)), registry = new RegistryService();
assert.equal((await registry.load(registryBytes, createHash('sha256').update(registryBytes).digest('hex'))).ok, true);
const request = async ({ method, params = [] }) => {
  if (method === 'eth_chainId') return '0x7a69';
  if (method === 'eth_getBlockByNumber') return params[0] === '0x0' ? { number: '0x0', hash: raw.networks[0].genesisHash, timestamp: '0x0' }
    : { number: '0x10', hash: '0x' + '12'.repeat(32), timestamp: '0x' + NOW.toString(16) };
  if (method === 'eth_getCode') return params[0] === raw.networks[0].deployments[0].address ? '0x6000' : '0x6001';
  if (method === 'eth_call') return '0x1626ba7e' + '0'.repeat(56);
  throw Error('unexpected');
};
const verifier = createPeerAcceptanceVerifier({ registry, request });
test.after(() => verifier.dispose());
/** Verified seller (or buyer) statement for terms distinguished by `nonce`. */
async function statement({ nonce = 1, role = 'seller', signer = KEY_A, counterparty = KEY_B, acceptBefore = ACCEPT_BEFORE, now = NOW } = {}) {
  const terms = { ...scenario.sets.native.terms, seller: SELLER, buyer: BUYER, sellerNonce: nonce.toString(16).padStart(64, '0'), acceptBeforeSeconds: String(acceptBefore) };
  const binding = { v: 1, termsHash: evmTermsHash(scenario.domain, terms), role, account: terms[role], ownMessagingKey: signer,
    counterpartyMessagingKey: counterparty, notAfterSeconds: String(acceptBefore) };
  const result = await verifier.verify({ terms, role, signerMessagingKey: signer, counterpartyMessagingKey: counterparty, nowSeconds: String(now),
    envelopeExpiresAtSeconds: null, binding, termsSignature: new Uint8Array([1, 2, 3]), bindingSignature: new Uint8Array([4, 5, 6]) });
  return { evidence: val(result), terms };
}
const scope = (peer, { ad = 'ad-1', acceptBefore = ACCEPT_BEFORE, now = NOW, closesAt = NOW + 1800, priority = false } = {}) =>
  ({ ad: `30078:${'aa'.repeat(32)}:p2p-offramp:v1:${ad}`, peer, acceptBeforeSeconds: String(acceptBefore), nowSeconds: String(now),
    closesAtSeconds: String(closesAt), priority });
const live = json => json.entries.filter(entry => !entry.tombstoned || entry.acceptBeforeSeconds === null).length;
const seed = async (s, json) => val(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: { id: PEER_REPLAY_RECORD_ID, kind: 'preference',
  schemaVersion: 2, payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(json))) } }]));
async function setup(t) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), session = val(await vault.create(pass));
  const ledger = new CandidatePeerReplayLedger(vault, session); t.after(() => { ledger.dispose(); vault.dispose(); });
  return { store, vault, session, ledger };
}
const decrypted = async s => {
  const record = val(await s.vault.read(s.session.sessionId, PEER_REPLAY_RECORD_ID));
  return { record, json: JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 131072))) };
};

test('one peer cannot exhaust the ledger: per-peer quota refuses its next new terms while other peers still admit', async t => {
  const s = await setup(t);
  for (let i = 0; i < MAX_PEER_REPLAY_TERMS_PER_PEER; i++) {
    const { evidence } = await statement({ nonce: i + 1 });
    assert.equal(val(await s.ledger.admitVerified(evidence, scope(KEY_A, { ad: `ad-${i}` }))).status, 'recorded');
  }
  const { evidence: ninth } = await statement({ nonce: 99 });
  err(await s.ledger.admitVerified(ninth, scope(KEY_A, { ad: 'ad-99' })), 'LIMIT_EXCEEDED');
  // A selected (priority) session with the same peer is exempt from the per-peer quota.
  assert.equal(val(await s.ledger.admitVerified(ninth, scope(KEY_A, { ad: 'ad-99', priority: true }))).status, 'recorded');
  // A second statement for an existing termsHash is not a new entry and is never refused by the quota.
  const { evidence: buyerSide } = await statement({ nonce: 1, role: 'buyer', signer: KEY_B, counterparty: KEY_A });
  assert.equal(val(await s.ledger.admitVerified(buyerSide, scope(KEY_A, { ad: 'ad-0' }))).status, 'recorded');
  const other = keyOf(3), { evidence: fresh } = await statement({ nonce: 100, signer: other, counterparty: KEY_B });
  const admitted = val(await s.ledger.admitVerified(fresh, scope(other, { ad: 'ad-100' })));
  assert.equal(admitted.status, 'recorded'); assert.equal(admitted.freshness, 'local-history'); assert.ok(Object.isFrozen(admitted));
});
test('per-advert quota and the live total refuse non-priority entries; priority sessions keep reserved capacity; tombstones use their own budget', async t => {
  const s = await setup(t);
  for (let i = 0; i < MAX_PEER_REPLAY_TERMS_PER_AD; i++) {
    const peer = keyOf(10 + Math.floor(i / 4)), { evidence } = await statement({ nonce: 200 + i, signer: peer });
    val(await s.ledger.admitVerified(evidence, scope(peer, { ad: 'shared' })));
  }
  const late = keyOf(60), { evidence } = await statement({ nonce: 300, signer: late });
  err(await s.ledger.admitVerified(evidence, scope(late, { ad: 'shared' })), 'LIMIT_EXCEEDED');
  assert.equal(val(await s.ledger.admitVerified(evidence, scope(late, { ad: 'shared', priority: true }))).status, 'recorded', 'selected session exempt');
  // Non-priority entries stop at the reserve; priority entries may use it up to the total.
  let n = 400;
  for (;;) {
    const peer = keyOf(100 + (n % 120)), { evidence: next } = await statement({ nonce: n++, signer: peer });
    const result = await s.ledger.admitVerified(next, scope(peer, { ad: `total-${n}` }));
    if (!result.ok) { err(result, 'LIMIT_EXCEEDED'); break; }
  }
  assert.equal(live((await decrypted(s)).json), MAX_PEER_REPLAY_TERMS - PEER_REPLAY_PRIORITY_RESERVE);
  while (live((await decrypted(s)).json) < MAX_PEER_REPLAY_TERMS) {
    const peer = keyOf(100 + (n % 120)), { evidence: next } = await statement({ nonce: n++, signer: peer });
    val(await s.ledger.admitVerified(next, scope(peer, { ad: `total-${n}`, priority: true })));
  }
  const { evidence: overflow } = await statement({ nonce: n + 1, signer: keyOf(250) });
  err(await s.ledger.admitVerified(overflow, scope(keyOf(250), { ad: 'overflow', priority: true })), 'LIMIT_EXCEEDED');
  // A cancel never needs a live slot: a new scoped tombstone goes to the separate budget.
  val(await s.ledger.tombstoneScoped('ab'.repeat(32), scope(keyOf(250), { ad: 'overflow' })));
  assert.equal(live((await decrypted(s)).json), MAX_PEER_REPLAY_TERMS);
});
test('review MEDIUM: cancelled or ended ghost sessions free the advert quota at once instead of after the deadline plus a day', async t => {
  const s = await setup(t), ghosts = [];
  for (let i = 0; i < MAX_PEER_REPLAY_TERMS_PER_AD; i++) {
    const peer = keyOf(20 + i), { evidence } = await statement({ nonce: 500 + i, counterparty: peer });
    val(await s.ledger.admitVerified(evidence, scope(peer, { ad: 'ghosted' }))); ghosts.push({ evidence, peer });
  }
  const honest = keyOf(90), { evidence: offer } = await statement({ nonce: 600, counterparty: honest });
  err(await s.ledger.admitVerified(offer, scope(honest, { ad: 'ghosted' })), 'LIMIT_EXCEEDED');
  // The seller cancels the ghosted offers: their compact tombstones no longer count against the advert.
  for (const ghost of ghosts) val(await s.ledger.tombstoneScoped(ghost.evidence.termsHash, scope(ghost.peer, { ad: 'ghosted' })));
  assert.equal(val(await s.ledger.admitVerified(offer, scope(honest, { ad: 'ghosted' }))).status, 'recorded');
  const stored = (await decrypted(s)).json;
  assert.equal(stored.entries.filter(entry => entry.tombstoned).length, MAX_PEER_REPLAY_TERMS_PER_AD);
  assert.ok(stored.entries.filter(entry => entry.tombstoned).every(entry => entry.seller === null && entry.ad === null), 'compact tombstones');
  // Ghosts that were never cancelled: once their session ended (advert expiry) an unaccepted statement is compacted.
  const t2 = await setup(t), ended = [];
  for (let i = 0; i < MAX_PEER_REPLAY_TERMS_PER_AD; i++) {
    const peer = keyOf(40 + i), { evidence } = await statement({ nonce: 700 + i, counterparty: peer });
    val(await t2.ledger.admitVerified(evidence, scope(peer, { ad: 'expired-ad', closesAt: NOW + 600 }))); ended.push(evidence);
  }
  // One of them was accepted (buyer statement recorded): it may still be funded, so it keeps its slot until its deadline.
  const { evidence: accepted } = await statement({ nonce: 700, role: 'buyer', signer: keyOf(40), counterparty: KEY_A });
  val(await t2.ledger.admitVerified(accepted, scope(keyOf(40), { ad: 'expired-ad', closesAt: NOW + 600 })));
  const { evidence: next } = await statement({ nonce: 800, counterparty: honest });
  err(await t2.ledger.admitVerified(next, scope(honest, { ad: 'expired-ad', now: NOW + 599 })), 'LIMIT_EXCEEDED');
  assert.equal(val(await t2.ledger.admitVerified(next, scope(honest, { ad: 'expired-ad', now: NOW + 600 }))).status, 'recorded');
  const after = (await decrypted(t2)).json;
  assert.equal(after.entries.filter(entry => entry.tombstoned).length, MAX_PEER_REPLAY_TERMS_PER_AD - 1);
  assert.ok(after.entries.find(entry => entry.termsHash === ended[0].termsHash && !entry.tombstoned && entry.buyer), 'accepted entry kept');
  err(await t2.ledger.admitVerified(ended[1], scope(keyOf(41), { ad: 'expired-ad', now: NOW + 601 })), 'CONFLICT');
});
test('entries retire shortly after the terms deadline; a tombstone is removed only behind the high-water mark and never resurrected', async t => {
  const s = await setup(t);
  for (let i = 0; i < MAX_PEER_REPLAY_TERMS_PER_PEER; i++) {
    const { evidence } = await statement({ nonce: i + 1 }); val(await s.ledger.admitVerified(evidence, scope(KEY_A, { ad: `ad-${i}`, closesAt: ACCEPT_BEFORE * 2 })));
  }
  // A separately cancelled offer: its compact tombstone does not occupy the per-peer quota.
  const { evidence: cancelled } = await statement({ nonce: 99 });
  val(await s.ledger.tombstoneScoped(cancelled.termsHash, scope(KEY_A, { ad: 'ad-99' })));
  const later = ACCEPT_BEFORE + 10 * 86400, { evidence: blocked } = await statement({ nonce: 50, acceptBefore: later, now: NOW });
  const almost = ACCEPT_BEFORE + PEER_REPLAY_RETIRE_SKEW_SECONDS - 1;
  err(await s.ledger.admitVerified(blocked, scope(KEY_A, { ad: 'ad-50', acceptBefore: later, now: almost })), 'LIMIT_EXCEEDED');
  assert.equal(val(await s.ledger.status(cancelled.termsHash, String(almost), String(ACCEPT_BEFORE))).tombstoned, true);
  // At deadline + skew every entry with that deadline retires (not a day later), freeing the quota.
  const due = ACCEPT_BEFORE + PEER_REPLAY_RETIRE_SKEW_SECONDS;
  assert.equal(val(await s.ledger.admitVerified(blocked, scope(KEY_A, { ad: 'ad-50', acceptBefore: later, now: due }))).status, 'recorded');
  const stored = (await decrypted(s)).json;
  assert.equal(stored.entries.length, 1); assert.equal(stored.retiredThroughSeconds, String(ACCEPT_BEFORE));
  // Clock rollback: the retired termsHash (tombstoned or not) is never admitted again, and status still reports it withdrawn.
  err(await s.ledger.admitVerified(cancelled, scope(KEY_A, { ad: 'ad-99', now: NOW })), 'EXPIRED');
  const { evidence: retiredRecorded } = await statement({ nonce: 2 });
  err(await s.ledger.admitVerified(retiredRecorded, scope(KEY_A, { ad: 'ad-1', now: NOW })), 'EXPIRED');
  assert.deepEqual({ ...val(await s.ledger.status(cancelled.termsHash, String(NOW), String(ACCEPT_BEFORE))) },
    { tombstoned: true, retired: true, seller: false, buyer: false, freshness: 'local-history' });
});
test('review LOW: a clock jump past the deadline then a rollback never un-tombstones; the mark rises only to stored deadlines', async t => {
  const s = await setup(t), { evidence } = await statement({ nonce: 31 });
  val(await s.ledger.tombstoneScoped(evidence.termsHash, scope(KEY_A)));
  // One observation from a wildly wrong clock (ten years ahead) retires everything stored...
  const jump = ACCEPT_BEFORE + 10 * 365 * 86400;
  assert.equal(val(await s.ledger.status('cd'.repeat(32), String(jump))).tombstoned, false);
  const jumped = (await decrypted(s)).json;
  assert.equal(jumped.entries.length, 0);
  assert.equal(jumped.retiredThroughSeconds, String(ACCEPT_BEFORE), 'the mark is the retired deadline, never the clock');
  // ...but after the clock is corrected the cancelled terms stay withdrawn and refused.
  assert.equal(val(await s.ledger.status(evidence.termsHash, String(NOW), String(ACCEPT_BEFORE))).tombstoned, true);
  err(await s.ledger.admitVerified(evidence, scope(KEY_A)), 'EXPIRED');
  val(await s.ledger.tombstoneScoped(evidence.termsHash, scope(KEY_A)));
  assert.equal((await decrypted(s)).json.entries.length, 0, 'a covered tombstone needs no entry');
  // Terms with later deadlines are unaffected by the jump.
  const { evidence: newer } = await statement({ nonce: 32, acceptBefore: ACCEPT_BEFORE + 3600 });
  assert.equal(val(await s.ledger.admitVerified(newer, scope(KEY_A, { acceptBefore: ACCEPT_BEFORE + 3600 }))).status, 'recorded');
});
test('review LOW: every live entry reserves its tombstone slot, so cancel, reject and expiry compaction never fail on capacity', async t => {
  const s = await setup(t);
  const live = MAX_PEER_REPLAY_TERMS - 1, seeded = MAX_PEER_REPLAY_TOMBSTONES - live;
  const tombstones = Array.from({ length: seeded }, (_, i) => ({ termsHash: (i + 1).toString(16).padStart(64, '0'),
    acceptBeforeSeconds: String(ACCEPT_BEFORE), ad: null, peer: null, closesAtSeconds: null, tombstoned: true, seller: null, buyer: null }));
  await seed(s, { format: PEER_REPLAY_FORMAT_V2, retiredThroughSeconds: '0', entries: tombstones });
  // Fill to the bound with live entries (priority, so only the shared bound applies); the first half end soon.
  const admitted = [];
  for (let i = 0; i < live; i++) {
    const peer = keyOf(100 + i), { evidence } = await statement({ nonce: 1000 + i, counterparty: peer });
    val(await s.ledger.admitVerified(evidence, scope(peer, { ad: `bound-${i}`, priority: true, closesAt: i % 2 === 0 ? NOW + 600 : NOW + 1800 })));
    admitted.push({ evidence, peer, i });
  }
  const full = (await decrypted(s)).json;
  assert.equal(full.entries.filter(entry => entry.acceptBeforeSeconds !== null).length, MAX_PEER_REPLAY_TOMBSTONES);
  assert.ok(full.entries.filter(entry => !entry.tombstoned).length < MAX_PEER_REPLAY_TERMS, 'refused by the tombstone reserve, not the live total');
  // A further new live entry is refused instead of a later cancel.
  const late = keyOf(250), { evidence: extra } = await statement({ nonce: 2000, counterparty: late });
  err(await s.ledger.admitVerified(extra, scope(late, { ad: 'late', priority: true })), 'LIMIT_EXCEEDED');
  // Cancel (seller side) and reject (buyer side) of existing live entries succeed at the bound.
  val(await s.ledger.tombstoneScoped(admitted[1].evidence.termsHash, scope(admitted[1].peer, { ad: 'bound-1' })));
  val(await s.ledger.tombstone(admitted[3].evidence.termsHash));
  // Advert expiry compacts every ended unaccepted entry, all at the bound.
  assert.equal(val(await s.ledger.status(admitted[0].evidence.termsHash, String(NOW + 600), String(ACCEPT_BEFORE))).tombstoned, true);
  const after = (await decrypted(s)).json;
  assert.equal(after.entries.filter(entry => entry.tombstoned).length, seeded + Math.ceil(live / 2) + 2);
  assert.equal(after.entries.filter(entry => entry.acceptBeforeSeconds !== null).length, MAX_PEER_REPLAY_TOMBSTONES, 'conversions keep the sum');
  // Still at the bound: new live entries and new tombstones without an entry stay refused until retirement.
  err(await s.ledger.admitVerified(extra, scope(late, { ad: 'late', priority: true, now: NOW + 600 })), 'LIMIT_EXCEEDED');
  err(await s.ledger.tombstoneScoped('ff'.repeat(32), scope(late, { now: NOW + 600 })), 'LIMIT_EXCEEDED');
  // A record that breaks the reservation is refused without overwrite.
  const t2 = await setup(t);
  await seed(t2, { format: PEER_REPLAY_FORMAT_V2, retiredThroughSeconds: '0', entries: [{ ...tombstones[0], seller: { v: 1 } }] });
  const { evidence } = await statement({ nonce: 33 });
  const result = await t2.ledger.admitVerified(evidence, scope(KEY_A)); assert.equal(result.ok, false);
});
test('legacy version 1 history migrates: its tombstones keep refusing and never retire', async t => {
  const s = await setup(t), { evidence } = await statement({ nonce: 7 });
  const legacy = { format: PEER_REPLAY_FORMAT, entries: [{ termsHash: evidence.termsHash, tombstoned: true, seller: null, buyer: null }] };
  val(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: { id: PEER_REPLAY_RECORD_ID, kind: 'preference', schemaVersion: 1,
    payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(legacy))) } }]));
  err(await s.ledger.admitVerified(evidence, scope(KEY_A)), 'CONFLICT');
  const { evidence: other } = await statement({ nonce: 8 });
  val(await s.ledger.admitVerified(other, scope(KEY_A, { now: ACCEPT_BEFORE * 2 })), 'migration writes version 2');
  const { record, json } = await decrypted(s);
  assert.equal(record.schemaVersion, 2);
  const kept = json.entries.find(entry => entry.termsHash === evidence.termsHash);
  assert.deepEqual(kept, { termsHash: evidence.termsHash, acceptBeforeSeconds: null, ad: null, peer: null, closesAtSeconds: null, tombstoned: true, seller: null, buyer: null });
  // Far in the future the scoped entry retired (high-water mark) but the deadline-less legacy tombstone stays.
  assert.equal(val(await s.ledger.status(evidence.termsHash, String(ACCEPT_BEFORE * 3))).tombstoned, true);
  const after = await decrypted(s);
  assert.deepEqual(after.json.entries.map(entry => entry.termsHash), [evidence.termsHash]);
  assert.equal(after.json.retiredThroughSeconds, String(ACCEPT_BEFORE));
  const refused = await s.ledger.admitVerified(evidence, scope(KEY_A, { now: ACCEPT_BEFORE * 3 }));
  assert.equal(refused.ok, false); assert.ok(['CONFLICT', 'EXPIRED'].includes(refused.error.code));
});
test('only this verifier\'s evidence is admitted, under a scope consistent with it; nothing secret is stored', async t => {
  const s = await setup(t), { evidence } = await statement({ nonce: 9 });
  err(await s.ledger.admitVerified({ ...evidence }, scope(KEY_A)), 'INVALID_INPUT');
  err(await s.ledger.admitVerified(JSON.parse(JSON.stringify(evidence)), scope(KEY_A)), 'INVALID_INPUT');
  err(await s.ledger.admitVerified(evidence, scope(keyOf(4))), 'INVALID_INPUT');
  err(await s.ledger.admitVerified(evidence, scope(KEY_A, { acceptBefore: ACCEPT_BEFORE - 1 })), 'INVALID_INPUT');
  err(await s.ledger.admitVerified(evidence, { ...scope(KEY_A), extra: 1 }), 'INVALID_INPUT');
  err(await s.ledger.admitVerified(evidence, { ...scope(KEY_A), priority: 'yes' }), 'INVALID_INPUT');
  assert.equal(s.store.writes, 1);
  val(await s.ledger.admitVerified(evidence, scope(KEY_A)));
  const { json } = await decrypted(s), text = JSON.stringify(json);
  assert.doesNotMatch(text, /Signature|010203|040506|economicPreparationAllowed|anchor/);
  assert.doesNotMatch(text, /p2p-offramp:v1/, 'advert addresses are stored as digests');
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]), /termsHash|ownMessagingKey/, 'encrypted at rest');
});
test('messaging-key rotation cannot rebind existing terms, and tombstones survive it', async t => {
  const s = await setup(t), { evidence } = await statement({ nonce: 11 });
  val(await s.ledger.admitVerified(evidence, scope(KEY_A)));
  const rotated = keyOf(5), { evidence: rebound } = await statement({ nonce: 11, signer: rotated });
  err(await s.ledger.admitVerified(rebound, scope(rotated)), 'CONFLICT');
  val(await s.ledger.tombstoneScoped(evidence.termsHash, scope(KEY_A)));
  err(await s.ledger.admitVerified(rebound, scope(rotated)), 'CONFLICT');
  assert.equal(val(await s.ledger.status(evidence.termsHash, String(NOW))).tombstoned, true);
});
test('backups: fresh-key restore keeps tombstones; an older backup cannot learn later ones and claims only local history', async t => {
  const s = await setup(t), { evidence } = await statement({ nonce: 12 });
  val(await s.ledger.admitVerified(evidence, scope(KEY_A)));
  const backup = new EncryptedBackupService(s.store, crypto); t.after(() => backup.dispose?.());
  const older = await backup.export(s.session.profileId);
  val(await s.ledger.tombstoneScoped(evidence.termsHash, scope(KEY_A)));
  const latest = await backup.export(s.session.profileId);
  const open = async (bytes, label) => {
    const receipt = await backup.restore(bytes, pass, `${label} restore passphrase`);
    const session = val(await s.vault.unlock(receipt.newProfileId, `${label} restore passphrase`)), ledger = new CandidatePeerReplayLedger(s.vault, session);
    t.after(() => ledger.dispose()); return ledger;
  };
  const fresh = await open(latest, 'latest');
  err(await fresh.admitVerified(evidence, scope(KEY_A)), 'CONFLICT');
  assert.deepEqual({ ...val(await fresh.status(evidence.termsHash, String(NOW), String(ACCEPT_BEFORE))) },
    { tombstoned: true, retired: false, seller: false, buyer: false, freshness: 'local-history' });
  const stale = await open(older, 'older');
  const replayed = val(await stale.admitVerified(evidence, scope(KEY_A)));
  assert.equal(replayed.status, 'duplicate', 'documented limitation: the old backup predates the tombstone');
  assert.equal(replayed.freshness, 'local-history');
  assert.equal(val(await stale.status(evidence.termsHash, String(NOW))).tombstoned, false);
});
