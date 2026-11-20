import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { encodeBase64url } from '../../../packages/schemas/index.ts';
import { REVIEW_FAVORITES_RECORD_ID } from '../../../packages/personalization/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';

const passphrase = 'saved favorites native fixture passphrase';
const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
const bytes = n => new TextEncoder().encode(`{"synthetic-favorite-terms":${n}}`);
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const live = [];
afterEach(() => { for (const service of live.splice(0)) service.dispose(); });

class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw Object.assign(new Error('CONFLICT'), { code: 'CONFLICT' });
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
}

async function setup({ wrap, now } = {}) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const backup = new EncryptedBackupService(store), messages = [];
  live.push(vault, backup);
  const session = (await vault.create(passphrase)).value; vault.lockAll();
  const endpoint = createVaultWorkerEndpoint(message => messages.push(clone(message)), {
    createServices: () => ({ vault: wrap ? wrap(vault) : vault, backup }), ...(now ? { now } : {}),
  });
  live.push(endpoint);
  let requestId = 0;
  const send = (operation, fields = {}, generation = 0) => endpoint.dispatch({ version: 1, requestId: ++requestId, generation, operation, ...fields });
  const result = () => messages.at(-1).result;
  const value = () => { assert.equal(result()?.ok, true, JSON.stringify(messages.at(-1))); return result().value; };
  const error = () => { assert.equal(result()?.ok, false, JSON.stringify(messages.at(-1))); return result().error.code; };
  const profileId = session.profileId;
  const unlock = async (generation = 0) => { await send('unlock', { profileId, passphrase }, generation); value(); };
  const save = async (n, generation = 0) => { await send('saveTermsReview', { profileId, source: 'file', bytes: bytes(n) }, generation); return value().recordId; };
  const list = async (generation = 0) => { await send('listFavoriteReviews', { profileId }, generation); return value(); };
  await send('init', { config }); value();
  return { store, vault, backup, endpoint, messages, profileId, send, value, error, unlock, save, list };
}

test('favorites traverse real encrypted native storage and survive lock/unlock without implicit preference writes', async () => {
  const s = await setup(); await s.unlock();
  const recordId = await s.save(1), writes = s.store.writes;
  const initial = await s.list(); assert.deepEqual(initial.recordIds, []); assert.equal(s.store.writes, writes);
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: true, expectedRevision: initial.revision });
  assert.deepEqual(s.value(), { recordId, favorite: true, revision: initial.revision + 1 });
  assert.equal(s.store.writes, writes + 1);
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]), new RegExp(`saved-review-favorites|synthetic-favorite-terms|${recordId}|${REVIEW_FAVORITES_RECORD_ID}`));
  assert.deepEqual((await s.list()).recordIds, [recordId]);
  await s.send('lock', {}, 1); await s.unlock(1);
  const reopened = await s.list(1); assert.deepEqual(reopened.recordIds, [recordId]);
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: false, expectedRevision: reopened.revision }, 1);
  assert.equal(s.value().favorite, false); assert.deepEqual((await s.list(1)).recordIds, []);
});

test('locked and foreign-profile favorite commands refuse access before reading or writing private records', async () => {
  const s = await setup(), writes = s.store.writes;
  await s.send('listFavoriteReviews', { profileId: s.profileId }); assert.equal(s.error(), 'LOCKED');
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId: '1'.repeat(32), favorite: true, expectedRevision: 0 }); assert.equal(s.error(), 'LOCKED');
  await s.unlock();
  await s.send('listFavoriteReviews', { profileId: 'f'.repeat(32) }); assert.equal(s.error(), 'LOCKED');
  await s.send('setReviewFavorite', { profileId: 'f'.repeat(32), recordId: '1'.repeat(32), favorite: false, expectedRevision: 0 }); assert.equal(s.error(), 'LOCKED');
  assert.equal(s.store.writes, writes);
});

test('stale observed revisions refuse star/unstar without retrying or changing the encrypted preference', async () => {
  const s = await setup(); await s.unlock();
  const recordId = await s.save(1), observed = await s.list();
  await s.save(2); const before = clone(s.store.rows), writes = s.store.writes;
  for (const favorite of [true, false]) {
    await s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite, expectedRevision: observed.revision });
    assert.equal(s.error(), 'CONFLICT');
  }
  assert.deepEqual(s.store.rows, before); assert.equal(s.store.writes, writes);
  const refreshed = await s.list();
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: true, expectedRevision: refreshed.revision });
  assert.equal(s.value().revision, refreshed.revision + 1);
});

