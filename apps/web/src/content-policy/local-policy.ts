/** Local UX admission only. No network/Sybil defense, persistence authority, scanner protocol or recovery cooldown. */
import { MAX_BACKUP_BYTES, MAX_VAULT_PROFILES } from '../../../../packages/schemas/index.ts';
import { MAX_TERMS_REVIEW_BYTES } from '../../../../packages/domain/index.ts';

export type DataClass = 'public' | 'private' | 'secret';
export type ContentPurpose = 'restore-backup' | 'verify-backup' | 'terms-review' | 'messaging-key' | 'chat-history' | 'recovery-reference' | 'advertisement';
export type ImportPurpose = 'restore-backup' | 'verify-backup' | 'terms-review';
export interface ContentRule { readonly dataClass: DataClass; readonly storage: 'encrypted-vault' | 'public-discovery'; }
const PRIVATE = Object.freeze({ dataClass: 'private', storage: 'encrypted-vault' } as const);
const SECRET = Object.freeze({ dataClass: 'secret', storage: 'encrypted-vault' } as const);
const PUBLIC = Object.freeze({ dataClass: 'public', storage: 'public-discovery' } as const);
/** Chosen by trusted call sites, never from a document's imported class/status fields. Memory review is not persistence. */
export function contentRule(purpose: ContentPurpose): ContentRule {
  switch (purpose) {
    case 'restore-backup': case 'verify-backup': case 'terms-review': case 'chat-history': case 'recovery-reference': return PRIVATE;
    case 'messaging-key': return SECRET;
    case 'advertisement': return PUBLIC;
    default: throw new LocalPolicyError('INVALID_INPUT');
  }
}
export type LocalPolicyCode = 'LOCAL_LIMIT_REACHED' | 'ENCRYPTION_REQUIRED' | 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'CANCELLED' | 'UNAVAILABLE';
const MESSAGES: Readonly<Record<LocalPolicyCode, string>> = Object.freeze({
  LOCAL_LIMIT_REACHED: 'The local work limit was reached. Wait or cancel the running work.',
  ENCRYPTION_REQUIRED: 'An unlocked encrypted profile is required.', INVALID_INPUT: 'Invalid local work input.',
  LIMIT_EXCEEDED: 'The file exceeds the local import limit.', CANCELLED: 'The local import was cancelled.', UNAVAILABLE: 'The local operation is unavailable.',
});
export class LocalPolicyError extends Error {
  readonly code: LocalPolicyCode;
  constructor(code: LocalPolicyCode) {
    const fixed = typeof code === 'string' && Object.hasOwn(MESSAGES, code) ? code : 'UNAVAILABLE';
    super(MESSAGES[fixed]); this.name = 'LocalPolicyError'; this.code = fixed;
  }
}
export function localPolicyCode(error: unknown): LocalPolicyCode | undefined {
  try {
    if (error instanceof LocalPolicyError) {
      const property = Object.getOwnPropertyDescriptor(error, 'code');
      const code: unknown = property && 'value' in property ? property.value : undefined;
      if (typeof code === 'string' && Object.hasOwn(MESSAGES, code)) return code as LocalPolicyCode;
    }
  } catch { /* No foreign diagnostics cross this boundary. */ }
  return undefined;
}
function normalized(error: unknown): LocalPolicyError { return new LocalPolicyError(localPolicyCode(error) ?? 'UNAVAILABLE'); }
/** Bundled composition derives this view only from its actual runtime/Worker selection, never imported JSON. */
export interface ProfileSelectionPort {
  readonly current: { readonly state: 'locked' | 'unlocked' };
  readonly profileId: string | null;
  selectionScope(): number;
}
/** Constructor dependencies are trusted composition ports. These hints cannot replace the Worker's native G02 lease. */
export class ProfileAttemptAdmission {
  readonly #selection: ProfileSelectionPort;
  readonly #now: () => number;
  readonly #offers = new Map<string, number[]>();
  #lastTime = -Infinity;
  #clockFailed = false;
  constructor(selection: ProfileSelectionPort, now: () => number = () => performance.now()) { this.#selection = selection; this.#now = now; }
  admitOfferAttempt(): void {
    let time: number, profileId: string;
    try {
      time = this.#now();
      if (this.#clockFailed || !Number.isFinite(time) || time < 0 || time < this.#lastTime) { this.#clockFailed = true; throw new LocalPolicyError('UNAVAILABLE'); }
      this.#lastTime = time;
      const scope = this.#selection.selectionScope();
      const state = this.#selection.current.state, id = this.#selection.profileId;
      if (!Number.isSafeInteger(scope) || scope < 0 || scope !== this.#selection.selectionScope()) throw new LocalPolicyError('UNAVAILABLE');
      if (state !== 'unlocked' || typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) throw new LocalPolicyError('ENCRYPTION_REQUIRED');
      profileId = id;
    } catch (error) { throw normalized(error); }
    for (const [id, attempts] of this.#offers) {
      const current = attempts.filter(at => time - at < 60_000);
      if (current.length) this.#offers.set(id, current); else this.#offers.delete(id);
    }
    const attempts = this.#offers.get(profileId);
    if (attempts === undefined && this.#offers.size >= MAX_VAULT_PROFILES || attempts !== undefined && attempts.length >= 5) throw new LocalPolicyError('LOCAL_LIMIT_REACHED');
    // Reserve synchronously before the caller performs any offer work, including a reentrant callback.
    if (attempts) attempts.push(time); else this.#offers.set(profileId, [time]);
  }
}
/** Pure candidate arithmetic only. No camera/QR codec or production scan consumer is activated here. */
export class CandidateAttemptAdmission {
  readonly #now: () => number;
  #attempts: number[] = [];
  #lastTime = -Infinity;
  constructor(now: () => number = () => performance.now()) { this.#now = now; }
  admitCandidate(): void {
    let time: number;
    try { time = this.#now(); } catch { throw new LocalPolicyError('UNAVAILABLE'); }
    if (!Number.isFinite(time) || time < 0 || time < this.#lastTime) throw new LocalPolicyError('UNAVAILABLE');
    this.#lastTime = time;
    this.#attempts = this.#attempts.filter(at => time - at < 60_000);
    if (this.#attempts.length >= 10) throw new LocalPolicyError('LOCAL_LIMIT_REACHED');
    this.#attempts.push(time);
  }
}
const profiles = new WeakMap<ProfileSelectionPort, ProfileAttemptAdmission>();
/** Same facade keeps cooldowns across component remounts, lock/unlock and profile reselection. */
export function profileAttemptAdmission(selection: ProfileSelectionPort): ProfileAttemptAdmission {
  let admission = profiles.get(selection);
  if (!admission) { admission = new ProfileAttemptAdmission(selection); profiles.set(selection, admission); }
  return admission;
}

export interface ImportFile { readonly size: number; arrayBuffer(): Promise<ArrayBuffer>; }
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const fillBytes = Uint8Array.prototype.fill;
const addAbortListener = EventTarget.prototype.addEventListener;
const removeAbortListener = EventTarget.prototype.removeEventListener;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
function checkSignal(signal: AbortSignal | undefined): void {
  if (signal === undefined) return;
  let cancelled: unknown;
  try { cancelled = Reflect.apply(nativeAborted, signal, []); } catch { throw new LocalPolicyError('INVALID_INPUT'); }
  if (cancelled === true) throw new LocalPolicyError('CANCELLED');
}
let importOwner: object | undefined;
/**
 * One physical UI file-import job per document module, across forms and facade instances. Cancellation cannot stop
 * File.arrayBuffer/native crypto: retain admission until both the read and consuming operation actually settle.
 * Consumer receives an owned, ephemeral buffer; copy only into the existing encrypted/native domain service.
 * Restore may start locked: its native G03 service creates an encrypted destination, never plaintext storage.
 */
export async function runBoundedImport<T>(purpose: ImportPurpose, file: ImportFile, signal: AbortSignal | undefined, consume: (bytes: Uint8Array<ArrayBuffer>) => Promise<T>, admitted?: () => void): Promise<T> {
  if (importOwner !== undefined) throw new LocalPolicyError('LOCAL_LIMIT_REACHED');
  const owner = {}; importOwner = owner; // Before file/signal accessors or any supplied callback.
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  const wipe = (): void => {
    try { if (bytes) Reflect.apply(fillBytes, bytes, [0]); }
    catch { /* Detached consumer buffers cannot prevent cleanup or replace a durable result. */ }
  };
  try {
    const maximum = purpose === 'terms-review' ? MAX_TERMS_REVIEW_BYTES : purpose === 'restore-backup' || purpose === 'verify-backup' ? MAX_BACKUP_BYTES : undefined;
    if (maximum === undefined || typeof consume !== 'function') throw new LocalPolicyError('INVALID_INPUT');
    contentRule(purpose); checkSignal(signal);
    if (signal !== undefined) Reflect.apply(addAbortListener, signal, ['abort', wipe, { once: true }]);
    admitted?.(); checkSignal(signal);
    const size = file.size; checkSignal(signal);
    if (!Number.isSafeInteger(size) || size < 0) throw new LocalPolicyError('INVALID_INPUT');
    if (size > maximum) throw new LocalPolicyError('LIMIT_EXCEEDED');
    const read = file.arrayBuffer; checkSignal(signal);
    if (typeof read !== 'function') throw new LocalPolicyError('INVALID_INPUT');
    const buffer = await Reflect.apply(read, file, []);
    let actual: unknown;
    try { actual = Reflect.apply(bufferLength, buffer, []); } catch { throw new LocalPolicyError('INVALID_INPUT'); }
    bytes = new Uint8Array(buffer);
    if (typeof actual !== 'number' || actual > maximum) throw new LocalPolicyError('LIMIT_EXCEEDED');
    checkSignal(signal);
    // The native consumer owns durability/cancellation semantics; completed writes must keep their real result.
    return await consume(bytes);
  } catch (error) { throw normalized(error); }
  finally {
    wipe();
    try { if (signal !== undefined) Reflect.apply(removeAbortListener, signal, ['abort', wipe]); }
    catch { /* A listener cleanup failure cannot retain physical admission or expose caller diagnostics. */ }
    finally { if (importOwner === owner) importOwner = undefined; }
  }
}
