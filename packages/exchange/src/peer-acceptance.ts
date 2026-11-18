/**
 * D1 Option B peer-acceptance carrier: version 2 envelopes for `terms-offer` and `terms-accept`, and the ports through
 * which the exchange verifies and durably admits wallet acceptance statements.
 *
 * Each statement is two wallet signatures by the account the reviewed terms name for the sender's role: one over the
 * EIP-712 TradeTerms digest (the termsHash) and one over the EIP-712 PeerAcceptance binding (termsHash, role, account,
 * both messaging keys, notAfterSeconds) in the same registry-derived domain. Neither signature alone is accepted.
 *
 * This package stays wallet- and chain-free. Signature checks, account classification from pinned native code,
 * ERC-1271 reads and the encrypted replay ledger are injected by composition (packages/wallet/src/evm-peer-port.ts
 * implements both ports); nothing here imports packages/wallet.
 *
 * Authority: a verified acceptance is a point-in-time communication fact about two wallet statements. It never funds,
 * approves, releases or refunds; chain observation stays the only funding authority, and the escrow lets the seller fund
 * without any acceptance. After funding, acceptance state never vetoes release, refund or payout.
 */
import { parseEventJson } from '../../nostr-crypto/index.ts';
import type { ReviewedEvmTerms } from '../../domain/index.ts';
import type { Role } from './machine.ts';
import { isEvmAddress, isHex64, MAX_ENVELOPE_BYTES, MAX_OFFER_TERMS_BYTES, parseAdAddress } from './messages.ts';

/** Struct version inside the signed PeerAcceptance binding (distinct from the envelope version). */
export const PEER_ACCEPTANCE_BINDING_VERSION = 1;
/** Decoded bytes per signature. EOA signatures must be exactly 65 bytes; contract-wallet (ERC-1271) signatures may use
 * up to this many. Both signatures, the binding and (for an offer) the terms share the unchanged 24,576-byte envelope cap,
 * so an offer with the largest terms and the largest contract signatures is refused before sending (LIMIT_EXCEEDED). */
export const MAX_PEER_SIGNATURE_BYTES = 2048;
/** acceptBeforeSeconds may be at most this far ahead when a statement is admitted. Bounds each replay-ledger entry's
 * life: entries retire only after the terms deadline (plus grace), so terms cannot pin ledger capacity indefinitely. */
export const MAX_PEER_ACCEPT_HORIZON_SECONDS = 604_800;
/** Funding rechecks require the statement to stay valid at least this long (block.timestamp vs local clock skew). */
export const FUNDING_SAFETY_MARGIN_SECONDS = 120;

export type PeerMessageType = 'terms-offer' | 'terms-accept';
export interface PeerAcceptanceBinding {
  readonly v: 1; readonly termsHash: string; readonly role: Role; readonly account: string;
  /** Always the signer's messaging key, also when the local client is the recipient. */
  readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  /** Positive canonical decimal seconds (uint64). */
  readonly notAfterSeconds: string;
}
/** Wire acceptance: the binding plus both signatures as canonical lowercase 0x-prefixed hex. No scheme field: the
 * verifier derives EOA vs contract wallet from pinned native code, never from the sender. */
export interface PeerAcceptanceWire {
  readonly binding: PeerAcceptanceBinding; readonly termsSignature: string; readonly bindingSignature: string;
}
export type PeerOfferBody = { readonly terms: string; readonly acceptance: PeerAcceptanceWire };
export type PeerAcceptBody = { readonly revision: string; readonly acceptance: PeerAcceptanceWire };
export interface ExchangeEnvelopeV2 {
  readonly v: 2; readonly type: PeerMessageType;
  readonly ad: string; readonly orderId: string; readonly sender: string; readonly recipient: string;
  readonly nonce: string; readonly expiresAtSeconds: string; readonly termsHash: string;
  readonly body: PeerOfferBody | PeerAcceptBody;
}

/** Refusal vocabulary shared by both ports. */
export type PeerAcceptanceCode = 'INVALID_INPUT' | 'UNAUTHORIZED' | 'EXPIRED' | 'WRONG_CHAIN' | 'UNSUPPORTED' | 'TOMBSTONED'
  | 'CONFLICT' | 'LIMIT_EXCEEDED' | 'UNAVAILABLE' | 'TIMEOUT' | 'CANCELLED' | 'LOCKED' | 'INTEGRITY_FAILURE';
