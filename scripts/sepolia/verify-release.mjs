#!/usr/bin/env node
/**
 * Verify the signed Sepolia testnet release (G15) and the registry it covers (G11) against the trusted testnet public
 * key with the same verifier the testnet build uses (apps/web/scripts/testnet-trust.mjs): signature, independently pinned keyId (an unset owner pin refuses verification),
 * registry asset, the Sepolia-only network rule and rollback against the last accepted release. Needs no network and
 * no private key. With --accept it records the verified release as accepted (registry/testnet/sepolia.accepted.json,
 * commit it), so an older or substituted signed registry is refused from then on.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/verify-release.mjs [--deployment-id escrow-sepolia-v1] [--accept]
 *
 * The signed release must cover both assets, the registry and the canonical escrow ABI (D3 Option A, PROPOSED). The
 * output lists every signed deployment; `--deployment-id` (CLI default escrow-sepolia-v1) must be one of them.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TESTNET_ACCEPTED_FILE, TESTNET_TRUST_FILES, verifyTestnetTrust } from '../../apps/web/scripts/testnet-trust.mjs';
import { CLI_DEFAULT_DEPLOYMENT_ID, isDeploymentId, isMain, parseSingleOptions, ROOT } from './lib.mjs';

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

/**
 * Verifies the signed release and lists its deployments. With `deploymentId`, that deployment must be signed
 * (DEPLOYMENT_UNKNOWN otherwise) and its escrow address and runtime keccak are returned as `escrow` and `runtimeKeccak`.
 */
export async function verifySepoliaRelease({ deploymentId, ...options } = {}) {
  const loaded = await loadVerifiedRegistry(options);
  if (!loaded.ok) return loaded;
  const network = loaded.value.registry.network('sepolia');
  if (!network) return { ok: false, error: { code: 'NETWORK_NOT_SEPOLIA' } };
  const value = { keyId: loaded.value.keyId, sequence: loaded.value.sequence, manifestSha256: loaded.value.manifestSha256,
    deployments: network.deployments.map(item => ({ id: item.id, address: item.address, runtimeKeccak: item.runtime.keccak256 ?? null })), releaseEnabled: loaded.value.releaseEnabled };
  if (deploymentId === undefined) return { ok: true, value };
  if (!isDeploymentId(deploymentId)) return { ok: false, error: { code: 'DEPLOYMENT_ID_INVALID' } };
  const deployment = loaded.value.registry.deployment('sepolia', deploymentId);
  if (!deployment) return { ok: false, error: { code: 'DEPLOYMENT_UNKNOWN' } };
  return { ok: true, value: { ...value, deploymentId, escrow: deployment.address, runtimeKeccak: deployment.runtime.keccak256 } };
}

/** Records a verified release as accepted; verification already refused any rollback against the previous record. */
export async function acceptSepoliaRelease(verified, { root = ROOT } = {}) {
  if (!verified?.ok) throw new Error('NOT_VERIFIED');
  await writeFile(resolve(root, TESTNET_ACCEPTED_FILE), JSON.stringify({ sequence: verified.value.sequence, manifestSha256: verified.value.manifestSha256 }, null, 2) + '\n');
}

if (isMain(import.meta.url)) {
  const { values, repeated } = parseSingleOptions({ options: { accept: { type: 'boolean' }, 'deployment-id': { type: 'string', default: CLI_DEFAULT_DEPLOYMENT_ID } } });
  const result = repeated ? { ok: false, error: { code: 'OPTION_REPEATED' } } : await verifySepoliaRelease({ deploymentId: values['deployment-id'] });
  if (result.ok && values.accept) await acceptSepoliaRelease(result);
  console.log(JSON.stringify({ ...result, ...(result.ok && values.accept ? { accepted: TESTNET_ACCEPTED_FILE } : {}) }));
  if (!result.ok) process.exitCode = 1;
}
