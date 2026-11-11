/**
 * Worker-private composition root. The narrow protocol cannot read, mutate or return private records, except the
 * purpose-bound saved reviews, scalar recovery references and explicit retention counts/consent for the selected profile.
 */
import { EncryptedVaultService, EncryptedBackupService, BackupError, RetentionService, type NativeRetentionAuthority, type RetentionPlan, type RetentionResult } from '../../../../packages/storage/index.ts';
import { createSavedReviewFavorites, createTradeDraftStore, type SavedReviewFavorites, type TradeDraftStore } from '../../../../packages/personalization/index.ts';
import type { SessionTransportPolicy } from '../../../../packages/transport/index.ts';
import {
  parseBackupVerificationReceipt, type BackupVerificationReceipt, decodeBase64url, parseStrictJsonBytes, MAX_SAVED_REVIEW_BYTES, encodeBase64url, encodeSavedReviewPayload, parseSavedReviewPayload, parseRuntimeCommand, MAX_SAVED_REVIEWS, SAVED_REVIEW_SCHEMA_VERSION, parseRuntimeMessage, runtimeFailure, RuntimeBoundaryError, projectRecoveryReferences,
  RUNTIME_IDLE_TIMEOUT_MS, RUNTIME_REQUEST_TIMEOUT_MS, parseRuntimeTransportSelection,
  type RuntimeCommand, type RuntimeErrorCode, type RuntimeHandle, type RuntimeMessage, type RuntimeResult,
  type RuntimeStatus, type RuntimeSavedReview, type VaultSession, type VaultSessionLease, type Result, type PrivateRecordV1, type SavedReviewPayload,
  type RuntimeTransportSelection, type RuntimeSelectTransportMode, type AppTransportChannel,
} from '../../../../packages/schemas/index.ts';

export interface WorkerPrivateServices {
  readonly vault: Pick<EncryptedVaultService, 'unlock' | 'create' | 'listProfiles' | 'lock' | 'lockAll' | 'captureSession' | 'dispose' | 'list' | 'commit' | 'assertFresh' | 'verifyBackup'>;
  /** Trusted Worker construction only. No provider or native proof can arrive through IPC. */
  readonly createRetentionAuthority?: (session: Readonly<VaultSession>) => NativeRetentionAuthority & { dispose(): void };
  readonly backup: Pick<EncryptedBackupService, 'exportWithStatus' | 'restore' | 'dispose'>;
  /** Same actual broker used by compiled I/O adapters. Never constructed from IPC or as a UI fallback. */
  readonly transportPolicy?: WorkerTransportPolicy;
}
export interface WorkerTransportPolicy {
  readonly broker: SessionTransportPolicy;
  readonly brokeredChannels: readonly AppTransportChannel[];
  /** Synchronous invalidation of the existing native signing review; no provider call or physical admission reset. */
  readonly onSelectionChanged?: () => void;
}
export interface WorkerEndpointOptions {
  readonly createServices?: () => WorkerPrivateServices;
  readonly now?: () => number;
  readonly random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}
interface ActiveJob { readonly requestId: number; readonly generation: number; readonly controller: AbortController; readonly deadline: number; timedOut: boolean; }
interface RetentionSelection { readonly handle: RuntimeHandle; readonly service: RetentionService; readonly authority: (NativeRetentionAuthority & {dispose():void}) | undefined; preview: {readonly id:string;readonly plan:RetentionPlan} | undefined; }
interface Selection { readonly handle: RuntimeHandle; readonly lease: VaultSessionLease; }
interface FavoriteSelection { readonly handle: RuntimeHandle; readonly service: SavedReviewFavorites; }
interface DraftSelection { readonly handle: RuntimeHandle; readonly service: TradeDraftStore; }
const locked = (): RuntimeStatus => Object.freeze({ state: 'locked', handle: null });
/** Compatibility read only: the earlier local preview used this wrapper, without a source label.
 * Keep the encrypted record intact and return its original bytes through the canonical review API.
 */
