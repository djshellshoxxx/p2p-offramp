/**
 * G20 trade-bound NIP-17 direct messages. A kind-14 rumor carries exactly three tags, in this order:
 *   ["p", <counterparty>], ["trade", <G16 tradeId>], ["conversation", <conversationId>]
 * conversationId = SHA-256(JSON ["p2p-offramp/g20-trade-chat", 1, chain, networkId, deploymentId, tradeId, lowKey, highKey]).
 * Each send produces a recipient wrap and a self-copy wrap (NIP-17), each under its own one-time key. Receive accepts
 * only the trade's two counterparties, authenticates seal.pubkey == rumor.pubkey, checks binding tags and deduplicates
 * by rumor id. Message content is untrusted text: it is not delivery, payment or escrow evidence.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { parseTradeBinding, type CoreErrorCode, type CoreResult, type TradeBinding } from '../../schemas/index.ts';
import { bytesToHex, isLowerHex, NostrCryptoError, utf8Encode } from './bytes.ts';
import { createUnsignedEvent, DEFAULT_EVENT_LIMITS, type EventLimits, type NostrEvent, type UnsignedEvent } from './event.ts';
import { createGiftWrap, createSeal, unwrapGiftWrap } from './nip59.ts';
import type { NostrMessagingProvider } from './provider.ts';

export const KIND_PRIVATE_DIRECT_MESSAGE = 14;
/** Application envelope limit (spec-application-message-envelope: whole payload <= 24576 bytes). */
export const MAX_CHAT_CONTENT_BYTES = 24_576;
/**
 * Rumor JSON cap. The seal's NIP-44 payload must fit inside the wrap's NIP-44 plaintext (<= 65535 bytes); a 40960-byte
 * rumor pads to 40962, encodes to 54700 base64 characters, and the seal JSON stays below 55200 bytes.
 */
export const MAX_RUMOR_JSON_BYTES = 40_960;
export const DEFAULT_MAX_SEEN_MESSAGES = 4096;
const RUMOR_LIMITS: EventLimits = Object.freeze({ ...DEFAULT_EVENT_LIMITS, maxContentBytes: MAX_CHAT_CONTENT_BYTES, maxTags: 3, maxTagItems: 2, maxTagItemBytes: 64, maxJsonBytes: MAX_RUMOR_JSON_BYTES, allowedKinds: [KIND_PRIVATE_DIRECT_MESSAGE] });

export interface TradeChatOptions {
  readonly binding: TradeBinding;
  /** The two counterparties' BIP340 messaging keys, taken from authenticated terms. Order is irrelevant. */
  readonly participants: readonly [string, string];
  readonly selfPublicKey: string;
  readonly provider: NostrMessagingProvider;
  /** Unix seconds. */
  readonly now?: () => number;
  readonly maxSeenMessages?: number;
}
export interface TradeChatMessage {
  readonly rumorId: string; readonly author: string; readonly direction: 'inbound' | 'outbound';
  /** Sender-claimed time, untrusted and not chronology authority. */
  readonly claimedCreatedAt: number; readonly content: string;
}
export interface SentTradeChatMessage { readonly message: TradeChatMessage; readonly rumor: UnsignedEvent; readonly recipientWrap: NostrEvent; readonly selfWrap: NostrEvent; }
export interface ReceivedTradeChatMessage { readonly duplicate: boolean; readonly message: TradeChatMessage; }
export interface TradeChat {
  readonly conversationId: string;
  send(content: string, senderSecret: Uint8Array, signal?: AbortSignal): Promise<CoreResult<SentTradeChatMessage>>;
  receive(wrap: unknown, recipientSecret: Uint8Array, signal?: AbortSignal): Promise<CoreResult<ReceivedTradeChatMessage>>;
  close(): void;
}

class Stop extends Error { readonly code: CoreErrorCode; constructor(code: CoreErrorCode) { super('Trade chat operation stopped.'); this.code = code; } }
function failure(code: CoreErrorCode): CoreResult<never> { return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: false }) }; }
function codeOf(error: unknown): CoreErrorCode {
  // Anything else (an IdentityError for a malformed secret, a hostile provider throw) is reported as invalid input.
  return error instanceof Stop || error instanceof NostrCryptoError ? error.code : 'INVALID_INPUT';
}

export function tradeConversationId(binding: TradeBinding, participants: readonly [string, string]): string {
  const [low, high] = [...participants].sort();
  return bytesToHex(sha256(utf8Encode(JSON.stringify(['p2p-offramp/g20-trade-chat', 1, binding.chain, binding.networkId, binding.deploymentId, binding.tradeId, low, high]))));
}

