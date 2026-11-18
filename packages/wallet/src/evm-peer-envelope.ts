/** Private D1 carrier candidate. Parsing is not channel authentication, account
 * classification, replay admission or permission to prepare a transaction. */
import { parseEventJson } from '../../nostr-crypto/index.ts';
import { intentData } from '../../schemas/index.ts';
import { snapshotEvmTerms, type EvmDomainInput, type EvmTermsInput } from './evm-terms.ts';
import { snapshotPeerAcceptance, verifyEoaPeerAcceptance, type PeerAcceptanceV1,
  type CandidateEoaPeerVerification } from './evm-peer-acceptance.ts';

// Retain the existing exchange ceiling. This candidate supports only fixed-size
// EOA signatures; larger contract-wallet proofs require their own reviewed budget.
export const MAX_PEER_ENVELOPE_BYTES = 24_576;
export const MAX_PEER_TERMS_BYTES = 16_384;
export const MAX_PEER_MESSAGE_LIFETIME_SECONDS = 3_600n;
const HEX = /^[0-9a-f]{64}$/;
const SIGNATURE = /^0x[0-9a-f]{130}$/;
const U64 = (1n << 64n) - 1n;
const TOP_KEYS = ['v', 'type', 'ad', 'orderId', 'sender', 'recipient', 'nonce', 'expiresAtSeconds', 'termsHash', 'body'];
const utf8 = new TextEncoder();

interface WireProof {
  readonly binding: Readonly<PeerAcceptanceV1>;
  readonly termsSignature: string;
  readonly bindingSignature: string;
}
type Body = { readonly terms: string; readonly acceptance: Readonly<WireProof> } |
  { readonly revision: string; readonly acceptance: Readonly<WireProof> };
export interface CandidatePeerEnvelopeV2 {
  readonly v: 2; readonly type: 'terms-offer' | 'terms-accept';
  readonly ad: string; readonly orderId: string; readonly sender: string; readonly recipient: string;
  readonly nonce: string; readonly expiresAtSeconds: string; readonly termsHash: string;
  readonly body: Readonly<Body>;
}
export interface AuthenticatedPeerEnvelopeContext {
  /** Supplied by the locally authenticated conversation, never from the carrier.
   * The recipient is this client, sender is its expected peer, and ad is the
   * conversation's selected advertisement. Clock is trusted local input. */
  readonly sender: string; readonly recipient: string; readonly ad: string; readonly nowSeconds: string;
}
function seconds(value: unknown, allowZero = false): value is string {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]{0,19})$/.test(value) &&
    BigInt(value) <= U64 && (allowZero || value !== '0');
}
function hex(value: unknown): value is string { return typeof value === 'string' && HEX.test(value); }
function signature(value: unknown): value is string { return typeof value === 'string' && SIGNATURE.test(value); }

/** Strict bounded JSON parser. v1 negotiation and terms-only proofs cannot be
 * upgraded to D1 acceptance. The returned tree contains immutable scalar data. */
export function parseCandidatePeerEnvelope(text: unknown): Readonly<CandidatePeerEnvelopeV2> | null {
  try {
    const raw = intentData(parseEventJson(text, MAX_PEER_ENVELOPE_BYTES, 4), TOP_KEYS);
    if (raw.v !== 2 || (raw.type !== 'terms-offer' && raw.type !== 'terms-accept') ||
        !hex(raw.orderId) || !hex(raw.sender) || !hex(raw.recipient) || raw.sender === raw.recipient ||
        !hex(raw.nonce) || !hex(raw.termsHash) || !seconds(raw.expiresAtSeconds)) return null;
    const seller = raw.type === 'terms-offer' ? raw.sender : raw.recipient;
    if (raw.ad !== `30078:${seller}:p2p-offramp:v1:${raw.orderId}`) return null;
    const body = intentData(raw.body, raw.type === 'terms-offer' ? ['terms', 'acceptance'] : ['revision', 'acceptance']);
    const proof = intentData(body.acceptance, ['binding', 'termsSignature', 'bindingSignature']);
    const binding = snapshotPeerAcceptance(proof.binding);
    if (binding.role !== (raw.type === 'terms-offer' ? 'seller' : 'buyer') || binding.termsHash !== raw.termsHash ||
        binding.ownMessagingKey !== raw.sender || binding.counterpartyMessagingKey !== raw.recipient ||
        !signature(proof.termsSignature) || !signature(proof.bindingSignature)) return null;
    const acceptance = Object.freeze({ binding, termsSignature: proof.termsSignature, bindingSignature: proof.bindingSignature });
    let stableBody: Readonly<Body>;
    if (raw.type === 'terms-offer') {
      if (typeof body.terms !== 'string' || body.terms.length === 0 || body.terms.length > MAX_PEER_TERMS_BYTES ||
          utf8.encode(body.terms).byteLength > MAX_PEER_TERMS_BYTES) return null;
      // The review-document parser must separately validate these opaque bytes.
      stableBody = Object.freeze({ terms: body.terms, acceptance });
    } else {
      if (!seconds(body.revision)) return null;
      stableBody = Object.freeze({ revision: body.revision, acceptance });
    }
    return Object.freeze({ v: 2, type: raw.type, ad: raw.ad, orderId: raw.orderId, sender: raw.sender,
      recipient: raw.recipient, nonce: raw.nonce, expiresAtSeconds: raw.expiresAtSeconds,
      termsHash: raw.termsHash, body: stableBody });
  } catch { return null; }
}

