import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AppRuntime } from '../src/runtime/app-runtime.ts';
import { startAppServices } from '../src/app-services.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { runtimeFailure } from '../../../packages/schemas/index.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';

const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
const profileId = 'a'.repeat(32), passphrase = 'runtime backup lease fixture passphrase';
const locked = { state: 'locked', handle: null };
const fixture = JSON.parse(await readFile(new URL('../../../packages/storage/test/fixtures/vault-python-v1.json', import.meta.url)));
const clone = value => structuredClone(value);
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const refused = (promise, code) => assert.rejects(promise, error => error?.code === code);
const flush = () => new Promise(resolve => setImmediate(resolve));
let previousSecure;
beforeEach(() => {
  previousSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
});
afterEach(() => {
  if (previousSecure) Object.defineProperty(globalThis, 'isSecureContext', previousSecure);
  else delete globalThis.isSecureContext;
});

class Port extends EventTarget {
  sent = []; held = []; holds = new Set(); state = locked; terminated = 0; openings = 0;
  postMessage(input) {
    const command = clone(input); this.sent.push(command);
    if (command.operation === 'unlock' || command.operation === 'create') {
      this.state = { state: 'unlocked', handle: { id: Buffer.alloc(32, ++this.openings).toString('base64url'),
        generation: command.generation, profileId: command.profileId ?? 'b'.repeat(32), purpose: 'vault' } };
    } else if (command.operation === 'lock' || command.operation === 'dispose') this.state = locked;
    const output = command.operation === 'checkBackupVerification' ? { verification: { profileId,
      revision: 0, scope: 'complete-profile-v1', envelopeSha256: '1'.repeat(64), backupSha256: '2'.repeat(64) } } : this.state;
    const pending = { command, result: { ok: true, value: output } };
    if (this.holds.has(command.operation)) this.held.push(pending);
    else queueMicrotask(() => this.reply(pending));
  }
  reply(pending, result = pending.result) {
    const { version, requestId, generation, operation } = pending.command;
    this.dispatchEvent(new MessageEvent('message', { data: { version, requestId, generation, operation, kind: 'response', result } }));
  }
  take(operation) {
    const index = this.held.findIndex(item => item.command.operation === operation);
    assert.notEqual(index, -1, `held ${operation} request`);
    return this.held.splice(index, 1)[0];
  }
  terminate() { this.terminated++; }
}
async function runtimeSetup(options = {}) {
  const port = new Port(), runtime = value(await AppRuntime.start(config, { createWorker: () => port, lifecycle: false, ...options }));
  return { port, runtime };
}
async function selected(options = {}) {
  const state = await runtimeSetup(options);
  try {
    value(await state.runtime.unlock(profileId, passphrase));
    return { ...state, lease: state.runtime.captureBackupSelection() };
  } catch (error) { await state.runtime.dispose(); throw error; }
}

test('a backup selection is opaque, current only when selected, and disposal has no vault side effect', async () => {
  const { port, runtime } = await runtimeSetup();
  try {
    assert.equal(runtime.captureBackupSelection(), null);
    value(await runtime.unlock(profileId, passphrase));
    const before = port.sent.length, lease = runtime.captureBackupSelection();
    assert.deepEqual(Object.keys(lease).sort(), ['current', 'dispose', 'lock', 'requireVerifiedBackup']);
    assert.equal(Object.isFrozen(lease), true); assert.equal(lease.current(), true);
    assert.equal(port.sent.length, before, 'capture and currentness do not send a command');
    lease.dispose(); lease.dispose(); assert.equal(lease.current(), false);
    assert.equal(runtime.current.state, 'unlocked'); assert.equal(port.sent.length, before);
    assert.equal(runtime.captureBackupSelection().current(), true);
  } finally { await runtime.dispose(); }
  assert.equal(runtime.captureBackupSelection(), null);
});

test('its own lock becomes current only after the exact acknowledged transition', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('lock'); const locking = lease.lock(new AbortController().signal);
    assert.equal(runtime.current.state, 'locked'); assert.equal(lease.current(), false);
    assert.equal(runtime.captureBackupSelection(), null);
    const pending = port.take('lock'); port.reply(pending);
    assert.equal(await locking, undefined); assert.equal(lease.current(), true);
    value(await runtime.status()); assert.equal(lease.current(), true, 'a read-only status check preserves the transition');
    await refused(lease.lock(new AbortController().signal), 'LOCKED');
    assert.equal(port.sent.filter(command => command.operation === 'lock').length, 1, 'a lease cannot lock twice');
  } finally { await runtime.dispose(); }
});