export type PeerPortResult<T> = { readonly ok: true; readonly value: T } |
  { readonly ok: false; readonly code: PeerAcceptanceCode; readonly reason?: string };

/** Everything here comes from the locally authenticated session and local review, except `acceptance`. */
export interface PeerVerificationRequest {
  /** Terms reviewed locally against the local registry (network and deployment are registry values). */
  readonly reviewed: ReviewedEvmTerms;
  /** The exchange's own hashTerms(reviewed); the verifier recomputes it from its registry and must agree. */
  readonly termsHash: string;
  /** Role of the signer, fixed by the session (who sent or is sending), never by the message. */
  readonly role: Role;
  /** Signer's authenticated messaging key (NIP-17 seal author, or self when sending) and the other party's key. */
  readonly signerMessagingKey: string; readonly counterpartyMessagingKey: string;
  /** Trusted local unix seconds. */
  readonly nowSeconds: number;
  /** Authenticated envelope deadline on arrival; null when rechecking a stored statement. */
  readonly envelopeExpiresAtSeconds: number | null;
  readonly acceptance: PeerAcceptanceWire;
}
/** Verified statement metadata. Never contains signature bytes. */
export interface PeerVerifiedEvidence {
  readonly scheme: 'eoa' | 'erc1271';
  readonly binding: PeerAcceptanceBinding;
  readonly termsHash: string; readonly bindingHash: string;
  /** min(acceptBeforeSeconds, notAfterSeconds), plus the envelope expiry on arrival. */
  readonly effectiveNotAfterSeconds: string;
  /** Block whose code and ERC-1271 answers were read. Not finalized; rechecked before display and economic actions. */
  readonly anchor: { readonly height: string; readonly hash: string; readonly timestamp: string };
  readonly finality: 'unfinalized';
  readonly economicPreparationAllowed: false;
}
export interface PeerAcceptanceVerifierPort {
  verify(request: PeerVerificationRequest, signal?: AbortSignal): Promise<PeerPortResult<PeerVerifiedEvidence>>;
}
export interface PeerReplayScope {
  /** Advertisement address of the session and the counterparty's messaging key, for per-ad and per-peer quotas. */
  readonly ad: string; readonly peer: string;
  /** Terms deadline that the termsHash commits to; entries retire only after it (plus grace). */
  readonly acceptBeforeSeconds: string;
  readonly nowSeconds: number;
}
/** Durable, encrypted replay and cancellation memory keyed by (termsHash, role). Called only after authenticated receipt
 * (or before a local send) and only for the live session's own statements. */
export interface PeerReplayStorePort {
  /** Record a statement returned by this composition's verifier. Identical binding: duplicate (signature bytes never
   * compared). Different binding for the same (termsHash, role): CONFLICT. Tombstoned termsHash: TOMBSTONED. */
  admit(evidence: PeerVerifiedEvidence, scope: PeerReplayScope): Promise<PeerPortResult<{ readonly status: 'recorded' | 'duplicate' }>>;
  /** Irreversibly refuse every later statement for termsHash (cancel/reject). Idempotent. */
  tombstone(termsHash: string, scope: PeerReplayScope): Promise<PeerPortResult<void>>;
  /** Persisted-fresh read for display and economic rechecks. */
  status(termsHash: string, nowSeconds: number): Promise<PeerPortResult<{ readonly tombstoned: boolean }>>;
}
export interface PeerAcceptanceOptions {
  readonly verifier: PeerAcceptanceVerifierPort;
  readonly replay: PeerReplayStorePort;
}

const SIGNATURE = /^0x(?:[0-9a-f]{2})+$/, SECONDS = /^[1-9][0-9]{0,11}$/, DECIMAL = /^[1-9][0-9]{0,19}$/;
const U64 = (1n << 64n) - 1n;
const ENVELOPE_KEYS = ['v', 'type', 'ad', 'orderId', 'sender', 'recipient', 'nonce', 'expiresAtSeconds', 'termsHash', 'body'];
const BINDING_KEYS = ['v', 'termsHash', 'role', 'account', 'ownMessagingKey', 'counterpartyMessagingKey', 'notAfterSeconds'];
const WIRE_KEYS = ['binding', 'termsSignature', 'bindingSignature'];
const utf8 = new TextEncoder();

