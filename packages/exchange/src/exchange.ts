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
 *
 * D1 peer acceptance (Option B, optional `peerAcceptance` ports; see ./peer-acceptance.ts). Without the ports every
 * behavior above, every wire byte and every result is unchanged: a version 2 envelope is MALFORMED and `{revision}` stays a
 * negotiation statement that never yields "accepted by peer". With the ports the exchange runs in D1 mode:
 * - terms-offer and terms-accept travel only as version 2 envelopes carrying the sender's two wallet signatures. A
 *   version 1 offer or accept is refused (DOWNGRADE) in both directions; take-request, terms-reject and cancel stay v1.
 * - A statement is verified (injected verifier: registry-derived domain, account class from pinned code, both
 *   signatures) only after the gift wrap authenticated the sender and every session check above passed, and then
 *   durably admitted to the injected replay store before the state changes. The session admission policy above is
 *   unchanged and D1 work never displaces another session. The replay store's capacity is shared, though: when it is
 *   full, the statement being sent or received is refused (LIMIT_EXCEEDED), also for a selected session. To keep that
 *   rare, cancelled, rejected and never-accepted-but-ended sessions free their quota (compact tombstones with their own
 *   budget), entries retire shortly after the terms deadline, and selected and buyer-side sessions are exempt from the
 *   per-peer/per-ad quotas and may use a reserved share of the total (see packages/wallet/src/evm-peer-replay.ts).
 * - At most one verification runs per session, and a rumor already being processed is a DUPLICATE, so copies of one
 *   wrap cannot occupy the verifier; cheap local checks (state, deadlines, binding, tombstone) run before chain reads.
 * - cancel and terms-reject of a session with reviewed terms durably tombstone its termsHash before the state changes,
 *   on both the sending and the receiving side; a later statement for that termsHash is refused in any session.
 * - Before a new acceptance and before funding (`acceptanceStatus` with purpose 'accept' / 'fund') every stored
 *   statement is re-verified at a fresh block and the tombstone is re-read. Nothing here gates release or refund.
 */
import { reviewTermsBytes } from '../../domain/index.ts';
import type { RegistryLookup, ReviewedEvmTerms, TermsReviewRejection } from '../../domain/index.ts';
import { createGiftWrap, createSeal, createUnsignedEvent, unwrapGiftWrap, KIND_PRIVATE_DIRECT_MESSAGE, MAX_RUMOR_JSON_BYTES } from '../../nostr-crypto/index.ts';
import type { EventLimits, NostrEvent, NostrMessagingProvider } from '../../nostr-crypto/index.ts';
import type { OrderBook } from '../../relay/index.ts';
import { transition } from './machine.ts';
import type { Role, SessionState } from './machine.ts';
import {
  adAddress, adBookKey, encodeEnvelope, envelopeTags, isEvmAddress, isHex64, MAX_ENVELOPE_BYTES, MAX_FUTURE_SKEW_SECONDS,
  MAX_MESSAGE_LIFETIME_SECONDS, MAX_OFFER_TERMS_BYTES, parseAdAddress, parseEnvelope,
} from './messages.ts';
import type { CancelReason, ExchangeEnvelopeV1, MessageType, RejectReason } from './messages.ts';
import {
  BOTH_VERIFIED_LABEL, encodeEnvelopeV2, FUNDING_SAFETY_MARGIN_SECONDS, MAX_PEER_ACCEPT_HORIZON_SECONDS, parseEnvelopeV2,
  parsePeerAcceptanceBinding, parsePeerAcceptanceWire, peerRoleLabel,
} from './peer-acceptance.ts';
import type {
  ExchangeEnvelopeV2, PeerAcceptanceBinding, PeerAcceptanceCode, PeerAcceptanceOptions, PeerAcceptanceRoleView, PeerAcceptanceState,
  PeerAcceptanceStatus, PeerAcceptanceWire, PeerReplayScope, PeerVerifiedEvidence,
} from './peer-acceptance.ts';

export type ExchangeCode =
  | 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'CLOSED' | 'WRAP_INVALID' | 'MALFORMED' | 'NOT_ADDRESSED' | 'EXPIRED' | 'AD_UNAVAILABLE' | 'AD_EXPIRED'
  | 'AD_MISMATCH' | 'DUPLICATE' | 'UNKNOWN_SESSION' | 'OUT_OF_ORDER' | 'NOT_SELLER' | 'NOT_COUNTERPARTY' | 'REVIEW_FAILED' | 'TERMS_MISMATCH'
  | 'HASH_MISMATCH' | 'REVISION_MISMATCH' | 'WRONG_SIGNER'
  // D1 mode only (peerAcceptance ports configured).
  | 'DOWNGRADE' | 'ACCEPTANCE_REQUIRED' | 'ACCEPTANCE_DISABLED' | 'ACCEPTANCE_REFUSED' | 'ACCEPTANCE_CONFLICT' | 'ACCEPTANCE_UNAVAILABLE'
  | 'UNSUPPORTED_ACCOUNT' | 'TOMBSTONED' | 'BUSY';
export type ExchangeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: ExchangeCode; readonly review?: TermsReviewRejection;
  /** D1 only: the port refusal behind the code, and its fixed-vocabulary reason word (for example `eip7702-delegated`). */
  readonly acceptance?: PeerAcceptanceCode; readonly reason?: string };

export const EXCHANGE_LIMITS = Object.freeze({ maxSessions: 64, maxSessionsPerAd: 16, maxSeenMessages: 1024, maxSeenMessagesPerSession: 16, defaultMessageTtlSeconds: 900 });
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
  /** D1 Option B ports, injected by composition (this package never imports a wallet). Absent: version 1 only. */
  readonly peerAcceptance?: PeerAcceptanceOptions;
}
export interface SessionView {
  readonly id: string; readonly role: Role; readonly ad: string; readonly orderId: string; readonly seller: string; readonly buyer: string;
  readonly buyerAddress: string; readonly state: SessionState; readonly adExpiresAtSeconds: number;
  /** Seller side only: the seller pinned this `taken` session with `select`, so new intake can never displace it. */
  readonly selected: boolean;
  /** Present once an offer passed local review. `bytes` is a copy of the exact reviewed bytes. */
  readonly terms: { readonly hash: string; readonly bytes: Uint8Array; readonly reviewed: ReviewedEvmTerms } | null;
  /** D1 mode only: which statements were verified and admitted when they arrived or were sent. Never a display claim:
   * `acceptanceStatus` re-verifies before anything may be shown as accepted. */
  readonly acceptance?: { readonly sellerRecorded: boolean; readonly buyerRecorded: boolean; readonly recheckRequired: true };
}
export interface SentMessage { readonly sessionId: string; readonly rumorId: string; readonly type: MessageType; readonly state: SessionState;
  /** Publish both through the relay pool (kind 1059). `selfWrap` is optional backup history. */
  readonly recipientWrap: NostrEvent; readonly selfWrap: NostrEvent; }
