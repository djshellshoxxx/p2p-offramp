/** Offline document composition boundary. UI receives state and commands, never a vault handle or record. */
import { runtimeFailure, type RuntimeErrorCode, type RuntimeResult, type RuntimeExport, type RuntimeInventory, type RuntimeRestore, type RuntimeTransportSelection, type RuntimeSelectTransportMode,
  type BackupVerificationReceipt, type RuntimeBackupVerification, type RuntimeSavedReviewRef, type RuntimeSavedReviews, type RuntimeReviewFavorites, type RuntimeReviewFavoriteReceipt, type SavedReviewSource, type RuntimeRecoveryReferences, type RuntimeRetentionPreview, type RuntimeRetentionConsent, type RuntimeRetentionDelete } from '../../../packages/schemas/index.ts';
import { AppRuntime, type AppRuntimeOptions } from './runtime/app-runtime.ts';
import type { RuntimeTradeDraftLibrary, RuntimeTradeDraftPreview, RuntimeTradeDraftConsent, RuntimeTradeDraftReceipt, TradeDraftChangeV1 } from '../../../packages/schemas/index.ts';

export type AppResult<T> = RuntimeResult<T>;
export interface PublicStatus { readonly state: 'locked' | 'unlocked'; }
/** The new opaque profile ID is public metadata the user needs to unlock later; nothing private is returned. */
export interface CreatedProfile { readonly state: 'unlocked'; readonly profileId: string; }
export interface AppServices {
  readonly current: PublicStatus;
  readonly profileId: string | null;
  getSnapshot(): PublicStatus;
  /**
   * Opaque counter that changes whenever the open-profile selection changes (lock, unlock, switch), including a switch
   * whose intermediate locked state no observer saw. It reveals nothing else; profile-scoped UI state resets on change.
   */
  selectionScope(): number;
  subscribe(listener: () => void): () => void;
  /** Selected policy of the actual Worker-owned broker only; absent composition remains unavailable. */
  getTransportSelection(signal?: AbortSignal): Promise<AppResult<RuntimeTransportSelection>>;
  selectTransportMode(input: RuntimeSelectTransportMode, signal?: AbortSignal): Promise<AppResult<RuntimeTransportSelection>>;
  unlock(profileId: string, passphrase: string, signal?: AbortSignal): Promise<AppResult<PublicStatus>>;
  create(passphrase: string, signal?: AbortSignal): Promise<AppResult<CreatedProfile>>;
  listProfiles(signal?: AbortSignal): Promise<AppResult<RuntimeInventory>>;
  restore(bytes: Uint8Array, sourcePassphrase: string, destinationPassphrase: string, signal?: AbortSignal): Promise<AppResult<RuntimeRestore>>;
  status(): Promise<AppResult<PublicStatus>>;
  lock(): Promise<AppResult<PublicStatus>>;
  exportEncrypted(profileId: string, signal?: AbortSignal): Promise<AppResult<RuntimeExport>>;
  /** Authenticates a supplied backup against the open profile's exact committed revision. */
  verifyBackup(bytes: Uint8Array, passphrase: string, signal?: AbortSignal): Promise<AppResult<BackupVerificationReceipt>>;
  /** Rechecks the Worker-owned receipt and current persisted profile; imported metadata cannot set it. */
  checkBackupVerification(signal?: AbortSignal): Promise<AppResult<RuntimeBackupVerification>>;
  /** Saved terms reviews of the open profile only (raw terms bytes; the caller re-reviews them). */
  saveTermsReview(source: SavedReviewSource, bytes: Uint8Array, signal?: AbortSignal): Promise<AppResult<RuntimeSavedReviewRef>>;
  listTermsReviews(signal?: AbortSignal): Promise<AppResult<RuntimeSavedReviews>>;
  /** Purpose-bound encrypted saved-review IDs; writes require the explicitly observed native revision. */
  listReviewFavorites(signal?: AbortSignal): Promise<AppResult<RuntimeReviewFavorites>>;
  setReviewFavorite(recordId: string, favorite: boolean, expectedRevision: number, signal?: AbortSignal): Promise<AppResult<RuntimeReviewFavoriteReceipt>>;
  loadTradeDraftLibrary(signal?: AbortSignal): Promise<AppResult<RuntimeTradeDraftLibrary>>;
  planTradeDraftChange(expectedRevision: number, change: TradeDraftChangeV1, signal?: AbortSignal): Promise<AppResult<RuntimeTradeDraftPreview>>;
  commitTradeDraftChange(previewId: string, expectedRevision: number, consent: RuntimeTradeDraftConsent, signal?: AbortSignal): Promise<AppResult<RuntimeTradeDraftReceipt>>;
  /** Legacy compatibility: refuses deletion; use the reviewed retention flow in Settings. */
  deleteTermsReview(recordId: string, signal?: AbortSignal): Promise<AppResult<RuntimeSavedReviewRef>>;
  /** Read-only unverified scalar journal references; no calldata, native truth or resend capability. */
  listRecoveryReferences(offset?: number, expectedRevision?: number | null, signal?: AbortSignal): Promise<AppResult<RuntimeRecoveryReferences>>;
  /** Offline counts only; never constructs or invokes a native provider. */
  planRetention(signal?: AbortSignal): Promise<AppResult<RuntimeRetentionPreview>>;
  /** Explicit native eligibility check; absent native composition protects all records. */
  reviewRetention(signal?: AbortSignal): Promise<AppResult<RuntimeRetentionPreview>>;
  deleteReviewedRecords(consent: RuntimeRetentionConsent, signal?: AbortSignal): Promise<AppResult<RuntimeRetentionDelete>>;
  dispose(): Promise<void>;
}
export type { RuntimeErrorCode, RuntimeInventory, RuntimeRestore, RuntimeSavedReviewRef, RuntimeSavedReviews, SavedReviewSource };
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
  let scopeHandle: object | null = null, scope = 0;
  const selectionScope = (): number => {
    const current = runtime.current;
    const handle = current.state === 'unlocked' ? current.handle : null;
    if (handle !== scopeHandle) { scopeHandle = handle; scope++; }
    return scope;
  };
  const stateCommand = async (run: () => Promise<RuntimeResult<unknown>>): Promise<AppResult<PublicStatus>> => {
    try { const result = await run(); return result.ok ? Object.freeze({ ok: true, value: snapshot() }) : result; }
    catch { return runtimeFailure('PROTOCOL_ERROR'); }
  };
  const services: AppServices = Object.freeze({
    get profileId() { const status = runtime.current; return status.state === 'unlocked' ? status.handle.profileId : null; },
    get current() { return snapshot(); }, getSnapshot: snapshot, selectionScope,
    subscribe: (listener: () => void) => runtime.subscribe(listener),
    getTransportSelection: async (signal?: AbortSignal): Promise<AppResult<RuntimeTransportSelection>> => {
      try { return await runtime.getTransportSelection(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    selectTransportMode: async (input: RuntimeSelectTransportMode, signal?: AbortSignal): Promise<AppResult<RuntimeTransportSelection>> => {
      try { return await runtime.selectTransportMode(input, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    unlock: (profileId: string, passphrase: string, signal?: AbortSignal) => stateCommand(() => runtime.unlock(profileId, passphrase, signal)),
    create: async (passphrase: string, signal?: AbortSignal): Promise<AppResult<CreatedProfile>> => {
      try {
        const result = await runtime.create(passphrase, signal);
        return result.ok ? Object.freeze({ ok: true, value: Object.freeze({ state: 'unlocked' as const, profileId: result.value.profileId }) }) : result;
      } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    listProfiles: async (signal?: AbortSignal): Promise<AppResult<RuntimeInventory>> => {
      try { return await runtime.listProfiles(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    restore: async (bytes: Uint8Array, sourcePassphrase: string, destinationPassphrase: string, signal?: AbortSignal): Promise<AppResult<RuntimeRestore>> => {
      try { return await runtime.restore(bytes, sourcePassphrase, destinationPassphrase, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    planRetention: async (signal?: AbortSignal): Promise<AppResult<RuntimeRetentionPreview>> => {
      try { return await runtime.planRetention(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    reviewRetention: async (signal?: AbortSignal): Promise<AppResult<RuntimeRetentionPreview>> => {
      try { return await runtime.reviewRetention(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    deleteReviewedRecords: async (consent: RuntimeRetentionConsent,signal?: AbortSignal): Promise<AppResult<RuntimeRetentionDelete>> => {
      try { return await runtime.deleteReviewedRecords(consent,signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    status: () => stateCommand(() => runtime.status()), lock: () => stateCommand(() => runtime.lock()),
    exportEncrypted: async (profileId: string, signal?: AbortSignal): Promise<AppResult<RuntimeExport>> => {
      try { return await runtime.exportEncrypted(profileId, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    verifyBackup: async (bytes: Uint8Array, passphrase: string, signal?: AbortSignal): Promise<AppResult<BackupVerificationReceipt>> => {
      try { return await runtime.verifyBackup(bytes,passphrase,signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    checkBackupVerification: async (signal?: AbortSignal): Promise<AppResult<RuntimeBackupVerification>> => {
      try { return await runtime.checkBackupVerification(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    saveTermsReview: async (source: SavedReviewSource, bytes: Uint8Array, signal?: AbortSignal): Promise<AppResult<RuntimeSavedReviewRef>> => {
      try { return await runtime.saveTermsReview(source, bytes, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    listTermsReviews: async (signal?: AbortSignal): Promise<AppResult<RuntimeSavedReviews>> => {
      try { return await runtime.listTermsReviews(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    listReviewFavorites: async (signal?: AbortSignal): Promise<AppResult<RuntimeReviewFavorites>> => {
      try { return await runtime.listReviewFavorites(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    loadTradeDraftLibrary: async (signal?: AbortSignal): Promise<AppResult<RuntimeTradeDraftLibrary>> => {
      try { return await runtime.loadTradeDraftLibrary(signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    planTradeDraftChange: async (expectedRevision: number, change: TradeDraftChangeV1, signal?: AbortSignal): Promise<AppResult<RuntimeTradeDraftPreview>> => {
      try { return await runtime.planTradeDraftChange(expectedRevision, change, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    commitTradeDraftChange: async (previewId: string, expectedRevision: number, consent: RuntimeTradeDraftConsent, signal?: AbortSignal): Promise<AppResult<RuntimeTradeDraftReceipt>> => {
      try { return await runtime.commitTradeDraftChange(previewId, expectedRevision, consent); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    setReviewFavorite: async (recordId: string, favorite: boolean, expectedRevision: number, signal?: AbortSignal): Promise<AppResult<RuntimeReviewFavoriteReceipt>> => {
      try { return await runtime.setReviewFavorite(recordId, favorite, expectedRevision, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    deleteTermsReview: async (recordId: string, signal?: AbortSignal): Promise<AppResult<RuntimeSavedReviewRef>> => {
      try { return await runtime.deleteTermsReview(recordId, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    listRecoveryReferences: async (offset = 0, expectedRevision: number | null = null, signal?: AbortSignal): Promise<AppResult<RuntimeRecoveryReferences>> => {
      try { return await runtime.listRecoveryReferences(offset, expectedRevision, signal); } catch { return runtimeFailure('PROTOCOL_ERROR'); }
    },
    dispose: () => runtime.dispose(),
  });
  return Object.freeze({ ok: true, value: services });
}
