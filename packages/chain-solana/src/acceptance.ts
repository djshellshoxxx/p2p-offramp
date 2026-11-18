/**
 * Solana peer acceptance (D1 Option B in Solana-native form). Verify only: no wallet, transport or key, and no
 * economic authority. Each party's wallet signs two Solana off-chain v1 messages (offchain.ts): the terms consent
 * (identical bytes for both parties; signers seller and buyer) and its own peer acceptance (signer: that wallet),
 * which binds role, wallet, both messaging keys, the registry ids, genesis, program, termsHash and expiry.
 * A terms signature without the acceptance is never a peer acceptance. Formats: docs/acceptance.md.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { createCoreError, createOperationId } from '../../domain/index.ts';
import type { CoreErrorCode, CoreResult } from '../../schemas/index.ts';
import { isBoundSolanaTrade, type BoundSolanaTrade } from './bind.ts';
import { decimalU64, decodeKey, encodeBase58, equalBytes, fail, failureCode, fromHex32, hex } from './codec.ts';
import { bytesOf, decodeOffchainMessageV1, encodeOffchainMessageV1, verifyEd25519StrictAll } from './offchain.ts';

export const SOLANA_TERMS_CONSENT_DOMAIN = 'p2p-offramp/solana/terms-consent/v1';
export const SOLANA_PEER_ACCEPTANCE_DOMAIN = 'p2p-offramp/solana/peer-acceptance/v1';
export const TERMS_CONSENT_SENTENCE = 'Off-chain consent to the escrow terms below. Signing it moves no funds.';
export const PEER_ACCEPTANCE_SENTENCE = 'Off-chain acceptance binding this wallet to two chat keys. It moves no funds.';

export type SolanaRole = 'seller' | 'buyer';
export interface SolanaTermsConsentV1 {
  readonly v: 1; readonly networkId: string; readonly deploymentId: string; readonly genesisHash: string;
  readonly programId: string; readonly seller: string; readonly buyer: string; readonly termsHash: string;
}
export interface SolanaPeerAcceptanceV1 {
  readonly v: 1; readonly role: SolanaRole; readonly wallet: string; readonly ownMessagingKey: string;
  readonly counterpartyMessagingKey: string; readonly networkId: string; readonly deploymentId: string;
  readonly genesisHash: string; readonly programId: string; readonly termsHash: string;
  readonly notAfterSeconds: string;
}
/** What a wallet is asked to sign: `text` for `solana:signOffchainMessage`, `message` for `solana:signMessage`. */
export interface SolanaSigningRequest<T> {
  readonly statement: T; readonly text: string; readonly requiredSigners: readonly string[];
  readonly message: Uint8Array;
}
/** Every field comes from the locally authenticated session. `own` always means the signer of the proof. */
export interface SolanaPeerContext {
  readonly role: SolanaRole; readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  readonly nowSeconds: string; readonly envelopeExpiresAtSeconds: string;
}
/** The untrusted part: one statement and two 64-byte Ed25519 signatures by the statement's wallet. */
export interface SolanaPeerProof {
  readonly statement: SolanaPeerAcceptanceV1; readonly termsSignature: Uint8Array;
  readonly acceptanceSignature: Uint8Array;
}
export interface SolanaPeerVerification {
  readonly candidateOnly: true; readonly economicPreparationAllowed: false;
  readonly statement: SolanaPeerAcceptanceV1; readonly termsMessageSha256: string;
  readonly acceptanceMessageSha256: string; readonly effectiveNotAfterSeconds: string;
}

const TERMS_FIELDS = ['v', 'networkId', 'deploymentId', 'genesisHash', 'programId', 'seller', 'buyer', 'termsHash'];
const ACCEPTANCE_FIELDS = ['v', 'role', 'wallet', 'ownMessagingKey', 'counterpartyMessagingKey', 'networkId',
  'deploymentId', 'genesisHash', 'programId', 'termsHash', 'notAfterSeconds'];
const CONTEXT_FIELDS = ['role', 'ownMessagingKey', 'counterpartyMessagingKey', 'nowSeconds',
  'envelopeExpiresAtSeconds'];
const PROOF_FIELDS = ['statement', 'termsSignature', 'acceptanceSignature'];
type Layout<T> = readonly (readonly [string, keyof T])[];
/** Line labels in signed order; the statement field each line carries. */
const TERMS_LINES: Layout<SolanaTermsConsentV1> = [['network', 'networkId'],
  ['deployment', 'deploymentId'], ['genesis', 'genesisHash'], ['program', 'programId'], ['seller', 'seller'],
  ['buyer', 'buyer'], ['terms-sha256', 'termsHash']];
