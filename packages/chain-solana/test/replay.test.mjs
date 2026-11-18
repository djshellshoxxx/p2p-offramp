import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { encodeBase64url } from '../../schemas/index.ts';
import {
  MAX_ACCEPTANCE_ENTRIES, MAX_TERMS_HORIZON_SECONDS, MAX_TOMBSTONES, SOLANA_PEER_REPLAY_FORMAT,
  SOLANA_PEER_REPLAY_RECORD_ID, SolanaPeerReplayLedger,
} from '../src/replay.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { boundTrade, KEYS, ledgerContext, NOW, proofFor, WALLETS } from './acceptance-support.mjs';
import { error, ok } from './support.mjs';

const pass = 'synthetic solana peer replay passphrase';
class Store {
  rows = new Map(); writes = 0; beforeWrite; afterCommit;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row, options) {
    options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row)); this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) {
      throw new VaultStorageError('CONFLICT');
    }
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; this.afterCommit?.();
  }
}
async function setup(t) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = ok(await vault.create(pass)), clock = { now: String(NOW), nowSeconds() { return this.now; } };
  const open = current => {
    const ledger = new SolanaPeerReplayLedger(vault, current, clock);
    t.after(() => ledger.dispose());
    return ledger;
  };
  t.after(() => vault.dispose());
  return { store, vault, session, clock, ledger: open(session), open };
}
const admit = (ledger, trade, role = 'seller', draft = {}, context = {}) =>
  ledger.admit(trade, ledgerContext(role, context), proofFor(trade, role, draft));
const status = async (ledger, trade) => ({ ...ok(await ledger.status(trade)) });
const record = payload => ({ id: SOLANA_PEER_REPLAY_RECORD_ID, kind: 'preference', schemaVersion: 1,
  payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(payload))) });
const trades = Array.from({ length: 10 }, (_, index) => boundTrade(`replay-${index}`));

test('record id and bounds are fixed implementation constants', () => {
  assert.match(SOLANA_PEER_REPLAY_RECORD_ID, /^[0-9a-f]{32}$/);
  assert.equal(SOLANA_PEER_REPLAY_FORMAT, 'p2p-offramp/solana/peer-replay/v1');
  assert.deepEqual([MAX_ACCEPTANCE_ENTRIES, MAX_TOMBSTONES, MAX_TERMS_HORIZON_SECONDS], [64, 64, 604_800]);
});

test('duplicate is an idempotent no-write; the record holds statements, never signatures', async t => {
  const s = await setup(t), trade = trades[0], proof = proofFor(trade, 'seller');
  assert.equal(ok(await s.ledger.admit(trade, ledgerContext('seller'), proof)).status, 'recorded');
  const writes = s.store.writes;
  assert.equal(ok(await s.ledger.admit(trade, ledgerContext('seller'), proof)).status, 'duplicate');
  assert.equal(s.store.writes, writes);
  const stored = Buffer.from(ok(await s.vault.read(s.session.sessionId, SOLANA_PEER_REPLAY_RECORD_ID)).payload,
    'base64url').toString();
  assert.match(stored, new RegExp(KEYS.seller));
  for (const signature of [proof.termsSignature, proof.acceptanceSignature]) {
    assert.ok(!stored.includes(Buffer.from(signature).toString('hex')));
    assert.ok(!stored.includes(Buffer.from(signature).toString('base64')));
  }
  assert.deepEqual(await status(s.ledger, trade), { tombstoned: false, seller: true, buyer: false });
});

/** Entries in the ledger's own record format, as the ledger would have written them for other trades. */
function seeded(acceptanceCount, tombstoneCount, acceptBefore = String(NOW + 600)) {
  const party = role => ({ wallet: WALLETS[role], ownMessagingKey: KEYS[role],
    counterpartyMessagingKey: KEYS[role === 'seller' ? 'buyer' : 'seller'], notAfterSeconds: String(NOW + 300) });
  const hash = (prefix, index) => prefix + index.toString(16).padStart(63, '0');
  return {
    acceptances: Array.from({ length: acceptanceCount }, (_, index) => ({ termsHash: hash('0', index),
      acceptBeforeSeconds: acceptBefore, networkId: 'solana-localnet', deploymentId: 'escrow-v1',
      genesisHash: trades[0].terms.genesisHash, programId: trades[0].terms.programId, seller: party('seller'),
      buyer: null })),
    tombstones: Array.from({ length: tombstoneCount }, (_, index) => ({ termsHash: hash('1', index),
      acceptBeforeSeconds: acceptBefore })),
  };
}

