import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AppServices } from '../app-services.ts';
import type { SavedReviewStore, TradeReviewController } from '../trade/review-controller.ts';
import type { RuntimeReviewFavorites } from '../../../../packages/schemas/index.ts';
import { messages as m } from './messages.ts';

export type FavoriteStore = SavedReviewStore & Pick<AppServices, 'listReviewFavorites' | 'setReviewFavorite' | 'selectionScope' | 'getSnapshot' | 'subscribe'>;
export function favoriteStoreOf(store: SavedReviewStore | null): FavoriteStore | null {
  const candidate = store as Partial<FavoriteStore> | null;
  return candidate && ['listReviewFavorites', 'setReviewFavorite', 'selectionScope', 'getSnapshot', 'subscribe'].every(key =>
    typeof candidate[key as keyof FavoriteStore] === 'function') ? candidate as FavoriteStore : null;
}
/** A prior in-memory review never supplies the open result: loadSaved must finish its existing fresh checks. */
export async function openFavoriteSavedReview(trade: TradeReviewController, store: SavedReviewStore, recordId: string, isCurrent: () => boolean): Promise<string | null> {
  try {
    if (!/^[0-9a-f]{32}$/.test(recordId) || !isCurrent() || trade.getSnapshot().saved.kind === 'busy' || trade.getSnapshot().registry.kind !== 'ready') return null;
    const previousTarget = trade.getSnapshot().reviews.find(row => row.savedId === recordId);
    await trade.loadSaved(store);
    if (!isCurrent()) return null;
    const snapshot = trade.getSnapshot(), saved = snapshot.saved;
    if (saved.kind !== 'done' && !(saved.kind === 'failed' && saved.code === 'INVALID_SAVED_REVIEW') || !('action' in saved) || saved.action !== 'load') return null;
    const target = snapshot.reviews.find(row => row.savedId === recordId);
    // Malformed-load failures can retain the old session snapshot. Only the existing loader's freshly replaced
    // record may open; an unrelated unreviewable row does not invalidate an independently replaced target.
    return target && target !== previousTarget && isCurrent() ? target.localId : null;
  } catch { return null; }
}
export interface ReviewFavoritesModel {
  readonly store: FavoriteStore | null; readonly value: RuntimeReviewFavorites | null;
  readonly busy: boolean; readonly failed: boolean; readonly unavailable: boolean;
  load(): Promise<void>; set(recordId: string, favorite: boolean): Promise<void>; open(recordId: string): Promise<void>;
}
interface Owner { readonly store: FavoriteStore | null; readonly scope: number; readonly trade: TradeReviewController | null; }
interface View { readonly owner: Owner; readonly value: RuntimeReviewFavorites | null; readonly busy: boolean; readonly failed: boolean; readonly unavailable: boolean; }
const noSubscribe = (): (() => void) => () => undefined;
/** One physical operation per mounted consumer. Selection retirement cancels but never releases its held slot. */
export function useReviewFavorites(store: FavoriteStore | null, trade: TradeReviewController | null): ReviewFavoritesModel {
  const scope = useSyncExternalStore(store?.subscribe ?? noSubscribe, () => store?.selectionScope() ?? 0, () => 0);
  const owner = useRef<Owner>({ store, scope, trade });
  if (owner.current.store !== store || owner.current.scope !== scope || owner.current.trade !== trade) owner.current = { store, scope, trade };
  const mine = owner.current, mounted = useRef(false);
  const [state, setState] = useState<View>({ owner: mine, value: null, busy: false, failed: false, unavailable: false });
  const active = useRef<{ readonly owner: Owner; readonly controller: AbortController } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (active.current?.owner === mine) active.current.controller.abort(); };
  }, [mine]);
  const view = state.owner === mine ? state : { owner: mine, value: null, busy: false, failed: false, unavailable: false };
  const current = (): boolean => {
    if (!mounted.current || owner.current !== mine || owner.current.trade !== trade || !store) return false;
    try { return store.selectionScope() === scope && store.getSnapshot().state === 'unlocked' && store.selectionScope() === scope && owner.current === mine && mounted.current; }
    catch { return false; }
  };
  const run = async (work: (signal: AbortSignal) => Promise<Partial<View>>): Promise<void> => {
    if (active.current || !current()) return;
    const job = { owner: mine, controller: new AbortController() }; active.current = job;
    setState({ ...view, busy: true, failed: false, unavailable: false });
    try {
      const update = await work(job.controller.signal);
      if (current() && !job.controller.signal.aborted) setState({ ...view, ...update, owner: mine, busy: false });
    } catch { if (current() && !job.controller.signal.aborted) setState({ ...view, value: null, busy: false, failed: true, unavailable: false }); }
    finally { if (active.current === job) { active.current = null; if (mounted.current && owner.current !== mine) setState(previous => ({ ...previous })); } }
  };
  return {
    store, value: view.value, busy: view.busy || active.current !== null, failed: view.failed, unavailable: view.unavailable,
    load: () => run(async signal => { const result = await store!.listReviewFavorites(signal); if (!result.ok) throw Error(); return { value: result.value }; }),
    set: (recordId, favorite) => run(async signal => {
      if (!view.value) throw Error();
      const result = await store!.setReviewFavorite(recordId, favorite, view.value.revision, signal);
      if (!result.ok || !result.value.sessionCurrent) throw Error();
      const recordIds = favorite ? view.value.recordIds.includes(recordId) ? view.value.recordIds : [...view.value.recordIds, recordId] : view.value.recordIds.filter(id => id !== recordId);
      return { value: { revision: result.value.revision, recordIds: Object.freeze(recordIds) } };
    }),
    open: recordId => run(async () => {
      if (!trade || !view.value?.recordIds.includes(recordId)) return { unavailable: true };
      const localId = await openFavoriteSavedReview(trade, store!, recordId, current);
      if (localId && current()) window.location.hash = `#/trade/${localId}`;
      return { unavailable: localId === null };
    }),
  };
}
export function FavoriteReviewAction({ model, recordId, disabled = false }: { readonly model: ReviewFavoritesModel; readonly recordId: string; readonly disabled?: boolean }) {
  if (!model.store) return null;
  const favorite = model.value?.recordIds.includes(recordId) ?? false;
  return <button type="button" disabled={disabled || model.busy || !model.value} aria-pressed={favorite}
    onClick={() => { void model.set(recordId, !favorite); }}>{favorite ? m.favorites.unstar : m.favorites.star}</button>;
}
export function FavoriteSavedReviews({ model }: { readonly model: ReviewFavoritesModel }) {
  return <section className="plain-section" aria-labelledby="favorites-title">
    <h2 id="favorites-title">{m.favorites.title}</h2><p className="helper">{m.favorites.help}</p>
    {!model.store ? <p>{m.favorites.locked}</p> : <>
      <button type="button" disabled={model.busy} onClick={() => { void model.load(); }}>{m.favorites.load}</button>
      <p className="helper">{m.favorites.retained}</p>
      {model.value?.recordIds.length === 0 ? <p>{m.favorites.empty}</p> : null}
      {model.value && model.value.recordIds.length > 0 ? <ul className="favorite-list">{model.value.recordIds.map(recordId => <li key={recordId}>
        <bdi className="canonical">{recordId}</bdi>{' '}
        <button type="button" disabled={model.busy} onClick={() => { void model.open(recordId); }}>{m.favorites.open}</button>{' '}
        <FavoriteReviewAction model={model} recordId={recordId} />
      </li>)}</ul> : null}
    </>}
    {model.busy ? <p role="status">{m.favorites.busy}</p> : null}
    {model.failed ? <p className="notice error" role="alert">{m.favorites.failed}</p> : null}
    {model.unavailable ? <p className="notice" role="status">{m.favorites.unavailable}</p> : null}
  </section>;
}
