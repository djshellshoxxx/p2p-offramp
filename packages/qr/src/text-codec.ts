/**
 * QR text form (D6 Option B): `P2POFFRAMP:1:` followed by RFC 9285 base45 of the RFC 8785 canonical envelope bytes.
 * The prefix and the base45 alphabet are both inside the QR alphanumeric set, so an encoder can keep the whole code in
 * alphanumeric mode. The text must travel as plain text, never inside a URL, and must not be trimmed: space is a base45
 * digit.
 *
 * Decoding order (each step fails closed with no side effect): text length cap, prefix (an unknown version is refused
 * before decoding), strict base45, the 2,048-byte decoded cap (before any UTF-8 or JSON work), strict UTF-8, strict
 * JSON (depth 8, duplicate keys refused), canonical-bytes equality, secret/URL refusal, envelope schema, chain
 * allowlist, payload hash, clock, then signature (trade invite only, through an injected verifier).
 */
import { decodeBase45, encodeBase45, maxBase45Length } from './base45.ts';
import {
  EXPIRY_SAFETY_MARGIN_SECONDS, GENERATION_TARGET_BYTES, MAX_ENVELOPE_BYTES, MAX_ENVELOPE_DEPTH, MAX_FUTURE_SKEW_SECONDS,
  SIGNABLE_QR_TYPE, assertPayloadHash, envelopeBytes, failure, inviteSigningMessage, isQrChain, isSecretLike, isUrlLike,
  refuse, sha256Bytes, toFailure, validateEnvelopeTree, normalizeTree,
  type InviteSignature, type QrEnvelope, type QrFailure, type Sha256, type TradeInvitePayload,
} from './envelope.ts';
import { JcsError, parseCanonicalJsonBytes } from './jcs.ts';
import { buildReview, type QrImportReview, type QrWarning } from './review.ts';

export const QR_TEXT_PREFIX = 'P2POFFRAMP:1:';
/** Any version of this protocol's text form; a non-matching version is VERSION_UNSUPPORTED, not FORMAT_UNSUPPORTED. */
export const QR_TEXT_PREFIX_FAMILY = 'P2POFFRAMP:';
export const MAX_QR_TEXT_LENGTH = QR_TEXT_PREFIX.length + maxBase45Length(MAX_ENVELOPE_BYTES);

/**
 * Injected trade-invite verifier. The invite signing-key profile is an open owner decision: this package ships none
 * and must not be given a wallet key or a release-signing key. Without a verifier every invite is unauthenticated.
 */
export interface InviteVerifier {
  /** The single signature profile this verifier understands; a signature under any other profile stays unverified. */
  readonly profile: string;
  /**
   * Must return exactly `true` only if `signature` is valid for `digest` under a key the verifier has bound to the
   * advertisement. Any other result refuses the code (SIGNATURE_INVALID); a throw refuses it (UNAVAILABLE).
   */
  verify(input: {
    readonly digest: Uint8Array; readonly signature: InviteSignature; readonly invite: TradeInvitePayload; readonly chain: string;
  }): Promise<boolean>;
}

export interface QrDecodeContext {
  readonly sha256: Sha256;
  readonly nowSeconds: () => number;
  /** Chains this device's registry knows. Any other chain fails closed (CHAIN_UNSUPPORTED). */
  readonly chains: readonly string[];
  /** When set, a chain-bound code on another chain is refused (CHAIN_MISMATCH). */
  readonly expectedChain?: string;
  readonly inviteVerifier?: InviteVerifier;
}
export type QrDecodeResult = { readonly ok: true; readonly review: QrImportReview } | QrFailure;
export type QrBytesResult = { readonly ok: true; readonly bytes: Uint8Array } | QrFailure;
export type QrEncodeResult = {
  readonly ok: true; readonly text: string; readonly envelopeBytes: number;
  readonly generationTargetBytes: number; readonly withinGenerationTarget: boolean;
} | QrFailure;

/**
 * Text to canonical-envelope bytes, with every pre-parse refusal. The decoded cap is enforced here, before any UTF-8
 * or JSON processing.
 */
export function qrTextToBytes(text: unknown): QrBytesResult {
  if (typeof text !== 'string') return failure('INVALID_INPUT');
  if (text.length > MAX_QR_TEXT_LENGTH) return failure('QR_TOO_LARGE');
  if (!text.startsWith(QR_TEXT_PREFIX)) {
    if (text.startsWith(QR_TEXT_PREFIX_FAMILY)) return failure('VERSION_UNSUPPORTED');
    if (/^wc:/i.test(text)) return failure('WALLET_SESSION_REFUSED');
    if (isSecretLike(text)) return failure('SECRET_REFUSED');
    if (isUrlLike(text)) return failure('URL_REFUSED');
    return failure('FORMAT_UNSUPPORTED');
  }
  const decoded = decodeBase45(text.slice(QR_TEXT_PREFIX.length), MAX_ENVELOPE_BYTES);
  if (!decoded.ok) return failure(decoded.code === 'TOO_LARGE' ? 'QR_TOO_LARGE' : 'INVALID_ENCODING');
  if (decoded.bytes.length > MAX_ENVELOPE_BYTES) return failure('QR_TOO_LARGE');
  return Object.freeze({ ok: true, bytes: decoded.bytes });
}

