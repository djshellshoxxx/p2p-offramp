/**
 * Session-scoped Solana journal over the real encrypted vault's CAS port. One private record per trade keeps the
 * complete native intents, including pre-marker signatures, outcomes and original profile ids. A fresh-key vault
 * restore changes the current profile but does not rewrite intent provenance or uncertain send markers.
 *
 * This module has no storage, network, wallet or key implementation. Its injected VaultService owns encryption,
 * persistent CAS and session revocation. Reads use an empty commit to reject a stale cached vault snapshot.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { createCoreError, createOperationId } from '../../domain/index.ts';
import {
  decodeBase64url, encodeBase64url, MAX_PAYLOAD_BYTES, parseStrictJsonBytes, sameBinding,
  type CoreErrorCode, type CoreResult, type PrivateRecordV1, type Result, type TradeBinding, type VaultService,
  type VaultSession, type VaultSessionAuthority, type VaultSessionLease,
} from '../../schemas/index.ts';
import { parseSolanaBinding } from './bind.ts';
import { fail, failureCode, hex } from './codec.ts';
import {
  exactData, isTerminal, parseSolanaIntent, transitionIntent, UNKNOWN_ORIGIN, type SolanaIntentRecord,
} from './intent.ts';
import { admitIntent, admitIntentWithoutCapacity, MAX_INTENTS_PER_TRADE,
  type SolanaJournalPort, type SolanaJournalSnapshot, type SolanaJournalSnapshotV2 } from './journal.ts';
import { eligibleForRetirement, identityFromEntry, intentOrder, parseReservationEntries, parseReservationIdentity,
  parseReservationRef, sameReservationRef, type SolanaReservationEntry,
  type SolanaReservationIdentity, type SolanaReservationRef, type SolanaReservedIntent } from './reservation.ts';

export const SOLANA_VAULT_JOURNAL_FORMAT = 'p2p-offramp/solana/vault-journal/v1';
export const SOLANA_VAULT_JOURNAL_FORMAT_V2 = 'p2p-offramp/solana/vault-journal/v2';
type VaultPort = Pick<VaultService, 'read' | 'commit'> & VaultSessionAuthority;
interface StateV1 { readonly version: 1; readonly revision: number; readonly records: readonly SolanaIntentRecord[] }
interface StateV2 {
  readonly version: 2; readonly revision: number; readonly entries: readonly SolanaReservationEntry[]
}
type State = StateV1 | StateV2;
interface Change<T> { readonly value: T; readonly changed: State | null }
const ordered = intentOrder;
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;

function checkSignal(signal?: AbortSignal): void {
  if (signal === undefined) return;
  let cancelled: boolean;
  try { cancelled = Reflect.apply(aborted, signal, []) as boolean; } catch { return fail('INVALID_INPUT'); }
  if (cancelled) fail('CANCELLED');
}
function revision(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) return fail('INVALID_INPUT');
  return input;
}
function recordId(binding: TradeBinding): string {
  // Permanent locator namespace. Payload migration must never create a parallel writable journal.
  const bytes = new TextEncoder().encode(JSON.stringify([SOLANA_VAULT_JOURNAL_FORMAT, binding.chain,
    binding.networkId, binding.deploymentId, binding.tradeId]));
  try { return hex(sha256(bytes).subarray(0, 16)); } finally { bytes.fill(0); }
}
/** Stable, domain-separated private-record id; the full binding is also checked inside the encrypted payload. */
export function solanaJournalRecordId(binding: TradeBinding): string { return recordId(parseSolanaBinding(binding)); }

