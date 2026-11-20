import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedHttpDriver, MAX_HTTP_OPERATIONS } from '../src/http-driver.ts';

const URL = 'https://example.test/data';
const readyScope = () => {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    current: () => !controller.signal.aborted,
    run: async work => ({ ok: true, value: await work(controller.signal) }),
  };
};

// Observe only the driver's private allocations, not the caller-owned input. The intrinsic
// typed-array prototype/brand remains unchanged, so this exercises the real copy and wipe.
async function withTrackedCopies(run) {
  const Native = globalThis.Uint8Array;
  const copies = [];
  function Instrumented(...args) {
    const bytes = new Native(...args);
    if (args.length === 1 && typeof args[0] === 'number') copies.push(bytes);
    return bytes;
  }
  Instrumented.prototype = Native.prototype;
  Object.setPrototypeOf(Instrumented, Native);
  globalThis.Uint8Array = Instrumented;
  try { return await run(copies, Native); }
  finally { globalThis.Uint8Array = Native; }
}

test('cancelled preflight wipes the detached POST body without touching caller bytes', async () => {
  await withTrackedCopies(async (copies, Native) => {
    const source = new Native([17, 23, 41]);
    const controller = new AbortController();
    controller.abort();
    let dispatched = 0;
    const driver = new BoundedHttpDriver(async () => { dispatched++; throw Error('must not dispatch'); });
    const denied = {
      signal: controller.signal,
      current: () => !controller.signal.aborted,
      run: async () => { throw Error('must not enter the scope'); },
    };
    assert.deepEqual(await driver.request(denied, URL, source), { ok: false, error: 'CANCELLED' });
    assert.equal(dispatched, 0);
    assert.equal(driver.pending, 0);
    assert.equal(copies.length, 1, 'preflight owns one detached body allocation');
    assert.deepEqual([...copies[0]], [0, 0, 0], 'rejected detached bytes are erased immediately');
    assert.deepEqual([...source], [17, 23, 41], 'caller retains ownership of its buffer');
  });
});

test('capacity preflight wipes its detached POST body while earlier operations remain pending', async () => {
  await withTrackedCopies(async (copies, Native) => {
    const gates = [];
    const driver = new BoundedHttpDriver(async () => new Promise(resolve => gates.push(resolve)));
    const active = Array.from({ length: MAX_HTTP_OPERATIONS }, () => driver.request(readyScope(), URL));
    try {
      assert.equal(driver.pending, MAX_HTTP_OPERATIONS);
      assert.equal(gates.length, MAX_HTTP_OPERATIONS);
      const source = new Native([7, 8, 9]);
      assert.deepEqual(await driver.request(readyScope(), URL, source), { ok: false, error: 'LIMIT_EXCEEDED' });
      assert.equal(driver.pending, MAX_HTTP_OPERATIONS, 'refusal does not release earlier physical slots');
      assert.equal(gates.length, MAX_HTTP_OPERATIONS, 'no additional outbound dispatch');
      assert.equal(copies.length, 1, 'the ninth body has its own detached copy');
      assert.deepEqual([...copies[0]], [0, 0, 0], 'capacity refusal erases the detached copy');
      assert.deepEqual([...source], [7, 8, 9]);
    } finally {
      for (const finish of gates) finish({
        ok: true, redirected: false, url: URL, headers: { get: () => null },
        body: new ReadableStream({ start(controller) { controller.enqueue(new Native([1])); controller.close(); } }),
      });
      const results = await Promise.all(active);
      assert.ok(results.every(result => result.ok), 'earlier operations still finish normally');
      assert.equal(driver.pending, 0);
    }
  });
});
