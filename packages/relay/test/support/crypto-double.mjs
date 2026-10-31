// TEST ONLY stand-in for packages/nostr-crypto, backed by @noble/curves schnorr. Production code never imports this.
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const eventId = e => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))));
export function makeKey(seed) {
  const sk = sha256(new TextEncoder().encode(`relay-test-key-${seed}`));
  return { sk, pubkey: bytesToHex(schnorr.getPublicKey(sk)) };
}
export function signWith(key, unsigned) {
  const base = { pubkey: key.pubkey, created_at: unsigned.created_at, kind: unsigned.kind, tags: unsigned.tags.map(t => [...t]), content: unsigned.content };
  const id = eventId(base);
  return { id, ...base, sig: bytesToHex(schnorr.sign(hexToBytes(id), key.sk)) };
}
export function makeCrypto(key) {
  return {
    verifyEvent(event) {
      try { return event.id === eventId(event) && schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey)); } catch { return false; }
    },
    async signEvent(unsigned) { return signWith(key, unsigned); },
  };
}
