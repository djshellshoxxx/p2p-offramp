import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const api = await import('../src/vault.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
function fn(name) {
  assert.equal(typeof api[name], 'function', `missing vault implementation: ${name}`);
  return api[name];
}
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const envelope = () => ({
  format: 'p2p-offramp-vault', version: 1, profileId: 'a'.repeat(32), keyId: 'b'.repeat(32), revision: 0,
  wrappedKey: { kdf: 'PBKDF2-SHA256', iterations: 600000, salt: b64(new Uint8Array(32)),
    cipher: 'AES-256-GCM', nonce: b64(new Uint8Array(12)), ciphertext: b64(new Uint8Array(48)) },
  snapshot: { nonce: b64(new Uint8Array(12)), ciphertext: b64(new Uint8Array(4112)) },
});
const record = (id = '1'.repeat(32)) => ({ id, kind: 'preference', schemaVersion: 1, payload: '' });
const snapshot = () => ({ format: 'p2p-offramp-private-records', version: 1,
  profileId: 'a'.repeat(32), keyId: 'b'.repeat(32), revision: 0, records: [record()] });
function invalid(call, code = 'INVALID_INPUT') {
  assert.throws(call, error => error.code === code && !error.message.includes('SECRET'));
}
function rawPadded(text) {
  const json = new TextEncoder().encode(text);
  const out = new Uint8Array(Math.ceil((json.length + 4) / 4096) * 4096);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  return out;
}

test('canonical base64url round trips independent byte encodings', () => {
  const decode = fn('decodeBase64url'), encode = fn('encodeBase64url');
  for (const length of [0, 1, 2, 3, 31, 32, 255, 8193]) {
    const bytes = randomBytes(length), expected = b64(bytes);
    assert.equal(encode(new Uint8Array(bytes)), expected);
    assert.deepEqual(decode(expected, length, length), new Uint8Array(bytes));
  }
});
test('base64url rejects ambiguous encodings, invalid syntax and wrong bounds', () => {
  const decode = fn('decodeBase64url');
  for (const input of ['A', 'AA=', 'AA==', 'AB', 'AAB', 'A+', 'A/', 'AA\n', ' AA', null, 1]) {
    invalid(() => decode(input, 0, 32));
  }
  invalid(() => decode('AAAA', 0, 2), 'LIMIT_EXCEEDED');
  invalid(() => decode('', 1, 2));
  invalid(() => decode('', -1, 2));
  invalid(() => decode('', 3, 2));
});
test('envelope accepts exact supported shape and returns defensive nested copies', () => {
  const parse = fn('parseVaultEnvelope'), original = envelope();
  const parsed = parse(original);
  assert.deepEqual(parsed, original);
  assert.notEqual(parsed, original);
  assert.notEqual(parsed.wrappedKey, original.wrappedKey);
  assert.notEqual(parsed.snapshot, original.snapshot);
  original.wrappedKey.salt = 'SECRET';
  assert.equal(parsed.wrappedKey.salt, b64(new Uint8Array(32)));
});
test('envelope rejects unknown fields at all object levels and unsafe objects', () => {
  const parse = fn('parseVaultEnvelope');
  for (const location of ['root', 'wrappedKey', 'snapshot']) {
    const input = envelope();
    (location === 'root' ? input : input[location]).extra = 'SECRET';
    invalid(() => parse(input));
  }
  for (const input of [null, [], 'SECRET', Object.create(envelope())]) invalid(() => parse(input));
  const input = envelope();
  Object.defineProperty(input, 'revision', { get() { assert.fail('must not execute getter'); }, enumerable: true });
  invalid(() => parse(input));
  const symbolInput = envelope(); symbolInput[Symbol('SECRET')] = 1;
  invalid(() => parse(symbolInput));
});
test('envelope rejects unsupported versions and invalid exact crypto profile', () => {
  const parse = fn('parseVaultEnvelope');
  const future = envelope(); future.version = 2;
  invalid(() => parse(future), 'UNSUPPORTED_VERSION');
  for (const patch of [{ kdf: 'argon2id' }, { iterations: 599999 }, { iterations: 600001 },
    { iterations: '600000' }, { cipher: 'AES-128-GCM' }]) {
    const input = envelope(); Object.assign(input.wrappedKey, patch); invalid(() => parse(input));
  }
});
test('envelope enforces identifiers, revision and fixed key/nonce/tag lengths', () => {
  const parse = fn('parseVaultEnvelope');
  for (const patch of [{ profileId: 'A'.repeat(32) }, { keyId: 'a'.repeat(31) },
    { revision: -1 }, { revision: 1048576 }, { revision: 0.5 }, { revision: NaN },
    { revision: Number.MAX_SAFE_INTEGER + 1 }, { revision: '0' }]) {
    invalid(() => parse(Object.assign(envelope(), patch)));
  }
  for (const [key, size] of [['salt', 31], ['salt', 33], ['nonce', 11], ['nonce', 13], ['ciphertext', 47], ['ciphertext', 49]]) {
    const input = envelope(); input.wrappedKey[key] = b64(new Uint8Array(size));
    assert.throws(() => parse(input));
  }
  const max = envelope(); max.revision = 1048575; assert.equal(parse(max).revision, 1048575);
});
test('snapshot ciphertext validates padding-size buckets before crypto', () => {
  const parse = fn('parseVaultEnvelope');
  for (const size of [0, 16, 4111, 4113, 8207]) {
    const input = envelope(); input.snapshot.ciphertext = b64(new Uint8Array(size));
    assert.throws(() => parse(input));
  }
  const valid = envelope(); valid.snapshot.ciphertext = b64(new Uint8Array(8208));
  assert.equal(parse(valid).snapshot.ciphertext, valid.snapshot.ciphertext);
  const oversized = envelope(); oversized.snapshot.ciphertext = 'A'.repeat(Math.ceil(8388624 * 4 / 3) + 1);
  invalid(() => parse(oversized), 'LIMIT_EXCEEDED');
});
test('snapshot parser validates sorted unique records and returns defensive copies', () => {
  const parse = fn('parsePrivateSnapshot'), input = snapshot(); input.records.push(record('2'.repeat(32)));
  const out = parse(input); assert.deepEqual(out, input); assert.notEqual(out.records[0], input.records[0]);
  input.records[0].payload = 'SECRET'; assert.equal(out.records[0].payload, '');
  const duplicate = snapshot(); duplicate.records.push(record()); invalid(() => parse(duplicate));
  const unordered = snapshot(); unordered.records = [record('2'.repeat(32)), record()]; invalid(() => parse(unordered));
});
test('snapshot parser enforces record kinds, schema versions, IDs and count', () => {
  const parse = fn('parsePrivateSnapshot');
  for (const patch of [{ kind: 'private-key' }, { schemaVersion: 0 }, { schemaVersion: 65536 },
    { schemaVersion: '1' }, { schemaVersion: 1.5 }, { id: 'G'.repeat(32) }, { extra: 'SECRET' }]) {
    const input = snapshot(); Object.assign(input.records[0], patch); invalid(() => parse(input));
  }
  for (const kind of ['identity', 'preference', 'trade', 'chat', 'journal']) {
    const input = snapshot(); input.records[0].kind = kind; assert.equal(parse(input).records[0].kind, kind);
  }
  const many = snapshot(); many.records = Array.from({length: 10001}, (_, n) => record(n.toString(16).padStart(32, '0')));
  invalid(() => parse(many), 'LIMIT_EXCEEDED');
});
test('snapshot parser enforces decoded payload size and canonical encoding', () => {
  const parse = fn('parsePrivateSnapshot');
  const input = snapshot(); input.records[0].payload = b64(new Uint8Array(262144));
  assert.equal(parse(input).records[0].payload, input.records[0].payload);
  input.records[0].payload = b64(new Uint8Array(262145)); invalid(() => parse(input), 'LIMIT_EXCEEDED');
  input.records[0].payload = 'AB'; invalid(() => parse(input));
});
test('snapshot encoding has deterministic exact JSON field order and zero padding', () => {
  const encode = fn('encodeSnapshot'), decode = fn('decodeSnapshot'), input = snapshot();
  const bytes = encode(input);
  assert.equal(bytes.length, 4096);
  const length = new DataView(bytes.buffer).getUint32(0);
  assert.equal(new TextDecoder().decode(bytes.subarray(4, 4 + length)), JSON.stringify(input));
  assert.ok(bytes.subarray(4 + length).every(n => n === 0));
  assert.deepEqual(decode(bytes), input);
  assert.deepEqual(input, snapshot());
  assert.deepEqual(encode(input), bytes);
});
test('snapshot padding crosses boundaries without losing records', () => {
  const encode = fn('encodeSnapshot'), decode = fn('decodeSnapshot');
  for (const size of [0, 2800, 2900, 3000, 6100, 262144]) {
    const input = snapshot(); input.records[0].payload = b64(new Uint8Array(size));
    const bytes = encode(input);
    assert.equal(bytes.length % 4096, 0);
    assert.deepEqual(decode(bytes), input);
  }
});
test('snapshot decoder rejects truncated, invalid prefix and nonzero padding', () => {
  const encode = fn('encodeSnapshot'), decode = fn('decodeSnapshot');
  for (const size of [0, 3, 4095, 4097, 8388609]) invalid(() => decode(new Uint8Array(size)));
  const bytes = encode(snapshot());
  const prefix = bytes.slice(); new DataView(prefix.buffer).setUint32(0, 4096); invalid(() => decode(prefix));
  const padding = bytes.slice(); padding[padding.length - 1] = 1; invalid(() => decode(padding));
  const utf = bytes.slice(); utf[4] = 0xff; invalid(() => decode(utf));
});
test('snapshot decoder rejects ambiguous JSON and duplicate object keys', () => {
  const decode = fn('decodeSnapshot');
  invalid(() => decode(rawPadded(' '+JSON.stringify(snapshot()))));
  invalid(() => decode(rawPadded(JSON.stringify(snapshot()).replace('"version":1', '"version":1,"version":1'))));
  invalid(() => decode(rawPadded('{"SECRET":true}')));
});
test('aggregate snapshot byte limit fails before unbounded serialization', () => {
  const encode = fn('encodeSnapshot'), input = snapshot();
  const payload = b64(new Uint8Array(262144));
  input.records = Array.from({ length: 25 }, (_, n) => ({ ...record(n.toString(16).padStart(32, '0')), payload }));
  invalid(() => encode(input), 'LIMIT_EXCEEDED');
});
test('passphrase encoding preserves exact input and rejects malformed Unicode and length', () => {
  const encode = fn('encodePassphrase');
  assert.deepEqual(encode('  twelve chars  '), new TextEncoder().encode('  twelve chars  '));
  for (const input of ['short', 'a'.repeat(1025), 'a'.repeat(12)+'\ud800', 'a'.repeat(12)+'\udc00', null]) invalid(() => encode(input));
  assert.equal(encode('é'.repeat(512)).length, 1024);
  invalid(() => encode('é'.repeat(513)));
  assert.notDeepEqual(encode('a'.repeat(12)+'é'), encode('a'.repeat(12)+'e\u0301'));
});
test('malformed envelope fuzz is bounded and never leaks input diagnostics', () => {
  const parse = fn('parseVaultEnvelope');
  for (let n = 0; n < 1000; n++) {
    const input = envelope(); input.revision = n % 2 ? -n : `SECRET${n}`;
    invalid(() => parse(input));
  }
});
test('hostile reflection errors are sanitized at every object boundary', () => {
  const parse = fn('parseVaultEnvelope');
  for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    const hostile = new Proxy(envelope(), { [trap]() { throw new Error('SECRET payload'); } });
    invalid(() => parse(hostile));
    const input = envelope();
    input.wrappedKey = new Proxy(input.wrappedKey, { [trap]() { throw new Error('SECRET payload'); } });
    invalid(() => parse(input));
  }
  const revoked = Proxy.revocable(envelope(), {}); revoked.revoke();
  invalid(() => parse(revoked.proxy));
});
test('invalid oversized object shape is rejected before descriptor materialization', () => {
  const parse = fn('parseVaultEnvelope');
  const input = { ...envelope(), ...Object.fromEntries(Array.from({ length: 1000 }, (_, n) => [`extra${n}`, n])) };
  let descriptors = 0;
  const proxy = new Proxy(input, { getOwnPropertyDescriptor(target, key) {
    descriptors++; return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  invalid(() => parse(proxy));
  assert.equal(descriptors, 0);
});
test('snapshot arrays reject sparse, accessor and extra fields without executing accessors', () => {
  const parse = fn('parsePrivateSnapshot');
  const sparse = snapshot(); sparse.records = new Array(1); invalid(() => parse(sparse));
  const extra = snapshot(); extra.records.extra = 'SECRET'; invalid(() => parse(extra));
  const accessor = snapshot(); Object.defineProperty(accessor.records, '0', {
    get() { assert.fail('must not execute array getter'); }, enumerable: true,
  }); invalid(() => parse(accessor));
  const hostile = snapshot(); hostile.records = new Proxy(hostile.records, {
    getOwnPropertyDescriptor() { throw new Error('SECRET array payload'); },
  }); invalid(() => parse(hostile));
});
test('typed-array offset views decode the exact slice and valid surrogate pairs are preserved', () => {
  const encode = fn('encodeSnapshot'), decode = fn('decodeSnapshot'), phrase = fn('encodePassphrase');
  const encoded = encode(snapshot()), backing = new Uint8Array(encoded.length + 10);
  backing.set(encoded, 5);
  assert.deepEqual(decode(backing.subarray(5, 5 + encoded.length)), snapshot());
  assert.deepEqual(phrase('a'.repeat(12)+'😀'), new TextEncoder().encode('a'.repeat(12)+'😀'));
});
