/**
 * NIP-01 events: canonical serialization, id hashing, BIP340 signing/verification through the provider, and strict
 * bounded parsing of untrusted events. Kind 4 (NIP-04) is rejected everywhere.
 *
 * Canonical form: JSON.stringify([0, pubkey, created_at, kind, tags, content]). Strings that JSON.stringify would
 * escape differently from NIP-01 (control characters other than \b \t \n \f \r, and lone surrogates) are rejected,
 * so this serialization is exactly the NIP-01 one for every accepted event.
 */
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, fail, hexToBytes, isLowerHex, utf8Encode } from './bytes.ts';
import type { NostrMessagingProvider } from './provider.ts';

export const KIND_NIP04_DM = 4;
export const MAX_TIMESTAMP = 0xffff_ffff;
export interface NostrEvent { readonly id: string; readonly pubkey: string; readonly created_at: number; readonly kind: number; readonly tags: readonly (readonly string[])[]; readonly content: string; readonly sig: string; }
/** A rumor: an event with an id but no signature (NIP-59). */
export type UnsignedEvent = Omit<NostrEvent, 'sig'>;
export interface EventTemplate { readonly created_at: number; readonly kind: number; readonly tags: readonly (readonly string[])[]; readonly content: string; }
export interface EventLimits {
  readonly maxContentBytes: number; readonly maxTags: number; readonly maxTagItems: number; readonly maxTagItemBytes: number;
  readonly maxJsonBytes: number; readonly allowedKinds?: readonly number[];
}
export const DEFAULT_EVENT_LIMITS: EventLimits = Object.freeze({ maxContentBytes: 131_072, maxTags: 64, maxTagItems: 8, maxTagItemBytes: 1024, maxJsonBytes: 262_144 });

const FORBIDDEN_CHARACTERS = /[\u0000-\u0007\u000b\u000e-\u001f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function safeString(input: unknown, maxBytes: number): string {
  if (typeof input !== 'string') return fail();
  if (input.length > maxBytes || utf8Encode(input).byteLength > maxBytes) return fail('LIMIT_EXCEEDED');
  if (FORBIDDEN_CHARACTERS.test(input)) return fail();
  return input;
}
function integer(input: unknown, max: number): number { if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || input > max) return fail(); return input; }
function kind(input: unknown, limits: EventLimits): number {
  const value = integer(input, 65_535);
  if (value === KIND_NIP04_DM) return fail('UNSUPPORTED_VERSION');
  if (limits.allowedKinds && !limits.allowedKinds.includes(value)) return fail();
  return value;
}
/** Exact own data properties of a plain object or array; getters, prototypes and extra keys are rejected. */
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return fail();
  const own = Reflect.ownKeys(input);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return fail();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(input, key); if (!descriptor || !('value' in descriptor)) return fail(); out[key] = descriptor.value; }
  return out;
}
function array(input: unknown, max: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
  const length = Object.getOwnPropertyDescriptor(input, 'length')?.value as unknown;
  if (typeof length !== 'number' || length > max || Reflect.ownKeys(input).length !== length + 1) return fail('LIMIT_EXCEEDED');
  return Array.from({ length }, (_, index) => { const descriptor = Object.getOwnPropertyDescriptor(input, String(index)); if (!descriptor || !('value' in descriptor)) return fail(); return descriptor.value; });
}
function tags(input: unknown, limits: EventLimits): readonly (readonly string[])[] {
  return Object.freeze(array(input, limits.maxTags).map(tag => {
    const items = array(tag, limits.maxTagItems);
    if (items.length === 0) return fail();
    return Object.freeze(items.map(item => safeString(item, limits.maxTagItemBytes)));
  }));
}
function template(input: Record<string, unknown>, limits: EventLimits): EventTemplate {
  return { created_at: integer(input.created_at, MAX_TIMESTAMP), kind: kind(input.kind, limits), tags: tags(input.tags, limits), content: safeString(input.content, limits.maxContentBytes) };
}

export function serializeEvent(pubkey: string, event: EventTemplate): string {
  if (!isLowerHex(pubkey, 32)) return fail();
  return JSON.stringify([0, pubkey, event.created_at, event.kind, event.tags, event.content]);
}
export function computeEventId(pubkey: string, event: EventTemplate): string { return bytesToHex(sha256(utf8Encode(serializeEvent(pubkey, event)))); }

/** Validate a template, derive the author key from the secret, hash and sign. The returned event is frozen. */
export async function signEvent(input: EventTemplate, secretKey: Uint8Array, provider: NostrMessagingProvider, limits: EventLimits = DEFAULT_EVENT_LIMITS): Promise<NostrEvent> {
  const event = template(record({ ...input }, ['created_at', 'kind', 'tags', 'content']), limits);
  const pubkey = await provider.publicKey(secretKey);
  const id = computeEventId(pubkey, event);
  const sig = bytesToHex(await provider.signSchnorr(hexToBytes(id, 32), secretKey));
  if (!(await provider.verifySchnorr(hexToBytes(sig, 64), hexToBytes(id, 32), hexToBytes(pubkey, 32)))) return fail('INTEGRITY_FAILURE');
  return Object.freeze({ id, pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags, content: event.content, sig });
}
/** Create a rumor (unsigned event with id). NIP-59: rumors are never signed. */
export function createUnsignedEvent(pubkey: string, input: EventTemplate, limits: EventLimits = DEFAULT_EVENT_LIMITS): UnsignedEvent {
  const event = template(record({ ...input }, ['created_at', 'kind', 'tags', 'content']), limits);
  return Object.freeze({ id: computeEventId(pubkey, event), pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags, content: event.content });
}

