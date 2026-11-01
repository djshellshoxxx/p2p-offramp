/** Partial G22 terminal-receipt projection over the existing private G08/G12 join.
 * This is not a journey reducer, imported-observation parser or payment gate.
 * Setup/backup completion, wallet/discovery state, verified immutable terms and
 * G18 matching funding/time-buffer evidence are not provided by TradeComposition.
 */
import { parseTradeBinding, parseChainObservation, sameBinding, type TradeBinding, type CoreResult } from '../../schemas/index.ts';
import type { TradeComposition, TradeDiagnosticView } from './trade-composition.ts';
import { createCoreError, createOperationId, normalizeError } from './errors.ts';

export type JourneyStep = 'setup' | 'backup' | 'wallet' | 'discover' | 'terms' | 'funding' |
  'funding-uncertain' | 'payment-coordination' | 'release' | 'refund' | 'receipt';
export type JourneyAuthority = 'local' | 'relay' | 'chain-provisional' | 'chain-finalized';
export type JourneyBlocker = 'chain-loading' | 'chain-stale' | 'chain-unavailable' | 'chain-reorged' |
  'reconcile-required' | 'finality-required' | 'journey-prerequisites-unavailable';
interface Common {
  readonly binding: TradeBinding;
  readonly authority: JourneyAuthority;
  readonly actions: readonly [];
  readonly economicPreparationAllowed: false;
  /** Recovery must remain offered with this original binding. This is guidance,
   * not a claim that a configured exporter/reader or spending capability exists. */
  readonly recoveryAvailable: true;
}
export interface JourneyView extends Common { readonly step: JourneyStep; readonly blockingReason: null; }
export type JourneyProjection = Readonly<{ readonly kind: 'resolved'; readonly view: Readonly<JourneyView> }> |
  Readonly<Common & { readonly kind: 'blocked'; readonly step: null; readonly blockingReason: JourneyBlocker }>;
export interface JourneyProjectionService {
  read(signal?: AbortSignal): Promise<CoreResult<JourneyProjection>>;
  /** Cancels owned reads only; the underlying composition retains its lifetime. */
  dispose(): void;
}
const actions = Object.freeze([]) as readonly [];
function project(source: TradeDiagnosticView): JourneyProjection {
  const binding = parseTradeBinding(source.binding);
  const chain = source.chain === null ? null : parseChainObservation(source.chain);
  if (source.economicPreparationAllowed !== false || chain && !sameBinding(binding, chain.binding)) throw new Error();
  const health = source.chainHealth;
  if (!['loading', 'fresh', 'stale', 'unavailable', 'reorged'].includes(health) || !Array.isArray(source.pendingIntentIds)) throw new Error();
  const authority: JourneyAuthority = health !== 'fresh' || !chain ? 'local' : chain.finality === 'finalized' ? 'chain-finalized' : 'chain-provisional';
  const common = { binding, authority, actions, economicPreparationAllowed: false as const, recoveryAvailable: true as const };
  const blocked = (blockingReason: JourneyBlocker): JourneyProjection => Object.freeze({ ...common, kind: 'blocked', step: null, blockingReason });
  // Chain health vetoes historical terminal labels. Intent uncertainty is never
  // labelled funding-uncertain: IDs alone do not identify the pending action.
  if (health !== 'fresh') return blocked(`chain-${health}`);
  if (source.pendingIntentIds.length) return blocked('reconcile-required');
  if (!chain) return blocked('journey-prerequisites-unavailable');
  if (chain.finality !== 'finalized') return blocked('finality-required');
  if (chain.state === 'released' || chain.state === 'refunded') {
    return Object.freeze({ kind: 'resolved', view: Object.freeze({ ...common, step: 'receipt', blockingReason: null }) });
  }
  // Finalized funding alone cannot establish matching signed terms, safety
  // buffer, fiat receipt or an allowed release/refund action.
  return blocked('journey-prerequisites-unavailable');
}
/** Trusted private service dependency; passing an arbitrary object is not authority.
 * The existing composition owns G08 freshness/generation and G12 reconciliation.
 * No snapshots, intent IDs, fiat claims or raw errors are retained in this seam. */
export function createJourneyProjection({ composition }: { readonly composition: Pick<TradeComposition, 'read'> }): JourneyProjectionService {
  let active: AbortController | undefined, disposed = false;
  return Object.freeze({
    async read(external?: AbortSignal): Promise<CoreResult<JourneyProjection>> {
      const operationId = createOperationId();
      const cancelled = (): CoreResult<never> => ({ ok: false, error: createCoreError('CANCELLED', { operationId, readOnly: true }) });
      if (disposed || external?.aborted) return cancelled();
      const controller = new AbortController(), previous = active; active = controller;
      const abort = () => controller.abort(); external?.addEventListener('abort', abort, { once: true });
      if (external?.aborted) abort();
      const current = () => !disposed && active === controller && !controller.signal.aborted;
      try {
        previous?.abort();
        if (!current()) return cancelled();
        const result = await composition.read(controller.signal);
        if (!current()) return cancelled();
        if (!result.ok) return { ok: false, error: normalizeError(result.error, { operationId, phase: 'read' }) };
        const projection = project(result.value);
        return current() ? { ok: true, value: projection } : cancelled();
      } catch (error) {
        return !current() ? cancelled() : { ok: false, error: normalizeError(error, { operationId, phase: 'read' }) };
      } finally {
        external?.removeEventListener('abort', abort);
        if (active === controller) active = undefined;
      }
    },
    dispose(): void { disposed = true; active?.abort(); active = undefined; },
  });
}
