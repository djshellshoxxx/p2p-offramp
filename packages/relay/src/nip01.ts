/**
 * NIP-01 wire shapes and strict, size-limited parsing for relay-to-client frames and events.
 * Nothing here performs cryptography: event id and signature checking is the injected EventCrypto
 * (packages/nostr-crypto). Structure and size limits are enforced BEFORE any signature work.
 */
export interface NostrEvent {
  readonly id: string; readonly pubkey: string; readonly created_at: number; readonly kind: number;
  readonly tags: readonly (readonly string[])[]; readonly content: string; readonly sig: string;
}
export interface UnsignedEvent { readonly kind: number; readonly created_at: number; readonly tags: readonly (readonly string[])[]; readonly content: string; }
/** Injected NIP-01 crypto. This package implements none of it. */
export interface EventCrypto {
  /** True only if id is the canonical NIP-01 hash of the other fields and sig is a valid BIP-340 signature by pubkey. */
  verifyEvent(event: NostrEvent): boolean;
  /** Signs with the key held by the signer; the returned event carries that key as pubkey. */
  signEvent(unsigned: UnsignedEvent): Promise<NostrEvent>;
}
export interface RelayFilter {
  readonly kinds: readonly number[]; readonly since: number; readonly limit: number;
  readonly authors?: readonly string[]; readonly '#d'?: readonly string[]; readonly '#t'?: readonly string[]; readonly '#k'?: readonly string[]; readonly '#a'?: readonly string[];
}
export const FRAME_LIMITS = Object.freeze({
  maxFrameBytes: 65_536, maxEventBytes: 65_536, maxTags: 64, maxTagItems: 8, maxTagItemBytes: 256,
  maxSubIdLength: 64, maxMessageLength: 512, maxFilterValues: 16,
});
export type RelayFrame =
  | { readonly type: 'EVENT'; readonly subId: string; readonly event: NostrEvent }
  | { readonly type: 'EOSE'; readonly subId: string }
  | { readonly type: 'OK'; readonly eventId: string; readonly accepted: boolean; readonly message: string }
  | { readonly type: 'NOTICE'; readonly message: string }
  | { readonly type: 'CLOSED'; readonly subId: string; readonly message: string };
export type FrameParse =
  | { readonly ok: true; readonly frame: RelayFrame }
  | { readonly ok: false; readonly reason: 'oversized' | 'malformed' | 'ignored' };
const HEX64 = /^[0-9a-f]{64}$/, HEX128 = /^[0-9a-f]{128}$/;
const encoder = new TextEncoder();
export const isHex64 = (value: unknown): value is string => typeof value === 'string' && HEX64.test(value);
/** Byte cap check that avoids encoding strings whose size is decided by length alone. */
export function withinBytes(value: string, max: number): boolean {
  if (value.length > max) return false;
  if (value.length * 3 <= max) return true;
  return encoder.encode(value).byteLength <= max;
}
const isSubId = (value: unknown): value is string => typeof value === 'string' && /^[\x21-\x7e]{1,64}$/.test(value);
const isMessage = (value: unknown): value is string => typeof value === 'string' && value.length <= FRAME_LIMITS.maxMessageLength;

export function parseEvent(input: unknown): NostrEvent | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 7 || !['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig'].every(key => keys.includes(key))) return null;
  const { id, pubkey, created_at, kind, tags, content, sig } = input as Record<string, unknown>;
  if (!isHex64(id) || !isHex64(pubkey) || typeof sig !== 'string' || !HEX128.test(sig)) return null;
  if (typeof created_at !== 'number' || !Number.isSafeInteger(created_at) || created_at < 0 || created_at > 0xffffffff) return null;
  if (typeof kind !== 'number' || !Number.isSafeInteger(kind) || kind < 0 || kind > 65_535) return null;
  if (typeof content !== 'string' || !withinBytes(content, FRAME_LIMITS.maxEventBytes)) return null;
  if (!Array.isArray(tags) || tags.length > FRAME_LIMITS.maxTags) return null;
  const outTags: string[][] = [];
  for (const tag of tags as unknown[]) {
    if (!Array.isArray(tag) || tag.length < 1 || tag.length > FRAME_LIMITS.maxTagItems) return null;
    const items: string[] = [];
    for (const item of tag as unknown[]) {
      if (typeof item !== 'string' || !withinBytes(item, FRAME_LIMITS.maxTagItemBytes)) return null;
      items.push(item);
    }
    outTags.push(items);
  }
  return Object.freeze({ id, pubkey, created_at, kind, tags: Object.freeze(outTags.map(tag => Object.freeze(tag))), content, sig });
}

export function parseRelayFrame(text: unknown): FrameParse {
  if (typeof text !== 'string') return { ok: false, reason: 'malformed' };
  if (!withinBytes(text, FRAME_LIMITS.maxFrameBytes)) return { ok: false, reason: 'oversized' };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { ok: false, reason: 'malformed' }; }
  if (!Array.isArray(value) || typeof value[0] !== 'string') return { ok: false, reason: 'malformed' };
  const bad = { ok: false, reason: 'malformed' } as const;
  switch (value[0]) {
    case 'EVENT': {
      if (value.length !== 3 || !isSubId(value[1])) return bad;
      const event = parseEvent(value[2]); if (event === null) return bad;
      return { ok: true, frame: Object.freeze({ type: 'EVENT', subId: value[1], event }) };
    }
    case 'EOSE':
      return value.length === 2 && isSubId(value[1]) ? { ok: true, frame: Object.freeze({ type: 'EOSE', subId: value[1] }) } : bad;
    case 'OK':
      return value.length === 4 && isHex64(value[1]) && typeof value[2] === 'boolean' && isMessage(value[3])
        ? { ok: true, frame: Object.freeze({ type: 'OK', eventId: value[1], accepted: value[2], message: value[3] }) } : bad;
    case 'NOTICE':
      return value.length === 2 && isMessage(value[1]) ? { ok: true, frame: Object.freeze({ type: 'NOTICE', message: value[1] }) } : bad;
    case 'CLOSED':
      return value.length === 3 && isSubId(value[1]) && isMessage(value[2])
        ? { ok: true, frame: Object.freeze({ type: 'CLOSED', subId: value[1], message: value[2] }) } : bad;
    case 'AUTH': case 'COUNT': return { ok: false, reason: 'ignored' }; // NIP-42/45 are not implemented; never answered.
    default: return bad;
  }
}
export const encodeReq = (subId: string, filters: readonly RelayFilter[]): string => JSON.stringify(['REQ', subId, ...filters]);
export const encodeClose = (subId: string): string => JSON.stringify(['CLOSE', subId]);
export const encodeEvent = (event: NostrEvent): string => JSON.stringify(['EVENT', event]);

/** Does `event` satisfy at least one filter? Used to reject events a relay sends outside what was asked. */
export function matchesFilters(event: NostrEvent, filters: readonly RelayFilter[]): boolean {
  return filters.some(filter => {
    if (!filter.kinds.includes(event.kind) || event.created_at < filter.since) return false;
    if (filter.authors !== undefined && !filter.authors.includes(event.pubkey)) return false;
    for (const name of ['d', 't', 'k', 'a'] as const) {
      const wanted = filter[`#${name}`];
      if (wanted !== undefined && !event.tags.some(tag => tag[0] === name && tag[1] !== undefined && wanted.includes(tag[1]))) return false;
    }
    return true;
  });
}
