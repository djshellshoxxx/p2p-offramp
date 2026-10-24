/** Partial G05 capability broker. Contains no network driver or automatic retry.
 * Trusted registry/operation callbacks are reviewed bundled code, not an I/O sandbox.
 * The production default has no endpoint, consent or positive evidence authority.
 * Scope.run has a 30-second wrapper deadline, but does not promise native cancellation.
 * HTTP streaming/redirect and socket connection/message limits, G13 retries, G12
 * publication outcomes, real route verification and G04/G11/G15 integration remain gates.
 */
import {
  parseTransportEvidence, parseTransportGrant, parseTransportRequest, transportChannel, transportId,
  type RequestPolicy, type RouteError, type RouteEvidence, type TransportChannel,
  type TransportGrantProjection, type TransportMode, type TransportResult,
} from '../../schemas/index.ts';
export const MAX_TRANSPORT_PERMITS = 64;
export const MAX_UNSETTLED_TRANSPORT_OPERATIONS = 64;
export const TRANSPORT_OPERATION_TIMEOUT_MS = 30_000;
const MAX_GENERATION = Number.MAX_SAFE_INTEGER - 1;
/** Issued by the injected trusted registry for this exact broker owner and request. */
export interface TrustedTransportGrant {
  readonly owner: object;
  snapshot(): unknown;
  current(owner: object): boolean;
  subscribeInvalidation(listener: () => void): () => void;
  dispose(): void;
}
/** No producer of positive production evidence is implemented in this tranche.
 * JSON, relay/plugin claims and user preferences cannot implement this authority.
 * A composition root must supply a reviewed G11/G15-bound issuer before enabling I/O.
 */
export interface TrustedTransportRegistryCapability {
  inspect(channel: TransportChannel): unknown | null;
  capture(request: Readonly<RequestPolicy>, owner: object): TrustedTransportGrant | null;
  subscribeInvalidation(listener: () => void): () => void;
}
export interface Permit { readonly generation: number; readonly endpointId: string; }
export interface TransportScope {
  readonly signal: AbortSignal;
  current(): boolean;
  /** Single reviewed operation only. Cancellation cannot roll back bytes already sent. */
  run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<TransportResult<T>>;
  dispose(): void;
}
export interface CaptureOptions { readonly signal?: AbortSignal; readonly onRevoked?: () => void; }
export interface TransportPolicyOptions { readonly trustedRegistry?: TrustedTransportRegistryCapability; readonly now?: () => number; }
interface State {
  readonly permit: Permit; readonly projection: TransportGrantProjection; readonly grant: TrustedTransportGrant;
  readonly controller: AbortController;
  active: boolean; cleaned: boolean; captured: boolean; used: boolean; reason: RouteError;
  unsubscribe: () => void; removeAbort: () => void; onRevoked: (() => void) | undefined;
}
const EMPTY: TrustedTransportRegistryCapability = Object.freeze({ inspect: () => null, capture: () => null, subscribeInvalidation: () => () => undefined });
const failure = (error: RouteError): TransportResult<never> => Object.freeze({ ok: false, error });
const bindingMatches = (left: RequestPolicy, right: RequestPolicy): boolean => left.channel === right.channel && left.endpointId === right.endpointId && left.method === right.method;

