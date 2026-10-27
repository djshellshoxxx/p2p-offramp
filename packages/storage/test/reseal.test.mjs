import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { EncryptedVaultService, VaultStorageError } from '../src/vault-service.ts';
import { MigrationRegistry, InternalMigrationResealer, MAX_IN_PLACE_CHANGES } from '../src/migration-service.ts';
import { MAX_VAULT_PROFILES } from '../../schemas/index.ts';
const clone = v => structuredClone(v);
const pass = 'reseal source passphrase', dest = 'reseal destination passphrase';
const id = n => n.toString(16).padStart(32, '0');
const b64 = t => Buffer.from(t).toString('base64url');
const text = p => Buffer.from(p, 'base64url').toString();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Mirrors IndexedDbVaultStore semantics: source recheck, profile bound and add happen atomically.
class Store {
  rows = new Map(); listeners = new Set(); writes = 0; beforeAdd;
  async get(p) { return clone(this.rows.get(p)); }
  #insert(e) {
    if (this.rows.size >= MAX_VAULT_PROFILES) throw new VaultStorageError('LIMIT_EXCEEDED');
    if (this.rows.has(e.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(e.profileId, clone(e)); this.writes++;
  }
  async add(e) { this.#insert(e); }
  async addWithSource(source, next, options) {
    await this.beforeAdd?.(); options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (!same(this.rows.get(source.profileId), source)) throw new VaultStorageError('CONFLICT');
    this.#insert(next);
  }
  async compareAndSwap(expected, next) {
    if (!same(this.rows.get(expected.profileId), expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  subscribeInvalidation(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
}
const all = v => ['identity', 'preference', 'trade', 'chat', 'journal'].map(kind => ({ kind, version: v, validate: () => true }));
const tradeSchema = v => ({ kind: 'trade', version: v, validate: p => { const s = Buffer.from(p).toString(); return v === 1 ? !s.includes('|') : s.endsWith(`|v${v}`); } });
const step = (from, extra = {}) => ({ kind: 'trade', fromVersion: from, toVersion: from + 1, migrate: p => Buffer.from(`${Buffer.from(p)}|v${from + 1}`), ...extra });
const registry = (migrations = [step(1)]) => new MigrationRegistry({ identity: 1, preference: 1, trade: 2, chat: 1, journal: 1 },
  [...all(1).filter(s => s.kind !== 'trade'), tradeSchema(1), tradeSchema(2)], migrations);
const value = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const code = (r, c) => { assert.equal(r.ok, false, 'expected failure'); assert.equal(r.error.code, c); assert.doesNotMatch(r.error.message, /private|boom/); };
const trade = (n, v = 1, p = `private-${n}`) => ({ id: id(n), kind: 'trade', schemaVersion: v, payload: b64(p) });
async function seeded(records, migrations) {
  const store = new Store(), vault = new EncryptedVaultService(store, webcrypto, { lifecycle: false });
  let session = value(await vault.create(pass));
  for (let at = 0; at < records.length; at += 256) {
    session = { ...session, revision: value(await vault.commit(session.sessionId, session.revision, records.slice(at, at + 256).map(record => ({ op: 'put', record })))) };
  }
  const resealer = new InternalMigrationResealer(vault, new Map([['trade-v2', registry(migrations)]]));
  const request = { sourceSessionId: session.sessionId, expectedKeyId: store.rows.get(session.profileId).keyId, expectedRevision: session.revision, migrationId: 'trade-v2' };
  return { store, vault, session, resealer, request, source: clone(store.rows.get(session.profileId)) };
}

test('G03 reseal migrates every record into a fresh-key locked profile and retains the exact source', async () => {
  const records = [...Array.from({ length: MAX_IN_PLACE_CHANGES + 1 }, (_, n) => trade(n + 1)), { id: id(999), kind: 'journal', schemaVersion: 1, payload: b64('journal-intent') }];
  const s = await seeded(records);
  const receipt = value(await s.resealer.migrateAndReseal(s.request, dest));
  assert.equal(receipt.sourceProfileId, s.session.profileId); assert.equal(receipt.revision, 0); assert.equal(receipt.records, records.length);
  assert.notEqual(receipt.newProfileId, s.session.profileId); assert.notEqual(receipt.newKeyId, s.request.expectedKeyId);
  assert.ok(same(s.store.rows.get(s.session.profileId), s.source), 'source row is untouched');
  assert.equal(value(await s.vault.list(s.session.sessionId)).length, records.length, 'source session stays usable');
  const opened = value(await s.vault.unlock(receipt.newProfileId, dest));
  const copied = value(await s.vault.list(opened.sessionId));
  assert.deepEqual(copied.map(r => r.id).sort(), records.map(r => r.id).sort());
  assert.equal(copied.find(r => r.id === id(1)).schemaVersion, 2); assert.equal(text(copied.find(r => r.id === id(1)).payload), 'private-1|v2');
  assert.equal(text(copied.find(r => r.id === id(999)).payload), 'journal-intent');
  code(await s.vault.unlock(receipt.newProfileId, pass), 'AUTHENTICATION_FAILED');
  assert.equal(JSON.stringify(s.store.rows.get(receipt.newProfileId)).includes(s.source.wrappedKey.salt), false, 'fresh KDF salt');
});
test('G03 reseal refuses unknown migration IDs, stale key/revision, future records and failing steps without writing', async () => {
  for (const [mutate, records, migrations, expected] of [
    [r => ({ ...r, migrationId: 'imported-code' }), [trade(1)], undefined, 'UNSUPPORTED_VERSION'],
    [r => ({ ...r, migrationId: '__proto__' }), [trade(1)], undefined, 'UNSUPPORTED_VERSION'],
    [r => ({ ...r, expectedKeyId: id(77) }), [trade(1)], undefined, 'CONFLICT'],
    [r => ({ ...r, expectedRevision: r.expectedRevision - 1 }), [trade(1)], undefined, 'CONFLICT'],
    [r => r, [trade(1), trade(2, 3, 'z')], undefined, 'UNSUPPORTED_VERSION'],
    [r => r, [trade(1)], [step(1, { migrate: () => { throw Error('private boom'); } })], 'INVALID_INPUT'],
    [r => r, [trade(1)], [step(1, { migrate: () => Buffer.from('wrong') })], 'INVALID_INPUT'],
  ]) {
    const s = await seeded(records, migrations); const before = s.store.writes;
    code(await s.resealer.migrateAndReseal(mutate(s.request), dest), expected);
    assert.equal(s.store.writes, before); assert.ok(same(s.store.rows.get(s.session.profileId), s.source));
  }
  const s = await seeded([trade(1)]);
  code(await s.resealer.migrateAndReseal(s.request, 'short'), 'INVALID_INPUT');
});
test('G03 reseal transforms cannot relabel IDs or kinds, drop or duplicate records', async () => {
  const s = await seeded([trade(1), trade(2)]);
  for (const transform of [rs => rs.map(r => ({ ...r, id: id(50) })), rs => rs.map(r => ({ ...r, kind: 'chat' })), rs => rs.slice(1), rs => [rs[0], rs[0]], () => 'nope']) {
    code(await s.vault.resealSnapshot(s.session.sessionId, s.request.expectedKeyId, s.request.expectedRevision, transform, dest), 'INVALID_INPUT');
  }
  assert.equal(s.store.rows.size, 1);
});
test('G03 reseal aborts when another tab commits the source between snapshot check and destination add', async () => {
  const s = await seeded([trade(1)]);
  const other = new EncryptedVaultService(s.store, webcrypto, { lifecycle: false }); const tab = value(await other.unlock(s.session.profileId, pass));
  s.store.beforeAdd = async () => { s.store.beforeAdd = undefined;
    value(await other.commit(tab.sessionId, tab.revision, [{ op: 'put', record: { id: id(8), kind: 'preference', schemaVersion: 1, payload: b64('late work') } }])); };
  code(await s.resealer.migrateAndReseal(s.request, dest), 'CONFLICT');
  assert.equal(s.store.rows.size, 1, 'no copy that silently omits the concurrent commit');
});
test('G03 reseal respects the profile bound, cancellation and a durable add that wins a later lock', async () => {
  const full = await seeded([trade(1)]);
  for (let n = 1; n < MAX_VAULT_PROFILES; n++) value(await full.vault.create(pass));
  code(await full.resealer.migrateAndReseal(full.request, dest), 'LIMIT_EXCEEDED'); assert.ok(same(full.store.rows.get(full.session.profileId), full.source));
  const s = await seeded([trade(1)]); const controller = new AbortController(); controller.abort();
  code(await s.resealer.migrateAndReseal(s.request, dest, controller.signal), 'CANCELLED'); assert.equal(s.store.rows.size, 1);
  const raced = await seeded([trade(1)]);
  const real = raced.store.addWithSource.bind(raced.store);
  raced.store.addWithSource = async (...args) => { await real(...args); raced.vault.lock(raced.session.sessionId); };
  const receipt = value(await raced.resealer.migrateAndReseal(raced.request, dest));
  assert.equal(raced.store.rows.has(receipt.newProfileId), true, 'committed copy is reported, not hidden');
  const locked = await seeded([trade(1)]); locked.vault.lock(locked.session.sessionId);
  code(await locked.resealer.migrateAndReseal(locked.request, dest), 'LOCKED');
});
