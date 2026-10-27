/**
 * ChaCha20 stream cipher, RFC 8439 section 2.4 (32-byte key, 12-byte nonce, 32-bit block counter).
 * Project-owned primitive, used only because the pinned dependency set has no ChaCha20 and WebCrypto has none.
 * Tested against RFC 8439 2.4.2 and every official NIP-44 v2 vector. Review is pending (security/crypto-inventory.json).
 */
import { fail, wipe } from './bytes.ts';

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574] as const;
function word(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}
function quarter(x: Uint32Array, a: number, b: number, c: number, d: number): void {
  let t: number;
  x[a] = x[a]! + x[b]!; t = x[d]! ^ x[a]!; x[d] = (t << 16) | (t >>> 16);
  x[c] = x[c]! + x[d]!; t = x[b]! ^ x[c]!; x[b] = (t << 12) | (t >>> 20);
  x[a] = x[a]! + x[b]!; t = x[d]! ^ x[a]!; x[d] = (t << 8) | (t >>> 24);
  x[c] = x[c]! + x[d]!; t = x[b]! ^ x[c]!; x[b] = (t << 7) | (t >>> 25);
}
/** XOR `data` with the keystream starting at block `counter` (NIP-44 uses 0). Returns a new array; inputs are not modified. */
export function chacha20(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, counter = 0): Uint8Array {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32 || !(nonce instanceof Uint8Array) || nonce.byteLength !== 12 || !(data instanceof Uint8Array)) return fail();
  if (!Number.isSafeInteger(counter) || counter < 0 || counter + Math.ceil(data.byteLength / 64) > 0x1_0000_0000) return fail('LIMIT_EXCEEDED');
  const state = new Uint32Array(16), x = new Uint32Array(16), block = new Uint8Array(64);
  const out = new Uint8Array(data.byteLength);
  try {
    state.set(SIGMA);
    for (let index = 0; index < 8; index++) state[4 + index] = word(key, index * 4);
    state[12] = counter;
    for (let index = 0; index < 3; index++) state[13 + index] = word(nonce, index * 4);
    for (let offset = 0; offset < data.byteLength; offset += 64) {
      x.set(state);
      for (let round = 0; round < 10; round++) {
        quarter(x, 0, 4, 8, 12); quarter(x, 1, 5, 9, 13); quarter(x, 2, 6, 10, 14); quarter(x, 3, 7, 11, 15);
        quarter(x, 0, 5, 10, 15); quarter(x, 1, 6, 11, 12); quarter(x, 2, 7, 8, 13); quarter(x, 3, 4, 9, 14);
      }
      for (let index = 0; index < 16; index++) {
        const value = (x[index]! + state[index]!) >>> 0;
        block[index * 4] = value & 255; block[index * 4 + 1] = (value >>> 8) & 255; block[index * 4 + 2] = (value >>> 16) & 255; block[index * 4 + 3] = value >>> 24;
      }
      const length = Math.min(64, data.byteLength - offset);
      for (let index = 0; index < length; index++) out[offset + index] = data[offset + index]! ^ block[index]!;
      state[12] = state[12]! + 1;
    }
    return out;
  } finally { state.fill(0); x.fill(0); wipe(block); }
}
