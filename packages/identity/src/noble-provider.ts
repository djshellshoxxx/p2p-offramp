/** Local G01 key generation only. G06 review remains test-enabled; no generic signer/network API. */
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { IDENTITY_PROVIDER_ID, IdentityError } from '../../schemas/src/identity.ts';
export interface MessagingIdentityProvider {
  readonly id: typeof IDENTITY_PROVIDER_ID;
  generate(): Promise<{ readonly secretKey: Uint8Array; readonly publicKey: string }>;
  publicKey(secretKey: Uint8Array): Promise<string>;
}
const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export function createLocalNobleIdentityProvider(): MessagingIdentityProvider {
  return Object.freeze({
    id: IDENTITY_PROVIDER_ID,
    async generate() {
      try { const pair = schnorr.keygen(); return { secretKey: pair.secretKey, publicKey: hex(pair.publicKey) }; }
      catch { throw new IdentityError('UNSUPPORTED_PROVIDER'); }
    },
    async publicKey(secretKey: Uint8Array): Promise<string> {
      try {
        if (!(secretKey instanceof Uint8Array) || !secp256k1.utils.isValidSecretKey(secretKey)) throw new IdentityError();
        return hex(schnorr.getPublicKey(secretKey));
      } catch { throw new IdentityError(); }
    },
  });
}
