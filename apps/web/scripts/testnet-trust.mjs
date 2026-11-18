/**
 * Build-time loader for the Sepolia testnet trust bundle (testnet build only). Reads the owner's public testnet key,
 * the registry, the canonical escrow ABI and their signed G15 manifest from the repository, verifies them with the app's
 * own verifier before the build starts, and returns the bundle the build embeds. Missing or invalid inputs stop the build
 * (fail closed). `verifyTestnetTrust` is the single verifier shared with scripts/sepolia (sepolia:verify and the trade
 * tool): the signature, the independently pinned keyId (an unset pin refuses verification), the exact two-asset set
 * (registry and ABI, D3 Option A), the canonical ABI and the Sepolia-only network rule are checked the same way everywhere.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createReleaseRegistry, verifyRelease } from '../../../packages/security/index.ts';
import { parseRegistryBytes } from '../../../packages/schemas/index.ts';
import { isPinnedReleaseKey, isSepoliaOnly, SEPOLIA_RELEASE_ASSETS, SEPOLIA_RELEASE_CHANNEL, SEPOLIA_RELEASE_KEY_ID } from '../src/testnet/sepolia-network.ts';

/**
 * Embedded bundle format. PROPOSAL pending owner approval (D3 leaves the name to the owner): v2 adds the signed ABI bytes
 * so that one two-asset manifest verifies at build time and at runtime. Registry-only v1 bundles are refused; none was
 * ever committed or shipped. Must equal TESTNET_TRUST_FORMAT in apps/web/src/testnet/sepolia-source.ts.
 */
