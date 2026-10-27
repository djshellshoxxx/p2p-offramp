/**
 * G16 canonical encodings that are SHA-256 based and chain-wallet independent: the salted private agreement,
 * capabilities, and the Solana raw terms message. Encoding is not acceptance: nothing here signs, verifies a
 * signature, contacts a chain or enables funding. EVM EIP-712 (Keccak-256) is intentionally not implemented here.
 *
 * Maintainer encoding choices left open by G16 (recorded in the handoff): 32-byte identifiers
 * (orderId, sellerNonce, policyHash, agreementSalt, hashes) are lowercase hex strings; fiatCurrency is three
 * uppercase ASCII letters; Solana keys are canonical 32-byte base58.
 */
const PRIVATE_PREFIX = 'p2p-offramp/private-agreement/v1';
const SOLANA_PREFIX = 'p2p-offramp/solana/basic/v1';
export const MAX_PRIVATE_AGREEMENT_BYTES = 16 * 1024;
export const MAX_INSTRUCTIONS_BYTES = 4 * 1024;
export const MIN_ESCROW_SECONDS = 1800;
export const MAX_ESCROW_SECONDS = 604_800;
const U64 = (1n << 64n) - 1n, U128 = (1n << 128n) - 1n;

export class TermsError extends Error {
  readonly code: 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'UNSUPPORTED_VERSION' | 'EXPIRED';
  constructor(code: TermsError['code'] = 'INVALID_INPUT') { super('Invalid trade terms.'); this.name = 'TermsError'; this.code = code; }
}
const fail = (code?: TermsError['code']): never => { throw new TermsError(code); };

/** Snapshot an exact JSON-shaped record using data descriptors only; untrusted accessors are never invoked. */
function exactDataObject(input: unknown, fields: readonly string[]): Readonly<Record<string, unknown>> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail();
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length !== fields.length || ownKeys.some(key => typeof key !== 'string' || !fields.includes(key))) return fail();
    const copy = Object.create(null) as Record<string, unknown>;
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return fail();
      Object.defineProperty(copy, field, { value: descriptor.value, enumerable: true });
    }
    return Object.freeze(copy);
  } catch { return fail(); }
}

/** Copy dense arrays with no custom properties or accessor elements. */
function exactDataArray(input: unknown, maximum: number): readonly unknown[] {
  const tooLarge = Symbol('too-large');
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
    if (!lengthDescriptor || !('value' in lengthDescriptor) || typeof lengthDescriptor.value !== 'number' ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return fail();
    if (lengthDescriptor.value > maximum) throw tooLarge;
    const length = lengthDescriptor.value;
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length !== length + 1 || ownKeys.some(key => key !== 'length' &&
        (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) return fail();
    const copy: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return fail();
      copy.push(descriptor.value);
    }
    return Object.freeze(copy);
  } catch (error) { return error === tooLarge ? fail('LIMIT_EXCEEDED') : fail(); }
}

export interface CapabilityV1 { readonly id: string; readonly version: string; readonly policyHash: string; }
export interface PrivateAgreementV1 {
  readonly v: 1; readonly orderId: string; readonly revision: string; readonly fiatCurrency: string;
  readonly fiatMinorUnits: string; readonly fiatScale: number; readonly paymentInstructions: string;
  readonly capabilities: readonly CapabilityV1[]; readonly agreementSalt: string;
}
export interface SolanaTermsInput {
  readonly genesisHash: string; readonly programId: string; readonly orderId: string; readonly seller: string; readonly buyer: string;
  readonly assetKind: 'native' | 'spl'; readonly mint: string | null; readonly tokenProgram: string | null;
  readonly privateAgreementHash: string; readonly capabilitiesHash: string; readonly sellerNonce: string;
  readonly revision: string; readonly amountBaseUnits: string; readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
}

