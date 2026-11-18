/**
 * Public boundary: D6 QR interchange codec (envelope v1, RFC 8785 canonical JSON, RFC 9285 base45 text).
 * Dependency-free and capability-free: SHA-256, randomness, the clock and any invite verifier are injected.
 * Decoding yields a review only; it never navigates, signs, stores or touches the network. No camera or scanner here.
 */
export { BASE45_ALPHABET, decodeBase45, encodeBase45, maxBase45Length } from './src/base45.ts';
export type { Base45DecodeResult, Base45ErrorCode } from './src/base45.ts';
export { canonicalize, canonicalBytes, compareUtf16, parseStrictJson, parseCanonicalJsonBytes, JcsError } from './src/jcs.ts';
export type { JsonValue, JcsErrorCode, CanonicalParseOptions } from './src/jcs.ts';
export { encodeUtf8, decodeUtf8, isWellFormedString, Utf8Error } from './src/utf8.ts';
