import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { EncryptedVaultService, EncryptedBackupService } from '../../storage/index.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { encodeBase64url, encodeSavedReviewPayload } from '../../schemas/index.ts';

const api = await import('../index.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const PASS = 'public favorite native test passphrase';
const ID = 'd7a6b5c4e3f291807060504030201082';
const FORMAT = 'p2p-offramp/saved-review-favorites/v1';
const val = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const fail = (r, code) => { assert.equal(r.ok, false, JSON.stringify(r)); if (code) assert.equal(r.error.code, code); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_ERROR|passphrase|https:/); return r.error.code; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const rid = n => n.toString(16).padStart(32, '0');
const saved = n => ({ id: rid(n), kind: 'trade', schemaVersion: 1, payload: encodeSavedReviewPayload('file', new TextEncoder().encode(`{"saved":${n}}`)) });
const foreign = { id: 'aa'.repeat(16), kind: 'preference', schemaVersion: 9, payload: encodeBase64url(new TextEncoder().encode('future foreign data')) };
const preference = value => ({ id: ID, kind: 'preference', schemaVersion: 1, payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(value))) });

class Store {
  rows = new Map(); writes = 0; beforeWrite; afterWrite; beforeGet;
  async get(id) { await this.beforeGet?.(); return structuredClone(this.rows.get(id)); }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; await this.afterWrite?.();
  }
  subscribeInvalidation() { return () => {}; }
}
async function setup(t, records = [saved(1), saved(2), foreign]) {
  const store = new Store(), vault = new EncryptedVaultService(store, webcrypto, { lifecycle: false });
  t.after(() => vault.dispose()); const session = val(await vault.create(PASS));
  if (records.length) val(await vault.commit(session.sessionId, 0, records.map(record => ({ op: 'put', record }))));
  assert.equal(typeof api.createSavedReviewFavorites, 'function', 'saved-review favorite consumer is missing');
  const manager = val(api.createSavedReviewFavorites({ vault, session })); t.after(() => manager.dispose());
  return { store, vault, session, manager };
}

test('star, unstar and reload preserve encrypted IDs and unrelated preferences through fresh-key backup restore', async t => {
  const s = await setup(t), initial = val(await s.manager.list()); assert.deepEqual(initial, { revision: 1, recordIds: [] });
  const first = val(await s.manager.set(rid(1), true, initial.revision));
  assert.deepEqual(first, { recordId: rid(1), favorite: true, revision: 2, persisted: true, sessionCurrent: true });
  assert.deepEqual(val(await s.manager.list()), { revision: 2, recordIds: [rid(1)] });
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]), /saved-review-favorites|future foreign data|recordIds|"saved"/);
  s.manager.dispose(); s.vault.lockAll();
  const reopened = val(await s.vault.unlock(s.session.profileId, PASS));
  const manager = val(api.createSavedReviewFavorites({ vault: s.vault, session: reopened })); t.after(() => manager.dispose());
  assert.deepEqual(val(await manager.list()).recordIds, [rid(1)]);
  assert.deepEqual(val(await s.vault.list(reopened.sessionId)).find(row => row.id === foreign.id), foreign);
  const backup = new EncryptedBackupService(s.store, webcrypto); t.after(() => backup.dispose());
  const exported = await backup.export(s.session.profileId), source = structuredClone(s.store.rows.get(s.session.profileId));
  const restored = await backup.restore(exported, PASS, 'independent favorite restored passphrase');
  const destination = s.store.rows.get(restored.newProfileId);
  assert.notEqual(restored.newProfileId, s.session.profileId); assert.notEqual(destination.keyId, source.keyId);
  assert.notEqual(destination.wrappedKey.salt, source.wrappedKey.salt); assert.notEqual(destination.snapshot.nonce, source.snapshot.nonce);
  const freshSession = val(await s.vault.unlock(restored.newProfileId, 'independent favorite restored passphrase'));
  const fresh = val(api.createSavedReviewFavorites({ vault: s.vault, session: freshSession })); t.after(() => fresh.dispose());
  const loaded = val(await fresh.list()); assert.deepEqual(loaded, { revision: 0, recordIds: [rid(1)] });
  val(await fresh.set(rid(1), false, loaded.revision)); assert.deepEqual(val(await fresh.list()).recordIds, []);
  assert.deepEqual(s.store.rows.get(s.session.profileId), source, 'restore and unstar do not modify the source');
});

