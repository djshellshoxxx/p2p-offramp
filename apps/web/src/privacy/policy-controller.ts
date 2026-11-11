/** Document-side selection lifecycle. The only authority is the same Worker's purpose-specific scalar commands. */
import {
  MAX_TRANSPORT_SELECTION_GENERATION, parseRuntimeTransportSelection, parseRuntimeSelectTransportMode, runtimeFailure,
  type RuntimeTransportSelection, type RuntimeSelectTransportMode, type RuntimeResult, type RuntimeErrorCode, type TransportMode,
} from '../../../../packages/schemas/index.ts';

export interface TransportPolicyPort {
  selectionScope(): number;
  subscribe(listener: () => void): () => void;
  getTransportSelection(): Promise<RuntimeResult<RuntimeTransportSelection>>;
  selectTransportMode(input: RuntimeSelectTransportMode): Promise<RuntimeResult<RuntimeTransportSelection>>;
}
export interface PrivacyPolicyState {
  readonly phase: 'unavailable' | 'loading' | 'ready' | 'applying' | 'error';
  readonly selection: RuntimeTransportSelection | null;
  readonly proposedMode: TransportMode | null;
  readonly ordinaryConsent: boolean;
  readonly error: RuntimeErrorCode | null;
}
export interface PrivacyPolicyController {
  getSnapshot(): PrivacyPolicyState;
  subscribe(listener: () => void): () => void;
  /** Restartable effect lease; cleanup discards old replies but retains held command capacity. */
  activate(): () => void;
  refresh(): Promise<RuntimeResult<RuntimeTransportSelection>>;
  choose(mode: TransportMode): void;
  acknowledgeOrdinary(consent: boolean): void;
  apply(): Promise<RuntimeResult<RuntimeTransportSelection>>;
}
const initial = (): PrivacyPolicyState => Object.freeze({ phase: 'unavailable', selection: null, proposedMode: null, ordinaryConsent: false, error: null });
function data(input: unknown, key: string): unknown {
  if (typeof input !== 'object' || input === null) throw Error();
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor || !('value' in descriptor)) throw Error();
  return descriptor.value;
}
function result(input: unknown): RuntimeResult<RuntimeTransportSelection> {
  const ok = data(input, 'ok');
  if (ok === true) return Object.freeze({ ok: true, value: parseRuntimeTransportSelection(data(input, 'value')) });
  if (ok !== false) throw Error();
  const code = data(data(input, 'error'), 'code');
  if (code === 'LOCKED' || code === 'BUSY' || code === 'CONFLICT' || code === 'CANCELLED' || code === 'INVALID_INPUT' || code === 'TIMEOUT' || code === 'LIMIT_EXCEEDED') return runtimeFailure(code);
  return runtimeFailure('PROTOCOL_ERROR');
}
export function createPrivacyPolicyController(port: TransportPolicyPort | null, expectedScope?: number): PrivacyPolicyController {
  let state = initial(), active = false, ready = false, lease = 0, revision = 0, scope: number | undefined;
  let checking = false, queued = false, notifying = false, wanted = false, readQueued = false;
  let notificationDirty = false, activeObserver: (() => void) | undefined;
  let pending: object | undefined, lastGeneration = -1, compiledChannels: string | undefined;
  const observers = new Set<() => void>();
  const batchMutators = new Set<() => void>();
  const notify = (): void => {
    if (notifying) {
      notificationDirty = true;
      if (activeObserver) batchMutators.add(activeObserver);
      return;
    }
    if (queued || !observers.size) return;
    queued = true;
    queueMicrotask(() => {
      queued = false; notifying = true;
      // Same bounded catch-up as the actual broker: each dirty pass excludes a new mutator.
      // Stable observers see the final state; the initial cohort never grows within the batch.
      const eligible = [...observers]; batchMutators.clear();
      try {
        do {
          notificationDirty = false;
          for (const observer of eligible) {
            if (!observers.has(observer) || batchMutators.has(observer)) continue;
            activeObserver = observer;
            try { observer(); } catch { /* Hints cannot prevent other readers. */ }
            finally { activeObserver = undefined; }
          }
        } while (notificationDirty);
      } finally { activeObserver = undefined; batchMutators.clear(); notifying = false; }
    });
  };
  const publish = (phase: PrivacyPolicyState['phase'], selection: RuntimeTransportSelection | null = null, proposedMode: TransportMode | null = null, ordinaryConsent = false, error: RuntimeErrorCode | null = null): void => {
    state = Object.freeze({ phase, selection, proposedMode, ordinaryConsent, error }); notify();
  };
  const unavailable = (error: RuntimeErrorCode): void => { revision++; ready = false; wanted = false; publish('unavailable', null, null, false, error); };
  const schedule = (): void => {
    if (readQueued || pending || !active || !ready || !wanted) return;
    readQueued = true;
    queueMicrotask(() => { readQueued = false; if (active && ready && wanted && !pending) { wanted = false; void refresh(); } });
  };
  const changed = (): void => {
    if (!active || !ready) return;
    if (checking) { unavailable('PROTOCOL_ERROR'); return; }
    revision++; wanted = true; publish('loading');
    if (ready) schedule();
  };
  const currentScope = (): boolean => {
    if (!active || !ready || !port || checking) return false;
    const mine = lease, version = revision;
    checking = true;
    let observed: number;
    try { observed = port.selectionScope(); }
    catch { unavailable('PROTOCOL_ERROR'); return false; }
    finally { checking = false; }
    if (!active || !ready || lease !== mine || revision !== version) return false;
    if (!Number.isSafeInteger(observed) || Object.is(observed, -0) || observed < 0 || observed > MAX_TRANSPORT_SELECTION_GENERATION) { unavailable('PROTOCOL_ERROR'); return false; }
    if (expectedScope !== undefined && observed !== expectedScope) { unavailable('LOCKED'); return false; }
    if (scope !== undefined && scope !== observed) { scope = observed; changed(); return false; }
    scope = observed; return true;
  };
  const current = (mine: number, version: number, ownerScope: number): boolean => currentScope() && lease === mine && revision === version && scope === ownerScope;
  async function run(input?: RuntimeSelectTransportMode): Promise<RuntimeResult<RuntimeTransportSelection>> {
    if (pending) return runtimeFailure('BUSY');
    if (!currentScope() || !port || scope === undefined) return runtimeFailure('LOCKED');
    const mine = lease, version = revision, ownerScope = scope, token = {};
    pending = token; wanted = false;
    const prior = state.selection;
    if (input) publish('applying', prior, input.mode); else publish('loading');
    try {
      const raw = await (input ? port.selectTransportMode(input) : port.getTransportSelection());
      if (!current(mine, version, ownerScope)) return runtimeFailure('CANCELLED');
      let checked: RuntimeResult<RuntimeTransportSelection>;
      checking = true;
      try { checked = result(raw); } finally { checking = false; }
      if (!current(mine, version, ownerScope)) return runtimeFailure('CANCELLED');
      if (checked.ok) {
        const selected = checked.value, channels = selected.brokeredChannels.join(',');
        const expected = input ? input.expectedBrokerGeneration + (prior?.mode === input.mode ? 0 : 1) : selected.brokerGeneration;
        if (selected.brokerGeneration < lastGeneration || (compiledChannels !== undefined && channels !== compiledChannels) ||
            (input && (selected.mode !== input.mode || selected.brokerGeneration !== expected))) throw Error();
        lastGeneration = selected.brokerGeneration; compiledChannels = channels;
        publish('ready', selected, selected.mode);
      } else publish(checked.error.code === 'LOCKED' ? 'unavailable' : 'error', null, null, false, checked.error.code);
      return checked;
    } catch {
      if (!current(mine, version, ownerScope)) return runtimeFailure('CANCELLED');
      publish('error', null, null, false, 'PROTOCOL_ERROR'); return runtimeFailure('PROTOCOL_ERROR');
    } finally { if (pending === token) pending = undefined; schedule(); }
  }
  function refresh(): Promise<RuntimeResult<RuntimeTransportSelection>> { return run(); }
  return Object.freeze({
    getSnapshot(): PrivacyPolicyState { if (active && ready) currentScope(); return state; },
    subscribe(listener: () => void): () => void {
      if (typeof listener !== 'function') throw new TypeError('INVALID_INPUT');
      if (!observers.has(listener) && observers.size >= 64) throw new RangeError('LIMIT_EXCEEDED');
      observers.add(listener); return () => { observers.delete(listener); };
    },
    activate(): () => void {
      if (active) return () => undefined;
      active = true; ready = false; const mine = ++lease; revision++; scope = undefined;
      let off: (() => void) | undefined;
      const stop = (): void => {
        if (!active || lease !== mine) return;
        active = false; ready = false; wanted = false; lease++; revision++; scope = undefined;
        const close = off; off = undefined; publish('unavailable');
        try { close?.(); } catch { /* A released owner cannot publish again. */ }
      };
      if (port) {
        try {
          const unsubscribe = port.subscribe(() => { if (active && lease === mine) changed(); });
          if (typeof unsubscribe !== 'function') throw Error();
          if (!active || lease !== mine) { try { unsubscribe(); } catch { /* Lease already retired. */ } return stop; }
          off = unsubscribe; ready = true;
          if (currentScope()) { wanted = true; publish('loading'); schedule(); }
        } catch { if (active && lease === mine) unavailable('LOCKED'); }
      }
      return stop;
    },
    refresh,
    choose(mode: TransportMode): void {
      if (!currentScope() || pending || state.phase !== 'ready' || !state.selection || (mode !== 'ordinary' && mode !== 'strict')) return;
      publish('ready', state.selection, mode);
    },
    acknowledgeOrdinary(consent: boolean): void {
      if (!currentScope() || pending || state.phase !== 'ready' || !state.selection) return;
      publish('ready', state.selection, state.proposedMode, consent === true && state.selection.mode === 'strict' && state.proposedMode === 'ordinary');
    },
    apply(): Promise<RuntimeResult<RuntimeTransportSelection>> {
      if (pending) return Promise.resolve(runtimeFailure('BUSY'));
      if (!currentScope() || state.phase !== 'ready' || !state.selection || !state.proposedMode) return Promise.resolve(runtimeFailure('LOCKED'));
      if (state.selection.mode === 'strict' && state.proposedMode === 'ordinary' && !state.ordinaryConsent) return Promise.resolve(runtimeFailure('INVALID_INPUT'));
      const input = parseRuntimeSelectTransportMode({ mode: state.proposedMode, expectedBrokerGeneration: state.selection.brokerGeneration, ordinaryConsent: state.ordinaryConsent });
      return run(input);
    },
  });
}
