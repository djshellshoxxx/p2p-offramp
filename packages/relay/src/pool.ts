/**
 * Bounded Nostr relay pool (G21). Relay data is untrusted discovery input: every delivered event passes size, shape,
 * subscription, filter, rate, dedupe and signature checks, and carries no trade authority (G08).
 *
 * Every socket is opened only after the G05 broker issues a permit for the exact relay endpoint id (channel 'relay');
 * a refusal (strict mode without verified-private coverage, unknown endpoint, expiry, revocation) means no connection
 * and no direct fallback. The scope is re-checked on every inbound frame and revokes the socket when it lapses.
 *
 * Known limits (see spec G21): the broker does not hand the registered URL to the caller, so `relays[].url` comes from
 * the same trusted composition root as the registry and is not cross-checked here. The platform WebSocket assembles a
 * whole message before this code sees it, so the frame cap bounds parse/crypto cost, not transient network buffering.
 */
import type { Permit, SessionTransportPolicy, TransportScope } from '../../transport/index.ts';
import type { RouteError } from '../../transport/index.ts';
import { encodeClose, encodeEvent, encodeReq, matchesFilters, parseEvent, parseRelayFrame, FRAME_LIMITS, isHex64, withinBytes } from './nip01.ts';
import type { EventCrypto, NostrEvent, RelayFilter } from './nip01.ts';

const GIFT_WRAP_KIND = 1059;
export type RelayBroker = Pick<SessionTransportPolicy, 'authorize' | 'capture'>;
/** The subset of WebSocket this pool uses. The default connector is the platform WebSocket. */
export interface RelaySocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(text: string): void;
  close(): void;
}
export type RelayConnector = (url: string, signal: AbortSignal) => RelaySocketLike;
export const webSocketConnector: RelayConnector = url => new WebSocket(url) as unknown as RelaySocketLike;

export type PoolError = RouteError | 'INVALID_FILTER' | 'CLOSED';
export type PoolResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: PoolError };
export interface RelayConfig { readonly endpointId: string; readonly url: string; }
export type RelayState = 'idle' | 'connecting' | 'open' | 'backoff' | 'blocked' | 'failed' | 'banned';
export interface RelayStatus { readonly endpointId: string; readonly state: RelayState; readonly reason: string | null; readonly failures: number; readonly penalty: number; }
export interface PublishResult { readonly eventId: string; readonly relayId: string; readonly status: 'accepted' | 'rejected' | 'unknown'; }

export const POOL_LIMITS = Object.freeze({
  maxCandidates: 16, maxRelays: 4, maxSubscriptionsPerRelay: 4, maxFiltersPerSubscription: 2, maxFilterLimit: 100, maxHistorySeconds: 86_400,
  /** NIP-59 randomizes wrap timestamps up to 2 days into the past (+ skew), so wrap-only filters may reach back 3 days. */
  maxGiftWrapHistorySeconds: 259_200,
  eventsPerMinute: 120, burst: 20, overloadWindowMs: 10_000, overloadWindowsToDisconnect: 3, maxEventsPerSubscription: 1000,
  maxDedupIds: 4096, maxPublishInFlight: 32, banPenalty: 10, maxReconnects: 6,
});
export interface PoolTiming {
  readonly backoffCeilingsMs: readonly number[]; readonly stableMs: number; readonly connectTimeoutMs: number; readonly publishTimeoutMs: number;
}
export const DEFAULT_TIMING: PoolTiming = Object.freeze({ backoffCeilingsMs: [1000, 2000, 4000, 8000, 16_000, 30_000], stableMs: 60_000, connectTimeoutMs: 10_000, publishTimeoutMs: 10_000 });
const PENALTY = Object.freeze({ oversized: 10, malformed: 3, binary: 3, invalidSignature: 4, wrongSubscription: 3, outsideFilter: 3, unexpected: 2 });

