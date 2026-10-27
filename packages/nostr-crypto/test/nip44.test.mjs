import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCipheriv, createHash, createHmac } from 'node:crypto';
import { schnorr } from '@noble/curves/secp256k1.js';
import * as nip44 from '../src/nip44.ts';
import { chacha20 } from '../src/chacha20.ts';
import { decodeBase64, encodeBase64, equalBytes } from '../src/bytes.ts';

const fixture = readFileSync(new URL('./fixtures/nip44.vectors.json', import.meta.url));
const vectors = JSON.parse(fixture.toString('utf8')).v2;
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = data => Buffer.from(data).toString('hex');
const sha = data => createHash('sha256').update(data).digest('hex');
const code = expected => error => { assert.equal(error?.name, 'NostrCryptoError'); assert.equal(error.code, expected); assert.equal(error.message, 'Nostr cryptographic operation failed.'); return true; };
const ran = { valid: 0, invalid: 0 };

test('official NIP-44 vector file is byte-identical to the checksum published in NIP-44', () => {
  assert.equal(sha(fixture), '269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040');
  assert.deepEqual(Object.keys(vectors.valid), ['get_conversation_key', 'get_message_keys', 'calc_padded_len', 'encrypt_decrypt', 'encrypt_decrypt_long_msg']);
  assert.deepEqual(Object.keys(vectors.invalid), ['encrypt_msg_lengths', 'get_conversation_key', 'decrypt']);
});

test('valid.get_conversation_key: every vector', () => {
  for (const v of vectors.valid.get_conversation_key) { assert.equal(hex(nip44.getConversationKey(bytes(v.sec1), v.pub2)), v.conversation_key, v.note ?? v.sec1); ran.valid++; }
  assert.equal(vectors.valid.get_conversation_key.length, 35);
});

test('valid.get_message_keys: every vector', () => {
  const ck = bytes(vectors.valid.get_message_keys.conversation_key);
  for (const v of vectors.valid.get_message_keys.keys) {
    const keys = nip44.getMessageKeys(ck, bytes(v.nonce));
    assert.equal(hex(keys.chachaKey), v.chacha_key); assert.equal(hex(keys.chachaNonce), v.chacha_nonce); assert.equal(hex(keys.hmacKey), v.hmac_key); ran.valid++;
  }
  assert.equal(vectors.valid.get_message_keys.keys.length, 32);
});

test('valid.calc_padded_len: every vector', () => {
  for (const [length, padded] of vectors.valid.calc_padded_len) { assert.equal(nip44.calcPaddedLength(length), padded, String(length)); ran.valid++; }
  assert.equal(vectors.valid.calc_padded_len.length, 24);
});

test('valid.encrypt_decrypt: full two-party conversation for every vector', () => {
  for (const v of vectors.valid.encrypt_decrypt) {
    const sec1 = bytes(v.sec1), sec2 = bytes(v.sec2);
    const pub1 = hex(schnorr.getPublicKey(sec1)), pub2 = hex(schnorr.getPublicKey(sec2));
    const ck1 = nip44.getConversationKey(sec1, pub2);
    assert.equal(hex(ck1), v.conversation_key);
    assert.equal(nip44.encrypt(v.plaintext, ck1, bytes(v.nonce)), v.payload);
    const ck2 = nip44.getConversationKey(sec2, pub1);
    assert.equal(hex(ck2), v.conversation_key);
    assert.equal(nip44.decrypt(v.payload, ck2), v.plaintext);
    ran.valid++;
  }
  assert.equal(vectors.valid.encrypt_decrypt.length, 10);
});

test('valid.encrypt_decrypt_long_msg: every vector by checksum', () => {
  for (const v of vectors.valid.encrypt_decrypt_long_msg) {
    const plaintext = v.pattern.repeat(v.repeat);
    assert.equal(sha(plaintext), v.plaintext_sha256);
    const payload = nip44.encrypt(plaintext, bytes(v.conversation_key), bytes(v.nonce));
    assert.equal(sha(payload), v.payload_sha256);
    assert.equal(nip44.decrypt(payload, bytes(v.conversation_key)), plaintext);
    ran.valid++;
  }
  assert.equal(vectors.valid.encrypt_decrypt_long_msg.length, 3);
});

test('invalid.encrypt_msg_lengths: every length is rejected before encryption', () => {
  const ck = new Uint8Array(32).fill(1);
  for (const length of vectors.invalid.encrypt_msg_lengths) { assert.throws(() => nip44.encrypt('a'.repeat(length), ck), code('LIMIT_EXCEEDED'), String(length)); ran.invalid++; }
  assert.equal(vectors.invalid.encrypt_msg_lengths.length, 4);
});

test('invalid.get_conversation_key: every vector is rejected', () => {
  for (const v of vectors.invalid.get_conversation_key) { assert.throws(() => nip44.getConversationKey(bytes(v.sec1), v.pub2), code('INVALID_INPUT'), v.note); ran.invalid++; }
  assert.equal(vectors.invalid.get_conversation_key.length, 8);
});

