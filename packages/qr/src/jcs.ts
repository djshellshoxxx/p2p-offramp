/**
 * RFC 8785 (JCS) canonical JSON for the value domain the QR envelope uses: plain objects, arrays, strings, safe
 * integers, booleans and null. Anything outside that domain is refused rather than approximated: non-integer or
 * unsafe numbers, -0, lone surrogates, non-plain objects, accessors, symbols, sparse or decorated arrays.
 *
 * Object members are sorted by their UTF-16 code units (RFC 8785 section 3.2.3). Strings use the ECMAScript
 * JSON.stringify escaping RFC 8785 adopts: \b \t \n \f \r short forms, other C0 controls as lowercase \u00xx, and
 * every other character literally. Integers in the safe range serialize exactly as their decimal digits.
 *
 * The parser is strict RFC 8259 with these additions: duplicate member names, numbers with a fraction or exponent,
 * unsafe integers, -0, lone surrogates (raw or escaped) and nesting beyond `maxDepth` are refused.
 */
import { decodeUtf8, encodeUtf8, isWellFormedString, Utf8Error } from './utf8.ts';

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JcsErrorCode =
  | 'INVALID_JSON' | 'DUPLICATE_KEY' | 'INVALID_UNICODE' | 'UNSUPPORTED_NUMBER' | 'UNSUPPORTED_VALUE'
  | 'DEPTH_EXCEEDED' | 'NON_CANONICAL' | 'TOO_LARGE';

export class JcsError extends Error {
  readonly code: JcsErrorCode;
  constructor(code: JcsErrorCode) { super(`Canonical JSON refused: ${code}.`); this.name = 'JcsError'; this.code = code; }
}
const fail = (code: JcsErrorCode): never => { throw new JcsError(code); };

export const DEFAULT_MAX_DEPTH = 32;

/** UTF-16 code-unit order, which is what the relational string operators compare. */
export const compareUtf16 = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function quote(value: string): string {
  let out = '"';
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit === 0x22) out += '\\"';
    else if (unit === 0x5c) out += '\\\\';
    else if (unit < 0x20) {
      switch (unit) {
        case 0x08: out += '\\b'; break;
        case 0x09: out += '\\t'; break;
        case 0x0a: out += '\\n'; break;
        case 0x0c: out += '\\f'; break;
        case 0x0d: out += '\\r'; break;
        default: out += `\\u00${unit.toString(16).padStart(2, '0')}`;
      }
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return fail('INVALID_UNICODE');
      out += value[index] as string; out += value[index + 1] as string; index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return fail('INVALID_UNICODE');
    else out += value[index] as string;
  }
  return `${out}"`;
}

function descriptorValue(target: object, key: string): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try { descriptor = Object.getOwnPropertyDescriptor(target, key); } catch { return fail('UNSUPPORTED_VALUE'); }
  if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) return fail('UNSUPPORTED_VALUE');
  return descriptor.value;
}

function ownKeys(target: object): (string | symbol)[] {
  try { return Reflect.ownKeys(target); } catch { return fail('UNSUPPORTED_VALUE'); }
}

function serialize(value: unknown, depth: number, maxDepth: number): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) return fail('UNSUPPORTED_NUMBER');
    return String(value);
  }
  if (typeof value === 'string') return quote(value);
  if (typeof value !== 'object') return fail('UNSUPPORTED_VALUE');
  if (depth >= maxDepth) return fail('DEPTH_EXCEEDED');
  let isArray: boolean, prototype: unknown;
  try { isArray = Array.isArray(value); prototype = Object.getPrototypeOf(value); } catch { return fail('UNSUPPORTED_VALUE'); }
  if (isArray) {
    if (prototype !== Array.prototype) return fail('UNSUPPORTED_VALUE');
    const lengthValue = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (typeof lengthValue !== 'number') return fail('UNSUPPORTED_VALUE');
    if (ownKeys(value).length !== lengthValue + 1) return fail('UNSUPPORTED_VALUE');
    const parts: string[] = [];
    for (let index = 0; index < lengthValue; index++) parts.push(serialize(descriptorValue(value, String(index)), depth + 1, maxDepth));
    return `[${parts.join(',')}]`;
  }
  if (prototype !== Object.prototype && prototype !== null) return fail('UNSUPPORTED_VALUE');
  const keys = ownKeys(value);
  const names: string[] = [];
  for (const key of keys) {
    if (typeof key !== 'string') return fail('UNSUPPORTED_VALUE');
    if (!isWellFormedString(key)) return fail('INVALID_UNICODE');
    names.push(key);
  }
  names.sort(compareUtf16);
  const parts: string[] = [];
  for (const name of names) parts.push(`${quote(name)}:${serialize(descriptorValue(value, name), depth + 1, maxDepth)}`);
  return `{${parts.join(',')}}`;
}

