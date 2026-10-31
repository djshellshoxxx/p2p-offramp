/**
 * G19 public order advertisements.
 *
 * Profile v1: Nostr kind 30078 (NIP-78 application-specific data; parameterized replaceable, 30000-range), tags exactly
 *   ["d","p2p-offramp:v1:<orderId>"], ["t","p2p-offramp-ad-v1"], ["expiration","<unix seconds>"] (NIP-40).
 * Content is a PublicAdV1 JSON object with public metadata only. No bank, reference, location, price or terms digest:
 * detailed terms travel later in NIP-17/44/59 encrypted messages (spec-encrypted-order-envelope).
 *
 * Authority: an ad is an unauthenticated discovery claim by its author key. Nothing here yields a TradeBinding,
 * chain observation or funding permission (G08); every output is labelled `authority: 'relay-discovery-only'`.
 * Cancellation (NIP-09 kind 5) is best effort: relays and observers may keep or replay the ad.
 */
import { isHex64, parseEvent, withinBytes, type EventCrypto, type NostrEvent } from './nip01.ts';

export const AD_KIND = 30078;
export const DELETION_KIND = 5;
export const AD_D_PREFIX = 'p2p-offramp:v1:';
export const AD_TOPIC = 'p2p-offramp-ad-v1';
export const MAX_AD_LIFETIME_SECONDS = 3600;
export const MAX_AD_CONTENT_BYTES = 2048;
export const MAX_FUTURE_SKEW_SECONDS = 120;
export const MAX_REVISION = 1_000_000;
export const MAX_RETAINED_ORDERS = 1000;
export const MAX_TOMBSTONES = 1000;
export const RAIL_CLASSES = Object.freeze(['bank-transfer', 'instant-bank', 'card', 'cash', 'mobile-money', 'other'] as const);
export type RailClass = typeof RAIL_CLASSES[number];

export interface PublicAdV1 {
  readonly app: 'p2p-offramp'; readonly v: 1; readonly orderId: string; readonly revision: number;
  readonly networkId: string; readonly assetId: string;
  /** Inclusive range in asset base units, decimal strings (never floats). */
  readonly amountMin: string; readonly amountMax: string;
  readonly currency: string; readonly railClass: RailClass;
  readonly expiresAtSeconds: string;
  /** Seller messaging pubkey (x-only hex) to which encrypted negotiation is addressed. Not an identity proof. */
  readonly maker: string;
}
export type AdRejection = 'INVALID' | 'EXPIRED' | 'FUTURE' | 'LIFETIME';
export interface VerifiedAd {
  readonly authority: 'relay-discovery-only';
  readonly key: string; readonly eventId: string; readonly author: string; readonly createdAt: number; readonly ad: PublicAdV1;
}
const DECIMAL = /^[1-9][0-9]{0,38}$/, SECONDS = /^[1-9][0-9]{0,11}$/;
const AD_KEYS = ['app', 'v', 'orderId', 'revision', 'networkId', 'assetId', 'amountMin', 'amountMax', 'currency', 'railClass', 'expiresAtSeconds', 'maker'];

export function adKey(author: string, orderId: string): string { return `${author}:${AD_D_PREFIX}${orderId}`; }

