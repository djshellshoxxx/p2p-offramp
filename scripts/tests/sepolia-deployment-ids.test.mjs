/**
 * D3 (PROPOSED) deployment-id continuity, offline: the registry draft keeps every deployment, a signed id never names a
 * new identity (DEPLOYMENT_ID_REBOUND) or disappears (DEPLOYMENT_ID_DROPPED) at signing, and every tool selects its
 * deployment by an explicit id. Synthetic ephemeral keys and fixture records only; no RPC is reachable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildManifest, keygen, parseSignedDeployments, REGISTRY_ASSET, ABI_ASSET, RELEASE_MANIFEST_FILE, SIGNED_DEPLOYMENTS_FILE, signManifest, signRelease, writeSignedRelease } from '../sepolia/owner-release.mjs';
import { mergeRegistryDraft, readRegistryDraft } from '../sepolia/record-deployment.mjs';
import { deploy } from '../sepolia/deploy.mjs';
import { runTrades } from '../sepolia/trade.mjs';
import { TRUSTED_KEY_PATH, verifySepoliaRelease } from '../sepolia/verify-release.mjs';
import { buildConfiguredEvmRecovery } from '../recovery/build-evm.mjs';
import { verifyTestnetTrust } from '../../apps/web/scripts/testnet-trust.mjs';
import { SEPOLIA_RELEASE_KEY_ID } from '../../apps/web/src/testnet/sepolia-network.ts';
import { copySigningInputs, fixtureRegistry } from '../lib/testnet-fixture.mjs';
import { SEPOLIA } from '../sepolia/lib.mjs';

const X = `0x${'a1'.repeat(20)}`, Y = `0x${'b2'.repeat(20)}`;
const NOW = Math.floor(Date.now() / 1000);
const message = expected => error => { assert.equal(error?.message, expected, String(error?.stack ?? error)); return true; };
const code = expected => error => { assert.equal(error?.code, expected, String(error?.stack ?? error)); return true; };
const entry = (id, address, { runtime = 'c'.repeat(64), artifact = 'd'.repeat(64) } = {}) => ({ id, address, protocolVersion: 1, artifactSha256: artifact,
  runtime: { kind: 'evm-code', keccak256: runtime, upgradeable: false }, supportedAssetIds: ['native'] });
const registryWith = (...deployments) => { const registry = fixtureRegistry(); registry.networks[0].deployments = deployments; return registry; };

async function tempRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'p2p-deployment-ids-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copySigningInputs(root);
  await mkdir(resolve(root, 'registry/testnet'), { recursive: true }); await mkdir(resolve(root, 'docs/deployments/sepolia'), { recursive: true });
  return root;
}
/** Writes the registry draft and a finalized, clean-source record for each of its deployments. */
async function stage(root, registry) {
  await writeFile(resolve(root, REGISTRY_ASSET), JSON.stringify(registry, null, 2) + '\n');
  for (const deployment of registry.networks[0].deployments) {
    await writeFile(resolve(root, 'docs/deployments/sepolia', `BasicEscrow-${deployment.address}.json`), JSON.stringify({ contractAddress: deployment.address,
      codeDigest: { runtime: deployment.runtime.keccak256 }, artifactSha256: deployment.artifactSha256, chainId: '11155111', genesisIdentity: SEPOLIA.genesisHash,
      sourceTreeClean: true, finalizedAtRecording: true }));
  }
}
const releaseFiles = root => Promise.all([RELEASE_MANIFEST_FILE, SIGNED_DEPLOYMENTS_FILE].map(path => readFile(resolve(root, path), 'utf8').catch(() => null)));

