import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { decodeBase64url, encodeBase64url, MAX_PAYLOAD_BYTES } from '../../schemas/index.ts';
import { SolanaVaultJournal, solanaJournalRecordId, SOLANA_VAULT_JOURNAL_FORMAT,
  SOLANA_VAULT_JOURNAL_FORMAT_V2 } from '../src/vaultjournal.ts';
import { chooseRetirementCandidate, identityForRecord, loadIntents, migrateIntents,
  reservationRef, reserveIntentV2, storeIntentV2 } from '../src/journal.ts';
import { identityFromEntry, parseReservationEntries } from '../src/reservation.ts';
import { buildFundNative, buildRelease, buildRefund, buildPayout } from '../src/instructions.ts';
import { compileLegacyMessage, encodeBase64 } from '../src/message.ts';
import { parseSolanaIntent, verifyIntentForTrade } from '../src/intent.ts';
import { connected, setupClient } from './lifecycle-support.mjs';
import { error, ok } from './support.mjs';

const PASS = 'synthetic v2 journal migration passphrase';
const RESTORED_PASS = 'synthetic v2 restored profile passphrase';
const id = n => encodeBase64url(new Uint8Array(32).fill(n));
const byId = (a, b) => a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0;
class Store {
  rows = new Map(); writes = 0; beforeWrite; afterCommit;
  subscribeInvalidation() { return () => {}; }
  async get(key) { return structuredClone(this.rows.get(key)); }
  async add(row, options) {
    options?.assertCurrent?.();
    if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(row.profileId, structuredClone(row)); this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(expected, next); options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; this.afterCommit?.(expected, next);
  }
}
async function setup(t) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = ok(await vault.create(PASS));
  const open = current => { const journal = new SolanaVaultJournal(vault, current); t.after(() => journal.dispose()); return journal; };
  t.after(() => vault.dispose());
  return { store, vault, session, open, journal: open(session) };
}
let fixturePromise;
async function fixture() {
  fixturePromise ??= (async () => {
    const rows = [], env = setupClient('native', { journal: { hooks: { after: r => rows.push(structuredClone(r)) } } });
    try { ok(await env.client.release(env.trade, await connected(env, 'seller'))); }
    finally { env.client.dispose(); }
    return { binding: env.binding, trade: env.trade, rows };
  })();
  return fixturePromise;
}
const local = (s, record, n, time = 100) => ({ ...structuredClone(record), intentId: id(n),
  originProfileId: s.session.profileId, createdAt: time, updatedAt: time });
const cancelled = (s, record, n, time = 100) => ({ ...local(s, record, n, time), state: 'cancelled' });
const wrapped = (binding, payload, schemaVersion) => ({ id: solanaJournalRecordId(binding), kind: 'journal', schemaVersion,
  payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(payload))) });
async function seedV1(s, binding, records, revision = records.length) {
  const payload = { format: SOLANA_VAULT_JOURNAL_FORMAT, binding, revision, records: [...records].sort(byId) };
  ok(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: wrapped(binding, payload, 1) }]));
}
const raw = (s, binding) => s.vault.read(s.session.sessionId, solanaJournalRecordId(binding)).then(ok);
const decode = record => JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, MAX_PAYLOAD_BYTES)));
async function restore(t, s) {
  const backup = new EncryptedBackupService(s.store, crypto);
  const receipt = await backup.restore(await backup.export(s.session.profileId), PASS, RESTORED_PASS);
  const session = ok(await s.vault.unlock(receipt.newProfileId, RESTORED_PASS));
  const journal = s.open(session); t.after(() => journal.dispose());
  return { ...s, session, journal };
}

test('explicit empty migration creates one stable v2 aggregate and reservation updates require full identity', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  assert.deepEqual(ok(await s.journal.read(binding)), { revision: 0, records: [] });
  const migrated = await migrateIntents(s.journal, trade, 0);
  assert.equal(migrated.version, 2); assert.equal(migrated.revision, 1); assert.equal(migrated.records.length, 0);
  const before = await raw(s, binding);
  assert.equal(before.id, solanaJournalRecordId(binding)); assert.equal(before.schemaVersion, 2);
  assert.equal(decode(before).format, SOLANA_VAULT_JOURNAL_FORMAT_V2);
  const prepared = local(s, rows[0], 1);
  error(await s.journal.write(binding, 1, prepared), 'UNSUPPORTED_VERSION');
  error(await s.journal.migrate(binding, 1), 'CONFLICT');
  assert.deepEqual(await raw(s, binding), before);
  const stored = await reserveIntentV2(s.journal, trade, 1, prepared, null, null);
  assert.equal(stored.identity.generation, 2); assert.equal(stored.revision, 2);
  const loaded = await loadIntents(s.journal, trade);
  assert.deepEqual(identityForRecord(loaded, loaded.records[0]), stored.identity);
  assert.throws(() => identityForRecord(loaded, structuredClone(loaded.records[0])), e => e.code === 'INTEGRITY_FAILURE');
  const next = { ...stored.record, state: 'cancelled' };
  error(await s.journal.update(binding, 2, { ...stored.identity, generation: 1 }, next), 'CONFLICT');
  error(await s.journal.update(binding, 2, { ...stored.identity, originProfileId: 'b'.repeat(32) }, next), 'CONFLICT');
  assert.equal(await storeIntentV2(s.journal, trade, 2, stored.identity, next), 3);
  error(await s.journal.update(binding, 3, stored.identity, stored.record), 'CONFLICT');
});