test('invalid.decrypt: every vector is rejected with a fixed class', () => {
  const expected = { 'unknown encryption version': 'UNSUPPORTED_VERSION', 'unknown encryption version 0': 'UNSUPPORTED_VERSION', 'invalid payload length: 0': 'UNSUPPORTED_VERSION' };
  for (const v of vectors.invalid.decrypt) {
    assert.throws(() => nip44.decrypt(v.payload, bytes(v.conversation_key)), code(expected[v.note] ?? 'INTEGRITY_FAILURE'), v.note); ran.invalid++;
  }
  assert.equal(vectors.invalid.decrypt.length, 12);
});

test('every official vector ran: 104 valid and 24 invalid', () => {
  assert.deepEqual(ran, { valid: 104, invalid: 24 });
});

test('NIP-44 text extended-length row for 65535 bytes (the last length this profile supports)', () => {
  const ck = bytes('c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d');
  const nonce = bytes('0000000000000000000000000000000000000000000000000000000000000001');
  const plaintext = 'a'.repeat(65535);
  assert.equal(sha(plaintext), '6e1bebca6a8229364a162a72ef064826c4cd7457bf54f190ef782bd9deff3e42');
  const payload = nip44.encrypt(plaintext, ck, nonce);
  assert.equal(sha(payload), '6d8c2810d1e870fbaa1f0a0937126cca837a15f9260e27060c331d70a3c0bc84');
  assert.equal(payload.length, nip44.NIP44_MAX_PAYLOAD_CHARS);
  assert.throws(() => nip44.encrypt('a'.repeat(65536), ck, nonce), code('LIMIT_EXCEEDED'));
});

test('ChaCha20 matches RFC 8439 2.4.2 and the independent OpenSSL implementation', () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i), nonce = bytes('000000000000004a00000000');
  const plaintext = Buffer.from("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  assert.equal(hex(chacha20(key, nonce, plaintext, 1)), '6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0bf91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d807ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab77937365af90bbf74a35be6b40b8eedf2785e42874d');
  for (const length of [0, 1, 63, 64, 65, 1000, 65538]) {
    const data = Uint8Array.from({ length }, (_, i) => (i * 7) & 255), k = Uint8Array.from({ length: 32 }, (_, i) => 255 - i), n = bytes('0102030405060708090a0b0c');
    const iv = Buffer.concat([Buffer.alloc(4), Buffer.from(n)]);
    const reference = createCipheriv('chacha20', k, iv).update(data);
    assert.equal(hex(chacha20(k, n, data)), hex(reference), String(length));
  }
  assert.throws(() => chacha20(new Uint8Array(31), new Uint8Array(12), new Uint8Array(1)), code('INVALID_INPUT'));
  assert.throws(() => chacha20(new Uint8Array(32), new Uint8Array(12), new Uint8Array(65), 0xffffffff), code('LIMIT_EXCEEDED'));
});

/** Independent decryptor: node:crypto HMAC/HKDF/ChaCha20 only (no project code), to cross-check random round trips. */
function referenceDecrypt(payload, ck) {
  const data = Buffer.from(payload, 'base64'), nonce = data.subarray(1, 33), ct = data.subarray(33, data.length - 32), mac = data.subarray(data.length - 32);
  let t = Buffer.alloc(0), okm = Buffer.alloc(0);
  for (let i = 1; okm.length < 76; i++) { t = createHmac('sha256', ck).update(Buffer.concat([t, nonce, Buffer.of(i)])).digest(); okm = Buffer.concat([okm, t]); }
  assert.equal(createHmac('sha256', okm.subarray(44, 76)).update(Buffer.concat([nonce, ct])).digest('hex'), mac.toString('hex'));
  const padded = createCipheriv('chacha20', okm.subarray(0, 32), Buffer.concat([Buffer.alloc(4), okm.subarray(32, 44)])).update(ct);
  return padded.subarray(2, 2 + padded.readUInt16BE(0)).toString('utf8');
}
test('random round trips agree with the independent node:crypto decryptor and use fresh nonces', () => {
  const a = schnorr.utils.randomSecretKey(), b = schnorr.utils.randomSecretKey();
  const ck = nip44.getConversationKey(a, hex(schnorr.getPublicKey(b)));
  assert.equal(hex(createHmac('sha256', 'nip44-v2').update(Buffer.from(ck)).digest()).length, 64);
  const seen = new Set();
  for (const text of ['x', 'héllo 🤝', 'a'.repeat(32), 'b'.repeat(33), 'c'.repeat(4000), '\u0000\n"\\']) {
    const payload = nip44.encrypt(text, ck);
    assert.equal(referenceDecrypt(payload, ck), text); assert.equal(nip44.decrypt(payload, ck), text);
    const nonce = hex(decodeBase64(payload).subarray(1, 33)); assert.ok(!seen.has(nonce)); seen.add(nonce);
  }
});

