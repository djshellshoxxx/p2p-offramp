/**
 * Encrypted G16 terms exchange over NIP-17 (kind-14 rumor -> NIP-44 seal -> NIP-59 gift wrap), bound to a G19 advert.
 *
 * Flow: buyer `take` -> seller `offer` (canonical G16 terms bytes) -> buyer local review (domain `reviewTermsBytes`
 * against an injected registry) -> buyer `accept` / `reject`; either side may `cancel` before an accept.
 *
 * Authority: relay messages and chat are discovery and communication only. A session reaching `accepted` is NOT funding;
 * it only means the buyer sent an acceptance of exactly the bytes local review approved. Funding, release and refund are
 * decided by chain observation (packages/domain authority). Sessions are bounded, in-memory and never persisted.
 */
import { reviewTermsBytes } from '../../domain/index.ts';
import type { RegistryLookup, ReviewedEvmTerms, TermsReviewRejection } from '../../domain/index.ts';
import { createGiftWrap, createSeal, createUnsignedEvent, unwrapGiftWrap, KIND_PRIVATE_DIRECT_MESSAGE, MAX_RUMOR_JSON_BYTES } from '../../nostr-crypto/index.ts';
import type { EventLimits, NostrEvent, NostrMessagingProvider } from '../../nostr-crypto/index.ts';
import type { OrderBook } from '../../relay/index.ts';
import { transition, isTerminal } from './machine.ts';
import type { Role, SessionState } from './machine.ts';
import {
  adAddress, adBookKey, encodeEnvelope, envelopeTags, isEvmAddress, isHex64, MAX_ENVELOPE_BYTES, MAX_FUTURE_SKEW_SECONDS,
  MAX_MESSAGE_LIFETIME_SECONDS, MAX_OFFER_TERMS_BYTES, parseAdAddress, parseEnvelope,
} from './messages.ts';
import type { CancelReason, ExchangeEnvelopeV1, MessageType, RejectReason } from './messages.ts';

export type ExchangeCode =
  | 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'CLOSED' | 'WRAP_INVALID' | 'MALFORMED' | 'NOT_ADDRESSED' | 'EXPIRED' | 'AD_UNAVAILABLE' | 'AD_EXPIRED'
  | 'AD_MISMATCH' | 'DUPLICATE' | 'UNKNOWN_SESSION' | 'OUT_OF_ORDER' | 'NOT_SELLER' | 'NOT_COUNTERPARTY' | 'REVIEW_FAILED' | 'TERMS_MISMATCH'
  | 'HASH_MISMATCH' | 'REVISION_MISMATCH' | 'WRONG_SIGNER';
export type ExchangeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: ExchangeCode; readonly review?: TermsReviewRejection };

export const EXCHANGE_LIMITS = Object.freeze({ maxSessions: 64, maxSeenMessages: 1024, defaultMessageTtlSeconds: 900 });
const RUMOR_LIMITS: EventLimits = Object.freeze({ maxContentBytes: MAX_ENVELOPE_BYTES, maxTags: 4, maxTagItems: 2, maxTagItemBytes: 256,
  maxJsonBytes: MAX_RUMOR_JSON_BYTES, allowedKinds: [KIND_PRIVATE_DIRECT_MESSAGE] });

export interface ExchangeOptions {
  readonly provider: NostrMessagingProvider;
  readonly selfPublicKey: string;
  /** Advert source (the G19 order book satisfies it). Called at session start; sessions then carry the ad's expiry. */
  readonly ads: Pick<OrderBook, 'revalidate'>;
  /** Approved G11 registry view used for local terms review. */
  readonly registry: RegistryLookup;
  /** G16 trade identity: the exact digest the escrow computes (packages/wallet `evmTermsHash` for EVM). Injected so this package stays chain-free. */
  readonly hashTerms: (reviewed: ReviewedEvmTerms) => string;
  /** Trusted unix seconds. */
  readonly now: () => number;
  readonly sha256?: Parameters<typeof reviewTermsBytes>[2];
  readonly maxSessions?: number;
  readonly maxSeenMessages?: number;
  readonly messageTtlSeconds?: number;
}
export interface SessionView {
  readonly id: string; readonly role: Role; readonly ad: string; readonly orderId: string; readonly seller: string; readonly buyer: string;
  readonly buyerAddress: string; readonly state: SessionState; readonly adExpiresAtSeconds: number;
  /** Present once an offer passed local review. `bytes` is a copy of the exact reviewed bytes. */
  readonly terms: { readonly hash: string; readonly bytes: Uint8Array; readonly reviewed: ReviewedEvmTerms } | null;
}
export interface SentMessage { readonly sessionId: string; readonly rumorId: string; readonly type: MessageType; readonly state: SessionState;
  /** Publish both through the relay pool (kind 1059). `selfWrap` is optional backup history. */
  readonly recipientWrap: NostrEvent; readonly selfWrap: NostrEvent; }
