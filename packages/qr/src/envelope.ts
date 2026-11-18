/**
 * D6 (accepted, Option B) QR envelope v1. The envelope is RFC 8785 canonical JSON with exactly the fields
 * protocol, v, type, requestId, createdAt, expiresAt, chain, originHint, payload, payloadSha256 and, for a trade
 * invite only, an optional signature. Every type has an exact-key payload; unknown versions, types, fields and
 * chains fail closed. Secrets never travel in a QR: secret-bearing field names and value patterns (seed/mnemonic,
 * private keys, nsec, extended private keys, wallet-session URIs such as `wc:`, authentication tokens) are refused
 * before any schema check, and URLs are refused rather than carried.
 *
 * Nothing here is authority. payloadSha256 detects accidental change and authenticates nobody. A trade invite points
 * to an advertisement and a terms hash and never carries terms. Signing: only a trade invite is signable, over a
 * domain-separated digest of the canonical envelope with `signature` omitted. The invite signing-key profile is an
 * open owner decision, so this module chooses no key type and ships no verifier.
 */
import { canonicalBytes, canonicalize, JcsError, parseStrictJson, type JcsErrorCode, type JsonValue } from './jcs.ts';
import { encodeUtf8 } from './utf8.ts';

export const QR_PROTOCOL = 'p2p-offramp-qr';
export const QR_ENVELOPE_VERSION = 1;
export const QR_TYPES = Object.freeze(['public-address', 'trade-invite', 'payment-request', 'release-fingerprint', 'recovery-fingerprint'] as const);
export type QrType = typeof QR_TYPES[number];
/** The only type that may carry a signature. */
export const SIGNABLE_QR_TYPE = 'trade-invite';
/** Hard cap on canonical envelope bytes, checked on decoded bytes before JSON parsing. */
export const MAX_ENVELOPE_BYTES = 2048;
/** Generation target so codes stay scannable; reported, not enforced. Set finally only after physical scan tests. */
export const GENERATION_TARGET_BYTES = 1024;
export const MAX_ENVELOPE_DEPTH = 8;
export const DEFAULT_INVITE_LIFETIME_SECONDS = 600;
export const MIN_INVITE_LIFETIME_SECONDS = 120;
export const MAX_INVITE_LIFETIME_SECONDS = 86_400;
/** A code this close to expiry is treated as expired. */
export const EXPIRY_SAFETY_MARGIN_SECONDS = 60;
/** createdAt may be at most this far in the future of the local clock. */
export const MAX_FUTURE_SKEW_SECONDS = 120;
/** Latest accepted timestamp (9999-12-31T23:59:59Z). */
export const MAX_TIMESTAMP_SECONDS = 253_402_300_799;
/** Names protocol, version and type. A digest under this domain cannot be replayed as any other type. */
export const INVITE_SIGNING_DOMAIN = 'p2p-offramp-qr/v1/trade-invite/signing-digest';
export const RECOVERY_FINGERPRINT_FORMATS = Object.freeze({
  'p2p-offramp-backup/v1': 12 * 1024 * 1024,
  'p2p-offramp/offline-recovery-references/v1': 128 * 1024,
} as const);
export type RecoveryFingerprintFormat = keyof typeof RECOVERY_FINGERPRINT_FORMATS;

export type QrErrorCode =
  | 'QR_TOO_LARGE' | 'FORMAT_UNSUPPORTED' | 'URL_REFUSED' | 'WALLET_SESSION_REFUSED' | 'SECRET_REFUSED'
  | 'VERSION_UNSUPPORTED' | 'INVALID_ENCODING' | 'INVALID_UNICODE' | 'INVALID_JSON' | 'NON_CANONICAL'
  | 'PROTOCOL_UNSUPPORTED' | 'TYPE_UNSUPPORTED' | 'FIELD_UNSUPPORTED' | 'INVALID_ENVELOPE' | 'INVALID_PAYLOAD'
  | 'CHAIN_UNSUPPORTED' | 'CHAIN_MISMATCH' | 'HASH_MISMATCH' | 'SIGNATURE_UNSUPPORTED' | 'SIGNATURE_INVALID'
  | 'SIGNATURE_REQUIRED' | 'PROFILE_UNSUPPORTED'
  | 'EXPIRED' | 'NOT_YET_VALID' | 'LIFETIME_EXCEEDED' | 'INVALID_INPUT' | 'UNAVAILABLE'
  | 'REPLAYED' | 'REPLAY_LEDGER_FULL';
