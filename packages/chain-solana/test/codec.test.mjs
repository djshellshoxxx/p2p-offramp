import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base58Encode as oracleEncode,
  base58Decode as oracleDecode,
} from '../../../contracts/solana/vectors/derive.mjs';
import { decodeBase64, decodeKey, encodeBase58, decimalU64 } from '../src/codec.ts';
import { sha } from './support.mjs';

const rejects = (fn, code = 'INTEGRITY_FAILURE') =>
  assert.throws(fn, error => error.code === code && !/SECRET/.test(error.message));

test('base58-roundtrip-vs-derive', () => {
  const samples = [
    new Uint8Array(32),
    new Uint8Array(32).fill(255),
    Uint8Array.from({ length: 32 }, (_, i) => (i < 5 ? 0 : i)),
  ];
  for (let i = 0; i < 300; i++) samples.push(sha(Uint8Array.of(i, i >> 8)));
  for (const bytes of samples) {
    const text = encodeBase58(bytes);
    assert.equal(text, oracleEncode(bytes));
    assert.deepEqual(decodeKey(text), bytes);
    assert.deepEqual(oracleDecode(text, 32), bytes);
  }
});

test('base58-rejects-{0OIl,extra-1,31B,33B,45-chars}', () => {
  const valid = encodeBase58(sha(Uint8Array.of(1)));
  for (const bad of [
    '0OIl' + valid.slice(4),
    `1${valid}`,
    encodeBase58(new Uint8Array(31).fill(1)),
    encodeBase58(new Uint8Array(33).fill(1)),
    '2'.repeat(45),
    '',
    42,
    null,
  ])
    rejects(() => decodeKey(bad));
  rejects(() => decodeKey('0OIl'));
  rejects(() => decodeKey(`1${valid}`, 'INVALID_INPUT'), 'INVALID_INPUT');
});

test('base64-decodes-like-standard', () => {
  for (let n = 0; n < 40; n++) {
    const bytes = sha(Uint8Array.of(n)).subarray(0, n % 33);
    assert.deepEqual(decodeBase64(Buffer.from(bytes).toString('base64'), 64), new Uint8Array(bytes));
  }
});

test('base64-rejects-{no-pad,inner-pad,whitespace,urlsafe,pad-bits,over-cap}', () => {
  const cases = {
    'no-pad': 'AAE',
    'inner-pad': 'AA==AAAA',
    whitespace: 'AAAA AAA',
    urlsafe: '-_8=',
    'pad-bits': 'AB==',
    'pad-bits-one': 'AAB=',
    'triple-pad': 'A===',
    'non-string': 7,
  };
  for (const value of Object.values(cases)) rejects(() => decodeBase64(value, 64));
  rejects(() => decodeBase64('AAAAAAAA', 7));
  assert.equal(decodeBase64('AAAAAAAA', 8).length, 6);
});

test('decimal-u64-canonical', () => {
  assert.equal(decimalU64('18446744073709551615'), (1n << 64n) - 1n);
  for (const bad of ['18446744073709551616', '01', '-1', '1e3', '1.0', ' 1', '', '123456789012345678901', 1]) {
    rejects(() => decimalU64(bad), 'INVALID_INPUT');
  }
});