export const TESTNET_TRUST_FORMAT = 'p2p-offramp/testnet-trust/v2';
/** Every bundle version shares this prefix; the build-policy scan refuses any of them outside the testnet artifact. */
export const TESTNET_TRUST_FORMAT_PREFIX = 'p2p-offramp/testnet-trust/';
export const TESTNET_TRUST_FILES = Object.freeze({
  key: 'security/testnet-trust/sepolia-release-key.pub.json',
  registry: SEPOLIA_RELEASE_ASSETS.registry,
  abi: SEPOLIA_RELEASE_ASSETS.abi,
  manifest: 'registry/testnet/sepolia.release.json',
  envelope: 'registry/testnet/sepolia.release.sig.json',
});
/** Optional record of the last accepted release ({sequence, manifestSha256}); written by `sepolia:verify -- --accept`. */
export const TESTNET_ACCEPTED_FILE = 'registry/testnet/sepolia.accepted.json';
/** The ABI committed in this checkout. The maintained recovery builder packages only this ABI, so a release must sign it. */
const CANONICAL_ABI = new URL('../../../contracts/evm/abi/BasicEscrow.json', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** The recorded accepted release, null when none was recorded yet; throws on a malformed record. */
async function acceptedRelease(root) {
  let text;
  try { text = await readFile(resolve(root, TESTNET_ACCEPTED_FILE), 'utf8'); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  const value = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Object.keys(value).sort().join() !== 'manifestSha256,sequence' ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !/^[0-9a-f]{64}$/.test(value.manifestSha256)) throw new Error('ACCEPTED_INVALID');
  return value;
}

/**
 * Verifies the trust files under `root`: G15 signature by the independently pinned key, its keyId, the exact asset set
 * {registry, ABI}, the canonical ABI, then the Sepolia-only rule. When a release was accepted before (TESTNET_ACCEPTED_FILE),
 * a lower sequence, or another manifest at the accepted sequence, is RELEASE_ROLLBACK (G25 §4.3). Never throws for bad
 * input; failure codes are KEY_UNPINNED, MISSING, JSON, ACCEPTED_INVALID, KEY_ID, NETWORK or a G15 code (a registry-only
 * manifest, a manifest naming an unsupplied asset, edited bytes or a non-canonical ABI are ASSET_MISMATCH).
 * `genesisHash` is overridable only by local proofs on a node started with Sepolia's chain id.
 */
export async function verifyTestnetTrust(root, { nowSeconds = () => Math.floor(Date.now() / 1000), highestSequence = 0, genesisHash, pinnedKeyId = SEPOLIA_RELEASE_KEY_ID } = {}) {
  const failed = code => ({ ok: false, error: { code } });
  if (pinnedKeyId === null) return failed('KEY_UNPINNED');
  if (!isPinnedReleaseKey(pinnedKeyId, pinnedKeyId)) return failed('KEY_ID');
  let key, registry, abi, manifest, envelope;
  try {
    [key, registry, abi, manifest, envelope] = await Promise.all([TESTNET_TRUST_FILES.key, TESTNET_TRUST_FILES.registry, TESTNET_TRUST_FILES.abi,
      TESTNET_TRUST_FILES.manifest, TESTNET_TRUST_FILES.envelope].map(path => readFile(resolve(root, path))));
  } catch { return failed('MISSING'); }
  let trusted, signature, accepted;
  try { trusted = JSON.parse(key.toString('utf8')); signature = JSON.parse(envelope.toString('utf8')); } catch { return failed('JSON'); }
  try { accepted = await acceptedRelease(root); } catch { return failed('ACCEPTED_INVALID'); }
  const highest = Math.max(highestSequence, accepted?.sequence ?? 0);
  const verified = await verifyRelease(new Uint8Array(manifest), signature, [trusted?.publicKey], highest,
    { channel: SEPOLIA_RELEASE_CHANNEL, assets: [{ path: TESTNET_TRUST_FILES.registry, bytes: new Uint8Array(registry) }, { path: TESTNET_TRUST_FILES.abi, bytes: new Uint8Array(abi) }],
      nowSeconds, ...(accepted && accepted.sequence === highest ? { installedManifestSha256: accepted.manifestSha256 } : {}) });
  if (!verified.ok) return failed(verified.error.code);
  // The announced keyId and the public key must name the same key: neither half of the file can be swapped alone.
  if (typeof trusted.keyId !== 'string' || !/^[0-9a-f]{64}$/.test(trusted.keyId) || verified.value.keyId !== trusted.keyId) return failed('KEY_ID');
  if (!isPinnedReleaseKey(verified.value.keyId, pinnedKeyId)) return failed('KEY_ID');
  // A signed ABI other than the committed one could never be packaged by the recovery builder (build-evm.mjs), which
  // compares bytes with that file: refuse it here too, so an accepted release is always packageable.
  if (!abi.equals(await readFile(CANONICAL_ABI))) return failed('ASSET_MISMATCH');
  const bound = await createReleaseRegistry(verified.value, TESTNET_TRUST_FILES.registry, new Uint8Array(registry));
  if (!bound.ok) return failed(bound.error.code);
  // The bytes matched the signed manifest; the registry must name exactly Sepolia (chain id and genesis), whatever its labels say.
  let parsed;
  try { parsed = parseRegistryBytes(new Uint8Array(registry)); } catch { return failed('NETWORK'); }
  if (!isSepoliaOnly(parsed, genesisHash)) return failed('NETWORK');
  return { ok: true, value: { keyPinned: pinnedKeyId !== null, trusted, signature, registryBytes: registry, abiBytes: abi, manifestBytes: manifest, verified: verified.value, registry: bound.value } };
}

export async function loadTestnetTrust(root, { nowSeconds = () => Math.floor(Date.now() / 1000), pinnedKeyId = SEPOLIA_RELEASE_KEY_ID } = {}) {
  const checked = await verifyTestnetTrust(root, { nowSeconds, pinnedKeyId });
  if (!checked.ok) throw new Error(checked.error.code === 'MISSING' ? 'TESTNET_TRUST_MISSING' : `TESTNET_TRUST_INVALID: ${checked.error.code}`);
  const { keyPinned, trusted, signature, registryBytes: registry, abiBytes: abi, manifestBytes: manifest, verified: { manifest: signed, manifestSha256 } } = checked.value;
  const bundle = { format: TESTNET_TRUST_FORMAT, keyId: trusted.keyId, publicKey: trusted.publicKey,
    registry: registry.toString('base64url'), abi: abi.toString('base64url'), manifest: manifest.toString('base64url'), envelope: signature };
  const summary = { keyId: trusted.keyId, keyPinned, sequence: signed.sequence, expiresAt: signed.expiresAt, registrySha256: sha(registry), abiSha256: sha(abi), manifestSha256 };
  return { bundle, summary };
}