test('only existing saved-review IDs may be starred, eight is the bound, and stale IDs can be unstarred', async t => {
  const s = await setup(t, [...Array.from({ length: 9 }, (_, i) => saved(i + 1)), foreign]);
  for (let n = 1; n <= 8; n++) val(await s.manager.set(rid(n), true, val(await s.manager.list()).revision));
  const full = val(await s.manager.list()), writes = s.store.writes;
  fail(await s.manager.set(rid(9), true, full.revision), 'LIMIT_EXCEEDED');
  fail(await s.manager.set(foreign.id, true, full.revision), 'NOT_FOUND');
  fail(await s.manager.set(rid(99), true, full.revision), 'NOT_FOUND'); assert.equal(s.store.writes, writes);
  val(await s.vault.commit(s.session.sessionId, full.revision, [{ op: 'delete', id: rid(1) }]));
  const afterDelete = val(await s.manager.list()); assert.equal(afterDelete.recordIds.includes(rid(1)), true);
  fail(await s.manager.set(rid(1), true, afterDelete.revision), 'NOT_FOUND');
  val(await s.manager.set(rid(1), false, afterDelete.revision)); assert.equal(val(await s.manager.list()).recordIds.includes(rid(1)), false);
});

test('foreign and future preference collisions are preserved byte for byte instead of overwritten', async t => {
  for (const row of [
    { ...foreign, id: ID },
    preference({ format: 'p2p-offramp/saved-review-favorites/v2', recordIds: [] }),
    preference({ format: FORMAT, recordIds: [rid(1), rid(1)] }),
    preference({ format: FORMAT, recordIds: [], extra: true }),
    { ...preference({ format: FORMAT, recordIds: [] }), kind: 'trade' },
  ]) {
    const s = await setup(t, [saved(1), row]), before = structuredClone(s.store.rows.get(s.session.profileId));
    fail(await s.manager.list(), 'UNSUPPORTED_VERSION'); fail(await s.manager.set(rid(1), true, 1), 'UNSUPPORTED_VERSION');
    assert.deepEqual(s.store.rows.get(s.session.profileId), before);
  }
});

test('same-session and another-native-service revision changes refuse stale mutations without retry', async t => {
  const s = await setup(t), listed = val(await s.manager.list()), writes = s.store.writes;
  val(await s.vault.commit(s.session.sessionId, listed.revision, [{ op: 'put', record: { ...foreign, id: 'bb'.repeat(16) } }]));
  fail(await s.manager.set(rid(1), true, listed.revision), 'CONFLICT'); assert.equal(s.store.writes, writes + 1);
  const current = val(await s.manager.list()), other = new EncryptedVaultService(s.store, webcrypto, { lifecycle: false }); t.after(() => other.dispose());
  const otherSession = val(await other.unlock(s.session.profileId, PASS));
  val(await other.commit(otherSession.sessionId, current.revision, [{ op: 'put', record: { ...foreign, id: 'cc'.repeat(16) } }]));
  fail(await s.manager.set(rid(1), true, current.revision), 'CONFLICT'); assert.equal(s.store.writes, writes + 2);
  fail(await s.manager.list(), 'LOCKED');
});

test('cancelled and ignored held writes retain physical admission until native completion', async t => {
  const s = await setup(t), entered = deferred(), release = deferred(), abort = new AbortController();
  s.store.beforeWrite = async () => { entered.resolve(); await release.promise; };
  const pending = s.manager.set(rid(1), true, 1, abort.signal); await entered.promise; abort.abort();
  fail(await s.manager.list(), 'CONFLICT'); fail(await s.manager.set(rid(2), true, 1), 'CONFLICT');
  release.resolve(); fail(await pending, 'CANCELLED'); s.store.beforeWrite = undefined;
  assert.deepEqual(val(await s.manager.list()), { revision: 1, recordIds: [] });
  const written = deferred(), drained = deferred(), secondAbort = new AbortController();
  s.store.afterWrite = async () => { written.resolve(); await drained.promise; };
  const durable = s.manager.set(rid(1), true, 1, secondAbort.signal); await written.promise; secondAbort.abort();
  fail(await s.manager.list(), 'CONFLICT'); drained.resolve();
  assert.deepEqual(val(await durable), { recordId: rid(1), favorite: true, revision: 2, persisted: true, sessionCurrent: false });
  s.store.afterWrite = undefined; assert.deepEqual(val(await s.manager.list()).recordIds, [rid(1)]);
});