test('v1 migration preserves every field and resolves a predecessor whose registration generation is greater', async t => {
  const s = await setup(t), { binding, rows } = await fixture();
  const ids = [id(3), id(10)].sort(), predecessor = { ...local(s, rows[0], 10), intentId: ids[1], state: 'dropped' };
  const successor = { ...local(s, rows[0], 3), intentId: ids[0], state: 'cancelled', replacementOf: ids[1] };
  await seedV1(s, binding, [predecessor, successor], 8);
  const before = ok(await s.journal.read(binding)), writes = s.store.writes;
  const after = ok(await s.journal.migrate(binding, 8));
  assert.equal(s.store.writes, writes + 1); assert.equal(after.revision, 11);
  assert.deepEqual(after.entries.map(e => e.intent), before.records);
  assert.deepEqual(after.entries.map(e => e.generation), [9, 10]);
  assert.deepEqual(after.entries[0].replaces, { originProfileId: predecessor.originProfileId,
    intentId: predecessor.intentId, generation: 10 });
  assert.equal(chooseRetirementCandidate({ version: 2, reservations: after.entries }, s.session.profileId), null);
});

test('pressure retirement preserves heads and rejects stale identities after deterministic repeated-ID allocation', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  const records = Array.from({ length: 32 }, (_, n) => cancelled(s, rows[0], n));
  await seedV1(s, binding, records);
  let loaded = await migrateIntents(s.journal, trade, 32);
  const old = loaded.reservations.find(e => e.intent.intentId === chooseRetirementCandidate(loaded, s.session.profileId).intentId);
  const head = loaded.reservations.at(-1), before = await raw(s, binding), prepared = local(s, rows[0], 200);
  error(await s.journal.reserve(binding, loaded.revision, prepared, null, reservationRef(identityFromEntry(head))), 'CONFLICT');
  error(await s.journal.reserve(binding, loaded.revision, { ...prepared, intentId: old.intent.intentId }, null,
    reservationRef(identityFromEntry(old))), 'CONFLICT');
  assert.deepEqual(await raw(s, binding), before);
  let stored = await reserveIntentV2(s.journal, trade, loaded.revision, prepared, null,
    reservationRef(identityFromEntry(old)));
  await storeIntentV2(s.journal, trade, stored.revision, stored.identity, { ...stored.record, state: 'cancelled' });
  loaded = await loadIntents(s.journal, trade);
  assert.equal(loaded.records.length, 32);
  assert.deepEqual(loaded.records.find(r => r.intentId === head.intent.intentId), head.intent);
  for (let cycle = 0; cycle < 3; cycle++) {
    const target = chooseRetirementCandidate(loaded, s.session.profileId);
    const reused = { ...prepared, intentId: cycle % 2 === 0 ? old.intent.intentId : id(200 + cycle) };
    stored = await reserveIntentV2(s.journal, trade, loaded.revision, reused, null, target);
    assert.ok(stored.identity.generation > old.generation);
    const snapshot = await raw(s, binding);
    error(await s.journal.update(binding, stored.revision, identityFromEntry(old),
      { ...stored.record, state: 'cancelled' }), 'CONFLICT');
    assert.deepEqual(await raw(s, binding), snapshot);
    await storeIntentV2(s.journal, trade, stored.revision, stored.identity, { ...stored.record, state: 'cancelled' });
    loaded = await loadIntents(s.journal, trade);
    assert.equal(loaded.records.length, 32);
  }
});

