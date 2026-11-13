/** CTX02 readonly hints. No chain state, wallet consent, reservation mutation or imported-event dispatch. */
import { parseTradeBinding, parseRelayOrderHint, parseJournalPendingHint, type TradeBinding, type RelayOrderHint, type JournalPendingHint } from '../../schemas/index.ts';
export const OBSERVATION_TTL_MS = 30_000;
export const MAX_HINT_OBSERVERS = 64;
interface Timed<T> { readonly value: T; readonly observedAt: number; readonly expiresAt: number; readonly sequence: number; }
export interface ContextHintSnapshot {
  readonly binding: TradeBinding; readonly generation: number; readonly retired: boolean;
  readonly relay: Timed<RelayOrderHint> | null; readonly journal: Timed<JournalPendingHint> | null;
}
/** Constructor-issued closures, held only by the bundled native adapter. JSON/source labels cannot publish. */
export interface ContextHintPublisher {
  current(): boolean;
  relay(value: RelayOrderHint): boolean;
  journal(value: JournalPendingHint): boolean;
  retire(): void;
}
export interface ObservationDispatcher {
  inspect(): ContextHintSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
export interface ObservationDispatcherOptions {
  readonly binding: TradeBinding; readonly orderId: string; readonly maker: string;
  readonly connect: (publisher: ContextHintPublisher) => () => void;
  readonly now?: () => number;
}
export function createObservationDispatcher(options: ObservationDispatcherOptions): ObservationDispatcher {
  const binding = parseTradeBinding(options.binding), clock = options.now ?? Date.now;
  // Reuse the exact hint parser for pinned identities before invoking any source callback.
  const pin = parseRelayOrderHint({ orderId: options.orderId, maker: options.maker, advertisement: null, reason: 'unknown' });
  const listeners = new Set<() => void>();
  let relay: Timed<RelayOrderHint> | null = null, journal: Timed<JournalPendingHint> | null = null;
  let retired = false, generation = 0, sequence = 0, lastTime = -Infinity;
  let disconnect = (): void => undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let queued = false, notifying = false, closedNotifying = false, dirty = false, active: (() => void) | undefined;
  const mutators = new Set<() => void>();
  const notify = (): void => {
    if (notifying) { dirty = true; if (active) mutators.add(active); return; }
    if (queued) return; queued = true;
    queueMicrotask(() => {
      queued = false; notifying = true; mutators.clear();
      const cohort = [...listeners];
      try {
        do {
          dirty = false;
          for (const listener of cohort) {
            if (!listeners.has(listener) || mutators.has(listener)) continue;
            active = listener; try { listener(); } catch { /* Hints never depend on listener cooperation. */ } finally { active = undefined; }
          }
        } while (dirty && cohort.some(listener => listeners.has(listener) && !mutators.has(listener)));
      } finally { notifying = false; active = undefined; mutators.clear(); if (retired) listeners.clear(); }
    });
  };
  const stop = (): void => {
    if (retired) return;
    retired = true; generation++; relay = journal = null;
    if (timer !== undefined) clearTimeout(timer); timer = undefined;
    try { disconnect(); } catch { /* Finish all local revocation before external cleanup. */ }
    disconnect = () => undefined; notify();
  };
  const time = (): number | null => {
    if (retired) return null;
    try { const now = clock(); if (retired) return null; if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - OBSERVATION_TTL_MS || now < lastTime) throw Error(); lastTime = now; return now; }
    catch { stop(); return null; }
  };
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer); timer = undefined;
    if (retired) return;
    const deadlines = [relay?.expiresAt, journal?.expiresAt].filter((value): value is number => value !== undefined);
    if (!deadlines.length) return;
    const now = time(); if (now === null || retired) return;
    timer = setTimeout(expire, Math.max(0, Math.min(...deadlines) - now));
  };
  function expire(): void {
    if (retired) return;
    if (timer !== undefined) clearTimeout(timer); timer = undefined;
    const now = time(); if (now === null || retired) return;
    let changed = false;
    if (relay && relay.expiresAt <= now) { relay = null; changed = true; }
    if (journal && journal.expiresAt <= now) { journal = null; changed = true; }
    if (changed) notify(); schedule();
  }
  const stamp = <T>(value: T, expiresAt: number): Timed<T> | null => {
    const now = time(); if (now === null || retired || expiresAt <= now) return null;
    if (sequence >= Number.MAX_SAFE_INTEGER - 1) { stop(); return null; }
    return Object.freeze({ value, observedAt: now, expiresAt, sequence: ++sequence });
  };
  const publisher: ContextHintPublisher = Object.freeze({
    current: () => { if (retired) return false; const now = time(); return !retired && now !== null; },
    relay(input: RelayOrderHint): boolean {
      if (retired) return false;
      try {
        const value = parseRelayOrderHint(input), now = time();
        if (now === null || value.orderId !== pin.orderId || value.maker !== pin.maker) return false;
        const expires = Math.min(now + OBSERVATION_TTL_MS, value.advertisement ? Number(value.advertisement.expiresAtSeconds) * 1000 : Infinity);
        const next = stamp(value, expires); if (!next) return false;
        relay = next; schedule(); if (retired) return false; notify(); return !retired;
      } catch { return false; }
    },
    journal(input: JournalPendingHint): boolean {
      if (retired) return false;
      try { const value = parseJournalPendingHint(input), now = time(); if (now === null) return false;
        const next = stamp(value, now + OBSERVATION_TTL_MS); if (!next) return false;
        journal = next; schedule(); if (retired) return false; notify(); return !retired;
      } catch { return false; }
    },
    retire: stop,
  });
  try {
    const close = options.connect(publisher);
    if (typeof close !== 'function') throw Error();
    if (retired) { try { close(); } catch { /* Closed during synchronous setup. */ } } else disconnect = close;
  } catch { stop(); }
  return Object.freeze({
    inspect(): ContextHintSnapshot { expire(); return Object.freeze({ binding, generation, retired, relay, journal }); },
    subscribe(listener: () => void): () => void {
      if (typeof listener !== 'function') throw Error('Invalid observation listener.');
      if (retired) {
        if (!closedNotifying) { closedNotifying = true; try { listener(); } catch { /* Closed hint only. */ } finally { closedNotifying = false; } }
        return () => undefined;
      }
      if (listeners.size >= MAX_HINT_OBSERVERS) throw Error('Observation listener limit reached.');
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    dispose: stop,
  });
}
