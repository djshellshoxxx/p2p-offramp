/**
 * G19/G21 wiring: the relay pool's injected NIP-01 EventCrypto (packages/relay/src/nip01.ts), backed by this package.
 * packages/relay implements no cryptography and does not import this package; RelayEventCrypto matches its interface
 * structurally, and the composition root passes one to createRelayPool / createAdEvent / createOrderBook.
 *
 * - verifyEvent is synchronous because the pool dedupes, filters, verifies and delivers a frame without yielding;
 *   it returns false, never throws, for anything that is not a canonical, correctly signed, non-NIP-04 event.
 * - signEvent signs with one G01 messaging key through the provider (never a vault or wallet key). The adapter holds
 *   its own copy of that key; dispose() wipes it. A signature that completes after dispose() is refused, so a stale
 *   completion cannot be published under a key the owner already released.
 */
import { fail, isBytes, wipe } from './bytes.ts';
import { DEFAULT_EVENT_LIMITS, signEvent as signNostrEvent, verifyEventSync, type EventLimits, type EventTemplate, type NostrEvent } from './event.ts';
import type { NostrMessagingProvider } from './provider.ts';

export interface RelayEventCrypto {
  /** x-only public key (lowercase hex) of the signing key; every signed event carries it as pubkey. */
  readonly pubkey: string;
  verifyEvent(event: unknown): boolean;
  signEvent(unsigned: EventTemplate): Promise<NostrEvent>;
  /** Wipes the held key copy (best effort, see wipe()). Idempotent. Later and in-flight signEvent calls fail UNAUTHORIZED. */
  dispose(): void;
}

export async function createRelayEventCrypto(provider: NostrMessagingProvider, secretKey: Uint8Array, limits: EventLimits = DEFAULT_EVENT_LIMITS): Promise<RelayEventCrypto> {
  if (!isBytes(secretKey, 32)) return fail();
  const key = secretKey.slice();
  let pubkey: string;
  try { pubkey = await provider.publicKey(key); } catch { wipe(key); return fail(); }
  let disposed = false;
  return Object.freeze({
    pubkey,
    verifyEvent(event: unknown): boolean {
      try { verifyEventSync(event, limits); return true; } catch { return false; }
    },
    async signEvent(unsigned: EventTemplate): Promise<NostrEvent> {
      if (disposed) return fail('UNAUTHORIZED');
      // Per-call copy: dispose() during an in-flight signature cannot zero the bytes the provider is using.
      const working = key.slice();
      try {
        const event = await signNostrEvent(unsigned, working, provider, limits);
        if (disposed) return fail('UNAUTHORIZED');
        if (event.pubkey !== pubkey) return fail('INTEGRITY_FAILURE');
        return event;
      } finally { wipe(working); }
    },
    dispose(): void { disposed = true; wipe(key); },
  });
}
