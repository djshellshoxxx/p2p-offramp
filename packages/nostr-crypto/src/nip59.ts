/**
 * NIP-59 gift wrap: rumor (unsigned) -> seal (kind 13, NIP-44 to the recipient, signed by the author, empty tags)
 * -> gift wrap (kind 1059, NIP-44 under a fresh one-time key, single `p` tag). Seal and wrap timestamps are drawn
 * uniformly from [now - 2 days, now] so they do not reveal the send time. Unwrapping verifies each layer before it
 * decrypts the next, and requires seal.pubkey == rumor.pubkey.
 */
import { fail, isLowerHex, wipe } from './bytes.ts';
import { DEFAULT_EVENT_LIMITS, parseEventJson, parseUnsignedEvent, signEvent, verifyEvent, type EventLimits, type NostrEvent, type UnsignedEvent } from './event.ts';
import { decrypt, encrypt, NIP44_MAX_PAYLOAD_CHARS, NIP44_MAX_PLAINTEXT_BYTES } from './nip44.ts';
import type { NostrMessagingProvider } from './provider.ts';

export const KIND_SEAL = 13;
export const KIND_GIFT_WRAP = 1059;
export const TIMESTAMP_WINDOW_SECONDS = 2 * 24 * 60 * 60;
/** Accepted clock skew for wrap/seal timestamps in the future. They are randomized into the past when we create them. */
export const MAX_FUTURE_SKEW_SECONDS = 10 * 60;

const OUTER_LIMITS: EventLimits = Object.freeze({ ...DEFAULT_EVENT_LIMITS, maxContentBytes: NIP44_MAX_PAYLOAD_CHARS, maxTags: 4, maxTagItems: 4, maxTagItemBytes: 256, allowedKinds: [KIND_GIFT_WRAP] });
const SEAL_LIMITS: EventLimits = Object.freeze({ ...DEFAULT_EVENT_LIMITS, maxContentBytes: NIP44_MAX_PAYLOAD_CHARS, maxTags: 0, allowedKinds: [KIND_SEAL] });

/** Uniform integer in [0, bound] from the CSPRNG (rejection sampling, no modulo bias). */
function uniform(bound: number): number {
  const range = bound + 1, limit = Math.floor(0x1_0000_0000 / range) * range, word = new Uint32Array(1);
  try {
    for (;;) { crypto.getRandomValues(word); if (word[0]! < limit) return word[0]! % range; }
  } catch { return fail('UNSUPPORTED_PROVIDER'); } finally { word.fill(0); }
}
export function randomizedTimestamp(now: number): number {
  if (!Number.isSafeInteger(now) || now < TIMESTAMP_WINDOW_SECONDS) return fail();
  return now - uniform(TIMESTAMP_WINDOW_SECONDS);
}
function canonicalJson(event: UnsignedEvent | NostrEvent): string {
  const base = { id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags, content: event.content };
  return JSON.stringify('sig' in event ? { ...base, sig: event.sig } : base);
}

export async function createSeal(rumor: UnsignedEvent, senderSecret: Uint8Array, recipientPublicKey: string, provider: NostrMessagingProvider, now: number): Promise<NostrEvent> {
  if (!isLowerHex(recipientPublicKey, 32)) return fail();
  const checked = parseUnsignedEvent(rumor);
  if (checked.pubkey !== await provider.publicKey(senderSecret)) return fail('UNAUTHORIZED');
  const key = await provider.conversationKey(senderSecret, recipientPublicKey);
  try {
    return await signEvent({ kind: KIND_SEAL, created_at: randomizedTimestamp(now), tags: [], content: encrypt(canonicalJson(checked), key) }, senderSecret, provider, SEAL_LIMITS);
  } finally { wipe(key); }
}
/** Wrap a seal for one recipient under a fresh key. The one-time secret and conversation key are wiped before return. */
export async function createGiftWrap(seal: NostrEvent, recipientPublicKey: string, provider: NostrMessagingProvider, now: number): Promise<NostrEvent> {
  if (!isLowerHex(recipientPublicKey, 32)) return fail();
  const checked = await verifyEvent(seal, provider, SEAL_LIMITS);
  const ephemeral = await provider.generate();
  let key: Uint8Array | undefined;
  try {
    key = await provider.conversationKey(ephemeral.secretKey, recipientPublicKey);
    return await signEvent({ kind: KIND_GIFT_WRAP, created_at: randomizedTimestamp(now), tags: [['p', recipientPublicKey]], content: encrypt(canonicalJson(checked), key) }, ephemeral.secretKey, provider, OUTER_LIMITS);
  } finally { wipe(key, ephemeral.secretKey); }
}

export interface UnwrapOptions { readonly now: number; readonly rumorLimits?: EventLimits; }
export interface Unwrapped { readonly wrap: NostrEvent; readonly seal: NostrEvent; readonly rumor: UnsignedEvent; }
/**
 * Verify the outer wrap (kind 1059, signature, exactly one `p` tag naming us), decrypt the seal, verify it (kind 13,
 * signature, no tags), decrypt the rumor with the seal author's key, parse it, and require rumor.pubkey == seal.pubkey.
 * Errors: INVALID_INPUT/LIMIT_EXCEEDED (malformed), UNSUPPORTED_VERSION (NIP-04 or unknown payload version),
 * INTEGRITY_FAILURE (bad id/signature/MAC), UNAUTHORIZED (not addressed to us, or author mismatch).
 */
export async function unwrapGiftWrap(input: unknown, recipientSecret: Uint8Array, provider: NostrMessagingProvider, options: UnwrapOptions): Promise<Unwrapped> {
  if (!Number.isSafeInteger(options.now) || options.now < 0) return fail();
  const self = await provider.publicKey(recipientSecret);
  const wrap = await verifyEvent(input, provider, OUTER_LIMITS);
  const p = wrap.tags.filter(tag => tag[0] === 'p');
  if (p.length !== 1 || p[0]!.length !== 2 || p[0]![1] !== self) return fail('UNAUTHORIZED');
  if (wrap.created_at > options.now + MAX_FUTURE_SKEW_SECONDS) return fail();
  let key: Uint8Array | undefined;
  let sealJson: string;
  try { key = await provider.conversationKey(recipientSecret, wrap.pubkey); sealJson = decrypt(wrap.content, key); } finally { wipe(key); key = undefined; }
  const seal = await verifyEvent(parseEventJson(sealJson, NIP44_MAX_PLAINTEXT_BYTES), provider, SEAL_LIMITS);
  if (seal.created_at > options.now + MAX_FUTURE_SKEW_SECONDS) return fail();
  let rumorJson: string;
  try { key = await provider.conversationKey(recipientSecret, seal.pubkey); rumorJson = decrypt(seal.content, key); } finally { wipe(key); }
  const rumor = parseUnsignedEvent(parseEventJson(rumorJson, NIP44_MAX_PLAINTEXT_BYTES), options.rumorLimits ?? DEFAULT_EVENT_LIMITS);
  if (rumor.pubkey !== seal.pubkey) return fail('UNAUTHORIZED');
  return Object.freeze({ wrap, seal, rumor });
}