test('lock, observed A-null-A ownership and reentrant callbacks suppress late private results permanently', async t => {
  const s = await setup(t), entered = deferred(), release = deferred();
  val(await s.manager.set(rid(1), true, 1));
  s.store.beforeGet = async () => { entered.resolve(); await release.promise; };
  const pending = s.manager.list(); await entered.promise; s.vault.lockAll(); release.resolve();
  fail(await pending, 'LOCKED'); fail(await s.manager.list(), 'LOCKED'); s.store.beforeGet = undefined;
  const session = val(await s.vault.unlock(s.session.profileId, PASS)); let owner = 'A';
  const scoped = val(api.createSavedReviewFavorites({ vault: s.vault, session, isCurrent: () => owner === 'A' })); t.after(() => scoped.dispose());
  owner = null; fail(await scoped.list(), 'LOCKED'); owner = 'A'; fail(await scoped.list(), 'LOCKED');
  let manager, calls = 0;
  manager = val(api.createSavedReviewFavorites({ vault: s.vault, session, isCurrent: () => { if (++calls > 1) manager.dispose(); return true; } }));
  fail(await manager.list(), 'LOCKED');
});

test('completed native CAS remains discoverable when locking retires the session before the result returns', async t => {
  const s = await setup(t); s.store.afterWrite = () => s.vault.lockAll();
  const receipt = val(await s.manager.set(rid(1), true, 1));
  assert.deepEqual(receipt, { recordId: rid(1), favorite: true, revision: 2, persisted: true, sessionCurrent: false });
  fail(await s.manager.list(), 'LOCKED'); s.store.afterWrite = undefined;
  const session = val(await s.vault.unlock(s.session.profileId, PASS)), fresh = val(api.createSavedReviewFavorites({ vault: s.vault, session })); t.after(() => fresh.dispose());
  assert.deepEqual(val(await fresh.list()).recordIds, [rid(1)]);
});

test('foreign exception prototype traps cannot reject an operation or retain its physical slot', async t => {
  const s = await setup(t), original = s.vault.list.bind(s.vault);
  const foreign = new Proxy({}, { getPrototypeOf() { throw new Error('PRIVATE_ERROR prototype trap'); } });
  s.vault.list = async () => { throw foreign; };
  let result; await assert.doesNotReject(async () => { result = await s.manager.list(); });
  fail(result, 'STORAGE_UNAVAILABLE'); s.vault.list = original;
  assert.deepEqual(val(await s.manager.list()), { revision: 1, recordIds: [] });
});

test('factory exception normalization cannot invoke a hostile prototype trap or disclose its error', async t => {
  const s = await setup(t), capture = s.vault.captureSession.bind(s.vault);
  s.vault.captureSession = () => { throw new Proxy({}, { getPrototypeOf() { throw new Error('PRIVATE_ERROR capture trap'); } }); };
  let result; assert.doesNotThrow(() => { result = api.createSavedReviewFavorites({ vault: s.vault, session: s.session }); });
  fail(result, 'INVALID_INPUT'); s.vault.captureSession = capture;
  const fresh = val(api.createSavedReviewFavorites({ vault: s.vault, session: s.session })); t.after(() => fresh.dispose());
  assert.deepEqual(val(await fresh.list()), { revision: 1, recordIds: [] });
});

test('native error codes are bounded own data and cannot forward unknown or inherited values', async t => {
  const s = await setup(t), original = s.vault.list.bind(s.vault);
  for (const nativeError of [
    { code: 'PRIVATE_ERROR unbounded code' },
    { code: 7 },
    Object.create({ code: 'CONFLICT' }),
  ]) {
    s.vault.list = async () => ({ ok: false, error: nativeError });
    fail(await s.manager.list(), 'STORAGE_UNAVAILABLE');
  }
  s.vault.list = original;
  assert.deepEqual(val(await s.manager.list()), { revision: 1, recordIds: [] });
});

test('native error code accessors never supply diagnostics or a conflict result', async t => {
  const s = await setup(t); let accessorReads = 0;
  s.vault.list = async () => ({ ok: false, error: Object.defineProperty({}, 'code', { get() { accessorReads++; return 'CONFLICT'; } }) });
  fail(await s.manager.list(), 'STORAGE_UNAVAILABLE'); assert.equal(accessorReads, 0);
});
