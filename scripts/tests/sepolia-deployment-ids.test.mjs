/**
 * D3 (PROPOSED) deployment-id continuity, offline: the registry draft keeps every deployment, a signed id never names a
 * new identity (DEPLOYMENT_ID_REBOUND) or disappears (DEPLOYMENT_ID_DROPPED) at signing, and every tool selects its
 * deployment by an explicit id. Synthetic ephemeral keys and fixture records only; no RPC is reachable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildManifest, keygen, parseSignedDeployments, previousPublicKey, REGISTRY_ASSET, ABI_ASSET, RELEASE_ENVELOPE_FILE, RELEASE_MANIFEST_FILE, SIGNED_DEPLOYMENTS_FILE, signLedger, signManifest, signRelease, writeSignedRelease } from '../sepolia/owner-release.mjs';
import { mergeRegistryDraft, PENDING_FILE, readRegistryDraft, recordDeployment } from '../sepolia/record-deployment.mjs';
import { broadcastPreparedDeployment, deploy } from '../sepolia/deploy.mjs';
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

// Review follow-up: the signer's ledger is signed and bound to the release history, so it cannot be bypassed by
// deleting, emptying or rolling back repository files (signer-side only; verifiers still cannot enforce continuity).
const TESTNET_ACCEPTED = 'registry/testnet/sepolia.accepted.json';
async function signingRoot(t) {
  const root = await tempRoot(t), owner = keygen();
  const sign = (sequence, extra = {}) => signRelease({ privateJwk: owner.privateJwk, sequence, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40), ...extra });
  const files = () => Promise.all([RELEASE_MANIFEST_FILE, RELEASE_ENVELOPE_FILE, SIGNED_DEPLOYMENTS_FILE].map(path => readFile(resolve(root, path))));
  const restore = saved => Promise.all([RELEASE_MANIFEST_FILE, RELEASE_ENVELOPE_FILE, SIGNED_DEPLOYMENTS_FILE].map((path, index) => writeFile(resolve(root, path), saved[index])));
  const accept = signed => writeFile(resolve(root, TESTNET_ACCEPTED), JSON.stringify({ sequence: signed.summary.sequence, manifestSha256: signed.envelope.manifestSha256 }));
  return { root, owner, sign, files, restore, accept };
}

test('review 1a: once a release exists, a deleted ledger is SIGNED_DEPLOYMENTS_MISSING, not a fresh start', async t => {
  const { root, sign, accept } = await signingRoot(t);
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  const first = await sign(1); await writeSignedRelease(root, first); await accept(first);
  for (const path of [RELEASE_MANIFEST_FILE, RELEASE_ENVELOPE_FILE, SIGNED_DEPLOYMENTS_FILE]) await rm(resolve(root, path));
  await stage(root, registryWith(entry('escrow-sepolia-v1', Y)));
  await assert.rejects(sign(2), message('SIGNED_DEPLOYMENTS_MISSING'), 'the accepted release proves a ledger existed');
  await rm(resolve(root, TESTNET_ACCEPTED));
  await assert.rejects(sign(2), message('SIGNED_DEPLOYMENTS_MISSING'), 'a sequence above 1 needs the ledger of the releases before it');
  assert.equal((await sign(1)).summary.previousRelease, null, 'only a genuine first release (sequence 1, nothing committed or accepted) starts without one');
});

test('review 1b: an emptied, edited or foreign-signed ledger is refused; the ABI digest is recorded and enforced', async t => {
  const { root, owner, sign } = await signingRoot(t);
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  const first = await sign(1); await writeSignedRelease(root, first);
  const ledger = JSON.parse(await readFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), 'utf8'));
  assert.equal(ledger.abiSha256, createHash('sha256').update(await readFile(resolve(root, ABI_ASSET))).digest('hex'));
  assert.equal(ledger.keyId, owner.keyId);
  await stage(root, registryWith(entry('escrow-sepolia-v1', Y)));
  const write = value => writeFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), JSON.stringify(value));
  await write({ ...ledger, deployments: [] });
  await assert.rejects(sign(2), message('SIGNED_DEPLOYMENTS_INVALID'), 'emptied deployments with an intact manifest digest');
  const { signature, keyId, ...body } = ledger;
  assert.ok(signature && keyId);
  const stranger = keygen();
  await write(signLedger(stranger.privateJwk, { ...body, deployments: [] }));
  await assert.rejects(sign(2), message('SIGNED_DEPLOYMENTS_UNTRUSTED'), 'a ledger re-signed by another key');
  await write({ ...signLedger(stranger.privateJwk, { ...body, deployments: [] }), keyId: owner.keyId });
  await assert.rejects(sign(2), message('SIGNED_DEPLOYMENTS_INVALID'), 'the keyId is inside the signed part');
  // ABI_CHANGED: a ledger (validly signed) recording another ABI digest means the committed ABI changed after signing.
  await write(signLedger(owner.privateJwk, { ...body, abiSha256: 'f'.repeat(64) }));
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  await assert.rejects(sign(2), message('ABI_CHANGED'));
  await write(ledger);
  assert.equal((await sign(2)).signedDeployments.abiSha256, ledger.abiSha256);
});

test('review 1c: restoring release N\'s files after N+1 was accepted cannot reopen ids signed in N+1', async t => {
  const { root, sign, files, restore, accept } = await signingRoot(t);
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  const first = await sign(1); await writeSignedRelease(root, first); await accept(first);
  const releaseN = await files();
  await stage(root, registryWith(entry('escrow-sepolia-v1', X), entry('escrow-sepolia-v2', Y)));
  const second = await sign(2); await writeSignedRelease(root, second);
  // Before N+1 is accepted, a restore of N's files is consistent with the accepted state: the signer cannot tell, and
  // the summary's previousRelease (sequence 1, not 2) is the owner's signal to stop.
  await restore(releaseN);
  await stage(root, registryWith(entry('escrow-sepolia-v1', X), entry('escrow-sepolia-v2', `0x${'c3'.repeat(20)}`)));
  assert.equal((await sign(3)).summary.previousRelease.sequence, 1);
  await writeSignedRelease(root, second); await accept(second);
  await restore(releaseN);
  await assert.rejects(sign(3), message('SIGNED_DEPLOYMENTS_STALE'), 'a ledger older than the accepted release');
  await writeFile(resolve(root, TESTNET_ACCEPTED), JSON.stringify({ sequence: 2, manifestSha256: 'a'.repeat(64) }));
  await writeSignedRelease(root, second);
  await assert.rejects(sign(3), message('SIGNED_DEPLOYMENTS_STALE'), 'a ledger for another manifest at the accepted sequence');
  await accept(second);
  await assert.rejects(sign(3), error => error?.message === 'DEPLOYMENT_ID_REBOUND' && error.deploymentId === 'escrow-sepolia-v2');
});

test('key rotation: the new key continues the old key\'s ledger only through an explicit --previous-key', async t => {
  const { root, owner, sign } = await signingRoot(t);
  await stage(root, registryWith(entry('escrow-sepolia-v1', X)));
  await writeSignedRelease(root, await sign(1));
  const next = keygen();
  const rotated = extra => signRelease({ privateJwk: next.privateJwk, sequence: 2, days: 30, now: NOW - 60, root, sourceCommit: 'e'.repeat(40), ...extra });
  await assert.rejects(rotated(), message('SIGNED_DEPLOYMENTS_UNTRUSTED'));
  assert.throws(() => previousPublicKey({ keyId: next.keyId, publicKey: owner.publicKey }), message('PREVIOUS_KEY_INVALID'));
  const continued = await rotated({ previousPublicKeys: [previousPublicKey({ keyId: owner.keyId, publicKey: owner.publicKey })] });
  assert.equal(continued.summary.previousRelease.ledgerKeyId, owner.keyId);
  assert.equal(continued.signedDeployments.keyId, next.keyId, 'the continued ledger is signed by the new key');
  assert.deepEqual(continued.signedDeployments.deployments.map(item => [item.id, item.firstSequence]), [['escrow-sepolia-v1', 1]]);
});

test('deploy and record also refuse ids from the signed ledger, and the pending marker carries the deployment id', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'p2p-ledger-ids-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const owner = keygen();
  await mkdir(resolve(directory, 'registry/testnet'), { recursive: true });
  await writeFile(resolve(directory, SIGNED_DEPLOYMENTS_FILE), JSON.stringify(signLedger(owner.privateJwk, { format: 'p2p-offramp/testnet-signed-deployments/v1',
    channel: 'sepolia-testnet', lastSequence: 1, lastManifestSha256: 'a'.repeat(64), abiSha256: 'b'.repeat(64),
    deployments: [{ networkId: 'sepolia', id: 'escrow-sepolia-v1', address: X, runtimeKeccak: 'c'.repeat(64), artifactSha256: 'd'.repeat(64), firstSequence: 1 }] })));
  // The draft no longer lists v1 (an edited draft); the ledger still blocks reusing the id or the address.
  const registryPath = resolve(directory, 'registry.json');
  await writeFile(registryPath, JSON.stringify(registryWith(entry('escrow-sepolia-v2', Y))));
  const env = { SEPOLIA_RPC_URL: 'http://127.0.0.1:9/', SEPOLIA_DEPLOYER_PRIVATE_KEY: '0x' + '11'.repeat(32) };
  const base = { env, publicEndpoint: 'https://ethereum-sepolia-rpc.publicnode.com/', outDir: resolve(directory, 'records'), registryPath, root: directory };
  await assert.rejects(deploy({ ...base, deploymentId: 'escrow-sepolia-v1' }), code('DEPLOYMENT_ID_REBOUND'));
  const network = (({ deployments, ...rest }) => rest)(fixtureRegistry().networks[0]);
  const signed = parseSignedDeployments(await readFile(resolve(directory, SIGNED_DEPLOYMENTS_FILE), 'utf8')).deployments;
  assert.throws(() => mergeRegistryDraft(null, network, entry('escrow-sepolia-v1', `0x${'c3'.repeat(20)}`), signed), code('DEPLOYMENT_ID_REBOUND'));
  assert.throws(() => mergeRegistryDraft(null, network, entry('escrow-sepolia-v3', X), signed), code('DEPLOYMENT_ADDRESS_REUSED'));
  assert.equal(mergeRegistryDraft(null, network, entry('escrow-sepolia-v1', X), signed).networks[0].deployments[0].id, 'escrow-sepolia-v1', 'the same identity re-records');
  // The attempt guard names the id; a later deploy and every hint carry it.
  const from = '0x' + '12'.repeat(20), rpc = async method => { assert.equal(method, 'eth_getTransactionCount'); return '0x7'; };
  await assert.rejects(broadcastPreparedDeployment({ env: {}, rpc, from, outDir: base.outDir, deploymentId: 'escrow-sepolia-v3', runForge: async () => { throw Error('synthetic'); } }),
    error => error?.code === 'BROADCAST_UNCERTAIN' && error.deploymentId === 'escrow-sepolia-v3');
  assert.equal(JSON.parse(await readFile(resolve(base.outDir, PENDING_FILE), 'utf8')).deploymentId, 'escrow-sepolia-v3');
  await assert.rejects(deploy({ ...base, deploymentId: 'escrow-sepolia-v4' }), error => error?.code === 'UNRECORDED_DEPLOYMENT_PENDING' && error.deploymentId === 'escrow-sepolia-v3');
  // Recording the marker's transaction under another id is refused before any RPC (the URL is unreachable).
  const tx = '0x' + '34'.repeat(32);
  await writeFile(resolve(base.outDir, PENDING_FILE), JSON.stringify({ tx, address: Y, deploymentId: 'escrow-sepolia-v3' }));
  await assert.rejects(recordDeployment({ rpcUrl: env.SEPOLIA_RPC_URL, txHash: tx, publicEndpoint: base.publicEndpoint, deploymentId: 'escrow-sepolia-v2',
    outDir: base.outDir, registryPath, root: directory, env }), code('DEPLOYMENT_ID_MISMATCH'));
});

test('the Sepolia CLIs refuse a repeated option instead of taking its last value', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'p2p-repeated-options-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));
  const cli = (script, args) => spawnSync(process.execPath, ['--import', resolve(ROOT, 'scripts/test-support/register-tsx.mjs'), resolve(ROOT, 'scripts/sepolia', script), ...args],
    { cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', TZ: 'UTC' }, timeout: 30_000 });
  const twice = ['--deployment-id', 'escrow-sepolia-v1', '--deployment-id=escrow-sepolia-v2'];
  for (const [script, args, stream, expected] of [
    ['deploy.mjs', ['--public-endpoint', 'https://ethereum-sepolia-rpc.publicnode.com/', ...twice], 'stderr', { ok: false, code: 'OPTION_REPEATED' }],
    ['record-deployment.mjs', ['--tx', '0x' + '00'.repeat(32), '--public-endpoint', 'https://ethereum-sepolia-rpc.publicnode.com/', ...twice], 'stderr', { ok: false, code: 'OPTION_REPEATED' }],
    ['trade.mjs', ['--run', 'r', ...twice], 'stderr', { ok: false, code: 'OPTION_REPEATED' }],
    ['verify-release.mjs', [...twice, '--accept'], 'stdout', { ok: false, error: { code: 'OPTION_REPEATED' } }],
  ]) {
    const result = cli(script, args);
    assert.equal(result.status, 1, `${script}: ${result.stdout}${result.stderr}`);
    assert.deepEqual(JSON.parse(result[stream]), expected, script);
  }
  const owner = cli('owner-release.mjs', ['sign', '--key', 'a.jwk', '--sequence', '1', '--sequence', '2']);
  assert.equal(owner.status, 1); assert.match(owner.stderr, /OPTION_REPEATED: --sequence/);
  assert.deepEqual(await readdir(directory), [], 'nothing was written');
});
