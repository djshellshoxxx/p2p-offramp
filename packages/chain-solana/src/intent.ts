/**
 * Solana intent record: the journal entry for one signed escrow message, kept in the encrypted vault through an
 * injected journal port. Restored or imported records are untrusted input: `parseSolanaIntent` checks every field
 * and invariant, and `verifyIntentForTrade` binds a record to one trade, registry deployment and exact message.
 *
 * States (D9 semantics, Solana-native):
 *   prepared  message built and journaled; nothing signed yet (signature null)
 *   signed    wallet output validated; signature (= transaction id) known; not handed to any RPC by this client
 *   sendMarked  durable send marker written (CAS, before the broadcast); never cleared
 *   sent      the RPC accepted the broadcast and answered this signature (not evidence of landing)
 *   unknown   the broadcast call threw, timed out or answered something else; outcome uncertain
 *   finalized landed at finalized commitment without error (corroborated by a finalized escrow read)
 *   failed    landed at finalized commitment with an error (`outcome.err`)
 *   dropped   finalized block height > lastValidBlockHeight and no status: it can never land
 *   cancelled never marked and known not sent by this profile (local cancel before the marker)
 */
import { parseIntentId, parseTradeBinding, type TradeBinding } from '../../schemas/index.ts';
import type { BoundSolanaTrade } from './bind.ts';
import { parseSolanaBinding } from './bind.ts';
import { canonicalKey, decimalU64, decodeBase64, encodeBase58, fail } from './codec.ts';
import { MAX_TRANSACTION_BYTES, parseLegacyMessage } from './message.ts';
import {
  roleKey, verifyPlanMessage, type ExpectedEscrowState, type SolanaAction, type SolanaRole,
} from './plan.ts';
import { decodeSignature, verifySignature } from './wallet.ts';

export const SOLANA_INTENT_FORMAT = 'p2p-offramp/solana-intent/v1';
export type SolanaIntentState =
  'prepared' | 'signed' | 'sendMarked' | 'sent' | 'unknown' | 'finalized' | 'failed' | 'dropped' | 'cancelled';
export const TERMINAL_STATES: readonly SolanaIntentState[] = Object.freeze(['finalized', 'failed', 'dropped',
  'cancelled']);
/** Origin of a record imported from a format without provenance; never a real profile id. */
export const UNKNOWN_ORIGIN = '0'.repeat(32);
export interface SolanaIntentOutcome { readonly slot: string; readonly err: string | null }
export interface SolanaIntentRecord {
  readonly format: typeof SOLANA_INTENT_FORMAT; readonly intentId: string; readonly binding: TradeBinding;
  readonly genesisHash: string; readonly programId: string; readonly programDataSha256: string;
  readonly escrow: string; readonly action: SolanaAction; readonly role: SolanaRole; readonly feePayer: string;
  readonly expectedEscrowState: ExpectedEscrowState; readonly message: string; readonly blockhash: string;
  readonly blockhashSlot: string; readonly lastValidBlockHeight: string; readonly signature: string | null;
  readonly state: SolanaIntentState; readonly sendMarkedAt: number | null; readonly outcome: SolanaIntentOutcome | null;
  readonly replacementOf: string | null; readonly originProfileId: string; readonly createdAt: number;
  readonly updatedAt: number;
}

/** Allowed state changes; everything else in a record is immutable except as `transitionIntent` permits. */
export const SOLANA_TRANSITIONS: Readonly<Record<SolanaIntentState, readonly SolanaIntentState[]>> = Object.freeze({
  prepared: Object.freeze(['signed', 'cancelled', 'dropped'] as const),
  signed: Object.freeze(['sendMarked', 'cancelled', 'finalized', 'failed', 'dropped'] as const),
  sendMarked: Object.freeze(['sent', 'unknown', 'finalized', 'failed', 'dropped'] as const),
  sent: Object.freeze(['finalized', 'failed', 'dropped'] as const),
  unknown: Object.freeze(['finalized', 'failed', 'dropped'] as const),
  finalized: Object.freeze([] as const), failed: Object.freeze([] as const), dropped: Object.freeze([] as const),
  cancelled: Object.freeze([] as const),
});
const STATES = Object.keys(SOLANA_TRANSITIONS) as SolanaIntentState[];
const KEYS = Object.freeze(['format', 'intentId', 'binding', 'genesisHash', 'programId', 'programDataSha256',
  'escrow', 'action', 'role', 'feePayer', 'expectedEscrowState', 'message', 'blockhash', 'blockhashSlot',
  'lastValidBlockHeight', 'signature', 'state', 'sendMarkedAt', 'outcome', 'replacementOf', 'originProfileId',
  'createdAt', 'updatedAt']);
