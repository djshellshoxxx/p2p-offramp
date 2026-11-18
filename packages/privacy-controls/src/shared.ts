/** Internal LOCAL control helpers. These values never authorize a wallet operation. */
import { createCoreError, normalizeError } from '../../domain/index.ts';
import type { CoreErrorCode, CoreResult, Result } from '../../schemas/index.ts';

export const MAX_LOCAL_BYTES = 32_768;
export const ok = <T>(value: T): CoreResult<T> => Object.freeze({ ok: true, value });
export const failed = <T = never>(code: CoreErrorCode): CoreResult<T> => Object.freeze({ ok: false, error: createCoreError(code, { operationId: '', readOnly: false }) });
export function stop(code: CoreErrorCode = 'INVALID_INPUT'): never { throw Object.freeze({ code }); }
export function codeOf(input: unknown): CoreErrorCode { return normalizeError(input, { operationId: '', phase: 'prepare' }).code; }
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const c = result.error.code;
  return stop(c === 'LOCKED' || c === 'CONFLICT' || c === 'CANCELLED' || c === 'LIMIT_EXCEEDED' || c === 'UNSUPPORTED_VERSION' ? c : c === 'AUTHENTICATION_FAILED' ? 'UNAUTHORIZED' : 'UNAVAILABLE');
}
export function data(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return stop();
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return stop();
    const own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k))) return stop();
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !('value' in d)) return stop(); out[key] = d.value; }
    return out;
  } catch (error) { return stop(codeOf(error)); }
}
export function list(input: unknown, max: number): readonly unknown[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return stop();
    const d = Object.getOwnPropertyDescriptor(input, 'length'); if (!d || !('value' in d)) return stop();
    const length = integer(d.value, 0, max), keys = Reflect.ownKeys(input);
    if (keys.length !== length + 1) return stop();
    return Object.freeze(Array.from({ length }, (_, i) => { const item = Object.getOwnPropertyDescriptor(input, String(i)); if (!item || !('value' in item)) return stop(); return item.value as unknown; }));
  } catch (error) { return stop(codeOf(error)); }
}
export function integer(input: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < min || input > max) return stop(); return input;
}
export function text(input: unknown, max = 256): string {
  if (typeof input !== 'string') return stop(); if (input.length > max) return stop('LIMIT_EXCEEDED');
  if (!input.length || !/^[A-Za-z0-9._:~-]+$/.test(input)) return stop(); return input;
}
export function hex(input: unknown, bytes: number): string { if (typeof input !== 'string' || input.length !== bytes * 2 || !/^[0-9a-f]+$/.test(input)) return stop(); return input; }
export const profileId = (input: unknown): string => hex(input, 16);
export function passphrase(input: unknown): string {
  if (typeof input !== 'string' || input.length > 1024) return stop();
  const bytes = new TextEncoder().encode(input); try { if (bytes.length < 12 || bytes.length > 1024) return stop(); } finally { bytes.fill(0); }
  return input;
}
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
export function aborted(signal: AbortSignal | undefined): boolean { if (signal === undefined) return false; try { return Reflect.apply(nativeAborted, signal, []) as boolean; } catch { return stop(); } }
export interface LocalJob { readonly signal: AbortSignal; guard(): void; durable(): void; setRevisionGuard(check: (() => void) | null): void; }
/** One physical operation, no queue. Cancellation never admits replacement work before drain. */
export class LocalGate {
  private closed = false; private epoch = 0; private active: AbortController | undefined;
  private readonly current: () => boolean; private readonly onClose: () => void;
  constructor(current: () => boolean, onClose: () => void = () => undefined) { this.current = current; this.onClose = onClose; }
  get isClosed(): boolean { return this.closed; }
  close(): void { if (this.closed) return; this.closed = true; this.epoch++; this.active?.abort(); try { this.onClose(); } catch { /* Revocation cannot expose cleanup diagnostics. */ } }
  cancel(): void { this.epoch++; this.active?.abort(); }
  async run<T>(work: (job: LocalJob) => Promise<T>, signal?: AbortSignal): Promise<CoreResult<T>> {
    if (this.active) return failed('CONFLICT'); if (this.closed) return failed('LOCKED');
    const controller = new AbortController(), epoch = this.epoch; this.active = controller; let durable = false, listening = false, revisionGuard: (() => void) | null = null;
    const cancel = (): void => { controller.abort(); };
    const guard = (): void => {
      if (this.closed || this.active !== controller) return stop('LOCKED');
      if (this.epoch !== epoch || controller.signal.aborted) return stop('CANCELLED');
      let live = false; try { live = this.current() === true; } catch { /* Fixed refusal. */ }
      if (this.closed || this.active !== controller || !live) { this.close(); return stop('LOCKED'); }
      revisionGuard?.();
      if (this.closed || this.active !== controller) return stop('LOCKED');
      if (this.epoch !== epoch || controller.signal.aborted) return stop('CANCELLED');
    };
    try {
      if (aborted(signal)) return failed('CANCELLED');
      if (signal) { Reflect.apply(add, signal, ['abort', cancel, { once: true }]); listening = true; }
      guard(); const value = await work(Object.freeze({ signal: controller.signal, guard, durable() { durable = true; }, setRevisionGuard(check: (() => void) | null) { revisionGuard = check; } }));
      // Only a completed native CAS may set durable. Its consumer returns scalar receipts.
      if (!durable) guard(); return ok(value);
    } catch (error) { return failed(codeOf(error)); }
    finally { if (signal && listening) { try { Reflect.apply(remove, signal, ['abort', cancel]); } catch { /* Retire independently. */ } } if (this.active === controller) this.active = undefined; }
  }
}