export function createTradeChat(options: TradeChatOptions): CoreResult<TradeChat> {
  let binding: TradeBinding;
  try { binding = parseTradeBinding(options.binding); } catch { return failure('INVALID_INPUT'); }
  // G16 tradeId is the 32-byte terms hash as 64 lowercase hex characters.
  if (!isLowerHex(binding.tradeId, 32)) return failure('INVALID_INPUT');
  const participants = options.participants;
  if (!Array.isArray(participants) || participants.length !== 2 || !participants.every(key => isLowerHex(key, 32)) || participants[0] === participants[1]) return failure('INVALID_INPUT');
  const self = options.selfPublicKey;
  if (!participants.includes(self)) return failure('UNAUTHORIZED');
  const provider = options.provider;
  if (typeof provider?.signSchnorr !== 'function' || typeof provider.conversationKey !== 'function' || typeof provider.generate !== 'function') return failure('UNSUPPORTED_PROVIDER');
  const counterparty = participants[0] === self ? participants[1] : participants[0];
  const pair = Object.freeze([participants[0], participants[1]] as const);
  const conversationId = tradeConversationId(binding, pair);
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const maxSeen = options.maxSeenMessages ?? DEFAULT_MAX_SEEN_MESSAGES;
  if (!Number.isSafeInteger(maxSeen) || maxSeen < 1 || maxSeen > 1_000_000) return failure('INVALID_INPUT');
  const seen = new Set<string>();
  let closed = false;

  const guard = (signal: AbortSignal | undefined): void => {
    if (closed) throw new Stop('LOCKED');
    if (signal?.aborted) throw new Stop('CANCELLED');
  };
  const clock = (): number => { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw new Stop('INVALID_INPUT'); return value; };
  const expectedTags = (author: string): readonly (readonly string[])[] => [['p', author === self ? counterparty : self], ['trade', binding.tradeId], ['conversation', conversationId]];
  const message = (rumor: UnsignedEvent): TradeChatMessage => Object.freeze({ rumorId: rumor.id, author: rumor.pubkey, direction: rumor.pubkey === self ? 'outbound' : 'inbound', claimedCreatedAt: rumor.created_at, content: rumor.content });
  const remember = (id: string): boolean => {
    if (seen.has(id)) return false;
    // No eviction: forgetting an id would let a relay replay it as new. Callers persist history and open a new session.
    if (seen.size >= maxSeen) throw new Stop('LIMIT_EXCEEDED');
    seen.add(id); return true;
  };

  const chat: TradeChat = {
    conversationId,
    async send(content, senderSecret, signal) {
      try {
        guard(signal);
        if (typeof content !== 'string' || content.length === 0) throw new Stop('INVALID_INPUT');
        if (await provider.publicKey(senderSecret) !== self) throw new Stop('UNAUTHORIZED');
        guard(signal);
        const time = clock();
        const rumor = createUnsignedEvent(self, { kind: KIND_PRIVATE_DIRECT_MESSAGE, created_at: time, tags: expectedTags(self), content }, RUMOR_LIMITS);
        if (utf8Encode(JSON.stringify(rumor)).byteLength > MAX_RUMOR_JSON_BYTES) throw new Stop('LIMIT_EXCEEDED');
        const recipientSeal = await createSeal(rumor, senderSecret, counterparty, provider, time); guard(signal);
        const recipientWrap = await createGiftWrap(recipientSeal, counterparty, provider, time); guard(signal);
        const selfSeal = await createSeal(rumor, senderSecret, self, provider, time); guard(signal);
        const selfWrap = await createGiftWrap(selfSeal, self, provider, time); guard(signal);
        remember(rumor.id);
        return { ok: true, value: Object.freeze({ message: message(rumor), rumor, recipientWrap, selfWrap }) };
      } catch (error) { return failure(codeOf(error)); }
    },
    async receive(wrap, recipientSecret, signal) {
      try {
        guard(signal);
        if (await provider.publicKey(recipientSecret) !== self) throw new Stop('UNAUTHORIZED');
        const { seal, rumor } = await unwrapGiftWrap(wrap, recipientSecret, provider, { now: clock(), rumorLimits: RUMOR_LIMITS });
        guard(signal);
        if (rumor.pubkey !== seal.pubkey || !pair.includes(rumor.pubkey)) throw new Stop('UNAUTHORIZED');
        const expected = expectedTags(rumor.pubkey);
        if (rumor.tags.length !== expected.length || rumor.tags.some((tag, index) => tag.length !== 2 || tag[0] !== expected[index]![0] || tag[1] !== expected[index]![1])) throw new Stop('UNAUTHORIZED');
        const fresh = remember(rumor.id);
        return { ok: true, value: Object.freeze({ duplicate: !fresh, message: message(rumor) }) };
      } catch (error) { return failure(codeOf(error)); }
    },
    close() { closed = true; seen.clear(); },
  };
  return { ok: true, value: Object.freeze(chat) };
}
