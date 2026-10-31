import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { ImportOutcome, TradeReviewController, TradeReviewSnapshot } from '../../trade/review-controller.ts';
import { tradePageMessages as p } from './trade-messages.ts';
import { TradeTermsReview } from './TradeTermsReview.tsx';

const noSubscription = () => () => {};
const missingSnapshot: TradeReviewSnapshot = Object.freeze({ registry: Object.freeze({ kind: 'unavailable' }), job: Object.freeze({ kind: 'idle' }), reviews: Object.freeze([]), persistence: Object.freeze({ unlocked: false, kind: 'idle' }) });
const missing = () => missingSnapshot;

export function useTradeReview(trade: TradeReviewController | null): TradeReviewSnapshot {
  return useSyncExternalStore(trade?.subscribe ?? noSubscription, trade?.getSnapshot ?? missing, trade?.getSnapshot ?? missing);
}

function JobStatus({ snapshot }: { readonly snapshot: TradeReviewSnapshot }) {
  const { job } = snapshot;
  if (job.kind === 'busy') return <p className="notice" role="status">{job.step === 'reading' ? p.reading : p.checking}</p>;
  if (job.kind === 'cancelled') return <p className="notice" role="status">{p.cancelled}</p>;
  if (job.kind === 'rejected') return <p className="notice error" role="alert">{p.rejected[job.code]}</p>;
  if (job.kind === 'accepted') return <p className="notice" role="status">{p.accepted} <a href={`#/trade/${job.localId}`}>{p.openReview}</a></p>;
  return null;
}

function SessionList({ trade, snapshot }: { readonly trade: TradeReviewController; readonly snapshot: TradeReviewSnapshot }) {
  const busy = snapshot.persistence.kind === 'busy' || snapshot.job.kind === 'busy';
  return <section className="plain-section" aria-labelledby="session-title">
    <h2 id="session-title">{p.sessionTitle}</h2><p className="helper">{p.sessionHelp}</p>
    <p className="helper">{p.persistenceHelp}</p>
    <button type="button" disabled={!snapshot.persistence.unlocked || busy} onClick={() => { void trade.loadSaved(); }}>{p.loadSaved}</button>
    <PersistenceStatus trade={trade} snapshot={snapshot} />
    {snapshot.reviews.length === 0 ? <p>{p.sessionEmpty}</p> : <ul className="session-list">
      {snapshot.reviews.map(item => <li key={item.localId}>
        <a href={`#/trade/${item.localId}`}>{p.sessionItem(item.review.orderId, item.review.revision)}</a>
        {item.source === 'synthetic-sample' ? <small className="helper"> (synthetic)</small> : null}
        {' '}<button type="button" onClick={() => trade.remove(item.localId)}>{p.remove}</button>
        {' '}<button type="button" disabled={!snapshot.persistence.unlocked || busy} onClick={() => { void trade.save(item.localId); }}>{p.save}</button>
      </li>)}
    </ul>}
  </section>;
}

function PersistenceStatus({ trade, snapshot }: { readonly trade: TradeReviewController; readonly snapshot: TradeReviewSnapshot }) {
  const state = snapshot.persistence;
  if (state.kind === 'busy') return <p className="notice" role="status">{p.persistenceBusy} <button type="button" onClick={() => trade.cancel()}>{p.cancelPersistence}</button></p>;
  if (state.kind === 'saved') return <p className="notice" role="status">{p.persistenceSaved}</p>;
  if (state.kind === 'loaded') return <p className="notice" role="status">{p.persistenceLoaded}</p>;
  if (state.kind === 'failed') return <p className="notice error" role="alert">{state.code === 'QUOTA_EXCEEDED' ? p.persistenceQuota : state.code === 'INVALID_SAVED_REVIEW' ? p.persistenceInvalid : p.persistenceFailed}</p>;
  return null;
}

