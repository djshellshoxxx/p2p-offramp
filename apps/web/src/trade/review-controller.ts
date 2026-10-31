/**
 * In-memory trade-terms review session for the document. Owns every asynchronous import it starts: a newer import or
 * cancel() supersedes older work, and results from superseded or disposed work are discarded. Cancelling only stops
 * this local check; nothing here contacts a wallet, relay or chain, so there is no external action to retract.
 *
 * Session reviews are kept in memory (unsaved ones bounded, oldest evicted) and are lost on reload. A review can also be
 * saved in the open encrypted profile through a SavedReviewStore (the Worker's saved-terms-review commands). Only the
 * original terms bytes are stored; loading re-runs the review against the current registry, so a saved file never
 * bypasses today's checks. Locking calls forgetSaved(): reviews loaded from the profile leave memory and any saved-review
 * result still in flight is discarded.
 */
import { MAX_TERMS_REVIEW_BYTES, reviewTermsBytes, type RegistryLookup, type ReviewedEvmTerms, type TermsReviewRejection, type TermsReviewResult } from '../../../../packages/domain/index.ts';
import type { AppServices } from '../app-services.ts';
import type { RuntimeErrorCode, RuntimeResult, RuntimeSavedReviewRef, RuntimeSavedReviews } from '../../../../packages/schemas/index.ts';

export const MAX_SESSION_REVIEWS = 8;

export interface TermsSample {
  readonly id: string;
  readonly label: string;
  /** Produces document bytes; receives the device clock in unix seconds so samples can be relative to now. */
  load(nowSeconds: bigint): Promise<Uint8Array>;
}
/** Which trusted composition supplied the registry: synthetic local demo data, or the owner-signed Sepolia registry. */
export type RegistryLabel = 'synthetic-demo' | 'sepolia-testnet' | 'sepolia-local-proof';
/** Public facts about a verified testnet registry, for display (manifest sequence, expiry in unix seconds). */
export interface RegistryTrustSummary { readonly keyId: string; readonly sequence: number; readonly expiresAt: number; }
export type RegistrySourceResult =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly label: RegistryLabel; readonly registry: RegistryLookup; readonly samples: readonly TermsSample[]; readonly trust?: RegistryTrustSummary };
/** Trusted composition input. Only the demo and testnet builds supply a ready source; the default build has no approved registry. */
export type RegistrySource = () => Promise<RegistrySourceResult>;
export const noApprovedRegistry: RegistrySource = async () => ({ kind: 'unavailable' });

export type RegistryState =
  | { readonly kind: 'loading' } | { readonly kind: 'unavailable' } | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly label: RegistryLabel; readonly samples: readonly Pick<TermsSample, 'id' | 'label'>[]; readonly trust: RegistryTrustSummary | null };
export type ImportRejection = TermsReviewRejection | 'FILE_UNREADABLE' | 'REGISTRY_NOT_READY';
export type ImportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy'; readonly step: 'reading' | 'checking' }
  | { readonly kind: 'rejected'; readonly code: ImportRejection }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'accepted'; readonly localId: string };
export type ReviewSource = 'file' | 'synthetic-sample';
export interface StoredReview {
  readonly localId: string; readonly review: ReviewedEvmTerms; readonly source: ReviewSource;
  /** The exact reviewed bytes, kept so the review can be saved without re-reading the file. */
  readonly bytes: Uint8Array;
  /** Record id in the open profile, or null when only in this session. */
  readonly savedId: string | null;
  /** True when this review came from the profile (removed again on lock). */
  readonly loaded: boolean;
}
/** Saved bytes that no longer pass review against the current registry (for example an expired deadline). */
export interface UnreviewableSaved { readonly recordId: string; readonly code: ImportRejection; }
export type SavedErrorCode = RuntimeErrorCode | 'REGISTRY_NOT_READY' | 'INVALID_SAVED_REVIEW' | 'REVIEW_MISSING' | 'UNKNOWN_OUTCOME';
export type ReviewPersistencePort = Pick<AppServices, 'getSnapshot' | 'subscribe' | 'selectionScope' | 'saveTermsReview' | 'listTermsReviews' | 'deleteTermsReview'>;
export interface PersistenceState { readonly unlocked: boolean; readonly kind: 'idle' | 'busy' | 'saved' | 'loaded' | 'failed'; readonly code?: string; }
export type SavedState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy'; readonly action: 'save' | 'load' | 'delete' }
  | { readonly kind: 'done'; readonly action: 'save' | 'load' | 'delete'; readonly skipped: number }
  | { readonly kind: 'failed'; readonly action: 'save' | 'load' | 'delete'; readonly code: SavedErrorCode };