export type QrFailure = { readonly ok: false; readonly code: QrErrorCode };

export interface PublicAddressPayload { readonly address: string }
/** Crypto only. amount is a canonical decimal string of base units; asset is `native` or a token address. */
export interface PaymentRequestPayload { readonly recipient: string; readonly asset: string; readonly amount: string }
/** Points to the advertisement and its G16 terms hash. Never carries terms. */
export interface TradeInvitePayload { readonly ad: string; readonly termsHash: string }
export interface ReleaseFingerprintPayload { readonly channel: string; readonly releaseId: string; readonly sequence: number; readonly manifestSha256: string }
/** SHA-256 of the original file bytes. Not a download capability, never ciphertext or key material. */
export interface RecoveryFingerprintPayload { readonly format: RecoveryFingerprintFormat; readonly byteLength: number; readonly sha256: string }
export interface QrPayloads {
  readonly 'public-address': PublicAddressPayload;
  readonly 'trade-invite': TradeInvitePayload;
  readonly 'payment-request': PaymentRequestPayload;
  readonly 'release-fingerprint': ReleaseFingerprintPayload;
  readonly 'recovery-fingerprint': RecoveryFingerprintPayload;
}
/** Opaque until the owner decides the invite signing-key profile. Lowercase hex for key and value. */
export interface InviteSignature { readonly profile: string; readonly publicKey: string; readonly value: string }

interface EnvelopeFields<T extends QrType> {
  readonly protocol: typeof QR_PROTOCOL; readonly v: 1; readonly type: T; readonly requestId: string;
  readonly createdAt: number; readonly expiresAt: number | null; readonly chain: string | null; readonly originHint: string | null;
  readonly payload: QrPayloads[T]; readonly payloadSha256: string;
}
export type QrEnvelopeOf<T extends QrType> = T extends 'trade-invite'
  ? EnvelopeFields<T> & { readonly signature?: InviteSignature }
  : EnvelopeFields<T>;
export type QrEnvelope = { [T in QrType]: QrEnvelopeOf<T> }[QrType];

