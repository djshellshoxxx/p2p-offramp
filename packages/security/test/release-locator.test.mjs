import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyRelease } from '../src/release-manifest.ts';
import { revalidateRelease } from '../src/release-proof.ts';
import { verifyReleaseLocator, RELEASE_LOCATOR_LIMITS } from '../src/release-locator.ts';
import { locatorFixture, RAW_CID, DAG_PB_CID } from './lib/locator-fixture.mjs';
import { canonical, encode } from './lib/release-fixture.mjs';
import { readFile } from 'node:fs/promises';

const rejected = (result, code) => { assert.deepEqual(result, { ok: false, error: { code } }); };
async function verified(f, options = {}) {
  const result = await verifyRelease(f.release.bytes, f.release.envelope, [f.release.key], 0, { ...f.release.options, channel: f.release.manifest.channel, ...options });
  assert.equal(result.ok, true); return result.value;
}
const check = (f, proof, options = {}) => verifyReleaseLocator(f.bytes, f.envelope, proof, [f.release.key], options);

test('locator authenticates canonical bindings with OpenSSL signatures and verifies only supplied archive bytes', async () => {
  const f = locatorFixture(), proof = await verified(f), result = await check(f, proof, { archiveBytes: f.archive });
  assert.equal(result.ok, true); assert.deepEqual(result.value.locator, f.locator);
  assert.equal(result.value.keyId, proof.keyId); assert.equal(result.value.archiveVerified, true);
  assert.equal(result.value.releaseEnabled, false); assert.equal(result.value.installationAllowed, false);
  assert.ok(Object.isFrozen(result.value) && Object.isFrozen(result.value.locator));
  assert.equal((await check(f, proof)).value.archiveVerified, false, 'absent archive bytes are never claimed verified');
  const absent = locatorFixture(m => m.archiveSha256 = null), absentProof = await verified(absent);
  assert.equal((await check(absent, absentProof)).ok, true);
  rejected(await check(absent, absentProof, { archiveBytes: absent.archive }), 'ASSET_MISMATCH');
  rejected(await check(f, proof, { archiveBytes: encode('altered archive') }), 'ASSET_MISMATCH');
});

test('locator accepts both supported canonical CIDv1 codecs and Unicode channels', async () => {
  for (const cid of [RAW_CID, DAG_PB_CID]) {
    const f = locatorFixture(m => m.cid = cid, m => m.channel = 'fixture-café-🌍'), proof = await verified(f);
    assert.equal((await check(f, proof)).ok, true);
  }
});

test('retained public OpenSSL/Python CID vector verifies through Node WebCrypto', async () => {
  const vector = JSON.parse(await readFile(new URL('./fixtures/release-locator-openssl.json', import.meta.url)));
  const release = await verifyRelease(new Uint8Array(vector.manifestBytes), vector.manifestEnvelope, [vector.key], 0,
    { channel: 'fixture-beta', nowSeconds: () => 1500, assets: vector.assets.map(a => ({ path: a.path, bytes: new Uint8Array(a.bytes) })) });
  assert.equal(release.ok, true);
  const result = await verifyReleaseLocator(new Uint8Array(vector.locatorBytes), vector.envelope, release.value, [vector.key], { archiveBytes: new Uint8Array(vector.archive) });
  assert.equal(result.ok, true); assert.equal(result.value.archiveVerified, true); assert.equal(result.value.locator.cid, RAW_CID);
});

test('locator identity is its signed payload binding, independent of a valid ECDSA s representation', async () => {
  const f = locatorFixture(), proof = await verified(f), signature = Buffer.from(f.envelope.signature, 'base64url');
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const alternate = order - BigInt('0x' + signature.subarray(32).toString('hex'));
  signature.set(Buffer.from(alternate.toString(16).padStart(64, '0'), 'hex'), 32);
  const a = await check(f, proof), b = await verifyReleaseLocator(f.bytes, { ...f.envelope, signature: signature.toString('base64url') }, proof, [f.release.key]);
  assert.equal(a.ok, true); assert.equal(b.ok, true); assert.deepEqual(a.value, b.value);
});