/** Strict content parser. Returns null for any deviation (unknown keys, wrong types, bad ranges). */
export function parseAdContent(text: string): PublicAdV1 | null {
  if (!withinBytes(text, MAX_AD_CONTENT_BYTES)) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== AD_KEYS.length || !AD_KEYS.every(key => keys.includes(key))) return null;
  const o = raw as Record<string, unknown>;
  if (o.app !== 'p2p-offramp' || o.v !== 1 || !isHex64(o.orderId) || !isHex64(o.maker)) return null;
  if (typeof o.revision !== 'number' || !Number.isSafeInteger(o.revision) || o.revision < 1 || o.revision > MAX_REVISION) return null;
  if (typeof o.networkId !== 'string' || !/^[a-z0-9:_-]{1,64}$/.test(o.networkId)) return null;
  if (typeof o.assetId !== 'string' || !/^[A-Za-z0-9:._-]{1,128}$/.test(o.assetId)) return null;
  if (typeof o.amountMin !== 'string' || typeof o.amountMax !== 'string' || !DECIMAL.test(o.amountMin) || !DECIMAL.test(o.amountMax)) return null;
  if (BigInt(o.amountMin) > BigInt(o.amountMax)) return null;
  if (typeof o.currency !== 'string' || !/^[A-Z]{3}$/.test(o.currency)) return null;
  if (typeof o.railClass !== 'string' || !(RAIL_CLASSES as readonly string[]).includes(o.railClass)) return null;
  if (typeof o.expiresAtSeconds !== 'string' || !SECONDS.test(o.expiresAtSeconds)) return null;
  return Object.freeze({ app: 'p2p-offramp', v: 1, orderId: o.orderId, revision: o.revision, networkId: o.networkId, assetId: o.assetId,
    amountMin: o.amountMin, amountMax: o.amountMax, currency: o.currency, railClass: o.railClass as RailClass, expiresAtSeconds: o.expiresAtSeconds, maker: o.maker });
}
/** Canonical serialization (fixed key order) so what a user previews is exactly what is signed. */
export function serializeAd(ad: PublicAdV1): string {
  return JSON.stringify(Object.fromEntries(AD_KEYS.map(key => [key, (ad as unknown as Record<string, unknown>)[key]])));
}
export function adTags(ad: PublicAdV1): string[][] {
  return [['d', AD_D_PREFIX + ad.orderId], ['t', AD_TOPIC], ['expiration', ad.expiresAtSeconds]];
}
/** Snapshot injected object values without executing accessors. Foreign reflection traps are invalid input. */
function ownData(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return null;
    const own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}
