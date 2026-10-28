/**
 * Build-time loader for the Sepolia testnet trust bundle (testnet build only). Reads the owner's public testnet key,
 * the registry and its signed G15 manifest from the repository, verifies them with the app's own verifier before the
 * build starts, and returns the bundle the build embeds. Missing or invalid inputs stop the build (fail closed).
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createReleaseRegistry, verifyRelease } from '../../../packages/security/index.ts';

export const TESTNET_TRUST_FORMAT = 'p2p-offramp/testnet-trust/v1';
export const TESTNET_TRUST_FILES = Object.freeze({
  key: 'security/testnet-trust/sepolia-release-key.pub.json',
  registry: 'registry/testnet/sepolia.registry.json',
  manifest: 'registry/testnet/sepolia.release.json',
  envelope: 'registry/testnet/sepolia.release.sig.json',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadTestnetTrust(root, { nowSeconds = () => Math.floor(Date.now() / 1000) } = {}) {
  let key, registry, manifest, envelope;
  try {
    [key, registry, manifest, envelope] = await Promise.all(Object.values(TESTNET_TRUST_FILES).map(path => readFile(resolve(root, path))));
  } catch { throw new Error('TESTNET_TRUST_MISSING'); }
  let trusted, signature;
  try { trusted = JSON.parse(key.toString('utf8')); signature = JSON.parse(envelope.toString('utf8')); } catch { throw new Error('TESTNET_TRUST_INVALID: JSON'); }
  const verified = await verifyRelease(new Uint8Array(manifest), signature, [trusted?.publicKey], 0,
    { channel: 'sepolia-testnet', assets: [{ path: TESTNET_TRUST_FILES.registry, bytes: new Uint8Array(registry) }], nowSeconds });
  if (!verified.ok) throw new Error(`TESTNET_TRUST_INVALID: ${verified.error.code}`);
  if (verified.value.keyId !== trusted.keyId) throw new Error('TESTNET_TRUST_INVALID: KEY_ID');
  const bound = await createReleaseRegistry(verified.value, TESTNET_TRUST_FILES.registry, new Uint8Array(registry));
  if (!bound.ok) throw new Error(`TESTNET_TRUST_INVALID: ${bound.error.code}`);
  const network = bound.value.network('sepolia');
  if (!network || network.environment !== 'testnet' || network.chainIdentity !== '11155111') throw new Error('TESTNET_TRUST_INVALID: NETWORK');
  const bundle = { format: TESTNET_TRUST_FORMAT, keyId: trusted.keyId, publicKey: trusted.publicKey,
    registry: registry.toString('base64url'), manifest: manifest.toString('base64url'), envelope: signature };
  const summary = { keyId: trusted.keyId, sequence: verified.value.manifest.sequence, expiresAt: verified.value.manifest.expiresAt,
    registrySha256: sha(registry), manifestSha256: verified.value.manifestSha256 };
  return { bundle, summary };
}
