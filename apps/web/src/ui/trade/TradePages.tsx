import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { FavoriteState, ImportOutcome, SavedReviewFavoriteStore, StoredReview, TradeReviewController, TradeReviewSnapshot } from '../../trade/review-controller.ts';
import { tradePageMessages as p, tradeMessages } from './trade-messages.ts';
import { TradeTermsReview } from './TradeTermsReview.tsx';

const noSubscription = () => () => {};
const missingSnapshot: TradeReviewSnapshot = Object.freeze({ registry: Object.freeze({ kind: 'unavailable' }), job: Object.freeze({ kind: 'idle' }), reviews: Object.freeze([]),
  saved: Object.freeze({ kind: 'idle' }), unreviewable: Object.freeze([]), persistence:Object.freeze({unlocked:false,kind:'idle'}), favorites: Object.freeze({ kind: 'idle' }) });
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

/** Names the trusted source of the loaded registry: synthetic demo data, or the owner-signed Sepolia testnet registry. */
function RegistryBanner({ registry }: { readonly registry: Extract<TradeReviewSnapshot['registry'], { kind: 'ready' }> }) {
  if (registry.label === 'synthetic-demo') return <p className="warning" role="note">{p.demoBanner}</p>;
  if (registry.label === 'sepolia-local-proof') return registry.trust ? <p className="warning" role="note">{p.testnetLocalProofBanner(registry.trust.keyId, registry.trust.sequence, registry.trust.expiresAt)}</p> : null;
  return registry.trust ? <p className="warning" role="note">{p.testnetBanner(registry.trust.keyId, registry.trust.sequence, registry.trust.expiresAt)}</p> : null;
}

/** The open profile's saved-review commands, or null while no profile is unlocked. */
export type SavedStoreProp = { readonly store: SavedReviewFavoriteStore | null };

function SavedActions({ trade, item, store, busy, favorites }: { readonly trade: TradeReviewController; readonly item: StoredReview; readonly store: SavedReviewFavoriteStore | null; readonly busy: boolean; readonly favorites: FavoriteState }) {
  if (item.savedId !== null) return <>
    <small className="helper"> ({p.savedBadge})</small>
    {store && favorites.kind === 'ready' ? <>{' '}<button type="button" disabled={busy} aria-pressed={favorites.recordIds.includes(item.savedId)}
      onClick={() => { void trade.setReviewFavorite(item.savedId!, !favorites.recordIds.includes(item.savedId!), store); }}>
      {favorites.recordIds.includes(item.savedId) ? p.removeFavorite : p.addFavorite}</button></> : null}
    {store ? <>{' '}<button type="button" disabled={busy} onClick={() => { void trade.deleteSaved(item.savedId!, store); }}>{p.deleteFromProfile}</button></> : null}
  </>;
  return store ? <>{' '}<button type="button" disabled={busy} onClick={() => { void trade.saveToProfile(item.localId, store); }}>{p.saveToProfile}</button></> : null;
}

function FavoritesPanel({ trade, snapshot, store }: { readonly trade: TradeReviewController; readonly snapshot: TradeReviewSnapshot } & SavedStoreProp) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!store) return null;
  const favorites = snapshot.favorites, busy = snapshot.saved.kind === 'busy' || favorites.kind === 'busy';
  async function open(recordId: string) {
    const localId = await trade.openFavorite(recordId, store!);
    // A lock, switch, cancellation or unmounted page cannot navigate using a late private projection.
    if (mounted.current && localId && trade.find(localId)?.savedId === recordId) window.location.hash = `#/trade/${localId}`;
  }
  return <section className="plain-section" aria-label={p.favoritesTitle}>
    <h3>{p.favoritesTitle}</h3><p className="helper">{p.favoritesHelp}</p>
    <button type="button" disabled={busy} onClick={() => { void trade.loadFavorites(store); }}>{p.loadFavorites}</button>
    {favorites.kind === 'busy' ? <p className="notice" role="status">{p.favoritesBusy}{' '}
      <button type="button" onClick={() => trade.cancel()}>{p.cancelFavorites}</button></p> : null}
    {favorites.kind === 'failed' ? <p className="notice error" role="alert">{p.favoritesFailed}</p> : null}
    {favorites.kind === 'ready' ? favorites.recordIds.length === 0 ? <p role="status">{p.favoritesEmpty}</p> :
      <ul className="favorites-list">{favorites.recordIds.map(recordId => <li key={recordId}>
        <span>{p.favoriteItem(recordId)}</span>{' '}
        <button type="button" disabled={busy} onClick={() => { void open(recordId); }}>{p.openFavorite}</button>{' '}
        <button type="button" disabled={busy} onClick={() => { void trade.setReviewFavorite(recordId, false, store); }}>{p.removeFavorite}</button>
      </li>)}</ul> : null}
  </section>;
}

