/**
 * Terms-exchange message schemas. Every message is the content of a NIP-17 kind-14 rumor (sealed and gift-wrapped by
 * packages/nostr-crypto) and is bound to the advertisement (kind 30078 address) and, once terms exist, the trade
 * (G16 termsHash). The envelope is exact-key, versioned and size-capped; unknown keys, types or versions fail closed.
 * Nothing here is authority: an accept is a negotiation statement, never funding (G08/chain observation decides).
 */
import { parseEventJson } from '../../nostr-crypto/index.ts';

export const EXCHANGE_TOPIC = 'p2p-offramp-terms-v1';
export const AD_KIND = 30078;
export const AD_D_PREFIX = 'p2p-offramp:v1:';
export const MESSAGE_TYPES = Object.freeze(['take-request', 'terms-offer', 'terms-accept', 'terms-reject', 'cancel'] as const);
export type MessageType = typeof MESSAGE_TYPES[number];
export const REJECT_REASONS = Object.freeze(['declined', 'review-failed', 'expired'] as const);
export const CANCEL_REASONS = Object.freeze(['withdrawn', 'declined', 'expired'] as const);
export type RejectReason = typeof REJECT_REASONS[number];
export type CancelReason = typeof CANCEL_REASONS[number];
/** Canonical G16 review-document bytes carried in an offer (the container is itself bounded by 64 KiB elsewhere). */
export const MAX_OFFER_TERMS_BYTES = 16_384;
/** A message must expire within this many seconds of receipt, which also bounds the replay-memory window. */
export const MAX_MESSAGE_LIFETIME_SECONDS = 3600;
export const MAX_FUTURE_SKEW_SECONDS = 120;
/** Whole envelope JSON cap (inside the NIP-17 rumor limits). */
export const MAX_ENVELOPE_BYTES = 24_576;

export interface ExchangeEnvelopeV1 {
  readonly v: 1; readonly type: MessageType;
  /** `30078:<seller pubkey>:p2p-offramp:v1:<orderId>` */
  readonly ad: string; readonly orderId: string; readonly sender: string; readonly recipient: string;
  /** 32 random bytes, hex: makes otherwise identical messages distinct rumors. */
  readonly nonce: string; readonly expiresAtSeconds: string;
  /** G16 evmTermsHash (hex) once terms exist; null for take-request and for a cancel before any offer. */
  readonly termsHash: string | null;
  /** Per type: take-request {buyerAddress, buyerMessagingKey}; terms-offer {terms}; terms-accept {revision}; terms-reject/cancel {reason}. */
  readonly body: Readonly<Record<string, unknown>>;
}

const HEX64 = /^[0-9a-f]{64}$/, ADDRESS = /^0x[0-9a-f]{40}$/, SECONDS = /^[1-9][0-9]{0,11}$/, REVISION = /^[1-9][0-9]{0,19}$/;
export const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
export const isHex64 = (value: unknown): value is string => typeof value === 'string' && HEX64.test(value);
export const isEvmAddress = (value: unknown): value is string => typeof value === 'string' && ADDRESS.test(value) && value !== ZERO_ADDRESS;
export function adAddress(author: string, orderId: string): string { return `${AD_KIND}:${author}:${AD_D_PREFIX}${orderId}`; }
export function parseAdAddress(value: unknown): { readonly author: string; readonly orderId: string } | null {
  const match = typeof value === 'string' ? /^30078:([0-9a-f]{64}):p2p-offramp:v1:([0-9a-f]{64})$/.exec(value) : null;
  return match === null ? null : { author: match[1] as string, orderId: match[2] as string };
}
/** The relay order book keys ads as `<author>:<d tag>`. */
export function adBookKey(author: string, orderId: string): string { return `${author}:${AD_D_PREFIX}${orderId}`; }

/** Exact rumor tags for an envelope, in order. The receiver requires exactly these. */
export function envelopeTags(envelope: ExchangeEnvelopeV1): string[][] {
  const tags = [['p', envelope.recipient], ['a', envelope.ad], ['t', EXCHANGE_TOPIC]];
  if (envelope.termsHash !== null) tags.push(['trade', envelope.termsHash]);
  return tags;
}
export function encodeEnvelope(envelope: ExchangeEnvelopeV1): string {
  const { v, type, ad, orderId, sender, recipient, nonce, expiresAtSeconds, termsHash, body } = envelope;
  return JSON.stringify({ v, type, ad, orderId, sender, recipient, nonce, expiresAtSeconds, termsHash, body });
}

const ENVELOPE_KEYS = ['v', 'type', 'ad', 'orderId', 'sender', 'recipient', 'nonce', 'expiresAtSeconds', 'termsHash', 'body'];
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

/** Strict parse of decrypted rumor content. Returns null for any deviation. */
export function parseEnvelope(text: string): ExchangeEnvelopeV1 | null {
  let raw: unknown;
  try { raw = parseEventJson(text, MAX_ENVELOPE_BYTES, 3); } catch { return null; }
  if (!exactKeys(raw, ENVELOPE_KEYS)) return null;
  const { v, type, ad, orderId, sender, recipient, nonce, expiresAtSeconds, termsHash, body } = raw;
  if (v !== 1 || !MESSAGE_TYPES.includes(type as MessageType)) return null;
  const address = parseAdAddress(ad);
  if (address === null || orderId !== address.orderId || !isHex64(sender) || !isHex64(recipient) || sender === recipient || !isHex64(nonce)) return null;
  if (typeof expiresAtSeconds !== 'string' || !SECONDS.test(expiresAtSeconds)) return null;
  if (termsHash !== null && !isHex64(termsHash)) return null;
  const kind = type as MessageType;
  if (kind === 'take-request' ? termsHash !== null : kind !== 'cancel' && termsHash === null) return null;
  switch (kind) {
    case 'take-request':
      if (!exactKeys(body, ['buyerAddress', 'buyerMessagingKey']) || !isEvmAddress(body.buyerAddress) || body.buyerMessagingKey !== sender) return null;
      break;
    case 'terms-offer':
      if (!exactKeys(body, ['terms']) || typeof body.terms !== 'string' || body.terms.length === 0) return null;
      break;
    case 'terms-accept':
      if (!exactKeys(body, ['revision']) || typeof body.revision !== 'string' || !REVISION.test(body.revision)) return null;
      break;
    case 'terms-reject':
      if (!exactKeys(body, ['reason']) || !REJECT_REASONS.includes(body.reason as RejectReason)) return null;
      break;
    case 'cancel':
      if (!exactKeys(body, ['reason']) || !CANCEL_REASONS.includes(body.reason as CancelReason)) return null;
      break;
  }
  return Object.freeze({ v: 1, type: kind, ad: ad as string, orderId: orderId as string, sender, recipient, nonce, expiresAtSeconds, termsHash: termsHash as string | null, body: Object.freeze({ ...body }) });
}
