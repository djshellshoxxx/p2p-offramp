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
import type { RuntimeErrorCode, RuntimeResult, RuntimeSavedReviewRef, RuntimeSavedReviews } from '../../../../packages/schemas/index.ts';

export const MAX_SESSION_REVIEWS = 8;

export interface TermsSample {
  readonly id: string;
  readonly label: string;
  /** Produces document bytes; receives the device clock in unix seconds so samples can be relative to now. */
  load(nowSeconds: bigint): Promise<Uint8Array>;
}
export type RegistrySourceResult =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly label: 'synthetic-demo'; readonly registry: RegistryLookup; readonly samples: readonly TermsSample[] };
/** Trusted composition input. Only the demo build supplies a ready source; the default build has no approved registry. */
export type RegistrySource = () => Promise<RegistrySourceResult>;
export const noApprovedRegistry: RegistrySource = async () => ({ kind: 'unavailable' });

export type RegistryState =
  | { readonly kind: 'loading' } | { readonly kind: 'unavailable' } | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly label: 'synthetic-demo'; readonly samples: readonly Pick<TermsSample, 'id' | 'label'>[] };
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
export type SavedErrorCode = RuntimeErrorCode | 'REGISTRY_NOT_READY';
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
}
/** The open profile's saved-review commands (AppServices). Results are bound to that profile by the runtime. */
export interface SavedReviewStore {
  saveTermsReview(source: ReviewSource, bytes: Uint8Array): Promise<RuntimeResult<RuntimeSavedReviewRef>>;
  listTermsReviews(): Promise<RuntimeResult<RuntimeSavedReviews>>;
  deleteTermsReview(recordId: string): Promise<RuntimeResult<RuntimeSavedReviewRef>>;
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
  loadSaved(store: SavedReviewStore): Promise<void>;
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
    saved: IDLE_SAVED, unreviewable: Object.freeze([]) });
  let generation = 0;
  let savedGeneration = 0;
  let disposed = false;
  let loading: Promise<void> | undefined;

  const publish = (next: Partial<TradeReviewSnapshot>) => {
    if (disposed) return;
    snapshot = Object.freeze({ ...snapshot, ...next });
    for (const listener of [...listeners]) listener();
  };
  const setJob = (job: ImportState) => publish({ job: Object.freeze(job) });

  async function run(source: ReviewSource, read: () => Promise<Uint8Array | ImportRejection>): Promise<ImportOutcome> {
    if (disposed) return { kind: 'stale' };
    const mine = ++generation;
    const current = () => mine === generation && !disposed;
    if (!registry) { const job = { kind: 'rejected', code: 'REGISTRY_NOT_READY' } as const; setJob(job); return job; }
    const lookup = registry;
    setJob({ kind: 'busy', step: 'reading' });
    let bytes: Uint8Array | ImportRejection;
    try { bytes = await read(); } catch { bytes = 'FILE_UNREADABLE'; }
    if (!current()) return { kind: 'stale' };
    if (typeof bytes === 'string') { const job = { kind: 'rejected', code: bytes } as const; setJob(job); return job; }
    setJob({ kind: 'busy', step: 'checking' });
    let result: TermsReviewResult;
    try { result = await review(lookup, bytes); } catch { result = { ok: false, code: 'UNAVAILABLE' }; }
    if (!current()) return { kind: 'stale' };
    if (!result.ok) { const job = { kind: 'rejected', code: result.code } as const; setJob(job); return job; }
    const accepted = result.value;
    const existing = snapshot.reviews.find(item => item.source === source && sameReview(item.review, accepted));
    const stored: StoredReview = existing ?? Object.freeze({ localId: localIdFrom(random(16)), review: accepted, source, bytes: bytes.slice(), savedId: null, loaded: false });
    const reviews = existing ? snapshot.reviews : bounded([...snapshot.reviews, stored]);
    const job = Object.freeze({ kind: 'accepted', localId: stored.localId } as const);
    publish({ reviews: Object.freeze(reviews), job });
    return job;
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
          publish({ registry: Object.freeze({ kind: 'ready', label: result.label, samples: Object.freeze(samples.map(({ id, label }) => Object.freeze({ id, label }))) }) });
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
      if (snapshot.job.kind !== 'busy') return;
      generation++;
      setJob({ kind: 'cancelled' });
    },
    remove(localId: string) {
      const reviews = snapshot.reviews.filter(item => item.localId !== localId);
      if (reviews.length === snapshot.reviews.length) return;
      // A finished job that points at the removed review would otherwise link to a missing page.
      const job = snapshot.job.kind === 'accepted' && snapshot.job.localId === localId ? Object.freeze({ kind: 'idle' } as const) : snapshot.job;
      publish({ reviews: Object.freeze(reviews), job });
    },
    find: (localId: string) => snapshot.reviews.find(item => item.localId === localId) ?? null,
    async saveToProfile(localId: string, store: SavedReviewStore) {
      const item = snapshot.reviews.find(entry => entry.localId === localId);
      if (disposed || !item || item.savedId !== null || snapshot.saved.kind === 'busy') return;
      const mine = ++savedGeneration;
      publish({ saved: Object.freeze({ kind: 'busy', action: 'save' }) });
      let result: RuntimeResult<RuntimeSavedReviewRef>;
      try { result = await store.saveTermsReview(item.source, item.bytes); } catch { result = { ok: false, error: { code: 'PROTOCOL_ERROR', messageKey: 'runtime.error.protocol_error' } }; }
      if (mine !== savedGeneration || disposed) return;
      if (!result.ok) { publish({ saved: Object.freeze({ kind: 'failed', action: 'save', code: result.error.code }) }); return; }
      const recordId = result.value.recordId;
      const reviews = Object.freeze(snapshot.reviews.map(entry => entry.localId === localId ? Object.freeze({ ...entry, savedId: recordId }) : entry));
      publish({ reviews, saved: Object.freeze({ kind: 'done', action: 'save', skipped: 0 }) });
    },
    async loadSaved(store: SavedReviewStore) {
      if (disposed || snapshot.saved.kind === 'busy') return;
      const mine = ++savedGeneration;
      if (!registry) { publish({ saved: Object.freeze({ kind: 'failed', action: 'load', code: 'REGISTRY_NOT_READY' }) }); return; }
      const lookup = registry;
      publish({ saved: Object.freeze({ kind: 'busy', action: 'load' }) });
      let listed: RuntimeResult<RuntimeSavedReviews>;
      try { listed = await store.listTermsReviews(); } catch { listed = { ok: false, error: { code: 'PROTOCOL_ERROR', messageKey: 'runtime.error.protocol_error' } }; }
      if (mine !== savedGeneration || disposed) return;
      if (!listed.ok) { publish({ saved: Object.freeze({ kind: 'failed', action: 'load', code: listed.error.code }) }); return; }
      let reviews = [...snapshot.reviews];
      const unreviewable: UnreviewableSaved[] = [];
      for (const item of listed.value.items) {
        let result: TermsReviewResult;
        try { result = await review(lookup, item.bytes); } catch { result = { ok: false, code: 'UNAVAILABLE' }; }
        if (mine !== savedGeneration || disposed) return;
        if (!result.ok) {
          // A review already shown for this record (checked earlier in this session) stays; it is not listed twice.
          if (!reviews.some(entry => entry.savedId === item.recordId)) unreviewable.push(Object.freeze({ recordId: item.recordId, code: result.code }));
          continue;
        }
        const accepted = result.value;
        const index = reviews.findIndex(entry => entry.savedId === item.recordId || (entry.savedId === null && entry.source === item.source && sameReview(entry.review, accepted)));
        if (index >= 0) reviews[index] = Object.freeze({ ...reviews[index]!, savedId: item.recordId });
        else reviews.push(Object.freeze({ localId: localIdFrom(random(16)), review: accepted, source: item.source, bytes: item.bytes.slice(), savedId: item.recordId, loaded: true }));
      }
      // Reviews that claim a record the profile no longer holds are not saved any more.
      const present = new Set(listed.value.items.map(item => item.recordId));
      reviews = reviews.filter(entry => !(entry.loaded && entry.savedId !== null && !present.has(entry.savedId)))
        .map(entry => entry.savedId !== null && !present.has(entry.savedId) ? Object.freeze({ ...entry, savedId: null }) : entry);
      publish({ reviews: bounded(reviews), unreviewable: Object.freeze(unreviewable), saved: Object.freeze({ kind: 'done', action: 'load', skipped: listed.value.skipped }) });
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
      publish({ reviews, job, unreviewable: Object.freeze(snapshot.unreviewable.filter(entry => entry.recordId !== recordId)),
        saved: Object.freeze({ kind: 'done', action: 'delete', skipped: 0 }) });
    },
    forgetSaved() {
      savedGeneration++;
      const gone = snapshot.reviews.filter(entry => entry.loaded).map(entry => entry.localId);
      const reviews = bounded(snapshot.reviews.filter(entry => !entry.loaded).map(entry => entry.savedId === null ? entry : Object.freeze({ ...entry, savedId: null })));
      const job = snapshot.job.kind === 'accepted' && gone.includes(snapshot.job.localId) ? Object.freeze({ kind: 'idle' } as const) : snapshot.job;
      publish({ reviews, job, unreviewable: Object.freeze([]), saved: IDLE_SAVED });
    },
    nowSeconds: () => now().toString(),
    dispose() { disposed = true; generation++; listeners.clear(); },
  });
}
