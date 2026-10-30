import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, acceptances, privateVectors } from './lib/g16-bundle-fixture.mjs';

// Spy installed BEFORE the host import so the body parser's cached
// %TypedArray%.prototype.set captures the wrapper. The wrapper is a pure pass-through unless `copyHook` is set.
let copyHook = null;
const nativeSet = Uint8Array.prototype.set;
Uint8Array.prototype.set = function spiedSet(...args) { if (copyHook) copyHook(this, args); return nativeSet.apply(this, args); };

// Guard ONLY the exact absent target module (ERR_MODULE_NOT_FOUND with the exact target url); transitive failures rethrow.
const hostUrl = new URL('./lib/evm-agreement-host.ts', import.meta.url);
let api;
try {
  api = await import(hostUrl.href).catch(error => {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && error?.url === hostUrl.href) return {};
    throw error;
  });
} finally { Uint8Array.prototype.set = nativeSet; }
assert.equal(Uint8Array.prototype.set, nativeSet);

const make = options => {
  assert.equal(typeof api.createEvmAgreementHost, 'function', 'missing createEvmAgreementHost');
  return api.createEvmAgreementHost(options);
};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const zero = bytes => bytes.every(b => b === 0);
const request = (bundle, requestId, generation = 0) => ({ version: 1, requestId, generation, operation: 'checkEvmAgreement', input: bundle });
const code = reply => { assert.ok(reply, 'expected a reply'); assert.equal(reply.result.ok, false); return reply.result.error.code; };
const PRIVATE = /PRIVATE-FIXTURE|paymentInstructions|agreementSalt|signature|https:\/\//;
const noLeak = reply => assert.doesNotMatch(JSON.stringify(reply), PRIVATE);
const rejectsSchema = (promise, expected) => assert.rejects(promise, error =>
  error.name === 'CoreSchemaError' && (expected === undefined || error.code === expected) && !PRIVATE.test(String(error.message)));
// Wait for the real backend before draining verifier continuations. Fixed tick counts cannot prove backend completion.
const pump = async calls => {
  for (let i = 0; i < calls.length; i++) {
    calls[i].gate.resolve();
    await calls[i].native.catch(() => {});
    await tick(1);
  }
};
const waitCall = async (calls, index) => {
  if (!calls[index]) {
    if (index > 0 && calls[index - 1]) await calls[index - 1].native.catch(() => {});
    await tick(1);
  }
  assert.ok(calls[index], 'SHA call ' + index + ' entered'); return calls[index];
};
const pendingState = async promise => Promise.race([promise.then(() => 'settled', () => 'settled'), tick(3).then(() => 'pending')]);

/** Held SHA seam: real digest, trusted seam only. Each call is released explicitly or by pump. */
function heldSha() {
  const calls = [];
  const sha256 = bytes => {
    const gate = deferred(), native = crypto.subtle.digest('SHA-256', bytes), call = { bytes, gate, native };
    calls.push(call);
    return gate.promise.then(() => native);
  };
  return { calls, sha256 };
}
/** Fake monotonic clock + manual timers; the 30000ms bound itself is exercised without waiting. */
function fakeTime() {
  const state = { t: 100, timers: [], delays: [], fault: false, override: undefined, reads: 0 };
  return { state,
    now: () => { state.reads++; if (state.fault) throw Error('PRIVATE-FIXTURE clock'); return state.override ?? state.t; },
    timer: {
      setTimeout: (callback, ms) => { const timer = { callback, ms, live: true }; state.delays.push(ms); state.timers.push(timer); return timer; },
      clearTimeout: handle => { handle.live = false; } },
    advance: ms => { state.t += ms; },
    fire: () => { for (const timer of state.timers) if (timer.live) { timer.live = false; timer.callback(); } } };
}

test('coherent native, ERC20 and nonempty-capability requests run the actual verifier with strict code-only replies', async () => {
  const native = await fixture(), cap = await fixture(structuredClone(privateVectors.privateAgreements[1].input));
  const erc20 = await fixture(); erc20.terms.assetKind = 'erc20'; erc20.terms.asset = '0x' + '11'.repeat(20);
  erc20.acceptances = acceptances(erc20.domain, erc20.terms);
  const host = make(); let id = 0;
  for (const bundle of [native, cap, erc20]) {
    const reply = await host.dispatch(request(bundle, ++id));
    assert.equal(reply.result.ok, true); assert.equal(reply.requestId, id); assert.equal(reply.generation, 0);
    assert.equal(reply.result.value.testOnly, true); assert.equal(reply.result.value.economicPreparationAllowed, false);
    assert.equal(reply.result.value.accounts.seller, bundle.terms.seller);
    assert.equal(reply.result.value.accounts.buyer, bundle.terms.buyer); noLeak(reply);
  }
  const tampered = await fixture(); tampered.terms.amountBaseUnits = '2';
  const failed = await host.dispatch(request(tampered, ++id));
  assert.equal(code(failed), 'INTEGRITY_FAILURE'); assert.deepEqual(Object.keys(failed.result.error), ['code']); noLeak(failed);
  const forged = request(await fixture(), ++id); forged.approved = true;
  await rejectsSchema(host.dispatch(forged), 'INVALID_INPUT');
  assert.deepEqual(Object.keys(host).sort(), ['dispatch', 'dispose', 'disposeAndDrain', 'generation', 'invalidate', 'physicalState']);
  host.dispose();
});