export class SessionTransportPolicy {
  readonly #registry: TrustedTransportRegistryCapability;
  readonly #owner = Object.freeze({});
  readonly #clock: () => number;
  #unsubscribe: () => void = () => undefined;
  #mode: TransportMode = 'ordinary';
  #generation = 0;
  #closed = false;
  #changing = false;
  #lastTime = -Infinity;
  #states = new Map<Permit, State>();
  #blocked = new Set<string>();
  #unsettled = new Set<object>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  constructor(options: TransportPolicyOptions = {}) {
    this.#registry = options.trustedRegistry ?? EMPTY; this.#clock = options.now ?? (() => performance.now());
    try {
      const unsubscribe = this.#registry.subscribeInvalidation(() => { this.#blocked.clear(); this.#transition('CANCELLED'); });
      if (typeof unsubscribe !== 'function') throw new Error(); this.#unsubscribe = unsubscribe;
    } catch { this.#closed = true; }
  }
  get mode(): TransportMode { return this.#mode; }
  get generation(): number { return this.#generation; }
  #time(): number | null {
    try {
      const now = this.#clock();
      if (!Number.isFinite(now) || now < 0 || now < this.#lastTime) throw new Error();
      this.#lastTime = now; return now;
    } catch { this.dispose(); return null; }
  }
  #cleanup(state: State): void {
    if (state.cleaned) return;
    state.cleaned = true; state.active = false;
    try { state.unsubscribe(); } catch { /* Fixed local failure; other scopes still revoke. */ }
    try { state.removeAbort(); } catch { /* No foreign diagnostics. */ }
    try { state.grant.dispose(); } catch { /* An issuer cannot prevent other cleanup. */ }
    try { state.controller.abort(); } catch { /* Best effort for native resource revocation. */ }
    const observer = state.onRevoked; state.onRevoked = undefined;
    try { observer?.(); } catch { /* One observer cannot prevent the remaining scopes closing. */ }
  }
  #drop(state: State, reason: RouteError): void {
    if (!state.active) return;
    state.reason = reason; this.#states.delete(state.permit); this.#cleanup(state); this.#schedule();
  }
  #transition(reason: RouteError): void {
    if (this.#changing) return;
    this.#changing = true;
    if (this.#generation >= MAX_GENERATION) this.#closed = true; else this.#generation++;
    const states = [...this.#states.values()]; this.#states.clear();
    if (this.#timer !== undefined) clearTimeout(this.#timer); this.#timer = undefined;
    for (const state of states) { state.reason = reason; this.#cleanup(state); }
    this.#changing = false;
  }
  #block(adapterId: string, reason: RouteError): void {
    if (this.#blocked.size >= MAX_TRANSPORT_PERMITS && !this.#blocked.has(adapterId)) { this.dispose(); return; }
    this.#blocked.add(adapterId); this.#transition(reason);
  }
  #expire(): boolean {
    const now = this.#time(); if (now === null) return false;
    for (const state of this.#states.values()) {
      if (state.projection.evidence.expiresAt !== null && now >= state.projection.evidence.expiresAt) { this.#transition('CANCELLED'); return false; }
    }
    return true;
  }
  #schedule(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer); this.#timer = undefined;
    if (this.#closed || this.#changing || !this.#states.size) return;
    const now = this.#time(); if (now === null) return;
    let earliest = Infinity;
    for (const state of this.#states.values()) earliest = Math.min(earliest, state.projection.evidence.expiresAt ?? Infinity);
    if (earliest !== Infinity) this.#timer = setTimeout(() => { this.#expire(); this.#schedule(); }, Math.min(0x7fffffff, Math.max(0, earliest - now)));
  }
  #current(state: State): boolean {
    if (this.#closed || this.#changing || !state.active || this.#states.get(state.permit) !== state || state.permit.generation !== this.#generation) return false;
    if (!this.#expire() || !state.active) return false;
    try {
      if (state.grant.owner !== this.#owner || state.grant.current(this.#owner) !== true) { this.#block(state.projection.endpoint.adapterId, 'CANCELLED'); return false; }
    } catch { this.#block(state.projection.endpoint.adapterId, 'ROUTE_UNAVAILABLE'); return false; }
    return !this.#closed && state.active && state.permit.generation === this.#generation;
  }
  setMode(input: TransportMode): void | RouteError {
    if (input !== 'ordinary' && input !== 'strict') return 'POLICY_BLOCKED';
    if (this.#closed || this.#changing) return 'POLICY_BLOCKED';
    if (this.#mode !== input) { this.#mode = input; this.#transition('CANCELLED'); }
  }
  inspect(input: TransportChannel): Readonly<RouteEvidence> {
    const channel = transportChannel(input); this.#expire();
    let coverage: RouteEvidence['coverage'] = this.#closed ? 'unsupported' : 'unknown', adapterId = 'unconfigured';
    if (!this.#closed && !this.#changing) {
      try {
        const generation = this.#generation;
        const issued = this.#registry.inspect(channel);
        if (issued !== null) {
          const evidence = parseTransportEvidence(issued), now = this.#time();
          if (evidence.channel !== channel) throw new Error();
          adapterId = evidence.adapterId;
          coverage = this.#closed || generation !== this.#generation || this.#blocked.has(adapterId) ||
            (evidence.expiresAt !== null && (now === null || evidence.expiresAt <= now)) ? 'unknown' : evidence.coverage;
        }
      } catch { coverage = 'unsupported'; this.#transition('ROUTE_UNAVAILABLE'); }
    }
    return Object.freeze({ channel, coverage, adapterId, generation: this.#generation });
  }
  authorize(input: RequestPolicy): Permit | RouteError {
    if (this.#closed || this.#changing) return 'POLICY_BLOCKED';
    let request: Readonly<RequestPolicy>;
    try { request = parseTransportRequest(input); } catch { return 'INVALID_ENDPOINT'; }
    this.#expire(); if (this.#closed || this.#changing) return 'ROUTE_UNAVAILABLE';
    if (this.#states.size >= MAX_TRANSPORT_PERMITS) return 'LIMIT_EXCEEDED';
    const generation = this.#generation; let grant: TrustedTransportGrant | null = null, attached = false;
    try {
      grant = this.#registry.capture(request, this.#owner); if (grant === null) return 'INVALID_ENDPOINT';
      if (grant.owner !== this.#owner || grant.current(this.#owner) !== true) return 'ROUTE_UNAVAILABLE';
      const snapshot = grant.snapshot();
      let projection: TransportGrantProjection;
      try { projection = parseTransportGrant(snapshot); } catch { return 'INVALID_ENDPOINT'; }
      if (!bindingMatches(projection.request, request)) return 'INVALID_ENDPOINT';
      if (this.#closed || this.#changing || generation !== this.#generation) return 'CANCELLED';
      if (this.#blocked.has(projection.endpoint.adapterId)) return 'ROUTE_UNAVAILABLE';
      const evidence = projection.evidence, now = this.#time(); if (now === null) return 'ROUTE_UNAVAILABLE';
      if (evidence.coverage === 'unsupported') return 'ROUTE_UNAVAILABLE';
      if (evidence.coverage === 'unknown' || (this.#mode === 'strict' && evidence.coverage !== 'verified-private') ||
          (evidence.coverage === 'direct' && !projection.directConsent)) return 'POLICY_BLOCKED';
      if (evidence.expiresAt === null || now >= evidence.expiresAt) return 'ROUTE_UNAVAILABLE';
      const permit = Object.freeze({ generation, endpointId: request.endpointId });
      const state: State = { permit, projection, grant, controller: new AbortController(), active: true, cleaned: false, captured: false, used: false,
        reason: 'CANCELLED', unsubscribe: () => undefined, removeAbort: () => undefined, onRevoked: undefined };
      this.#states.set(permit, state); attached = true;
      state.unsubscribe = grant.subscribeInvalidation(() => { this.#block(projection.endpoint.adapterId, 'CANCELLED'); });
      if (typeof state.unsubscribe !== 'function') throw new Error();
      if (!this.#current(state)) { this.#drop(state, 'CANCELLED'); return 'CANCELLED'; }
      this.#schedule(); return permit;
    } catch {
      if (attached) this.#block('unconfigured', 'ROUTE_UNAVAILABLE');
      return 'ROUTE_UNAVAILABLE';
    } finally { if (grant !== null && !attached) { try { grant.dispose(); } catch { /* Fixed refusal only. */ } } }
  }
  isCurrent(permit: Permit): boolean { const state = this.#states.get(permit); return state !== undefined && this.#current(state); }
  revoke(input: string): void | RouteError {
    let adapterId: string; try { adapterId = transportId(input); } catch { return 'INVALID_ENDPOINT'; }
    if (this.#closed || this.#changing) return 'POLICY_BLOCKED';
    this.#block(adapterId, 'CANCELLED');
  }
  capture(permit: Permit, options: CaptureOptions = {}): TransportScope | RouteError {
    const state = this.#states.get(permit);
    if (!state || state.captured || !this.#current(state)) return 'CANCELLED';
    try {
      if ((options.signal !== undefined && !(options.signal instanceof AbortSignal)) || (options.onRevoked !== undefined && typeof options.onRevoked !== 'function')) return 'POLICY_BLOCKED';
      if (options.signal?.aborted) { this.#drop(state, 'CANCELLED'); return 'CANCELLED'; }
      state.captured = true; state.onRevoked = options.onRevoked;
      const abort = (): void => this.#drop(state, 'CANCELLED');
      options.signal?.addEventListener('abort', abort, { once: true });
      state.removeAbort = () => options.signal?.removeEventListener('abort', abort);
      if (options.signal?.aborted) { abort(); return 'CANCELLED'; }
      return Object.freeze({ signal: state.controller.signal, current: () => this.#current(state),
        run: <T>(operation: (signal: AbortSignal) => Promise<T>) => this.#run(state, operation), dispose: () => this.#drop(state, 'CANCELLED') });
    } catch { this.#drop(state, 'ROUTE_UNAVAILABLE'); return 'ROUTE_UNAVAILABLE'; }
  }
  async #run<T>(state: State, operation: (signal: AbortSignal) => Promise<T>): Promise<TransportResult<T>> {
    if (state.used || !this.#current(state)) return failure('CANCELLED');
    if (typeof operation !== 'function') return failure('POLICY_BLOCKED');
    if (this.#unsettled.size >= MAX_UNSETTLED_TRANSPORT_OPERATIONS) return failure('LIMIT_EXCEEDED');
    state.used = true; const job = {}; this.#unsettled.add(job);
    let timer: ReturnType<typeof setTimeout> | undefined, remove = (): void => undefined;
    const result = await new Promise<TransportResult<T>>(resolve => {
      let finished = false;
      const finish = (value: TransportResult<T>): void => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); remove(); resolve(value); };
      const aborted = (): void => finish(failure(state.reason));
      state.controller.signal.addEventListener('abort', aborted, { once: true }); remove = () => state.controller.signal.removeEventListener('abort', aborted);
      timer = setTimeout(() => { finish(failure('TIMEOUT')); this.#block(state.projection.endpoint.adapterId, 'CANCELLED'); }, TRANSPORT_OPERATION_TIMEOUT_MS);
      if (!this.#current(state)) { this.#unsettled.delete(job); finish(failure('CANCELLED')); return; }
      let pending: Promise<T>;
      try { pending = Promise.resolve(operation(state.controller.signal)); }
      catch { pending = Promise.reject(); }
      pending.then(value => {
        this.#unsettled.delete(job);
        if (finished) return;
        finish(this.#current(state) ? Object.freeze({ ok: true, value }) : failure('CANCELLED'));
      }, () => {
        this.#unsettled.delete(job);
        if (finished) return;
        finish(this.#current(state) ? failure('ROUTE_UNAVAILABLE') : failure('CANCELLED'));
        if (state.active) this.#block(state.projection.endpoint.adapterId, 'CANCELLED');
      });
    });
    // An observer can revoke after promise settlement but before this continuation.
    return result.ok && !this.#current(state) ? failure('CANCELLED') : result;
  }
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true; this.#transition('CANCELLED'); this.#blocked.clear();
    try { this.#unsubscribe(); } catch { /* Never expose registry exceptions. */ }
  }
}
