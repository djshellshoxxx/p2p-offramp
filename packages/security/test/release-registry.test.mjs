import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRelease, createReleaseRegistry } from '../src/release-manifest.ts';
import { registryFixture } from './lib/release-registry-fixture.mjs';
const proof = async (f, options = {}) => {
  const result = await verifyRelease(f.bytes, f.envelope, [f.key], 0, { ...f.options, ...options });
  assert.equal(result.ok, true, JSON.stringify(result)); return result.value;
};
const refused = (result, code) => { assert.equal(result.ok, false); assert.deepEqual(result.error, { code }); };

test('G15→G11 binds one exact verified asset and release ID to guarded immutable registry lookups', async () => {
  const f = registryFixture(), checked = await proof(f);
  const loaded = await createReleaseRegistry(checked, f.registryPath, f.registryBytes);
  assert.equal(loaded.ok, true, JSON.stringify(loaded));
  const reader = loaded.value;
  assert.equal(reader.releaseEnabled, false); assert.equal(reader.liveValidated, false);
  assert.equal(reader.releaseId, 'fixture-0001'); assert.equal(reader.manifestSha256, f.envelope.manifestSha256);
  assert.equal(reader.network('local-evm').chainIdentity, '31337');
  assert.equal(reader.deployment('local-evm', 'escrow-fixture').address, '0x' + '22'.repeat(20));
  assert.equal(reader.network('missing'), null); assert.equal(reader.deployment('local-evm', 'missing'), null);
  assert.ok(Object.isFrozen(reader) && Object.isFrozen(reader.network('local-evm')));
  assert.deepEqual(Object.keys(reader).sort(), ['deployment', 'liveValidated', 'manifestSha256', 'network', 'registryPath', 'releaseEnabled', 'releaseId']);
});
test('G15→G11 rejects copied/scanned/proxy verification metadata without invoking its accessors', async () => {
  const f = registryFixture(), checked = await proof(f); let touched = 0;
  const proxy = new Proxy(checked, { get() { touched++; throw Error('SECRET'); }, ownKeys() { touched++; throw Error('SECRET'); } });
  for (const candidate of [null, 'text', { ...checked }, structuredClone(checked), Object.create(checked), proxy])
    refused(await createReleaseRegistry(candidate, f.registryPath, f.registryBytes), 'MANIFEST_UNSUPPORTED');
  assert.equal(touched, 0);
});
test('G15→G11 refuses unlisted/wrong-path/modified bytes and malformed or mismatched registry assets', async () => {
  const f = registryFixture(), checked = await proof(f), changed = new Uint8Array(f.registryBytes); changed[0] ^= 1;
  refused(await createReleaseRegistry(checked, 'missing.json', f.registryBytes), 'ASSET_MISMATCH');
  refused(await createReleaseRegistry(checked, 'REGISTRY.json', f.registryBytes), 'ASSET_MISMATCH');
  refused(await createReleaseRegistry(checked, f.registryPath, changed), 'ASSET_MISMATCH');
  for (const options of [{ editRegistry: r => r.releaseId = 'different' }, { editRegistry: r => r.extra = true }, { editRegistry: r => r.networks[0].endpoints[0].url = 'https://SECRET@rpc.invalid/' }]) {
    const bad = registryFixture(options), p = await proof(bad);
    refused(await createReleaseRegistry(p, bad.registryPath, bad.registryBytes), 'MANIFEST_UNSUPPORTED');
  }
});
test('G15→G11 expiry and session revocation fence every lookup and cannot revive if a callback changes back', async () => {
  for (const mode of ['expiry', 'generation', 'clock-backward', 'clock-throw', 'abort']) {
    const f = registryFixture(), controller = new AbortController(); let now = 1500, current = true, clockThrows = false;
    const p = await proof(f, { signal: controller.signal, isCurrent: () => current, nowSeconds: () => { if (clockThrows) throw Error('SECRET'); return now; } });
    const loaded = await createReleaseRegistry(p, f.registryPath, f.registryBytes); assert.equal(loaded.ok, true);
    assert.ok(loaded.value.network('local-evm'));
    if (mode === 'expiry') now = 2000; if (mode === 'generation') current = false; if (mode === 'clock-backward') now = 1499;
    if (mode === 'clock-throw') clockThrows = true; if (mode === 'abort') controller.abort();
    assert.equal(loaded.value.network('local-evm'), null); assert.equal(loaded.value.deployment('local-evm', 'escrow-fixture'), null);
    now = 1500; current = true; clockThrows = false;
    assert.equal(loaded.value.network('local-evm'), null, 'revoked proof cannot revive');
    refused(await createReleaseRegistry(p, f.registryPath, f.registryBytes), mode === 'expiry' ? 'MANIFEST_EXPIRED' : mode.startsWith('clock') ? 'UNAVAILABLE' : 'CANCELLED');
  }
});

