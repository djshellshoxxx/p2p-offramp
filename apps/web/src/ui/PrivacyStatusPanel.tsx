import { useEffect, useMemo, useRef, useState } from 'react';
import { createPrivacyViewReader, type PrivacyEndpointDetails, type PrivacyEndpointPort, type PrivacyObservationPort, type PrivacyIndicator, type PrivacyReason, type PrivacyTransportPort } from '../../../../packages/domain/index.ts';
import type { AppServices } from '../app-services.ts';
import { PrivacyStatusDetails } from './PrivacyStatusDetails.tsx';
import { message, messageGroup } from './locale/runtime.ts';

const p = messageGroup('privacy');
const clock = () => Math.floor(performance.now());
// Keep semantic keys: resolving the live message view here would freeze a catalog.
type PrivacyMessage = keyof typeof p;
const states: Readonly<Record<string, PrivacyMessage>> = { unknown: 'unknown', unavailable: 'unavailable', unsupported: 'unsupported', direct: 'direct', 'verified-private': 'privateRoute', blocked: 'blocked', locked: 'locked', unlocked: 'unlocked', 'authenticated-encryption': 'authenticated', available: 'available' };
const reasons: Readonly<Record<PrivacyReason, PrivacyMessage>> = { 'not-observed': 'notObserved', observed: 'observedReason', expired: 'expired', 'invalid-observation': 'invalid', 'scope-changed': 'scopeChanged', 'clock-reversed': 'clockReversed', 'policy-blocked': 'policyBlocked', unavailable: 'unavailable' };
const sources = { none: 'none', 'local-vault': 'localVault', 'transport-policy': 'transport', 'messaging-provider': 'messagingProvider', 'proof-provider': 'proofProvider' } as const;
const channels = { rpc: 'rpc', relay: 'relay', map: 'map', proof: 'proofChannel', update: 'update', wallet: 'wallet' } as const;

/** Bundled composition supplies the same real broker it uses for transport.
 * A subscription is an invalidation hint; only a fresh coherent inspection is evidence. */
interface InvalidationPort {
  subscribeInvalidation(listener: () => void): () => void;
}
export type PrivacyStatusTransport = PrivacyTransportPort & InvalidationPort;
export type PrivacyStatusEndpoints = PrivacyEndpointPort & InvalidationPort;
export interface SettingsEndpointSource {
  readonly services: AppServices;
  readonly scope: number;
  readonly port: PrivacyStatusEndpoints;
}

function useObservedPort<T extends InvalidationPort>(port: T | null) {
  const [, refresh] = useState(0);
  const activePort = useRef<T | null>(null);
  const [registration, setRegistration] = useState<{ port: T; ready: boolean } | null>(null);
  useEffect(() => {
    if (!port) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      const off = port.subscribeInvalidation(() => { if (active) refresh(value => value + 1); });
      if (typeof off !== 'function') throw new Error();
      unsubscribe = off;
      activePort.current = port;
      setRegistration({ port, ready: true });
    } catch { setRegistration({ port, ready: false }); }
    return () => {
      active = false;
      activePort.current = null;
      try { unsubscribe?.(); } catch { /* A retired listener cannot trigger inspection. */ }
    };
  }, [port]);
  const current = registration !== null && registration.port === port;
  return {
    live: current && registration.ready && activePort.current === port ? port : null,
    failed: current && !registration.ready,
  };
}

function selectionOpen(source: SettingsEndpointSource) {
  try { return source.services.getSnapshot().state === 'unlocked' && source.services.selectionScope() === source.scope; }
  catch { return false; }
}

function ObservedEndpointDetails({ source, observations, fallback }: {
  readonly source: SettingsEndpointSource; readonly observations: PrivacyObservationPort; readonly fallback: PrivacyEndpointDetails;
}) {
  const { live, failed } = useObservedPort(selectionOpen(source) ? source.port : null);
  const reader = useMemo(() => createPrivacyViewReader({
    monotonicNow: clock, observations, ...(live ? { endpoints: live } : {}),
  }), [observations, live]);
  const result = live && selectionOpen(source) ? reader.buildPrivacyView(null, source.scope) : null;
  const details = result?.ok && result.value.vault.state === 'unlocked' && selectionOpen(source)
    ? result.value.endpointDetails : fallback;
  const [, refresh] = useState(0);
  const deadline = details.expiresAt;
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setTimeout(() => refresh(value => value + 1), Math.max(0, deadline - clock()));
    return () => window.clearTimeout(timer);
  }, [deadline]);
  return <>{failed ? <p role="status">{p.unavailable}</p> : null}<PrivacyStatusDetails details={details} /></>;
}

function EndpointDisclosure({ source, observations, fallback }: {
  readonly source: SettingsEndpointSource; readonly observations: PrivacyObservationPort; readonly fallback: PrivacyEndpointDetails;
}) {
  const [revealed, setRevealed] = useState<SettingsEndpointSource | null>(null);
  if (revealed !== null && revealed !== source) setRevealed(null);
  const open = revealed === source;
  return <>
    <button type="button" aria-expanded={open} aria-controls="privacy-endpoint-details"
      onClick={() => setRevealed(open ? null : source)}>{open ? p.hideEndpoints : p.showEndpoints}</button>
    <div id="privacy-endpoint-details">{open
      ? <ObservedEndpointDetails source={source} observations={observations} fallback={fallback} />
      : <p>{p.endpointsHidden}</p>}</div>
  </>;
}

export function PrivacyStatusPanel({ services = null, scope, transport = null, endpoints = null }: {
  readonly services?: AppServices | null; readonly scope?: number; readonly transport?: PrivacyStatusTransport | null;
  readonly endpoints?: SettingsEndpointSource | null;
}) {
  const [, refresh] = useState(0);
  const { live: liveTransport, failed } = useObservedPort(transport);
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
  let transportError = failed;
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
      <dt>{p.observed}</dt><dd>{p[states[item.state] ?? 'unknown']}</dd>
      <dt>{p.source}</dt><dd>{p[sources[item.source]]}</dd>
      <dt>{p.reason}</dt><dd>{p[reasons[item.reason]]}</dd>
    </dl><p>{item.observedAt === null ? p.noTime : message('privacy', 'time', { milliseconds: String(item.observedAt) })}</p></li>;
  }
  return <section className="plain-section" aria-labelledby="privacy-observations-title">
    <h2 id="privacy-observations-title">{p.title}</h2><p>{p.intro}</p><p>{p.refresh}</p>
    {transportError ? <p role="status">{p.error}</p> : null}
    {result.ok ? <ul>{result.value.routes.map(item => indicator(p[channels[item.channel]], item, item.selectedPolicy === 'ordinary' ? p.ordinary : item.selectedPolicy === 'strict' ? p.strict : p.noPolicy))}
      {indicator(p.vault, result.value.vault)}{indicator(p.messaging, result.value.messaging)}{indicator(p.proof, result.value.proof)}</ul> : <p role="status">{p.error}</p>}
    {result.ok && (observations && endpoints && endpoints.services === services && endpoints.scope === scope &&
      result.value.scopeGeneration === scope && result.value.vault.state === 'unlocked'
      ? <EndpointDisclosure source={endpoints} observations={observations} fallback={result.value.endpointDetails} />
      : <PrivacyStatusDetails details={result.value.endpointDetails} />)}
    <h3>{p.chainTitle}</h3><p>{p.chainWarning}</p><h3>{p.fiatTitle}</h3><p>{p.fiatWarning}</p><p className="warning">{p.authorityWarning}</p>
  </section>;
}