const ACCEPTANCE_LINES: Layout<SolanaPeerAcceptanceV1> = [['role', 'role'],
  ['wallet', 'wallet'], ['own-messaging-key', 'ownMessagingKey'],
  ['counterparty-messaging-key', 'counterpartyMessagingKey'], ['network', 'networkId'],
  ['deployment', 'deploymentId'], ['genesis', 'genesisHash'], ['program', 'programId'],
  ['terms-sha256', 'termsHash'], ['not-after', 'notAfterSeconds']];
/** Registry id grammar (schemas/registry.ts): bounded, so a statement stays far below the message limit. */
const REGISTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ascii = new TextEncoder();

/** Exact own enumerable data fields; accessors are never invoked. */
export function exactData(input: unknown, fields: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('INVALID_INPUT');
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail('INVALID_INPUT');
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) {
      return fail('INVALID_INPUT');
    }
    const copy = Object.create(null) as Record<string, unknown>;
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return fail('INVALID_INPUT');
      copy[field] = descriptor.value;
    }
    return copy;
  } catch { return fail('INVALID_INPUT'); }
}
function registryId(value: unknown): string {
  if (typeof value !== 'string' || !REGISTRY_ID.test(value) || value.includes('..')) return fail('INVALID_INPUT');
  return value;
}
const solanaKey = (value: unknown): string => { decodeKey(value, 'INVALID_INPUT'); return value as string; };
const digest = (value: unknown): string => { fromHex32(value); return value as string; };
function role(value: unknown): SolanaRole {
  if (value !== 'seller' && value !== 'buyer') return fail('INVALID_INPUT');
  return value;
}
/** BIP-340 x-only key: 64 lowercase hex that lifts to a secp256k1 point (NIP-01 pubkey form). */
export function messagingKey(value: unknown): string {
  const x = fromHex32(value), compressed = new Uint8Array(33);
  compressed[0] = 2; compressed.set(x, 1);
  try { secp256k1.Point.fromBytes(compressed).assertValidity(); } catch { return fail('INVALID_INPUT'); }
  return value as string;
}
function seconds(value: unknown, allowZero: boolean): bigint {
  const parsed = decimalU64(value);
  if (!allowZero && parsed === 0n) return fail('INVALID_INPUT');
  return parsed;
}

function termsConsent(input: unknown): SolanaTermsConsentV1 {
  const raw = exactData(input, TERMS_FIELDS);
  if (raw.v !== 1) return fail('UNSUPPORTED_VERSION');
  const seller = solanaKey(raw.seller), buyer = solanaKey(raw.buyer);
  if (seller === buyer) return fail('INVALID_INPUT');
  return Object.freeze({ v: 1, networkId: registryId(raw.networkId), deploymentId: registryId(raw.deploymentId),
    genesisHash: solanaKey(raw.genesisHash), programId: solanaKey(raw.programId), seller, buyer,
    termsHash: digest(raw.termsHash) });
}
/** Validates an untrusted statement object into a frozen copy. */
export function snapshotPeerAcceptance(input: unknown): SolanaPeerAcceptanceV1 {
  const raw = exactData(input, ACCEPTANCE_FIELDS);
  if (raw.v !== 1) return fail('UNSUPPORTED_VERSION');
  const own = messagingKey(raw.ownMessagingKey), counterparty = messagingKey(raw.counterpartyMessagingKey);
  if (own === counterparty) return fail('INVALID_INPUT');
  seconds(raw.notAfterSeconds, false);
  return Object.freeze({ v: 1, role: role(raw.role), wallet: solanaKey(raw.wallet), ownMessagingKey: own,
    counterpartyMessagingKey: counterparty, networkId: registryId(raw.networkId),
    deploymentId: registryId(raw.deploymentId), genesisHash: solanaKey(raw.genesisHash),
    programId: solanaKey(raw.programId), termsHash: digest(raw.termsHash),
    notAfterSeconds: raw.notAfterSeconds as string });
}

function bodyText<T>(domain: string, sentence: string, lines: Layout<T>, value: T): string {
  return [domain, sentence, ...lines.map(([label, field]) => `${label}: ${String(value[field])}`)].join('\n');
}
const termsText = (statement: SolanaTermsConsentV1): string =>
  bodyText(SOLANA_TERMS_CONSENT_DOMAIN, TERMS_CONSENT_SENTENCE, TERMS_LINES, statement);
const acceptanceText = (statement: SolanaPeerAcceptanceV1): string =>
  bodyText(SOLANA_PEER_ACCEPTANCE_DOMAIN, PEER_ACCEPTANCE_SENTENCE, ACCEPTANCE_LINES, statement);