test('A-L3 regression: acceptances fill only their own space, tombstones keep theirs, expiry frees both', async t => {
  const s = await setup(t);
  ok(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: record({ format: SOLANA_PEER_REPLAY_FORMAT,
    watermarkSeconds: '0', ...seeded(MAX_ACCEPTANCE_ENTRIES - 2, MAX_TOMBSTONES - 4) }) }]));
  for (const trade of trades.slice(0, 2)) assert.equal(ok(await admit(s.ledger, trade)).status, 'recorded');
  error(await admit(s.ledger, trades[2]), 'LIMIT_EXCEEDED');
  // Cancelling the refused offer still works: a flood of acceptances cannot use tombstone space.
  ok(await s.ledger.tombstone(trades[2]));
  error(await admit(s.ledger, trades[2]), 'CONFLICT');
  // Tombstoning a recorded trade moves it out of the acceptance space.
  ok(await s.ledger.tombstone(trades[0]));
  assert.equal(ok(await admit(s.ledger, trades[3])).status, 'recorded');
  for (const trade of trades.slice(4, 6)) ok(await s.ledger.tombstone(trade));
  error(await s.ledger.tombstone(trades[6]), 'LIMIT_EXCEEDED');
  error(await admit(s.ledger, trades[6]), 'LIMIT_EXCEEDED');
  // Once the terms deadline passes every slot frees: nothing fills the ledger permanently.
  s.clock.now = String(NOW + 600);
  const later = boundTrade('replay-later', { acceptBeforeSeconds: String(NOW + 1200),
    escrowExpirySeconds: String(NOW + 4200) });
  const proof = proofFor(later, 'seller', { notAfterSeconds: String(NOW + 900) });
  assert.equal(ok(await s.ledger.admit(later, ledgerContext('seller', { envelopeExpiresAtSeconds: String(NOW + 4000) }),
    proof)).status, 'recorded');
  ok(await s.ledger.tombstone(boundTrade('replay-later-2', { acceptBeforeSeconds: String(NOW + 1200),
    escrowExpirySeconds: String(NOW + 4200) })));
  const stored = JSON.parse(Buffer.from(ok(await s.vault.read(s.session.sessionId, SOLANA_PEER_REPLAY_RECORD_ID))
    .payload, 'base64url').toString());
  assert.deepEqual([stored.acceptances.length, stored.tombstones.length, stored.watermarkSeconds],
    [1, 1, String(NOW + 600)]);
});

test('eviction watermark survives reopen: a rolled-back clock cannot re-admit evicted terms', async t => {
  const s = await setup(t), trade = trades[1];
  ok(await admit(s.ledger, trade));
  s.clock.now = String(NOW + 600);
  assert.deepEqual(await status(s.ledger, trade), { tombstoned: false, seller: false, buyer: false });
  s.ledger.dispose(); s.vault.lockAll();
  const reopened = s.open(ok(await s.vault.unlock(s.session.profileId, pass)));
  s.clock.now = String(NOW);
  error(await admit(reopened, trade), 'EXPIRED');
  ok(await reopened.tombstone(trade), 'already unverifiable at the watermark: nothing to record');
});

test('terms beyond the horizon are refused for admission and tombstone', async t => {
  const s = await setup(t), accept = NOW + MAX_TERMS_HORIZON_SECONDS + 1;
  const far = boundTrade('far', { acceptBeforeSeconds: String(accept), escrowExpirySeconds: String(accept + 3000) });
  error(await admit(s.ledger, far), 'LIMIT_EXCEEDED');
  error(await s.ledger.tombstone(far), 'LIMIT_EXCEEDED');
  s.clock.now = String(NOW + 1);
  ok(await s.ledger.tombstone(far));
});

