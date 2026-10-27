/** Private structural-only snapshot of the in-memory G16 EVM agreement bundle shape. It verifies nothing:
 * no commitments, digests, signatures, account authority, expiry or trust. Synchronous and stateless.
 * Input graph is bounded by fixed arity: 4 outer fields, 9 private fields, <=8 capabilities x3 fields,
 * 2 domain, 14 terms and exactly 2 acceptances x4 fields; every string is length-capped before inspection.
 * Residual limits: caller-supplied strings are immutable and outside erasure; JS proxy meta-traps and engine
 * allocation are not isolated. Detached/shared/resizable signature storage is rejected, not raced.
 */
import { CoreSchemaError } from './core.ts';

export interface EvmAgreementCapability { readonly id: string; readonly version: string; readonly policyHash: string; }
export interface EvmAgreementPrivate {
  readonly v: 1; readonly orderId: string; readonly revision: string; readonly fiatCurrency: string;
  readonly fiatMinorUnits: string; readonly fiatScale: number; readonly paymentInstructions: string;
  readonly capabilities: readonly Readonly<EvmAgreementCapability>[]; readonly agreementSalt: string;
}
export interface EvmAgreementDomain { readonly chainId: string; readonly verifyingContract: string; }
export interface EvmAgreementTerms {
  readonly orderId: string; readonly revision: string; readonly networkId: string; readonly deploymentId: string;
  readonly seller: string; readonly buyer: string; readonly assetKind: 'native' | 'erc20'; readonly asset: string;
  readonly amountBaseUnits: string; readonly privateAgreementHash: string; readonly capabilitiesHash: string;
  readonly sellerNonce: string; readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
}
export interface EvmAgreementAcceptance {
  readonly termsHash: string; readonly role: 'seller' | 'buyer'; readonly walletAccount: string;
  readonly signature: Uint8Array<ArrayBuffer>;
}
export interface EvmAgreementInputSnapshot {
  readonly privateAgreement: Readonly<EvmAgreementPrivate>;
  readonly domain: Readonly<EvmAgreementDomain>;
  readonly terms: Readonly<EvmAgreementTerms>;
  readonly acceptances: readonly Readonly<EvmAgreementAcceptance>[];
}

type Code = CoreSchemaError['code'];
const fail = (code: Code = 'INVALID_INPUT'): never => { throw new CoreSchemaError(code); };
const U64 = (1n << 64n) - 1n, U128 = (1n << 128n) - 1n, U256 = (1n << 256n) - 1n;
const utf8 = new TextEncoder();
const HEX64 = /^[0-9a-f]{64}$/, ADDR = /^0x[0-9a-f]{40}$/, ZERO = /^0x0{40}$/, ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const typedProto = Object.getPrototypeOf(Uint8Array.prototype) as object;
const tagGet = Object.getOwnPropertyDescriptor(typedProto, Symbol.toStringTag)!.get! as (this: unknown) => unknown;
const lenGet = Object.getOwnPropertyDescriptor(typedProto, 'length')!.get! as (this: unknown) => number;
const offGet = Object.getOwnPropertyDescriptor(typedProto, 'byteOffset')!.get! as (this: unknown) => number;
const bufGet = Object.getOwnPropertyDescriptor(typedProto, 'buffer')!.get! as (this: unknown) => ArrayBufferLike;
const abByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get! as (this: unknown) => number;
const abResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get as ((this: unknown) => boolean) | undefined;
const abDetached = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'detached')?.get as ((this: unknown) => boolean) | undefined;
/** Cached intrinsic constructor + %TypedArray%.prototype.set: neither consults constructor/Symbol.species nor caller methods. */
const NativeU8 = Uint8Array, u8Set = Uint8Array.prototype.set;
const ownKeys = Reflect.ownKeys, getDesc = Object.getOwnPropertyDescriptor, getProto = Object.getPrototypeOf, isArr = Array.isArray;

/** `instanceof` on a revoked/hostile proxy value itself throws; never let that escape a catch. */
function isSchemaError(error: unknown): error is CoreSchemaError {
  try { return error instanceof CoreSchemaError; } catch { return false; }
}
function guard<T>(read: () => T): T {
  try { return read(); } catch (error) { if (isSchemaError(error)) throw error; return fail(); }
}
/** Untrusted meta-operation boundary: whatever a hostile trap throws (including a forged CoreSchemaError) is
 * discarded uninspected and replaced by a fresh fixed INVALID_INPUT. */
