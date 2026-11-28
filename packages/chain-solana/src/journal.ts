/**
 * Injected journal port for Solana intents. The app implements it inside the encrypted vault (packages/storage);
 * this package never stores anything itself. Semantics:
 *
 * - One compare-and-swap revision per trade binding. `write` upserts one record (keyed by `intentId`) only while
 *   the binding's stored revision equals `expectedRevision`, and returns the new, larger revision. Every write of
 *   any record of the trade bumps it, so two tabs can never both reserve, mark or settle from the same snapshot.
 * - Records come back as untrusted data and are re-validated (`parseSolanaIntent` + `verifyIntentForTrade`).
 * - `profileId` names the vault profile; a backup restore yields a different id, so restored records are never
 *   treated as this profile's own never-sent preparations. It must be 32 lowercase hex and not all zero.
 * - A write whose outcome is unknown (thrown, TIMEOUT, UNAVAILABLE, CANCELLED) is reported as uncertain; callers
 *   never send after an uncertain marker write.
 */
import { sameBinding, type CoreErrorCode, type CoreResult, type TradeBinding } from '../../schemas/index.ts';
import type { BoundSolanaTrade } from './bind.ts';
import { fail, SolanaFailure } from './codec.ts';
import {
  exactData, isTerminal, parseSolanaIntent, UNKNOWN_ORIGIN, verifyIntentForTrade, type SolanaIntentRecord,
} from './intent.ts';
import {
  identityFromEntry, MAX_INTENTS_PER_TRADE, parseReservationEntries, parseReservationIdentity,
  parseReservationRef, selectRetirementCandidate, type SolanaReservationEntry, type SolanaReservationIdentity,
  type SolanaReservationRef, type SolanaReservedIntent,
} from './reservation.ts';
export {
  MAX_INTENTS_PER_TRADE, parseReservationIdentity, parseReservationRef, reservationRef, sameReservationIdentity,
  type SolanaReservationEntry, type SolanaReservationIdentity, type SolanaReservationRef, type SolanaReservedIntent,
} from './reservation.ts';

export interface SolanaJournalSnapshotV1 { readonly revision: number; readonly records: readonly unknown[] }
export interface SolanaJournalSnapshotV2 {
  readonly version: 2; readonly revision: number; readonly entries: readonly unknown[];
}
export type SolanaJournalSnapshot = SolanaJournalSnapshotV1 | SolanaJournalSnapshotV2;
export interface SolanaJournalPort {
  profileId(): string;
  read(binding: TradeBinding, signal?: AbortSignal): Promise<CoreResult<SolanaJournalSnapshot>>;
  write(binding: TradeBinding, expectedRevision: number, record: SolanaIntentRecord, signal?: AbortSignal):
    Promise<CoreResult<number>>;
  reserve?(binding: TradeBinding, expectedRevision: number, prepared: SolanaIntentRecord,
    replaces: SolanaReservationRef | null, retire: SolanaReservationRef | null, signal?: AbortSignal):
    Promise<CoreResult<SolanaReservedIntent>>;
  update?(binding: TradeBinding, expectedRevision: number, identity: SolanaReservationIdentity,
    next: SolanaIntentRecord, signal?: AbortSignal): Promise<CoreResult<number>>;
  migrate?(binding: TradeBinding, expectedRevision: number, signal?: AbortSignal):
    Promise<CoreResult<SolanaJournalSnapshotV2>>;
}
export interface LoadedIntents {
  readonly version: 1 | 2; readonly revision: number; readonly records: readonly SolanaIntentRecord[];
  readonly reservations: readonly SolanaReservationEntry[];
}

function supportsV2Writes(journal: SolanaJournalPort): boolean {
  return typeof journal.reserve === 'function' && typeof journal.update === 'function';
}
/** Migration is usable only when the same port can reserve and update the resulting v2 records. */
export function supportsJournalMigration(journal: SolanaJournalPort): boolean {
  return supportsV2Writes(journal) && typeof journal.migrate === 'function';
}

const CODES: readonly CoreErrorCode[] = ['INVALID_INPUT', 'UNSUPPORTED_VERSION', 'UNSUPPORTED_PROVIDER',
  'WRONG_CHAIN', 'UNAUTHORIZED', 'USER_REJECTED', 'LOCKED', 'CONFLICT', 'UNAVAILABLE', 'TIMEOUT', 'CANCELLED',
  'LIMIT_EXCEEDED', 'INTEGRITY_FAILURE', 'BROADCAST_UNKNOWN', 'EXPIRED'];