function legacySavedReview(record: PrivateRecordV1): SavedReviewPayload | null {
  if (record.schemaVersion !== 1) return null;
  let raw: unknown;
  try { raw = parseStrictJsonBytes(decodeBase64url(record.payload, 0, 100000), 100000); } catch { return null; }
  if (typeof raw !== 'object' || raw === null || !('format' in raw) || raw.format !== 'p2p-offramp/saved-review/v1') return null;
  try {
    if (Object.keys(raw).sort().join() !== 'bytes,format' || !('bytes' in raw)) throw new Error();
    return Object.freeze({ source: 'file', terms: decodeBase64url(raw.bytes, 1, MAX_SAVED_REVIEW_BYTES) });
  } catch { throw new RuntimeBoundaryError('INVALID_INPUT'); }
}
interface SavedEntry { readonly record: PrivateRecordV1; readonly saved: SavedReviewPayload; }
function savedEntries(records: readonly PrivateRecordV1[]): { readonly entries: SavedEntry[]; readonly skipped: number } {
  const entries: SavedEntry[] = []; let skipped = 0;
  try {
  for (const record of records) {
    if (record.kind !== 'trade') continue;
    const saved = parseSavedReviewPayload(record.payload, record.schemaVersion) ?? legacySavedReview(record);
    if (saved) entries.push({ record, saved }); else skipped++;
  }
  } catch (error) { for (const entry of entries) entry.saved.terms.fill(0); throw error; }
  return { entries, skipped };
}
function sameBytes(a: Uint8Array, b: Uint8Array): boolean { return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]); }
function errorCode(input: unknown): RuntimeErrorCode {
  try {
  if (input instanceof RuntimeBoundaryError) return input.code;
  if (input instanceof BackupError) {
    const value = input.code;
    if (value === 'CHECKSUM_MISMATCH') return 'INVALID_INPUT';
    if (value === 'INVALID_INPUT' || value === 'UNSUPPORTED_ENVIRONMENT' || value === 'UNSUPPORTED_VERSION' || value === 'NOT_FOUND' ||
        value === 'AUTHENTICATION_FAILED' || value === 'LOCKED' || value === 'CONFLICT' || value === 'LIMIT_EXCEEDED' || value === 'QUOTA_EXCEEDED' || value === 'CANCELLED' || value === 'BUSY') return value;
  }
  } catch { /* Foreign exception reflection has no diagnostic authority. */ }
  return 'STORAGE_UNAVAILABLE';
}
function vaultValue<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const value = result.error.code;
  throw new RuntimeBoundaryError(value === 'UNSUPPORTED_ENVIRONMENT' || value === 'UNSUPPORTED_VERSION' || value === 'INVALID_INPUT' ||
    value === 'NOT_FOUND' || value === 'AUTHENTICATION_FAILED' || value === 'LOCKED' || value === 'CONFLICT' || value === 'LIMIT_EXCEEDED' || value === 'QUOTA_EXCEEDED' || value === 'CANCELLED' || value === 'BUSY' ? value : 'STORAGE_UNAVAILABLE');
}