test('locator refuses unbranded success claims, JSON clones, unrelated proofs and expired sticky leases', async () => {
  const f = locatorFixture(), other = locatorFixture(), proof = await verified(f);
  for (const value of [null, {}, { ok: true, value: proof }, structuredClone(proof), JSON.parse(JSON.stringify(proof))]) {
    rejected(await check(f, value), 'MANIFEST_UNSUPPORTED'); rejected(revalidateRelease(value), 'MANIFEST_UNSUPPORTED');
  }
  rejected(await check(f, await verified(other)), 'KEY_UNTRUSTED');
  let now = 1500; const timed = await verified(f, { nowSeconds: () => now });
  now = 2000; rejected(await check(f, timed), 'MANIFEST_EXPIRED');
  now = 1500; rejected(await check(f, timed), 'MANIFEST_EXPIRED');
});

test('locator checks every exact manifest binding, including rollback/channel/created and expiry', async () => {
  for (const [field, value] of [['manifestSha256', '0'.repeat(64)], ['channel', 'other'], ['sequence', 1], ['createdAt', 1001], ['expiresAt', 1999]]) {
    const f = locatorFixture(m => m[field] = value), proof = await verified(f);
    rejected(await check(f, proof), 'ASSET_MISMATCH');
  }
});

test('locator separates key trust, signature/domain and unsupported envelope forms', async () => {
  const f = locatorFixture(), proof = await verified(f), other = locatorFixture();
  rejected(await verifyReleaseLocator(f.bytes, f.envelope, proof, [], {}), 'KEY_UNTRUSTED');
  rejected(await verifyReleaseLocator(f.bytes, f.envelope, proof, [other.release.key], {}), 'KEY_UNTRUSTED');
  rejected(await verifyReleaseLocator(f.bytes, { ...f.envelope, keyId: other.release.keyId }, proof, [other.release.key]), 'KEY_UNTRUSTED');
  for (const prefix of ['', 'p2p-offramp/release/v1\n', 'p2p-offramp/release-locator/v1\\n']) {
    rejected(await verifyReleaseLocator(f.bytes, f.makeEnvelope(f.bytes, prefix), proof, [f.release.key]), 'SIGNATURE_INVALID');
  }
  for (const env of [{ ...f.envelope, v: 1 }, { ...f.envelope, alg: 'ES256' }, { ...f.envelope, manifestSha256: proof.manifestSha256 }]) {
    rejected(await verifyReleaseLocator(f.bytes, env, proof, [f.release.key]), 'MANIFEST_UNSUPPORTED');
  }
  for (const signature of ['', 'A'.repeat(86), Buffer.alloc(64).toString('base64url'), Buffer.alloc(64, 255).toString('base64url'), f.makeEnvelope(f.bytes, undefined, 'der').signature]) {
    rejected(await verifyReleaseLocator(f.bytes, { ...f.envelope, signature }, proof, [f.release.key]), 'SIGNATURE_INVALID');
  }
});

test('locator rejects duplicate keys, noncanonical bytes/encoding, extra fields and malformed CID profiles', async () => {
  const f = locatorFixture(), proof = await verified(f), text = new TextDecoder().decode(f.bytes);
  for (const bytes of [encode(' ' + text), encode(text + '\n'), encode(JSON.stringify(f.locator)), encode(text.replace('"v":1', '"v":1,"v":1')),
    encode(text.replace('"sequence":2', '"sequence":2.0')), new Uint8Array([239, 187, 191, ...f.bytes]), new Uint8Array([255]),
    encode(canonical({ ...f.locator, extra: true })), encode(canonical({ ...f.locator, cid: { nested: [] } }))]) {
    rejected(await verifyReleaseLocator(bytes, f.makeEnvelope(bytes), proof, [f.release.key]), 'MANIFEST_UNSUPPORTED');
  }
  for (const cid of ['QmYwAPJzv5CZsnAzt8auVZRnGi2CZZpXtgSQCoU8trDWn9', RAW_CID.toUpperCase(), 'z' + RAW_CID.slice(1), RAW_CID + '=', RAW_CID + 'a',
    RAW_CID.slice(0, -1) + 'j', 'b' + 'a'.repeat(128), 'https://gateway.invalid/ipfs/' + RAW_CID, 'bafkrei']) {
    const changed = encode(canonical({ ...f.locator, cid }));
    rejected(await verifyReleaseLocator(changed, f.makeEnvelope(changed), proof, [f.release.key]), 'MANIFEST_UNSUPPORTED');
  }
});