interface Context {
  readonly sha256: Sha256; readonly now: number; readonly chains: ReadonlySet<string>;
  readonly expectedChain: string | null; readonly verifier: InviteVerifier | null;
}
function readContext(context: QrDecodeContext): Context {
  if (typeof context !== 'object' || context === null) return refuse('INVALID_INPUT');
  const { sha256, nowSeconds, chains, expectedChain, inviteVerifier } = context;
  if (typeof sha256 !== 'function' || typeof nowSeconds !== 'function' || !Array.isArray(chains)) return refuse('INVALID_INPUT');
  if (!chains.every(isQrChain)) return refuse('INVALID_INPUT');
  const allowed = new Set<string>(chains);
  if (expectedChain !== undefined && (!isQrChain(expectedChain) || !allowed.has(expectedChain))) return refuse('INVALID_INPUT');
  if (inviteVerifier !== undefined && (typeof inviteVerifier !== 'object' || inviteVerifier === null
    || typeof inviteVerifier.profile !== 'string' || typeof inviteVerifier.verify !== 'function')) return refuse('INVALID_INPUT');
  let now: number;
  try { now = nowSeconds(); } catch { return refuse('UNAVAILABLE'); }
  if (!Number.isSafeInteger(now) || now < 0) return refuse('UNAVAILABLE');
  return { sha256, now, chains: allowed, expectedChain: expectedChain ?? null, verifier: inviteVerifier ?? null };
}

function checkClock(envelope: QrEnvelope, now: number): void {
  if (envelope.createdAt > now + MAX_FUTURE_SKEW_SECONDS) refuse('NOT_YET_VALID');
  if (envelope.expiresAt !== null && now + EXPIRY_SAFETY_MARGIN_SECONDS >= envelope.expiresAt) refuse('EXPIRED');
}

async function signatureState(envelope: QrEnvelope, context: Context): Promise<{ state: 'absent' | 'unverified' | 'verified'; warnings: QrWarning[] }> {
  if (envelope.type !== SIGNABLE_QR_TYPE || envelope.signature === undefined) return { state: 'absent', warnings: [] };
  const signature = envelope.signature;
  if (context.verifier === null) return { state: 'unverified', warnings: ['no-invite-verifier'] };
  if (context.verifier.profile !== signature.profile) return { state: 'unverified', warnings: ['signature-profile-unknown'] };
  const digest = await sha256Bytes(context.sha256, inviteSigningMessage(envelope));
  let verdict: unknown;
  try {
    verdict = await context.verifier.verify(Object.freeze({ digest, signature, invite: envelope.payload, chain: envelope.chain as string }));
  } catch { return refuse('UNAVAILABLE'); }
  if (verdict !== true) return refuse('SIGNATURE_INVALID');
  return { state: 'verified', warnings: [] };
}

/** Decodes canonical envelope bytes (already size-capped) into a review. */
async function reviewBytes(bytes: Uint8Array, context: Context): Promise<QrImportReview> {
  let tree;
  try { tree = parseCanonicalJsonBytes(bytes, { maxBytes: MAX_ENVELOPE_BYTES, maxDepth: MAX_ENVELOPE_DEPTH }); }
  catch (error) { if (error instanceof JcsError) throw error; return refuse('INVALID_JSON'); }
  const envelope = validateEnvelopeTree(tree);
  if (envelope.chain !== null) {
    if (!context.chains.has(envelope.chain)) refuse('CHAIN_UNSUPPORTED');
    if (context.expectedChain !== null && envelope.chain !== context.expectedChain) refuse('CHAIN_MISMATCH');
  }
  await assertPayloadHash(context.sha256, envelope);
  checkClock(envelope, context.now);
  const signature = await signatureState(envelope, context);
  return buildReview({ envelope, envelopeBytes: bytes.length, nowSeconds: context.now, signature: signature.state, signatureWarnings: signature.warnings });
}

/**
 * Decodes scanned, pasted or typed QR text into a frozen import review. Never navigates, signs, stores or makes a
 * network request; an `ok` result authorizes nothing.
 */
export async function decodeQrText(text: unknown, context: QrDecodeContext): Promise<QrDecodeResult> {
  try {
    const read = readContext(context);
    const bytes = qrTextToBytes(text);
    if (!bytes.ok) return bytes;
    return Object.freeze({ ok: true, review: await reviewBytes(bytes.bytes, read) });
  } catch (error) { return toFailure(error); }
}

/**
 * Re-validates an envelope (schema and payload hash) and produces its QR text. Refuses QR_TOO_LARGE above 2,048
 * canonical bytes and reports whether the 1,024-byte generation target is met.
 */
export async function encodeQrText(envelope: unknown, deps: { readonly sha256: Sha256 }): Promise<QrEncodeResult> {
  try {
    if (typeof deps !== 'object' || deps === null) return failure('INVALID_INPUT');
    const parsed = validateEnvelopeTree(normalizeTree(envelope));
    await assertPayloadHash(deps.sha256, parsed);
    const bytes = envelopeBytes(parsed);
    if (bytes.length > MAX_ENVELOPE_BYTES) return failure('QR_TOO_LARGE');
    return Object.freeze({
      ok: true, text: QR_TEXT_PREFIX + encodeBase45(bytes), envelopeBytes: bytes.length,
      generationTargetBytes: GENERATION_TARGET_BYTES, withinGenerationTarget: bytes.length <= GENERATION_TARGET_BYTES,
    });
  } catch (error) { return toFailure(error); }
}
