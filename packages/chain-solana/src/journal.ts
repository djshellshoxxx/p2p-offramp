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
import type { CoreErrorCode, CoreResult, TradeBinding } from '../../schemas/index.ts';
import type { BoundSolanaTrade } from './bind.ts';
import { fail, SolanaFailure } from './codec.ts';
import {
  isTerminal, parseSolanaIntent, UNKNOWN_ORIGIN, verifyIntentForTrade, type SolanaIntentRecord,
} from './intent.ts';

export const MAX_INTENTS_PER_TRADE = 32;
export interface SolanaJournalSnapshot { readonly revision: number; readonly records: readonly unknown[] }
export interface SolanaJournalPort {
  profileId(): string;
  read(binding: TradeBinding, signal?: AbortSignal): Promise<CoreResult<SolanaJournalSnapshot>>;
  write(binding: TradeBinding, expectedRevision: number, record: SolanaIntentRecord, signal?: AbortSignal):
    Promise<CoreResult<number>>;
}
export interface LoadedIntents { readonly revision: number; readonly records: readonly SolanaIntentRecord[] }

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
  const revision = revisionOf(own(raw, 'revision')), list = own(raw, 'records');
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
  return Object.freeze({ revision, records: Object.freeze(records) });
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

/**
 * A new intent may join a trade only when every stored record is terminal. A rebuild after a definitive drop must
 * name the dropped intent of the same action (`replacementOf`), and each dropped intent has at most one successor.
 */
export function admitIntent(records: readonly SolanaIntentRecord[], next: SolanaIntentRecord): void {
  if (records.length >= MAX_INTENTS_PER_TRADE) return fail('LIMIT_EXCEEDED');
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
