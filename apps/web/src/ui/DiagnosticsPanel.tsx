import { Fragment, useEffect, useState } from 'react';
import type { Diagnostics, DiagnosticCollection, DiagnosticPreview, DiagnosticErrorCode } from '../../../../packages/diagnostics/index.ts';
import { diagnosticsMessages as m } from './diagnostics-messages.ts';

function download(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes), url = URL.createObjectURL(new Blob([copy], { type: 'application/json' }));
  const anchor = document.createElement('a');
  try { anchor.href = url; anchor.download = 'p2p-diagnostics.json'; document.body.append(anchor); anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export function DiagnosticsPanel({ service }: { readonly service: Diagnostics | null }) {
  const [collection, setCollection] = useState<DiagnosticCollection | null>(null);
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [preview, setPreview] = useState<DiagnosticPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<DiagnosticErrorCode | null>(null);
  function discardPreview() { setPreview(previous => { previous?.bytes.fill(0); return null; }); }
  function refresh() {
    discardPreview(); setSelected([]); setNotice(''); setError(null);
    if (!service) { setCollection(null); return; }
    const result = service.collectDiagnostics();
    if (result.ok) setCollection(result.value); else { setCollection(null); setError(result.error.code); }
  }
  useEffect(() => { refresh(); }, [service]);
  useEffect(() => () => { preview?.bytes.fill(0); }, [preview]);
  function showPreview() {
    if (!service || !collection) return;
    discardPreview(); setError(null); setNotice('');
    const result = service.previewExport(collection, selected);
    if (result.ok) setPreview(result.value); else setError(result.error.code);
  }
  function savePreview() {
    if (!service || !preview) return;
    const result = service.confirmExport(preview);
    if (!result.ok) { discardPreview(); setError(result.error.code); return; }
    try { download(result.value); setNotice(m.downloaded); }
    catch { setError('REDACTION_FAILED'); }
    finally { result.value.fill(0); }
  }
  function clear() {
    discardPreview(); setSelected([]); setCollection(null); setError(null); setNotice('');
    const result = service?.clearDiagnostics();
    if (result?.ok) { refresh(); setNotice(m.cleared); } else setError(result?.error.code ?? 'STORAGE_UNAVAILABLE');
  }
  return <section className="panel" aria-labelledby="diagnostics-title">
    <h2 id="diagnostics-title">{m.title}</h2><p>{m.help}</p><p className="helper">{m.privacy}</p>
    {!collection?.configured ? <p className="warning" role="status">{m.unconfigured}</p> : <p>{m.retention}</p>}
    <div className="actions"><button type="button" onClick={refresh}>{m.refresh}</button>
      <button type="button" disabled={!service} onClick={clear}>{m.clear}</button></div>
    {error ? <p className="notice error" role="alert">{m.errors[error]}</p> : null}
    {notice ? <p className="notice" role="status">{notice}</p> : null}
    {collection?.configured && collection.events.length === 0 ? <p role="status">{m.empty}</p> : null}
    {collection?.warnings.map(warning => <p className="notice" key={warning}>{m.warnings[warning]}</p>)}
    {collection?.configured && collection.events.length ? <>
      <fieldset className="profile-choices"><legend>{m.select}</legend>
        {collection.events.map((event, index) => <label key={index} className="checkbox-label">
          <input type="checkbox" checked={selected.includes(index)} onChange={change => {
            const checked = change.currentTarget.checked;
            discardPreview(); setNotice(''); setSelected(old => checked ? [...old, index] : old.filter(value => value !== index));
          }} />
          <span>{m.event(index + 1)} <code>{event.timeBucket}</code> · {event.module} · {event.operation} · {event.errorCode}</span>
        </label>)}
      </fieldset>
      <button type="button" disabled={selected.length === 0} onClick={showPreview}>{m.preview}</button>
    </> : null}
    {preview ? <section className="plain-section" aria-labelledby="diagnostics-preview-title">
      <h3 id="diagnostics-preview-title">{m.previewTitle}</h3><p>{m.sharing}</p>
      <dl className="terms">{preview.rows.map(row => <Fragment key={`${row.event}-${row.field}`}>
        <dt>{m.event(row.event)} · {row.field}</dt><dd><code><bdi>{row.value}</bdi></code></dd>
      </Fragment>)}</dl>
      <label htmlFor="diagnostics-bytes">{m.exactBytes}</label>
      <textarea id="diagnostics-bytes" className="diagnostics-export" rows={12} readOnly value={new TextDecoder().decode(preview.bytes)} />
      <p className="helper">{m.byteCount(preview.bytes.length)}</p>
      <button type="button" onClick={savePreview}>{m.download}</button>
    </section> : null}
  </section>;
}
