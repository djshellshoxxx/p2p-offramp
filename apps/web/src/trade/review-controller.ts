/**
 * In-memory trade-terms review session for the document. Owns every asynchronous import it starts: a newer import or
 * cancel() supersedes older work, and results from superseded or disposed work are discarded. Cancelling only stops
 * this local check; nothing here contacts a wallet, relay or chain, so there is no external action to retract.
 *
 * Reviews are bounded in memory. Explicit persistence uses the composition port and stores original validated bytes.
 */
import { MAX_TERMS_REVIEW_BYTES, reviewTermsBytes, type RegistryLookup, type ReviewedEvmTerms, type TermsReviewRejection, type TermsReviewResult } from '../../../../packages/domain/index.ts';
import type { AppServices } from '../app-services.ts';

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
export type ReviewSource = 'file' | 'synthetic-sample' | 'saved-review';
export interface StoredReview { readonly localId: string; readonly review: ReviewedEvmTerms; readonly source: ReviewSource; }
export interface TradeReviewSnapshot {
  readonly registry: RegistryState;
  readonly job: ImportState;
  readonly reviews: readonly StoredReview[];
  readonly persistence: PersistenceState;
}
export type ReviewPersistencePort = Pick<AppServices, 'getSnapshot' | 'subscribe' | 'saveTermsReview' | 'listTermsReviews' | 'profileId'>;
export type PersistenceState = { readonly unlocked: boolean; readonly kind: 'idle' | 'busy' | 'saved' | 'loaded' | 'failed'; readonly code?: string };
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
  remove(localId: string): void;
  find(localId: string): StoredReview | null;
  nowSeconds(): string;
  setPersistence(port: ReviewPersistencePort | null): void;
  save(localId: string): Promise<void>;
  loadSaved(): Promise<void>;
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