export interface ReceivedMessage { readonly sessionId: string; readonly rumorId: string; readonly type: MessageType; readonly from: string; readonly state: SessionState;
  readonly termsHash: string | null; readonly reviewed: ReviewedEvmTerms | null; }
export interface TermsExchange {
  /** Buyer: start a session for an advert (ad key as in the order book). */
  take(adKey: string, buyerAddress: string, secret: Uint8Array): Promise<ExchangeResult<SentMessage>>;
  /** Seller: send canonical G16 terms bytes (review-document JSON). They are reviewed locally first. */
  offer(sessionId: string, termsBytes: Uint8Array, secret: Uint8Array): Promise<ExchangeResult<SentMessage>>;
  /** Buyer: accept. `termsBytes` must be exactly the bytes local review approved for this session. */
  accept(sessionId: string, termsBytes: Uint8Array, secret: Uint8Array): Promise<ExchangeResult<SentMessage>>;
  reject(sessionId: string, reason: RejectReason, secret: Uint8Array): Promise<ExchangeResult<SentMessage>>;
  cancel(sessionId: string, reason: CancelReason, secret: Uint8Array): Promise<ExchangeResult<SentMessage>>;
  /** Process one gift wrap delivered by the relay pool. */
  receive(wrap: unknown, secret: Uint8Array): Promise<ExchangeResult<ReceivedMessage | { readonly own: true; readonly rumorId: string }>>;
  session(sessionId: string): SessionView | null;
  readonly sessionCount: number;
  close(): void;
}

interface Session {
  readonly id: string; readonly role: Role; readonly ad: string; readonly orderId: string; readonly seller: string; readonly buyer: string;
  readonly buyerAddress: string; readonly adExpires: number; readonly adMin: bigint; readonly adMax: bigint;
  state: SessionState; terms: { hash: string; bytes: Uint8Array; reviewed: ReviewedEvmTerms } | null;
}
const bad = (code: ExchangeCode, review?: TermsReviewRejection): { ok: false; code: ExchangeCode; review?: TermsReviewRejection } =>
  review === undefined ? { ok: false, code } : { ok: false, code, review };
const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
export const sessionIdFor = (ad: string, buyer: string): string => `${ad}|${buyer}`;

