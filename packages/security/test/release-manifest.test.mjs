import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyRelease, RELEASE_LIMITS } from '../src/release-manifest.ts';
import { verifyCryptoInventory } from '../src/crypto-inventory.ts';
import { fixture, sha, encode, canonical } from './lib/release-fixture.mjs';
const check = (f, options = {}, highest = 0) => verifyRelease(f.bytes, f.envelope, [f.key], highest, { ...f.options, ...options });
const rejected = (result, expected) => { assert.equal(result.ok, false); assert.equal(result.error.code, expected); assert.deepEqual(Object.keys(result.error), ['code']); };

test('G15 public-data purpose stays pending and cannot inherit another capability provider acceptance', async () => {
  const read = path => new Uint8Array(readFileSync(new URL('../../../' + path, import.meta.url)));
  const inventory = JSON.parse(new TextDecoder().decode(read('security/crypto-inventory.json')));
  const entry = inventory.find(item => item.id === 'native-webcrypto-g15-verification-test-only');
  assert.ok(entry); assert.equal(entry.review.status, 'pending');
  const lock = JSON.parse(new TextDecoder().decode(read('package-lock.json')));
  const paths = new Set(['security/browser-support.json', 'security/release-browser-support.json', ...inventory.flatMap(item => item.vectors.map(v => v.path)), ...inventory.map(item => item.review.evidencePath).filter(Boolean)]);
  const files = [...paths].map(path => ({ path, bytes: read(path) }));
  for (const state of ['test-enabled', 'release-enabled']) {
    const enabled = [{ capability: entry.capability, state, implementations: [{ inventoryId: entry.id }] }];
    const result = await verifyCryptoInventory(inventory, lock, enabled, files);
    assert.deepEqual(result.findings.map(item => item.code), ['MISSING_REVIEW']);
    assert.equal(result.findings[0].disposition, state === 'test-enabled' ? 'pending' : 'blocking');
    assert.equal(result.releaseEligible, false);
  }
});

test('G15 native P-256 verification matches published RFC6979 public primitive vector', async () => {
  const vector = JSON.parse(readFileSync(new URL('./fixtures/rfc6979-p256-public.json', import.meta.url)));
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: Buffer.from(vector.x, 'hex').toString('base64url'), y: Buffer.from(vector.y, 'hex').toString('base64url'), key_ops: ['verify'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sig = Buffer.from(vector.signature, 'hex');
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, encode(vector.message)), true);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, encode(vector.message + '!')), false);
});

