/**
 * ChaCha20 (RFC 8439 section 2.4: 32-byte key, 12-byte nonce, 32-bit block counter) for NIP-44 v2, delegated to the
 * pinned @noble/ciphers 2.4.0 (owner-approved 2026-10-28; inventory id noble-ciphers-2.4.0-nostr, review pending).
 * This module only keeps the package's typed-error contract: inputs are checked here, before the library is called,
 * so callers see INVALID_INPUT / LIMIT_EXCEEDED rather than library-specific exceptions.
 */
import { chacha20 as nobleChacha20 } from '@noble/ciphers/chacha.js';
import { fail } from './bytes.ts';

/** XOR `data` with the keystream starting at block `counter` (NIP-44 uses 0). Returns a new array; inputs are not modified. */
export function chacha20(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, counter = 0): Uint8Array {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32 || !(nonce instanceof Uint8Array) || nonce.byteLength !== 12 || !(data instanceof Uint8Array)) return fail();
  if (!Number.isSafeInteger(counter) || counter < 0 || counter + Math.ceil(data.byteLength / 64) > 0x1_0000_0000) return fail('LIMIT_EXCEEDED');
  try { return nobleChacha20(key, nonce, data, new Uint8Array(data.byteLength), counter); } catch { return fail(); }
}
