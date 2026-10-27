import type { PrivateRecordV1, RecordKind, VaultEnvelopeV1 } from './vault.ts';
export type Mutation = { op: 'put'; record: PrivateRecordV1 } | { op: 'delete'; id: string };
export interface VaultSession { sessionId: string; profileId: string; revision: number; }
/** Storage-issued local capability metadata only; it exposes no key or record data. */
export interface VaultSessionLease {
  current(): Readonly<VaultSession> | null;
  dispose(): void;
}
export interface VaultSessionAuthority {
  captureSession(session: VaultSession, onRevoked: () => void): Result<VaultSessionLease>;
}
export type VaultErrorCode = 'UNSUPPORTED_ENVIRONMENT' | 'UNSUPPORTED_VERSION' | 'INVALID_INPUT' | 'NOT_FOUND' |
  'ALREADY_EXISTS' | 'AUTHENTICATION_FAILED' | 'LOCKED' | 'CONFLICT' | 'LIMIT_EXCEEDED' | 'REKEY_REQUIRED' |
  'QUOTA_EXCEEDED' | 'STORAGE_UNAVAILABLE' | 'CANCELLED';
export interface VaultError { code: VaultErrorCode; retryable: boolean; message: string; }
export type Result<T> = { ok: true; value: T } | { ok: false; error: VaultError };
export interface VaultService {
  create(passphrase: string, signal?: AbortSignal): Promise<Result<VaultSession>>;
  unlock(profileId: string, passphrase: string, signal?: AbortSignal): Promise<Result<VaultSession>>;
  read(sessionId: string, id: string): Promise<Result<PrivateRecordV1 | null>>;
  list(sessionId: string, kind?: RecordKind): Promise<Result<PrivateRecordV1[]>>;
  commit(sessionId: string, expectedRevision: number, mutations: readonly Mutation[], signal?: AbortSignal): Promise<Result<number>>;
  lock(sessionId: string): void;
  lockAll(): void;
  exportEncrypted(profileId: string): Promise<Result<VaultEnvelopeV1>>;
}