test('G15 binds canonical manifest, explicit public trust and complete raw asset set without enabling a release', async () => {
  const f = fixture(), result = await check(f);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.manifestSha256, sha(f.bytes)); assert.equal(result.value.keyId, f.keyId);
  assert.equal(result.value.assetsVerified, true); assert.equal(result.value.releaseEnabled, false);
  assert.equal(result.value.deploymentsVerified, false);
  assert.equal(result.value.manifest.assets[0].path, '__proto__');
  assert.equal(result.value.manifest.assets[0].bytes, 4);
  assert.ok(Object.isFrozen(result.value) && Object.isFrozen(result.value.manifest.assets[0]));
});
test('G15 never trusts adjacent keys or accepts another trusted key, algorithm or signature domain', async () => {
  const f = fixture(), other = fixture();
  rejected(await verifyRelease(f.bytes, f.envelope, [], 0, f.options), 'KEY_UNTRUSTED');
  rejected(await verifyRelease(f.bytes, f.envelope, [other.key], 0, f.options), 'KEY_UNTRUSTED');
  for (const envelope of [{ ...f.envelope, key: f.key }, { ...f.envelope, alg: 'ES256' }, { ...f.envelope, v: 2 }])
    rejected(await verifyRelease(f.bytes, envelope, [f.key], 0, f.options), 'MANIFEST_UNSUPPORTED');
  for (const prefix of ['', 'p2p-offramp/release/v1\\n', 'p2p-offramp/release-locator/v1\n'])
    rejected(await verifyRelease(f.bytes, f.makeEnvelope(f.bytes, prefix), [f.key], 0, f.options), 'SIGNATURE_INVALID');
});
test('G15 rejects changed manifest bytes, wrong digest and non-P1363 or out-of-range signatures', async () => {
  const f = fixture();
  for (const signature of [f.envelope.signature + '=', '', 'x'.repeat(10000), Buffer.alloc(64).toString('base64url'), Buffer.alloc(64, 255).toString('base64url'), f.makeEnvelope(f.bytes, undefined, 'der').signature])
    rejected(await verifyRelease(f.bytes, { ...f.envelope, signature }, [f.key], 0, f.options), 'SIGNATURE_INVALID');
  rejected(await verifyRelease(f.bytes, { ...f.envelope, manifestSha256: '0'.repeat(64) }, [f.key], 0, f.options), 'SIGNATURE_INVALID');
  const changed = encode(canonical({ ...f.manifest, releaseId: 'different' }));
  rejected(await verifyRelease(changed, { ...f.envelope, manifestSha256: sha(changed) }, [f.key], 0, f.options), 'SIGNATURE_INVALID');
});
test('G15 rejects malformed or private JWKs without invoking accessors', async () => {
  const f = fixture(); let accessed = 0;
  for (const key of [{ ...f.key, d: 'SECRET' }, { ...f.key, ext: false }, { ...f.key, key_ops: ['sign'] }, { ...f.key, crv: 'P-384' }, { ...f.key, x: f.key.x + '=' },
    Object.defineProperty({ ...f.key }, 'x', { get() { accessed++; throw Error('SECRET'); } })])
    rejected(await verifyRelease(f.bytes, f.envelope, [key], 0, f.options), 'KEY_UNTRUSTED');
  assert.equal(accessed, 0);
});
test('G15 rejects an off-curve trusted JWK even when its fingerprint matches the envelope label', async () => {
  const f = fixture(), key = { ...f.key, x: Buffer.alloc(32).toString('base64url'), y: Buffer.alloc(32).toString('base64url') };
  const keyId = sha(encode(canonical({ crv: key.crv, kty: key.kty, x: key.x, y: key.y })));
  rejected(await verifyRelease(f.bytes, { ...f.envelope, keyId }, [key], 0, f.options), 'KEY_UNTRUSTED');
});
test('G15 release identity is the manifest digest, independent of valid ECDSA s representation', async () => {
  const f = fixture(), sig = Buffer.from(f.envelope.signature, 'base64url');
  const n = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const otherS = (n - BigInt('0x' + sig.subarray(32).toString('hex'))).toString(16).padStart(64, '0');
  const alternate = Buffer.concat([sig.subarray(0, 32), Buffer.from(otherS, 'hex')]).toString('base64url');
  assert.notEqual(alternate, f.envelope.signature);
  const a = await check(f), b = await verifyRelease(f.bytes, { ...f.envelope, signature: alternate }, [f.key], 0, f.options);
  assert.equal(a.ok, true); assert.equal(b.ok, true); assert.equal(a.value.manifestSha256, b.value.manifestSha256);
});
test('G15 canonical wire rejects duplicate/escaped keys, whitespace, reordering, numeric aliases, BOM and malformed UTF-8', async () => {
  const f = fixture(), text = new TextDecoder().decode(f.bytes);
  for (const bytes of [encode(' ' + text), encode(text + '\n'), encode(JSON.stringify(f.manifest)), encode(text.replace('"version":1', '"version":1,"version":1')),
    encode(text.replace('"version":1', '"vers\\u0069on":1')), encode(text.replace('"version":1', '"version":1e0')),
    encode(text.replace('fixture-café-🌍', 'fixture-caf\\u00e9-🌍')), new Uint8Array([0xef, 0xbb, 0xbf, ...f.bytes]), new Uint8Array([0xff, 0x80])])
    rejected(await verifyRelease(bytes, f.makeEnvelope(bytes), [f.key], 0, f.options), 'MANIFEST_UNSUPPORTED');
});
test('G15 rejects incomplete/unsupported metadata and unresolved deployment schemas', async () => {
  for (const edit of [m => m.extra = true, m => m.version = 2, m => m.sequence = 0, m => m.sequence = 1.5, m => m.createdAt = -1,
    m => m.maxStorageSchema = 0, m => m.expiresAt = m.createdAt + 30 * 86400 + 1, m => m.expiresAt = m.createdAt,
    m => m.sourceCommit = 'not-a-commit', m => m.lockfileDigest = 'bad', m => m.predecessorDigest = 'bad',
    m => m.releaseId = '\ud800', m => m.deployments = [{ invented: true }], m => delete m.sbomDigest]) {
    const f = fixture(edit); rejected(await check(f), 'MANIFEST_UNSUPPORTED');
  }
});
test('G15 enforces expected channel, expiry at the exact boundary, and source-bound monotonic sequence', async () => {
  const f = fixture(); rejected(await check(f, { channel: 'another' }), 'MANIFEST_UNSUPPORTED');
  rejected(await check(f, { nowSeconds: () => 2000 }), 'MANIFEST_EXPIRED');
  rejected(await check(f, { nowSeconds: () => 999 }), 'MANIFEST_UNSUPPORTED');
  rejected(await check(f, {}, 3), 'RELEASE_ROLLBACK'); rejected(await check(f, {}, 2), 'RELEASE_ROLLBACK');
  rejected(await check(f, { installedManifestSha256: '0'.repeat(64) }, 2), 'RELEASE_ROLLBACK');
  assert.equal((await check(f, { installedManifestSha256: sha(f.bytes) }, 2)).ok, true);
  assert.equal((await check(f, { nowSeconds: () => 1999 }, 1)).ok, true);
});
test('G15 compares complete asset paths, lengths and raw hashes, including non-text files', async () => {
  const f = fixture();
  const variants = [f.assets.slice(1), [...f.assets, { path: 'unlisted.js', bytes: encode('x') }], [...f.assets, f.assets[0]],
    f.assets.map((a, i) => i ? a : { ...a, bytes: new Uint8Array([0xff, 0x80, 0, 0x42]) }),
    f.assets.map((a, i) => i ? a : { ...a, bytes: new Uint8Array(3) }),
    f.assets.map((a, i) => i ? a : { ...a, path: '__PROTO__' }),
    f.assets.map((a, i) => i ? a : { ...a, kind: 'symlink' })];
  for (const assets of variants) rejected(await check(f, { assets }), 'ASSET_MISMATCH');
});
test('G15 signed path inventory rejects traversal, query, case collision, unsorted paths and aggregate overflow', async () => {
  for (const edit of [m => m.assets[0].path = '../x', m => m.assets[0].path = '/x', m => m.assets[0].path = 'a%2fb', m => m.assets[0].path = 'a?x',
    m => m.assets[0].path = 'a\\b', m => m.assets[0].path = 'a//b', m => m.assets.reverse(), m => m.assets.push({ ...m.assets[0] }),
    m => m.assets = [{ ...m.assets[0], path: 'A' }, { ...m.assets[0], path: 'a' }],
    m => m.assets[0].bytes = RELEASE_LIMITS.bundleBytes]) {
    const f = fixture(edit); rejected(await check(f), 'MANIFEST_UNSUPPORTED');
  }
});
test('G15 bounds manifest/key/asset counts before allocation or accessor execution', async () => {
  const f = fixture(); let accessed = 0;
  rejected(await verifyRelease(new Uint8Array(RELEASE_LIMITS.manifestBytes + 1), f.envelope, [f.key], 0, f.options), 'MANIFEST_UNSUPPORTED');
  rejected(await verifyRelease(f.bytes, f.envelope, Array(RELEASE_LIMITS.trustedKeys + 1).fill(f.key), 0, f.options), 'KEY_UNTRUSTED');
  const assets = Array(RELEASE_LIMITS.assets + 1).fill(Object.defineProperty({}, 'bytes', { get() { accessed++; throw Error('SECRET'); } }));
  rejected(await check(f, { assets }), 'ASSET_MISMATCH');
  const huge = new Uint8Array(new ArrayBuffer(RELEASE_LIMITS.bundleBytes + 1));
  rejected(await check(f, { assets: [{ path: 'x', bytes: huge }] }), 'ASSET_MISMATCH');
  assert.equal(accessed, 0);
});
test('G15 accepts the bounded 10000-entry inventory and refuses the next entry within the manifest byte cap', async () => {
  const assets = Array.from({ length: RELEASE_LIMITS.assets }, (_, i) => ({ path: 'a' + String(i).padStart(5, '0'), bytes: new Uint8Array() }));
  const records = assets.map(({ path, bytes }) => ({ path, bytes: 0, sha256: sha(bytes) }));
  const f = fixture(m => m.assets = records); assert.ok(f.bytes.length <= RELEASE_LIMITS.manifestBytes);
  assert.equal((await check(f, { assets })).ok, true);
  const oversized = fixture(m => m.assets = [...records, { ...records[0], path: 'a10000' }]);
  assert.ok(oversized.bytes.length <= RELEASE_LIMITS.manifestBytes, 'exercise count refusal independently of byte cap');
  rejected(await check(oversized, { assets }), 'MANIFEST_UNSUPPORTED');
});

