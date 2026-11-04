/**
 * G07/MEM01 Worker boundary. Default construction is offline. Explicit native retention review uses only a
 * trusted private constructor provider; no IPC provider, signer or generic record read/write operation exists.
 */
import { decodeBase64url, encodePassphrase, MAX_RECORDS, MAX_VAULT_PROFILES, MAX_REVISION, ValidationError } from './vault.ts';
import { parseBackupVerificationReceipt, type BackupVerificationReceipt, type RuntimeBackupVerification } from './backup-verification.ts';
import { MAX_BACKUP_BYTES, parseBackupBytes } from './backup.ts';
import { isSavedReviewSource, MAX_SAVED_REVIEW_BYTES, MAX_SAVED_REVIEWS, type SavedReviewSource } from './saved-review.ts';
import { parseRecoveryReferences, parseRecoveryOffset, parseRecoveryRevision, type RuntimeRecoveryReferences } from './recovery-reference.ts';
import { parseRuntimeTransportSelection, parseRuntimeSelectTransportMode, type RuntimeTransportSelection, type RuntimeSelectTransportMode } from './transport-selection.ts';
import { parseTradeDraftLibrary, parseTradeDraftChange, type TradeDraftLibraryV1, type TradeDraftChangeV1 } from './trade-drafts.ts';
export * from './recovery-reference.ts';

export const MAX_RUNTIME_SEQUENCE = Number.MAX_SAFE_INTEGER - 1;
export const RUNTIME_REQUEST_TIMEOUT_MS = 30_000;
export const RUNTIME_DISPOSE_TIMEOUT_MS = 1_000;
export const RUNTIME_IDLE_TIMEOUT_MS = 5 * 60_000;
export type RuntimeErrorCode = 'INVALID_INPUT' | 'UNSUPPORTED_ENVIRONMENT' | 'UNSUPPORTED_VERSION' | 'NOT_FOUND' |
  'AUTHENTICATION_FAILED' | 'LOCKED' | 'CONFLICT' | 'LIMIT_EXCEEDED' | 'QUOTA_EXCEEDED' | 'STORAGE_UNAVAILABLE' | 'CANCELLED' | 'BUSY' | 'PROTOCOL_ERROR' | 'TIMEOUT' | 'NATIVE_PROOF_REQUIRED';
