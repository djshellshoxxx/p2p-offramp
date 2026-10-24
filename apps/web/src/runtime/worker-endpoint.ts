/** Worker-private composition root. The narrow protocol cannot read, mutate or return private records. */
import { EncryptedVaultService, EncryptedBackupService, BackupError } from '../../../../packages/storage/index.ts';
import {
  encodeBase64url, parseRuntimeCommand, parseRuntimeMessage, runtimeFailure, RuntimeBoundaryError,
  RUNTIME_IDLE_TIMEOUT_MS, RUNTIME_REQUEST_TIMEOUT_MS,
  type RuntimeCommand, type RuntimeErrorCode, type RuntimeHandle, type RuntimeMessage, type RuntimeResult,
  type RuntimeStatus, type VaultSessionLease, type Result,
} from '../../../../packages/schemas/index.ts';

export interface WorkerPrivateServices {
  readonly vault: Pick<EncryptedVaultService, 'unlock' | 'lock' | 'lockAll' | 'captureSession' | 'dispose'>;
  readonly backup: Pick<EncryptedBackupService, 'exportWithStatus' | 'dispose'>;
}
export interface WorkerEndpointOptions {
  readonly createServices?: () => WorkerPrivateServices;
  readonly now?: () => number;
  readonly random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}
interface ActiveJob { readonly generation: number; readonly controller: AbortController; }
interface Selection { readonly handle: RuntimeHandle; readonly lease: VaultSessionLease; }
const locked = (): RuntimeStatus => Object.freeze({ state: 'locked', handle: null });
function errorCode(input: unknown): RuntimeErrorCode {
  if (input instanceof RuntimeBoundaryError) return input.code;
  if (input instanceof BackupError) {
    const value = input.code;
    if (value === 'INVALID_INPUT' || value === 'UNSUPPORTED_ENVIRONMENT' || value === 'UNSUPPORTED_VERSION' || value === 'NOT_FOUND' ||
        value === 'AUTHENTICATION_FAILED' || value === 'LOCKED' || value === 'CONFLICT' || value === 'LIMIT_EXCEEDED' || value === 'CANCELLED' || value === 'BUSY') return value;
  }
  return 'STORAGE_UNAVAILABLE';
}
function vaultValue<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const value = result.error.code;
  throw new RuntimeBoundaryError(value === 'UNSUPPORTED_ENVIRONMENT' || value === 'UNSUPPORTED_VERSION' || value === 'INVALID_INPUT' ||
    value === 'NOT_FOUND' || value === 'AUTHENTICATION_FAILED' || value === 'LOCKED' || value === 'CONFLICT' || value === 'LIMIT_EXCEEDED' || value === 'CANCELLED' ? value : 'STORAGE_UNAVAILABLE');
}

