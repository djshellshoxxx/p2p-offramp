/** Bounded G15 offline verifier mechanics, not a release/install authority.
 * No trust root, storage write, network, signing operation or application export.
 * Non-empty deployment entries remain unsupported until their exact wire schema is reconciled.
 * Locator verification is separate in release-locator.ts. Rotation/bootstrap/archive
 * extraction, installation and independent enabled-build review remain gates.
 */
import { decodeBase64url, MAX_REGISTRY_BYTES, type NetworkV1, type DeploymentV1 } from '../../schemas/index.ts';
import { RegistryService } from '../../domain/index.ts';
import { registerReleaseProof } from './release-proof.ts';

export const RELEASE_LIMITS = Object.freeze({ manifestBytes: 1024 * 1024, assets: 10_000, bundleBytes: 256 * 1024 * 1024, trustedKeys: 32 });
export type ReleaseErrorCode = 'SIGNATURE_INVALID' | 'KEY_UNTRUSTED' | 'MANIFEST_EXPIRED' | 'RELEASE_ROLLBACK' | 'ASSET_MISMATCH' | 'MANIFEST_UNSUPPORTED' | 'CANCELLED' | 'UNAVAILABLE';
export interface ReleaseAsset { readonly path: string; readonly bytes: number; readonly sha256: string; }
export interface ReleaseManifest {
  readonly format: 'p2p-offramp-release'; readonly version: 1; readonly channel: string; readonly sequence: number;
  readonly releaseId: string; readonly sourceCommit: string; readonly buildRecipeDigest: string; readonly lockfileDigest: string; readonly sbomDigest: string;
  readonly createdAt: number; readonly expiresAt: number; readonly minStorageSchema: number; readonly maxStorageSchema: number;
  readonly assets: readonly ReleaseAsset[]; readonly deployments: readonly never[]; readonly predecessorDigest: string | null;
}
export interface ReleaseCheckOptions {
  readonly channel: string;
  readonly assets: readonly { readonly path: string; readonly bytes: Uint8Array }[];
  readonly nowSeconds?: () => number;
  readonly signal?: AbortSignal;
  readonly isCurrent?: () => boolean;
  /** An equal sequence is idempotent only against the same retained manifest digest. */
  readonly installedManifestSha256?: string;
}
export type ReleaseResult = Readonly<{ ok: false; error: Readonly<{ code: ReleaseErrorCode }> }> | Readonly<{ ok: true; value: Readonly<{
  manifest: ReleaseManifest; manifestSha256: string; keyId: string; assetsVerified: true; deploymentsVerified: false; releaseEnabled: false;
}> }>;
export interface ReleaseBoundRegistry {
  readonly releaseId: string; readonly manifestSha256: string; readonly registryPath: string;
  readonly liveValidated: false; readonly releaseEnabled: false;
  network(id: string): NetworkV1 | null;
  deployment(networkId: string, deploymentId: string): DeploymentV1 | null;
}
export type ReleaseRegistryResult = Readonly<{ ok: false; error: Readonly<{ code: ReleaseErrorCode }> }> | Readonly<{ ok: true; value: ReleaseBoundRegistry }>;
interface ReleaseProof {
  readonly manifest: ReleaseManifest; readonly manifestSha256: string;
  readonly signal: unknown; readonly current: (() => boolean) | undefined; readonly clock: () => number;
  lastTime: number; failure: ReleaseErrorCode | undefined;
}
// Only successful local verifier results acquire identity. No raw assets, keys or signatures are retained.
const proofs = new WeakMap<object, ReleaseProof>();
/** Separate lexical scope: the retained bridge callback cannot capture verification buffers. */
function registerLiveResult(value: Extract<ReleaseResult, { ok: true }>['value']): void {
  registerReleaseProof(value, () => {
    try { checkProof(proofs.get(value)!); return Object.freeze({ ok: true as const, value }); }
    catch (error) { return Object.freeze({ ok: false as const, error: Object.freeze({ code: refusalCode(error, 'UNAVAILABLE') }) }); }
  });
}
const nativeUtcSeconds = (): number => Math.floor(Date.now() / 1000);
// Native brand check without instanceof or property reads on an arbitrary rejection.
function isNativeDataError(error: unknown): boolean {
  try {
    const getter = Object.getOwnPropertyDescriptor(DOMException.prototype, 'name')!.get!;
    return Reflect.apply(getter, error, []) === 'DataError';
  } catch { return false; }
}
// Identity branding avoids instanceof/property probes on arbitrary thrown proxy values.
const refusalCodes = new WeakMap<object, ReleaseErrorCode>();
class Rejected extends Error {
  readonly code: ReleaseErrorCode;
  constructor(code: ReleaseErrorCode) { super('Release verification refused.'); this.code = code; refusalCodes.set(this, code); }
}
const fail = (code: ReleaseErrorCode = 'MANIFEST_UNSUPPORTED'): never => { throw new Rejected(code); };
function refusalCode(error: unknown, fallback: ReleaseErrorCode): ReleaseErrorCode {
  return typeof error === 'object' && error !== null ? refusalCodes.get(error) ?? fallback : fallback;
}
function checkLifetime(signal: unknown, current: (() => boolean) | undefined): void {
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
  try {
    if (signal !== undefined && Reflect.apply(aborted, signal, []) === true || current && current() !== true) return fail('CANCELLED');
    // The trusted current callback may synchronously revoke the native signal.
    if (signal !== undefined && Reflect.apply(aborted, signal, []) === true) return fail('CANCELLED');
  } catch { return fail('CANCELLED'); }
}
function checkProof(proof: ReleaseProof): void {
  if (proof.failure) return fail(proof.failure);
  try {
    checkLifetime(proof.signal, proof.current);
    if (proof.failure) return fail(proof.failure);
    let now: unknown;
    try { now = proof.clock(); } catch { if (!proof.failure) checkLifetime(proof.signal, proof.current); return fail('UNAVAILABLE'); }
    if (proof.failure) return fail(proof.failure);
    checkLifetime(proof.signal, proof.current);
    if (proof.failure) return fail(proof.failure);
    if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0 || now < proof.lastTime) return fail('UNAVAILABLE');
    proof.lastTime = now;
    if (now >= proof.manifest.expiresAt) return fail('MANIFEST_EXPIRED');
    if (now < proof.manifest.createdAt) return fail();
  } catch (error) {
    let code: ReleaseErrorCode = refusalCode(error, 'UNAVAILABLE');
    if (!proof.failure) { try { checkLifetime(proof.signal, proof.current); } catch { code = 'CANCELLED'; } }
    code = proof.failure ?? code;
    proof.failure = code; return fail(code);
  }
}
type Data = Record<string, unknown>;
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
function array(value: unknown, max: number, code: ReleaseErrorCode = 'MANIFEST_UNSUPPORTED'): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail(code);
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > max || Reflect.ownKeys(value).length !== length + 1) return fail(code);
  return Array.from({ length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return fail(code);
    return descriptor.value as unknown;
  });
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return fail();
  return value;
}
function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function text(value: unknown, max = 128): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !wellFormed(value)) return fail();
  return value;
}
function hex(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return fail(); return value; }
function path(value: unknown): string {
  const result = text(value, 240);
  if (!/^[a-zA-Z0-9._/-]+$/.test(result) || result.startsWith('/') || result.split('/').some(part => !part || part === '.' || part === '..')) return fail();
  return result;
}
const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
const byteLength = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!;
const buffer = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!;
function bytes(value: unknown, max: number, code: ReleaseErrorCode): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Uint8Array.prototype) return fail(code);
  const length = Reflect.apply(byteLength, value, []) as number;
  const backing: unknown = Reflect.apply(buffer, value, []);
  if (!(backing instanceof ArrayBuffer) || length > max) return fail(code);
  const copy = new Uint8Array(length); Reflect.apply(Uint8Array.prototype.set, copy, [value]); return copy;
}
/** Only parsed JSON enters this function. It never calls a caller's toJSON/getters.
 * Canonical byte equality also rejects duplicate keys/escapes/numeric aliases lost by JSON.parse.
 * No normalization: property sorting uses ECMAScript UTF-16 order, as RFC8785 requires.
 */
