import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, canonicalBytes, parseStrictJson, parseCanonicalJsonBytes, JcsError, encodeUtf8, decodeUtf8, isWellFormedString } from '../index.ts';

const code = (run, expected) => assert.throws(run, error => error instanceof JcsError && error.code === expected, expected);

test('RFC 8785 section 3.2.3 sorts member names by UTF-16 code units, not code points', () => {
  const input = '{"\\u20ac":"Euro Sign","\\r":"Carriage Return","\\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","\\ud83d\\ude00":"Emoji: Grinning Face","\\u0080":"Control","\\u00f6":"Latin Small Letter O With Diaeresis"}';
  // Read the order from the canonical text: JS objects would enumerate the integer-like key "1" first.
  const keys = [...canonicalize(parseStrictJson(input)).matchAll(/(?:^\{|,)("(?:[^"\\]|\\.)*"):/g)].map(match => JSON.parse(match[1]));
  assert.deepEqual(keys, ['\r', '1', '\u0080', 'ö', '€', '\u{1F600}', 'דּ']);
});

test('RFC 8785 section 3.2.2.2 string escaping', () => {
  const value = parseStrictJson('{"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/"}');
  assert.equal(canonicalize(value), '{"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}');
});

test('string serialization equals ECMAScript JSON.stringify for every BMP non-surrogate unit and astral pairs', () => {
  const units = [];
  for (let unit = 0; unit < 0x10000; unit++) if (unit < 0xd800 || unit > 0xdfff) units.push(String.fromCharCode(unit));
  const all = units.join('') + '\u{1F600}\u{10FFFF}\u{10000}';
  assert.equal(canonicalize(all), JSON.stringify(all));
  for (const sample of ['', '"', '\\', '  ', '\u007f', '</script>']) assert.equal(canonicalize(sample), JSON.stringify(sample));
});

test('objects equal a sorted-key JSON.stringify reference and parse back to the same canonical text', () => {
  const sortDeep = value => Array.isArray(value) ? value.map(sortDeep) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])])) : value;
  for (let round = 0; round < 50; round++) {
    const seed = createHash('sha256').update(`jcs-${round}`).digest();
    const value = { z: seed[0], a: [seed[1], -seed[2], true, null, { [`k${seed[3]}`]: 'vé\n' }], m: { '\u{1F600}': 1, 'דּ': 2, ['x'.repeat(seed[4] % 5)]: false } };
    const text = canonicalize(value);
    assert.equal(text, JSON.stringify(sortDeep(value)));
    assert.equal(canonicalize(parseStrictJson(text)), text);
    assert.deepEqual(canonicalBytes(value), new TextEncoder().encode(text));
  }
  assert.equal(canonicalize([Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0]), '[9007199254740991,-9007199254740991,0]');
  assert.equal(canonicalize(Object.assign(Object.create(null), { b: 1, a: 2 })), '{"a":2,"b":1}');
});

test('canonicalize refuses values outside the envelope domain', () => {
  for (const value of [1.5, NaN, Infinity, -Infinity, 2 ** 53, -(2 ** 53), 1e21]) code(() => canonicalize(value), 'UNSUPPORTED_NUMBER');
  code(() => canonicalize(-0), 'UNSUPPORTED_NUMBER');
  for (const value of [undefined, 1n, () => 1, Symbol('x'), new Date(0), new Map(), new Uint8Array(1), new (class Thing {})(), /x/])
    code(() => canonicalize({ value }), 'UNSUPPORTED_VALUE');
  code(() => canonicalize({ [Symbol('k')]: 1 }), 'UNSUPPORTED_VALUE');
  code(() => canonicalize([1, , 3]), 'UNSUPPORTED_VALUE');
  code(() => canonicalize(Object.assign([1], { extra: 2 })), 'UNSUPPORTED_VALUE');
  code(() => canonicalize(Object.defineProperty({}, 'hidden', { value: 1, enumerable: false })), 'UNSUPPORTED_VALUE');
  for (const text of ['\ud800', 'a\udc00', '\ude00\ud83d']) {
    code(() => canonicalize(text), 'INVALID_UNICODE');
    code(() => canonicalize({ [text]: 1 }), 'INVALID_UNICODE');
  }
  const cyclic = {}; cyclic.self = cyclic;
  code(() => canonicalize(cyclic), 'DEPTH_EXCEEDED');
  let invoked = false;
  code(() => canonicalize(Object.defineProperty({}, 'getter', { enumerable: true, get() { invoked = true; return 1; } })), 'UNSUPPORTED_VALUE');
  assert.equal(invoked, false, 'accessors are never invoked');
});

