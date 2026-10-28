// Saved terms reviews through the real Worker endpoint and the real encrypted vault (in-memory CAS store).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { encodeBase64url, MAX_SAVED_REVIEWS } from '../../../packages/schemas/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';

const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
const pass = 'local saved review fixture passphrase';
const clone = value => structuredClone(value);
const terms = n => new TextEncoder().encode(`{"synthetic-terms":${n}}`);
// Every endpoint/vault is disposed even when an assertion fails, so idle timers cannot keep the runner alive.
const live = [];
afterEach(() => { for (const item of live.splice(0)) { try { item.dispose(); } catch { /* already disposed */ } } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

class Store {
  rows = new Map(); listeners = new Set(); writes = 0;
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return Object.freeze({ profileIds: Object.freeze([...this.rows.keys()]), truncated: false }); }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) { const error = new Error('CONFLICT'); error.code = 'CONFLICT'; throw error; }
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
  subscribeInvalidation(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

async function setup({ wrapVault } = {}) {
  const store = new Store();
  const creator = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = (await creator.create(pass)).value; creator.dispose();
  const vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const messages = []; let sequence = 0;
  const service = createVaultWorkerEndpoint(message => messages.push(clone(message)), { createServices: () => ({ vault: wrapVault ? wrapVault(vault) : vault, backup: new EncryptedBackupService(store) }) });
  const send = (operation, extra = {}, generation = 0) => service.dispatch({ version: 1, requestId: ++sequence, generation, operation, ...extra });
  const last = () => messages.at(-1);
  const value = () => { assert.equal(last().result?.ok, true, JSON.stringify(last())); return last().result.value; };
  const error = () => { assert.equal(last().result?.ok, false, JSON.stringify(last())); return last().result.error.code; };
  live.push(service, vault);
  await send('init', { config });
  return { store, session, vault, service, messages, send, last, value, error, profileId: session.profileId };
}

test('save, list and delete round-trip exact bytes in the selected encrypted profile only', async () => {
  const s = await setup();
  await s.send('unlock', { profileId: s.profileId, passphrase: pass });
  await s.send('saveTermsReview', { profileId: s.profileId, source: 'synthetic-sample', bytes: terms(1) });
  const { recordId } = s.value(); assert.match(recordId, /^[0-9a-f]{32}$/);
  await s.send('listTermsReviews', { profileId: s.profileId });
  const listed = s.value();
  assert.deepEqual(listed.items, [{ recordId, source: 'synthetic-sample', bytes: terms(1) }]); assert.equal(listed.skipped, 0);
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]), /synthetic-terms|saved-terms-review/, 'stored only as ciphertext');
  await s.send('deleteTermsReview', { profileId: s.profileId, recordId });
  assert.deepEqual(s.value(), { recordId });
  await s.send('listTermsReviews', { profileId: s.profileId }); assert.deepEqual(s.value().items, []);
  await s.send('deleteTermsReview', { profileId: s.profileId, recordId }); assert.equal(s.error(), 'NOT_FOUND');
  s.service.dispose();
});

test('saving is idempotent per source and bytes, and the ninth distinct save is refused without eviction', async () => {
  const s = await setup();
  await s.send('unlock', { profileId: s.profileId, passphrase: pass });
  await s.send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(0) }); const first = s.value().recordId;
  const writes = s.store.writes;
  await s.send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(0) });
  assert.equal(s.value().recordId, first); assert.equal(s.store.writes, writes, 'a duplicate save writes nothing');
  await s.send('saveTermsReview', { profileId: s.profileId, source: 'synthetic-sample', bytes: terms(0) });
  assert.notEqual(s.value().recordId, first, 'a different source is a different saved review');
  for (let n = 1; n < MAX_SAVED_REVIEWS - 1; n++) { await s.send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(n) }); s.value(); }
  await s.send('listTermsReviews', { profileId: s.profileId }); const before = s.value().items;
  assert.equal(before.length, MAX_SAVED_REVIEWS);
  await s.send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(99) }); assert.equal(s.error(), 'LIMIT_EXCEEDED');
  await s.send('listTermsReviews', { profileId: s.profileId }); assert.deepEqual(s.value().items, before, 'nothing evicted');
  s.service.dispose();
});

test('locked, unselected or wrong-profile commands are refused without touching storage', async () => {
  const s = await setup();
  const writes = s.store.writes;
  await s.send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(1) }); assert.equal(s.error(), 'LOCKED');
  await s.send('listTermsReviews', { profileId: s.profileId }); assert.equal(s.error(), 'LOCKED');
  await s.send('unlock', { profileId: s.profileId, passphrase: pass });
  await s.send('saveTermsReview', { profileId: 'f'.repeat(32), source: 'file', bytes: terms(1) }); assert.equal(s.error(), 'LOCKED');
  await s.send('deleteTermsReview', { profileId: 'f'.repeat(32), recordId: 'b'.repeat(32) }); assert.equal(s.error(), 'LOCKED');
  assert.equal(s.store.writes, writes);
  await s.send('lock', {}, 1);
  await s.send('listTermsReviews', { profileId: s.profileId }, 1); assert.equal(s.error(), 'LOCKED');
  s.service.dispose();
});