const UNCERTAIN: readonly CoreErrorCode[] = ['UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'BROADCAST_UNKNOWN'];

/** Raised when a journal write may or may not have committed. */
export class UncertainWrite extends SolanaFailure {
  constructor() { super('UNAVAILABLE'); this.name = 'UncertainWrite'; }
}

function own(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null) return fail();
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}
/** A CoreResult from injected code, read through own data properties; foreign error detail is dropped. */
function portValue(result: unknown): unknown {
  const ok = own(result, 'ok');
  if (ok === true) return own(result, 'value');
  if (ok !== false) return fail();
  const code = own(own(result, 'error'), 'code');
  return fail(CODES.includes(code as CoreErrorCode) ? code as CoreErrorCode : 'UNAVAILABLE');
}
function revisionOf(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) return fail();
  return input;
}
function optionalOwn(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null) return fail();
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field) return undefined;
    if (!('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}

export function checkedProfileId(journal: SolanaJournalPort): string {
  let id: unknown;
  try { id = journal.profileId(); } catch { return fail('LOCKED'); }
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id) || id === UNKNOWN_ORIGIN) return fail('LOCKED');
  return id;
}

/** Reads, validates and binds every record of one trade; duplicates or foreign records fail closed. */
export async function loadIntents(
  journal: SolanaJournalPort, trade: BoundSolanaTrade, signal?: AbortSignal,
): Promise<LoadedIntents> {
  let raw: unknown;
  try { raw = portValue(await journal.read(trade.binding, signal)); } catch (error) {
    if (error instanceof SolanaFailure) throw error;
    return fail('UNAVAILABLE');
  }
  return loadedSnapshot(raw, trade);
}

function loadedSnapshot(raw: unknown, trade: BoundSolanaTrade): LoadedIntents {
  const version = optionalOwn(raw, 'version');
  const revision = revisionOf(own(raw, 'revision'));
  if (version !== undefined && version !== 2) return fail('UNSUPPORTED_VERSION');
  if (version === 2) {
    const snapshot = exactData(raw, ['version', 'revision', 'entries']);
    const reservations = parseReservationEntries(snapshot.entries, trade.binding, revision);
    const records = Object.freeze(reservations.map(entry => entry.intent));
    for (const record of records) verifyIntentForTrade(record, trade);
    return Object.freeze({ version: 2, revision, records, reservations });
  }
  const list = own(raw, 'records');
  if (!Array.isArray(list) || list.length > MAX_INTENTS_PER_TRADE) return fail('INTEGRITY_FAILURE');
  const records: SolanaIntentRecord[] = [], ids = new Set<string>();
  for (let index = 0; index < list.length; index++) {
    let record: SolanaIntentRecord;
    try { record = parseSolanaIntent(own(list, String(index))); } catch (error) {
      return fail(error instanceof SolanaFailure && error.code === 'UNSUPPORTED_VERSION'
        ? 'UNSUPPORTED_VERSION' : 'INTEGRITY_FAILURE');
    }
    verifyIntentForTrade(record, trade);
    if (ids.has(record.intentId)) return fail('INTEGRITY_FAILURE');
    ids.add(record.intentId);
    records.push(record);
  }
  return Object.freeze({ version: 1, revision, records: Object.freeze(records), reservations: Object.freeze([]) });
}

/** Only a record from this validated snapshot can yield its identity; never upgrade a cached old handle. */
export function identityForRecord(loaded: LoadedIntents, record: SolanaIntentRecord): SolanaReservationIdentity | null {
  if (!loaded.records.includes(record)) return fail('INTEGRITY_FAILURE');
  if (loaded.version === 1) return null;
  const entry = loaded.reservations.find(candidate => candidate.intent === record);
  if (!entry) return fail('INTEGRITY_FAILURE');
  return identityFromEntry(entry);
}
export function chooseRetirementCandidate(loaded: LoadedIntents, profileId: string): SolanaReservationRef | null {
  return loaded.version === 2 ? selectRetirementCandidate(loaded.reservations, profileId) : null;
}

/** One CAS write. CONFLICT means another writer won; an `UncertainWrite` means the outcome is unknown. */
export async function storeIntent(
  journal: SolanaJournalPort, trade: BoundSolanaTrade, expectedRevision: number, record: SolanaIntentRecord,
  signal?: AbortSignal,
): Promise<number> {
  let raw: unknown;
  try { raw = await journal.write(trade.binding, expectedRevision, record, signal); } catch {
    throw new UncertainWrite();
  }
  let next: number;
  try { next = revisionOf(portValue(raw)); } catch (error) {
    const code = error instanceof SolanaFailure ? error.code : 'UNAVAILABLE';
    if (UNCERTAIN.includes(code)) throw new UncertainWrite();
    throw error;
  }
  if (next <= expectedRevision) return fail('INTEGRITY_FAILURE');
  return next;
}

async function v2Write(work: () => Promise<unknown>): Promise<unknown> {
  let raw: unknown;
  try { raw = await work(); } catch { throw new UncertainWrite(); }
  try { return portValue(raw); } catch (error) {
    const code = error instanceof SolanaFailure ? error.code : 'UNAVAILABLE';
    if (UNCERTAIN.includes(code)) throw new UncertainWrite();
    throw error;
  }
}

