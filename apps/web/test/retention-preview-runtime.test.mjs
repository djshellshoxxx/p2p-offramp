import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService, RetentionService, RETENTION_REVIEW_AGE_MS as AGE } from '../../../packages/storage/index.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { encodeIntentPayload, encodeSavedReviewPayload, parseRuntimeCommand } from '../../../packages/schemas/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { capturePendingMetadata } from '../src/runtime/pending-metadata.ts';
import { startAppServices } from '../src/app-services.ts';

const clone = structuredClone, passphrase = 'local retention preview fixture passphrase';
const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
const id = n => n.toString(16).padStart(32, '0');
const good = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const bad = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|payload|sessionId/); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const opaque = (n, kind = 'preference') => ({ id: id(n), kind, schemaVersion: 1, payload: Buffer.from('PRIVATE retained content').toString('base64url') });
const journal = (n, state = 'finalized', updatedAt = 0) => ({ id: id(n), kind: 'journal', schemaVersion: 1,
  payload: encodeIntentPayload({ version: 1, intentId: Buffer.alloc(32, n).toString('base64url'),
    binding: { chain: 'evm', networkId: 'evm:1', deploymentId: 'escrow-v1', tradeId: `PRIVATE-trade-${n}` },
    account: `0x${'12'.repeat(20)}`, action: 'fund', state, walletGeneration: 0, expectedEscrowState: 'absent',
    preparedRequest: 'PRIVATE prepared request', submission: { chain: 'evm', hash: null, nonce: '0' }, replacementOf: null, createdAt: 0, updatedAt }) });
const chat = (n, receivedAt = 0) => ({ id: id(n), kind: 'chat', schemaVersion: 1,
  payload: Buffer.from(JSON.stringify({ format: 'p2p-offramp-chat-history', version: 1, conversationId: 'b'.repeat(64),
    receivedSequence: n, receivedAt, wrap: { opaque: 'PRIVATE history' } })).toString('base64url') });
const saved = n => ({ id: id(n), kind: 'trade', schemaVersion: 1, payload: encodeSavedReviewPayload('file', new TextEncoder().encode('PRIVATE saved terms')) });
const mixedRecords = () => [journal(1), journal(2, 'failed'), journal(3, 'pending'), journal(4, 'broadcast-unknown'),
  chat(5), chat(6, 1), journal(7, 'finalized', AGE + 1), saved(8), opaque(9, 'identity'), opaque(10),
  { ...journal(11), schemaVersion: 2 }, opaque(12, 'journal')];
const preview = (changes = {}) => ({ version: 1, revision: 1, archiveReviewCount: 3, reviewedDeleteCount: 0, protectedCount: 12,
  logicalOnly: true, backupAndRemoteCopiesUnaffected: true, ...changes });