function forge(ck, padded, nonce = new Uint8Array(32).fill(7)) {
  const keys = nip44.getMessageKeys(ck, nonce), ct = chacha20(keys.chachaKey, keys.chachaNonce, padded);
  const mac = createHmac('sha256', keys.hmacKey).update(Buffer.concat([nonce, ct])).digest();
  return encodeBase64(Uint8Array.from(Buffer.concat([Buffer.of(2), nonce, ct, mac])));
}
test('authenticated but malformed padding, extended prefix, invalid UTF-8 and non-canonical base64 are all rejected', () => {
  const ck = new Uint8Array(32).fill(9);
  const good = new Uint8Array(34); good[1] = 1; good[2] = 0x61;
  assert.equal(nip44.decrypt(forge(ck, good), ck), 'a');
  const nonzero = good.slice(); nonzero[33] = 1;
  const extended = new Uint8Array(6 + 65536); extended[3] = 1; extended[4] = 0; extended[5] = 0;
  const badUtf8 = good.slice(); badUtf8[2] = 0xff;
  const wrongBucket = new Uint8Array(66); wrongBucket[1] = 1;
  const surrogate = new Uint8Array(34); surrogate[1] = 3; surrogate.set([0xed, 0xa0, 0x80], 2);
  for (const padded of [nonzero, extended.subarray(0, 34), badUtf8, wrongBucket, surrogate]) assert.throws(() => nip44.decrypt(forge(ck, padded), ck), code('INTEGRITY_FAILURE'));
  const payload = forge(ck, good);
  const flipped = payload.slice(0, -2) + (payload.at(-2) === 'A' ? 'B' : 'A') + '=';
  assert.throws(() => nip44.decrypt(flipped, ck), code('INTEGRITY_FAILURE'));
  for (const bad of [` ${payload.slice(1)}`, `${payload.slice(0, 10)}-${payload.slice(11)}`, `${payload}\n`, 'A'.repeat(nip44.NIP44_MAX_PAYLOAD_CHARS + 4)]) assert.throws(() => nip44.decrypt(bad, ck), code('INTEGRITY_FAILURE'));
  assert.throws(() => decodeBase64('QR=='), code('INVALID_INPUT'));
  assert.equal(Buffer.from(decodeBase64('QQ==')).toString(), 'A');
  assert.throws(() => nip44.decrypt(payload, ck, { maxPayloadChars: 100 }), code('INTEGRITY_FAILURE'));
});

test('key and input validation: wrong lengths, lone surrogates, x >= p and non-lowercase keys', () => {
  const sk = bytes('0000000000000000000000000000000000000000000000000000000000000001');
  assert.throws(() => nip44.getConversationKey(sk, 'fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc30'), code('INVALID_INPUT'));
  assert.throws(() => nip44.getConversationKey(sk, '79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798'), code('INVALID_INPUT'));
  assert.throws(() => nip44.getConversationKey(new Uint8Array(33), '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'), code('INVALID_INPUT'));
  assert.throws(() => nip44.getMessageKeys(new Uint8Array(31), new Uint8Array(32)), code('INVALID_INPUT'));
  assert.throws(() => nip44.getMessageKeys(new Uint8Array(32), new Uint8Array(31)), code('INVALID_INPUT'));
  assert.throws(() => nip44.encrypt('\uD800', new Uint8Array(32)), code('INVALID_INPUT'));
  assert.throws(() => nip44.decrypt('Ag'.padEnd(132, 'A'), new Uint8Array(31)), code('INVALID_INPUT'));
});

test('crypto inventory pins the project-owned ChaCha20 source and the NIP-44 fixture hash (review pending)', () => {
  const inventory = JSON.parse(readFileSync(new URL('../../../security/crypto-inventory.json', import.meta.url), 'utf8'));
  const entry = id => inventory.find(item => item.id === id);
  const chacha = entry('project-chacha20-rfc8439');
  assert.equal(chacha.integrity, `sha256:${sha(readFileSync(new URL('../src/chacha20.ts', import.meta.url)))}`, 'chacha20.ts changed: update the inventory pin and re-request review');
  for (const id of ['project-chacha20-rfc8439', 'noble-curves-2.4.0-nostr', 'noble-hashes-2.4.0-nostr']) {
    assert.equal(entry(id).review.status, 'pending');
    assert.ok(entry(id).vectors.some(vector => vector.path === 'packages/nostr-crypto/test/fixtures/nip44.vectors.json' && vector.sha256 === sha(fixture)));
  }
});

test('MAC comparison is a full-length constant-time loop', () => {
  const a = new Uint8Array(32), b = new Uint8Array(32);
  assert.equal(equalBytes(a, b), true); b[31] = 1; assert.equal(equalBytes(a, b), false); b[31] = 0; b[0] = 0x80; assert.equal(equalBytes(a, b), false);
  assert.equal(equalBytes(a, new Uint8Array(31)), false);
});