async function heldRegistryHash(t, body) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto;
  let entered, release; const started = new Promise(done => entered = done), gate = new Promise(done => release = done);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: native.getRandomValues.bind(native),
    subtle: { digest: async (...args) => { entered(); await gate; return native.subtle.digest(...args); } } } });
  t.after(() => Object.defineProperty(globalThis, 'crypto', descriptor));
  try { await body({ started, release }); } finally { release(); Object.defineProperty(globalThis, 'crypto', descriptor); }
}
test('G15→G11 held load snapshots bytes and withholds the private service if expiry/session changes during hash', async t => {
  for (const mode of ['caller-mutation', 'expiry', 'generation', 'abort']) await t.test(mode, async t => {
    const f = registryFixture(), controller = new AbortController(); let now = 1500, current = true;
    const p = await proof(f, { signal: controller.signal, isCurrent: () => current, nowSeconds: () => now });
    await heldRegistryHash(t, async ({ started, release }) => {
      const pending = createReleaseRegistry(p, f.registryPath, f.registryBytes); await started;
      if (mode === 'caller-mutation') f.registryBytes.fill(0); if (mode === 'expiry') now = 2000;
      if (mode === 'generation') current = false; if (mode === 'abort') controller.abort();
      release(); const result = await pending;
      if (mode === 'caller-mutation') { assert.equal(result.ok, true); assert.equal(result.value.network('local-evm').chainIdentity, '31337'); }
      else refused(result, mode === 'expiry' ? 'MANIFEST_EXPIRED' : 'CANCELLED');
    });
  });
});
test('G15→G11 nested revocation dominates a callback that restores its state before an outer projection', async t => {
  for (const mode of ['current', 'clock']) for (const projection of ['network', 'deployment', 'post-load']) await t.test(`${mode}/${projection}`, async t => {
    const f = registryFixture(); let reader, armed = false, current = true, clockFault = false, reads = 0;
    const target = projection === 'post-load' ? 1 : mode === 'current' ? 3 : 2;
    const revokeNested = () => {
      armed = false;
      if (mode === 'current') current = false; else clockFault = true;
      assert.equal(reader.network('local-evm'), null, 'nested guard must observe and latch revocation');
      current = true; clockFault = false;
    };
    const p = await proof(f, {
      isCurrent: () => { if (armed && mode === 'current' && ++reads === target) revokeNested(); return current; },
      nowSeconds: () => { if (armed && mode === 'clock' && ++reads === target) revokeNested(); if (clockFault) throw Error('SECRET'); return 1500; },
    });
    const initial = await createReleaseRegistry(p, f.registryPath, f.registryBytes); assert.equal(initial.ok, true); reader = initial.value;
    if (projection === 'post-load') await heldRegistryHash(t, async ({ started, release }) => {
      const pending = createReleaseRegistry(p, f.registryPath, f.registryBytes); await started; armed = true; release();
      refused(await pending, mode === 'current' ? 'CANCELLED' : 'UNAVAILABLE');
    });
    else {
      armed = true;
      const value = projection === 'network' ? reader.network('local-evm') : reader.deployment('local-evm', 'escrow-fixture');
      assert.equal(armed, false, 'fixture must reach the reentrant final guard');
      assert.equal(value, null, 'outer projection must respect nested terminal revocation');
    }
    assert.equal(reader.network('local-evm'), null);
    refused(await createReleaseRegistry(p, f.registryPath, f.registryBytes), mode === 'current' ? 'CANCELLED' : 'UNAVAILABLE');
  });
});
test('G15→G11 a throwing reentrant clock does not call observers after terminal revocation', async () => {
  const f = registryFixture(); let reader, armed = false, current = true, terminal = false, clocks = 0, callsAfterTerminal = 0;
  const p = await proof(f, {
    isCurrent: () => { if (terminal) callsAfterTerminal++; return current; },
    nowSeconds: () => {
      if (armed && ++clocks === 2) {
        armed = false; current = false; assert.equal(reader.network('local-evm'), null);
        current = true; terminal = true; throw Error('SECRET');
      }
      return 1500;
    },
  });
  const loaded = await createReleaseRegistry(p, f.registryPath, f.registryBytes); assert.equal(loaded.ok, true); reader = loaded.value;
  armed = true; assert.equal(reader.network('local-evm'), null);
  assert.equal(terminal, true); assert.equal(callsAfterTerminal, 0);
  refused(await createReleaseRegistry(p, f.registryPath, f.registryBytes), 'CANCELLED');
});

test('G15→G11 foreign byte-view trap errors are not inspected; terminal cancellation retains precedence', async () => {
  const f = registryFixture();
  for (const cancelled of [false, true]) {
    const controller = new AbortController(), p = await proof(f, { signal: controller.signal }); let inspections = 0;
    const foreign = new Proxy({}, { getPrototypeOf() { inspections++; throw Error('SECRET foreign prototype'); },
      get() { inspections++; throw Error('SECRET foreign field'); } });
    const input = new Proxy(f.registryBytes, { getPrototypeOf() { if (cancelled) controller.abort(); throw foreign; } });
    refused(await createReleaseRegistry(p, f.registryPath, input), cancelled ? 'CANCELLED' : 'UNAVAILABLE');
    assert.equal(inspections, 0);
  }
});
