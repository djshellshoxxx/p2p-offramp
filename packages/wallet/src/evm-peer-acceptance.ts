/** Candidate D1 Option B primitive. Offline/test-only; no transport, wallet prompt,
 * account-code classification, durable replay admission or economic authority.
 * The proposed fields need protocol review before any wire/runtime integration. */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { intentData } from '../../schemas/index.ts';
import { EvmTermsError, addressWord, bytes32Word, domainSeparator, eip712Digest, evmTermsHash, keccak256,
  snapshotEvmDomain, snapshotEvmTerms, uintWord, verifyEoaSignature, type EvmDomainInput, type EvmTermsInput } from './evm-terms.ts';

export const PEER_ACCEPTANCE_TYPE = 'PeerAcceptance(uint8 v,bytes32 termsHash,uint8 role,address account,bytes32 ownMessagingKey,bytes32 counterpartyMessagingKey,uint64 notAfterSeconds)';
const FIELDS = ['v', 'termsHash', 'role', 'account', 'ownMessagingKey', 'counterpartyMessagingKey', 'notAfterSeconds'];
const CONTEXT_FIELDS = ['role', 'ownMessagingKey', 'counterpartyMessagingKey', 'nowSeconds', 'envelopeExpiresAtSeconds'];
const U64 = (1n << 64n) - 1n;
const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fail = (): never => { throw new EvmTermsError(); };
export interface PeerAcceptanceV1 {
  readonly v: 1; readonly termsHash: string; readonly role: 'seller' | 'buyer'; readonly account: string;
  readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string; readonly notAfterSeconds: string;
}
export interface EoaPeerContext {
  /** All fields come from the locally authenticated session, never the peer proof. */
  readonly role: 'seller' | 'buyer'; readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  readonly nowSeconds: string; readonly envelopeExpiresAtSeconds: string;
}
export interface CandidateEoaPeerProof {
  readonly binding: PeerAcceptanceV1; readonly termsSignature: Uint8Array; readonly bindingSignature: Uint8Array;
}
export interface CandidateEoaPeerVerification {
  readonly candidateOnly: true; readonly economicPreparationAllowed: false;
  readonly termsHash: string; readonly bindingHash: string; readonly effectiveNotAfterSeconds: string;
}
function seconds(value: unknown, zero = false): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/.test(value)) return fail();
  const number = BigInt(value);
  if (number > U64 || !zero && number === 0n) return fail();
  return value;
}
function role(value: unknown): 'seller' | 'buyer' {
  if (value !== 'seller' && value !== 'buyer') return fail();
  return value;
}
function messagingKey(value: unknown): string {
  const x = bytes32Word(value), compressed = new Uint8Array(33);
  compressed[0] = 2; compressed.set(x, 1);
  try { secp256k1.Point.fromBytes(compressed).assertValidity(); } catch { return fail(); }
  return value as string;
}
/** Snapshots exact own data fields without invoking foreign getters or coercions. */
export function snapshotPeerAcceptance(input: unknown): Readonly<PeerAcceptanceV1> {
  try {
    const raw = intentData(input, FIELDS);
    if (raw.v !== 1) return fail();
    bytes32Word(raw.termsHash); addressWord(raw.account);
    const ownMessagingKey = messagingKey(raw.ownMessagingKey), counterpartyMessagingKey = messagingKey(raw.counterpartyMessagingKey);
    if (ownMessagingKey === counterpartyMessagingKey) return fail();
    return Object.freeze({ v: 1, termsHash: raw.termsHash as string, role: role(raw.role), account: raw.account as string,
      ownMessagingKey, counterpartyMessagingKey, notAfterSeconds: seconds(raw.notAfterSeconds) });
  } catch { return fail(); }
}
/** EIP-712 digest, hex without 0x. Domain remains P2POfframp/version 1.
 * Separate struct name and v prevent treating a TradeTerms signature as this binding. */
export function peerAcceptanceHash(domain: EvmDomainInput, input: PeerAcceptanceV1): string {
  const stableDomain = snapshotEvmDomain(domain), binding = snapshotPeerAcceptance(input);
  const words = [keccak256(new TextEncoder().encode(PEER_ACCEPTANCE_TYPE)), uintWord(1n, 255n), bytes32Word(binding.termsHash),
    uintWord(binding.role === 'seller' ? 0n : 1n, 255n), addressWord(binding.account), bytes32Word(binding.ownMessagingKey),
    bytes32Word(binding.counterpartyMessagingKey), uintWord(BigInt(binding.notAfterSeconds), U64)];
  const encoded = new Uint8Array(words.length * 32);
  words.forEach((word, index) => encoded.set(word, index * 32));
  return hex(eip712Digest(domainSeparator(stableDomain), keccak256(encoded)));
}
function signatureCopy(value: unknown): Uint8Array<ArrayBuffer> {
  try {
    if (!(value instanceof Uint8Array) || byteLength.call(value) !== 65) return fail();
    return new Uint8Array(value);
  } catch { return fail(); }
}
/** Verify both EOA signatures against locally reviewed terms and authenticated
 * messaging context. Null means valid-shaped but mismatched/expired proof;
 * malformed input throws the fixed INVALID_INPUT error. Caller buffers stay owned
 * by the caller. This does not determine EOA-vs-contract/delegated account type,
 * persist replay/tombstone state, attest chain time, or grant funding authority. */
export function verifyEoaPeerAcceptance(domain: EvmDomainInput, terms: EvmTermsInput, context: EoaPeerContext,
  input: CandidateEoaPeerProof): Readonly<CandidateEoaPeerVerification> | null {
  const owned: Uint8Array[] = [];
  try {
    const stableDomain = snapshotEvmDomain(domain), stableTerms = snapshotEvmTerms(terms);
    const expected = intentData(context, CONTEXT_FIELDS), proof = intentData(input, ['binding', 'termsSignature', 'bindingSignature']);
    const binding = snapshotPeerAcceptance(proof.binding), expectedRole = role(expected.role);
    const ownKey = messagingKey(expected.ownMessagingKey), counterpartyKey = messagingKey(expected.counterpartyMessagingKey);
    if (ownKey === counterpartyKey) return fail();
    const now = BigInt(seconds(expected.nowSeconds, true)), envelopeExpiry = BigInt(seconds(expected.envelopeExpiresAtSeconds));
    const termsSignature = signatureCopy(proof.termsSignature); owned.push(termsSignature);
    const bindingSignature = signatureCopy(proof.bindingSignature); owned.push(bindingSignature);
    const termsHash = evmTermsHash(stableDomain, stableTerms), bindingHash = peerAcceptanceHash(stableDomain, binding);
    const deadline = [BigInt(binding.notAfterSeconds), BigInt(seconds(stableTerms.acceptBeforeSeconds)), envelopeExpiry]
      .reduce((earliest, value) => value < earliest ? value : earliest);
    if (binding.termsHash !== termsHash || binding.role !== expectedRole || binding.account !== stableTerms[expectedRole] ||
        binding.ownMessagingKey !== ownKey || binding.counterpartyMessagingKey !== counterpartyKey || now >= deadline) return null;
    if (!verifyEoaSignature(termsHash, termsSignature, binding.account) ||
        !verifyEoaSignature(bindingHash, bindingSignature, binding.account)) return null;
    return Object.freeze({ candidateOnly: true, economicPreparationAllowed: false, termsHash, bindingHash,
      effectiveNotAfterSeconds: deadline.toString() });
  } catch { return fail(); }
  finally { for (const bytes of owned) bytes.fill(0); }
}