/** Offline composition only: callers first authenticate NIP-17 and independently
 * review terms using their registry. This never discovers an account scheme or
 * persists replay history. A valid result still has no economic authority. */
export function verifyCandidatePeerEnvelope(domain: EvmDomainInput, terms: EvmTermsInput,
  context: AuthenticatedPeerEnvelopeContext, text: unknown): Readonly<CandidateEoaPeerVerification> | null {
  let termsSignature: Uint8Array | undefined, bindingSignature: Uint8Array | undefined;
  try {
    const envelope = parseCandidatePeerEnvelope(text);
    if (!envelope) return null;
    const trusted = intentData(context, ['sender', 'recipient', 'ad', 'nowSeconds']);
    const reviewed = snapshotEvmTerms(terms);
    if (trusted.sender !== envelope.sender || trusted.recipient !== envelope.recipient || trusted.ad !== envelope.ad ||
        !seconds(trusted.nowSeconds, true) || reviewed.orderId !== envelope.orderId ||
        ('revision' in envelope.body && reviewed.revision !== envelope.body.revision)) return null;
    const now = BigInt(trusted.nowSeconds), expiry = BigInt(envelope.expiresAtSeconds);
    if (now >= expiry || expiry - now > MAX_PEER_MESSAGE_LIFETIME_SECONDS) return null;
    const decode = (value: string): Uint8Array => Uint8Array.from(value.slice(2).match(/../g)!, pair => parseInt(pair, 16));
    termsSignature = decode(envelope.body.acceptance.termsSignature);
    bindingSignature = decode(envelope.body.acceptance.bindingSignature);
    return verifyEoaPeerAcceptance(domain, reviewed, {
      role: envelope.body.acceptance.binding.role, ownMessagingKey: envelope.sender,
      counterpartyMessagingKey: envelope.recipient, nowSeconds: trusted.nowSeconds,
      envelopeExpiresAtSeconds: envelope.expiresAtSeconds,
    }, { binding: envelope.body.acceptance.binding, termsSignature, bindingSignature });
  } catch { return null; }
  finally { termsSignature?.fill(0); bindingSignature?.fill(0); }
}

// ---- D1 Option B exchange port (appended; candidate-only, localnet composition) ----
// Implements packages/exchange PeerAcceptancePort structurally (no exchange import) on top of the candidate parser,
// verifier and encrypted CandidatePeerReplayLedger above. Still no economic authority, account classification or RPC.
import type { ReviewedEvmTerms } from '../../domain/index.ts';
import { evmTermsHash, snapshotEvmDomain } from './evm-terms.ts';
import { peerAcceptanceHash } from './evm-peer-acceptance.ts';
import type { CandidatePeerReplayLedger } from './evm-peer-replay.ts';

