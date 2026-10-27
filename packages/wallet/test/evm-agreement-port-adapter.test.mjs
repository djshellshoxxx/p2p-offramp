import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { createEvmAgreementHost } from './lib/evm-agreement-host.ts';
import { fixture, privateVectors } from './lib/g16-bundle-fixture.mjs';
import { parseEvmAgreementCheckReply } from '../../schemas/src/evm-agreement-protocol.ts';
import { parseEvmAgreementControlAck, parseEvmAgreementHostClosed } from '../../schemas/src/evm-agreement-control.ts';

// Only this exact absent target is an expected RED. Transitive import failures must surface.
const target = new URL('./lib/evm-agreement-port-adapter.ts', import.meta.url);
let api = {};
try { api = await import(target.href); }
catch (error) { if (error?.code !== 'ERR_MODULE_NOT_FOUND' || error?.url !== target.href) throw error; }

const TIMEOUT = { timeout: 30000 };
const PRIVATE = /PRIVATE-ADAPTER|paymentInstructions|agreementSalt|signature|https:\/\//;
const check = (input, requestId, generation = 0) => ({ version: 1, requestId, generation, operation: 'checkEvmAgreement', input });
const control = (operation, requestId, generation = 0) => ({ version: 1, requestId, generation, operation, kind: 'control' });
const invalidate = (requestId, generation = 0) => control('invalidateEvmAgreement', requestId, generation);
const dispose = (requestId, generation = 0) => control('disposeEvmAgreementHost', requestId, generation);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function publicFrame(frame) {
  assert.doesNotMatch(JSON.stringify(frame), PRIVATE);
  if (frame.kind === 'response') return parseEvmAgreementCheckReply(frame);
  if (frame.kind === 'ack') return parseEvmAgreementControlAck(frame);
  return parseEvmAgreementHostClosed(frame);
}
function make(host, send) {
  assert.equal(typeof api.createEvmAgreementPortAdapter, 'function', 'missing createEvmAgreementPortAdapter');
  const adapter = api.createEvmAgreementPortAdapter(host, send);
  for (const key of ['receive', 'close', 'drain']) assert.equal(typeof adapter[key], 'function', key);
  return adapter;
}

// The actual native digest starts before the trusted gate. Release observes native completion,
// then settles the wrapper the real verifier awaited. Counters never substitute for host drain.
function heldSha(holdAt) {
  const entered = deferred(), calls = [];
  let active = 0, maximumActive = 0;
  return { calls, entered: entered.promise,
    get active() { return active; }, get maximumActive() { return maximumActive; },
    sha256: async bytes => {
      const gate = deferred(), native = crypto.subtle.digest('SHA-256', bytes);
      void native.catch(() => {});
      const call = { bytes, gate, native, capturedNonzero: bytes.some(byte => byte !== 0) };
      calls.push(call); active++; maximumActive = Math.max(maximumActive, active);
      try {
        if (calls.length === holdAt) { entered.resolve(call); await gate.promise; }
        return await native;
      } finally { active--; }
    },
    async release(mode = 'resolve') {
      const call = calls[holdAt - 1]; assert.ok(call, 'held SHA entered');
      await call.native;
      if (mode === 'reject') call.gate.reject(Error('PRIVATE-ADAPTER backend https://private.invalid'));
      else call.gate.resolve();
    },
    releaseAll() { for (const call of calls) call.gate.resolve(); },
  };
}

// For nonterminal invalidation there is no terminal drain to await before reusing this host.
// Observe the actual held=false state after real backend release. The test timeout aborts
// this loop; no fixed number of event-loop turns is treated as evidence of settlement.
async function physicallyIdle(t, host) {
  while (host.physicalState().held) {
    t.signal.throwIfAborted();
    await new Promise(done => setImmediate(done));
  }
}

function direct(t, { backend, send } = {}) {
  const host = createEvmAgreementHost(backend ? { sha256: backend.sha256 } : {}), frames = [];
  let adapter;
  t.after(async () => {
    try { adapter?.close(); }
    finally { host.dispose(); backend?.releaseAll(); await host.disposeAndDrain(); }
  });
  adapter = make(host, send ?? (frame => frames.push(publicFrame(frame))));
  return { host, adapter, frames };
}

