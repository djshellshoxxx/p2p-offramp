/**
 * Encrypted G16 terms exchange over NIP-17 (kind-14 rumor -> NIP-44 seal -> NIP-59 gift wrap), bound to a G19 advert.
 *
 * Flow: buyer `take` -> seller `offer` (canonical G16 terms bytes) -> buyer local review (domain `reviewTermsBytes`
 * against an injected registry) -> buyer `accept` / `reject`; either side may `cancel` before an accept.
 *
 * Authority: relay messages and chat are discovery and communication only. A session reaching `accepted` is NOT funding;
 * it only means the buyer sent an acceptance of exactly the bytes local review approved. Funding, release and refund are
 * decided by chain observation (packages/domain authority). Sessions are bounded, in-memory and never persisted.
 *
 * Admission and replay policy (REDTEAM-P2-EX2/EX3). Direction set by the owner's 2026-11-18 consolidation brief: protect
 * selected, admitted and progressing conversations; reserve capacity for them; accept that anonymous finite-memory
 * discovery cannot admit every honest newcomer under unlimited Sybil traffic. Attacker model: anyone can mint Nostr keys
 * for free and send any number of well-formed take-requests; memory is finite; there is no identity server, fee or
 * proof of work. Guarantees:
 * - Untrusted intake is a seller-side session the seller has neither selected nor answered (no terms offered), including
 *   the cancelled tombstone of such a session. It is the only kind of session ever displaced, and only once it holds no
 *   unexpired replay id and no local send is in flight for it. So a flood never pushes out a buyer whose take is still
 *   live, a selected session, an offered/accepted session, or a buyer-side session; the newcomer is refused with
 *   LIMIT_EXCEEDED instead.
 * - The hold is short and the same for everyone: on the seller side every message from a buyer must expire within
 *   `max(messageTtlSeconds, default TTL) + MAX_FUTURE_SKEW_SECONDS` of receipt (17 minutes at the defaults) and no later
 *   than the advert. A key holds a slot for at most two such windows (a take, then a cancel sent just before the take
 *   expires); after that the oldest idle intake is displaced first. Honest builds use min(now + ttl, advert expiry).
 * - A buyer key cannot refresh its own unanswered slot by cancelling and re-taking: a re-take over an unanswered
 *   tombstone that still holds replay ids is refused (OUT_OF_ORDER) until those ids expire.
 * - Every retained replay id belongs to a session that still occupies a slot: cancelled, rejected and advert-expired
 *   sessions stay as tombstones until their last replay id expires, so no retained id outlives the capacity it was
 *   admitted under. Replay ids are bounded by maxSessions x maxSeenMessagesPerSession.
 * - Isolation: intake is capped per advert (maxIntakeSessionsPerAd, default half of maxSessionsPerAd) and in total
 *   (maxIntakeSessions, default three quarters of maxSessions). At the defaults a flood on up to five adverts cannot
 *   occupy another advert's intake, and the remaining quarter stays available for the user's own buyer-side takes and
 *   for selected sessions. Messages of existing sessions are never refused for shared replay memory.
 * - maxSeenMessages is a backstop on opening sessions. At the defaults (1024 = 64 x 16) it is unreachable; a smaller
 *   configured value can still refuse openings on every advert once the total is reached.
 * - Refused takes get no reply (the buyer learns nothing and keeps its local `taken` session until it cancels). The app
 *   must call `select` when the seller opens a request, so a slow human answer never loses the session.
 */
import { reviewTermsBytes } from '../../domain/index.ts';
import type { RegistryLookup, ReviewedEvmTerms, TermsReviewRejection } from '../../domain/index.ts';
import { createGiftWrap, createSeal, createUnsignedEvent, unwrapGiftWrap, KIND_PRIVATE_DIRECT_MESSAGE, MAX_RUMOR_JSON_BYTES } from '../../nostr-crypto/index.ts';
import type { EventLimits, NostrEvent, NostrMessagingProvider } from '../../nostr-crypto/index.ts';
import type { OrderBook } from '../../relay/index.ts';
import { transition } from './machine.ts';
import type { Role, SessionState } from './machine.ts';
import {
  adAddress, adBookKey, encodeEnvelope, envelopeTags, isEvmAddress, isHex64, MAX_ENVELOPE_BYTES, MAX_ENVELOPE_V2_BYTES, MAX_FUTURE_SKEW_SECONDS,
  MAX_MESSAGE_LIFETIME_SECONDS, MAX_OFFER_TERMS_BYTES, parseAdAddress, parseEnvelope, parseVersionedEnvelope,
} from './messages.ts';
import type { CancelReason, ExchangeEnvelope, ExchangeEnvelopeV1, MessageType, PeerAcceptanceWire, RejectReason } from './messages.ts';

export type ExchangeCode =
  | 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'CLOSED' | 'WRAP_INVALID' | 'MALFORMED' | 'NOT_ADDRESSED' | 'EXPIRED' | 'AD_UNAVAILABLE' | 'AD_EXPIRED'
  | 'AD_MISMATCH' | 'DUPLICATE' | 'UNKNOWN_SESSION' | 'OUT_OF_ORDER' | 'NOT_SELLER' | 'NOT_COUNTERPARTY' | 'REVIEW_FAILED' | 'TERMS_MISMATCH'
  | 'HASH_MISMATCH' | 'REVISION_MISMATCH' | 'WRONG_SIGNER'
  // Protocol v2 only (never produced by a v1 exchange):
  | 'VERSION_MISMATCH' | 'SELLER_FIRST' | 'ACCEPTANCE_INVALID' | 'REPLAY_REFUSED' | 'REPLAY_UNAVAILABLE'
  /** The durable replay ledger has no room for another termsHash (the EVM candidate ledger keeps at most 64, without eviction). */
  | 'REPLAY_FULL';
export type ExchangeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: ExchangeCode; readonly review?: TermsReviewRejection };

export const EXCHANGE_LIMITS = Object.freeze({ maxSessions: 64, maxSessionsPerAd: 16, maxSeenMessages: 1024, maxSeenMessagesPerSession: 16, defaultMessageTtlSeconds: 900 });
const RUMOR_LIMITS: EventLimits = Object.freeze({ maxContentBytes: MAX_ENVELOPE_BYTES, maxTags: 4, maxTagItems: 2, maxTagItemBytes: 256,
  maxJsonBytes: MAX_RUMOR_JSON_BYTES, allowedKinds: [KIND_PRIVATE_DIRECT_MESSAGE] });