test('mixed clients and stale snapshots cannot overwrite migration or reserve twice', async t => {
  const s = await setup(t), { binding, rows } = await fixture();
  const older = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  assert.equal(ok(await older.read(binding)).revision, 0);
  ok(await s.journal.migrate(binding, 0));
  error(await older.write(binding, 0, local(s, rows[0], 1)), 'CONFLICT');
  const current = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  const other = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  const results = await Promise.all([current.reserve(binding, 1, local(s, rows[0], 1), null, null),
    other.reserve(binding, 1, local(s, rows[0], 2), null, null)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  error(results.find(result => !result.ok), 'CONFLICT');
});

test('native v2 backup restore preserves the embedded high-water mark and forbids foreign retirement', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  await seedV1(s, binding, Array.from({ length: 32 }, (_, n) => cancelled(s, rows[0], n)), 100);
  const before = await migrateIntents(s.journal, trade, 100), bytes = await raw(s, binding);
  const destination = await restore(t, s), after = await loadIntents(destination.journal, trade);
  assert.equal(destination.session.revision, 0); assert.deepEqual(await raw(destination, binding), bytes);
  assert.deepEqual(after, before); assert.equal(chooseRetirementCandidate(after, destination.session.profileId), null);
  const target = reservationRef(identityFromEntry(after.reservations[0]));
  error(await destination.journal.reserve(binding, after.revision, local(destination, rows[0], 200), null, target), 'CONFLICT');
  assert.deepEqual(await raw(destination, binding), bytes);
});

test('a complete v2 payload accepts the public byte boundary and refuses one extra byte without mutation', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  await seedV1(s, binding, Array.from({ length: 32 }, (_, n) => cancelled(s, rows[0], n)));
  const before = await migrateIntents(s.journal, trade, 32), original = await raw(s, binding);
  const json = JSON.stringify(decode(original));
  // Canonical 32-entry payloads cannot reach this limit: even independently maximal permitted fields
  // total at most 117,443 bytes. JSON whitespace exercises the public byte bound without inventing fields.
  const atBoundary = { ...original, payload: encodeBase64url(new TextEncoder().encode(json.padEnd(MAX_PAYLOAD_BYTES))) };
  const outerRevision = s.store.rows.get(s.session.profileId).revision;
  assert.equal(decodeBase64url(atBoundary.payload, 1, MAX_PAYLOAD_BYTES).length, MAX_PAYLOAD_BYTES);
  const committed = ok(await s.vault.commit(s.session.sessionId, outerRevision, [{ op: 'put', record: atBoundary }]));
  assert.deepEqual(await loadIntents(s.journal, trade), before);
  assert.deepEqual(await raw(s, binding), atBoundary);
  const writes = s.store.writes;
  const oversized = { ...original, payload: encodeBase64url(new TextEncoder().encode(json.padEnd(MAX_PAYLOAD_BYTES + 1))) };
  error(await s.vault.commit(s.session.sessionId, committed, [{ op: 'put', record: oversized }]), 'LIMIT_EXCEEDED');
  assert.equal(s.store.writes, writes);
  assert.deepEqual(await raw(s, binding), atBoundary);
  assert.deepEqual(await loadIntents(s.journal, trade), before);
});

test('repeated fresh-key restore of an older v2 backup preserves history without transferring source update authority', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  await seedV1(s, binding, Array.from({ length: 31 }, (_, n) => cancelled(s, rows[0], n)), 100);
  const migrated = await migrateIntents(s.journal, trade, 100);
  const captured = await reserveIntentV2(s.journal, trade, migrated.revision, local(s, rows[0], 200), null, null);
  const oldSnapshot = await loadIntents(s.journal, trade), oldPayload = await raw(s, binding);
  const backup = new EncryptedBackupService(s.store, crypto), oldBackup = await backup.export(s.session.profileId);
  // This identity still belongs to its source profile. Advancing that profile does not alter the old export.
  await storeIntentV2(s.journal, trade, captured.revision, captured.identity, { ...captured.record, state: 'cancelled' });
  const current = await loadIntents(s.journal, trade);
  const later = await reserveIntentV2(s.journal, trade, current.revision, local(s, rows[0], 201), null,
    chooseRetirementCandidate(current, s.session.profileId));
  assert.ok(later.identity.generation > oldSnapshot.revision);
  const sourcePayload = await raw(s, binding);
  const profiles = new Set([s.session.profileId]), keys = new Set([s.store.rows.get(s.session.profileId).keyId]);
  for (let attempt = 0; attempt < 2; attempt++) {
    const receipt = await backup.restore(oldBackup, PASS, RESTORED_PASS);
    assert.equal(receipt.sourceProfileId, s.session.profileId);
    assert.equal(receipt.revision, 0);
    assert.equal(profiles.has(receipt.newProfileId), false); profiles.add(receipt.newProfileId);
    assert.equal(keys.has(receipt.newKeyId), false); keys.add(receipt.newKeyId);
    const session = ok(await s.vault.unlock(receipt.newProfileId, RESTORED_PASS));
    const destination = { ...s, session, journal: s.open(session) };
    const restored = await loadIntents(destination.journal, trade);
    assert.equal(session.revision, 0);
    assert.deepEqual(await raw(destination, binding), oldPayload);
    assert.deepEqual(restored, oldSnapshot);
    assert.equal(restored.records.every(record => record.originProfileId === s.session.profileId), true);
    assert.equal(chooseRetirementCandidate(restored, session.profileId), null);
    const writes = s.store.writes;
    error(await destination.journal.update(binding, captured.revision, captured.identity,
      { ...captured.record, state: 'cancelled' }), 'CONFLICT');
    error(await destination.journal.update(binding, captured.revision, captured.identity,
      { ...captured.record, state: 'signed', signature: rows[1].signature }), 'CONFLICT');
    assert.equal(s.store.writes, writes);
    assert.deepEqual(await raw(destination, binding), oldPayload);
    assert.deepEqual(await raw(s, binding), sourcePayload);
  }
});

