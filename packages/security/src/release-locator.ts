/** G15 offline locator verification. No fetch, extraction, installation or release authority.
 * Supported CID profile: canonical lowercase base32 CIDv1, raw/dag-pb codec and
 * a 32-byte sha2-256 multihash. Other bases/codecs/hashes remain unsupported.
 */
import { decodeBase64url } from '../../schemas/index.ts';
import type { ReleaseErrorCode, ReleaseResult } from './release-manifest.ts';
import { revalidateRelease } from './release-proof.ts';

export const RELEASE_LOCATOR_LIMITS = Object.freeze({ locatorBytes: 4096, cidCharacters: 128, trustedKeys: 32, archiveBytes: 256 * 1024 * 1024 });
export interface ReleaseLocator {
  readonly v: 1; readonly channel: string; readonly sequence: number; readonly manifestSha256: string;
  readonly cid: string; readonly archiveSha256: string | null; readonly createdAt: number; readonly expiresAt: number;
}
export interface ReleaseLocatorOptions {
  readonly archiveBytes?: Uint8Array;
  readonly signal?: AbortSignal;
  readonly isCurrent?: () => boolean;
}
export type ReleaseLocatorResult = Readonly<{ ok: false; error: Readonly<{ code: ReleaseErrorCode }> }> |
  Readonly<{ ok: true; value: Readonly<{ locator: ReleaseLocator; keyId: string; archiveVerified: boolean; releaseEnabled: false; installationAllowed: false }> }>;
type Data = Record<string, unknown>;
const codes = new WeakMap<object, ReleaseErrorCode>();
class Refused extends Error { constructor(code: ReleaseErrorCode) { super('Release locator refused.'); codes.set(this, code); } }
const fail = (code: ReleaseErrorCode = 'MANIFEST_UNSUPPORTED'): never => { throw new Refused(code); };
const classified = (error: unknown): ReleaseErrorCode => typeof error === 'object' && error !== null ? codes.get(error) ?? 'MANIFEST_UNSUPPORTED' : 'MANIFEST_UNSUPPORTED';
const encoder = new TextEncoder(), domain = encoder.encode('p2p-offramp/release-locator/v1\n');
const fields = ['v', 'channel', 'sequence', 'manifestSha256', 'cid', 'archiveSha256', 'createdAt', 'expiresAt'] as const;

function object(value: unknown, required: readonly string[], optional: readonly string[] = [], code: ReleaseErrorCode = 'MANIFEST_UNSUPPORTED'): Data {
  if (typeof value !== 'object' || value === null || ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) return fail(code);
  const keys = Reflect.ownKeys(value);
  if (keys.length > required.length + optional.length || keys.some(key => typeof key !== 'string' || !required.includes(key) && !optional.includes(key))) return fail(code);
  const result: Data = Object.create(null) as Data;
  for (const key of [...required, ...optional]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) { if (required.includes(key)) return fail(code); continue; }
    if (!('value' in descriptor) || !descriptor.enumerable) return fail(code);
    result[key] = descriptor.value;
  }
  return result;
}
const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
const byteLength = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!;
const backingBuffer = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!;
function bytes(value: unknown, maximum: number, code: ReleaseErrorCode = 'MANIFEST_UNSUPPORTED'): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Uint8Array.prototype) return fail(code);
  const length = Reflect.apply(byteLength, value, []) as number;
  if (!(Reflect.apply(backingBuffer, value, []) instanceof ArrayBuffer) || length > maximum) return fail(code);
  const copy = new Uint8Array(length); Reflect.apply(Uint8Array.prototype.set, copy, [value]); return copy;
}
function hex(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return fail(); return value; }
function integer(value: unknown, min = 0): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) return fail(); return value; }
function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function canonical(raw: Data): string {
  return '{' + Object.keys(raw).sort().map(key => JSON.stringify(key) + ':' + JSON.stringify(raw[key])).join(',') + '}';
}

