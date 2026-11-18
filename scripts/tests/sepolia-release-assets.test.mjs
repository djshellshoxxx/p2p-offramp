/**
 * D3 Option A (PROPOSED) acceptance checks 1-3 and 7 for the Sepolia testnet release, offline. With the committed
 * null pin every ordinary path refuses before reading inputs. Under a test-only pin (a child process whose module graph
 * reads an ephemeral keyId; see scripts/test-support/with-test-sepolia-pin.mjs), ONE manifest over the registry and the
 * canonical ABI passes the testnet build loader, sepolia:verify, the app runtime and buildConfiguredEvmRecovery, and
 * every adversarial manifest, key, clock, rollback or edit is refused by all of them. Synthetic keys only; no RPC.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fsPromises, { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { keygen } from '../sepolia/owner-release.mjs';
import { fixtureRegistry, writeTestnetTrust } from '../lib/testnet-fixture.mjs';
import { loadTestnetTrust, TESTNET_ACCEPTED_FILE, TESTNET_TRUST_FILES, verifyTestnetTrust } from '../../apps/web/scripts/testnet-trust.mjs';
import { sepoliaRegistrySource } from '../../apps/web/src/testnet/sepolia-source.ts';
import { SEPOLIA_RELEASE_KEY_ID } from '../../apps/web/src/testnet/sepolia-network.ts';
import { buildConfiguredEvmRecovery } from '../recovery/build-evm.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);
const NOW = Math.floor(Date.now() / 1000);
const CANONICAL_ABI = await readFile(resolve(ROOT, TESTNET_TRUST_FILES.abi));
const V2 = { id: 'escrow-sepolia-v2', address: `0x${'7a'.repeat(20)}`, protocolVersion: 1, artifactSha256: 'd'.repeat(64),
  runtime: { kind: 'evm-code', keccak256: 'e'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] };
const twoDeployments = () => { const registry = fixtureRegistry(); registry.networks[0].deployments.push(V2); return registry; };
const onlyRegistry = manifest => { manifest.assets = manifest.assets.filter(asset => asset.path === TESTNET_TRUST_FILES.registry); };

test('D3 check 1: with the committed null pin every ordinary path refuses KEY_UNPINNED, the builder before reading any file', async t => {
  assert.equal(SEPOLIA_RELEASE_KEY_ID, null, 'the real Sepolia pin stays unset in this change');
  const root = await mkdtemp(resolve(tmpdir(), 'p2p-null-pin-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeTestnetTrust(root);
  const original = fsPromises.readFile; let reads = 0;
  fsPromises.readFile = async function (...args) { reads++; return original.apply(this, args); }; syncBuiltinESMExports();
  try {
    await assert.rejects(buildConfiguredEvmRecovery({ outDir: resolve(root, 'package'), root, deploymentId: 'escrow-sepolia-v1' }), error => error.code === 'KEY_UNPINNED');
    assert.equal(reads, 0, 'KEY_UNPINNED precedes every file read');
  } finally { fsPromises.readFile = original; syncBuiltinESMExports(); }
  assert.deepEqual(await verifyTestnetTrust(root), { ok: false, error: { code: 'KEY_UNPINNED' } });
  await assert.rejects(loadTestnetTrust(root), /^Error: TESTNET_TRUST_INVALID: KEY_UNPINNED$/);
  const bundle = (await loadTestnetTrust(root, { pinnedKeyId: JSON.parse(await readFile(resolve(root, TESTNET_TRUST_FILES.key), 'utf8')).keyId })).bundle;
  assert.deepEqual(await sepoliaRegistrySource(bundle)(), { kind: 'failed' }, 'the runtime refuses with the default (null) pin');
});

test('D3 checks 2-3: one two-asset manifest passes every verifier under a test-only pin; every adversarial input is refused by all of them', { timeout: 300_000 }, async t => {
  const base = await mkdtemp(resolve(tmpdir(), 'p2p-pinned-release-')); t.after(() => rm(base, { recursive: true, force: true }));
  const owner = keygen(), stranger = keygen();
  const roots = {}, cases = [];
  const prepare = async (name, options = {}, mutate) => {
    const root = resolve(base, name);
    roots[name] = { root, ...await writeTestnetTrust(root, { owner, registry: twoDeployments(), ...options }) };
    await mutate?.(root, roots[name]);
    return root;
  };
  // Every package directory is absolute under `base`; `outDir` names a sibling package (the existing-directory case).
  const add = (name, root, deploymentId = 'escrow-sepolia-v1', { outDir = name, ...extra } = {}) =>
    cases.push({ name, root, ...(deploymentId === null ? {} : { deploymentId }), ...extra, outDir: resolve(base, 'packages', outDir) });

  const good = await prepare('good');
  add('good', good);
  add('good-v2', good, 'escrow-sepolia-v2');
  add('existing-directory', good, 'escrow-sepolia-v1', { outDir: 'good' });
  add('unknown-deployment', good, 'escrow-sepolia-v9');
  add('missing-deployment-id', good, null);
  add('registry-only', await prepare('registry-only', { editManifest: onlyRegistry }));
  add('legacy-v1-bundle', roots['registry-only'].root, 'escrow-sepolia-v1', { legacyBundle: true, outDir: 'legacy-v1-bundle' });
  add('unsupplied-asset', await prepare('unsupplied-asset', { editManifest: (manifest, sha) => {
    manifest.assets.push({ path: 'docs/unsupplied.json', bytes: 2, sha256: sha(new TextEncoder().encode('{}')) });
    manifest.assets.sort((a, b) => a.path < b.path ? -1 : 1);
  } }));
  add('abi-not-canonical', await prepare('abi-not-canonical', { abi: Buffer.concat([CANONICAL_ABI, Buffer.from('\n')]) }));
  add('abi-edited', await prepare('abi-edited', {}, root => writeFile(resolve(root, TESTNET_TRUST_FILES.abi), Buffer.concat([CANONICAL_ABI, Buffer.from(' ')]))));
  add('registry-edited', await prepare('registry-edited', {}, async root => {
    const path = resolve(root, TESTNET_TRUST_FILES.registry); await writeFile(path, (await readFile(path, 'utf8')).replace(V2.address, `0x${'7b'.repeat(20)}`));
  }));
  add('expired', await prepare('expired', { now: NOW - 3 * 86_400, days: 1 }));
  add('accepted-same', await prepare('accepted-same', {}, (root, written) => writeFile(resolve(root, TESTNET_ACCEPTED_FILE), JSON.stringify({ sequence: 1, manifestSha256: written.manifestSha256 }))));
  add('rollback-older-sequence', await prepare('rollback', {}, root => writeFile(resolve(root, TESTNET_ACCEPTED_FILE), JSON.stringify({ sequence: 2, manifestSha256: 'a'.repeat(64) }))));
  add('replay-same-sequence', await prepare('replay', {}, root => writeFile(resolve(root, TESTNET_ACCEPTED_FILE), JSON.stringify({ sequence: 1, manifestSha256: 'a'.repeat(64) }))));
  add('wrong-key', await prepare('wrong-key', { owner: stranger }));
  add('key-file-swapped', await prepare('key-file-swapped', {}, root => writeFile(resolve(root, TESTNET_TRUST_FILES.key),
    JSON.stringify({ keyId: owner.keyId, publicKey: stranger.publicKey }))));
  const mainnet = fixtureRegistry(); Object.assign(mainnet.networks[0], { chainIdentity: '1', genesisHash: '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3' });
  add('non-sepolia', await prepare('non-sepolia', { registry: mainnet }));

  await mkdir(resolve(base, 'packages')); // the builder creates only the final directory, never its parents
  const input = resolve(base, 'cases.json'); await writeFile(input, JSON.stringify({ cases }));
  const { stdout } = await run(process.execPath, ['--import', './scripts/test-support/register-tsx.mjs', 'scripts/test-support/with-test-sepolia-pin.mjs', owner.keyId,
    fileURLToPath(new URL('../test-support/sepolia-pinned-release-scenarios.mjs', import.meta.url)), input],
  { cwd: ROOT, env: { PATH: process.env.PATH ?? '', TZ: 'UTC' }, timeout: 240_000, maxBuffer: 4 << 20 });
  const { pin, fetches, rows } = JSON.parse(stdout);
  assert.equal(pin, owner.keyId, 'the child ran with the test-only pin; this process keeps the null pin');
  assert.equal(SEPOLIA_RELEASE_KEY_ID, null);
  assert.equal(fetches, 0, 'no verifier or builder contacts any endpoint');
  const outcome = name => (({ verify, sepoliaVerify, build, runtime, package: built }) => ({ verify, sepoliaVerify, build, runtime, package: built }))(rows[name]);

  // Check 2: one manifest, every verifier.
  assert.deepEqual(outcome('good'), { verify: 'ok', sepoliaVerify: 'ok', build: 'ok', runtime: 'ready', package: 'ok' });
  assert.deepEqual(rows.good.profile.release.manifestSha256, roots.good.manifestSha256);
  assert.equal(rows.good.profile.release.sequence, 1); assert.equal(rows.good.profile.networkId, 'sepolia');
  assert.equal(rows.good.profile.deploymentId, 'escrow-sepolia-v1'); assert.equal(rows['good-v2'].profile.deploymentId, 'escrow-sepolia-v2');
  assert.equal(rows.good.profile.abiSha256, (await import('node:crypto')).createHash('sha256').update(CANONICAL_ABI).digest('hex'));
  assert.deepEqual(rows.good.files, ['BasicEscrow.json', 'README.md', 'profile.json', 'recover.mjs', 'registry.json']);
  assert.equal(rows['good-v2'].package, 'ok', 'each signed deployment can be packaged by id');
  assert.deepEqual(outcome('accepted-same'), { verify: 'ok', sepoliaVerify: 'ok', build: 'ok', runtime: 'ready', package: 'ok' }, 'the accepted release itself resumes exactly');

  // Check 3 and the requested negatives.
  assert.equal(rows['existing-directory'].package, 'UNAVAILABLE', 'writing over an existing package directory is refused');
  assert.equal(rows['existing-directory'].existingPackageUnchanged, true, 'the existing package is left untouched');
  assert.equal(rows['unknown-deployment'].package, 'UNSUPPORTED_PROVIDER'); assert.equal(rows['unknown-deployment'].sepoliaVerify, 'DEPLOYMENT_UNKNOWN');
  assert.equal(rows['missing-deployment-id'].package, 'INVALID_INPUT');
  const refusedEverywhere = (name, code, { build = `TESTNET_TRUST_INVALID: ${code}`, packaged = code, sepoliaVerify = code, runtime = 'failed' } = {}) =>
    assert.deepEqual(outcome(name), { verify: code, sepoliaVerify, build, runtime, package: packaged }, name);
  refusedEverywhere('registry-only', 'ASSET_MISMATCH');
  refusedEverywhere('legacy-v1-bundle', 'ASSET_MISMATCH');
  refusedEverywhere('unsupplied-asset', 'ASSET_MISMATCH');
  refusedEverywhere('abi-edited', 'ASSET_MISMATCH');
  refusedEverywhere('registry-edited', 'ASSET_MISMATCH');
  refusedEverywhere('expired', 'MANIFEST_EXPIRED');
  // The app runtime has no rollback floor (sepolia-source.ts verifies with 0); rollback is a build-time rule.
  refusedEverywhere('rollback-older-sequence', 'RELEASE_ROLLBACK', { runtime: 'ready' });
  refusedEverywhere('replay-same-sequence', 'RELEASE_ROLLBACK', { runtime: 'ready' });
  refusedEverywhere('wrong-key', 'KEY_ID', { packaged: 'KEY_UNTRUSTED', sepoliaVerify: 'KEY_UNTRUSTED' });
  refusedEverywhere('key-file-swapped', 'KEY_UNTRUSTED');
  refusedEverywhere('non-sepolia', 'NETWORK', { packaged: 'WRONG_CHAIN', sepoliaVerify: 'NETWORK_NOT_SEPOLIA' });
  // A signed ABI that is not the committed one is refused by the build loader and the builder; the app never sees such a
  // bundle because the build refuses to embed it (the runtime itself has no copy of the canonical ABI to compare with).
  assert.deepEqual((({ verify, sepoliaVerify, build, package: built }) => ({ verify, sepoliaVerify, build, package: built }))(rows['abi-not-canonical']),
    { verify: 'ASSET_MISMATCH', sepoliaVerify: 'ASSET_MISMATCH', build: 'TESTNET_TRUST_INVALID: ASSET_MISMATCH', package: 'ASSET_MISMATCH' });
  for (const [name, row] of Object.entries(rows)) if (!['good', 'good-v2', 'accepted-same'].includes(name)) assert.equal(Object.hasOwn(row, 'profile'), false, `${name} produced no package`);
});
