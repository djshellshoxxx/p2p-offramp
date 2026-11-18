import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ValidationError } from '../src/vault.ts';
const fixture = JSON.parse(await readFile(new URL('../../storage/test/fixtures/vault-python-v1.json', import.meta.url)));
const api = await import('../src/backup.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const fn = name => { assert.equal(typeof api[name], 'function', `missing ${name}`); return api[name]; };
const bytes = text => new TextEncoder().encode(text);
const envelope = fixture.envelope;
const checksum = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
const document = () => ({ format: 'p2p-offramp-backup', version: 1, envelope: structuredClone(envelope), checksum });
const invalid = (operation, code = 'INVALID_INPUT') => assert.throws(operation, error => error.code === code && !error.message.includes('SECRET'));

test('G03 canonical envelope bytes preserve exact G02 field order and independent checksum bytes', () => {
  const encoded = fn('canonicalEnvelopeBytes')(envelope);
  assert.equal(new TextDecoder().decode(encoded), JSON.stringify(envelope));
  assert.equal(createHash('sha256').update(encoded).digest('hex'), checksum);
  const input = document(); const parsed = fn('parseBackupBytes')(bytes(JSON.stringify(input)));
  assert.deepEqual(parsed, input); assert.notEqual(parsed.envelope, input.envelope);
});
test('G03 parses bounded whitespace/order variants but rejects duplicate and escaped duplicate keys', () => {
  const parse = fn('parseBackupBytes');
  assert.deepEqual(parse(bytes(JSON.stringify(document(), null, 2))), document());
  for (const text of [JSON.stringify(document()).replace('"version":1', '"version":1,"version":1'),
    JSON.stringify(document()).replace('"version":1', '"version":1,"\\u0076ersion":1'),
    JSON.stringify(document()).replace('"nonce":', '"nonce":"AAAAAAAAAAAAAAAA","nonce":')]) invalid(() => parse(bytes(text)));
});
test('G03 rejects over-limit bytes before decoding and rejects malformed/unknown/bad public KDF input', () => {
  const parse = fn('parseBackupBytes'); assert.equal(api.MAX_BACKUP_BYTES, 12 * 1024 * 1024);
  invalid(() => parse(new Uint8Array(api.MAX_BACKUP_BYTES + 1)), 'LIMIT_EXCEEDED');
  for (const text of ['{SECRET', '[]', 'null', '{"format":"SECRET","a":' + '{"a":'.repeat(10) + '0' + '}'.repeat(11)]) invalid(() => parse(bytes(text)));
  for (const change of [d => { d.extra = 1; }, d => { d.checksum = 'A'.repeat(64); }, d => { d.envelope.snapshot.extra = 'SECRET'; }, d => { d.envelope.wrappedKey.iterations = 1; }, d => { d.envelope.snapshot.nonce = d.envelope.snapshot.nonce.slice(0, -1) + '='; }]) {
    const input = document(); change(input); invalid(() => parse(bytes(JSON.stringify(input))));
  }
  const future = document(); future.version = 2; invalid(() => parse(bytes(JSON.stringify(future))), 'UNSUPPORTED_VERSION');
});
test('G03 rejects hostile byte/object reflection with fixed diagnostics and no supplied getters', () => {
  const parse = fn('parseBackupBytes'); let accessed = 0;
  invalid(() => parse({ get byteLength() { accessed++; throw new Error('SECRET'); } })); assert.equal(accessed, 0);
  const revoked = Proxy.revocable(new Uint8Array(1), {}); revoked.revoke(); invalid(() => parse(revoked.proxy));
});

test('G03 exact12MiB input is inclusive and larger input rejects before a decoder is constructed', () => {
  const parse = fn('parseBackupBytes'); const encoded = bytes(JSON.stringify(document()));
  const maximum = new Uint8Array(api.MAX_BACKUP_BYTES).fill(0x20); maximum.set(encoded);
  assert.deepEqual(parse(maximum), document());
  const original = globalThis.TextDecoder; let constructed = 0;
  globalThis.TextDecoder = class { constructor() { constructed++; throw new Error('SECRET decoder invoked'); } };
  try { invalid(() => parse(new Uint8Array(api.MAX_BACKUP_BYTES + 1)), 'LIMIT_EXCEEDED'); assert.equal(constructed, 0); }
  finally { globalThis.TextDecoder = original; }
});
test('G03 copies byte views through intrinsics and rejects deterministic malformed transport samples', () => {
  const parse = fn('parseBackupBytes'); const encoded = bytes(JSON.stringify(document())); let touched = 0;
  Object.defineProperty(encoded, 'byteLength', { get() { touched++; throw new Error('SECRET'); } });
  assert.deepEqual(parse(encoded), document()); assert.equal(touched, 0);
  const plain = bytes(JSON.stringify(document()));
  for (let index = 0; index < 256; index++) invalid(() => parse(plain.subarray(0, Math.floor(index * plain.length / 256))));
});

test('G03 malformed object trees cannot amplify a bounded input into an unbounded parsed object graph', () => {
  const parse = fn('parseBackupBytes'); const original = Object.create; let objects = 0;
  const hostile = bytes('{"format":"p2p-offramp-backup","version":1,"envelope":{' + Array.from({ length: 32 }, (_, n) => '"x' + n + '":{}').join(',') + '}}');
  Object.create = (...args) => { if (args[0] === null) objects++; return original(...args); };
  try { invalid(() => parse(hostile)); assert.ok(objects <= 4, `allocated ${objects} objects before rejecting a four-object format`); }
  finally { Object.create = original; }
});

test('G03 foreign reflection failures become fresh fixed errors without reading exception getters', () => {
  const parse = fn('parseBackupBytes'); let reads = 0;
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const dataCode = new ValidationError('LIMIT_EXCEEDED');
  Object.defineProperty(dataCode, 'message', { get() { reads++; throw Error('SECRET message'); } });
  const getterCode = new ValidationError();
  Object.defineProperty(getterCode, 'code', { get() { reads++; throw Error('SECRET code'); } });
  const unknownCode = new ValidationError(); unknownCode.code = 'SECRET';
  const hostile = new Proxy(dataCode, { getPrototypeOf() { throw Error('SECRET reflection'); } });
  for (const [foreign, expected] of [[revoked.proxy, 'INVALID_INPUT'], [dataCode, 'LIMIT_EXCEEDED'],
    [getterCode, 'INVALID_INPUT'], [unknownCode, 'INVALID_INPUT'], [hostile, 'INVALID_INPUT']]) {
    const input = new Proxy(new Uint8Array(1), { getPrototypeOf() { throw foreign; } });
    let previous;
    for (let attempt = 0; attempt < 2; attempt++) assert.throws(() => parse(input), error => {
      assert.ok(error instanceof ValidationError); assert.equal(error.code, expected);
      assert.equal(error.message, 'Invalid vault data.'); assert.notEqual(error, foreign); assert.notEqual(error, previous);
      previous = error; return true;
    });
  }
  assert.equal(reads, 0);
});
