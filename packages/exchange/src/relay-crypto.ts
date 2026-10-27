/**
 * Adapter: the relay package's injected `EventCrypto` implemented with packages/nostr-crypto.
 * Verification is synchronous (the pool verifies inline) and uses the provider's `verifySchnorrSync` after the same
 * strict shape, bound and NIP-01 id checks nostr-crypto applies to every event. Signing goes through the messaging
 * identity provider with the secret held by this adapter. Lives in this package, not in relay, so relay stays
 * crypto-free and discovery-only.
 */
import { signEvent, verifyEventSync } from '../../nostr-crypto/index.ts';
import type { NostrMessagingProvider } from '../../nostr-crypto/index.ts';
import type { EventCrypto, NostrEvent, UnsignedEvent } from '../../relay/index.ts';

export interface NostrEventCrypto extends EventCrypto {
  /** Zeroizes the adapter's copy of the secret; signing afterwards fails. */
  dispose(): void;
}
export interface NostrEventCryptoOptions { readonly provider: NostrMessagingProvider; readonly secretKey: Uint8Array; }

export function createNostrEventCrypto(options: NostrEventCryptoOptions): NostrEventCrypto {
  const { provider } = options;
  if (typeof provider?.verifySchnorrSync !== 'function' || typeof provider.signSchnorr !== 'function') throw new TypeError('UNSUPPORTED_PROVIDER');
  const secret = new Uint8Array(options.secretKey);
  let disposed = false;
  return Object.freeze({
    verifyEvent(event: NostrEvent): boolean {
      try { verifyEventSync(event, provider); return true; } catch { return false; }
    },
    async signEvent(unsigned: UnsignedEvent): Promise<NostrEvent> {
      if (disposed) throw new Error('DISPOSED');
      return signEvent(unsigned, secret, provider);
    },
    dispose(): void { disposed = true; secret.fill(0); },
  });
}
