/** Private math for two named local profiles. Product entrypoints accept no scalar or hash override. */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bareHex, bytesOf, hexOf, stop } from './shared.ts';
import { FIELD_PRIME, SCALAR_ORDER, profileOf, type LocalProfileId } from './profiles.ts';
export function compressedPoint(input: unknown) {
  const hex = bareHex(input, 33); if (!/^(02|03)/.test(hex) || BigInt('0x' + hex.slice(2)) >= FIELD_PRIME) return stop('INVALID_POINT');
  const bytes = bytesOf(hex);
  try {
    const point = secp256k1.Point.fromBytes(bytes); point.assertValidity();
    if (point.equals(secp256k1.Point.ZERO) || hexOf(point.toBytes(true)) !== hex) return stop('INVALID_POINT'); return point;
  } catch { return stop('INVALID_POINT'); } finally { bytes.fill(0); }
}
export function scalarOf(input: Uint8Array): bigint {
  if (!(input instanceof Uint8Array) || input.byteLength !== 32 || !secp256k1.utils.isValidSecretKey(input)) return stop('INVALID_SCALAR');
  return BigInt('0x' + hexOf(input));
}
export function publicOf(scalar: Uint8Array): string { scalarOf(scalar); return hexOf(secp256k1.getPublicKey(scalar, true)); }
export interface DerivedPublic { readonly address: string; readonly viewTagHex: string; readonly preimage: Uint8Array<ArrayBuffer>; readonly digest: Uint8Array<ArrayBuffer>; }
function hashScalar(digest: Uint8Array): bigint {
  if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) return stop('HASH_SCALAR_EXCEPTION');
  const scalar = BigInt('0x' + hexOf(digest)); if (scalar === 0n || scalar >= SCALAR_ORDER) return stop('HASH_SCALAR_EXCEPTION'); return scalar;
}
/** Internal exceptional-policy helper, exercised by explicitly public deterministic fixtures. */
export function publicFromDigest(spendingPublicKeyHex: string, digest: Uint8Array): { address: string; viewTagHex: string } {
  const spend = compressedPoint(spendingPublicKeyHex);
  const scalar = hashScalar(digest);
  const point = spend.add(secp256k1.Point.BASE.multiply(scalar)); if (point.equals(secp256k1.Point.ZERO)) return stop('POINT_INFINITY');
  const uncompressed = point.toBytes(false), addressHash = keccak_256(uncompressed.subarray(1));
  try { return { address: '0x' + hexOf(addressHash.subarray(12)), viewTagHex: hexOf(digest.subarray(0, 1)) }; }
  finally { uncompressed.fill(0); addressHash.fill(0); }
}
export function deriveSharedDigest(profile: LocalProfileId, privateViewOrEphemeral: Uint8Array, counterpartPublicKeyHex: string,
  ownBuffer: (bytes: Uint8Array<ArrayBuffer>) => void = () => {}): Pick<DerivedPublic, 'preimage' | 'digest'> {
  profileOf(profile);
  const shared = compressedPoint(counterpartPublicKeyHex).multiply(scalarOf(privateViewOrEphemeral));
  if (shared.equals(secp256k1.Point.ZERO)) return stop('POINT_INFINITY');
  const encoded = shared.toBytes(profile === 'local-scopelift-ecdh33-comparison-v1');
  const preimage = profile === 'local-erc5564-reference-xy64-v1' ? encoded.slice(1) : encoded.slice(); encoded.fill(0);
  ownBuffer(preimage); const digest = keccak_256(preimage); ownBuffer(digest);
  try { hashScalar(digest); return { preimage, digest }; }
  catch (error) { preimage.fill(0); digest.fill(0); throw error; }
}
export function derivePublic(profile: LocalProfileId, privateViewOrEphemeral: Uint8Array, counterpartPublicKeyHex: string, spendingPublicKeyHex: string,
  ownBuffer: (bytes: Uint8Array<ArrayBuffer>) => void = () => {}): DerivedPublic {
  const derived = deriveSharedDigest(profile, privateViewOrEphemeral, counterpartPublicKeyHex, ownBuffer);
  try { return { ...publicFromDigest(spendingPublicKeyHex, derived.digest), ...derived }; }
  catch (error) { derived.preimage.fill(0); derived.digest.fill(0); throw error; }
}
export interface RecipientPoints { readonly spendingPublicKeyHex: string; readonly viewingPublicKeyHex: string; readonly uri: string; }
export function parseRecipientUri(input: unknown): RecipientPoints {
  if (typeof input !== 'string') return stop();
  if (input.length === 75 && input.startsWith('st:eth:0x')) return stop('SINGLE_KEY_UNSUPPORTED');
  if (input.length !== 141 || !input.startsWith('st:eth:0x')) return stop();
  const keys = bareHex(input.slice(9), 66), spendingPublicKeyHex = keys.slice(0, 66), viewingPublicKeyHex = keys.slice(66);
  compressedPoint(spendingPublicKeyHex); compressedPoint(viewingPublicKeyHex);
  if (spendingPublicKeyHex === viewingPublicKeyHex) return stop('KEY_PURPOSE_CONFLICT');
  return Object.freeze({ spendingPublicKeyHex, viewingPublicKeyHex, uri: input });
}
