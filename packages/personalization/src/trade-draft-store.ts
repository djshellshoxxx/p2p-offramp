/** One purpose-bound encrypted template row. No trade identity, wallet or network capability. */
import { TRADE_DRAFT_RECORD_ID, TRADE_DRAFT_LIBRARY_FORMAT, TRADE_DRAFT_SCHEMA_VERSION, MAX_REVISION,
  parseTradeDraftChange, parseTradeDraftLibrary, encodeTradeDraftLibraryPayload, decodeTradeDraftLibraryPayload,
  ValidationError, intentData, type TradeDraftLibraryV1, type TradeDraftChangeV1,
  type VaultService, type VaultSessionAuthority, type VaultSession, type VaultSessionLease,
  type PrivateRecordV1, type Result, type VaultErrorCode } from '../../schemas/index.ts';

export type TradeDraftVault = Pick<VaultService, 'list' | 'commit'> & VaultSessionAuthority;
export interface TradeDraftStoreOptions {
  readonly vault: TradeDraftVault; readonly session: VaultSession;
  readonly isCurrent?: () => boolean; readonly randomBytes?: (length: number) => Uint8Array;
  /** Constructor-owned monotonic clock; never an imported preview timestamp. */
  readonly now?: () => number;
}
export interface TradeDraftLibraryState { readonly revision: number; readonly library: TradeDraftLibraryV1; }
export interface TradeDraftChangePreview {
  readonly previewId: string; readonly revision: number; readonly change: TradeDraftChangeV1;
  readonly affectedTemplateCount: number; readonly clearsRepeatDefault: boolean;
  readonly logicalOnly: true; readonly backupAndRemoteCopiesUnaffected: true;
}
export interface TradeDraftChangeConsent { readonly reviewed: true; readonly logicalOnly: true; readonly backupAndRemoteLimitsAcknowledged: true; }
export interface TradeDraftChangeReceipt { readonly revision: number; readonly changed: boolean; readonly persisted: true; readonly sessionCurrent: boolean; }
export interface TradeDraftStore {
  load(signal?: AbortSignal): Promise<Result<TradeDraftLibraryState>>;
  plan(expectedRevision: number, change: TradeDraftChangeV1, signal?: AbortSignal): Promise<Result<TradeDraftChangePreview>>;
  commit(previewId: string, expectedRevision: number, consent: TradeDraftChangeConsent, signal?: AbortSignal): Promise<Result<TradeDraftChangeReceipt>>;
  cancel(): void; dispose(): void;
}
class Failure { readonly code: VaultErrorCode; constructor(code: VaultErrorCode) { this.code = code; } }
const stop = (code: VaultErrorCode): never => { throw new Failure(code); };
const error = (code: VaultErrorCode): Result<never> => Object.freeze({ ok: false, error: Object.freeze({ code, retryable: false, message: 'Local trade templates are unavailable.' }) });
const value = <T>(result: Result<T>): T => result.ok ? result.value : stop(result.error.code);
const ERROR_CODES: readonly VaultErrorCode[] = ['UNSUPPORTED_ENVIRONMENT', 'UNSUPPORTED_VERSION', 'INVALID_INPUT', 'NOT_FOUND',
  'ALREADY_EXISTS', 'AUTHENTICATION_FAILED', 'LOCKED', 'CONFLICT', 'LIMIT_EXCEEDED', 'REKEY_REQUIRED',
  'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'CANCELLED', 'BUSY'];
const PREVIEW_LIFETIME_MS = 300_000;
function codeOf(thrown: unknown): VaultErrorCode {
  try {
    if (thrown instanceof Failure || thrown instanceof ValidationError) {
      const descriptor = Object.getOwnPropertyDescriptor(thrown, 'code');
      if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && ERROR_CODES.includes(descriptor.value as VaultErrorCode)) return descriptor.value as VaultErrorCode;
    }
  } catch { /* Foreign exceptions have no diagnostic authority. */ }
  return 'STORAGE_UNAVAILABLE';
}
const revision = (input: unknown): number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 && input <= MAX_REVISION ? input : stop('INVALID_INPUT');
const empty = (): TradeDraftLibraryV1 => parseTradeDraftLibrary({ format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: [], repeatDefaultSlot: null });
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const listen = EventTarget.prototype.addEventListener, unlisten = EventTarget.prototype.removeEventListener;
interface Job { readonly controller: AbortController; revision: number | undefined; durable: boolean; }
interface Pending { readonly preview: TradeDraftChangePreview; readonly original: string | null; readonly library: TradeDraftLibraryV1; readonly expiresAt: number; }
class DraftStore implements TradeDraftStore {
  readonly #vault: TradeDraftVault; readonly #isCurrent: () => boolean; readonly #random: (length: number) => Uint8Array;
  readonly #now: () => number; #lastTime = -Infinity;
  #lease: VaultSessionLease | undefined; #active: Job | undefined; #preview: Pending | undefined; #closed = false; #lastPreview = '';
  constructor(options: TradeDraftStoreOptions) {
    this.#vault = options.vault; this.#isCurrent = options.isCurrent ?? (() => true);
    this.#random = options.randomBytes ?? (length => crypto.getRandomValues(new Uint8Array(length)));
    this.#now = options.now ?? (() => performance.now());
    if (!this.#vault || typeof this.#vault.captureSession !== 'function' || typeof this.#vault.commit !== 'function' ||
        typeof this.#vault.list !== 'function' || typeof this.#isCurrent !== 'function' || typeof this.#random !== 'function' || typeof this.#now !== 'function') return stop('INVALID_INPUT');
    this.#lease = value(this.#vault.captureSession(options.session, () => this.dispose()));
    try { this.#current(); } catch (error) { this.dispose(); throw error; }
  }
  cancel(): void { this.#preview = undefined; this.#active?.controller.abort(); }
  dispose(): void {
    this.#closed = true; this.cancel(); const lease = this.#lease; this.#lease = undefined;
    try { lease?.dispose(); } catch { /* Scope retirement is permanent even if cleanup throws. */ }
  }
  #current(): Readonly<VaultSession> {
    const lease = this.#lease; if (this.#closed || !lease) return stop('LOCKED');
    let session: Readonly<VaultSession> | null = null, current = false;
    try { session = lease.current(); if (session && !this.#closed) current = this.#isCurrent() === true; } catch { /* Fixed local refusal below. */ }
    if (!session || !current || this.#closed || this.#lease !== lease) { this.dispose(); return stop('LOCKED'); }
    return session;
  }
  #guard(job: Job): Readonly<VaultSession> {
    if (this.#active !== job || this.#closed) return stop('LOCKED');
    if (job.controller.signal.aborted) return stop('CANCELLED');
    const session = this.#current();
    if (this.#active !== job || this.#closed) return stop('LOCKED');
    if (job.controller.signal.aborted) return stop('CANCELLED');
    if (job.revision !== undefined && session.revision !== job.revision) return stop('CONFLICT'); return session;
  }
  async #run<T>(work: (job: Job) => Promise<T>, signal?: AbortSignal): Promise<Result<T>> {
    if (this.#active) return error('BUSY'); if (this.#closed) return error('LOCKED');
    const job: Job = { controller: new AbortController(), revision: undefined, durable: false }; this.#active = job;
    let listening = false; const cancel = (): void => { job.controller.abort(); this.#preview = undefined; };
    try {
      if (signal !== undefined) {
        let isAborted: boolean; try { isAborted = Reflect.apply(aborted, signal, []) as boolean; } catch { return error('INVALID_INPUT'); }
        if (isAborted) return error('CANCELLED'); Reflect.apply(listen, signal, ['abort', cancel, { once: true }]); listening = true;
      }
      this.#guard(job); const result = await work(job); if (!job.durable) this.#guard(job);
      return Object.freeze({ ok: true as const, value: result });
    } catch (thrown) { return error(codeOf(thrown)); }
    finally { if (signal && listening) { try { Reflect.apply(unlisten, signal, ['abort', cancel]); } catch { /* Always drain physical admission. */ } } if (this.#active === job) this.#active = undefined; }
  }
  async #fresh(job: Job): Promise<void> {
    const session = this.#guard(job), rev = job.revision ?? session.revision; job.revision = rev;
    if (value(await this.#vault.commit(session.sessionId, rev, [], job.controller.signal, () => { this.#guard(job); })) !== rev) return stop('CONFLICT'); this.#guard(job);
  }
  #time(job: Job): number {
    let time: number;
    try { time = this.#now(); } catch { return stop('UNSUPPORTED_ENVIRONMENT'); }
    this.#guard(job);
    if (!Number.isFinite(time) || time < 0 || time < this.#lastTime || time > Number.MAX_SAFE_INTEGER - PREVIEW_LIFETIME_MS) return stop('UNSUPPORTED_ENVIRONMENT');
    this.#lastTime = time; return time;
  }
  #checkPreview(job: Job, pending: Pending): void {
    if (this.#time(job) >= pending.expiresAt) return stop('CONFLICT'); this.#guard(job);
  }
  async #read(job: Job, expectedRevision?: number, checkPreview?: () => void): Promise<{ revision: number; original: string | null; library: TradeDraftLibraryV1 }> {
    const session = this.#guard(job); job.revision = session.revision;
    if (expectedRevision !== undefined && session.revision !== revision(expectedRevision)) return stop('CONFLICT');
    await this.#fresh(job); checkPreview?.();
    const rows = value(await this.#vault.list(session.sessionId)); this.#guard(job); checkPreview?.();
    const row = rows.find(record => record.id === TRADE_DRAFT_RECORD_ID);
    let library = empty();
    if (row) {
      if (row.kind !== 'preference') return stop('CONFLICT');
      library = decodeTradeDraftLibraryPayload(row.payload, row.schemaVersion);
    }
    await this.#fresh(job); checkPreview?.(); return { revision: session.revision, original: row ? JSON.stringify(row) : null, library };
  }
  load(signal?: AbortSignal): Promise<Result<TradeDraftLibraryState>> {
    return this.#run(async job => { const stored = await this.#read(job); return Object.freeze({ revision: stored.revision, library: stored.library }); }, signal);
  }
  plan(expectedRevision: number, input: TradeDraftChangeV1, signal?: AbortSignal): Promise<Result<TradeDraftChangePreview>> {
    return this.#run(async job => {
      this.#preview = undefined;
      const change = parseTradeDraftChange(input), stored = await this.#read(job, expectedRevision);
      const templates = [...stored.library.templates]; let repeatDefaultSlot = stored.library.repeatDefaultSlot;
      const position = templates.findIndex(entry => entry.slot === change.slot);
      if (change.kind === 'put-template') {
        const entry = Object.freeze({ slot: change.slot, defaults: change.defaults });
        if (position >= 0) templates[position] = entry; else templates.push(entry);
        templates.sort((a, b) => a.slot - b.slot);
      } else if (change.kind === 'remove-template') {
        if (position < 0) return stop('NOT_FOUND'); templates.splice(position, 1);
        if (repeatDefaultSlot === change.slot) repeatDefaultSlot = null;
      } else {
        if (change.slot !== null && position < 0) return stop('NOT_FOUND'); repeatDefaultSlot = change.slot;
      }
      const library = parseTradeDraftLibrary({ format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates, repeatDefaultSlot });
      const bytes = this.#random(16); this.#guard(job);
      if (!(bytes instanceof Uint8Array) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!.call(bytes) !== 16) return stop('STORAGE_UNAVAILABLE');
      const copy = new Uint8Array(16); Uint8Array.prototype.set.call(copy, bytes);
      let previewId: string; try { previewId = Array.from(copy, byte => byte.toString(16).padStart(2, '0')).join(''); } finally { copy.fill(0); }
      if (previewId === this.#lastPreview) return stop('CONFLICT'); this.#lastPreview = previewId;
      const preview: TradeDraftChangePreview = Object.freeze({ previewId, revision: stored.revision, change,
        affectedTemplateCount: change.kind === 'set-repeat-default' ? 0 : 1,
        clearsRepeatDefault: stored.library.repeatDefaultSlot !== null && library.repeatDefaultSlot === null,
        logicalOnly: true, backupAndRemoteCopiesUnaffected: true });
      const issuedAt = this.#time(job);
      this.#guard(job); this.#preview = { preview, original: stored.original, library, expiresAt: issuedAt + PREVIEW_LIFETIME_MS }; return preview;
    }, signal);
  }
  commit(previewId: string, expectedRevision: number, input: TradeDraftChangeConsent, signal?: AbortSignal): Promise<Result<TradeDraftChangeReceipt>> {
    return this.#run(async job => {
      const pending = this.#preview;
      if (!pending || pending.preview.previewId !== previewId) return stop('NOT_FOUND'); this.#preview = undefined;
      this.#checkPreview(job, pending);
      let consent: Record<string, unknown>; try { consent = intentData(input, ['reviewed', 'logicalOnly', 'backupAndRemoteLimitsAcknowledged']); } catch { return stop('INVALID_INPUT'); }
      if (consent.reviewed !== true || consent.logicalOnly !== true || consent.backupAndRemoteLimitsAcknowledged !== true) return stop('INVALID_INPUT');
      if (pending.preview.revision !== revision(expectedRevision)) return stop('CONFLICT');
      const stored = await this.#read(job, expectedRevision, () => { this.#checkPreview(job, pending); });
      if (stored.original !== pending.original) return stop('CONFLICT');
      const changed = encodeTradeDraftLibraryPayload(stored.library) !== encodeTradeDraftLibraryPayload(pending.library);
      let committed = stored.revision;
      if (changed) {
        const session = this.#guard(job), record: PrivateRecordV1 = { id: TRADE_DRAFT_RECORD_ID, kind: 'preference', schemaVersion: TRADE_DRAFT_SCHEMA_VERSION, payload: encodeTradeDraftLibraryPayload(pending.library) };
        let guardFailure: VaultErrorCode | undefined;
        const result = await this.#vault.commit(session.sessionId, stored.revision, [{ op: 'put', record }], job.controller.signal, () => {
          try { this.#checkPreview(job, pending); } catch (thrown) { guardFailure = codeOf(thrown); throw thrown; }
        });
        // Native G02 normalizes a refused caller guard to CANCELLED; retain this trusted local refusal.
        // A returned durable success still wins if a foreign store ignored its guard.
        if (!result.ok && guardFailure) return stop(guardFailure);
        committed = value(result);
        if (committed !== stored.revision + 1) return stop('STORAGE_UNAVAILABLE');
      }
      job.durable = true; job.revision = committed;
      let sessionCurrent = false; try { this.#guard(job); sessionCurrent = true; } catch { /* Durable native state survives local retirement. */ }
      return Object.freeze({ revision: committed, changed, persisted: true, sessionCurrent });
    }, signal);
  }
}
export function createTradeDraftStore(options: TradeDraftStoreOptions): Result<TradeDraftStore> {
  try { return Object.freeze({ ok: true, value: new DraftStore(options) }); } catch (thrown) { return error(codeOf(thrown)); }
}
