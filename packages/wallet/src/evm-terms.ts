/**
 * G16 EVM public-terms EIP-712 digest and offline EOA acceptance verification. TEST-ONLY capability:
 * Keccak-256 and secp256k1 recovery come from the pinned, inventoried @noble/hashes and @noble/curves 2.4.0,
 * whose reviews are still pending (security/crypto-inventory.json). Contract-wallet (EIP-1271) acceptance
 * needs a chain call and is not handled here. It lives in the non-core
 * wallet package (core domain/schemas stay dependency-free), is not exported from any entry point, and computes a digest only: it
 * never signs, contacts a wallet/RPC or enables funding.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

export const TRADE_TERMS_TYPE = 'TradeTerms(uint8 v,bytes32 orderId,uint64 revision,string networkId,string deploymentId,address seller,' +
  'address buyer,uint8 assetKind,address asset,uint256 amountBaseUnits,bytes32 privateAgreementHash,bytes32 capabilitiesHash,' +
  'bytes32 sellerNonce,uint64 acceptBeforeSeconds,uint64 escrowExpirySeconds,uint8 mode)';
export const DOMAIN_TYPE = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)';
const U64 = (1n << 64n) - 1n, U256 = (1n << 256n) - 1n;

export class EvmTermsError extends Error {
  readonly code = 'INVALID_INPUT' as const;
  constructor() { super('Invalid EVM trade terms.'); this.name = 'EvmTermsError'; }
}
const fail = (): never => { throw new EvmTermsError(); };
const utf8 = new TextEncoder();

/** Copy exact enumerable data fields without invoking caller accessors. EIP-712 inputs are plain JSON-shaped data. */
function exactDataObject<T extends object>(input: unknown, fields: readonly string[]): Readonly<T> {
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
    return Object.freeze(copy) as Readonly<T>;
  } catch { return fail(); }
}

export function keccak256(bytes: Uint8Array): Uint8Array { return keccak_256(bytes); }
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}
/** ABI word for an unsigned integer bounded by its declared width. */
export function uintWord(value: bigint, max: bigint): Uint8Array {
  if (value < 0n || value > max) return fail();
  const out = new Uint8Array(32);
  for (let index = 31, rest = value; index >= 0 && rest > 0n; index--, rest >>= 8n) out[index] = Number(rest & 0xffn);
  return out;
}
/** Canonical lowercase 20-byte address left-padded to a word; EIP-55 mixed case is rejected, not normalized. */
export function addressWord(input: unknown, allowZero = false): Uint8Array {
  if (typeof input !== 'string' || !/^0x[0-9a-f]{40}$/.test(input)) return fail();
  if (!allowZero && /^0x0{40}$/.test(input)) return fail();
  const out = new Uint8Array(32); out.set(Uint8Array.from(input.slice(2).match(/../g)!, pair => parseInt(pair, 16)), 12);
  return out;
}
export function bytes32Word(input: unknown): Uint8Array {
  if (typeof input !== 'string' || !/^[0-9a-f]{64}$/.test(input)) return fail();
  return Uint8Array.from(input.match(/../g)!, pair => parseInt(pair, 16));
}
export function stringWord(input: string): Uint8Array { return keccak256(utf8.encode(input)); }
function unsigned(input: unknown, max: bigint, minimum = 0n): bigint {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(input)) return fail();
  const value = BigInt(input);
  if (value < minimum || value > max) return fail();
  return value;
}
/** EIP-712 signing hash: keccak256(0x19 0x01 || domainSeparator || structHash). */
export function eip712Digest(domainSeparator: Uint8Array, structHash: Uint8Array): Uint8Array {
  if (domainSeparator.byteLength !== 32 || structHash.byteLength !== 32) return fail();
  return keccak256(concat([new Uint8Array([0x19, 0x01]), domainSeparator, structHash]));
}

