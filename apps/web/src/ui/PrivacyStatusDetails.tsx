import type { PrivacyReason, PrivacyRouteIndicator } from '../../../../packages/domain/index.ts';
import { message as english, messageGroup } from './locale/runtime.ts';

/** Same shape as the domain reader's endpoint details. The domain facade does not export that type yet (the
 * privacy-view half is a separate change), so this unwired leaf declares it locally. Type-only: no runtime effect. */
interface PrivacyEndpointOrigin {
  readonly channel: Exclude<PrivacyRouteIndicator['channel'], 'wallet'>; readonly id: string;
  readonly configuredOrigin: string; readonly connectionOrigin: string | null;
}
interface PrivacyEndpointDetails {
  readonly generation: number | null; readonly observedAt: number | null; readonly expiresAt: number | null;
  readonly reason: PrivacyReason; readonly endpoints: readonly PrivacyEndpointOrigin[];
}

/** Only normalized, display-only output of the trusted privacy reader reaches this component. */
export function PrivacyStatusDetails({ details }: { readonly details: PrivacyEndpointDetails }) {
  const p = messageGroup('privacy');
  const reason={ 'not-observed':p.notObserved,observed:p.observedReason,expired:p.expired,'invalid-observation':p.invalid,'scope-changed':p.scopeChanged,'clock-reversed':p.clockReversed,'policy-blocked':p.policyBlocked,unavailable:p.unavailable }[details.reason];
  return <section aria-label={p.detailsTitle}>
    <h3>{p.detailsTitle}</h3><p>{p.detailsIntro}</p>
    <dl><dt>{p.reason}</dt><dd>{reason}</dd></dl>
    {details.endpoints.length === 0 ? <p>{p.detailsUnknown}</p> : <>
      <p>{p.endpointSource}</p>
      <dl><dt>{p.endpointGeneration}</dt><dd>{details.generation}</dd><dt>{p.endpointExpiry}</dt><dd>{details.expiresAt}</dd></dl>
      <ul>{details.endpoints.map(item => <li key={item.channel + ':' + item.id}>
        <h4>{item.channel}</h4><dl><dt>{p.endpointId}</dt><dd>{item.id}</dd>
          <dt>{p.configuredOrigin}</dt><dd><code dir="ltr">{item.configuredOrigin}</code></dd>
          <dt>{p.connectionOrigin}</dt><dd><code dir="ltr">{item.connectionOrigin ?? p.unknown}</code></dd></dl>
      </li>)}</ul>
    </>}
    <p>{details.observedAt === null ? p.noTime : english('privacy', 'time', {milliseconds:String(details.observedAt)})}</p>
    <p>{p.walletUnknown}</p>
  </section>;
}