const termsMessage = (statement: SolanaTermsConsentV1): Uint8Array =>
  encodeOffchainMessageV1([decodeKey(statement.seller), decodeKey(statement.buyer)],
    ascii.encode(termsText(statement)));
const acceptanceMessage = (statement: SolanaPeerAcceptanceV1): Uint8Array =>
  encodeOffchainMessageV1([decodeKey(statement.wallet)], ascii.encode(acceptanceText(statement)));

/** Terms consent rebuilt from the locally bound trade (registry ids and native identities), never a message. */
function termsConsentOf(trade: BoundSolanaTrade): SolanaTermsConsentV1 {
  if (!isBoundSolanaTrade(trade)) return fail('INVALID_INPUT');
  return termsConsent({ v: 1, networkId: trade.binding.networkId, deploymentId: trade.binding.deploymentId,
    genesisHash: trade.network.genesisHash, programId: trade.deployment.address, seller: trade.terms.seller,
    buyer: trade.terms.buyer, termsHash: trade.termsHash });
}
function request<T>(
  statement: T, text: string, signers: readonly string[], message: Uint8Array,
): SolanaSigningRequest<T> {
  return Object.freeze({ statement, text, requiredSigners: Object.freeze([...signers]), message });
}
function result<T>(work: () => T): CoreResult<T> {
  try { return { ok: true, value: work() }; } catch (error) {
    const code: CoreErrorCode = failureCode(error, 'INVALID_INPUT');
    return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) };
  }
}

/** Signing request for the terms consent; both parties sign these identical bytes. */
export function solanaTermsConsentRequest(
  trade: BoundSolanaTrade,
): CoreResult<SolanaSigningRequest<SolanaTermsConsentV1>> {
  return result(() => {
    const statement = termsConsentOf(trade);
    return request(statement, termsText(statement), [statement.seller, statement.buyer], termsMessage(statement));
  });
}
export interface SolanaAcceptanceDraft {
  readonly role: SolanaRole; readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  readonly notAfterSeconds: string;
}
/** Signing request for one party's peer acceptance; the wallet is the role's account in the bound terms. */
export function solanaPeerAcceptanceRequest(
  trade: BoundSolanaTrade, draft: SolanaAcceptanceDraft,
): CoreResult<SolanaSigningRequest<SolanaPeerAcceptanceV1>> {
  return result(() => {
    const consent = termsConsentOf(trade);
    const raw = exactData(draft, ['role', 'ownMessagingKey', 'counterpartyMessagingKey', 'notAfterSeconds']);
    const signer = role(raw.role);
    const statement = snapshotPeerAcceptance({ v: 1, role: signer, wallet: consent[signer],
      ownMessagingKey: raw.ownMessagingKey, counterpartyMessagingKey: raw.counterpartyMessagingKey,
      networkId: consent.networkId, deploymentId: consent.deploymentId, genesisHash: consent.genesisHash,
      programId: consent.programId, termsHash: consent.termsHash, notAfterSeconds: raw.notAfterSeconds });
    return request(statement, acceptanceText(statement), [statement.wallet], acceptanceMessage(statement));
  });
}

/** Splits a profile body into exactly `count` LF-separated lines; the first two are fixed text. */
function lines(body: Uint8Array, domain: string, sentence: string, count: number): string[] {
  const text = String.fromCharCode(...body), parts = text.split('\n');
  const version = /^(.+\/v)(0|[1-9][0-9]{0,2})$/.exec(parts[0] ?? '');
  if (parts[0] !== domain) return fail(version?.[1] === domain.slice(0, -1) ? 'UNSUPPORTED_VERSION' : 'INVALID_INPUT');
  if (parts.length !== count + 2 || parts[1] !== sentence) return fail('INVALID_INPUT');
  return parts.slice(2);
}
function fields<T>(values: readonly string[], layout: Layout<T>): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  layout.forEach(([label, field], index) => {
    const line = values[index]!;
    if (!line.startsWith(`${label}: `)) fail('INVALID_INPUT');
    out[field as string] = line.slice(label.length + 2);
  });
  return out;
}
/** Strict decode of signed bytes; the re-encoding must reproduce them exactly. */
function decodeTermsConsent(bytes: unknown): SolanaTermsConsentV1 {
  const message = decodeOffchainMessageV1(bytes);
  if (message.signers.length !== 2) return fail('INVALID_INPUT');
  const raw = fields(lines(message.body, SOLANA_TERMS_CONSENT_DOMAIN, TERMS_CONSENT_SENTENCE, TERMS_LINES.length),
    TERMS_LINES);
  const statement = termsConsent({ v: 1, ...raw });
  if (!equalBytes(termsMessage(statement), bytesOf(bytes, 0, Number.MAX_SAFE_INTEGER))) fail('INVALID_INPUT');
  return statement;
}
function decodePeerAcceptance(bytes: unknown): SolanaPeerAcceptanceV1 {
  const message = decodeOffchainMessageV1(bytes);
  if (message.signers.length !== 1) return fail('INVALID_INPUT');
  const raw = fields(lines(message.body, SOLANA_PEER_ACCEPTANCE_DOMAIN, PEER_ACCEPTANCE_SENTENCE,
    ACCEPTANCE_LINES.length), ACCEPTANCE_LINES);
  const statement = snapshotPeerAcceptance({ v: 1, ...raw });
  if (statement.wallet !== encodeBase58(message.signers[0]!)) fail('INVALID_INPUT');
  if (!equalBytes(acceptanceMessage(statement), bytesOf(bytes, 0, Number.MAX_SAFE_INTEGER))) fail('INVALID_INPUT');
  return statement;
}
export const decodeSolanaTermsConsent = (bytes: unknown): CoreResult<SolanaTermsConsentV1> =>
  result(() => decodeTermsConsent(bytes));