export interface PoolOptions {
  readonly broker: RelayBroker;
  /** Approved candidates only (from the trusted registry); at most POOL_LIMITS.maxCandidates. Never discovered from events. */
  readonly relays: readonly RelayConfig[];
  readonly verifier: Pick<EventCrypto, 'verifyEvent'>;
  readonly connect?: RelayConnector;
  readonly clock?: () => number; // monotonic milliseconds
  readonly random?: () => number; // jitter only, not security-relevant
  readonly nowSeconds?: () => number | null; // wall clock for history windows
  readonly timing?: Partial<PoolTiming>;
  readonly maxRelays?: number;
  readonly onStatus?: (status: readonly RelayStatus[]) => void;
}
export interface SubscriptionHandlers {
  /** Called once per distinct, verified, filter-matching event id across all relays. Data is discovery-only. */
  readonly onEvent: (event: NostrEvent, relayId: string) => void;
  readonly onEose?: (relayId: string) => void;
}
export interface RelaySubscription { readonly id: string; close(): void; }
export interface RelayPool {
  subscribe(filters: readonly RelayFilter[], handlers: SubscriptionHandlers): PoolResult<RelaySubscription>;
  /** One explicit publish: at most one EVENT per selected relay, no automatic retry. ACK means relay acceptance only. */
  publish(event: NostrEvent, signal?: AbortSignal): Promise<PoolResult<readonly PublishResult[]>>;
  /** Explicit user retry after a relay reached `failed` or `blocked`. Does not clear `banned`. */
  retry(endpointId: string): void;
  status(): readonly RelayStatus[];
  close(): void;
}

interface Sub { readonly id: string; readonly filters: readonly RelayFilter[]; readonly handlers: SubscriptionHandlers; }
interface RelayRec {
  readonly cfg: RelayConfig; state: RelayState; reason: string | null; failures: number; penalty: number;
  socket: RelaySocketLike | null; scope: TransportScope | null; timer: ReturnType<typeof setTimeout> | undefined; openedAt: number;
  tokens: number; refilledAt: number; windowIndex: number; windowDropped: number; overloadedWindows: number;
  counts: Map<string, number>; closedSubs: Set<string>; generation: number;
}
const refuse = (error: PoolError): PoolResult<never> => Object.freeze({ ok: false, error });

