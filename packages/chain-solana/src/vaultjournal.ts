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
import { admitIntent, MAX_INTENTS_PER_TRADE, type SolanaJournalPort, type SolanaJournalSnapshot } from './journal.ts';

export const SOLANA_VAULT_JOURNAL_FORMAT = 'p2p-offramp/solana/vault-journal/v1';
type VaultPort = Pick<VaultService, 'read' | 'commit'> & VaultSessionAuthority;
interface State { readonly revision: number; readonly records: readonly SolanaIntentRecord[] }
interface Change<T> { readonly value: T; readonly changed: State | null }
const ordered = (a: SolanaIntentRecord, b: SolanaIntentRecord) =>
  a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0;
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
  const bytes = new TextEncoder().encode(JSON.stringify([SOLANA_VAULT_JOURNAL_FORMAT, binding.chain,
    binding.networkId, binding.deploymentId, binding.tradeId]));
  try { return hex(sha256(bytes).subarray(0, 16)); } finally { bytes.fill(0); }
}
/** Stable, domain-separated private-record id; the full binding is also checked inside the encrypted payload. */
export function solanaJournalRecordId(binding: TradeBinding): string { return recordId(parseSolanaBinding(binding)); }

function decode(record: PrivateRecordV1 | null, binding: TradeBinding): State {
  if (record === null) return { revision: 0, records: [] };
  let bytes: Uint8Array | undefined;
  try {
    const outer = exactData(record, ['id', 'kind', 'schemaVersion', 'payload']);
    if (outer.id !== recordId(binding) || outer.kind !== 'journal') return fail('INTEGRITY_FAILURE');
    if (outer.schemaVersion !== 1) return fail('UNSUPPORTED_VERSION');
    bytes = decodeBase64url(outer.payload, 1, MAX_PAYLOAD_BYTES);
    const raw = exactData(parseStrictJsonBytes(bytes, MAX_PAYLOAD_BYTES), ['format', 'binding', 'revision', 'records']);
    if (raw.format !== SOLANA_VAULT_JOURNAL_FORMAT) return fail('UNSUPPORTED_VERSION');
    if (!sameBinding(parseSolanaBinding(raw.binding), binding)) return fail('INTEGRITY_FAILURE');
    const current = revision(raw.revision);
    if (!Array.isArray(raw.records) || raw.records.length < 1 || raw.records.length > MAX_INTENTS_PER_TRADE ||
        current < raw.records.length) return fail('INTEGRITY_FAILURE');
    const records: SolanaIntentRecord[] = raw.records.map((input: unknown) => parseSolanaIntent(input));
    if (records.some((entry, index) => !sameBinding(entry.binding, binding) ||
        (index > 0 && ordered(records[index - 1]!, entry) >= 0)) ||
        records.filter(entry => !isTerminal(entry)).length > 1) return fail('INTEGRITY_FAILURE');
    return { revision: current, records: Object.freeze(records) };
  } catch (error) {
    return fail(failureCode(error, 'INTEGRITY_FAILURE') === 'UNSUPPORTED_VERSION'
      ? 'UNSUPPORTED_VERSION' : 'INTEGRITY_FAILURE');
  } finally { bytes?.fill(0); }
}
function encode(binding: TradeBinding, state: State): PrivateRecordV1 {
  const bytes = new TextEncoder().encode(JSON.stringify({ format: SOLANA_VAULT_JOURNAL_FORMAT,
    binding, revision: state.revision, records: state.records }));
  try {
    if (bytes.byteLength > MAX_PAYLOAD_BYTES) return fail('LIMIT_EXCEEDED');
    return { id: recordId(binding), kind: 'journal', schemaVersion: 1, payload: encodeBase64url(bytes) };
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
function upsert(state: State, next: SolanaIntentRecord, profileId: string): State {
  if (state.revision === Number.MAX_SAFE_INTEGER) return fail('LIMIT_EXCEEDED');
  const previous = state.records.find(record => record.intentId === next.intentId);
  if (previous) {
    if (next.state === 'cancelled' && previous.originProfileId !== profileId) return fail('CONFLICT');
    const changes = previous.state === 'prepared' && next.state === 'signed' ? { signature: next.signature! }
      : next.outcome === null ? {} : { outcome: next.outcome };
    const expected = transitionIntent(previous, next.state, next.updatedAt, changes);
    if (JSON.stringify(expected) !== JSON.stringify(next)) return fail('CONFLICT');
  } else {
    if (next.state !== 'prepared' || next.originProfileId !== profileId || next.updatedAt !== next.createdAt) {
      return fail('CONFLICT');
    }
    admitIntent(state.records, next);
  }
  const records = [...state.records.filter(record => record.intentId !== next.intentId), next].sort(ordered);
  return { revision: state.revision + 1, records: Object.freeze(records) };
}

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
      value: Object.freeze({ revision: state.revision, records: Object.freeze([...state.records]) }) }));
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
      if (state.revision !== expected) return fail('CONFLICT');
      const changed = upsert(state, copy, profileId);
      return { changed, value: changed.revision };
    });
  }
  dispose(): void { this.#closed = true; this.#lease.dispose(); }
}