test('a full signed-cancellation history is protected even under retirement pressure', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  const history = Array.from({ length: 32 }, (_, n) => cancelled(s, rows[1], n));
  await seedV1(s, binding, history, 90);
  const loaded = await migrateIntents(s.journal, trade, 90), before = await raw(s, binding);
  assert.equal(chooseRetirementCandidate(loaded, s.session.profileId), null);
  const prepared = local(s, rows[0], 200), captured = identityForRecord(loaded, loaded.records[0]);
  error(await s.journal.reserve(binding, loaded.revision, prepared, null, null), 'LIMIT_EXCEEDED');
  error(await s.journal.reserve(binding, loaded.revision, prepared, null, reservationRef(captured)), 'CONFLICT');
  assert.deepEqual(await raw(s, binding), before);
});

test('v2 replacements require the complete predecessor identity and preserve one-successor admission', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  const dropped = { ...local(s, rows[0], 1), state: 'dropped' };
  await seedV1(s, binding, [dropped], 4);
  const loaded = await migrateIntents(s.journal, trade, 4), original = identityForRecord(loaded, loaded.records[0]);
  const next = { ...local(s, rows[0], 2), replacementOf: dropped.intentId }, before = await raw(s, binding);
  error(await s.journal.reserve(binding, loaded.revision, next, { ...reservationRef(original), generation: 1 }, null), 'CONFLICT');
  error(await s.journal.reserve(binding, loaded.revision, next, null, null), 'CONFLICT');
  assert.deepEqual(await raw(s, binding), before);
  const stored = await reserveIntentV2(s.journal, trade, loaded.revision, next, reservationRef(original), null);
  await storeIntentV2(s.journal, trade, stored.revision, stored.identity, { ...stored.record, state: 'cancelled' });
  const current = await loadIntents(s.journal, trade), snapshot = await raw(s, binding);
  assert.deepEqual(current.reservations.find(e => e.intent.intentId === next.intentId).replaces, reservationRef(original));
  error(await s.journal.reserve(binding, current.revision, { ...next, intentId: id(3) }, reservationRef(original), null), 'CONFLICT');
  assert.deepEqual(await raw(s, binding), snapshot);
});

test('migration refuses unresolved legacy references without losing any v1 history', async t => {
  const s = await setup(t), { binding, rows } = await fixture();
  const record = { ...cancelled(s, rows[0], 1), replacementOf: id(9) };
  await seedV1(s, binding, [record]);
  const before = await raw(s, binding), writes = s.store.writes;
  error(await s.journal.migrate(binding, 1), 'INTEGRITY_FAILURE');
  assert.deepEqual(await raw(s, binding), before); assert.equal(s.store.writes, writes);
});

test('allocation and migration exhaustion refuse before mutation and never recycle a generation', async t => {
  const { binding, rows } = await fixture();
  for (const r of [Number.MAX_SAFE_INTEGER - 2, Number.MAX_SAFE_INTEGER - 1]) await t.test(String(r), async t => {
    const s = await setup(t), record = cancelled(s, rows[0], 1);
    await seedV1(s, binding, [record], r);
    if (r === Number.MAX_SAFE_INTEGER - 1) {
      const before = await raw(s, binding);
      error(await s.journal.migrate(binding, r), 'LIMIT_EXCEEDED');
      assert.deepEqual(await raw(s, binding), before);
    } else {
      const migrated = ok(await s.journal.migrate(binding, r));
      assert.equal(migrated.revision, Number.MAX_SAFE_INTEGER);
      assert.equal(migrated.entries[0].generation, Number.MAX_SAFE_INTEGER - 1);
      const before = await raw(s, binding);
      error(await s.journal.reserve(binding, migrated.revision, local(s, rows[0], 2), null, null), 'LIMIT_EXCEEDED');
      assert.deepEqual(await raw(s, binding), before);
    }
  });
});

