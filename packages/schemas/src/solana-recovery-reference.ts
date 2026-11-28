/**
 * Offline structural inspection of native Solana vault journals. This module imports only pure schemas and
 * never verifies a signature, contacts a provider, signs, submits or grants transaction authority. Full native
 * records remain in their encrypted payload; only one current scalar discovery hint leaves this parser.
 */
import { parseTradeBinding, sameBinding, type TradeBinding } from './core.ts';
import { intentData, parseIntentId } from './intent.ts';
import { parseStrictJsonBytes } from './registry.ts';
import { decodeBase64url, MAX_PAYLOAD_BYTES } from './vault.ts';

export const SOLANA_RECOVERY_STATES = Object.freeze(['prepared', 'signed', 'sendMarked', 'sent', 'unknown',
  'finalized', 'failed', 'dropped', 'cancelled'] as const);
export type SolanaRecoveryStoredState = typeof SOLANA_RECOVERY_STATES[number];
export interface SolanaJournalRecoveryHint {
  readonly intentId: string; readonly binding: TradeBinding; readonly account: string;
  readonly action: 'fund' | 'release' | 'refund' | 'payout'; readonly storedState: SolanaRecoveryStoredState;
  readonly chainReference: string | null; readonly nonce: null;
}
interface Inspected {
  readonly hint: SolanaJournalRecoveryHint; readonly updatedAt: number; readonly open: boolean;
  readonly originProfileId: string; readonly replacementOf: string | null;
}
interface ReservationRef { readonly generation: number; readonly originProfileId: string; readonly intentId: string }
interface InspectedEntry { readonly generation: number; readonly intent: Inspected; readonly replaces: ReservationRef | null }
const FIELDS = ['format', 'intentId', 'binding', 'genesisHash', 'programId', 'programDataSha256', 'escrow', 'action',
  'role', 'feePayer', 'expectedEscrowState', 'message', 'blockhash', 'blockhashSlot', 'lastValidBlockHeight', 'signature',
  'state', 'sendMarkedAt', 'outcome', 'replacementOf', 'originProfileId', 'createdAt', 'updatedAt'];
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const invalid = (): never => { throw Error('Invalid native Solana recovery hint.'); };
const counter = (input: unknown): number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0
  ? input : invalid();
function decimal(input: unknown): string {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(input) ||
      BigInt(input) > 18_446_744_073_709_551_615n) return invalid();
  return input;
}
function bindingOf(input: unknown): TradeBinding {
  const binding = parseTradeBinding(input);
  if (binding.chain !== 'solana' || binding.networkId.includes(':') || !/^[0-9a-f]{64}$/.test(binding.tradeId)) {
    return invalid();
  }
  return binding;
}
/** Canonical byte encoding only; this is not signature or ownership verification. */
function base58(input: unknown, length: 32 | 64): Uint8Array {
  if (typeof input !== 'string' || input.length < length || input.length > (length === 32 ? 44 : 88)) return invalid();
  let value = 0n;
  for (const char of input) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return invalid();
    value = value * 58n + BigInt(digit);
  }
  const leading = input.length - input.replace(/^1+/, '').length;
  const body = value === 0n ? 0 : Math.ceil(value.toString(16).length / 2);
  if (leading + body !== length) return invalid();
  const bytes = new Uint8Array(length);
  for (let index = length - 1; value > 0n; index--, value >>= 8n) bytes[index] = Number(value & 255n);
  return bytes;
}
function publicKey(input: unknown): string { base58(input, 32); return input as string; }

