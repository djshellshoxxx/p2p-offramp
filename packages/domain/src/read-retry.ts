/** G13: this wrapper is exclusively for policy-authorized idempotent reads, never wallet/economic calls. */
import type { CoreResult } from '../../schemas/index.ts';
import { createCoreError, normalizeError } from './errors.ts';

export const READ_MAX_ATTEMPTS = 3;
export const READ_ATTEMPT_TIMEOUT_MS = 10_000;
export const READ_OPERATION_BUDGET_MS = 35_000;
export interface ReadRetryOptions {
  readonly signal: AbortSignal;
  readonly operationId: string;
  /** The owning generation/policy boundary; false invalidates outputs and forbids new attempts. */
  readonly isCurrent?: () => boolean;
}
export interface ReadRetryRuntime {
  now(): number;
  random(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}
type ReadOperation<T> = (signal: AbortSignal) => Promise<CoreResult<T>>;
type Retrier = <T>(operation: ReadOperation<T>, options: ReadRetryOptions) => Promise<CoreResult<T>>;
const runtime: ReadRetryRuntime = {
  now: () => performance.now(),
  random: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000,
  schedule(callback, delayMs) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); },
};
/** Clock/random scheduling injection preserves the fixed policy limits; it is used by deterministic tests. */
export function createReadRetrier(time: ReadRetryRuntime): Retrier {
  return async function retry<T>(operation: ReadOperation<T>, options: ReadRetryOptions): Promise<CoreResult<T>> {
    const error = (code: Parameters<typeof createCoreError>[0]): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId: options.operationId, readOnly: true }) });
    if (typeof options.operationId !== 'string' || !/^[0-9a-f]{32}$/.test(options.operationId) || typeof operation !== 'function') return error('INVALID_INPUT');
    const current = (): boolean => {
      try { return !options.signal.aborted && (options.isCurrent === undefined || options.isCurrent() === true); } catch { return false; }
    };
    if (!current()) return error('CANCELLED');
    let runtimeFailed = false, clockFault = false, previousTime = -Infinity;
    const now = (): number => {
      try {
        const value = time.now();
        if (!Number.isFinite(value)) return value;
        if (value < 0 || value < previousTime) throw new Error();
        previousTime = value; return value;
      } catch { clockFault = true; return NaN; }
    };
    const started = now();
    if (!current()) return error('CANCELLED');
    if (!Number.isFinite(started) || clockFault) return error('UNAVAILABLE');
    const cancelTimer = (cancel: () => void): void => { try { cancel(); } catch { runtimeFailed = true; } };
    let elapsed = 0;
    const remaining = (): number => {
      const value = now();
      if (!current()) return -1;
      if (!Number.isFinite(value)) return 0;
      elapsed = Math.max(elapsed, value - started);
      return Math.max(0, READ_OPERATION_BUDGET_MS - elapsed);
    };
    const attempt = (budget: number): Promise<{ readonly result: CoreResult<T>; readonly operationSettled: boolean }> =>
      new Promise(resolve => {
        const controller = new AbortController();
        let finished = false, settled = false, timedOut = false;
        let clearTimer: () => void = () => undefined;
        const finish = (result: CoreResult<T>): void => {
          if (finished) return;
          finished = true; cancelTimer(clearTimer); options.signal.removeEventListener('abort', onAbort);
          resolve({ result: runtimeFailed ? error('UNAVAILABLE') : result, operationSettled: settled });
        };
        const onAbort = (): void => { controller.abort(); finish(error('CANCELLED')); };
        options.signal.addEventListener('abort', onAbort, { once: true });
        try {
          const cancel = time.schedule(() => {
            timedOut = true;
            controller.abort();
            // Retry only after an abort-aware adapter's actual promise has settled.
            queueMicrotask(() => finish(current() ? error('TIMEOUT') : error('CANCELLED')));
          }, Math.min(READ_ATTEMPT_TIMEOUT_MS, budget));
          if (typeof cancel !== 'function') throw new Error();
          clearTimer = cancel;
          if (finished) { cancelTimer(clearTimer); return; }
        } catch { runtimeFailed = true; controller.abort(); finish(error('UNAVAILABLE')); return; }
        if (!current()) { onAbort(); return; }
        let reading: Promise<CoreResult<T>>;
        try { reading = Promise.resolve(operation(controller.signal)); }
        catch (input) { reading = Promise.resolve({ ok: false, error: normalizeError(input, { operationId: options.operationId, phase: 'read' }) }); }
        reading.then(value => {
          settled = true;
          if (finished) return;
          if (!current()) { finish(error('CANCELLED')); return; }
          if (timedOut) { finish(error('TIMEOUT')); return; }
          try {
            const ok = Object.getOwnPropertyDescriptor(value, 'ok');
            if (!ok || !('value' in ok) || typeof ok.value !== 'boolean') { finish(error('INTEGRITY_FAILURE')); return; }
            const payload = Object.getOwnPropertyDescriptor(value, ok.value ? 'value' : 'error');
            if (!payload || !('value' in payload)) { finish(error('INTEGRITY_FAILURE')); return; }
            finish(ok.value ? { ok: true, value: payload.value as T } : { ok: false, error: normalizeError(payload.value, { operationId: options.operationId, phase: 'read' }) });
          } catch { finish(error('INTEGRITY_FAILURE')); }
        }, input => {
          settled = true;
          if (!finished) finish(!current() ? error('CANCELLED') : timedOut ? error('TIMEOUT') : { ok: false, error: normalizeError(input, { operationId: options.operationId, phase: 'read' }) });
        });
      });
    const backoff = (delay: number): Promise<boolean> => new Promise(resolve => {
      let done = false;
      let clearTimer: () => void = () => undefined;
      const finish = (valid: boolean): void => {
        if (done) return; done = true; cancelTimer(clearTimer); options.signal.removeEventListener('abort', onAbort); resolve(valid && !runtimeFailed);
      };
      const onAbort = (): void => finish(false);
      options.signal.addEventListener('abort', onAbort, { once: true });
      if (!current()) { finish(false); return; }
      try {
        const cancel = time.schedule(() => finish(current()), delay);
        if (typeof cancel !== 'function') throw new Error();
        clearTimer = cancel;
        if (done) cancelTimer(clearTimer);
      } catch { runtimeFailed = true; finish(false); }
    });
    let last: CoreResult<T> = error('UNAVAILABLE');
    for (let index = 0; index < READ_MAX_ATTEMPTS; index++) {
      if (!current()) return error('CANCELLED');
      const budget = remaining();
      if (budget < 0) return error('CANCELLED');
      if (runtimeFailed || clockFault) return error('UNAVAILABLE');
      if (budget === 0) return error('TIMEOUT');
      const { result, operationSettled } = await attempt(budget);
      last = result;
      if (!current()) return error('CANCELLED');
      const left = remaining();
      if (left < 0) return error('CANCELLED');
      if (runtimeFailed || clockFault) return error('UNAVAILABLE');
      if (left === 0) return error('TIMEOUT');
      if (result.ok || !result.error.retryable || !operationSettled || index === READ_MAX_ATTEMPTS - 1) return result;
      let sample: number;
      try { sample = time.random(); } catch { return error(!current() ? 'CANCELLED' : 'UNAVAILABLE'); }
      if (!current()) return error('CANCELLED');
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) return error('UNAVAILABLE');
      const ceiling = index === 0 ? 500 : 1000;
      const delay = Math.floor(sample * (ceiling + 1));
      const backoffBudget = remaining();
      if (backoffBudget < 0) return error('CANCELLED');
      if (runtimeFailed || clockFault) return error('UNAVAILABLE');
      if (delay >= backoffBudget) return error('TIMEOUT');
      if (!await backoff(delay)) return error(runtimeFailed ? 'UNAVAILABLE' : 'CANCELLED');
      if (runtimeFailed) return error('UNAVAILABLE');
    }
    return last;
  };
}
export const retryRead: Retrier = createReadRetrier(runtime);