class VaultWorkerEndpoint {
  readonly #send: (message: RuntimeMessage) => void;
  readonly #options: WorkerEndpointOptions;
  #services: WorkerPrivateServices | undefined;
  #closed = false;
  #generation = 0;
  #lastRequest = 0;
  #selection: Selection | undefined;
  #active: ActiveJob | undefined;
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
  #clear(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined; this.#deadline = undefined;
    const previous = this.#selection; this.#selection = undefined;
    previous?.lease.dispose(); this.#active?.controller.abort(); this.#services?.vault.lockAll();
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
    if (job.controller.signal.aborted) throw new RuntimeBoundaryError('CANCELLED');
  }
  #protocol(code: RuntimeErrorCode = 'PROTOCOL_ERROR'): void {
    if (this.#closed) return;
    const generation = this.#generation; this.dispose(); this.#emit({ version: 1, kind: 'closed', generation, code });
  }
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true; this.#clear(); this.#services?.vault.dispose(); this.#services?.backup.dispose(); this.#services = undefined;
  }
  async dispatch(input: unknown): Promise<void> {
    if (this.#closed) return;
    let command: RuntimeCommand;
    try { command = parseRuntimeCommand(input); } catch { this.#protocol(); return; }
    if (command.requestId <= this.#lastRequest) { this.#protocol(); return; }
    this.#lastRequest = command.requestId;
    const control = command.operation === 'lock' || command.operation === 'dispose';
    if (command.generation < this.#generation) { this.#reply(command, runtimeFailure('CONFLICT')); return; }
    if (command.generation !== this.#generation + (control ? 1 : 0)) { this.#protocol(); return; }
    try {
      this.#checkDeadline();
      if (command.operation === 'init') {
        if (this.#services || command.generation !== 0) { this.#protocol(); return; }
        if (!this.#options.createServices && (globalThis.isSecureContext !== true || !globalThis.indexedDB ||
            !globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function')) throw new RuntimeBoundaryError('UNSUPPORTED_ENVIRONMENT');
        this.#services = (this.#options.createServices ?? (() => ({ vault: new EncryptedVaultService(undefined, crypto, { lifecycle: false }), backup: new EncryptedBackupService() })))();
        this.#reply(command, { ok: true, value: locked() }); return;
      }
      if (!this.#services) { this.#protocol(); return; }
      if (control) {
        this.#generation = command.generation; this.#clear();
        if (command.operation === 'dispose') this.dispose();
        this.#reply(command, { ok: true, value: locked() }); return;
      }
      if (command.operation === 'status' || command.operation === 'activity') {
        const value = this.#status();
        // The document's private trusted-event handler is the only caller of activity.
        // Queued activity after expiry sees locked status and cannot revive a key.
        if (command.operation === 'activity' && value.state === 'unlocked') this.#armDeadline();
        this.#reply(command, { ok: true, value }); return;
      }
      if (this.#active) { this.#reply(command, runtimeFailure('BUSY')); return; }
      if (command.operation === 'unlock') this.#clear();
      const job: ActiveJob = { generation: this.#generation, controller: new AbortController() }; this.#active = job;
      const started = this.#time();
      const timer = setTimeout(() => { job.controller.abort(); this.#services?.vault.lockAll(); }, RUNTIME_REQUEST_TIMEOUT_MS);
      try {
        if (command.operation === 'unlock') {
          const opened = await this.#services.vault.unlock(command.profileId, command.passphrase, job.controller.signal);
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
          if (this.#time() - started >= RUNTIME_REQUEST_TIMEOUT_MS) { this.#clear(); throw new RuntimeBoundaryError('TIMEOUT'); }
          this.#guard(job); this.#reply(command, { ok: true, value: this.#status() });
        } else if (command.operation === 'exportEncrypted') {
          const value = await this.#services.backup.exportWithStatus(command.profileId, job.controller.signal); this.#guard(job);
          if (this.#time() - started >= RUNTIME_REQUEST_TIMEOUT_MS) throw new RuntimeBoundaryError('TIMEOUT');
          this.#reply(command, { ok: true, value });
        } else throw new RuntimeBoundaryError('PROTOCOL_ERROR');
      } finally { clearTimeout(timer); if (this.#active === job) this.#active = undefined; }
    } catch (error) {
      if (error instanceof RuntimeBoundaryError && error.code === 'UNSUPPORTED_ENVIRONMENT') { this.#protocol(error.code); return; }
      if (!this.#closed && command.generation === this.#generation) this.#reply(command, runtimeFailure(errorCode(error)));
    }
  }
  #reply(command: RuntimeCommand, result: unknown): void {
    this.#emit({ version: 1, requestId: command.requestId, generation: command.generation, operation: command.operation, kind: 'response', result } as RuntimeMessage);
  }
}

export function createVaultWorkerEndpoint(send: (message: RuntimeMessage) => void, options: WorkerEndpointOptions = {}): Pick<VaultWorkerEndpoint, 'dispatch' | 'dispose'> {
  return new VaultWorkerEndpoint(send, options);
}