/** Exchange protocol. 1 (default) is the unchanged communication-only exchange; 2 adds D1 Option B wallet proofs. */
export type ExchangeProtocolVersion = 1 | 2;
/** A local send's request to the injected port: produce this party's wallet proof for the reviewed terms. */
export interface PeerAcceptanceSendRequest {
  /** The local party's role; the proof is signed by the terms' account for this role. */
  readonly role: Role; readonly reviewed: ReviewedEvmTerms; readonly termsHash: string;
  /** Local messaging key (signer's own key) and the session counterparty's key. */
  readonly sender: string; readonly recipient: string;
  /** Signed binding expiry the exchange chooses: the reviewed acceptBeforeSeconds. */
  readonly notAfterSeconds: string;
}
/** Trusted context for verification. Every field comes from the authenticated session and local clock, never the carrier. */
export interface PeerAcceptanceTrustedContext {
  /** Role of the proof's signer (the envelope sender). */
  readonly role: Role; readonly sender: string; readonly recipient: string; readonly ad: string;
  readonly orderId: string; readonly revision: string; readonly termsHash: string; readonly nowSeconds: string;
}
/** A verified binding. Communication evidence only: it is not funding, payment or chain authority. */
export interface VerifiedPeerAcceptance {
  readonly role: Role; readonly termsHash: string; readonly bindingHash: string; readonly account: string;
  readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  readonly notAfterSeconds: string;
  /** min(acceptBeforeSeconds, notAfterSeconds, envelope expiry) checked at verification. */
  readonly effectiveNotAfterSeconds: string;
}
/** CONFLICT: tombstoned or conflicting binding. LIMIT_EXCEEDED: the durable ledger is full. UNAVAILABLE: anything else. */
export type PeerAcceptancePortResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: 'CONFLICT' | 'LIMIT_EXCEEDED' | 'UNAVAILABLE' };
/**
 * Injected D1 Option B port, so this package stays chain-free (packages/wallet `createEvmPeerAcceptancePort` implements it
 * for EVM EOAs over the encrypted replay ledger). Durability of admit/tombstone is the implementation's responsibility.
 */
export interface PeerAcceptancePort {
  /** Sign and encode the local party's carrier for a send. null or a throw refuses the send. */
  encode(request: PeerAcceptanceSendRequest): Promise<PeerAcceptanceWire | null>;
  /** Verify a v2 envelope (exact rumor content) against locally reviewed terms and trusted context. null refuses it. */
  verify(envelopeText: string, reviewed: ReviewedEvmTerms, context: PeerAcceptanceTrustedContext): Promise<VerifiedPeerAcceptance | null>;
  /** Durably admit a binding returned by `verify` (one (termsHash, role) binding; identical resend = duplicate; tombstoned/conflict = CONFLICT). */
  admit(verified: VerifiedPeerAcceptance): Promise<PeerAcceptancePortResult<'recorded' | 'duplicate'>>;
  /** Durably and irreversibly refuse every later binding for termsHash (cancel / terms-reject). */
  tombstone(termsHash: string): Promise<PeerAcceptancePortResult<void>>;
}
/** A v2 session's verified wallet bindings, for a canonical funding gate. Never authority on its own. */
export interface SessionAcceptances {
  readonly sessionId: string; readonly state: SessionState; readonly termsHash: string | null;
  readonly seller: VerifiedPeerAcceptance | null; readonly buyer: VerifiedPeerAcceptance | null;
  /**
   * Both roles verified and durably admitted for this session's reviewed termsHash, seller first, session `accepted`, and
   * no withdrawal (cancel / terms-reject tombstone) of that termsHash was ever started by this exchange.
   */
  readonly bothVerified: boolean;
}

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
  /**
   * Sessions per advert, tombstones included. A full advert (or exchange) may displace only its oldest evictable intake
   * session (see the policy above); otherwise the new take is refused with LIMIT_EXCEEDED.
   */
  readonly maxSessionsPerAd?: number;
  /**
   * Untrusted intake sessions in total. Defaults to maxSessions minus a quarter of it, so the remaining slots stay
   * available for buyer-side takes and for sessions the seller selected. Clamped to [1, maxSessions].
   */
  readonly maxIntakeSessions?: number;
  /** Untrusted intake sessions per advert. Defaults to half of maxSessionsPerAd. Clamped to [1, maxSessionsPerAd]. */
  readonly maxIntakeSessionsPerAd?: number;
  /** Replay ids remembered in total. Only operations that open a session (take) are refused when it is full. */
  readonly maxSeenMessages?: number;
  /** Replay ids remembered per session (ad + buyer key), so one peer cannot exhaust the shared memory. Clamped to maxSeenMessages. */
  readonly maxSeenMessagesPerSession?: number;
  readonly messageTtlSeconds?: number;
  /** Default 1: the exact current behavior and envelopes. 2 requires `peerAcceptance`. */
  readonly protocolVersion?: ExchangeProtocolVersion;
  /** Required for (and only allowed with) protocolVersion 2. */
  readonly peerAcceptance?: PeerAcceptancePort;
}
export interface SessionView {
  readonly id: string; readonly role: Role; readonly ad: string; readonly orderId: string; readonly seller: string; readonly buyer: string;
  readonly buyerAddress: string; readonly state: SessionState; readonly adExpiresAtSeconds: number;
  /** Seller side only: the seller pinned this `taken` session with `select`, so new intake can never displace it. */
  readonly selected: boolean;
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
  /**
   * Seller: pin a live `taken` session so later intake can never displace it while the seller prepares an offer.
   * Local only: nothing is sent. Idempotent. The seller removes a pinned session by cancelling it.
   */
  select(sessionId: string): ExchangeResult<SessionView>;
  /** Process one gift wrap delivered by the relay pool. */
  receive(wrap: unknown, secret: Uint8Array): Promise<ExchangeResult<ReceivedMessage | { readonly own: true; readonly rumorId: string }>>;
  session(sessionId: string): SessionView | null;
  /** Protocol v2: the session's verified seller and buyer bindings. null for unknown sessions and on a v1 exchange. */
  acceptances(sessionId: string): SessionAcceptances | null;
  /** Sessions held, tombstones included. */
  readonly sessionCount: number;
  /** Unexpired replay ids retained (diagnostics and bounds tests). Every one belongs to a held session. */
  readonly replayIdCount: number;
  close(): void;
}

