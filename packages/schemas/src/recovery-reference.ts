/** Offline G12 inspection projection. Stored labels and transaction references are never native authority. */
import { parseTradeBinding, type TradeBinding } from './core.ts';
import { decodeIntentPayload, parseIntentAccount, parseIntentId, intentData, type IntentState } from './intent.ts';
import { MAX_RECORDS, MAX_REVISION, type PrivateRecordV1 } from './vault.ts';
export const RECOVERY_REFERENCE_PAGE_SIZE = 64;
export const MAX_RECOVERY_REFERENCE_EXPORT_BYTES = 128 * 1024;
export interface RuntimeRecoveryReference {
  readonly recordId: string; readonly intentId: string; readonly binding: TradeBinding; readonly account: string;
  readonly action: 'approve' | 'fund' | 'release' | 'refund'; readonly storedState: IntentState;
  /** Public chain transaction hash / Solana transaction-signature ID, never an acceptance signature or signed transaction. */
  readonly chainReference: string | null; readonly nonce: string | null;
}
export interface RuntimeRecoveryReferences {
  readonly authority: 'unverified-offline-reference'; readonly revision: number; readonly offset: number; readonly nextOffset: number | null;
  readonly totalJournalRecords: number; readonly unsupported: number; readonly items: readonly RuntimeRecoveryReference[];
}
const states = Object.freeze(['prepared', 'broadcast-unknown', 'pending', 'confirmed', 'finalized', 'failed', 'reorged', 'expired', 'replaced'] as const);
const invalid = (): never => { throw new Error('Invalid offline recovery reference.'); };
const count = (value: unknown, max: number): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : invalid();
export function parseRecoveryOffset(value: unknown): number { const n = count(value, MAX_RECORDS); return n % RECOVERY_REFERENCE_PAGE_SIZE === 0 ? n : invalid(); }
export function parseRecoveryRevision(value: unknown): number { return count(value, MAX_REVISION); }
function parseReference(value: unknown): RuntimeRecoveryReference {
  const raw = intentData(value, ['recordId', 'intentId', 'binding', 'account', 'action', 'storedState', 'chainReference', 'nonce']);
  if (typeof raw.recordId !== 'string' || !/^[0-9a-f]{32}$/.test(raw.recordId)) return invalid();
  const binding = parseTradeBinding(raw.binding), account = parseIntentAccount(raw.account, binding.chain), intentId = parseIntentId(raw.intentId);
  if (raw.action !== 'approve' && raw.action !== 'fund' && raw.action !== 'release' && raw.action !== 'refund' || !states.includes(raw.storedState as IntentState)) return invalid();
  if (raw.chainReference !== null && (typeof raw.chainReference !== 'string' || !(binding.chain === 'evm' ? /^0x[0-9a-f]{64}$/ : /^[1-9A-HJ-NP-Za-km-z]{64,88}$/).test(raw.chainReference))) return invalid();
  if (raw.nonce !== null && (binding.chain !== 'evm' || typeof raw.nonce !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(raw.nonce))) return invalid();
  return Object.freeze({ recordId: raw.recordId, intentId, binding, account, action: raw.action, storedState: raw.storedState as IntentState, chainReference: raw.chainReference as string | null, nonce: raw.nonce as string | null });
}
export function parseRecoveryReferences(value: unknown): RuntimeRecoveryReferences {
  const raw = intentData(value, ['authority', 'revision', 'offset', 'nextOffset', 'totalJournalRecords', 'unsupported', 'items']);
  if (raw.authority !== 'unverified-offline-reference') return invalid();
  const revision = parseRecoveryRevision(raw.revision), offset = parseRecoveryOffset(raw.offset), total = count(raw.totalJournalRecords, MAX_RECORDS);
  const list = raw.items;
  if (offset > total || !Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(list, 'length'); if (!descriptor || !('value' in descriptor)) return invalid();
  const length = count(descriptor.value, RECOVERY_REFERENCE_PAGE_SIZE);
  const scanned = Math.min(RECOVERY_REFERENCE_PAGE_SIZE, total - offset), unsupported = count(raw.unsupported, scanned);
  if (Reflect.ownKeys(list).length !== length + 1 || length + unsupported !== scanned) return invalid();
  const items: RuntimeRecoveryReference[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(list, String(index)); if (!descriptor || !('value' in descriptor)) return invalid();
    items.push(parseReference(descriptor.value));
  }
  if (new Set(items.map(item => item.recordId)).size !== items.length) return invalid();
  const nextOffset = offset + scanned < total ? offset + scanned : null;
  if (raw.nextOffset !== nextOffset) return invalid();
  return Object.freeze({ authority: 'unverified-offline-reference', revision, offset, nextOffset, totalJournalRecords: total, unsupported, items: Object.freeze(items) });
}
/** Only authenticated G02 records enter; failed/future consumer records stay opaque and are counted, never rewritten. */
export function projectRecoveryReferences(records: readonly PrivateRecordV1[], offset: number, revision: number): RuntimeRecoveryReferences {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) return invalid();
  const journal = records.filter(record => record.kind === 'journal');
  const start = parseRecoveryOffset(offset), current = parseRecoveryRevision(revision);
  if (journal.length > MAX_RECORDS || start > journal.length) return invalid();
  const selected = journal.slice(start, start + RECOVERY_REFERENCE_PAGE_SIZE), items: RuntimeRecoveryReference[] = []; let unsupported = 0;
  for (const record of selected) {
    try {
      if (record.schemaVersion !== 1) throw Error();
      const intent = decodeIntentPayload(record.payload);
      items.push(parseReference({ recordId: record.id, intentId: intent.intentId, binding: intent.binding, account: intent.account, action: intent.action, storedState: intent.state,
        chainReference: intent.submission.chain === 'evm' ? intent.submission.hash : intent.submission.signature, nonce: intent.submission.chain === 'evm' ? intent.submission.nonce : null }));
    } catch { unsupported++; }
  }
  return parseRecoveryReferences({ authority: 'unverified-offline-reference', revision: current, offset: start, nextOffset: start + selected.length < journal.length ? start + selected.length : null,
    totalJournalRecords: journal.length, unsupported, items });
}
