import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { parseRuntimeCommand, parseRuntimeMessage } from '../../../packages/schemas/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { startAppServices } from '../src/app-services.ts';
import { capturePendingMetadata } from '../src/runtime/pending-metadata.ts';
const val = r => { assert.equal(r?.ok, true, JSON.stringify(r)); return r.value; };
const fail = (r, c) => { assert.equal(r?.ok, false, JSON.stringify(r)); assert.equal(r.error.code, c); };
const PASS = 'public favorite Worker passphrase', profileId = 'a'.repeat(32), recordId = 'b'.repeat(32);
const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
const header = { version: 1, requestId: 1, generation: 0 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Store {
  rows = new Map(); writes = 0; beforeWrite; afterWrite;
  async get(id) { return structuredClone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row)); this.writes++; }
  async compareAndSwap(before, next, options) { await this.beforeWrite?.(); options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT'); this.rows.set(next.profileId, structuredClone(next)); this.writes++; await this.afterWrite?.(); }
  subscribeInvalidation() { return () => {}; }
}
async function setup(t) {
  assert.doesNotThrow(() => parseRuntimeCommand({ ...header, operation: 'listReviewFavorites', profileId }));
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), backup = new EncryptedBackupService(store), messages = [];
  const endpoint = createVaultWorkerEndpoint(m => messages.push(structuredClone(m)), { createServices: () => ({ vault, backup }) }); t.after(() => endpoint.dispose()); let seq = 0;
  const send = (operation, fields = {}, generation = 0) => endpoint.dispatch({ version: 1, requestId: ++seq, generation, operation, ...fields });
  await send('init', { config }); await send('create', { passphrase: PASS }); const selected = val(messages.at(-1).result).handle.profileId;
  await send('saveTermsReview', { profileId: selected, source: 'file', bytes: new Uint8Array([1, 2, 3]) }); const savedId = val(messages.at(-1).result).recordId;
  return { store, vault, backup, messages, endpoint, send, profileId: selected, savedId, last: () => messages.at(-1).result };
}
test('favorite IPC has exact scalar named commands, bounded ID-only replies and profile-bound pending metadata', () => {
  const list = parseRuntimeCommand({ ...header, operation: 'listReviewFavorites', profileId });
  assert.deepEqual(capturePendingMetadata(list), { operation: 'listReviewFavorites', generation: 0, profileId });
  const set = parseRuntimeCommand({ ...header, operation: 'setReviewFavorite', profileId, recordId, favorite: true, expectedRevision: 4 });
  assert.deepEqual(capturePendingMetadata(set), { operation: 'setReviewFavorite', generation: 0, profileId });
  for (const extra of [{ payload: 'e30' }, { favorite: 'yes' }, { expectedRevision: -1 }, { recordId: '../private' }]) assert.throws(() => parseRuntimeCommand({ ...set, ...extra }));
  const reply = value => ({ ...header, kind: 'response', operation: 'listReviewFavorites', result: { ok: true, value } });
  assert.deepEqual(parseRuntimeMessage(reply({ revision: 4, recordIds: [recordId] })).result.value, { revision: 4, recordIds: [recordId] });
  for (const recordIds of [[recordId, recordId], Array.from({ length: 9 }, (_, n) => n.toString(16).padStart(32, '0')), ['private']]) assert.throws(() => parseRuntimeMessage(reply({ revision: 4, recordIds })));
  assert.throws(() => parseRuntimeMessage(reply({ revision: 4, recordIds: [], payload: 'secret' })));
});
test('actual Worker stars only saved targets, returns a durable scalar receipt and invalidates backup verification', async t => {
  const s = await setup(t); await s.send('listReviewFavorites', { profileId: s.profileId }); assert.deepEqual(val(s.last()), { revision: 1, recordIds: [] });
  await s.send('exportEncrypted', { profileId: s.profileId }); const bytes = val(s.last()).bytes;
  await s.send('verifyBackup', { profileId: s.profileId, bytes, passphrase: PASS }); val(s.last());
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId: s.savedId, favorite: true, expectedRevision: 1 });
  assert.deepEqual(val(s.last()), { recordId: s.savedId, favorite: true, revision: 2, persisted: true, sessionCurrent: true });
  await s.send('checkBackupVerification', { profileId: s.profileId }); assert.equal(val(s.last()).verification, null);
  await s.send('listReviewFavorites', { profileId: s.profileId }); assert.deepEqual(val(s.last()), { revision: 2, recordIds: [s.savedId] });
  const writes = s.store.writes;
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId: s.savedId, favorite: false, expectedRevision: 1 }); fail(s.last(), 'CONFLICT');
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: true, expectedRevision: 2 }); fail(s.last(), 'NOT_FOUND'); assert.equal(s.store.writes, writes);
  await s.send('listReviewFavorites', { profileId }); fail(s.last(), 'LOCKED');
  assert.doesNotMatch(JSON.stringify(s.messages.filter(m => m.operation !== 'exportEncrypted')), /payload|sessionId|wrappedKey|saved-review-favorites/);
});
test('Worker lock during an ignored committed write retains admission until drain and suppresses the obsolete reply', async t => {
  const s = await setup(t), entered = deferred(), release = deferred();
  s.store.afterWrite = async () => { entered.resolve(); await release.promise; };
  const pending = s.send('setReviewFavorite', { profileId: s.profileId, recordId: s.savedId, favorite: true, expectedRevision: 1 }); await entered.promise;
  await s.send('lock', {}, 1); await s.send('unlock', { profileId: s.profileId, passphrase: PASS }, 1); fail(s.last(), 'BUSY');
  release.resolve(); await pending; assert.equal(s.messages.some(m => m.operation === 'setReviewFavorite' && m.result.ok), false);
  s.store.afterWrite = undefined; await s.send('unlock', { profileId: s.profileId, passphrase: PASS }, 1); val(s.last());
  await s.send('listReviewFavorites', { profileId: s.profileId }, 1); assert.deepEqual(val(s.last()).recordIds, [s.savedId]);
});
class Port extends EventTarget {
  endpoint; sent = [];
  postMessage(value) { const command = structuredClone(value); this.sent.push(command.operation); queueMicrotask(() => void this.endpoint.dispatch(command)); }
  reply(message) { queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: structuredClone(message) }))); }
  terminate() { this.endpoint.dispose(); }
}
test('real AppServices favorites remain selected-profile commands and reject post-lock late results', async t => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'); Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  t.after(() => { if (old) Object.defineProperty(globalThis, 'isSecureContext', old); else delete globalThis.isSecureContext; });
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), backup = new EncryptedBackupService(store), port = new Port();
  port.endpoint = createVaultWorkerEndpoint(m => port.reply(m), { createServices: () => ({ vault, backup }) });
  const services = val(await startAppServices({ createWorker: () => port, lifecycle: false })); t.after(() => services.dispose());
  assert.equal(typeof services.listReviewFavorites, 'function'); fail(await services.listReviewFavorites(), 'LOCKED');
  val(await services.create(PASS)); const saved = val(await services.saveTermsReview('file', new Uint8Array([1]))).recordId;
  const initial = val(await services.listReviewFavorites()); val(await services.setReviewFavorite(saved, true, initial.revision));
  assert.deepEqual(val(await services.listReviewFavorites()).recordIds, [saved]);
  const entered = deferred(), release = deferred(), original = vault.list.bind(vault);
  vault.list = async (...args) => { const result = await original(...args); entered.resolve(); await release.promise; return result; };
  const pending = services.listReviewFavorites(); await entered.promise; val(await services.lock()); release.resolve(); fail(await pending, 'LOCKED');
});