function meta<T>(read: () => T): T {
  try { return read(); } catch { return fail(); }
}
function dataRecord(input: unknown, keys: readonly string[]): Record<string, unknown> {
  return guard(() => {
    if (typeof input !== 'object' || input === null || isArr(input)) return fail();
    const proto = meta(() => getProto(input));
    if (proto !== Object.prototype && proto !== null) return fail();
    const actual = meta(() => ownKeys(input));
    if (actual.length !== keys.length || actual.some(k => typeof k !== 'string' || !keys.includes(k))) return fail();
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const d = meta(() => getDesc(input, key));
      if (!d || !d.enumerable || !('value' in d)) return fail();
      out[key] = d.value;
    }
    return out;
  });
}
function dataArray(input: unknown, max: number): unknown[] {
  return guard(() => {
    if (!isArr(input) || meta(() => getProto(input)) !== Array.prototype) return fail();
    const ld = meta(() => getDesc(input, 'length'));
    if (!ld || !('value' in ld) || typeof ld.value !== 'number' || !Number.isSafeInteger(ld.value) || ld.value < 0) return fail();
    if (ld.value > max) return fail('LIMIT_EXCEEDED');
    const n = ld.value, keys = meta(() => ownKeys(input));
    if (keys.length !== n + 1) return fail();
    const out: unknown[] = [];
    for (let i = 0; i < n; i++) {
      const d = meta(() => getDesc(input, String(i)));
      if (!d || !d.enumerable || !('value' in d)) return fail();
      out.push(d.value);
    }
    return out;
  });
}
function hex64(v: unknown): string { if (typeof v !== 'string' || !HEX64.test(v)) return fail(); return v; }
function addr(v: unknown, zero: boolean): string {
  if (typeof v !== 'string' || !ADDR.test(v)) return fail();
  if (!zero && ZERO.test(v)) return fail();
  return v;
}
/** digitCap is checked on string length BEFORE BigInt conversion. */
function uint(v: unknown, digitCap: number, max: bigint, min: bigint): string {
  if (typeof v !== 'string' || v.length > digitCap || !/^(0|[1-9][0-9]*)$/.test(v)) return fail();
  const n = BigInt(v);
  if (n < min || n > max) return fail();
  return v;
}
/** Conservative code-unit cap precedes validation and any encoding; UTF-8 bytes >= code units. */
function text(v: unknown, min: number, max: number, ascii: boolean): string {
  if (typeof v !== 'string') return fail();
  if (v.length > max) return fail('LIMIT_EXCEEDED');
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)) return fail();
  if (ascii && !/^[\x21-\x7e]*$/.test(v)) return fail();
  const scratch = utf8.encode(v);
  const n = scratch.byteLength;
  scratch.fill(0);
  if (n < min) return fail();
  if (n > max) return fail('LIMIT_EXCEEDED');
  return v;
}

function privateAgreement(input: unknown): Readonly<EvmAgreementPrivate> {
  const r = dataRecord(input, ['v', 'orderId', 'revision', 'fiatCurrency', 'fiatMinorUnits', 'fiatScale', 'paymentInstructions', 'capabilities', 'agreementSalt']);
  if (r.v !== 1) return fail('UNSUPPORTED_VERSION');
  if (typeof r.fiatCurrency !== 'string' || !/^[A-Z]{3}$/.test(r.fiatCurrency)) return fail();
  if (typeof r.fiatScale !== 'number' || !Number.isInteger(r.fiatScale) || r.fiatScale < 0 || r.fiatScale > 6) return fail();
  const orderId = hex64(r.orderId);
  const revision = uint(r.revision, 20, U64, 1n);
  const fiatMinorUnits = uint(r.fiatMinorUnits, 39, U128, 1n);
  const paymentInstructions = text(r.paymentInstructions, 0, 4096, false);
  const entries = dataArray(r.capabilities, 8);
  const caps: Readonly<EvmAgreementCapability>[] = [];
  let previous: string | undefined;
  for (const raw of entries) {
    const c = dataRecord(raw, ['id', 'version', 'policyHash']);
    const id = text(c.id, 1, 64, true);
    if (previous !== undefined && !(previous < id)) return fail();
    previous = id;
    caps.push(Object.freeze({ id, version: text(c.version, 1, 32, false), policyHash: hex64(c.policyHash) }));
  }
  const agreementSalt = hex64(r.agreementSalt);
  return Object.freeze({ v: 1 as const, orderId, revision, fiatCurrency: r.fiatCurrency, fiatMinorUnits, fiatScale: r.fiatScale,
    paymentInstructions, capabilities: Object.freeze(caps), agreementSalt });
}
function domainOf(input: unknown): Readonly<EvmAgreementDomain> {
  const r = dataRecord(input, ['chainId', 'verifyingContract']);
  return Object.freeze({ chainId: uint(r.chainId, 78, U256, 1n), verifyingContract: addr(r.verifyingContract, false) });
}
function termsOf(input: unknown): Readonly<EvmAgreementTerms> {
  const r = dataRecord(input, ['acceptBeforeSeconds', 'amountBaseUnits', 'asset', 'assetKind', 'buyer', 'capabilitiesHash', 'deploymentId',
    'escrowExpirySeconds', 'networkId', 'orderId', 'privateAgreementHash', 'revision', 'seller', 'sellerNonce']);
  for (const v of [r.networkId, r.deploymentId]) if (typeof v !== 'string' || !ID.test(v) || v.includes('..')) return fail();
  const seller = addr(r.seller, false), buyer = addr(r.buyer, false);
  if (seller === buyer) return fail();
  let assetKind: 'native' | 'erc20', asset: string;
  if (r.assetKind === 'native') { assetKind = 'native'; asset = addr(r.asset, true); if (!ZERO.test(asset)) return fail(); }
  else if (r.assetKind === 'erc20') { assetKind = 'erc20'; asset = addr(r.asset, false); }
  else return fail();
  return Object.freeze({ orderId: hex64(r.orderId), revision: uint(r.revision, 20, U64, 1n), networkId: r.networkId as string,
    deploymentId: r.deploymentId as string, seller, buyer, assetKind, asset, amountBaseUnits: uint(r.amountBaseUnits, 78, U256, 1n),
    privateAgreementHash: hex64(r.privateAgreementHash), capabilitiesHash: hex64(r.capabilitiesHash), sellerNonce: hex64(r.sellerNonce),
    acceptBeforeSeconds: uint(r.acceptBeforeSeconds, 20, U64, 0n), escrowExpirySeconds: uint(r.escrowExpirySeconds, 20, U64, 0n) });
}