const CODES: readonly RuntimeErrorCode[] = ['INVALID_INPUT', 'UNSUPPORTED_ENVIRONMENT', 'UNSUPPORTED_VERSION', 'NOT_FOUND',
  'AUTHENTICATION_FAILED', 'LOCKED', 'CONFLICT', 'LIMIT_EXCEEDED', 'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'CANCELLED', 'BUSY', 'PROTOCOL_ERROR', 'TIMEOUT', 'NATIVE_PROOF_REQUIRED'];
export class RuntimeBoundaryError extends Error {
  readonly code: RuntimeErrorCode;
  constructor(code: RuntimeErrorCode = 'INVALID_INPUT') { super('Local runtime operation unavailable.'); this.name = 'RuntimeBoundaryError'; this.code = code; }
}
export interface RuntimeError { readonly code: RuntimeErrorCode; readonly messageKey: string; }
export type RuntimeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RuntimeError };
export function runtimeFailure(code: RuntimeErrorCode): { readonly ok: false; readonly error: RuntimeError } {
  return Object.freeze({ ok: false, error: Object.freeze({ code, messageKey: `runtime.error.${code.toLowerCase()}` }) });
}
export interface RuntimeConfig { readonly version: 1; readonly ReleaseEnabled: 0; readonly connectOrigins: readonly []; }
export interface RuntimeHandle { readonly id: string; readonly generation: number; readonly purpose: 'vault'; readonly profileId: string; }
export type RuntimeStatus = { readonly state: 'locked'; readonly handle: null } | { readonly state: 'unlocked'; readonly handle: RuntimeHandle };
export interface RuntimeExport { readonly bytes: Uint8Array; readonly authentication: 'not-checked'; }
/** Opaque public IDs only; the Worker never reads envelopes to build it. */
export interface RuntimeInventory { readonly profileIds: readonly string[]; readonly truncated: boolean; }
/** Restore creates a fresh-key locked profile; it never unlocks or returns record content. */
export interface RuntimeRestore { readonly newProfileId: string; readonly records: number; }
/** Opaque 32-hex record id of a saved terms review in the selected profile. */
export interface RuntimeSavedReviewRef { readonly recordId: string; }
export interface RuntimeSavedReview { readonly recordId: string; readonly source: SavedReviewSource; readonly bytes: Uint8Array; }
/** `skipped` counts `trade` records that are not readable saved reviews; they are never returned or changed. */
export interface RuntimeSavedReviews { readonly items: readonly RuntimeSavedReview[]; readonly skipped: number; }
/** Only bounded saved-review IDs leave the encrypted favorite preference. */
export interface RuntimeReviewFavorites { readonly revision: number; readonly recordIds: readonly string[]; }
/** Actual native CAS receipt; sessionCurrent may be false after cancellation or locking. */
export interface RuntimeReviewFavoriteReceipt { readonly recordId: string; readonly favorite: boolean; readonly revision: number; readonly persisted: true; readonly sessionCurrent: boolean; }
export interface RuntimeTradeDraftLibrary { readonly revision: number; readonly library: TradeDraftLibraryV1; }
export interface RuntimeTradeDraftPreview {
  readonly previewId: string; readonly revision: number; readonly change: TradeDraftChangeV1; readonly affectedTemplateCount: number;
  readonly clearsRepeatDefault: boolean; readonly logicalOnly: true; readonly backupAndRemoteCopiesUnaffected: true;
}
export interface RuntimeTradeDraftConsent { readonly reviewed: true; readonly logicalOnly: true; readonly backupAndRemoteLimitsAcknowledged: true; }
export interface RuntimeTradeDraftReceipt { readonly revision: number; readonly changed: boolean; readonly persisted: true; readonly sessionCurrent: boolean; }
/** Worker-owned preview capability. Counts contain no records, parties, payloads or native proof. */
export interface RuntimeRetentionPreview {
  readonly version: 1; readonly profileId: string; readonly previewId: string; readonly revision: number;
  readonly archiveReviewCount: number; readonly reviewedDeleteCount: number; readonly protectedCount: number;
  readonly nativeReviewAvailable: boolean; readonly logicalOnly: true; readonly backupAndRemoteCopiesUnaffected: true;
}
export interface RuntimeRetentionConsent {
  readonly previewId: string; readonly expectedRevision: number; readonly consentRevision: number;
  readonly reviewed: true; readonly logicalOnly: true; readonly backupAndRemoteLimitsAcknowledged: true;
}
export interface RuntimeRetentionDelete {
  readonly profileId: string; readonly revision: number; readonly deletedCount: number;
  readonly logicalOnly: true; readonly backupAndRemoteCopiesUnaffected: true;
}
export type RuntimeValue = RuntimeStatus | RuntimeExport | RuntimeInventory | RuntimeRestore | RuntimeSavedReviewRef | RuntimeSavedReviews | RuntimeReviewFavorites | RuntimeReviewFavoriteReceipt | RuntimeTradeDraftLibrary | RuntimeTradeDraftPreview | RuntimeTradeDraftReceipt | RuntimeRecoveryReferences | BackupVerificationReceipt | RuntimeBackupVerification | RuntimeRetentionPreview | RuntimeRetentionDelete | RuntimeTransportSelection;
export type RuntimeOperation = 'init' | 'status' | 'unlock' | 'create' | 'restore' | 'listProfiles' | 'lock' | 'exportEncrypted' | 'dispose' | 'activity' |
  'saveTermsReview' | 'listTermsReviews' | 'deleteTermsReview' | 'listReviewFavorites' | 'setReviewFavorite' | 'listRecoveryReferences' | 'verifyBackup' | 'checkBackupVerification' | 'planRetention' | 'reviewRetention' | 'deleteReviewedRecords' | 'getTransportSelection' | 'selectTransportMode' | 'loadTradeDraftLibrary' | 'planTradeDraftChange' | 'commitTradeDraftChange';
const OPERATIONS: readonly RuntimeOperation[] = ['init', 'status', 'unlock', 'create', 'restore', 'listProfiles', 'lock', 'exportEncrypted', 'dispose', 'activity',
  'saveTermsReview', 'listTermsReviews', 'deleteTermsReview', 'listReviewFavorites', 'setReviewFavorite', 'listRecoveryReferences', 'verifyBackup', 'checkBackupVerification', 'planRetention', 'reviewRetention', 'deleteReviewedRecords', 'getTransportSelection', 'selectTransportMode', 'loadTradeDraftLibrary', 'planTradeDraftChange', 'commitTradeDraftChange'];