test('an uncertain migration response preserves committed v2 and permits no automatic reallocation', async t => {
  const s = await setup(t), { binding, trade } = await fixture();
  s.store.afterCommit = () => { throw new VaultStorageError('STORAGE_UNAVAILABLE'); };
  await assert.rejects(migrateIntents(s.journal, trade, 0), e => e.name === 'UncertainWrite');
  s.store.afterCommit = undefined;
  const reopened = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  const durable = await loadIntents(reopened, trade);
  assert.equal(durable.version, 2); assert.equal(durable.revision, 1); assert.equal(durable.records.length, 0);
  const writes = s.store.writes;
  error(await reopened.migrate(binding, 1), 'CONFLICT');
  assert.equal(s.store.writes, writes);
});

test('v2 entries reject malformed generations, duplicate identity, extra keys and inconsistent reference graphs', async t => {
  const s = await setup(t), { binding, rows } = await fixture();
  const entries = [1, 2].map(n => ({ generation: n, intent: cancelled(s, rows[0], n), replaces: null }));
  entries.sort((a, b) => byId(a.intent, b.intent));
  assert.equal(parseReservationEntries(entries, binding, 3).length, 2);
  const cases = [
    [...entries, ...entries],
    entries.map((entry, i) => i ? entry : { ...entry, generation: 0 }),
    entries.map((entry, i) => i ? entry : { ...entry, generation: 4 }),
    entries.map(entry => ({ ...entry, generation: 1 })),
    entries.map((entry, i) => i ? entry : { ...entry, extra: true }),
    entries.map((entry, i) => i ? entry : { ...entry, replaces: { originProfileId: s.session.profileId,
      intentId: entries[1].intent.intentId, generation: entries[1].generation } }),
    Array.from({ length: 33 }, () => entries[0]),
  ];
  for (const candidate of cases) assert.throws(() => parseReservationEntries(candidate, binding, 3));
  assert.throws(() => parseReservationEntries([], binding, 3));
});

test('all four action heads retain the original timestamp and intent-ID tie order across later reservations', async t => {
  const s = await setup(t), { binding, trade, rows } = await fixture();
  const instructions = { fund: ok(buildFundNative(trade)), release: ok(buildRelease(trade)),
    refund: ok(buildRefund(trade)), payout: ok(buildPayout(trade, 'released')) };
  const bases = Object.fromEntries(Object.entries(instructions).map(([action, instruction]) => {
    const expectedEscrowState = action === 'fund' ? 'absent' : action === 'payout' ? 'released' : 'funded';
    const record = parseSolanaIntent({ ...rows[0], action, expectedEscrowState, role: 'seller', feePayer: trade.terms.seller,
      message: encodeBase64(compileLegacyMessage(trade.terms.seller, [instruction], rows[0].blockhash)) });
    verifyIntentForTrade(record, trade); return [action, record];
  }));
  const records = Object.values(bases).flatMap((record, action) =>
    Array.from({ length: 8 }, (_, index) => cancelled(s, record, action * 8 + index)));
  await seedV1(s, binding, records, 50);
  let loaded = await migrateIntents(s.journal, trade, 50);
  const heads = Object.keys(bases).map(action => loaded.reservations.filter(e => e.intent.action === action).at(-1));
  const before = await raw(s, binding), prepared = local(s, bases.release, 200, 50);
  for (const head of heads) error(await s.journal.reserve(binding, loaded.revision, prepared, null,
    reservationRef(identityFromEntry(head))), 'CONFLICT');
  assert.deepEqual(await raw(s, binding), before);
  const stored = await reserveIntentV2(s.journal, trade, loaded.revision, prepared, null,
    chooseRetirementCandidate(loaded, s.session.profileId));
  await storeIntentV2(s.journal, trade, stored.revision, stored.identity, { ...stored.record, state: 'cancelled' });
  loaded = await loadIntents(s.journal, trade);
  for (const head of heads) {
    const current = loaded.records.filter(r => r.action === head.intent.action)
      .sort((a, b) => a.createdAt - b.createdAt || byId(a, b)).at(-1);
    assert.deepEqual(current, head.intent);
  }
});