export function createRelayPool(options: PoolOptions): RelayPool {
  if (options.relays.length > POOL_LIMITS.maxCandidates) throw new RangeError('too many relays');
  const timing: PoolTiming = { ...DEFAULT_TIMING, ...options.timing };
  const clock = options.clock ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const connect = options.connect ?? webSocketConnector;
  const maxActive = Math.max(1, Math.min(options.maxRelays ?? POOL_LIMITS.maxRelays, POOL_LIMITS.maxRelays));
  const seenIds = new Map<string, true>();
  const subs = new Map<string, Sub>();
  const seenEndpoints = new Set<string>();
  const recs: RelayRec[] = [];
  for (const cfg of options.relays) {
    if (seenEndpoints.has(cfg.endpointId)) throw new RangeError('duplicate relay');
    seenEndpoints.add(cfg.endpointId);
    recs.push({ cfg: Object.freeze({ ...cfg }), state: 'idle', reason: null, failures: 0, penalty: 0, socket: null, scope: null, timer: undefined, openedAt: 0,
      tokens: POOL_LIMITS.burst, refilledAt: clock(), windowIndex: 0, windowDropped: 0, overloadedWindows: 0, counts: new Map(), closedSubs: new Set(), generation: 0 });
  }
  let closed = false, subCounter = 0, inFlight = 0;

  const emitStatus = (): void => { try { options.onStatus?.(status()); } catch { /* observer faults never affect the pool */ } };
  const status = (): readonly RelayStatus[] => recs.map(r => Object.freeze({ endpointId: r.cfg.endpointId, state: r.state, reason: r.reason, failures: r.failures, penalty: r.penalty }));
  const active = (r: RelayRec): boolean => r.state === 'connecting' || r.state === 'open' || r.state === 'backoff';
  const setState = (r: RelayRec, state: RelayState, reason: string | null = null): void => { r.state = state; r.reason = reason; };

  function teardown(r: RelayRec): void {
    r.generation++;
    if (r.timer !== undefined) clearTimeout(r.timer);
    r.timer = undefined;
    const socket = r.socket, scope = r.scope; r.socket = null; r.scope = null;
    if (socket) { socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null; try { socket.close(); } catch { /* already closed */ } }
    try { scope?.dispose(); } catch { /* broker faults are fixed refusals */ }
    r.counts.clear(); r.closedSubs.clear();
  }
  function fill(): void {
    if (closed || subs.size === 0) return;
    let count = recs.filter(active).length;
    for (const r of recs) {
      if (count >= maxActive) return;
      if (r.state === 'idle') { count++; void start(r); }
    }
  }
  function fail(r: RelayRec, terminal: RelayState | null, reason: string): void {
    const wasOpenFor = r.state === 'open' ? clock() - r.openedAt : 0;
    teardown(r);
    if (closed) return;
    if (terminal !== null) { setState(r, terminal, reason); emitStatus(); fill(); return; }
    if (wasOpenFor >= timing.stableMs) r.failures = 0;
    r.failures++;
    if (subs.size === 0) { setState(r, 'idle'); emitStatus(); return; }
    if (r.failures > POOL_LIMITS.maxReconnects) { setState(r, 'failed', reason); emitStatus(); fill(); return; }
    const ceiling = timing.backoffCeilingsMs[Math.min(r.failures - 1, timing.backoffCeilingsMs.length - 1)] ?? 1000;
    const delay = Math.floor(random() * ceiling); // full jitter
    setState(r, 'backoff', reason); emitStatus();
    const generation = r.generation;
    r.timer = setTimeout(() => { if (!closed && r.generation === generation && r.state === 'backoff') void start(r); }, delay);
  }
  function penalize(r: RelayRec, amount: number, reason: string): boolean {
    r.penalty += amount;
    if (r.penalty >= POOL_LIMITS.banPenalty) { fail(r, 'banned', reason); return true; }
    return false;
  }
  function take(r: RelayRec): boolean {
    const now = clock();
    r.tokens = Math.min(POOL_LIMITS.burst, r.tokens + ((now - r.refilledAt) * POOL_LIMITS.eventsPerMinute) / 60_000);
    r.refilledAt = now;
    const index = Math.floor(now / POOL_LIMITS.overloadWindowMs);
    if (index !== r.windowIndex) {
      r.overloadedWindows = r.windowDropped > 0 && index === r.windowIndex + 1 ? r.overloadedWindows + 1 : 0;
      r.windowIndex = index; r.windowDropped = 0;
    }
    if (r.tokens >= 1) { r.tokens -= 1; return true; }
    r.windowDropped++;
    return false;
  }
  function remember(id: string): void {
    seenIds.set(id, true);
    if (seenIds.size > POOL_LIMITS.maxDedupIds) seenIds.delete(seenIds.keys().next().value as string);
  }
  function sendReq(r: RelayRec): void {
    let open = 0;
    for (const sub of subs.values()) {
      if (open >= POOL_LIMITS.maxSubscriptionsPerRelay) break;
      open++; r.counts.set(sub.id, 0);
      try { r.socket?.send(encodeReq(sub.id, sub.filters)); } catch { fail(r, null, 'send-failed'); return; }
    }
  }
  function onFrame(r: RelayRec, generation: number, data: unknown): void {
    if (closed || r.generation !== generation || r.state !== 'open') return;
    if (r.scope === null || !r.scope.current()) { fail(r, null, 'revoked'); return; }
    if (typeof data !== 'string') { penalize(r, PENALTY.binary, 'binary-frame'); return; }
    if (!withinBytes(data, FRAME_LIMITS.maxFrameBytes)) { penalize(r, PENALTY.oversized, 'oversized-frame'); return; }
    if (!take(r)) {
      if (r.overloadedWindows >= POOL_LIMITS.overloadWindowsToDisconnect) fail(r, null, 'overload');
      return;
    }
    const parsed = parseRelayFrame(data);
    if (!parsed.ok) { if (parsed.reason !== 'ignored') penalize(r, parsed.reason === 'oversized' ? PENALTY.oversized : PENALTY.malformed, parsed.reason); return; }
    const frame = parsed.frame;
    switch (frame.type) {
      case 'EVENT': {
        const sub = subs.get(frame.subId);
        if (!sub || !r.counts.has(frame.subId)) { penalize(r, PENALTY.wrongSubscription, 'wrong-subscription'); return; }
        if (r.closedSubs.has(frame.subId)) return;
        if (seenIds.has(frame.event.id)) return; // dedupe before any signature work
        if (!matchesFilters(frame.event, sub.filters)) { penalize(r, PENALTY.outsideFilter, 'outside-filter'); return; }
        const count = (r.counts.get(frame.subId) ?? 0) + 1;
        r.counts.set(frame.subId, count);
        if (count > POOL_LIMITS.maxEventsPerSubscription) {
          r.closedSubs.add(frame.subId);
          try { r.socket?.send(encodeClose(frame.subId)); } catch { /* the relay is already misbehaving */ }
          return;
        }
        let valid = false;
        try { valid = options.verifier.verifyEvent(frame.event) === true; } catch { valid = false; }
        if (!valid) { penalize(r, PENALTY.invalidSignature, 'invalid-signature'); return; }
        remember(frame.event.id);
        try { sub.handlers.onEvent(frame.event, r.cfg.endpointId); } catch { /* handler faults are not relay faults */ }
        return;
      }
      case 'EOSE': {
        const sub = subs.get(frame.subId);
        if (!sub || !r.counts.has(frame.subId)) { penalize(r, PENALTY.wrongSubscription, 'wrong-subscription'); return; }
        try { sub.handlers.onEose?.(r.cfg.endpointId); } catch { /* ignore */ }
        return;
      }
      case 'CLOSED': r.closedSubs.add(frame.subId); return; // relay refused or ended it; never auto-resubscribed
      case 'NOTICE': return; // text is never interpreted or surfaced
      case 'OK': penalize(r, PENALTY.unexpected, 'unexpected-ok');
    }
  }
  /** Authorize through G05, capture, and open one socket inside the single-shot scope.run. */
  async function open(r: RelayRec, method: 'read' | 'publish'): Promise<{ socket: RelaySocketLike; scope: TransportScope } | RouteError> {
    const permit: Permit | RouteError = options.broker.authorize({ channel: 'relay', endpointId: r.cfg.endpointId, method });
    if (typeof permit === 'string') return permit;
    let scope: TransportScope | RouteError;
    try { scope = options.broker.capture(permit); } catch { return 'ROUTE_UNAVAILABLE'; }
    if (typeof scope === 'string') return scope;
    const leased = scope;
    // The operation never rejects: a rejected operation would make the broker block the whole adapter.
    const result = await leased.run(signal => new Promise<RelaySocketLike | null>(resolve => {
      let socket: RelaySocketLike | null = null, done = false;
      const finish = (value: RelaySocketLike | null): void => {
        if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort);
        if (value === null && socket) { socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null; try { socket.close(); } catch { /* ignore */ } }
        resolve(value);
      };
      const onAbort = (): void => finish(null);
      const timer = setTimeout(() => finish(null), timing.connectTimeoutMs);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        socket = connect(r.cfg.url, signal);
        socket.onopen = () => finish(socket);
        socket.onclose = () => finish(null);
        socket.onerror = () => finish(null);
      } catch { finish(null); }
    }));
    if (!result.ok) { leased.dispose(); return result.error; }
    if (result.value === null) { leased.dispose(); return 'ROUTE_UNAVAILABLE'; }
    if (!leased.current()) { try { result.value.close(); } catch { /* ignore */ } leased.dispose(); return 'CANCELLED'; }
    return { socket: result.value, scope: leased };
  }
  async function start(r: RelayRec): Promise<void> {
    if (closed) return;
    setState(r, 'connecting'); emitStatus();
    const generation = ++r.generation;
    const opened = await open(r, 'read');
    if (closed || r.generation !== generation) {
      if (typeof opened !== 'string') { try { opened.socket.close(); } catch { /* ignore */ } opened.scope.dispose(); }
      return;
    }
    if (typeof opened === 'string') {
      // Policy refusals are final for this session until an explicit retry: no timers, no direct fallback.
      if (opened === 'POLICY_BLOCKED' || opened === 'INVALID_ENDPOINT') fail(r, 'blocked', opened);
      else fail(r, null, opened);
      return;
    }
    r.socket = opened.socket; r.scope = opened.scope; r.openedAt = clock();
    r.tokens = POOL_LIMITS.burst; r.refilledAt = r.openedAt; r.windowIndex = Math.floor(r.openedAt / POOL_LIMITS.overloadWindowMs); r.windowDropped = 0; r.overloadedWindows = 0;
    setState(r, 'open'); emitStatus();
    const socket = opened.socket;
    socket.onmessage = event => onFrame(r, generation, event.data);
    socket.onclose = () => { if (r.generation === generation && !closed) fail(r, null, 'closed'); };
    socket.onerror = () => { if (r.generation === generation && !closed) fail(r, null, 'error'); };
    opened.scope.signal.addEventListener('abort', () => { if (r.generation === generation && !closed && r.state === 'open') fail(r, null, 'revoked'); }, { once: true });
    sendReq(r);
  }
  function normalize(filters: readonly RelayFilter[]): readonly RelayFilter[] | null {
    if (!Array.isArray(filters) || filters.length < 1 || filters.length > POOL_LIMITS.maxFiltersPerSubscription) return null;
    const wall = options.nowSeconds?.() ?? null;
    const out: RelayFilter[] = [];
    for (const f of filters) {
      if (typeof f !== 'object' || f === null) return null;
      if (!Array.isArray(f.kinds) || f.kinds.length < 1 || f.kinds.length > 8 || !f.kinds.every((k: number) => Number.isSafeInteger(k) && k >= 0 && k <= 65_535)) return null;
      if (!Number.isSafeInteger(f.limit) || f.limit < 1 || f.limit > POOL_LIMITS.maxFilterLimit) return null;
      if (!Number.isSafeInteger(f.since) || f.since < 0) return null;
      if (wall !== null && f.since < wall - (f.kinds.every((k: number) => k === GIFT_WRAP_KIND) ? POOL_LIMITS.maxGiftWrapHistorySeconds : POOL_LIMITS.maxHistorySeconds)) return null;
      const copy: Record<string, unknown> = { kinds: [...f.kinds], since: f.since, limit: f.limit };
      for (const name of ['authors', '#d', '#t', '#k', '#a', '#p'] as const) {
        const list = f[name];
        if (list === undefined) continue;
        if (!Array.isArray(list) || list.length < 1 || list.length > FRAME_LIMITS.maxFilterValues) return null;
        if (!list.every(v => typeof v === 'string' && withinBytes(v, FRAME_LIMITS.maxTagItemBytes) && ((name !== 'authors' && name !== '#p') || isHex64(v)))) return null;
        copy[name] = [...list];
      }
      out.push(Object.freeze(copy) as unknown as RelayFilter);
    }
    return Object.freeze(out);
  }
  function closeSub(id: string): void {
    if (!subs.delete(id)) return;
    for (const r of recs) {
      if (r.state === 'open' && r.counts.delete(id)) { try { r.socket?.send(encodeClose(id)); } catch { /* ignore */ } }
      r.closedSubs.delete(id);
    }
    if (subs.size === 0) for (const r of recs) if (active(r)) { teardown(r); setState(r, 'idle'); r.failures = 0; }
    emitStatus();
  }
  function publishOne(r: RelayRec, event: NostrEvent, signal: AbortSignal | undefined): Promise<PublishResult> {
    const unknown = (): PublishResult => ({ eventId: event.id, relayId: r.cfg.endpointId, status: 'unknown' });
    return (async () => {
      if (r.state === 'banned') return unknown();
      const opened = await open(r, 'publish');
      if (typeof opened === 'string') return unknown();
      const { socket, scope } = opened;
      return new Promise<PublishResult>(resolve => {
        let done = false;
        const finish = (status: PublishResult['status']): void => {
          if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          socket.onmessage = socket.onclose = socket.onerror = null; try { socket.close(); } catch { /* ignore */ }
          scope.dispose(); resolve({ eventId: event.id, relayId: r.cfg.endpointId, status });
        };
        const abort = (): void => finish('unknown');
        const timer = setTimeout(() => finish('unknown'), timing.publishTimeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        socket.onclose = socket.onerror = () => finish('unknown');
        socket.onmessage = message => {
          if (!scope.current()) { finish('unknown'); return; }
          const parsed = typeof message.data === 'string' ? parseRelayFrame(message.data) : null;
          if (parsed?.ok && parsed.frame.type === 'OK' && parsed.frame.eventId === event.id) finish(parsed.frame.accepted ? 'accepted' : 'rejected');
        };
        try { socket.send(encodeEvent(event)); } catch { finish('unknown'); }
      });
    })();
  }
  function status_(): readonly RelayStatus[] { return status(); }
  const pool: RelayPool = {
    subscribe(filters, handlers) {
      if (closed) return refuse('CLOSED');
      const normalized = normalize(filters);
      if (normalized === null) return refuse('INVALID_FILTER');
      if (typeof handlers?.onEvent !== 'function') return refuse('INVALID_FILTER');
      if (subs.size >= POOL_LIMITS.maxSubscriptionsPerRelay) return refuse('LIMIT_EXCEEDED');
      const id = `s${++subCounter}`;
      subs.set(id, { id, filters: normalized, handlers });
      for (const r of recs) if (r.state === 'open') { r.counts.set(id, 0); try { r.socket?.send(encodeReq(id, normalized)); } catch { fail(r, null, 'send-failed'); } }
      fill();
      return { ok: true as const, value: Object.freeze({ id, close: () => closeSub(id) }) };
    },
    async publish(event, signal) {
      if (closed) return refuse('CLOSED');
      const checked = parseEvent(event);
      let valid = false;
      try { valid = checked !== null && options.verifier.verifyEvent(checked) === true; } catch { valid = false; }
      if (checked === null || !valid || signal?.aborted) return refuse('INVALID_FILTER');
      const targets = recs.filter(r => r.state !== 'banned').slice(0, maxActive);
      if (inFlight + targets.length > POOL_LIMITS.maxPublishInFlight) return refuse('LIMIT_EXCEEDED');
      inFlight += targets.length;
      try { return { ok: true as const, value: Object.freeze(await Promise.all(targets.map(r => publishOne(r, checked, signal)))) }; }
      finally { inFlight -= targets.length; }
    },
    retry(endpointId) {
      const r = recs.find(x => x.cfg.endpointId === endpointId);
      if (!r || closed || (r.state !== 'failed' && r.state !== 'blocked')) return;
      r.failures = 0; setState(r, 'idle'); emitStatus(); fill();
    },
    status: status_,
    close() {
      if (closed) return; closed = true;
      for (const r of recs) { teardown(r); setState(r, 'idle'); }
      subs.clear(); seenIds.clear();
    },
  };
  return Object.freeze(pool);
}