/** Exact keys, bounds and id recomputation of an untrusted signed event; the signature is not checked here. */
function parseSignedUnverified(input: unknown, limits: EventLimits): NostrEvent {
  const raw = record(input, ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig']);
  if (!isLowerHex(raw.id, 32) || !isLowerHex(raw.pubkey, 32) || !isLowerHex(raw.sig, 64)) return fail();
  const event = template(raw, limits);
  if (computeEventId(raw.pubkey, event) !== raw.id) return fail('INTEGRITY_FAILURE');
  return Object.freeze({ id: raw.id, pubkey: raw.pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags, content: event.content, sig: raw.sig });
}
/** Strict parse of an untrusted signed event: exact keys, bounds, id recomputation, then BIP340 verification. */
export async function verifyEvent(input: unknown, provider: NostrMessagingProvider, limits: EventLimits = DEFAULT_EVENT_LIMITS): Promise<NostrEvent> {
  const event = parseSignedUnverified(input, limits);
  if (!(await provider.verifySchnorr(hexToBytes(event.sig, 64), hexToBytes(event.id, 32), hexToBytes(event.pubkey, 32)))) return fail('INTEGRITY_FAILURE');
  return event;
}
/**
 * Synchronous form of verifyEvent for callers that must not yield between checks (the relay pool dedupes, filters,
 * verifies and delivers in one turn). Same parse; BIP340 verification uses the pinned @noble/curves 2.4.0 directly,
 * the primitive the local provider wraps. Verification needs only public data, so no provider key is involved.
 */
export function verifyEventSync(input: unknown, limits: EventLimits = DEFAULT_EVENT_LIMITS): NostrEvent {
  const event = parseSignedUnverified(input, limits);
  let valid = false;
  try { valid = schnorr.verify(hexToBytes(event.sig, 64), hexToBytes(event.id, 32), hexToBytes(event.pubkey, 32)) === true; } catch { valid = false; }
  if (!valid) return fail('INTEGRITY_FAILURE');
  return event;
}
/** Strict parse of an untrusted rumor: exact keys (a `sig` key is rejected), bounds and id recomputation. */
export function parseUnsignedEvent(input: unknown, limits: EventLimits = DEFAULT_EVENT_LIMITS): UnsignedEvent {
  const raw = record(input, ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content']);
  if (!isLowerHex(raw.id, 32) || !isLowerHex(raw.pubkey, 32)) return fail();
  const event = template(raw, limits);
  if (computeEventId(raw.pubkey, event) !== raw.id) return fail('INTEGRITY_FAILURE');
  return Object.freeze({ id: raw.id, pubkey: raw.pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags, content: event.content });
}

/**
 * Bounded strict JSON parser for untrusted event text: RFC 8259 grammar, duplicate object keys rejected (JSON.parse
 * silently keeps the last one), nesting depth limited, result built from null-prototype-free plain values.
 */
export function parseEventJson(text: unknown, maxBytes: number = DEFAULT_EVENT_LIMITS.maxJsonBytes, maxDepth = 4): unknown {
  if (typeof text !== 'string' || text.length > maxBytes || utf8Encode(text).byteLength > maxBytes) return fail('LIMIT_EXCEEDED');
  let index = 0, nodes = 0;
  const space = (): void => { while (index < text.length && (text[index] === ' ' || text[index] === '\t' || text[index] === '\n' || text[index] === '\r')) index++; };
  const string = (): string => {
    const start = index++;
    for (;;) {
      const character = text[index];
      if (character === undefined || character < ' ') return fail();
      if (character === '"') break;
      if (character === '\\') {
        const escape = text[index + 1];
        if (escape === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6))) return fail(); index += 6; continue; }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) return fail();
        index += 2; continue;
      }
      index++;
    }
    index++;
    return JSON.parse(text.slice(start, index)) as string;
  };
  const value = (depth: number): unknown => {
    if (++nodes > 4096) return fail('LIMIT_EXCEEDED');
    space();
    const character = text[index];
    if (character === '{' || character === '[') {
      if (depth >= maxDepth) return fail('LIMIT_EXCEEDED');
      index++; space();
      if (character === '[') {
        const out: unknown[] = [];
        if (text[index] === ']') { index++; return out; }
        for (;;) { out.push(value(depth + 1)); space(); if (text[index] === ',') { index++; continue; } if (text[index] === ']') { index++; return out; } return fail(); }
      }
      const out: Record<string, unknown> = {}; const seen = new Set<string>();
      if (text[index] === '}') { index++; return out; }
      for (;;) {
        space(); if (text[index] !== '"') return fail();
        const key = string(); if (seen.has(key) || key === '__proto__') return fail(); seen.add(key);
        space(); if (text[index] !== ':') return fail(); index++;
        Object.defineProperty(out, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
        space(); if (text[index] === ',') { index++; continue; } if (text[index] === '}') { index++; return out; } return fail();
      }
    }
    if (character === '"') return string();
    const literal = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(index, index + 32));
    if (!literal) return fail();
    index += literal[0].length;
    return JSON.parse(literal[0]) as unknown;
  };
  const result = value(0); space();
  if (index !== text.length) return fail();
  return result;
}
