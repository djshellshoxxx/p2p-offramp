/**
 * G16 EVM public-terms EIP-712 digest. TEST-ONLY capability: Keccak-256 comes from the pinned, inventoried
 * @noble/hashes 2.4.0 whose review is still pending (security/crypto-inventory.json). It lives in the non-core
 * wallet package (core domain/schemas stay dependency-free), is not exported from any entry point, and computes a digest only: it
 * never signs, verifies signatures, contacts a wallet/RPC or enables funding.
 */
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
export function domainSeparator(input: EvmDomainInput): Uint8Array {
  return keccak256(concat([keccak256(utf8.encode(DOMAIN_TYPE)), stringWord('P2POfframp'), stringWord('1'),
    uintWord(unsigned(input.chainId, U256, 1n), U256), addressWord(input.verifyingContract)]));
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
/** hashStruct(TradeTerms) with v=1 and mode=0 (basic manual v1). Native: assetKind 0 with zero address; ERC-20: 1 with nonzero token. */
export function tradeTermsStructHash(input: EvmTermsInput): Uint8Array {
  if (typeof input !== 'object' || input === null || Object.keys(input).sort().join() !== KEYS) return fail();
  for (const value of [input.networkId, input.deploymentId]) if (typeof value !== 'string' || !ID.test(value) || value.includes('..')) fail();
  if (input.seller === input.buyer) fail();
  let kind: bigint;
  if (input.assetKind === 'native') { if (input.asset !== `0x${'0'.repeat(40)}`) fail(); kind = 0n; }
  else if (input.assetKind === 'erc20') { addressWord(input.asset); kind = 1n; }
  else return fail();
  return keccak256(concat([keccak256(utf8.encode(TRADE_TERMS_TYPE)), uintWord(1n, 255n), bytes32Word(input.orderId),
    uintWord(unsigned(input.revision, U64, 1n), U64), stringWord(input.networkId), stringWord(input.deploymentId),
    addressWord(input.seller), addressWord(input.buyer), uintWord(kind, 255n), addressWord(input.asset, true),
    uintWord(unsigned(input.amountBaseUnits, U256, 1n), U256), bytes32Word(input.privateAgreementHash), bytes32Word(input.capabilitiesHash),
    bytes32Word(input.sellerNonce), uintWord(unsigned(input.acceptBeforeSeconds, U64), U64), uintWord(unsigned(input.escrowExpirySeconds, U64), U64),
    uintWord(0n, 255n)]));
}
/** termsHash: the exact EIP-712 digest both acceptance signatures must cover. */
export function evmTermsHash(domain: EvmDomainInput, terms: EvmTermsInput): string {
  return Array.from(eip712Digest(domainSeparator(domain), tradeTermsStructHash(terms)), byte => byte.toString(16).padStart(2, '0')).join('');
}
