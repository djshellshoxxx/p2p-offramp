import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { SCREEN_CATEGORIES, type ScreenCategory, type ScreenCountSnapshot, type ScreenCountsController } from '../analytics/screen-counts.ts';

export interface LocalScreenAnalyticsMessages {
  readonly title: string; readonly help: string; readonly off: string; readonly on: string; readonly unavailable: string;
  readonly optIn: string; readonly optOut: string; readonly clear: string; readonly reviewExport: string;
  readonly previewTitle: string; readonly download: string; readonly exportUnavailable: string;
  readonly screenColumn: string; readonly countColumn: string; readonly categoryLabels: Readonly<Record<ScreenCategory, string>>;
}
const absent: ScreenCountSnapshot = Object.freeze({ enabled: false, retired: true,
  counts: Object.freeze({ home: 0, offers: 0, trade: 0, recovery: 0, settings: 0 }), preview: null });
const noSnapshot = () => absent, noSubscription = () => () => {};

/** Settings receives user controls and fixed counters, never the App's committed-view observer. */
export function LocalScreenAnalytics({ controller, messages: m }: { readonly controller: ScreenCountsController | null; readonly messages: LocalScreenAnalyticsMessages }) {
  const snapshot = useSyncExternalStore(controller?.subscribe ?? noSubscription, controller?.getSnapshot ?? noSnapshot, controller?.getSnapshot ?? noSnapshot);
  const [failedOwner, setFailedOwner] = useState<ScreenCountsController | null>(null);
  // Error feedback retains no export text or stale preview object after erasure.
  useLayoutEffect(() => { setFailedOwner(null); }, [controller, snapshot.preview]);
  function download() {
    if (!controller || !snapshot.preview) return;
    const selected = snapshot.preview, text = controller.confirmExport(selected);
    if (text === null) return;
    let url: string | undefined, anchor: HTMLAnchorElement | undefined;
    try {
      if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') throw Error('FILE_EXPORT_UNAVAILABLE');
      url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      anchor = document.createElement('a'); anchor.href = url; anchor.download = 'p2p-offramp-screen-counts.json';
      // Native file helpers can fail or synchronously trigger lifecycle changes.
      // Recheck the exact preview after them, immediately before the explicit download.
      if (controller.confirmExport(selected) !== text) return;
      anchor.click();
    } catch { setFailedOwner(controller); }
    finally {
      anchor?.remove();
      if (url !== undefined) try { URL.revokeObjectURL(url); } catch { setFailedOwner(controller); }
    }
  }
  return <section className="plain-section" aria-labelledby="local-screen-counts-title">
    <h2 id="local-screen-counts-title">{m.title}</h2><p>{m.help}</p>
    <p role="status">{snapshot.retired ? m.unavailable : snapshot.enabled ? m.on : m.off}</p>
    {!snapshot.retired ? <>
      <table aria-label={m.title}><thead><tr><th scope="col">{m.screenColumn}</th><th scope="col">{m.countColumn}</th></tr></thead>
        <tbody>{SCREEN_CATEGORIES.map(category => <tr key={category}><th scope="row">{m.categoryLabels[category]}</th><td>{snapshot.counts[category]}</td></tr>)}</tbody>
      </table>
      <div className="actions">{snapshot.enabled ? <>
        <button id="local-screen-counts-opt-out" type="button" onClick={() => controller?.optOut()}>{m.optOut}</button>
        <button id="local-screen-counts-clear" type="button" onClick={() => controller?.clear()}>{m.clear}</button>
        <button id="local-screen-counts-review" type="button" onClick={() => controller?.reviewExport()}>{m.reviewExport}</button>
      </> : <button id="local-screen-counts-opt-in" type="button" onClick={() => controller?.optIn()}>{m.optIn}</button>}</div>
      {snapshot.preview ? <>
        <label htmlFor="local-screen-counts-export">{m.previewTitle}</label>
        <textarea id="local-screen-counts-export" className="diagnostics-export" rows={10} readOnly value={snapshot.preview.text} spellCheck={false} />
        <button id="local-screen-counts-download" type="button" onClick={download}>{m.download}</button>
        {failedOwner === controller ? <p role="alert">{m.exportUnavailable}</p> : null}
      </> : null}
    </> : null}
  </section>;
}
