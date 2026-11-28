import { useLayoutEffect, useRef, useState } from 'react';
import type { AssetUpdateController, UpdateError, UpdateReview } from '../../../../packages/security/update-view.ts';
import { message, messageGroup } from './locale/runtime.ts';

const u = messageGroup('updates');
type Notice = { readonly kind: 'none' | 'untrusted' | 'stale' | 'unreachable' | 'cancelled' | 'accepted' | 'failed' | 'acceptFailed'; readonly code?: UpdateError } | null;
type Candidate = { readonly owner: AssetUpdateController; readonly epoch: number; readonly token: object; readonly review: UpdateReview };

function reason(code: UpdateError): string {
  switch (code) {
    case 'UNCONFIGURED': return u.unconfigured;
    case 'BACKUP_REQUIRED': return u.backupRequired;
    case 'BUSY': return u.busy;
    case 'POLICY_BLOCKED': case 'ROUTE_UNAVAILABLE': return u.routeBlocked;
    case 'SCHEMA_INCOMPATIBLE': return u.schemaBlocked;
    case 'STORAGE_UNAVAILABLE': case 'CONFLICT': return u.storageBlocked;
    case 'ORIGIN_UNSUPPORTED': case 'INVALID_ENDPOINT': return u.originBlocked;
    case 'MANIFEST_EXPIRED': case 'RELEASE_ROLLBACK': return u.stale;
    case 'CANCELLED': return u.cancelled;
    case 'TIMEOUT': case 'UNAVAILABLE': return u.unreachable;
    case 'LIMIT_EXCEEDED': return u.limitExceeded;
    default: return u.untrusted;
  }
}

/** Display-only projection. Destinations and asset paths are text, never navigation links. */
export function SignedUpdateReview({ review }: { readonly review: UpdateReview }) {
  const field = (label: string, value: string | number) => <><dt>{label}</dt><dd><code className="exact"><bdi dir="ltr">{value}</bdi></code></dd></>;
  return <div className="update-review">
    <h3>{u.reviewTitle}</h3>
    <h4>{u.currentTitle}</h4><dl className="terms">
      {field(u.sequence, review.current.sequence)}{field(u.manifestDigest, review.current.manifestSha256)}{field(u.keyFingerprint, review.current.keyId)}
    </dl>
    <h4>{u.candidateTitle}</h4><dl className="terms">
      {field(u.releaseId, review.candidate.releaseId)}{field(u.sequence, review.candidate.sequence)}
      {field(u.manifestDigest, review.candidate.manifestSha256)}{field(u.keyFingerprint, review.candidate.keyId)}
      {field(u.sourceCommit, review.candidate.sourceCommit)}{field(u.predecessor, review.candidate.predecessorDigest ?? u.noPredecessor)}
      {field(u.minSchema, review.minStorageSchema)}{field(u.maxSchema, review.maxStorageSchema)}{field(u.destination, review.destination)}
    </dl>
    <p>{u.changesAbsent}</p>
    {review.freshOriginAcceptedState ? <p className="warning">{u.freshOrigin}</p> : null}
    <details><summary>{message('updates', 'assetsSummary', { count: review.assets.length })}</summary>
      <ul>{review.assets.map(asset => <li key={asset.path}><dl className="terms">
        {field(u.assetPath, asset.path)}{field(u.assetBytes, asset.bytes)}{field(u.assetDigest, asset.sha256)}
      </dl></li>)}</ul>
    </details>
    <p className="warning">{u.recoveryRequired}</p><p>{u.disabled}</p>
  </div>;
}

/** Optional, exclusive UI consumer of an already-constructed controller. The owner
 * retains disposal and all trust, backup, wallet, transport and gesture authority.
 * A profile lock is not a UI cancellation signal: acceptance intentionally locks
 * its own selection, which the controller's exact runtime lease must authenticate. */