function canonical(value: unknown, depth = 0, counter = { nodes: 0 }): string {
  if (depth > 8 || ++counter.nodes > 70_000) return fail();
  if (typeof value === 'string') { if (!wellFormed(value)) return fail(); return JSON.stringify(value); }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(item => canonical(item, depth + 1, counter)).join(',') + ']';
  if (typeof value !== 'object') return fail();
  return '{' + Object.keys(value).sort().map(key => {
    if (!wellFormed(key)) return fail();
    return JSON.stringify(key) + ':' + canonical((value as Data)[key], depth + 1, counter);
  }).join(',') + '}';
}
function manifest(raw: Uint8Array<ArrayBuffer>): ReleaseManifest {
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  // Bound nesting before JSON.parse allocates a deeply nested object graph. Quoted braces are inert.
  let depth = 0, quoted = false, escaped = false;
  for (const char of source) {
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') { if (++depth > 8) return fail(); }
    else if (char === ']' || char === '}') depth--;
  }
  const parsed: unknown = JSON.parse(source);
  if (canonical(parsed) !== source) return fail();
  const m = object(parsed, ['format', 'version', 'channel', 'sequence', 'releaseId', 'sourceCommit', 'buildRecipeDigest', 'lockfileDigest', 'sbomDigest', 'createdAt', 'expiresAt', 'minStorageSchema', 'maxStorageSchema', 'assets', 'deployments', 'predecessorDigest']);
  if (m.format !== 'p2p-offramp-release' || m.version !== 1) return fail();
  const channel = text(m.channel, 64), sequence = integer(m.sequence, 1), releaseId = text(m.releaseId);
  const sourceCommit = text(m.sourceCommit, 64); if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceCommit)) return fail();
  const createdAt = integer(m.createdAt), expiresAt = integer(m.expiresAt);
  if (expiresAt <= createdAt || expiresAt - createdAt > 30 * 86400) return fail();
  const minStorageSchema = integer(m.minStorageSchema), maxStorageSchema = integer(m.maxStorageSchema, minStorageSchema);
  const seen = new Set<string>(); let total = 0, previous = '';
  const assets = array(m.assets, RELEASE_LIMITS.assets).map(item => {
    const asset = object(item, ['path', 'bytes', 'sha256']), name = path(asset.path), length = integer(asset.bytes, 0, RELEASE_LIMITS.bundleBytes);
    if (name <= previous || seen.has(name.toLowerCase()) || (total += length) > RELEASE_LIMITS.bundleBytes) return fail();
    seen.add(name.toLowerCase()); previous = name;
    return Object.freeze({ path: name, bytes: length, sha256: hex(asset.sha256) });
  });
  if (array(m.deployments, RELEASE_LIMITS.assets).length) return fail();
  return Object.freeze({ format: 'p2p-offramp-release', version: 1, channel, sequence, releaseId, sourceCommit,
    buildRecipeDigest: hex(m.buildRecipeDigest), lockfileDigest: hex(m.lockfileDigest), sbomDigest: hex(m.sbomDigest), createdAt, expiresAt,
    minStorageSchema, maxStorageSchema, assets: Object.freeze(assets), deployments: Object.freeze([]), predecessorDigest: m.predecessorDigest === null ? null : hex(m.predecessorDigest) });
}
function publicKeys(input: unknown): JsonWebKey[] {
  try {
    return array(input, RELEASE_LIMITS.trustedKeys, 'KEY_UNTRUSTED').map(value => {
      const key = object(value, ['kty', 'crv', 'x', 'y', 'key_ops', 'ext'], [], 'KEY_UNTRUSTED');
      const ops = array(key.key_ops, 1, 'KEY_UNTRUSTED');
      if (key.kty !== 'EC' || key.crv !== 'P-256' || key.ext !== true || ops.length !== 1 || ops[0] !== 'verify') return fail('KEY_UNTRUSTED');
      decodeBase64url(key.x, 32, 32); decodeBase64url(key.y, 32, 32);
      return { kty: 'EC', crv: 'P-256', x: key.x as string, y: key.y as string, key_ops: ['verify'], ext: true };
    });
  } catch { return fail('KEY_UNTRUSTED'); }
}
function assetSnapshot(input: unknown): Map<string, Uint8Array<ArrayBuffer>> {
  try {
    const records = array(input, RELEASE_LIMITS.assets, 'ASSET_MISMATCH');
    const result = new Map<string, Uint8Array<ArrayBuffer>>(), folded = new Set<string>(); let remaining = RELEASE_LIMITS.bundleBytes;
    for (const item of records) {
      const asset = object(item, ['path', 'bytes'], [], 'ASSET_MISMATCH'), name = path(asset.path);
      if (folded.has(name.toLowerCase())) return fail('ASSET_MISMATCH');
      const content = bytes(asset.bytes, remaining, 'ASSET_MISMATCH'); remaining -= content.length;
      result.set(name, content); folded.add(name.toLowerCase());
    }
    return result;
  } catch { return fail('ASSET_MISMATCH'); }
}
// Public P-256 order from RFC6979 A.2.5. This is wire range validation, not ECDSA implementation.
const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
function signature(input: unknown): Uint8Array<ArrayBuffer> {
  try {
    const value = decodeBase64url(input, 64, 64);
    for (const start of [0, 32]) { let scalar = 0n; for (let i = start; i < start + 32; i++) scalar = scalar * 256n + BigInt(value[i]!); if (scalar === 0n || scalar >= P256_ORDER) return fail('SIGNATURE_INVALID'); }
    return new Uint8Array(value);
  } catch { return fail('SIGNATURE_INVALID'); }
}
const encoder = new TextEncoder();
const domain = encoder.encode('p2p-offramp/release/v1\n');
/** Caller supplies the independently trusted key set, expected channel and retained sequence/digest.
 * This function verifies only the supported offline manifest/asset profile. It never promotes/installs,
 * persists rollback state, treats an adjacent key as trusted, or authenticates the initial JS host.
 */
