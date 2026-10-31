/** Offline composition boundary. UI receives bounded review bytes, never vault capabilities. */
import { runtimeFailure, type RuntimeErrorCode, type RuntimeResult, type RuntimeExport, type RuntimeInventory, type RuntimeRestore, type RuntimeReviewSaved, type RuntimeReviews } from '../../../packages/schemas/index.ts';
import { AppRuntime, type AppRuntimeOptions } from './runtime/app-runtime.ts';

export type AppResult<T> = RuntimeResult<T>;
export interface PublicStatus { readonly state: 'locked' | 'unlocked'; }
/** The new opaque profile ID is public metadata the user needs to unlock later; nothing private is returned. */
export interface CreatedProfile { readonly state: 'unlocked'; readonly profileId: string; }
export interface AppServices {
  readonly current: PublicStatus;
  readonly profileId: string | null;
  getSnapshot(): PublicStatus;
  subscribe(listener: () => void): () => void;
  unlock(profileId: string, passphrase: string, signal?: AbortSignal): Promise<AppResult<PublicStatus>>;
  create(passphrase: string, signal?: AbortSignal): Promise<AppResult<CreatedProfile>>;
  saveTermsReview(id: string, bytes: Uint8Array, signal?: AbortSignal): Promise<AppResult<RuntimeReviewSaved>>;
  listTermsReviews(signal?: AbortSignal): Promise<AppResult<RuntimeReviews>>;
  listProfiles(signal?: AbortSignal): Promise<AppResult<RuntimeInventory>>;
  restore(bytes: Uint8Array, sourcePassphrase: string, destinationPassphrase: string, signal?: AbortSignal): Promise<AppResult<RuntimeRestore>>;
  status(): Promise<AppResult<PublicStatus>>;
  lock(): Promise<AppResult<PublicStatus>>;
  exportEncrypted(profileId: string, signal?: AbortSignal): Promise<AppResult<RuntimeExport>>;
  dispose(): Promise<void>;
}
export type { RuntimeErrorCode, RuntimeInventory, RuntimeRestore };
export { MAX_BACKUP_BYTES, MAX_VAULT_PROFILES } from '../../../packages/schemas/index.ts';
const LOCKED: PublicStatus = Object.freeze({ state: 'locked' });
const UNLOCKED: PublicStatus = Object.freeze({ state: 'unlocked' });

/** Options are trusted composition/test dependencies; no imported configuration can enable a wallet or network. */
export async function startAppServices(options: AppRuntimeOptions = {}): Promise<AppResult<AppServices>> {
  const opened = await AppRuntime.start({ version: 1, ReleaseEnabled: 0, connectOrigins: [] }, {
    ...options,
    createWorker: options.createWorker ?? (() => new Worker(new URL('./workers/vault.worker.ts', import.meta.url), { type: 'module' })),
  });
  if (!opened.ok) return opened;
  const runtime = opened.value;
  const snapshot = (): PublicStatus => runtime.current.state === 'unlocked' ? UNLOCKED : LOCKED;
  const stateCommand = async (run: () => Promise<RuntimeResult<unknown>>): Promise<AppResult<PublicStatus>> => {
    try { const result = await run(); return result.ok ? Object.freeze({ ok: true, value: snapshot() }) : result; }
    catch { return runtimeFailure('PROTOCOL_ERROR'); }
  };
  const services: AppServices = Object.freeze({
    get profileId() { const status = runtime.current; return status.state === 'unlocked' ? status.handle.profileId : null; },
    get current() { return snapshot(); }, getSnapshot: snapshot,
    subscribe: (listener: () => void) => runtime.subscribe(listener),
    unlock: (profileId: string, passphrase: string, signal?: AbortSignal) => stateCommand(() => runtime.unlock(profileId, passphrase, signal)),
    create: async (passphrase: string, signal?: AbortSignal): Promise<AppResult<CreatedProfile>> => {
      try {
        const result = await runtime.create(passphrase, signal);
        return result.ok ? Object.freeze({ ok: true, value: Object.freeze({ state: 'unlocked' as const, profileId: result.value.profileId }) }) : result;
      } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    saveTermsReview: (id: string, bytes: Uint8Array, signal?: AbortSignal) => runtime.saveTermsReview(id, bytes, signal),
    listTermsReviews: (signal?: AbortSignal) => runtime.listTermsReviews(signal),
    listProfiles: async (signal?: AbortSignal): Promise<AppResult<RuntimeInventory>> => {
      try { return await runtime.listProfiles(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    restore: async (bytes: Uint8Array, sourcePassphrase: string, destinationPassphrase: string, signal?: AbortSignal): Promise<AppResult<RuntimeRestore>> => {
      try { return await runtime.restore(bytes, sourcePassphrase, destinationPassphrase, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    status: () => stateCommand(() => runtime.status()), lock: () => stateCommand(() => runtime.lock()),
    exportEncrypted: async (profileId: string, signal?: AbortSignal): Promise<AppResult<RuntimeExport>> => {
      try { return await runtime.exportEncrypted(profileId, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    dispose: () => runtime.dispose(),
  });
  return Object.freeze({ ok: true, value: services });
}
