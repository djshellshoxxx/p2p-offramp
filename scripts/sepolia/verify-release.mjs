#!/usr/bin/env node
/**
 * Verify the signed Sepolia testnet release (G15) and the registry it covers (G11) against the trusted testnet public
 * key with the same verifier the testnet build uses (apps/web/scripts/testnet-trust.mjs): signature, pinned keyId,
 * registry asset and the Sepolia-only network rule. Read-only; needs no network and no private key.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/verify-release.mjs
 */
import { TESTNET_TRUST_FILES, verifyTestnetTrust } from '../../apps/web/scripts/testnet-trust.mjs';
import { ROOT } from './lib.mjs';

export const TRUSTED_KEY_PATH = TESTNET_TRUST_FILES.key;
const CODES = Object.freeze({ MISSING: 'RELEASE_MISSING', JSON: 'RELEASE_UNREADABLE', KEY_ID: 'KEY_UNTRUSTED', NETWORK: 'NETWORK_NOT_SEPOLIA' });

/**
 * Verifies the signed release and returns the guarded registry (a RegistryLookup bound to the verified manifest).
 * `expectGenesis` is for the local proofs on a node started with Sepolia's chain id; it defaults to real Sepolia.
 */
export async function loadVerifiedRegistry({ root = ROOT, nowSeconds, highestSequence = 0, expectGenesis } = {}) {
  const checked = await verifyTestnetTrust(root, { ...(nowSeconds ? { nowSeconds } : {}), highestSequence, genesisHash: expectGenesis });
  if (!checked.ok) return { ok: false, error: { code: CODES[checked.error.code] ?? checked.error.code } };
  const { registry, verified } = checked.value;
  return { ok: true, value: { registry, keyId: verified.keyId, sequence: verified.manifest.sequence,
    manifestSha256: verified.manifestSha256, releaseEnabled: verified.releaseEnabled } };
}

export async function verifySepoliaRelease(options = {}) {
  const loaded = await loadVerifiedRegistry(options);
  if (!loaded.ok) return loaded;
  const deployment = loaded.value.registry.deployment('sepolia', 'escrow-sepolia-v1');
  if (!deployment) return { ok: false, error: { code: 'ASSET_MISMATCH' } };
  return { ok: true, value: { keyId: loaded.value.keyId, sequence: loaded.value.sequence, manifestSha256: loaded.value.manifestSha256,
    escrow: deployment.address, runtimeKeccak: deployment.runtime.keccak256, releaseEnabled: loaded.value.releaseEnabled } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await verifySepoliaRelease();
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
