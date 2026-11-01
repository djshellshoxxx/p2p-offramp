import { useMemo } from 'react';
import { createPrivacyViewReader, type PrivacyIndicator, type PrivacyReason } from '../../../../packages/domain/index.ts';
import type { AppServices } from '../app-services.ts';
import { english, englishGroup } from './locale/en.ts';

const p = englishGroup('privacy');
const clock = () => Math.floor(performance.now());
const states: Readonly<Record<string, string>> = { unknown: p.unknown, unavailable: p.unavailable, unsupported: p.unsupported, direct: p.direct, 'verified-private': p.privateRoute, blocked: p.blocked, locked: p.locked, unlocked: p.unlocked, 'authenticated-encryption': p.authenticated, available: p.available };
const reasons: Readonly<Record<PrivacyReason, string>> = { 'not-observed': p.notObserved, observed: p.observedReason, expired: p.expired, 'invalid-observation': p.invalid, 'scope-changed': p.scopeChanged, 'clock-reversed': p.clockReversed, 'policy-blocked': p.policyBlocked, unavailable: p.unavailable };
const sources = { none: p.none, 'local-vault': p.localVault, 'transport-policy': p.transport, 'messaging-provider': p.messagingProvider, 'proof-provider': p.proofProvider };
const channels = { rpc: p.rpc, relay: p.relay, map: p.map, proof: p.proofChannel, update: p.update, wallet: p.wallet };

/** Only the real local vault service is projected. No preferences or JSON mint network evidence.
 * App owns the existing vault/scope subscription and rerenders this panel on its notifications.
 */
export function PrivacyStatusPanel({ services = null, scope }: { readonly services?: AppServices | null; readonly scope?: number }) {
  // Reader owns no subscriptions/resources. Replacing this memo drops only the old display reader.
  const reader = useMemo(() => createPrivacyViewReader({ monotonicNow: clock, ...(services ? { observations: {
    get generation() { return services.selectionScope(); },
    read() {
      const generation = services.selectionScope();
      const state = services.getSnapshot().state;
      const observedAt = clock();
      return { version: 1 as const, generation, vault: { state, observedAt, expiresAt: observedAt + 30_000 }, messaging: null, proof: null };
    },
  } } : {}) }), [services]);
  const result = reader.buildPrivacyView(null, services ? scope : undefined);
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
    {result.ok ? <ul>{result.value.routes.map(item => indicator(channels[item.channel], item, p.noPolicy))}
      {indicator(p.vault, result.value.vault)}{indicator(p.messaging, result.value.messaging)}{indicator(p.proof, result.value.proof)}</ul> : <p role="status">{p.error}</p>}
    <h3>{p.chainTitle}</h3><p>{p.chainWarning}</p><h3>{p.fiatTitle}</h3><p>{p.fiatWarning}</p><p className="warning">{p.authorityWarning}</p>
  </section>;
}
