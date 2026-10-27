/** G12 worker-private persistence coordinator. The default journal has no wallet/send/clear/reconciliation API;
 * createLifecycleJournal adds validated transitions for the reconciling submit coordinator (tx-lifecycle.ts) only.
 * A successful marker records conservative recovery metadata; it is not spending authority.
 */
import { CoreSchemaError, parseTradeBinding, sameBinding, type CoreErrorCode, type CoreResult, type TradeBinding } from '../../schemas/index.ts';
import { decodeIntentPayload, encodeIntentPayload, intentData, IntentSchemaError, parseIntent, parseIntentAccount, parseIntentId, type IntentV1 } from '../../schemas/index.ts';
import { MAX_RECORDS, MAX_REVISION, MAX_SNAPSHOT_JSON_BYTES } from '../../schemas/index.ts';
import type { Result, VaultService, VaultSession, VaultSessionAuthority, VaultSessionLease } from '../../schemas/index.ts';
import { createCoreError, createOperationId, normalizeError } from './errors.ts';

export type JournalVaultPort = Pick<VaultService, 'read' | 'list' | 'commit'> & VaultSessionAuthority;
export interface IntentJournalOptions {
  readonly vault: JournalVaultPort;
  readonly session: VaultSession;
  /** Bundled native adapter validates canonical encoding only; never an imported/UI approval.
   * No adapter exists by default. Test fixture validators do not establish chain or wallet truth. */
  readonly validateCanonical?: (intent: Readonly<IntentV1>) => CoreResult<void> | Promise<CoreResult<void>>;
  readonly now?: () => number;
}
export interface IntentJournal {
  reserve(intent: IntentV1, expectedRevision: number, signal?: AbortSignal): Promise<CoreResult<string>>;
  markSending(intentId: string, signal?: AbortSignal): Promise<CoreResult<void>>;
  /** All persisted states remain reserved until a future trusted reconciliation integration exists. */
  unresolved(binding: TradeBinding, account: string, signal?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>>;
  dispose(): void;
}
class JournalFailure extends Error {
  readonly code: CoreErrorCode;
  constructor(code: CoreErrorCode) { super('Local intent journal operation unavailable.'); this.code = code; }
}
function fail(code: CoreErrorCode): never { throw new JournalFailure(code); }
/** Both instanceof and property reflection may throw for hostile foreign values. */
function knownErrorCode(error: unknown, kind: 'journal' | 'schema' | 'core'): CoreErrorCode | undefined {
  try {
    const recognized = kind === 'journal' ? error instanceof JournalFailure : kind === 'schema' ? error instanceof IntentSchemaError : error instanceof CoreSchemaError;
    if (!recognized) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    if (!descriptor || !('value' in descriptor)) return undefined;
    const code: unknown = descriptor.value;
    if (code === 'INVALID_INPUT' || code === 'UNSUPPORTED_VERSION' || code === 'UNSUPPORTED_PROVIDER' || code === 'WRONG_CHAIN' || code === 'UNAUTHORIZED' || code === 'USER_REJECTED' || code === 'LOCKED' || code === 'CONFLICT' || code === 'UNAVAILABLE' || code === 'TIMEOUT' || code === 'CANCELLED' || code === 'LIMIT_EXCEEDED' || code === 'INTEGRITY_FAILURE' || code === 'BROADCAST_UNKNOWN' || code === 'EXPIRED') return code;
  } catch { /* Do not inspect the thrown value or the classification failure further. */ }
  return undefined;
}
function vaultValue<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  if (code === 'LOCKED' || code === 'CANCELLED' || code === 'CONFLICT' || code === 'INVALID_INPUT' || code === 'UNSUPPORTED_VERSION' || code === 'LIMIT_EXCEEDED') return fail(code);
  if (code === 'QUOTA_EXCEEDED' || code === 'REKEY_REQUIRED') return fail('LIMIT_EXCEEDED');
  if (code === 'UNSUPPORTED_ENVIRONMENT') return fail('UNSUPPORTED_PROVIDER');
  return fail('UNAVAILABLE');
}
interface Job { readonly epoch: number; readonly controller: AbortController; readonly operationId: string; revision: number; committed: boolean; markerWrite: boolean; reservedId?: string; }
interface StoredIntent { readonly recordId: string; readonly intent: IntentV1; }
const sameAccount = (chain: TradeBinding['chain'], left: string, right: string): boolean => chain === 'evm' ? left.toLowerCase() === right.toLowerCase() : left === right;
function preparedOnly(intent: IntentV1, allowReplacement = false): void {
  if (intent.state !== 'prepared' || (intent.submission.chain === 'evm' ? intent.submission.hash !== null : intent.submission.signature !== null)) return fail('CONFLICT');
  if (intent.replacementOf !== null && !allowReplacement) return fail('UNSUPPORTED_PROVIDER');
}
/** G12 lifecycle transition written only by the reconciling coordinator (tx-lifecycle.ts), never by UI status. */
export interface LifecycleTransition { readonly state: IntentV1['state']; readonly hash: string | null }
export const LIFECYCLE_TRANSITIONS: Readonly<Record<IntentV1['state'], readonly IntentV1['state'][]>> = Object.freeze({
  prepared: Object.freeze(['failed'] as const),
  'broadcast-unknown': Object.freeze(['pending', 'confirmed', 'finalized', 'replaced', 'expired', 'failed'] as const),
  pending: Object.freeze(['pending', 'confirmed', 'finalized', 'replaced', 'expired', 'failed', 'reorged'] as const),
  confirmed: Object.freeze(['finalized', 'reorged'] as const),
  finalized: Object.freeze(['reorged'] as const),
  reorged: Object.freeze(['pending', 'confirmed', 'finalized', 'replaced', 'expired', 'failed'] as const),
  failed: Object.freeze([] as const), expired: Object.freeze([] as const), replaced: Object.freeze([] as const),
});
/** States a new intent of the same binding/account may follow without naming them: settled, or never sent. */
const RELEASED_STATES: readonly IntentV1['state'][] = ['finalized', 'failed'];
/** Dropped/replaced outcomes are followed only by an explicit successor (replacementOf) chosen by a user action. */
const SUCCESSOR_STATES: readonly IntentV1['state'][] = ['expired', 'replaced'];
const TRANSITION = Symbol('lifecycle-transition');
const LIST = Symbol('lifecycle-list');
const REVISION = Symbol('lifecycle-revision');
/** Lifecycle-mode reservation: true when `intent` may coexist with the stored records of its binding/account. */
function lifecycleReservable(records: readonly StoredIntent[], intent: IntentV1): boolean {
  const matching = records.filter(record => sameBinding(record.intent.binding, intent.binding) && sameAccount(intent.binding.chain, record.intent.account, intent.account));
  if (intent.replacementOf !== null) {
    const original = matching.find(record => record.intent.intentId === intent.replacementOf);
    if (!original || !SUCCESSOR_STATES.includes(original.intent.state)) return false;
    // A dropped transaction is superseded only at the same nonce, so at most one of the two can ever be included.
    if (original.intent.state === 'expired' && (original.intent.submission.chain !== 'evm' || intent.submission.chain !== 'evm' ||
      original.intent.submission.nonce === null || original.intent.submission.nonce !== intent.submission.nonce)) return false;
    if (records.some(record => record.intent.replacementOf === intent.replacementOf)) return false;
  }
  return matching.every(record => RELEASED_STATES.includes(record.intent.state) || (SUCCESSOR_STATES.includes(record.intent.state) &&
    (intent.replacementOf === record.intent.intentId || records.some(other => other.intent.replacementOf === record.intent.intentId))));
}

