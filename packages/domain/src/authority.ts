/** G08 source separation. Only a configured native-verifying reader may supply chain observations. */
import { CoreSchemaError, parseChainObservation, parseObservationEnvelope, parseTradeBinding, sameBinding, type ChainObservation, type CoreResult, type TradeBinding, type TradeView } from '../../schemas/index.ts';
import { createCoreError, createOperationId, normalizeError } from './errors.ts';

export const RELEASE_ENABLED = 0;
export const DISPLAY_MAX_AGE_MS = 30_000;
export const MAX_PENDING_RECONCILIATIONS = 4;
export interface ReconcileRequest { readonly signal: AbortSignal; readonly generation: number; readonly requestSequence: number; }
export interface TradeAuthorityOptions {
  readonly binding: TradeBinding;
  readonly generation: number;
  readonly walletGeneration: number;
  /** Trust boundary: bundled adapter verifies native chain/deployment identity before returning this result.
   * This injection does not implement or certify those missing adapters. No reader is enabled by default. */
  readonly readValidated: (binding: TradeBinding, request: ReconcileRequest) => Promise<CoreResult<ChainObservation>>;
}
export interface TradeAuthority {
  readonly currentGeneration: number;
  refresh(binding: TradeBinding, signal?: AbortSignal): Promise<CoreResult<ChainObservation>>;
  invalidate(binding: TradeBinding): CoreResult<void>;
  readView(nowMs: number): Readonly<TradeView>;
  readConflict(): { readonly previous: ChainObservation; readonly current: ChainObservation } | null;
  dispatchLocal(event: unknown): 'accepted' | 'duplicate' | 'stale' | 'invalid';
  setFiatClaim(claim: TradeView['fiatClaim']): void;
  economicPreparationAllowed(): false;
  dispose(): void;
}
function safeCounter(input: number): number {
  if (!Number.isSafeInteger(input) || input < 0) throw new CoreSchemaError();
  if (input === Number.MAX_SAFE_INTEGER) throw new CoreSchemaError('LIMIT_EXCEEDED');
  return input;
}
function contradiction(previous: ChainObservation, next: ChainObservation): boolean {
  const priorHeight = BigInt(previous.anchor.height), nextHeight = BigInt(next.anchor.height);
  if (nextHeight < priorHeight || (nextHeight === priorHeight && (previous.anchor.hash !== next.anchor.hash || previous.state !== next.state))) return true;
  const finality = { pending: 0, confirmed: 1, finalized: 2 };
  if (finality[next.finality] < finality[previous.finality]) return true;
  if ((previous.state === 'released' || previous.state === 'refunded') && previous.state !== next.state) return true;
  return previous.state === 'funded' && next.state === 'absent';
}
/** Pure internal reducer: it receives only detached observations from the configured reader, never imported envelopes. */
function reduceVerifiedChain(previous: TradeView, chain: ChainObservation): TradeView {
  return Object.freeze({ ...previous, chain, chainHealth: 'fresh' });
}
export function createTradeAuthority(options: TradeAuthorityOptions): TradeAuthority {
  const binding = parseTradeBinding(options.binding);
  const readValidated = options.readValidated;
  if (typeof readValidated !== 'function') throw new CoreSchemaError();
  let generation = safeCounter(options.generation);
  let view: TradeView = Object.freeze({ binding, chain: null, chainHealth: 'loading', pendingIntentIds: Object.freeze([]), fiatClaim: 'none', walletGeneration: safeCounter(options.walletGeneration) });
  let latestIssued = 0, walletSequence = -1, disposed = false;
  let conflict: { readonly previous: ChainObservation; readonly current: ChainObservation } | null = null;
  const pending = new Set<AbortController>();
  const seen = new Set<string>();
  const failure = (code: Parameters<typeof createCoreError>[0], operationId = createOperationId()): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: true }) });
  const cancelPending = (): void => { for (const controller of pending) controller.abort(); };
  const setHealth = (health: TradeView['chainHealth']): void => { view = Object.freeze({ ...view, chainHealth: health }); };
  const dispose = (): void => { if (disposed) return; disposed = true; cancelPending(); seen.clear(); };
  const invalidate = (input: TradeBinding): CoreResult<void> => {
    if (disposed) return failure('CANCELLED');
    let parsed: TradeBinding;
    try { parsed = parseTradeBinding(input); } catch { return failure('INVALID_INPUT'); }
    if (!sameBinding(binding, parsed)) return failure('WRONG_CHAIN');
    if (generation >= Number.MAX_SAFE_INTEGER - 1) { dispose(); return failure('LIMIT_EXCEEDED'); }
    generation++; latestIssued = 0; walletSequence = -1; seen.clear(); cancelPending();
    setHealth(conflict !== null ? 'reorged' : view.chain === null ? 'loading' : 'stale');
    return { ok: true, value: undefined };
  };
  return Object.freeze({
    get currentGeneration(): number { return generation; },
    async refresh(input: TradeBinding, external?: AbortSignal): Promise<CoreResult<ChainObservation>> {
      const operationId = createOperationId();
      if (disposed || external?.aborted) return failure('CANCELLED', operationId);
      let requested: TradeBinding;
      try { requested = parseTradeBinding(input); } catch { return failure('INVALID_INPUT', operationId); }
      if (!sameBinding(binding, requested)) return failure('WRONG_CHAIN', operationId);
      if (latestIssued >= Number.MAX_SAFE_INTEGER - 1) { dispose(); return failure('LIMIT_EXCEEDED', operationId); }
      // Old readers which ignore abort still consume a bounded slot until their actual promise settles.
      if (pending.size >= MAX_PENDING_RECONCILIATIONS) return failure('LIMIT_EXCEEDED', operationId);
      cancelPending();
      const requestSequence = ++latestIssued, generationAtStart = generation;
      const controller = new AbortController();
      pending.add(controller);
      const onExternalAbort = (): void => controller.abort();
      external?.addEventListener('abort', onExternalAbort, { once: true });
      const isCurrent = (): boolean => !disposed && !controller.signal.aborted && generation === generationAtStart && latestIssued === requestSequence;
      setHealth(conflict !== null ? 'reorged' : view.chain === null ? 'loading' : 'stale');
      let onAbort: (() => void) | undefined;
      let invoked = false;
      try {
        const cancelled = new Promise<CoreResult<ChainObservation>>(resolve => {
          onAbort = (): void => resolve(failure('CANCELLED', operationId));
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        let reading: Promise<CoreResult<ChainObservation>>;
        try { invoked = true; reading = Promise.resolve(readValidated(binding, { signal: controller.signal, generation: generationAtStart, requestSequence })); }
        catch (error) { reading = Promise.resolve({ ok: false, error: normalizeError(error, { operationId, phase: 'read' }) }); }
        const settled = reading.then(result => {
          pending.delete(controller);
          return result;
        }, error => {
          pending.delete(controller);
          return { ok: false as const, error: normalizeError(error, { operationId, phase: 'read' }) };
        });
        const result = await Promise.race([settled, cancelled]);
        if (!isCurrent()) return failure('CANCELLED', operationId);
        // A typed adapter is still a boundary: reject accessor payloads before reading them.
        const ok = Object.getOwnPropertyDescriptor(result, 'ok');
        if (!ok || !('value' in ok) || typeof ok.value !== 'boolean') throw new CoreSchemaError();
        if (ok.value === false) {
          const descriptor = Object.getOwnPropertyDescriptor(result, 'error');
          if (!descriptor || !('value' in descriptor)) throw new CoreSchemaError();
          const error = normalizeError(descriptor.value, { operationId, phase: 'read' });
          setHealth(error.code === 'INTEGRITY_FAILURE' || conflict !== null ? 'reorged' : 'unavailable');
          return { ok: false, error };
        }
        const descriptor = Object.getOwnPropertyDescriptor(result, 'value');
        if (!descriptor || !('value' in descriptor)) throw new CoreSchemaError();
        const observation = parseChainObservation(descriptor.value);
        if (!sameBinding(binding, observation.binding) || observation.generation !== generationAtStart || observation.requestSequence !== requestSequence) throw new CoreSchemaError();
        if (conflict !== null) {
          if (contradiction(conflict.current, observation)) {
            conflict = Object.freeze({ previous: conflict.previous, current: observation }); setHealth('reorged');
          } else { conflict = null; view = reduceVerifiedChain(view, observation); }
        } else if (view.chain !== null && contradiction(view.chain, observation)) {
          conflict = Object.freeze({ previous: view.chain, current: observation }); setHealth('reorged');
        } else view = reduceVerifiedChain(view, observation);
        return conflict !== null ? failure('INTEGRITY_FAILURE', operationId) : { ok: true, value: observation };
      } catch {
        if (!isCurrent()) return failure('CANCELLED', operationId);
        setHealth('reorged'); return failure('INTEGRITY_FAILURE', operationId);
      } finally {
        if (!invoked) pending.delete(controller);
        if (onAbort !== undefined) controller.signal.removeEventListener('abort', onAbort);
        external?.removeEventListener('abort', onExternalAbort);
      }
    },
    invalidate,
    readView(nowMs: number): Readonly<TradeView> {
      if (view.chainHealth !== 'fresh' || view.chain === null) return view;
      const age = nowMs - view.chain.observedAt;
      return !Number.isSafeInteger(nowMs) || age < 0 || age >= DISPLAY_MAX_AGE_MS ? Object.freeze({ ...view, chainHealth: 'stale' }) : view;
    },
    readConflict: () => conflict,
    dispatchLocal(input: unknown): 'accepted' | 'duplicate' | 'stale' | 'invalid' {
      if (disposed) return 'stale';
      let event;
      try { event = parseObservationEnvelope(input); } catch { return 'invalid'; }
      // A caller-supplied source string is never evidence that an adapter verified chain state.
      if (event.source !== 'wallet') return 'invalid';
      if (!sameBinding(binding, event.binding) || event.generation !== generation) return 'stale';
      if (seen.has(event.eventId)) return 'duplicate';
      if (event.sequence <= walletSequence || event.data.walletGeneration <= view.walletGeneration) return 'stale';
      if (event.sequence === Number.MAX_SAFE_INTEGER || event.data.walletGeneration === Number.MAX_SAFE_INTEGER) { dispose(); return 'invalid'; }
      const invalidated = invalidate(binding);
      if (!invalidated.ok) return 'invalid';
      walletSequence = event.sequence;
      seen.add(event.eventId);
      if (seen.size > 4096) seen.delete(seen.values().next().value!);
      view = Object.freeze({ ...view, walletGeneration: event.data.walletGeneration });
      return 'accepted';
    },
    setFiatClaim(claim: TradeView['fiatClaim']): void {
      if (disposed) return;
      if (claim !== 'none' && claim !== 'buyer-claims-paid' && claim !== 'seller-attests-received') throw new CoreSchemaError();
      view = Object.freeze({ ...view, fiatClaim: claim });
    },
    economicPreparationAllowed: (): false => false,
    dispose,
  });
}