test('a second lock before the first acknowledgment retires the first lease and ignores its late result', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('lock'); const first = lease.lock(new AbortController().signal), firstReply = port.take('lock');
    const second = runtime.lock(), secondReply = port.take('lock');
    await refused(first, 'LOCKED'); assert.equal(lease.current(), false);
    port.reply(firstReply); port.reply(secondReply); value(await second); assert.equal(lease.current(), false);
    assert.equal(secondReply.command.generation, firstReply.command.generation + 1);
  } finally { await runtime.dispose(); }
});

test('a second lock after acknowledgment retires the lease even though the facade selection scope stays locked', async () => {
  const port = new Port(), services = value(await startAppServices({ createWorker: () => port, lifecycle: false }));
  try {
    value(await services.unlock(profileId, passphrase)); const before = services.selectionScope();
    const lease = services.captureBackupSelection(); await lease.lock(new AbortController().signal);
    assert.equal(lease.current(), true); const after = services.selectionScope(); assert.equal(after, before + 1);
    const repeated = services.lock(); assert.equal(lease.current(), false); value(await repeated);
    assert.equal(services.selectionScope(), after, 'existing UI counter semantics remain unchanged');
    assert.deepEqual(services.current, { state: 'locked' });
  } finally { await services.dispose(); }
});

test('lock acknowledgment reentrancy cannot publish ownership after a further lock', async () => {
  const { port, runtime, lease } = await selected(); let repeated;
  const reenter = event => {
    if (event.data.operation === 'lock' && event.data.result.ok) {
      port.removeEventListener('message', reenter); repeated = runtime.lock();
    }
  };
  try {
    port.addEventListener('message', reenter);
    await refused(lease.lock(new AbortController().signal), 'LOCKED');
    if (repeated) value(await repeated); assert.equal(lease.current(), false);
  } finally { port.removeEventListener('message', reenter); await runtime.dispose(); }
});

test('one lease cannot adopt the owned lock of another lease captured from the same selection', async () => {
  const { port, runtime, lease } = await selected();
  try {
    const other = runtime.captureBackupSelection();
    await lease.lock(new AbortController().signal); assert.equal(lease.current(), true); assert.equal(other.current(), false);
    await refused(other.lock(new AbortController().signal), 'LOCKED');
    assert.equal(port.sent.filter(command => command.operation === 'lock').length, 1);
  } finally { await runtime.dispose(); }
});

for (const operation of ['lock', 'requireVerifiedBackup']) {
  test(`cancellation observed during the ${operation} preflight retires the lease before a new command`, async () => {
    let duringClock = () => {}; const { port, runtime, lease } = await selected({ now: () => { duringClock(); return 0; } });
    try {
      const abort = new AbortController(), before = port.sent.length; duringClock = () => abort.abort();
      await refused(lease[operation](abort.signal), 'CANCELLED');
      duringClock = () => {}; assert.equal(lease.current(), false);
      assert.equal(port.sent.length, before); assert.equal(runtime.current.state, 'unlocked');
    } finally { duringClock = () => {}; await runtime.dispose(); }
  });
}

for (const operation of ['unlock', 'create']) for (const outcome of ['success', 'refusal']) {
  test(`an admitted ${operation} retires an owned locked lease before its ${outcome} reply`, async () => {
    const { port, runtime, lease } = await selected();
    try {
      await lease.lock(new AbortController().signal); assert.equal(lease.current(), true);
      port.holds.add(operation);
      const opening = operation === 'unlock' ? runtime.unlock(profileId, passphrase) : runtime.create(passphrase);
      const pending = port.take(operation);
      assert.equal(lease.current(), false, 'retirement happens at admission, including a same-profile reopen');
      port.reply(pending, outcome === 'refusal' ? runtimeFailure('AUTHENTICATION_FAILED') : pending.result);
      if (outcome === 'success') value(await opening); else assert.equal((await opening).error.code, 'AUTHENTICATION_FAILED');
      assert.equal(lease.current(), false);
    } finally { await runtime.dispose(); }
  });
}

test('a different profile opening retires an unlocked lease immediately and cannot revive it', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('unlock'); const opening = runtime.unlock('c'.repeat(32), passphrase);
    assert.equal(lease.current(), false); port.reply(port.take('unlock')); value(await opening);
    assert.equal(lease.current(), false); assert.equal(runtime.captureBackupSelection().current(), true);
  } finally { await runtime.dispose(); }
});

