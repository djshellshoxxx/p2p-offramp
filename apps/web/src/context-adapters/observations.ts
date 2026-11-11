/** Bundled native CTX02 source composition. Not imported configuration or a custody/approval interface. */
import { createObservationDispatcher, createCoreError, createOperationId, type ObservationDispatcher, type ContextHintPublisher, type ContextHintSnapshot } from '../../../../packages/domain/index.ts';
import { createOrderBook, adKey, AD_KIND, DELETION_KIND, AD_D_PREFIX, parseDeletion, type RelayPool, type RelaySubscription, type EventCrypto } from '../../../../packages/relay/index.ts';
import type { SessionTransportPolicy } from '../../../../packages/transport/index.ts';
import { parseTradeBinding, sameBinding, parseIntentAccount, parseIntent, type TradeBinding, type IntentV1, type CoreResult, type CoreErrorCode, type VaultSession, type VaultSessionAuthority, type VaultSessionLease, type JournalPendingHint } from '../../../../packages/schemas/index.ts';
export interface NativeJournalObservationPort {
  unresolved(binding: TradeBinding, account: string, signal?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>>;
  currentRevision(): number | null;
}
export interface NativeContextOptions {
  readonly binding: TradeBinding;
  /** Exact compiled discovery-to-context mapping. An advertisement cannot select deployment or final trade ID. */
  readonly relayNetworkId: string; readonly orderId: string; readonly maker: string; readonly account: string;
  readonly pool: RelayPool; readonly verifier: Pick<EventCrypto, 'verifyEvent'>;
  readonly journal: NativeJournalObservationPort;
  readonly vault: VaultSessionAuthority; readonly session: VaultSession;
  readonly authority: { readonly currentGeneration: number };
  readonly broker: SessionTransportPolicy;
  readonly now?: () => number;
}
export interface NativeContextObservers extends ObservationDispatcher {
  refreshJournal(signal?: AbortSignal): Promise<CoreResult<JournalPendingHint>>;
}
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const addListener = EventTarget.prototype.addEventListener, removeListener = EventTarget.prototype.removeEventListener;
const failure = (code: CoreErrorCode): CoreResult<never> => Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) });
export function createNativeContextObservers(options: NativeContextOptions): NativeContextObservers {
  const binding = parseTradeBinding(options.binding), account = parseIntentAccount(options.account, binding.chain), now = options.now ?? Date.now;
  const { pool, verifier, journal, vault, authority, broker, relayNetworkId, orderId, maker } = options;
  const session = Object.freeze({ sessionId: options.session.sessionId, profileId: options.session.profileId, revision: options.session.revision });
  if (typeof relayNetworkId !== 'string' || !/^[A-Za-z0-9._:~-]{1,256}$/.test(relayNetworkId)) throw Error('Invalid compiled relay mapping.');
  const sourceGeneration = authority.currentGeneration, brokerGeneration = broker.generation;
  if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 0) throw Error('Invalid native source generation.');
  let lease: VaultSessionLease | undefined, subscription: RelaySubscription | undefined, publisher: ContextHintPublisher | undefined;
  let unsubscribe = (): void => undefined, retired = false, active: AbortController | undefined;
  const unknown: JournalPendingHint = Object.freeze({ pendingIntentIds: null, revision: null });
  const retire = (): void => {
    if (retired) return; retired = true;
    active?.abort();
    try { subscription?.close(); } catch { /* Other native resources still retire. */ } subscription = undefined;
    try { unsubscribe(); } catch { /* No observer can retain a captured lease. */ } unsubscribe = () => undefined;
    try { lease?.dispose(); } catch { /* Local revocation already won. */ } lease = undefined;
    publisher?.retire();
  };
  const current = (): boolean => {
    try {
      if (retired) return false;
      const selected = lease?.current();
      if (selected !== null && selected !== undefined && selected.sessionId === session.sessionId && selected.profileId === session.profileId && authority.currentGeneration === sourceGeneration && broker.generation === brokerGeneration && publisher?.current() === true && !retired && authority.currentGeneration === sourceGeneration && broker.generation === brokerGeneration) return true;
    } catch { /* Unknown native scope is retired, never empty/successful. */ }
    retire(); return false;
  };
  const book = createOrderBook({ nowSeconds: () => { try { const value = now(); return Number.isSafeInteger(value) && value >= 0 ? Math.floor(value / 1000) : null; } catch { return null; } }, verifier: verifier, maxOrders: 32 });
  const dispatcher = createObservationDispatcher({ binding, orderId: orderId, maker: maker, now,
    connect(capability) {
      publisher = capability;
      try {
      const captured = vault.captureSession(session, retire);
      if (!captured.ok) { retire(); return retire; } lease = captured.value;
      if (retired) { try { lease.dispose(); } catch { /* Retired during native capture. */ } lease = undefined; return retire; }
      unsubscribe = broker.subscribeInvalidation(retire);
      if (retired) { try { unsubscribe(); } catch { /* Retired during registration. */ } return retire; }
      if (!current()) { retire(); return retire; }
      const publishRelay = (): void => {
        if (!current()) return;
        const checked = book.revalidate(adKey(maker, orderId));
        if (!checked.ok) { capability.relay({ orderId: orderId, maker: maker, advertisement: null, reason: checked.reason }); return; }
        const ad = checked.ad;
        if (ad.ad.networkId !== relayNetworkId || ad.ad.orderId !== orderId || ad.ad.maker !== maker) return;
        capability.relay({ orderId: orderId, maker: maker, advertisement: { eventId: ad.eventId, revision: ad.ad.revision, expiresAtSeconds: ad.ad.expiresAtSeconds }, reason: 'observed' });
      };
      const seconds = Math.floor(now() / 1000);
      if (!Number.isSafeInteger(seconds) || seconds < 0) { retire(); return retire; }
      const result = pool.subscribe([
        { kinds: [AD_KIND], authors: [maker], '#d': [AD_D_PREFIX + orderId], since: Math.max(0, seconds - 3600), limit: 32 },
        { kinds: [DELETION_KIND], authors: [maker], since: Math.max(0, seconds - 3600), limit: 32 },
      ], { onEvent(event) {
        if (!current()) return;
        try {
          if (event.kind === DELETION_KIND && parseDeletion(event)?.key !== adKey(maker, orderId)) return;
          const outcome = book.ingest(event);
          if (outcome === 'accepted' || outcome === 'replaced' || outcome === 'conflict' || outcome === 'deleted') publishRelay();
        } catch { retire(); }
      } });
      if (!result.ok) { retire(); return retire; } subscription = result.value;
      if (!current()) { try { subscription.close(); } catch { /* Closed during registration. */ } }
      return retire;
      } catch { retire(); return retire; }
    },
  });
  return Object.freeze({
    inspect(): ContextHintSnapshot { current(); return dispatcher.inspect(); },
    subscribe: dispatcher.subscribe,
    dispose: retire,
    async refreshJournal(external?: AbortSignal): Promise<CoreResult<JournalPendingHint>> {
      if (!current()) return failure('CANCELLED');
      if (active !== undefined) return failure('LIMIT_EXCEEDED');
      const controller = new AbortController();
      const abort = (): void => controller.abort();
      try { if (external !== undefined && Reflect.apply(abortedGetter, external, []) === true) return failure('CANCELLED'); }
      catch { return failure('INVALID_INPUT'); }
      active = controller;
      const publishHint = (value: JournalPendingHint): boolean => {
        if (!current() || controller.signal.aborted || !publisher?.journal(value)) return false;
        return current() && !controller.signal.aborted;
      };
      try {
        if (external !== undefined) Reflect.apply(addListener, external, ['abort', abort, { once: true }]);
        if (!current() || controller.signal.aborted) return failure('CANCELLED');
        const revision = journal.currentRevision();
        if (!current() || controller.signal.aborted) return failure('CANCELLED');
        if (revision === null) { if (!publishHint(unknown)) return failure('CANCELLED'); return Object.freeze({ ok: true, value: unknown }); }
        const result = await journal.unresolved(binding, account, controller.signal);
        if (!current() || controller.signal.aborted) return failure('CANCELLED');
        if (!result.ok) return failure(publishHint(unknown) ? 'UNAVAILABLE' : 'CANCELLED');
        if (revision !== journal.currentRevision() || lease?.current()?.revision !== revision) return failure(publishHint(unknown) ? 'CONFLICT' : 'CANCELLED');
        if (!Array.isArray(result.value) || result.value.length > 256) return failure(publishHint(unknown) ? 'LIMIT_EXCEEDED' : 'CANCELLED');
        const ids: string[] = [];
        for (const raw of result.value) {
          const intent = parseIntent(raw);
          if (!sameBinding(intent.binding, binding) || (binding.chain === 'evm' ? intent.account.toLowerCase() !== account.toLowerCase() : intent.account !== account) || ids.includes(intent.intentId)) throw Error();
          ids.push(intent.intentId);
        }
        const value: JournalPendingHint = Object.freeze({ pendingIntentIds: Object.freeze(ids.sort()), revision });
        if (!publishHint(value)) return failure('CANCELLED');
        return Object.freeze({ ok: true, value });
      } catch { return failure(publishHint(unknown) ? 'UNAVAILABLE' : 'CANCELLED'); }
      finally {
        try { if (external !== undefined) Reflect.apply(removeListener, external, ['abort', abort]); } catch { /* Finish physical slot cleanup. */ }
        if (active === controller) active = undefined;
      }
    },
  });
}