export interface EvmPeerSignRequest {
  /** 'trade-terms' signs the TradeTerms digest; 'peer-acceptance' signs the PeerAcceptance binding digest. */
  readonly purpose: 'trade-terms' | 'peer-acceptance';
  readonly role: 'seller' | 'buyer'; readonly account: string;
  /** EIP-712 digest, 64 lowercase hex without 0x, recomputed locally from the trusted domain and reviewed terms. */
  readonly digest: string;
  readonly domain: Readonly<EvmDomainInput>; readonly terms: Readonly<EvmTermsInput>; readonly binding: Readonly<PeerAcceptanceV1>;
}
export interface EvmPeerAcceptanceSigner {
  /** The local wallet for `account`; returns a 65-byte EOA signature (r, s, v=27/28) over `digest`. */
  sign(request: Readonly<EvmPeerSignRequest>): Promise<Uint8Array>;
}
export interface EvmPeerAcceptanceSendRequest {
  readonly role: 'seller' | 'buyer'; readonly reviewed: ReviewedEvmTerms; readonly termsHash: string;
  readonly sender: string; readonly recipient: string; readonly notAfterSeconds: string;
}
export interface EvmPeerAcceptanceTrustedContext {
  readonly role: 'seller' | 'buyer'; readonly sender: string; readonly recipient: string; readonly ad: string;
  readonly orderId: string; readonly revision: string; readonly termsHash: string; readonly nowSeconds: string;
}
export interface EvmPeerAcceptanceWire {
  readonly binding: Readonly<PeerAcceptanceV1>; readonly termsSignature: string; readonly bindingSignature: string;
}
export interface EvmVerifiedPeerAcceptance {
  readonly role: 'seller' | 'buyer'; readonly termsHash: string; readonly bindingHash: string; readonly account: string;
  readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  readonly notAfterSeconds: string; readonly effectiveNotAfterSeconds: string;
}
/**
 * CONFLICT: tombstoned termsHash or a different binding for the role. LIMIT_EXCEEDED: the ledger is full: it holds at most
 * MAX_PEER_REPLAY_TERMS (64) termsHashes per vault profile and never evicts, so new terms then fail until a reviewed
 * retention policy exists. UNAVAILABLE: locked, busy, integrity or storage failure.
 */
export type EvmPeerPortResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: 'CONFLICT' | 'LIMIT_EXCEEDED' | 'UNAVAILABLE' };
export interface EvmPeerAcceptancePort {
  encode(request: EvmPeerAcceptanceSendRequest): Promise<EvmPeerAcceptanceWire | null>;
  verify(envelopeText: string, reviewed: ReviewedEvmTerms, context: EvmPeerAcceptanceTrustedContext): Promise<EvmVerifiedPeerAcceptance | null>;
  admit(verified: EvmVerifiedPeerAcceptance): Promise<EvmPeerPortResult<'recorded' | 'duplicate'>>;
  tombstone(termsHash: string): Promise<EvmPeerPortResult<void>>;
}
export interface EvmPeerAcceptancePortOptions {
  /** Locally trusted registry domain (chain id + escrow). Reviewed terms naming any other domain are refused. */
  readonly domain: EvmDomainInput;
  /** Durable replay/tombstone memory, normally a CandidatePeerReplayLedger for the unlocked vault session. */
  readonly replayLedger: Pick<CandidatePeerReplayLedger, 'admitEoa' | 'tombstone'>;
  /** Local wallet; without it `encode` refuses (receive-only port). */
  readonly signer?: EvmPeerAcceptanceSigner;
}
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromSignature = (value: string): Uint8Array => Uint8Array.from(value.slice(2).match(/../g)!, pair => parseInt(pair, 16));
/** G16 EvmTermsInput for locally reviewed terms (registry-derived fields only). */
export function evmTermsFromReviewed(reviewed: ReviewedEvmTerms): Readonly<EvmTermsInput> {
  return snapshotEvmTerms({ orderId: reviewed.orderId, revision: reviewed.revision, networkId: reviewed.network.id, deploymentId: reviewed.deployment.id,
    seller: reviewed.seller, buyer: reviewed.buyer, assetKind: reviewed.asset.kind, asset: reviewed.asset.address ?? ZERO_ADDRESS,
    amountBaseUnits: reviewed.amountBaseUnits, privateAgreementHash: reviewed.privateAgreementSha256, capabilitiesHash: reviewed.capabilitiesSha256,
    sellerNonce: reviewed.sellerNonce, acceptBeforeSeconds: reviewed.acceptBeforeSeconds, escrowExpirySeconds: reviewed.escrowExpirySeconds });
}

