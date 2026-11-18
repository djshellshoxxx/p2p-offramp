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
  parseAdReference, refuse, sha256Bytes, toFailure, validateEnvelopeTree, normalizeTree,
  type InviteSignature, type QrEnvelope, type QrFailure, type Sha256,
} from './envelope.ts';
import { JcsError, parseCanonicalJsonBytes } from './jcs.ts';
import { buildReview, type QrImportReview, type QrWarning } from './review.ts';

export const QR_TEXT_PREFIX = 'P2POFFRAMP:1:';
/** Any version of this protocol's text form; a non-matching version is VERSION_UNSUPPORTED, not FORMAT_UNSUPPORTED. */
export const QR_TEXT_PREFIX_FAMILY = 'P2POFFRAMP:';
export const MAX_QR_TEXT_LENGTH = QR_TEXT_PREFIX.length + maxBase45Length(MAX_ENVELOPE_BYTES);

/** Everything a verifier needs to bind the signing key to the advertisement. `author` is parsed from `ad`. */
export interface InviteBinding {
  readonly ad: string; readonly author: string; readonly orderId: string; readonly termsHash: string;
  readonly chain: string; readonly requestId: string; readonly createdAt: number; readonly expiresAt: number;
  readonly originHint: string | null;
}
/** A verifier must attest which advertisement author the key is bound to; `{ ok: true }` alone is not enough. */
export type InviteVerdict = { readonly ok: true; readonly boundTo: string } | { readonly ok: false };

/**
 * Injected trade-invite verifier. The invite signing-key profile is an open owner decision: this package ships none
 * and must not be given a wallet key or a release-signing key. Without a verifier every invite is unauthenticated.
 */
export interface InviteVerifier {
  /** The single signature profile this verifier understands. */
  readonly profile: string;
  /** Exact public-key and signature sizes of this profile; any other size is refused before `verify` runs. */
  readonly publicKeyBytes: number;
  readonly signatureBytes: number;
  /**
   * MUST check that `signature` is valid for `digest` AND that `signature.publicKey` is bound to `binding.author`
   * under the (still open) key profile, and then return `{ ok: true, boundTo: binding.author }`. Anything else,
   * including a bare `true` or a `boundTo` naming another author, refuses the code (SIGNATURE_INVALID); a throw refuses
   * it (UNAVAILABLE).
   */
  verify(input: { readonly digest: Uint8Array; readonly signature: InviteSignature; readonly binding: InviteBinding }): Promise<InviteVerdict>;
}

export interface QrDecodeContext {
  readonly sha256: Sha256;
  readonly nowSeconds: () => number;
  /** Chains this device's registry knows. Any other chain fails closed (CHAIN_UNSUPPORTED). */
  readonly chains: readonly string[];
  /** When set, a chain-bound code on another chain is refused (CHAIN_MISMATCH). */
  readonly expectedChain?: string;
  readonly inviteVerifier?: InviteVerifier;
  /**
   * Defaults to true whenever `inviteVerifier` is supplied: an unsigned invite is then refused (SIGNATURE_REQUIRED) and
   * a signature under another profile is refused (PROFILE_UNSUPPORTED), so stripping or relabelling a signature cannot
   * downgrade a code to "unauthenticated". `false` restores the review-only behaviour. Requiring a signature without a
   * verifier is a configuration error (INVALID_INPUT); with neither, invites decode as unauthenticated.
   */
  readonly requireInviteSignature?: boolean;
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
  readonly expectedChain: string | null; readonly verifier: InviteVerifier | null; readonly requireSignature: boolean;
}
const isByteCount = (value: unknown, max: number): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max;
function readContext(context: QrDecodeContext): Context {
  if (typeof context !== 'object' || context === null) return refuse('INVALID_INPUT');
  const { sha256, nowSeconds, chains, expectedChain, inviteVerifier, requireInviteSignature } = context;
  if (typeof sha256 !== 'function' || typeof nowSeconds !== 'function' || !Array.isArray(chains)) return refuse('INVALID_INPUT');
  if (!chains.every(isQrChain)) return refuse('INVALID_INPUT');
  const allowed = new Set<string>(chains);
  if (expectedChain !== undefined && (!isQrChain(expectedChain) || !allowed.has(expectedChain))) return refuse('INVALID_INPUT');
  if (inviteVerifier !== undefined && (typeof inviteVerifier !== 'object' || inviteVerifier === null
    || typeof inviteVerifier.profile !== 'string' || typeof inviteVerifier.verify !== 'function'
    || !isByteCount(inviteVerifier.publicKeyBytes, 128) || !isByteCount(inviteVerifier.signatureBytes, 1024))) return refuse('INVALID_INPUT');
  if (requireInviteSignature !== undefined && typeof requireInviteSignature !== 'boolean') return refuse('INVALID_INPUT');
  if (requireInviteSignature === true && inviteVerifier === undefined) return refuse('INVALID_INPUT');
  let now: number;
  try { now = nowSeconds(); } catch { return refuse('UNAVAILABLE'); }
  if (!Number.isSafeInteger(now) || now < 0) return refuse('UNAVAILABLE');
  return {
    sha256, now, chains: allowed, expectedChain: expectedChain ?? null, verifier: inviteVerifier ?? null,
    requireSignature: inviteVerifier !== undefined && requireInviteSignature !== false,
  };
}

