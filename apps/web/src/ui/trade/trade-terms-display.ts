/**
 * Pure, deterministic display formatters for an already-validated trade-terms view. No DOM, globals, locale or
 * network. Formatting is not validation of a trade: nothing here accepts, signs or funds anything.
 */
export type DisplayErrorCode = 'INVALID_AMOUNT' | 'INVALID_DECIMALS' | 'INVALID_CURRENCY' | 'INVALID_TIME' | 'INVALID_ADDRESS';
export type DisplayResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: DisplayErrorCode };
const ok = <T,>(value: T): DisplayResult<T> => ({ ok: true, value });
const bad = (code: DisplayErrorCode): DisplayResult<never> => ({ ok: false, code });

/** Same canonical rule as packages/domain/src/trade-terms.ts `unsigned`. */
const CANONICAL_UNSIGNED = /^(0|[1-9][0-9]{0,39})$/;
/** EVM amounts are uint256 (G16), which needs up to 78 decimal digits. */
const CANONICAL_UNSIGNED_WIDE = /^(0|[1-9][0-9]{0,77})$/;
const U256_MAX = (1n << 256n) - 1n;
export const MAX_DISPLAY_DECIMALS = 38;
/** Fiat scale is bounded to 0..6 by the G16 private agreement encoding. */
export const MAX_FIAT_SCALE = 6;

function decimalString(units: string, decimals: number): string {
  const digits = BigInt(units).toString().padStart(decimals + 1, '0');
  if (decimals === 0) return digits;
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}
const isScale = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/** Exact bigint decimal rendering of base units with no unit label: no float, no rounding, trailing fractional zeros trimmed. */
export function formatUnits(amountBaseUnits: string, decimals: number): DisplayResult<string> {
  if (typeof amountBaseUnits !== 'string' || !CANONICAL_UNSIGNED_WIDE.test(amountBaseUnits) || BigInt(amountBaseUnits) > U256_MAX) return bad('INVALID_AMOUNT');
  if (!isScale(decimals, MAX_DISPLAY_DECIMALS)) return bad('INVALID_DECIMALS');
  return ok(decimalString(amountBaseUnits, decimals));
}

/** Fiat minor units at a fixed scale, rendered with the three-letter currency code (never a symbol or locale). */
export function formatFiatMinor(minorUnits: string, scale: number, currency: string): DisplayResult<string> {
  if (typeof minorUnits !== 'string' || !CANONICAL_UNSIGNED.test(minorUnits)) return bad('INVALID_AMOUNT');
  if (!isScale(scale, MAX_FIAT_SCALE)) return bad('INVALID_DECIMALS');
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return bad('INVALID_CURRENCY');
  const digits = BigInt(minorUnits).toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  return ok(`${text} ${currency}`);
}

export type DeadlineState = { readonly kind: 'expired' } | { readonly kind: 'remaining'; readonly seconds: string };
export interface DeadlineDescription { readonly state: DeadlineState; readonly text: string; }
const U64_MAX = (1n << 64n) - 1n;
function unsignedTime(input: unknown): bigint | null {
  if (typeof input !== 'string' || !CANONICAL_UNSIGNED.test(input)) return null;
  const value = BigInt(input);
  return value > U64_MAX ? null : value;
}
function duration(total: bigint): string {
  const units: readonly (readonly [bigint, string])[] = [[86400n, 'd'], [3600n, 'h'], [60n, 'min'], [1n, 's']];
  const parts: string[] = [];
  let rest = total;
  for (const [size, label] of units) {
    const count = rest / size; rest %= size;
    if (count > 0n) parts.push(`${count} ${label}`);
  }
  return parts.length === 0 ? '0 s' : parts.join(' ');
}
/** Expiry is inclusive: now >= target is expired. `seconds` is a decimal string so u64 values stay exact. */
export function describeDeadline(targetSeconds: string, nowSeconds: string): DisplayResult<DeadlineDescription> {
  const target = unsignedTime(targetSeconds), now = unsignedTime(nowSeconds);
  if (target === null || now === null) return bad('INVALID_TIME');
  if (now >= target) return ok({ state: { kind: 'expired' }, text: 'Expired' });
  const remaining = target - now;
  return ok({ state: { kind: 'remaining', seconds: remaining.toString() }, text: `${duration(remaining)} remaining` });
}

export interface AddressDisplay {
  /** The exact input string, never shortened or altered. */
  readonly full: string;
  /** Lowercase hex without `0x`, split into 4-character chunks for reading only. */
  readonly groups: readonly string[];
  /** `0x` then chunks joined by single spaces; removing the spaces yields the lowercase address. */
  readonly grouped: string;
}
/** Full 20-byte EVM address. Never truncated or elided; grouping is a readability aid alongside the exact text. */
export function fullAddress(address: string): DisplayResult<AddressDisplay> {
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) return bad('INVALID_ADDRESS');
  const groups = address.slice(2).toLowerCase().match(/.{4}/g)!;
  return ok({ full: address, groups, grouped: `0x ${groups.join(' ')}` });
}