export async function verifyRelease(input: unknown, detached: unknown, trustedKeys: unknown, highestSequence: unknown, options: ReleaseCheckOptions): Promise<ReleaseResult> {
  let lifetime = (): void => undefined;
  try {
    const opts = object(options, ['channel', 'assets'], ['nowSeconds', 'signal', 'isCurrent', 'installedManifestSha256']);
    const expectedChannel = text(opts.channel, 64), highest = integer(highestSequence);
    if (opts.nowSeconds !== undefined && typeof opts.nowSeconds !== 'function' || opts.isCurrent !== undefined && typeof opts.isCurrent !== 'function') return fail();
    const signal = opts.signal, current = opts.isCurrent as (() => boolean) | undefined;
    lifetime = () => checkLifetime(signal, current);
    lifetime();
    const raw = bytes(input, RELEASE_LIMITS.manifestBytes, 'MANIFEST_UNSUPPORTED'), env = object(detached, ['v', 'keyId', 'alg', 'manifestSha256', 'signature']);
    if (env.v !== 1 || env.alg !== 'ES256-P1363') return fail();
    const keyId = hex(env.keyId), expectedDigest = hex(env.manifestSha256), sig = signature(env.signature);
    const keys = publicKeys(trustedKeys), actualAssets = assetSnapshot(opts.assets), m = manifest(raw);
    const installedDigest = opts.installedManifestSha256 === undefined ? undefined : hex(opts.installedManifestSha256);
    const clock = (opts.nowSeconds as (() => number) | undefined) ?? nativeUtcSeconds; let lastTime = -1;
    const guard = (): void => {
      lifetime(); let now: unknown;
      try { now = clock(); } catch { lifetime(); return fail('UNAVAILABLE'); }
      lifetime();
      if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0 || now < lastTime) return fail('UNAVAILABLE');
      lastTime = now;
      if (now >= m.expiresAt) return fail('MANIFEST_EXPIRED');
      if (now < m.createdAt || m.channel !== expectedChannel) return fail();
    };
    guard();
    const subtle = globalThis.crypto?.subtle; if (!subtle) return fail('UNAVAILABLE');
    const hash = async (value: Uint8Array<ArrayBuffer>): Promise<string> => {
      let digest: ArrayBuffer;
      try { digest = await subtle.digest('SHA-256', value); } catch { lifetime(); return fail('UNAVAILABLE'); }
      guard(); if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) return fail('UNAVAILABLE');
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    };
    const digest = await hash(raw);
    if (digest !== expectedDigest) return fail('SIGNATURE_INVALID');
    if (m.sequence < highest || m.sequence === highest && digest !== installedDigest) return fail('RELEASE_ROLLBACK');
    let selected: JsonWebKey | undefined;
    for (const key of keys) if (await hash(encoder.encode(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y }))) === keyId) { selected = key; break; }
    if (!selected) return fail('KEY_UNTRUSTED');
    let key: CryptoKey;
    try { key = await subtle.importKey('jwk', selected, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }
    catch (error) { lifetime(); return fail(isNativeDataError(error) ? 'KEY_UNTRUSTED' : 'UNAVAILABLE'); }
    guard();
    const payload = new Uint8Array(domain.length + raw.length); payload.set(domain); payload.set(raw, domain.length);
    let valid: boolean;
    try { valid = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, payload); } catch { lifetime(); return fail('UNAVAILABLE'); }
    guard(); if (!valid) return fail('SIGNATURE_INVALID');
    if (actualAssets.size !== m.assets.length) return fail('ASSET_MISMATCH');
    for (const asset of m.assets) {
      const content = actualAssets.get(asset.path);
      if (!content || content.length !== asset.bytes || await hash(content) !== asset.sha256) return fail('ASSET_MISMATCH');
    }
    guard();
    const value = Object.freeze({ manifest: m, manifestSha256: digest, keyId, assetsVerified: true as const, deploymentsVerified: false as const, releaseEnabled: false as const });
    proofs.set(value, { manifest: m, manifestSha256: digest, signal, current, clock, lastTime, failure: undefined });
    registerLiveResult(value);
    return Object.freeze({ ok: true, value });
  } catch (error) {
    let code: ReleaseErrorCode = refusalCode(error, 'MANIFEST_UNSUPPORTED');
    try { lifetime(); } catch { code = 'CANCELLED'; }
    return Object.freeze({ ok: false, error: Object.freeze({ code }) });
  }
}