/** Own enumerable data properties exactly equal to `keys`, plain prototype, no accessors. */
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
      copy[key] = descriptor.value;
    }
    return copy;
  } catch { return null; }
}
const uint64 = (value: unknown): value is string => typeof value === 'string' && DECIMAL.test(value) && BigInt(value) <= U64;
/** Canonical lowercase 0x hex of 1..MAX_PEER_SIGNATURE_BYTES bytes. */
export function isPeerSignatureHex(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 4 && value.length <= 2 + 2 * MAX_PEER_SIGNATURE_BYTES && SIGNATURE.test(value);
}
/** Strict snapshot of a binding: exact keys, canonical lowercase hex, distinct keys, positive uint64 deadline. */
export function parsePeerAcceptanceBinding(input: unknown): Readonly<PeerAcceptanceBinding> | null {
  const raw = exact(input, BINDING_KEYS);
  if (raw === null || raw.v !== PEER_ACCEPTANCE_BINDING_VERSION || !isHex64(raw.termsHash) || (raw.role !== 'seller' && raw.role !== 'buyer') ||
      !isEvmAddress(raw.account) || !isHex64(raw.ownMessagingKey) || !isHex64(raw.counterpartyMessagingKey) ||
      raw.ownMessagingKey === raw.counterpartyMessagingKey || !uint64(raw.notAfterSeconds)) return null;
  return Object.freeze({ v: 1, termsHash: raw.termsHash, role: raw.role, account: raw.account, ownMessagingKey: raw.ownMessagingKey,
    counterpartyMessagingKey: raw.counterpartyMessagingKey, notAfterSeconds: raw.notAfterSeconds });
}
/** Strict, deep-frozen copy of a wire acceptance (no scheme or authority fields). */
export function parsePeerAcceptanceWire(input: unknown): Readonly<PeerAcceptanceWire> | null {
  const raw = exact(input, WIRE_KEYS);
  if (raw === null || !isPeerSignatureHex(raw.termsSignature) || !isPeerSignatureHex(raw.bindingSignature)) return null;
  const binding = parsePeerAcceptanceBinding(raw.binding);
  return binding === null ? null : Object.freeze({ binding, termsSignature: raw.termsSignature, bindingSignature: raw.bindingSignature });
}

/**
 * Strict parse of version 2 rumor content. Returns null for any deviation. A version 1 envelope, a body without its
 * acceptance, or an acceptance without its binding or either signature is null: there is no downgrade to terms-only
 * or `{revision}`-only acceptance. The binding must name the sender as signer, the recipient as counterparty, the
 * envelope termsHash and the role implied by the type (offer: seller, the advert author; accept: buyer).
 * Parsing is not authentication, terms review, signature verification or replay admission.
 */