test('only compatible saved reviews may be added; deletion never prunes favorites and explicit unstar can remove a dangling reference', async () => {
  const s = await setup(); await s.unlock();
  let observed = await s.list(), writes = s.store.writes;
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId: '9'.repeat(32), favorite: true, expectedRevision: observed.revision });
  assert.equal(s.error(), 'NOT_FOUND'); assert.equal(s.store.writes, writes);
  const recordId = await s.save(1); observed = await s.list();
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: true, expectedRevision: observed.revision }); s.value();
  await s.send('deleteTermsReview', { profileId: s.profileId, recordId }); s.value();
  observed = await s.list(); assert.deepEqual(observed.recordIds, [recordId], 'a delete has no preference mutation authority');
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: false, expectedRevision: observed.revision }); s.value();
  assert.deepEqual((await s.list()).recordIds, []);
});

test('a foreign reserved preference row is retained byte-for-byte by list and change failures', async () => {
  const s = await setup();
  const native = (await s.vault.unlock(s.profileId, passphrase)).value;
  const row = { id: REVIEW_FAVORITES_RECORD_ID, kind: 'preference', schemaVersion: 1, payload: encodeBase64url(bytes(7)) };
  const committed = await s.vault.commit(native.sessionId, native.revision, [{ op: 'put', record: row }]); assert.equal(committed.ok, true);
  s.vault.lockAll(); await s.unlock(); const before = clone(s.store.rows), writes = s.store.writes;
  await s.send('listFavoriteReviews', { profileId: s.profileId }); assert.equal(s.error(), 'UNSUPPORTED_VERSION');
  await s.send('setReviewFavorite', { profileId: s.profileId, recordId: '8'.repeat(32), favorite: false, expectedRevision: committed.value });
  assert.equal(s.error(), 'UNSUPPORTED_VERSION'); assert.equal(s.store.writes, writes); assert.deepEqual(s.store.rows, before);
});

test('locking a held native favorite write aborts it, keeps admission busy until drained, and suppresses the old reply', async () => {
  const entered = deferred(), release = deferred(); let hold = false;
  const s = await setup({ wrap: vault => new Proxy(vault, { get(target, key) {
    const member = Reflect.get(target, key, target);
    if (key === 'commit') return async (...args) => { if (hold && args[2].length) { entered.resolve(); await release.promise; } return member.apply(target, args); };
    return typeof member === 'function' ? member.bind(target) : member;
  } }) });
  await s.unlock(); const recordId = await s.save(1), observed = await s.list(), writes = s.store.writes; hold = true;
  const pending = s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: true, expectedRevision: observed.revision });
  await entered.promise;
  await s.send('listFavoriteReviews', { profileId: s.profileId }); assert.equal(s.error(), 'BUSY');
  await s.send('lock', {}, 1);
  await s.send('unlock', { profileId: s.profileId, passphrase }, 1); assert.equal(s.error(), 'BUSY');
  release.resolve(); await pending;
  assert.equal(s.messages.filter(message => message.operation === 'setReviewFavorite' && message.result.ok).length, 0);
  assert.equal(s.store.writes, writes);
  hold = false; await s.unlock(1); assert.deepEqual((await s.list(1)).recordIds, []);
});

test('a favorite commit that wins before timeout remains durable but cannot publish a late success', async () => {
  const entered = deferred(), release = deferred(); let hold = false, now = 0;
  const s = await setup({ now: () => now, wrap: vault => new Proxy(vault, { get(target, key) {
    const member = Reflect.get(target, key, target);
    if (key === 'commit') return async (...args) => { const result = await member.apply(target, args); if (hold && args[2].length) { entered.resolve(); await release.promise; } return result; };
    return typeof member === 'function' ? member.bind(target) : member;
  } }) });
  await s.unlock(); const recordId = await s.save(1), observed = await s.list(), writes = s.store.writes; hold = true;
  const pending = s.send('setReviewFavorite', { profileId: s.profileId, recordId, favorite: true, expectedRevision: observed.revision });
  await entered.promise; assert.equal(s.store.writes, writes + 1);
  now = 30_001; release.resolve(); await pending;
  assert.equal(s.error(), 'TIMEOUT'); assert.equal(s.messages.filter(message => message.operation === 'setReviewFavorite' && message.result.ok).length, 0);
  hold = false; await s.unlock(); assert.deepEqual((await s.list()).recordIds, [recordId]);
});