/**
 * Exchange PeerAcceptancePort for EOAs. encode signs (TradeTerms + PeerAcceptance) with the injected signer and
 * self-verifies before anything is sent; verify parses and verifies the exact v2 envelope against the trusted domain,
 * reviewed terms and authenticated context; admit re-verifies inside the durable ledger (tombstones and conflicting
 * bindings fail closed, identical bindings are duplicates); tombstone is irreversible. Ledger calls are serialized so
 * concurrent sessions never collide on the ledger's single-operation guard. Results are candidate-only evidence.
 */
export function createEvmPeerAcceptancePort(options: EvmPeerAcceptancePortOptions): Readonly<EvmPeerAcceptancePort> {
  const raw = intentData(options, Object.hasOwn(options ?? {}, 'signer') ? ['domain', 'replayLedger', 'signer'] : ['domain', 'replayLedger']);
  const domain = snapshotEvmDomain(raw.domain as EvmDomainInput), ledger = raw.replayLedger as EvmPeerAcceptancePortOptions['replayLedger'];
  const signer = raw.signer as EvmPeerAcceptanceSigner | undefined;
  if (typeof ledger?.admitEoa !== 'function' || typeof ledger.tombstone !== 'function' ||
      (signer !== undefined && typeof signer?.sign !== 'function')) throw new TypeError('INVALID_OPTIONS');
  // Verified results map to the exact proof material admit needs; single use, never exposed.
  const pending = new WeakMap<object, { terms: Readonly<EvmTermsInput>; context: EoaPeerContextInput; binding: Readonly<PeerAcceptanceV1>;
    termsSignature: string; bindingSignature: string }>();
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work); tail = run.then(() => undefined, () => undefined); return run;
  };
  const sameDomain = (reviewed: ReviewedEvmTerms): boolean =>
    reviewed.network.chainId === domain.chainId && reviewed.deployment.address === domain.verifyingContract;
  const mapped = <T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): EvmPeerPortResult<T> =>
    result.ok ? Object.freeze({ ok: true as const, value: result.value }) : Object.freeze({ ok: false as const,
      code: result.error.code === 'CONFLICT' ? 'CONFLICT' as const : result.error.code === 'LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED' as const : 'UNAVAILABLE' as const });

  return Object.freeze({
    async encode(request: EvmPeerAcceptanceSendRequest): Promise<EvmPeerAcceptanceWire | null> {
      const owned: Uint8Array[] = [];
      try {
        if (signer === undefined) return null;
        const req = intentData(request, ['role', 'reviewed', 'termsHash', 'sender', 'recipient', 'notAfterSeconds']);
        const reviewed = req.reviewed as ReviewedEvmTerms, rawRole = req.role;
        if ((rawRole !== 'seller' && rawRole !== 'buyer') || !sameDomain(reviewed)) return null;
        const role: 'seller' | 'buyer' = rawRole;
        const terms = evmTermsFromReviewed(reviewed), termsHash = evmTermsHash(domain, terms);
        if (termsHash !== req.termsHash) return null;
        const binding = snapshotPeerAcceptance({ v: 1, termsHash, role, account: terms[role], ownMessagingKey: req.sender,
          counterpartyMessagingKey: req.recipient, notAfterSeconds: req.notAfterSeconds });
        const base = { role, account: binding.account, domain, terms, binding };
        const termsSignature = await signer.sign(Object.freeze({ ...base, purpose: 'trade-terms' as const, digest: termsHash }));
        const bindingSignature = await signer.sign(Object.freeze({ ...base, purpose: 'peer-acceptance' as const, digest: peerAcceptanceHash(domain, binding) }));
        if (!(termsSignature instanceof Uint8Array) || !(bindingSignature instanceof Uint8Array)) return null;
        const termsCopy = new Uint8Array(termsSignature), bindingCopy = new Uint8Array(bindingSignature); owned.push(termsCopy, bindingCopy);
        // Never send a proof this client would not itself accept (wrong account, malformed or high-s signature).
        if (verifyEoaPeerAcceptance(domain, terms, { role, ownMessagingKey: binding.ownMessagingKey, counterpartyMessagingKey: binding.counterpartyMessagingKey,
          nowSeconds: '0', envelopeExpiresAtSeconds: binding.notAfterSeconds }, { binding, termsSignature: termsCopy, bindingSignature: bindingCopy }) === null) return null;
        return Object.freeze({ binding, termsSignature: `0x${toHex(termsCopy)}`, bindingSignature: `0x${toHex(bindingCopy)}` });
      } catch { return null; }
      finally { for (const bytes of owned) bytes.fill(0); }
    },
    async verify(envelopeText: string, reviewed: ReviewedEvmTerms, context: EvmPeerAcceptanceTrustedContext): Promise<EvmVerifiedPeerAcceptance | null> {
      try {
        const trusted = intentData(context, ['role', 'sender', 'recipient', 'ad', 'orderId', 'revision', 'termsHash', 'nowSeconds']);
        if (!sameDomain(reviewed)) return null;
        const envelope = parseCandidatePeerEnvelope(envelopeText);
        if (!envelope) return null;
        const terms = evmTermsFromReviewed(reviewed), binding = envelope.body.acceptance.binding;
        if (binding.role !== trusted.role || envelope.type !== (trusted.role === 'seller' ? 'terms-offer' : 'terms-accept') ||
            envelope.termsHash !== trusted.termsHash || envelope.orderId !== trusted.orderId || terms.orderId !== trusted.orderId ||
            terms.revision !== trusted.revision || ('revision' in envelope.body && envelope.body.revision !== trusted.revision) ||
            evmTermsHash(domain, terms) !== trusted.termsHash) return null;
        const verified = verifyCandidatePeerEnvelope(domain, terms, { sender: trusted.sender as string, recipient: trusted.recipient as string,
          ad: trusted.ad as string, nowSeconds: trusted.nowSeconds as string }, envelopeText);
        if (!verified || verified.termsHash !== trusted.termsHash) return null;
        const result: EvmVerifiedPeerAcceptance = Object.freeze({ role: binding.role, termsHash: verified.termsHash, bindingHash: verified.bindingHash,
          account: binding.account, ownMessagingKey: binding.ownMessagingKey, counterpartyMessagingKey: binding.counterpartyMessagingKey,
          notAfterSeconds: binding.notAfterSeconds, effectiveNotAfterSeconds: verified.effectiveNotAfterSeconds });
        pending.set(result, { terms, binding, termsSignature: envelope.body.acceptance.termsSignature, bindingSignature: envelope.body.acceptance.bindingSignature,
          context: { role: binding.role, ownMessagingKey: binding.ownMessagingKey, counterpartyMessagingKey: binding.counterpartyMessagingKey,
            nowSeconds: trusted.nowSeconds as string, envelopeExpiresAtSeconds: envelope.expiresAtSeconds } });
        return result;
      } catch { return null; }
    },
    admit(verified: EvmVerifiedPeerAcceptance): Promise<EvmPeerPortResult<'recorded' | 'duplicate'>> {
      const material = typeof verified === 'object' && verified !== null ? pending.get(verified) : undefined;
      if (material === undefined) return Promise.resolve(Object.freeze({ ok: false as const, code: 'UNAVAILABLE' as const }));
      pending.delete(verified);
      return serial(async () => {
        const termsSignature = fromSignature(material.termsSignature), bindingSignature = fromSignature(material.bindingSignature);
        try {
          const result = await ledger.admitEoa(domain, material.terms, material.context, { binding: material.binding, termsSignature, bindingSignature });
          return result.ok ? mapped({ ok: true, value: result.value.status }) : mapped(result);
        } catch { return Object.freeze({ ok: false as const, code: 'UNAVAILABLE' as const }); }
        finally { termsSignature.fill(0); bindingSignature.fill(0); }
      });
    },
    tombstone(termsHash: string): Promise<EvmPeerPortResult<void>> {
      return serial(async () => {
        try { return mapped(await ledger.tombstone(termsHash)); }
        catch { return Object.freeze({ ok: false as const, code: 'UNAVAILABLE' as const }); }
      });
    },
  });
}
type EoaPeerContextInput = { readonly role: 'seller' | 'buyer'; readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  readonly nowSeconds: string; readonly envelopeExpiresAtSeconds: string };
