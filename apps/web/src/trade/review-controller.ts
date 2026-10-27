/**
 * In-memory trade-terms review session for the document. Owns every asynchronous import it starts: a newer import or
 * cancel() supersedes older work, and results from superseded or disposed work are discarded. Cancelling only stops
 * this local check; nothing here contacts a wallet, relay or chain, so there is no external action to retract.
 *
 * Reviews are kept in memory only (bounded, oldest evicted) and are lost on reload. Persisting them in the encrypted
 * vault needs new Worker/runtime record commands, which are outside this module.
 */
import { MAX_TERMS_REVIEW_BYTES, reviewTermsBytes, type RegistryLookup, type ReviewedEvmTerms, type TermsReviewRejection, type TermsReviewResult } from '../../../../packages/domain/index.ts';

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
export interface StoredReview { readonly localId: string; readonly review: ReviewedEvmTerms; readonly source: ReviewSource; }
export interface TradeReviewSnapshot {
  readonly registry: RegistryState;
  readonly job: ImportState;
  readonly reviews: readonly StoredReview[];
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
  remove(localId: string): void;
  find(localId: string): StoredReview | null;
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

export function createTradeReviewController(options: TradeReviewOptions): TradeReviewController {
  const now = options.nowSeconds ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const random = options.randomBytes ?? (length => globalThis.crypto.getRandomValues(new Uint8Array(length)));
  const review = options.review ?? reviewTermsBytes;
  const listeners = new Set<() => void>();
  let registry: RegistryLookup | null = null;
  let samples: readonly TermsSample[] = [];
  let snapshot: TradeReviewSnapshot = Object.freeze({ registry: Object.freeze({ kind: 'loading' }), job: Object.freeze({ kind: 'idle' }), reviews: Object.freeze([]) });
  let generation = 0;
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
    const stored = existing ?? Object.freeze({ localId: localIdFrom(random(16)), review: accepted, source });
    const reviews = existing ? snapshot.reviews : [...snapshot.reviews, stored].slice(-MAX_SESSION_REVIEWS);
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
    nowSeconds: () => now().toString(),
    dispose() { disposed = true; generation++; listeners.clear(); },
  });
}
