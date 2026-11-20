/** Explicit offline comparison data. No parsed claim establishes a chain, key purpose or payment authority. */
export type StealthError = 'INVALID_INPUT' | 'UNSUPPORTED_PROFILE' | 'UNSUPPORTED_SCHEME' | 'PROFILE_MISMATCH' | 'CONTEXT_MISMATCH' |
  'INVALID_POINT' | 'INVALID_SCALAR' | 'HASH_SCALAR_EXCEPTION' | 'POINT_INFINITY' | 'SINGLE_KEY_UNSUPPORTED' | 'KEY_PURPOSE_CONFLICT' |
  'INVALID_HANDLE' | 'RNG_UNAVAILABLE' | 'ENTROPY_EXHAUSTED' | 'CAPACITY_EXCEEDED' | 'CONFLICT' | 'CANCELLED' | 'CLOCK_REVERSED' |
  'TIMEOUT' | 'INCOMPLETE_PAGE' | 'CURSOR_CONFLICT' | 'INTEGRITY_FAILURE' | 'COMMIT_UNKNOWN' | 'LOCKED';
export type StealthResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: StealthError }> }>;
export interface DiagnosticOnly { readonly diagnosticOnly: true; readonly economicAuthority: false; }
const failures = new WeakMap<object, StealthError>();
export function stop(code: StealthError = 'INVALID_INPUT'): never { const error = new Error('Offline stealth comparison unavailable.'); failures.set(error, code); throw error; }
export const codeOf = (error: unknown, fallback: StealthError = 'INVALID_INPUT'): StealthError => typeof error === 'object' && error !== null ? failures.get(error) ?? fallback : fallback;
export const failure = <T = never>(code: StealthError): StealthResult<T> => Object.freeze({ ok: false, error: Object.freeze({ code }) });
export const success = <T>(value: T): StealthResult<T> => Object.freeze({ ok: true, value });
export function result<T>(work: () => T): StealthResult<T> { try { return success(work()); } catch (error) { return failure(codeOf(error)); } }
export const diagnostic = <T extends object>(value: T): Readonly<T & DiagnosticOnly> => Object.freeze({ ...value, diagnosticOnly: true, economicAuthority: false });
export function data(input: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return stop();
  const keys = Reflect.ownKeys(input); if (keys.length !== required.length || keys.some(k => typeof k !== 'string' || !required.includes(k))) return stop();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of required) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !d.enumerable || !('value' in d)) return stop(); out[key] = d.value; }
  return out;
}
export function array(input: unknown, maximum: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return stop();
  const size = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (!Number.isSafeInteger(size) || size < 0) return stop(); if (size > maximum) return stop('CAPACITY_EXCEEDED');
  if (Reflect.ownKeys(input).length !== size + 1) return stop();
  return Array.from({ length: size }, (_, i) => { const d = Object.getOwnPropertyDescriptor(input, String(i)); if (!d || !d.enumerable || !('value' in d)) return stop(); return d.value as unknown; });
}
export function bareHex(input: unknown, minimumBytes: number, maximumBytes = minimumBytes): string {
  if (typeof input !== 'string' || input.length < minimumBytes * 2 || input.length > maximumBytes * 2 || input.length % 2 !== 0 || !/^[0-9a-f]*$/.test(input)) return stop();
  return input;
}
export const hexOf = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export const bytesOf = (hex: string): Uint8Array<ArrayBuffer> => Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16));
export const address = (input: unknown): string => typeof input === 'string' && /^0x[0-9a-f]{40}$/.test(input) ? input : stop();
export const hash = (input: unknown): string => typeof input === 'string' && /^0x[0-9a-f]{64}$/.test(input) ? input : stop();
export const MAX_U256 = (1n << 256n) - 1n;
export const uint = (input: unknown): bigint => typeof input === 'bigint' && input >= 0n && input <= MAX_U256 ? input : stop();
export const integer = (input: unknown): number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : stop();
export const bool = (input: unknown): boolean => typeof input === 'boolean' ? input : stop();
export function signalAborted(signal?: AbortSignal): boolean {
  if (signal === undefined) return false;
  try { return Reflect.apply(Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!, signal, []); }
  catch { return stop(); }
}
