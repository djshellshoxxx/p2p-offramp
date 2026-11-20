import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startAppServices } from '../src/app-services.ts';

// Document boundary only: this port does not authenticate a file or implement native Worker isolation.
const profile = 'a'.repeat(32), passphrase = 'independent document fixture passphrase';
const receipt = (profileId = profile) => ({
  profileId, revision: 3, scope: 'complete-profile-v1', envelopeSha256: 'b'.repeat(64), backupSha256: 'c'.repeat(64),
});
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const err = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); };
const tick = () => new Promise(resolve => setImmediate(resolve));
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
  sent = []; owned = []; terminated = 0; handler; openings = 0;
  postMessage(value) {
    const command = structuredClone(value);
    this.owned.push(value); this.sent.push(command);
    queueMicrotask(() => this.handler(command));
  }
  deliver(command, value) {
    const { version, requestId, generation, operation } = command;
    this.dispatchEvent(new MessageEvent('message', {
      data: structuredClone({ version, requestId, generation, operation, kind: 'response', result: { ok: true, value } }),
    }));
  }
  ordinary(command) {
    const value = command.operation === 'unlock' ? {
      state: 'unlocked', handle: {
        id: (++this.openings % 2 ? 'A' : 'B').repeat(42) + 'A', generation: command.generation,
        purpose: 'vault', profileId: command.profileId,
      },
    } : { state: 'locked', handle: null };
    this.deliver(command, value);
  }
  terminate() { this.terminated++; }
}
async function setup(handler) {
  const port = new Port();
  port.handler = command => handler?.(command, port) ?? port.ordinary(command);
  const services = val(await startAppServices({ createWorker: () => port, lifecycle: false }));
  val(await services.unlock(profile, passphrase));
  return { port, services };
}

for (const operation of ['verifyBackup', 'checkBackupVerification']) {
  test(`${operation} refuses a receipt retired between message settlement and publication`, async () => {
    const s = await setup((command, port) => {
      if (command.operation !== operation) return;
      port.deliver(command, operation === 'verifyBackup' ? receipt() : { verification: receipt() });
      return true;
    });
    let replacement;
    const retire = event => {
      if (event.data.operation !== operation) return;
      s.port.removeEventListener('message', retire);
      replacement = s.services.unlock(profile, passphrase);
    };
    s.port.addEventListener('message', retire);
    try {
      const pending = operation === 'verifyBackup'
        ? s.services.verifyBackup(new Uint8Array([17]), passphrase)
        : s.services.checkBackupVerification();
      err(await pending, 'LOCKED'); val(await replacement);
      assert.equal(s.services.current.state, 'unlocked');
      const deliveries = s.port.sent.filter(command => command.operation === 'unlock');
      assert.equal(deliveries.length, 2);
      assert.equal(deliveries[0].generation, deliveries[1].generation, 'identity changes within the same generation');
      assert.equal(s.port.terminated, 0);
    } finally { s.port.removeEventListener('message', retire); await s.services.dispose(); }
  });
}

test('check receipt from another profile closes before returning verification', async () => {
  const s = await setup((command, port) => {
    if (command.operation !== 'checkBackupVerification') return;
    port.deliver(command, { verification: receipt('d'.repeat(32)) }); return true;
  });
  try {
    err(await s.services.checkBackupVerification(), 'PROTOCOL_ERROR');
    assert.equal(s.services.current.state, 'locked'); assert.equal(s.port.terminated, 1);
  } finally { await s.services.dispose(); }
});

test('aborted verification cannot settle a current check or reuse caller bytes after reopening', async () => {
  let verification, check;
  const s = await setup((command) => {
    if (command.operation === 'verifyBackup') { verification = command; return true; }
    if (command.operation === 'checkBackupVerification') { check = command; return true; }
  });
  const controller = new AbortController(), input = new Uint8Array([17, 23, 31]);
  let current;
  try {
    const pending = s.services.verifyBackup(input, passphrase, controller.signal);
    input.fill(99); await tick();
    assert.deepEqual([...verification.bytes], [17, 23, 31], 'the transport snapshot precedes caller reuse');
    assert.notEqual(verification.bytes, input);
    const owned = s.port.owned.find(command => command.operation === 'verifyBackup').bytes;
    assert.notEqual(owned, input); assert.deepEqual([...owned], [0, 0, 0], 'the parser-owned copy is retired after posting');
    controller.abort(); assert.equal(s.services.current.state, 'locked');
    err(await pending, 'CANCELLED'); await tick();
    val(await s.services.unlock(profile, passphrase));
    let settled = false;
    current = s.services.checkBackupVerification(); void current.then(() => { settled = true; });
    await tick();
    assert.ok(check.generation > verification.generation);
    s.port.deliver(verification, receipt()); await tick();
    assert.equal(settled, false, 'the old result cannot fulfill the current request');
    assert.equal(s.services.current.state, 'unlocked'); assert.equal(s.port.terminated, 0);
    s.port.deliver(check, { verification: null });
    assert.equal(val(await current).verification, null);
    assert.deepEqual([...input], [99, 99, 99], 'retirement does not wipe caller-owned memory');
    assert.equal(s.port.sent.filter(command => command.operation === 'verifyBackup').length, 1, 'no automatic retry');
  } finally { await s.services.dispose(); await current; }
});

test('a synchronous posting failure clears the owned file copy and closes without a retry', async () => {
  const s = await setup(), ordinaryPost = s.port.postMessage.bind(s.port);
  let attempted, attempts = 0;
  s.port.postMessage = command => {
    if (command.operation === 'verifyBackup') { attempted = command; attempts++; throw Error('fixture transport failure'); }
    return ordinaryPost(command);
  };
  const input = new Uint8Array([5, 13]);
  try {
    err(await s.services.verifyBackup(input, passphrase), 'STORAGE_UNAVAILABLE');
    assert.notEqual(attempted.bytes, input); assert.deepEqual([...attempted.bytes], [0, 0]);
    assert.deepEqual([...input], [5, 13]); assert.equal(s.services.current.state, 'locked');
    assert.equal(s.port.terminated, 1); assert.equal(attempts, 1);
    err(await s.services.checkBackupVerification(), 'LOCKED');
    assert.equal(s.port.sent.some(command => command.operation === 'checkBackupVerification'), false);
  } finally { await s.services.dispose(); }
});