function hex32(input: unknown): Uint8Array {
  if (typeof input !== 'string' || !/^[0-9a-f]{64}$/.test(input)) return fail();
  return Uint8Array.from(input.match(/../g)!, pair => parseInt(pair, 16));
}
/** Canonical unsigned decimal string (no sign, no leading zeros, no exponent/float) bounded by `max`. */
function unsigned(input: unknown, max: bigint, minimum = 0n): bigint {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]{0,39})$/.test(input)) return fail();
  const value = BigInt(input);
  if (value < minimum || value > max) return fail();
  return value;
}
const utf8 = new TextEncoder();
/** Exact UTF-8 of an already-valid JS string; lone surrogates are rejected rather than replaced. */
function text(input: unknown, minimum: number, maximum: number, ascii = false): Uint8Array {
  if (typeof input !== 'string') return fail();
  // UTF-8 needs at least one byte per UTF-16 code unit, so a longer string can never fit: refuse before regex/encode allocation.
  if (input.length > maximum) return fail('LIMIT_EXCEEDED');
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input)) return fail();
  if (ascii && !/^[\x21-\x7e]*$/.test(input)) return fail();
  const bytes = utf8.encode(input);
  if (bytes.byteLength < minimum) return fail();
  if (bytes.byteLength > maximum) return fail('LIMIT_EXCEEDED');
  return bytes;
}
function beFixed(value: bigint, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  for (let index = bytes - 1, rest = value; index >= 0; index--, rest >>= 8n) out[index] = Number(rest & 0xffn);
  return out;
}
function leU64(value: bigint): Uint8Array { return beFixed(value, 8).reverse(); }
function lengthPrefixed(bytes: Uint8Array): Uint8Array[] { return [beFixed(BigInt(bytes.byteLength), 4), bytes]; }
function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}
function prefix(label: string): Uint8Array { return concat([utf8.encode(label), new Uint8Array([0])]); }

/** count u8 + entries (id, version as length-prefixed UTF-8; policyHash as length-prefixed UTF-8 hex). Sorted unique IDs. */
function capabilityBytes(input: unknown): Uint8Array[] {
  const entries = exactDataArray(input, 8);
  const parts: Uint8Array[] = [new Uint8Array([entries.length])];
  let previous: string | undefined;
  for (const raw of entries) {
    const capability = exactDataObject(raw, ['id', 'policyHash', 'version']) as unknown as CapabilityV1;
    const id = text(capability.id, 1, 64, true);
    // Sorted by exact byte order of the ASCII ID; equal IDs are duplicates.
    if (previous !== undefined && !(previous < capability.id)) return fail();
    previous = capability.id;
    hex32(capability.policyHash);
    parts.push(...lengthPrefixed(id), ...lengthPrefixed(text(capability.version, 1, 32)), ...lengthPrefixed(text(capability.policyHash, 64, 64, true)));
  }
  return parts;
}

/** Exact G16 salted private-agreement bytes. Unknown fields, bad UTF-8 and noncanonical integers fail closed. */
export function encodePrivateAgreement(input: PrivateAgreementV1): Uint8Array<ArrayBuffer> {
  const agreement = exactDataObject(input, ['agreementSalt', 'capabilities', 'fiatCurrency', 'fiatMinorUnits', 'fiatScale', 'orderId',
    'paymentInstructions', 'revision', 'v']) as unknown as PrivateAgreementV1;
  if (agreement.v !== 1) return fail('UNSUPPORTED_VERSION');
  if (typeof agreement.fiatCurrency !== 'string' || !/^[A-Z]{3}$/.test(agreement.fiatCurrency)) return fail();
  hex32(agreement.orderId);
  if (typeof agreement.fiatScale !== 'number' || !Number.isInteger(agreement.fiatScale) || agreement.fiatScale < 0 || agreement.fiatScale > 6) return fail();
  const bytes = concat([prefix(PRIVATE_PREFIX), new Uint8Array([1]),
    ...lengthPrefixed(text(agreement.orderId, 64, 64, true)),
    beFixed(unsigned(agreement.revision, U64, 1n), 8),
    ...lengthPrefixed(text(agreement.fiatCurrency, 3, 3, true)),
    beFixed(unsigned(agreement.fiatMinorUnits, U128, 1n), 16),
    new Uint8Array([agreement.fiatScale]),
    ...lengthPrefixed(text(agreement.paymentInstructions, 0, MAX_INSTRUCTIONS_BYTES)),
    ...capabilityBytes(agreement.capabilities),
    hex32(agreement.agreementSalt)]);
  if (bytes.byteLength > MAX_PRIVATE_AGREEMENT_BYTES) return fail('LIMIT_EXCEEDED');
  return bytes;
}
/** Same count+entry capability encoding without salt or prefix; a core trade uses count zero. */
export function encodeCapabilities(input: readonly CapabilityV1[]): Uint8Array<ArrayBuffer> { return concat(capabilityBytes(input)); }

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function solanaKey(input: unknown): Uint8Array {
  if (typeof input !== 'string' || input.length < 32 || input.length > 44) return fail();
  let value = 0n;
  for (const character of input) { const digit = BASE58.indexOf(character); if (digit < 0) return fail(); value = value * 58n + BigInt(digit); }
  const leading = input.length - input.replace(/^1+/, '').length;
  const body = value === 0n ? new Uint8Array(0) : beFixed(value, value.toString(16).length + 1 >> 1);
  if (leading + body.byteLength !== 32) return fail();
  return concat([new Uint8Array(leading), body]);
}