/** V2 reservation is the sole insertion path; identity comes from its successful durable allocation. */
export async function reserveIntentV2(
  journal: SolanaJournalPort, trade: BoundSolanaTrade, expectedRevision: number, prepared: SolanaIntentRecord,
  replaces: SolanaReservationRef | null, retire: SolanaReservationRef | null, signal?: AbortSignal,
): Promise<SolanaReservedIntent> {
  if (!supportsV2Writes(journal)) return fail('UNSUPPORTED_VERSION');
  const expected = revisionOf(expectedRevision), record = parseSolanaIntent(prepared);
  const predecessor = replaces === null ? null : parseReservationRef(replaces);
  const candidate = retire === null ? null : parseReservationRef(retire);
  verifyIntentForTrade(record, trade);
  if (expected === Number.MAX_SAFE_INTEGER) return fail('LIMIT_EXCEEDED');
  const raw = exactData(await v2Write(() => journal.reserve!(trade.binding, expected, record, predecessor, candidate, signal)),
    ['identity', 'record', 'revision']);
  const identity = parseReservationIdentity(raw.identity), stored = parseSolanaIntent(raw.record), revision = revisionOf(raw.revision);
  verifyIntentForTrade(stored, trade);
  if (revision !== expected + 1 || identity.generation !== revision || !sameBinding(identity.binding, trade.binding) ||
      identity.intentId !== stored.intentId || identity.originProfileId !== stored.originProfileId ||
      JSON.stringify(stored) !== JSON.stringify(record)) return fail('INTEGRITY_FAILURE');
  return Object.freeze({ identity, record: stored, revision });
}

/** A freshly loaded write revision never replaces the caller's captured reservation identity. */
export async function storeIntentV2(
  journal: SolanaJournalPort, trade: BoundSolanaTrade, expectedRevision: number,
  identity: SolanaReservationIdentity, next: SolanaIntentRecord, signal?: AbortSignal,
): Promise<number> {
  if (typeof journal.update !== 'function') return fail('UNSUPPORTED_VERSION');
  const expected = revisionOf(expectedRevision), captured = parseReservationIdentity(identity), record = parseSolanaIntent(next);
  verifyIntentForTrade(record, trade);
  if (!sameBinding(captured.binding, trade.binding) || captured.intentId !== record.intentId ||
      captured.originProfileId !== record.originProfileId || captured.generation > expected) return fail('CONFLICT');
  if (expected === Number.MAX_SAFE_INTEGER) return fail('LIMIT_EXCEEDED');
  const revision = revisionOf(await v2Write(() => journal.update!(trade.binding, expected, captured, record, signal)));
  if (revision !== expected + 1) return fail('INTEGRITY_FAILURE');
  return revision;
}

/** Explicit migration only; never retry or invoke a wallet after an uncertain result. */
export async function migrateIntents(
  journal: SolanaJournalPort, trade: BoundSolanaTrade, expectedRevision: number, signal?: AbortSignal,
): Promise<LoadedIntents> {
  if (!supportsJournalMigration(journal)) return fail('UNSUPPORTED_VERSION');
  const expected = revisionOf(expectedRevision);
  // Full trade verification happens before mutation; the same embedded revision is required at the vault CAS.
  const previous = await loadIntents(journal, trade, signal);
  if (previous.version !== 1 || previous.revision !== expected) return fail('CONFLICT');
  if (expected > Number.MAX_SAFE_INTEGER - (previous.records.length + 1)) return fail('LIMIT_EXCEEDED');
  if (!supportsJournalMigration(journal)) return fail('UNSUPPORTED_VERSION');
  const loaded = loadedSnapshot(await v2Write(() => journal.migrate!(trade.binding, expected, signal)), trade);
  if (loaded.version !== 2 || expected > Number.MAX_SAFE_INTEGER - (loaded.records.length + 1) ||
      loaded.revision !== expected + loaded.records.length + 1 ||
      JSON.stringify(loaded.records) !== JSON.stringify(previous.records) ||
      loaded.reservations.some((entry, index) => entry.generation !== expected + index + 1)) {
    return fail('INTEGRITY_FAILURE');
  }
  return loaded;
}

/**
 * A new intent may join a trade only when every stored record is terminal. A rebuild after a definitive drop must
 * name the dropped intent of the same action (`replacementOf`), and each dropped intent has at most one successor.
 */
export function admitIntent(records: readonly SolanaIntentRecord[], next: SolanaIntentRecord): void {
  if (records.length >= MAX_INTENTS_PER_TRADE) return fail('LIMIT_EXCEEDED');
  admitIntentWithoutCapacity(records, next);
}

/** Check complete pre-retirement history, without changing the ordinary v1 capacity rule. */
export function admitIntentWithoutCapacity(records: readonly SolanaIntentRecord[], next: SolanaIntentRecord): void {
  if (records.some(record => !isTerminal(record) || record.intentId === next.intentId)) return fail('CONFLICT');
  const latest = records.filter(record => record.action === next.action)
    .sort((a, b) => a.createdAt - b.createdAt).at(-1);
  const successors = new Set(records.map(record => record.replacementOf).filter(id => id !== null));
  if (next.replacementOf !== null) {
    const original = records.find(record => record.intentId === next.replacementOf);
    if (!original || original.state !== 'dropped' || original.action !== next.action ||
        successors.has(original.intentId)) return fail('CONFLICT');
  } else if (latest?.state === 'dropped' && !successors.has(latest.intentId)) return fail('CONFLICT');
}