export interface ReceivedMessage { readonly sessionId: string; readonly rumorId: string; readonly type: MessageType; readonly from: string; readonly state: SessionState;
  readonly termsHash: string | null; readonly reviewed: ReviewedEvmTerms | null;
  /** D1 version 2 offer/accept only: the sender's statement as verified on arrival (point in time). */
  readonly acceptance?: PeerAcceptanceRoleView; }
/** D1: the exact unsigned statement the local wallet is asked to sign, with the TradeTerms digest it covers. */
export interface PeerAcceptanceStatement { readonly termsHash: string; readonly binding: PeerAcceptanceBinding; readonly reviewed: ReviewedEvmTerms }
export type PeerAcceptancePurpose = 'display' | 'accept' | 'fund';
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
  /**
   * Process one gift wrap delivered by the relay pool. D1 mode: a refused message is never remembered, so the relay layer
   * must redeliver it. In particular `BUSY` (another verification for the session is running, for example a local
   * `acceptanceStatus` recheck) and `DUPLICATE` while the same rumor is still in flight: a genuine accept refused `BUSY`
   * succeeds on redelivery.
   */
  receive(wrap: unknown, secret: Uint8Array): Promise<ExchangeResult<ReceivedMessage | { readonly own: true; readonly rumorId: string }>>;
  /** D1: the statement to sign. Seller: before offering `termsBytes` (reviewed here first). Buyer: for the offered bytes. */
  acceptanceStatement(sessionId: string, termsBytes: Uint8Array, notAfterSeconds: string): Promise<ExchangeResult<PeerAcceptanceStatement>>;
  /** D1 seller: version 2 offer carrying the seller's two signatures (verified and admitted locally before it is returned). */
  offerWithAcceptance(sessionId: string, termsBytes: Uint8Array, acceptance: PeerAcceptanceWire, secret: Uint8Array): Promise<ExchangeResult<SentMessage>>;
  /** D1 buyer: version 2 accept. Re-verifies the stored seller statement at a fresh block first. */
  acceptWithAcceptance(sessionId: string, termsBytes: Uint8Array, acceptance: PeerAcceptanceWire, secret: Uint8Array): Promise<ExchangeResult<SentMessage>>;
  /**
   * D1: re-verify every stored statement now and re-read the tombstone. 'display' always returns a status (refusals
   * become `invalid`/`expired`/`withdrawn` without a label). 'accept' requires a valid seller statement; 'fund' requires
   * both, valid for at least FUNDING_SAFETY_MARGIN_SECONDS more. No result authorizes funding by itself, and nothing
   * here is consulted by release, refund or payout.
   */
  acceptanceStatus(sessionId: string, purpose: PeerAcceptancePurpose, signal?: AbortSignal): Promise<ExchangeResult<PeerAcceptanceStatus>>;
  session(sessionId: string): SessionView | null;
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
  /** D1 mode only. Verified statements kept in memory for rechecks; never persisted, exported or put in a view. */
  peer: { seller: PeerRecord | null; buyer: PeerRecord | null } | null;
  /** D1: a verification for this session is in flight (single-flight). */
  verifying?: boolean;
  /** D1: local cancel/reject tombstone writes in flight, and whether one was durably written for these terms. */
  withdrawing?: number; withdrawn?: boolean;
}
interface PeerRecord { readonly wire: PeerAcceptanceWire; readonly evidence: PeerVerifiedEvidence }
interface BuiltMessage {
  envelope: ExchangeEnvelopeV1 | ExchangeEnvelopeV2; rumorId: string; recipientWrap: NostrEvent; selfWrap: NostrEvent;
}
const bad = (code: ExchangeCode, review?: TermsReviewRejection): { ok: false; code: ExchangeCode; review?: TermsReviewRejection } =>
  review === undefined ? { ok: false, code } : { ok: false, code, review };
