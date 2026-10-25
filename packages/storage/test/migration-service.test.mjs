import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { EncryptedVaultService, VaultStorageError } from '../src/vault-service.ts';
import { MigrationRegistry, RecordMigrationService, MAX_IN_PLACE_CHANGES } from '../src/migration-service.ts';
const clone = v => structuredClone(v);
const pass = 'migration test passphrase';
const id = n => n.toString(16).padStart(32, '0');
const b64 = text => Buffer.from(text).toString('base64url');
const text = payload => Buffer.from(payload, 'base64url').toString();
class Store {
  rows = new Map(); listeners = new Set(); writes = 0;
  async get(p) { return clone(this.rows.get(p)); }
  async add(e) { this.rows.set(e.profileId, clone(e)); this.writes++; }
  async compareAndSwap(expected, next) {
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  subscribeInvalidation(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
}
const all = version => ['identity', 'preference', 'trade', 'chat', 'journal'].map(kind => ({ kind, version, validate: () => true }));
// Fixture: trade v1 payload "a" -> v2 "a|v2" -> v3 "a|v2|v3"; schemas require the exact suffix.
const tradeSchema = v => ({ kind: 'trade', version: v, validate: p => { const s = Buffer.from(p).toString(); return v === 1 ? !s.includes('|') && !s.includes('bad') : s.endsWith(`|v${v}`); } });
const step = (from, extra = {}) => ({ kind: 'trade', fromVersion: from, toVersion: from + 1, migrate: p => Buffer.from(`${Buffer.from(p)}|v${from + 1}`), ...extra });
const current = (trade = 3) => ({ identity: 1, preference: 1, trade, chat: 1, journal: 1 });
const registry = (migrations = [step(1), step(2)]) =>
  new MigrationRegistry(current(), [...all(1).filter(s => s.kind !== 'trade'), tradeSchema(1), tradeSchema(2), tradeSchema(3)], migrations);
const value = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const code = (r, expected) => { assert.equal(r.ok, false, 'expected failure'); assert.equal(r.error.code, expected); assert.doesNotMatch(r.error.message, /private|bad/); };
async function seeded(records) {
  const store = new Store(), vault = new EncryptedVaultService(store, webcrypto, { lifecycle: false });
  let session = value(await vault.create(pass));
  for (let at = 0; at < records.length; at += 256) {
    const chunk = records.slice(at, at + 256).map(record => ({ op: 'put', record }));
    session = { ...session, revision: value(await vault.commit(session.sessionId, session.revision, chunk)) };
  }
  return { store, vault, session };
}
const trade = (n, v = 1, payload = `private-${n}`) => ({ id: id(n), kind: 'trade', schemaVersion: v, payload: b64(payload) });

test('G09 registry rejects non-adjacent, duplicate, out-of-range and unvalidated steps', () => {
  assert.throws(() => registry([step(1, { toVersion: 3 })]), e => e.code === 'INVALID_INPUT');
  assert.throws(() => registry([step(1), step(1)]), e => e.code === 'INVALID_INPUT');
  assert.throws(() => registry([step(0)]), e => e.code === 'INVALID_INPUT');
  assert.throws(() => new MigrationRegistry(current(), all(1), [step(1)]), e => e.code === 'INVALID_INPUT', 'missing destination schema');
  assert.throws(() => new MigrationRegistry(current(4), [...all(1), tradeSchema(2), tradeSchema(3)], []), e => e.code === 'INVALID_INPUT', 'no current schema');
  assert.throws(() => new MigrationRegistry({ ...current(), extra: 1, identity: 0 }, all(1), []), e => e.code === 'INVALID_INPUT');
});
test('G09 plans and applies contiguous steps in one CAS commit, preserving IDs, kinds and untouched records', async () => {
  const keep = { id: id(9), kind: 'journal', schemaVersion: 1, payload: b64('journal-intent') };
  const { store, vault, session } = await seeded([trade(1), trade(2, 2, 'x|v2'), trade(3, 3, 'y|v2|v3'), keep]);
  const service = new RecordMigrationService(vault, registry());
  const plan = value(await service.plan(session));
  assert.deepEqual(plan, { sourceProfileId: session.profileId, sourceRevision: 1, changes: [
    { recordId: id(1), fromVersion: 1, toVersion: 3 }, { recordId: id(2), fromVersion: 2, toVersion: 3 }] });
  const writes = store.writes; const applied = value(await service.apply(session, plan));
  assert.deepEqual(applied, { profileId: session.profileId, revision: 2, verified: true }); assert.equal(store.writes, writes + 1);
  const records = value(await vault.list(session.sessionId));
  assert.deepEqual(records.map(r => [r.id, r.kind, r.schemaVersion, text(r.payload)]), [
    [id(1), 'trade', 3, 'private-1|v2|v3'], [id(2), 'trade', 3, 'x|v2|v3'], [id(3), 'trade', 3, 'y|v2|v3'], [id(9), 'journal', 1, 'journal-intent']]);
  const again = value(await service.plan({ ...session, revision: 2 })); assert.deepEqual(again.changes, [], 'already-upgraded vault is idempotent');
  assert.deepEqual(value(await service.apply({ ...session, revision: 2 }, again)), { profileId: session.profileId, revision: 2, verified: true }); assert.equal(store.writes, writes + 1);
});
test('G09 refuses future records, missing paths and any failing record without a partial write', async () => {
  for (const [records, migrations, expected] of [
    [[trade(1), trade(2, 4, 'z')], [step(1), step(2)], 'UNSUPPORTED_VERSION'],
    [[trade(1)], [step(2)], 'UNSUPPORTED_VERSION'],
    [[trade(1), trade(2, 1, 'bad-before')], [step(1), step(2)], 'INVALID_INPUT'],
    [[trade(1)], [step(1), step(2, { migrate: () => Buffer.from('wrong') })], 'INVALID_INPUT'],
    [[trade(1)], [step(1), step(2, { migrate: () => { throw Error('private boom'); } })], 'INVALID_INPUT'],
    [[trade(1)], [step(1), step(2, { migrate: () => 'not bytes' })], 'INVALID_INPUT'],
  ]) {
    const { store, vault, session } = await seeded(records); const before = store.writes;
    const service = new RecordMigrationService(vault, registry(migrations));
    code(await service.plan(session), expected);
    code(await service.apply(session, { sourceProfileId: session.profileId, sourceRevision: 1, changes: [] }), expected);
    assert.equal(store.writes, before);
  }
});
test('G09 transforms receive copies and cannot mutate the source snapshot', async () => {
  const { vault, session } = await seeded([trade(1)]);
  const hostile = step(1, { migrate: p => { const out = Buffer.from(`${Buffer.from(p)}|v2`); p.fill(0); return out; } });
  const service = new RecordMigrationService(vault, registry([hostile, step(2)]));
  value(await service.plan(session));
  assert.equal(text(value(await vault.list(session.sessionId))[0].payload), 'private-1');
});
test('G09 apply recomputes and rejects a supplied plan that differs, and conflicts on concurrent revision change', async () => {
  const { store, vault, session } = await seeded([trade(1)]);
  const service = new RecordMigrationService(vault, registry()); const plan = value(await service.plan(session));
  const before = store.writes;
  code(await service.apply(session, { ...plan, changes: [] }), 'CONFLICT');
  code(await service.apply(session, { ...plan, sourceRevision: 0 }), 'CONFLICT');
  code(await service.apply(session, null), 'CONFLICT'); assert.equal(store.writes, before);
  // Another tab commits between plan and apply: the recomputed plan no longer matches.
  const other = new EncryptedVaultService(store, webcrypto, { lifecycle: false }); const tab = value(await other.unlock(session.profileId, pass));
  value(await other.commit(tab.sessionId, 1, [{ op: 'put', record: { id: id(7), kind: 'preference', schemaVersion: 1, payload: b64('pref') } }]));
  code(await service.apply(session, plan), 'CONFLICT');
  const reopened = value(await vault.unlock(session.profileId, pass)); assert.equal(value(await vault.list(reopened.sessionId)).find(r => r.id === id(1)).schemaVersion, 1);
});
test('G09 bounds in-place changes at 256 and honors cancellation and lock', async () => {
  const exact = await seeded(Array.from({ length: MAX_IN_PLACE_CHANGES }, (_, n) => trade(n + 1)));
  const service = new RecordMigrationService(exact.vault, registry());
  assert.equal(value(await service.plan(exact.session)).changes.length, 256);
  const over = await seeded(Array.from({ length: MAX_IN_PLACE_CHANGES + 1 }, (_, n) => trade(n + 1)));
  const overService = new RecordMigrationService(over.vault, registry()); const before = over.store.writes;
  assert.equal(over.session.revision, 2); code(await overService.plan(over.session), 'LIMIT_EXCEEDED'); assert.equal(over.store.writes, before);
  const controller = new AbortController(); controller.abort();
  code(await service.apply(exact.session, value(await service.plan(exact.session)), controller.signal), 'CANCELLED');
  assert.equal(value(await service.apply(exact.session, value(await service.plan(exact.session)))).revision, 2);
  exact.vault.lock(exact.session.sessionId); code(await service.plan(exact.session), 'LOCKED');
});
test('G09 a committed migration reports its durable revision even if readback fails afterwards', async () => {
  const { store, vault, session } = await seeded([trade(1)]);
  const service = new RecordMigrationService(vault, registry()); const plan = value(await service.plan(session));
  const realCommit = vault.commit.bind(vault);
  // Lock races in right after the durable commit completes, before readback.
  vault.commit = async (...args) => { const result = await realCommit(...args); vault.lock(session.sessionId); return result; };
  const applied = value(await service.apply(session, plan));
  assert.deepEqual(applied, { profileId: session.profileId, revision: 2, verified: false });
  assert.equal(JSON.parse(JSON.stringify(store.rows.get(session.profileId))).revision, 2);
});
test('G09 no-op preflight writes nothing, needs no commit and still honors cancellation and lock', async () => {
  const { store, vault, session } = await seeded([trade(1, 3, 'a|v2|v3')]);
  const service = new RecordMigrationService(vault, registry()); const before = store.writes;
  vault.commit = async () => { throw Error('no-op must not commit'); };
  const plan = value(await service.plan(session)); assert.deepEqual(plan.changes, []);
  assert.deepEqual(value(await service.apply(session, plan)), { profileId: session.profileId, revision: 1, verified: true });
  const controller = new AbortController(); controller.abort(); code(await service.apply(session, plan, controller.signal), 'CANCELLED');
  vault.lock(session.sessionId); code(await service.apply(session, plan), 'LOCKED'); assert.equal(store.writes, before);
});
test('G09 stale empty plan: a persisted advance by another writer conflicts without writing or losing that work', async () => {
  for (const advance of ['added-record', 'future-record', 'same-revision-substitution']) {
    const { store, vault, session } = await seeded([trade(1, 3, 'a|v2|v3')]);
    const service = new RecordMigrationService(vault, registry());
    const plan = value(await service.plan(session)); assert.deepEqual(plan.changes, []); assert.equal(plan.sourceRevision, 1);
    const other = new EncryptedVaultService(store, webcrypto, { lifecycle: false }); const tab = value(await other.unlock(session.profileId, pass));
    if (advance === 'same-revision-substitution') {
      const row = clone(store.rows.get(session.profileId));
      row.snapshot.nonce = `${row.snapshot.nonce[0] === 'A' ? 'B' : 'A'}${row.snapshot.nonce.slice(1)}`; store.rows.set(session.profileId, row);
    } else {
      const record = advance === 'added-record' ? { id: id(7), kind: 'preference', schemaVersion: 1, payload: b64('second writer') } : trade(8, 9, 'future');
      value(await other.commit(tab.sessionId, 1, [{ op: 'put', record }]));
    }
    const persisted = JSON.stringify(store.rows.get(session.profileId)); const writes = store.writes;
    vault.commit = async () => { throw Error('stale no-op must not commit'); };
    code(await service.apply(session, plan), 'CONFLICT');
    assert.equal(store.writes, writes, `${advance}: no write`); assert.equal(JSON.stringify(store.rows.get(session.profileId)), persisted, `${advance}: other writer's state kept`);
  }
  // Control: a fresh unchanged no-op still succeeds with zero writes and no commit call.
  const { store, vault, session } = await seeded([trade(1, 3, 'a|v2|v3')]);
  const service = new RecordMigrationService(vault, registry()); const writes = store.writes;
  vault.commit = async () => { throw Error('fresh no-op must not commit'); };
  assert.deepEqual(value(await service.apply(session, value(await service.plan(session)))), { profileId: session.profileId, revision: 1, verified: true });
  assert.equal(store.writes, writes);
});
