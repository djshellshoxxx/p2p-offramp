/**
 * Solana off-chain message version 1 (sRFC #3) in a restricted ASCII profile, plus a strict Ed25519 verifier.
 * Verify only: this module never signs, derives or holds a key. Layout and sources: docs/acceptance.md.
 *
 *   0  16  signing domain "\xffsolana offchain"   (0xff is refused as a transaction-message prefix)
 *   16  1  version = 1
 *   17  1  signer count n (1..MAX_OFFCHAIN_SIGNERS here)
 *   18 32n signers, strictly ascending bytewise (sorted and unique)
 *   ..     body to the end: non-empty ASCII 0x20..0x7e or LF (0x0a); no length prefix in version 1
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { concatBytes, equalBytes, fail } from './codec.ts';

/** Module-private: a typed array cannot be frozen, so callers never receive this instance. */
const SIGNING_DOMAIN = Uint8Array.of(
  0xff, 0x73, 0x6f, 0x6c, 0x61, 0x6e, 0x61, 0x20, 0x6f, 0x66, 0x66, 0x63, 0x68, 0x61, 0x69, 0x6e,
);
export const OFFCHAIN_VERSION = 1;
/** Hardware-wallet bound for the whole message (PACKET_DATA_SIZE, the Ledger app limit). */
export const MAX_OFFCHAIN_MESSAGE_BYTES = 1232;
/** This profile signs alone (acceptance) or with the counterparty (terms consent). */
export const MAX_OFFCHAIN_SIGNERS = 2;
const HEADER_BYTES = SIGNING_DOMAIN.length + 2;
const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;

export interface OffchainMessageV1 { readonly signers: readonly Uint8Array[]; readonly body: Uint8Array }

/** Byte length through the intrinsic getter, so a subclass or proxy cannot report a different size. */
export function bytesOf(input: unknown, minimum: number, maximum: number): Uint8Array {
  let length: number;
  try {
    if (!(input instanceof Uint8Array)) return fail('INVALID_INPUT');
    length = byteLength.call(input) as number;
  } catch { return fail('INVALID_INPUT'); }
  if (length > maximum) return fail('LIMIT_EXCEEDED');
  if (length < minimum) return fail('INVALID_INPUT');
  return new Uint8Array(input);
}
const profileByte = (byte: number): boolean => byte === 0x0a || (byte >= 0x20 && byte <= 0x7e);
function compare(a: Uint8Array, b: Uint8Array): number {
  for (let index = 0; index < 32; index++) if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  return 0;
}

/** Sorts the signers as the specification requires; duplicates, empty or non-profile bodies fail closed. */
export function encodeOffchainMessageV1(signers: readonly Uint8Array[], body: Uint8Array): Uint8Array {
  if (signers.length < 1 || signers.length > MAX_OFFCHAIN_SIGNERS || signers.some(key => key.length !== 32)) {
    return fail('INVALID_INPUT');
  }
  const sorted = [...signers].sort(compare);
  for (let index = 1; index < sorted.length; index++) {
    if (compare(sorted[index - 1]!, sorted[index]!) === 0) fail('INVALID_INPUT');
  }
  if (body.length === 0 || !body.every(profileByte)) return fail('INVALID_INPUT');
  const out = concatBytes([SIGNING_DOMAIN, Uint8Array.of(OFFCHAIN_VERSION, sorted.length), ...sorted, body]);
  if (out.length > MAX_OFFCHAIN_MESSAGE_BYTES) return fail('LIMIT_EXCEEDED');
  return out;
}

/** Strict decode: size first, exact domain, version 1 only, sorted unique signers, non-empty profile body. */
export function decodeOffchainMessageV1(input: unknown): OffchainMessageV1 {
  const bytes = bytesOf(input, HEADER_BYTES + 32 + 1, MAX_OFFCHAIN_MESSAGE_BYTES);
  if (!equalBytes(bytes.subarray(0, SIGNING_DOMAIN.length), SIGNING_DOMAIN)) fail('INVALID_INPUT');
  if (bytes[SIGNING_DOMAIN.length] !== OFFCHAIN_VERSION) fail('UNSUPPORTED_VERSION');
  const count = bytes[SIGNING_DOMAIN.length + 1]!;
  const bodyStart = HEADER_BYTES + 32 * count;
  if (count < 1 || count > MAX_OFFCHAIN_SIGNERS || bodyStart >= bytes.length) fail('INVALID_INPUT');
  const signers: Uint8Array[] = [];
  for (let index = 0; index < count; index++) {
    const key = bytes.slice(HEADER_BYTES + 32 * index, HEADER_BYTES + 32 * (index + 1));
    if (index > 0 && compare(signers[index - 1]!, key) >= 0) fail('INVALID_INPUT');
    signers.push(key);
  }
  const body = bytes.slice(bodyStart);
  if (!body.every(profileByte)) fail('INVALID_INPUT');
  return Object.freeze({ signers: Object.freeze(signers), body });
}

const Point = ed25519.Point;
const L = Point.Fn.ORDER;
function littleEndian(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index--) value = (value << 8n) | BigInt(bytes[index]!);
  return value;
}
type EdPoint = ReturnType<typeof Point.fromBytes>;
/** RFC 8032 strict decoding (y < p, no negative zero); null when invalid. */
function strictPoint(bytes: Uint8Array): EdPoint | null {
  try { return Point.fromBytes(bytes, false); } catch { return null; }
}

/**
 * Accepts exactly what an RFC 8032 signer produces, for one key and any number of signatures: canonical A in the
 * prime-order subgroup (checked once), and per signature S < L, canonical R not of small order, the cofactorless
 * equation [S]B = R + [k]A (which also puts R in the prime-order subgroup) and the library's cofactored check.
 * This is stricter than ZIP-215 and than dalek `verify_strict`, so a signature accepted here is accepted by every
 * common Ed25519 verifier. Malformed input returns false; nothing is thrown.
 */
export function verifyEd25519StrictAll(
  publicKey: Uint8Array, pairs: readonly (readonly [signature: Uint8Array, message: Uint8Array])[],
): boolean {
  try {
    if (publicKey.length !== 32 || pairs.length === 0) return false;
    const A = strictPoint(publicKey);
    if (!A || A.isSmallOrder() || !A.isTorsionFree()) return false;
    return pairs.every(([signature, message]) => {
      if (signature.length !== 64) return false;
      const s = littleEndian(signature.subarray(32)), R = strictPoint(signature.subarray(0, 32));
      if (s >= L || !R || R.isSmallOrder()) return false;
      const k = littleEndian(sha512(concatBytes([signature.subarray(0, 32), publicKey, message]))) % L;
      if (!Point.BASE.multiplyUnsafe(s).equals(R.add(A.multiplyUnsafe(k)))) return false;
      return ed25519.verify(signature, message, publicKey, { zip215: false });
    });
  } catch { return false; }
}
export const verifyEd25519Strict = (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean =>
  verifyEd25519StrictAll(publicKey, [[signature, message]]);