// These cases cross a real structured-clone boundary in both directions. Hostile-object and
// throwing-send seams below are deliberately direct cases: those objects cannot be cloned.
function messageSession(t, backend) {
  const channel = new MessageChannel(), frames = [], waiters = [], handlers = new Map();
  const host = createEvmAgreementHost(backend ? { sha256: backend.sha256 } : {});
  let adapter, failure;
  const fail = error => {
    failure = error;
    for (const waiter of waiters.splice(0)) waiter.reject(error);
    for (const handler of handlers.values()) handler.reject(error);
  };
  t.after(async () => {
    channel.port1.close(); channel.port2.close();
    try { adapter?.close(); }
    finally { host.dispose(); backend?.releaseAll(); await host.disposeAndDrain(); }
  });
  adapter = make(host, frame => channel.port1.postMessage(frame));
  channel.port1.on('message', frame => {
    const handler = handlers.get(frame.requestId);
    try {
      const handling = adapter.receive(frame);
      assert.ok(handling instanceof Promise, 'receive returns its logical handling Promise');
      handling.then(() => { handlers.delete(frame.requestId); handler.resolve(); }, fail);
    } catch (error) { fail(error); }
  });
  channel.port1.on('messageerror', fail); channel.port2.on('messageerror', fail);
  channel.port2.on('message', frame => {
    try {
      const parsed = publicFrame(frame); frames.push(parsed);
      for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].match(parsed)) {
        const [waiter] = waiters.splice(i, 1); waiter.resolve(parsed);
      }
    } catch (error) { fail(error); }
  });
  return { host, adapter, frames,
    send(frame) {
      if (failure) return Promise.reject(failure);
      const handling = deferred(); handlers.set(frame.requestId, handling);
      void handling.promise.catch(() => {});
      channel.port2.postMessage(frame);
      return handling.promise;
    },
    wait(match) {
      if (failure) return Promise.reject(failure);
      const found = frames.find(match); if (found) return Promise.resolve(found);
      const waiter = { ...deferred(), match }; waiters.push(waiter); return waiter.promise;
    },
  };
}
const replyFor = (session, requestId) => session.wait(frame => frame.kind === 'response' && frame.requestId === requestId);
const ackFor = (session, requestId) => session.wait(frame => frame.kind === 'ack' && frame.requestId === requestId);

test('MessageChannel coherent signed fixture produces the real public verifier reply', TIMEOUT, async t => {
  const bundle = await fixture(), before = structuredClone(bundle), s = messageSession(t);
  const handled = s.send(check(bundle, 1)), reply = await replyFor(s, 1);
  await handled;
  assert.deepEqual(reply, { version: 1, requestId: 1, generation: 0, operation: 'checkEvmAgreement', kind: 'response', result: {
    ok: true, value: { testOnly: true, economicPreparationAllowed: false, termsHash: bundle.acceptances[0].termsHash,
      accounts: { seller: bundle.terms.seller, buyer: bundle.terms.buyer } },
  } });
  assert.deepEqual(bundle, before, 'structured-clone input stays caller owned');
  await s.adapter.drain();
  assert.deepEqual(s.host.physicalState(), { generation: 0, held: false, terminal: true });
});

for (const holdAt of [1, 2]) test(`MessageChannel invalidate suppresses A at SHA${holdAt}; BUSY persists until physical release`, TIMEOUT, async t => {
  const bundle = await fixture(structuredClone(privateVectors.privateAgreements[1].input));
  const backend = heldSha(holdAt), s = messageSession(t, backend), pendingA = s.send(check(bundle, 1));
  const call = await backend.entered;
  assert.equal(call.capturedNonzero, true);
  const handledControl = s.send(invalidate(2)), ack = await ackFor(s, 2);
  await handledControl; await pendingA;
  assert.deepEqual(ack, { version: 1, requestId: 2, generation: 1, operation: 'invalidateEvmAgreement', kind: 'ack', result: { ok: true, value: { held: true } } });
  assert.deepEqual(s.host.physicalState(), { generation: 1, held: true, terminal: false });
  assert.equal(call.bytes.every(byte => byte === 0), true, 'invalidation wiped the actual captured encoding');
  const handledB = s.send(check(bundle, 3, 1)), busy = await replyFor(s, 3);
  await handledB;
  assert.equal(busy.result.ok, false); assert.equal(busy.result.error.code, 'BUSY');
  assert.equal(backend.calls.length, holdAt, 'no overlapping verifier started');
  assert.equal(s.frames.some(frame => frame.kind === 'response' && frame.requestId === 1), false);
  await backend.release(); await physicallyIdle(t, s.host);
  const handledC = s.send(check(bundle, 4, 1)), replyC = await replyFor(s, 4);
  await handledC;
  assert.equal(replyC.result.ok, true); assert.equal(replyC.generation, 1);
  assert.equal(backend.maximumActive, 1);
  await s.adapter.drain();
  assert.equal(s.frames.some(frame => frame.kind === 'response' && frame.requestId === 1), false, 'no stale A reply after real settlement');
});