test('signing refuses to rebind or drop a signed deployment id and accepts the same identity or a new id (D3 check 4)', async t => {
  const root = await tempRoot(t), owner = keygen();
  const sign = (sequence, extra = {}) => signRelease({ privateJwk: owner.privateJwk, sequence, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40), ...extra });
  // Release N signs escrow-sepolia-v1 at X.
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  const first = await sign(1);
  assert.deepEqual(first.summary.networks[0].deployments.map(item => [item.id, item.address, item.previouslySigned]), [['escrow-sepolia-v1', X, false]]);
  await writeSignedRelease(root, first);
  const ledger = parseSignedDeployments(await readFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), 'utf8'));
  assert.deepEqual(ledger.deployments, [{ networkId: 'sepolia', id: 'escrow-sepolia-v1', address: X, runtimeKeccak: 'c'.repeat(64), artifactSha256: 'd'.repeat(64), firstSequence: 1 }]);
  assert.equal(ledger.lastManifestSha256, first.envelope.manifestSha256);
  const committed = await releaseFiles(root);

  // Release N+1 with the same id at Y, or the same address with another runtime or artifact, is refused at signing.
  for (const [name, rebound] of [['address', entry('escrow-sepolia-v1', Y)], ['runtime', entry('escrow-sepolia-v1', X, { runtime: 'f'.repeat(64) })],
    ['artifact', entry('escrow-sepolia-v1', X, { artifact: 'f'.repeat(64) })]]) {
    await stage(root, registryWith(rebound));
    await assert.rejects(sign(2), error => error?.message === 'DEPLOYMENT_ID_REBOUND' && error.deploymentId === 'escrow-sepolia-v1', name);
  }
  // Dropping the signed id (record-deployment used to replace the whole registry) is refused. X cannot reappear under a new id:
  // without v1 that is a drop, and beside v1 the G11 parser refuses one address under two ids.
  for (const registry of [registryWith(entry('escrow-sepolia-v2', Y)), registryWith(entry('escrow-sepolia-v2', X))]) {
    await stage(root, registry);
    await assert.rejects(sign(2), message('DEPLOYMENT_ID_DROPPED'));
  }
  await stage(root, registryWith(entry('escrow-sepolia-v1', X), entry('escrow-sepolia-v2', X)));
  await assert.rejects(sign(2), message('REGISTRY_INVALID'));
  assert.deepEqual(await releaseFiles(root), committed, 'refusals write nothing');

  // Release N+1 with the same id and the same identity is accepted; a new id beside it is accepted too.
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  await assert.rejects(sign(1), message('SEQUENCE_NOT_INCREASING'));
  const same = await sign(2);
  assert.equal(same.summary.networks[0].deployments[0].previouslySigned, true);
  await writeSignedRelease(root, same);
  await stage(root, registryWith(entry('escrow-sepolia-v1', X), entry('escrow-sepolia-v2', Y)));
  const added = await sign(3);
  assert.deepEqual(added.summary.networks[0].deployments.map(item => [item.id, item.previouslySigned]), [['escrow-sepolia-v1', true], ['escrow-sepolia-v2', false]]);
  assert.deepEqual(added.signedDeployments.deployments.map(item => [item.id, item.address, item.firstSequence]), [['escrow-sepolia-v1', X, 1], ['escrow-sepolia-v2', Y, 3]]);
  await writeSignedRelease(root, added);
  // v2 is now signed too: it cannot be rebound either.
  await stage(root, registryWith(entry('escrow-sepolia-v1', X), entry('escrow-sepolia-v2', `0x${'c3'.repeat(20)}`)));
  await assert.rejects(sign(4), error => error?.message === 'DEPLOYMENT_ID_REBOUND' && error.deploymentId === 'escrow-sepolia-v2');
});

test('the ledger must describe the committed release: missing, stale and malformed ledgers stop signing', async t => {
  const root = await tempRoot(t), owner = keygen();
  const sign = sequence => signRelease({ privateJwk: owner.privateJwk, sequence, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40) });
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  const first = await sign(1); await writeSignedRelease(root, first);
  const firstLedger = await readFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), 'utf8');
  const second = await sign(2); await writeSignedRelease(root, second);
  await writeFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), firstLedger);
  await assert.rejects(sign(3), message('SIGNED_DEPLOYMENTS_STALE'), 'a ledger rolled back alone cannot reopen ids signed later');
  await rm(resolve(root, SIGNED_DEPLOYMENTS_FILE));
  await assert.rejects(sign(3), message('SIGNED_DEPLOYMENTS_MISSING'), 'a committed release without its ledger');
  for (const bad of ['{', '[]', JSON.stringify({ ...JSON.parse(firstLedger), extra: 1 }), JSON.stringify({ ...JSON.parse(firstLedger), channel: 'other' }),
    JSON.stringify({ ...JSON.parse(firstLedger), deployments: [{ ...JSON.parse(firstLedger).deployments[0], firstSequence: 9 }] })]) {
    await writeFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), bad);
    await assert.rejects(sign(3), message('SIGNED_DEPLOYMENTS_INVALID'), bad);
  }
});

