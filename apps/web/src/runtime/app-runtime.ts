/** Partial G07 document composition root. Public commands never expose a provider, record payload or key. */
import {
  MAX_RUNTIME_SEQUENCE, RUNTIME_DISPOSE_TIMEOUT_MS, RUNTIME_IDLE_TIMEOUT_MS, RUNTIME_REQUEST_TIMEOUT_MS,
  parseRuntimeCommand, parseRuntimeConfig, parseTradeDraftChange, parseRuntimeMessage, parseBackupBytes, runtimeFailure, RuntimeBoundaryError,
  type RuntimeCommand, type RuntimeErrorCode, type RuntimeExport, type RuntimeHandle, type RuntimeInventory, type RuntimeMessage,
  type RuntimeOperation, type RuntimeRestore, type RuntimeResult, type RuntimeStatus, type RuntimeValue,
  type BackupVerificationReceipt, type RuntimeBackupVerification,
  type RuntimeTradeTemplates, type RuntimeTradeTemplatePreview, type RuntimeTradeTemplateReceipt, type RuntimeTradeTemplateCancelled, type RuntimeTradeTemplateConsent, type TradeDraftChangeV1,
  type RuntimeSavedReviewRef, type RuntimeSavedReviews, type SavedReviewSource, type RuntimeRecoveryReferences, type RuntimeSavedReviewFavorites, type RuntimeSavedReviewFavorite,
} from '../../../../packages/schemas/index.ts';
import { capturePendingMetadata, type PendingMetadata } from './pending-metadata.ts';

export type RuntimeWorkerPort = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;
export interface AppRuntimeOptions {
  readonly createWorker?: () => RuntimeWorkerPort;
  readonly lifecycle?: boolean;
  readonly now?: () => number;
}
/** Opaque local ownership, including one exact acknowledged lock. It supplies no
 * trust, wallet, navigation or imported-backup authority. */
export interface RuntimeBackupSelection {
  current(): boolean;
  requireVerifiedBackup(signal: AbortSignal): Promise<void>;
  lock(signal: AbortSignal): Promise<void>;
  dispose(): void;
}
interface Pending {
  readonly metadata: PendingMetadata;
  readonly resolve: (result: RuntimeResult<RuntimeValue>) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly removeAbort: () => void;
}
const locked = (): RuntimeStatus => Object.freeze({ state: 'locked', handle: null });
const sameHandle = (left: RuntimeHandle, right: RuntimeHandle): boolean => left.id === right.id && left.generation === right.generation && left.profileId === right.profileId;

