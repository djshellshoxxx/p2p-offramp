/**
 * NIP-44 version 2 encrypted payloads (secp256k1 ECDH, HKDF-SHA256, padding, ChaCha20, HMAC-SHA256, base64).
 * Profile: the original v2 length range 1..65535 bytes. The later 6-byte extended-length prefix is not implemented:
 * those payloads are rejected as invalid padding. Every decryption failure after the version check (size, base64,
 * MAC, padding, UTF-8) is one INTEGRITY_FAILURE. An unknown version or a '#' prefix is UNSUPPORTED_VERSION.
 * There is no NIP-04 code path.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { expand, extract } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20 } from './chacha20.ts';
import { concatBytes, decodeBase64, encodeBase64, equalBytes, fail, hexToBytes, isBytes, NostrCryptoError, randomBytes, utf8Decode, utf8Encode, wipe } from './bytes.ts';

export const NIP44_VERSION = 2;
export const NIP44_MIN_PLAINTEXT_BYTES = 1;
export const NIP44_MAX_PLAINTEXT_BYTES = 65_535;
/** 1 version + 32 nonce + (2 + 65536) padded + 32 MAC. */
export const NIP44_MAX_PAYLOAD_BYTES = 65_603;
export const NIP44_MAX_PAYLOAD_CHARS = Math.ceil(NIP44_MAX_PAYLOAD_BYTES / 3) * 4;
const SALT = utf8Encode('nip44-v2');

export interface MessageKeys { readonly chachaKey: Uint8Array; readonly chachaNonce: Uint8Array; readonly hmacKey: Uint8Array; }

/** BIP340 x-only public key (64 lowercase hex) to the validated even-y SEC1 point. */
export function liftXOnlyPublicKey(publicKey: unknown): Uint8Array {
  const x = hexToBytes(publicKey, 32);
  const compressed = concatBytes(Uint8Array.of(2), x);
  try { secp256k1.Point.fromBytes(compressed).assertValidity(); } catch { return fail(); }
  return compressed;
}
export function isValidSecretKey(secretKey: unknown): secretKey is Uint8Array {
  try { return isBytes(secretKey, 32) && secp256k1.utils.isValidSecretKey(secretKey); } catch { return false; }
}
/** conversation_key = HKDF-extract(SHA-256, IKM = unhashed ECDH x, salt = "nip44-v2"). Symmetric in the two parties. */
export function getConversationKey(secretKey: Uint8Array, publicKey: string): Uint8Array {
  if (!isValidSecretKey(secretKey)) return fail();
  const point = liftXOnlyPublicKey(publicKey);
  let shared: Uint8Array | undefined;
  try {
    try { shared = secp256k1.getSharedSecret(secretKey, point, true); } catch { return fail(); }
    if (shared.byteLength !== 33) return fail();
    return extract(sha256, shared.subarray(1, 33), SALT);
  } finally { wipe(shared); }
}
export function getMessageKeys(conversationKey: Uint8Array, nonce: Uint8Array): MessageKeys {
  if (!isBytes(conversationKey, 32) || !isBytes(nonce, 32)) return fail();
  const keys = expand(sha256, conversationKey, nonce, 76);
  try { return { chachaKey: keys.slice(0, 32), chachaNonce: keys.slice(32, 44), hmacKey: keys.slice(44, 76) }; } finally { wipe(keys); }
}
function wipeKeys(keys: MessageKeys | undefined): void { if (keys) wipe(keys.chachaKey, keys.chachaNonce, keys.hmacKey); }