function dataArray(input: unknown, length: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype ||
        Object.getOwnPropertyDescriptor(input, 'length')?.value !== length || Reflect.ownKeys(input).length !== length + 1) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !('value' in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch { return null; }
}
/** Build and sign an advertisement. Capture public fields before awaits and bind the maker to the actual signer. */
export async function createAdEvent(crypto: Pick<EventCrypto, 'signEvent'>, ad: PublicAdV1, createdAt: number): Promise<NostrEvent> {
  const fields = ownData(ad, AD_KEYS);
  if (fields === null || Object.values(fields).some(value => typeof value !== 'string' && typeof value !== 'number')) throw new Error('INVALID_AD');
  const content = serializeAd(fields as unknown as PublicAdV1);
  const captured = parseAdContent(content);
  if (captured === null) throw new Error('INVALID_AD');
  const expires = Number(captured.expiresAtSeconds);
  if (!Number.isSafeInteger(createdAt) || expires <= createdAt || expires - createdAt > MAX_AD_LIFETIME_SECONDS) throw new Error('INVALID_AD');
  const signed = await crypto.signEvent({ kind: AD_KIND, created_at: createdAt, tags: adTags(captured), content });
  const raw = ownData(signed, ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig']);
  const tags = dataArray(raw?.tags, 3)?.map(tag => dataArray(tag, 2));
  const parsed = raw === null || !tags || tags.some(tag => tag === null) ? null : parseEvent({ ...raw, tags });
  if (parsed === null || parsed.pubkey !== captured.maker || parsed.content !== content || parsed.kind !== AD_KIND ||
      parsed.created_at !== createdAt || JSON.stringify(parsed.tags) !== JSON.stringify(adTags(captured))) throw new Error('INVALID_AD');
  return parsed;
}
/**
 * NIP-09 deletion request for one order. Best effort only: relays MAY ignore it, other observers may already hold or
 * replay the ad, and it never retracts data. The receiver-side order book also honours it only for the same author.
 */
export async function createDeletionEvent(crypto: Pick<EventCrypto, 'signEvent'>, author: string, orderId: string, createdAt: number): Promise<NostrEvent> {
  if (!isHex64(author) || !isHex64(orderId)) throw new Error('INVALID_AD');
  return crypto.signEvent({ kind: DELETION_KIND, created_at: createdAt, tags: [['a', `${AD_KIND}:${author}:${AD_D_PREFIX}${orderId}`], ['k', String(AD_KIND)]], content: '' });
}
/**
 * Structural, time and semantic validation of an advertisement event. Signature/id verification is the caller's job and
 * happens first (the pool verifies every delivered event; the order book re-verifies when given a verifier).
 */
export function validateAdEvent(event: NostrEvent, nowSeconds: number): { ok: true; value: VerifiedAd } | { ok: false; reason: AdRejection } {
  const bad = (reason: AdRejection) => ({ ok: false, reason }) as const;
  if (event.kind !== AD_KIND || event.tags.length !== 3) return bad('INVALID');
  const [d, t, x] = event.tags;
  if (d?.length !== 2 || t?.length !== 2 || x?.length !== 2 || d[0] !== 'd' || t[0] !== 't' || x[0] !== 'expiration' || t[1] !== AD_TOPIC) return bad('INVALID');
  const ad = parseAdContent(event.content);
  if (ad === null || ad.maker !== event.pubkey || d[1] !== AD_D_PREFIX + ad.orderId || x[1] !== ad.expiresAtSeconds) return bad('INVALID');
  const expires = Number(ad.expiresAtSeconds);
  if (expires <= event.created_at || expires - event.created_at > MAX_AD_LIFETIME_SECONDS) return bad('LIFETIME');
  if (event.created_at > nowSeconds + MAX_FUTURE_SKEW_SECONDS) return bad('FUTURE');
  if (nowSeconds >= expires) return bad('EXPIRED');
  return { ok: true, value: Object.freeze({ authority: 'relay-discovery-only', key: adKey(event.pubkey, ad.orderId), eventId: event.id, author: event.pubkey, createdAt: event.created_at, ad }) };
}
/** Parse a deletion request; returns the targeted ad key and its created_at bound, or null. Only same-author targets count. */
export function parseDeletion(event: NostrEvent): { key: string; createdAt: number } | null {
  if (event.kind !== DELETION_KIND || event.content.length > 256) return null;
  const targets = event.tags.filter(tag => tag[0] === 'a');
  if (targets.length !== 1) return null;
  const match = /^30078:([0-9a-f]{64}):p2p-offramp:v1:([0-9a-f]{64})$/.exec(targets[0]?.[1] ?? '');
  if (match === null || match[1] !== event.pubkey) return null;
  return { key: adKey(match[1] as string, match[2] as string), createdAt: event.created_at };
}

export type IngestResult = 'accepted' | 'replaced' | 'duplicate' | 'stale-revision' | 'conflict' | 'deleted' | 'invalid' | 'expired' | 'clock-unknown';
export type RevalidateResult =
  | { readonly ok: true; readonly ad: VerifiedAd }
  | { readonly ok: false; readonly reason: 'unknown' | 'clock-unknown' | 'expired' | 'conflict' | 'deleted' };
export interface OrderBookOptions {
  /** Trusted configured clock in unix seconds; null means freshness is unknown and nothing is actionable. */
  readonly nowSeconds: () => number | null;
  /** Optional: re-verify id/signature on ingest (defence in depth; the pool already verifies). */
  readonly verifier?: Pick<EventCrypto, 'verifyEvent'>;
  readonly maxOrders?: number;
}
interface Entry { current: VerifiedAd; conflicting: Set<string>; }
export interface OrderBook {
  ingest(event: unknown): IngestResult;
  /** Re-run expiry/conflict/deletion checks. MUST be called immediately before any negotiation step. */
  revalidate(key: string): RevalidateResult;
  /** Actionable ads, deterministic order: amountMin ascending, ties by event id. */
  list(): readonly VerifiedAd[];
  readonly size: number;
}
export function createOrderBook(options: OrderBookOptions): OrderBook {
  const maxOrders = options.maxOrders ?? MAX_RETAINED_ORDERS;
  const entries = new Map<string, Entry>();
  const tombstones = new Map<string, number>();
  const now = (): number | null => { try { const v = options.nowSeconds(); return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null; } catch { return null; } };
  const sweep = (t: number): void => { for (const [key, e] of entries) if (t >= Number(e.current.ad.expiresAtSeconds)) entries.delete(key); };
  const evict = (): void => {
    let victim: string | undefined, soonest = Infinity;
    for (const [key, e] of entries) { const x = Number(e.current.ad.expiresAtSeconds); if (x < soonest) { soonest = x; victim = key; } }
    if (victim !== undefined) entries.delete(victim);
  };
  function ingestDeletion(event: NostrEvent): IngestResult {
    const target = parseDeletion(event); if (target === null) return 'invalid';
    const prior = tombstones.get(target.key);
    if (prior === undefined || target.createdAt > prior) {
      tombstones.delete(target.key); tombstones.set(target.key, target.createdAt);
      if (tombstones.size > MAX_TOMBSTONES) tombstones.delete(tombstones.keys().next().value as string);
    }
    const entry = entries.get(target.key);
    if (entry && entry.current.createdAt <= target.createdAt) entries.delete(target.key);
    return 'accepted';
  }
  return {
    get size() { return entries.size; },
    ingest(input) {
      const event = parseEvent(input); if (event === null) return 'invalid';
      const t = now(); if (t === null) return 'clock-unknown';
      if (options.verifier) { try { if (options.verifier.verifyEvent(event) !== true) return 'invalid'; } catch { return 'invalid'; } }
      if (event.kind === DELETION_KIND) return ingestDeletion(event);
      const checked = validateAdEvent(event, t);
      if (!checked.ok) return checked.reason === 'EXPIRED' ? 'expired' : 'invalid';
      const ad = checked.value;
      const tomb = tombstones.get(ad.key);
      if (tomb !== undefined && ad.createdAt <= tomb) return 'deleted';
      sweep(t);
      const existing = entries.get(ad.key);
      if (existing) {
        const rev = existing.current.ad.revision;
        if (ad.ad.revision < rev) return 'stale-revision';
        if (ad.ad.revision === rev) {
          if (ad.eventId === existing.current.eventId || existing.conflicting.has(ad.eventId)) return 'duplicate';
          if (existing.conflicting.size < 8) existing.conflicting.add(ad.eventId);
          return 'conflict';
        }
        entries.set(ad.key, { current: ad, conflicting: new Set() });
        return 'replaced';
      }
      if (entries.size >= maxOrders) evict();
      entries.set(ad.key, { current: ad, conflicting: new Set() });
      return 'accepted';
    },
    revalidate(key) {
      const t = now(); if (t === null) return { ok: false, reason: 'clock-unknown' };
      const entry = entries.get(key); if (!entry) return { ok: false, reason: 'unknown' };
      const tomb = tombstones.get(key);
      if (tomb !== undefined && entry.current.createdAt <= tomb) { entries.delete(key); return { ok: false, reason: 'deleted' }; }
      if (t >= Number(entry.current.ad.expiresAtSeconds)) { entries.delete(key); return { ok: false, reason: 'expired' }; }
      if (entry.conflicting.size > 0) return { ok: false, reason: 'conflict' };
      return { ok: true, ad: entry.current };
    },
    list() {
      const t = now(); if (t === null) return [];
      sweep(t);
      return [...entries.values()].filter(e => e.conflicting.size === 0).map(e => e.current).sort((a, b) => {
        const x = BigInt(a.ad.amountMin), y = BigInt(b.ad.amountMin);
        return x < y ? -1 : x > y ? 1 : a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
      });
    },
  };
}
