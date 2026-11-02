/** Local-only bounded data discipline. No network, wallet, device or settlement authority. */
import {
  parseStrictJsonBytes,
  parseTradeBinding,
  sameBinding,
  type TradeBinding,
} from "../../schemas/index.ts";
export type CourierCode =
  | "MALFORMED"
  | "UNSUPPORTED_PROFILE"
  | "UNAUTHORIZED"
  | "STALE_REVISION"
  | "EXPIRED"
  | "MISSING_DEPENDENCY"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "LIMIT_EXCEEDED"
  | "LOCKED"
  | "CANCELLED"
  | "UNKNOWN_OUTCOME"
  | "DEVICE_FAULT"
  | "CLOCK_UNCERTAIN";
export type CourierResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: CourierCode; retryable: false }>;
const errors = new WeakMap<object, CourierCode>();
class Refused extends Error {
  constructor(code: CourierCode) {
    super("Courier model operation refused.");
    errors.set(this, code);
  }
}
export const stop = (code: CourierCode = "MALFORMED"): never => {
  throw new Refused(code);
};
export const failure = (code: CourierCode): CourierResult<never> =>
  Object.freeze({ ok: false, code, retryable: false });
export const success = <T>(value: T): CourierResult<T> =>
  Object.freeze({ ok: true, value });
export const codeOf = (error: unknown): CourierCode =>
  typeof error === "object" && error !== null
    ? (errors.get(error) ?? "MALFORMED")
    : "MALFORMED";
export function result<T>(work: () => T): CourierResult<T> {
  try {
    return success(work());
  } catch (error) {
    return failure(codeOf(error));
  }
}
export async function asyncResult<T>(
  work: () => Promise<T>,
): Promise<CourierResult<T>> {
  try {
    return success(await work());
  } catch (error) {
    return failure(codeOf(error));
  }
}
export function data(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    return stop();
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length ||
    keys.some((k) => typeof k !== "string" || !fields.includes(k))
  )
    return stop();
  const out: Record<string, unknown> = Object.create(null);
  for (const key of fields) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d || !d.enumerable || !("value" in d)) return stop();
    out[key] = d.value;
  }
  return out;
}
export function list(input: unknown, max: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype)
    return stop();
  const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0) return stop();
  if (length > max) return stop("LIMIT_EXCEEDED");
  if (Reflect.ownKeys(input).length !== length + 1) return stop();
  return Array.from({ length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !d.enumerable || !("value" in d)) return stop();
    return d.value;
  });
}
const invalidText =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u;
export function text(input: unknown, max = 128): string {
  if (
    typeof input !== "string" ||
    !input.length ||
    input.length > max ||
    invalidText.test(input) ||
    new TextEncoder().encode(input).length > max
  )
    return stop();
  return input;
}
export const hex = (input: unknown): string =>
  typeof input === "string" && /^[0-9a-f]{64}$/.test(input) ? input : stop();
export const integer = (
  input: unknown,
  max = Number.MAX_SAFE_INTEGER,
): number =>
  typeof input === "number" &&
  Number.isSafeInteger(input) &&
  input >= 0 &&
  input <= max
    ? input
    : stop();
export const bool = (input: unknown): boolean =>
  typeof input === "boolean" ? input : stop();
export const choice = <T extends string>(
  input: unknown,
  values: readonly T[],
): T =>
  typeof input === "string" && values.includes(input as T)
    ? (input as T)
    : stop();
export const optional =
  <T>(parse: (input: unknown) => T) =>
  (input: unknown): T | null =>
    input === null ? null : parse(input);
export const units = (input: unknown): string =>
  typeof input === "string" && /^(0|[1-9][0-9]{0,77})$/.test(input)
    ? input
    : stop();
export const uint = (input: unknown): bigint => BigInt(units(input));
export const bounded = (input: bigint): bigint =>
  input >= 0n && input < 10n ** 78n ? input : stop("LIMIT_EXCEEDED");
export const add = (a: bigint, b: bigint): bigint => bounded(a + b);
export const subtract = (a: bigint, b: bigint): bigint =>
  a >= b ? a - b : stop("CONFLICT");
export const increment = (n: number): number =>
  n < Number.MAX_SAFE_INTEGER ? n + 1 : stop("LIMIT_EXCEEDED");
export function unique<T>(
  items: readonly T[],
  key: (item: T) => string = String,
): readonly T[] {
  if (new Set(items.map(key)).size !== items.length) return stop();
  return Object.freeze([...items]);
}
export function binding(input: unknown): TradeBinding {
  try {
    return parseTradeBinding(input);
  } catch {
    return stop();
  }
}
export { sameBinding };
export type { TradeBinding };
export const MAX_PAYLOAD_BYTES = 16 * 1024;
export function decode(bytes: Uint8Array): unknown {
  try {
    return parseStrictJsonBytes(bytes, MAX_PAYLOAD_BYTES);
  } catch {
    return stop();
  }
}
/** RFC8785 safe subset: plain finite JSON, safe integers only, exact UTF-8 strings and lexical object keys.
 * Inputs are already detached by the fixed record parsers; arbitrary JSON/accessors are not serialized. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    integer(value);
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (invalidText.test(value)) return stop();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return stop();
}
export function bytesOf(value: unknown): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(canonical(value));
  if (bytes.length > MAX_PAYLOAD_BYTES) return stop("LIMIT_EXCEEDED");
  return bytes;
}
export const local = <T extends object>(
  value: T,
): Readonly<
  T & {
    localModelOnly: true;
    physicalContentsVerified: false;
    economicAuthority: false;
  }
> =>
  Object.freeze({
    ...value,
    localModelOnly: true,
    physicalContentsVerified: false,
    economicAuthority: false,
  });
