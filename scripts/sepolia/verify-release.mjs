#!/usr/bin/env node
/**
 * Verify the signed Sepolia testnet release (G15) and the registry it covers (G11) against the trusted testnet public
 * key, using the app's own verifier modules. Read-only; needs no network and no private key.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/verify-release.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReleaseRegistry, verifyRelease } from '../../packages/security/src/release-manifest.ts';
import { CHANNEL, REGISTRY_ASSET } from './owner-release.mjs';
import { ROOT } from './lib.mjs';

export const TRUSTED_KEY_PATH = 'security/testnet-trust/sepolia-release-key.pub.json';

export async function verifySepoliaRelease({ root = ROOT, nowSeconds, highestSequence = 0 } = {}) {
  const read = path => readFile(resolve(root, path));
  const trusted = JSON.parse(new TextDecoder().decode(await read(TRUSTED_KEY_PATH)));
  const manifest = new Uint8Array(await read('registry/testnet/sepolia.release.json'));
  const envelope = JSON.parse(new TextDecoder().decode(await read('registry/testnet/sepolia.release.sig.json')));
  const registry = new Uint8Array(await read(REGISTRY_ASSET));
  const verified = await verifyRelease(manifest, envelope, [trusted.publicKey], highestSequence,
    { channel: CHANNEL, assets: [{ path: REGISTRY_ASSET, bytes: registry }], ...(nowSeconds ? { nowSeconds } : {}) });
  if (!verified.ok) return verified;
  const bound = await createReleaseRegistry(verified.value, REGISTRY_ASSET, registry);
  if (!bound.ok) return bound;
  const deployment = bound.value.deployment('sepolia', 'escrow-sepolia-v1');
  if (!deployment) return { ok: false, error: { code: 'ASSET_MISMATCH' } };
  return { ok: true, value: { keyId: verified.value.keyId, sequence: verified.value.manifest.sequence, manifestSha256: verified.value.manifestSha256,
    escrow: deployment.address, runtimeKeccak: deployment.runtime.keccak256, releaseEnabled: verified.value.releaseEnabled } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await verifySepoliaRelease();
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