export const decodeSolanaPeerAcceptance = (bytes: unknown): CoreResult<SolanaPeerAcceptanceV1> =>
  result(() => decodePeerAcceptance(bytes));

/**
 * Throwing core shared with the replay ledger. Order: malformed INVALID_INPUT; foreign registry ids, genesis or
 * program WRONG_CHAIN; other terms, role, wallet or messaging keys UNAUTHORIZED; `now >= min(notAfter,
 * acceptBefore, envelope expiry)` EXPIRED; then both strict Ed25519 signatures by the role's wallet, else
 * UNAUTHORIZED. No cryptography runs on a statement that does not match the local trade and session.
 */
export function checkSolanaPeerAcceptance(
  trade: BoundSolanaTrade, contextInput: SolanaPeerContext, proofInput: SolanaPeerProof,
): SolanaPeerVerification {
  const owned: Uint8Array[] = [];
  try {
    const consent = termsConsentOf(trade);
    const context = exactData(contextInput, CONTEXT_FIELDS), proof = exactData(proofInput, PROOF_FIELDS);
    const expectedRole = role(context.role);
    const own = messagingKey(context.ownMessagingKey), counterparty = messagingKey(context.counterpartyMessagingKey);
    if (own === counterparty) return fail('INVALID_INPUT');
    const now = seconds(context.nowSeconds, true), envelopeExpiry = seconds(context.envelopeExpiresAtSeconds, false);
    const statement = snapshotPeerAcceptance(proof.statement);
    let termsSignature: Uint8Array, acceptanceSignature: Uint8Array;
    try {
      termsSignature = bytesOf(proof.termsSignature, 64, 64); owned.push(termsSignature);
      acceptanceSignature = bytesOf(proof.acceptanceSignature, 64, 64); owned.push(acceptanceSignature);
    } catch { return fail('INVALID_INPUT'); }
    if (statement.networkId !== consent.networkId || statement.deploymentId !== consent.deploymentId ||
        statement.genesisHash !== consent.genesisHash || statement.programId !== consent.programId) {
      return fail('WRONG_CHAIN');
    }
    if (statement.termsHash !== consent.termsHash || statement.role !== expectedRole ||
        statement.wallet !== consent[expectedRole] || statement.ownMessagingKey !== own ||
        statement.counterpartyMessagingKey !== counterparty) return fail('UNAUTHORIZED');
    const deadline = [BigInt(statement.notAfterSeconds), seconds(trade.terms.acceptBeforeSeconds, true), envelopeExpiry]
      .reduce((earliest, value) => value < earliest ? value : earliest);
    if (now >= deadline) return fail('EXPIRED');
    const wallet = decodeKey(statement.wallet);
    const terms = termsMessage(consent), acceptance = acceptanceMessage(statement);
    if (!verifyEd25519StrictAll(wallet, [[termsSignature, terms], [acceptanceSignature, acceptance]])) {
      return fail('UNAUTHORIZED');
    }
    return Object.freeze({ candidateOnly: true, economicPreparationAllowed: false, statement,
      termsMessageSha256: hex(sha256(terms)), acceptanceMessageSha256: hex(sha256(acceptance)),
      effectiveNotAfterSeconds: deadline.toString() });
  } finally { for (const bytes of owned) bytes.fill(0); }
}
/** Valid result is candidate-only: it authenticates wallet consent and grants no funding authority. */
export function verifySolanaPeerAcceptance(
  trade: BoundSolanaTrade, context: SolanaPeerContext, proof: SolanaPeerProof,
): CoreResult<SolanaPeerVerification> {
  return result(() => checkSolanaPeerAcceptance(trade, context, proof));
}
