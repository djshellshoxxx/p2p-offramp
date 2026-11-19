/** Bounded private recovery history. Wallet statements remain inside NIP-59 ciphertext, never in a public session view. */
import { verifyEventSync, type NostrEvent, type EventLimits } from '../../nostr-crypto/index.ts';
import { isEvmAddress, isHex64, parseAdAddress } from './messages.ts';
import type { Role } from './machine.ts';

export const EXCHANGE_CHECKPOINT_FORMAT = 'p2p-offramp/exchange-checkpoint/v1';
/** Two bounded gift wraps plus the original session context fit within one private vault record. */
export const MAX_EXCHANGE_CHECKPOINT_BYTES = 196_608;
export interface ExchangeCheckpointSession {
  readonly id: string; readonly role: Role; readonly ad: string; readonly orderId: string;
  readonly seller: string; readonly buyer: string; readonly buyerAddress: string;
  readonly adExpiresAtSeconds: number; readonly adMin: string; readonly adMax: string;
  readonly adNetwork: string; readonly adAsset: string; readonly adCurrency: string; readonly selected: boolean;
}
export interface ExchangeCheckpointMessage {
  readonly type: 'terms-offer' | 'terms-accept';
  /** Trusted local time when this exact message completed admission; not a new arrival time. */
  readonly admittedAtSeconds: number;
  /** The local sender's self-wrap, or the received counterparty wrap, addressed to this identity. */
  readonly wrap: NostrEvent;
}
export interface ExchangeCheckpoint {
  readonly format: typeof EXCHANGE_CHECKPOINT_FORMAT;
  readonly session: ExchangeCheckpointSession;
  /** Exactly one offer and one acceptance. Exports and parsed checkpoints use seller-first order. */
  readonly history: readonly ExchangeCheckpointMessage[];
}
const WRAP_LIMITS: EventLimits = Object.freeze({ maxContentBytes: 90_000, maxTags: 4, maxTagItems: 4,
  maxTagItemBytes: 256, maxJsonBytes: MAX_EXCHANGE_CHECKPOINT_BYTES, allowedKinds: [1059] });
const SESSION_KEYS = ['id', 'role', 'ad', 'orderId', 'seller', 'buyer', 'buyerAddress', 'adExpiresAtSeconds',
  'adMin', 'adMax', 'adNetwork', 'adAsset', 'adCurrency', 'selected'];
const amount = (input: unknown): input is string => typeof input === 'string' && /^[1-9][0-9]{0,38}$/.test(input);
const seconds = (input: unknown): input is number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 && input < 1_000_000_000_000;
function data(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const own = Reflect.ownKeys(input);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}
/** Strict snapshot before any await. Outer signatures authenticate ciphertext only; restore must check the full history. */
export function parseExchangeCheckpoint(input: unknown): Readonly<ExchangeCheckpoint> | null {
  try {
    const raw = data(input, ['format', 'session', 'history']);
    if (raw === null || raw.format !== EXCHANGE_CHECKPOINT_FORMAT) return null;
    const s = data(raw.session, SESSION_KEYS);
    if (s === null) return null;
    const address = parseAdAddress(s.ad);
    if (address === null || s.orderId !== address.orderId || s.seller !== address.author || !isHex64(s.buyer) || s.buyer === s.seller ||
        s.id !== `${s.ad}|${s.buyer}` || (s.role !== 'seller' && s.role !== 'buyer') || !isEvmAddress(s.buyerAddress) ||
        !seconds(s.adExpiresAtSeconds) || s.adExpiresAtSeconds === 0 || !amount(s.adMin) || !amount(s.adMax) || BigInt(s.adMin) > BigInt(s.adMax) ||
        typeof s.adNetwork !== 'string' || !/^[a-z0-9:_-]{1,64}$/.test(s.adNetwork) ||
        typeof s.adAsset !== 'string' || !/^[A-Za-z0-9:._-]{1,128}$/.test(s.adAsset) ||
        typeof s.adCurrency !== 'string' || !/^[A-Z]{3}$/.test(s.adCurrency) || typeof s.selected !== 'boolean' || (s.role === 'buyer' && s.selected)) return null;
    const session: ExchangeCheckpointSession = Object.freeze({ id: s.id as string, role: s.role, ad: s.ad as string, orderId: s.orderId as string,
      seller: s.seller as string, buyer: s.buyer, buyerAddress: s.buyerAddress, adExpiresAtSeconds: s.adExpiresAtSeconds,
      adMin: s.adMin, adMax: s.adMax, adNetwork: s.adNetwork, adAsset: s.adAsset, adCurrency: s.adCurrency, selected: s.selected });
    const items = raw.history;
    if (!Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype ||
        Object.getOwnPropertyDescriptor(items, 'length')?.value !== 2 || Reflect.ownKeys(items).length !== 3) return null;
    const history: ExchangeCheckpointMessage[] = [];
    for (const index of ['0', '1']) {
      const descriptor = Object.getOwnPropertyDescriptor(items, index);
      if (!descriptor || !('value' in descriptor)) return null;
      const item = data(descriptor.value, ['type', 'admittedAtSeconds', 'wrap']);
      if (item === null || (item.type !== 'terms-offer' && item.type !== 'terms-accept') || !seconds(item.admittedAtSeconds)) return null;
      const wrap = verifyEventSync(item.wrap, WRAP_LIMITS);
      history.push(Object.freeze({ type: item.type, admittedAtSeconds: item.admittedAtSeconds, wrap }));
    }
    if (history[0]!.type === history[1]!.type || history[0]!.wrap.id === history[1]!.wrap.id) return null;
    history.sort((a, b) => a.type === b.type ? 0 : a.type === 'terms-offer' ? -1 : 1);
    if (history[0]!.admittedAtSeconds > history[1]!.admittedAtSeconds) return null;
    const checkpoint = Object.freeze({ format: EXCHANGE_CHECKPOINT_FORMAT, session, history: Object.freeze(history) });
    return new TextEncoder().encode(JSON.stringify(checkpoint)).byteLength <= MAX_EXCHANGE_CHECKPOINT_BYTES ? checkpoint : null;
  } catch { return null; }
}
