/** G03 fresh-key recovery. No wallet material, transform hook, writable imported session, or authority promotion. */
import { canonicalEnvelopeBytes, encodeBackup, parseBackupBytes, type RestoreReceipt } from '../../schemas/src/backup.ts';
import { encodePassphrase, parsePrivateSnapshot, parseVaultEnvelope, ValidationError, type PrivateSnapshotV1 } from '../../schemas/src/vault.ts';
import type { VaultErrorCode } from '../../schemas/src/vault-service.ts';
import { createEnvelope, openEnvelope, disposeMaterial, VaultCryptoError, type CryptoProvider } from './vault-crypto.ts';
import { IndexedDbVaultStore, VaultStorageError, type VaultStore } from './idb-vault-store.ts';

export type BackupErrorCode = VaultErrorCode | 'CHECKSUM_MISMATCH' | 'BUSY';
const MESSAGES: Readonly<Record<BackupErrorCode, string>> = Object.freeze({
  UNSUPPORTED_ENVIRONMENT: 'Encrypted recovery is unavailable in this environment.', UNSUPPORTED_VERSION: 'This backup version is unsupported.',
  INVALID_INPUT: 'Invalid encrypted backup input.', NOT_FOUND: 'The requested vault was not found.', ALREADY_EXISTS: 'The destination profile already exists.',
  AUTHENTICATION_FAILED: 'Vault authentication failed.', LOCKED: 'The backup service is locked.', CONFLICT: 'The source vault changed.',
  LIMIT_EXCEEDED: 'The encrypted backup safety limit was reached.', REKEY_REQUIRED: 'Fresh-key recovery is required.',
  QUOTA_EXCEEDED: 'Encrypted storage quota was exceeded.', STORAGE_UNAVAILABLE: 'Encrypted storage is unavailable. Reconcile profiles before retrying.',
  CANCELLED: 'The backup operation was cancelled.', CHECKSUM_MISMATCH: 'The backup checksum does not match.', BUSY: 'Another backup or recovery operation is still running.',
});
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly retryable: boolean;
  constructor(code: BackupErrorCode) {
    const known: BackupErrorCode = Object.hasOwn(MESSAGES, code) ? code : 'STORAGE_UNAVAILABLE';
    super(MESSAGES[known]); this.name = 'BackupError'; this.code = known;
    this.retryable = known === 'STORAGE_UNAVAILABLE' || known === 'QUOTA_EXCEEDED';
  }
}
function normalized(error: unknown): BackupError {
  if (error instanceof BackupError) return error;
  if (error instanceof ValidationError || error instanceof VaultCryptoError || error instanceof VaultStorageError) return new BackupError(error.code);
  return new BackupError('STORAGE_UNAVAILABLE');
}
export interface BackupExport {
  readonly bytes: Uint8Array;
  /** Ciphertext export does not prove that its passphrase works or its contents were authenticated. */
  readonly authentication: 'not-checked';
}
export interface BackupServiceOptions {
  /** Injected stores are caller-owned/shared unless ownership is explicitly transferred. */
  readonly ownsStore?: boolean;
}
// One job per loaded document module, including across independently constructed service instances.
// A cancelled Web Crypto job keeps this slot until its actual work settles; cancellation cannot stop the native primitive.
let documentJob: object | undefined;