export function createTradeReviewController(options: TradeReviewOptions): TradeReviewController {
  const now = options.nowSeconds ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const random = options.randomBytes ?? (length => globalThis.crypto.getRandomValues(new Uint8Array(length)));
  const review = options.review ?? reviewTermsBytes;
  const listeners = new Set<() => void>();
  let registry: RegistryLookup | null = null;
  let samples: readonly TermsSample[] = [];
  let snapshot: TradeReviewSnapshot = Object.freeze({ registry: Object.freeze({ kind: 'loading' }), job: Object.freeze({ kind: 'idle' }), reviews: Object.freeze([]), persistence: Object.freeze({ unlocked: false, kind: 'idle' }) });
  let generation = 0;
  let disposed = false;
  let loading: Promise<void> | undefined;
  const documents = new Map<string, Uint8Array>();
  const transient = new Set<Uint8Array>();
  const recordIds = new Map<string, string>();
  let port: ReviewPersistencePort | null = null;
  let unsubscribe: (() => void) | undefined;
  let identity = '';
  let persistenceGeneration = 0;
  let persistenceAbort: AbortController | undefined;

  const publish = (next: Partial<TradeReviewSnapshot>) => {
    if (disposed) return;
    snapshot = Object.freeze({ ...snapshot, ...next });
    for (const listener of [...listeners]) listener();
  };
  const setJob = (job: ImportState) => publish({ job: Object.freeze(job) });
  const setPersistenceState = (kind: PersistenceState['kind'], code?: string) => publish({ persistence: Object.freeze({ unlocked: port?.getSnapshot().state === 'unlocked', kind, ...(code ? { code } : {}) }) });
  const eraseDocuments = () => { for (const bytes of documents.values()) bytes.fill(0); documents.clear(); recordIds.clear(); };
  const clearSession = () => {
    generation++; persistenceGeneration++; persistenceAbort?.abort(); persistenceAbort = undefined;
    eraseDocuments();
    for (const bytes of transient) bytes.fill(0); transient.clear();
    publish({ reviews: Object.freeze([]), job: Object.freeze({ kind: 'idle' }) });
  };
  const pruneDocuments = () => {
    for (const [id, bytes] of documents) if (!snapshot.reviews.some(item => item.localId === id)) { bytes.fill(0); documents.delete(id); recordIds.delete(id); }
  };
  async function persist(action: 'save' | 'load', localId?: string): Promise<void> {
    if (disposed || snapshot.persistence.kind === 'busy' || snapshot.job.kind === 'busy') return;
    const activePort = port;
    if (!registry) { setPersistenceState('failed', 'REGISTRY_NOT_READY'); return; }
    if (!activePort || activePort.getSnapshot().state !== 'unlocked') { setPersistenceState('failed', 'LOCKED'); return; }
    const document = localId ? documents.get(localId) : undefined;
    if (action === 'save' && !document) { setPersistenceState('failed', 'REVIEW_MISSING'); return; }
    const mine = ++persistenceGeneration, importGeneration = generation;
    const abort = new AbortController(); persistenceAbort = abort;
    const current = () => !disposed && mine === persistenceGeneration && importGeneration === generation && port === activePort && activePort.getSnapshot().state === 'unlocked';
    setPersistenceState('busy');
    try {
      if (action === 'save') {
        let id = recordIds.get(localId!);
        if (!id) { id = Array.from(random(16), byte => byte.toString(16).padStart(2, '0')).join(''); recordIds.set(localId!, id); }
        const bytes = document!.slice();
        transient.add(bytes);
        try {
          const result = await activePort.saveTermsReview(id, bytes, abort.signal);
          if (!current()) return;
          setPersistenceState(result.ok ? 'saved' : 'failed', result.ok ? undefined : result.error.code);
        } finally { bytes.fill(0); transient.delete(bytes); }
      } else {
        const result = await activePort.listTermsReviews(abort.signal);
        if (!current()) { if (result.ok) for (const entry of result.value.entries) entry.bytes.fill(0); return; }
        if (!result.ok) { setPersistenceState('failed', result.error.code); return; }
        for (const entry of result.value.entries) transient.add(entry.bytes);
        const candidates: { id: string; bytes: Uint8Array; review: ReviewedEvmTerms }[] = [];
        const copies: Uint8Array[] = [];
        try {
          if (result.value.entries.length > MAX_SESSION_REVIEWS) throw new Error('INVALID_SAVED_REVIEW');
          const seen = new Set<string>();
          for (const entry of result.value.entries) {
            if (!/^[0-9a-f]{32}$/.test(entry.id) || seen.has(entry.id) || entry.bytes.byteLength > MAX_TERMS_REVIEW_BYTES) throw new Error('INVALID_SAVED_REVIEW');
            seen.add(entry.id);
            const bytes = entry.bytes.slice(); transient.add(bytes); copies.push(bytes);
            const checked = await review(registry!, entry.bytes);
            if (!current()) return;
            if (!checked.ok) throw new Error('INVALID_SAVED_REVIEW');
            candidates.push({ id: entry.id, bytes, review: checked.value });
          }
          const reviews = [...snapshot.reviews];
          for (const candidate of candidates) {
            const existing = reviews.find(item => recordIds.get(item.localId) === candidate.id);
            const stored = Object.freeze({ localId: existing?.localId ?? localIdFrom(random(16)), review: candidate.review, source: 'saved-review' as const });
            if (existing) reviews.splice(reviews.indexOf(existing), 1);
            reviews.push(stored);
            documents.get(stored.localId)?.fill(0);
            documents.set(stored.localId, candidate.bytes.slice()); recordIds.set(stored.localId, candidate.id);
          }
          publish({ reviews: Object.freeze(reviews.slice(-MAX_SESSION_REVIEWS)) }); pruneDocuments();
          if (current()) setPersistenceState('loaded');
        } finally {
          for (const bytes of copies) { bytes.fill(0); transient.delete(bytes); }
          for (const entry of result.value.entries) { entry.bytes.fill(0); transient.delete(entry.bytes); }
        }
      }
    } catch { if (current()) setPersistenceState('failed', action === 'load' ? 'INVALID_SAVED_REVIEW' : 'UNKNOWN_OUTCOME'); }
    finally { if (mine === persistenceGeneration) persistenceAbort = undefined; }
  }

  async function run(source: ReviewSource, read: () => Promise<Uint8Array | ImportRejection>): Promise<ImportOutcome> {
    if (disposed) return { kind: 'stale' };
    const mine = ++generation;
    const current = () => mine === generation && !disposed;
    if (!registry) { const job = { kind: 'rejected', code: 'REGISTRY_NOT_READY' } as const; setJob(job); return job; }
    const lookup = registry;
    persistenceGeneration++; persistenceAbort?.abort(); persistenceAbort = undefined;
    if (snapshot.persistence.kind === 'busy') setPersistenceState('failed', 'UNKNOWN_OUTCOME');
    setJob({ kind: 'busy', step: 'reading' });
    let bytes: Uint8Array | ImportRejection;
    try { bytes = await read(); } catch { bytes = 'FILE_UNREADABLE'; }
    if (!current()) { if (bytes instanceof Uint8Array) bytes.fill(0); return { kind: 'stale' }; }
    if (typeof bytes === 'string') { const job = { kind: 'rejected', code: bytes } as const; setJob(job); return job; }
    bytes = bytes.slice();
    const originalBytes = bytes.slice();
    transient.add(bytes); transient.add(originalBytes);
    setJob({ kind: 'busy', step: 'checking' });
    let result: TermsReviewResult;
    try { result = await review(lookup, bytes); } catch { result = { ok: false, code: 'UNAVAILABLE' }; }
    bytes.fill(0); transient.delete(bytes); transient.delete(originalBytes);
    if (!current()) { originalBytes.fill(0); return { kind: 'stale' }; }
    if (!result.ok) { originalBytes.fill(0); const job = { kind: 'rejected', code: result.code } as const; setJob(job); return job; }
    const accepted = result.value;
    const existing = snapshot.reviews.find(item => item.source === source && sameReview(item.review, accepted));
    const stored = existing ?? Object.freeze({ localId: localIdFrom(random(16)), review: accepted, source });
    const reviews = existing ? snapshot.reviews : [...snapshot.reviews, stored].slice(-MAX_SESSION_REVIEWS);
    const job = Object.freeze({ kind: 'accepted', localId: stored.localId } as const);
    if (!existing) documents.set(stored.localId, originalBytes); else originalBytes.fill(0);
    publish({ reviews: Object.freeze(reviews), job });
    pruneDocuments();
    return current() ? job : { kind: 'stale' };
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
      if (snapshot.persistence.kind === 'busy') {
        persistenceGeneration++; persistenceAbort?.abort(); persistenceAbort = undefined;
        setPersistenceState('failed', 'UNKNOWN_OUTCOME');
      }
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
      pruneDocuments();
    },
    find: (localId: string) => snapshot.reviews.find(item => item.localId === localId) ?? null,
    nowSeconds: () => now().toString(),
    setPersistence(next: ReviewPersistencePort | null) {
      if (disposed || port === next) return;
      unsubscribe?.(); unsubscribe = undefined; clearSession(); port = next;
      const sync = () => {
        const nextIdentity = port ? `${port.getSnapshot().state}:${port.profileId ?? ''}` : '';
        if (identity !== nextIdentity) { identity = nextIdentity; clearSession(); setPersistenceState('idle'); }
      };
      identity = ''; sync(); setPersistenceState('idle');
      if (port) unsubscribe = port.subscribe(sync);
    },
    save: (localId: string) => persist('save', localId),
    loadSaved: () => persist('load'),
    dispose() { listeners.clear(); clearSession(); unsubscribe?.(); port = null; disposed = true; generation++; },
  });
}
