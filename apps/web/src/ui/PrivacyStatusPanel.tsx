import { useEffect, useMemo, useRef, useState } from 'react';
import { createPrivacyViewReader, type PrivacyIndicator, type PrivacyReason, type PrivacyTransportPort } from '../../../../packages/domain/index.ts';
import type { AppServices } from '../app-services.ts';
import { english, englishGroup } from './locale/en.ts';

const p = englishGroup('privacy');
const clock = () => Math.floor(performance.now());
const states: Readonly<Record<string, string>> = { unknown: p.unknown, unavailable: p.unavailable, unsupported: p.unsupported, direct: p.direct, 'verified-private': p.privateRoute, blocked: p.blocked, locked: p.locked, unlocked: p.unlocked, 'authenticated-encryption': p.authenticated, available: p.available };
const reasons: Readonly<Record<PrivacyReason, string>> = { 'not-observed': p.notObserved, observed: p.observedReason, expired: p.expired, 'invalid-observation': p.invalid, 'scope-changed': p.scopeChanged, 'clock-reversed': p.clockReversed, 'policy-blocked': p.policyBlocked, unavailable: p.unavailable };
const sources = { none: p.none, 'local-vault': p.localVault, 'transport-policy': p.transport, 'messaging-provider': p.messagingProvider, 'proof-provider': p.proofProvider };
const channels = { rpc: p.rpc, relay: p.relay, map: p.map, proof: p.proofChannel, update: p.update, wallet: p.wallet };

/** Bundled composition supplies the same real broker it uses for transport.
 * A subscription is an invalidation hint; only a fresh coherent inspection is evidence. */
export type PrivacyStatusTransport = PrivacyTransportPort & {
  subscribeInvalidation(listener: () => void): () => void;
};
export function PrivacyStatusPanel({ services = null, scope, transport = null }: {
  readonly services?: AppServices | null; readonly scope?: number; readonly transport?: PrivacyStatusTransport | null;
}) {
  const [, refresh] = useState(0);
  const activeSubscription = useRef<PrivacyStatusTransport | null>(null);
  const [subscription, setSubscription] = useState<{ readonly transport: PrivacyStatusTransport; readonly ready: boolean } | null>(null);
  useEffect(() => {
    if (!transport) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      const off = transport.subscribeInvalidation(() => { if (active) refresh(value => value + 1); });
      if (typeof off !== 'function') throw new Error();
      unsubscribe = off;
      activeSubscription.current = transport;
      setSubscription({ transport, ready: true });
    } catch { setSubscription({ transport, ready: false }); }
    return () => {
      active = false;
      activeSubscription.current = null;
      try { unsubscribe?.(); } catch { /* Old observers can no longer publish UI state. */ }
    };
  }, [transport]);
  // State can retain a formerly-ready broker across A → null → A. The active
  // lease must also match: a new registration may fail or exhaust its limit.
  const liveTransport = subscription?.transport === transport && subscription.ready && activeSubscription.current === transport ? transport : null;
  const observations = useMemo(() => services ? {
    get generation() { return services.selectionScope(); },
    read() {
      const generation = services.selectionScope();
      const state = services.getSnapshot().state;
      const observedAt = clock();
      return { version: 1 as const, generation, vault: { state, observedAt, expiresAt: observedAt + 30_000 }, messaging: null, proof: null };
    },
  } : undefined, [services]);
  // Readers retain no subscriptions/resources; the effect above owns the broker observer.
  const localReader = useMemo(() => createPrivacyViewReader({ monotonicNow: clock, ...(observations ? { observations } : {}) }), [observations]);
  const reader = useMemo(() => createPrivacyViewReader({ monotonicNow: clock, ...(observations ? { observations } : {}),
    ...(liveTransport ? { transport: liveTransport } : {}) }), [observations, liveTransport]);
  const expectedScope = services ? scope : undefined;
  let transportError = subscription?.transport === transport && !subscription.ready;
  const inspect = () => {
    if (!liveTransport) return localReader.buildPrivacyView(null, expectedScope);
    try {
      const generation = liveTransport.generation, mode = liveTransport.mode;
      if (!Number.isSafeInteger(generation) || generation < 0 || (mode !== 'ordinary' && mode !== 'strict')) throw new Error();
      const current = reader.buildPrivacyView(mode, expectedScope);
      if (liveTransport.generation !== generation || liveTransport.mode !== mode) throw new Error();
      return current;
    } catch {
      transportError = true;
      return localReader.buildPrivacyView(null, expectedScope);
    }
  };
  const result = inspect();
  const expiresAt = result.ok ? result.value.vault.expiresAt : null;
  useEffect(() => {
    if (!services && !transport) return;
    let active = true;
    const inspect = () => { if (active) refresh(value => value + 1); };
    const visible = () => { if (document.visibilityState === 'visible') inspect(); };
    // One local deadline, renewed by the next inspection. No transport or service polling.
    const timer = expiresAt === null ? undefined : window.setTimeout(inspect, Math.max(0, expiresAt - clock()));
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', inspect);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', inspect);
    };
  }, [services, scope, transport, expiresAt]);
  function indicator(label: string, item: PrivacyIndicator<string>, selected?: string) {
    return <li key={label}><h3>{label}</h3><dl>
      {selected ? <><dt>{p.selected}</dt><dd>{selected}</dd></> : null}
      <dt>{p.observed}</dt><dd>{states[item.state] ?? p.unknown}</dd>
      <dt>{p.source}</dt><dd>{sources[item.source]}</dd>
      <dt>{p.reason}</dt><dd>{reasons[item.reason]}</dd>
    </dl><p>{item.observedAt === null ? p.noTime : english('privacy', 'time', { milliseconds: String(item.observedAt) })}</p></li>;
  }
  return <section className="plain-section" aria-labelledby="privacy-observations-title">
    <h2 id="privacy-observations-title">{p.title}</h2><p>{p.intro}</p><p>{p.refresh}</p>
    {transportError ? <p role="status">{p.error}</p> : null}
    {result.ok ? <ul>{result.value.routes.map(item => indicator(channels[item.channel], item, item.selectedPolicy === 'ordinary' ? p.ordinary : item.selectedPolicy === 'strict' ? p.strict : p.noPolicy))}
      {indicator(p.vault, result.value.vault)}{indicator(p.messaging, result.value.messaging)}{indicator(p.proof, result.value.proof)}</ul> : <p role="status">{p.error}</p>}
    <h3>{p.chainTitle}</h3><p>{p.chainWarning}</p><h3>{p.fiatTitle}</h3><p>{p.fiatWarning}</p><p className="warning">{p.authorityWarning}</p>
  </section>;
}
