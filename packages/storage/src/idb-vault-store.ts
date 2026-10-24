import { parseVaultEnvelope, ValidationError, type VaultEnvelopeV1 } from '../../schemas/src/vault.ts';
import type { VaultErrorCode } from '../../schemas/src/vault-service.ts';

export class VaultStorageError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode) { super('Vault storage operation failed.'); this.name = 'VaultStorageError'; this.code = code; }
}
export interface StoreWriteOptions { signal?: AbortSignal; assertCurrent?: () => void; }
export interface VaultStore {
  get(profileId: string): Promise<VaultEnvelopeV1 | undefined>;
  add(envelope: VaultEnvelopeV1, options?: StoreWriteOptions): Promise<void>;
  compareAndSwap(expected: VaultEnvelopeV1, next: VaultEnvelopeV1, options?: StoreWriteOptions): Promise<void>;
  subscribeInvalidation(listener: () => void): () => void;
  /** Terminal connection teardown. Shared injected stores remain caller-owned. */
  close?(): void;
}
export function sameEnvelope(a: VaultEnvelopeV1, b: VaultEnvelopeV1): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function storageError(error: unknown): VaultStorageError {
  let name: unknown;
  try { name = error instanceof DOMException ? error.name : undefined; } catch { /* fixed fallback */ }
  return new VaultStorageError(name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : name === 'ConstraintError' ? 'ALREADY_EXISTS' :
    name === 'VersionError' ? 'UNSUPPORTED_VERSION' : 'STORAGE_UNAVAILABLE');
}
function current(options?: StoreWriteOptions): void {
  if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
  try { options?.assertCurrent?.(); } catch { throw new VaultStorageError('CANCELLED'); }
}