/** Controlled persistence only; all vault encryption, session leases and classification are real. */
class Store {
  rows = new Map(); writes = 0;
  async get(profileId) { return clone(this.rows.get(profileId)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) {
    options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(row.profileId, clone(row)); this.writes++;
  }
  async compareAndSwap(before, after, options) {
    options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
    this.rows.set(after.profileId, clone(after)); this.writes++;
  }
  // Deliberately no cross-tab notification: assertFresh must detect durable changes itself.
  subscribeInvalidation() { return () => {}; }
}

async function setup(t, records = mixedRecords(), { initialize = true, send: onSend, now } = {}) {
  const store = new Store(), seed = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const seeded = good(await seed.create(passphrase));
  if (records.length) good(await seed.commit(seeded.sessionId, seeded.revision, records.map(record => ({ op: 'put', record }))));
  seed.dispose();
  const vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), backup = new EncryptedBackupService(store);
  const hooks = {}, counts = { list: 0, fresh: 0 }, messages = [];
  let selectedSession, sequence = 0;
  const list = vault.list.bind(vault), fresh = vault.assertFresh.bind(vault), unlock = vault.unlock.bind(vault);
  vault.list = async (...args) => { counts.list++; const result = await list(...args); await hooks.afterList?.(result); return result; };
  vault.assertFresh = async (...args) => {
    const ordinal = ++counts.fresh; await hooks.beforeFresh?.(ordinal);
    const result = await fresh(...args); await hooks.afterFresh?.(ordinal, result); return result;
  };
  vault.unlock = async (...args) => { const result = await unlock(...args); if (result.ok) selectedSession = result.value; return result; };
  const endpoint = createVaultWorkerEndpoint(message => { messages.push(clone(message)); onSend?.(message); },
    { createServices: () => ({ vault, backup }), ...(now ? { now } : {}) });
  t.after(() => endpoint.dispose());
  const send = (operation, fields = {}, generation = 0) => endpoint.dispatch({ version: 1, requestId: ++sequence, generation, operation, ...fields });
  if (initialize) await send('init', { config });
  return { store, vault, backup, endpoint, messages, send, hooks, counts, records, profileId: seeded.profileId,
    selected: () => selectedSession, last: () => messages.at(-1),
    open: (generation = 0) => send('unlock', { profileId: seeded.profileId, passphrase }, generation) };
}

test('real Worker/vault/retention preview uses exact 30-day counts, keeps unresolved and unknown records, and never writes or calls native/network work', async t => {
  const originalPlan = RetentionService.prototype.planRetention, originalDispose = RetentionService.prototype.dispose;
  const instances = [], disposed = new WeakSet();
  t.mock.method(RetentionService.prototype, 'planRetention', function (...args) { instances.push(this); return originalPlan.apply(this, args); });
  t.mock.method(RetentionService.prototype, 'dispose', function () { disposed.add(this); return originalDispose.call(this); });
  const native = t.mock.method(RetentionService.prototype, 'reviewRetention', () => { throw Error('unexpected native review'); });
  const deletion = t.mock.method(RetentionService.prototype, 'deleteReviewedRecords', () => { throw Error('unexpected deletion'); });
  const network = t.mock.method(globalThis, 'fetch', () => { throw Error('unexpected network'); });
  const cleanupBeforeReply = [];
  const s = await setup(t, mixedRecords(), { send: message => {
    if (message.operation === 'planRetention' && message.result.ok) cleanupBeforeReply.push(disposed.has(instances.at(-1)));
  } });
  await s.open();
  const before = JSON.stringify([...s.store.rows]), writes = s.store.writes;
  for (const [nowMs, count] of [[AGE - 1, 0], [AGE, 3], [AGE + 1, 4]]) {
    await s.send('planRetention', { profileId: s.profileId, nowMs });
    const value = good(s.last().result);
    assert.deepEqual(value, preview({ archiveReviewCount: count }));
    for (const record of s.records) assert.equal(JSON.stringify(value).includes(record.id), false);
    assert.doesNotMatch(JSON.stringify(value), /PRIVATE|payload|recordId|conversationId|sessionId|planId/);
  }
  assert.equal(instances.length, 3);
  assert.deepEqual(cleanupBeforeReply, [true, true, true]);
  assert.equal(s.counts.fresh, 6, 'every preview checks persisted state before classification and after disposal');
  assert.equal(s.counts.list, 3);
  assert.equal(native.mock.callCount(), 0); assert.equal(deletion.mock.callCount(), 0); assert.equal(network.mock.callCount(), 0);
  assert.equal(s.store.writes, writes); assert.equal(JSON.stringify([...s.store.rows]), before);
});

