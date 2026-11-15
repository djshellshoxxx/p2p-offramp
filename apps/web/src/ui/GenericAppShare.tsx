import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { messages as m } from './messages.ts';

// The current page owns the physical clipboard promise. Changing routes or
// mounting another view cannot cancel it or release admission before it settles.
let clipboardPending = false;
const clipboardListeners = new Set<() => void>();
const clipboardSnapshot = () => clipboardPending;
const clipboardServerSnapshot = () => false;
const subscribeClipboard = (listener: () => void) => {
  clipboardListeners.add(listener);
  return () => { clipboardListeners.delete(listener); };
};
function publishClipboardPending(value: boolean) {
  clipboardPending = value;
  for (const listener of [...clipboardListeners]) {
    if (!clipboardListeners.has(listener)) continue;
    try { listener(); } catch { /* A view cannot release or strand physical admission. */ }
  }
}

/** Display-only address supplied by the composition root; clipboard use requires this button. */
export function GenericAppShare({ appLink }: { readonly appLink: string | null }) {
  const owner = useMemo(() => ({ appLink }), [appLink]);
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const mounted = useRef(false), sequence = useRef(0);
  const busy = useSyncExternalStore(subscribeClipboard, clipboardSnapshot, clipboardServerSnapshot);
  const [notice, setNotice] = useState<{ readonly owner: typeof owner; readonly sequence: number; readonly kind: 'copied' | 'manual' } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current++; };
  }, []);

  async function copy() {
    if (!appLink || clipboardPending) return;
    const attempt = ++sequence.current, clickedOwner = owner;
    publishClipboardPending(true); setNotice(null);
    let kind: 'copied' | 'manual' = 'manual';
    try {
      const clipboard = navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        await clipboard.writeText(appLink); kind = 'copied';
      }
    } catch { /* A fixed manual fallback never reflects browser/private exception text. */ }
    finally {
      publishClipboardPending(false);
    }
    if (mounted.current && currentOwner.current === clickedOwner && sequence.current === attempt) setNotice({ owner: clickedOwner, sequence: attempt, kind });
  }

  const feedback = notice?.owner === owner && notice.sequence === sequence.current ? notice.kind : null;
  return <section className="plain-section" aria-labelledby="generic-app-share-title">
    <h2 id="generic-app-share-title">{m.shareAppTitle}</h2>
    <p id="generic-app-share-help">{m.shareAppHelp}</p>
    {appLink === null ? <p role="status">{m.shareAppUnavailable}</p> : <>
      <label htmlFor="generic-app-url">{m.shareAppUrl}</label>
      <input id="generic-app-url" type="text" readOnly value={appLink} autoComplete="off" spellCheck={false} aria-describedby="generic-app-share-help" onFocus={event => event.currentTarget.select()} />
      <div className="actions"><button type="button" disabled={busy} aria-busy={busy} onClick={() => void copy()}>{m.shareAppCopy}</button></div>
      <p role="status">{feedback === 'copied' ? m.shareAppCopied : feedback === 'manual' ? m.shareAppCopyUnavailable : ''}</p>
    </>}
  </section>;
}