test('locator snapshots all caller bytes, envelopes, keys and optional archive before its first await', async t => {
  const f = locatorFixture(), proof = await verified(f), subtle = globalThis.crypto.subtle, original = subtle.digest;
  let release, started; const gate = new Promise(done => release = done), entered = new Promise(done => started = done);
  let calls = 0;
  t.mock.method(subtle, 'digest', async function (...args) { if (++calls === 1) { started(); await gate; } return Reflect.apply(original, this, args); });
  const result = check(f, proof, { archiveBytes: f.archive }); await entered;
  f.bytes.fill(0); f.archive.fill(0); f.envelope.signature = ''; f.release.key.x = '';
  release(); assert.equal((await result).ok, true);
});

test('locator bounds hostile inputs without invoking getters or classifying foreign thrown values', async t => {
  const f = locatorFixture(), proof = await verified(f); let hits = 0;
  for (const input of [new Proxy({}, { getPrototypeOf() { throw 'foreign'; } }), { get keyId() { hits++; return f.envelope.keyId; }, alg: 'ES256-P1363', signature: f.envelope.signature }]) {
    rejected(await verifyReleaseLocator(f.bytes, input, proof, [f.release.key]), 'MANIFEST_UNSUPPORTED');
  }
  const bad = { ...f.release.key }; Object.defineProperty(bad, 'x', { get() { hits++; return ''; }, enumerable: true });
  rejected(await verifyReleaseLocator(f.bytes, f.envelope, proof, [bad]), 'KEY_UNTRUSTED');
  rejected(await verifyReleaseLocator(new Uint8Array(RELEASE_LOCATOR_LIMITS.locatorBytes + 1), f.envelope, proof, [f.release.key]), 'MANIFEST_UNSUPPORTED');
  rejected(await verifyReleaseLocator(f.bytes, f.envelope, proof, Array(RELEASE_LOCATOR_LIMITS.trustedKeys + 1).fill(f.release.key)), 'KEY_UNTRUSTED');
  const revocable = Proxy.revocable({}, {}); revocable.revoke();
  t.mock.method(globalThis.crypto.subtle, 'digest', () => Promise.reject(revocable.proxy));
  rejected(await check(f, proof), 'UNAVAILABLE'); assert.equal(hits, 0);
});

test('locator rechecks original manifest cancellation and local lifetime around every awaited provider stage', async t => {
  for (const stage of ['digest', 'importKey', 'verify', 'archive']) for (const mode of ['abort', 'expiry', 'current']) await t.test(`${stage}/${mode}`, async t => {
    const f = locatorFixture(), controller = new AbortController(); let now = 1500, current = true;
    const proof = await verified(f, { nowSeconds: () => now, signal: controller.signal });
    const subtle = globalThis.crypto.subtle, name = stage === 'archive' ? 'digest' : stage, original = subtle[name];
    let release, started, calls = 0; const gate = new Promise(done => release = done), entered = new Promise(done => started = done);
    t.mock.method(subtle, name, async function (...args) { if (++calls === (stage === 'archive' ? 2 : 1)) { started(); await gate; } return Reflect.apply(original, this, args); });
    const result = check(f, proof, { archiveBytes: f.archive, isCurrent: () => current }); await entered;
    if (mode === 'abort') controller.abort(); else if (mode === 'expiry') now = 2000; else current = false;
    release(); rejected(await result, mode === 'expiry' ? 'MANIFEST_EXPIRED' : 'CANCELLED');
  });
});

test('locator refuses invalid clocks, already-aborted signals and reentrant revocation without provider calls', async t => {
  const f = locatorFixture(), controller = new AbortController(), proof = await verified(f);
  const original = globalThis.crypto.subtle.digest; let calls = 0;
  t.mock.method(globalThis.crypto.subtle, 'digest', function (...args) { calls++; return Reflect.apply(original, this, args); });
  controller.abort(); rejected(await check(f, proof, { signal: controller.signal }), 'CANCELLED');
  rejected(await check(f, proof, { isCurrent: () => { throw new Error('private'); } }), 'CANCELLED');
  let now = 1500; const clockProof = await verified(f, { nowSeconds: () => now }); calls = 0;
  now = NaN; rejected(await check(f, clockProof), 'UNAVAILABLE'); assert.equal(calls, 0);
  const abort = new AbortController(); rejected(await check(f, proof, { signal: abort.signal, isCurrent: () => { abort.abort(); return true; } }), 'CANCELLED');
});