function decode(record: PrivateRecordV1 | null, binding: TradeBinding): State {
  if (record === null) return { version: 1, revision: 0, records: [] };
  let bytes: Uint8Array | undefined;
  try {
    const outer = exactData(record, ['id', 'kind', 'schemaVersion', 'payload']);
    if (outer.id !== recordId(binding) || outer.kind !== 'journal') return fail('INTEGRITY_FAILURE');
    if (outer.schemaVersion !== 1 && outer.schemaVersion !== 2) return fail('UNSUPPORTED_VERSION');
    bytes = decodeBase64url(outer.payload, 1, MAX_PAYLOAD_BYTES);
    const parsed = parseStrictJsonBytes(bytes, MAX_PAYLOAD_BYTES);
    if (outer.schemaVersion === 2) {
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) ||
          Object.getOwnPropertyDescriptor(parsed, 'format')?.value !== SOLANA_VAULT_JOURNAL_FORMAT_V2) {
        return fail('UNSUPPORTED_VERSION');
      }
      const raw = exactData(parsed, ['format', 'binding', 'revision', 'entries']);
      if (!sameBinding(parseSolanaBinding(raw.binding), binding)) return fail('INTEGRITY_FAILURE');
      const current = revision(raw.revision);
      return { version: 2, revision: current, entries: parseReservationEntries(raw.entries, binding, current) };
    }
    const raw = exactData(parsed, ['format', 'binding', 'revision', 'records']);
    if (raw.format !== SOLANA_VAULT_JOURNAL_FORMAT) return fail('UNSUPPORTED_VERSION');
    if (!sameBinding(parseSolanaBinding(raw.binding), binding)) return fail('INTEGRITY_FAILURE');
    const current = revision(raw.revision);
    if (!Array.isArray(raw.records) || raw.records.length < 1 || raw.records.length > MAX_INTENTS_PER_TRADE ||
        current < raw.records.length) return fail('INTEGRITY_FAILURE');
    const records: SolanaIntentRecord[] = raw.records.map((input: unknown) => parseSolanaIntent(input));
    if (records.some((entry, index) => !sameBinding(entry.binding, binding) ||
        (index > 0 && ordered(records[index - 1]!, entry) >= 0)) ||
        records.filter(entry => !isTerminal(entry)).length > 1) return fail('INTEGRITY_FAILURE');
    return { version: 1, revision: current, records: Object.freeze(records) };
  } catch (error) {
    return fail(failureCode(error, 'INTEGRITY_FAILURE') === 'UNSUPPORTED_VERSION'
      ? 'UNSUPPORTED_VERSION' : 'INTEGRITY_FAILURE');
  } finally { bytes?.fill(0); }
}
function encode(binding: TradeBinding, state: State): PrivateRecordV1 {
  const payload = state.version === 1 ? { format: SOLANA_VAULT_JOURNAL_FORMAT,
    binding, revision: state.revision, records: state.records } : { format: SOLANA_VAULT_JOURNAL_FORMAT_V2,
    binding, revision: state.revision, entries: state.entries };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  try {
    if (bytes.byteLength > MAX_PAYLOAD_BYTES) return fail('LIMIT_EXCEEDED');
    return { id: recordId(binding), kind: 'journal', schemaVersion: state.version, payload: encodeBase64url(bytes) };
  } finally { bytes.fill(0); }
}
function vaultValue<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  if (code === 'LOCKED' || code === 'CONFLICT' || code === 'CANCELLED' || code === 'LIMIT_EXCEEDED' ||
      code === 'UNSUPPORTED_VERSION' || code === 'INVALID_INPUT') return fail(code);
  if (code === 'QUOTA_EXCEEDED' || code === 'REKEY_REQUIRED') return fail('LIMIT_EXCEEDED');
  return fail('UNAVAILABLE');
}
const refused = (code: CoreErrorCode, operationId = createOperationId()): CoreResult<never> =>
  ({ ok: false, error: createCoreError(code, { operationId, readOnly: false }) });

/** Checks the same immutable-field and transition rules used by the client, before any persistent mutation. */
function upsert(state: StateV1, next: SolanaIntentRecord, profileId: string): StateV1 {
  if (state.revision === Number.MAX_SAFE_INTEGER) return fail('LIMIT_EXCEEDED');
  const previous = state.records.find(record => record.intentId === next.intentId);
  if (previous) {
    checkTransition(previous, next, profileId);
  } else {
    if (next.state !== 'prepared' || next.originProfileId !== profileId || next.updatedAt !== next.createdAt) {
      return fail('CONFLICT');
    }
    admitIntent(state.records, next);
  }
  const records = [...state.records.filter(record => record.intentId !== next.intentId), next].sort(ordered);
  return { version: 1, revision: state.revision + 1, records: Object.freeze(records) };
}

function checkTransition(previous: SolanaIntentRecord, next: SolanaIntentRecord, profileId: string): void {
  if (next.state === 'cancelled' && previous.originProfileId !== profileId) return fail('CONFLICT');
  const changes = previous.state === 'prepared' && next.state === 'signed' ? { signature: next.signature! }
    : next.outcome === null ? {} : { outcome: next.outcome };
  const expected = transitionIntent(previous, next.state, next.updatedAt, changes);
  if (JSON.stringify(expected) !== JSON.stringify(next)) return fail('CONFLICT');
}
const snapshotV2 = (state: StateV2): SolanaJournalSnapshotV2 =>
  Object.freeze({ version: 2, revision: state.revision, entries: state.entries });