test('B is BUSY while A actually pending (each SHA position); caller mutation cannot change A; next explicit request proceeds', async () => {
  for (const at of [0, 1]) {
    const held = heldSha(), host = make({ sha256: held.sha256 }), a = await fixture(), b = await fixture();
    const sellerA = a.terms.seller;
    const pendingA = host.dispatch(request(a, 1));
    for (let i = 0; i < at; i++) { (await waitCall(held.calls, i)).gate.resolve(); }
    await waitCall(held.calls, at);
    a.terms.amountBaseUnits = '2'; a.acceptances[0].signature.fill(0); a.privateAgreement.paymentInstructions = 'PRIVATE-FIXTURE late';
    const before = held.calls.length, busy = await host.dispatch(request(b, 2));
    assert.equal(code(busy), 'BUSY'); noLeak(busy); assert.equal(held.calls.length, before, 'BUSY starts no verifier');
    await pump(held.calls);
    const replyA = await pendingA;
    assert.equal(replyA.result.ok, true, 'caller mutation after capture never changes A');
    assert.equal(replyA.result.value.accounts.seller, sellerA);
    const c = host.dispatch(request(await fixture(), 3));
    await pump(held.calls);
    assert.equal((await c).result.ok, true, 'explicit current request after actual settlement proceeds');
    host.dispose();
  }
});

