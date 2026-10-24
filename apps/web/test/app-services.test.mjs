import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startAppServices } from '../src/app-services.ts';
let priorSecure;
beforeEach(() => { priorSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'); Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true }); });
afterEach(() => { if (priorSecure) Object.defineProperty(globalThis, 'isSecureContext', priorSecure); else delete globalThis.isSecureContext; });
const flush = () => new Promise(resolve => setImmediate(resolve));
class Port extends EventTarget {
  terminated = 0; held; holdUnlock = false; state = { state: 'locked', handle: null };
  postMessage(command) {
    const { config, profileId, passphrase, ...base } = command;
    if (command.operation === 'unlock') {
      this.state = { state: 'unlocked', handle: { id: 'A'.repeat(43), generation: command.generation, profileId, purpose: 'vault' } };
      if (this.holdUnlock) { this.held = { base, value: this.state }; return; }
    }
    if (command.operation === 'lock' || command.operation === 'dispose') this.state = { state: 'locked', handle: null };
    queueMicrotask(() => this.reply(base, this.state));
  }
  reply(base, value) { this.dispatchEvent(new MessageEvent('message', { data: { ...base, kind: 'response', result: { ok: true, value } } })); }
  terminate() { this.terminated++; }
}
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const begin = async port => value(await startAppServices({ createWorker: () => port, lifecycle: false }));

test('facade startup is locked, has stable state-only snapshots and rejects insecure startup before construction', async () => {
  let calls = 0;
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: false });
  const rejected = await startAppServices({ createWorker: () => { calls++; return new Port(); }, lifecycle: false });
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'UNSUPPORTED_ENVIRONMENT'); assert.equal(calls, 0);
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  const port = new Port(), services = await begin(port);
  assert.deepEqual(services.getSnapshot(), { state: 'locked' }); assert.equal(services.current, services.getSnapshot());
  for (const forbidden of ['handle', 'provider', 'records', 'create', 'restore', 'sign', 'submit', 'read', 'fetch']) assert.equal(forbidden in services, false);
  await services.dispose(); assert.equal(port.terminated, 1);
});
test('observers receive unlock and synchronous lock revocation without exposing private runtime handles', async () => {
  const port = new Port(), services = await begin(port); let observed = 0;
  const bad = services.subscribe(() => { throw Error('synthetic observer failure'); });
  const stop = services.subscribe(() => { observed++; assert.deepEqual(Object.keys(services.getSnapshot()), ['state']); });
  assert.deepEqual(value(await services.unlock('a'.repeat(32), 'local facade fixture passphrase')), { state: 'unlocked' });
  await flush(); assert.equal(observed, 1); const unlocked = services.getSnapshot();
  assert.equal(value(await services.status()), unlocked);
  const locking = services.lock(); assert.deepEqual(services.getSnapshot(), { state: 'locked' });
  value(await locking); await flush(); assert.equal(observed, 2);
  stop(); bad(); await services.dispose(); await flush(); assert.equal(observed, 2);
});
test('observer reentrancy cannot publish an unlock after that observer locks the generation', async () => {
  const services = await begin(new Port()); let locking;
  const stop = services.subscribe(() => { if (services.current.state === 'unlocked') locking = services.lock(); });
  const opened = await services.unlock('a'.repeat(32), 'local facade fixture passphrase');
  assert.equal(opened.ok, false); assert.equal(opened.error.code, 'LOCKED');
  if (locking) await locking; assert.equal(services.current.state, 'locked'); stop(); await services.dispose();
});
test('unsubscribe during another observer callback suppresses the removed callback immediately', async () => {
  const services = await begin(new Port()); let removedCalls = 0, removeSecond = () => {};
  const first = services.subscribe(() => removeSecond());
  removeSecond = services.subscribe(() => { removedCalls++; });
  value(await services.unlock('a'.repeat(32), 'local facade fixture passphrase')); await flush();
  assert.equal(removedCalls, 0); first(); await services.dispose();
});
test('disposal invalidates pending unlock and ignores its late response without publishing plaintext', async () => {
  const port = new Port(), services = await begin(port); port.holdUnlock = true;
  const pending = services.unlock('a'.repeat(32), 'local facade fixture passphrase'); await flush();
  const disposing = services.dispose(); assert.equal(services.current.state, 'locked');
  const opened = await pending; assert.equal(opened.ok, false); assert.equal(opened.error.code, 'LOCKED');
  port.reply(port.held.base, port.held.value); await disposing; await flush();
  assert.deepEqual(services.current, { state: 'locked' }); assert.doesNotMatch(JSON.stringify(services.current), /passphrase|profileId|handle|sessionId/);
});