/** G16 Solana raw canonical terms message (signed directly by both Ed25519 keys; termsHash = SHA-256 of it). */
export function encodeSolanaTerms(input: SolanaTermsInput): Uint8Array<ArrayBuffer> {
  const terms = exactDataObject(input, ['acceptBeforeSeconds', 'amountBaseUnits', 'assetKind', 'buyer', 'capabilitiesHash', 'escrowExpirySeconds',
    'genesisHash', 'mint', 'orderId', 'privateAgreementHash', 'programId', 'revision', 'seller', 'sellerNonce', 'tokenProgram']) as unknown as SolanaTermsInput;
  const seller = solanaKey(terms.seller), buyer = solanaKey(terms.buyer);
  if (terms.seller === terms.buyer) return fail();
  let mint: Uint8Array, tokenProgram: Uint8Array, kind: number;
  if (terms.assetKind === 'native') {
    if (terms.mint !== null || terms.tokenProgram !== null) return fail();
    mint = new Uint8Array(32); tokenProgram = new Uint8Array(32); kind = 0;
  } else if (terms.assetKind === 'spl') {
    mint = solanaKey(terms.mint); tokenProgram = solanaKey(terms.tokenProgram); kind = 2;
  } else return fail();
  const accept = unsigned(terms.acceptBeforeSeconds, U64), expiry = unsigned(terms.escrowExpirySeconds, U64);
  return concat([prefix(SOLANA_PREFIX), solanaKey(terms.genesisHash), solanaKey(terms.programId), hex32(terms.orderId), seller, buyer,
    mint, tokenProgram, hex32(terms.privateAgreementHash), hex32(terms.capabilitiesHash), hex32(terms.sellerNonce),
    new Uint8Array([1]), leU64(unsigned(terms.revision, U64, 1n)), new Uint8Array([kind]), leU64(unsigned(terms.amountBaseUnits, U64, 1n)),
    leU64(accept), leU64(expiry), new Uint8Array([0])]);
}

/**
 * G16 funding-window rule evaluated against an observed chain time: chainTime < acceptBefore and
 * 1800 <= expiry - chainTime <= 604800. A funded trade ignores later acceptance expiry; that is the caller's state.
 */
export function checkFundingWindow(acceptBeforeSeconds: string, escrowExpirySeconds: string, chainTimeSeconds: string): void {
  const accept = unsigned(acceptBeforeSeconds, U64), expiry = unsigned(escrowExpirySeconds, U64), now = unsigned(chainTimeSeconds, U64);
  if (now >= accept) fail('EXPIRED');
  if (expiry < now + BigInt(MIN_ESCROW_SECONDS) || expiry - now > BigInt(MAX_ESCROW_SECONDS)) fail();
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>, digest = (data: Uint8Array<ArrayBuffer>) => globalThis.crypto.subtle.digest('SHA-256', data)): Promise<string> {
  return Array.from(new Uint8Array(await digest(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