const EXPECTED: Readonly<Record<SolanaAction, readonly ExpectedEscrowState[]>> = Object.freeze({
  fund: ['absent'], release: ['funded'], refund: ['funded'], payout: ['released', 'refunded'],
});
const ROLES: Readonly<Record<SolanaAction, readonly SolanaRole[]>> = Object.freeze({
  fund: ['seller'], release: ['seller'], refund: ['seller'], payout: ['seller', 'buyer'],
});
/** Compact transaction error label written by `summarizeTransactionError` (submit.ts). */
export const ERROR_LABEL = /^[A-Za-z]{1,64}(?::[0-9]{1,3}:(?:Custom:[0-9]{1,10}|[A-Za-z]{1,64}))?$/;
const MAX_MESSAGE_BASE64 = Math.ceil(MAX_TRANSACTION_BYTES / 3) * 4;

/** Exactly `keys` as own data properties of a plain object, copied without invoking accessors. */
export function exactData(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('INVALID_INPUT');
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail('INVALID_INPUT');
    const own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) {
      return fail('INVALID_INPUT');
    }
    const copy = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(input, key);
      if (!field || !('value' in field)) return fail('INVALID_INPUT');
      copy[key] = field.value;
    }
    return copy;
  } catch { return fail('INVALID_INPUT'); }
}
function choice<T extends string>(input: unknown, allowed: readonly T[]): T {
  if (typeof input !== 'string' || !allowed.includes(input as T)) return fail('INVALID_INPUT');
  return input as T;
}
function counter(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) return fail('INVALID_INPUT');
  return input;
}
function decimal(input: unknown): string { decimalU64(input); return input as string; }
function intentId(input: unknown): string {
  try { return parseIntentId(input); } catch { return fail('INVALID_INPUT'); }
}
function hash64(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9a-f]{64}$/.test(input)) return fail('INVALID_INPUT');
  return input;
}
function outcomeOf(input: unknown): SolanaIntentOutcome | null {
  if (input === null) return null;
  const raw = exactData(input, ['slot', 'err']);
  if (raw.err !== null && (typeof raw.err !== 'string' || !ERROR_LABEL.test(raw.err))) return fail('INVALID_INPUT');
  return Object.freeze({ slot: decimal(raw.slot), err: raw.err as string | null });
}
function messageBytes(input: unknown): Uint8Array {
  try { return decodeBase64(input, MAX_MESSAGE_BASE64); } catch { return fail('INVALID_INPUT'); }
}

/** Per-state invariants of signature, marker and outcome. */
function checkState(record: SolanaIntentRecord): void {
  const { state, signature, sendMarkedAt, outcome } = record;
  const signed = signature !== null, marked = sendMarkedAt !== null;
  const ok = {
    prepared: !signed && !marked && outcome === null,
    signed: signed && !marked && outcome === null,
    sendMarked: signed && marked && outcome === null,
    sent: signed && marked && outcome === null,
    unknown: signed && marked && outcome === null,
    finalized: signed && outcome !== null && outcome.err === null,
    failed: signed && outcome !== null && outcome.err !== null,
    dropped: outcome === null,
    cancelled: !marked && outcome === null,
  }[state];
  if (!ok) return fail('INVALID_INPUT');
}