function checkClock(envelope: QrEnvelope, now: number): void {
  if (envelope.createdAt > now + MAX_FUTURE_SKEW_SECONDS) refuse('NOT_YET_VALID');
  if (envelope.expiresAt !== null && now + EXPIRY_SAFETY_MARGIN_SECONDS >= envelope.expiresAt) refuse('EXPIRED');
}

async function signatureState(envelope: QrEnvelope, context: Context): Promise<{ state: 'absent' | 'unverified' | 'verified'; warnings: QrWarning[] }> {
  if (envelope.type !== SIGNABLE_QR_TYPE) return { state: 'absent', warnings: [] };
  const signature = envelope.signature, verifier = context.verifier;
  if (signature === undefined) {
    if (context.requireSignature) return refuse('SIGNATURE_REQUIRED');
    return { state: 'absent', warnings: [] };
  }
  if (verifier === null) return { state: 'unverified', warnings: ['no-invite-verifier'] };
  if (verifier.profile !== signature.profile) {
    if (context.requireSignature) return refuse('PROFILE_UNSUPPORTED');
    return { state: 'unverified', warnings: ['signature-profile-unknown'] };
  }
  if (signature.publicKey.length !== verifier.publicKeyBytes * 2 || signature.value.length !== verifier.signatureBytes * 2) return refuse('SIGNATURE_INVALID');
  const ad = parseAdReference(envelope.payload.ad);
  if (ad === null) return refuse('INVALID_PAYLOAD');
  const binding: InviteBinding = Object.freeze({
    ad: envelope.payload.ad, author: ad.author, orderId: ad.orderId, termsHash: envelope.payload.termsHash, chain: envelope.chain as string,
    requestId: envelope.requestId, createdAt: envelope.createdAt, expiresAt: envelope.expiresAt as number, originHint: envelope.originHint,
  });
  const digest = await sha256Bytes(context.sha256, inviteSigningMessage(envelope));
  let attested: boolean;
  try {
    const verdict: unknown = await verifier.verify(Object.freeze({ digest, signature, binding }));
    attested = typeof verdict === 'object' && verdict !== null && (verdict as { ok?: unknown }).ok === true
      && (verdict as { boundTo?: unknown }).boundTo === ad.author;
  } catch { return refuse('UNAVAILABLE'); }
  if (!attested) return refuse('SIGNATURE_INVALID');
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
 * Re-validates an envelope (schema, payload hash and clock) and produces its QR text. Refuses an envelope that is
 * already expired or inside the expiry safety margin (EXPIRED) or dated in the future (NOT_YET_VALID), refuses
 * QR_TOO_LARGE above 2,048 canonical bytes, and reports whether the 1,024-byte generation target is met.
 */
export async function encodeQrText(envelope: unknown, deps: { readonly sha256: Sha256; readonly nowSeconds: () => number }): Promise<QrEncodeResult> {
  try {
    if (typeof deps !== 'object' || deps === null || typeof deps.nowSeconds !== 'function') return failure('INVALID_INPUT');
    const parsed = validateEnvelopeTree(normalizeTree(envelope));
    await assertPayloadHash(deps.sha256, parsed);
    let now: number;
    try { now = deps.nowSeconds(); } catch { return failure('UNAVAILABLE'); }
    if (!Number.isSafeInteger(now) || now < 0) return failure('UNAVAILABLE');
    checkClock(parsed, now);
    const bytes = envelopeBytes(parsed);
    if (bytes.length > MAX_ENVELOPE_BYTES) return failure('QR_TOO_LARGE');
    return Object.freeze({
      ok: true, text: QR_TEXT_PREFIX + encodeBase45(bytes), envelopeBytes: bytes.length,
      generationTargetBytes: GENERATION_TARGET_BYTES, withinGenerationTarget: bytes.length <= GENERATION_TARGET_BYTES,
    });
  } catch (error) { return toFailure(error); }
}