/** Wrap in a separate scope: retain parsed public registry data and the small lease, never raw assets. */
function guardedRegistry(service: RegistryService, proof: ReleaseProof, registryPath: string): ReleaseBoundRegistry {
  return Object.freeze({ releaseId: proof.manifest.releaseId, manifestSha256: proof.manifestSha256, registryPath, liveValidated: false, releaseEnabled: false,
    network(id: string): NetworkV1 | null {
      try { checkProof(proof); const value = service.network(id); checkProof(proof); return value; } catch { return null; }
    },
    deployment(networkId: string, deploymentId: string): DeploymentV1 | null {
      try { checkProof(proof); const value = service.deployment(networkId, deploymentId); checkProof(proof); return value; } catch { return null; }
    } });
}
/** G15→G11 offline composition. registryPath is the composition root's expected artifact location,
 * not an automatically selected/scanned JSON file. Only the exact in-memory verifier value is accepted;
 * serialized/cloned projections have no authority. Callers must recheck current lookups before use and
 * invalidate their proof context when trust/channel/update authority changes. No live-chain grant exists.
 */
export async function createReleaseRegistry(verified: unknown, registryPath: unknown, input: unknown): Promise<ReleaseRegistryResult> {
  let proof: ReleaseProof | undefined;
  try {
    if (typeof verified !== 'object' || verified === null || !(proof = proofs.get(verified))) return fail();
    checkProof(proof);
    let name: string;
    try { name = path(registryPath); } catch { return fail('ASSET_MISMATCH'); }
    const expected = proof.manifest.assets.find(asset => asset.path === name);
    if (!expected) return fail('ASSET_MISMATCH');
    const raw = bytes(input, MAX_REGISTRY_BYTES, 'ASSET_MISMATCH');
    if (raw.length !== expected.bytes) return fail('ASSET_MISMATCH');
    const service = new RegistryService(), loaded = await service.load(raw, expected.sha256);
    checkProof(proof);
    if (!loaded.ok) return fail(loaded.error.code === 'INTEGRITY_FAILURE' ? 'ASSET_MISMATCH' : loaded.error.code === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'MANIFEST_UNSUPPORTED');
    if (loaded.value.releaseId !== proof.manifest.releaseId) return fail();
    return Object.freeze({ ok: true, value: guardedRegistry(service, proof, name) });
  } catch (error) {
    let code: ReleaseErrorCode = refusalCode(error, 'UNAVAILABLE');
    if (proof) { try { checkProof(proof); } catch (guardError) { code = refusalCode(guardError, 'UNAVAILABLE'); } }
    return Object.freeze({ ok: false, error: Object.freeze({ code }) });
  }
}