function ReviewForm({ trade, snapshot }: { readonly trade: TradeReviewController; readonly snapshot: TradeReviewSnapshot }) {
  const mounted = useRef(true);
  const [missingFile, setMissingFile] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const busy = snapshot.job.kind === 'busy';
  const follow = (outcome: ImportOutcome) => {
    // Navigate only for this page's own, still-current result.
    if (mounted.current && outcome.kind === 'accepted') window.location.hash = `#/trade/${outcome.localId}`;
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = event.currentTarget.elements.namedItem('terms-file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { setMissingFile(true); return; }
    setMissingFile(false);
    follow(await trade.importFile(file));
  }
  const registry = snapshot.registry;
  return <>
    <form onSubmit={submit} noValidate aria-label={p.reviewTitle} aria-busy={busy}>
      <label htmlFor="terms-file">{p.fileLabel}</label>
      <input id="terms-file" name="terms-file" type="file" accept="application/json,.json" disabled={busy} />
      <p className="helper">{p.fileHelp}</p>
      {missingFile ? <p className="notice error" role="alert">{p.fileRequired}</p> : null}
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>{p.check}</button>
        {busy ? <button type="button" onClick={() => trade.cancel()}>{p.cancel}</button> : null}
      </div>
    </form>
    {registry.kind === 'ready' && registry.samples.length > 0 ? <section aria-labelledby="samples-title">
      <h3 id="samples-title">{p.samplesTitle}</h3><p className="helper">{p.samplesHelp}</p>
      <div className="actions">{registry.samples.map(sample => <button key={sample.id} type="button" disabled={busy}
        onClick={() => { void trade.importSample(sample.id).then(follow); }}>{sample.label}</button>)}</div>
    </section> : null}
    <JobStatus snapshot={snapshot} />
  </>;
}

export function OffersPage({ trade }: { readonly trade: TradeReviewController | null }) {
  const snapshot = useTradeReview(trade);
  const registry = snapshot.registry;
  return <>
    <section className="empty-state" aria-labelledby="discovery-title">
      <h2 id="discovery-title">{p.discoveryTitle}</h2><p>{p.discoveryHelp}</p>
    </section>
    <section className="panel" aria-labelledby="review-title">
      <h2 id="review-title">{p.reviewTitle}</h2><p>{p.reviewHelp}</p>
      {registry.kind === 'loading' ? <p className="notice" role="status">{p.registryLoading}</p>
        : registry.kind === 'unavailable' || !trade ? <p className="notice" role="status">{p.registryUnavailable}</p>
        : registry.kind === 'failed' ? <p className="notice error" role="alert">{p.registryFailed}</p>
        : <>{registry.label === 'synthetic-demo' ? <p className="warning" role="note">{p.demoBanner}</p> : null}<ReviewForm trade={trade} snapshot={snapshot} /></>}
    </section>
    {trade && registry.kind === 'ready' ? <SessionList trade={trade} snapshot={snapshot} /> : null}
  </>;
}

/** Re-reads the device clock every 15 s so deadlines and the expired blocker update while the page is open. Display only. */
function useDeviceSeconds(trade: TradeReviewController | null): string {
  const [now, setNow] = useState(() => trade?.nowSeconds() ?? '0');
  useEffect(() => {
    if (!trade) return;
    setNow(trade.nowSeconds());
    const timer = setInterval(() => setNow(trade.nowSeconds()), 15_000);
    return () => clearInterval(timer);
  }, [trade]);
  return now;
}

export function TradePage({ trade, localId }: { readonly trade: TradeReviewController | null; readonly localId: string }) {
  const snapshot = useTradeReview(trade);
  const now = useDeviceSeconds(trade);
  const stored = snapshot.reviews.find(item => item.localId === localId) ?? null;
  if (!trade || !stored) return <section className="empty-state" aria-labelledby="trade-missing-title">
    <h2 id="trade-missing-title">{p.tradeMissingTitle}</h2><p>{p.tradeMissing}</p>
    <div className="actions"><a href="#/offers">{p.backToOffers}</a></div>
  </section>;
  return <>
    {snapshot.registry.kind === 'ready' && snapshot.registry.label === 'synthetic-demo' ? <p className="warning" role="note">{p.demoBanner}</p> : null}
    <TradeTermsReview review={stored.review} nowSeconds={now} source={stored.source} />
    <p className="helper">{p.persistenceHelp}</p>
    <PersistenceStatus trade={trade} snapshot={snapshot} />
    <div className="actions">
      <a href="#/offers">{p.backToOffers}</a>
      <button type="button" disabled={!snapshot.persistence.unlocked || snapshot.persistence.kind === 'busy' || snapshot.job.kind === 'busy'} onClick={() => { void trade.save(localId); }}>{p.save}</button>
      <button type="button" onClick={() => { trade.remove(localId); window.location.hash = '#/offers'; }}>{p.remove}</button>
    </div>
  </>;
}
