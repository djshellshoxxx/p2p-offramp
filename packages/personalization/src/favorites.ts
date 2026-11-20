/** One owned G02 preference, backed by native session leases and freshness CAS. */
import { decodeBase64url, encodeBase64url, parseSavedReviewPayload, parseStrictJsonBytes, MAX_SAVED_REVIEWS, MAX_SAVED_REVIEW_BYTES,
  type PrivateRecordV1, type Result, type VaultErrorCode, type VaultService, type VaultSession, type VaultSessionAuthority, type VaultSessionLease } from '../../schemas/index.ts';

export const REVIEW_FAVORITES_RECORD_ID = 'd7a6b5c4e3f291807060504030201082';
const FORMAT = 'p2p-offramp/saved-review-favorites/v1', MAX_BYTES = 2048;
export type FavoriteVault = Pick<VaultService, 'list' | 'commit'> & VaultSessionAuthority;
export interface SavedReviewFavoriteList { readonly revision: number; readonly recordIds: readonly string[]; }
export interface SavedReviewFavoriteReceipt { readonly recordId: string; readonly favorite: boolean; readonly revision: number; readonly persisted: true; readonly sessionCurrent: boolean; }
export interface SavedReviewFavoriteOptions { readonly vault: FavoriteVault; readonly session: VaultSession; readonly isCurrent?: () => boolean; }
export interface SavedReviewFavorites {
  list(signal?: AbortSignal): Promise<Result<SavedReviewFavoriteList>>;
  set(recordId: string, favorite: boolean, expectedRevision: number, signal?: AbortSignal): Promise<Result<SavedReviewFavoriteReceipt>>;
  cancel(): void;
  dispose(): void;
}
class Failure { readonly code: VaultErrorCode; constructor(code: VaultErrorCode) { this.code = code; } }
const ERROR_CODES: ReadonlySet<string> = new Set<VaultErrorCode>([
  'UNSUPPORTED_ENVIRONMENT', 'UNSUPPORTED_VERSION', 'INVALID_INPUT', 'NOT_FOUND', 'ALREADY_EXISTS',
  'AUTHENTICATION_FAILED', 'LOCKED', 'CONFLICT', 'LIMIT_EXCEEDED', 'REKEY_REQUIRED',
  'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'CANCELLED', 'BUSY',
]);
function ownErrorCode(input: unknown, fallback: VaultErrorCode): VaultErrorCode {
  try {
    if (typeof input !== 'object' || input === null) return fallback;
    const property = Object.getOwnPropertyDescriptor(input, 'code');
    const candidate: unknown = property && 'value' in property ? property.value : undefined;
    if (typeof candidate === 'string' && ERROR_CODES.has(candidate)) return candidate as VaultErrorCode;
  } catch { /* Foreign reflection cannot invoke an accessor or replace the fixed result. */ }
  return fallback;
}
function failureCode(input: unknown, fallback: VaultErrorCode): VaultErrorCode {
  try { if (input instanceof Failure) return ownErrorCode(input, fallback); }
  catch { /* Even instanceof can throw for a foreign exception proxy. */ }
  return fallback;
}
const stop = (code: VaultErrorCode): never => { throw new Failure(code); };
const error = (code: VaultErrorCode): Result<never> => Object.freeze({ ok: false, error: Object.freeze({ code, retryable: false, message: 'Saved review favorites are unavailable.' }) });
const value = <T>(result: Result<T>): T => {
  if (result.ok) return result.value;
  let nativeError: unknown;
  try { const property = Object.getOwnPropertyDescriptor(result, 'error'); nativeError = property && 'value' in property ? property.value : undefined; }
  catch { /* A native error wrapper has no accessor or diagnostic authority. */ }
  return stop(ownErrorCode(nativeError, 'STORAGE_UNAVAILABLE'));
};
const id = (input: unknown): string => typeof input === 'string' && /^[0-9a-f]{32}$/.test(input) ? input : stop('INVALID_INPUT');
const revision = (input: unknown): number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : stop('INVALID_INPUT');
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const listen = EventTarget.prototype.addEventListener, unlisten = EventTarget.prototype.removeEventListener;
function owns(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return stop('UNSUPPORTED_VERSION');
  const proto = Object.getPrototypeOf(input), actual = Reflect.ownKeys(input);
  if (proto !== Object.prototype && proto !== null || actual.length !== keys.length || actual.some(k => typeof k !== 'string' || !keys.includes(k))) return stop('UNSUPPORTED_VERSION');
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !('value' in d)) return stop('UNSUPPORTED_VERSION'); out[key] = d.value; }
  return out;
}
function favorites(rows: readonly PrivateRecordV1[]): readonly string[] {
  const row = rows.find(r => r.id === REVIEW_FAVORITES_RECORD_ID); if (!row) return Object.freeze([]);
  if (row.kind !== 'preference' || row.schemaVersion !== 1) return stop('UNSUPPORTED_VERSION');
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(row.payload, 1, MAX_BYTES); const raw = owns(parseStrictJsonBytes(bytes, MAX_BYTES), ['format', 'recordIds']);
    if (raw.format !== FORMAT || !Array.isArray(raw.recordIds) || Object.getPrototypeOf(raw.recordIds) !== Array.prototype ||
      raw.recordIds.length > MAX_SAVED_REVIEWS || Reflect.ownKeys(raw.recordIds).length !== raw.recordIds.length + 1) return stop('UNSUPPORTED_VERSION');
    const ids: string[] = [];
    for (let n = 0; n < raw.recordIds.length; n++) { const d = Object.getOwnPropertyDescriptor(raw.recordIds, String(n)); if (!d || !('value' in d)) return stop('UNSUPPORTED_VERSION'); ids.push(id(d.value)); }
    if (new Set(ids).size !== ids.length || encode(ids) !== row.payload) return stop('UNSUPPORTED_VERSION');
    return Object.freeze(ids);
  } catch { return stop('UNSUPPORTED_VERSION'); }
  finally { bytes?.fill(0); }
}
function encode(recordIds: readonly string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ format: FORMAT, recordIds }));
  try { return encodeBase64url(bytes); } finally { bytes.fill(0); }
}
/** Equal to the Worker's strict saved-review compatibility reader; never upgrades the stored row. */
function savedTarget(row: PrivateRecordV1 | undefined): boolean {
  if (!row || row.kind !== 'trade' || row.schemaVersion !== 1) return false;
  const saved = parseSavedReviewPayload(row.payload, row.schemaVersion);
  if (saved) { saved.terms.fill(0); return true; }
  let bytes: Uint8Array | undefined, terms: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(row.payload, 0, 100000); const raw = owns(parseStrictJsonBytes(bytes, 100000), ['format', 'bytes']);
    if (raw.format !== 'p2p-offramp/saved-review/v1') return false;
    terms = decodeBase64url(raw.bytes, 1, MAX_SAVED_REVIEW_BYTES); return true;
  } catch { return false; }
  finally { bytes?.fill(0); terms?.fill(0); }
}
interface Job { readonly controller: AbortController; revision: number | undefined; durable: boolean; }
class Favorites implements SavedReviewFavorites {
  readonly #vault: FavoriteVault; readonly #isCurrent: () => boolean;
  #lease: VaultSessionLease | undefined; #closed = false; #active: Job | undefined;
  constructor(options: SavedReviewFavoriteOptions) {
    this.#vault = options.vault; this.#isCurrent = options.isCurrent ?? (() => true);
    if (typeof this.#isCurrent !== 'function' || !this.#vault || typeof this.#vault.captureSession !== 'function' ||
      typeof this.#vault.list !== 'function' || typeof this.#vault.commit !== 'function') return stop('INVALID_INPUT');
    const lease = value(this.#vault.captureSession(options.session, () => this.dispose())); this.#lease = lease;
    try { this.#current(); } catch (e) { this.dispose(); throw e; }
  }
  dispose(): void { this.#closed = true; this.#active?.controller.abort(); const lease = this.#lease; this.#lease = undefined; try { lease?.dispose(); } catch { /* Local revocation is already permanent. */ } }
  cancel(): void { this.#active?.controller.abort(); }
  #current(): Readonly<VaultSession> {
    if (this.#closed || !this.#lease) return stop('LOCKED');
    const lease = this.#lease; let session: Readonly<VaultSession> | null = null, live = false;
    try { session = lease.current(); if (!this.#closed && session) live = this.#isCurrent() === true; } catch { /* A callback has no diagnostic authority. */ }
    if (this.#closed || this.#lease !== lease || !session || !live) { this.dispose(); return stop('LOCKED'); }
    return session;
  }
  #guard(job: Job): Readonly<VaultSession> {
    if (this.#closed || this.#active !== job) return stop('LOCKED');
    if (job.controller.signal.aborted) return stop('CANCELLED');
    const session = this.#current();
    if (this.#closed || this.#active !== job) return stop('LOCKED');
    if (job.controller.signal.aborted) return stop('CANCELLED');
    if (job.revision !== undefined && session.revision !== job.revision) return stop('CONFLICT');
    return session;
  }
  async #run<T>(work: (job: Job) => Promise<T>, signal?: AbortSignal): Promise<Result<T>> {
    if (this.#active) return error('CONFLICT'); if (this.#closed) return error('LOCKED');
    const job: Job = { controller: new AbortController(), revision: undefined, durable: false }; this.#active = job;
    let listening = false; const cancel = (): void => { job.controller.abort(); };
    try {
      if (signal !== undefined) { let isAborted: boolean; try { isAborted = Reflect.apply(aborted, signal, []) as boolean; } catch { return error('INVALID_INPUT'); }
        if (isAborted) return error('CANCELLED'); Reflect.apply(listen, signal, ['abort', cancel, { once: true }]); listening = true; }
      this.#guard(job); const output = await work(job); if (!job.durable) this.#guard(job); return Object.freeze({ ok: true as const, value: output });
    } catch (e) { return error(failureCode(e, 'STORAGE_UNAVAILABLE')); }
    finally { if (signal && listening) { try { Reflect.apply(unlisten, signal, ['abort', cancel]); } catch { /* Drain still releases admission. */ } } if (this.#active === job) this.#active = undefined; }
  }
  async #read(job: Job, expectedRevision?: number): Promise<{ readonly revision: number; readonly rows: readonly PrivateRecordV1[]; readonly recordIds: readonly string[] }> {
    const session = this.#guard(job), rev = session.revision;
    if (expectedRevision !== undefined && expectedRevision !== rev) return stop('CONFLICT'); job.revision = rev;
    if (value(await this.#vault.commit(session.sessionId, rev, [], job.controller.signal, () => { this.#guard(job); })) !== rev) return stop('CONFLICT');
    this.#guard(job); const rows = value(await this.#vault.list(session.sessionId)); this.#guard(job);
    const recordIds = favorites(rows); this.#guard(job); return { revision: rev, rows, recordIds };
  }
  list(signal?: AbortSignal): Promise<Result<SavedReviewFavoriteList>> {
    return this.#run(async job => {
      const stored = await this.#read(job), session = this.#guard(job);
      if (value(await this.#vault.commit(session.sessionId, stored.revision, [], job.controller.signal, () => { this.#guard(job); })) !== stored.revision) return stop('CONFLICT');
      this.#guard(job); return Object.freeze({ revision: stored.revision, recordIds: stored.recordIds });
    }, signal);
  }
  set(recordId: string, favorite: boolean, expectedRevision: number, signal?: AbortSignal): Promise<Result<SavedReviewFavoriteReceipt>> {
    return this.#run(async job => {
      id(recordId); revision(expectedRevision); if (typeof favorite !== 'boolean') return stop('INVALID_INPUT');
      const stored = await this.#read(job, expectedRevision);
      if (favorite && !savedTarget(stored.rows.find(row => row.id === recordId))) return stop('NOT_FOUND');
      const next = favorite ? stored.recordIds.includes(recordId) ? stored.recordIds : [...stored.recordIds, recordId] : stored.recordIds.filter(existing => existing !== recordId);
      if (next.length > MAX_SAVED_REVIEWS) return stop('LIMIT_EXCEEDED');
      const session = this.#guard(job), payload = encode(next);
      const committed = value(await this.#vault.commit(session.sessionId, expectedRevision, [{ op: 'put', record: {
        id: REVIEW_FAVORITES_RECORD_ID, kind: 'preference', schemaVersion: 1, payload,
      } }], job.controller.signal, () => { this.#guard(job); }));
      if (committed !== expectedRevision + 1) return stop('STORAGE_UNAVAILABLE'); job.durable = true; job.revision = committed;
      let sessionCurrent = false; try { this.#guard(job); sessionCurrent = true; } catch { /* A durable scalar receipt survives lock/cancellation. */ }
      return Object.freeze({ recordId, favorite, revision: committed, persisted: true, sessionCurrent });
    }, signal);
  }
}
export function createSavedReviewFavorites(options: SavedReviewFavoriteOptions): Result<SavedReviewFavorites> {
  try { return Object.freeze({ ok: true, value: new Favorites(options) }); }
  catch (e) { return error(failureCode(e, 'INVALID_INPUT')); }
}
