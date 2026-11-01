/** Partial G22 receipt/payment-coordination projection over the private G08/G12 join.
 * This is not a journey reducer, imported-observation parser or payment gate.
 * Setup/backup completion, wallet/discovery state, verified immutable terms and
 * G18 matching funding/time-buffer evidence are not provided by TradeComposition.
 */
import { parseTradeBinding, parseChainObservation, sameBinding, type TradeBinding, type ChainObservation, type CoreResult } from '../../schemas/index.ts';
import type { TradeComposition, TradeDiagnosticView } from './trade-composition.ts';
import { createCoreError, createOperationId, normalizeError } from './errors.ts';

export type JourneyStep = 'setup' | 'backup' | 'wallet' | 'discover' | 'terms' | 'funding' |
  'funding-uncertain' | 'payment-coordination' | 'release' | 'refund' | 'receipt';
export type JourneyAuthority = 'local' | 'relay' | 'chain-provisional' | 'chain-finalized';
export type JourneyBlocker = 'chain-loading' | 'chain-stale' | 'chain-unavailable' | 'chain-reorged' |
  'reconcile-required' | 'finality-required' | 'journey-prerequisites-unavailable' |
  'payment-guidance-unavailable' | 'payment-guidance-blocked' | 'payment-guidance-mismatch' | 'scope-changed';
/** Minimal projection of the trusted native G18 service. Extra native fields are not copied.
 * A callback around imported JSON is not a native verifier. This seam does not authenticate
 * negotiation signatures, fiat receipt or spending consent, nor implement the G18 safety gate.
 */