interface Session {
  readonly id: string; readonly role: Role; readonly ad: string; readonly orderId: string; readonly seller: string; readonly buyer: string;
  readonly buyerAddress: string; readonly adExpires: number; readonly adMin: bigint; readonly adMax: bigint;
  /** The signed advert's network, asset and fiat currency; reviewed terms must name exactly these. */
  readonly adNetwork: string; readonly adAsset: string; readonly adCurrency: string;
  state: SessionState; terms: { hash: string; bytes: Uint8Array; reviewed: ReviewedEvmTerms } | null;
  /** Seller pinned it (`select`). */
  selected: boolean;
  /** Local sends in flight for this session object; a pinned session is never evicted. */
  pins: number;
  /** Protocol v2: verified and admitted bindings by role. Always both null on v1. */
  acceptances: { seller: VerifiedPeerAcceptance | null; buyer: VerifiedPeerAcceptance | null };
  /** Protocol v2: a tombstone was requested for this session's terms. Set before the first await and never cleared. */
  withdrawn: boolean;
}
interface BuiltMessage {
  envelope: ExchangeEnvelope; content: string; rumorId: string; recipientWrap: NostrEvent; selfWrap: NostrEvent;
}
const bad = (code: ExchangeCode, review?: TermsReviewRejection): { ok: false; code: ExchangeCode; review?: TermsReviewRejection } =>
  review === undefined ? { ok: false, code } : { ok: false, code, review };
const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
/** Bound on the in-process withdrawal memory (the durable ledger is the authority beyond it). */
const MAX_WITHDRAWN_HASHES = 1024;
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
export const sessionIdFor = (ad: string, buyer: string): string => `${ad}|${buyer}`;