export interface EvmDomainInput { readonly chainId: string; readonly verifyingContract: string; }
const DOMAIN_FIELDS = ['chainId', 'verifyingContract'] as const;
export function snapshotEvmDomain(input: EvmDomainInput): Readonly<EvmDomainInput> {
  return exactDataObject<EvmDomainInput>(input, DOMAIN_FIELDS);
}
export function domainSeparator(input: EvmDomainInput): Uint8Array {
  const domain = snapshotEvmDomain(input);
  return keccak256(concat([keccak256(utf8.encode(DOMAIN_TYPE)), stringWord('P2POfframp'), stringWord('1'),
    uintWord(unsigned(domain.chainId, U256, 1n), U256), addressWord(domain.verifyingContract)]));
}
export interface EvmTermsInput {
  readonly orderId: string; readonly revision: string; readonly networkId: string; readonly deploymentId: string;
  readonly seller: string; readonly buyer: string; readonly assetKind: 'native' | 'erc20'; readonly asset: string;
  readonly amountBaseUnits: string; readonly privateAgreementHash: string; readonly capabilitiesHash: string;
  readonly sellerNonce: string; readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEYS = 'acceptBeforeSeconds,amountBaseUnits,asset,assetKind,buyer,capabilitiesHash,deploymentId,escrowExpirySeconds,networkId,' +
  'orderId,privateAgreementHash,revision,seller,sellerNonce';
const TERMS_FIELDS_EXACT = KEYS.split(',');
export function snapshotEvmTerms(input: EvmTermsInput): Readonly<EvmTermsInput> {
  return exactDataObject<EvmTermsInput>(input, TERMS_FIELDS_EXACT);
}
/** hashStruct(TradeTerms) with v=1 and mode=0 (basic manual v1). Native: assetKind 0 with zero address; ERC-20: 1 with nonzero token. */
export function tradeTermsStructHash(input: EvmTermsInput): Uint8Array {
  const terms = snapshotEvmTerms(input);
  for (const value of [terms.networkId, terms.deploymentId]) if (typeof value !== 'string' || !ID.test(value) || value.includes('..')) fail();
  if (terms.seller === terms.buyer) fail();
  let kind: bigint;
  if (terms.assetKind === 'native') { if (terms.asset !== `0x${'0'.repeat(40)}`) fail(); kind = 0n; }
  else if (terms.assetKind === 'erc20') { addressWord(terms.asset); kind = 1n; }
  else return fail();
  return keccak256(concat([keccak256(utf8.encode(TRADE_TERMS_TYPE)), uintWord(1n, 255n), bytes32Word(terms.orderId),
    uintWord(unsigned(terms.revision, U64, 1n), U64), stringWord(terms.networkId), stringWord(terms.deploymentId),
    addressWord(terms.seller), addressWord(terms.buyer), uintWord(kind, 255n), addressWord(terms.asset, true),
    uintWord(unsigned(terms.amountBaseUnits, U256, 1n), U256), bytes32Word(terms.privateAgreementHash), bytes32Word(terms.capabilitiesHash),
    bytes32Word(terms.sellerNonce), uintWord(unsigned(terms.acceptBeforeSeconds, U64), U64), uintWord(unsigned(terms.escrowExpirySeconds, U64), U64),
    uintWord(0n, 255n)]));
}
/** termsHash: the exact EIP-712 digest both acceptance signatures must cover. */
export function evmTermsHash(domain: EvmDomainInput, terms: EvmTermsInput): string {
  return Array.from(eip712Digest(domainSeparator(domain), tradeTermsStructHash(terms)), byte => byte.toString(16).padStart(2, '0')).join('');
}

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
/** Address of an uncompressed secp256k1 public key: last 20 bytes of keccak256(x || y). */
function addressOf(publicKey: Uint8Array): string {
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return `0x${Array.from(keccak256(uncompressed.subarray(1)).subarray(12), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
/**
 * Recovers the EOA that produced an Ethereum r||s||v signature over a 32-byte digest and compares it with
 * `expected`. Strict: exactly 65 bytes, v in {27, 28}, 0 < r < n, 0 < s <= n/2 (EIP-2 low-s, so a malleated
 * twin is refused). Malformed input throws INVALID_INPUT; a well-formed signature by another key returns false.
 */
export function verifyEoaSignature(digestHex: string, signature: Uint8Array, expected: string): boolean {
  const digest = bytes32Word(digestHex); addressWord(expected);
  let stable: Uint8Array;
  try {
    if (!(signature instanceof Uint8Array) || typedArrayByteLength.call(signature) !== 65) return fail();
    // Typed-array construction copies intrinsic bytes without caller subarray/iterator overrides.
    stable = new Uint8Array(signature);
  } catch { return fail(); }
  const big = (part: Uint8Array): bigint => part.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  const r = big(stable.subarray(0, 32)), s = big(stable.subarray(32, 64)), v = stable[64];
  if (r === 0n || r >= N || s === 0n || s > N / 2n || (v !== 27 && v !== 28)) return fail();
  let recovered: string;
  try {
    // @noble 'recovered' layout is recovery id first, then r || s.
    const compact = new Uint8Array(65); compact[0] = v - 27; compact.set(stable.subarray(0, 64), 1);
    recovered = addressOf(secp256k1.recoverPublicKey(compact, digest, { prehash: false }));
  } catch { return false; }
  return recovered === expected;
}
/**
 * G16 acceptance check: the role selects the stored seller or buyer account; the signed digest never encodes
 * the role. Both acceptances must cover the identical termsHash.
 */
export function verifyEoaAcceptance(domain: EvmDomainInput, terms: EvmTermsInput, role: 'seller' | 'buyer', signature: Uint8Array): boolean {
  if (role !== 'seller' && role !== 'buyer') return fail();
  const stableDomain = snapshotEvmDomain(domain), stableTerms = snapshotEvmTerms(terms);
  return verifyEoaSignature(evmTermsHash(stableDomain, stableTerms), signature, role === 'seller' ? stableTerms.seller : stableTerms.buyer);
}
