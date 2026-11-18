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