/** Parse the intentionally narrow CIDv1 profile, including canonical trailing bits.
 * Single-byte version/codec/multihash fields also refuse non-minimal varints.
 */
function cid(value: unknown): string {
  if (typeof value !== 'string' || value.length > RELEASE_LOCATOR_LIMITS.cidCharacters || !/^b[a-z2-7]+$/.test(value)) return fail();
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567', decoded: number[] = [];
  let bits = 0, pending = 0;
  for (const character of value.slice(1)) {
    pending = (pending << 5) | alphabet.indexOf(character); bits += 5;
    if (bits >= 8) { bits -= 8; decoded.push((pending >>> bits) & 255); pending &= (1 << bits) - 1; }
  }
  if (bits >= 5 || pending !== 0 || decoded.length !== 36 || decoded[0] !== 1 ||
      decoded[1] !== 0x55 && decoded[1] !== 0x70 || decoded[2] !== 0x12 || decoded[3] !== 32) return fail();
  return value;
}
function locator(input: Uint8Array<ArrayBuffer>): ReleaseLocator {
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
  const raw = object(JSON.parse(source), fields);
  if (raw.v !== 1 || typeof raw.channel !== 'string' || raw.channel.length < 1 || raw.channel.length > 64 || !wellFormed(raw.channel)) return fail();
  const value: ReleaseLocator = Object.freeze({ v: 1, channel: raw.channel, sequence: integer(raw.sequence, 1), manifestSha256: hex(raw.manifestSha256),
    cid: cid(raw.cid), archiveSha256: raw.archiveSha256 === null ? null : hex(raw.archiveSha256), createdAt: integer(raw.createdAt), expiresAt: integer(raw.expiresAt) });
  if (value.expiresAt <= value.createdAt || value.expiresAt - value.createdAt > 30 * 86400 || canonical(value as unknown as Data) !== source) return fail();
  return value;
}
function keys(input: unknown): JsonWebKey[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail('KEY_UNTRUSTED');
    const count = Object.getOwnPropertyDescriptor(input, 'length')?.value as unknown;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count > RELEASE_LOCATOR_LIMITS.trustedKeys || Reflect.ownKeys(input).length !== count + 1) return fail('KEY_UNTRUSTED');
    return Array.from({ length: count }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index)); if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return fail('KEY_UNTRUSTED');
      const key = object(descriptor.value, ['kty', 'crv', 'x', 'y', 'key_ops', 'ext'], [], 'KEY_UNTRUSTED');
      if (key.kty !== 'EC' || key.crv !== 'P-256' || key.ext !== true || !Array.isArray(key.key_ops) || Object.getPrototypeOf(key.key_ops) !== Array.prototype || Reflect.ownKeys(key.key_ops).length !== 2 ||
          Object.getOwnPropertyDescriptor(key.key_ops, 'length')?.value !== 1 || Object.getOwnPropertyDescriptor(key.key_ops, '0')?.value !== 'verify' ||
          Object.getOwnPropertyDescriptor(key.key_ops, '0')?.enumerable !== true) return fail('KEY_UNTRUSTED');
      decodeBase64url(key.x, 32, 32); decodeBase64url(key.y, 32, 32);
      return { kty: 'EC', crv: 'P-256', x: key.x as string, y: key.y as string, key_ops: ['verify'], ext: true };
    });
  } catch { return fail('KEY_UNTRUSTED'); }
}
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
function signature(value: unknown): Uint8Array<ArrayBuffer> {
  try {
    const result = new Uint8Array(decodeBase64url(value, 64, 64));
    for (const offset of [0, 32]) { let scalar = 0n; for (let i = offset; i < offset + 32; i++) scalar = scalar * 256n + BigInt(result[i]!); if (scalar === 0n || scalar >= ORDER) return fail('SIGNATURE_INVALID'); }
    return result;
  } catch { return fail('SIGNATURE_INVALID'); }
}

/** `verifiedManifest` is verifyRelease(...).value, not a serialized success claim.
 * The locator must use the same authenticated signer and exact manifest bindings.
 * Archives are optional input; a declared hash without bytes stays unverified.
 */