export class AppRuntime {
  readonly #worker: RuntimeWorkerPort;
  readonly #options: AppRuntimeOptions;
  readonly #document: EventTarget | undefined;
  readonly #window: EventTarget | undefined;
  #pending = new Map<number, Pending>();
  #generation = 0;
  #sequence = 0;
  // Unlike the UI selection scope, this changes on every admitted opening and
  // every invalidation, including repeated locks with no visible state change.
  #selectionEpoch: object = {};
  #current: RuntimeStatus = locked();
  #closed = false;
  #disposing = false;
  #disposal: Promise<void> | undefined;
  #deadline: number | undefined;
  #lastTime = -Infinity;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #observers = new Set<() => void>();
  #notificationQueued = false;
  private constructor(worker: RuntimeWorkerPort, options: AppRuntimeOptions) {
    this.#worker = worker; this.#options = options;
    const lifecycle = options.lifecycle !== false && typeof document !== 'undefined' && typeof window !== 'undefined';
    this.#document = lifecycle ? document : undefined; this.#window = lifecycle ? window : undefined;
    worker.addEventListener('message', this.#message); worker.addEventListener('messageerror', this.#error); worker.addEventListener('error', this.#error);
    this.#window?.addEventListener('pagehide', this.#pagehide);
    this.#document?.addEventListener('keydown', this.#activity, { capture: true }); this.#document?.addEventListener('pointerdown', this.#activity, { capture: true });
  }
  /** Validate all public configuration before creating even a local Worker or private service. */
  static async start(input: unknown, options: AppRuntimeOptions = {}): Promise<RuntimeResult<AppRuntime>> {
    let config;
    try { config = parseRuntimeConfig(input); } catch { return runtimeFailure('INVALID_INPUT'); }
    if (globalThis.isSecureContext !== true || !globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function' ||
        (!options.createWorker && typeof Worker === 'undefined')) return runtimeFailure('UNSUPPORTED_ENVIRONMENT');
    let runtime: AppRuntime;
    try {
      const worker = (options.createWorker ?? (() => new Worker(new URL('../workers/vault.worker.js', import.meta.url), { type: 'module' })))();
      runtime = new AppRuntime(worker, options);
    } catch { return runtimeFailure('UNSUPPORTED_ENVIRONMENT'); }
    const opened = await runtime.#request('init', { config });
    if (!opened.ok) { runtime.#close(opened.error.code); return opened; }
    if (runtime.#closed || runtime.#disposing || runtime.#generation !== 0) { runtime.#close('LOCKED'); return runtimeFailure('LOCKED'); }
    if (!('state' in opened.value) || opened.value.state !== 'locked') { runtime.#close('PROTOCOL_ERROR'); return runtimeFailure('PROTOCOL_ERROR'); }
    return Object.freeze({ ok: true, value: runtime });
  }
  #time(): number {
    const now = (this.#options.now ?? (() => performance.now()))();
    if (!Number.isFinite(now) || now < this.#lastTime) throw new RuntimeBoundaryError('UNSUPPORTED_ENVIRONMENT');
    this.#lastTime = now; return now;
  }
  #resetStatus(): void {
    const changed = this.#current.state !== 'locked';
    this.#current = locked(); this.#deadline = undefined;
    if (this.#timer !== undefined) clearTimeout(this.#timer); this.#timer = undefined;
    if (changed) this.#notify();
  }
  #notify(): void {
    if (this.#notificationQueued) return;
    this.#notificationQueued = true;
    // Do not let an observer reenter the middle of a generation invalidation or message validation.
    queueMicrotask(() => {
      this.#notificationQueued = false;
      for (const observer of [...this.#observers]) {
        if (!this.#observers.has(observer)) continue;
        try { observer(); } catch { /* One UI observer cannot prevent revocation. */ }
      }
    });
  }
  subscribe(observer: () => void): () => void {
    if (typeof observer !== 'function') return () => undefined;
    this.#observers.add(observer);
    return () => { this.#observers.delete(observer); };
  }
  #arm(): void {
    this.#deadline = this.#time() + RUNTIME_IDLE_TIMEOUT_MS;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#checkIdle(); }, RUNTIME_IDLE_TIMEOUT_MS);
  }
  #checkIdle(): void {
    if (this.#closed || this.#disposing || this.#deadline === undefined) return;
    try { if (this.#time() >= this.#deadline) void this.lock(); } catch { this.#close('UNSUPPORTED_ENVIRONMENT'); }
  }
  #pagehide = (): void => { void this.lock(); };
  #activity = (event: Event): void => {
    this.#checkIdle();
    if (!event.isTrusted || this.#closed || this.#disposing || this.#current.state !== 'unlocked' ||
        [...this.#pending.values()].some(value => value.metadata.operation === 'activity')) return;
    try {
      this.#arm();
      // No public reset API exists. Only the captured document's trusted-event handler sends this control.
      void this.#request('activity', {}, undefined, true);
    } catch { this.#close('UNSUPPORTED_ENVIRONMENT'); }
  };
  #error = (): void => { this.#close('STORAGE_UNAVAILABLE'); };
  #settle(id: number, result: RuntimeResult<RuntimeValue>): void {
    const pending = this.#pending.get(id); if (!pending) return;
    this.#pending.delete(id); clearTimeout(pending.timer); pending.removeAbort(); pending.resolve(result);
  }
  #invalidate(code: RuntimeErrorCode, selectionEpoch: object = {}): boolean {
    this.#selectionEpoch = selectionEpoch;
    this.#resetStatus();
    for (const id of [...this.#pending.keys()]) this.#settle(id, runtimeFailure(code));
    if (this.#generation >= MAX_RUNTIME_SEQUENCE) { this.#close('LIMIT_EXCEEDED'); return false; }
    this.#generation++; return true;
  }
  #close(code: RuntimeErrorCode): void {
    if (this.#closed) return;
    this.#closed = true; this.#resetStatus();
    for (const id of [...this.#pending.keys()]) this.#settle(id, runtimeFailure(code));
    this.#worker.removeEventListener('message', this.#message); this.#worker.removeEventListener('messageerror', this.#error); this.#worker.removeEventListener('error', this.#error);
    this.#window?.removeEventListener('pagehide', this.#pagehide);
    this.#document?.removeEventListener('keydown', this.#activity, { capture: true }); this.#document?.removeEventListener('pointerdown', this.#activity, { capture: true });
    this.#worker.terminate();
  }
  #acceptStatus(message: Extract<RuntimeMessage, { kind: 'response' }>, value: RuntimeStatus, pending: Pending): boolean {
    const operation = pending.metadata.operation;
    const opening = operation === 'unlock' || operation === 'create';
    if (value.state === 'unlocked') {
      if (operation === 'init' || operation === 'lock' || operation === 'dispose' ||
          (pending.metadata.operation === 'unlock' && value.handle.profileId !== pending.metadata.profileId)) return false;
      if (!opening && (this.#current.state !== 'unlocked' || !sameHandle(this.#current.handle, value.handle))) return false;
      // Opening must establish an enforceable idle deadline before any handle becomes observable.
      // An unavailable or regressed clock is terminal even when the Worker reply itself is valid.
      if (opening) {
        try { this.#arm(); } catch { this.#close('UNSUPPORTED_ENVIRONMENT'); return false; }
      }
      const handle = this.#current.state === 'unlocked' && sameHandle(this.#current.handle, value.handle) ? this.#current.handle : value.handle;
      const changed = this.#current.state !== 'unlocked' || this.#current.handle !== handle;
      this.#current = Object.freeze({ state: 'unlocked', handle });
      if (changed) this.#notify();
    } else {
      if (opening) return false;
      this.#resetStatus();
    }
    return message.generation === this.#generation;
  }
  #message = (event: MessageEvent<unknown>): void => {
    if (this.#closed) return;
    let message: RuntimeMessage;
    try { message = parseRuntimeMessage(event.data); } catch { this.#close('PROTOCOL_ERROR'); return; }
    if (message.generation < this.#generation) return;
    if (message.generation > this.#generation) { this.#close('PROTOCOL_ERROR'); return; }
    if (message.kind === 'closed') { this.#close(message.code); return; }
    if (message.kind === 'locked') { if (!this.#disposing) void this.lock(); return; }
    const pending = this.#pending.get(message.requestId);
    if (!pending) { if (message.requestId > this.#sequence) this.#close('PROTOCOL_ERROR'); return; }
    if (pending.metadata.operation !== message.operation || pending.metadata.generation !== message.generation) { this.#close('PROTOCOL_ERROR'); return; }
    this.#checkIdle(); if (!this.#pending.has(message.requestId)) return;
    if (message.result.ok && message.operation !== 'exportEncrypted' && message.operation !== 'listProfiles' && message.operation !== 'restore' &&
        message.operation !== 'saveTermsReview' && message.operation !== 'listTermsReviews' && message.operation !== 'deleteTermsReview' && message.operation !== 'listRecoveryReferences' &&
        message.operation !== 'listFavoriteReviews' && message.operation !== 'setReviewFavorite' && message.operation !== 'loadTradeTemplates' && message.operation !== 'previewTradeTemplateChange' &&
        message.operation !== 'commitTradeTemplateChange' && message.operation !== 'cancelTradeTemplateChange' &&
        message.operation !== 'verifyBackup' && message.operation !== 'checkBackupVerification') {
      if (!this.#acceptStatus(message, message.result.value, pending)) { this.#close('PROTOCOL_ERROR'); return; }
      this.#settle(message.requestId, Object.freeze({ ok: true, value: this.#current }));
    } else {
      if (!message.result.ok && (pending.metadata.operation === 'unlock' || pending.metadata.operation === 'create')) this.#resetStatus();
      // Saved-review replies belong to the profile the command named; it must still be the open profile.
      if (message.result.ok && (message.operation === 'saveTermsReview' || message.operation === 'listTermsReviews' || message.operation === 'deleteTermsReview' || message.operation === 'listRecoveryReferences' ||
          message.operation === 'listFavoriteReviews' || message.operation === 'setReviewFavorite' || message.operation === 'loadTradeTemplates' || message.operation === 'previewTradeTemplateChange' ||
          message.operation === 'commitTradeTemplateChange' || message.operation === 'cancelTradeTemplateChange' ||
          message.operation === 'verifyBackup' || message.operation === 'checkBackupVerification') &&
          (!('profileId' in pending.metadata) || this.#current.state !== 'unlocked' || this.#current.handle.profileId !== pending.metadata.profileId)) {
        this.#settle(message.requestId, runtimeFailure('LOCKED')); return;
      }
      if (message.result.ok && (message.operation === 'verifyBackup' || message.operation === 'checkBackupVerification')) {
        const receipt = message.operation === 'verifyBackup' ? message.result.value : message.result.value.verification;
        if (receipt && (!('profileId' in pending.metadata) || receipt.profileId !== pending.metadata.profileId)) { this.#close('PROTOCOL_ERROR'); return; }
      }
      if (message.result.ok && message.operation === 'exportEncrypted') {
        if (pending.metadata.operation !== 'exportEncrypted' || parseBackupBytes(message.result.value.bytes).envelope.profileId !== pending.metadata.profileId) { this.#close('PROTOCOL_ERROR'); return; }
      }
      this.#settle(message.requestId, message.result);
    }
  };
  #request(operation: RuntimeOperation, fields: Record<string, unknown> = {}, signal?: AbortSignal, internal = false): Promise<RuntimeResult<RuntimeValue>> {
    this.#checkIdle();
    if (this.#closed || (this.#disposing && operation !== 'dispose')) return Promise.resolve(runtimeFailure('LOCKED'));
    if (signal?.aborted) return Promise.resolve(runtimeFailure('CANCELLED'));
    if ((!internal && [...this.#pending.values()].some(value => value.metadata.operation !== 'activity')) ||
        (internal && this.#pending.size >= 2)) return Promise.resolve(runtimeFailure('BUSY'));
    // Retire only the local activity waiter before the click's public command. The already posted
    // Worker notification remains ordered; its late reply is ignored, including after unlock/create.
    if (!internal) for (const [id, pending] of this.#pending) {
      if (pending.metadata.operation === 'activity') this.#settle(id, runtimeFailure('CANCELLED'));
    }
    if (this.#sequence >= MAX_RUNTIME_SEQUENCE) { this.#close('LIMIT_EXCEEDED'); return Promise.resolve(runtimeFailure('LIMIT_EXCEEDED')); }
    let command: RuntimeCommand;
    try { command = parseRuntimeCommand({ version: 1, requestId: this.#sequence + 1, generation: this.#generation, operation, ...fields }); }
    catch { return Promise.resolve(runtimeFailure('INVALID_INPUT')); }
    this.#sequence++;
    if (operation === 'unlock' || operation === 'create') { this.#selectionEpoch = {}; this.#resetStatus(); }
    return new Promise(resolve => {
      const abort = (): void => { if (!this.#closed && !this.#disposing && this.#invalidate('CANCELLED')) void this.#request('lock', {}, undefined, true); };
      const timer = setTimeout(() => this.#close('TIMEOUT'), operation === 'dispose' ? RUNTIME_DISPOSE_TIMEOUT_MS : RUNTIME_REQUEST_TIMEOUT_MS);
      const pending: Pending = { metadata: capturePendingMetadata(command), resolve, timer, removeAbort: () => signal?.removeEventListener('abort', abort) };
      this.#pending.set(command.requestId, pending); signal?.addEventListener('abort', abort, { once: true });
      try {
        if (signal?.aborted) { abort(); return; }
        this.#worker.postMessage(command);
      } catch { this.#close('STORAGE_UNAVAILABLE'); }
      finally { if (command.operation === 'verifyBackup') command.bytes.fill(0); }
    });
  }
  get current(): RuntimeStatus { this.#checkIdle(); return this.#current; }
  isCurrent(handle: RuntimeHandle): boolean { this.#checkIdle(); return !this.#closed && !this.#disposing && this.#current.state === 'unlocked' && this.#current.handle === handle; }
  /** Capture locally owned selection identity; no Worker handle or lifecycle
   * counter leaves the runtime. A later opening is retirement even if it fails. */
  captureBackupSelection(): RuntimeBackupSelection | null {
    this.#checkIdle();
    const selected = this.#current;
    if (this.#closed || this.#disposing || selected.state !== 'unlocked') return null;
    const runtime = this;
    let epoch = this.#selectionEpoch, generation = this.#generation;
    let phase: 'selected' | 'locking' | 'locked' | 'retired' = 'selected';
    const retire = () => { phase = 'retired'; };
    const owns = () => !this.#closed && !this.#disposing && epoch === this.#selectionEpoch && generation === this.#generation;
    const current = (): boolean => {
      this.#checkIdle();
      if (!owns()) { retire(); return false; }
      if (phase === 'selected') {
        if (this.#current.state === 'unlocked' && this.#current.handle === selected.handle) return true;
        retire(); return false;
      }
      return phase === 'locked' && this.#current.state === 'locked';
    };
    const refuse = (code: RuntimeErrorCode): never => { throw new RuntimeBoundaryError(code); };
    return Object.freeze({
      current,
      async requireVerifiedBackup(signal: AbortSignal): Promise<void> {
        if (signal.aborted) { retire(); return refuse('CANCELLED'); }
        if (phase !== 'selected' || !current()) return refuse('LOCKED');
        signal.addEventListener('abort', retire, { once: true });
        try {
          const result = await runtime.checkBackupVerification(signal);
          if (signal.aborted) return refuse('CANCELLED');
          if (!result.ok) return refuse(result.error.code);
          if (phase !== 'selected' || !current()) return refuse('LOCKED');
          if (result.value.verification === null) return refuse('CONFLICT');
        } finally { signal.removeEventListener('abort', retire); }
      },
      async lock(signal: AbortSignal): Promise<void> {
        if (signal.aborted) { retire(); return refuse('CANCELLED'); }
        if (phase !== 'selected' || !current()) return refuse('LOCKED');
        // Capture the owned transition before dispatch, never infer it from the
        // public locked snapshot after an await or a reentrant Worker callback.
        epoch = {}; generation = runtime.#generation + 1; phase = 'locking';
        signal.addEventListener('abort', retire, { once: true });
        try {
          const result = await runtime.#lock(epoch);
          if (signal.aborted) return refuse('CANCELLED');
          if (!result.ok) return refuse(result.error.code);
          if (phase !== 'locking' || !owns() || runtime.#current.state !== 'locked') return refuse('LOCKED');
          phase = 'locked';
          if (!current()) return refuse('LOCKED');
        } catch (error) { retire(); throw error; }
        finally { signal.removeEventListener('abort', retire); }
      },
      dispose: retire,
    });
  }
  async unlock(profileId: string, passphrase: string, signal?: AbortSignal): Promise<RuntimeResult<RuntimeHandle>> {
    const generation = this.#generation;
    const result = await this.#request('unlock', { profileId, passphrase }, signal);
    if (!result.ok) return result;
    this.#checkIdle();
    if (this.#closed || this.#disposing || this.#generation !== generation) return runtimeFailure('LOCKED');
    if (!('state' in result.value) || result.value.state !== 'unlocked') return runtimeFailure('PROTOCOL_ERROR');
    return this.isCurrent(result.value.handle) ? Object.freeze({ ok: true, value: result.value.handle }) : runtimeFailure('LOCKED');
  }
  /** Creates a fresh encrypted profile and opens it; the passphrase never leaves the Worker request. */
  async create(passphrase: string, signal?: AbortSignal): Promise<RuntimeResult<RuntimeHandle>> {
    const generation = this.#generation;
    const result = await this.#request('create', { passphrase }, signal);
    if (!result.ok) return result;
    this.#checkIdle();
    if (this.#closed || this.#disposing || this.#generation !== generation) return runtimeFailure('LOCKED');
    if (!('state' in result.value) || result.value.state !== 'unlocked') return runtimeFailure('PROTOCOL_ERROR');
    return this.isCurrent(result.value.handle) ? Object.freeze({ ok: true, value: result.value.handle }) : runtimeFailure('LOCKED');
  }
  async listProfiles(signal?: AbortSignal): Promise<RuntimeResult<RuntimeInventory>> {
    const generation = this.#generation;
    const result = await this.#request('listProfiles', {}, signal);
    this.#checkIdle();
    if (result.ok && (this.#closed || this.#disposing || this.#generation !== generation)) return runtimeFailure('LOCKED');
    return !result.ok ? result : 'profileIds' in result.value ? Object.freeze({ ok: true, value: result.value }) : runtimeFailure('PROTOCOL_ERROR');
  }
  /** Restores into a fresh-key locked profile. Bytes are copied by the strict command parser before posting. */
  async restore(bytes: Uint8Array, sourcePassphrase: string, destinationPassphrase: string, signal?: AbortSignal): Promise<RuntimeResult<RuntimeRestore>> {
    const generation = this.#generation;
    const result = await this.#request('restore', { bytes, sourcePassphrase, destinationPassphrase }, signal);
    this.#checkIdle();
    if (result.ok && (this.#closed || this.#disposing || this.#generation !== generation)) return runtimeFailure('LOCKED');
    return !result.ok ? result : 'newProfileId' in result.value ? Object.freeze({ ok: true, value: result.value }) : runtimeFailure('PROTOCOL_ERROR');
  }
  async status(): Promise<RuntimeResult<RuntimeStatus>> {
    const generation = this.#generation;
    const result = await this.#request('status');
    this.#checkIdle();
    if (result.ok && (this.#closed || this.#disposing || this.#generation !== generation)) return runtimeFailure('LOCKED');
    if (result.ok && 'state' in result.value && (result.value.state !== this.#current.state ||
        (result.value.state === 'unlocked' && !this.isCurrent(result.value.handle)))) return runtimeFailure('LOCKED');
    return !result.ok ? result : 'state' in result.value ? Object.freeze({ ok: true, value: result.value }) : runtimeFailure('PROTOCOL_ERROR');
  }
  async exportEncrypted(profileId: string, signal?: AbortSignal): Promise<RuntimeResult<RuntimeExport>> {
    const generation = this.#generation;
    const result = await this.#request('exportEncrypted', { profileId }, signal);
    this.#checkIdle();
    if (result.ok && (this.#closed || this.#disposing || this.#generation !== generation)) return runtimeFailure('LOCKED');
    return !result.ok ? result : 'bytes' in result.value ? Object.freeze({ ok: true, value: result.value }) : runtimeFailure('PROTOCOL_ERROR');
  }
  /** Purpose-bound open-profile commands. Replies after lock or profile switch are refused. */
  async #profileCommand<T extends RuntimeValue>(operation: 'saveTermsReview' | 'listTermsReviews' | 'deleteTermsReview' | 'listRecoveryReferences' | 'listFavoriteReviews' | 'setReviewFavorite' | 'loadTradeTemplates' | 'previewTradeTemplateChange' | 'commitTradeTemplateChange' | 'cancelTradeTemplateChange' | 'verifyBackup' | 'checkBackupVerification', fields: Record<string, unknown>,
    accept: (value: RuntimeValue) => value is T, signal?: AbortSignal): Promise<RuntimeResult<T>> {
    this.#checkIdle();
    const current = this.#current;
    if (this.#closed || this.#disposing || current.state !== 'unlocked') return runtimeFailure('LOCKED');
    const generation = this.#generation;
    const result = await this.#request(operation, { profileId: current.handle.profileId, ...fields }, signal);
    this.#checkIdle();
    if (result.ok && (this.#closed || this.#disposing || this.#generation !== generation || !this.isCurrent(current.handle))) return runtimeFailure('LOCKED');
    return !result.ok ? result : accept(result.value) ? Object.freeze({ ok: true, value: result.value }) : runtimeFailure('PROTOCOL_ERROR');
  }
  /** Authenticate the supplied complete file in the current Worker selection; this never restores or writes. */
  verifyBackup(bytes: Uint8Array, passphrase: string, signal?: AbortSignal): Promise<RuntimeResult<BackupVerificationReceipt>> {
    return this.#profileCommand('verifyBackup', { bytes, passphrase },
      (value): value is BackupVerificationReceipt => 'scope' in value && value.scope === 'complete-profile-v1', signal);
  }
  /** Revalidate the Worker-owned fact against the persisted current revision on every call. */
  checkBackupVerification(signal?: AbortSignal): Promise<RuntimeResult<RuntimeBackupVerification>> {
    return this.#profileCommand('checkBackupVerification', {}, (value): value is RuntimeBackupVerification => 'verification' in value, signal);
  }
  saveTermsReview(source: SavedReviewSource, bytes: Uint8Array, signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviewRef>> {
    return this.#profileCommand('saveTermsReview', { source, bytes }, (value): value is RuntimeSavedReviewRef => 'recordId' in value, signal);
  }
  listTermsReviews(signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviews>> {
    return this.#profileCommand('listTermsReviews', {}, (value): value is RuntimeSavedReviews => 'items' in value, signal);
  }
  deleteTermsReview(recordId: string, signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviewRef>> {
    return this.#profileCommand('deleteTermsReview', { recordId }, (value): value is RuntimeSavedReviewRef => 'recordId' in value && value.recordId === recordId, signal);
  }
  listFavoriteReviews(signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviewFavorites>> {
    return this.#profileCommand('listFavoriteReviews', {}, (value): value is RuntimeSavedReviewFavorites => 'recordIds' in value, signal);
  }
  setReviewFavorite(recordId: string, favorite: boolean, expectedRevision: number, signal?: AbortSignal): Promise<RuntimeResult<RuntimeSavedReviewFavorite>> {
    return this.#profileCommand('setReviewFavorite', { recordId, favorite, expectedRevision }, (value): value is RuntimeSavedReviewFavorite =>
      'favorite' in value && value.recordId === recordId && value.favorite === favorite && value.revision === expectedRevision + 1, signal);
  }
  loadTradeTemplates(signal?: AbortSignal): Promise<RuntimeResult<RuntimeTradeTemplates>> {
    return this.#profileCommand('loadTradeTemplates', {}, (value): value is RuntimeTradeTemplates => 'library' in value, signal);
  }
  previewTradeTemplateChange(expectedRevision: number, change: TradeDraftChangeV1, signal?: AbortSignal): Promise<RuntimeResult<RuntimeTradeTemplatePreview>> {
    try { change = parseTradeDraftChange(change); } catch { return Promise.resolve(runtimeFailure('INVALID_INPUT')); }
    return this.#profileCommand('previewTradeTemplateChange', { expectedRevision, change }, (value): value is RuntimeTradeTemplatePreview =>
      'previewId' in value && value.revision === expectedRevision && JSON.stringify(value.change) === JSON.stringify(change), signal);
  }
  commitTradeTemplateChange(previewId: string, expectedRevision: number, consent: RuntimeTradeTemplateConsent, signal?: AbortSignal): Promise<RuntimeResult<RuntimeTradeTemplateReceipt>> {
    return this.#profileCommand('commitTradeTemplateChange', { previewId, expectedRevision, consent }, (value): value is RuntimeTradeTemplateReceipt =>
      'persisted' in value && value.sessionCurrent && value.revision === expectedRevision + (value.changed ? 1 : 0), signal);
  }
  cancelTradeTemplateChange(signal?: AbortSignal): Promise<RuntimeResult<RuntimeTradeTemplateCancelled>> {
    return this.#profileCommand('cancelTradeTemplateChange', {}, (value): value is RuntimeTradeTemplateCancelled => 'cancelled' in value, signal);
  }
  listRecoveryReferences(offset = 0, expectedRevision: number | null = null, signal?: AbortSignal): Promise<RuntimeResult<RuntimeRecoveryReferences>> {
    return this.#profileCommand('listRecoveryReferences', { offset, expectedRevision }, (value): value is RuntimeRecoveryReferences => 'authority' in value && value.offset === offset &&
      (expectedRevision === null || value.revision === expectedRevision), signal);
  }
  #lock(selectionEpoch: object = {}): Promise<RuntimeResult<RuntimeStatus>> {
    if (this.#closed || this.#disposing || !this.#invalidate('LOCKED', selectionEpoch)) return Promise.resolve(runtimeFailure('LOCKED'));
    return this.#request('lock', {}, undefined, true) as Promise<RuntimeResult<RuntimeStatus>>;
  }
  lock(): Promise<RuntimeResult<RuntimeStatus>> { return this.#lock(); }
  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    if (this.#closed) return Promise.resolve();
    this.#disposing = true;
    if (!this.#invalidate('LOCKED')) return Promise.resolve();
    this.#disposal = this.#request('dispose', {}, undefined, true).then(() => { this.#close('LOCKED'); });
    return this.#disposal;
  }
}
