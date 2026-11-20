/**
 * Partial G07/MEM01 offline Worker boundary. No network or signer operation exists. The only record operations are the
 * purpose-bound saved terms reviews, their bounded encrypted favorites, reusable templates, scalar offline recovery inspection and retention counts;
 * no generic record read or write exists.
 */
import { decodeBase64url, encodePassphrase, MAX_RECORDS, MAX_VAULT_PROFILES, ValidationError } from './vault.ts';
import { MAX_BACKUP_BYTES, parseBackupBytes } from './backup.ts';
import { parseBackupVerificationReceipt, type BackupVerificationReceipt, type RuntimeBackupVerification } from './backup-verification.ts';
import { isSavedReviewSource, MAX_SAVED_REVIEW_BYTES, MAX_SAVED_REVIEWS, type SavedReviewSource } from './saved-review.ts';
import { parseRecoveryReferences, parseRecoveryOffset, parseRecoveryRevision, type RuntimeRecoveryReferences } from './recovery-reference.ts';
import { parseTradeDraftLibrary, parseTradeDraftChange, type TradeDraftLibraryV1, type TradeDraftChangeV1, MAX_TRADE_TEMPLATES } from './trade-drafts.ts';
export * from './recovery-reference.ts';

export const MAX_RUNTIME_SEQUENCE = Number.MAX_SAFE_INTEGER - 1;
export const RUNTIME_REQUEST_TIMEOUT_MS = 30_000;
export const RUNTIME_DISPOSE_TIMEOUT_MS = 1_000;
export const RUNTIME_IDLE_TIMEOUT_MS = 5 * 60_000;
export type RuntimeErrorCode = 'INVALID_INPUT' | 'UNSUPPORTED_ENVIRONMENT' | 'UNSUPPORTED_VERSION' | 'NOT_FOUND' |
  'AUTHENTICATION_FAILED' | 'LOCKED' | 'CONFLICT' | 'LIMIT_EXCEEDED' | 'QUOTA_EXCEEDED' | 'STORAGE_UNAVAILABLE' | 'CANCELLED' | 'BUSY' | 'PROTOCOL_ERROR' | 'TIMEOUT';
