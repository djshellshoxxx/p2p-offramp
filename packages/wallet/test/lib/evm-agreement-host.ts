/** Private host lifecycle for the EVM agreement consistency check; not exported by any facade.
 * Owns request/generation ordering, one actual verifier job, 30s deadline, invalidation and reply projection.
 * Imported request fields are correlation data only; the actual imported verifier supplies all verdicts.
 * Limits: caller strings and native SHA internals are outside erasure; no physical rollback/cancellation of the
 * underlying hash is claimed; the host closes terminally on timeout or counter exhaustion.
 * Logical settlement (what the caller sees) is separate from physical slot release (underlying promise settles).
 */
import { CoreSchemaError, MAX_RUNTIME_SEQUENCE, RUNTIME_REQUEST_TIMEOUT_MS } from '../../../schemas/index.ts';
import { parseEvmAgreementCheckRequest, parseEvmAgreementCheckReply,
  type EvmAgreementCheckReply, type EvmAgreementCheckRequest, type EvmAgreementFailureCode } from '../../../schemas/src/evm-agreement-protocol.ts';
import { verifyEvmAgreementBundle } from '../../src/evm-agreement.ts';

/** Trusted constructor-only seams for deterministic tests. Production leaves all undefined. */
export interface EvmAgreementHostTimer {
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}
export interface EvmAgreementHostOptions {
  /** Passed to the actual verifier as its existing context.sha256. */
  readonly sha256?: (bytes: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>;
  /** Trusted monotonic millisecond clock; must be finite and nondecreasing. Default performance.now. */
  readonly now?: () => number;
  /** Timer seam; the 30000ms bound itself is not configurable. */
  readonly timer?: EvmAgreementHostTimer;
}
/** Qualification-only snapshot of existing host state. terminal never means physically idle. */
export interface EvmAgreementHostPhysicalState {
  readonly generation: number;
  readonly held: boolean;
  readonly terminal: boolean;
}
export interface EvmAgreementHost {
  dispatch(input: unknown): Promise<Readonly<EvmAgreementCheckReply> | undefined>;
  invalidate(): void;
  dispose(): void;
  /** Pure frozen primitives from existing state; invokes no clock, timer or RNG. */
  physicalState(): Readonly<EvmAgreementHostPhysicalState>;
  /** Synchronously disposes; resolves only after the actual verifier work released its slot. */
  disposeAndDrain(): Promise<void>;
  readonly generation: number;
}

type Verdict = Awaited<ReturnType<typeof verifyEvmAgreementBundle>>;
/** Logical settlement outcome of a job. 'suppressed' = invalidate/dispose/stale; distinct from timeout. */
type Outcome = 'timeout' | 'suppressed' | { readonly kind: 'value'; readonly value: Verdict } | { readonly kind: 'threw' };

interface Job {
  readonly id: number;
  readonly generation: number;
  readonly controller: AbortController;
  readonly signatures: Uint8Array[];
  readonly started: number;
  /** Highest clock reading seen; any reading below it is a clock fault. */
  last: number;
  timer: unknown;
  timedOut: boolean;
  logicallyDone: boolean;
  /** Underlying verifier promise has actually settled. */
  settled: boolean;
  /** Idempotent logical deferred resolver (first outcome wins). */
  resolve: (outcome: Outcome) => void;
}

export function createEvmAgreementHost(options: EvmAgreementHostOptions = {}): EvmAgreementHost {
  const sha256 = options.sha256, nowSeam = options.now, timerSeam = options.timer;
  const nativeSet = globalThis.setTimeout, nativeClear = globalThis.clearTimeout;
  const clock = (): number => nowSeam ? nowSeam() : performance.now();
  const setTimer = (cb: () => void, ms: number): unknown => timerSeam ? timerSeam.setTimeout(cb, ms) : nativeSet(cb, ms);
  const clearTimer = (handle: unknown): void => { if (timerSeam) timerSeam.clearTimeout(handle); else nativeClear(handle as ReturnType<typeof setTimeout>); };

  let generation = 0, lastRequest = 0, nextJobId = 1;
  let disposed = false, closed = false;
  let active: Job | undefined;
  /** Shared completion for terminal drain; created only while a slot is held, cleared on release. */
  let drainPromise: Promise<void> | undefined;
  let drainResolve: (() => void) | undefined;
  const releaseSlot = (job: Job): void => {
    if (active !== job) return;
    active = undefined;
    const resolve = drainResolve;
    drainPromise = undefined; drainResolve = undefined;
    if (resolve) resolve();
  };
  /** Parse reservation: set synchronously before the strict parser so a reentrant dispatch cannot parse concurrently. */
  let parsing = false;

  const reply = (requestId: number, gen: number, failureCode?: EvmAgreementFailureCode, value?: unknown): Readonly<EvmAgreementCheckReply> =>
    parseEvmAgreementCheckReply({ version: 1, requestId, generation: gen, operation: 'checkEvmAgreement', kind: 'response',
      result: failureCode !== undefined ? { ok: false, error: { code: failureCode } } : { ok: true, value } });

  const wipe = (bytes: readonly Uint8Array[]): void => { for (const b of bytes) b.fill(0); };
  const stopTimer = (job: Job): void => {
    if (job.timer !== undefined) { const t = job.timer; job.timer = undefined; try { clearTimer(t); } catch { /* seam fault ignored */ } }
  };
  /** Logical termination: abort, wipe host-owned signatures, stop timer, settle the logical deferred as suppressed
   * (no-op if already settled with a verdict/timeout). Physical slot release stays with the underlying promise. */
  const terminate = (job: Job): void => {
    job.logicallyDone = true;
    try { job.controller.abort(); } catch { /* ignore */ }
    wipe(job.signatures);
    stopTimer(job);
    job.resolve('suppressed');
  };
  /** Ownership holds until the physical slot is released: logical projection happens while active === job. */
  const liveOwned = (job: Job): boolean =>
    !disposed && !closed && active === job && !job.logicallyDone && !job.timedOut && job.generation === generation;
  /** Finite, never-decreasing (versus every prior read) clock; undefined when faulty. */
  const elapsed = (job: Job): number | undefined => {
    try {
      const t = clock();
      if (typeof t !== 'number' || !Number.isFinite(t) || t < job.last) return undefined;
      job.last = t;
      return t - job.started;
    } catch { return undefined; }
  };

  const invalidate = (): void => {
    if (disposed) return;
    const job = active;
    if (generation >= MAX_RUNTIME_SEQUENCE) { closed = true; if (job) terminate(job); return; }
    generation++;
    if (job) terminate(job);
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; closed = true;
    const job = active;
    if (job) terminate(job);
    // `active` is retained until the underlying promise actually settles (identity-bound release below).
  };
  const physicalState = (): Readonly<EvmAgreementHostPhysicalState> =>
    Object.freeze({ generation, held: active !== undefined, terminal: disposed || closed });
  const disposeAndDrain = (): Promise<void> => {
    dispose();
    if (!active) return Promise.resolve();
    if (!drainPromise) drainPromise = new Promise<void>(resolve => { drainResolve = resolve; });
    return drainPromise;
  };

  async function dispatch(input: unknown): Promise<Readonly<EvmAgreementCheckReply> | undefined> {
    if (disposed || closed) return undefined;
    if (parsing) {
      // Reentrant dispatch during an in-progress strict parse: refuse without touching the input.
      throw new CoreSchemaError('INVALID_INPUT');
    }
    parsing = true;
    let request: Readonly<EvmAgreementCheckRequest> | undefined;
    try { request = parseEvmAgreementCheckRequest(input); }
    catch (error) {
      parsing = false;
      // Genuine parser codes stay intact; anything foreign becomes a fresh fixed error.
      if (error instanceof CoreSchemaError) throw new CoreSchemaError(error.code);
      throw new CoreSchemaError('INVALID_INPUT');
    }
    parsing = false;
    input = undefined; // raw caller input no longer needed; avoid retaining it across the await

    const signatures = request.input.acceptances.map(a => a.signature as Uint8Array);
    const requestId = request.requestId, requestGeneration = request.generation;
    const refuse = (code: EvmAgreementFailureCode): Readonly<EvmAgreementCheckReply> | undefined => {
      wipe(signatures);
      if (disposed || closed) return undefined;
      return reply(requestId, requestGeneration, code);
    };
    if (disposed || closed) { wipe(signatures); return undefined; }
    if (requestId <= lastRequest) {
      wipe(signatures);
      throw new CoreSchemaError('INVALID_INPUT');
    }
    lastRequest = requestId;
    if (requestGeneration < generation) return refuse('CONFLICT');
    if (requestGeneration > generation) { wipe(signatures); throw new CoreSchemaError('INVALID_INPUT'); }
    if (active) return refuse('BUSY');

    const started = (() => { try { const t = clock(); return typeof t === 'number' && Number.isFinite(t) ? t : NaN; } catch { return NaN; } })();
    // A trusted clock callback may reenter dispatch/invalidate/dispose before registration.
    if (disposed || closed) { wipe(signatures); return undefined; }
    if (requestGeneration !== generation) { wipe(signatures); return undefined; }
    if (active) return refuse('BUSY');
    if (Number.isNaN(started)) return refuse('UNAVAILABLE');

    let resolveLogical: (outcome: Outcome) => void = () => {};
    const logical = new Promise<Outcome>(resolve => { resolveLogical = resolve; });
    let decided = false;
    const job: Job = { id: nextJobId++, generation, controller: new AbortController(), signatures, started, last: started,
      timer: undefined, timedOut: false, logicallyDone: false, settled: false,
      resolve: (outcome: Outcome) => { if (decided) return; decided = true; resolveLogical(outcome); } };
    active = job;

    try {
      job.timer = setTimer(() => {
        // No-op after physical or logical settlement (delayed delivery despite clearTimeout).
        if (job.settled || job.logicallyDone || job.timedOut) return;
        job.timedOut = true;
        terminate(job); // wipes/aborts/stops timer; its 'suppressed' resolve is overridden below only if still undecided
        // Host is terminal after a request timeout; the slot stays held until the real job settles.
        closed = true;
      }, RUNTIME_REQUEST_TIMEOUT_MS);
    } catch { terminate(job); releaseSlot(job); return refuse('UNAVAILABLE'); }

    // Timer seam may have reentered invalidate/dispose during setup: stop before starting the verifier.
    if (job.logicallyDone || disposed || closed || job.generation !== generation) {
      terminate(job);
      releaseSlot(job);
      return undefined;
    }

    const isCurrent = (): boolean => {
      if (!liveOwned(job)) return false;
      const e = elapsed(job);
      return e !== undefined && e < RUNTIME_REQUEST_TIMEOUT_MS;
    };
    const verifierContext = sha256
      ? { isCurrent, signal: job.controller.signal, sha256 }
      : { isCurrent, signal: job.controller.signal };

    let underlying: Promise<Verdict>;
    try { underlying = Promise.resolve(verifyEvmAgreementBundle(request.input, verifierContext)); }
    catch { underlying = Promise.reject(new Error()); }
    // Verifier's synchronous prefix has already snapshotted everything; drop the request reference.
    request = undefined;

    // Physical release bound to real settlement, identity-checked. The logical verdict is delivered while
    // active === job (resolve occurs BEFORE the slot is released), so a normal reply is not self-suppressed.
    void underlying.then(
      (value): Outcome => ({ kind: 'value', value }),
      (): Outcome => ({ kind: 'threw' }),
    ).then(outcome => {
      job.settled = true;
      if (job.timedOut) job.resolve('timeout');
      else if (job.logicallyDone) job.resolve('suppressed');
      else {
        // Decide the final projection now, while the job still owns the slot and before any successor can exist.
        const e = elapsed(job);
        if (disposed || job.generation !== generation) job.resolve('suppressed');
        else if (e === undefined) job.resolve({ kind: 'threw' });
        else if (e >= RUNTIME_REQUEST_TIMEOUT_MS) { job.timedOut = true; terminate(job); closed = true; job.resolve('timeout'); }
        else if (!liveOwned(job)) job.resolve('suppressed');
        else job.resolve(outcome);
      }
    }).finally(() => {
      job.settled = true;
      stopTimer(job);
      wipe(job.signatures);
      releaseSlot(job);
    });

    const outcome = await logical;

    wipe(job.signatures);
    // Precedence: disposal/invalidation/stale dominate any queued TIMEOUT; then timeout; then result.
    if (disposed || job.generation !== generation) return undefined;
    if (outcome === 'suppressed') return job.timedOut ? reply(requestId, requestGeneration, 'TIMEOUT') : undefined;
    if (outcome === 'timeout' || job.timedOut) return reply(requestId, requestGeneration, 'TIMEOUT');

    // Final recheck after logical decision (traps/seams may have reentered, or the clock advanced).
    const e2 = elapsed(job);
    if (disposed || job.generation !== generation) return undefined;
    if (e2 !== undefined && e2 >= RUNTIME_REQUEST_TIMEOUT_MS) {
      job.timedOut = true; terminate(job); closed = true;
      return reply(requestId, requestGeneration, 'TIMEOUT');
    }
    if (e2 === undefined) { return reply(requestId, requestGeneration, 'UNAVAILABLE'); }

    try {
      if (outcome.kind === 'threw') return reply(requestId, requestGeneration, 'UNAVAILABLE');
      const result = outcome.value;
      if (result.ok === true) {
        const v = result.value;
        return reply(requestId, requestGeneration, undefined, { testOnly: v.testOnly, economicPreparationAllowed: v.economicPreparationAllowed,
          termsHash: v.termsHash, accounts: { seller: v.accounts.seller, buyer: v.accounts.buyer } });
      }
      return reply(requestId, requestGeneration, result.error.code);
    } catch {
      try { return reply(requestId, requestGeneration, 'UNAVAILABLE'); } catch { return undefined; }
    }
  }

  return Object.freeze({
    dispatch,
    invalidate,
    dispose,
    physicalState,
    disposeAndDrain,
    get generation(): number { return generation; },
  });
}