interface Header { readonly version: 1; readonly requestId: number; readonly generation: number; }
export type RuntimeCommand = Header & (
  { readonly operation: 'init'; readonly config: RuntimeConfig } |
  { readonly operation: 'unlock'; readonly profileId: string; readonly passphrase: string } |
  { readonly operation: 'create'; readonly passphrase: string } |
  { readonly operation: 'restore'; readonly bytes: Uint8Array; readonly sourcePassphrase: string; readonly destinationPassphrase: string } |
  { readonly operation: 'verifyBackup'; readonly profileId: string; readonly bytes: Uint8Array; readonly passphrase: string } |
  { readonly operation: 'checkBackupVerification' | 'planRetention' | 'reviewRetention'; readonly profileId: string } |
  ({ readonly operation: 'deleteReviewedRecords'; readonly profileId: string } & RuntimeRetentionConsent) |
  { readonly operation: 'exportEncrypted'; readonly profileId: string } |
  { readonly operation: 'saveTermsReview'; readonly profileId: string; readonly source: SavedReviewSource; readonly bytes: Uint8Array } |
  { readonly operation: 'listTermsReviews'; readonly profileId: string } |
  { readonly operation: 'deleteTermsReview'; readonly profileId: string; readonly recordId: string } |
  { readonly operation: 'listReviewFavorites'; readonly profileId: string } |
  { readonly operation: 'setReviewFavorite'; readonly profileId: string; readonly recordId: string; readonly favorite: boolean; readonly expectedRevision: number } |
  { readonly operation: 'loadTradeDraftLibrary'; readonly profileId: string } |
  { readonly operation: 'planTradeDraftChange'; readonly profileId: string; readonly expectedRevision: number; readonly change: TradeDraftChangeV1 } |
  ({ readonly operation: 'commitTradeDraftChange'; readonly profileId: string; readonly previewId: string; readonly expectedRevision: number } & RuntimeTradeDraftConsent) |
  { readonly operation: 'listRecoveryReferences'; readonly profileId: string; readonly offset: number; readonly expectedRevision: number | null } |
  ({ readonly operation: 'selectTransportMode' } & RuntimeSelectTransportMode) |
  { readonly operation: 'getTransportSelection' } |
  { readonly operation: 'status' | 'listProfiles' | 'lock' | 'dispose' | 'activity' });
export type RuntimeResponse = Header & { readonly kind: 'response'; readonly operation: RuntimeOperation } & (
  { readonly result: { readonly ok: false; readonly error: RuntimeError } } |
  { readonly operation: 'planRetention'; readonly result: { readonly ok: true; readonly value: RuntimeRetentionPreview } } |
  { readonly operation: 'reviewRetention'; readonly result: { readonly ok: true; readonly value: RuntimeRetentionPreview } } |
  { readonly operation: 'deleteReviewedRecords'; readonly result: { readonly ok: true; readonly value: RuntimeRetentionDelete } } |
  { readonly operation: 'verifyBackup'; readonly result: { readonly ok: true; readonly value: BackupVerificationReceipt } } |
  { readonly operation: 'checkBackupVerification'; readonly result: { readonly ok: true; readonly value: RuntimeBackupVerification } } |
  { readonly operation: 'exportEncrypted'; readonly result: { readonly ok: true; readonly value: RuntimeExport } } |
  { readonly operation: 'listProfiles'; readonly result: { readonly ok: true; readonly value: RuntimeInventory } } |
  { readonly operation: 'restore'; readonly result: { readonly ok: true; readonly value: RuntimeRestore } } |
  { readonly operation: 'saveTermsReview'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviewRef } } |
  { readonly operation: 'deleteTermsReview'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviewRef } } |
  { readonly operation: 'listTermsReviews'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviews } } |
  { readonly operation: 'listReviewFavorites'; readonly result: { readonly ok: true; readonly value: RuntimeReviewFavorites } } |
  { readonly operation: 'setReviewFavorite'; readonly result: { readonly ok: true; readonly value: RuntimeReviewFavoriteReceipt } } |
  { readonly operation: 'loadTradeDraftLibrary'; readonly result: { readonly ok: true; readonly value: RuntimeTradeDraftLibrary } } |
  { readonly operation: 'planTradeDraftChange'; readonly result: { readonly ok: true; readonly value: RuntimeTradeDraftPreview } } |
  { readonly operation: 'commitTradeDraftChange'; readonly result: { readonly ok: true; readonly value: RuntimeTradeDraftReceipt } } |
  { readonly operation: 'listRecoveryReferences'; readonly result: { readonly ok: true; readonly value: RuntimeRecoveryReferences } } |
  { readonly operation: 'getTransportSelection' | 'selectTransportMode'; readonly result: { readonly ok: true; readonly value: RuntimeTransportSelection } } |
  { readonly operation: Exclude<RuntimeOperation, 'exportEncrypted' | 'listProfiles' | 'restore' | 'saveTermsReview' | 'deleteTermsReview' | 'listTermsReviews' | 'listReviewFavorites' | 'setReviewFavorite' | 'listRecoveryReferences' | 'verifyBackup' | 'checkBackupVerification' | 'planRetention' | 'reviewRetention' | 'deleteReviewedRecords' | 'getTransportSelection' | 'selectTransportMode' | 'loadTradeDraftLibrary' | 'planTradeDraftChange' | 'commitTradeDraftChange'>; readonly result: { readonly ok: true; readonly value: RuntimeStatus } });