export async function verifyReleaseLocator(input: unknown, detached: unknown, verifiedManifest: unknown, trustedKeys: unknown, options: ReleaseLocatorOptions = {}): Promise<ReleaseLocatorResult> {
  let guard = (): void => undefined;
  try {
    const opts = object(options, [], ['archiveBytes', 'signal', 'isCurrent']);
    if (opts.isCurrent !== undefined && typeof opts.isCurrent !== 'function') return fail();
    const current = opts.isCurrent as (() => boolean) | undefined, signal = opts.signal;
    const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
    let verified: Extract<ReleaseResult, { ok: true }>['value'];
    guard = () => {
      const fresh = revalidateRelease(verifiedManifest); if (!fresh.ok) return fail(fresh.error.code); verified = fresh.value;
      try { if (signal !== undefined && Reflect.apply(nativeAborted, signal, []) || current && current() !== true || signal !== undefined && Reflect.apply(nativeAborted, signal, [])) return fail('CANCELLED'); }
      catch { return fail('CANCELLED'); }
      const again = revalidateRelease(verifiedManifest); if (!again.ok) return fail(again.error.code);
    };
    guard();
    const raw = bytes(input, RELEASE_LOCATOR_LIMITS.locatorBytes), payload = locator(raw), envelope = object(detached, ['keyId', 'alg', 'signature']);
    if (envelope.alg !== 'ES256-P1363') return fail();
    const keyId = hex(envelope.keyId), sig = signature(envelope.signature), trusted = keys(trustedKeys);
    const archive = opts.archiveBytes === undefined ? undefined : bytes(opts.archiveBytes, RELEASE_LOCATOR_LIMITS.archiveBytes, 'ASSET_MISMATCH');
    const manifest = verified!.manifest;
    if (payload.manifestSha256 !== verified!.manifestSha256 || payload.channel !== manifest.channel || payload.sequence !== manifest.sequence ||
        payload.createdAt !== manifest.createdAt || payload.expiresAt !== manifest.expiresAt) return fail('ASSET_MISMATCH');
    if (keyId !== verified!.keyId) return fail('KEY_UNTRUSTED');
    if (archive !== undefined && payload.archiveSha256 === null) return fail('ASSET_MISMATCH');
    guard();
    const subtle = globalThis.crypto?.subtle; if (!subtle) return fail('UNAVAILABLE');
    const hash = async (value: Uint8Array<ArrayBuffer>): Promise<string> => {
      let digest: ArrayBuffer; try { digest = await subtle.digest('SHA-256', value); } catch { guard(); return fail('UNAVAILABLE'); }
      guard(); if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) return fail('UNAVAILABLE');
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    };
    let selected: JsonWebKey | undefined;
    for (const key of trusted) if (await hash(encoder.encode(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y }))) === keyId) { selected = key; break; }
    if (!selected) return fail('KEY_UNTRUSTED');
    let imported: CryptoKey;
    try { imported = await subtle.importKey('jwk', selected, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); } catch { guard(); return fail('UNAVAILABLE'); }
    guard();
    const signed = new Uint8Array(domain.length + raw.length); signed.set(domain); signed.set(raw, domain.length);
    let valid: boolean; try { valid = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, imported, sig, signed); } catch { guard(); return fail('UNAVAILABLE'); }
    guard(); if (!valid) return fail('SIGNATURE_INVALID');
    if (archive !== undefined && await hash(archive) !== payload.archiveSha256) return fail('ASSET_MISMATCH');
    guard();
    return Object.freeze({ ok: true, value: Object.freeze({ locator: payload, keyId, archiveVerified: archive !== undefined, releaseEnabled: false, installationAllowed: false }) });
  } catch (error) {
    let code = classified(error); try { guard(); } catch (stopped) { code = classified(stopped); }
    return Object.freeze({ ok: false, error: Object.freeze({ code }) });
  }
}
