/** Strict Solana byte codecs. Every decoder is canonical-only and bounds its input before any allocation. */
import type { CoreErrorCode } from '../../schemas/index.ts';

/** Internal fixed-code failure. Its message never carries input or provider detail. */
export class SolanaFailure extends Error {
  readonly code: CoreErrorCode;
  constructor(code: CoreErrorCode) { super('Solana read failed.'); this.name = 'SolanaFailure'; this.code = code; }
}
export const fail = (code: CoreErrorCode = 'INTEGRITY_FAILURE'): never => { throw new SolanaFailure(code); };
/** Maps any thrown value to a fixed code; only our own failures keep their code. */
export function failureCode(error: unknown, fallback: CoreErrorCode): CoreErrorCode {
  try { return error instanceof SolanaFailure ? error.code : fallback; } catch { return fallback; }
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const U64_MAX = (1n << 64n) - 1n;

export function encodeBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = '';
  while (value > 0n) { out = BASE58[Number(value % 58n)]! + out; value /= 58n; }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return '1'.repeat(zeros) + out;
}

/** Canonical 32-byte base58 key: 32..44 alphabet characters that re-encode to the same string. */
export function decodeKey(input: unknown, code: CoreErrorCode = 'INTEGRITY_FAILURE'): Uint8Array {
  if (typeof input !== 'string' || input.length < 32 || input.length > 44) return fail(code);
  let value = 0n;
  for (const character of input) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return fail(code);
    value = value * 58n + BigInt(digit);
  }
  const leading = input.length - input.replace(/^1+/, '').length;
  const body: number[] = [];
  for (let rest = value; rest > 0n; rest >>= 8n) body.unshift(Number(rest & 0xffn));
  if (leading + body.length !== 32) return fail(code);
  const out = new Uint8Array(32);
  out.set(body, leading);
  // A leading '1' always maps to a zero byte, so length 32 plus re-encoding equality is canonical.
  if (encodeBase58(out) !== input) return fail(code);
  return out;
}
/** Returns the input when it is a canonical key; used to validate without keeping bytes. */
export function canonicalKey(input: unknown, code: CoreErrorCode = 'INTEGRITY_FAILURE'): string {
  decodeKey(input, code);
  return input as string;
}

/** Strict RFC 4648 standard base64 with mandatory padding and zero pad bits. `maxChars` is checked first. */
export function decodeBase64(input: unknown, maxChars: number): Uint8Array {
  if (typeof input !== 'string' || input.length > maxChars || input.length % 4 !== 0) return fail();
  if (!/^[A-Za-z0-9+/]*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) return fail();
  const padding = input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(input.length / 4 * 3 - padding);
  let bits = 0, buffer = 0, index = 0;
  for (const character of input) {
    if (character === '=') break;
    buffer = (buffer << 6) | BASE64.indexOf(character);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[index++] = (buffer >> bits) & 0xff; }
  }
  // Leftover bits after the last full byte must be zero, or two strings would decode to the same bytes.
  if ((buffer & ((1 << bits) - 1)) !== 0) return fail();
  return out;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Lowercase 64-hex digest to 32 bytes. */
export function fromHex32(input: unknown, code: CoreErrorCode = 'INVALID_INPUT'): Uint8Array {
  if (typeof input !== 'string' || !/^[0-9a-f]{64}$/.test(input)) return fail(code);
  return Uint8Array.from(input.match(/../g)!, pair => parseInt(pair, 16));
}

export function readUintLE(bytes: Uint8Array, offset: number, width: number): bigint {
  if (offset < 0 || offset + width > bytes.length) return fail();
  let value = 0n;
  for (let index = width - 1; index >= 0; index--) value = (value << 8n) | BigInt(bytes[offset + index]!);
  return value;
}
export const readU64 = (bytes: Uint8Array, offset: number): bigint => readUintLE(bytes, offset, 8);
export const readU32 = (bytes: Uint8Array, offset: number): number => Number(readUintLE(bytes, offset, 4));
/** Two's-complement i64. */
export function readI64(bytes: Uint8Array, offset: number): bigint {
  const raw = readU64(bytes, offset);
  return raw >= 1n << 63n ? raw - (1n << 64n) : raw;
}
export function u64LE(value: bigint): Uint8Array {
  if (value < 0n || value > U64_MAX) return fail('INVALID_INPUT');
  const out = new Uint8Array(8);
  for (let index = 0, rest = value; index < 8; index++, rest >>= 8n) out[index] = Number(rest & 0xffn);
  return out;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Canonical u64 decimal string: at most 20 digits, no sign or leading zero, below 2^64. */
export function decimalU64(input: unknown, code: CoreErrorCode = 'INVALID_INPUT'): bigint {
  if (typeof input !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/.test(input)) return fail(code);
  const value = BigInt(input);
  if (value > U64_MAX) return fail(code);
  return value;
}