for (const mode of ['resolve', 'reject']) test(`MessageChannel dispose ack retains held=true; drain awaits real SHA ${mode}`, TIMEOUT, async t => {
  const bundle = await fixture(), backend = heldSha(1), s = messageSession(t, backend);
  const pendingA = s.send(check(bundle, 1)); await backend.entered;
  const handledControl = s.send(dispose(2)), ack = await ackFor(s, 2);
  await handledControl; await pendingA;
  assert.deepEqual(ack, { version: 1, requestId: 2, generation: 0, operation: 'disposeEvmAgreementHost', kind: 'ack', result: { ok: true, value: { held: true } } });
  assert.deepEqual(s.host.physicalState(), { generation: 0, held: true, terminal: true });
  let drained = false;
  const completion = s.adapter.drain().then(() => { drained = true; });
  await s.send(check(bundle, 3)); // Real message handling is a negative barrier while the SHA gate remains held.
  assert.equal(drained, false, 'logical ack and another handled frame cannot establish physical settlement');
  assert.equal(s.host.physicalState().held, true); assert.equal(backend.active, 1);
  await backend.release(mode); await completion;
  assert.deepEqual(s.host.physicalState(), { generation: 0, held: false, terminal: true });
  assert.equal(backend.active, 0); assert.equal(backend.calls.length, 1);
  assert.equal(s.frames.some(frame => frame.kind === 'response' && (frame.requestId === 1 || frame.requestId === 3)), false);
});

test('direct seam: duplicate and replayed IDs across check/control frames close once with INVALID_INPUT', TIMEOUT, async t => {
  const bundle = await fixture();
  for (const scenario of ['check-to-control', 'control-to-check', 'lower-control']) {
    const { host, adapter, frames } = direct(t);
    if (scenario === 'check-to-control') {
      await adapter.receive(check(bundle, 1));
      assert.equal(frames[0].result.ok, true);
      await adapter.receive(invalidate(1));
    } else {
      await adapter.receive(invalidate(2));
      await adapter.receive(scenario === 'control-to-check' ? check(bundle, 2, 1) : invalidate(1, 1));
    }
    const gen = scenario === 'check-to-control' ? 0 : 1;
    assert.deepEqual(frames.filter(frame => frame.kind === 'closed'), [{ version: 1, generation: gen, kind: 'closed', reason: 'INVALID_INPUT' }]);
    assert.equal(host.physicalState().terminal, true);
    const count = frames.length;
    await adapter.receive(check(bundle, 9, gen)); adapter.close(); adapter.close();
    assert.equal(frames.length, count, 'terminal adapter admits no later work or duplicate final notification');
    await adapter.drain(); assert.equal(host.physicalState().held, false);
  }
});

