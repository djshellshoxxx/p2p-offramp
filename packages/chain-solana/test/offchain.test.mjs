import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  decodeOffchainMessageV1, encodeOffchainMessageV1, MAX_OFFCHAIN_MESSAGE_BYTES, verifyEd25519Strict,
} from '../src/offchain.ts';
import { cat, enc, fromHex } from './support.mjs';

const DOMAIN = cat([0xff], enc.encode('solana offchain'));
const low = new Uint8Array(32).fill(1), high = new Uint8Array(32).fill(2);
const throwsCode = (work, code) => assert.throws(work, error => error.code === code);
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const le32 = value => Uint8Array.from({ length: 32 }, (_, index) => Number((value >> BigInt(8 * index)) & 0xffn));

test('encodes the sRFC #3 version 1 layout with signers sorted bytewise', () => {
  const body = enc.encode('hello\nworld');
  const bytes = encodeOffchainMessageV1([high, low], body);
  assert.deepEqual(bytes, cat(DOMAIN, [1, 2], low, high, body));
  assert.equal(bytes[0], 0xff, 'version 127 of a transaction message, which the runtime refuses');
  const decoded = decodeOffchainMessageV1(bytes);
  assert.deepEqual(decoded.signers, [low, high]);
  assert.deepEqual(decoded.body, body);
  assert.ok(Object.isFrozen(decoded) && Object.isFrozen(decoded.signers));
});

test('encoder refuses duplicate, missing or extra signers, empty or non-profile bodies and oversize', () => {
  const body = enc.encode('x');
  throwsCode(() => encodeOffchainMessageV1([low, low], body), 'INVALID_INPUT');
  throwsCode(() => encodeOffchainMessageV1([], body), 'INVALID_INPUT');
  throwsCode(() => encodeOffchainMessageV1([low, high, new Uint8Array(32).fill(3)], body), 'INVALID_INPUT');
  throwsCode(() => encodeOffchainMessageV1([new Uint8Array(31)], body), 'INVALID_INPUT');
  throwsCode(() => encodeOffchainMessageV1([low], new Uint8Array(0)), 'INVALID_INPUT');
  for (const byte of [0x00, 0x09, 0x0d, 0x7f, 0x80, 0xff]) {
    throwsCode(() => encodeOffchainMessageV1([low], Uint8Array.of(0x41, byte)), 'INVALID_INPUT');
  }
  const fits = MAX_OFFCHAIN_MESSAGE_BYTES - 50;
  assert.equal(encodeOffchainMessageV1([low], new Uint8Array(fits).fill(0x41)).length, MAX_OFFCHAIN_MESSAGE_BYTES);
  throwsCode(() => encodeOffchainMessageV1([low], new Uint8Array(fits + 1).fill(0x41)), 'LIMIT_EXCEEDED');
});

test('decoder bounds the size first and refuses foreign versions and layouts', () => {
  const good = encodeOffchainMessageV1([low], enc.encode('ok'));
  throwsCode(() => decodeOffchainMessageV1(new Uint8Array(MAX_OFFCHAIN_MESSAGE_BYTES + 1)), 'LIMIT_EXCEEDED');
  throwsCode(() => decodeOffchainMessageV1(good.subarray(0, 50)), 'INVALID_INPUT');
  for (const version of [0, 2, 0x7f, 0xff]) {
    const copy = new Uint8Array(good);
    copy[16] = version;
    throwsCode(() => decodeOffchainMessageV1(copy), 'UNSUPPORTED_VERSION');
  }
  const domain = new Uint8Array(good);
  domain[15] ^= 1;
  throwsCode(() => decodeOffchainMessageV1(domain), 'INVALID_INPUT');
  const count = new Uint8Array(good);
  count[17] = 2;
  throwsCode(() => decodeOffchainMessageV1(count), 'INVALID_INPUT');
});

test('decoder refuses non-bytes, proxies and subclasses that misreport their size', () => {
  const good = encodeOffchainMessageV1([low], enc.encode('ok'));
  for (const input of [null, 'text', [...good], { length: good.length }, new Proxy(good, {})]) {
    throwsCode(() => decodeOffchainMessageV1(input), 'INVALID_INPUT');
  }
  class Short extends Uint8Array { get length() { return 51; } }
  const big = new Short(MAX_OFFCHAIN_MESSAGE_BYTES + 1);
  throwsCode(() => decodeOffchainMessageV1(big), 'LIMIT_EXCEEDED');
});

test('strict Ed25519: RFC 8032 test 1 verifies; any change refuses; malformed input never throws', () => {
  const seed = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
  const publicKey = fromHex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  const signature = fromHex('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39'
    + '701cf9b46bd25bf5f0595bbe24655141438e7a100b');
  assert.deepEqual(ed25519.getPublicKey(seed), publicKey);
  assert.deepEqual(ed25519.sign(new Uint8Array(0), seed), signature);
  assert.equal(verifyEd25519Strict(signature, new Uint8Array(0), publicKey), true);
  assert.equal(verifyEd25519Strict(signature, Uint8Array.of(0), publicKey), false);
  for (const index of [0, 31, 32, 63]) {
    const copy = new Uint8Array(signature);
    copy[index] ^= 1;
    assert.equal(verifyEd25519Strict(copy, new Uint8Array(0), publicKey), false, String(index));
  }
  for (const [s, m, k] of [[signature.subarray(1), new Uint8Array(0), publicKey], [signature, null, publicKey],
    [signature, new Uint8Array(0), publicKey.subarray(1)], [null, null, null]]) {
    assert.equal(verifyEd25519Strict(s, m, k), false);
  }
});

test('strict Ed25519 refuses S + L, which encodes the same scalar', () => {
  const seed = new Uint8Array(32).fill(7), message = enc.encode('scalar');
  const signature = ed25519.sign(message, seed), publicKey = ed25519.getPublicKey(seed);
  let s = 0n;
  for (let index = 63; index >= 32; index--) s = (s << 8n) | BigInt(signature[index]);
  const high = cat(signature.subarray(0, 32), le32(s + L));
  assert.equal(verifyEd25519Strict(signature, message, publicKey), true);
  assert.equal(verifyEd25519Strict(high, message, publicKey), false);
});

test('small-order and non-canonical forgeries accepted under ZIP-215 are refused', () => {
  const identity = le32(1n), nonCanonicalIdentity = le32((1n << 255n) - 19n + 1n);
  const message = enc.encode('any message at all');
  for (const [R, A] of [[identity, identity], [nonCanonicalIdentity, nonCanonicalIdentity], [identity, le32(0n)]]) {
    const signature = cat(R, new Uint8Array(32));
    if (A[0] === 1 || A[0] === 0xee) assert.equal(ed25519.verify(signature, message, A, { zip215: true }), true);
    assert.equal(verifyEd25519Strict(signature, message, A), false);
  }
});