async function heldDigest(t, body) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto.subtle;
  let release, started; const gate = new Promise(done => release = done), entered = new Promise(done => started = done); let first = true;
  const subtle = { digest: async (...args) => { if (first) { first = false; started(); await gate; } return native.digest(...args); }, importKey: native.importKey.bind(native), verify: native.verify.bind(native) };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle } });
  t.after(() => Object.defineProperty(globalThis, 'crypto', original));
  try { await body({ entered, release }); } finally { release(); Object.defineProperty(globalThis, 'crypto', original); }
}
test('G15 snapshots caller bytes/metadata/assets before a held asynchronous digest', async t => {
  const f = fixture();
  await heldDigest(t, async ({ entered, release }) => {
    const pending = check(f); await entered;
    f.bytes.fill(0); f.assets[0].bytes.fill(1); f.assets[0].path = 'changed'; f.envelope.signature = ''; f.key.x = ''; f.options.channel = 'changed';
    release(); assert.equal((await pending).ok, true);
  });
});
test('G15 cancellation/current-generation and late expiry win over a held crypto result', async t => {
  for (const mode of ['abort', 'generation', 'expiry', 'backward']) await t.test(mode, async t => {
    const f = fixture(), controller = new AbortController(); let current = true, now = 1500;
    await heldDigest(t, async ({ entered, release }) => {
      const pending = check(f, { signal: controller.signal, isCurrent: () => current, nowSeconds: () => now }); await entered;
      if (mode === 'abort') controller.abort(); if (mode === 'generation') current = false;
      if (mode === 'expiry') now = 2000; if (mode === 'backward') now = 1499;
      release(); rejected(await pending, mode === 'expiry' ? 'MANIFEST_EXPIRED' : mode === 'backward' ? 'UNAVAILABLE' : 'CANCELLED');
    });
  });
});
test('G15 returns fixed errors for thrown callbacks/native failures and cancelled input', async t => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  rejected(await check(f, { signal: controller.signal }), 'CANCELLED');
  rejected(await check(f, { isCurrent: () => { throw Error('SECRET'); } }), 'CANCELLED');
  rejected(await check(f, { nowSeconds: () => { throw Error('SECRET'); } }), 'UNAVAILABLE');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');t.after(() => Object.defineProperty(globalThis, 'crypto', original));
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined }); rejected(await check(f), 'UNAVAILABLE');
});
test('G15 cancellation from the last current callback cannot escape as a verified result', async t => {
  const f = fixture(m => m.assets = []), controller = new AbortController();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto.subtle;
  let verified = false, clocksAfterVerify = 0, armCancellation = false;
  const subtle = { digest: native.digest.bind(native), importKey: native.importKey.bind(native), verify: async (...args) => {
    const valid = await native.verify(...args); verified = true; return valid;
  } };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle } });
  t.after(() => Object.defineProperty(globalThis, 'crypto', original));
  const result = await check(f, { assets: [], signal: controller.signal,
    nowSeconds: () => { if (verified && ++clocksAfterVerify >= 2) armCancellation = true; return 1500; },
    isCurrent: () => { if (armCancellation) controller.abort(); return true; } });
  assert.equal(controller.signal.aborted, true, 'fixture must reach cancellation at the last callback');
  rejected(result, 'CANCELLED');
});