test('refused opening inputs and a busy opening do not claim an admitted selection change', async () => {
  const { port, runtime, lease } = await selected();
  try {
    await lease.lock(new AbortController().signal);
    assert.equal((await runtime.unlock('invalid', passphrase)).error.code, 'INVALID_INPUT');
    const aborted = new AbortController(); aborted.abort();
    assert.equal((await runtime.create(passphrase, aborted.signal)).error.code, 'CANCELLED');
    assert.equal(lease.current(), true);
    port.holds.add('status'); const status = runtime.status();
    assert.equal((await runtime.unlock(profileId, passphrase)).error.code, 'BUSY'); assert.equal(lease.current(), true);
    port.reply(port.take('status')); value(await status); assert.equal(lease.current(), true);
  } finally { await runtime.dispose(); }
});

test('pre-cancelled owned lock retires its lease without sending a lock or changing the selected profile', async () => {
  const { port, runtime, lease } = await selected();
  try {
    const before = port.sent.length, abort = new AbortController(); abort.abort();
    await refused(lease.lock(abort.signal), 'CANCELLED'); assert.equal(lease.current(), false);
    assert.equal(port.sent.length, before); assert.equal(runtime.current.state, 'unlocked');
  } finally { await runtime.dispose(); }
});

test('cancellation during an owned lock does not undo or acknowledge the physical lock', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('lock'); const abort = new AbortController(), locking = lease.lock(abort.signal), reply = port.take('lock');
    abort.abort(); assert.equal(lease.current(), false); assert.equal(runtime.current.state, 'locked');
    port.reply(reply); await refused(locking, 'CANCELLED'); assert.equal(lease.current(), false);
    assert.equal(port.sent.filter(command => command.operation === 'lock').length, 1);
  } finally { await runtime.dispose(); }
});

test('disposing a lease during its held lock prevents a late acknowledgment from reviving it', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('lock'); const locking = lease.lock(new AbortController().signal), reply = port.take('lock');
    lease.dispose(); assert.equal(lease.current(), false); port.reply(reply);
    await refused(locking, 'LOCKED'); assert.equal(lease.current(), false);
    assert.equal(port.sent.filter(command => command.operation === 'lock').length, 1);
  } finally { await runtime.dispose(); }
});

test('runtime disposal retires a held own-lock attempt before late Worker output', async () => {
  const { port, runtime, lease } = await selected();
  port.holds.add('lock'); const locking = lease.lock(new AbortController().signal), reply = port.take('lock');
  const disposed = runtime.dispose(); await refused(locking, 'LOCKED'); await disposed;
  port.reply(reply); assert.equal(lease.current(), false); assert.equal(port.terminated, 1);
});

test('a failed lock acknowledgment cannot attest an owned transition', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('lock'); const locking = lease.lock(new AbortController().signal);
    port.reply(port.take('lock'), runtimeFailure('STORAGE_UNAVAILABLE'));
    await refused(locking, 'STORAGE_UNAVAILABLE'); assert.equal(lease.current(), false);
  } finally { await runtime.dispose(); }
});

test('a non-lock result cannot stand in for the owned lock acknowledgment', async () => {
  const { port, runtime, lease } = await selected(); const prior = runtime.current;
  try {
    port.holds.add('lock'); const locking = lease.lock(new AbortController().signal);
    port.reply(port.take('lock'), { ok: true, value: prior });
    await refused(locking, 'PROTOCOL_ERROR'); assert.equal(lease.current(), false); assert.equal(port.terminated, 1);
  } finally { await runtime.dispose(); }
});

test('request timeout closes the runtime and retires the owned lock without accepting a late acknowledgment', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('lock'); const locking = lease.lock(new AbortController().signal), reply = port.take('lock');
    const rejected = refused(locking, 'TIMEOUT'); t.mock.timers.tick(30_000); await rejected;
    port.reply(reply); assert.equal(lease.current(), false); assert.equal(port.terminated, 1);
  } finally { await runtime.dispose(); t.mock.timers.reset(); }
});

test('idle expiry and Worker termination retire captured selections', async () => {
  let now = 0; const first = await selected({ now: () => now });
  try { now = 300_000; assert.equal(first.lease.current(), false); await flush(); assert.equal(first.runtime.current.state, 'locked'); }
  finally { await first.runtime.dispose(); }
  const second = await selected();
  try { second.port.dispatchEvent(new Event('error')); assert.equal(second.lease.current(), false); assert.equal(second.port.terminated, 1); }
  finally { await second.runtime.dispose(); }
});

test('pagehide retires a captured selection through the existing document lock path', async () => {
  const priorWindow = globalThis.window, priorDocument = globalThis.document;
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget(); let state;
  try {
    state = await selected({ lifecycle: true }); globalThis.window.dispatchEvent(new Event('pagehide'));
    assert.equal(state.lease.current(), false); await flush(); assert.equal(state.runtime.current.state, 'locked');
  } finally {
    await state?.runtime.dispose();
    if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
    if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
  }
});