const CODES: readonly RuntimeErrorCode[] = ['INVALID_INPUT', 'UNSUPPORTED_ENVIRONMENT', 'UNSUPPORTED_VERSION', 'NOT_FOUND',
  'AUTHENTICATION_FAILED', 'LOCKED', 'CONFLICT', 'LIMIT_EXCEEDED', 'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'CANCELLED', 'BUSY', 'PROTOCOL_ERROR', 'TIMEOUT'];
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
/** Bounded encrypted preference projection. IDs confer no review or transaction authority. */
export interface RuntimeSavedReviewFavorites { readonly revision: number; readonly recordIds: readonly string[]; }
/** Acknowledged only while the originating profile selection is still current. */
export interface RuntimeSavedReviewFavorite { readonly recordId: string; readonly favorite: boolean; readonly revision: number; }
/** Only the seven reusable primitives cross this purpose-specific boundary. */
export interface RuntimeTradeTemplates { readonly revision: number; readonly library: TradeDraftLibraryV1; }
export interface RuntimeTradeTemplatePreview {
  readonly previewId: string; readonly revision: number; readonly change: TradeDraftChangeV1;
  readonly affectedTemplateCount: number; readonly clearsRepeatDefault: boolean;
  readonly logicalOnly: true; readonly backupAndRemoteCopiesUnaffected: true;
}
export interface RuntimeTradeTemplateConsent { readonly reviewed: true; readonly logicalOnly: true; readonly backupAndRemoteLimitsAcknowledged: true; }
export interface RuntimeTradeTemplateReceipt { readonly revision: number; readonly changed: boolean; readonly persisted: true; readonly sessionCurrent: boolean; }
export interface RuntimeTradeTemplateCancelled { readonly cancelled: true; }
/** DATA01 offline counts only. This projection carries no native review or deletion authority. */
export interface RuntimeRetentionPreview {
  readonly version: 1; readonly revision: number; readonly archiveReviewCount: number;
  readonly reviewedDeleteCount: 0; readonly protectedCount: number;
  readonly logicalOnly: true; readonly backupAndRemoteCopiesUnaffected: true;
}
export type RuntimeValue = RuntimeStatus | RuntimeExport | RuntimeInventory | RuntimeRestore | RuntimeSavedReviewRef | RuntimeSavedReviews | RuntimeRecoveryReferences | RuntimeSavedReviewFavorites | RuntimeSavedReviewFavorite | RuntimeTradeTemplates | RuntimeTradeTemplatePreview | RuntimeTradeTemplateReceipt | RuntimeTradeTemplateCancelled | BackupVerificationReceipt | RuntimeBackupVerification | RuntimeRetentionPreview;
export type RuntimeOperation = 'init' | 'status' | 'unlock' | 'create' | 'restore' | 'listProfiles' | 'lock' | 'exportEncrypted' | 'dispose' | 'activity' |
  'saveTermsReview' | 'listTermsReviews' | 'deleteTermsReview' | 'listRecoveryReferences' | 'listFavoriteReviews' | 'setReviewFavorite' | 'loadTradeTemplates' | 'previewTradeTemplateChange' | 'commitTradeTemplateChange' | 'cancelTradeTemplateChange' | 'verifyBackup' | 'checkBackupVerification' | 'planRetention';
const OPERATIONS: readonly RuntimeOperation[] = ['init', 'status', 'unlock', 'create', 'restore', 'listProfiles', 'lock', 'exportEncrypted', 'dispose', 'activity',
  'saveTermsReview', 'listTermsReviews', 'deleteTermsReview', 'listRecoveryReferences', 'listFavoriteReviews', 'setReviewFavorite', 'loadTradeTemplates', 'previewTradeTemplateChange', 'commitTradeTemplateChange', 'cancelTradeTemplateChange', 'verifyBackup', 'checkBackupVerification', 'planRetention'];
interface Header { readonly version: 1; readonly requestId: number; readonly generation: number; }
export type RuntimeCommand = Header & (
  { readonly operation: 'init'; readonly config: RuntimeConfig } |
  { readonly operation: 'unlock'; readonly profileId: string; readonly passphrase: string } |
  { readonly operation: 'create'; readonly passphrase: string } |
  { readonly operation: 'restore'; readonly bytes: Uint8Array; readonly sourcePassphrase: string; readonly destinationPassphrase: string } |
  { readonly operation: 'verifyBackup'; readonly profileId: string; readonly bytes: Uint8Array; readonly passphrase: string } |
  { readonly operation: 'checkBackupVerification'; readonly profileId: string } |
  { readonly operation: 'planRetention'; readonly profileId: string; readonly nowMs: number } |
  { readonly operation: 'exportEncrypted'; readonly profileId: string } |
  { readonly operation: 'saveTermsReview'; readonly profileId: string; readonly source: SavedReviewSource; readonly bytes: Uint8Array } |
  { readonly operation: 'listTermsReviews'; readonly profileId: string } |
  { readonly operation: 'deleteTermsReview'; readonly profileId: string; readonly recordId: string } |
  { readonly operation: 'listFavoriteReviews'; readonly profileId: string } |
  { readonly operation: 'setReviewFavorite'; readonly profileId: string; readonly recordId: string; readonly favorite: boolean; readonly expectedRevision: number } |
  { readonly operation: 'loadTradeTemplates'; readonly profileId: string } |
  { readonly operation: 'cancelTradeTemplateChange'; readonly profileId: string } |
  { readonly operation: 'previewTradeTemplateChange'; readonly profileId: string; readonly expectedRevision: number; readonly change: TradeDraftChangeV1 } |
  { readonly operation: 'commitTradeTemplateChange'; readonly profileId: string; readonly expectedRevision: number; readonly previewId: string; readonly consent: RuntimeTradeTemplateConsent } |
  { readonly operation: 'listRecoveryReferences'; readonly profileId: string; readonly offset: number; readonly expectedRevision: number | null } |
  { readonly operation: 'status' | 'listProfiles' | 'lock' | 'dispose' | 'activity' });
export type RuntimeResponse = Header & { readonly kind: 'response'; readonly operation: RuntimeOperation } & (
  { readonly result: { readonly ok: false; readonly error: RuntimeError } } |
  { readonly operation: 'exportEncrypted'; readonly result: { readonly ok: true; readonly value: RuntimeExport } } |
  { readonly operation: 'listProfiles'; readonly result: { readonly ok: true; readonly value: RuntimeInventory } } |
  { readonly operation: 'restore'; readonly result: { readonly ok: true; readonly value: RuntimeRestore } } |
  { readonly operation: 'verifyBackup'; readonly result: { readonly ok: true; readonly value: BackupVerificationReceipt } } |
  { readonly operation: 'checkBackupVerification'; readonly result: { readonly ok: true; readonly value: RuntimeBackupVerification } } |
  { readonly operation: 'planRetention'; readonly result: { readonly ok: true; readonly value: RuntimeRetentionPreview } } |
  { readonly operation: 'saveTermsReview'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviewRef } } |
  { readonly operation: 'deleteTermsReview'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviewRef } } |
  { readonly operation: 'listTermsReviews'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviews } } |
  { readonly operation: 'listFavoriteReviews'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviewFavorites } } |
  { readonly operation: 'setReviewFavorite'; readonly result: { readonly ok: true; readonly value: RuntimeSavedReviewFavorite } } |
  { readonly operation: 'listRecoveryReferences'; readonly result: { readonly ok: true; readonly value: RuntimeRecoveryReferences } } |
  { readonly operation: 'loadTradeTemplates'; readonly result: { readonly ok: true; readonly value: RuntimeTradeTemplates } } |
  { readonly operation: 'previewTradeTemplateChange'; readonly result: { readonly ok: true; readonly value: RuntimeTradeTemplatePreview } } |
  { readonly operation: 'commitTradeTemplateChange'; readonly result: { readonly ok: true; readonly value: RuntimeTradeTemplateReceipt } } |
  { readonly operation: 'cancelTradeTemplateChange'; readonly result: { readonly ok: true; readonly value: RuntimeTradeTemplateCancelled } } |
  { readonly operation: Exclude<RuntimeOperation, 'exportEncrypted' | 'listProfiles' | 'restore' | 'saveTermsReview' | 'deleteTermsReview' | 'listTermsReviews' | 'listRecoveryReferences' | 'listFavoriteReviews' | 'setReviewFavorite' | 'loadTradeTemplates' | 'previewTradeTemplateChange' | 'commitTradeTemplateChange' | 'cancelTradeTemplateChange' | 'verifyBackup' | 'checkBackupVerification' | 'planRetention'>; readonly result: { readonly ok: true; readonly value: RuntimeStatus } });
