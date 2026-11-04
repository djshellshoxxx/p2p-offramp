import { createCoreError, createOperationId } from '../../domain/index.ts';
import type { CoreErrorCode, CoreResult } from '../../schemas/index.ts';
export interface DiagnosticOnly { readonly diagnosticOnly: true; readonly economicAuthority: false; }
const errors = new WeakMap<object, CoreErrorCode>();
export function stop(code: CoreErrorCode = 'INVALID_INPUT'): never {
  const error = new Error('Local liquidity reference unavailable.'); errors.set(error, code); throw error;
}
export function failure<T = never>(code: CoreErrorCode): CoreResult<T> {
  return Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: false }) });
}
export function codeOf(error: unknown): CoreErrorCode {
  return typeof error === 'object' && error !== null ? errors.get(error) ?? 'UNAVAILABLE' : 'UNAVAILABLE';
}
export const success = <T>(value: T): CoreResult<T> => Object.freeze({ ok: true, value });
export function result<T>(work: () => T): CoreResult<T> {
  try { return success(work()); } catch (error) { return failure(codeOf(error)); }
}
export const diagnostic = <T extends object>(value: T): Readonly<T & DiagnosticOnly> => Object.freeze({ ...value, diagnosticOnly: true, economicAuthority: false });
export function data(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return stop();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return stop();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) return stop();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return stop();
    out[key] = descriptor.value;
  }
  return out;
}
export const MAX_U256 = (1n << 256n) - 1n, MAX_U64 = (1n << 64n) - 1n;
export function decimal(input: unknown, max = MAX_U256, positive = false): bigint {
  if (typeof input !== 'string') return stop();
  if (input.length > (max === MAX_U64 ? 20 : 78)) return stop('LIMIT_EXCEEDED');
  if (!/^(0|[1-9][0-9]*)$/.test(input)) return stop();
  const amount = BigInt(input);
  if (amount > max || positive && amount === 0n) return stop();
  return amount;
}
export function add(a: bigint, b: bigint): bigint {
  const next = a + b; if (next < 0n || next > MAX_U256) return stop('LIMIT_EXCEEDED'); return next;
}
export function subtract(a: bigint, b: bigint): bigint {
  if (b < 0n || a < b) return stop('CONFLICT'); return a - b;
}
export function id(input: unknown): string {
  if (typeof input !== 'string') return stop();
  if (input.length > 128) return stop('LIMIT_EXCEEDED');
  if (!/^[A-Za-z0-9._:~-]{1,128}$/.test(input)) return stop(); return input;
}
export function account(input: unknown): string {
  if (typeof input !== 'string' || !/^0x[0-9a-f]{40}$/.test(input) || /^0x0{40}$/.test(input)) return stop(); return input;
}
export function hash(input: unknown): string {
  if (typeof input !== 'string' || !/^0x[0-9a-f]{64}$/.test(input)) return stop(); return input;
}