test('Worker preview requires the currently unlocked named profile and empty profiles remain read-only', async t => {
  const s = await setup(t, []), writes = s.store.writes;
  await s.send('planRetention', { profileId: s.profileId, nowMs: AGE }); bad(s.last().result, 'LOCKED');
  await s.open();
  await s.send('planRetention', { profileId: 'f'.repeat(32), nowMs: AGE }); bad(s.last().result, 'LOCKED');
  assert.equal(s.counts.list, 0);
  await s.send('planRetention', { profileId: s.profileId, nowMs: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(good(s.last().result), preview({ revision: 0, archiveReviewCount: 0, protectedCount: 0 }));
  assert.equal(s.store.writes, writes);
});

test('post-classification persisted freshness refuses an unannounced concurrent-tab revision', async t => {
  const s = await setup(t), other = new EncryptedVaultService(s.store, crypto, { lifecycle: false }); t.after(() => other.dispose());
  await s.open(); const writer = good(await other.unlock(s.profileId, passphrase));
  const entered = deferred(), release = deferred(); t.after(() => release.resolve());
  s.hooks.afterList = () => { entered.resolve(); return release.promise; };
  const pending = s.send('planRetention', { profileId: s.profileId, nowMs: AGE }); await entered.promise;
  good(await other.commit(writer.sessionId, writer.revision, [{ op: 'put', record: opaque(40) }]));
  const writes = s.store.writes, before = JSON.stringify([...s.store.rows]); release.resolve(); await pending;
  bad(s.last().result, 'CONFLICT');
  assert.equal(s.messages.some(message => message.operation === 'planRetention' && message.result.ok), false);
  assert.equal(s.counts.fresh, 2); assert.equal(s.store.writes, writes); assert.equal(JSON.stringify([...s.store.rows]), before);
});

test('same-session revision changes while classification is held invalidate the preview', async t => {
  const s = await setup(t); await s.open();
  const entered = deferred(), release = deferred(); t.after(() => release.resolve());
  s.hooks.afterList = () => { entered.resolve(); return release.promise; };
  const pending = s.send('planRetention', { profileId: s.profileId, nowMs: AGE }); await entered.promise;
  const session = s.selected(); good(await s.vault.commit(session.sessionId, session.revision, [{ op: 'put', record: opaque(40) }]));
  const writes = s.store.writes; release.resolve(); await pending;
  bad(s.last().result, 'CONFLICT'); assert.equal(s.store.writes, writes);
});

test('selected revision is checked again when it changes after the final persisted read', async t => {
  const s = await setup(t); await s.open();
  s.hooks.afterFresh = async ordinal => {
    if (ordinal !== 2) return;
    const session = s.selected(); good(await s.vault.commit(session.sessionId, session.revision, [{ op: 'put', record: opaque(40) }]));
  };
  const writes = s.store.writes;
  await s.send('planRetention', { profileId: s.profileId, nowMs: AGE });
  bad(s.last().result, 'CONFLICT'); assert.equal(s.store.writes, writes + 1, 'only the deliberate concurrent writer mutates storage');
});

test('lock or endpoint disposal suppresses a held preview and retains encrypted bytes', async t => {
  for (const retire of ['lock', 'dispose']) {
    const s = await setup(t); await s.open();
    const before = JSON.stringify([...s.store.rows]), writes = s.store.writes, entered = deferred(), release = deferred();
    t.after(() => release.resolve()); s.hooks.afterList = () => { entered.resolve(); return release.promise; };
    const pending = s.send('planRetention', { profileId: s.profileId, nowMs: AGE }); await entered.promise;
    if (retire === 'lock') await s.send('lock', {}, 1); else s.endpoint.dispose();
    release.resolve(); await pending;
    assert.equal(s.messages.some(message => message.operation === 'planRetention'), false);
    assert.equal(s.store.writes, writes); assert.equal(JSON.stringify([...s.store.rows]), before);
    if (retire === 'lock') {
      s.hooks.afterList = undefined; await s.open(1);
      await s.send('planRetention', { profileId: s.profileId, nowMs: AGE }, 1); assert.deepEqual(good(s.last().result), preview());
    }
  }
});

test('retention cleanup revocation cannot publish a successful preview', async t => {
  const s = await setup(t); await s.open(); const writes = s.store.writes;
  const originalDispose = RetentionService.prototype.dispose; let retired = false;
  t.mock.method(RetentionService.prototype, 'dispose', function () {
    originalDispose.call(this);
    if (!retired) { retired = true; s.vault.lockAll(); }
  });
  await s.send('planRetention', { profileId: s.profileId, nowMs: AGE });
  assert.equal(retired, true); assert.equal(s.messages.some(message => message.operation === 'planRetention' && message.result.ok), false);
  assert.equal(s.last().result.ok, false); assert.equal(s.store.writes, writes);
});

test('request expiry after local classification suppresses counts without native or storage writes', async t => {
  let clock = 0; const s = await setup(t, mixedRecords(), { now: () => clock }); await s.open();
  const writes = s.store.writes; s.hooks.afterList = () => { clock = 30_000; };
  await s.send('planRetention', { profileId: s.profileId, nowMs: AGE });
  bad(s.last().result, 'TIMEOUT'); assert.equal(s.store.writes, writes);
  assert.equal(s.messages.some(message => message.operation === 'planRetention' && message.result.ok), false);
});

test('malformed preview input closes before classification and unexpected storage errors stay fixed', async t => {
  const malformed = await setup(t); await malformed.open(); const writes = malformed.store.writes;
  await malformed.send('planRetention', { profileId: malformed.profileId, nowMs: -1 });
  assert.equal(malformed.last().kind, 'closed'); assert.equal(malformed.last().code, 'PROTOCOL_ERROR');
  assert.equal(malformed.counts.list, 0); assert.equal(malformed.store.writes, writes);
  const failed = await setup(t); await failed.open(); failed.hooks.afterList = () => { throw Error('PRIVATE storage failure'); };
  await failed.send('planRetention', { profileId: failed.profileId, nowMs: AGE }); bad(failed.last().result, 'STORAGE_UNAVAILABLE');
});

let priorSecure;
beforeEach(() => { priorSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'); Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true }); });
afterEach(() => { if (priorSecure) Object.defineProperty(globalThis, 'isSecureContext', priorSecure); else delete globalThis.isSecureContext; });
class EndpointPort extends EventTarget {
  endpoint; sent = []; tasks = [];
  postMessage(input) { const command = clone(input); this.sent.push(command); const task = Promise.resolve().then(() => this.endpoint.dispatch(command)); this.tasks.push(task); }
  reply(message) { queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: clone(message) }))); }
  terminate() { this.endpoint.dispose(); }
}