test('DEPLOYMENT_ID_REBOUND is signer-side only: a verifier accepts a rebinding manifest the pinned key signed outside the tool', async t => {
  const root = await tempRoot(t), owner = keygen();
  await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  await writeSignedRelease(root, await signRelease({ privateJwk: owner.privateJwk, sequence: 1, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40) }));
  await stage(root, registryWith(entry('escrow-sepolia-v1', Y)));
  await assert.rejects(signRelease({ privateJwk: owner.privateJwk, sequence: 2, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40) }), message('DEPLOYMENT_ID_REBOUND'));
  const read = path => readFile(resolve(root, path));
  // predecessorDigest is null, so nothing links release N+1 to N: a key used outside the signer can rebind an id.
  const manifest = await buildManifest({ registry: await read(REGISTRY_ASSET), abi: await read(ABI_ASSET), sequence: 2, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40) });
  assert.equal(manifest.predecessorDigest, null);
  await writeSignedRelease(root, signManifest(owner.privateJwk, manifest));
  const verified = await verifyTestnetTrust(root, { pinnedKeyId: owner.keyId });
  assert.equal(verified.ok, true, JSON.stringify(verified.error));
  assert.equal(verified.value.registry.deployment('sepolia', 'escrow-sepolia-v1').address, Y);
});

test('record-deployment keeps earlier deployments and refuses a rebound id or a reused address before writing', async t => {
  const network = (({ deployments, ...rest }) => rest)(fixtureRegistry().networks[0]);
  const one = mergeRegistryDraft(null, network, entry('escrow-sepolia-v1', X));
  assert.deepEqual(one.networks[0].deployments.map(item => item.id), ['escrow-sepolia-v1']);
  assert.equal(one.releaseId, `sepolia-testnet-${X.slice(2, 10)}`, 'a one-deployment registry keeps the earlier release id');
  assert.deepEqual(mergeRegistryDraft(one, network, entry('escrow-sepolia-v1', X)), one, 're-recording after finality changes nothing');
  const two = mergeRegistryDraft(one, network, entry('escrow-sepolia-v2', Y));
  assert.deepEqual(two.networks[0].deployments.map(item => [item.id, item.address]), [['escrow-sepolia-v1', X], ['escrow-sepolia-v2', Y]]);
  assert.equal(two.releaseId, `sepolia-testnet-${Y.slice(2, 10)}`);
  assert.deepEqual(mergeRegistryDraft(two, network, entry('escrow-sepolia-v1', X)), two, 're-recording v1 keeps v2 and the order');
  assert.throws(() => mergeRegistryDraft(two, network, entry('escrow-sepolia-v1', `0x${'c3'.repeat(20)}`)), code('DEPLOYMENT_ID_REBOUND'));
  assert.throws(() => mergeRegistryDraft(two, network, entry('escrow-sepolia-v1', X, { runtime: 'f'.repeat(64) })), code('DEPLOYMENT_ID_REBOUND'));
  assert.throws(() => mergeRegistryDraft(two, network, entry('escrow-sepolia-v3', Y)), code('DEPLOYMENT_ADDRESS_REUSED'));
  assert.throws(() => mergeRegistryDraft(two, { ...network, genesisHash: `0x${'12'.repeat(32)}` }, entry('escrow-sepolia-v3', `0x${'c3'.repeat(20)}`)), code('REGISTRY_NETWORK_MISMATCH'));
  const directory = await mkdtemp(resolve(tmpdir(), 'p2p-registry-draft-')); t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal(await readRegistryDraft(resolve(directory, 'absent.json')), null);
  await writeFile(resolve(directory, 'bad.json'), '{"version":1}');
  await assert.rejects(readRegistryDraft(resolve(directory, 'bad.json')), code('REGISTRY_INVALID'));
});