test('tombstone blocks a re-offer in a new session with new messaging keys, and survives backup restore', async t => {
  const s = await setup(t), trade = trades[2];
  ok(await admit(s.ledger, trade));
  ok(await s.ledger.tombstone(trade));
  const writes = s.store.writes;
  ok(await s.ledger.tombstone(trade));
  assert.equal(s.store.writes, writes, 'a repeated tombstone writes nothing');
  error(await admit(s.ledger, trade, 'buyer', { counterpartyMessagingKey: KEYS.other },
    { counterpartyMessagingKey: KEYS.other }), 'CONFLICT');
  const backup = new EncryptedBackupService(s.store, crypto), exported = await backup.export(s.session.profileId);
  const receipt = await backup.restore(exported, pass, 'fresh solana replay recovery passphrase');
  const restored = s.open(ok(await s.vault.unlock(receipt.newProfileId, 'fresh solana replay recovery passphrase')));
  error(await admit(restored, trade), 'CONFLICT');
  assert.deepEqual(await status(restored, trade), { tombstoned: true, seller: false, buyer: false });
});

test('second role must name reciprocal keys; a changed statement for a recorded role conflicts', async t => {
  const s = await setup(t), trade = trades[3];
  ok(await admit(s.ledger, trade));
  error(await admit(s.ledger, trade, 'seller', { notAfterSeconds: String(NOW + 301) }), 'CONFLICT');
  error(await admit(s.ledger, trade, 'buyer', { counterpartyMessagingKey: KEYS.other },
    { counterpartyMessagingKey: KEYS.other }), 'CONFLICT');
  assert.equal(ok(await admit(s.ledger, trade, 'buyer')).status, 'recorded');
  assert.deepEqual(await status(s.ledger, trade), { tombstoned: false, seller: true, buyer: true });
});

test('a stale session cannot bypass a tombstone; concurrent first admissions have one winner', async t => {
  const s = await setup(t), trade = trades[4];
  ok(await admit(s.ledger, trade));
  const second = s.open(ok(await s.vault.unlock(s.session.profileId, pass)));
  ok(await s.ledger.tombstone(trade));
  const writes = s.store.writes;
  error(await admit(second, trade), 'CONFLICT');
  assert.equal(s.store.writes, writes);
  const fresh = trades[5], third = s.open(ok(await s.vault.unlock(s.session.profileId, pass)));
  const fourth = s.open(ok(await s.vault.unlock(s.session.profileId, pass)));
  const results = await Promise.all([admit(third, fresh),
    admit(fourth, fresh, 'seller', { notAfterSeconds: String(NOW + 301) })]);
  assert.equal(results.filter(result => result.ok).length, 1);
  error(results.find(result => !result.ok), 'CONFLICT');
});

test('invalid input, broken clocks, overlap and lock refuse without writing', async t => {
  const s = await setup(t), trade = trades[6], proof = proofFor(trade, 'seller');
  let calls = 0;
  const hostile = { ...proof };
  Object.defineProperty(hostile, 'statement', { enumerable: true, get() { calls++; return proof.statement; } });
  error(await s.ledger.admit(trade, ledgerContext('seller'), hostile), 'INVALID_INPUT');
  error(await s.ledger.admit({ ...trade }, ledgerContext('seller'), proof), 'INVALID_INPUT');
  error(await s.ledger.admit(trade, { ...ledgerContext('seller'), nowSeconds: String(NOW + 9999) }, proof),
    'INVALID_INPUT');
  error(await s.ledger.tombstone({ ...trade }), 'INVALID_INPUT');
  const bad = new Uint8Array(proof.acceptanceSignature); bad[0] ^= 1;
  error(await s.ledger.admit(trade, ledgerContext('seller'), { ...proof, acceptanceSignature: bad }), 'UNAUTHORIZED');
  s.clock.now = 'soon';
  error(await s.ledger.admit(trade, ledgerContext('seller'), proof), 'UNAVAILABLE');
  s.clock.now = String(NOW);
  const [first, overlapping] = await Promise.all([s.ledger.status(trade), s.ledger.status(trade)]);
  assert.equal(first.ok, true); error(overlapping, 'CONFLICT');
  assert.equal(calls, 0); assert.equal(s.store.writes, 1);
  s.store.beforeWrite = () => s.vault.lock(s.session.sessionId);
  error(await s.ledger.admit(trade, ledgerContext('seller'), proof), 'LOCKED');
  assert.equal(s.store.writes, 1);
});