test('real AppServices/runtime/Worker composition accepts only explicit current-profile preview calls', async t => {
  const port = new EndpointPort(), s = await setup(t, mixedRecords(), { initialize: false, send: message => port.reply(message) }); port.endpoint = s.endpoint;
  const services = good(await startAppServices({ createWorker: () => port, lifecycle: false })); t.after(() => services.dispose());
  bad(await services.planRetention(AGE), 'LOCKED');
  good(await services.unlock(s.profileId, passphrase));
  const scope = services.selectionScope(), writes = s.store.writes, before = JSON.stringify([...s.store.rows]);
  for (const nowMs of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) bad(await services.planRetention(nowMs), 'INVALID_INPUT');
  const aborted = new AbortController(); aborted.abort(); bad(await services.planRetention(AGE, aborted.signal), 'CANCELLED');
  assert.equal(port.sent.filter(command => command.operation === 'planRetention').length, 0);
  assert.equal(services.current.state, 'unlocked');
  assert.deepEqual(good(await services.planRetention(AGE)), preview());
  const posted = port.sent.find(command => command.operation === 'planRetention');
  assert.equal(posted.profileId, s.profileId); assert.equal(posted.nowMs, AGE); assert.equal(services.selectionScope(), scope);
  for (const unavailable of ['reviewRetention', 'deleteReviewedRecords', 'nativeRetention', 'vault', 'commit']) assert.equal(unavailable in services, false);
  assert.equal(s.store.writes, writes); assert.equal(JSON.stringify([...s.store.rows]), before);
  await services.dispose();
});

