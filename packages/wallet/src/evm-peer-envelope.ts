/** Offline EOA-only view of the D1 version 2 carrier. The wire format has one definition: packages/exchange
 * `parseEnvelopeV2` (the live carrier). This module narrows it to fixed 65-byte EOA signatures and valid BIP-340 key
 * points for the fixed vectors. Parsing is not channel authentication, account classification, replay admission or
 * permission to prepare a transaction; the exchange composition (evm-peer-port.ts) does those. */
import { parseEnvelopeV2, MAX_ENVELOPE_BYTES, MAX_OFFER_TERMS_BYTES, type ExchangeEnvelopeV2 } from '../../exchange/index.ts';
import { intentData } from '../../schemas/index.ts';
import { snapshotEvmTerms, type EvmDomainInput, type EvmTermsInput } from './evm-terms.ts';
import { snapshotPeerAcceptance, verifyEoaPeerAcceptance, type CandidateEoaPeerVerification, type PeerRegistryView } from './evm-peer-acceptance.ts';

// Same ceilings as the exchange carrier (one wire format). EOA signatures are exactly 65 bytes here; the exchange
// carrier separately allows contract-wallet signatures up to MAX_PEER_SIGNATURE_BYTES within the same aggregate cap.
export const MAX_PEER_ENVELOPE_BYTES = MAX_ENVELOPE_BYTES;
export const MAX_PEER_TERMS_BYTES = MAX_OFFER_TERMS_BYTES;
export const MAX_PEER_MESSAGE_LIFETIME_SECONDS = 3_600n;
const EOA_SIGNATURE = /^0x[0-9a-f]{130}$/;
const U64 = (1n << 64n) - 1n;

export type CandidatePeerEnvelopeV2 = ExchangeEnvelopeV2;
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

/** Strict bounded JSON parser (the exchange's version 2 parser, narrowed to EOA vectors). v1 negotiation and
 * terms-only proofs cannot be upgraded to D1 acceptance. The returned tree contains immutable scalar data. */
export function parseCandidatePeerEnvelope(text: unknown): Readonly<CandidatePeerEnvelopeV2> | null {
  try {
    const envelope = parseEnvelopeV2(text);
    if (envelope === null) return null;
    const acceptance = envelope.body.acceptance;
    if (!EOA_SIGNATURE.test(acceptance.termsSignature) || !EOA_SIGNATURE.test(acceptance.bindingSignature)) return null;
    snapshotPeerAcceptance(acceptance.binding); // valid secp256k1 key points
    return envelope;
  } catch { return null; }
}

/** Offline composition only: callers first authenticate NIP-17 and independently
 * review terms using their registry. The domain must equal the local registry entry.
 * This never discovers an account scheme or persists replay history. A valid result
 * still has no economic authority. */
export function verifyCandidatePeerEnvelope(registry: PeerRegistryView, domain: EvmDomainInput, terms: EvmTermsInput,
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
    return verifyEoaPeerAcceptance(registry, domain, reviewed, {
      role: envelope.body.acceptance.binding.role, ownMessagingKey: envelope.sender,
      counterpartyMessagingKey: envelope.recipient, nowSeconds: trusted.nowSeconds,
      envelopeExpiresAtSeconds: envelope.expiresAtSeconds,
    }, { binding: envelope.body.acceptance.binding, termsSignature, bindingSignature });
  } catch { return null; }
  finally { termsSignature?.fill(0); bindingSignature?.fill(0); }
}