/** Structural and internal validation of one stored record (no registry or trade needed). */
export function parseSolanaIntent(input: unknown): SolanaIntentRecord {
  const raw = exactData(input, KEYS);
  if (raw.format !== SOLANA_INTENT_FORMAT) return fail('UNSUPPORTED_VERSION');
  let binding: TradeBinding;
  try { binding = parseSolanaBinding(parseTradeBinding(raw.binding)); } catch { return fail('INVALID_INPUT'); }
  const action = choice(raw.action, ['fund', 'release', 'refund', 'payout'] as const);
  const role = choice(raw.role, ROLES[action]);
  const expectedEscrowState = choice(raw.expectedEscrowState, EXPECTED[action]);
  const record: SolanaIntentRecord = Object.freeze({
    format: SOLANA_INTENT_FORMAT, intentId: intentId(raw.intentId), binding,
    genesisHash: canonicalKey(raw.genesisHash, 'INVALID_INPUT'),
    programId: canonicalKey(raw.programId, 'INVALID_INPUT'),
    programDataSha256: hash64(raw.programDataSha256), escrow: canonicalKey(raw.escrow, 'INVALID_INPUT'),
    action, role, feePayer: canonicalKey(raw.feePayer, 'INVALID_INPUT'), expectedEscrowState,
    message: raw.message as string, blockhash: canonicalKey(raw.blockhash, 'INVALID_INPUT'),
    blockhashSlot: decimal(raw.blockhashSlot), lastValidBlockHeight: decimal(raw.lastValidBlockHeight),
    signature: raw.signature === null ? null : encodeBase58(decodeSignature(raw.signature)),
    state: choice(raw.state, STATES), sendMarkedAt: raw.sendMarkedAt === null ? null : counter(raw.sendMarkedAt),
    outcome: outcomeOf(raw.outcome), replacementOf: raw.replacementOf === null ? null : intentId(raw.replacementOf),
    originProfileId: typeof raw.originProfileId === 'string' && /^[0-9a-f]{32}$/.test(raw.originProfileId)
      ? raw.originProfileId : fail('INVALID_INPUT'),
    createdAt: counter(raw.createdAt), updatedAt: counter(raw.updatedAt),
  });
  if (record.signature !== raw.signature || record.replacementOf === record.intentId) return fail('INVALID_INPUT');
  if (record.updatedAt < record.createdAt) return fail('INVALID_INPUT');
  if (record.sendMarkedAt !== null &&
      (record.sendMarkedAt < record.createdAt || record.sendMarkedAt > record.updatedAt)) return fail('INVALID_INPUT');
  checkState(record);
  const message = messageBytes(record.message);
  let parsed: ReturnType<typeof parseLegacyMessage>;
  try { parsed = parseLegacyMessage(message); } catch { return fail('INVALID_INPUT'); }
  if (parsed.accountKeys[0] !== record.feePayer || parsed.recentBlockhash !== record.blockhash ||
      parsed.header.numRequiredSignatures !== 1) return fail('INVALID_INPUT');
  if (record.signature !== null && !verifySignature(record.signature, message, record.feePayer)) {
    return fail('INTEGRITY_FAILURE');
  }
  return record;
}

/** Binds a parsed record to one trade: network, genesis, program, ProgramData pin, escrow, role and exact bytes. */
export function verifyIntentForTrade(record: SolanaIntentRecord, trade: BoundSolanaTrade): void {
  const binding = trade.binding;
  if (record.binding.networkId !== binding.networkId || record.binding.deploymentId !== binding.deploymentId ||
      record.binding.tradeId !== binding.tradeId) return fail('CONFLICT');
  if (record.genesisHash !== trade.network.genesisHash || record.programId !== trade.deployment.address) {
    return fail('WRONG_CHAIN');
  }
  const runtime = trade.deployment.runtime;
  if (runtime.kind !== 'solana-program' || record.programDataSha256 !== runtime.programDataSha256) {
    return fail('WRONG_CHAIN');
  }
  if (record.escrow !== trade.escrow.address || record.feePayer !== roleKey(trade, record.role)) {
    return fail('INTEGRITY_FAILURE');
  }
  verifyPlanMessage(trade, record.action, record.expectedEscrowState, record.feePayer, messageBytes(record.message));
}

export const isTerminal = (record: SolanaIntentRecord) => TERMINAL_STATES.includes(record.state);

/**
 * The next record for one transition. Only `state`, `updatedAt` (never backwards) and, once each, `signature`
 * (prepared -> signed), `sendMarkedAt` (signed -> sendMarked) and `outcome` (to finalized/failed) may change.
 */
export function transitionIntent(
  current: SolanaIntentRecord, state: SolanaIntentState, now: number,
  changes: { readonly signature?: string; readonly outcome?: SolanaIntentOutcome } = {},
): SolanaIntentRecord {
  if (!SOLANA_TRANSITIONS[current.state].includes(state)) return fail('CONFLICT');
  const updatedAt = Math.max(counter(now), current.updatedAt);
  const signature = changes.signature ?? current.signature;
  if (changes.signature !== undefined && (current.state !== 'prepared' || state !== 'signed')) return fail('CONFLICT');
  const sendMarkedAt = state === 'sendMarked' ? updatedAt : current.sendMarkedAt;
  const outcome = changes.outcome ?? current.outcome;
  return parseSolanaIntent({ ...current, binding: { ...current.binding }, state, signature, sendMarkedAt,
    outcome: outcome === null ? null : { ...outcome }, updatedAt });
}