test('deploy, trade, verify and the recovery builder select deployments by explicit id and refuse before any RPC', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'p2p-deployment-select-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const registryPath = resolve(directory, 'registry.json');
  await writeFile(registryPath, JSON.stringify(registryWith(entry('escrow-sepolia-v1', X))));
  // An unreachable RPC: any request would surface as RPC_UNREACHABLE instead of the expected refusal.
  const env = { SEPOLIA_RPC_URL: 'http://127.0.0.1:9/', SEPOLIA_DEPLOYER_PRIVATE_KEY: '0x' + '11'.repeat(32) };
  const base = { env, publicEndpoint: 'https://ethereum-sepolia-rpc.publicnode.com/', outDir: resolve(directory, 'records'), registryPath, root: directory };
  await assert.rejects(deploy({ ...base, deploymentId: 'escrow-sepolia-v1' }), code('DEPLOYMENT_ID_REBOUND'), 'a listed id is never reused for a new CREATE');
  for (const deploymentId of [undefined, '', 'escrow.v1', '../escrow', 'x'.repeat(65)]) {
    await assert.rejects(deploy({ ...base, deploymentId }), code('DEPLOYMENT_ID_INVALID'), String(deploymentId));
    await assert.rejects(runTrades({ env, root: directory, run: 'r', deploymentId }), code('DEPLOYMENT_ID_INVALID'), String(deploymentId));
  }
  assert.deepEqual(await readdir(directory), ['registry.json'], 'no record, lock or state file was written');
  // With the source pin unset (D3 check 1), the builder refuses before reading any input, deployment id or not.
  assert.equal(SEPOLIA_RELEASE_KEY_ID, null);
  for (const deploymentId of [undefined, 'escrow-sepolia-v1']) {
    await assert.rejects(buildConfiguredEvmRecovery({ outDir: resolve(directory, 'package'), root: resolve(directory, 'nowhere'), deploymentId }), code('KEY_UNPINNED'));
  }
  assert.deepEqual(await verifySepoliaRelease({ root: directory, deploymentId: 'escrow-sepolia-v1' }), { ok: false, error: { code: 'KEY_UNPINNED' } });
});

test('sepolia:verify lists every signed deployment and refuses an unknown selected id', async t => {
  const root = await tempRoot(t), owner = keygen();
  await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  await stage(root, registryWith(entry('escrow-sepolia-v1', X), entry('escrow-sepolia-v2', Y)));
  await writeSignedRelease(root, await signRelease({ privateJwk: owner.privateJwk, sequence: 1, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40) }));
  const all = await verifySepoliaRelease({ root, pinnedKeyId: owner.keyId });
  assert.equal(all.ok, true, JSON.stringify(all.error));
  assert.deepEqual(all.value.deployments.map(item => [item.id, item.address]), [['escrow-sepolia-v1', X], ['escrow-sepolia-v2', Y]]);
  assert.equal(Object.hasOwn(all.value, 'escrow'), false);
  const second = await verifySepoliaRelease({ root, pinnedKeyId: owner.keyId, deploymentId: 'escrow-sepolia-v2' });
  assert.equal(second.value.escrow, Y); assert.equal(second.value.deploymentId, 'escrow-sepolia-v2');
  assert.deepEqual(await verifySepoliaRelease({ root, pinnedKeyId: owner.keyId, deploymentId: 'escrow-sepolia-v9' }), { ok: false, error: { code: 'DEPLOYMENT_UNKNOWN' } });
  assert.deepEqual(await verifySepoliaRelease({ root, pinnedKeyId: owner.keyId, deploymentId: 'bad.id' }), { ok: false, error: { code: 'DEPLOYMENT_ID_INVALID' } });
});
