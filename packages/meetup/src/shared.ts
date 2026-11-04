/** Local-only meetup data helpers. A parsed value is never sensor, network or settlement authority. */
export type MeetupErrorCode = 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'UNSUPPORTED_LATITUDE' | 'UNSUPPORTED_RESOLUTION' |
  'INACCURATE' | 'STALE_GENERATION' | 'CONSENT_REVOKED' | 'RNG_UNAVAILABLE' | 'EXHAUSTED' | 'CLOCK_ROLLBACK' |
  'LEDGER_UNAVAILABLE' | 'LOCKED' | 'CONFLICT' | 'CANCELLED' | 'TIMEOUT' | 'CAPACITY_EXCEEDED' | 'INTEGRITY_FAILURE' | 'EXPIRED';
export type MeetupResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: MeetupErrorCode }> }>;
const failures = new WeakMap<object, MeetupErrorCode>();
export function stop(code: MeetupErrorCode = 'INVALID_INPUT'): never { const error = new Error('Local meetup operation unavailable.'); failures.set(error, code); throw error; }
export function codeOf(error: unknown, fallback: MeetupErrorCode = 'INVALID_INPUT'): MeetupErrorCode {
  return typeof error === 'object' && error !== null ? failures.get(error) ?? fallback : fallback;
}
export const success = <T>(value: T): MeetupResult<T> => Object.freeze({ ok: true, value });
export const failure = <T = never>(code: MeetupErrorCode): MeetupResult<T> => Object.freeze({ ok: false, error: Object.freeze({ code }) });
export function result<T>(work: () => T): MeetupResult<T> { try { return success(work()); } catch (error) { return failure(codeOf(error)); } }
export function data(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return stop();
  const keys = Reflect.ownKeys(input);
  if (keys.length > required.length + optional.length || keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key))) return stop();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of [...required, ...optional]) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor) { if (required.includes(key)) return stop(); continue; }
    if (!descriptor.enumerable || !('value' in descriptor)) return stop();
    out[key] = descriptor.value;
  }
  return out;
}
export function list(input: unknown, limit: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return stop();
  const length: unknown = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return stop();
  if (length > limit) return stop('CAPACITY_EXCEEDED');
  if (Reflect.ownKeys(input).length !== length + 1) return stop();
  return Array.from({ length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    return descriptor?.enumerable && 'value' in descriptor ? descriptor.value as unknown : stop();
  });
}
export const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : stop();
export const finite = (value: unknown, min: number, max: number, exclusiveMax = false): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && (exclusiveMax ? value < max : value <= max) ? value : stop();
export const hex = (value: unknown, length: number): string => typeof value === 'string' && value.length === length && /^[0-9a-f]+$/.test(value) ? value : stop();
export const bool = (value: unknown): boolean => typeof value === 'boolean' ? value : stop();
export const radius = (value: unknown): 500 | 1000 | 2000 => value === 500 || value === 1000 || value === 2000 ? value : stop();
export const EARTH_RADIUS_M = 6_371_008.8;
export const EPOCH_MS = 900_000;
export const DAY_MS = 86_400_000;
export type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => void;
export function webCryptoFill(bytes: Uint8Array<ArrayBuffer>): void { try { globalThis.crypto.getRandomValues(bytes); } catch { return stop('RNG_UNAVAILABLE'); } }
export function randomId(fill: RandomFill): string {
  const bytes = new Uint8Array(16);
  try { fill(bytes); return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
  catch { return stop('RNG_UNAVAILABLE'); } finally { bytes.fill(0); }
}
export function distanceM(latA: number, lonA: number, latB: number, lonB: number): number {
  const radians = Math.PI / 180, dLat = (latB - latA) * radians, dLon = (lonB - lonA) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
export function checkSignal(signal?: AbortSignal): void {
  if (signal === undefined) return;
  try {
    const getter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
    if (Reflect.apply(getter, signal, [])) return stop('CANCELLED');
  } catch (error) { return stop(codeOf(error) === 'CANCELLED' ? 'CANCELLED' : 'INVALID_INPUT'); }
}