/** One encrypted row per opaque profile ID; no plaintext indexes or destructive reset path. */
export class IndexedDbVaultStore implements VaultStore {
  private connection: Promise<IDBDatabase> | undefined;
  private database: IDBDatabase | undefined;
  private closed = false;
  private cancelOpen: (() => void) | undefined;
  private transactions = new Set<IDBTransaction>();
  private listeners = new Set<() => void>();
  private readonly factory: IDBFactory | undefined;
  constructor(factory: IDBFactory | undefined = globalThis.indexedDB) { this.factory = factory; }
  subscribeInvalidation(listener: () => void): () => void {
    if (this.closed) { listener(); return () => undefined; }
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private notifyInvalidated(): void { for (const listener of this.listeners) listener(); }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const db = this.database; this.database = undefined; this.connection = undefined;
    this.cancelOpen?.(); this.cancelOpen = undefined;
    for (const tx of this.transactions) { try { tx.abort(); } catch { /* committed transactions stay committed */ } }
    db?.close(); this.notifyInvalidated(); this.listeners.clear();
  }
  private ensureOpen(): void { if (this.closed) throw new VaultStorageError('STORAGE_UNAVAILABLE'); }
  private db(): Promise<IDBDatabase> {
    if (this.closed) return Promise.reject(new VaultStorageError('STORAGE_UNAVAILABLE'));
    if (globalThis.isSecureContext !== true || !this.factory) return Promise.reject(new VaultStorageError('UNSUPPORTED_ENVIRONMENT'));
    if (this.connection) return this.connection;
    let cancel: () => void = () => undefined;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let rejected = false;
      const fail = (error: VaultStorageError): void => { rejected = true; reject(error); };
      cancel = () => { fail(new VaultStorageError('STORAGE_UNAVAILABLE')); };
      const request = this.factory!.open('p2p-offramp-vault', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('vaults')) request.result.createObjectStore('vaults', { keyPath: 'profileId' });
      };
      request.onerror = () => { fail(storageError(request.error)); };
      request.onblocked = () => { fail(new VaultStorageError('STORAGE_UNAVAILABLE')); };
      request.onsuccess = () => {
        const db = request.result;
        if (rejected || this.closed || this.connection !== opening) { db.close(); fail(new VaultStorageError('STORAGE_UNAVAILABLE')); return; }
        const invalidate = (): void => {
          if (this.database !== db) return;
          this.database = undefined;
          if (this.connection === opening) this.connection = undefined;
          this.notifyInvalidated();
        };
        db.onversionchange = () => { db.close(); invalidate(); };
        db.onclose = invalidate;
        try {
          const tx = db.transaction('vaults', 'readonly');
          if (tx.objectStore('vaults').keyPath !== 'profileId') throw new Error();
          this.database = db; resolve(db);
        } catch (error) { db.close(); fail(storageError(error)); }
      };
    });
    this.connection = opening; this.cancelOpen = cancel;
    // Clear only this failed attempt. A late blocked request must not detach a newer connection.
    void opening.then(() => { if (this.connection === opening) this.cancelOpen = undefined; }, () => {
      if (this.connection === opening) { this.connection = undefined; this.cancelOpen = undefined; }
    });
    return opening;
  }
  async get(profileId: string): Promise<VaultEnvelopeV1 | undefined> {
    if (!/^[0-9a-f]{32}$/.test(profileId)) throw new ValidationError();
    let db: IDBDatabase;
    try { db = await this.db(); } catch (error) { if (error instanceof VaultStorageError) throw error; throw storageError(error); }
    this.ensureOpen();
    const raw = await new Promise<unknown>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction('vaults', 'readonly'); this.transactions.add(tx); }
      catch (error) { reject(storageError(error)); return; }
      let value: unknown; let failure: VaultStorageError | undefined;
      tx.onerror = () => { failure ??= storageError(tx.error); };
      tx.onabort = () => { this.transactions.delete(tx); reject(failure ?? storageError(tx.error)); };
      tx.oncomplete = () => { this.transactions.delete(tx); resolve(value); };
      try {
        const request = tx.objectStore('vaults').get(profileId);
        request.onsuccess = () => { value = request.result; };
        request.onerror = () => { failure = storageError(request.error); };
      } catch (error) {
        failure = storageError(error);
        try { tx.abort(); } catch { this.transactions.delete(tx); reject(failure); }
      }
    });
    return raw === undefined ? undefined : parseVaultEnvelope(raw);
  }
  async add(input: VaultEnvelopeV1, options?: StoreWriteOptions): Promise<void> {
    const envelope = parseVaultEnvelope(input);
    await this.write(undefined, envelope, options);
  }
  async compareAndSwap(input: VaultEnvelopeV1, replacement: VaultEnvelopeV1, options?: StoreWriteOptions): Promise<void> {
    const expected = parseVaultEnvelope(input), next = parseVaultEnvelope(replacement);
    if (next.profileId !== expected.profileId || next.keyId !== expected.keyId || next.revision !== expected.revision + 1 ||
      JSON.stringify(next.wrappedKey) !== JSON.stringify(expected.wrappedKey)) throw new ValidationError();
    await this.write(expected, next, options);
  }
  private async write(expected: VaultEnvelopeV1 | undefined, next: VaultEnvelopeV1, options?: StoreWriteOptions): Promise<void> {
    current(options);
    let db: IDBDatabase;
    try { db = await this.db(); } catch (error) { if (error instanceof VaultStorageError) throw error; throw storageError(error); }
    current(options); this.ensureOpen();
    await new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction('vaults', 'readwrite'); this.transactions.add(tx); } catch (error) { reject(storageError(error)); return; }
      let failure: VaultStorageError | undefined;
      const abort = (): void => { failure ??= new VaultStorageError('CANCELLED'); try { tx.abort(); } catch { /* terminal completion decides */ } };
      const cleanup = (): void => { this.transactions.delete(tx); options?.signal?.removeEventListener('abort', abort); };
      options?.signal?.addEventListener('abort', abort, { once: true });
      tx.onerror = () => { failure ??= storageError(tx.error); };
      tx.onabort = () => { cleanup(); reject(failure ?? storageError(tx.error)); };
      tx.oncomplete = () => { cleanup(); resolve(); };
      const put = (): void => {
        try { current(options); } catch { abort(); return; }
        try {
          const request = expected === undefined ? tx.objectStore('vaults').add(next) : tx.objectStore('vaults').put(next);
          request.onerror = () => { failure = storageError(request.error); };
        } catch (error) { failure = storageError(error); abort(); }
      };
      if (expected === undefined) { put(); return; }
      let request: IDBRequest;
      try { request = tx.objectStore('vaults').get(expected.profileId); }
      catch (error) { failure = storageError(error); abort(); return; }
      request.onerror = () => { failure = storageError(request.error); };
      request.onsuccess = () => {
        try {
          const actual = request.result === undefined ? undefined : parseVaultEnvelope(request.result);
          if (actual === undefined || !sameEnvelope(actual, expected)) {
            failure = new VaultStorageError('CONFLICT'); tx.abort(); return;
          }
          put();
        } catch { failure = new VaultStorageError('CONFLICT'); try { tx.abort(); } catch { /* terminal event decides */ } }
      };
      if (options?.signal?.aborted) abort();
    });
  }
}