test('replay, wrong generation and last-request bounds fail before any verifier; lower generation never revives', async () => {
  let hashes = 0; const host = make({ sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
  assert.equal((await host.dispatch(request(await fixture(), 5))).result.ok, true);
  const afterOk = hashes;
  await rejectsSchema(host.dispatch(request(await fixture(), 5)), 'INVALID_INPUT');
  await rejectsSchema(host.dispatch(request(await fixture(), 4)), 'INVALID_INPUT');
  await rejectsSchema(host.dispatch(request(await fixture(), 6, 1)), 'INVALID_INPUT');
  await rejectsSchema(host.dispatch(request(await fixture(), 0)), 'INVALID_INPUT');
  host.invalidate(); assert.equal(host.generation, 1);
  assert.equal(code(await host.dispatch(request(await fixture(), 7, 0))), 'CONFLICT');
  assert.equal(hashes, afterOk, 'refusals start no hash');
  assert.equal((await host.dispatch(request(await fixture(), 8, 1))).result.ok, true, 'request ids survive generation changes');
  host.dispose();
});

test('invalidate at either SHA await: A settles undefined promptly, slot stays BUSY until actual settle, then C proceeds (success and thrown backend)', async () => {
  for (const mode of ['success', 'throw']) for (const at of [0, 1]) {
    const calls = [];
    const sha256 = bytes => {
      const gate = deferred(), native = crypto.subtle.digest('SHA-256', bytes), index = calls.length; calls.push({ bytes, gate, native });
      return gate.promise.then(() => { if (mode === 'throw' && index === at) throw Error('PRIVATE-FIXTURE backend https://private.invalid'); return native; });
    };
    const host = make({ sha256 }), pendingA = host.dispatch(request(await fixture(), 1));
    for (let i = 0; i < at; i++) (await waitCall(calls, i)).gate.resolve();
    await waitCall(calls, at);
    const hashesAtInvalidate = calls.length;
    host.invalidate(); assert.equal(host.generation, 1);
    assert.equal(await pendingA, undefined, 'logical settlement is prompt and suppressed while underlying hash is still held');
    assert.equal(zero(calls[at].bytes), true, 'verifier-owned bytes wiped by abort before underlying settle');
    assert.equal(code(await host.dispatch(request(await fixture(), 2, 1))), 'BUSY', 'physical slot held until the real Promise settles');
    assert.equal(calls.length, hashesAtInvalidate);
    for (const call of calls) call.gate.resolve();
    await tick(4);
    assert.equal(calls.length, hashesAtInvalidate, 'no second hash starts after the stale guard');
    const c = host.dispatch(request(await fixture(), 3, 1));
    await pump(calls);
    assert.equal((await c).result.ok, true, 'explicit current C runs after actual settlement');
    host.dispose();
  }
});

test('late A finalizer after C starts cannot clear or release C; A settles only after C owns the slot', async () => {
  const calls = [];
  const sha256 = bytes => { const gate = deferred(), native = crypto.subtle.digest('SHA-256', bytes); calls.push({ bytes, gate, native }); return gate.promise.then(() => native); };
  const host = make({ sha256 }), pendingA = host.dispatch(request(await fixture(), 1));
  await waitCall(calls, 0);
  host.invalidate();
  assert.equal(await pendingA, undefined);
  // A's underlying promise is still held: C cannot start yet (BUSY), and must not displace A.
  assert.equal(code(await host.dispatch(request(await fixture(), 2, 1))), 'BUSY');
  calls[0].gate.resolve(); await tick(4);
  const cStart = calls.length;
  const pendingC = host.dispatch(request(await fixture(), 3, 1));
  await waitCall(calls, cStart);
  assert.equal(code(await host.dispatch(request(await fixture(), 4, 1))), 'BUSY', 'C owns the slot');
  await pump(calls);
  assert.equal((await pendingC).result.ok, true); host.dispose();
});

test('dispose is terminal and idempotent idle/held/before/after parsing; no later reply, job, or unhandled rejection', async () => {
  const unhandled = []; const listener = reason => unhandled.push(reason); process.on('unhandledRejection', listener);
  try {
    const idle = make(); idle.dispose(); idle.dispose();
    assert.equal(await idle.dispatch(request(await fixture(), 1)), undefined);
    let touched = 0; const spy = new Proxy({}, { ownKeys() { touched++; return []; }, getOwnPropertyDescriptor() { touched++; return undefined; } });
    assert.equal(await idle.dispatch(spy), undefined); assert.equal(touched, 0, 'disposed dispatch does not parse or snapshot input');
    const held = heldSha(), host = make({ sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
    await waitCall(held.calls, 0);
    host.dispose(); host.dispose();
    assert.equal(await pending, undefined, 'held job settles undefined promptly on dispose');
    assert.equal(zero(held.calls[0].bytes), true, 'verifier-owned bytes wiped by abort');
    const before = held.calls.length;
    assert.equal(await host.dispatch(request(await fixture(), 2)), undefined);
    assert.equal(held.calls.length, before, 'no new job after dispose');
    held.calls[0].gate.resolve(); await tick();
    const gate = deferred(), h2 = make({ sha256: bytes => { void bytes; return gate.promise; } }), p2 = h2.dispatch(request(await fixture(), 1)); await tick();
    h2.dispose(); gate.reject(Error('PRIVATE-FIXTURE late')); await tick();
    assert.equal(await p2, undefined);
    await tick(10); assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', listener); }
});

test('fixed 30s deadline: 29999 succeeds; 30000 with delayed timer is TIMEOUT; timer fire aborts/wipes while slot stays held', async () => {
  const early = fakeTime(), heldEarly = heldSha(), hostEarly = make({ sha256: heldEarly.sha256, now: early.now, timer: early.timer });
  const okPending = hostEarly.dispatch(request(await fixture(), 1)); await waitCall(heldEarly.calls, 0);
  assert.deepEqual(early.state.delays, [30000], 'production timeout stays fixed at 30000ms');
  early.advance(29999); await pump(heldEarly.calls);
  assert.equal((await okPending).result.ok, true); hostEarly.dispose();

  const delayed = fakeTime(), held = heldSha(), host = make({ sha256: held.sha256, now: delayed.now, timer: delayed.timer });
  const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
  delayed.advance(30000); // clock at the bound, timer callback NOT delivered
  await pump(held.calls);
  const reply = await pending; assert.equal(code(reply), 'TIMEOUT', 'no success at/after 30s even when SHA completes before timer delivery'); noLeak(reply);
  host.dispose();

  const fired = fakeTime(), held2 = heldSha(), host2 = make({ sha256: held2.sha256, now: fired.now, timer: fired.timer });
  const pending2 = host2.dispatch(request(await fixture(), 1)); await waitCall(held2.calls, 0);
  fired.advance(30000); fired.fire();
  assert.equal(code(await pending2), 'TIMEOUT', 'timer TIMEOUT settles logically while the held hash is unresolved');
  assert.equal(zero(held2.calls[0].bytes), true, 'abort wiped verifier-owned bytes promptly');
  const before = held2.calls.length;
  const refused = await host2.dispatch(request(await fixture(), 2));
  assert.ok(refused === undefined || code(refused) === 'BUSY', 'terminal host after timeout: refuse or BUSY, never a new verifier');
  assert.equal(held2.calls.length, before);
  host2.dispose();
});

test('after timeout the host is terminal; late settlement cannot resurrect it, a late timer callback is a no-op, no retry', async () => {
  const time = fakeTime(), held = heldSha(), host = make({ sha256: held.sha256, now: time.now, timer: time.timer });
  const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
  time.advance(30000); time.fire(); assert.equal(code(await pending), 'TIMEOUT');
  await pump(held.calls); await tick(4);
  for (const timer of time.state.timers) timer.callback();   // stale timer delivery after settlement must be a no-op
  const before = held.calls.length;
  assert.equal(await host.dispatch(request(await fixture(), 2)), undefined, 'terminal host refuses replacement work');
  assert.equal(held.calls.length, before); host.dispose();
});

test('timeout boundary also applies when the final reply projection happens after the bound (no late success)', async () => {
  const time = fakeTime(), held = heldSha(), host = make({ sha256: held.sha256, now: time.now, timer: time.timer });
  const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
  time.advance(29999); held.calls[0].gate.resolve(); await tick(4);
  const second = await waitCall(held.calls, 1);
  time.advance(1); second.gate.resolve();                     // exactly 30000 elapsed at completion
  assert.equal(code(await pending), 'TIMEOUT');
  assert.equal(await host.dispatch(request(await fixture(), 2)), undefined, 'emitted TIMEOUT closes the host terminally');
  host.dispose();
});

test('clock faults (throw, non-finite, backwards after increase) fail closed code-only; host reusable after actual settlement; invalidation dominates', async () => {
  for (const fault of ['throw', 'nan', 'backwards']) {
    const time = fakeTime(), held = heldSha(), host = make({ sha256: held.sha256, now: time.now, timer: time.timer });
    const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
    if (fault === 'backwards') {
      time.advance(50);
      held.calls[0].gate.resolve();
      await waitCall(held.calls, 1); // isCurrent has actually sampled the higher time before SHA2.
      time.state.override = time.state.t - 10;
    }
    else if (fault === 'throw') time.state.fault = true; else time.state.override = Number.NaN;
    await pump(held.calls);
    const reply = await pending;
    assert.equal(code(reply), 'UNAVAILABLE'); noLeak(reply); assert.deepEqual(Object.keys(reply.result.error), ['code']);
    time.state.fault = false; time.state.override = undefined;
    const next = host.dispatch(request(await fixture(), 2)); await pump(held.calls);
    assert.equal((await next).result.ok, true, 'clock fault is not terminal; host reusable after actual settlement');
    host.dispose();
  }
  const time = fakeTime(), held = heldSha(), host = make({ sha256: held.sha256, now: time.now, timer: time.timer });
  const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
  host.invalidate(); time.state.fault = true;
  assert.equal(await pending, undefined, 'invalidation dominates a faulty clock'); await pump(held.calls); host.dispose();
});

test('invalidate dominates a queued TIMEOUT: timer fires after invalidation yields no timeout reply', async () => {
  const time = fakeTime(), held = heldSha(), host = make({ sha256: held.sha256, now: time.now, timer: time.timer });
  const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
  host.invalidate(); time.advance(30000); time.fire();
  assert.equal(await pending, undefined); await pump(held.calls); host.dispose();
});

test('malformed, accessor, revoked proxy, oversized and forged-throw inputs fail with fresh fixed errors and no getter execution', async () => {
  const host = make(); let getters = 0, id = 0;
  const forged = Object.assign(Error('PRIVATE-FIXTURE forged'), { name: 'CoreSchemaError', code: 'LIMIT_EXCEEDED' });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const accessor = request(await fixture(), ++id); Object.defineProperty(accessor.input.terms, 'buyer', { enumerable: true, get() { getters++; throw forged; } });
  for (const bad of [null, 'text', [], revoked.proxy, accessor, new Proxy({}, { ownKeys() { throw forged; } })]) {
    await assert.rejects(host.dispatch(bad), error => { assert.notEqual(error, forged); return error.name === 'CoreSchemaError' && error.code === 'INVALID_INPUT' && !PRIVATE.test(error.message); });
  }
  const oversized = request(await fixture(), 50); oversized.input.privateAgreement.paymentInstructions = 'x'.repeat(4097);
  await rejectsSchema(host.dispatch(oversized), 'LIMIT_EXCEEDED');
  const wide = request(await fixture(), 51); wide.input.terms.amountBaseUnits = '9'.repeat(5000);
  await rejectsSchema(host.dispatch(wide), 'INVALID_INPUT');
  assert.equal(getters, 0, 'accessor never invoked');
  assert.equal((await host.dispatch(request(await fixture(), 60))).result.ok, true, 'refusals leave host usable');
  host.dispose();
});

test('reentrant dispatch during a strict parse rejects with a fresh fixed INVALID_INPUT without touching nested input; outer proceeds', async () => {
  const host = make(), bundle = await fixture(); let nestedPromise, nestedTouched = 0, entered = 0;
  const nestedInput = new Proxy({}, { ownKeys() { nestedTouched++; return []; }, getOwnPropertyDescriptor() { nestedTouched++; return undefined; } });
  const trap = new Proxy(bundle, { ownKeys(target) {
    if (!entered++) { nestedPromise = host.dispatch(nestedInput); nestedPromise.catch(() => {}); }
    return Reflect.ownKeys(target); } });
  const outer = await host.dispatch(request(trap, 1));
  assert.ok(nestedPromise, 'trap executed during the outer strict parse');
  await assert.rejects(nestedPromise, error => error.name === 'CoreSchemaError' && error.code === 'INVALID_INPUT' && !PRIVATE.test(error.message));
  assert.equal(nestedTouched, 0, 'nested input never inspected');
  assert.equal(outer.result.ok, true, 'outer coherent request completes with a genuine verified result');
  assert.equal((await host.dispatch(request(await fixture(), 2))).result.ok, true, 'no retained job; host reusable');
  host.dispose();
});

test('BUSY and wrong-generation refusals clear host-owned parsed signature copies (observed via pre-import intrinsic-copy spy)', async t => {
  const held = heldSha(), host = make({ sha256: held.sha256 }), pendingA = host.dispatch(request(await fixture(), 1));
  await waitCall(held.calls, 0);
  const seen = []; copyHook = (target, args) => { if (target.length === 65 && target.buffer.byteLength === 65 && args[0]?.length === 65) seen.push(target); };
  let busy, lower;
  try {
    busy = await host.dispatch(request(await fixture(), 2));
    host.invalidate();
    lower = await host.dispatch(request(await fixture(), 3, 0));
  } finally { copyHook = null; }
  assert.equal(code(busy), 'BUSY'); assert.equal(code(lower), 'CONFLICT');
  // Observable limits: the spy sees only copies made through the cached intrinsic set during these dispatches; if the
  // engine/parser routes copies elsewhere the list is empty and host-copy zeroization is reported unobservable, not claimed.
  if (seen.length) assert.equal(seen.every(zero), true, 'refused requests leave no live host-owned signature copy');
  t.diagnostic('host-copy samples on refusals=' + seen.length);
  assert.equal(await pendingA, undefined); await pump(held.calls); host.dispose();
});

test('host-owned vs verifier-owned buffers clear separately; caller-owned bytes are never erased; abort wipe precedes underlying settle', async t => {
  const bundle = await fixture(), callerCopies = bundle.acceptances.map(a => Uint8Array.from(a.signature)), owned = [], held = heldSha();
  copyHook = (target, args) => { if (target.length === 65 && target.buffer.byteLength === 65 && args[0]?.length === 65) owned.push(target); };
  let pending;
  try { pending = make({ sha256: held.sha256 }).dispatch(request(bundle, 1)); await waitCall(held.calls, 0); } finally { copyHook = null; }
  const callerIntact = () => bundle.acceptances.every((a, i) => a.signature.every((b, j) => b === callerCopies[i][j]));
  assert.equal(callerIntact(), true, 'caller-owned bytes untouched while pending');
  await pump(held.calls);
  assert.equal((await pending).result.ok, true); assert.equal(callerIntact(), true, 'caller bytes never erased');
  if (owned.length) assert.equal(owned.every(zero), true, 'host-owned snapshot signature copies cleared after settlement');
  else assert.ok(owned.length === 0, 'host copy path unobservable through the cached intrinsic; copy zeroization not claimed');
  t.diagnostic('host-copy samples on completion=' + owned.length);
  assert.equal(held.calls.every(call => zero(call.bytes)), true, 'verifier-owned encoded arrays cleared on settlement');

  const held2 = heldSha(), host = make({ sha256: held2.sha256 }), pending2 = host.dispatch(request(await fixture(), 1));
  await waitCall(held2.calls, 0);
  host.invalidate();
  assert.equal(zero(held2.calls[0].bytes), true, 'immediate abort wipes verifier-owned bytes while the hash is still held');
  assert.equal(await pending2, undefined);
  for (const call of held2.calls) call.gate.resolve(); await tick(); host.dispose();
});

test('clock reentry cannot admit two verifier jobs before the outer job is registered', async () => {
  const a = await fixture(), b = await fixture(), held = heldSha(), time = fakeTime();
  let entered = false, nested, host;
  host = make({ sha256: held.sha256, timer: time.timer, now: () => {
    if (!entered) { entered = true; nested = host.dispatch(request(b, 2)); }
    return 100;
  } });
  const outer = host.dispatch(request(a, 1));
  try {
    await waitCall(held.calls, 0); await tick(2);
    assert.equal(held.calls.length, 1, 'the clock callback must not open a second actual verifier job');
    assert.equal(code(await outer), 'BUSY');
    await pump(held.calls);
    assert.equal((await nested).result.ok, true, 'the admitted nested job retains its slot');
  } finally {
    host.dispose(); await pump(held.calls); await Promise.allSettled([outer, nested]);
  }
});

test('clock failure during a synchronous invalidation suppresses the old request before job creation', async () => {
  let first = true, host;
  host = make({ now: () => {
    if (first) { first = false; host.invalidate(); return NaN; }
    return 100;
  } });
  try {
    assert.equal(await host.dispatch(request(await fixture(), 1)), undefined);
    assert.equal(host.generation, 1);
    assert.equal((await host.dispatch(request(await fixture(), 2, 1))).result.ok, true);
  } finally { host.dispose(); }
});

test('invalidation during the final clock sample dominates a coincident deadline without closing the new generation', async () => {
  let hashes = 0, armed = false, phaseReads = 0, time = 100, host;
  host = make({ sha256: async bytes => {
    const result = await crypto.subtle.digest('SHA-256', bytes);
    if (++hashes === 2) armed = true;
    return result;
  }, now: () => {
    // After SHA2: verifier guard, host decision, then final projection guard.
    if (armed && ++phaseReads === 3) { armed = false; host.invalidate(); time += 30000; }
    return time;
  } });
  try {
    assert.equal(await host.dispatch(request(await fixture(), 1)), undefined);
    assert.equal(phaseReads, 3, 'the final projection clock seam was reached');
    assert.equal(host.generation, 1);
    assert.equal((await host.dispatch(request(await fixture(), 2, 1))).result.ok, true);
  } finally { host.dispose(); }
});

// ---- Physical settlement observation (qualification-only) ----
const physicalHost = (t, options) => { const host = make(options); t.after(() => host.dispose()); return host; };

const phys = host => {
  assert.equal(typeof host.physicalState, 'function', 'missing physicalState');
  const state = host.physicalState();
  assert.equal(Object.isFrozen(state), true, 'physicalState snapshot is frozen');
  assert.deepEqual(Object.keys(state).sort(), ['generation', 'held', 'terminal']);
  return state;
};
const drain = host => {
  assert.equal(typeof host.disposeAndDrain, 'function', 'missing disposeAndDrain');
  return host.disposeAndDrain();
};
// This bounded negative oracle checks pending only while the real backend gate remains held.
// Successful completion is awaited through the actual drain/backend promises, never inferred from ticks.
const turns = async promise => Promise.race([promise.then(() => 'settled', () => 'settled'), tick(4).then(() => 'pending')]);
const complete = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Physical-drain fixture did not settle')), 30000); })]); }
  finally { clearTimeout(timer); }
};

test('physical-state: idle snapshot is not held, reads are pure and stable', async t => {
  const time = fakeTime(), host = physicalHost(t, { now: time.now, timer: time.timer });
  const readsBefore = time.state.reads, timersBefore = time.state.timers.length;
  const first = phys(host), second = phys(host);
  assert.deepEqual(first, { generation: 0, held: false, terminal: false });
  assert.deepEqual(second, first);
  assert.notEqual(first, second, 'fresh frozen snapshot per read');
  assert.equal(host.generation, 0);
  assert.equal(time.state.reads, readsBefore, 'observation never invokes the clock');
  assert.equal(time.state.timers.length, timersBefore, 'observation never arms timers');
  assert.doesNotMatch(JSON.stringify(first), PRIVATE);
  host.dispose();
});

test('physical-state: logical invalidate keeps held true at both SHA gates; stale A cleanup never releases B', async t => {
  for (const at of [0, 1]) {
    const held = heldSha(), host = physicalHost(t, { sha256: held.sha256 }), pendingA = host.dispatch(request(await fixture(), 1));
    for (let i = 0; i < at; i++) (await waitCall(held.calls, i)).gate.resolve();
    await waitCall(held.calls, at);
    assert.deepEqual(phys(host), { generation: 0, held: true, terminal: false });
    host.invalidate();
    assert.equal(await pendingA, undefined);
    assert.deepEqual(phys(host), { generation: 1, held: true, terminal: false }, 'logical suppression is not physical release');
    const before = held.calls.length;
    assert.equal(code(await host.dispatch(request(await fixture(), 2, 1))), 'BUSY');
    assert.equal(held.calls.length, before);
    assert.equal(phys(host).held, true, 'B refusal does not release A');
    await pump(held.calls); // awaits real native hashes and host continuations, then assert the physical snapshot
    assert.deepEqual(phys(host), { generation: 1, held: false, terminal: false });
    const c = host.dispatch(request(await fixture(), 3, 1));
    await pump(held.calls);
    assert.equal((await c).result.ok, true);
    host.dispose();
  }
});

test('physical-state: dispose while held is terminal+held; disposeAndDrain stays pending until the real SHA settles', async t => {
  for (const at of [0, 1]) {
    const held = heldSha(), host = physicalHost(t, { sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
    for (let i = 0; i < at; i++) (await waitCall(held.calls, i)).gate.resolve();
    await waitCall(held.calls, at);
    const drained = drain(host);
    assert.ok(drained instanceof Promise, 'disposeAndDrain returns a Promise');
    assert.deepEqual(phys(host), { generation: host.generation, held: true, terminal: true }, 'dispose is synchronous; physical work still held');
    assert.equal(await pending, undefined, 'logical reply suppressed promptly');
    assert.equal(await turns(drained), 'pending', 'terminal drain unresolved across real event-loop turns');
    assert.equal(phys(host).held, true);
    const before = held.calls.length;
    assert.equal(await host.dispatch(request(await fixture(), 2)), undefined);
    assert.equal(held.calls.length, before, 'no dispatch admitted after dispose');
    for (const call of held.calls) call.gate.resolve();
    await complete(drained);
    assert.equal(phys(host).held, false, 'drain resolves only after the slot was physically released');
    assert.equal(phys(host).terminal, true);
  }
});

test('physical-state: repeated dispose/drain share completion semantics and idle drain resolves without waiting', async t => {
  const idle = physicalHost(t);
  await complete(drain(idle)); await complete(drain(idle));
  assert.deepEqual(phys(idle), { generation: 0, held: false, terminal: true });
  const held = heldSha(), host = physicalHost(t, { sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
  await waitCall(held.calls, 0);
  const d1 = drain(host), d2 = drain(host); host.dispose();
  const d3 = drain(host);
  assert.equal(d1, d2, 'one shared drain Promise while the slot is held');
  assert.equal(d2, d3);
  assert.equal(await pending, undefined);
  assert.equal(await turns(Promise.all([d1, d2, d3])), 'pending');
  for (const call of held.calls) call.gate.resolve();
  await complete(Promise.all([d1, d2, d3]));
  assert.equal(phys(host).held, false);
  await complete(drain(host));
});

test('physical-state: normal completion and native digest rejection release the slot with unchanged outcomes', async t => {
  const held = heldSha(), host = physicalHost(t, { sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
  await waitCall(held.calls, 0);
  assert.equal(phys(host).held, true);
  await pump(held.calls);
  assert.equal((await pending).result.ok, true);
  await pump(held.calls); // real backend completion is known before the snapshot assertion
  assert.deepEqual(phys(host), { generation: 0, held: false, terminal: false });
  await complete(drain(host));

  const calls = [], host2 = physicalHost(t, { sha256: bytes => { const gate = deferred(); calls.push(gate); return gate.promise.then(() => { throw Error('PRIVATE-FIXTURE native https://private.invalid'); }); } });
  const pending2 = host2.dispatch(request(await fixture(), 1));
  assert.equal(calls.length, 1, 'actual verifier entered the first injected digest synchronously');
  assert.equal(phys(host2).held, true);
  calls[0].resolve();
  assert.equal(code(await pending2), 'UNAVAILABLE');
  await complete(drain(host2));
  assert.equal(phys(host2).held, false);
  await complete(drain(host2));
});

test('physical-state: an already-waiting drain releases after rejected backend work at either SHA gate, including throwing timer cleanup', async t => {
  const unhandled = [], onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));
  for (const at of [0, 1]) for (const cleanupThrows of [false, true]) {
    const held = heldSha(), time = fakeTime();
    let clears = 0;
    const timer = { setTimeout: time.timer.setTimeout, clearTimeout(handle) {
      clears++; time.timer.clearTimeout(handle);
      if (cleanupThrows) throw Error('PRIVATE-FIXTURE cleanup https://private.invalid');
    } };
    const host = physicalHost(t, { sha256: held.sha256, now: time.now, timer });
    const pending = host.dispatch(request(await fixture(), 1));
    for (let i = 0; i < at; i++) (await waitCall(held.calls, i)).gate.resolve();
    const call = await waitCall(held.calls, at);
    const drained = drain(host);
    assert.equal(drained, drain(host), 'one completion waiter during held work');
    assert.equal(await pending, undefined, 'disposal suppresses the logical reply before rejection');
    assert.deepEqual(phys(host), { generation: 0, held: true, terminal: true });
    assert.equal(await turns(drained), 'pending', 'held backend gate cannot count as physical settlement');
    assert.equal(zero(call.bytes), true, 'owned bytes wiped on cancellation before backend reply');
    // Settle the real native digest separately before rejecting its held wrapper;
    // the controlled backend rejection, not elapsed ticks, releases the final host slot.
    await complete(call.native);
    call.gate.reject(Error('PRIVATE-FIXTURE backend https://private.invalid'));
    await complete(drained);
    assert.deepEqual(phys(host), { generation: 0, held: false, terminal: true });
    assert.equal(held.calls.length, at + 1, 'no stale continuation starts another digest');
    assert.ok(clears > 0, 'timer cleanup seam was reached');
    assert.equal(await host.dispatch(request(await fixture(), 2)), undefined);
  }
  await tick(2); // observation window only; drain completion was awaited above
  assert.deepEqual(unhandled, []);
});

test('physical-state: timeout closes logically while held; drain is not resolved until the native Promise settles', async t => {
  const time = fakeTime(), held = heldSha(), host = physicalHost(t, { sha256: held.sha256, now: time.now, timer: time.timer });
  const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
  time.advance(30000); time.fire();
  assert.equal(code(await pending), 'TIMEOUT');
  assert.deepEqual(phys(host), { generation: 0, held: true, terminal: true }, 'timeout closes the host but the slot is still physically held');
  const drained = drain(host);
  assert.equal(await turns(drained), 'pending', 'no drain success while underlying native Promise pending');
  assert.equal(held.calls.length, 1, 'no further hashing started');
  for (const call of held.calls) call.gate.resolve();
  await complete(drained);
  assert.equal(phys(host).held, false);
});

test('physical-state: idle terminal observation; generation exhaustion remains unexercised', async t => {
  // Exhaustion needs generation >= MAX_RUNTIME_SEQUENCE; no trusted seam exists to reach it without ~2^53 invalidations.
  // Not exercised here (see stated limitation). Verify only that an idle host reports an unchanged non-terminal state.
  const host = physicalHost(t);
  assert.equal(phys(host).terminal, false);
  host.dispose();
  assert.equal(phys(host).terminal, true);
  await complete(drain(host));
});

test('physical-state: timer setup failure leaves no phantom held slot or waiter and starts no verifier', async t => {
  let hashes = 0;
  const timer = { setTimeout() { throw Error('PRIVATE-FIXTURE timer'); }, clearTimeout() {} };
  const host = physicalHost(t, { timer, sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
  assert.equal(code(await host.dispatch(request(await fixture(), 1))), 'UNAVAILABLE');
  assert.equal(hashes, 0);
  assert.deepEqual(phys(host), { generation: 0, held: false, terminal: false });
  await complete(drain(host));
  assert.equal(phys(host).terminal, true);
});

test('physical-state: timer-seam reentrant dispose/invalidate before verifier start releases without verifier or phantom waiter', async t => {
  for (const action of ['dispose', 'invalidate', 'disposeAndDrain']) {
    let hashes = 0, host, earlyDrain;
    const timer = { setTimeout() { if (action === 'disposeAndDrain') earlyDrain = drain(host); else host[action](); return {}; }, clearTimeout() {} };
    host = physicalHost(t, { timer, sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
    assert.equal(await host.dispatch(request(await fixture(), 1)), undefined);
    assert.equal(hashes, 0, 'no verifier started');
    assert.equal(phys(host).held, false, 'slot released early with nothing physically running');
    assert.equal(phys(host).terminal, action !== 'invalidate');
    if (earlyDrain) await complete(earlyDrain);
    await complete(drain(host));
    assert.equal(phys(host).held, false, 'no phantom physical job or drain waiter');
  }
});

test('physical-state: wipe oracle intact and observation exposes no private material', async t => {
  const held = heldSha(), host = physicalHost(t, { sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
  await waitCall(held.calls, 0);
  const state = phys(host);
  assert.doesNotMatch(JSON.stringify(state), PRIVATE);
  assert.deepEqual(Object.keys(state).sort(), ['generation', 'held', 'terminal']);
  const drained = drain(host);
  assert.equal(zero(held.calls[0].bytes), true, 'abort wipes verifier-owned bytes before underlying settle');
  assert.equal(await pending, undefined);
  for (const call of held.calls) call.gate.resolve();
  await complete(drained);
});


test('physical-state: drain requested inside a throwing timer setup resolves when no verifier started', async t => {
  let host, earlyDrain, hashes = 0;
  const timer = { setTimeout() { assert.equal(phys(host).held, true); earlyDrain = drain(host); throw Error('PRIVATE-FIXTURE timer'); }, clearTimeout() {} };
  host = physicalHost(t, { timer, sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
  assert.equal(await host.dispatch(request(await fixture(), 1)), undefined, 'disposal keeps precedence over setup failure');
  await complete(earlyDrain);
  assert.equal(hashes, 0); assert.deepEqual(phys(host), { generation: 0, held: false, terminal: true });
});

test('physical-state: pre-registration clock disposal/drain has no phantom work or waiter', async t => {
  let host, earlyDrain, entered = false, hashes = 0;
  host = physicalHost(t, { now: () => { if (!entered) { entered = true; earlyDrain = drain(host); } return 100; },
    sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
  assert.equal(await host.dispatch(request(await fixture(), 1)), undefined);
  await complete(earlyDrain);
  assert.equal(hashes, 0); assert.deepEqual(phys(host), { generation: 0, held: false, terminal: true });
});