test('direct seam: future generation on either check or control fails closed before hashing', TIMEOUT, async t => {
  const bundle = await fixture();
  for (const frame of [check(bundle, 1, 1), invalidate(1, 1)]) {
    let hashes = 0;
    const host = createEvmAgreementHost({ sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
    t.after(() => host.dispose());
    const frames = [], adapter = make(host, value => frames.push(publicFrame(value)));
    await adapter.receive(frame);
    assert.equal(hashes, 0);
    assert.deepEqual(frames, [{ version: 1, generation: 0, kind: 'closed', reason: 'INVALID_INPUT' }]);
    assert.deepEqual(host.physicalState(), { generation: 0, held: false, terminal: true });
    await adapter.drain();
  }
});

test('direct seam: malformed frames and opaque hostile traps are swallowed into one code-only close', TIMEOUT, async t => {
  let getterReads = 0, foreignReads = 0;
  const foreign = new Proxy(Error('PRIVATE-ADAPTER https://private.invalid'), { get() { foreignReads++; throw Error('foreign read'); }, getPrototypeOf() { foreignReads++; throw Error('foreign prototype'); } });
  const accessor = invalidate(1);
  Object.defineProperty(accessor, 'operation', { enumerable: true, get() { getterReads++; throw foreign; } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const bad = [null, [], { ...invalidate(1), paymentInstructions: 'PRIVATE-ADAPTER' }, accessor, revoked.proxy,
    new Proxy(invalidate(1), { ownKeys() { throw foreign; } }),
    check({ privateAgreement: { paymentInstructions: 'PRIVATE-ADAPTER' } }, 1)];
  for (const frame of bad) {
    const { host, adapter, frames } = direct(t);
    await adapter.receive(frame);
    assert.deepEqual(frames, [{ version: 1, generation: 0, kind: 'closed', reason: 'INVALID_INPUT' }]);
    assert.deepEqual(host.physicalState(), { generation: 0, held: false, terminal: true });
    await adapter.receive(invalidate(2)); await adapter.drain();
    assert.equal(frames.length, 1);
  }
  assert.equal(getterReads, 0); assert.equal(foreignReads, 0);
});

test('direct throwing-send seam: invalidate ack failure terminally cleans up without recursive send or guaranteed ack', TIMEOUT, async t => {
  const backend = heldSha(1); let attempts = 0, foreignReads = 0;
  const foreign = new Proxy(Error('PRIVATE-ADAPTER send https://private.invalid'), { get() { foreignReads++; throw Error('foreign read'); }, getPrototypeOf() { foreignReads++; throw Error('foreign prototype'); } });
  const { host, adapter } = direct(t, { backend, send() { attempts++; throw foreign; } });
  const pendingA = adapter.receive(check(await fixture(), 1)); await backend.entered;
  await adapter.receive(invalidate(2)); await pendingA;
  assert.equal(attempts, 1, 'failed send never recursively attempts a final notification');
  assert.equal(foreignReads, 0, 'foreign send exception is not inspected');
  assert.deepEqual(host.physicalState(), { generation: 1, held: true, terminal: true });
  let drained = false;
  const completion = adapter.drain().then(() => { drained = true; });
  await adapter.receive(invalidate(3, 1)); adapter.close();
  assert.equal(drained, false); assert.equal(attempts, 1);
  await backend.release('reject'); await completion;
  assert.equal(host.physicalState().held, false); assert.equal(backend.active, 0);
  assert.equal(attempts, 1); assert.equal(foreignReads, 0);
});

test('reentrant send during dispose acknowledgment cannot process another control or change close reason', TIMEOUT, async t => {
  const host = createEvmAgreementHost(), frames = []; let adapter, nested;
  t.after(() => host.dispose());
  adapter = make(host, frame => {
    frames.push(publicFrame(frame));
    if (frame.kind === 'ack' && frame.operation === 'disposeEvmAgreementHost') nested = adapter.receive(invalidate(2));
  });
  await adapter.receive(dispose(1)); await nested;
  assert.deepEqual(frames.map(frame => frame.kind), ['ack', 'closed']);
  assert.equal(frames[1].reason, 'DISPOSED'); assert.equal(host.physicalState().terminal, true);
  await adapter.drain();
});

test('reentrant send during timeout reply cannot process a control or change close reason', TIMEOUT, async t => {
  const backend = heldSha(1); let now = 0, timerCallback, adapter, nested;
  const host = createEvmAgreementHost({ sha256: backend.sha256, now: () => now, timer: {
    setTimeout(callback, ms) { assert.equal(ms, 30000); timerCallback = callback; return {}; }, clearTimeout() {} } });
  const frames = [];
  t.after(async () => { host.dispose(); backend.releaseAll(); await host.disposeAndDrain(); });
  adapter = make(host, frame => { frames.push(publicFrame(frame));
    if (frame.kind === 'response' && !frame.result.ok && frame.result.error.code === 'TIMEOUT') nested = adapter.receive(invalidate(2)); });
  const pending = adapter.receive(check(await fixture(), 1)); await backend.entered;
  now = 30000; timerCallback(); await pending; await nested;
  assert.deepEqual(frames.map(frame => frame.kind), ['response', 'closed']);
  assert.equal(frames[0].result.error.code, 'TIMEOUT'); assert.equal(frames[1].reason, 'TIMEOUT');
  await backend.release(); await adapter.drain();
});