export type RuntimeMessage = RuntimeResponse | { readonly version: 1; readonly kind: 'locked'; readonly generation: number } |
  { readonly version: 1; readonly kind: 'transport-selection-invalidated'; readonly generation: number; readonly brokerGeneration: number } |
  { readonly version: 1; readonly kind: 'closed'; readonly generation: number; readonly code: RuntimeErrorCode };

function fail(code: RuntimeErrorCode = 'INVALID_INPUT'): never { throw new RuntimeBoundaryError(code); }
/** Retain only a recognized own data code; never return or read diagnostics from a foreign exception. */
function refuseCaught(error: unknown, allowVaultLimit = false): never {
  let value: RuntimeErrorCode = 'INVALID_INPUT';
  try {
    const runtimeError = error instanceof RuntimeBoundaryError;
    if (runtimeError || allowVaultLimit && error instanceof ValidationError) {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
      if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') {
        if (runtimeError && CODES.includes(descriptor.value as RuntimeErrorCode)) value = descriptor.value as RuntimeErrorCode;
        else if (allowVaultLimit && descriptor.value === 'LIMIT_EXCEEDED') value = 'LIMIT_EXCEEDED';
      }
    }
  } catch { /* Hostile exception reflection is discarded without property getters. */ }
  return fail(value);
}
function own(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null) return fail();
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) return fail();
    return descriptor.value;
  } catch { return fail(); }
}
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail();
    const actual = Reflect.ownKeys(input);
    if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) return fail();
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) out[key] = own(input, key);
    return out;
  } catch { return fail(); }
}
function sequence(input: unknown, minimum = 0): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < minimum || input > MAX_RUNTIME_SEQUENCE) return fail();
  return input;
}
function profile(input: unknown): string { if (typeof input !== 'string' || !/^[0-9a-f]{32}$/.test(input)) return fail(); return input; }
function recordId(input: unknown): string { if (typeof input !== 'string' || !/^[0-9a-f]{32}$/.test(input)) return fail(); return input; }
function source(input: unknown): SavedReviewSource { if (!isSavedReviewSource(input)) return fail(); return input; }
function operation(input: unknown): RuntimeOperation {
  if (typeof input !== 'string' || !OPERATIONS.includes(input as RuntimeOperation)) return fail();
  return input as RuntimeOperation;
}
function passphrase(input: unknown): string {
  try { const bytes = encodePassphrase(input); bytes.fill(0); } catch { return fail(); }
  return input as string;
}
/** Exact own-copy of a genuine Uint8Array via intrinsic getters; hostile subclasses/proxies cannot alter length. */
function boundedBytes(input: unknown, maximum: number): Uint8Array {
  try {
    const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype) as object, 'byteLength')!.get!;
    const length: unknown = getter.call(input);
    if (!(input instanceof Uint8Array) || typeof length !== 'number') return fail();
    if (length > maximum) return fail('LIMIT_EXCEEDED');
    const bytes = new Uint8Array(length); Uint8Array.prototype.set.call(bytes, input as Uint8Array); return bytes;
  } catch (error) { return refuseCaught(error); }
}
function code(input: unknown): RuntimeErrorCode { if (typeof input !== 'string' || !CODES.includes(input as RuntimeErrorCode)) return fail(); return input as RuntimeErrorCode; }
function header(raw: Record<string, unknown>): Header {
  if (raw.version !== 1) return fail();
  return { version: 1, requestId: sequence(raw.requestId, 1), generation: sequence(raw.generation) };
}
export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  const raw = exact(input, ['version', 'ReleaseEnabled', 'connectOrigins']);
  if (raw.version !== 1 || raw.ReleaseEnabled !== 0) return fail();
  try {
    if (!Array.isArray(raw.connectOrigins) || Object.getPrototypeOf(raw.connectOrigins) !== Array.prototype ||
        own(raw.connectOrigins, 'length') !== 0 || Reflect.ownKeys(raw.connectOrigins).length !== 1) return fail();
  } catch { return fail(); }
  return Object.freeze({ version: 1, ReleaseEnabled: 0, connectOrigins: Object.freeze([]) as readonly [] });
}
export function parseRuntimeCommand(input: unknown): RuntimeCommand {
  const op = operation(own(input, 'operation'));
  const extra = op === 'init' ? ['config'] : op === 'unlock' ? ['profileId', 'passphrase'] : op === 'create' ? ['passphrase'] :
    op === 'loadTradeDraftLibrary' ? ['profileId'] : op === 'planTradeDraftChange' ? ['profileId', 'expectedRevision', 'change'] :
    op === 'commitTradeDraftChange' ? ['profileId', 'previewId', 'expectedRevision', 'reviewed', 'logicalOnly', 'backupAndRemoteLimitsAcknowledged'] :
    op === 'restore' ? ['bytes', 'sourcePassphrase', 'destinationPassphrase'] : op === 'verifyBackup' ? ['profileId', 'bytes', 'passphrase'] : op === 'exportEncrypted' || op === 'listTermsReviews' || op === 'listReviewFavorites' || op === 'checkBackupVerification' || op === 'planRetention' || op === 'reviewRetention' ? ['profileId'] :
    op === 'selectTransportMode' ? ['mode', 'expectedBrokerGeneration', 'ordinaryConsent'] : op === 'setReviewFavorite' ? ['profileId', 'recordId', 'favorite', 'expectedRevision'] : op === 'saveTermsReview' ? ['profileId', 'source', 'bytes'] : op === 'deleteTermsReview' ? ['profileId', 'recordId'] : op === 'listRecoveryReferences' ? ['profileId', 'offset', 'expectedRevision'] : op === 'deleteReviewedRecords' ? ['profileId', 'previewId', 'expectedRevision', 'consentRevision', 'reviewed', 'logicalOnly', 'backupAndRemoteLimitsAcknowledged'] : [];
  const raw = exact(input, ['version', 'requestId', 'generation', 'operation', ...extra]); const base = header(raw);
  if (raw.operation !== op) return fail();
  if (op === 'loadTradeDraftLibrary') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId) });
  if (op === 'planTradeDraftChange') {
    try { return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), expectedRevision: favoriteRevision(raw.expectedRevision), change: parseTradeDraftChange(raw.change) }); } catch { return fail(); }
  }
  if (op === 'commitTradeDraftChange') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), previewId: recordId(raw.previewId),
    expectedRevision: favoriteRevision(raw.expectedRevision), ...parseRuntimeTradeDraftConsent({ reviewed: raw.reviewed, logicalOnly: raw.logicalOnly, backupAndRemoteLimitsAcknowledged: raw.backupAndRemoteLimitsAcknowledged }) });
  if (op === 'selectTransportMode') {
    try { return Object.freeze({ ...base, operation: op, ...parseRuntimeSelectTransportMode({mode:raw.mode,expectedBrokerGeneration:raw.expectedBrokerGeneration,ordinaryConsent:raw.ordinaryConsent}) }); } catch { return fail(); }
  }
  if (op === 'init') return Object.freeze({ ...base, operation: op, config: parseRuntimeConfig(raw.config) });
  if (op === 'unlock') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), passphrase: passphrase(raw.passphrase) });
  if (op === 'create') return Object.freeze({ ...base, operation: op, passphrase: passphrase(raw.passphrase) });
  if (op === 'restore') {
    return Object.freeze({ ...base, operation: op, bytes: boundedBytes(raw.bytes, MAX_BACKUP_BYTES),
      sourcePassphrase: passphrase(raw.sourcePassphrase), destinationPassphrase: passphrase(raw.destinationPassphrase) });
  }
  if (op === 'verifyBackup') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), bytes: boundedBytes(raw.bytes, MAX_BACKUP_BYTES), passphrase: passphrase(raw.passphrase) });
  if (op === 'exportEncrypted' || op === 'listTermsReviews' || op === 'listReviewFavorites' || op === 'checkBackupVerification' || op === 'planRetention' || op === 'reviewRetention') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId) });
  if (op === 'setReviewFavorite') {
    if (typeof raw.favorite !== 'boolean') return fail();
    return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), recordId: recordId(raw.recordId), favorite: raw.favorite, expectedRevision: favoriteRevision(raw.expectedRevision) });
  }
  if (op === 'deleteReviewedRecords') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), ...retentionConsent(raw) });
  if (op === 'saveTermsReview') {
    const bytes = boundedBytes(raw.bytes, MAX_SAVED_REVIEW_BYTES); if (bytes.byteLength === 0) return fail();
    return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), source: source(raw.source), bytes });
  }
  if (op === 'deleteTermsReview') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), recordId: recordId(raw.recordId) });
  if (op === 'listRecoveryReferences') {
    try {
      const offset = parseRecoveryOffset(raw.offset), expectedRevision = raw.expectedRevision === null ? null : parseRecoveryRevision(raw.expectedRevision);
      if (offset > 0 && expectedRevision === null) return fail();
      return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), offset, expectedRevision });
    } catch { return fail(); }
  }
  return Object.freeze({ ...base, operation: op });
}
export function parseRuntimeStatus(input: unknown, generation: number): RuntimeStatus {
  const raw = exact(input, ['state', 'handle']);
  if (raw.state === 'locked' && raw.handle === null) return Object.freeze({ state: 'locked', handle: null });
  if (raw.state !== 'unlocked') return fail();
  const handle = exact(raw.handle, ['id', 'generation', 'purpose', 'profileId']);
  try { const bytes = decodeBase64url(handle.id, 32, 32); bytes.fill(0); } catch { return fail(); }
  if (handle.purpose !== 'vault' || sequence(handle.generation) !== generation) return fail();
  return Object.freeze({ state: 'unlocked', handle: Object.freeze({ id: handle.id as string, generation, purpose: 'vault', profileId: profile(handle.profileId) }) });
}
function inventory(input: unknown): RuntimeInventory {
  const raw = exact(input, ['profileIds', 'truncated']);
  if (typeof raw.truncated !== 'boolean') return fail();
  try {
    const list = raw.profileIds;
    if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) return fail();
    const length = own(list, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > MAX_VAULT_PROFILES || Reflect.ownKeys(list).length !== length + 1) return fail();
    const ids: string[] = [];
    for (let index = 0; index < length; index++) ids.push(profile(own(list, String(index))));
    if (new Set(ids).size !== ids.length) return fail();
    return Object.freeze({ profileIds: Object.freeze(ids), truncated: raw.truncated });
  } catch (error) { return refuseCaught(error); }
}
function restored(input: unknown): RuntimeRestore {
  const raw = exact(input, ['newProfileId', 'records']);
  const records = raw.records;
  if (typeof records !== 'number' || !Number.isSafeInteger(records) || records < 0 || records > MAX_RECORDS) return fail();
  return Object.freeze({ newProfileId: profile(raw.newProfileId), records });
}
function encryptedExport(input: unknown): RuntimeExport {
  const raw = exact(input, ['bytes', 'authentication']);
  if (raw.authentication !== 'not-checked') return fail();
  let bytes: Uint8Array;
  try {
    bytes = boundedBytes(raw.bytes, MAX_BACKUP_BYTES);
    parseBackupBytes(bytes);
  } catch (error) { return refuseCaught(error, true); }
  return Object.freeze({ bytes, authentication: 'not-checked' });
}
function savedRef(input: unknown): RuntimeSavedReviewRef { const raw = exact(input, ['recordId']); return Object.freeze({ recordId: recordId(raw.recordId) }); }
function favoriteRevision(input: unknown): number { const n = sequence(input); if (n > MAX_REVISION) return fail(); return n; }
export function parseRuntimeTradeDraftConsent(input: unknown): RuntimeTradeDraftConsent {
  const raw = exact(input, ['reviewed', 'logicalOnly', 'backupAndRemoteLimitsAcknowledged']);
  if (raw.reviewed !== true || raw.logicalOnly !== true || raw.backupAndRemoteLimitsAcknowledged !== true) return fail();
  return Object.freeze({ reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true });
}
function draftLibrary(input: unknown): RuntimeTradeDraftLibrary {
  const raw = exact(input, ['revision', 'library']);
  try { return Object.freeze({ revision: favoriteRevision(raw.revision), library: parseTradeDraftLibrary(raw.library) }); } catch { return fail(); }
}
function draftPreview(input: unknown): RuntimeTradeDraftPreview {
  const raw = exact(input, ['previewId', 'revision', 'change', 'affectedTemplateCount', 'clearsRepeatDefault', 'logicalOnly', 'backupAndRemoteCopiesUnaffected']);
  if (raw.logicalOnly !== true || raw.backupAndRemoteCopiesUnaffected !== true || typeof raw.clearsRepeatDefault !== 'boolean' ||
      typeof raw.affectedTemplateCount !== 'number' || !Number.isInteger(raw.affectedTemplateCount) || raw.affectedTemplateCount < 0 || raw.affectedTemplateCount > 1) return fail();
  try { return Object.freeze({ previewId: recordId(raw.previewId), revision: favoriteRevision(raw.revision), change: parseTradeDraftChange(raw.change),
    affectedTemplateCount: raw.affectedTemplateCount, clearsRepeatDefault: raw.clearsRepeatDefault, logicalOnly: true, backupAndRemoteCopiesUnaffected: true }); } catch { return fail(); }
}
function draftReceipt(input: unknown): RuntimeTradeDraftReceipt {
  const raw = exact(input, ['revision', 'changed', 'persisted', 'sessionCurrent']);
  if (typeof raw.changed !== 'boolean' || raw.persisted !== true || typeof raw.sessionCurrent !== 'boolean') return fail();
  return Object.freeze({ revision: favoriteRevision(raw.revision), changed: raw.changed, persisted: true, sessionCurrent: raw.sessionCurrent });
}
function reviewFavorites(input: unknown): RuntimeReviewFavorites {
  const raw = exact(input, ['revision', 'recordIds']), list = raw.recordIds;
  try {
    if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) return fail();
    const length = own(list, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > MAX_SAVED_REVIEWS || Reflect.ownKeys(list).length !== length + 1) return fail();
    const ids: string[] = []; for (let n = 0; n < length; n++) ids.push(recordId(own(list, String(n))));
    if (new Set(ids).size !== ids.length) return fail();
    return Object.freeze({ revision: favoriteRevision(raw.revision), recordIds: Object.freeze(ids) });
  } catch (error) { return refuseCaught(error); }
}
function reviewFavoriteReceipt(input: unknown): RuntimeReviewFavoriteReceipt {
  const raw = exact(input, ['recordId', 'favorite', 'revision', 'persisted', 'sessionCurrent']);
  if (typeof raw.favorite !== 'boolean' || raw.persisted !== true || typeof raw.sessionCurrent !== 'boolean') return fail();
  const revision = favoriteRevision(raw.revision); if (revision < 1) return fail();
  return Object.freeze({ recordId: recordId(raw.recordId), favorite: raw.favorite, revision, persisted: true, sessionCurrent: raw.sessionCurrent });
}
function savedReviews(input: unknown): RuntimeSavedReviews {
  const raw = exact(input, ['items', 'skipped']);
  const skipped = raw.skipped;
  if (typeof skipped !== 'number' || !Number.isSafeInteger(skipped) || skipped < 0 || skipped > MAX_RECORDS) return fail();
  try {
    const list = raw.items;
    if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) return fail();
    const length = own(list, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > MAX_SAVED_REVIEWS || Reflect.ownKeys(list).length !== length + 1) return fail();
    const items: RuntimeSavedReview[] = [];
    for (let index = 0; index < length; index++) {
      const item = exact(own(list, String(index)), ['recordId', 'source', 'bytes']);
      const bytes = boundedBytes(item.bytes, MAX_SAVED_REVIEW_BYTES); if (bytes.byteLength === 0) return fail();
      items.push(Object.freeze({ recordId: recordId(item.recordId), source: source(item.source), bytes }));
    }
    if (new Set(items.map(item => item.recordId)).size !== items.length) return fail();
    return Object.freeze({ items: Object.freeze(items), skipped });
  } catch (error) { return refuseCaught(error); }
}
function retentionRevision(value: unknown): number {
  const result = sequence(value); if (result > MAX_REVISION) return fail(); return result;
}
function previewId(value: unknown): string {
  try { const bytes = decodeBase64url(value, 32, 32); bytes.fill(0); return value as string; } catch { return fail(); }
}
function retentionConsent(raw: Record<string, unknown>): RuntimeRetentionConsent {
  if (raw.reviewed !== true || raw.logicalOnly !== true || raw.backupAndRemoteLimitsAcknowledged !== true) return fail();
  const expectedRevision = retentionRevision(raw.expectedRevision), consentRevision = retentionRevision(raw.consentRevision);
  if (expectedRevision !== consentRevision) return fail();
  return Object.freeze({ previewId: previewId(raw.previewId), expectedRevision, consentRevision, reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true });
}
export function parseRuntimeRetentionConsent(input: unknown): RuntimeRetentionConsent {
  return retentionConsent(exact(input, ['previewId','expectedRevision','consentRevision','reviewed','logicalOnly','backupAndRemoteLimitsAcknowledged']));
}
function retentionPreview(input: unknown): RuntimeRetentionPreview {
  const raw = exact(input, ['version','profileId','previewId','revision','archiveReviewCount','reviewedDeleteCount','protectedCount','nativeReviewAvailable','logicalOnly','backupAndRemoteCopiesUnaffected']);
  if (raw.version !== 1 || raw.logicalOnly !== true || raw.backupAndRemoteCopiesUnaffected !== true || typeof raw.nativeReviewAvailable !== 'boolean') return fail();
  const archiveReviewCount = sequence(raw.archiveReviewCount), reviewedDeleteCount = sequence(raw.reviewedDeleteCount), protectedCount = sequence(raw.protectedCount);
  if (archiveReviewCount > reviewedDeleteCount + protectedCount || reviewedDeleteCount + protectedCount > MAX_RECORDS || !raw.nativeReviewAvailable && reviewedDeleteCount !== 0) return fail();
  return Object.freeze({version:1,profileId:profile(raw.profileId),previewId:previewId(raw.previewId),revision:retentionRevision(raw.revision),archiveReviewCount,reviewedDeleteCount,protectedCount,nativeReviewAvailable:raw.nativeReviewAvailable,logicalOnly:true,backupAndRemoteCopiesUnaffected:true});
}
function retentionDeleted(input: unknown): RuntimeRetentionDelete {
  const raw = exact(input, ['profileId','revision','deletedCount','logicalOnly','backupAndRemoteCopiesUnaffected']);
  const deletedCount = sequence(raw.deletedCount,1);
  if (deletedCount > 256 || raw.logicalOnly !== true || raw.backupAndRemoteCopiesUnaffected !== true) return fail();
  return Object.freeze({profileId:profile(raw.profileId),revision:retentionRevision(raw.revision),deletedCount,logicalOnly:true,backupAndRemoteCopiesUnaffected:true});
}
export function parseRuntimeMessage(input: unknown): RuntimeMessage {
  const kind = own(input, 'kind');
  if (kind === 'transport-selection-invalidated') {
    const raw = exact(input, ['version','kind','generation','brokerGeneration']);
    if (raw.version !== 1 || raw.kind !== kind || Object.is(raw.brokerGeneration, -0)) return fail();
    return Object.freeze({version:1,kind,generation:sequence(raw.generation),brokerGeneration:sequence(raw.brokerGeneration)});
  }
  if (kind === 'locked' || kind === 'closed') {
    const raw = exact(input, kind === 'locked' ? ['version', 'kind', 'generation'] : ['version', 'kind', 'generation', 'code']);
    if (raw.version !== 1 || raw.kind !== kind) return fail();
    const generation = sequence(raw.generation);
    return kind === 'locked' ? Object.freeze({ version: 1, kind, generation }) : Object.freeze({ version: 1, kind, generation, code: code(raw.code) });
  }
  const raw = exact(input, ['version', 'requestId', 'generation', 'operation', 'kind', 'result']);
  if (kind !== 'response' || raw.kind !== kind) return fail();
  const base = { ...header(raw), kind: 'response' as const, operation: operation(raw.operation) };
  const ok = own(raw.result, 'ok');
  if (ok === false) {
    const result = exact(raw.result, ['ok', 'error']); if (result.ok !== false) return fail();
    const error = exact(result.error, ['code', 'messageKey']);
    const value = code(error.code); if (error.messageKey !== `runtime.error.${value.toLowerCase()}`) return fail();
    return Object.freeze({ ...base, result: runtimeFailure(value) });
  }
  const result = exact(raw.result, ['ok', 'value']); if (ok !== true || result.ok !== true) return fail();
  if (base.operation === 'loadTradeDraftLibrary') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: draftLibrary(result.value) }) });
  if (base.operation === 'planTradeDraftChange') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: draftPreview(result.value) }) });
  if (base.operation === 'commitTradeDraftChange') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: draftReceipt(result.value) }) });
  if (base.operation === 'getTransportSelection' || base.operation === 'selectTransportMode') {
    try { return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeTransportSelection(result.value) }) }); } catch { return fail(); }
  }
  if (base.operation === 'planRetention') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: retentionPreview(result.value) }) });
  if (base.operation === 'reviewRetention') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: retentionPreview(result.value) }) });
  if (base.operation === 'deleteReviewedRecords') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: retentionDeleted(result.value) }) });
  if (base.operation === 'verifyBackup') {
    try { return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseBackupVerificationReceipt(result.value) }) }); } catch { return fail(); }
  }
  if (base.operation === 'checkBackupVerification') {
    const value = exact(result.value, ['verification']);
    try { return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: Object.freeze({ verification: value.verification === null ? null : parseBackupVerificationReceipt(value.verification) }) }) }); } catch { return fail(); }
  }
  if (base.operation === 'exportEncrypted') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: encryptedExport(result.value) }) });
  if (base.operation === 'listProfiles') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: inventory(result.value) }) });
  if (base.operation === 'restore') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: restored(result.value) }) });
  if (base.operation === 'saveTermsReview') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedRef(result.value) }) });
  if (base.operation === 'deleteTermsReview') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedRef(result.value) }) });
  if (base.operation === 'listTermsReviews') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedReviews(result.value) }) });
  if (base.operation === 'listReviewFavorites') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: reviewFavorites(result.value) }) });
  if (base.operation === 'setReviewFavorite') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: reviewFavoriteReceipt(result.value) }) });
  if (base.operation === 'listRecoveryReferences') {
    try { return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRecoveryReferences(result.value) }) }); } catch { return fail(); }
  }
  return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeStatus(result.value, base.generation) }) });
}