/** Any SHA-256 provider: Web Crypto `crypto.subtle.digest('SHA-256', b)` or a Node hash both fit. */
export type Sha256 = (bytes: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer | Uint8Array>;

export class QrError extends Error {
  readonly code: QrErrorCode;
  constructor(code: QrErrorCode) { super(`QR refused: ${code}.`); this.name = 'QrError'; this.code = code; }
}
export const refuse = (code: QrErrorCode): never => { throw new QrError(code); };
export const failure = (code: QrErrorCode): QrFailure => Object.freeze({ ok: false, code });
/** Converts a thrown QrError/JcsError into a result; anything else is an internal fault and maps to UNAVAILABLE. */
export function toFailure(error: unknown): QrFailure {
  if (error instanceof QrError) return failure(error.code);
  if (error instanceof JcsError) return failure(jcsCode(error.code));
  return failure('UNAVAILABLE');
}
export function jcsCode(code: JcsErrorCode): QrErrorCode {
  switch (code) {
    case 'INVALID_UNICODE': return 'INVALID_UNICODE';
    case 'NON_CANONICAL': return 'NON_CANONICAL';
    case 'TOO_LARGE': return 'QR_TOO_LARGE';
    case 'UNSUPPORTED_VALUE': return 'INVALID_INPUT';
    default: return 'INVALID_JSON';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Field syntax
const HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/, HEX_BYTES = /^(?:[0-9a-f]{2})+$/;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const BASE58_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CHAIN = /^(?:evm:[1-9][0-9]{0,19}|solana:[1-9A-HJ-NP-Za-km-z]{32,44})$/;
/** Mirrors packages/exchange parseAdAddress: `30078:<author>:p2p-offramp:v1:<orderId>`. */
const AD = /^30078:([0-9a-f]{64}):p2p-offramp:v1:([0-9a-f]{64})$/;
const AMOUNT = /^[1-9][0-9]{0,77}$/;
const CHANNEL = /^[a-z0-9][a-z0-9._-]{0,63}$/, RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const PROFILE = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_PUBLIC_KEY_HEX = 256, MAX_SIGNATURE_HEX = 2048;
const U256_MAX = (1n << 256n) - 1n, U64_MAX = (1n << 64n) - 1n;
const ZERO_EVM = `0x${'0'.repeat(40)}`;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodes base58 (Bitcoin alphabet) and returns the byte length, or -1. Inputs are already length-bounded. */
function base58Length(text: string): { readonly length: number; readonly zero: boolean } {
  let n = 0n;
  for (const char of text) {
    const digit = B58.indexOf(char);
    if (digit < 0) return { length: -1, zero: false };
    n = n * 58n + BigInt(digit);
  }
  let leading = 0;
  while (leading < text.length && text[leading] === '1') leading++;
  let body = 0;
  for (let rest = n; rest > 0n; rest >>= 8n) body++;
  return { length: leading + body, zero: n === 0n };
}
const isSolanaKey = (value: string): boolean => BASE58_KEY.test(value) && base58Length(value).length === 32;
const isNonZeroSolanaKey = (value: string): boolean => {
  if (!BASE58_KEY.test(value)) return false;
  const decoded = base58Length(value);
  return decoded.length === 32 && !decoded.zero;
};

export type ChainFamily = 'evm' | 'solana';
export function isQrChain(value: unknown): value is string { return typeof value === 'string' && CHAIN.test(value) && (!value.startsWith('solana:') || isSolanaKey(value.slice(7))); }
export function chainFamily(chain: string): ChainFamily { return chain.startsWith('evm:') ? 'evm' : 'solana'; }
export function isOriginHint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253) return false;
  return value.split('.').every(label => HOST_LABEL.test(label));
}
export function parseAdReference(ad: string): { readonly author: string; readonly orderId: string } | null {
  const match = AD.exec(ad);
  return match === null ? null : Object.freeze({ author: match[1] as string, orderId: match[2] as string });
}

// ---------------------------------------------------------------------------------------------------------------
// Secret and URL refusal. This runs over every key and string value before any schema check, so a secret-bearing
// field gets SECRET_REFUSED rather than a generic unknown-field error. It is defense in depth: the exact-key schemas
// below admit no free-text field. A raw 32-byte hex secret is indistinguishable from a hash in a hash slot and is
// excluded there only by those schemas; in the few text slots (originHint, channel, releaseId) it is refused here.
const SECRET_KEY_NAME = /seed|mnemonic|private|secret|nsec|xprv|xpriv|tprv|wif|passw|passphrase|token|auth|session|bearer|apikey|cookie|jwt|credential|keystore|entropy|privkey|walletconnect|symkey/;
const SECRET_VALUE = [
  /(?:^|[^A-Za-z0-9])wc:/i,                                       // WalletConnect pairing/session URI
  /[?&;#]symkey=/i,                                               // session symmetric key parameter
  // Length floors sit far above any public field (Solana keys are at most 44 characters), so no valid value can match.
  /nsec1[02-9ac-hj-np-z]{50,}/i,                                  // NIP-19 Nostr private key (63 characters)
  /[xyztuv]prv[1-9A-HJ-NP-Za-km-z]{100,}/,                        // BIP-32 extended private key (111 characters)
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,                        // PEM private key
  /eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\./,                    // JWT / JWS compact serialization
  /(?:^|\s)bearer\s+\S{6,}/i,                                     // HTTP bearer credential
  /(?:^|[?&#;\s])(?:access|refresh|id|auth|session|api)[_-]?(?:token|key)\s*[=:]/i,
  /(?:^|[?&#;\s])(?:token|secret|password|passwd|sessionid|sid|apikey)\s*[=:]/i,
  /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/,                             // 32-byte key in 0x-hex form
];
/** WIF keys, base58 Solana secret keys and serialized extended keys are all longer base58 runs than any public field. */
const LONG_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{50,}$/, LOWER_HEX = /^[0-9a-f]+$/;
const URL_LIKE = [/^[A-Za-z][A-Za-z0-9+.-]*:/, /:\/\//, /^\/\//, /^www\./i];
/** Slots with their own strict syntax where a scheme-like or `www.` value is legitimate. */
const URL_EXEMPT_SLOTS = new Set(['chain', 'originHint']);
/** Short free-form identifier slots; secrets split by separators are looked for here. */
const TEXT_SLOTS = new Set(['payload.channel', 'payload.releaseId']);
/** A bare git SHA-1 commit id is a legitimate releaseId; a 64-hex value is not (it looks exactly like a 32-byte key). */
const GIT_SHA1 = /^[0-9a-f]{40}$/;
const SEPARATORS = /[\s,;:|/._-]+/g;

/** 12 or more alphabetic words of 3-8 letters in any case, separated by spaces, commas, hyphens, dots and similar. */
function isMnemonicLike(value: string): boolean {
  const words = value.split(SEPARATORS).filter(word => word.length > 0);
  return words.length >= 12 && words.every(word => /^[A-Za-z]{3,8}$/.test(word));
}
export function isSecretKeyName(key: string): boolean { return SECRET_KEY_NAME.test(key.toLowerCase().replace(/[^a-z0-9]/g, '')); }
export function isSecretLike(value: string): boolean {
  return SECRET_VALUE.some(pattern => pattern.test(value)) || (LONG_BASE58.test(value) && !LOWER_HEX.test(value)) || isMnemonicLike(value);
}
/**
 * Text-slot check: removes separators first, so a hyphenated WIF key, bare NIP-19/bech32 key data or a hex key split
 * into labels is still recognised. 16+ bytes of hex, or 50+ base58/bech32 characters, never belong in these slots.
 */
export function isSecretLikeText(value: string): boolean {
  const compact = value.replace(SEPARATORS, '');
  return isSecretLike(value) || isSecretLike(compact) || /[0-9a-fA-F]{32,}/.test(compact)
    || /^[1-9A-HJ-NP-Za-km-z]{50,}$/.test(compact) || /^[02-9ac-hj-np-z]{50,}$/i.test(compact);
}
/**
 * originHint check. The slot already has strict lowercase hostname syntax, so the base58 and mnemonic heuristics are
 * skipped (they misfire on v3 .onion names and long hostnames); explicit secret forms and 16+ bytes of hex split
 * across labels are still refused.
 */
export function isSecretLikeHostname(value: string): boolean {
  return SECRET_VALUE.some(pattern => pattern.test(value)) || /[0-9a-fA-F]{32,}/.test(value.replace(SEPARATORS, ''));
}
export function isUrlLike(value: string): boolean { return URL_LIKE.some(pattern => pattern.test(value)); }

function secretInSlot(path: string, value: string): boolean {
  if (path === 'originHint') return isSecretLikeHostname(value);
  if (path === 'payload.releaseId' && GIT_SHA1.test(value)) return false;
  return TEXT_SLOTS.has(path) ? isSecretLikeText(value) : isSecretLike(value);
}

function scanTree(value: JsonValue, depth: number, path: string): void {
  if (typeof value === 'string') {
    if (secretInSlot(path, value)) refuse('SECRET_REFUSED');
    // chain and originHint are exempt: chain ids are scheme-like (`evm:1`), a hostname may start with `www.`, and both
    // slots have their own strict syntax checks.
    if (!URL_EXEMPT_SLOTS.has(path) && isUrlLike(value)) refuse('URL_REFUSED');
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (depth > MAX_ENVELOPE_DEPTH) refuse('INVALID_JSON');
  if (Array.isArray(value)) { for (const item of value as readonly JsonValue[]) scanTree(item, depth + 1, `${path}[]`); return; }
  for (const key of Object.keys(value)) {
    if (isSecretKeyName(key) || isSecretLike(key)) refuse('SECRET_REFUSED');
    scanTree((value as Record<string, JsonValue>)[key] as JsonValue, depth + 1, path === '' ? key : `${path}.${key}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Exact-key structure over a parsed (null-prototype, data-only) tree.
type Tree = Readonly<Record<string, JsonValue>>;
function record(value: JsonValue, code: QrErrorCode): Tree {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return refuse(code);
  return value as Tree;
}
function exactKeys(value: Tree, required: readonly string[], optional: readonly string[], missing: QrErrorCode): void {
  const keys = Object.keys(value);
  for (const key of keys) if (!required.includes(key) && !optional.includes(key)) refuse('FIELD_UNSUPPORTED');
  for (const key of required) if (!Object.hasOwn(value, key)) refuse(missing);
}
const isTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_TIMESTAMP_SECONDS;
const isPositiveCount = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max;
const str = (value: JsonValue | undefined, test: (text: string) => boolean): string => (typeof value === 'string' && test(value) ? value : refuse('INVALID_PAYLOAD'));

const ENVELOPE_KEYS = Object.freeze(['protocol', 'v', 'type', 'requestId', 'createdAt', 'expiresAt', 'chain', 'originHint', 'payload', 'payloadSha256']);
const PAYLOAD_KEYS: Readonly<Record<QrType, readonly string[]>> = Object.freeze({
  'public-address': Object.freeze(['address']),
  'trade-invite': Object.freeze(['ad', 'termsHash']),
  'payment-request': Object.freeze(['recipient', 'asset', 'amount']),
  'release-fingerprint': Object.freeze(['channel', 'releaseId', 'sequence', 'manifestSha256']),
  'recovery-fingerprint': Object.freeze(['format', 'byteLength', 'sha256']),
});
const CHAIN_BOUND: Readonly<Record<QrType, boolean>> = Object.freeze({
  'public-address': true, 'trade-invite': true, 'payment-request': true, 'release-fingerprint': false, 'recovery-fingerprint': false,
});

function accountFor(family: ChainFamily): (text: string) => boolean {
  return family === 'evm' ? text => EVM_ADDRESS.test(text) && text !== ZERO_EVM : isNonZeroSolanaKey;
}

function parsePayload(type: QrType, chain: string | null, raw: JsonValue): QrPayloads[QrType] {
  const value = record(raw, 'INVALID_PAYLOAD');
  exactKeys(value, PAYLOAD_KEYS[type], [], 'INVALID_PAYLOAD');
  switch (type) {
    case 'public-address': {
      const account = accountFor(chainFamily(chain as string));
      return Object.freeze({ address: str(value.address, account) });
    }
    case 'payment-request': {
      const family = chainFamily(chain as string), account = accountFor(family);
      const recipient = str(value.recipient, account);
      const asset = str(value.asset, text => text === 'native' || account(text));
      const limit = family === 'evm' ? U256_MAX : U64_MAX;
      const amount = str(value.amount, text => AMOUNT.test(text) && BigInt(text) <= limit);
      return Object.freeze({ recipient, asset, amount });
    }
    case 'trade-invite':
      return Object.freeze({ ad: str(value.ad, text => AD.test(text)), termsHash: str(value.termsHash, text => HEX64.test(text)) });
    case 'release-fingerprint': {
      const channel = str(value.channel, text => CHANNEL.test(text)), releaseId = str(value.releaseId, text => RELEASE_ID.test(text));
      if (!isPositiveCount(value.sequence, Number.MAX_SAFE_INTEGER)) return refuse('INVALID_PAYLOAD');
      return Object.freeze({ channel, releaseId, sequence: value.sequence, manifestSha256: str(value.manifestSha256, text => HEX64.test(text)) });
    }
    case 'recovery-fingerprint': {
      const format = str(value.format, text => Object.hasOwn(RECOVERY_FINGERPRINT_FORMATS, text)) as RecoveryFingerprintFormat;
      if (!isPositiveCount(value.byteLength, RECOVERY_FINGERPRINT_FORMATS[format])) return refuse('INVALID_PAYLOAD');
      return Object.freeze({ format, byteLength: value.byteLength, sha256: str(value.sha256, text => HEX64.test(text)) });
    }
  }
}

function parseSignature(raw: JsonValue): InviteSignature {
  const value = record(raw, 'INVALID_ENVELOPE');
  exactKeys(value, ['profile', 'publicKey', 'value'], [], 'INVALID_ENVELOPE');
  const { profile, publicKey, value: signature } = value;
  if (typeof profile !== 'string' || !PROFILE.test(profile)) return refuse('INVALID_ENVELOPE');
  if (typeof publicKey !== 'string' || publicKey.length > MAX_PUBLIC_KEY_HEX || !HEX_BYTES.test(publicKey)) return refuse('INVALID_ENVELOPE');
  if (typeof signature !== 'string' || signature.length > MAX_SIGNATURE_HEX || !HEX_BYTES.test(signature)) return refuse('INVALID_ENVELOPE');
  return Object.freeze({ profile, publicKey, value: signature });
}

/**
 * Structural validation of a parsed tree (sync; no hash, clock or chain-allowlist check). Throws QrError.
 * Order: secrets/URLs, protocol, version, type, exact keys, fields, payload, signature placement, invite lifetime.
 */
export function validateEnvelopeTree(tree: JsonValue): QrEnvelope {
  const raw = record(tree, 'INVALID_ENVELOPE');
  scanTree(raw, 0, '');
  if (raw.protocol !== QR_PROTOCOL) return refuse('PROTOCOL_UNSUPPORTED');
  if (raw.v !== QR_ENVELOPE_VERSION) return refuse('VERSION_UNSUPPORTED');
  const type = raw.type;
  if (typeof type !== 'string' || !(QR_TYPES as readonly string[]).includes(type)) return refuse('TYPE_UNSUPPORTED');
  const kind = type as QrType;
  exactKeys(raw, ENVELOPE_KEYS, ['signature'], 'INVALID_ENVELOPE');
  const { requestId, createdAt, expiresAt, chain, originHint, payloadSha256 } = raw;
  if (typeof requestId !== 'string' || !HEX32.test(requestId)) return refuse('INVALID_ENVELOPE');
  if (!isTimestamp(createdAt)) return refuse('INVALID_ENVELOPE');
  if (expiresAt !== null && (!isTimestamp(expiresAt) || expiresAt <= createdAt)) return refuse('INVALID_ENVELOPE');
  if (CHAIN_BOUND[kind] ? !isQrChain(chain) : chain !== null) return refuse('INVALID_ENVELOPE');
  if (originHint !== null && !isOriginHint(originHint)) return refuse('INVALID_ENVELOPE');
  if (typeof payloadSha256 !== 'string' || !HEX64.test(payloadSha256)) return refuse('INVALID_ENVELOPE');
  const payload = parsePayload(kind, chain as string | null, raw.payload as JsonValue);
  let signature: InviteSignature | undefined;
  if (Object.hasOwn(raw, 'signature')) {
    if (kind !== SIGNABLE_QR_TYPE) return refuse('SIGNATURE_UNSUPPORTED');
    signature = parseSignature(raw.signature as JsonValue);
  }
  if (kind === SIGNABLE_QR_TYPE) {
    if (expiresAt === null) return refuse('INVALID_ENVELOPE');
    if ((expiresAt as number) - createdAt > MAX_INVITE_LIFETIME_SECONDS) return refuse('LIFETIME_EXCEEDED');
  }
  const base = {
    protocol: QR_PROTOCOL, v: QR_ENVELOPE_VERSION, type: kind, requestId, createdAt, expiresAt: expiresAt as number | null,
    chain: chain as string | null, originHint: originHint as string | null, payload, payloadSha256,
  };
  return Object.freeze(signature === undefined ? base : { ...base, signature }) as QrEnvelope;
}

/**
 * Normalizes any caller value through canonical JSON first, so accessors, proxies and non-plain objects never reach
 * validation. A value outside the canonical domain (float, lone surrogate, accessor, class instance) is INVALID_INPUT.
 */
export function normalizeTree(value: unknown): JsonValue {
  try { return parseStrictJson(canonicalize(value, MAX_ENVELOPE_DEPTH), MAX_ENVELOPE_DEPTH); }
  catch (error) { if (error instanceof JcsError) return refuse('INVALID_INPUT'); throw error; }
}

/** Synchronous structural check of an envelope value (no hash, clock or chain allowlist). */
export function parseQrEnvelope(value: unknown): { readonly ok: true; readonly envelope: QrEnvelope } | QrFailure {
  try { return Object.freeze({ ok: true, envelope: validateEnvelopeTree(normalizeTree(value)) }); } catch (error) { return toFailure(error); }
}

// ---------------------------------------------------------------------------------------------------------------
// Hashing and the invite signing digest.
export function hex(bytes: Uint8Array): string { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }

export async function sha256Bytes(sha256: Sha256, bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof sha256 !== 'function') return refuse('INVALID_INPUT');
  const copy = new Uint8Array(bytes.length); copy.set(bytes);
  let digest: ArrayBuffer | Uint8Array;
  try { digest = await sha256(copy); } catch { return refuse('UNAVAILABLE'); }
  const view = digest instanceof Uint8Array ? digest : digest instanceof ArrayBuffer ? new Uint8Array(digest) : null;
  if (view === null || view.length !== 32) return refuse('UNAVAILABLE');
  return Uint8Array.from(view);
}

/** Hex SHA-256 of the RFC 8785 payload bytes. */
export async function payloadDigestHex(sha256: Sha256, payload: unknown): Promise<string> {
  return hex(await sha256Bytes(sha256, canonicalBytes(payload, MAX_ENVELOPE_DEPTH)));
}

export async function assertPayloadHash(sha256: Sha256, envelope: QrEnvelope): Promise<void> {
  if (await payloadDigestHex(sha256, envelope.payload) !== envelope.payloadSha256) refuse('HASH_MISMATCH');
}

/** Canonical RFC 8785 bytes of the whole envelope (signature included when present). */
export function envelopeBytes(envelope: QrEnvelope): Uint8Array { return canonicalBytes(envelope, MAX_ENVELOPE_DEPTH); }

/** UTF-8(INVITE_SIGNING_DOMAIN) || 0x00 || RFC 8785 bytes of the envelope with `signature` omitted. */
export function inviteSigningMessage(envelope: QrEnvelope): Uint8Array {
  if (envelope.type !== SIGNABLE_QR_TYPE) return refuse('SIGNATURE_UNSUPPORTED');
  const { signature: _omitted, ...unsigned } = envelope as QrEnvelopeOf<'trade-invite'>;
  const domain = encodeUtf8(INVITE_SIGNING_DOMAIN), body = canonicalBytes(unsigned, MAX_ENVELOPE_DEPTH);
  const out = new Uint8Array(domain.length + 1 + body.length);
  out.set(domain, 0); out[domain.length] = 0; out.set(body, domain.length + 1);
  return out;
}

/**
 * Domain-separated SHA-256 digest a trade-invite signer signs and a verifier checks. Any other type is refused, so a
 * signature cannot be produced or reused for a non-invite code.
 */
export async function inviteSigningDigest(envelope: unknown, sha256: Sha256): Promise<{ readonly ok: true; readonly digest: Uint8Array } | QrFailure> {
  try {
    const parsed = validateEnvelopeTree(normalizeTree(envelope));
    if (parsed.type !== SIGNABLE_QR_TYPE) return failure('SIGNATURE_UNSUPPORTED');
    await assertPayloadHash(sha256, parsed);
    return Object.freeze({ ok: true, digest: await sha256Bytes(sha256, inviteSigningMessage(parsed)) });
  } catch (error) { return toFailure(error); }
}

/** Returns a new trade-invite envelope carrying `signature`. The signature itself is checked only by an injected verifier. */
export function attachInviteSignature(envelope: unknown, signature: InviteSignature): { readonly ok: true; readonly envelope: QrEnvelope } | QrFailure {
  try {
    const parsed = validateEnvelopeTree(normalizeTree(envelope));
    if (parsed.type !== SIGNABLE_QR_TYPE) return failure('SIGNATURE_UNSUPPORTED');
    const { signature: _previous, ...unsigned } = parsed as QrEnvelopeOf<'trade-invite'>;
    return parseQrEnvelope({ ...unsigned, signature });
  } catch (error) { return toFailure(error); }
}

// ---------------------------------------------------------------------------------------------------------------
// Generation.
export interface CreateQrEnvelopeInput<T extends QrType = QrType> {
  readonly type: T; readonly chain: string | null; readonly payload: QrPayloads[T];
  readonly originHint?: string | null;
  /** Invite: default 600, MIN_INVITE_LIFETIME_SECONDS..MAX_INVITE_LIFETIME_SECONDS. Other types: omitted or null means no expiry. */
  readonly lifetimeSeconds?: number | null;
}
export interface CreateQrEnvelopeDeps {
  readonly sha256: Sha256;
  /** Cryptographically secure random bytes, e.g. `n => crypto.getRandomValues(new Uint8Array(n))`. */
  readonly randomBytes: (length: number) => Uint8Array;
  readonly nowSeconds: () => number;
}
export type QrEnvelopeResult = { readonly ok: true; readonly envelope: QrEnvelope } | QrFailure;

/** Builds an unsigned envelope through the same validator the importer uses. */
export async function createQrEnvelope(input: CreateQrEnvelopeInput, deps: CreateQrEnvelopeDeps): Promise<QrEnvelopeResult> {
  try {
    if (typeof deps !== 'object' || deps === null || typeof deps.randomBytes !== 'function' || typeof deps.nowSeconds !== 'function') return failure('INVALID_INPUT');
    const fields = record(normalizeTree(input), 'INVALID_INPUT');
    exactKeys(fields, ['type', 'chain', 'payload'], ['originHint', 'lifetimeSeconds'], 'INVALID_INPUT');
    const now = deps.nowSeconds();
    if (!isTimestamp(now)) return failure('INVALID_INPUT');
    const random = deps.randomBytes(16);
    if (!(random instanceof Uint8Array) || random.length !== 16) return failure('UNAVAILABLE');
    const lifetime = fields.lifetimeSeconds ?? (fields.type === SIGNABLE_QR_TYPE ? DEFAULT_INVITE_LIFETIME_SECONDS : null);
    if (lifetime !== null && (typeof lifetime !== 'number' || !Number.isSafeInteger(lifetime) || lifetime < 1)) return failure('INVALID_INPUT');
    if (fields.type === SIGNABLE_QR_TYPE) {
      if (lifetime === null || lifetime < MIN_INVITE_LIFETIME_SECONDS) return failure('INVALID_INPUT');
      if (lifetime > MAX_INVITE_LIFETIME_SECONDS) return failure('LIFETIME_EXCEEDED');
    }
    // Scan the caller payload before hashing so a secret never reaches the hash provider.
    scanTree(fields, 0, '');
    const payloadSha256 = await payloadDigestHex(deps.sha256, fields.payload);
    const tree = normalizeTree({
      protocol: QR_PROTOCOL, v: QR_ENVELOPE_VERSION, type: fields.type, requestId: hex(random), createdAt: now,
      expiresAt: lifetime === null ? null : now + (lifetime as number), chain: fields.chain, originHint: fields.originHint ?? null,
      payload: fields.payload, payloadSha256,
    });
    const envelope = validateEnvelopeTree(tree);
    if (envelopeBytes(envelope).length > MAX_ENVELOPE_BYTES) return failure('QR_TOO_LARGE');
    return Object.freeze({ ok: true, envelope });
  } catch (error) { return toFailure(error); }
}
