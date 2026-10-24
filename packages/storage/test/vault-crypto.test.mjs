import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
const fixture = JSON.parse(await readFile(new URL('./fixtures/vault-python-v1.json', import.meta.url), 'utf8'));
const api = await import('../src/vault-crypto.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
function fn(name) { assert.equal(typeof api[name], 'function', `missing vault crypto: ${name}`); return api[name]; }
const copy = value => structuredClone(value);
function rng(chunks = fixture.randomChunksHex) {
  const remaining = [...chunks];
  return { subtle: webcrypto.subtle, getRandomValues(bytes) {
    const chunk = Buffer.from(remaining.shift() ?? '', 'hex');
    assert.equal(bytes.byteLength, chunk.length); bytes.set(chunk); return bytes;
  } };
}
async function authFailure(call) {
  await assert.rejects(call, error => error.code === 'AUTHENTICATION_FAILED' && error.message === 'Vault authentication failed.');
}
test('native Web Crypto exactly matches independent Python envelope fixture', async () => {
  const result = await fn('createEnvelope')(fixture.snapshot, fixture.passphrase, rng());
  assert.deepEqual(result.envelope, fixture.envelope);
  assert.equal(result.material.profileId, fixture.snapshot.profileId);
  assert.ok(Object.isFrozen(result.material));
  assert.equal(Object.hasOwn(result.material, 'key'), false);
});
test('opening independent fixture returns defensive authenticated data and opaque material', async () => {
  const opened = await fn('openEnvelope')(fixture.envelope, fixture.passphrase, webcrypto);
  assert.deepEqual(opened.snapshot, fixture.snapshot);
  assert.equal(opened.material.keyId, fixture.snapshot.keyId);
  opened.snapshot.records[0].payload = '';
  const another = await fn('openEnvelope')(fixture.envelope, fixture.passphrase, webcrypto);
  assert.equal(another.snapshot.records[0].payload, 'SGVsbG8');
});
test('wrong passphrases and tampered authenticated metadata produce same fixed failure', async () => {
  const open = fn('openEnvelope');
  await authFailure(() => open(fixture.envelope, 'different test password', webcrypto));
  for (const change of [e => { e.profileId = 'c'.repeat(32); }, e => { e.keyId = 'c'.repeat(32); },
    e => { e.revision = 1; }, e => { e.wrappedKey.ciphertext = flip(e.wrappedKey.ciphertext); },
    e => { e.snapshot.ciphertext = flip(e.snapshot.ciphertext); }, e => { e.snapshot.nonce = flip(e.snapshot.nonce); }]) {
    const input = copy(fixture.envelope); change(input);
    await authFailure(() => open(input, fixture.passphrase, webcrypto));
  }
});
function flip(value) { const bytes = Buffer.from(value, 'base64url'); bytes[0] ^= 1; return bytes.toString('base64url'); }
test('invalid public format is rejected before any expensive derivation', async () => {
  const open = fn('openEnvelope'); let calls = 0;
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) { if (key === 'deriveKey') return () => { calls++; assert.fail('KDF must not run'); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
  }) };
  const input = copy(fixture.envelope); input.wrappedKey.iterations = 999999999;
  await assert.rejects(() => open(input, fixture.passphrase, provider), error => error.code === 'INVALID_INPUT');
  assert.equal(calls, 0);
});
test('new vaults use unrelated keys salt and nonces under repeated passphrase', async () => {
  const create = fn('createEnvelope');
  const a = await create(fixture.snapshot, fixture.passphrase, webcrypto);
  const b = await create(fixture.snapshot, fixture.passphrase, webcrypto);
  assert.notEqual(a.envelope.wrappedKey.salt, b.envelope.wrappedKey.salt);
  assert.notEqual(a.envelope.wrappedKey.ciphertext, b.envelope.wrappedKey.ciphertext);
  assert.notEqual(a.envelope.snapshot.nonce, b.envelope.snapshot.nonce);
  assert.notEqual(a.envelope.snapshot.ciphertext, b.envelope.snapshot.ciphertext);
});
test('revision encryption retains wrapped key and binds the new revision', async () => {
  const opened = await fn('openEnvelope')(fixture.envelope, fixture.passphrase, webcrypto);
  const next = copy(fixture.snapshot); next.revision = 1; next.records[0].payload = '';
  const encrypted = await fn('encryptRevision')(opened.material, next, 0);
  assert.deepEqual(encrypted.wrappedKey, fixture.envelope.wrappedKey);
  assert.notEqual(encrypted.snapshot.nonce, fixture.envelope.snapshot.nonce);
  const restored = await fn('openEnvelope')(encrypted, fixture.passphrase, webcrypto);
  assert.deepEqual(restored.snapshot, next);
  assert.equal(fixture.snapshot.revision, 0);
});
test('revision encryption rejects wrong binding nonsequential revision forged and disposed handles', async () => {
  const encrypt = fn('encryptRevision'), dispose = fn('disposeMaterial');
  const opened = await fn('openEnvelope')(fixture.envelope, fixture.passphrase, webcrypto);
  const next = copy(fixture.snapshot); next.revision = 1;
  const wrong = copy(next); wrong.profileId = 'c'.repeat(32);
  await assert.rejects(() => encrypt(opened.material, wrong, 0));
  await assert.rejects(() => encrypt(opened.material, next, 1));
  await assert.rejects(() => encrypt({ ...opened.material }, next, 0), error => error.code === 'LOCKED');
  dispose(opened.material); dispose(opened.material);
  await assert.rejects(() => encrypt(opened.material, next, 0), error => error.code === 'LOCKED');
});
test('random source failure never creates a weak fallback vault', async () => {
  const create = fn('createEnvelope');
  const provider = { subtle: webcrypto.subtle, getRandomValues() { throw new Error('SECRET rng failure'); } };
  await assert.rejects(() => create(fixture.snapshot, fixture.passphrase, provider), error =>
    error.code === 'UNSUPPORTED_ENVIRONMENT' && !error.message.includes('SECRET'));
});
test('discarded failed encryptions still exhaust the per-handle attempt budget', async () => {
  const open = fn('openEnvelope'), encrypt = fn('encryptRevision'); let calls = 0;
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) { if (key === 'encrypt') return async () => { calls++; throw new Error('SECRET simulated crypto failure'); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
  }) };
  const opened = await open(fixture.envelope, fixture.passphrase, provider);
  const next = copy(fixture.snapshot); next.revision = 1;
  for (let n = 0; n < 4096; n++) await assert.rejects(() => encrypt(opened.material, next, 0), error => error.code === 'UNSUPPORTED_ENVIRONMENT');
  await assert.rejects(() => encrypt(opened.material, next, 0), error => error.code === 'REKEY_REQUIRED');
  assert.equal(calls, 4096);
});
test('disposal during an in-flight encryption suppresses the result', async () => {
  const open = fn('openEnvelope'), encrypt = fn('encryptRevision'), dispose = fn('disposeMaterial');
  let ready, release;
  const started = new Promise(resolve => { ready = resolve; }), blocked = new Promise(resolve => { release = resolve; });
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) { if (key === 'encrypt') return async (...args) => {
      const result = await target.encrypt(...args); ready(); await blocked; return result;
    }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
  }) };
  const opened = await open(fixture.envelope, fixture.passphrase, provider), next = copy(fixture.snapshot); next.revision = 1;
  const operation = encrypt(opened.material, next, 0); await started;
  dispose(opened.material); release();
  await assert.rejects(operation, error => error.code === 'LOCKED');
});
test('invalid expected revision never coerces into a rekey decision', async () => {
  const opened = await fn('openEnvelope')(fixture.envelope, fixture.passphrase, webcrypto);
  const next = copy(fixture.snapshot); next.revision = 1;
  for (const invalid of ['1048575', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => fn('encryptRevision')(opened.material, next, invalid), error => error.code === 'INVALID_INPUT');
  }
});
test('unexpected hostile provider exceptions never escape fixed diagnostics', async () => {
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const provider = { getRandomValues() { throw revoked.proxy; }, subtle: webcrypto.subtle };
  await assert.rejects(() => fn('createEnvelope')(fixture.snapshot, fixture.passphrase, provider), error => error.code === 'UNSUPPORTED_ENVIRONMENT');
  const provider2 = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) { if (key === 'encrypt') return async () => { throw revoked.proxy; };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
  }) };
  await assert.rejects(() => fn('createEnvelope')(fixture.snapshot, fixture.passphrase, provider2), error => error.code === 'UNSUPPORTED_ENVIRONMENT');
});
test('owned passphrase DEK and plaintext arguments are wiped after successful crypto', async () => {
  const create = fn('createEnvelope'), captured = [];
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) { const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return async (...args) => {
        if (key === 'importKey' && args[0] === 'raw') captured.push(args[1]);
        if (key === 'encrypt') captured.push(args[2]);
        return value.apply(target, args);
      };
    }
  }) };
  await create(fixture.snapshot, fixture.passphrase, provider);
  assert.equal(captured.length, 4);
  for (const bytes of captured) assert.ok(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).every(byte => byte === 0));
});
test('missing or unsupported Web Crypto is distinct from a wrong password', async () => {
  const open = fn('openEnvelope');
  await assert.rejects(() => open(fixture.envelope, fixture.passphrase, { subtle: undefined }), error => error.code === 'UNSUPPORTED_ENVIRONMENT');
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) { if (key === 'deriveKey') return async () => { throw new DOMException('SECRET unsupported profile', 'NotSupportedError'); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
  }) };
  await assert.rejects(() => open(fixture.envelope, fixture.passphrase, provider), error => error.code === 'UNSUPPORTED_ENVIRONMENT');
});
test('authenticated malformed plaintext and mismatched inner metadata share authentication failure', async () => {
  const open = fn('openEnvelope');
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(fixture.randomChunksHex[0], 'hex'), 'AES-GCM', false, ['encrypt']);
  for (const mode of ['padding', 'metadata']) {
    const input = copy(fixture.envelope), inner = copy(fixture.snapshot);
    if (mode === 'metadata') inner.keyId = 'c'.repeat(32);
    const json = new TextEncoder().encode(JSON.stringify(inner)), padded = new Uint8Array(4096);
    new DataView(padded.buffer).setUint32(0, json.length); padded.set(json, 4);
    if (mode === 'padding') padded[4095] = 1;
    const aad = new TextEncoder().encode(JSON.stringify(['p2p-offramp', 'vault-snapshot', 1, input.profileId, input.keyId, 0]));
    input.snapshot.ciphertext = Buffer.from(await webcrypto.subtle.encrypt({ name: 'AES-GCM',
      iv: Buffer.from(input.snapshot.nonce, 'base64url'), additionalData: aad, tagLength: 128 }, key, padded)).toString('base64url');
    await authFailure(() => open(input, fixture.passphrase, webcrypto));
  }
});
