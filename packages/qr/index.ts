/**
 * Public boundary: D6 QR interchange codec (envelope v1, RFC 8785 canonical JSON, RFC 9285 base45 text).
 * Dependency-free and capability-free: SHA-256, randomness, the clock and any invite verifier are injected.
 * Decoding yields a review only; it never navigates, signs, stores or touches the network. Includes an ISO/IEC 18004
 * symbol encoder and static SVG renderer; no camera, image decoder or scanner here.
 */
export { BASE45_ALPHABET, decodeBase45, encodeBase45, maxBase45Length } from './src/base45.ts';
export type { Base45DecodeResult, Base45ErrorCode } from './src/base45.ts';
export { canonicalize, canonicalBytes, compareUtf16, parseStrictJson, parseCanonicalJsonBytes, JcsError } from './src/jcs.ts';
export type { JsonValue, JcsErrorCode, CanonicalParseOptions } from './src/jcs.ts';
export { encodeUtf8, decodeUtf8, isWellFormedString, Utf8Error } from './src/utf8.ts';
export {
  QR_PROTOCOL, QR_ENVELOPE_VERSION, QR_TYPES, SIGNABLE_QR_TYPE, MAX_ENVELOPE_BYTES, GENERATION_TARGET_BYTES, MAX_ENVELOPE_DEPTH,
  DEFAULT_INVITE_LIFETIME_SECONDS, MIN_INVITE_LIFETIME_SECONDS, MAX_INVITE_LIFETIME_SECONDS, EXPIRY_SAFETY_MARGIN_SECONDS,
  MAX_FUTURE_SKEW_SECONDS, MAX_TIMESTAMP_SECONDS, INVITE_SIGNING_DOMAIN, RECOVERY_FINGERPRINT_FORMATS,
  createQrEnvelope, parseQrEnvelope, attachInviteSignature, inviteSigningDigest, inviteSigningMessage, envelopeBytes,
  payloadDigestHex, parseAdReference, isQrChain, chainFamily, isOriginHint, isSecretKeyName, isSecretLike, isSecretLikeText, isSecretLikeHostname, isUrlLike,
} from './src/envelope.ts';
export type {
  QrType, QrErrorCode, QrFailure, QrEnvelope, QrEnvelopeOf, QrPayloads, PublicAddressPayload, PaymentRequestPayload,
  TradeInvitePayload, ReleaseFingerprintPayload, RecoveryFingerprintPayload, RecoveryFingerprintFormat, InviteSignature,
  Sha256, ChainFamily, CreateQrEnvelopeInput, CreateQrEnvelopeDeps, QrEnvelopeResult,
} from './src/envelope.ts';
export { QR_TEXT_PREFIX, QR_TEXT_PREFIX_FAMILY, MAX_QR_TEXT_LENGTH, decodeQrText, encodeQrText, qrTextToBytes } from './src/text-codec.ts';
export type { InviteVerifier, InviteBinding, InviteVerdict, QrDecodeContext, QrDecodeResult, QrBytesResult, QrEncodeResult } from './src/text-codec.ts';
export {
  createReplayLedger, isQrImportReview, groupForDisplay, groupDigits,
  DEFAULT_REPLAY_LEDGER_ENTRIES, MAX_REPLAY_LEDGER_ENTRIES, DEFAULT_REPLAY_RETENTION_SECONDS, MAX_REPLAY_RETENTION_SECONDS,
} from './src/review.ts';
export type { QrImportReview, QrImportReviewOf, QrWarning, QrDisplayField, ReplayLedger, ReplayLedgerOptions, ReplayAdmitResult } from './src/review.ts';
export {
  encodeQrMatrix, renderQrSvg, qrCapacity, qrDataCodewords, dataCodewords, rawDataModules, alignmentPositions, formatInformation, versionInformation,
  reedSolomonGenerator, reedSolomonRemainder, penaltyScore, QR_EC_LEVELS, DEFAULT_QR_EC_LEVEL, MIN_QR_VERSION, MAX_QR_VERSION, MIN_QUIET_ZONE_MODULES,
} from './src/qr-matrix.ts';
export type { QrEcLevel, QrSegmentMode, QrMatrix, QrMatrixResult, QrMatrixErrorCode, QrMatrixOptions, QrSvgOptions } from './src/qr-matrix.ts';