test('strict parser refuses duplicates, non-integers, lone surrogates, bad grammar and excess depth', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":1,"__proto__":2}']) code(() => parseStrictJson(text), 'DUPLICATE_KEY');
  for (const text of ['[1.5]', '[1.0]', '[1e3]', '[1E3]', '[9007199254740992]', '[-9007199254740992]', '[-0]']) code(() => parseStrictJson(text), 'UNSUPPORTED_NUMBER');
  for (const text of ['["\\ud800"]', '["\\udc00x"]', '["\\ude00\\ud83d"]', '{"\\udfff":1}', '["\ud800"]']) code(() => parseStrictJson(text), 'INVALID_UNICODE');
  for (const text of ['', '[NaN]', '[Infinity]', '[1,]', '{"a":1,}', '[01]', "['a']", '["a\tb"]', '{} {}', '{"a" 1}', '["\\x41"]', '["\\u12"]', '[tru]', '﻿{}', '[1 2]', '{1:2}', '"', '-'])
    code(() => parseStrictJson(text), 'INVALID_JSON');
  code(() => parseStrictJson(`${'['.repeat(9)}${']'.repeat(9)}`, 8), 'DEPTH_EXCEEDED');
  assert.deepEqual(parseStrictJson(`${'['.repeat(8)}${']'.repeat(8)}`, 8), [[[[[[[[]]]]]]]]);
});

test('parsed objects have a null prototype, so __proto__ is an ordinary member and nothing is polluted', () => {
  const value = parseStrictJson('{"__proto__":{"polluted":true},"constructor":1}');
  assert.equal(Object.getPrototypeOf(value), null);
  assert.deepEqual(Object.keys(value), ['__proto__', 'constructor']);
  assert.equal(({}).polluted, undefined);
  assert.equal(canonicalize(value), '{"__proto__":{"polluted":true},"constructor":1}');
});

test('canonical byte parsing checks the byte cap before UTF-8 and refuses every non-canonical spelling', () => {
  const options = { maxBytes: 64, maxDepth: 8 };
  code(() => parseCanonicalJsonBytes(new Uint8Array(65).fill(0xff), options), 'TOO_LARGE');
  code(() => parseCanonicalJsonBytes(Uint8Array.of(0x22, 0xc0, 0xaf, 0x22), options), 'INVALID_UNICODE');
  code(() => parseCanonicalJsonBytes(Uint8Array.of(0x22, 0xed, 0xa0, 0x80, 0x22), options), 'INVALID_UNICODE');
  assert.deepEqual(parseCanonicalJsonBytes(encodeUtf8('{"a":[1,"é"],"b":null}'), options), parseStrictJson('{"a":[1,"é"],"b":null}'));
  for (const text of ['{"b":1,"a":2}', '{ "a":1}', '{"a":1}\n', '["\\u00e9"]', '["\\/"]', '["\\u0041"]', '{"a":"\\u001F"}'])
    code(() => parseCanonicalJsonBytes(encodeUtf8(text), options), 'NON_CANONICAL');
});

test('strict UTF-8 matches a fatal TextDecoder on valid and invalid sequences', () => {
  const fatal = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const cases = [[0x41], [0xc2, 0x80], [0xdf, 0xbf], [0xe0, 0xa0, 0x80], [0xef, 0xbf, 0xbf], [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf],
    [0xc0, 0x80], [0xc1, 0xbf], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xed, 0xbf, 0xbf], [0xf0, 0x80, 0x80, 0x80], [0xf4, 0x90, 0x80, 0x80],
    [0xf5, 0x80, 0x80, 0x80], [0xff], [0x80], [0xe2, 0x82], [0xe2, 0x28, 0xa1], [0xef, 0xbb, 0xbf]];
  for (const bytes of cases) {
    const input = Uint8Array.from(bytes);
    let expected; try { expected = fatal.decode(input); } catch { expected = null; }
    let actual; try { actual = decodeUtf8(input); } catch { actual = null; }
    assert.equal(actual, expected, bytes.map(byte => byte.toString(16)).join(' '));
  }
  const sample = 'aé€\u{1F600}\u{10FFFF}';
  assert.deepEqual(encodeUtf8(sample), new TextEncoder().encode(sample));
  assert.throws(() => encodeUtf8('\ud800'));
  assert.equal(isWellFormedString('😀'), true);
  assert.equal(isWellFormedString('\ude00\ud83d'), false);
});