interface Checked { readonly termsHash: string; readonly role: 'seller' | 'buyer'; readonly walletAccount: string; readonly source: Uint8Array; readonly offset: number }
/** Validate signature brand/length/storage without copying; returns offset. Intrinsic getters only. */
function checkSignature(value: unknown): number {
  return guard(() => {
    if (typeof value !== 'object' || value === null) return fail();
    if (tagGet.call(value) !== 'Uint8Array') return fail();
    if (lenGet.call(value) !== 65) return fail();
    const buffer = bufGet.call(value);
    // Intrinsic brand: the ArrayBuffer byteLength getter throws for SharedArrayBuffer/non-ArrayBuffer (guard -> INVALID_INPUT).
    const total = abByteLength.call(buffer);
    if (typeof total !== 'number' || getProto(buffer) !== ArrayBuffer.prototype) return fail();
    if (abDetached?.call(buffer) === true || abResizable?.call(buffer) === true) return fail();
    const offset = offGet.call(value);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 65 > total) return fail();
    return offset;
  });
}
function acceptancesOf(input: unknown, owned: Uint8Array<ArrayBuffer>[]): readonly Readonly<EvmAgreementAcceptance>[] {
  const entries = dataArray(input, 2);
  if (entries.length !== 2) return fail();
  const checked: Checked[] = [];
  for (const raw of entries) {
    const r = dataRecord(raw, ['termsHash', 'role', 'walletAccount', 'signature']);
    const termsHash = hex64(r.termsHash);
    if (r.role !== 'seller' && r.role !== 'buyer') return fail();
    const walletAccount = addr(r.walletAccount, true);
    const offset = checkSignature(r.signature);
    if (checked.some(c => c.role === r.role)) return fail();
    checked.push({ termsHash, role: r.role, walletAccount, source: r.signature as Uint8Array, offset });
  }
  // All data validated. Allocate a fixed owned 65-byte Uint8Array, register it BEFORE copying so any failure zeros it,
  // then copy exactly [offset, offset+65) through the cached intrinsic view constructor and %TypedArray%.prototype.set.
  // Unlike ArrayBuffer.prototype.slice this path never reads buffer.constructor / Symbol.species. A buffer detached by a
  // hostile meta-trap between validation and copy makes the intrinsic constructor/set throw -> fixed INVALID_INPUT.
  const out: Readonly<EvmAgreementAcceptance>[] = [];
  for (const c of checked) {
    const signature = new NativeU8(65);
    owned.push(signature);
    try {
      const buffer = bufGet.call(c.source) as ArrayBuffer;
      if (abDetached?.call(buffer) === true || abByteLength.call(buffer) < c.offset + 65) return fail();
      u8Set.call(signature, new NativeU8(buffer, c.offset, 65));
    } catch (error) {
      return isSchemaError(error) ? fail(error.code) : fail();
    }
    out.push(Object.freeze({ termsHash: c.termsHash, role: c.role, walletAccount: c.walletAccount, signature }));
  }
  return Object.freeze(out);
}

/** Structural snapshot only. Caller owns and must wipe the returned signature bytes. */
export function parseEvmAgreementInput(input: unknown): Readonly<EvmAgreementInputSnapshot> {
  const owned: Uint8Array<ArrayBuffer>[] = [];
  try {
    const raw = dataRecord(input, ['privateAgreement', 'domain', 'terms', 'acceptances']);
    const agreement = privateAgreement(raw.privateAgreement);
    const domain = domainOf(raw.domain);
    const terms = termsOf(raw.terms);
    const acceptances = acceptancesOf(raw.acceptances, owned);
    return Object.freeze({ privateAgreement: agreement, domain, terms, acceptances });
  } catch (error) {
    for (const bytes of owned) bytes.fill(0);
    if (isSchemaError(error)) throw error;
    throw new CoreSchemaError();
  }
}
