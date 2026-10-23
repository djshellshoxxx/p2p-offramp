import {
  decodeBase64url, encodeBase64url, encodePassphrase, MAX_REVISION, parsePrivateSnapshot, parseVaultEnvelope,
  ValidationError, type PrivateRecordV1, type PrivateSnapshotV1, type RecordKind, type VaultEnvelopeV1,
} from '../../schemas/src/vault.ts';
import type { Mutation, Result, VaultErrorCode, VaultService, VaultSession } from '../../schemas/src/vault-service.ts';
import { createEnvelope, openEnvelope, encryptRevision, disposeMaterial, VaultCryptoError,
  type CryptoProvider, type UnlockedMaterial } from './vault-crypto.ts';
import { IndexedDbVaultStore, VaultStorageError, sameEnvelope, type VaultStore, type StoreWriteOptions } from './idb-vault-store.ts';
export { VaultStorageError } from './idb-vault-store.ts';
export type { VaultStore } from './idb-vault-store.ts';

class Failure extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode) { super('Vault operation failed.'); this.code = code; }
}
const messages: Record<VaultErrorCode, string> = {
  UNSUPPORTED_ENVIRONMENT: 'Encrypted vault storage is unavailable in this environment.',
  UNSUPPORTED_VERSION: 'This vault version is unsupported.', INVALID_INPUT: 'Invalid vault input.',
  NOT_FOUND: 'The requested vault was not found.', ALREADY_EXISTS: 'A vault with this profile already exists.',
  AUTHENTICATION_FAILED: 'Vault authentication failed.', LOCKED: 'The vault session is locked.',
  CONFLICT: 'The vault changed. Unlock it again before writing.', LIMIT_EXCEEDED: 'The vault safety limit was reached.',
  REKEY_REQUIRED: 'Fresh-key migration is required before further writes.', QUOTA_EXCEEDED: 'Encrypted storage quota was exceeded.',
  STORAGE_UNAVAILABLE: 'Encrypted storage is unavailable. Unlock and reconcile before retrying.', CANCELLED: 'The vault operation was cancelled.',
};
function failed(error: unknown): Result<never> {
  const code: VaultErrorCode = error instanceof Failure || error instanceof ValidationError || error instanceof VaultCryptoError || error instanceof VaultStorageError
    ? error.code : 'STORAGE_UNAVAILABLE';
  return { ok: false, error: { code, retryable: code === 'STORAGE_UNAVAILABLE' || code === 'QUOTA_EXCEEDED', message: messages[code] } };
}
function requireId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{32}$/.test(value)) throw new ValidationError();
  return value;
}
function requireToken(value: unknown): string { decodeBase64url(value, 32, 32); return value as string; }
function kind(value: unknown): RecordKind {
  if (value !== 'identity' && value !== 'preference' && value !== 'trade' && value !== 'chat' && value !== 'journal') throw new ValidationError();
  return value;
}
function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ValidationError();
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new ValidationError();
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) throw new ValidationError();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !('value' in property)) throw new ValidationError();
      copy[key] = property.value;
    }
    return copy;
  } catch { throw new ValidationError(); }
}
function mutationCopies(input: readonly Mutation[], snapshot: PrivateSnapshotV1): Mutation[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new ValidationError();
    const length = Object.getOwnPropertyDescriptor(input, 'length')?.value as unknown;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) throw new ValidationError();
    if (length > 256) throw new ValidationError('LIMIT_EXCEEDED');
    if (Reflect.ownKeys(input).length !== length + 1) throw new ValidationError();
    const ids = new Set<string>(); const mutations: Mutation[] = [];
    for (let i = 0; i < length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
      if (!descriptor || !('value' in descriptor)) throw new ValidationError();
      const raw: unknown = descriptor.value;
      const operation = typeof raw === 'object' && raw !== null ? Object.getOwnPropertyDescriptor(raw, 'op') : undefined;
      if (!operation || !('value' in operation)) throw new ValidationError();
      let mutation: Mutation;
      if (operation.value === 'delete') mutation = { op: 'delete', id: requireId(fields(raw, ['op', 'id']).id) };
      else if (operation.value === 'put') {
        const record = parsePrivateSnapshot({ ...snapshot, records: [fields(raw, ['op', 'record']).record] }).records[0]!;
        mutation = { op: 'put', record };
      } else throw new ValidationError();
      const id = mutation.op === 'put' ? mutation.record.id : mutation.id;
      if (ids.has(id)) throw new ValidationError();
      ids.add(id); mutations.push(mutation);
    }
    return mutations;
  } catch (error) { if (error instanceof ValidationError) throw error; throw new ValidationError(); }
}
interface SessionState {
  token: string; generation: number; revoked: boolean; material: UnlockedMaterial;
  snapshot: PrivateSnapshotV1 | undefined; envelope: VaultEnvelopeV1 | undefined;
  tail: Promise<void>; operations: Set<AbortController>;
}
export interface VaultServiceOptions {
  lifecycle?: boolean;
  /** Injected stores are shared by default; true explicitly transfers connection ownership. */
  ownsStore?: boolean;
}