export interface TradeReviewSnapshot {
  readonly registry: RegistryState;
  readonly job: ImportState;
  readonly reviews: readonly StoredReview[];
  readonly saved: SavedState;
  readonly unreviewable: readonly UnreviewableSaved[];
  readonly persistence: PersistenceState;
}
/** The open profile's saved-review commands (AppServices). Results are bound to that profile by the runtime. */
export interface SavedReviewStore {
  saveTermsReview(source: ReviewSource, bytes: Uint8Array, signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviewRef>>;
  listTermsReviews(signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviews>>;
  deleteTermsReview(recordId: string, signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviewRef>>;
}
/** `stale` means a newer import, cancel() or dispose() superseded this call; its result was discarded. */
export type ImportOutcome = ImportState | { readonly kind: 'stale' };

export interface TradeReviewOptions {
  readonly source: RegistrySource;
  readonly nowSeconds?: () => bigint;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly review?: (registry: RegistryLookup, bytes: Uint8Array) => Promise<TermsReviewResult>;
}
export interface FileLike { readonly size: number; arrayBuffer(): Promise<ArrayBuffer>; }

export interface TradeReviewController {
  getSnapshot(): TradeReviewSnapshot;
  subscribe(listener: () => void): () => void;
  /** Idempotent; later calls return the first load. */
  loadRegistry(): Promise<void>;
  importFile(file: FileLike): Promise<ImportOutcome>;
  importSample(id: string): Promise<ImportOutcome>;
  cancel(): void;
  /** Removes from this session only; a saved copy stays in the profile. */
  remove(localId: string): void;
  find(localId: string): StoredReview | null;
  saveToProfile(localId: string, store: SavedReviewStore): Promise<void>;
  loadSaved(store?: SavedReviewStore): Promise<void>;
  setPersistence(port: ReviewPersistencePort | null): void;
  save(localId: string): Promise<void>;
  deleteSaved(recordId: string, store: SavedReviewStore): Promise<void>;
  /** Call when the profile locks or changes: drops loaded reviews and discards in-flight saved-review results. */
  forgetSaved(): void;
  nowSeconds(): string;
  dispose(): void;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** 16 random bytes → 22 base64url characters, matching the `#/trade/<localId>` route. Never derived from terms. */
function localIdFrom(bytes: Uint8Array): string {
  if (bytes.byteLength !== 16) throw new Error('LOCAL_ID');
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 6) { bits -= 6; out += BASE64URL[(value >> bits) & 63]; }
  }
  if (bits > 0) out += BASE64URL[(value << (6 - bits)) & 63];
  return out;
}
function sameReview(a: ReviewedEvmTerms, b: ReviewedEvmTerms): boolean { return JSON.stringify(a) === JSON.stringify(b); }
/** Saved reviews are never evicted from memory; unsaved ones keep the newest MAX_SESSION_REVIEWS. */
function bounded(reviews: readonly StoredReview[]): readonly StoredReview[] {
  const unsaved = reviews.filter(item => item.savedId === null);
  const keep = new Set(unsaved.slice(-MAX_SESSION_REVIEWS));
  return Object.freeze(reviews.filter(item => item.savedId !== null || keep.has(item)));
}
const IDLE_SAVED: SavedState = Object.freeze({ kind: 'idle' });

export function createTradeReviewController(options: TradeReviewOptions): TradeReviewController {
  const now = options.nowSeconds ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const random = options.randomBytes ?? (length => globalThis.crypto.getRandomValues(new Uint8Array(length)));
  const review = options.review ?? reviewTermsBytes;
  const listeners = new Set<() => void>();
  let registry: RegistryLookup | null = null;
  let samples: readonly TermsSample[] = [];
  let snapshot: TradeReviewSnapshot = Object.freeze({ registry: Object.freeze({ kind: 'loading' }), job: Object.freeze({ kind: 'idle' }), reviews: Object.freeze([]),
    saved: IDLE_SAVED, unreviewable: Object.freeze([]), persistence: Object.freeze({unlocked:false,kind:'idle'}) });
  let generation = 0;
  let savedGeneration = 0;
  let disposed = false;
  let loading: Promise<void> | undefined;
  let port: ReviewPersistencePort | null = null, unsubscribe: (() => void) | undefined;
  let identity: number | null = null, savedAbort: AbortController | undefined;
  const transient = new Set<Uint8Array>();

  const publish = (next: Partial<TradeReviewSnapshot>) => {
    if (disposed) return;
    const saved = next.saved ?? snapshot.saved;
    const kind = saved.kind === 'done' ? (saved.action === 'load' ? 'loaded' : 'saved') : saved.kind;
    snapshot = Object.freeze({ ...snapshot, ...next, persistence: Object.freeze({unlocked:port?.getSnapshot().state === 'unlocked',kind,...(saved.kind === 'failed' ? {code:saved.code}: {})}) });
    for (const listener of [...listeners]) listener();
  };
  const setJob = (job: ImportState) => publish({ job: Object.freeze(job) });
  const wipe = (items: readonly StoredReview[]) => { for (const item of items) item.bytes.fill(0); };
  const clearSession = () => { generation++; savedGeneration++; savedAbort?.abort(); savedAbort=undefined; wipe(snapshot.reviews); for(const bytes of transient) bytes.fill(0); transient.clear(); publish({reviews:Object.freeze([]),job:Object.freeze({kind:'idle'}),saved:IDLE_SAVED,unreviewable:Object.freeze([])}); };
  const unavailable = (action: 'save'|'load'|'delete', code: SavedErrorCode) => publish({saved:Object.freeze({kind:'failed',action,code})});

  async function run(source: ReviewSource, read: () => Promise<Uint8Array | ImportRejection>): Promise<ImportOutcome> {
    if (disposed) return { kind: 'stale' };
    const mine = ++generation;
    const current = () => mine === generation && !disposed;
    if (!registry) { const job = { kind: 'rejected', code: 'REGISTRY_NOT_READY' } as const; setJob(job); return job; }
    const lookup = registry;
    setJob({ kind: 'busy', step: 'reading' });
    let bytes: Uint8Array | ImportRejection;
    try { bytes = await read(); } catch { bytes = 'FILE_UNREADABLE'; }
    if (!current()) { if(bytes instanceof Uint8Array)bytes.fill(0); return { kind: 'stale' }; }
    if (typeof bytes === 'string') { const job = { kind: 'rejected', code: bytes } as const; setJob(job); return job; }
    bytes=bytes.slice(); const original=bytes.slice(); transient.add(bytes); transient.add(original);
    setJob({ kind: 'busy', step: 'checking' });
    let result: TermsReviewResult;
    try { result = await review(lookup, bytes); } catch { result = { ok: false, code: 'UNAVAILABLE' }; }
    bytes.fill(0); transient.delete(bytes); transient.delete(original);
    if (!current()) { original.fill(0); return { kind: 'stale' }; }
    if (!result.ok) { original.fill(0); const job = { kind: 'rejected', code: result.code } as const; setJob(job); return job; }
    const accepted = result.value;
    const existing = snapshot.reviews.find(item => item.source === source && sameReview(item.review, accepted));
    const stored: StoredReview = existing ?? Object.freeze({ localId: localIdFrom(random(16)), review: accepted, source, bytes: original, savedId: null, loaded: false });
    if(existing)original.fill(0);
    const reviews = existing ? snapshot.reviews : bounded([...snapshot.reviews, stored]);
    wipe(snapshot.reviews.filter(item=>!reviews.includes(item)));
    const job = Object.freeze({ kind: 'accepted', localId: stored.localId } as const);
    publish({ reviews: Object.freeze(reviews), job });
    return current() ? job : {kind:'stale'};
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    loadRegistry() {
      loading ??= (async () => {
        let result: RegistrySourceResult;
        try { result = await options.source(); } catch { result = { kind: 'failed' }; }
        if (disposed) return;
        if (result.kind === 'ready') {
          registry = result.registry; samples = result.samples;
          publish({ registry: Object.freeze({ kind: 'ready', label: result.label, samples: Object.freeze(samples.map(({ id, label }) => Object.freeze({ id, label }))),
            trust: result.trust ? Object.freeze({ keyId: result.trust.keyId, sequence: result.trust.sequence, expiresAt: result.trust.expiresAt }) : null }) });
        } else publish({ registry: Object.freeze({ kind: result.kind }) });
      })();
      return loading;
    },
    importFile(file: FileLike) {
      return run('file', async () => {
        // Size is checked before any bytes are read.
        if (typeof file.size !== 'number' || file.size > MAX_TERMS_REVIEW_BYTES) return 'TOO_LARGE';
        return new Uint8Array(await file.arrayBuffer());
      });
    },
    importSample(id: string) {
      const sample = samples.find(item => item.id === id);
      return run('synthetic-sample', async () => sample ? sample.load(now()) : 'FILE_UNREADABLE');
    },
    cancel() {
      if(snapshot.saved.kind === 'busy'){ const action=snapshot.saved.action; savedGeneration++; savedAbort?.abort(); savedAbort=undefined; unavailable(action,'UNKNOWN_OUTCOME'); }
      if (snapshot.job.kind !== 'busy') return;
      generation++;
      setJob({ kind: 'cancelled' });
    },
    remove(localId: string) {
      const reviews = snapshot.reviews.filter(item => item.localId !== localId);
      if (reviews.length === snapshot.reviews.length) return;
      // A finished job that points at the removed review would otherwise link to a missing page.
      const job = snapshot.job.kind === 'accepted' && snapshot.job.localId === localId ? Object.freeze({ kind: 'idle' } as const) : snapshot.job;
      wipe(snapshot.reviews.filter(item=>!reviews.includes(item)));
      publish({ reviews: Object.freeze(reviews), job });
    },
    find: (localId: string) => snapshot.reviews.find(item => item.localId === localId) ?? null,
    async saveToProfile(localId: string, store: SavedReviewStore) {
      if(!registry){unavailable('save','REGISTRY_NOT_READY');return;}
      if(port && port.getSnapshot().state!=='unlocked'){unavailable('save','LOCKED');return;}
      const item = snapshot.reviews.find(entry => entry.localId === localId);
      if(disposed || snapshot.saved.kind==='busy')return;
      if(!item){unavailable('save','REVIEW_MISSING');return;}
      if(item.savedId!==null){publish({saved:Object.freeze({kind:'done',action:'save',skipped:0})});return;}
      const mine = ++savedGeneration;
      publish({ saved: Object.freeze({ kind: 'busy', action: 'save' }) });
      let result: RuntimeResult<RuntimeSavedReviewRef>;
      const abort=new AbortController(); savedAbort=abort; const copy=item.bytes.slice(); transient.add(copy);
      try { result = await store.saveTermsReview(item.source, copy, abort.signal); } catch { result = { ok: false, error: { code: 'PROTOCOL_ERROR', messageKey: 'runtime.error.protocol_error' } }; }
      finally { copy.fill(0); transient.delete(copy); if(savedAbort===abort)savedAbort=undefined; }
      if (mine !== savedGeneration || disposed) return;
      if (!result.ok) { publish({ saved: Object.freeze({ kind: 'failed', action: 'save', code: result.error.code }) }); return; }
      const recordId = result.value.recordId;
      if(!/^[0-9a-f]{32}$/.test(recordId)){unavailable('save','PROTOCOL_ERROR');return;}
      const reviews = Object.freeze(snapshot.reviews.map(entry => entry.localId === localId ? Object.freeze({ ...entry, savedId: recordId }) : entry));
      publish({ reviews, saved: Object.freeze({ kind: 'done', action: 'save', skipped: 0 }) });
    },
    async loadSaved(store: SavedReviewStore | undefined = port ?? undefined) {
      if(!store || port && port.getSnapshot().state!=='unlocked'){unavailable('load','LOCKED');return;}
      if (disposed || snapshot.saved.kind === 'busy') return;
      const mine = ++savedGeneration;
      if (!registry) { publish({ saved: Object.freeze({ kind: 'failed', action: 'load', code: 'REGISTRY_NOT_READY' }) }); return; }
      const lookup = registry;
      publish({ saved: Object.freeze({ kind: 'busy', action: 'load' }) });
      const abort = new AbortController(); savedAbort = abort;
      const owned = new Set<Uint8Array>();
      const own = (bytes: Uint8Array): void => { owned.add(bytes); transient.add(bytes); };
      try {
      let listed: RuntimeResult<RuntimeSavedReviews>;
      try { listed = await store.listTermsReviews(abort.signal); }
      catch { listed = { ok: false, error: { code: 'PROTOCOL_ERROR', messageKey: 'runtime.error.protocol_error' } }; }
      if (listed.ok) {
        // Runtime replies transfer fresh buffers to this controller. Own them before validation or awaits so
        // lock/dispose clears even an invalid list or an uncooperative review. A retained review is never borrowed.
        for (const item of listed.value.items) if (item.bytes instanceof Uint8Array && !snapshot.reviews.some(entry => entry.bytes === item.bytes)) own(item.bytes);
      }
      if (mine !== savedGeneration || disposed) return;
      if (!listed.ok) { publish({ saved: Object.freeze({ kind: 'failed', action: 'load', code: listed.error.code }) }); return; }
      // Re-review first; merge afterwards into the snapshot as it is then, so imports or removals made while the
      // checks were running are kept, not overwritten by a copy taken before the awaits.
      const checked: { readonly recordId: string; readonly source: ReviewSource; readonly bytes: Uint8Array; readonly result: TermsReviewResult }[] = [];
      if(listed.value.items.length>MAX_SESSION_REVIEWS || new Set(listed.value.items.map(item=>item.recordId)).size!==listed.value.items.length)throw Error();
      for (const item of listed.value.items) {
        if(!/^[0-9a-f]{32}$/.test(item.recordId)||!(item.bytes instanceof Uint8Array)||item.bytes.length>MAX_TERMS_REVIEW_BYTES||!['file','synthetic-sample'].includes(item.source))throw Error();
        const original=item.bytes.slice(), copy=item.bytes.slice(); own(original); own(copy);
        let result: TermsReviewResult;
        try { result = await review(lookup, copy); } catch { result = { ok: false, code: 'UNAVAILABLE' }; }
        if (mine !== savedGeneration || disposed) return;
        checked.push({ recordId: item.recordId, source: item.source, bytes: original, result });
      }
      let reviews = [...snapshot.reviews];
      const unreviewable: UnreviewableSaved[] = [];
      for (const item of checked) {
        if (!item.result.ok) {
          // Saved bytes that fail today's review are never shown from the profile. A review imported in this session
          // stays (it is the user's own session check), but it no longer counts as saved and is not listed twice.
          reviews = reviews.filter(entry => !(entry.loaded && entry.savedId === item.recordId))
            .map(entry => entry.savedId === item.recordId ? Object.freeze({ ...entry, savedId: null }) : entry);
          unreviewable.push(Object.freeze({ recordId: item.recordId, code: item.result.code }));
          continue;
        }
        // Each record has its own review verdict; one invalid record cannot hide unrelated valid reviews.
        const accepted = item.result.value;
        const index = reviews.findIndex(entry => entry.savedId === item.recordId || (entry.savedId === null && entry.source === item.source && sameReview(entry.review, accepted)));
        // The fresh result replaces any earlier one, so the display always reflects today's registry and checks.
        if (index >= 0) reviews[index] = Object.freeze({ ...reviews[index]!, review: accepted, source:item.source, bytes:item.bytes, savedId: item.recordId });
        else reviews.push(Object.freeze({ localId: localIdFrom(random(16)), review: accepted, source: item.source, bytes: item.bytes, savedId: item.recordId, loaded: true }));
      }
      // Reviews that claim a record the profile no longer holds are not saved any more.
      const present = new Set(listed.value.items.map(item => item.recordId));
      reviews = reviews.filter(entry => !(entry.loaded && entry.savedId !== null && !present.has(entry.savedId)))
        .map(entry => entry.savedId !== null && !present.has(entry.savedId) ? Object.freeze({ ...entry, savedId: null }) : entry);
      const kept = bounded(reviews);
      const currentJob = snapshot.job;
      const job = currentJob.kind === 'accepted' && !kept.some(entry => entry.localId === currentJob.localId) ? Object.freeze({ kind: 'idle' } as const) : currentJob;
      wipe(snapshot.reviews.filter(item=>!kept.some(entry=>entry.bytes===item.bytes)));
      publish({ reviews: kept, job, unreviewable: Object.freeze(unreviewable), saved: unreviewable.length ? Object.freeze({kind:'failed',action:'load',code:'INVALID_SAVED_REVIEW'}) : Object.freeze({ kind: 'done', action: 'load', skipped: listed.value.skipped }) });
      } catch {if(mine===savedGeneration&&!disposed)unavailable('load','INVALID_SAVED_REVIEW');}
      finally {
        for (const bytes of owned) {
          if (!snapshot.reviews.some(entry => entry.bytes === bytes)) bytes.fill(0);
          transient.delete(bytes);
        }
        if (savedAbort === abort) savedAbort = undefined;
      }
    },
    async deleteSaved(recordId: string, store: SavedReviewStore) {
      if (disposed || snapshot.saved.kind === 'busy') return;
      const mine = ++savedGeneration;
      publish({ saved: Object.freeze({ kind: 'busy', action: 'delete' }) });
      let result: RuntimeResult<RuntimeSavedReviewRef>;
      try { result = await store.deleteTermsReview(recordId); } catch { result = { ok: false, error: { code: 'PROTOCOL_ERROR', messageKey: 'runtime.error.protocol_error' } }; }
      if (mine !== savedGeneration || disposed) return;
      // NOT_FOUND means it is already gone from the profile: reflect that instead of keeping a stale saved mark.
      if (!result.ok && result.error.code !== 'NOT_FOUND') { publish({ saved: Object.freeze({ kind: 'failed', action: 'delete', code: result.error.code }) }); return; }
      const gone = snapshot.reviews.filter(entry => entry.savedId === recordId && entry.loaded).map(entry => entry.localId);
      const reviews = bounded(snapshot.reviews.filter(entry => !gone.includes(entry.localId))
        .map(entry => entry.savedId === recordId ? Object.freeze({ ...entry, savedId: null }) : entry));
      const job = snapshot.job.kind === 'accepted' && gone.includes(snapshot.job.localId) ? Object.freeze({ kind: 'idle' } as const) : snapshot.job;
      wipe(snapshot.reviews.filter(item => !reviews.some(entry => entry.bytes === item.bytes)));
      publish({ reviews, job, unreviewable: Object.freeze(snapshot.unreviewable.filter(entry => entry.recordId !== recordId)),
        saved: Object.freeze({ kind: 'done', action: 'delete', skipped: 0 }) });
    },
    forgetSaved() {
      if(port){clearSession();return;}
      savedGeneration++; savedAbort?.abort(); savedAbort=undefined; for(const bytes of transient)bytes.fill(0);transient.clear();
      const gone = snapshot.reviews.filter(entry => entry.loaded).map(entry => entry.localId);
      const reviews = bounded(snapshot.reviews.filter(entry => !entry.loaded).map(entry => entry.savedId === null ? entry : Object.freeze({ ...entry, savedId: null })));
      const job = snapshot.job.kind === 'accepted' && gone.includes(snapshot.job.localId) ? Object.freeze({ kind: 'idle' } as const) : snapshot.job;
      wipe(snapshot.reviews.filter(item=>!reviews.some(entry=>entry.bytes===item.bytes)));
      publish({ reviews, job, unreviewable: Object.freeze([]), saved: IDLE_SAVED });
    },
    setPersistence(next: ReviewPersistencePort | null) {
      if(disposed || port===next)return; unsubscribe?.(); clearSession();port=next;identity=next?.selectionScope()??null;
      const sync=()=>{const changed=port?.selectionScope()??null;if(changed!==identity){identity=changed;clearSession();}else publish({});};
      if(port)unsubscribe=port.subscribe(sync);else unsubscribe=undefined;publish({});
    },
    save(localId:string){ if(!port){unavailable('save','LOCKED');return Promise.resolve();}return this.saveToProfile(localId,port); },
    nowSeconds: () => now().toString(),
    dispose() { listeners.clear(); clearSession(); unsubscribe?.();port=null;disposed = true; generation++; listeners.clear(); },
  });
}