export type RuntimeMessage = RuntimeResponse | { readonly version: 1; readonly kind: 'locked'; readonly generation: number } |
  { readonly version: 1; readonly kind: 'closed'; readonly generation: number; readonly code: RuntimeErrorCode };

function fail(code: RuntimeErrorCode = 'INVALID_INPUT'): never { throw new RuntimeBoundaryError(code); }
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
function favorite(input: unknown): boolean { if (typeof input !== 'boolean') return fail(); return input; }
function revision(input: unknown): number { if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) return fail(); return input; }
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
  } catch (error) { if (error instanceof RuntimeBoundaryError) throw error; return fail(); }
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
    op === 'restore' ? ['bytes', 'sourcePassphrase', 'destinationPassphrase'] : op === 'verifyBackup' ? ['profileId', 'bytes', 'passphrase'] : op === 'exportEncrypted' || op === 'listTermsReviews' || op === 'listFavoriteReviews' || op === 'loadTradeTemplates' || op === 'cancelTradeTemplateChange' || op === 'checkBackupVerification' ? ['profileId'] :
    op === 'saveTermsReview' ? ['profileId', 'source', 'bytes'] : op === 'deleteTermsReview' ? ['profileId', 'recordId'] : op === 'listRecoveryReferences' ? ['profileId', 'offset', 'expectedRevision'] :
    op === 'setReviewFavorite' ? ['profileId', 'recordId', 'favorite', 'expectedRevision'] :
    op === 'planRetention' ? ['profileId', 'nowMs'] :
    op === 'previewTradeTemplateChange' ? ['profileId', 'expectedRevision', 'change'] :
    op === 'commitTradeTemplateChange' ? ['profileId', 'expectedRevision', 'previewId', 'consent'] : [];
  const raw = exact(input, ['version', 'requestId', 'generation', 'operation', ...extra]); const base = header(raw);
  if (raw.operation !== op) return fail();
  if (op === 'init') return Object.freeze({ ...base, operation: op, config: parseRuntimeConfig(raw.config) });
  if (op === 'unlock') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), passphrase: passphrase(raw.passphrase) });
  if (op === 'create') return Object.freeze({ ...base, operation: op, passphrase: passphrase(raw.passphrase) });
  if (op === 'restore') {
    return Object.freeze({ ...base, operation: op, bytes: boundedBytes(raw.bytes, MAX_BACKUP_BYTES),
      sourcePassphrase: passphrase(raw.sourcePassphrase), destinationPassphrase: passphrase(raw.destinationPassphrase) });
  }
  if (op === 'verifyBackup') {
    // Validate scalars before retaining the bounded owned file copy.
    const profileId = profile(raw.profileId), password = passphrase(raw.passphrase);
    return Object.freeze({ ...base, operation: op, profileId, passphrase: password, bytes: boundedBytes(raw.bytes, MAX_BACKUP_BYTES) });
  }
  if (op === 'planRetention') {
    const nowMs = raw.nowMs;
    if (typeof nowMs !== 'number' || !Number.isSafeInteger(nowMs) || nowMs < 0) return fail();
    return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), nowMs });
  }
  if (op === 'exportEncrypted' || op === 'listTermsReviews' || op === 'listFavoriteReviews' || op === 'loadTradeTemplates' || op === 'cancelTradeTemplateChange' || op === 'checkBackupVerification') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId) });
  if (op === 'saveTermsReview') {
    const bytes = boundedBytes(raw.bytes, MAX_SAVED_REVIEW_BYTES); if (bytes.byteLength === 0) return fail();
    return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), source: source(raw.source), bytes });
  }
  if (op === 'deleteTermsReview') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), recordId: recordId(raw.recordId) });
  if (op === 'setReviewFavorite') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), recordId: recordId(raw.recordId), favorite: favorite(raw.favorite), expectedRevision: revision(raw.expectedRevision) });
  if (op === 'previewTradeTemplateChange') {
    try { return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), expectedRevision: revision(raw.expectedRevision), change: parseTradeDraftChange(raw.change) }); } catch { return fail(); }
  }
  if (op === 'commitTradeTemplateChange') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), expectedRevision: revision(raw.expectedRevision), previewId: recordId(raw.previewId), consent: templateConsent(raw.consent) });
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
  } catch (error) { if (error instanceof RuntimeBoundaryError) throw error; return fail(); }
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
  } catch (error) {
    if (error instanceof RuntimeBoundaryError) throw error;
    if (error instanceof ValidationError && error.code === 'LIMIT_EXCEEDED') return fail('LIMIT_EXCEEDED');
    return fail();
  }
  return Object.freeze({ bytes, authentication: 'not-checked' });
}
function savedRef(input: unknown): RuntimeSavedReviewRef { const raw = exact(input, ['recordId']); return Object.freeze({ recordId: recordId(raw.recordId) }); }
function savedFavorites(input: unknown): RuntimeSavedReviewFavorites {
  const raw = exact(input, ['revision', 'recordIds']);
  try {
    const list = raw.recordIds;
    if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) return fail();
    const length = own(list, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > MAX_SAVED_REVIEWS || Reflect.ownKeys(list).length !== length + 1) return fail();
    const recordIds: string[] = [];
    for (let index = 0; index < length; index++) recordIds.push(recordId(own(list, String(index))));
    if (new Set(recordIds).size !== recordIds.length) return fail();
    return Object.freeze({ revision: revision(raw.revision), recordIds: Object.freeze(recordIds) });
  } catch { return fail(); }
}
function savedFavorite(input: unknown): RuntimeSavedReviewFavorite {
  const raw = exact(input, ['recordId', 'favorite', 'revision']);
  const rev = revision(raw.revision); if (rev === 0) return fail();
  return Object.freeze({ recordId: recordId(raw.recordId), favorite: favorite(raw.favorite), revision: rev });
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
  } catch (error) { if (error instanceof RuntimeBoundaryError) throw error; return fail(); }
}
function templateConsent(input: unknown): RuntimeTradeTemplateConsent {
  const raw = exact(input, ['reviewed', 'logicalOnly', 'backupAndRemoteLimitsAcknowledged']);
  if (raw.reviewed !== true || raw.logicalOnly !== true || raw.backupAndRemoteLimitsAcknowledged !== true) return fail();
  return Object.freeze({ reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true });
}
export function parseRuntimeTradeTemplates(input: unknown): RuntimeTradeTemplates {
  const raw = exact(input, ['revision', 'library']);
  try { return Object.freeze({ revision: revision(raw.revision), library: parseTradeDraftLibrary(raw.library) }); } catch { return fail(); }
}
export function parseRuntimeTradeTemplatePreview(input: unknown): RuntimeTradeTemplatePreview {
  const raw = exact(input, ['previewId', 'revision', 'change', 'affectedTemplateCount', 'clearsRepeatDefault', 'logicalOnly', 'backupAndRemoteCopiesUnaffected']);
  if (typeof raw.affectedTemplateCount !== 'number' || !Number.isInteger(raw.affectedTemplateCount) || raw.affectedTemplateCount < 0 || raw.affectedTemplateCount > MAX_TRADE_TEMPLATES ||
      typeof raw.clearsRepeatDefault !== 'boolean' || raw.logicalOnly !== true || raw.backupAndRemoteCopiesUnaffected !== true) return fail();
  try { return Object.freeze({ previewId: recordId(raw.previewId), revision: revision(raw.revision), change: parseTradeDraftChange(raw.change),
    affectedTemplateCount: raw.affectedTemplateCount, clearsRepeatDefault: raw.clearsRepeatDefault, logicalOnly: true, backupAndRemoteCopiesUnaffected: true }); } catch { return fail(); }
}
export function parseRuntimeTradeTemplateReceipt(input: unknown): RuntimeTradeTemplateReceipt {
  const raw = exact(input, ['revision', 'changed', 'persisted', 'sessionCurrent']);
  if (typeof raw.changed !== 'boolean' || raw.persisted !== true || typeof raw.sessionCurrent !== 'boolean') return fail();
  const rev = revision(raw.revision); if (raw.changed && rev === 0) return fail();
  return Object.freeze({ revision: rev, changed: raw.changed, persisted: true, sessionCurrent: raw.sessionCurrent });
}
function templateCancelled(input: unknown): RuntimeTradeTemplateCancelled {
  const raw = exact(input, ['cancelled']); if (raw.cancelled !== true) return fail(); return Object.freeze({ cancelled: true });
}
export function parseRuntimeRetentionPreview(input: unknown): RuntimeRetentionPreview {
  const raw = exact(input, ['version', 'revision', 'archiveReviewCount', 'reviewedDeleteCount', 'protectedCount', 'logicalOnly', 'backupAndRemoteCopiesUnaffected']);
  const archiveReviewCount = revision(raw.archiveReviewCount), protectedCount = revision(raw.protectedCount);
  if (raw.version !== 1 || raw.reviewedDeleteCount !== 0 || raw.logicalOnly !== true || raw.backupAndRemoteCopiesUnaffected !== true ||
      archiveReviewCount > protectedCount || protectedCount > MAX_RECORDS) return fail();
  return Object.freeze({ version: 1, revision: revision(raw.revision), archiveReviewCount, reviewedDeleteCount: 0, protectedCount,
    logicalOnly: true, backupAndRemoteCopiesUnaffected: true });
}
export function parseRuntimeMessage(input: unknown): RuntimeMessage {
  const kind = own(input, 'kind');
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
  if (base.operation === 'verifyBackup') {
    try { return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseBackupVerificationReceipt(result.value) }) }); } catch { return fail(); }
  }
  if (base.operation === 'checkBackupVerification') {
    const value = exact(result.value, ['verification']);
    try { return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: Object.freeze({ verification: value.verification === null ? null : parseBackupVerificationReceipt(value.verification) }) }) }); } catch { return fail(); }
  }
  if (base.operation === 'planRetention') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeRetentionPreview(result.value) }) });
  if (base.operation === 'exportEncrypted') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: encryptedExport(result.value) }) });
  if (base.operation === 'listProfiles') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: inventory(result.value) }) });
  if (base.operation === 'restore') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: restored(result.value) }) });
  if (base.operation === 'saveTermsReview') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedRef(result.value) }) });
  if (base.operation === 'deleteTermsReview') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedRef(result.value) }) });
  if (base.operation === 'listTermsReviews') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedReviews(result.value) }) });
  if (base.operation === 'listFavoriteReviews') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedFavorites(result.value) }) });
  if (base.operation === 'setReviewFavorite') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: savedFavorite(result.value) }) });
  if (base.operation === 'loadTradeTemplates') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeTradeTemplates(result.value) }) });
  if (base.operation === 'previewTradeTemplateChange') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeTradeTemplatePreview(result.value) }) });
  if (base.operation === 'commitTradeTemplateChange') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeTradeTemplateReceipt(result.value) }) });
  if (base.operation === 'cancelTradeTemplateChange') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: templateCancelled(result.value) }) });
  if (base.operation === 'listRecoveryReferences') {
    try { return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRecoveryReferences(result.value) }) }); } catch { return fail(); }
  }
  return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeStatus(result.value, base.generation) }) });
}
