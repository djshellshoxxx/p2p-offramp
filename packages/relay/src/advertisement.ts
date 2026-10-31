/** Restricted G19 local-test advertisement profile; native signatures never establish custody or liquidity. */
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { parseStrictJsonBytes } from '../../schemas/index.ts';

export const MAX_EVENT_BYTES = 65536;
export const MAX_AD_BYTES = 8192;
export const MAX_RETAINED_ORDERS = 1000;
export const MAX_DEDUP_IDS = 4096;
export type RelayError = 'INVALID_INPUT' | 'INVALID_SIGNATURE' | 'EXPIRED' | 'TIME_UNKNOWN' | 'LIMIT_EXCEEDED' | 'CANCELLED' | 'UNAVAILABLE';
export type RelayResult<T> = {readonly ok: true; readonly value: T} | {readonly ok: false; readonly code: RelayError};
export interface PublicAdV1 {
  readonly app: 'p2p-offramp'; readonly v: 1; readonly orderId: string; readonly revision: number;
  readonly networkId: string; readonly assetId: string; readonly amount: string; readonly currency: string;
  readonly railClass: string; readonly maker: string; readonly expiresAtSeconds: string; readonly termsDigest: string;
}
export interface NostrAdEvent {
  readonly id: string; readonly pubkey: string; readonly created_at: number; readonly kind: 30078;
  readonly tags: readonly (readonly string[])[]; readonly content: string; readonly sig: string;
}
export interface ValidatedAdvertisement {readonly event: NostrAdEvent; readonly ad: PublicAdV1;}
const utf8 = new TextEncoder();
const HEX32 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const U256 = (1n << 256n) - 1n;
const U64 = (1n << 64n) - 1n;
const failure = (code: RelayError): RelayResult<never> => Object.freeze({ok:false,code});
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error();
  const record = input as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== [...keys].sort().join(',')) throw new Error();
  return record;
}
function text(input: unknown, expression: RegExp): string { if (typeof input !== 'string' || !expression.test(input)) throw new Error(); return input; }
function decimal(input: unknown, maximum: bigint): string {
  const value = text(input, /^(0|[1-9][0-9]{0,77})$/);
  if (BigInt(value) > maximum) throw new Error(); return value;
}
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
const unhex = (value: string) => Uint8Array.from(value.match(/../g)!, pair => parseInt(pair,16));
/** NIP-01 event ID; callers supplying untrusted values use validateAdvertisement, not this fixture helper. */
export function advertisementEventId(event: Omit<NostrAdEvent, 'id' | 'sig'>): string {
  return hex(sha256(utf8.encode(JSON.stringify([0,event.pubkey,event.created_at,event.kind,event.tags,event.content]))));
}
export function validateAdvertisement(bytes: Uint8Array, nowSeconds: bigint | null): RelayResult<ValidatedAdvertisement> {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_EVENT_BYTES) return failure('LIMIT_EXCEEDED');
    if (nowSeconds === null) return failure('TIME_UNKNOWN');
    if (typeof nowSeconds !== 'bigint' || nowSeconds < 0n || nowSeconds > U64) return failure('INVALID_INPUT');
    const raw = exact(parseStrictJsonBytes(bytes, MAX_EVENT_BYTES), ['id','pubkey','created_at','kind','tags','content','sig']);
    const id = text(raw.id, HEX32), pubkey = text(raw.pubkey, HEX32), sig = text(raw.sig, /^[0-9a-f]{128}$/);
    if (!Number.isSafeInteger(raw.created_at) || (raw.created_at as number) < 0 || raw.kind !== 30078 || typeof raw.content !== 'string') throw new Error();
    if (utf8.encode(raw.content).byteLength > MAX_AD_BYTES) return failure('LIMIT_EXCEEDED');
    if (!Array.isArray(raw.tags) || raw.tags.length !== 2) throw new Error();
    const tags = raw.tags.map((tag: unknown) => {
      if (!Array.isArray(tag) || tag.length !== 2 || tag.some(item => typeof item !== 'string' || utf8.encode(item).length > 256)) throw new Error();
      return Object.freeze([...tag]) as readonly string[];
    });
    const d = tags.find(tag => tag[0] === 'd'), expiration = tags.find(tag => tag[0] === 'expiration');
    if (!d || !expiration) throw new Error();
    const adRaw = exact(parseStrictJsonBytes(utf8.encode(raw.content), MAX_AD_BYTES), ['app','v','orderId','revision','networkId','assetId','amount','currency','railClass','maker','expiresAtSeconds','termsDigest']);
    if (adRaw.app !== 'p2p-offramp' || adRaw.v !== 1 || !Number.isSafeInteger(adRaw.revision) || (adRaw.revision as number) < 1) throw new Error();
    const orderId = text(adRaw.orderId, HEX32), maker = text(adRaw.maker, HEX32);
    const expiresAtSeconds = decimal(adRaw.expiresAtSeconds, U64), expiry = BigInt(expiresAtSeconds);
    const amount = decimal(adRaw.amount, U256); if (BigInt(amount) === 0n) throw new Error();
    if (maker !== pubkey || d[1] !== `p2p-offramp:v1:${orderId}` || expiration[1] !== expiresAtSeconds) throw new Error();
    const created = BigInt(raw.created_at as number);
    if (expiry <= created || expiry - created > 3600n || created > nowSeconds) throw new Error();
    if (expiry <= nowSeconds) return failure('EXPIRED');
    const ad: PublicAdV1 = Object.freeze({app:'p2p-offramp',v:1,orderId,revision:adRaw.revision as number,
      networkId:text(adRaw.networkId,ID),assetId:text(adRaw.assetId,ID),amount,currency:text(adRaw.currency,/^[A-Z]{3}$/),
      railClass:text(adRaw.railClass,ID),maker,expiresAtSeconds,termsDigest:text(adRaw.termsDigest,HEX32)});
    const event: NostrAdEvent = Object.freeze({id,pubkey,created_at:raw.created_at as number,kind:30078,tags:Object.freeze(tags),content:raw.content,sig});
    if (advertisementEventId(event) !== id) return failure('INVALID_SIGNATURE');
    if (!schnorr.verify(unhex(sig),unhex(id),unhex(pubkey))) return failure('INVALID_SIGNATURE');
    return Object.freeze({ok:true,value:Object.freeze({event,ad})});
  } catch { return failure('INVALID_INPUT'); }
}