test('other trade records are counted as skipped and can never be read, replaced or deleted through these commands', async () => {
  const s = await setup();
  const direct = new EncryptedVaultService(s.store, crypto, { lifecycle: false });
  live.push(direct);
  const session = (await direct.unlock(s.profileId, pass)).value;
  const foreign = 'c'.repeat(32), payload = encodeBase64url(new TextEncoder().encode('{"other":"trade record"}'));
  assert.equal((await direct.commit(session.sessionId, session.revision, [{ op: 'put', record: { id: foreign, kind: 'trade', schemaVersion: 1, payload } },
    { op: 'put', record: { id: 'd'.repeat(32), kind: 'journal', schemaVersion: 1, payload } }])).ok, true);
  direct.dispose();
  await s.send('unlock', { profileId: s.profileId, passphrase: pass });
  await s.send('listTermsReviews', { profileId: s.profileId }); assert.deepEqual(s.value(), { items: [], skipped: 1 });
  await s.send('deleteTermsReview', { profileId: s.profileId, recordId: foreign }); assert.equal(s.error(), 'NOT_FOUND');
  await s.send('deleteTermsReview', { profileId: s.profileId, recordId: 'd'.repeat(32) }); assert.equal(s.error(), 'NOT_FOUND');
  const check = new EncryptedVaultService(s.store, crypto, { lifecycle: false }); live.push(check);
  const reopened = (await check.unlock(s.profileId, pass)).value;
  const records = (await check.list(reopened.sessionId)).value;
  assert.deepEqual(records.map(r => r.id).sort(), [foreign, 'd'.repeat(32)]);
  assert.equal(records.find(r => r.id === foreign).payload, payload, 'foreign trade record untouched');
  check.dispose(); s.service.dispose();
});

test('a generated id that collides with any existing record id is refused instead of overwriting it', async () => {
  const s = await setup();
  const direct = new EncryptedVaultService(s.store, crypto, { lifecycle: false });
  const session = (await direct.unlock(s.profileId, pass)).value;
  const fixed = '11'.repeat(16);
  await direct.commit(session.sessionId, session.revision, [{ op: 'put', record: { id: fixed, kind: 'journal', schemaVersion: 1, payload: 'AA' } }]); direct.dispose();
  const messages = []; let sequence = 0;
  const vault = new EncryptedVaultService(s.store, crypto, { lifecycle: false });
  const e = createVaultWorkerEndpoint(m => messages.push(clone(m)), { random: bytes => bytes.fill(0x11), createServices: () => ({ vault, backup: new EncryptedBackupService(s.store) }) });
  live.push(e, vault, direct);
  const send = (operation, extra = {}) => e.dispatch({ version: 1, requestId: ++sequence, generation: 0, operation, ...extra });
  await send('init', { config }); await send('unlock', { profileId: s.profileId, passphrase: pass });
  await send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(1) });
  assert.equal(messages.at(-1).result.error.code, 'CONFLICT');
  e.dispose(); s.service.dispose();
});

test('lock during an in-flight save suppresses the reply; a retry after unlock is idempotent and stores one copy', async () => {
  const gate = deferred(), entered = deferred();
  const s = await setup({ wrapVault: vault => new Proxy(vault, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key === 'commit') return async (...args) => { entered.resolve(); await gate.promise; return value.apply(target, args); };
    return typeof value === 'function' ? value.bind(target) : value;
  } }) });
  await s.send('unlock', { profileId: s.profileId, passphrase: pass });
  const pending = s.send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(5) });
  await entered.promise;
  await s.send('lock', {}, 1);
  gate.resolve(); await pending;
  assert.equal(s.messages.filter(m => m.operation === 'saveTermsReview' && m.result?.ok).length, 0, 'no success reply after lock');
  await s.send('unlock', { profileId: s.profileId, passphrase: pass }, 1);
  await s.send('saveTermsReview', { profileId: s.profileId, source: 'file', bytes: terms(5) }, 1);
  const retried = s.value().recordId;
  await s.send('listTermsReviews', { profileId: s.profileId }, 1);
  const items = s.value().items;
  assert.ok(items.length <= 1 && (items.length === 0 || items[0].recordId === retried), 'at most one stored copy');
  assert.equal(items.length, 1);
  s.service.dispose();
});
