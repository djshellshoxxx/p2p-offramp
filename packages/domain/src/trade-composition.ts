/** Private diagnostic join of existing G08/G12 services, never economic authority.
 * Ports are configured worker-private services, not imported/UI observations.
 * Own this helper's lifetime alongside its services; dispose does not dispose them.
 */
import { parseTradeBinding, parseIntentAccount, sameBinding, type TradeBinding, type TradeView, type CoreResult, type CoreErrorCode } from '../../schemas/index.ts';
import type { TradeAuthority } from './authority.ts';
import type { IntentJournal } from './intent-journal.ts';
import { createCoreError, createOperationId, normalizeError } from './errors.ts';

export interface TradeCompositionOptions {
  readonly binding: TradeBinding;
  readonly account: string;
  readonly authority: Pick<TradeAuthority, 'currentGeneration' | 'readView'>;
  readonly journal: Pick<IntentJournal, 'unresolved'>;
  readonly now?: () => number;
}
export type TradeDiagnosticView = Readonly<TradeView & { readonly economicPreparationAllowed: false }>;
export interface TradeComposition {
  read(signal?: AbortSignal): Promise<CoreResult<TradeDiagnosticView>>;
  dispose(): void;
}

/** No cached view/intent payloads, reducer, retry, reservation mutation or wallet surface. */
export function createTradeComposition(options: TradeCompositionOptions): TradeComposition {
  const binding = parseTradeBinding(options.binding), account = parseIntentAccount(options.account, binding.chain);
  const authority = options.authority, journal = options.journal, now = options.now ?? Date.now;
  let active: AbortController | undefined, disposed = false;
  return Object.freeze({
    async read(external?: AbortSignal): Promise<CoreResult<TradeDiagnosticView>> {
      const operationId = createOperationId();
      const failure = (code: CoreErrorCode): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: true }) });
      if (disposed || external?.aborted) return failure('CANCELLED');
      const controller = new AbortController(), previous = active; active = controller;
      const abort = (): void => controller.abort();
      external?.addEventListener('abort', abort, { once: true });
      if (external?.aborted) abort();
      try {
        // Abort callbacks may cancel this request or start a newer read synchronously.
        previous?.abort();
        if (disposed || active !== controller || controller.signal.aborted) return failure('CANCELLED');
        const generation = authority.currentGeneration, initial = authority.readView(now());
        if (!sameBinding(binding, initial.binding)) return failure('WRONG_CHAIN');
        const current = (): boolean => !disposed && active === controller && !controller.signal.aborted && authority.currentGeneration === generation;
        const result = await journal.unresolved(binding, account, controller.signal);
        if (!current()) return failure('CANCELLED');
        if (!result.ok) return { ok: false, error: normalizeError(result.error, { operationId, phase: 'read' }) };
        const view = authority.readView(now());
        if (!current() || view.walletGeneration !== initial.walletGeneration) return failure('CANCELLED');
        if (!sameBinding(binding, view.binding)) return failure('WRONG_CHAIN');
        return { ok: true, value: Object.freeze({ ...view,
          pendingIntentIds: Object.freeze(result.value.map(intent => intent.intentId)), economicPreparationAllowed: false }) };
      } catch (error) {
        return disposed || active !== controller || controller.signal.aborted ? failure('CANCELLED') :
          { ok: false, error: normalizeError(error, { operationId, phase: 'read' }) };
      } finally {
        external?.removeEventListener('abort', abort);
        if (active === controller) active = undefined;
      }
    },
    dispose(): void { disposed = true; active?.abort(); active = undefined; },
  });
}
