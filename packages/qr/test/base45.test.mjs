import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BASE45_ALPHABET, encodeBase45, decodeBase45, maxBase45Length } from '../index.ts';

const utf8 = text => new TextEncoder().encode(text);
const ascii = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

test('RFC 9285 section 4 examples encode and decode exactly', () => {
  assert.equal(encodeBase45(utf8('AB')), 'BB8');
  assert.equal(encodeBase45(utf8('Hello!!')), '%69 VD92EX0');
  assert.equal(encodeBase45(utf8('base-45')), 'UJCLQE7W581');
  const ietf = decodeBase45('QED8WEX0');
  assert.equal(ietf.ok, true);
  assert.equal(ascii(ietf.bytes), 'ietf!');
  for (const word of ['AB', 'Hello!!', 'base-45']) assert.equal(ascii(decodeBase45(encodeBase45(utf8(word))).bytes), word);
});

test('the alphabet is exactly the 45-character QR alphanumeric set', () => {
  assert.equal(BASE45_ALPHABET.length, 45);
  assert.equal(new Set(BASE45_ALPHABET).size, 45);
  assert.match(BASE45_ALPHABET, /^[0-9A-Z $%*+\-./:]{45}$/);
});

test('every two-character string decodes iff its value fits one byte, and re-encodes to itself', () => {
  let valid = 0;
  for (const c of BASE45_ALPHABET) for (const d of BASE45_ALPHABET) {
    const value = BASE45_ALPHABET.indexOf(c) + BASE45_ALPHABET.indexOf(d) * 45, result = decodeBase45(c + d);
    assert.equal(result.ok, value <= 0xff, c + d);
    if (result.ok) { valid++; assert.equal(result.bytes[0], value); assert.equal(encodeBase45(result.bytes), c + d); }
  }
  assert.equal(valid, 256);
});

test('every three-character string decodes iff its value fits two bytes, and re-encodes to itself (bijection)', () => {
  let valid = 0;
  for (const c of BASE45_ALPHABET) for (const d of BASE45_ALPHABET) for (const e of BASE45_ALPHABET) {
    const value = BASE45_ALPHABET.indexOf(c) + BASE45_ALPHABET.indexOf(d) * 45 + BASE45_ALPHABET.indexOf(e) * 2025;
    const result = decodeBase45(c + d + e);
    assert.equal(result.ok, value <= 0xffff);
    if (result.ok) { valid++; if (encodeBase45(result.bytes) !== c + d + e) assert.fail(c + d + e); }
  }
  assert.equal(valid, 65_536);
});

test('random-length byte strings round-trip and the length formula holds', () => {
  for (let length = 0; length <= 300; length++) {
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 32) bytes.set(createHash('sha256').update(`b45-${length}-${offset}`).digest().subarray(0, Math.min(32, length - offset)), offset);
    const text = encodeBase45(bytes);
    assert.equal(text.length, maxBase45Length(length));
    assert.deepEqual(decodeBase45(text).bytes, bytes);
  }
});

test('strict decode refuses alphabet violations, length 1 mod 3 and group overflow', () => {
  const overflowTriple = 0x10000, overflowPair = 0x100, A = BASE45_ALPHABET;
  const triple = n => A[n % 45] + A[Math.floor(n / 45) % 45] + A[Math.floor(n / 2025)];
  const pair = n => A[n % 45] + A[Math.floor(n / 45)];
  assert.deepEqual(decodeBase45(triple(0xffff)).bytes, Uint8Array.of(0xff, 0xff));
  assert.deepEqual(decodeBase45(pair(0xff)).bytes, Uint8Array.of(0xff));
  for (const text of ['A', 'BB8A', 'bb8', 'BB#', 'BBÉ', 'BB\u{1F600}', triple(overflowTriple), ':::', pair(overflowPair), '::', `BB8${pair(overflowPair)}`, '\0\0\0']) {
    const result = decodeBase45(text);
    assert.equal(result.ok, false, JSON.stringify(text));
    assert.equal(result.code, 'INVALID_ENCODING');
    assert.equal(Object.isFrozen(result), true);
  }
  assert.equal(decodeBase45(42).code, 'INVALID_INPUT');
  assert.throws(() => encodeBase45('AB'), TypeError);
});

test('maxBytes is enforced from the text length before decoding', () => {
  const text = encodeBase45(new Uint8Array(2049));
  assert.equal(decodeBase45(text, 2048).code, 'TOO_LARGE');
  assert.equal(decodeBase45(`${'#'.repeat(3)}${text}`, 2048).code, 'TOO_LARGE');
  assert.equal(decodeBase45(encodeBase45(new Uint8Array(2048)), 2048).bytes.length, 2048);
  assert.equal(maxBase45Length(2048), 3072);
  assert.equal(maxBase45Length(3), 5);
});