/** No retry or deletion. A conflict requires reopening the vault and reconciling the native intent history. */
export class SolanaVaultJournal implements SolanaJournalPort {
  readonly #vault: VaultPort;
  readonly #lease: VaultSessionLease;
  #closed = false;
  #busy = false;
  constructor(vault: VaultPort, session: VaultSession) {
    this.#vault = vault;
    this.#lease = vaultValue(vault.captureSession(session, () => { this.#closed = true; }));
  }
  #current(): Readonly<VaultSession> {
    const current = this.#lease.current();
    if (this.#closed || !current || !/^[0-9a-f]{32}$/.test(current.profileId) ||
        current.profileId === UNKNOWN_ORIGIN) return fail('LOCKED');
    return current;
  }
  profileId(): string { return this.#current().profileId; }

  async #run<T>(
    input: TradeBinding, signal: AbortSignal | undefined, work: (state: State, profileId: string) => Change<T>,
  ): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    if (this.#busy) return refused('CONFLICT', operationId);
    this.#busy = true;
    let committed = false;
    try {
      const binding = parseSolanaBinding(input);
      checkSignal(signal);
      const session = this.#current();
      const guard = () => {
        checkSignal(signal);
        const current = this.#current();
        if (current.sessionId !== session.sessionId || current.profileId !== session.profileId ||
            current.revision !== session.revision) return fail('CONFLICT');
      };
      const record = vaultValue(await this.#vault.read(session.sessionId, recordId(binding)));
      guard();
      const change = work(decode(record, binding), session.profileId);
      // Even a read checks persisted freshness. The vault checks this lease again at its atomic CAS boundary.
      vaultValue(await this.#vault.commit(session.sessionId, session.revision, change.changed === null ? []
        : [{ op: 'put', record: encode(binding, change.changed) }], signal, guard));
      committed = change.changed !== null;
      this.#current(); checkSignal(signal);
      return { ok: true, value: change.value };
    } catch (error) {
      // A lock/cancel after the CAS must not claim that the durable marker was never written.
      return refused(committed ? 'UNAVAILABLE' : failureCode(error, 'UNAVAILABLE'), operationId);
    } finally { this.#busy = false; }
  }

  read(binding: TradeBinding, signal?: AbortSignal): Promise<CoreResult<SolanaJournalSnapshot>> {
    return this.#run(binding, signal, state => ({ changed: null,
      value: state.version === 2 ? snapshotV2(state)
        : Object.freeze({ revision: state.revision, records: Object.freeze([...state.records]) }) }));
  }
  write(
    binding: TradeBinding, expectedRevision: number, record: SolanaIntentRecord, signal?: AbortSignal,
  ): Promise<CoreResult<number>> {
    let copy: SolanaIntentRecord, expected: number, bound: TradeBinding;
    try {
      // Copy all caller-owned data before the first await. Accessors are rejected by the canonical parsers.
      bound = parseSolanaBinding(binding); expected = revision(expectedRevision); copy = parseSolanaIntent(record);
      if (!sameBinding(copy.binding, bound)) return Promise.resolve(refused('CONFLICT'));
    } catch (error) { return Promise.resolve(refused(failureCode(error, 'INVALID_INPUT'))); }
    return this.#run(bound, signal, (state, profileId) => {
      if (state.version !== 1) return fail('UNSUPPORTED_VERSION');
      if (state.revision !== expected) return fail('CONFLICT');
      const changed = upsert(state, copy, profileId);
      return { changed, value: changed.revision };
    });
  }

  /** Explicit, all-record migration; even an empty trade receives a persistent high-water mark. */
  migrate(
    binding: TradeBinding, expectedRevision: number, signal?: AbortSignal
  ): Promise<CoreResult<SolanaJournalSnapshotV2>> {
    let bound: TradeBinding, expected: number;
    try { bound = parseSolanaBinding(binding); expected = revision(expectedRevision); }
    catch (error) { return Promise.resolve(refused(failureCode(error, 'INVALID_INPUT'))); }
    return this.#run(bound, signal, state => {
      if (state.version !== 1 || state.revision !== expected) return fail('CONFLICT');
      if (state.revision > Number.MAX_SAFE_INTEGER - (state.records.length + 1)) return fail('LIMIT_EXCEEDED');
      const references = new Map(state.records.map((intent, index) => [intent.intentId, Object.freeze({
        originProfileId: intent.originProfileId, intentId: intent.intentId, generation: state.revision + index + 1,
      })]));
      const entries = state.records.map(intent => ({ generation: references.get(intent.intentId)!.generation,
        intent, replaces: intent.replacementOf === null ? null
          : references.get(intent.replacementOf) ?? fail('INTEGRITY_FAILURE') }));
      const current = state.revision + state.records.length + 1;
      const changed: StateV2 = { version: 2, revision: current,
        entries: parseReservationEntries(entries, bound, current) };
      return { changed, value: snapshotV2(changed) };
    });
  }

  reserve(
    binding: TradeBinding, expectedRevision: number, prepared: SolanaIntentRecord,
    replaces: SolanaReservationRef | null, retire: SolanaReservationRef | null, signal?: AbortSignal,
  ): Promise<CoreResult<SolanaReservedIntent>> {
    let bound: TradeBinding, expected: number, copy: SolanaIntentRecord;
    let predecessor: SolanaReservationRef | null, candidate: SolanaReservationRef | null;
    try {
      bound = parseSolanaBinding(binding); expected = revision(expectedRevision); copy = parseSolanaIntent(prepared);
      predecessor = replaces === null ? null : parseReservationRef(replaces);
      candidate = retire === null ? null : parseReservationRef(retire);
      if (!sameBinding(copy.binding, bound)) return Promise.resolve(refused('CONFLICT'));
    } catch (error) { return Promise.resolve(refused(failureCode(error, 'INVALID_INPUT'))); }
    return this.#run(bound, signal, (state, profileId) => {
      if (state.version !== 2) return fail('UNSUPPORTED_VERSION');
      if (state.revision !== expected) return fail('CONFLICT');
      if (state.revision === Number.MAX_SAFE_INTEGER) return fail('LIMIT_EXCEEDED');
      if (copy.state !== 'prepared' || copy.originProfileId !== profileId || copy.updatedAt !== copy.createdAt) {
        return fail('CONFLICT');
      }
      // Check all original records, including the proposed retirement target, before making capacity.
      admitIntentWithoutCapacity(state.entries.map(entry => entry.intent), copy);
      if ((copy.replacementOf === null) !== (predecessor === null)) return fail('CONFLICT');
      if (predecessor !== null) {
        const original = state.entries.find(entry => sameReservationRef(identityFromEntry(entry), predecessor!));
        if (!original || original.intent.intentId !== copy.replacementOf || original.intent.state !== 'dropped' ||
            original.intent.action !== copy.action) return fail('CONFLICT');
      }
      let retained = state.entries;
      if (retained.length === MAX_INTENTS_PER_TRADE) {
        if (candidate === null) return fail('LIMIT_EXCEEDED');
        const retiring = retained.find(entry => sameReservationRef(identityFromEntry(entry), candidate!));
        if (!retiring || !eligibleForRetirement(retained, retiring, profileId)) return fail('CONFLICT');
        retained = retained.filter(entry => entry !== retiring);
      } else if (candidate !== null) return fail('CONFLICT');
      const generation = state.revision + 1;
      const entries = [...retained, { generation, intent: copy, replaces: predecessor }]
        .sort((a, b) => ordered(a.intent, b.intent));
      const changed: StateV2 = { version: 2, revision: generation,
        entries: parseReservationEntries(entries, bound, generation) };
      const created = changed.entries.find(entry => entry.generation === generation)!;
      return { changed, value: Object.freeze({ identity: identityFromEntry(created), record: created.intent,
        revision: generation }) };
    });
  }

  update(
    binding: TradeBinding, expectedRevision: number, identity: SolanaReservationIdentity,
    next: SolanaIntentRecord, signal?: AbortSignal,
  ): Promise<CoreResult<number>> {
    let bound: TradeBinding, expected: number, captured: SolanaReservationIdentity, copy: SolanaIntentRecord;
    try {
      bound = parseSolanaBinding(binding); expected = revision(expectedRevision);
      captured = parseReservationIdentity(identity); copy = parseSolanaIntent(next);
      if (!sameBinding(copy.binding, bound) || !sameBinding(captured.binding, bound) ||
          captured.intentId !== copy.intentId || captured.originProfileId !== copy.originProfileId) {
        return Promise.resolve(refused('CONFLICT'));
      }
    } catch (error) { return Promise.resolve(refused(failureCode(error, 'INVALID_INPUT'))); }
    return this.#run(bound, signal, (state, profileId) => {
      if (state.version !== 2) return fail('UNSUPPORTED_VERSION');
      if (state.revision !== expected) return fail('CONFLICT');
      if (state.revision === Number.MAX_SAFE_INTEGER) return fail('LIMIT_EXCEEDED');
      const previous = state.entries.find(entry => sameReservationRef(identityFromEntry(entry), captured));
      if (!previous) return fail('CONFLICT');
      if ((copy.state === 'signed' || copy.state === 'sendMarked') && copy.originProfileId !== profileId)
        return fail('CONFLICT');
      checkTransition(previous.intent, copy, profileId);
      const current = state.revision + 1;
      const entries = state.entries.map(entry => entry === previous ? { ...entry, intent: copy } : entry);
      const changed: StateV2 = { version: 2, revision: current,
        entries: parseReservationEntries(entries, bound, current) };
      return { changed, value: current };
    });
  }
  dispose(): void { this.#closed = true; this.#lease.dispose(); }
}