const PEER_CODES: readonly PeerAcceptanceCode[] = ['INVALID_INPUT', 'UNAUTHORIZED', 'EXPIRED', 'WRONG_CHAIN', 'UNSUPPORTED', 'TOMBSTONED',
  'CONFLICT', 'LIMIT_EXCEEDED', 'UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'LOCKED', 'INTEGRITY_FAILURE'];
/** Map a port refusal. Only a fixed-vocabulary reason word is ever carried, never provider text. */
function peerBad(code: unknown, reason?: unknown): { ok: false; code: ExchangeCode; acceptance: PeerAcceptanceCode; reason?: string } {
  const known: PeerAcceptanceCode = PEER_CODES.includes(code as PeerAcceptanceCode) ? code as PeerAcceptanceCode : 'UNAVAILABLE';
  const mapped: ExchangeCode = known === 'TOMBSTONED' ? 'TOMBSTONED' : known === 'CONFLICT' ? 'ACCEPTANCE_CONFLICT'
    : known === 'LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED' : known === 'EXPIRED' ? 'EXPIRED' : known === 'UNSUPPORTED' ? 'UNSUPPORTED_ACCOUNT'
      : known === 'UNAUTHORIZED' || known === 'INVALID_INPUT' || known === 'WRONG_CHAIN' ? 'ACCEPTANCE_REFUSED' : 'ACCEPTANCE_UNAVAILABLE';
  return typeof reason === 'string' && /^[a-z0-9-]{1,48}$/.test(reason) ? { ok: false, code: mapped, acceptance: known, reason } : { ok: false, code: mapped, acceptance: known };
}
const UINT64_DECIMAL = /^[1-9][0-9]{0,19}$/;
const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
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
  const d1 = options.peerAcceptance ?? null;
  if (d1 !== null && (typeof d1.verifier?.verify !== 'function' || typeof d1.replay?.admit !== 'function' ||
      typeof d1.replay.tombstone !== 'function' || typeof d1.replay.status !== 'function')) throw new TypeError('INVALID_OPTIONS');
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
  // D1 only: rumor ids currently being processed by receive (copies of one wrap are DUPLICATE while in flight).
  const inflight = new Set<string>();
  let closed = false;

  const clock = (): number | null => { try { const value = options.now(); return Number.isSafeInteger(value) && value >= 0 ? value : null; } catch { return null; } };
  const view = (s: Session): SessionView => {
    const base = { id: s.id, role: s.role, ad: s.ad, orderId: s.orderId, seller: s.seller, buyer: s.buyer, buyerAddress: s.buyerAddress,
      state: s.state, adExpiresAtSeconds: s.adExpires, selected: s.selected,
      terms: s.terms === null ? null : Object.freeze({ hash: s.terms.hash, bytes: new Uint8Array(s.terms.bytes), reviewed: s.terms.reviewed }) };
    // Version 1 views keep their exact shape; only D1 mode adds the recorded-statement flags.
    return Object.freeze(s.peer === null ? base : { ...base, acceptance: Object.freeze({ sellerRecorded: s.peer.seller !== null,
      buyerRecorded: s.peer.buyer !== null, recheckRequired: true as const }) });
  };
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
   * Build, wrap (recipient + self copy) and return a message. Does not touch state. With `acceptance` (D1 offer/accept
   * only) the envelope is version 2 and must round-trip through the strict v2 parser before it is wrapped.
   */
  async function build(s: Session, type: MessageType, body: Record<string, unknown>, termsHash: string | null, secret: Uint8Array,
    acceptance?: PeerAcceptanceWire): Promise<ExchangeResult<BuiltMessage>> {
    try {
      if (await provider.publicKey(secret) !== self) return bad('WRONG_SIGNER');
      if (closed) return bad('CLOSED');
      const now = clock(); if (now === null) return bad('INVALID_INPUT');
      const recipient = s.role === 'seller' ? s.buyer : s.seller;
      const expires = Math.min(now + ttl, s.adExpires);
      if (expires <= now) return bad('AD_EXPIRED');
      const nonce = new Uint8Array(32); globalThis.crypto.getRandomValues(nonce);
      let envelope: ExchangeEnvelopeV1 | ExchangeEnvelopeV2, content: string;
      if (acceptance === undefined) {
        const v1: ExchangeEnvelopeV1 = { v: 1, type, ad: s.ad, orderId: s.orderId, sender: self, recipient, nonce: toHex(nonce), expiresAtSeconds: String(expires), termsHash, body };
        envelope = v1; content = encodeEnvelope(v1);
      } else {
        if ((type !== 'terms-offer' && type !== 'terms-accept') || termsHash === null) return bad('INVALID_INPUT');
        const peerBody = type === 'terms-offer' ? { terms: body.terms as string, acceptance } : { revision: body.revision as string, acceptance };
        const v2: ExchangeEnvelopeV2 = { v: 2, type, ad: s.ad, orderId: s.orderId, sender: self, recipient, nonce: toHex(nonce), expiresAtSeconds: String(expires), termsHash, body: peerBody };
        content = encodeEnvelopeV2(v2);
        if (new TextEncoder().encode(content).byteLength > MAX_ENVELOPE_BYTES) return bad('LIMIT_EXCEEDED');
        // What a D1 peer will parse is exactly what was verified locally; anything else is never sent.
        const reparsed = parseEnvelopeV2(content);
        if (reparsed === null) return bad('INVALID_INPUT');
        envelope = reparsed;
      }
      if (new TextEncoder().encode(content).byteLength > MAX_ENVELOPE_BYTES) return bad('LIMIT_EXCEEDED');
      const rumor = createUnsignedEvent(self, { kind: KIND_PRIVATE_DIRECT_MESSAGE, created_at: now, tags: envelopeTags(envelope), content }, RUMOR_LIMITS);
      if (new TextEncoder().encode(JSON.stringify(rumor)).byteLength > MAX_RUMOR_JSON_BYTES) return bad('LIMIT_EXCEEDED');
      const recipientWrap = await createGiftWrap(await createSeal(rumor, secret, recipient, provider, now), recipient, provider, now);
      const selfWrap = await createGiftWrap(await createSeal(rumor, secret, self, provider, now), self, provider, now);
      if (closed) return bad('CLOSED');
      return { ok: true, value: { envelope, rumorId: rumor.id, recipientWrap, selfWrap } };
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

  // ---------- D1 peer acceptance (only reachable when `d1` is set) ----------
  const counterpartyOf = (s: Session): string => s.role === 'seller' ? s.buyer : s.seller;
  /** Selected seller-side sessions and buyer-side sessions are progress the local user chose (priority capacity). */
  const replayScope = (s: Session, reviewed: ReviewedEvmTerms, now: number): PeerReplayScope =>
    Object.freeze({ ad: s.ad, peer: counterpartyOf(s), acceptBeforeSeconds: reviewed.acceptBeforeSeconds, nowSeconds: now,
      closesAtSeconds: s.adExpires, priority: s.role === 'buyer' || s.selected });
  const withdrawnLocally = (s: Session): boolean => s.withdrawn === true || (s.withdrawing ?? 0) > 0;
  const roleView = (s: Session, evidence: PeerVerifiedEvidence, now: number): PeerAcceptanceRoleView => Object.freeze({
    role: evidence.binding.role, account: evidence.binding.account, scheme: evidence.scheme, termsHash: evidence.termsHash,
    notAfterSeconds: evidence.binding.notAfterSeconds, effectiveNotAfterSeconds: evidence.effectiveNotAfterSeconds,
    anchorHeight: evidence.anchor.height, anchorHash: evidence.anchor.hash, finality: 'unfinalized' as const, checkedAtSeconds: now,
    label: withdrawnLocally(s) ? null : peerRoleLabel(evidence) });
  /** Single-flight D1 verification per session. A second request while one runs is refused BUSY (not remembered). */
  async function exclusive<T>(s: Session, work: () => Promise<ExchangeResult<T>>): Promise<ExchangeResult<T>> {
    if (s.verifying === true) return bad('BUSY');
    s.verifying = true;
    try { return await work(); } finally { s.verifying = false; }
  }
  /** acceptBefore may be at most MAX_PEER_ACCEPT_HORIZON_SECONDS ahead, so replay entries always retire. */
  const withinHorizon = (reviewed: ReviewedEvmTerms, now: number): boolean =>
    BigInt(reviewed.acceptBeforeSeconds) - BigInt(now) <= BigInt(MAX_PEER_ACCEPT_HORIZON_SECONDS);
  /** The binding names exactly this session's role, reviewed account, both session keys and termsHash. */
  const bindingMatches = (s: Session, role: Role, wire: PeerAcceptanceWire, reviewed: ReviewedEvmTerms, termsHash: string): boolean => {
    const binding = wire.binding;
    return binding.role === role && binding.termsHash === termsHash && binding.account === (role === 'seller' ? reviewed.seller : reviewed.buyer) &&
      binding.ownMessagingKey === (role === 'seller' ? s.seller : s.buyer) && binding.counterpartyMessagingKey === (role === 'seller' ? s.buyer : s.seller);
  };
  /**
   * Verify one statement against session-derived context. The role, signer and counterparty keys come from the session
   * (authenticated sender or self), the terms from local review; the wire supplies only the binding and signatures.
   */
  async function verifyStatement(s: Session, role: Role, wire: PeerAcceptanceWire, reviewed: ReviewedEvmTerms, termsHash: string,
    envelopeExpires: number | null, now: number, signal?: AbortSignal): Promise<ExchangeResult<PeerVerifiedEvidence>> {
    if (d1 === null) return bad('ACCEPTANCE_DISABLED');
    if (!bindingMatches(s, role, wire, reviewed, termsHash)) return peerBad('UNAUTHORIZED');
    const signer = role === 'seller' ? s.seller : s.buyer, other = role === 'seller' ? s.buyer : s.seller, binding = wire.binding;
    let result: unknown;
    try {
      result = await d1.verifier.verify(Object.freeze({ reviewed, termsHash, role, signerMessagingKey: signer, counterpartyMessagingKey: other,
        nowSeconds: now, envelopeExpiresAtSeconds: envelopeExpires, acceptance: wire }), signal);
    } catch { return peerBad('UNAVAILABLE'); }
    if (closed) return bad('CLOSED');
    const outcome = result as { ok?: unknown; value?: PeerVerifiedEvidence; code?: unknown; reason?: unknown } | null;
    if (outcome === null || typeof outcome !== 'object' || outcome.ok !== true) return peerBad(outcome?.code, outcome?.reason);
    const evidence = outcome.value!;
    // The port must describe exactly the statement asked about; anything else is an integrity failure.
    try {
      const echoed = evidence.binding;
      if (evidence.termsHash !== termsHash || echoed.termsHash !== termsHash || echoed.role !== role || echoed.account !== binding.account ||
          echoed.ownMessagingKey !== signer || echoed.counterpartyMessagingKey !== other || echoed.notAfterSeconds !== binding.notAfterSeconds ||
          (evidence.scheme !== 'eoa' && evidence.scheme !== 'erc1271') || evidence.economicPreparationAllowed !== false ||
          !UINT64_DECIMAL.test(evidence.effectiveNotAfterSeconds) || BigInt(evidence.effectiveNotAfterSeconds) <= BigInt(now)) return peerBad('INTEGRITY_FAILURE');
    } catch { return peerBad('INTEGRITY_FAILURE'); }
    return { ok: true, value: evidence };
  }
  async function admitStatement(evidence: PeerVerifiedEvidence, scope: PeerReplayScope): Promise<ExchangeResult<'recorded' | 'duplicate'>> {
    if (d1 === null) return bad('ACCEPTANCE_DISABLED');
    let result: unknown;
    try { result = await d1.replay.admit(evidence, scope); } catch { return peerBad('UNAVAILABLE'); }
    if (closed) return bad('CLOSED');
    const outcome = result as { ok?: unknown; value?: { status?: unknown }; code?: unknown; reason?: unknown } | null;
    if (outcome === null || typeof outcome !== 'object' || outcome.ok !== true) return peerBad(outcome?.code, outcome?.reason);
    const status = outcome.value?.status;
    return status === 'recorded' || status === 'duplicate' ? { ok: true, value: status } : peerBad('INTEGRITY_FAILURE');
  }
  /**
   * Durable tombstone for a session's reviewed terms; a no-op outside D1 mode or before any terms exist. While it is in
   * flight, and once it succeeded, nothing in this session is labelled accepted (even if a racing acceptance commits).
   */
  async function tombstoneFor(s: Session, now: number): Promise<ExchangeResult<void>> {
    if (d1 === null || s.terms === null) return { ok: true, value: undefined };
    let result: unknown;
    s.withdrawing = (s.withdrawing ?? 0) + 1;
    try { result = await d1.replay.tombstone(s.terms.hash, replayScope(s, s.terms.reviewed, now)); } catch { return peerBad('UNAVAILABLE'); }
    finally { s.withdrawing = (s.withdrawing ?? 1) - 1; }
    if (closed) return bad('CLOSED');
    const outcome = result as { ok?: unknown; code?: unknown; reason?: unknown } | null;
    if (outcome === null || typeof outcome !== 'object' || outcome.ok !== true) return peerBad(outcome?.code, outcome?.reason);
    s.withdrawn = true;
    return { ok: true, value: undefined };
  }
  /** Tombstone (or retired past the store's high-water mark) for this session's reviewed terms. */
  async function tombstoned(s: Session, terms: { hash: string; reviewed: ReviewedEvmTerms }, now: number): Promise<ExchangeResult<boolean>> {
    if (d1 === null) return bad('ACCEPTANCE_DISABLED');
    let result: unknown;
    try { result = await d1.replay.status(terms.hash, replayScope(s, terms.reviewed, now)); } catch { return peerBad('UNAVAILABLE'); }
    if (closed) return bad('CLOSED');
    const outcome = result as { ok?: unknown; value?: { tombstoned?: unknown }; code?: unknown; reason?: unknown } | null;
    if (outcome === null || typeof outcome !== 'object' || outcome.ok !== true) return peerBad(outcome?.code, outcome?.reason);
    const value = outcome.value?.tombstoned;
    return typeof value === 'boolean' ? { ok: true, value } : peerBad('INTEGRITY_FAILURE');
  }
  /** Receive side: verify then durably admit. Only called after authentication and all session checks passed. */
  async function receiveStatement(s: Session, role: Role, wire: PeerAcceptanceWire, reviewed: ReviewedEvmTerms, termsHash: string,
    envelopeExpires: number, now: number): Promise<ExchangeResult<PeerRecord>> {
    if (!withinHorizon(reviewed, now)) return peerBad('LIMIT_EXCEEDED', 'accept-horizon');
    if (!bindingMatches(s, role, wire, reviewed, termsHash)) return peerBad('UNAUTHORIZED');
    // Cheap local refusal before any chain read: cancelled terms never reach the verifier.
    if (withdrawnLocally(s)) return peerBad('TOMBSTONED');
    const withdrawn = await tombstoned(s, { hash: termsHash, reviewed }, now); if (!withdrawn.ok) return withdrawn;
    if (withdrawn.value) return peerBad('TOMBSTONED');
    const verified = await verifyStatement(s, role, wire, reviewed, termsHash, envelopeExpires, now); if (!verified.ok) return verified;
    const admitted = await admitStatement(verified.value, replayScope(s, reviewed, now)); if (!admitted.ok) return admitted;
    return { ok: true, value: Object.freeze({ wire, evidence: verified.value }) };
  }

  const exchange: TermsExchange = {
    get sessionCount() { return sessions.size; },
    get replayIdCount() { const now = clock(); if (now !== null) sweep(now); return seenEntries; },
    session: id => { const s = sessions.get(id); return s === undefined ? null : view(s); },
    close() { closed = true; sessions.clear(); seen.clear(); seenEntries = 0; pendingTakes.clear(); },

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
        adMin: BigInt(ad.amountMin), adMax: BigInt(ad.amountMax), adNetwork: ad.networkId, adAsset: ad.assetId, adCurrency: ad.currency, state: 'taken', terms: null, selected: false, pins: 0,
        peer: d1 === null ? null : { seller: null, buyer: null } };
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
      // D1 mode: an offer without the seller's two signatures would be a terms-only downgrade.
      if (d1 !== null) return bad('ACCEPTANCE_REQUIRED');
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
        const built = await build(s, 'terms-offer', { terms: text }, checked.value.hash, secret);
        if (closed) return bad('CLOSED');
        if (!built.ok) return built;
        const ready = readyToCommit(s, 'taken', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), checked.value.reviewed.acceptBeforeSeconds);
        if (!ready.ok) return ready;
        s.state = 'offered'; s.terms = { hash: checked.value.hash, bytes: copy, reviewed: checked.value.reviewed };
        return { ok: true, value: sent(s, 'terms-offer', built.value, built.value.envelope.expiresAtSeconds) };
      } finally { s.pins--; }
    },

    async accept(sessionId, termsBytes, secret) {
      // D1 mode: `{revision}` alone is never an acceptance.
      if (d1 !== null) return bad('ACCEPTANCE_REQUIRED');
      const now = clock(); const live = liveSession(sessionId, 'buyer', now); if (!live.ok) return live;
      const s = live.value;
      if (!(termsBytes instanceof Uint8Array)) return bad('INVALID_INPUT');
      if (transition(s.state, 'terms-accept', 'buyer') === null || s.terms === null) return bad('OUT_OF_ORDER');
      // The acceptance covers exactly the bytes that passed local review; anything else is refused before signing.
      if (!sameBytes(s.terms.bytes, termsBytes)) return bad('TERMS_MISMATCH');
      if (BigInt(s.terms.reviewed.acceptBeforeSeconds) <= BigInt(now!)) return bad('EXPIRED');
      const replay = replayError(s.id, null, now!, false); if (replay !== null) return bad(replay);
      const { hash, reviewed } = s.terms;
      const built = await build(s, 'terms-accept', { revision: reviewed.revision }, hash, secret);
      if (closed) return bad('CLOSED');
      if (!built.ok) return built;
      const ready = readyToCommit(s, 'offered', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds), reviewed.acceptBeforeSeconds);
      if (!ready.ok) return ready;
      s.state = 'accepted';
      return { ok: true, value: sent(s, 'terms-accept', built.value, built.value.envelope.expiresAtSeconds) };
    },

    async reject(sessionId, reason, secret) {
      const now = clock(); const live = liveSession(sessionId, 'buyer', now); if (!live.ok) return live;
      const s = live.value;
      if (transition(s.state, 'terms-reject', 'buyer') === null || s.terms === null) return bad('OUT_OF_ORDER');
      const replay = replayError(s.id, null, now!, false); if (replay !== null) return bad(replay);
      const built = await build(s, 'terms-reject', { reason }, s.terms.hash, secret);
      if (closed) return bad('CLOSED');
      if (!built.ok) return built;
      const ready = readyToCommit(s, 'offered', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds));
      if (!ready.ok) return ready;
      if (d1 !== null) {
        // D1: the durable tombstone lands before the reject is reported sent; a later statement for these terms is refused.
        const recorded = await tombstoneFor(s, ready.value); if (!recorded.ok) return recorded;
        const still = readyToCommit(s, 'offered', built.value.rumorId, Number(built.value.envelope.expiresAtSeconds));
        if (!still.ok) return still;
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
        const built = await build(s, 'cancel', { reason }, s.terms?.hash ?? null, secret);
        if (closed) return bad('CLOSED');
        if (!built.ok) return built;
        const ready = readyToCommit(s, expectedState, built.value.rumorId, Number(built.value.envelope.expiresAtSeconds));
        if (!ready.ok) return ready;
        if (d1 !== null && s.terms !== null) {
          const recorded = await tombstoneFor(s, ready.value); if (!recorded.ok) return recorded;
          const still = readyToCommit(s, expectedState, built.value.rumorId, Number(built.value.envelope.expiresAtSeconds));
          if (!still.ok) return still;
        }
        s.state = 'cancelled';
        return { ok: true, value: sent(s, 'cancel', built.value, built.value.envelope.expiresAtSeconds) };
      } finally { s.pins--; }
    },

    async acceptanceStatement(sessionId, termsBytes, notAfterSeconds) {
      if (d1 === null) return bad('ACCEPTANCE_DISABLED');
      const now = clock(); if (closed) return bad('CLOSED'); if (now === null) return bad('INVALID_INPUT');
      const s = sessions.get(sessionId); if (s === undefined) return bad('UNKNOWN_SESSION');
      if (!(termsBytes instanceof Uint8Array) || typeof notAfterSeconds !== 'string' || !UINT64_DECIMAL.test(notAfterSeconds) ||
          BigInt(notAfterSeconds) > (1n << 64n) - 1n) return bad('INVALID_INPUT');
      if (BigInt(notAfterSeconds) <= BigInt(now)) return bad('EXPIRED');
      if (now >= s.adExpires) return bad('AD_EXPIRED');
      let reviewed: ReviewedEvmTerms, termsHash: string;
      if (s.role === 'seller') {
        if (s.state !== 'taken') return bad('OUT_OF_ORDER');
        if (termsBytes.byteLength === 0 || termsBytes.byteLength > MAX_OFFER_TERMS_BYTES) return bad('LIMIT_EXCEEDED');
        const checked = await reviewForSession(s, new Uint8Array(termsBytes)); if (closed) return bad('CLOSED');
        if (!checked.ok) return checked;
        reviewed = checked.value.reviewed; termsHash = checked.value.hash;
      } else {
        if (s.state !== 'offered' || s.terms === null) return bad('OUT_OF_ORDER');
        if (!sameBytes(s.terms.bytes, termsBytes)) return bad('TERMS_MISMATCH');
        reviewed = s.terms.reviewed; termsHash = s.terms.hash;
      }
      if (!withinHorizon(reviewed, now)) return peerBad('LIMIT_EXCEEDED', 'accept-horizon');
      const binding = parsePeerAcceptanceBinding({ v: 1, termsHash, role: s.role, account: s.role === 'seller' ? reviewed.seller : reviewed.buyer,
        ownMessagingKey: self, counterpartyMessagingKey: counterpartyOf(s), notAfterSeconds });
      if (binding === null) return bad('INVALID_INPUT');
      return { ok: true, value: Object.freeze({ termsHash, binding, reviewed }) };
    },

    async offerWithAcceptance(sessionId, termsBytes, acceptance, secret) {
      if (d1 === null) return bad('ACCEPTANCE_DISABLED');
      const now = clock(); const live = liveSession(sessionId, 'seller', now); if (!live.ok) return live;
      const s = live.value;
      if (!(termsBytes instanceof Uint8Array)) return bad('INVALID_INPUT');
      const wire = parsePeerAcceptanceWire(acceptance); if (wire === null) return bad('INVALID_INPUT');
      if (transition(s.state, 'terms-offer', 'seller') === null) return bad('OUT_OF_ORDER');
      const replay = replayError(s.id, null, now!, false); if (replay !== null) return bad(replay);
      if (termsBytes.byteLength === 0 || termsBytes.byteLength > MAX_OFFER_TERMS_BYTES) return bad('LIMIT_EXCEEDED');
      const copy = new Uint8Array(termsBytes);
      s.pins++;
      try {
        return await exclusive(s, async () => {
          const checked = await reviewForSession(s, copy); if (closed) return bad('CLOSED');
          if (!checked.ok) return checked;
          const { reviewed, hash } = checked.value;
          if (!withinHorizon(reviewed, now!)) return peerBad('LIMIT_EXCEEDED', 'accept-horizon');
          if (!bindingMatches(s, 'seller', wire, reviewed, hash)) return peerBad('UNAUTHORIZED');
          // Cheap local refusal before any chain read: cancelled terms are never offered again.
          const withdrawn = await tombstoned(s, { hash, reviewed }, now!); if (!withdrawn.ok) return withdrawn;
          if (withdrawn.value) return peerBad('TOMBSTONED');
          let text: string;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(copy); } catch { return bad('INVALID_INPUT'); }
          const built = await build(s, 'terms-offer', { terms: text }, hash, secret, wire);
          if (closed) return bad('CLOSED');
          if (!built.ok) return built;
          const expires = Number(built.value.envelope.expiresAtSeconds);
          const ready = readyToCommit(s, 'taken', built.value.rumorId, expires, reviewed.acceptBeforeSeconds);
          if (!ready.ok) return ready;
          // The seller's own statement passes the same verification the buyer will run (account class at a fresh block,
          // both signatures, registry domain, deadlines including this envelope) before it is durably recorded.
          const verified = await verifyStatement(s, 'seller', wire, reviewed, hash, expires, ready.value); if (!verified.ok) return verified;
          const admitted = await admitStatement(verified.value, replayScope(s, reviewed, ready.value)); if (!admitted.ok) return admitted;
          const still = readyToCommit(s, 'taken', built.value.rumorId, expires, reviewed.acceptBeforeSeconds);
          if (!still.ok) return still;
          s.state = 'offered'; s.terms = { hash, bytes: copy, reviewed }; s.peer!.seller = Object.freeze({ wire, evidence: verified.value });
          return { ok: true, value: sent(s, 'terms-offer', built.value, built.value.envelope.expiresAtSeconds) };
        });
      } finally { s.pins--; }
    },

    async acceptWithAcceptance(sessionId, termsBytes, acceptance, secret) {
      if (d1 === null) return bad('ACCEPTANCE_DISABLED');
      const now = clock(); const live = liveSession(sessionId, 'buyer', now); if (!live.ok) return live;
      const s = live.value;
      if (!(termsBytes instanceof Uint8Array)) return bad('INVALID_INPUT');
      const wire = parsePeerAcceptanceWire(acceptance); if (wire === null) return bad('INVALID_INPUT');
      if (transition(s.state, 'terms-accept', 'buyer') === null || s.terms === null) return bad('OUT_OF_ORDER');
      if (!sameBytes(s.terms.bytes, termsBytes)) return bad('TERMS_MISMATCH');
      if (BigInt(s.terms.reviewed.acceptBeforeSeconds) <= BigInt(now!)) return bad('EXPIRED');
      const replay = replayError(s.id, null, now!, false); if (replay !== null) return bad(replay);
      const terms = s.terms, { hash, reviewed } = terms;
      const seller = s.peer!.seller;
      if (seller === null) return bad('OUT_OF_ORDER');
      if (!bindingMatches(s, 'buyer', wire, reviewed, hash)) return peerBad('UNAUTHORIZED');
      if (withdrawnLocally(s)) return peerBad('TOMBSTONED');
      return exclusive(s, async () => {
        // Before a new acceptance: the terms must not be tombstoned and the seller statement must still verify at a fresh
        // block (account class, ERC-1271 policy, registry, deadlines).
        const withdrawn = await tombstoned(s, terms, now!); if (!withdrawn.ok) return withdrawn;
        if (withdrawn.value) return peerBad('TOMBSTONED');
        const recheck = await verifyStatement(s, 'seller', seller.wire, reviewed, hash, null, now!); if (!recheck.ok) return recheck;
        const built = await build(s, 'terms-accept', { revision: reviewed.revision }, hash, secret, wire);
        if (closed) return bad('CLOSED');
        if (!built.ok) return built;
        const expires = Number(built.value.envelope.expiresAtSeconds);
        const ready = readyToCommit(s, 'offered', built.value.rumorId, expires, reviewed.acceptBeforeSeconds);
        if (!ready.ok) return ready;
        const verified = await verifyStatement(s, 'buyer', wire, reviewed, hash, expires, ready.value); if (!verified.ok) return verified;
        const admitted = await admitStatement(verified.value, replayScope(s, reviewed, ready.value)); if (!admitted.ok) return admitted;
        const still = readyToCommit(s, 'offered', built.value.rumorId, expires, reviewed.acceptBeforeSeconds);
        if (!still.ok) return still;
        if (withdrawnLocally(s)) return peerBad('TOMBSTONED');
        s.state = 'accepted'; s.peer!.buyer = Object.freeze({ wire, evidence: verified.value });
        return { ok: true, value: sent(s, 'terms-accept', built.value, built.value.envelope.expiresAtSeconds) };
      });
    },

    async acceptanceStatus(sessionId, purpose, signal) {
      if (d1 === null) return bad('ACCEPTANCE_DISABLED');
      if (purpose !== 'display' && purpose !== 'accept' && purpose !== 'fund') return bad('INVALID_INPUT');
      const now = clock(); if (closed) return bad('CLOSED'); if (now === null) return bad('INVALID_INPUT');
      const s = sessions.get(sessionId); if (s === undefined) return bad('UNKNOWN_SESSION');
      const status = (state: PeerAcceptanceState, seller: PeerAcceptanceRoleView | null, buyer: PeerAcceptanceRoleView | null,
        refusal: PeerAcceptanceCode | null, label: string | null): ExchangeResult<PeerAcceptanceStatus> =>
        ({ ok: true, value: Object.freeze({ termsHash: s.terms?.hash ?? null, state, seller, buyer, refusal, label, freshness: 'local-history' as const, economicPreparationAllowed: false as const }) });
      const terms = s.terms, records = s.peer!;
      if (terms === null || (records.seller === null && records.buyer === null)) return purpose === 'display' ? status('none', null, null, null, null) : bad('OUT_OF_ORDER');
      const withdrawnNow = (): boolean => s.state === 'cancelled' || s.state === 'rejected' || withdrawnLocally(s);
      const withdrawnStatus = (): ExchangeResult<PeerAcceptanceStatus> => purpose === 'display' ? status('withdrawn', null, null, 'TOMBSTONED', null) : peerBad('TOMBSTONED');
      if (withdrawnNow()) return withdrawnStatus();
      return exclusive(s, async () => {
        const withdrawn = await tombstoned(s, terms, now);
        if (!withdrawn.ok) return purpose === 'display' ? status('invalid', null, null, withdrawn.acceptance ?? 'UNAVAILABLE', null) : withdrawn;
        if (withdrawn.value) return withdrawnStatus();
        const state = s.state;
        const views: { seller: PeerAcceptanceRoleView | null; buyer: PeerAcceptanceRoleView | null } = { seller: null, buyer: null };
        let refusal: { ok: false; code: ExchangeCode; acceptance?: PeerAcceptanceCode; reason?: string } | null = null;
        for (const role of ['seller', 'buyer'] as const) {
          const record = records[role]; if (record === null) continue;
          const checked = await verifyStatement(s, role, record.wire, terms.reviewed, terms.hash, null, now, signal);
          if (checked.ok) views[role] = roleView(s, checked.value, now);
          else { refusal ??= checked; if (checked.code === 'CLOSED') return checked; }
        }
        // The verification awaited chain reads: re-read the session and the tombstone before reporting anything.
        if (sessions.get(sessionId) !== s || s.terms !== terms) return bad('OUT_OF_ORDER');
        if (withdrawnNow()) return withdrawnStatus();
        const again = await tombstoned(s, terms, now);
        if (!again.ok) return purpose === 'display' ? status('invalid', null, null, again.acceptance ?? 'UNAVAILABLE', null) : again;
        if (again.value || withdrawnNow()) return withdrawnStatus();
        if (s.state !== state || sessions.get(sessionId) !== s) return bad('OUT_OF_ORDER');
        if (purpose !== 'display') {
          if (refusal !== null) return refusal;
          if (views.seller === null || (purpose === 'fund' && views.buyer === null)) return bad('OUT_OF_ORDER');
          if (purpose === 'fund') {
            const deadline = [views.seller, views.buyer!].map(view => BigInt(view.effectiveNotAfterSeconds)).reduce((a, b) => a < b ? a : b);
            if (deadline - BigInt(now) <= BigInt(FUNDING_SAFETY_MARGIN_SECONDS)) return peerBad('EXPIRED', 'funding-margin');
          }
        }
        if (refusal !== null) {
          const code = refusal.acceptance ?? 'UNAVAILABLE';
          return status(code === 'EXPIRED' ? 'expired' : 'invalid', views.seller, views.buyer, code, null);
        }
        if (views.seller !== null && views.buyer !== null) return status('both-verified', views.seller, views.buyer, null, BOTH_VERIFIED_LABEL);
        if (views.seller !== null) return status('seller-verified', views.seller, null, null, views.seller.label);
        return status('invalid', null, views.buyer, 'INTEGRITY_FAILURE', null);
      });
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
      // Version 2 is parsed only in D1 mode; without the ports it stays MALFORMED exactly as before.
      const env: ExchangeEnvelopeV1 | ExchangeEnvelopeV2 | null = parseEnvelope(rumor.content) ?? (d1 === null ? null : parseEnvelopeV2(rumor.content));
      if (env === null || env.sender !== rumor.pubkey) return bad('MALFORMED');
      if (env.recipient !== self) return bad('NOT_ADDRESSED');
      const expected = envelopeTags(env);
      if (rumor.tags.length !== expected.length || rumor.tags.some((tag, i) => tag.length !== 2 || tag[0] !== expected[i]![0] || tag[1] !== expected[i]![1])) return bad('MALFORMED');
      // No downgrade: in D1 mode an offer or accept without its two wallet signatures is never processed.
      if (d1 !== null && env.v === 1 && (env.type === 'terms-offer' || env.type === 'terms-accept')) return bad('DOWNGRADE');
      const body = env.body as Readonly<Record<string, unknown>>;
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
        const fresh: Session = { id, role: 'seller', ad: env.ad, orderId: address.orderId, seller, buyer: from, buyerAddress: body.buyerAddress as string, adExpires,
          adMin: BigInt(ad.amountMin), adMax: BigInt(ad.amountMax), adNetwork: ad.networkId, adAsset: ad.assetId, adCurrency: ad.currency, state: 'taken', terms: null, selected: false, pins: 0,
          peer: d1 === null ? null : { seller: null, buyer: null } };
        const ready = readyToCommit(fresh, null, rumor.id, expires); if (!ready.ok) return ready;
        if (!admit(fresh, ready.value)) return bad('LIMIT_EXCEEDED');
        remember(id, rumor.id, expires);
        return { ok: true, value: Object.freeze({ sessionId: id, rumorId: rumor.id, type: env.type, from, state: fresh.state, termsHash: null, reviewed: null }) };
      }

      if (session === undefined) return bad('UNKNOWN_SESSION');
      const settle = async (session: Session, now: number): Promise<ExchangeResult<ReceivedMessage>> => {
        if (now >= session.adExpires) return bad('AD_EXPIRED');
        if (iAmSeller && expires > session.adExpires) return bad('MALFORMED');
        // accept/reject must come from the counterparty that sent the take-request (the session's buyer).
        if ((env.type === 'terms-accept' || env.type === 'terms-reject') && from !== session.buyer) return bad('NOT_COUNTERPARTY');
        const senderRole: Role = from === session.seller ? 'seller' : 'buyer';
        if (from !== session.seller && from !== session.buyer) return bad('NOT_COUNTERPARTY');
        if (transition(session.state, env.type, senderRole) === null) return bad('OUT_OF_ORDER');
        // D1 steps await ports; every commit below re-checks against the state captured here.
        const expectedState = session.state;

        let reviewed: ReviewedEvmTerms | null = null;
        let statement: PeerRecord | null = null;
        if (env.type === 'terms-offer') {
          const text = body.terms as string;
          let bytes: Uint8Array;
          try { bytes = new TextEncoder().encode(text); } catch { return bad('MALFORMED'); }
          const checked = await reviewForSession(session, bytes);
          if (closed) return bad('CLOSED');
          if (!checked.ok) return checked;
          if (checked.value.hash !== env.termsHash) return bad('HASH_MISMATCH');
          const ready = readyToCommit(session, 'taken', rumor.id, expires, checked.value.reviewed.acceptBeforeSeconds);
          if (!ready.ok) return ready;
          if (env.v === 2) {
            const received = await receiveStatement(session, 'seller', env.body.acceptance, checked.value.reviewed, checked.value.hash, expires, ready.value);
            if (!received.ok) return received;
            const still = readyToCommit(session, 'taken', rumor.id, expires, checked.value.reviewed.acceptBeforeSeconds);
            if (!still.ok) return still;
            // A local cancel/reject started meanwhile: its tombstone wins and nothing is recorded as offered.
            if (withdrawnLocally(session)) return peerBad('TOMBSTONED');
            statement = received.value; session.peer!.seller = statement;
          }
          session.terms = { hash: checked.value.hash, bytes, reviewed: checked.value.reviewed };
          reviewed = checked.value.reviewed;
        } else if (env.type === 'terms-accept' || env.type === 'terms-reject') {
          if (session.terms === null || env.termsHash !== session.terms.hash) return bad('HASH_MISMATCH');
          if (env.type === 'terms-accept' && body.revision !== session.terms.reviewed.revision) return bad('REVISION_MISMATCH');
          const acceptBefore = env.type === 'terms-accept' ? session.terms.reviewed.acceptBeforeSeconds : undefined;
          const ready = readyToCommit(session, expectedState, rumor.id, expires, acceptBefore);
          if (!ready.ok) return ready;
          if (env.v === 2 || (d1 !== null && env.type === 'terms-reject')) {
            const terms = session.terms;
            const done = env.v === 2
              ? await receiveStatement(session, 'buyer', env.body.acceptance, terms.reviewed, terms.hash, expires, ready.value)
              : await tombstoneFor(session, ready.value);
            if (!done.ok) return done;
            const still = readyToCommit(session, expectedState, rumor.id, expires, acceptBefore);
            if (!still.ok) return still;
            // A local cancel started while this acceptance was verified: its tombstone wins and nothing is accepted.
            if (env.v === 2 && withdrawnLocally(session)) return peerBad('TOMBSTONED');
            if (env.v === 2) { statement = done.value as PeerRecord; session.peer!.buyer = statement; }
          }
        } else if (session.terms !== null && env.termsHash !== null && env.termsHash !== session.terms.hash) return bad('HASH_MISMATCH');
        else if (session.terms === null && env.termsHash !== null) return bad('HASH_MISMATCH');
        else {
          const ready = readyToCommit(session, expectedState, rumor.id, expires); if (!ready.ok) return ready;
          if (d1 !== null && session.terms !== null) {
            // An authenticated cancel of reviewed terms is durably tombstoned before the session changes.
            const recorded = await tombstoneFor(session, ready.value); if (!recorded.ok) return recorded;
            const still = readyToCommit(session, expectedState, rumor.id, expires); if (!still.ok) return still;
          }
        }

        session.state = transition(session.state, env.type, senderRole)!;
        remember(id, rumor.id, expires);
        const result = { sessionId: id, rumorId: rumor.id, type: env.type, from, state: session.state, termsHash: env.termsHash, reviewed };
        return { ok: true, value: Object.freeze(statement === null ? result : { ...result, acceptance: roleView(session, statement.evidence, now) }) };
      };
      if (d1 === null) return settle(session, now);
      // D1: copies of one rumor are DUPLICATE while it is in flight, and a session verifies one statement at a time, so
      // replayed wraps cannot occupy the shared verifier. cancel and reject are never held up by a verification.
      if (inflight.has(rumor.id)) return bad('DUPLICATE');
      inflight.add(rumor.id);
      try { return env.v === 2 ? await exclusive(session, () => settle(session, now)) : await settle(session, now); }
      finally { inflight.delete(rumor.id); }
    },
  };
  return Object.freeze(exchange);
}