test('foreign, corrupted or future records at the ledger id are refused and never overwritten', async t => {
  const s = await setup(t), trade = trades[7];
  const valid = { format: SOLANA_PEER_REPLAY_FORMAT, watermarkSeconds: '0', acceptances: [], tombstones: [] };
  const tomb = { termsHash: trade.termsHash, acceptBeforeSeconds: String(NOW + 600) };
  const cases = [
    [{ ...record(valid), kind: 'trade' }, 'INTEGRITY_FAILURE'],
    [{ ...record(valid), schemaVersion: 2 }, 'UNSUPPORTED_VERSION'],
    [record({ ...valid, format: 'p2p-offramp/solana/peer-replay/v2' }), 'UNSUPPORTED_VERSION'],
    [record({ ...valid, tombstones: [tomb, tomb] }), 'INTEGRITY_FAILURE'],
    [record({ ...valid, watermarkSeconds: String(NOW + 600), tombstones: [tomb] }), 'INTEGRITY_FAILURE'],
    [record({ ...valid, extra: true }), 'INTEGRITY_FAILURE'],
    [record({ ...valid, acceptances: [{ ...tomb, networkId: 'solana-localnet', deploymentId: 'escrow-v1',
      genesisHash: trade.terms.genesisHash, programId: trade.terms.programId, seller: null, buyer: null }] }),
    'INTEGRITY_FAILURE'],
  ];
  let revision = 0;
  for (const [bad, expected] of cases) {
    ok(await s.vault.commit(s.session.sessionId, revision++, [{ op: 'put', record: bad }]));
    const writes = s.store.writes;
    error(await admit(s.ledger, trade), expected);
    error(await s.ledger.tombstone(trade), expected);
    assert.equal(s.store.writes, writes);
    assert.equal(ok(await s.vault.read(s.session.sessionId, SOLANA_PEER_REPLAY_RECORD_ID)).payload, bad.payload);
  }
});

test('the worst-case record (longest ids and numbers, both roles, all tombstones) fits the record bound', async t => {
  const s = await setup(t), max = '18446744073709551615', watermark = 18446744073709000000n;
  const party = role => ({ wallet: WALLETS[role], ownMessagingKey: KEYS[role],
    counterpartyMessagingKey: KEYS[role === 'seller' ? 'buyer' : 'seller'], notAfterSeconds: max });
  const hash = (prefix, index) => prefix + index.toString(16).padStart(63, '0');
  const acceptances = Array.from({ length: MAX_ACCEPTANCE_ENTRIES }, (_, index) => ({ termsHash: hash('1', index),
    acceptBeforeSeconds: max, networkId: 'n'.repeat(64), deploymentId: 'd'.repeat(64),
    genesisHash: trades[0].terms.genesisHash, programId: trades[0].terms.programId,
    seller: party('seller'), buyer: party('buyer') }));
  const tombstones = Array.from({ length: MAX_TOMBSTONES - 1 }, (_, index) => ({ termsHash: hash('2', index),
    acceptBeforeSeconds: max }));
  ok(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: record({ format: SOLANA_PEER_REPLAY_FORMAT,
    watermarkSeconds: watermark.toString(), acceptances, tombstones }) }]));
  s.clock.now = watermark.toString();
  const last = boundTrade('worst-case', { acceptBeforeSeconds: (watermark + 100n).toString(),
    escrowExpirySeconds: (watermark + 3100n).toString() });
  ok(await s.ledger.tombstone(last));
  const size = Buffer.from(ok(await s.vault.read(s.session.sessionId, SOLANA_PEER_REPLAY_RECORD_ID)).payload,
    'base64url').length;
  assert.ok(size > 65_536 && size <= 131_072, String(size));
  assert.deepEqual(await status(s.ledger, last), { tombstoned: true, seller: false, buyer: false });
  error(await s.ledger.tombstone(boundTrade('one-too-many', { acceptBeforeSeconds: (watermark + 100n).toString(),
    escrowExpirySeconds: (watermark + 3100n).toString() })), 'LIMIT_EXCEEDED');
});
