import { REQUIRED_CAPABILITIES } from '../compatibility/model.ts';
import type { RequiredStartupApi, StartupCapabilitySnapshot } from '../compatibility/probe.ts';
import { messages as m } from './messages.ts';

/** Explain an unavailable private runtime without turning feature presence into device support.
 * The normal workspace stays uncluttered; optional features do not block core private operations. */
export function StartupCompatibilityNotice({ snapshot, runtimeUnavailable }: {
  readonly snapshot: StartupCapabilitySnapshot; readonly runtimeUnavailable: boolean;
}) {
  if (snapshot.mode !== 'read-only' && !runtimeUnavailable) return null;
  const c = m.compatibility;
  const labels: Readonly<Record<RequiredStartupApi, string>> = {
    'secure-context': c.secureContext, webcrypto: c.encryption, 'bounded-worker': c.processing,
    indexeddb: c.storage, 'file-import': c.fileImport, 'file-export': c.fileExport,
  };
  const missing = REQUIRED_CAPABILITIES.filter(key => snapshot.required[key] !== 'present');
  return <section className="notice" aria-labelledby="startup-compatibility-title">
    <h2 id="startup-compatibility-title">{missing.length ? c.readOnlyTitle : c.recoveryTitle}</h2>
    <p>{missing.length ? c.readOnlyHelp : c.runtimeFailure}</p>
    {missing.length ? <p>{c.missingFeatures(missing.map(key => labels[key]).join(', '))}</p> : null}
    <p>{c.recoveryHelp} <a href="#/recovery">{c.recoveryLink}</a></p>
    <p>{c.qualificationWarning}</p>
  </section>;
}