async function heldNativeStage(t, stage, body) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto.subtle;
  let release, entered, shouldReject = false, digests = 0;
  const gate = new Promise(done => release = done), started = new Promise(done => entered = done);
  const wrap = method => async (...args) => {
    const target = method === 'digest' ? ++digests === 3 && stage === 'asset-digest' : method === stage;
    if (target) { entered(); await gate; if (shouldReject) throw Error('SECRET native fixture failure'); }
    return Reflect.apply(native[method], native, args);
  };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: wrap('digest'), importKey: wrap('importKey'), verify: wrap('verify') } } });
  t.after(() => Object.defineProperty(globalThis, 'crypto', original));
  try { await body({ started, release, rejectNative: () => shouldReject = true }); }
  finally { release(); Object.defineProperty(globalThis, 'crypto', original); }
}
for (const stage of ['importKey', 'verify', 'asset-digest']) test(`G15 fences held ${stage} results and failures`, async t => {
  for (const mode of ['abort', 'generation', 'expiry', 'native-failure']) await t.test(mode, async t => {
    const f = fixture(), controller = new AbortController(); let current = true, now = 1500;
    await heldNativeStage(t, stage, async ({ started, release, rejectNative }) => {
      const pending = check(f, { signal: controller.signal, isCurrent: () => current, nowSeconds: () => now });
      await started;
      if (mode === 'abort') controller.abort(); if (mode === 'generation') current = false;
      if (mode === 'expiry') now = 2000; if (mode === 'native-failure') rejectNative();
      release(); rejected(await pending, mode === 'expiry' ? 'MANIFEST_EXPIRED' : mode === 'native-failure' ? 'UNAVAILABLE' : 'CANCELLED');
    });
  });
});