function retentionValue<T>(result: RetentionResult<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  throw new RuntimeBoundaryError(code === 'UNAVAILABLE' ? 'STORAGE_UNAVAILABLE' : code);
}
class VaultWorkerEndpoint {
  readonly #send: (message: RuntimeMessage) => void;
  readonly #options: WorkerEndpointOptions;
  #services: WorkerPrivateServices | undefined;
  #transportBroker: SessionTransportPolicy | undefined;
  #transportChannels: readonly AppTransportChannel[] = Object.freeze([]);
  #transportChanged: (() => void) | undefined;
  #transportReady = false;
  #selectingTransport = false;
  #offTransport: () => void = () => undefined;
  #closed = false;
  #generation = 0;
  #lastRequest = 0;
  #selection: Selection | undefined;
  #backupVerification: { readonly handle: RuntimeHandle; readonly generation: number; readonly receipt: BackupVerificationReceipt } | undefined;
  #active: ActiveJob | undefined;
  #retention: RetentionSelection | undefined;
  #favorites: FavoriteSelection | undefined;
  #drafts: DraftSelection | undefined;
  #deadline: number | undefined;
  #lastTime = -Infinity;
  #timer: ReturnType<typeof setTimeout> | undefined;
  constructor(send: (message: RuntimeMessage) => void, options: WorkerEndpointOptions) { this.#send = send; this.#options = options; }
  #emit(message: RuntimeMessage): void { this.#send(parseRuntimeMessage(message)); }
  #time(): number {
    try {
      const time = (this.#options.now ?? (() => performance.now()))();
      if (!Number.isFinite(time) || time < this.#lastTime) throw new RuntimeBoundaryError('UNSUPPORTED_ENVIRONMENT');
      this.#lastTime = time; return time;
    } catch { throw new RuntimeBoundaryError('UNSUPPORTED_ENVIRONMENT'); }
  }
  #clearRetention(): void {
    const state=this.#retention;this.#retention=undefined;
    try { state?.service.dispose(); } catch { /* Cleanup cannot prevent local revocation. */ }
    try { state?.authority?.dispose(); } catch { /* No foreign cleanup may mask a durable result. */ }
  }
  #clear(): void {
    try { this.#transportBroker?.invalidate(); } catch { /* Other selected resources must still revoke. */ }
    const favorites = this.#favorites; this.#favorites = undefined;
    try { favorites?.service.dispose(); } catch { /* Revocation must continue independently. */ }
    this.#clearDrafts();
    this.#clearRetention();
    this.#backupVerification = undefined;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined; this.#deadline = undefined;
    const previous = this.#selection; this.#selection = undefined;
    previous?.lease.dispose(); this.#active?.controller.abort(); this.#services?.vault.lockAll();
  }
  #clearDrafts(): void {
    const drafts = this.#drafts; this.#drafts = undefined;
    try { drafts?.service.dispose(); } catch { /* A failed cleanup cannot retain authority. */ }
  }
  #revoked(): void {
    if (!this.#selection || this.#closed) return;
    this.#clear(); this.#emit({ version: 1, kind: 'locked', generation: this.#generation });
  }
  #checkDeadline(): void { if (this.#deadline !== undefined && this.#time() >= this.#deadline) this.#revoked(); }
  #armDeadline(): void {
    this.#deadline = this.#time() + RUNTIME_IDLE_TIMEOUT_MS;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      try { this.#checkDeadline(); } catch { this.#protocol('UNSUPPORTED_ENVIRONMENT'); }
    }, RUNTIME_IDLE_TIMEOUT_MS);
  }
  #status(): RuntimeStatus {
    this.#checkDeadline();
    if (this.#selection?.lease.current() === null) this.#revoked();
    return this.#selection ? Object.freeze({ state: 'unlocked', handle: this.#selection.handle }) : locked();
  }
  #guard(job: ActiveJob): void {
    this.#checkDeadline();
    if (this.#closed || job.generation !== this.#generation) throw new RuntimeBoundaryError('LOCKED');
    this.#checkRequestDeadline(job);
    if (job.controller.signal.aborted) throw new RuntimeBoundaryError('CANCELLED');
  }
  #checkRequestDeadline(job: ActiveJob): void {
    if (job.timedOut || this.#time() >= job.deadline) {
      this.#expire(job);
      throw new RuntimeBoundaryError('TIMEOUT');
    }
  }
  #expire(job: ActiveJob): void {
    if (this.#closed || this.#active !== job || job.generation !== this.#generation) return;
    this.#backupVerification = undefined; this.#clearRetention();
    job.timedOut = true; job.controller.abort(); this.#services?.vault.lockAll();
  }
  /** The vault session of the selected profile, which must be the profile the command names. */
  #selected(profileId: string): Readonly<VaultSession> {
    const selection = this.#status().state === 'unlocked' ? this.#selection : undefined;
    const session = selection?.lease.current();
    if (!selection || !session || selection.handle.profileId !== profileId || session.profileId !== profileId) throw new RuntimeBoundaryError('LOCKED');
    return session;
  }
  #protocol(code: RuntimeErrorCode = 'PROTOCOL_ERROR'): void {
    if (this.#closed) return;
    const generation = this.#generation; this.dispose(); this.#emit({ version: 1, kind: 'closed', generation, code });
  }
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true; this.#clear(); this.#transportReady = false;
    try { this.#offTransport(); } catch { /* Broker ownership still retires. */ } this.#offTransport = () => undefined;
    try { this.#transportBroker?.dispose(); } catch { /* Finish vault disposal independently. */ } this.#transportBroker = undefined;
    this.#transportChanged = undefined; this.#services?.vault.dispose(); this.#services?.backup.dispose(); this.#services = undefined;
  }
  #bindTransport(): void {
    const configured = this.#services?.transportPolicy;
    if (!configured) return;
    try {
      const broker = configured.broker;
      this.#transportBroker = broker;
      this.#transportChannels = parseRuntimeTransportSelection({version:1,mode:broker.mode,brokerGeneration:broker.generation,brokeredChannels:configured.brokeredChannels}).brokeredChannels;
      const changed = configured.onSelectionChanged;
      if (changed !== undefined && typeof changed !== 'function') throw Error();
      this.#transportChanged = changed;
      let registered = false, unavailable = false;
      const off = broker.subscribeInvalidation(() => {
        if (!registered) { unavailable = true; return; }
        if (!this.#closed && this.#transportReady) this.#emit({version:1,kind:'transport-selection-invalidated',generation:this.#generation,brokerGeneration:broker.generation});
      });
      if (typeof off !== 'function') throw Error();
      this.#offTransport = off; registered = true;
      if (unavailable) throw Error();
      this.#transportReady = true;
    } catch {
      // An optional policy source cannot prevent ordinary local vault/recovery work.
      this.#transportReady = false;
      try { this.#offTransport(); } catch { /* No source observation remains usable. */ } this.#offTransport = () => undefined;
    }
  }
  #transportSelection(): RuntimeTransportSelection {
    const broker = this.#transportBroker;
    if (this.#closed || !this.#transportReady || !broker) throw new RuntimeBoundaryError('LOCKED');
    return parseRuntimeTransportSelection({version:1,mode:broker.mode,brokerGeneration:broker.generation,brokeredChannels:this.#transportChannels});
  }
  #selectTransport(input: RuntimeSelectTransportMode): RuntimeTransportSelection {
    if (this.#selectingTransport) throw new RuntimeBoundaryError('BUSY');
    this.#selectingTransport = true;
    try {
      const generation = this.#generation, broker = this.#transportBroker, before = this.#transportSelection();
      if (!broker) throw new RuntimeBoundaryError('LOCKED');
      if (before.brokerGeneration !== input.expectedBrokerGeneration) throw new RuntimeBoundaryError('CONFLICT');
      if (before.mode === 'strict' && input.mode === 'ordinary' && !input.ordinaryConsent) throw new RuntimeBoundaryError('INVALID_INPUT');
      if (broker.setMode(input.mode) !== undefined) throw new RuntimeBoundaryError('LOCKED');
      if (before.mode !== input.mode) {
        try { this.#transportChanged?.(); } catch { throw new RuntimeBoundaryError('PROTOCOL_ERROR'); }
      }
      if (this.#closed || this.#generation !== generation || this.#transportBroker !== broker) throw new RuntimeBoundaryError('CANCELLED');
      const selected = this.#transportSelection();
      if (selected.mode !== input.mode || selected.brokerGeneration !== before.brokerGeneration + (before.mode === input.mode ? 0 : 1)) throw new RuntimeBoundaryError('CONFLICT');
      return selected;
    } finally { this.#selectingTransport = false; }
  }
  async dispatch(input: unknown): Promise<void> {
    if (this.#closed) return;
    let command: RuntimeCommand;
    try { command = parseRuntimeCommand(input); } catch { this.#protocol(); return; }
    try {
      if (command.requestId <= this.#lastRequest) { this.#protocol(); return; }
      this.#lastRequest = command.requestId;
      const control = command.operation === 'lock' || command.operation === 'dispose';
      if (command.generation < this.#generation) { this.#reply(command, runtimeFailure('CONFLICT')); return; }
      if (command.generation !== this.#generation + (control ? 1 : 0)) { this.#protocol(); return; }
      this.#checkDeadline();
      if (command.operation === 'init') {
        if (this.#services || command.generation !== 0) { this.#protocol(); return; }
        if (!this.#options.createServices && (globalThis.isSecureContext !== true || !globalThis.indexedDB ||
            !globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function')) throw new RuntimeBoundaryError('UNSUPPORTED_ENVIRONMENT');
        this.#services = (this.#options.createServices ?? (() => ({ vault: new EncryptedVaultService(undefined, crypto, { lifecycle: false }), backup: new EncryptedBackupService() })))();
        this.#bindTransport();
        this.#reply(command, { ok: true, value: locked() }); return;
      }
      if (!this.#services) { this.#protocol(); return; }
      if (control) {
        this.#generation = command.generation; this.#clear();
        if (command.operation === 'dispose') this.dispose();
        this.#reply(command, { ok: true, value: locked() }); return;
      }
      if (command.operation === 'getTransportSelection' || command.operation === 'selectTransportMode') {
        const selected = command.operation === 'getTransportSelection' ? this.#transportSelection() : this.#selectTransport(command);
        this.#reply(command, {ok:true,value:selected}); return;
      }
      if ((command.operation === 'saveTermsReview' || command.operation === 'deleteTermsReview' || command.operation === 'setReviewFavorite' || command.operation === 'commitTradeDraftChange' || command.operation === 'verifyBackup' || command.operation === 'deleteReviewedRecords') &&
          this.#selection?.handle.profileId === command.profileId) this.#backupVerification = undefined;
      if ((command.operation === 'saveTermsReview' || command.operation === 'deleteTermsReview' || command.operation === 'setReviewFavorite' || command.operation === 'commitTradeDraftChange') && this.#selection?.handle.profileId === command.profileId) this.#clearRetention();
      if (command.operation === 'status' || command.operation === 'activity') {
        const value = this.#status();
        // The document's private trusted-event handler is the only caller of activity.
        // Queued activity after expiry sees locked status and cannot revive a key.
        if (command.operation === 'activity' && value.state === 'unlocked') this.#armDeadline();
        this.#reply(command, { ok: true, value }); return;
      }
      if (this.#active) { this.#reply(command, runtimeFailure('BUSY')); return; }
      if ((command.operation === 'saveTermsReview' || command.operation === 'deleteTermsReview' || command.operation === 'setReviewFavorite' || command.operation === 'deleteReviewedRecords') && this.#selection?.handle.profileId === command.profileId) this.#clearDrafts();
      if (command.operation === 'unlock' || command.operation === 'create') this.#clear();
      const job: ActiveJob = { requestId: command.requestId, generation: this.#generation, controller: new AbortController(), deadline: this.#time() + RUNTIME_REQUEST_TIMEOUT_MS, timedOut: false }; this.#active = job;
      const timer = setTimeout(() => this.#expire(job), RUNTIME_REQUEST_TIMEOUT_MS);
      try {
        if (command.operation === 'unlock' || command.operation === 'create') {
          const opened = command.operation === 'unlock'
            ? await this.#services.vault.unlock(command.profileId, command.passphrase, job.controller.signal)
            // A create that commits after cancellation stays encrypted and locked; inventory reveals it later.
            : await this.#services.vault.create(command.passphrase, job.controller.signal, () => this.#guard(job));
          if (opened.ok && (this.#closed || job.generation !== this.#generation || job.controller.signal.aborted)) this.#services?.vault.lock(opened.value.sessionId);
          this.#guard(job);
          const session = vaultValue(opened);
          let lease: VaultSessionLease | undefined;
          try {
            const captured = this.#services.vault.captureSession(session, () => this.#revoked());
            if (!captured.ok) throw new RuntimeBoundaryError('LOCKED');
            lease = captured.value;
            if (lease.current() === null) throw new RuntimeBoundaryError('LOCKED');
            const bytes = new Uint8Array(32);
            let id: string;
            try { (this.#options.random ?? (value => crypto.getRandomValues(value)))(bytes); id = encodeBase64url(bytes); }
            finally { bytes.fill(0); }
            this.#guard(job);
            this.#selection = { handle: Object.freeze({ id, generation: this.#generation, purpose: 'vault', profileId: session.profileId }), lease };
            lease = undefined; this.#armDeadline();
          } catch (error) { lease?.dispose(); this.#services.vault.lock(session.sessionId); throw error; }
          this.#guard(job); this.#reply(command, { ok: true, value: this.#status() });
        } else if (command.operation === 'verifyBackup') {
          const session = this.#selected(command.profileId), handle = this.#selection!.handle;
          const receipt = parseBackupVerificationReceipt(vaultValue(await this.#services.vault.verifyBackup(session.sessionId, command.bytes, command.passphrase, job.controller.signal, () => {
            this.#guard(job);
            if (this.#selection?.handle !== handle) throw new RuntimeBoundaryError('LOCKED');
          })));
          this.#guard(job);
          const current = this.#selected(command.profileId);
          if (this.#selection?.handle !== handle || current.revision !== receipt.revision || receipt.profileId !== current.profileId) throw new RuntimeBoundaryError('CONFLICT');
          this.#backupVerification = {handle,generation:this.#generation,receipt};
          this.#reply(command, {ok:true,value:receipt});
        } else if (command.operation === 'checkBackupVerification') {
          const session = this.#selected(command.profileId), handle = this.#selection!.handle;
          vaultValue(await this.#services.vault.assertFresh(session.sessionId, job.controller.signal)); this.#guard(job);
          const current = this.#selected(command.profileId), fact = this.#backupVerification;
          if (fact && (fact.handle !== handle || fact.generation !== this.#generation || fact.receipt.revision !== current.revision || fact.receipt.profileId !== current.profileId)) this.#backupVerification = undefined;
          this.#reply(command, {ok:true,value:Object.freeze({verification:this.#backupVerification?.receipt ?? null})});
        } else if (command.operation === 'listProfiles') {
          const value = vaultValue(await this.#services.vault.listProfiles(job.controller.signal)); this.#guard(job);
          this.#reply(command, { ok: true, value: Object.freeze({ profileIds: Object.freeze([...value.profileIds]), truncated: value.truncated }) });
        } else if (command.operation === 'restore') {
          const receipt = await this.#services.backup.restore(command.bytes, command.sourcePassphrase, command.destinationPassphrase, job.controller.signal, () => this.#guard(job));
          // A committed restore is durable even if this job is now stale; only the reply is suppressed.
          this.#guard(job);
          this.#reply(command, { ok: true, value: Object.freeze({ newProfileId: receipt.newProfileId, records: receipt.records }) });
        } else if (command.operation === 'exportEncrypted') {
          const value = await this.#services.backup.exportWithStatus(command.profileId, job.controller.signal); this.#guard(job);
          this.#reply(command, { ok: true, value });
        } else if (command.operation === 'listRecoveryReferences') {
          const vault = this.#services.vault, session = this.#selected(command.profileId);
          vaultValue(await vault.assertFresh(session.sessionId, job.controller.signal)); this.#guard(job);
          if (command.expectedRevision !== null && command.expectedRevision !== session.revision) throw new RuntimeBoundaryError('CONFLICT');
          const records = vaultValue(await vault.list(session.sessionId, 'journal')); this.#guard(job);
          let value;
          try { value = projectRecoveryReferences(records, command.offset, session.revision); } catch { throw new RuntimeBoundaryError('INVALID_INPUT'); }
          vaultValue(await vault.assertFresh(session.sessionId, job.controller.signal)); this.#guard(job);
          const current = this.#selected(command.profileId);
          if (current.sessionId !== session.sessionId || current.revision !== session.revision) throw new RuntimeBoundaryError('CONFLICT');
          this.#reply(command, { ok: true, value });
        } else if (command.operation === 'planRetention' || command.operation === 'reviewRetention') {
          this.#clearRetention();
          const session=this.#selected(command.profileId),handle=this.#selection!.handle;
          // Offline planning does not even construct a native provider: constructors are trusted code but may acquire resources.
          let unattachedAuthority:RetentionSelection['authority'];let unattachedService:RetentionService|undefined;let state:RetentionSelection|undefined;
          try {
          const authority=command.operation==='reviewRetention'?this.#services.createRetentionAuthority?.(session):undefined;unattachedAuthority=authority;
          this.#guard(job);this.#selected(command.profileId);
          const vault=this.#services.vault;
          const guardedVault={list:vault.list.bind(vault),assertFresh:vault.assertFresh.bind(vault),captureSession:vault.captureSession.bind(vault),
            commit:((sessionId,revision,mutations,signal,assertCurrent)=>{
              const active=this.#active;if(!active)throw new RuntimeBoundaryError('LOCKED');
              return vault.commit(sessionId,revision,mutations,signal,()=>{
                if(this.#active!==active)throw new RuntimeBoundaryError('LOCKED');
                this.#guard(active);assertCurrent?.();this.#guard(active);
              });
            }) as typeof vault.commit};
          unattachedService=new RetentionService(guardedVault,session,authority);
          state={handle,authority,service:unattachedService,preview:undefined};
          this.#retention=state;unattachedService=undefined;unattachedAuthority=undefined;
          const now=Date.now();
          const plan=retentionValue(await (command.operation==='planRetention'?state.service.planRetention(now,job.controller.signal):state.service.reviewRetention(now,job.controller.signal)));
          this.#guard(job);
          const current=this.#selected(command.profileId);
          if(this.#retention!==state||this.#selection?.handle!==handle||current.revision!==plan.revision)throw new RuntimeBoundaryError('CONFLICT');
          const random=new Uint8Array(32);let id:string;
          try{(this.#options.random??(value=>crypto.getRandomValues(value)))(random);id=encodeBase64url(random);}finally{random.fill(0);}
          state.preview=Object.freeze({id,plan});
          this.#reply(command,{ok:true,value:Object.freeze({...plan,profileId:command.profileId,previewId:id,nativeReviewAvailable:typeof this.#services.createRetentionAuthority==='function'})});
          } catch (error) {
            if(state&&this.#retention===state)this.#clearRetention();
            try{unattachedService?.dispose();}catch{/* Release the returned authority even if service cleanup fails. */}
            try{unattachedAuthority?.dispose();}catch{/* Cleanup cannot mask the fixed operation error. */}
            throw error;
          }
        } else if (command.operation === 'deleteReviewedRecords') {
          const session=this.#selected(command.profileId),state=this.#retention,preview=state?.preview;
          if(state)state.preview=undefined; // A confirmation is single-use, including failed/uncertain writes.
          if(!state||!preview||state.handle!==this.#selection?.handle||preview.id!==command.previewId)throw new RuntimeBoundaryError('INVALID_INPUT');
          if(preview.plan.revision!==command.expectedRevision||session.revision!==command.expectedRevision)throw new RuntimeBoundaryError('CONFLICT');
          try{
            const receipt=retentionValue(await state.service.deleteReviewedRecords(preview.plan,{version:1,expectedRevision:command.expectedRevision,consentRevision:command.consentRevision,reviewed:command.reviewed,logicalOnly:command.logicalOnly,backupAndRemoteLimitsAcknowledged:command.backupAndRemoteLimitsAcknowledged},job.controller.signal));
            // This fixed count receipt reports a completed CAS. Cancellation cannot turn a durable delete into a false failure.
            // The document still discards replies for obsolete selections, generations or cancelled requests.
            if(!this.#closed&&job.generation===this.#generation)this.#emit({version:1,requestId:command.requestId,generation:command.generation,operation:command.operation,kind:'response',result:{ok:true,value:Object.freeze({...receipt,profileId:command.profileId})}});
          }finally{this.#clearRetention();}
        } else if (command.operation === 'loadTradeDraftLibrary' || command.operation === 'planTradeDraftChange' || command.operation === 'commitTradeDraftChange') {
          const session = this.#selected(command.profileId), handle = this.#selection!.handle;
          let drafts = this.#drafts;
          if (!drafts || drafts.handle !== handle) {
            this.#clearDrafts(); const vault = this.#services.vault, selectedProfileId = command.profileId;
            const guardedVault = { list: vault.list.bind(vault), captureSession: vault.captureSession.bind(vault),
              commit: (sessionId: string, expectedRevision: number, mutations: Parameters<typeof vault.commit>[2], signal?: AbortSignal, assertCurrent?: () => void) => {
                const owned = this.#active; if (!owned) throw new RuntimeBoundaryError('LOCKED');
                return vault.commit(sessionId, expectedRevision, mutations, signal, () => {
                  this.#guard(owned); this.#selected(selectedProfileId); assertCurrent?.(); this.#guard(owned);
                  if (this.#selection?.handle !== handle) throw new RuntimeBoundaryError('LOCKED');
                });
              } };
            const service = vaultValue(createTradeDraftStore({ vault: guardedVault, session, now: () => this.#time(), isCurrent: () =>
              !this.#closed && this.#selection?.handle === handle && this.#status().state === 'unlocked' && this.#selection?.handle === handle }));
            try { this.#guard(job); if (this.#selection?.handle !== handle) throw new RuntimeBoundaryError('LOCKED'); } catch (error) { service.dispose(); throw error; }
            drafts = { handle, service }; this.#drafts = drafts;
          }
          if (command.operation === 'commitTradeDraftChange') {
            const receipt = vaultValue(await drafts.service.commit(command.previewId, command.expectedRevision, { reviewed: command.reviewed,
              logicalOnly: command.logicalOnly, backupAndRemoteLimitsAcknowledged: command.backupAndRemoteLimitsAcknowledged }, job.controller.signal));
            // A successful native CAS remains a durable scalar result; the document rejects obsolete selections.
            if (!this.#closed && job.generation === this.#generation) this.#emit({ version: 1, requestId: command.requestId, generation: command.generation,
              operation: command.operation, kind: 'response', result: { ok: true, value: receipt } });
          } else if (command.operation === 'planTradeDraftChange') {
            const preview = vaultValue(await drafts.service.plan(command.expectedRevision, command.change, job.controller.signal));
            this.#guard(job); this.#selected(command.profileId); this.#reply(command, { ok: true, value: preview });
          } else {
            const library = vaultValue(await drafts.service.load(job.controller.signal)); this.#guard(job); this.#selected(command.profileId);
            this.#reply(command, { ok: true, value: library });
          }
        } else if (command.operation === 'listReviewFavorites' || command.operation === 'setReviewFavorite') {
          const session = this.#selected(command.profileId), handle = this.#selection!.handle;
          let favorites = this.#favorites;
          if (!favorites || favorites.handle !== handle) {
            favorites?.service.dispose(); this.#favorites = undefined;
            const service = vaultValue(createSavedReviewFavorites({ vault: this.#services.vault, session, isCurrent: () =>
              !this.#closed && this.#selection?.handle === handle && this.#status().state === 'unlocked' && this.#selection?.handle === handle }));
            try { this.#guard(job); if (this.#selection?.handle !== handle) throw new RuntimeBoundaryError('LOCKED'); }
            catch (error) { service.dispose(); throw error; }
            favorites = { handle, service }; this.#favorites = favorites;
          }
          if (command.operation === 'listReviewFavorites') {
            const listed = vaultValue(await favorites.service.list(job.controller.signal)); this.#guard(job);
            if (this.#selection?.handle !== handle) throw new RuntimeBoundaryError('LOCKED');
            this.#reply(command, { ok: true, value: listed });
          } else {
            const receipt = vaultValue(await favorites.service.set(command.recordId, command.favorite, command.expectedRevision, job.controller.signal));
            // A confirmed native CAS remains a scalar receipt. Obsolete selections/generations discard it in the document.
            if (!this.#closed && job.generation === this.#generation) this.#emit({ version: 1, requestId: command.requestId,
              generation: command.generation, operation: command.operation, kind: 'response', result: { ok: true, value: receipt } });
          }
        } else if (command.operation === 'saveTermsReview' || command.operation === 'listTermsReviews' || command.operation === 'deleteTermsReview') {
          const vault = this.#services.vault;
          const session = this.#selected(command.profileId);
          vaultValue(await vault.assertFresh(session.sessionId, job.controller.signal)); this.#guard(job);
          const records = vaultValue(await vault.list(session.sessionId)); this.#guard(job);
          const { entries, skipped } = savedEntries(records);
          try {
          if (command.operation === 'listTermsReviews') {
            vaultValue(await vault.assertFresh(session.sessionId, job.controller.signal)); this.#guard(job); this.#selected(command.profileId);
            const items: RuntimeSavedReview[] = entries.slice(0, MAX_SAVED_REVIEWS).map(entry => Object.freeze({ recordId: entry.record.id, source: entry.saved.source, bytes: entry.saved.terms }));
            this.#reply(command, { ok: true, value: Object.freeze({ items: Object.freeze(items), skipped: skipped + Math.max(0, entries.length - MAX_SAVED_REVIEWS) }) });
          } else {
            let mutation: { op: 'put'; record: PrivateRecordV1 };
            let recordId: string;
            if (command.operation === 'saveTermsReview') {
              // Idempotent: the same bytes from the same source are one saved review, so a retry after an
              // uncertain reply cannot create duplicates.
              const existing = entries.find(entry => entry.saved.source === command.source && sameBytes(entry.saved.terms, command.bytes));
              if (existing) {
                vaultValue(await vault.assertFresh(session.sessionId, job.controller.signal)); this.#guard(job); this.#selected(command.profileId);
                this.#reply(command, { ok: true, value: Object.freeze({ recordId: existing.record.id }) }); return;
              }
              if (entries.length >= MAX_SAVED_REVIEWS) throw new RuntimeBoundaryError('LIMIT_EXCEEDED');
              const random = new Uint8Array(16);
              (this.#options.random ?? (value => crypto.getRandomValues(value)))(random);
              recordId = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
              // A put replaces any record with the same id, so an id already used by any kind is refused.
              if (records.some(record => record.id === recordId)) throw new RuntimeBoundaryError('CONFLICT');
              mutation = { op: 'put', record: { id: recordId, kind: 'trade', schemaVersion: SAVED_REVIEW_SCHEMA_VERSION, payload: encodeSavedReviewPayload(command.source, command.bytes) } };
            } else {
              const target = entries.find(entry => entry.record.id === command.recordId);
              if (!target) throw new RuntimeBoundaryError('NOT_FOUND');
              // DATA01 requires a dependency preview and explicit logical-deletion consent.
              // The old immediate-delete command cannot grant those facts. Use the retention flow.
              throw new RuntimeBoundaryError('NATIVE_PROOF_REQUIRED');
            }
            this.#guard(job);
            const current = this.#selected(command.profileId);
            if (current.sessionId !== session.sessionId || current.revision !== session.revision) throw new RuntimeBoundaryError('CONFLICT');
            vaultValue(await vault.commit(current.sessionId, current.revision, [mutation], job.controller.signal, () => this.#guard(job)));
            // A commit that lands after lock/timeout stays durable; only the reply is suppressed (retry is idempotent).
            this.#guard(job);
            this.#reply(command, { ok: true, value: Object.freeze({ recordId }) });
          }
          } finally { for (const entry of entries) entry.saved.terms.fill(0); }
        } else throw new RuntimeBoundaryError('PROTOCOL_ERROR');
      } catch (error) {
        if (!this.#closed && job.generation === this.#generation) this.#checkRequestDeadline(job);
        throw error;
      } finally { clearTimeout(timer); if (this.#active === job) this.#active = undefined; }
    } catch (error) {
      const code=errorCode(error);
      if (code === 'UNSUPPORTED_ENVIRONMENT') { this.#protocol(code); return; }
      if (!this.#closed && command.generation === this.#generation) this.#reply(command, runtimeFailure(code));
    } finally { if (command.operation === 'verifyBackup' || command.operation === 'saveTermsReview') command.bytes.fill(0); }
  }
  #reply(command: RuntimeCommand, result: unknown): void {
    if (this.#active?.requestId === command.requestId && (result as RuntimeResult<unknown>).ok) this.#guard(this.#active);
    this.#emit({ version: 1, requestId: command.requestId, generation: command.generation, operation: command.operation, kind: 'response', result } as RuntimeMessage);
  }
}

export function createVaultWorkerEndpoint(send: (message: RuntimeMessage) => void, options: WorkerEndpointOptions = {}): Pick<VaultWorkerEndpoint, 'dispatch' | 'dispose'> {
  return new VaultWorkerEndpoint(send, options);
}
