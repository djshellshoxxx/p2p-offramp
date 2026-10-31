/** Offline Worker boundary with bounded local saved-review storage; no network or signer operation exists. */
import { decodeBase64url, encodePassphrase, MAX_RECORDS, MAX_VAULT_PROFILES, ValidationError } from './vault.ts';
import { MAX_BACKUP_BYTES, parseBackupBytes } from './backup.ts';

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
export const MAX_SAVED_REVIEWS = 8;
export const MAX_SAVED_REVIEW_BYTES = 65536;
export interface RuntimeReviewEntry { readonly id: string; readonly bytes: Uint8Array; }
export interface RuntimeReviews { readonly entries: readonly RuntimeReviewEntry[]; }
export interface RuntimeReviewSaved { readonly id: string; }
export type RuntimeValue = RuntimeReviews | RuntimeReviewSaved | RuntimeStatus | RuntimeExport | RuntimeInventory | RuntimeRestore;
export type RuntimeOperation = 'init' | 'status' | 'unlock' | 'create' | 'restore' | 'listProfiles' | 'saveTermsReview' | 'listTermsReviews' | 'lock' | 'exportEncrypted' | 'dispose' | 'activity';
const OPERATIONS: readonly RuntimeOperation[] = ['init', 'status', 'unlock', 'create', 'restore', 'listProfiles', 'saveTermsReview', 'listTermsReviews', 'lock', 'exportEncrypted', 'dispose', 'activity'];
interface Header { readonly version: 1; readonly requestId: number; readonly generation: number; }
export type RuntimeCommand = Header & (
  { readonly operation: 'init'; readonly config: RuntimeConfig } |
  { readonly operation: 'unlock'; readonly profileId: string; readonly passphrase: string } |
  { readonly operation: 'create'; readonly passphrase: string } |
  { readonly operation: 'restore'; readonly bytes: Uint8Array; readonly sourcePassphrase: string; readonly destinationPassphrase: string } |
  { readonly operation: 'saveTermsReview'; readonly id: string; readonly bytes: Uint8Array } |
  { readonly operation: 'exportEncrypted'; readonly profileId: string } |
  { readonly operation: 'status' | 'listProfiles' | 'listTermsReviews' | 'lock' | 'dispose' | 'activity' });
export type RuntimeResponse = Header & { readonly kind: 'response'; readonly operation: RuntimeOperation } & (
  { readonly result: { readonly ok: false; readonly error: RuntimeError } } |
  { readonly operation: 'exportEncrypted'; readonly result: { readonly ok: true; readonly value: RuntimeExport } } |
  { readonly operation: 'listProfiles'; readonly result: { readonly ok: true; readonly value: RuntimeInventory } } |
  { readonly operation: 'saveTermsReview'; readonly result: { readonly ok: true; readonly value: RuntimeReviewSaved } } |
  { readonly operation: 'listTermsReviews'; readonly result: { readonly ok: true; readonly value: RuntimeReviews } } |
  { readonly operation: 'restore'; readonly result: { readonly ok: true; readonly value: RuntimeRestore } } |
  { readonly operation: Exclude<RuntimeOperation, 'exportEncrypted' | 'listProfiles' | 'restore' | 'saveTermsReview' | 'listTermsReviews'>; readonly result: { readonly ok: true; readonly value: RuntimeStatus } });
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
    op === 'saveTermsReview' ? ['id', 'bytes'] : op === 'restore' ? ['bytes', 'sourcePassphrase', 'destinationPassphrase'] : op === 'exportEncrypted' ? ['profileId'] : [];
  const raw = exact(input, ['version', 'requestId', 'generation', 'operation', ...extra]); const base = header(raw);
  if (op === 'saveTermsReview') return Object.freeze({ ...base, operation: op, ...reviewEntry({id: raw.id, bytes: raw.bytes}) });
  if (op === 'init') return Object.freeze({ ...base, operation: op, config: parseRuntimeConfig(raw.config) });
  if (op === 'unlock') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId), passphrase: passphrase(raw.passphrase) });
  if (op === 'create') return Object.freeze({ ...base, operation: op, passphrase: passphrase(raw.passphrase) });
  if (op === 'restore') {
    return Object.freeze({ ...base, operation: op, bytes: boundedBytes(raw.bytes, MAX_BACKUP_BYTES),
      sourcePassphrase: passphrase(raw.sourcePassphrase), destinationPassphrase: passphrase(raw.destinationPassphrase) });
  }
  if (op === 'exportEncrypted') return Object.freeze({ ...base, operation: op, profileId: profile(raw.profileId) });
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
function reviewEntry(input: unknown): RuntimeReviewEntry {
  const raw = exact(input, ['id', 'bytes']);
  const bytes = boundedBytes(raw.bytes, MAX_SAVED_REVIEW_BYTES);
  if (!bytes.length) return fail();
  return Object.freeze({id: profile(raw.id), bytes});
}
function reviews(input: unknown): RuntimeReviews {
  const raw = exact(input, ['entries']);
  const list = raw.entries;
  if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) return fail();
  const length = own(list, 'length');
  if (typeof length !== 'number' || length > MAX_SAVED_REVIEWS || Reflect.ownKeys(list).length !== length + 1) return fail();
  const entries: RuntimeReviewEntry[] = [];
  for (let i=0; i<length; i++) entries.push(reviewEntry(own(list, String(i))));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) return fail();
  return Object.freeze({entries: Object.freeze(entries)});
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
export function parseRuntimeMessage(input: unknown): RuntimeMessage {
  const kind = own(input, 'kind');
  if (kind === 'locked' || kind === 'closed') {
    const raw = exact(input, kind === 'locked' ? ['version', 'kind', 'generation'] : ['version', 'kind', 'generation', 'code']);
    if (raw.version !== 1) return fail();
    const generation = sequence(raw.generation);
    return kind === 'locked' ? Object.freeze({ version: 1, kind, generation }) : Object.freeze({ version: 1, kind, generation, code: code(raw.code) });
  }
  const raw = exact(input, ['version', 'requestId', 'generation', 'operation', 'kind', 'result']);
  if (kind !== 'response') return fail();
  const base = { ...header(raw), kind: 'response' as const, operation: operation(raw.operation) };
  const ok = own(raw.result, 'ok');
  if (ok === false) {
    const result = exact(raw.result, ['ok', 'error']); const error = exact(result.error, ['code', 'messageKey']);
    const value = code(error.code); if (error.messageKey !== `runtime.error.${value.toLowerCase()}`) return fail();
    return Object.freeze({ ...base, result: runtimeFailure(value) });
  }
  const result = exact(raw.result, ['ok', 'value']); if (ok !== true) return fail();
  if (base.operation === 'saveTermsReview') { const saved = exact(result.value, ['id']); return Object.freeze({...base, operation: base.operation, result: Object.freeze({ok: true, value: Object.freeze({id: profile(saved.id)})})}); }
  if (base.operation === 'listTermsReviews') return Object.freeze({...base, operation: base.operation, result: Object.freeze({ok: true, value: reviews(result.value)})});
  if (base.operation === 'exportEncrypted') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: encryptedExport(result.value) }) });
  if (base.operation === 'listProfiles') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: inventory(result.value) }) });
  if (base.operation === 'restore') return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: restored(result.value) }) });
  return Object.freeze({ ...base, operation: base.operation, result: Object.freeze({ ok: true, value: parseRuntimeStatus(result.value, base.generation) }) });
}
