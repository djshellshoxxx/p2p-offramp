import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AppServices, RuntimeErrorCode, RuntimeRetentionPreview } from '../app-services.ts';
import { message, messageGroup } from './locale/runtime.ts';
import { errorMessage } from './routes.ts';

const m = messageGroup('shell');
const noSubscribe = () => () => {}, noScope = () => 0;
const locked = Object.freeze({ state: 'locked' as const }), lockedSnapshot = () => locked;
interface Selection { readonly owner: AppServices; readonly scope: number; readonly profileId: string; }
interface Request { readonly selection: Selection; readonly controller: AbortController; }
type View = { readonly selection: Selection } & (
  { readonly kind: 'pending' | 'cancelled' } |
  { readonly kind: 'preview'; readonly value: RuntimeRetentionPreview } |
  { readonly kind: 'error'; readonly code: RuntimeErrorCode }
);

/** Explicit offline counts only. A preview never supplies record IDs or deletion authority. */
export function RetentionPreviewPanel({ services }: { readonly services: AppServices | null }) {
  const status = useSyncExternalStore(services?.subscribe ?? noSubscribe, services?.getSnapshot ?? lockedSnapshot, lockedSnapshot);
  const scope = useSyncExternalStore(services?.subscribe ?? noSubscribe, services?.selectionScope ?? noScope, noScope);
  const profileId = services?.profileId ?? null;
  const request = useRef<Request | null>(null), mounted = useRef(true), owner = useRef(services);
  const [view, setView] = useState<View | null>(null);
  owner.current = services;

  function retire() {
    const previous = request.current; request.current = null;
    previous?.controller.abort();
  }
  useLayoutEffect(() => {
    mounted.current = true; retire(); setView(null);
    // Subscribe to selection invalidation as well as rendering it. A lock and
    // same-profile reopen can occur between renders; neither may retain counts.
    const stop = services?.subscribe(() => {
      if (owner.current !== services) return;
      if (services.current.state !== 'unlocked' || services.selectionScope() !== scope || services.profileId !== profileId) {
        retire(); setView(null);
      }
    });
    return () => { mounted.current = false; stop?.(); retire(); };
  }, [services, scope, profileId, status.state]);

  const selected = (selection: Selection) => owner.current === selection.owner && selection.owner === services &&
    selection.owner.current.state === 'unlocked' && selection.owner.selectionScope() === selection.scope &&
    selection.owner.profileId === selection.profileId;
  const visible = view && selected(view.selection) ? view : null;
  const busy = visible?.kind === 'pending';

  async function preview() {
    // Own the first request before the disabled state renders. A retained handler
    // also cannot start an inspection for a newly selected profile.
    if (!mounted.current || request.current || !services || owner.current !== services ||
        services.current.state !== 'unlocked' || services.selectionScope() !== scope ||
        profileId === null || services.profileId !== profileId) return;
    const selection: Selection = { owner: services, scope, profileId };
    const job: Request = { selection, controller: new AbortController() };
    request.current = job; setView({ selection, kind: 'pending' });
    const current = () => mounted.current && request.current === job && !job.controller.signal.aborted && selected(selection);
    try {
      const result = await services.planRetention(Date.now(), job.controller.signal);
      if (!current()) return;
      setView(result.ok ? { selection, kind: 'preview', value: result.value } : result.error.code === 'CANCELLED'
        ? { selection, kind: 'cancelled' } : { selection, kind: 'error', code: result.error.code });
    } catch { if (current()) setView({ selection, kind: 'error', code: 'PROTOCOL_ERROR' }); }
    finally { if (request.current === job) request.current = null; }
  }
  function cancel() {
    const job = request.current;
    retire();
    if (mounted.current) setView(job && selected(job.selection) ? { selection: job.selection, kind: 'cancelled' } : null);
  }

  return <section className="panel" aria-labelledby="retention-title" aria-busy={busy}>
    <h2 id="retention-title">{m.retentionTitle}</h2><p>{m.retentionHelp}</p>
    <p className="warning">{m.retentionUnavailable}</p><p className="helper">{m.retentionProtected}</p>
    <p className="helper">{m.retentionLimits}</p><p className="helper">{m.retentionRestoreWarning}</p>
    {!services ? <p role="status">{m.unavailable}</p> : status.state !== 'unlocked' ? <p role="status">{m.retentionLocked}</p> : null}
    <div className="actions">
      <button type="button" disabled={status.state !== 'unlocked' || !services || busy} onClick={() => { void preview(); }}>{m.retentionPlan}</button>
      {busy ? <button type="button" onClick={cancel}>{m.retentionCancel}</button> : null}
    </div>
    {busy ? <p role="status">{m.retentionBusy}</p> : null}
    {visible?.kind === 'cancelled' ? <p className="notice" role="status">{m.retentionCancelled}</p> : null}
    {visible?.kind === 'error' ? <p className="notice error" role="alert">{errorMessage(visible.code)}</p> : null}
    {visible?.kind === 'preview' ? <div className="notice" role="status">
      <p>{message('shell', 'retentionCounts', { archive: visible.value.archiveReviewCount, reviewed: visible.value.reviewedDeleteCount,
        protected: visible.value.protectedCount, revision: visible.value.revision })}</p>
      <p className="helper">{m.retentionSnapshot}</p>
    </div> : null}
  </section>;
}
