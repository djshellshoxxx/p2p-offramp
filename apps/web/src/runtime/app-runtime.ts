/** Partial G07 document composition root. Public commands never expose a provider, record payload or key. */
import {
  MAX_RUNTIME_SEQUENCE, RUNTIME_DISPOSE_TIMEOUT_MS, RUNTIME_IDLE_TIMEOUT_MS, RUNTIME_REQUEST_TIMEOUT_MS,
  parseRuntimeCommand, parseRuntimeConfig, parseRuntimeMessage, parseBackupBytes, runtimeFailure, RuntimeBoundaryError,
  type RuntimeCommand, type RuntimeErrorCode, type RuntimeExport, type RuntimeHandle, type RuntimeMessage,
  type RuntimeOperation, type RuntimeResult, type RuntimeStatus,
} from '../../../../packages/schemas/index.ts';

export type RuntimeWorkerPort = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;
export interface AppRuntimeOptions {
  readonly createWorker?: () => RuntimeWorkerPort;
  readonly lifecycle?: boolean;
  readonly now?: () => number;
}
interface Pending {
  readonly command: RuntimeCommand;
  readonly resolve: (result: RuntimeResult<RuntimeStatus | RuntimeExport>) => void;
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
        [...this.#pending.values()].some(value => value.command.operation === 'activity')) return;
    try {
      this.#arm();
      // No public reset API exists. Only the captured document's trusted-event handler sends this control.
      void this.#request('activity', {}, undefined, true);
    } catch { this.#close('UNSUPPORTED_ENVIRONMENT'); }
  };
  #error = (): void => { this.#close('STORAGE_UNAVAILABLE'); };
  #settle(id: number, result: RuntimeResult<RuntimeStatus | RuntimeExport>): void {
    const pending = this.#pending.get(id); if (!pending) return;
    this.#pending.delete(id); clearTimeout(pending.timer); pending.removeAbort(); pending.resolve(result);
  }
  #invalidate(code: RuntimeErrorCode): boolean {
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
    const operation = pending.command.operation;
    if (value.state === 'unlocked') {
      if (operation === 'init' || operation === 'lock' || operation === 'dispose' ||
          (pending.command.operation === 'unlock' && value.handle.profileId !== pending.command.profileId)) return false;
      if (operation !== 'unlock' && (this.#current.state !== 'unlocked' || !sameHandle(this.#current.handle, value.handle))) return false;
      const handle = this.#current.state === 'unlocked' && sameHandle(this.#current.handle, value.handle) ? this.#current.handle : value.handle;
      const changed = this.#current.state !== 'unlocked' || this.#current.handle !== handle;
      this.#current = Object.freeze({ state: 'unlocked', handle });
      if (changed) this.#notify();
      if (operation === 'unlock') this.#arm();
    } else {
      if (operation === 'unlock') return false;
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
    if (pending.command.operation !== message.operation || pending.command.generation !== message.generation) { this.#close('PROTOCOL_ERROR'); return; }
    this.#checkIdle(); if (!this.#pending.has(message.requestId)) return;
    if (message.result.ok && message.operation !== 'exportEncrypted') {
      if (!this.#acceptStatus(message, message.result.value, pending)) { this.#close('PROTOCOL_ERROR'); return; }
      this.#settle(message.requestId, Object.freeze({ ok: true, value: this.#current }));
    } else {
      if (!message.result.ok && pending.command.operation === 'unlock') this.#resetStatus();
      if (message.result.ok && message.operation === 'exportEncrypted') {
        if (pending.command.operation !== 'exportEncrypted' || parseBackupBytes(message.result.value.bytes).envelope.profileId !== pending.command.profileId) { this.#close('PROTOCOL_ERROR'); return; }
      }
      this.#settle(message.requestId, message.result);
    }
  };
  #request(operation: RuntimeOperation, fields: Record<string, unknown> = {}, signal?: AbortSignal, internal = false): Promise<RuntimeResult<RuntimeStatus | RuntimeExport>> {
    this.#checkIdle();
    if (this.#closed || (this.#disposing && operation !== 'dispose')) return Promise.resolve(runtimeFailure('LOCKED'));
    if (signal?.aborted) return Promise.resolve(runtimeFailure('CANCELLED'));
    if ((!internal && this.#pending.size > 0) || (internal && this.#pending.size >= 2)) return Promise.resolve(runtimeFailure('BUSY'));
    if (this.#sequence >= MAX_RUNTIME_SEQUENCE) { this.#close('LIMIT_EXCEEDED'); return Promise.resolve(runtimeFailure('LIMIT_EXCEEDED')); }
    let command: RuntimeCommand;
    try { command = parseRuntimeCommand({ version: 1, requestId: this.#sequence + 1, generation: this.#generation, operation, ...fields }); }
    catch { return Promise.resolve(runtimeFailure('INVALID_INPUT')); }
    this.#sequence++;
    if (operation === 'unlock') this.#resetStatus();
    return new Promise(resolve => {
      const abort = (): void => { if (!this.#closed && !this.#disposing && this.#invalidate('CANCELLED')) void this.#request('lock', {}, undefined, true); };
      const timer = setTimeout(() => this.#close('TIMEOUT'), operation === 'dispose' ? RUNTIME_DISPOSE_TIMEOUT_MS : RUNTIME_REQUEST_TIMEOUT_MS);
      const pending: Pending = { command, resolve, timer, removeAbort: () => signal?.removeEventListener('abort', abort) };
      this.#pending.set(command.requestId, pending); signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      try { this.#worker.postMessage(command); } catch { this.#close('STORAGE_UNAVAILABLE'); }
    });
  }
  get current(): RuntimeStatus { this.#checkIdle(); return this.#current; }
  isCurrent(handle: RuntimeHandle): boolean { this.#checkIdle(); return !this.#closed && !this.#disposing && this.#current.state === 'unlocked' && this.#current.handle === handle; }
  async unlock(profileId: string, passphrase: string, signal?: AbortSignal): Promise<RuntimeResult<RuntimeHandle>> {
    const generation = this.#generation;
    const result = await this.#request('unlock', { profileId, passphrase }, signal);
    if (!result.ok) return result;
    this.#checkIdle();
    if (this.#closed || this.#disposing || this.#generation !== generation) return runtimeFailure('LOCKED');
    if (!('state' in result.value) || result.value.state !== 'unlocked') return runtimeFailure('PROTOCOL_ERROR');
    return this.isCurrent(result.value.handle) ? Object.freeze({ ok: true, value: result.value.handle }) : runtimeFailure('LOCKED');
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
  lock(): Promise<RuntimeResult<RuntimeStatus>> {
    if (this.#closed || this.#disposing || !this.#invalidate('LOCKED')) return Promise.resolve(runtimeFailure('LOCKED'));
    return this.#request('lock', {}, undefined, true) as Promise<RuntimeResult<RuntimeStatus>>;
  }
  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    if (this.#closed) return Promise.resolve();
    this.#disposing = true;
    if (!this.#invalidate('LOCKED')) return Promise.resolve();
    this.#disposal = this.#request('dispose', {}, undefined, true).then(() => { this.#close('LOCKED'); });
    return this.#disposal;
  }
}