test('admitted preview cancellation clears selection, refuses duplicates, suppresses late Worker output, and permits explicit reopen', async t => {
  const port = new EndpointPort(), s = await setup(t, mixedRecords(), { initialize: false, send: message => port.reply(message) }); port.endpoint = s.endpoint;
  const services = good(await startAppServices({ createWorker: () => port, lifecycle: false })); t.after(() => services.dispose());
  good(await services.unlock(s.profileId, passphrase)); const writes = s.store.writes;
  const entered = deferred(), release = deferred(); t.after(() => release.resolve());
  s.hooks.afterList = () => { entered.resolve(); return release.promise; };
  const controller = new AbortController(), pending = services.planRetention(AGE, controller.signal); await entered.promise;
  bad(await services.planRetention(AGE), 'BUSY');
  controller.abort(); assert.equal(services.current.state, 'locked'); bad(await pending, 'CANCELLED');
  await flush(); release.resolve(); await Promise.all(port.tasks); await flush();
  assert.equal(s.messages.some(message => message.operation === 'planRetention' && message.result.ok), false);
  assert.equal(port.sent.filter(command => command.operation === 'planRetention').length, 1);
  s.hooks.afterList = undefined; good(await services.unlock(s.profileId, passphrase));
  assert.deepEqual(good(await services.planRetention(AGE)), preview()); assert.equal(s.store.writes, writes);
  await services.dispose();
});

/** Synthetic transport only for the document boundary's delivery ordering. */
class ReplyPort extends EventTarget {
  sent = []; pending; terminated = 0; opened = 0;
  postMessage(command) {
    this.sent.push(clone(command));
    if (command.operation === 'planRetention') { this.pending = clone(command); return; }
    const value = command.operation === 'unlock' ? { state: 'unlocked', handle: { id: `${this.opened++ ? 'B' : 'A'}`.repeat(42) + 'A',
      generation: command.generation, purpose: 'vault', profileId: command.profileId } } : { state: 'locked', handle: null };
    queueMicrotask(() => this.reply(command, value));
  }
  reply(command, value) { this.dispatchEvent(new MessageEvent('message', { data: { version: 1, requestId: command.requestId,
    generation: command.generation, operation: command.operation, kind: 'response', result: { ok: true, value } } })); }
  terminate() { this.terminated++; }
}

test('a settled preview cannot escape a lock or same-profile selection replacement before its public continuation', async t => {
  for (const retire of ['lock', 'reopen']) {
    const port = new ReplyPort(), services = good(await startAppServices({ createWorker: () => port, lifecycle: false })); t.after(() => services.dispose());
    good(await services.unlock(id(1), passphrase)); const before = services.selectionScope();
    const pending = services.planRetention(AGE); port.reply(port.pending, preview());
    const changing = retire === 'lock' ? services.lock() : services.unlock(id(1), passphrase);
    bad(await pending, 'LOCKED'); good(await changing); assert.ok(services.selectionScope() > before);
  }
});

test('malformed Worker preview closes the document runtime without granting a projection', async t => {
  const port = new ReplyPort(), services = good(await startAppServices({ createWorker: () => port, lifecycle: false })); t.after(() => services.dispose());
  good(await services.unlock(id(1), passphrase));
  const pending = services.planRetention(AGE); port.reply(port.pending, preview({ reviewedDeleteCount: 1 }));
  bad(await pending, 'PROTOCOL_ERROR'); assert.equal(services.current.state, 'locked'); assert.equal(port.terminated, 1);
});

test('retention pending metadata retains only operation, generation and selected profile correlation', () => {
  const command = parseRuntimeCommand({ version: 1, requestId: 1, generation: 4, operation: 'planRetention', profileId: id(1), nowMs: AGE });
  const metadata = capturePendingMetadata(command);
  assert.deepEqual(metadata, { operation: 'planRetention', generation: 4, profileId: id(1) }); assert.equal(Object.isFrozen(metadata), true);
});
