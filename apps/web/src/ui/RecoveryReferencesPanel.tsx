import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_RECOVERY_REFERENCE_EXPORT_BYTES, type RuntimeRecoveryReferences } from '../../../../packages/schemas/index.ts';
import type { AppServices } from '../app-services.ts';
import { errorMessage } from './routes.ts';
import { recoveryReferenceMessages as m } from './recovery-reference-messages.ts';
const noSubscribe = () => () => {}, noScope = () => 0, locked = Object.freeze({ state: 'locked' as const }), lockedSnapshot = () => locked;
interface Preview { readonly bytes: Uint8Array; readonly text: string; readonly revision: number; readonly offset: number; }
function download(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/json' })), anchor = document.createElement('a');
  try { anchor.href = url; anchor.download = 'p2p-private-recovery-references.json'; document.body.append(anchor); anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export function RecoveryReferencesPanel({ services }: { readonly services: AppServices | null }) {
  const status = useSyncExternalStore(services?.subscribe ?? noSubscribe, services?.getSnapshot ?? lockedSnapshot, lockedSnapshot);
  const scope = useSyncExternalStore(services?.subscribe ?? noSubscribe, services?.selectionScope ?? noScope, noScope);
  const [loaded, setLoaded] = useState<{ readonly scope: number; readonly value: RuntimeRecoveryReferences } | null>(null);
  const [selected, setSelected] = useState<readonly number[]>([]), [consent, setConsent] = useState(false), [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null), sequence = useRef(0), retainedPreview = useRef<Preview | null>(null);
  const page = status.state === 'unlocked' && loaded?.scope === scope ? loaded.value : null;
  function discardPreview() { retainedPreview.current?.bytes.fill(0); retainedPreview.current = null; setPreview(null); }
  useLayoutEffect(() => {
    request.current?.abort(); sequence.current++; setLoaded(null); setSelected([]); setConsent(false); discardPreview(); setError(''); setNotice(''); setBusy(false);
  }, [scope, services]);
  useEffect(() => () => { request.current?.abort(); sequence.current++; retainedPreview.current?.bytes.fill(0); retainedPreview.current = null; }, [services]);
  const isCurrent = (token: number, captured: number, controller: AbortController) => !controller.signal.aborted && sequence.current === token &&
    services?.current.state === 'unlocked' && services.selectionScope() === captured;
  async function load(offset = 0, expectedRevision: number | null = null) {
    if (!services || services.current.state !== 'unlocked' || busy) return;
    const captured = services.selectionScope(), token = ++sequence.current, controller = new AbortController();
    request.current?.abort(); request.current = controller; discardPreview(); setSelected([]); setConsent(false); setNotice(''); setError(''); setBusy(true);
    try {
      const result = await services.listRecoveryReferences(offset, expectedRevision, controller.signal);
      if (!isCurrent(token, captured, controller)) return;
      if (result.ok) setLoaded({ scope: captured, value: result.value }); else { setLoaded(null); setError(errorMessage(result.error.code)); }
    } catch { if (isCurrent(token, captured, controller)) { setLoaded(null); setError(errorMessage('PROTOCOL_ERROR')); } }
    finally { if (isCurrent(token, captured, controller)) setBusy(false); if (request.current === controller) request.current = null; }
  }
  function showPreview() {
    discardPreview(); setError(''); setNotice('');
    if (!page || !consent || selected.length === 0 || services?.selectionScope() !== scope) return;
    const text = JSON.stringify({ format: 'p2p-offramp/offline-recovery-references/v1', authority: page.authority, localSnapshotRevision: page.revision,
      items: selected.map(index => page.items[index]) }, null, 2), bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_RECOVERY_REFERENCE_EXPORT_BYTES) { bytes.fill(0); setError(errorMessage('LIMIT_EXCEEDED')); return; }
    const value = Object.freeze({ bytes, text, revision: page.revision, offset: page.offset }); retainedPreview.current = value; setPreview(value);
  }
  async function savePreview() {
    if (!services || !page || !preview || busy || !consent) return;
    const captured = services.selectionScope(), token = ++sequence.current, controller = new AbortController(), saved = preview;
    request.current = controller; setBusy(true); setNotice(''); setError('');
    try {
      // The same revision must still be durable just before download; never export a mixed-page/profile result.
      const fresh = await services.listRecoveryReferences(saved.offset, saved.revision, controller.signal);
      if (!isCurrent(token, captured, controller) || retainedPreview.current !== saved) return;
      if (!fresh.ok || JSON.stringify(fresh.value) !== JSON.stringify(page)) {
        setLoaded(null); discardPreview(); setError(errorMessage(fresh.ok ? 'PROTOCOL_ERROR' : fresh.error.code)); return;
      }
      download(saved.bytes); setNotice(m.downloaded);
    } catch { if (isCurrent(token, captured, controller)) { discardPreview(); setError(errorMessage('PROTOCOL_ERROR')); } }
    finally { if (isCurrent(token, captured, controller)) setBusy(false); if (request.current === controller) request.current = null; }
  }
  return <section className="panel" aria-labelledby="recovery-references-title">
    <h2 id="recovery-references-title">{m.title}</h2><p>{m.help}</p><p className="warning">{m.unverified}</p><p className="helper">{m.private}</p>
    {status.state !== 'unlocked' ? <p role="status">{m.locked}</p> : <div className="actions">
      <button type="button" disabled={busy} onClick={() => { void load(); }}>{page ? m.refresh : m.load}</button>
      {page && page.offset > 0 ? <button type="button" disabled={busy} onClick={() => { void load(page.offset - 64, page.revision); }}>{m.previous}</button> : null}
      {page?.nextOffset !== null && page?.nextOffset !== undefined ? <button type="button" disabled={busy} onClick={() => { void load(page.nextOffset!, page.revision); }}>{m.next}</button> : null}
    </div>}
    {busy ? <p role="status">{m.loading}</p> : null}{error ? <p className="notice error" role="alert">{error}</p> : null}{notice ? <p className="notice" role="status">{notice}</p> : null}
    {page ? <>
      <p className="helper">{m.page(page.offset, page.totalJournalRecords, page.revision)}</p>
      {page.unsupported ? <p className="notice">{m.unsupported(page.unsupported)}</p> : null}
      {page.items.length === 0 ? <p>{m.empty}</p> : <fieldset className="profile-choices"><legend>{m.select}</legend>
        {page.items.map((item, index) => <div key={item.recordId}>
          <label className="checkbox-label"><input type="checkbox" disabled={busy} checked={selected.includes(index)} onChange={event => {
            const checked = event.currentTarget.checked; discardPreview(); setNotice(''); setSelected(old => checked ? [...old, index] : old.filter(value => value !== index));
          }} /><span>{m.reference(page.offset + index + 1)} · {item.action}</span></label>
          <dl className="terms"><dt>{m.storedLabel}</dt><dd>{item.storedState}</dd>
            <dt>Network / deployment</dt><dd><code>{item.binding.networkId} / {item.binding.deploymentId}</code></dd>
            <dt>Trade ID</dt><dd><code>{item.binding.tradeId}</code></dd><dt>Wallet account</dt><dd><code>{item.account}</code></dd>
            <dt>Intent ID</dt><dd><code>{item.intentId}</code></dd><dt>{m.transaction}</dt><dd><code>{item.chainReference ?? m.unknown}</code></dd>
            {item.nonce !== null ? <><dt>{m.nonce}</dt><dd><code>{item.nonce}</code></dd></> : null}
          </dl>
        </div>)}
      </fieldset>}
      {page.items.length > 0 ? <><label className="checkbox-label"><input type="checkbox" disabled={busy} checked={consent} onChange={event => { discardPreview(); setConsent(event.currentTarget.checked); }} /><span>{m.consent}</span></label>
        <button type="button" disabled={busy || !consent || selected.length === 0} onClick={showPreview}>{m.preview}</button></> : null}
      {preview ? <section className="plain-section" aria-labelledby="recovery-reference-preview-title">
        <h3 id="recovery-reference-preview-title">{m.previewTitle}</h3><p>{m.previewHelp}</p>
        <label htmlFor="recovery-reference-bytes">{m.exact}</label><textarea id="recovery-reference-bytes" className="recovery-export" rows={12} readOnly value={preview.text} />
        <button type="button" disabled={busy} onClick={() => { void savePreview(); }}>{m.download}</button>
      </section> : null}
    </> : null}
  </section>;
}