export interface JourneyPaymentGuidanceObservation {
  readonly evidence: 'native-rpc'; readonly economicPreparationAllowed: false;
  readonly binding: TradeBinding; readonly termsHash: string; readonly finalizedAnchor: string;
  readonly decision: 'allow-guidance' | 'block';
  readonly reason: 'ok' | 'unfunded' | 'stale' | 'mismatch' | 'near-expiry';
}
export interface JourneyPaymentGuidancePort {
  read(signal?: AbortSignal): Promise<CoreResult<JourneyPaymentGuidanceObservation>>;
  view(): CoreResult<JourneyPaymentGuidanceObservation>;
}
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
function blocked(source: Extract<JourneyProjection, { kind: 'blocked' }>, blockingReason: JourneyBlocker): JourneyProjection {
  return Object.freeze({ ...source, blockingReason });
}
function funded(source: TradeDiagnosticView): { binding: TradeBinding; chain: ChainObservation; walletGeneration: number } | null {
  const binding = parseTradeBinding(source.binding), chain = source.chain === null ? null : parseChainObservation(source.chain);
  const walletGeneration = source.walletGeneration;
  if (!Number.isSafeInteger(walletGeneration) || walletGeneration < 0) throw new Error();
  return source.chainHealth === 'fresh' && source.pendingIntentIds.length === 0 && chain?.state === 'funded' && chain.finality === 'finalized' && binding.chain === 'evm' && sameBinding(binding, chain.binding) ? { binding, chain, walletGeneration } : null;
}
function guidance(input: unknown): JourneyPaymentGuidanceObservation {
  // Native service results have more fields than this seam needs. Read only required own
  // data descriptors; accessors and inherited properties cannot run during the final check.
  const field = (key: string): unknown => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw new Error();
    return descriptor.value;
  };
  if (field('evidence') !== 'native-rpc' || field('economicPreparationAllowed') !== false) throw new Error();
  const binding = parseTradeBinding(field('binding')), termsHash = field('termsHash'), finalizedAnchor = field('finalizedAnchor');
  const decision = field('decision'), reason = field('reason');
  if (binding.chain !== 'evm' || typeof termsHash !== 'string' || termsHash.length !== 64 || !/^[0-9a-f]{64}$/.test(termsHash) || termsHash !== binding.tradeId ||
    typeof finalizedAnchor !== 'string' || finalizedAnchor.length !== 66 || !/^0x[0-9a-f]{64}$/.test(finalizedAnchor) ||
    (decision !== 'allow-guidance' && decision !== 'block') || !['ok', 'unfunded', 'stale', 'mismatch', 'near-expiry'].includes(reason as string) ||
    (decision === 'allow-guidance') !== (reason === 'ok')) throw new Error();
  return Object.freeze({ evidence: 'native-rpc', economicPreparationAllowed: false, binding, termsHash, finalizedAnchor, decision, reason: reason as JourneyPaymentGuidanceObservation['reason'] });
}
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
export function createJourneyProjection({ composition, paymentGuidance }: { readonly composition: Pick<TradeComposition, 'read'>; readonly paymentGuidance?: JourneyPaymentGuidancePort }): JourneyProjectionService {
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
        if (!current()) return cancelled();
        const initial = projection.kind === 'blocked' && paymentGuidance ? funded(result.value) : null;
        if (!current()) return cancelled();
        if (!initial || !paymentGuidance || projection.kind !== 'blocked') return { ok: true, value: projection };
        let gateRead: JourneyPaymentGuidanceObservation | undefined;
        let gateFailure: JourneyBlocker = 'payment-guidance-unavailable';
        try {
          const gate = await paymentGuidance.read(controller.signal);
          if (!current()) return cancelled();
          if (gate.ok) {
            try { gateRead = guidance(gate.value); } catch { gateFailure = 'payment-guidance-mismatch'; }
          }
        } catch { /* Fixed unavailable blocker; raw native errors are never exposed. */ }
        if (!current()) return cancelled();
        // Reconcile the original G08/G12 services after the asynchronous native read, even
        // when it failed: a now-finalized receipt must not depend on payment availability.
        const latest = await composition.read(controller.signal);
        if (!current()) return cancelled();
        if (!latest.ok) return { ok: false, error: normalizeError(latest.error, { operationId, phase: 'read' }) };
        const finalProjection = project(latest.value);
        if (!current()) return cancelled();
        if (!sameBinding(initial.binding, finalProjection.kind === 'resolved' ? finalProjection.view.binding : finalProjection.binding)) return { ok: true, value: blocked(projection, 'scope-changed') };
        if (finalProjection.kind === 'resolved' || finalProjection.blockingReason !== 'journey-prerequisites-unavailable') return current() ? { ok: true, value: finalProjection } : cancelled();
        const final = funded(latest.value);
        if (!current()) return cancelled();
        let output: JourneyProjection = finalProjection;
        if (!final || initial.walletGeneration !== final.walletGeneration || initial.chain.generation !== final.chain.generation ||
          initial.chain.anchor.height !== final.chain.anchor.height || initial.chain.anchor.hash !== final.chain.anchor.hash) output = blocked(finalProjection, 'scope-changed');
        else if (!gateRead) output = blocked(finalProjection, gateFailure);
        else {
          try {
            // view() owns G18 monotonic freshness and native/wallet scope invalidation.
            // No await follows this last inspection. No 900-second or native logic is duplicated.
            const gate = paymentGuidance.view();
            if (!current()) return cancelled();
            if (!gate.ok) output = blocked(finalProjection, 'payment-guidance-unavailable');
            else {
              const live = guidance(gate.value);
              const matches = [gateRead, live].every(item => sameBinding(final.binding, item.binding) && item.termsHash === final.binding.tradeId && item.finalizedAnchor === final.chain.anchor.hash);
              if (!matches) output = blocked(finalProjection, 'payment-guidance-mismatch');
              else if (gateRead.decision !== 'allow-guidance' || live.decision !== 'allow-guidance') output = blocked(finalProjection, 'payment-guidance-blocked');
              else {
                const { kind: _kind, step: _step, blockingReason: _reason, ...common } = finalProjection;
                output = Object.freeze({ kind: 'resolved', view: Object.freeze({ ...common, step: 'payment-coordination', blockingReason: null }) });
              }
            }
          } catch { output = blocked(finalProjection, 'payment-guidance-mismatch'); }
        }
        return current() ? { ok: true, value: output } : cancelled();
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