test('fresh verification refuses a current-looking late result after another lock', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('checkBackupVerification'); const checking = lease.requireVerifiedBackup(new AbortController().signal), reply = port.take('checkBackupVerification');
    const locking = runtime.lock(); await refused(checking, 'LOCKED'); value(await locking);
    port.reply(reply); assert.equal(lease.current(), false);
  } finally { await runtime.dispose(); }
});

test('lease disposal during verification rejects the late result without adding a lock command', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('checkBackupVerification'); const checking = lease.requireVerifiedBackup(new AbortController().signal), reply = port.take('checkBackupVerification');
    lease.dispose(); port.reply(reply); await refused(checking, 'LOCKED');
    assert.equal(runtime.current.state, 'unlocked'); assert.equal(port.sent.some(command => command.operation === 'lock'), false);
  } finally { await runtime.dispose(); }
});

test('verification cancellation uses the existing request cancellation and never restores lease ownership', async () => {
  const { port, runtime, lease } = await selected();
  try {
    port.holds.add('checkBackupVerification'); const abort = new AbortController(), checking = lease.requireVerifiedBackup(abort.signal), reply = port.take('checkBackupVerification');
    abort.abort(); await refused(checking, 'CANCELLED'); port.reply(reply); await flush();
    assert.equal(lease.current(), false); assert.equal(runtime.current.state, 'locked');
  } finally { await runtime.dispose(); }
});

class Store {
  rows = new Map([[fixture.envelope.profileId, clone(fixture.envelope)]]); writes = 0;
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(envelope, options) {
    options?.assertCurrent?.(); if (this.rows.has(envelope.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(envelope.profileId, clone(envelope)); this.writes++;
  }
  async compareAndSwap(before, after, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
    this.rows.set(after.profileId, clone(after)); this.writes++;
  }
  subscribeInvalidation() { return () => {}; }
}
async function realServices() {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), backup = new EncryptedBackupService(store);
  class RealPort extends EventTarget {
    endpoint; sent = [];
    postMessage(input) { const command = clone(input); this.sent.push(command.operation); queueMicrotask(() => void this.endpoint.dispatch(command)); }
    reply(message) { queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: clone(message) }))); }
    terminate() { this.endpoint.dispose(); }
  }
  const port = new RealPort(); port.endpoint = createVaultWorkerEndpoint(message => port.reply(message), { createServices: () => ({ vault, backup }) });
  const services = value(await startAppServices({ createWorker: () => port, lifecycle: false }));
  return { store, vault, backup, port, services };
}

test('the actual Worker fact is required afresh; export and a later mutation do not establish backup verification', async () => {
  const { store, backup, port, services } = await realServices();
  try {
    value(await services.unlock(fixture.envelope.profileId, fixture.passphrase)); const lease = services.captureBackupSelection();
    await refused(lease.requireVerifiedBackup(new AbortController().signal), 'CONFLICT');
    const bytes = (await backup.export(fixture.envelope.profileId));
    await refused(lease.requireVerifiedBackup(new AbortController().signal), 'CONFLICT');
    value(await services.verifyBackup(bytes, fixture.passphrase));
    for (let index = 0; index < 2; index++) assert.equal(await lease.requireVerifiedBackup(new AbortController().signal), undefined);
    assert.equal(port.sent.filter(operation => operation === 'checkBackupVerification').length, 4);
    assert.equal(store.writes, 0, 'capture and authentication do not write the vault');
    value(await services.saveTermsReview('file', new Uint8Array([1])));
    await refused(lease.requireVerifiedBackup(new AbortController().signal), 'CONFLICT');
    assert.equal(lease.current(), true, 'selection ownership is distinct from backup freshness'); assert.equal(store.writes, 1);
  } finally { await services.dispose(); }
});

test('real Worker own-lock completes without inheriting backup proof into a reopened profile', async () => {
  const { backup, services } = await realServices();
  try {
    value(await services.unlock(fixture.envelope.profileId, fixture.passphrase));
    const bytes = await backup.export(fixture.envelope.profileId); value(await services.verifyBackup(bytes, fixture.passphrase));
    const lease = services.captureBackupSelection(); await lease.requireVerifiedBackup(new AbortController().signal);
    await lease.lock(new AbortController().signal); assert.equal(lease.current(), true); assert.deepEqual(services.current, { state: 'locked' });
    await refused(lease.requireVerifiedBackup(new AbortController().signal), 'LOCKED');
    value(await services.unlock(fixture.envelope.profileId, fixture.passphrase)); assert.equal(lease.current(), false);
    const reopened = services.captureBackupSelection(); assert.equal(reopened.current(), true);
    await refused(reopened.requireVerifiedBackup(new AbortController().signal), 'CONFLICT');
  } finally { await services.dispose(); }
});