/** Padded length (excluding the 2-byte prefix) for 1 <= length <= 2^32 - 1, exactly as the NIP-44 pseudocode. */
export function calcPaddedLength(length: number): number {
  if (!Number.isSafeInteger(length) || length < 1 || length > 0xffff_ffff) return fail();
  if (length <= 32) return 32;
  const nextPower = 2 ** (32 - Math.clz32(length - 1));
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((length - 1) / chunk) + 1);
}
export function pad(plaintext: string): Uint8Array {
  if (typeof plaintext !== 'string') return fail();
  const unpadded = utf8Encode(plaintext);
  try {
    if (unpadded.byteLength < NIP44_MIN_PLAINTEXT_BYTES || unpadded.byteLength > NIP44_MAX_PLAINTEXT_BYTES) return fail('LIMIT_EXCEEDED');
    const out = new Uint8Array(2 + calcPaddedLength(unpadded.byteLength));
    out[0] = unpadded.byteLength >>> 8; out[1] = unpadded.byteLength & 255; out.set(unpadded, 2);
    return out;
  } finally { wipe(unpadded); }
}
export function unpad(padded: Uint8Array): string {
  const length = ((padded[0] ?? 0) << 8) | (padded[1] ?? 0);
  // length 0 is also the marker of the unsupported extended prefix.
  if (length === 0 || padded.byteLength !== 2 + calcPaddedLength(length)) return fail('INTEGRITY_FAILURE');
  for (let index = 2 + length; index < padded.byteLength; index++) if (padded[index] !== 0) return fail('INTEGRITY_FAILURE');
  return utf8Decode(padded.subarray(2, 2 + length));
}
function mac(hmacKey: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return hmac.create(sha256, hmacKey).update(nonce).update(ciphertext).digest();
}

/**
 * Encrypt with a fresh CSPRNG nonce. `nonce` exists only to replay the official vectors: production callers
 * MUST NOT pass it, because reusing a (conversation key, nonce) pair makes both messages decryptable.
 */
export function encrypt(plaintext: string, conversationKey: Uint8Array, nonce: Uint8Array = randomBytes(32)): string {
  if (!isBytes(conversationKey, 32) || !isBytes(nonce, 32)) return fail();
  let keys: MessageKeys | undefined, padded: Uint8Array | undefined, ciphertext: Uint8Array | undefined, tag: Uint8Array | undefined;
  try {
    keys = getMessageKeys(conversationKey, nonce);
    padded = pad(plaintext);
    ciphertext = chacha20(keys.chachaKey, keys.chachaNonce, padded);
    tag = mac(keys.hmacKey, nonce, ciphertext);
    return encodeBase64(concatBytes(Uint8Array.of(NIP44_VERSION), nonce, ciphertext, tag));
  } finally { wipeKeys(keys); wipe(padded, ciphertext, tag); }
}

export interface DecryptOptions { readonly maxPayloadChars?: number; }
/** Authenticate before decrypting; plaintext is returned only after MAC, padding and UTF-8 checks all pass. */
export function decrypt(payload: string, conversationKey: Uint8Array, options: DecryptOptions = {}): string {
  if (!isBytes(conversationKey, 32)) return fail();
  if (typeof payload !== 'string' || payload.length === 0 || payload[0] === '#') return fail('UNSUPPORTED_VERSION');
  const maxChars = Math.min(options.maxPayloadChars ?? NIP44_MAX_PAYLOAD_CHARS, NIP44_MAX_PAYLOAD_CHARS);
  if (payload.length < 132 || payload.length > maxChars) return fail('INTEGRITY_FAILURE');
  let data: Uint8Array | undefined, keys: MessageKeys | undefined, expected: Uint8Array | undefined, padded: Uint8Array | undefined;
  try {
    try { data = decodeBase64(payload); } catch { return fail('INTEGRITY_FAILURE'); }
    if (data.byteLength < 99 || data.byteLength > NIP44_MAX_PAYLOAD_BYTES) return fail('INTEGRITY_FAILURE');
    if (data[0] !== NIP44_VERSION) return fail('UNSUPPORTED_VERSION');
    const nonce = data.subarray(1, 33), ciphertext = data.subarray(33, data.byteLength - 32), tag = data.subarray(data.byteLength - 32);
    keys = getMessageKeys(conversationKey, nonce);
    expected = mac(keys.hmacKey, nonce, ciphertext);
    if (!equalBytes(expected, tag)) return fail('INTEGRITY_FAILURE');
    padded = chacha20(keys.chachaKey, keys.chachaNonce, ciphertext);
    try { return unpad(padded); } catch (error) { if (error instanceof NostrCryptoError) return fail('INTEGRITY_FAILURE'); throw error; }
  } finally { wipeKeys(keys); wipe(data, expected, padded); }
}