export function createTermsExchange(options: ExchangeOptions): TermsExchange {
  const { provider, selfPublicKey: self, registry } = options;
  if (!isHex64(self) || typeof provider?.publicKey !== 'function' || typeof options.hashTerms !== 'function' || typeof options.now !== 'function') throw new TypeError('INVALID_OPTIONS');
  const maxSessions = options.maxSessions ?? EXCHANGE_LIMITS.maxSessions;
  const maxPerAd = options.maxSessionsPerAd ?? EXCHANGE_LIMITS.maxSessionsPerAd;
  const maxSeen = options.maxSeenMessages ?? EXCHANGE_LIMITS.maxSeenMessages;
  const perSessionOption = options.maxSeenMessagesPerSession ?? EXCHANGE_LIMITS.maxSeenMessagesPerSession;
  const ttl = options.messageTtlSeconds ?? EXCHANGE_LIMITS.defaultMessageTtlSeconds;
  const intakeOption = options.maxIntakeSessions ?? maxSessions - Math.floor(maxSessions / 4);
  const intakePerAdOption = options.maxIntakeSessionsPerAd ?? Math.max(1, Math.floor(maxPerAd / 2));
  if (![maxSessions, maxPerAd, maxSeen, perSessionOption, ttl, intakeOption, intakePerAdOption].every(value => Number.isSafeInteger(value) && value >= 1) || ttl > MAX_MESSAGE_LIFETIME_SECONDS) throw new RangeError('INVALID_OPTIONS');
  const maxSeenPerSession = Math.min(perSessionOption, maxSeen);
  const maxIntake = Math.min(intakeOption, maxSessions);
  const maxIntakePerAd = Math.min(intakePerAdOption, maxPerAd);
  const version = options.protocolVersion ?? 1;
  if (version !== 1 && version !== 2) throw new RangeError('INVALID_OPTIONS');
  const port = options.peerAcceptance;
  if (version === 1 ? port !== undefined : port === undefined || port === null || typeof port !== 'object' ||
    !(['encode', 'verify', 'admit', 'tombstone'] as const).every(name => typeof port[name] === 'function')) throw new TypeError('INVALID_OPTIONS');
  // Insertion order is admission order: the first evictable intake session found is the least recently admitted.
  const sessions = new Map<string, Session>();
  /**
   * session id (ad|buyer key) -> rumor id -> message expiry. Only expired entries are ever removed, and a session leaves
   * `sessions` only when its map holds no unexpired entry, so a live replay is always recognised and every retained id
   * belongs to a held session. Each session's memory is bounded on its own; the total bound only refuses opening new
   * sessions, never messages of sessions that are already live.
   */
  const seen = new Map<string, Map<string, number>>();
  let seenEntries = 0;
  // Only the newest in-flight take for a pair may commit, even if a newer
  // session has since become terminal or been pruned. Tokens are bounded.
  const pendingTakes = new Map<string, symbol>();
  /**
   * Protocol v2: termsHashes this exchange started to tombstone (oldest first, bounded). Consulted before signing and
   * around every admit so a withdrawal and an acceptance of the same terms never both commit. The durable ledger stays
   * the authority across restarts; this only closes the in-process window and spares wallet prompts.
   */
  const withdrawnHashes = new Set<string>();
  let closed = false;

  const clock = (): number | null => { try { const value = options.now(); return Number.isSafeInteger(value) && value >= 0 ? value : null; } catch { return null; } };
  const view = (s: Session): SessionView => Object.freeze({ id: s.id, role: s.role, ad: s.ad, orderId: s.orderId, seller: s.seller, buyer: s.buyer, buyerAddress: s.buyerAddress,
    state: s.state, adExpiresAtSeconds: s.adExpires, selected: s.selected,
    terms: s.terms === null ? null : Object.freeze({ hash: s.terms.hash, bytes: new Uint8Array(s.terms.bytes), reviewed: s.terms.reviewed }) });
  function sweep(now: number): void {
    for (const [sessionId, ids] of seen) {
      for (const [rumorId, expiry] of ids) if (expiry <= now) { ids.delete(rumorId); seenEntries--; }
      if (ids.size === 0) seen.delete(sessionId);
    }
  }
  function remember(sessionId: string, rumorId: string, expiry: number): void {
    let ids = seen.get(sessionId);
    if (ids === undefined) { ids = new Map(); seen.set(sessionId, ids); }
    if (!ids.has(rumorId)) seenEntries++;
    ids.set(rumorId, expiry);
  }
  /** After `sweep`: the session still carries a replay obligation. */
  const holdsReplay = (s: Session): boolean => (seen.get(s.id)?.size ?? 0) > 0;
  /** Finished from this side's view: it can be replaced by a new take from the same pair. */
  const finished = (s: Session, now: number): boolean => s.state === 'cancelled' || s.state === 'rejected' || now >= s.adExpires;
  /** Untrusted intake: opened by an anonymous peer, not selected and not answered (no terms), tombstones included. */
  const untrusted = (s: Session): boolean => s.role === 'seller' && s.terms === null && !s.selected;
  /** Only idle intake whose take-request has expired may be displaced; its slot then carries no replay obligation. */
  const evictable = (s: Session): boolean => untrusted(s) && s.pins === 0 && !holdsReplay(s);
  /** Drop finished sessions once their last replay id has expired; until then they stay as tombstones. */
  function purge(now: number): void {
    sweep(now);
    for (const [id, s] of sessions) if (finished(s, now) && s.pins === 0 && !holdsReplay(s)) sessions.delete(id);
  }
  /** `opening`: the message would create a session; only then does the shared total apply. */
  function replayError(sessionId: string, id: string | null, now: number, opening: boolean): ExchangeCode | null {
    // Capacity is checked again immediately before each synchronous state commit.
    // Concurrent crypto/review completions cannot overbook or evict live replay ids.
    sweep(now);
    const ids = seen.get(sessionId);
    if (id !== null && ids?.has(id) === true) return 'DUPLICATE';
    if ((ids?.size ?? 0) >= maxSeenPerSession) return 'LIMIT_EXCEEDED';
    return opening && seenEntries >= maxSeen ? 'LIMIT_EXCEEDED' : null;
  }
  function readyToCommit(s: Session, expectedState: SessionState | null, id: string, expires: number, acceptBefore?: string): ExchangeResult<number> {
    if (closed) return bad('CLOSED');
    const now = clock();
    if (now === null) return bad('INVALID_INPUT');
    if (closed) return bad('CLOSED');
    const current = sessions.get(s.id);
    if (expectedState === null) {
      if (current !== undefined && current.state !== 'cancelled' && current.state !== 'rejected' && now < current.adExpires) return bad('OUT_OF_ORDER');
    } else if (current !== s || s.state !== expectedState) return bad('OUT_OF_ORDER');
    if (now >= s.adExpires) return bad('AD_EXPIRED');
    if (now >= expires || (acceptBefore !== undefined && BigInt(acceptBefore) <= BigInt(now))) return bad('EXPIRED');
    const replay = replayError(s.id, id, now, expectedState === null); if (replay !== null) return bad(replay);
    return { ok: true, value: now };
  }
  /**
   * Admit `s` atomically, replacing a finished session of the same pair (whose replay ids stay with the pair). Caps:
   * per advert, in total, and for untrusted intake. Only evictable intake is displaced, oldest first and from the same
   * advert when that advert is the full one. Synchronous, so concurrent completions cannot overbook. Nothing changes
   * (beyond dropping already-dead tombstones) unless admission succeeds.
   */
  function admit(s: Session, now: number): boolean {
    const previous = sessions.get(s.id);
    if (previous !== undefined && !finished(previous, now)) return false;
    const victims = new Set<string>();
    const held = (other: Session): boolean => other.id !== s.id && !victims.has(other.id);
    const count = (filter: (other: Session) => boolean): number => { let n = 0; for (const other of sessions.values()) if (held(other) && filter(other)) n++; return n; };
    const adFull = (): boolean => count(other => other.ad === s.ad) >= maxPerAd ||
      (untrusted(s) && count(other => other.ad === s.ad && untrusted(other)) >= maxIntakePerAd);
    const fits = (): boolean => !adFull() && count(() => true) < maxSessions && (!untrusted(s) || count(untrusted) < maxIntake);
    if (!fits()) purge(now);
    while (!fits()) {
      const sameAdOnly = adFull();
      let victim: Session | undefined;
      for (const other of sessions.values()) if (held(other) && evictable(other) && (!sameAdOnly || other.ad === s.ad)) { victim = other; break; }
      if (victim === undefined) return false;
      victims.add(victim.id);
    }
    for (const id of victims) sessions.delete(id);
    // Re-insert so admission order stays insertion order.
    sessions.delete(s.id); sessions.set(s.id, s); return true;
  }

  /** Local review plus every binding of the terms to this session; shared by seller (before offering) and buyer (on receipt). */
  async function reviewForSession(s: Session, bytes: Uint8Array): Promise<ExchangeResult<{ reviewed: ReviewedEvmTerms; hash: string }>> {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_OFFER_TERMS_BYTES) return bad('LIMIT_EXCEEDED');
    const result = await reviewTermsBytes(registry, bytes, options.sha256);
    if (!result.ok) return bad('REVIEW_FAILED', result.code);
    const reviewed = result.value;
    if (reviewed.orderId !== s.orderId || reviewed.buyer !== s.buyerAddress) return bad('TERMS_MISMATCH');
    // The advert's signed network, asset and fiat currency bind the offer; the amount range is only meaningful in that asset.
    // Adverts name the network by registry id or by its CAIP-2 chain id (eip155:<chainId>).
    if (reviewed.asset.id !== s.adAsset || reviewed.agreement.fiatCurrency !== s.adCurrency ||
      (s.adNetwork !== reviewed.network.id && s.adNetwork !== `eip155:${reviewed.network.chainId}`)) return bad('AD_MISMATCH');
    const amount = BigInt(reviewed.amountBaseUnits);
    if (amount < s.adMin || amount > s.adMax) return bad('AD_MISMATCH');
    const now = clock(); if (now === null) return bad('INVALID_INPUT');
    if (BigInt(reviewed.acceptBeforeSeconds) <= BigInt(now)) return bad('EXPIRED');
    let hash: unknown;
    try { hash = options.hashTerms(reviewed); } catch { return bad('INVALID_INPUT'); }
    if (!isHex64(hash)) return bad('INVALID_INPUT');
    return { ok: true, value: { reviewed, hash } };
  }

  /**
   * Build, wrap (recipient + self copy) and return a message. Does not touch state. `v2` (protocol v2 offer/accept only)
   * builds a version 2 envelope under the v2 byte budget; `acceptance` produces the body's wallet proof once the
   * recipient and expiry are fixed. Everything else builds the exact v1 envelope.
   */
  async function build(s: Session, type: MessageType, body: Record<string, unknown>, termsHash: string | null, secret: Uint8Array,
    acceptance?: (recipient: string) => Promise<ExchangeResult<PeerAcceptanceWire>>): Promise<ExchangeResult<BuiltMessage>> {
    try {
      if (await provider.publicKey(secret) !== self) return bad('WRONG_SIGNER');
      if (closed) return bad('CLOSED');
      const now = clock(); if (now === null) return bad('INVALID_INPUT');
      const recipient = s.role === 'seller' ? s.buyer : s.seller;
      const expires = Math.min(now + ttl, s.adExpires);
      if (expires <= now) return bad('AD_EXPIRED');
      const nonce = new Uint8Array(32); globalThis.crypto.getRandomValues(nonce);
      let envelope: ExchangeEnvelope;
      if (acceptance === undefined) {
        const v1: ExchangeEnvelopeV1 = { v: 1, type, ad: s.ad, orderId: s.orderId, sender: self, recipient, nonce: toHex(nonce), expiresAtSeconds: String(expires), termsHash, body };
        envelope = v1;
      } else {
        if ((type !== 'terms-offer' && type !== 'terms-accept') || termsHash === null) return bad('INVALID_INPUT');
        const proof = await acceptance(recipient); if (!proof.ok) return proof;
        if (closed) return bad('CLOSED');
        envelope = { v: 2, type, ad: s.ad, orderId: s.orderId, sender: self, recipient, nonce: toHex(nonce), expiresAtSeconds: String(expires), termsHash,
          body: { ...body, acceptance: proof.value } };
      }
      const content = encodeEnvelope(envelope);
      if (new TextEncoder().encode(content).byteLength > (envelope.v === 2 ? MAX_ENVELOPE_V2_BYTES : MAX_ENVELOPE_BYTES)) return bad('LIMIT_EXCEEDED');
      // A v2 send must be exactly what a v2 receiver parses (no unvalidated port output on the wire).
      if (envelope.v === 2 && parseVersionedEnvelope(content)?.v !== 2) return bad('ACCEPTANCE_INVALID');
      const rumor = createUnsignedEvent(self, { kind: KIND_PRIVATE_DIRECT_MESSAGE, created_at: now, tags: envelopeTags(envelope), content }, RUMOR_LIMITS);
      if (new TextEncoder().encode(JSON.stringify(rumor)).byteLength > MAX_RUMOR_JSON_BYTES) return bad('LIMIT_EXCEEDED');
      const recipientWrap = await createGiftWrap(await createSeal(rumor, secret, recipient, provider, now), recipient, provider, now);
      const selfWrap = await createGiftWrap(await createSeal(rumor, secret, self, provider, now), self, provider, now);
      if (closed) return bad('CLOSED');
      return { ok: true, value: { envelope, content, rumorId: rumor.id, recipientWrap, selfWrap } };
    } catch { return bad('INVALID_INPUT'); }
  }
  const sent = (s: Session, type: MessageType, built: { rumorId: string; recipientWrap: NostrEvent; selfWrap: NostrEvent }, expires: string): SentMessage => {
    remember(s.id, built.rumorId, Number(expires));
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

  // ---- Protocol v2 (D1 Option B). None of these run on a v1 exchange. ----
  /** The local party's proof for a v2 send, produced by the injected port once the recipient is fixed. */
  const encodeProof = (role: Role, reviewed: ReviewedEvmTerms, termsHash: string) => async (recipient: string): Promise<ExchangeResult<PeerAcceptanceWire>> => {
    try {
      const wire = await port!.encode(Object.freeze({ role, reviewed, termsHash, sender: self, recipient, notAfterSeconds: reviewed.acceptBeforeSeconds }));
      return wire === null || typeof wire !== 'object' ? bad('ACCEPTANCE_INVALID') : { ok: true, value: wire };
    } catch { return bad('ACCEPTANCE_INVALID'); }
  };
  const decimal = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
  /**
   * Verify one carrier through the port with trusted session context, then re-check the port's answer against the
   * session (role, keys, account, terms hash, deadlines) instead of trusting it. Returns the port's object (for admit)
   * and an own frozen copy (recorded on the session).
   */
  async function verifyProof(s: Session, content: string, role: Role, reviewed: ReviewedEvmTerms, termsHash: string, now: number, expires: number):
    Promise<ExchangeResult<{ original: VerifiedPeerAcceptance; copy: VerifiedPeerAcceptance }>> {
    const sender = role === 'seller' ? s.seller : s.buyer, recipient = role === 'seller' ? s.buyer : s.seller;
    let result: unknown;
    try {
      result = await port!.verify(content, reviewed, Object.freeze({ role, sender, recipient, ad: s.ad, orderId: s.orderId,
        revision: reviewed.revision, termsHash, nowSeconds: String(now) }));
    } catch { return bad('ACCEPTANCE_INVALID'); }
    if (closed) return bad('CLOSED');
    if (typeof result !== 'object' || result === null) return bad('ACCEPTANCE_INVALID');
    try {
      const r = result as Record<string, unknown>;
      const copy = { role: r.role, termsHash: r.termsHash, bindingHash: r.bindingHash, account: r.account, ownMessagingKey: r.ownMessagingKey,
        counterpartyMessagingKey: r.counterpartyMessagingKey, notAfterSeconds: r.notAfterSeconds, effectiveNotAfterSeconds: r.effectiveNotAfterSeconds };
      if (copy.role !== role || copy.termsHash !== termsHash || !isHex64(copy.bindingHash) || copy.account !== reviewed[role] ||
        copy.ownMessagingKey !== sender || copy.counterpartyMessagingKey !== recipient || !decimal(copy.notAfterSeconds) || !decimal(copy.effectiveNotAfterSeconds)) return bad('ACCEPTANCE_INVALID');
      const effective = BigInt(copy.effectiveNotAfterSeconds);
      if (effective > BigInt(copy.notAfterSeconds) || effective > BigInt(reviewed.acceptBeforeSeconds) || effective > BigInt(expires)) return bad('ACCEPTANCE_INVALID');
      if (effective <= BigInt(now)) return bad('EXPIRED');
      return { ok: true, value: { original: result as VerifiedPeerAcceptance, copy: Object.freeze(copy) as VerifiedPeerAcceptance } };
    } catch { return bad('ACCEPTANCE_INVALID'); }
  }
  const replayRefusal = (result: unknown): ExchangeResult<void> => {
    const r = result as PeerAcceptancePortResult<unknown> | null | undefined;
    if (r?.ok === true) return { ok: true, value: undefined };
    return bad(r?.ok === false && r.code === 'CONFLICT' ? 'REPLAY_REFUSED' : r?.ok === false && r.code === 'LIMIT_EXCEEDED' ? 'REPLAY_FULL' : 'REPLAY_UNAVAILABLE');
  };
  const isWithdrawn = (s: Session, termsHash: string): boolean => s.withdrawn || withdrawnHashes.has(termsHash);
  /** Synchronous, before any await: from here on no admit for this session or termsHash may commit. */
  function markWithdrawn(s: Session, termsHash: string): void {
    s.withdrawn = true;
    withdrawnHashes.delete(termsHash); withdrawnHashes.add(termsHash);
    while (withdrawnHashes.size > MAX_WITHDRAWN_HASHES) withdrawnHashes.delete(withdrawnHashes.values().next().value!);
  }
  /**
   * Verify, durably admit and re-check a carrier for `s` in `expectedState`. The last readyToCommit runs after the final
   * await, so the caller commits synchronously. A binding admitted just before a later refusal stays recorded: an
   * identical resend is then a duplicate and any different binding a conflict (fail closed).
   */
  async function proveAndAdmit(s: Session, expectedState: SessionState, rumorId: string, expires: number, content: string, role: Role,
    reviewed: ReviewedEvmTerms, termsHash: string, now: number): Promise<ExchangeResult<VerifiedPeerAcceptance>> {
    const verified = await verifyProof(s, content, role, reviewed, termsHash, now, expires); if (!verified.ok) return verified;
    const deadline = verified.value.copy.effectiveNotAfterSeconds;
    const before = readyToCommit(s, expectedState, rumorId, expires, deadline); if (!before.ok) return before;
    if (isWithdrawn(s, termsHash)) return bad('REPLAY_REFUSED');
    let admitted: unknown;
    try { admitted = await port!.admit(verified.value.original); } catch { return bad('REPLAY_UNAVAILABLE'); }
    if (closed) return bad('CLOSED');
    const refused = replayRefusal(admitted); if (!refused.ok) return refused;
    const after = readyToCommit(s, expectedState, rumorId, expires, deadline); if (!after.ok) return after;
    // A withdrawal started while admit was in flight wins: its tombstone may already be durable.
    if (isWithdrawn(s, termsHash)) return bad('REPLAY_REFUSED');
    return { ok: true, value: verified.value.copy };
  }
  /**
   * Durably tombstone `termsHash` (cancel / terms-reject in a v2 session) and re-check before the synchronous commit.
   * The caller has just passed readyToCommit synchronously. The withdrawal is marked before the first await, so an
   * admit racing it is refused, the session can never commit `accepted` meanwhile, and a failed or refused
   * withdrawal still fails closed (bothVerified stays false, the terms are never signed again by this exchange).
   */
  async function tombstoneThenReady(s: Session, expectedState: SessionState, rumorId: string, expires: number, termsHash: string): Promise<ExchangeResult<number>> {
    markWithdrawn(s, termsHash);
    let result: unknown;
    try { result = await port!.tombstone(termsHash); } catch { return bad('REPLAY_UNAVAILABLE'); }
    if (closed) return bad('CLOSED');
    const refused = replayRefusal(result);
    // A tombstone is irreversible; only an unavailable or full store can fail it (it never conflicts).
    if (!refused.ok) return bad(refused.code === 'REPLAY_FULL' ? 'REPLAY_FULL' : 'REPLAY_UNAVAILABLE');
    return readyToCommit(s, expectedState, rumorId, expires);
  }
  /** Seller-first: the buyer may accept only terms whose seller binding is verified, recorded and still within its signed expiry. */
  function sellerFirst(s: Session, now: number): ExchangeResult<VerifiedPeerAcceptance> {
    const seller = s.acceptances.seller;
    if (seller === null || s.terms === null || seller.termsHash !== s.terms.hash) return bad('SELLER_FIRST');
    if (BigInt(seller.notAfterSeconds) <= BigInt(now)) return bad('EXPIRED');
    return { ok: true, value: seller };
  }

  const exchange: TermsExchange = {
    get sessionCount() { return sessions.size; },
    get replayIdCount() { const now = clock(); if (now !== null) sweep(now); return seenEntries; },
    session: id => { const s = sessions.get(id); return s === undefined ? null : view(s); },
    acceptances: id => {
      if (version !== 2) return null;
      const s = sessions.get(id); if (s === undefined) return null;
      const { seller, buyer } = s.acceptances, termsHash = s.terms?.hash ?? null;
      return Object.freeze({ sessionId: s.id, state: s.state, termsHash, seller, buyer,
        bothVerified: s.state === 'accepted' && termsHash !== null && seller !== null && buyer !== null && seller.termsHash === termsHash && buyer.termsHash === termsHash &&
          !isWithdrawn(s, termsHash) });
    },
    close() { closed = true; sessions.clear(); seen.clear(); seenEntries = 0; pendingTakes.clear(); withdrawnHashes.clear(); },

    select(sessionId) {
      const live = liveSession(sessionId, 'seller', clock()); if (!live.ok) return live;
      const s = live.value;
      if (s.state !== 'taken') return bad('OUT_OF_ORDER');
      s.selected = true;
      return { ok: true, value: view(s) };
    },

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
        adMin: BigInt(ad.amountMin), adMax: BigInt(ad.amountMax), adNetwork: ad.networkId, adAsset: ad.assetId, adCurrency: ad.currency, state: 'taken', terms: null, selected: false, pins: 0, acceptances: { seller: null, buyer: null }, withdrawn: false };
      const replay = replayError(s.id, null, now, true); if (replay !== null) return bad(replay);
      const previous = sessions.get(s.id);
      if (previous !== undefined && previous.state !== 'cancelled' && previous.state !== 'rejected' && now < previous.adExpires) return bad('OUT_OF_ORDER');
      if (!pendingTakes.has(s.id) && pendingTakes.size >= maxSessions) return bad('LIMIT_EXCEEDED');
      const generation = Symbol();
      pendingTakes.set(s.id, generation);
      try {
        const built = await build(s, 'take-request', { buyerAddress, buyerMessagingKey: self }, null, secret);
        if (closed) return bad('CLOSED');
        if (!built.ok) return built;
        if (pendingTakes.get(s.id) !== generation) return bad('OUT_OF_ORDER');
        const ready = readyToCommit(s, null, built.value.rumorId, Number(built.value.envelope.expiresAtSeconds));
        if (!ready.ok) return ready;
        if (!admit(s, ready.value)) return bad('LIMIT_EXCEEDED');
        return { ok: true, value: sent(s, 'take-request', built.value, built.value.envelope.expiresAtSeconds) };
      } finally {
        if (pendingTakes.get(s.id) === generation) pendingTakes.delete(s.id);
      }
    },

    async offer(sessionId, termsBytes, secret) {
      const now = clock(); const live = liveSession(sessionId, 'seller', now); if (!live.ok) return live;
      const s = live.value;
      if (!(termsBytes instanceof Uint8Array)) return bad('INVALID_INPUT');
      if (transition(s.state, 'terms-offer', 'seller') === null) return bad('OUT_OF_ORDER');
      const replay = replayError(s.id, null, now!, false); if (replay !== null) return bad(replay);
      if (termsBytes.byteLength === 0 || termsBytes.byteLength > MAX_OFFER_TERMS_BYTES) return bad('LIMIT_EXCEEDED');
      const copy = new Uint8Array(termsBytes);
      // An offer being prepared is progress: new intake cannot displace the session while review and signing run.
      s.pins++;
      try {
        const checked = await reviewForSession(s, copy); if (closed) return bad('CLOSED');
        if (!checked.ok) return checked;
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(copy); } catch { return bad('INVALID_INPUT'); }
        // Terms this exchange withdrew are refused before the wallet is asked to sign (the ledger refuses them anyway).
        if (version === 2 && withdrawnHashes.has(checked.value.hash)) return bad('REPLAY_REFUSED');
        const built = await build(s, 'terms-offer', { terms: text }, checked.value.hash, secret,
          version === 2 ? encodeProof('seller', checked.value.reviewed, checked.value.hash) : undefined);
        if (closed) return bad('CLOSED');
        if (!built.ok) return built;
        const ready = readyToCommit(s, 'taken', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), checked.value.reviewed.acceptBeforeSeconds);
        if (!ready.ok) return ready;
        if (version === 2) {
          // The seller's own binding is verified and durably admitted like a received one (tombstones and conflicts refuse it).
          const proven = await proveAndAdmit(s, 'taken', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), built.value.content, 'seller',
            checked.value.reviewed, checked.value.hash, ready.value);
          if (!proven.ok) return proven;
          s.acceptances.seller = proven.value;
        }
        s.state = 'offered'; s.terms = { hash: checked.value.hash, bytes: copy, reviewed: checked.value.reviewed };
        return { ok: true, value: sent(s, 'terms-offer', built.value, built.value.envelope.expiresAtSeconds) };
      } finally { s.pins--; }
    },

    async accept(sessionId, termsBytes, secret) {
      const now = clock(); const live = liveSession(sessionId, 'buyer', now); if (!live.ok) return live;
      const s = live.value;
      if (!(termsBytes instanceof Uint8Array)) return bad('INVALID_INPUT');
      if (version === 2 && s.acceptances.seller === null) return bad('SELLER_FIRST');
      if (transition(s.state, 'terms-accept', 'buyer') === null || s.terms === null) return bad('OUT_OF_ORDER');
      // The acceptance covers exactly the bytes that passed local review; anything else is refused before signing.
      if (!sameBytes(s.terms.bytes, termsBytes)) return bad('TERMS_MISMATCH');
      if (BigInt(s.terms.reviewed.acceptBeforeSeconds) <= BigInt(now!)) return bad('EXPIRED');
      const replay = replayError(s.id, null, now!, false); if (replay !== null) return bad(replay);
      const { hash, reviewed } = s.terms;
      if (version === 2) {
        const first = sellerFirst(s, now!); if (!first.ok) return first;
        if (isWithdrawn(s, hash)) return bad('REPLAY_REFUSED');
      }
      const built = await build(s, 'terms-accept', { revision: reviewed.revision }, hash, secret,
        version === 2 ? encodeProof('buyer', reviewed, hash) : undefined);
      if (closed) return bad('CLOSED');
      if (!built.ok) return built;
      const ready = readyToCommit(s, 'offered', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), reviewed.acceptBeforeSeconds);
      if (!ready.ok) return ready;
      if (version === 2) {
        const first = sellerFirst(s, ready.value); if (!first.ok) return first;
        const proven = await proveAndAdmit(s, 'offered', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), built.value.content, 'buyer',
          reviewed, hash, ready.value);
        if (!proven.ok) return proven;
        s.acceptances.buyer = proven.value;
      }
      s.state = 'accepted';
      return { ok: true, value: sent(s, 'terms-accept', built.value, built.value.envelope.expiresAtSeconds) };
    },

    async reject(sessionId, reason, secret) {
      const now = clock(); const live = liveSession(sessionId, 'buyer', now); if (!live.ok) return live;
      const s = live.value;
      if (transition(s.state, 'terms-reject', 'buyer') === null || s.terms === null) return bad('OUT_OF_ORDER');
      const replay = replayError(s.id, null, now!, false); if (replay !== null) return bad(replay);
      const termsHash = s.terms.hash;
      const built = await build(s, 'terms-reject', { reason }, termsHash, secret);
      if (closed) return bad('CLOSED');
      if (!built.ok) return built;
      const ready = readyToCommit(s, 'offered', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds));
      if (!ready.ok) return ready;
      if (version === 2) {
        // Durable tombstone before the reject is released: these terms can never be offered or accepted again.
        const after = await tombstoneThenReady(s, 'offered', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), termsHash);
        if (!after.ok) return after;
      }
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
      const replay = replayError(s.id, null, now, false); if (replay !== null) return bad(replay);
      const expectedState = s.state;
      s.pins++;
      try {
        const termsHash = s.terms?.hash ?? null;
        const built = await build(s, 'cancel', { reason }, termsHash, secret);
        if (closed) return bad('CLOSED');
        if (!built.ok) return built;
        const ready = readyToCommit(s, expectedState, built.value.rumorId, Number(built.value.envelope.expiresAtSeconds));
        if (!ready.ok) return ready;
        if (version === 2 && termsHash !== null) {
          const after = await tombstoneThenReady(s, expectedState, built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), termsHash);
          if (!after.ok) return after;
        }
        s.state = 'cancelled';
        return { ok: true, value: sent(s, 'cancel', built.value, built.value.envelope.expiresAtSeconds) };
      } finally { s.pins--; }
    },

    async receive(wrap, secret) {
      if (closed) return bad('CLOSED');
      let now = clock(); if (now === null) return bad('INVALID_INPUT');
      let rumor;
      try {
        if (await provider.publicKey(secret) !== self) return bad('WRONG_SIGNER');
        rumor = (await unwrapGiftWrap(wrap, secret, provider, { now, rumorLimits: RUMOR_LIMITS })).rumor;
      } catch { return bad('WRAP_INVALID'); }
      if (closed) return bad('CLOSED');
      now = clock(); if (now === null) return bad('INVALID_INPUT');
      if (rumor.kind !== KIND_PRIVATE_DIRECT_MESSAGE) return bad('MALFORMED');
      // The seal's author is authenticated (rumor.pubkey == seal.pubkey); envelope fields must agree with it.
      if (rumor.pubkey === self) return { ok: true, value: Object.freeze({ own: true as const, rumorId: rumor.id }) };
      // A v1 exchange parses v1 only (v2 is MALFORMED); a v2 exchange dispatches on the envelope version.
      const env: ExchangeEnvelope | null = version === 2 ? parseVersionedEnvelope(rumor.content) : parseEnvelope(rumor.content);
      if (env === null || env.sender !== rumor.pubkey) return bad('MALFORMED');
      if (env.recipient !== self) return bad('NOT_ADDRESSED');
      const expected = envelopeTags(env);
      if (rumor.tags.length !== expected.length || rumor.tags.some((tag, i) => tag.length !== 2 || tag[0] !== expected[i]![0] || tag[1] !== expected[i]![1])) return bad('MALFORMED');
      // No downgrade: in a v2 session an offer or accept without its wallet binding is never admitted.
      if (version === 2 && env.v === 1 && (env.type === 'terms-offer' || env.type === 'terms-accept')) return bad('VERSION_MISMATCH');
      const expires = Number(env.expiresAtSeconds);
      if (rumor.created_at > now + MAX_FUTURE_SKEW_SECONDS) return bad('MALFORMED');
      if (expires <= now) return bad('EXPIRED');
      if (expires > now + MAX_MESSAGE_LIFETIME_SECONDS) return bad('MALFORMED');

      const address = parseAdAddress(env.ad)!;
      const seller = address.author;
      const from = env.sender;
      const iAmSeller = self === seller;
      // Only the ad's seller key may offer; nobody else may impersonate the seller to a buyer.
      if (env.type === 'terms-offer' && from !== seller) return bad('NOT_SELLER');
      if (!iAmSeller && from !== seller) return bad('NOT_SELLER');
      // Seller side: messages from (untrusted) buyers may hold replay memory and capacity only for the honest window.
      // The cap uses at least the protocol default TTL so a locally shortened TTL never refuses default-TTL peers.
      if (iAmSeller && expires > now + Math.max(ttl, EXCHANGE_LIMITS.defaultMessageTtlSeconds) + MAX_FUTURE_SKEW_SECONDS) return bad('MALFORMED');
      const buyerKey = iAmSeller ? from : self;
      const id = sessionIdFor(env.ad, buyerKey);
      const replay = replayError(id, rumor.id, now, env.type === 'take-request'); if (replay !== null) return bad(replay);

      const session = sessions.get(id);
      if (env.type === 'take-request') {
        if (!iAmSeller || from === seller) return bad('NOT_SELLER');
        if (session !== undefined && session.state !== 'cancelled' && session.state !== 'rejected' && now < session.adExpires) return bad('OUT_OF_ORDER');
        // No self-refresh: an unanswered tombstone keeps its slot until its replay ids expire (replayError swept them).
        if (session !== undefined && untrusted(session) && holdsReplay(session)) return bad('OUT_OF_ORDER');
        const found = options.ads.revalidate(adBookKey(seller, address.orderId));
        if (!found.ok) return bad(found.reason === 'expired' ? 'AD_EXPIRED' : 'AD_UNAVAILABLE');
        const { ad, author } = found.ad;
        if (author !== self || ad.maker !== self) return bad('NOT_SELLER');
        const adExpires = Number(ad.expiresAtSeconds);
        if (now >= adExpires) return bad('AD_EXPIRED');
        if (expires > adExpires) return bad('MALFORMED');
        const fresh: Session = { id, role: 'seller', ad: env.ad, orderId: address.orderId, seller, buyer: from, buyerAddress: env.body.buyerAddress as string, adExpires,
          adMin: BigInt(ad.amountMin), adMax: BigInt(ad.amountMax), adNetwork: ad.networkId, adAsset: ad.assetId, adCurrency: ad.currency, state: 'taken', terms: null, selected: false, pins: 0, acceptances: { seller: null, buyer: null }, withdrawn: false };
        const ready = readyToCommit(fresh, null, rumor.id, expires); if (!ready.ok) return ready;
        if (!admit(fresh, ready.value)) return bad('LIMIT_EXCEEDED');
        remember(id, rumor.id, expires);
        return { ok: true, value: Object.freeze({ sessionId: id, rumorId: rumor.id, type: env.type, from, state: fresh.state, termsHash: null, reviewed: null }) };
      }

      if (session === undefined) return bad('UNKNOWN_SESSION');
      if (now >= session.adExpires) return bad('AD_EXPIRED');
      if (iAmSeller && expires > session.adExpires) return bad('MALFORMED');
      // accept/reject must come from the counterparty that sent the take-request (the session's buyer).
      if ((env.type === 'terms-accept' || env.type === 'terms-reject') && from !== session.buyer) return bad('NOT_COUNTERPARTY');
      const senderRole: Role = from === session.seller ? 'seller' : 'buyer';
      if (from !== session.seller && from !== session.buyer) return bad('NOT_COUNTERPARTY');
      if (version === 2 && env.type === 'terms-accept' && session.acceptances.seller === null) return bad('SELLER_FIRST');
      if (transition(session.state, env.type, senderRole) === null) return bad('OUT_OF_ORDER');

      let reviewed: ReviewedEvmTerms | null = null;
      if (env.type === 'terms-offer') {
        const text = env.body.terms as string;
        let bytes: Uint8Array;
        try { bytes = new TextEncoder().encode(text); } catch { return bad('MALFORMED'); }
        const checked = await reviewForSession(session, bytes);
        if (closed) return bad('CLOSED');
        if (!checked.ok) return checked;
        if (checked.value.hash !== env.termsHash) return bad('HASH_MISMATCH');
        const ready = readyToCommit(session, 'taken', rumor.id, expires, checked.value.reviewed.acceptBeforeSeconds);
        if (!ready.ok) return ready;
        if (env.v === 2) {
          const proven = await proveAndAdmit(session, 'taken', rumor.id, expires, rumor.content, 'seller', checked.value.reviewed, checked.value.hash, ready.value);
          if (!proven.ok) return proven;
          session.acceptances.seller = proven.value;
        }
        session.terms = { hash: checked.value.hash, bytes, reviewed: checked.value.reviewed };
        reviewed = checked.value.reviewed;
      } else if (env.type === 'terms-accept' || env.type === 'terms-reject') {
        if (session.terms === null || env.termsHash !== session.terms.hash) return bad('HASH_MISMATCH');
        if (env.type === 'terms-accept' && env.body.revision !== session.terms.reviewed.revision) return bad('REVISION_MISMATCH');
        const ready = readyToCommit(session, session.state, rumor.id, expires,
          env.type === 'terms-accept' ? session.terms.reviewed.acceptBeforeSeconds : undefined);
        if (!ready.ok) return ready;
        if (env.v === 2) {
          const first = sellerFirst(session, ready.value); if (!first.ok) return first;
          const proven = await proveAndAdmit(session, 'offered', rumor.id, expires, rumor.content, 'buyer', session.terms.reviewed, session.terms.hash, ready.value);
          if (!proven.ok) return proven;
          session.acceptances.buyer = proven.value;
        } else if (version === 2) {
          const after = await tombstoneThenReady(session, 'offered', rumor.id, expires, session.terms.hash);
          if (!after.ok) return after;
        }
      } else if (session.terms !== null && env.termsHash !== null && env.termsHash !== session.terms.hash) return bad('HASH_MISMATCH');
      // v2 buyer: the authenticated seller may withdraw an offer that has not arrived yet (relays reorder gift wraps);
      // its termsHash is then tombstoned so the late offer is refused. Untrusted buyers never name hashes to tombstone.
      else if (session.terms === null && env.termsHash !== null && !(version === 2 && !iAmSeller && senderRole === 'seller')) return bad('HASH_MISMATCH');
      else {
        const expectedState = session.state;
        const withdrawnHash = session.terms?.hash ?? env.termsHash;
        const ready = readyToCommit(session, expectedState, rumor.id, expires); if (!ready.ok) return ready;
        if (version === 2 && withdrawnHash !== null) {
          const after = await tombstoneThenReady(session, expectedState, rumor.id, expires, withdrawnHash);
          if (!after.ok) return after;
        }
      }

      session.state = transition(session.state, env.type, senderRole)!;
      remember(id, rumor.id, expires);
      return { ok: true, value: Object.freeze({ sessionId: id, rumorId: rumor.id, type: env.type, from, state: session.state, termsHash: env.termsHash, reviewed }) };
    },
  };
  return Object.freeze(exchange);
}