/** Legacy-message structural bounds and metadata consistency; no program/PDA/terms or cryptographic approval. */
function checkMessage(input: unknown, account: string, blockhash: string): void {
  if (typeof input !== 'string' || input.length < 4 || input.length > 1644 || input.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) return invalid();
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(input.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''), 1, 1232);
    const data = bytes;
    if (data[0] !== 1 || data[1] !== 0) return invalid();
    let at = 3;
    const short = () => {
      let value = 0;
      for (let shift = 0; shift <= 14; shift += 7) {
        const byte = data[at++];
        if (byte === undefined || shift === 14 && byte > 3) return invalid();
        value |= (byte & 127) << shift;
        if ((byte & 128) === 0) {
          if (shift !== 0 && byte === 0) return invalid();
          return value;
        }
      }
      return invalid();
    };
    const keys = short(), keyStart = at;
    if (keys < 1 || keys > 256 || data[2] === undefined || data[2] >= keys) return invalid();
    at += keys * 32;
    const hashStart = at; at += 32;
    if (at >= data.length || !base58(account, 32).every((byte, index) => data[keyStart + index] === byte) ||
        !base58(blockhash, 32).every((byte, index) => data[hashStart + index] === byte)) return invalid();
    const uniqueKeys = new Set<string>();
    for (let index = 0; index < keys; index++) {
      const key = data.subarray(keyStart + index * 32, keyStart + (index + 1) * 32).join(',');
      if (uniqueKeys.has(key)) return invalid();
      uniqueKeys.add(key);
    }
    const instructions = short();
    if (instructions < 1 || instructions > data.length) return invalid();
    for (let index = 0; index < instructions; index++) {
      const program = data[at++];
      if (program === undefined || program === 0 || program >= keys) return invalid();
      const accounts = short();
      if (accounts > data.length - at) return invalid();
      for (let i = 0; i < accounts; i++) if (data[at++]! >= keys) return invalid();
      const size = short();
      if (size > data.length - at) return invalid();
      at += size;
    }
    if (at !== data.length) return invalid();
  } finally { bytes?.fill(0); }
}
function inspect(input: unknown, binding: TradeBinding): Inspected {
  const raw = intentData(input, FIELDS);
  if (raw.format !== 'p2p-offramp/solana-intent/v1' || !sameBinding(bindingOf(raw.binding), binding)) return invalid();
  const intentId = parseIntentId(raw.intentId), account = publicKey(raw.feePayer), blockhash = publicKey(raw.blockhash);
  for (const field of ['genesisHash', 'programId', 'escrow']) publicKey(raw[field]);
  if (typeof raw.programDataSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.programDataSha256) ||
      typeof raw.originProfileId !== 'string' || !/^[0-9a-f]{32}$/.test(raw.originProfileId)) return invalid();
  decimal(raw.blockhashSlot); decimal(raw.lastValidBlockHeight);
  const replacementOf = raw.replacementOf === null ? null : parseIntentId(raw.replacementOf);
  if (replacementOf === intentId) return invalid();
  const action = raw.action;
  if (action !== 'fund' && action !== 'release' && action !== 'refund' && action !== 'payout') return invalid();
  if (raw.role !== 'seller' && !(action === 'payout' && raw.role === 'buyer')) return invalid();
  const expected = raw.expectedEscrowState;
  if (action === 'fund' ? expected !== 'absent' : action === 'payout'
    ? expected !== 'released' && expected !== 'refunded' : expected !== 'funded') return invalid();
  if (!SOLANA_RECOVERY_STATES.includes(raw.state as SolanaRecoveryStoredState)) return invalid();
  const state = raw.state as SolanaRecoveryStoredState, createdAt = counter(raw.createdAt), updatedAt = counter(raw.updatedAt);
  const marker = raw.sendMarkedAt === null ? null : counter(raw.sendMarkedAt);
  if (updatedAt < createdAt || marker !== null && (marker < createdAt || marker > updatedAt)) return invalid();
  const signature = raw.signature === null ? null : (base58(raw.signature, 64), raw.signature as string);
  let error: string | null | undefined;
  if (raw.outcome !== null) {
    const outcome = intentData(raw.outcome, ['slot', 'err']); decimal(outcome.slot);
    if (outcome.err !== null && (typeof outcome.err !== 'string' ||
        !/^[A-Za-z]{1,64}(?::[0-9]{1,3}:(?:Custom:[0-9]{1,10}|[A-Za-z]{1,64}))?$/.test(outcome.err))) return invalid();
    error = outcome.err as string | null;
  }
  const valid = {
    prepared: signature === null && marker === null && error === undefined,
    signed: signature !== null && marker === null && error === undefined,
    sendMarked: signature !== null && marker !== null && error === undefined,
    sent: signature !== null && marker !== null && error === undefined,
    unknown: signature !== null && marker !== null && error === undefined,
    finalized: signature !== null && error === null,
    failed: signature !== null && typeof error === 'string',
    dropped: error === undefined,
    cancelled: marker === null && error === undefined,
  }[state];
  if (!valid) return invalid();
  checkMessage(raw.message, account, blockhash);
  return { hint: Object.freeze({ intentId, binding, account, action, storedState: state,
    chainReference: signature, nonce: null }), updatedAt, originProfileId: raw.originProfileId, replacementOf,
  open: !['finalized', 'failed', 'dropped', 'cancelled'].includes(state) };
}