/** RFC 8785 canonical text. Throws JcsError for values outside the supported domain. */
export function canonicalize(value: unknown, maxDepth = DEFAULT_MAX_DEPTH): string {
  return serialize(value, 0, maxDepth);
}

/** RFC 8785 canonical UTF-8 bytes. */
export function canonicalBytes(value: unknown, maxDepth = DEFAULT_MAX_DEPTH): Uint8Array {
  return encodeUtf8(canonicalize(value, maxDepth));
}

const isDigit = (unit: number): boolean => unit >= 0x30 && unit <= 0x39;
const hexValue = (unit: number): number =>
  unit >= 0x30 && unit <= 0x39 ? unit - 0x30 : unit >= 0x61 && unit <= 0x66 ? unit - 0x57 : unit >= 0x41 && unit <= 0x46 ? unit - 0x37 : -1;

class StrictParser {
  readonly #text: string;
  readonly #maxDepth: number;
  #at = 0;
  constructor(text: string, maxDepth: number) { this.#text = text; this.#maxDepth = maxDepth; }

  parse(): JsonValue {
    this.#space();
    const value = this.#value(0);
    this.#space();
    if (this.#at !== this.#text.length) return fail('INVALID_JSON');
    return value;
  }
  #peek(): number { return this.#text.charCodeAt(this.#at); }
  #space(): void {
    for (;;) {
      const unit = this.#peek();
      if (unit === 0x20 || unit === 0x09 || unit === 0x0a || unit === 0x0d) this.#at++; else return;
    }
  }
  #literal(word: string): void {
    if (this.#text.startsWith(word, this.#at)) this.#at += word.length; else fail('INVALID_JSON');
  }
  #value(depth: number): JsonValue {
    const unit = this.#peek();
    if (unit === 0x7b) return this.#object(depth + 1);
    if (unit === 0x5b) return this.#array(depth + 1);
    if (unit === 0x22) return this.#string();
    if (unit === 0x74) { this.#literal('true'); return true; }
    if (unit === 0x66) { this.#literal('false'); return false; }
    if (unit === 0x6e) { this.#literal('null'); return null; }
    if (unit === 0x2d || isDigit(unit)) return this.#number();
    return fail('INVALID_JSON');
  }
  #object(depth: number): JsonValue {
    if (depth > this.#maxDepth) return fail('DEPTH_EXCEEDED');
    this.#at++;
    const out = Object.create(null) as Record<string, JsonValue>;
    const seen = new Set<string>();
    this.#space();
    if (this.#peek() === 0x7d) { this.#at++; return out; }
    for (;;) {
      this.#space();
      if (this.#peek() !== 0x22) return fail('INVALID_JSON');
      const key = this.#string();
      if (seen.has(key)) return fail('DUPLICATE_KEY');
      seen.add(key);
      this.#space();
      if (this.#peek() !== 0x3a) return fail('INVALID_JSON');
      this.#at++;
      this.#space();
      Object.defineProperty(out, key, { value: this.#value(depth), enumerable: true, writable: true, configurable: true });
      this.#space();
      const next = this.#peek();
      if (next === 0x2c) { this.#at++; continue; }
      if (next === 0x7d) { this.#at++; return out; }
      return fail('INVALID_JSON');
    }
  }
  #array(depth: number): JsonValue {
    if (depth > this.#maxDepth) return fail('DEPTH_EXCEEDED');
    this.#at++;
    const out: JsonValue[] = [];
    this.#space();
    if (this.#peek() === 0x5d) { this.#at++; return out; }
    for (;;) {
      this.#space();
      out.push(this.#value(depth));
      this.#space();
      const next = this.#peek();
      if (next === 0x2c) { this.#at++; continue; }
      if (next === 0x5d) { this.#at++; return out; }
      return fail('INVALID_JSON');
    }
  }
  #string(): string {
    this.#at++;
    const parts: string[] = [];
    let start = this.#at;
    for (;;) {
      if (this.#at >= this.#text.length) return fail('INVALID_JSON');
      const unit = this.#peek();
      if (unit === 0x22) { parts.push(this.#text.slice(start, this.#at)); this.#at++; break; }
      if (unit < 0x20) return fail('INVALID_JSON');
      if (unit !== 0x5c) { this.#at++; continue; }
      parts.push(this.#text.slice(start, this.#at));
      const escape = this.#text.charCodeAt(this.#at + 1);
      this.#at += 2;
      switch (escape) {
        case 0x22: parts.push('"'); break;
        case 0x5c: parts.push('\\'); break;
        case 0x2f: parts.push('/'); break;
        case 0x62: parts.push('\b'); break;
        case 0x66: parts.push('\f'); break;
        case 0x6e: parts.push('\n'); break;
        case 0x72: parts.push('\r'); break;
        case 0x74: parts.push('\t'); break;
        case 0x75: {
          let code = 0;
          for (let k = 0; k < 4; k++) {
            const digit = hexValue(this.#text.charCodeAt(this.#at + k));
            if (digit < 0) return fail('INVALID_JSON');
            code = code * 16 + digit;
          }
          this.#at += 4;
          parts.push(String.fromCharCode(code));
          break;
        }
        default: return fail('INVALID_JSON');
      }
      start = this.#at;
    }
    const value = parts.join('');
    if (!isWellFormedString(value)) return fail('INVALID_UNICODE');
    return value;
  }
  #number(): number {
    const start = this.#at;
    if (this.#peek() === 0x2d) this.#at++;
    const first = this.#peek();
    if (!isDigit(first)) return fail('INVALID_JSON');
    this.#at++;
    if (first !== 0x30) while (isDigit(this.#peek())) this.#at++;
    const next = this.#peek();
    if (next === 0x2e || next === 0x65 || next === 0x45) return fail('UNSUPPORTED_NUMBER');
    if (isDigit(next)) return fail('INVALID_JSON');
    const literal = this.#text.slice(start, this.#at);
    if (literal === '-0') return fail('UNSUPPORTED_NUMBER');
    const value = Number(literal);
    if (!Number.isSafeInteger(value)) return fail('UNSUPPORTED_NUMBER');
    return value;
  }
}

/** Strict JSON text parse. Objects come back with a null prototype so `__proto__` is an ordinary member. */
export function parseStrictJson(text: string, maxDepth = DEFAULT_MAX_DEPTH): JsonValue {
  if (typeof text !== 'string') return fail('INVALID_JSON');
  if (!isWellFormedString(text)) return fail('INVALID_UNICODE');
  return new StrictParser(text, maxDepth).parse();
}

export interface CanonicalParseOptions { readonly maxBytes: number; readonly maxDepth: number; }

/**
 * Bytes must be exactly the RFC 8785 canonical encoding of the value they hold. The byte cap is checked before UTF-8
 * decoding or parsing; afterwards the value is re-canonicalized and compared byte-for-byte, so whitespace, member
 * order, escape spelling and number spelling variants are all refused as NON_CANONICAL.
 */
export function parseCanonicalJsonBytes(bytes: Uint8Array, options: CanonicalParseOptions): JsonValue {
  if (!(bytes instanceof Uint8Array)) return fail('INVALID_JSON');
  if (bytes.length > options.maxBytes) return fail('TOO_LARGE');
  let text: string;
  try { text = decodeUtf8(bytes); } catch (error) { if (error instanceof Utf8Error) return fail('INVALID_UNICODE'); throw error; }
  const value = parseStrictJson(text, options.maxDepth);
  if (canonicalize(value, options.maxDepth) !== text) return fail('NON_CANONICAL');
  return value;
}
