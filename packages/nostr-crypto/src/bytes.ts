/** Strict byte, hex, base64 and UTF-8 helpers for the G20 Nostr profile. Errors never carry input content. */
export type NostrCryptoErrorCode = 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'UNSUPPORTED_PROVIDER' | 'UNAUTHORIZED' | 'LIMIT_EXCEEDED' | 'INTEGRITY_FAILURE';
const errorCodes = new WeakMap<object, NostrCryptoErrorCode>();
export class NostrCryptoError extends Error {
  readonly code: NostrCryptoErrorCode;
  constructor(code: NostrCryptoErrorCode = 'INVALID_INPUT') { super('Nostr cryptographic operation failed.'); this.name = 'NostrCryptoError'; this.code = code; errorCodes.set(this, code); }
}
/** Identity lookup only: a revoked proxy or hostile rejection is never reflected upon. */
export function nostrCryptoErrorCode(error: unknown): NostrCryptoErrorCode | undefined {
  return typeof error === 'object' && error !== null ? errorCodes.get(error) : undefined;
}
export function fail(code: NostrCryptoErrorCode = 'INVALID_INPUT'): never { throw new NostrCryptoError(code); }

/** Best-effort zeroization. JavaScript engines may keep copies (bigints, strings, GC moves); this is not physical erasure. */
export function wipe(...buffers: readonly (Uint8Array | undefined)[]): void { for (const buffer of buffers) buffer?.fill(0); }

export function isBytes(input: unknown, length?: number): input is Uint8Array {
  return input instanceof Uint8Array && (length === undefined || input.byteLength === length);
}
export function hexToBytes(input: unknown, length: number): Uint8Array {
  if (typeof input !== 'string' || input.length !== length * 2 || !/^[0-9a-f]*$/.test(input)) return fail();
  const out = new Uint8Array(length);
  for (let index = 0; index < length; index++) out[index] = Number.parseInt(input.slice(index * 2, index * 2 + 2), 16);
  return out;
}
export function bytesToHex(bytes: Uint8Array): string { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
export function isLowerHex(input: unknown, length: number): input is string { return typeof input === 'string' && input.length === length * 2 && /^[0-9a-f]*$/.test(input); }

/** Constant-time for equal lengths. Lengths are public (the MAC length is fixed at 32). */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < a.byteLength; index++) diff |= a[index]! ^ b[index]!;
  return diff === 0;
}
export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}
export function randomBytes(length: number): Uint8Array {
  try { return crypto.getRandomValues(new Uint8Array(length)); } catch { return fail('UNSUPPORTED_PROVIDER'); }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let index = 0; index < ALPHABET.length; index++) LOOKUP[ALPHABET.charCodeAt(index)] = index;
/** RFC 4648 base64 with padding. */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const a = bytes[index]!, b = bytes[index + 1], c = bytes[index + 2];
    const word = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(word >>> 18) & 63]! + ALPHABET[(word >>> 12) & 63]! + (b === undefined ? '=' : ALPHABET[(word >>> 6) & 63]!) + (c === undefined ? '=' : ALPHABET[word & 63]!);
  }
  return out;
}
/** Strict RFC 4648 base64 with padding: no whitespace, no URL alphabet, canonical trailing bits only. */
export function decodeBase64(input: string): Uint8Array {
  if (input.length % 4 !== 0) return fail();
  const padding = input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(input.length / 4 * 3 - padding);
  let offset = 0;
  for (let index = 0; index < input.length; index += 4) {
    const last = index + 4 === input.length;
    const values = [0, 1, 2, 3].map(position => {
      const code = input.charCodeAt(index + position);
      if (last && code === 61 && position >= 4 - padding) return 0;
      const value = code < 128 ? LOOKUP[code]! : -1;
      return value < 0 ? fail() : value;
    });
    const word = (values[0]! << 18) | (values[1]! << 12) | (values[2]! << 6) | values[3]!;
    if (last && padding === 2 && (word & 0xffff) !== 0) return fail();
    if (last && padding === 1 && (word & 0xff) !== 0) return fail();
    out[offset++] = word >>> 16;
    if (offset < out.length) out[offset++] = (word >>> 8) & 255;
    if (offset < out.length) out[offset++] = word & 255;
  }
  return out;
}

const encoder = new TextEncoder();
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** UTF-8 encode, rejecting lone surrogates instead of silently replacing them with U+FFFD. */
export function utf8Encode(input: string): Uint8Array { if (LONE_SURROGATE.test(input)) return fail(); return encoder.encode(input); }
export function utf8Decode(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return fail(); }
}
export function utf8Length(input: string): number { return utf8Encode(input).byteLength; }
