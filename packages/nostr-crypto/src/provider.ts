/**
 * G20 messaging-key provider: the G01 MessagingIdentityProvider interface plus the BIP340 sign/verify and NIP-44 ECDH
 * operations Nostr messaging needs. Secret keys are only ever the G01 messaging identity (or a fresh gift-wrap key),
 * never a G02 vault key or an external wallet spending key. A provider without ECDH is unsupported; nothing falls back
 * to a wallet transaction signature.
 */
import { schnorr } from '@noble/curves/secp256k1.js';
import { createLocalNobleIdentityProvider, type MessagingIdentityProvider } from '../../identity/index.ts';
import { fail, isBytes, randomBytes, wipe } from './bytes.ts';
import { getConversationKey, isValidSecretKey } from './nip44.ts';

export interface NostrMessagingProvider extends MessagingIdentityProvider {
  /** BIP340 signature over a 32-byte message (a NIP-01 event id). Fresh auxiliary randomness per call. */
  signSchnorr(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array>;
  /** BIP340 verification. Returns false, never throws, for any malformed input. */
  verifySchnorr(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean>;
  /** Synchronous BIP340 verification of public data (needed by the relay pool's synchronous verifier). Optional. */
  verifySchnorrSync?(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
  /** NIP-44 v2 conversation key between this secret and an x-only peer key. The caller wipes the result. */
  conversationKey(secretKey: Uint8Array, peerPublicKey: string): Promise<Uint8Array>;
}

function verifySync(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  if (!isBytes(signature, 64) || !isBytes(message, 32) || !isBytes(publicKey, 32)) return false;
  try { return schnorr.verify(signature, message, publicKey); } catch { return false; }
}

/** Local test provider over pinned @noble/curves 2.4.0 (G06 review pending). Not a release-enabled signer. */
export function createLocalNobleNostrProvider(): NostrMessagingProvider {
  const identity = createLocalNobleIdentityProvider();
  return Object.freeze({
    id: identity.id,
    generate: () => identity.generate(),
    publicKey: (secretKey: Uint8Array) => identity.publicKey(secretKey),
    async signSchnorr(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
      if (!isBytes(message, 32) || !isValidSecretKey(secretKey)) return fail();
      const aux = randomBytes(32);
      try { return schnorr.sign(message, secretKey, aux); } catch { return fail(); } finally { wipe(aux); }
    },
    async verifySchnorr(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> { return verifySync(signature, message, publicKey); },
    verifySchnorrSync(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean { return verifySync(signature, message, publicKey); },
    async conversationKey(secretKey: Uint8Array, peerPublicKey: string): Promise<Uint8Array> { return getConversationKey(secretKey, peerPublicKey); },
  });
}