function generation(input: unknown, revision: number): number {
  const value = counter(input);
  return value > 0 && value <= revision ? value : invalid();
}
function reservationRef(input: unknown, revision: number): ReservationRef {
  const raw = intentData(input, ['originProfileId', 'intentId', 'generation']);
  if (typeof raw.originProfileId !== 'string' || !/^[0-9a-f]{32}$/.test(raw.originProfileId)) return invalid();
  return { originProfileId: raw.originProfileId, intentId: parseIntentId(raw.intentId),
    generation: generation(raw.generation, revision) };
}
/** Structural identity/graph consistency only. These values never leave the scalar discovery projection. */
function inspectEntries(input: unknown, binding: TradeBinding, revision: number): Inspected[] {
  // An empty migrated aggregate is valid storage, but has no recovery hint to project.
  if (!Array.isArray(input) || input.length < 1 || input.length > 32 || revision < 1) return invalid();
  const generations = new Set<number>();
  const entries: InspectedEntry[] = input.map(item => {
    const raw = intentData(item, ['generation', 'intent', 'replaces']);
    const value = generation(raw.generation, revision), intent = inspect(raw.intent, binding);
    const replaces = raw.replaces === null ? null : reservationRef(raw.replaces, revision);
    if (generations.has(value) || (intent.replacementOf === null) !== (replaces === null) ||
        replaces !== null && replaces.intentId !== intent.replacementOf) return invalid();
    generations.add(value);
    return { generation: value, intent, replaces };
  });
  const predecessors = new Map<number, number>(), successors = new Set<number>();
  for (const entry of entries) {
    if (entry.replaces === null) continue;
    const reference = entry.replaces;
    const original = entries.find(candidate => candidate.generation === reference.generation &&
      candidate.intent.hint.intentId === reference.intentId && candidate.intent.originProfileId === reference.originProfileId);
    if (!original || original.intent.hint.storedState !== 'dropped' ||
        original.intent.hint.action !== entry.intent.hint.action || successors.has(original.generation)) return invalid();
    predecessors.set(entry.generation, original.generation); successors.add(original.generation);
  }
  for (const entry of entries) {
    const visited = new Set<number>(); let current: number | undefined = entry.generation;
    while (current !== undefined) {
      if (visited.has(current)) return invalid();
      visited.add(current); current = predecessors.get(current);
    }
  }
  return entries.map(entry => entry.intent);
}

/** The sole open intent wins over all stored terminal labels; otherwise latest update, then greatest intent id. */
export function decodeSolanaJournalRecoveryHint(payload: unknown, schemaVersion: number = 1): SolanaJournalRecoveryHint {
  let bytes: Uint8Array | undefined;
  try {
    if (schemaVersion !== 1 && schemaVersion !== 2) return invalid();
    bytes = decodeBase64url(payload, 1, MAX_PAYLOAD_BYTES);
    const raw = intentData(parseStrictJsonBytes(bytes, MAX_PAYLOAD_BYTES),
      ['format', 'binding', 'revision', schemaVersion === 1 ? 'records' : 'entries']);
    if (raw.format !== `p2p-offramp/solana/vault-journal/v${schemaVersion}`) return invalid();
    const binding = bindingOf(raw.binding), revision = counter(raw.revision);
    let records: Inspected[];
    if (schemaVersion === 2) records = inspectEntries(raw.entries, binding, revision);
    else {
      const list = raw.records;
      if (!Array.isArray(list) || list.length < 1 || list.length > 32 || revision < list.length) return invalid();
      records = list.map(item => inspect(item, binding));
    }
    if (records.some((record, index) => index > 0 && records[index - 1]!.hint.intentId >= record.hint.intentId)) {
      return invalid();
    }
    const open = records.filter(record => record.open);
    if (open.length > 1) return invalid();
    if (open.length === 1) return open[0]!.hint;
    return records.reduce((latest, current) => current.updatedAt > latest.updatedAt ||
      current.updatedAt === latest.updatedAt && current.hint.intentId > latest.hint.intentId ? current : latest).hint;
  } catch { return invalid(); }
  finally { bytes?.fill(0); }
}