class EncryptedIntentJournal implements IntentJournal {
  readonly #vault: JournalVaultPort;
  readonly #validate: IntentJournalOptions['validateCanonical'];
  readonly #now: () => number;
  readonly #lifecycle: boolean;
  #lease: VaultSessionLease | undefined;
  #initialError: CoreErrorCode | undefined;
  #closed = false;
  #epoch = 0;
  #active: Job | undefined;
  constructor(options: IntentJournalOptions, lifecycle = false) {
    this.#vault = options.vault; this.#validate = options.validateCanonical; this.#now = options.now ?? Date.now; this.#lifecycle = lifecycle;
    try { this.#lease = vaultValue(this.#vault.captureSession(options.session, () => { this.#epoch++; this.#active?.controller.abort(); })); }
    catch (error) { this.#initialError = knownErrorCode(error, 'journal') ?? 'LOCKED'; }
  }
  #guard(job: Job): Readonly<VaultSession> {
    const session = this.#lease?.current();
    if (this.#closed || job.epoch !== this.#epoch || !session) return fail('LOCKED');
    if (job.controller.signal.aborted) return fail('CANCELLED');
    if (session.revision !== job.revision) return fail('CONFLICT');
    return session;
  }
  async #run<T>(signal: AbortSignal | undefined, work: (job: Job) => Promise<T>, reservation = false): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    const failure = (code: CoreErrorCode): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: false }) });
    if (this.#initialError) return failure(this.#initialError);
    if (this.#closed || !this.#lease?.current()) return failure('LOCKED');
    if (signal?.aborted) return failure('CANCELLED');
    if (this.#active) return failure('CONFLICT');
    const session = this.#lease.current(); if (!session) return failure('LOCKED');
    const job: Job = { epoch: this.#epoch, controller: new AbortController(), operationId, revision: session.revision, committed: false, markerWrite: false };
    this.#active = job;
    const abort = (): void => job.controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    try { this.#guard(job); const value = await work(job); this.#guard(job); return { ok: true, value }; }
    catch (error) {
      // A durable prepared reservation remains discoverable after concurrent lock/cancel.
      // Returning its storage ID never returns keys, records or send permission.
      if (reservation && job.committed && job.reservedId) return { ok: true, value: job.reservedId as T };
      if (job.committed && job.markerWrite) return failure('BROADCAST_UNKNOWN');
      const journalCode = knownErrorCode(error, 'journal');
      if (journalCode !== undefined) return failure(job.markerWrite && journalCode === 'UNAVAILABLE' ? 'BROADCAST_UNKNOWN' : journalCode);
      const schemaCode = knownErrorCode(error, 'schema') ?? knownErrorCode(error, 'core');
      if (schemaCode !== undefined) return failure(schemaCode);
      try { this.#guard(job); } catch (guardError) { return failure(knownErrorCode(guardError, 'journal') ?? 'LOCKED'); }
      return failure(job.markerWrite ? 'BROADCAST_UNKNOWN' : 'UNAVAILABLE');
    } finally { signal?.removeEventListener('abort', abort); if (this.#active === job) this.#active = undefined; }
  }
  async #synchronize(job: Job): Promise<Readonly<VaultSession>> {
    const session = this.#guard(job);
    const revision = vaultValue(await this.#vault.commit(session.sessionId, job.revision, [], job.controller.signal));
    this.#guard(job); if (revision !== job.revision) return fail('CONFLICT'); return session;
  }
  async #scan(job: Job): Promise<readonly StoredIntent[]> {
    const session = await this.#synchronize(job);
    const records = vaultValue(await this.#vault.list(session.sessionId, 'journal')); this.#guard(job);
    try {
      if (!Array.isArray(records) || Object.getPrototypeOf(records) !== Array.prototype || records.length > MAX_RECORDS || Reflect.ownKeys(records).length !== records.length + 1) return fail('INTEGRITY_FAILURE');
      const stored: StoredIntent[] = []; const intentIds = new Set<string>(), recordIds = new Set<string>(); let bytes = 0;
      for (let index = 0; index < records.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(records, String(index)); if (!descriptor || !('value' in descriptor)) return fail('INTEGRITY_FAILURE');
        const raw = intentData(descriptor.value, ['id', 'kind', 'schemaVersion', 'payload']);
        if (raw.kind !== 'journal' || typeof raw.id !== 'string' || !/^[0-9a-f]{32}$/.test(raw.id) || typeof raw.payload !== 'string') return fail('INTEGRITY_FAILURE');
        if (raw.schemaVersion !== 1) return fail('UNSUPPORTED_VERSION');
        bytes += JSON.stringify({ id: raw.id, kind: 'journal', schemaVersion: 1, payload: '' }).length + raw.payload.length + (index ? 1 : 0);
        if (bytes > MAX_SNAPSHOT_JSON_BYTES) return fail('LIMIT_EXCEEDED');
        const intent = decodeIntentPayload(raw.payload);
        if (intentIds.has(intent.intentId) || recordIds.has(raw.id)) return fail('INTEGRITY_FAILURE'); intentIds.add(intent.intentId); recordIds.add(raw.id);
        stored.push(Object.freeze({ recordId: raw.id, intent }));
      }
      this.#guard(job); return stored;
    } catch (error) {
      const journalCode = knownErrorCode(error, 'journal'); if (journalCode !== undefined) return fail(journalCode);
      if (knownErrorCode(error, 'schema') === 'UNSUPPORTED_VERSION') return fail('UNSUPPORTED_VERSION');
      return fail('INTEGRITY_FAILURE');
    }
  }
  async #canonical(job: Job, intent: IntentV1): Promise<void> {
    if (typeof this.#validate !== 'function') return fail('UNSUPPORTED_PROVIDER');
    const result: unknown = await this.#validate(intent); this.#guard(job);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(result, 'ok'); if (!descriptor || !('value' in descriptor)) return fail('INTEGRITY_FAILURE');
      if (descriptor.value === true) { const raw = intentData(result, ['ok', 'value']); if (raw.value !== undefined) return fail('INTEGRITY_FAILURE'); return; }
      if (descriptor.value !== false) return fail('INTEGRITY_FAILURE');
      const raw = intentData(result, ['ok', 'error']);
      return fail(normalizeError(raw.error, { operationId: job.operationId, phase: 'prepare' }).code);
    } catch (error) { return fail(knownErrorCode(error, 'journal') ?? 'INTEGRITY_FAILURE'); }
  }
  reserve(input: IntentV1, expectedRevision: number, signal?: AbortSignal): Promise<CoreResult<string>> {
    return this.#run(signal, async job => {
      const intent = parseIntent(input);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > MAX_REVISION) return fail('INVALID_INPUT');
      if (expectedRevision !== job.revision) return fail('CONFLICT');
      preparedOnly(intent, this.#lifecycle);
      const records = await this.#scan(job); await this.#canonical(job, intent); this.#guard(job);
      if (records.some(record => record.intent.intentId === intent.intentId)) return fail('CONFLICT');
      if (this.#lifecycle ? !lifecycleReservable(records, intent) : records.some(record => sameBinding(record.intent.binding, intent.binding) && sameAccount(intent.binding.chain, record.intent.account, intent.account))) return fail('CONFLICT');
      const random = crypto.getRandomValues(new Uint8Array(16)); let recordId: string;
      try { recordId = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join(''); } finally { random.fill(0); }
      const session = this.#guard(job); const collision = vaultValue(await this.#vault.read(session.sessionId, recordId)); this.#guard(job);
      if (collision !== null) return fail('CONFLICT');
      const payload = encodeIntentPayload(intent); job.reservedId = recordId;
      const revision = vaultValue(await this.#vault.commit(session.sessionId, job.revision, [{ op: 'put', record: { id: recordId, kind: 'journal', schemaVersion: 1, payload } }], job.controller.signal));
      job.committed = true; job.revision = revision; this.#guard(job); return recordId;
    }, true);
  }
  markSending(input: string, signal?: AbortSignal): Promise<CoreResult<void>> {
    return this.#run(signal, async job => {
      const intentId = parseIntentId(input); const records = await this.#scan(job);
      const record = records.find(entry => entry.intent.intentId === intentId);
      if (!record) return fail('CONFLICT'); preparedOnly(record.intent, this.#lifecycle);
      if (record.intent.replacementOf !== null && !lifecycleReservable(records.filter(entry => entry !== record), record.intent)) return fail('CONFLICT');
      await this.#canonical(job, record.intent); this.#guard(job);
      const now = this.#now(); if (!Number.isSafeInteger(now) || now < 0) return fail('INVALID_INPUT');
      const next = parseIntent({ ...record.intent, state: 'broadcast-unknown', updatedAt: Math.max(now, record.intent.updatedAt) });
      const session = this.#guard(job); job.markerWrite = true;
      const revision = vaultValue(await this.#vault.commit(session.sessionId, job.revision, [{ op: 'put', record: { id: record.recordId, kind: 'journal', schemaVersion: 1, payload: encodeIntentPayload(next) } }], job.controller.signal));
      job.committed = true; job.revision = revision; this.#guard(job);
    });
  }
  unresolved(input: TradeBinding, accountInput: string, signal?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>> {
    return this.#run(signal, async job => {
      const binding = parseTradeBinding(input), account = parseIntentAccount(accountInput, binding.chain);
      const records = await this.#scan(job);
      // Serialized terminal labels, restored backups and wall-clock age cannot
      // prove safe release of a reservation without a trusted native reconciliation.
      const matches = Object.freeze(records.filter(record => sameBinding(record.intent.binding, binding) && sameAccount(binding.chain, record.intent.account, account)).map(record => record.intent));
      await this.#synchronize(job); return matches;
    });
  }
  /** Lifecycle mode only: one CAS write of a validated state/hash transition. Every other field is immutable. */
  [TRANSITION](input: string, transition: LifecycleTransition, signal?: AbortSignal): Promise<CoreResult<IntentV1>> {
    return this.#run(signal, async job => {
      if (!this.#lifecycle) return fail('UNSUPPORTED_PROVIDER');
      let state: unknown, hash: unknown;
      try { const raw = intentData(transition, ['state', 'hash']); state = raw.state; hash = raw.hash; } catch { return fail('INVALID_INPUT'); }
      if (typeof state !== 'string' || !Object.hasOwn(LIFECYCLE_TRANSITIONS, state)) return fail('INVALID_INPUT');
      if (hash !== null && (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/.test(hash))) return fail('INVALID_INPUT');
      const nextState = state as IntentV1['state'], nextHash = hash as string | null;
      const intentId = parseIntentId(input); const records = await this.#scan(job);
      const record = records.find(entry => entry.intent.intentId === intentId);
      if (!record) return fail('CONFLICT');
      const current = record.intent;
      if (current.submission.chain !== 'evm') return fail('UNSUPPORTED_PROVIDER');
      if (!LIFECYCLE_TRANSITIONS[current.state].includes(nextState)) return fail('CONFLICT');
      // A recorded hash is immutable; a missing one may be learned once. A prepared intent never carries one.
      if (current.submission.hash !== null && nextHash !== current.submission.hash) return fail('CONFLICT');
      if (current.state === 'prepared' && nextHash !== null) return fail('CONFLICT');
      if (nextState === 'pending' && nextHash === null) return fail('INVALID_INPUT');
      if (current.state === 'pending' && nextState === 'pending') return fail('CONFLICT');
      await this.#canonical(job, current); this.#guard(job);
      const now = this.#now(); if (!Number.isSafeInteger(now) || now < 0) return fail('INVALID_INPUT');
      const next = parseIntent({ ...current, state: nextState, submission: { ...current.submission, hash: nextHash }, updatedAt: Math.max(now, current.updatedAt) });
      const session = this.#guard(job);
      // After a send-capable call the stored record is the only evidence; an uncertain write is reported conservatively.
      job.markerWrite = current.state !== 'prepared';
      const revision = vaultValue(await this.#vault.commit(session.sessionId, job.revision, [{ op: 'put', record: { id: record.recordId, kind: 'journal', schemaVersion: 1, payload: encodeIntentPayload(next) } }], job.controller.signal));
      job.committed = true; job.revision = revision; this.#guard(job); return next;
    });
  }
  /** Lifecycle mode only: every intent in the profile journal, for restart recovery. */
  [LIST](signal?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>> {
    return this.#run(signal, async job => {
      if (!this.#lifecycle) return fail('UNSUPPORTED_PROVIDER');
      const records = await this.#scan(job); await this.#synchronize(job); return Object.freeze(records.map(record => record.intent));
    });
  }
  [REVISION](): number | null { return this.#closed ? null : this.#lease?.current()?.revision ?? null; }
  dispose(): void { if (this.#closed) return; this.#closed = true; this.#epoch++; this.#active?.controller.abort(); this.#lease?.dispose(); this.#lease = undefined; }
}
export function createIntentJournal(options: IntentJournalOptions): IntentJournal { return new EncryptedIntentJournal(options); }
/**
 * G12 lifecycle journal, for the reconciling submit coordinator (tx-lifecycle.ts) only. Compared with the
 * reservation-only journal it (a) lets a new intent follow a finalized/failed intent of the same binding/account,
 * (b) follows a dropped (expired) or replaced intent only through one explicit successor naming it in
 * `replacementOf` (at the same nonce when dropped), and (c) records validated state/hash transitions.
 * It still has no send, clear or delete operation.
 */
export interface LifecycleJournal extends IntentJournal {
  observe(intentId: string, transition: LifecycleTransition, signal?: AbortSignal): Promise<CoreResult<IntentV1>>;
  list(signal?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>>;
  /** Vault revision the next reserve must name, or null while locked/disposed. */
  currentRevision(): number | null;
}
export function createLifecycleJournal(options: IntentJournalOptions): LifecycleJournal {
  const journal = new EncryptedIntentJournal(options, true);
  return Object.freeze({
    reserve: (intent: IntentV1, expectedRevision: number, signal?: AbortSignal) => journal.reserve(intent, expectedRevision, signal),
    markSending: (intentId: string, signal?: AbortSignal) => journal.markSending(intentId, signal),
    unresolved: (binding: TradeBinding, account: string, signal?: AbortSignal) => journal.unresolved(binding, account, signal),
    observe: (intentId: string, transition: LifecycleTransition, signal?: AbortSignal) => journal[TRANSITION](intentId, transition, signal),
    list: (signal?: AbortSignal) => journal[LIST](signal),
    currentRevision: () => journal[REVISION](),
    dispose: () => journal.dispose(),
  });
}