export function parseEnvelopeV2(text: unknown): Readonly<ExchangeEnvelopeV2> | null {
  let parsed: unknown;
  try { parsed = parseEventJson(text, MAX_ENVELOPE_BYTES, 4); } catch { return null; }
  const raw = exact(parsed, ENVELOPE_KEYS);
  if (raw === null || raw.v !== 2 || (raw.type !== 'terms-offer' && raw.type !== 'terms-accept')) return null;
  const type = raw.type, address = parseAdAddress(raw.ad);
  if (address === null || raw.orderId !== address.orderId || !isHex64(raw.sender) || !isHex64(raw.recipient) || raw.sender === raw.recipient ||
      !isHex64(raw.nonce) || !isHex64(raw.termsHash) || typeof raw.expiresAtSeconds !== 'string' || !SECONDS.test(raw.expiresAtSeconds)) return null;
  const sender = raw.sender, recipient = raw.recipient, termsHash = raw.termsHash;
  if (address.author !== (type === 'terms-offer' ? sender : recipient)) return null;
  const body = exact(raw.body, type === 'terms-offer' ? ['terms', 'acceptance'] : ['revision', 'acceptance']);
  if (body === null) return null;
  const acceptance = parsePeerAcceptanceWire(body.acceptance);
  if (acceptance === null) return null;
  const binding = acceptance.binding;
  if (binding.role !== (type === 'terms-offer' ? 'seller' : 'buyer') || binding.termsHash !== termsHash ||
      binding.ownMessagingKey !== sender || binding.counterpartyMessagingKey !== recipient) return null;
  let stableBody: PeerOfferBody | PeerAcceptBody;
  if (type === 'terms-offer') {
    const terms = body.terms;
    if (typeof terms !== 'string' || terms.length === 0 || terms.length > MAX_OFFER_TERMS_BYTES || utf8.encode(terms).byteLength > MAX_OFFER_TERMS_BYTES) return null;
    stableBody = Object.freeze({ terms, acceptance });
  } else {
    if (!uint64(body.revision)) return null;
    stableBody = Object.freeze({ revision: body.revision, acceptance });
  }
  return Object.freeze({ v: 2, type, ad: raw.ad as string, orderId: raw.orderId as string, sender, recipient, nonce: raw.nonce,
    expiresAtSeconds: raw.expiresAtSeconds, termsHash, body: stableBody });
}
/** Canonical field order, matching the v1 envelope order. */
export function encodeEnvelopeV2(envelope: ExchangeEnvelopeV2): string {
  const { v, type, ad, orderId, sender, recipient, nonce, expiresAtSeconds, termsHash, body } = envelope;
  const { binding, termsSignature, bindingSignature } = body.acceptance;
  const acceptance = { binding: { v: binding.v, termsHash: binding.termsHash, role: binding.role, account: binding.account,
    ownMessagingKey: binding.ownMessagingKey, counterpartyMessagingKey: binding.counterpartyMessagingKey, notAfterSeconds: binding.notAfterSeconds },
    termsSignature, bindingSignature };
  const stableBody = 'terms' in body ? { terms: body.terms, acceptance } : { revision: body.revision, acceptance };
  return JSON.stringify({ v, type, ad, orderId, sender, recipient, nonce, expiresAtSeconds, termsHash, body: stableBody });
}

/** Per-role acceptance view. Never contains signature bytes. */
export interface PeerAcceptanceRoleView {
  readonly role: Role; readonly account: string; readonly scheme: 'eoa' | 'erc1271';
  readonly termsHash: string; readonly notAfterSeconds: string; readonly effectiveNotAfterSeconds: string;
  readonly anchorHeight: string; readonly anchorHash: string; readonly finality: 'unfinalized';
  /** Trusted local seconds of the verification behind this view. */
  readonly checkedAtSeconds: number;
  readonly label: string;
}
export type PeerAcceptanceState = 'none' | 'seller-verified' | 'both-verified' | 'withdrawn' | 'expired' | 'invalid';
export interface PeerAcceptanceStatus {
  readonly termsHash: string | null;
  readonly state: PeerAcceptanceState;
  readonly seller: PeerAcceptanceRoleView | null; readonly buyer: PeerAcceptanceRoleView | null;
  /** First refusal behind `invalid`/`expired`, for diagnostics; never a signature or provider message. */
  readonly refusal: PeerAcceptanceCode | null;
  /** Display text, or null when nothing may be shown as accepted. Version 1 `{revision}` never produces a label. */
  readonly label: string | null;
  /** Replay and cancellation memory is this profile's local history. A restored or other profile cannot see tombstones
   * recorded elsewhere or after its backup, so no status claims global freshness. */
  readonly freshness: 'local-history';
  readonly economicPreparationAllowed: false;
}
/** Display label for one verified statement. Contract-wallet answers are point-in-time reads of an unfinalized block. */
export function peerRoleLabel(evidence: Pick<PeerVerifiedEvidence, 'scheme' | 'anchor' | 'binding'>): string {
  const who = evidence.binding.role === 'seller' ? 'seller' : 'buyer';
  return evidence.scheme === 'erc1271'
    ? `${who}: accepted by contract wallet at block ${evidence.anchor.height} (unfinalized)`
    : `${who}: signed by wallet ${evidence.binding.account}`;
}
export const BOTH_VERIFIED_LABEL = 'signatures verified for both wallets';