export function SignedUpdatePanel({ controller = null }: { readonly controller?: AssetUpdateController | null }) {
  const mounted = useRef(false), epoch = useRef(0), request = useRef<AbortController | null>(null);
  const owner = useRef(controller), candidate = useRef<Candidate | null>(null);
  owner.current = controller;
  const [review, setReview] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState<'check' | 'accept' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [consent, setConsent] = useState(false);

  const retire = () => {
    epoch.current++; request.current?.abort(); request.current = null; candidate.current = null;
    try { controller?.cancel(); } catch { /* Retirement never adopts a controller error as display copy. */ }
    setReview(null); setBusy(null); setConsent(false);
  };
  useLayoutEffect(() => {
    mounted.current = true; setReview(null); setBusy(null); setConsent(false); setNotice(null);
    const hide = () => {
      if (document.visibilityState === 'hidden') { retire(); setNotice({ kind: 'cancelled' }); }
    };
    const leave = () => { retire(); setNotice({ kind: 'cancelled' }); };
    // The inert default has no request or candidate to retire. Do not claim a
    // Settings visibility listener until an actual controller is injected.
    if (controller) { document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave); }
    return () => {
      mounted.current = false; epoch.current++; request.current?.abort(); request.current = null; candidate.current = null;
      try { controller?.cancel(); } catch { /* The injected owner retains disposal responsibility. */ }
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave);
    };
  }, [controller]);

  async function run(kind: 'check' | 'accept') {
    if (!controller || !mounted.current || request.current || document.visibilityState === 'hidden') return;
    const selected = candidate.current;
    if (kind === 'accept' && (!consent || !selected || selected.owner !== controller || selected.epoch !== epoch.current)) return;
    const abort = new AbortController(), captured = epoch.current;
    request.current = abort; candidate.current = null; setReview(null); setConsent(false); setNotice(null); setBusy(kind);
    const current = () => mounted.current && owner.current === controller && captured === epoch.current &&
      request.current === abort && !abort.signal.aborted && document.visibilityState !== 'hidden';
    try {
      if (kind === 'check') {
        const result = await controller.checkForUpdate(abort.signal);
        if (!current()) return;
        if (result.kind === 'candidate') {
          const next = { owner: controller, epoch: captured, token: result.candidate, review: result.review };
          candidate.current = next; setReview(next);
        } else setNotice(result.kind === 'none' ? { kind: 'none' } : { kind: result.kind, code: result.reason });
      } else {
        // This call occurs in the original click task, before awaiting anything.
        // Only the trusted controller's owner can attest a real user gesture.
        const result = await controller.acceptUpdate(selected!.token, abort.signal);
        if (current()) setNotice(result.ok ? { kind: 'accepted' } : { kind: 'acceptFailed', code: result.error.code });
      }
    } catch { if (current()) setNotice({ kind: kind === 'accept' ? 'acceptFailed' : 'failed' }); }
    finally {
      if (request.current === abort) {
        request.current = null;
        if (mounted.current && owner.current === controller && captured === epoch.current) setBusy(null);
      }
    }
  }

  const visible = review?.owner === controller && review.epoch === epoch.current && candidate.current === review ? review.review : null;
  const error = notice && ['untrusted', 'stale', 'unreachable', 'failed', 'acceptFailed'].includes(notice.kind);
  return <section className="plain-section" aria-labelledby="signed-update-title" aria-busy={busy !== null}>
    <h2 id="signed-update-title">{u.title}</h2><p>{u.intro}</p>
    {!controller ? <p role="status">{u.unconfigured}</p> : <p>{u.configuredScope}</p>}
    <div className="actions">
      <button type="button" disabled={!controller || busy !== null} onClick={() => { void run('check'); }}>{u.check}</button>
      {busy || visible ? <button type="button" onClick={() => { retire(); setNotice({ kind: 'cancelled' }); }}>{u.cancel}</button> : null}
      <a href="#/recovery">{u.backupAction}</a>
    </div>
    {busy ? <p role="status">{busy === 'check' ? u.checking : u.accepting}</p> : null}
    {notice ? <div className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>
      <p>{u[notice.kind]}</p>{notice.code ? <p>{reason(notice.code)}</p> : null}
    </div> : null}
    {visible ? <>
      <SignedUpdateReview review={visible} />
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.currentTarget.checked)} />{u.consent}</label>
      <div className="actions"><button type="button" className="primary" disabled={!consent || busy !== null}
        onClick={event => { if (event.isTrusted) void run('accept'); }}>{u.accept}</button></div>
    </> : null}
  </section>;
}
