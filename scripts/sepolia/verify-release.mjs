#!/usr/bin/env node
/**
 * Verify the signed Sepolia testnet release (G15) and the registry it covers (G11) against the trusted testnet public
 * key with the same verifier the testnet build uses (apps/web/scripts/testnet-trust.mjs): signature, independently pinned keyId (an unset owner pin refuses verification),
 * registry asset, the Sepolia-only network rule and rollback against the last accepted release. Needs no network and
 * no private key. With --accept it records the verified release as accepted (registry/testnet/sepolia.accepted.json,
 * commit it), so an older or substituted signed registry is refused from then on.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/verify-release.mjs [--accept]
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { TESTNET_ACCEPTED_FILE, TESTNET_TRUST_FILES, verifyTestnetTrust } from '../../apps/web/scripts/testnet-trust.mjs';
import { isMain, ROOT } from './lib.mjs';

export const TRUSTED_KEY_PATH = TESTNET_TRUST_FILES.key;
const CODES = Object.freeze({ MISSING: 'RELEASE_MISSING', JSON: 'RELEASE_UNREADABLE', KEY_ID: 'KEY_UNTRUSTED', NETWORK: 'NETWORK_NOT_SEPOLIA' });

/**
 * Verifies the signed release and returns the guarded registry (a RegistryLookup bound to the verified manifest).
 * `expectGenesis` is for the local proofs on a node started with Sepolia's chain id; it defaults to real Sepolia.
 */
export async function loadVerifiedRegistry({ root = ROOT, nowSeconds, highestSequence = 0, expectGenesis, pinnedKeyId } = {}) {
  const checked = await verifyTestnetTrust(root, { ...(nowSeconds ? { nowSeconds } : {}), highestSequence, genesisHash: expectGenesis, ...(pinnedKeyId !== undefined ? { pinnedKeyId } : {}) });
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

/** Records a verified release as accepted; verification already refused any rollback against the previous record. */
export async function acceptSepoliaRelease(verified, { root = ROOT } = {}) {
  if (!verified?.ok) throw new Error('NOT_VERIFIED');
  await writeFile(resolve(root, TESTNET_ACCEPTED_FILE), JSON.stringify({ sequence: verified.value.sequence, manifestSha256: verified.value.manifestSha256 }, null, 2) + '\n');
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { accept: { type: 'boolean' } } });
  const result = await verifySepoliaRelease();
  if (result.ok && values.accept) await acceptSepoliaRelease(result);
  console.log(JSON.stringify({ ...result, ...(result.ok && values.accept ? { accepted: TESTNET_ACCEPTED_FILE } : {}) }));
  if (!result.ok) process.exitCode = 1;
}