export class EncryptedBackupService {
  readonly #store: VaultStore;
  readonly #provider: CryptoProvider;
  readonly #ownsStore: boolean;
  readonly #unsubscribe: () => void;
  #closed = false;
  #generation = 0;
  #active: AbortController | undefined;
  constructor(store: VaultStore | undefined = undefined, provider: CryptoProvider = globalThis.crypto, options: BackupServiceOptions = {}) {
    this.#store = store ?? new IndexedDbVaultStore(); this.#provider = provider;
    this.#ownsStore = store === undefined || options.ownsStore === true;
    this.#unsubscribe = this.#store.subscribeInvalidation(() => { this.#generation++; this.#active?.abort(); });
  }
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true; this.#generation++; this.#active?.abort(); this.#unsubscribe();
    if (this.#ownsStore) this.#store.close?.();
  }
  async #job<T>(signal: AbortSignal | undefined, operation: (guard: () => void, controller: AbortController) => Promise<T>): Promise<T> {
    if (this.#closed) throw new BackupError('LOCKED');
    if (signal?.aborted) throw new BackupError('CANCELLED');
    if (documentJob !== undefined) throw new BackupError('BUSY');
    const token = {}; documentJob = token;
    const generation = this.#generation; const controller = new AbortController(); this.#active = controller;
    const onAbort = (): void => { controller.abort(); };
    signal?.addEventListener('abort', onAbort, { once: true }); if (signal?.aborted) onAbort();
    const guard = (): void => {
      if (this.#closed || this.#generation !== generation) throw new BackupError('LOCKED');
      if (controller.signal.aborted) throw new BackupError('CANCELLED');
    };
    try { guard(); return await operation(guard, controller); }
    catch (error) {
      if (error instanceof VaultStorageError && error.code === 'CANCELLED') guard();
      throw normalized(error);
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (this.#active === controller) this.#active = undefined;
      if (documentJob === token) documentJob = undefined;
    }
  }
  async #checksum(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    let digest: ArrayBuffer;
    try { digest = await this.#provider.subtle.digest('SHA-256', bytes); }
    catch { throw new BackupError('UNSUPPORTED_ENVIRONMENT'); }
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  #randomId(): string {
    try { return Array.from(this.#provider.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); }
    catch { throw new BackupError('UNSUPPORTED_ENVIRONMENT'); }
  }
  /** Exact G03 byte API. This is always an unchecked ciphertext export; use exportWithStatus for presentation. */
  async export(profileId: string, signal?: AbortSignal): Promise<Uint8Array> {
    return (await this.exportWithStatus(profileId, signal)).bytes;
  }
  exportWithStatus(profileId: string, signal?: AbortSignal): Promise<BackupExport> {
    return this.#job(signal, async guard => {
      if (typeof profileId !== 'string' || !/^[0-9a-f]{32}$/.test(profileId)) throw new BackupError('INVALID_INPUT');
      const stored = await this.#store.get(profileId); guard();
      if (stored === undefined) throw new BackupError('NOT_FOUND');
      const envelope = parseVaultEnvelope(stored);
      if (envelope.profileId !== profileId) throw new BackupError('INVALID_INPUT');
      const checksum = await this.#checksum(canonicalEnvelopeBytes(envelope)); guard();
      const bytes = encodeBackup({ format: 'p2p-offramp-backup', version: 1, envelope, checksum }); guard();
      return Object.freeze({ bytes, authentication: 'not-checked' as const });
    });
  }
  restore(bytes: Uint8Array, sourcePassphrase: string, destinationPassphrase: string, signal?: AbortSignal): Promise<RestoreReceipt> {
    return this.#job(signal, async (guard, controller) => {
      const backup = parseBackupBytes(bytes);
      for (const passphrase of [sourcePassphrase, destinationPassphrase]) { const encoded = encodePassphrase(passphrase); encoded.fill(0); }
      const checksum = await this.#checksum(canonicalEnvelopeBytes(backup.envelope)); guard();
      if (checksum !== backup.checksum) throw new BackupError('CHECKSUM_MISMATCH');
      let source: PrivateSnapshotV1 | undefined;
      let candidate: PrivateSnapshotV1 | undefined;
      try {
        const opened = await openEnvelope(backup.envelope, sourcePassphrase, this.#provider);
        try { guard(); source = opened.snapshot; } finally { disposeMaterial(opened.material); }
        const profileId = this.#randomId(), keyId = this.#randomId();
        if (profileId === backup.envelope.profileId || keyId === backup.envelope.keyId) throw new BackupError('ALREADY_EXISTS');
        candidate = parsePrivateSnapshot({ ...source, profileId, keyId, revision: 0 });
        const receipt: RestoreReceipt = Object.freeze({ sourceProfileId: backup.envelope.profileId, newProfileId: profileId,
          newKeyId: keyId, revision: 0, records: candidate.records.length });
        const sealed = await createEnvelope(candidate, destinationPassphrase, this.#provider);
        try {
          guard();
          // The complete destination is authenticated before the one add transaction; crypto is never awaited inside it.
          const verified = await openEnvelope(sealed.envelope, destinationPassphrase, this.#provider);
          try {
            guard();
            if (JSON.stringify(verified.snapshot) !== JSON.stringify(candidate)) throw new BackupError('AUTHENTICATION_FAILED');
          } finally { disposeMaterial(verified.material); }
        } finally { disposeMaterial(sealed.material); }
        guard(); source = undefined; candidate = undefined;
        await this.#store.add(sealed.envelope, { signal: controller.signal, assertCurrent: guard });
        // Once add completed, concurrent cancellation/disposal cannot undo the encrypted profile or falsify its receipt.
        return receipt;
      } finally { source = undefined; candidate = undefined; }
    });
  }
}
