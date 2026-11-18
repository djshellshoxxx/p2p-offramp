import { useEffect, useId, useMemo, useSyncExternalStore } from 'react';
import { createPrivacyPolicyController, type TransportPolicyPort } from '../privacy/policy-controller.ts';
import type { AppTransportChannel } from '../../../../packages/schemas/index.ts';

/** The caller supplies its ordinary locale catalog. No user content becomes markup or transport authority. */
export interface PrivacyPolicyMessages {
  readonly policyTitle: string;
  readonly policyIntro: string;
  readonly policyOrdinary: string;
  readonly policyStrict: string;
  readonly policyApply: string;
  readonly policyRelaxConsent: string;
  readonly policySelected: string;
  readonly policyUnavailable: string;
  readonly policyLoading: string;
  readonly policyBusy: string;
  readonly policyChanged: string;
  readonly policyUnknownCoverage: string;
  readonly policyChannels: string;
  readonly policyNoChannels: string;
  readonly policyBytesSent: string;
  readonly policyRetry: string;
  readonly channelLabels: Readonly<Record<AppTransportChannel, string>>;
}
export function PrivacyPolicySelector({ services, scope, messages: m }: {
  readonly services: TransportPolicyPort | null;
  readonly scope?: number;
  readonly messages: PrivacyPolicyMessages;
}) {
  const id = useId();
  const controller = useMemo(() => createPrivacyPolicyController(services, scope), [services, scope]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => controller.activate(), [controller]);
  const selected = state.selection;
  const ready = state.phase === 'ready' && selected !== null;
  const relaxation = selected?.mode === 'strict' && state.proposedMode === 'ordinary';
  const modeText = (mode: 'ordinary' | 'strict') => mode === 'ordinary' ? m.policyOrdinary : m.policyStrict;
  const status = state.phase === 'loading' ? m.policyLoading : state.phase === 'applying' ? m.policyBusy :
    state.error === 'CONFLICT' || state.error === 'CANCELLED' ? m.policyChanged : m.policyUnavailable;
  return <section className="plain-section" aria-labelledby={id + '-title'}>
    <h2 id={id + '-title'}>{m.policyTitle}</h2>
    <p>{m.policyIntro}</p>
    <dl><dt>{m.policySelected}</dt><dd>{selected ? modeText(selected.mode) : m.policyUnavailable}</dd></dl>
    <label htmlFor={id + '-mode'}>{m.policyTitle}</label>
    <select id={id + '-mode'} value={state.proposedMode ?? ''} disabled={!ready} onChange={event => {
      const mode = event.currentTarget.value;
      if (mode === 'ordinary' || mode === 'strict') controller.choose(mode);
    }}>
      <option value="" disabled>{m.policyUnavailable}</option>
      <option value="ordinary">{m.policyOrdinary}</option>
      <option value="strict">{m.policyStrict}</option>
    </select>
    {relaxation ? <label htmlFor={id + '-consent'}><input id={id + '-consent'} type="checkbox" checked={state.ordinaryConsent} disabled={!ready}
      onChange={event => controller.acknowledgeOrdinary(event.currentTarget.checked)} /> {m.policyRelaxConsent}</label> : null}
    <div className="actions"><button type="button" disabled={!ready || (relaxation && !state.ordinaryConsent)} onClick={() => { void controller.apply(); }}>{m.policyApply}</button>
      {services && (state.phase === 'error' || state.phase === 'unavailable') ? <button type="button" onClick={() => { void controller.refresh(); }}>{m.policyRetry}</button> : null}</div>
    {state.phase !== 'ready' ? <p role="status">{status}</p> : null}
    {selected ? <><h3>{m.policyChannels}</h3>{selected.brokeredChannels.length ? <ul>{selected.brokeredChannels.map(channel => <li key={channel}>{m.channelLabels[channel]}</li>)}</ul> : <p>{m.policyNoChannels}</p>}</> : null}
    <p>{m.policyUnknownCoverage}</p><p>{m.policyBytesSent}</p>
  </section>;
}