export type AdDisposition = 'accepted' | 'duplicate' | 'stale' | 'conflicted';
export interface OrderAdvertisement {readonly value: ValidatedAdvertisement; readonly conflicted: boolean;}
/** Bounded discovery hints only. Conflict is sticky until a strictly newer authenticated revision arrives. */
export class AdvertisementBook {
  readonly #orders = new Map<string, OrderAdvertisement>();
  readonly #seen = new Set<string>();
  ingest(bytes: Uint8Array, nowSeconds: bigint | null): RelayResult<AdDisposition> {
    const result = validateAdvertisement(bytes,nowSeconds); if (!result.ok) return result;
    const value = result.value, key = `${value.ad.maker}:${value.ad.orderId}`;
    if (this.#seen.has(value.event.id)) return {ok:true,value:'duplicate'};
    this.#seen.add(value.event.id); if (this.#seen.size > MAX_DEDUP_IDS) this.#seen.delete(this.#seen.values().next().value!);
    const old = this.#orders.get(key);
    if (old && value.ad.revision < old.value.ad.revision) return {ok:true,value:'stale'};
    if (old && value.ad.revision === old.value.ad.revision) {
      // Identical terms and metadata under a different event timestamp is still the same revision.
      if (JSON.stringify(old.value.ad) !== JSON.stringify(value.ad)) { this.#orders.set(key,Object.freeze({...old,conflicted:true})); return {ok:true,value:'conflicted'}; }
      return {ok:true,value:old.conflicted ? 'conflicted' : 'duplicate'};
    }
    this.#orders.delete(key); this.#orders.set(key,Object.freeze({value,conflicted:false}));
    if (this.#orders.size > MAX_RETAINED_ORDERS) this.#orders.delete(this.#orders.keys().next().value!);
    return {ok:true,value:'accepted'};
  }
  snapshot(nowSeconds: bigint | null): readonly OrderAdvertisement[] {
    if (nowSeconds === null) return Object.freeze([]);
    for (const [key,item] of this.#orders) if (BigInt(item.value.ad.expiresAtSeconds) <= nowSeconds) this.#orders.delete(key);
    return Object.freeze([...this.#orders.values()]);
  }
  get retainedOrders(): number { return this.#orders.size; }
  get dedupIds(): number { return this.#seen.size; }
  clear(): void { this.#orders.clear(); this.#seen.clear(); }
}