function SavedStatus({ snapshot, trade }: { readonly snapshot: TradeReviewSnapshot; readonly trade: TradeReviewController }) {
  const saved = snapshot.saved;
  if (saved.kind === 'busy') return <p className="notice" role="status">{p.savedBusy[saved.action]} <button type="button" onClick={()=>trade.cancel()}>{p.cancelPersistence}</button></p>;
  if (saved.kind === 'failed') return <p className="notice error" role="alert">{p.savedFailed[saved.code] ?? p.savedFailedOther}</p>;
  if (saved.kind === 'done') return <p className="notice" role="status">{p.savedDone[saved.action]}{saved.skipped > 0 ? ` ${p.savedSkipped(saved.skipped)}` : ''}</p>;
  return null;
}

function SavedPanel({ trade, snapshot, store }: { readonly trade: TradeReviewController; readonly snapshot: TradeReviewSnapshot } & SavedStoreProp) {
  const busy = snapshot.saved.kind === 'busy' || snapshot.favorites.kind === 'busy';
  return <section className="plain-section" aria-labelledby="saved-title">
    <h2 id="saved-title">{p.savedTitle}</h2><p className="helper">{p.savedHelp}</p>
    {!store ? <p>{p.savedLocked}</p> : <div className="actions">
      <button type="button" disabled={busy} onClick={() => { void trade.loadSaved(store); }}>{p.loadSaved}</button>
    </div>}
    <SavedStatus snapshot={snapshot} trade={trade} />
    <FavoritesPanel trade={trade} snapshot={snapshot} store={store} />
    {snapshot.unreviewable.length > 0 ? <>
      <h3>{p.unreviewableTitle}</h3>
      <ul className="session-list">{snapshot.unreviewable.map(item => <li key={item.recordId}>
        {p.unreviewableItem(item.recordId)}: {p.rejected[item.code]}
        {store ? <>{' '}<button type="button" disabled={busy} onClick={() => { void trade.deleteSaved(item.recordId, store); }}>{p.deleteFromProfile}</button></> : null}
      </li>)}</ul>
    </> : null}
  </section>;
}

function SessionList({ trade, snapshot, store }: { readonly trade: TradeReviewController; readonly snapshot: TradeReviewSnapshot } & SavedStoreProp) {
  return <section className="plain-section" aria-labelledby="session-title">
    <h2 id="session-title">{p.sessionTitle}</h2><p className="helper">{p.sessionHelp}</p>
    {snapshot.reviews.length === 0 ? <p>{p.sessionEmpty}</p> : <ul className="session-list">
      {snapshot.reviews.map(item => <li key={item.localId}>
        <a href={`#/trade/${item.localId}`}>{p.sessionItem(item.review.orderId, item.review.revision)}</a>
        {item.source === 'synthetic-sample' ? <small className="helper">{p.syntheticBadge}</small> : null}
        <SavedActions trade={trade} item={item} store={store} busy={snapshot.saved.kind === 'busy' || snapshot.favorites.kind === 'busy'} favorites={snapshot.favorites} />
        {' '}<button type="button" onClick={() => trade.remove(item.localId)}>{p.remove}</button>
      </li>)}
    </ul>}
  </section>;
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

export function OffersPage({ trade, store = null }: { readonly trade: TradeReviewController | null; readonly store?: SavedReviewFavoriteStore | null }) {
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
        : <><RegistryBanner registry={registry} /><ReviewForm trade={trade} snapshot={snapshot} /></>}
    </section>
    {trade && registry.kind === 'ready' ? <SavedPanel trade={trade} snapshot={snapshot} store={store} /> : null}
    {trade && registry.kind === 'ready' ? <SessionList trade={trade} snapshot={snapshot} store={store} /> : null}
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

export function TradePage({ trade, localId, store = null }: { readonly trade: TradeReviewController | null; readonly localId: string; readonly store?: SavedReviewFavoriteStore | null }) {
  const snapshot = useTradeReview(trade);
  const now = useDeviceSeconds(trade);
  const stored = snapshot.reviews.find(item => item.localId === localId) ?? null;
  if (!trade || !stored) return <section className="empty-state" aria-labelledby="trade-missing-title">
    <h2 id="trade-missing-title">{p.tradeMissingTitle}</h2><p>{p.tradeMissing}</p>
    <div className="actions"><a href="#/offers">{p.backToOffers}</a></div>
  </section>;
  return <>
    {snapshot.registry.kind === 'ready' ? <RegistryBanner registry={snapshot.registry} /> : null}
    {stored.loaded && stored.source === 'synthetic-sample' ? <p className="warning">{tradeMessages.sourceSynthetic}</p> : null}
    <TradeTermsReview review={stored.review} nowSeconds={now} source={stored.loaded ? 'saved-review' : stored.source} />
    <div className="actions">
      <a href="#/offers">{p.backToOffers}</a>
      <SavedActions trade={trade} item={stored} store={store} busy={snapshot.saved.kind === 'busy' || snapshot.favorites.kind === 'busy'} favorites={snapshot.favorites} />
      <button type="button" onClick={() => { trade.remove(localId); window.location.hash = '#/offers'; }}>{p.remove}</button>
    </div>
    <SavedStatus snapshot={snapshot} trade={trade} />
    <FavoritesPanel trade={trade} snapshot={snapshot} store={store} />
  </>;
}
