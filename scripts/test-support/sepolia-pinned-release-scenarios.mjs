/**
 * TEST ONLY: run through with-test-sepolia-pin.mjs. For each prepared trust root it calls the ordinary entry points with
 * their default (source) pin and no other override: verifyTestnetTrust (sepolia:verify, trade tool), verifySepoliaRelease,
 * loadTestnetTrust (testnet build), sepoliaRegistrySource (app runtime) and buildConfiguredEvmRecovery (maintained
 * recovery builder). Any network attempt is counted; none is expected. Returns one row of outcome codes per case.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { loadTestnetTrust, TESTNET_TRUST_FILES, verifyTestnetTrust } from '../../apps/web/scripts/testnet-trust.mjs';
import { sepoliaRegistrySource } from '../../apps/web/src/testnet/sepolia-source.ts';
import { SEPOLIA_RELEASE_KEY_ID } from '../../apps/web/src/testnet/sepolia-network.ts';
import { buildConfiguredEvmRecovery } from '../recovery/build-evm.mjs';
import { verifySepoliaRelease } from '../sepolia/verify-release.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const optional = path => readFile(path).then(bytes => sha(bytes), () => null);

/** The bundle exactly as the build would embed it (v2, or the legacy registry-only v1 shape), without the build's checks. */
async function bundleFrom(root, legacy) {
  const read = path => readFile(resolve(root, path));
  const trusted = JSON.parse(await read(TESTNET_TRUST_FILES.key));
  const common = { keyId: trusted.keyId, publicKey: trusted.publicKey, registry: (await read(TESTNET_TRUST_FILES.registry)).toString('base64url'),
    manifest: (await read(TESTNET_TRUST_FILES.manifest)).toString('base64url'), envelope: JSON.parse(await read(TESTNET_TRUST_FILES.envelope)) };
  return legacy ? { format: 'p2p-offramp/testnet-trust/v1', ...common }
    : { format: 'p2p-offramp/testnet-trust/v2', ...common, abi: (await read(TESTNET_TRUST_FILES.abi)).toString('base64url') };
}

export default async function run({ cases }) {
  let fetches = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { fetches++; return realFetch(...args); };
  const rows = {};
  try {
    for (const item of cases) {
      // Absolute paths only: a relative output directory would land in the checkout this child runs from.
      if (!isAbsolute(item.root) || !isAbsolute(item.outDir)) throw new Error('SCENARIO_PATH_NOT_ABSOLUTE');
      const row = {};
      const verified = await verifyTestnetTrust(item.root);
      row.verify = verified.ok ? 'ok' : verified.error.code;
      const cli = await verifySepoliaRelease({ root: item.root, ...(item.deploymentId === undefined ? {} : { deploymentId: item.deploymentId }) });
      row.sepoliaVerify = cli.ok ? 'ok' : cli.error.code;
      try { await loadTestnetTrust(item.root); row.build = 'ok'; } catch (error) { row.build = error.message; }
      row.runtime = (await sepoliaRegistrySource(await bundleFrom(item.root, item.legacyBundle === true))()).kind;
      const before = await optional(resolve(item.outDir, 'checksums.json'));
      try {
        const built = await buildConfiguredEvmRecovery({ outDir: item.outDir, root: item.root, ...(item.deploymentId === undefined ? {} : { deploymentId: item.deploymentId }) });
        row.package = 'ok';
        row.profile = { networkId: built.profile.networkId, deploymentId: built.profile.deploymentId, release: built.profile.release,
          registrySha256: built.profile.registry.sha256, abiSha256: built.profile.abi.sha256 };
        row.files = built.files.map(file => file.path);
      } catch (error) { row.package = error?.code ?? 'THREW'; }
      if (before !== null) row.existingPackageUnchanged = before === await optional(resolve(item.outDir, 'checksums.json'));
      rows[item.name] = row;
    }
  } finally { globalThis.fetch = realFetch; }
  return { pin: SEPOLIA_RELEASE_KEY_ID, fetches, rows };
}