/** G02 authenticated cache and session authority. It never stores plaintext or imports writable DEKs. */
export class EncryptedVaultService implements VaultService {
  #sessions = new Map<string, SessionState>();
  #epoch = 0;
  #disposed = false;
  #opening: Promise<void> = Promise.resolve();
  #pending = new Set<AbortController>();
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #lifecycle: boolean;
  #unsubscribe: () => void;
  readonly #store: VaultStore;
  readonly #ownsStore: boolean;
  readonly #provider: CryptoProvider;
  constructor(store: VaultStore | undefined = undefined,
    provider: CryptoProvider = globalThis.crypto, options: VaultServiceOptions = {}) {
    this.#store = store ?? new IndexedDbVaultStore(); this.#ownsStore = store === undefined || options.ownsStore === true; this.#provider = provider;
    this.#lifecycle = options.lifecycle !== false && typeof document !== 'undefined' && typeof window !== 'undefined';
    this.#unsubscribe = this.#store.subscribeInvalidation(() => { this.lockAll(); });
    if (this.#lifecycle) {
      window.addEventListener('pagehide', this.#pagehide);
      document.addEventListener('keydown', this.#activity, { capture: true });
      document.addEventListener('pointerdown', this.#activity, { capture: true });
    }
  }
  #pagehide = (): void => { this.lockAll(); };
  #activity = (event: Event): void => { if (event.isTrusted) this.#resetIdle(); };
  #resetIdle(): void {
    if (!this.#lifecycle) return;
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.#idleTimer = this.#sessions.size ? setTimeout(() => { this.lockAll(); }, 5 * 60_000) : undefined;
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.lockAll(); this.#unsubscribe();
    if (this.#ownsStore) this.#store.close?.();
    if (this.#lifecycle) {
      window.removeEventListener('pagehide', this.#pagehide);
      document.removeEventListener('keydown', this.#activity, { capture: true });
      document.removeEventListener('pointerdown', this.#activity, { capture: true });
    }
  }
  #ensureLive(): void { if (this.#disposed) throw new Failure('LOCKED'); }
  async #result<T>(operation: () => Promise<T>): Promise<Result<T>> {
    try { this.#ensureLive(); return { ok: true, value: await operation() }; } catch (error) { return failed(error); }
  }
  #random(length: number): Uint8Array {
    try { return this.#provider.getRandomValues(new Uint8Array(length)); } catch { throw new Failure('UNSUPPORTED_ENVIRONMENT'); }
  }
  #randomId(): string { return Array.from(this.#random(16), byte => byte.toString(16).padStart(2, '0')).join(''); }
  #randomToken(): string {
    const bytes = this.#random(32); try {
      const token = encodeBase64url(bytes); if (this.#sessions.has(token)) throw new Failure('ALREADY_EXISTS'); return token;
    } finally { bytes.fill(0); }
  }
  #session(token: string): SessionState {
    requireToken(token);
    const state = this.#sessions.get(token);
    if (!state || state.revoked || state.snapshot === undefined || state.envelope === undefined) throw new Failure('LOCKED');
    return state;
  }
  #guard(state: SessionState, generation: number, signal?: AbortSignal): void {
    if (state.revoked || state.generation !== generation || this.#sessions.get(state.token) !== state) throw new Failure('LOCKED');
    if (signal?.aborted) throw new Failure('CANCELLED');
  }
  #control(signal?: AbortSignal): { controller: AbortController; remove: () => void } {
    const controller = new AbortController();
    const abort = (): void => { controller.abort(); };
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    return { controller, remove: () => { signal?.removeEventListener('abort', abort); } };
  }
  #register(snapshot: PrivateSnapshotV1, envelope: VaultEnvelopeV1, material: UnlockedMaterial, token: string): VaultSession {
    this.#sessions.set(token, { token, generation: 0, revoked: false, material, snapshot, envelope,
      tail: Promise.resolve(), operations: new Set() });
    this.#resetIdle();
    return { sessionId: token, profileId: snapshot.profileId, revision: snapshot.revision };
  }
  async #openJob<T>(signal: AbortSignal | undefined, operation: (guard: () => void, control: AbortController) => Promise<T>): Promise<T> {
    const epoch = this.#epoch; const control = this.#control(signal); this.#pending.add(control.controller);
    const previous = this.#opening; let release!: () => void; this.#opening = new Promise(resolve => { release = resolve; });
    const guard = (): void => {
      if (this.#disposed || this.#epoch !== epoch) throw new Failure('LOCKED');
      if (control.controller.signal.aborted) throw new Failure('CANCELLED');
    };
    try { await previous; guard(); return await operation(guard, control.controller); }
    catch (error) { if (error instanceof VaultStorageError && error.code === 'CANCELLED') guard(); throw error; }
    finally { release(); this.#pending.delete(control.controller); control.remove(); }
  }
  create(passphrase: string, signal?: AbortSignal): Promise<Result<VaultSession>> {
    return this.#result(async () => {
      const password = encodePassphrase(passphrase); password.fill(0);
      return this.#openJob(signal, async (guard, controller) => {
        guard();
        const snapshot: PrivateSnapshotV1 = { format: 'p2p-offramp-private-records', version: 1,
          profileId: this.#randomId(), keyId: this.#randomId(), revision: 0, records: [] };
        const token = this.#randomToken(); let material: UnlockedMaterial | undefined;
        try {
          const sealed = await createEnvelope(snapshot, passphrase, this.#provider); material = sealed.material; guard();
          await this.#store.add(sealed.envelope, { signal: controller.signal, assertCurrent: guard });
          // A completed write wins a concurrent lock/cancel. Never attach a revoked key handle.
          try { guard(); } catch { return { sessionId: token, profileId: snapshot.profileId, revision: 0 }; }
          const session = this.#register(snapshot, sealed.envelope, material, token); material = undefined; return session;
        } finally { if (material) disposeMaterial(material); }
      });
    });
  }
  unlock(profileId: string, passphrase: string, signal?: AbortSignal): Promise<Result<VaultSession>> {
    return this.#result(async () => {
      requireId(profileId); const password = encodePassphrase(passphrase); password.fill(0);
      return this.#openJob(signal, async guard => {
        const envelope = await this.#store.get(profileId); guard();
        if (!envelope) throw new Failure('NOT_FOUND');
        const opened = await openEnvelope(envelope, passphrase, this.#provider);
        let attached = false;
        try {
          guard(); const token = this.#randomToken(); guard();
          const session = this.#register(opened.snapshot, parseVaultEnvelope(envelope), opened.material, token); attached = true; return session;
        } finally { if (!attached) disposeMaterial(opened.material); }
      });
    });
  }
  async read(sessionId: string, id: string): Promise<Result<PrivateRecordV1 | null>> {
    try {
      this.#ensureLive(); requireId(id); const state = this.#session(sessionId), generation = state.generation;
      await Promise.resolve(); this.#guard(state, generation);
      const record = state.snapshot!.records.find(record => record.id === id);
      return { ok: true, value: record ? { ...record } : null };
    } catch (error) { return failed(error); }
  }
  async list(sessionId: string, filter?: RecordKind): Promise<Result<PrivateRecordV1[]>> {
    try {
      this.#ensureLive(); if (filter !== undefined) kind(filter);
      const state = this.#session(sessionId), generation = state.generation;
      await Promise.resolve(); this.#guard(state, generation);
      return { ok: true, value: state.snapshot!.records.filter(record => filter === undefined || record.kind === filter).map(record => ({ ...record })) };
    } catch (error) { return failed(error); }
  }
  commit(sessionId: string, expectedRevision: number, mutations: readonly Mutation[], signal?: AbortSignal): Promise<Result<number>> {
    return this.#result(async () => {
      const state = this.#session(sessionId), generation = state.generation;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > MAX_REVISION) throw new ValidationError();
      const captured = mutationCopies(mutations, state.snapshot!);
      const previous = state.tail; let release!: () => void; state.tail = new Promise(resolve => { release = resolve; });
      const control = this.#control(signal); state.operations.add(control.controller);
      const guard = (): void => { this.#guard(state, generation, signal); };
      try {
        await previous; guard();
        const snapshot = state.snapshot!, expected = state.envelope!;
        if (snapshot.revision !== expectedRevision) throw new Failure('CONFLICT');
        const latest = await this.#store.get(snapshot.profileId); guard();
        if (!latest || !sameEnvelope(parseVaultEnvelope(latest), expected)) { this.lock(sessionId); throw new Failure('CONFLICT'); }
        if (!captured.length) return expectedRevision;
        if (expectedRevision === MAX_REVISION) throw new Failure('REKEY_REQUIRED');
        const records = new Map(snapshot.records.map(record => [record.id, { ...record }]));
        for (const mutation of captured) {
          if (mutation.op === 'delete') records.delete(mutation.id); else records.set(mutation.record.id, mutation.record);
        }
        const candidate = parsePrivateSnapshot({ ...snapshot, revision: expectedRevision + 1,
          records: [...records.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) });
        const next = await encryptRevision(state.material, candidate, expectedRevision); guard();
        const options: StoreWriteOptions = { signal: control.controller.signal, assertCurrent: guard };
        await this.#store.compareAndSwap(expected, next, options);
        if (!state.revoked && state.generation === generation) { state.snapshot = candidate; state.envelope = next; }
        return next.revision;
      } catch (error) {
        if (error instanceof VaultStorageError && error.code === 'CANCELLED') { guard(); throw new Failure('CANCELLED'); }
        if ((error instanceof VaultStorageError && (error.code === 'CONFLICT' || error.code === 'STORAGE_UNAVAILABLE')) ||
          (error instanceof Failure && error.code === 'CONFLICT') ||
          !(error instanceof Failure || error instanceof VaultStorageError || error instanceof VaultCryptoError || error instanceof ValidationError)) this.lock(sessionId);
        throw error;
      } finally { release(); state.operations.delete(control.controller); control.remove(); }
    });
  }
  lock(sessionId: string): void {
    const state = this.#sessions.get(sessionId); if (!state) return;
    state.revoked = true; state.generation++; this.#sessions.delete(sessionId);
    for (const operation of state.operations) operation.abort();
    disposeMaterial(state.material); state.snapshot = undefined; state.envelope = undefined; this.#resetIdle();
  }
  lockAll(): void {
    this.#epoch++;
    for (const pending of this.#pending) pending.abort();
    for (const token of [...this.#sessions.keys()]) this.lock(token);
    this.#resetIdle();
  }
  exportEncrypted(profileId: string): Promise<Result<VaultEnvelopeV1>> {
    return this.#result(async () => {
      requireId(profileId); const envelope = await this.#store.get(profileId);
      if (!envelope) throw new Failure('NOT_FOUND');
      const copy = parseVaultEnvelope(envelope); Object.freeze(copy.wrappedKey); Object.freeze(copy.snapshot); return Object.freeze(copy);
    });
  }
}