test('G15 foreign exceptions from metadata traps are never inspected and stay typed; cancellation wins', async () => {
  const f = fixture();
  for (const hook of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) for (const cancelled of [false, true]) {
    const controller = new AbortController(); let inspections = 0;
    const foreign = new Proxy({}, { getPrototypeOf() { inspections++; throw Error('SECRET foreign prototype'); },
      get() { inspections++; throw Error('SECRET foreign field'); } });
    const envelope = new Proxy(f.envelope, { [hook]() { if (cancelled) controller.abort(); throw foreign; } });
    rejected(await verifyRelease(f.bytes, envelope, [f.key], 0, { ...f.options, signal: controller.signal }), cancelled ? 'CANCELLED' : 'MANIFEST_UNSUPPORTED');
    assert.equal(inspections, 0, 'foreign errors must be discarded without prototype or property reads');
  }
});

test('G15 revoked and primitive thrown metadata values remain fixed typed refusals', async () => {
  const f = fixture(), revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const foreign of [revoked.proxy, null, undefined, 'SECRET', 17, Symbol('SECRET')]) {
    const envelope = new Proxy(f.envelope, { ownKeys() { throw foreign; } });
    rejected(await verifyRelease(f.bytes, envelope, [f.key], 0, f.options), 'MANIFEST_UNSUPPORTED');
  }
});

test('G15 importKey foreign rejection is opaque and typed; genuine DataError classification stays intact', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), native = globalThis.crypto.subtle;
  t.after(() => Object.defineProperty(globalThis, 'crypto', original));
  for (const mode of ['foreign', 'revoked', 'data']) {
    let reads = 0;
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    const foreign = new Proxy({}, { getPrototypeOf() { reads++; throw Error('SECRET prototype'); }, get() { reads++; throw Error('SECRET field'); } });
    const error = mode === 'data' ? new DOMException('fixture', 'DataError') : mode === 'revoked' ? revoked.proxy : foreign;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: { digest: native.digest.bind(native), importKey: async () => { throw error; }, verify: native.verify.bind(native) } } });
    rejected(await check(fixture()), mode === 'data' ? 'KEY_UNTRUSTED' : 'UNAVAILABLE');
    assert.equal(reads, 0);
  }
});