export function createTermsExchange(options: ExchangeOptions): TermsExchange {
  const { provider, selfPublicKey: self, registry } = options;
  if (!isHex64(self) || typeof provider?.publicKey !== 'function' || typeof options.hashTerms !== 'function' || typeof options.now !== 'function') throw new TypeError('INVALID_OPTIONS');
  const maxSessions = options.maxSessions ?? EXCHANGE_LIMITS.maxSessions;
  const maxSeen = options.maxSeenMessages ?? EXCHANGE_LIMITS.maxSeenMessages;
  const ttl = options.messageTtlSeconds ?? EXCHANGE_LIMITS.defaultMessageTtlSeconds;
  if (![maxSessions, maxSeen, ttl].every(value => Number.isSafeInteger(value) && value >= 1) || ttl > MAX_MESSAGE_LIFETIME_SECONDS) throw new RangeError('INVALID_OPTIONS');
  const sessions = new Map<string, Session>();
  /** rumor id -> message expiry. Only expired entries are ever evicted, so a live replay is always recognised. */
  const seen = new Map<string, number>();
  let closed = false;

  const clock = (): number | null => { try { const value = options.now(); return Number.isSafeInteger(value) && value >= 0 ? value : null; } catch { return null; } };
  const view = (s: Session): SessionView => Object.freeze({ id: s.id, role: s.role, ad: s.ad, orderId: s.orderId, seller: s.seller, buyer: s.buyer, buyerAddress: s.buyerAddress,
    state: s.state, adExpiresAtSeconds: s.adExpires,
    terms: s.terms === null ? null : Object.freeze({ hash: s.terms.hash, bytes: new Uint8Array(s.terms.bytes), reviewed: s.terms.reviewed }) });
  function purge(now: number): void {
    for (const [id, expiry] of seen) if (expiry <= now) seen.delete(id);
    for (const [id, s] of sessions) if (isTerminal(s.state) || now >= s.adExpires) sessions.delete(id);
  }
  function admit(s: Session, now: number): boolean {
    if (sessions.has(s.id)) return false;
    if (sessions.size >= maxSessions) purge(now);
    if (sessions.size >= maxSessions) return false;
    sessions.set(s.id, s); return true;
  }

  /** Local review plus every binding of the terms to this session; shared by seller (before offering) and buyer (on receipt). */
  async function reviewForSession(s: Session, bytes: Uint8Array, now: number): Promise<ExchangeResult<{ reviewed: ReviewedEvmTerms; hash: string }>> {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_OFFER_TERMS_BYTES) return bad('LIMIT_EXCEEDED');
    const result = await reviewTermsBytes(registry, bytes, options.sha256);
    if (!result.ok) return bad('REVIEW_FAILED', result.code);
    const reviewed = result.value;
    if (reviewed.orderId !== s.orderId || reviewed.buyer !== s.buyerAddress) return bad('TERMS_MISMATCH');
    const amount = BigInt(reviewed.amountBaseUnits);
    if (amount < s.adMin || amount > s.adMax) return bad('AD_MISMATCH');
    if (BigInt(reviewed.acceptBeforeSeconds) <= BigInt(now)) return bad('EXPIRED');
    let hash: unknown;
    try { hash = options.hashTerms(reviewed); } catch { return bad('INVALID_INPUT'); }
    if (!isHex64(hash)) return bad('INVALID_INPUT');
    return { ok: true, value: { reviewed, hash } };
  }

  /** Build, wrap (recipient + self copy) and return a message. Does not touch state. */
  async function build(s: Session, type: MessageType, body: Record<string, unknown>, termsHash: string | null, secret: Uint8Array, now: number): Promise<ExchangeResult<{ envelope: ExchangeEnvelopeV1; rumorId: string; recipientWrap: NostrEvent; selfWrap: NostrEvent }>> {
    try {
      if (await provider.publicKey(secret) !== self) return bad('WRONG_SIGNER');
      const recipient = s.role === 'seller' ? s.buyer : s.seller;
      const expires = Math.min(now + ttl, s.adExpires);
      if (expires <= now) return bad('AD_EXPIRED');
      const nonce = new Uint8Array(32); globalThis.crypto.getRandomValues(nonce);
      const envelope: ExchangeEnvelopeV1 = { v: 1, type, ad: s.ad, orderId: s.orderId, sender: self, recipient, nonce: toHex(nonce), expiresAtSeconds: String(expires), termsHash, body };
      const content = encodeEnvelope(envelope);
      if (new TextEncoder().encode(content).byteLength > MAX_ENVELOPE_BYTES) return bad('LIMIT_EXCEEDED');
      const rumor = createUnsignedEvent(self, { kind: KIND_PRIVATE_DIRECT_MESSAGE, created_at: now, tags: envelopeTags(envelope), content }, RUMOR_LIMITS);
      if (new TextEncoder().encode(JSON.stringify(rumor)).byteLength > MAX_RUMOR_JSON_BYTES) return bad('LIMIT_EXCEEDED');
      const recipientWrap = await createGiftWrap(await createSeal(rumor, secret, recipient, provider, now), recipient, provider, now);
      const selfWrap = await createGiftWrap(await createSeal(rumor, secret, self, provider, now), self, provider, now);
      return { ok: true, value: { envelope, rumorId: rumor.id, recipientWrap, selfWrap } };
    } catch { return bad('INVALID_INPUT'); }
  }
  const sent = (s: Session, type: MessageType, built: { rumorId: string; recipientWrap: NostrEvent; selfWrap: NostrEvent }, expires: string): SentMessage => {
    seen.set(built.rumorId, Number(expires));
    return Object.freeze({ sessionId: s.id, rumorId: built.rumorId, type, state: s.state, recipientWrap: built.recipientWrap, selfWrap: built.selfWrap });
  };
  /** Common precondition for local sends: open exchange, valid clock, known live session in the role the call requires. */
  function liveSession(id: string, role: Role, now: number | null): ExchangeResult<Session> {
    if (closed) return bad('CLOSED');
    if (now === null) return bad('INVALID_INPUT');
    const s = sessions.get(id);
    if (s === undefined) return bad('UNKNOWN_SESSION');
    if (s.role !== role) return bad(role === 'seller' ? 'NOT_SELLER' : 'NOT_COUNTERPARTY');
    if (now >= s.adExpires) return bad('AD_EXPIRED');
    return { ok: true, value: s };
  }

  const exchange: TermsExchange = {
    get sessionCount() { return sessions.size; },
    session: id => { const s = sessions.get(id); return s === undefined ? null : view(s); },
    close() { closed = true; sessions.clear(); seen.clear(); },

    async take(adKey, buyerAddress, secret) {
      const now = clock();
      if (closed) return bad('CLOSED');
      if (now === null || !isEvmAddress(buyerAddress) || typeof adKey !== 'string') return bad('INVALID_INPUT');
      const found = options.ads.revalidate(adKey);
      if (!found.ok) return bad(found.reason === 'expired' ? 'AD_EXPIRED' : 'AD_UNAVAILABLE');
      const { ad, author } = found.ad;
      if (ad.maker !== author || author === self) return bad('NOT_SELLER');
      const address = adAddress(author, ad.orderId);
      const expiresAt = Number(ad.expiresAtSeconds);
      if (now >= expiresAt) return bad('AD_EXPIRED');
      const s: Session = { id: sessionIdFor(address, self), role: 'buyer', ad: address, orderId: ad.orderId, seller: author, buyer: self, buyerAddress, adExpires: expiresAt,
        adMin: BigInt(ad.amountMin), adMax: BigInt(ad.amountMax), state: 'taken', terms: null };
      if (sessions.has(s.id) && !isTerminal(sessions.get(s.id)!.state) && now < sessions.get(s.id)!.adExpires) return bad('OUT_OF_ORDER');
      sessions.delete(s.id);
      const built = await build(s, 'take-request', { buyerAddress, buyerMessagingKey: self }, null, secret, now);
      if (!built.ok) return built;
      if (!admit(s, now)) return bad('LIMIT_EXCEEDED');
      return { ok: true, value: sent(s, 'take-request', built.value, built.value.envelope.expiresAtSeconds) };
    },

    async offer(sessionId, termsBytes, secret) {
      const now = clock(); const live = liveSession(sessionId, 'seller', now); if (!live.ok) return live;
      const s = live.value;
      if (!(termsBytes instanceof Uint8Array)) return bad('INVALID_INPUT');
      if (transition(s.state, 'terms-offer', 'seller') === null) return bad('OUT_OF_ORDER');
      const copy = new Uint8Array(termsBytes);
      const checked = await reviewForSession(s, copy, now!); if (!checked.ok) return checked;
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(copy); } catch { return bad('INVALID_INPUT'); }
      const built = await build(s, 'terms-offer', { terms: text }, checked.value.hash, secret, now!);
      if (!built.ok) return built;
      if (s.state !== 'taken') return bad('OUT_OF_ORDER'); // re-check after awaits
      s.state = 'offered'; s.terms = { hash: checked.value.hash, bytes: copy, reviewed: checked.value.reviewed };
      return { ok: true, value: sent(s, 'terms-offer', built.value, built.value.envelope.expiresAtSeconds) };
    },

    async accept(sessionId, termsBytes, secret) {
      const now = clock(); const live = liveSession(sessionId, 'buyer', now); if (!live.ok) return live;
      const s = live.value;
      if (!(termsBytes instanceof Uint8Array)) return bad('INVALID_INPUT');
      if (transition(s.state, 'terms-accept', 'buyer') === null || s.terms === null) return bad('OUT_OF_ORDER');
      // The acceptance covers exactly the bytes that passed local review; anything else is refused before signing.
      if (!sameBytes(s.terms.bytes, termsBytes)) return bad('TERMS_MISMATCH');
      if (BigInt(s.terms.reviewed.acceptBeforeSeconds) <= BigInt(now!)) return bad('EXPIRED');
      const { hash, reviewed } = s.terms;
      const built = await build(s, 'terms-accept', { revision: reviewed.revision }, hash, secret, now!);
      if (!built.ok) return built;
      if (s.state !== 'offered') return bad('OUT_OF_ORDER');
      s.state = 'accepted';
      return { ok: true, value: sent(s, 'terms-accept', built.value, built.value.envelope.expiresAtSeconds) };
    },

    async reject(sessionId, reason, secret) {
      const now = clock(); const live = liveSession(sessionId, 'buyer', now); if (!live.ok) return live;
      const s = live.value;
      if (transition(s.state, 'terms-reject', 'buyer') === null || s.terms === null) return bad('OUT_OF_ORDER');
      const built = await build(s, 'terms-reject', { reason }, s.terms.hash, secret, now!);
      if (!built.ok) return built;
      if (s.state !== 'offered') return bad('OUT_OF_ORDER');
      s.state = 'rejected';
      return { ok: true, value: sent(s, 'terms-reject', built.value, built.value.envelope.expiresAtSeconds) };
    },

    async cancel(sessionId, reason, secret) {
      if (closed) return bad('CLOSED');
      const now = clock(); const s = sessions.get(sessionId);
      if (now === null) return bad('INVALID_INPUT');
      if (s === undefined) return bad('UNKNOWN_SESSION');
      if (now >= s.adExpires) return bad('AD_EXPIRED');
      if (transition(s.state, 'cancel', s.role) === null) return bad('OUT_OF_ORDER');
      const built = await build(s, 'cancel', { reason }, s.terms?.hash ?? null, secret, now);
      if (!built.ok) return built;
      if (isTerminal(s.state)) return bad('OUT_OF_ORDER');
      s.state = 'cancelled';
      return { ok: true, value: sent(s, 'cancel', built.value, built.value.envelope.expiresAtSeconds) };
    },

    async receive(wrap, secret) {
      if (closed) return bad('CLOSED');
      const now = clock(); if (now === null) return bad('INVALID_INPUT');
      let rumor;
      try {
        if (await provider.publicKey(secret) !== self) return bad('WRONG_SIGNER');
        rumor = (await unwrapGiftWrap(wrap, secret, provider, { now, rumorLimits: RUMOR_LIMITS })).rumor;
      } catch { return bad('WRAP_INVALID'); }
      if (rumor.kind !== KIND_PRIVATE_DIRECT_MESSAGE) return bad('MALFORMED');
      // The seal's author is authenticated (rumor.pubkey == seal.pubkey); envelope fields must agree with it.
      if (rumor.pubkey === self) return { ok: true, value: Object.freeze({ own: true as const, rumorId: rumor.id }) };
      const env = parseEnvelope(rumor.content);
      if (env === null || env.sender !== rumor.pubkey) return bad('MALFORMED');
      if (env.recipient !== self) return bad('NOT_ADDRESSED');
      const expected = envelopeTags(env);
      if (rumor.tags.length !== expected.length || rumor.tags.some((tag, i) => tag.length !== 2 || tag[0] !== expected[i]![0] || tag[1] !== expected[i]![1])) return bad('MALFORMED');
      const expires = Number(env.expiresAtSeconds);
      if (rumor.created_at > now + MAX_FUTURE_SKEW_SECONDS) return bad('MALFORMED');
      if (expires <= now) return bad('EXPIRED');
      if (expires > now + MAX_MESSAGE_LIFETIME_SECONDS) return bad('MALFORMED');
      if (seen.has(rumor.id)) return bad('DUPLICATE');
      if (seen.size >= maxSeen) { purge(now); if (seen.size >= maxSeen) return bad('LIMIT_EXCEEDED'); }

      const address = parseAdAddress(env.ad)!;
      const seller = address.author;
      const from = env.sender;
      const iAmSeller = self === seller;
      // Only the ad's seller key may offer; nobody else may impersonate the seller to a buyer.
      if (env.type === 'terms-offer' && from !== seller) return bad('NOT_SELLER');
      if (!iAmSeller && from !== seller) return bad('NOT_SELLER');
      const buyerKey = iAmSeller ? from : self;
      const id = sessionIdFor(env.ad, buyerKey);

      let session = sessions.get(id);
      if (env.type === 'take-request') {
        if (!iAmSeller || from === seller) return bad('NOT_SELLER');
        if (session !== undefined && !isTerminal(session.state) && now < session.adExpires) return bad('OUT_OF_ORDER');
        const found = options.ads.revalidate(adBookKey(seller, address.orderId));
        if (!found.ok) return bad(found.reason === 'expired' ? 'AD_EXPIRED' : 'AD_UNAVAILABLE');
        const { ad, author } = found.ad;
        if (author !== self || ad.maker !== self) return bad('NOT_SELLER');
        const adExpires = Number(ad.expiresAtSeconds);
        if (now >= adExpires) return bad('AD_EXPIRED');
        sessions.delete(id);
        const fresh: Session = { id, role: 'seller', ad: env.ad, orderId: address.orderId, seller, buyer: from, buyerAddress: env.body.buyerAddress as string, adExpires,
          adMin: BigInt(ad.amountMin), adMax: BigInt(ad.amountMax), state: 'taken', terms: null };
        if (!admit(fresh, now)) return bad('LIMIT_EXCEEDED');
        seen.set(rumor.id, expires);
        return { ok: true, value: Object.freeze({ sessionId: id, rumorId: rumor.id, type: env.type, from, state: fresh.state, termsHash: null, reviewed: null }) };
      }

      if (session === undefined) return bad('UNKNOWN_SESSION');
      if (now >= session.adExpires) return bad('AD_EXPIRED');
      // accept/reject must come from the counterparty that sent the take-request (the session's buyer).
      if ((env.type === 'terms-accept' || env.type === 'terms-reject') && from !== session.buyer) return bad('NOT_COUNTERPARTY');
      const senderRole: Role = from === session.seller ? 'seller' : 'buyer';
      if (from !== session.seller && from !== session.buyer) return bad('NOT_COUNTERPARTY');
      if (transition(session.state, env.type, senderRole) === null) return bad('OUT_OF_ORDER');

      let reviewed: ReviewedEvmTerms | null = null;
      if (env.type === 'terms-offer') {
        const text = env.body.terms as string;
        let bytes: Uint8Array;
        try { bytes = new TextEncoder().encode(text); } catch { return bad('MALFORMED'); }
        const checked = await reviewForSession(session, bytes, now);
        if (!checked.ok) return checked;
        if (checked.value.hash !== env.termsHash) return bad('HASH_MISMATCH');
        session = sessions.get(id);
        if (session === undefined || session.state !== 'taken') return bad('OUT_OF_ORDER');
        session.terms = { hash: checked.value.hash, bytes, reviewed: checked.value.reviewed };
        reviewed = checked.value.reviewed;
      } else if (env.type === 'terms-accept' || env.type === 'terms-reject') {
        if (session.terms === null || env.termsHash !== session.terms.hash) return bad('HASH_MISMATCH');
        if (env.type === 'terms-accept' && env.body.revision !== session.terms.reviewed.revision) return bad('REVISION_MISMATCH');
      } else if (session.terms !== null && env.termsHash !== null && env.termsHash !== session.terms.hash) return bad('HASH_MISMATCH');
      else if (session.terms === null && env.termsHash !== null) return bad('HASH_MISMATCH');

      session.state = transition(session.state, env.type, senderRole)!;
      seen.set(rumor.id, expires);
      return { ok: true, value: Object.freeze({ sessionId: id, rumorId: rumor.id, type: env.type, from, state: session.state, termsHash: env.termsHash, reviewed }) };
    },
  };
  return Object.freeze(exchange);
}
