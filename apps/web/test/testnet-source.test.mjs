import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sepoliaRegistrySource, TESTNET_TRUST_FORMAT as RUNTIME_FORMAT } from '../src/testnet/sepolia-source.ts';
import { loadTestnetTrust, TESTNET_TRUST_FORMAT, TESTNET_TRUST_FILES } from '../scripts/testnet-trust.mjs';
import { fixtureRegistry, fixtureTermsDocument, FIXTURE_ESCROW, writeTestnetTrust } from '../../../scripts/lib/testnet-fixture.mjs';
import { reviewTermsBytes } from '../../../packages/domain/index.ts';

const NOW = Math.floor(Date.now() / 1000);
async function trustRoot(t, options) {
  const root = await mkdtemp(resolve(tmpdir(), 'p2p-testnet-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const written = await writeTestnetTrust(root, options);
  return { root, ...written };
}

test('build-time and runtime agree on the bundle format', () => assert.equal(RUNTIME_FORMAT, TESTNET_TRUST_FORMAT));

test('a verified bundle yields a ready, testnet-only registry that the app terms review accepts', async t => {
  const { root, keyId, expiresAt } = await trustRoot(t);
  const { bundle, summary } = await loadTestnetTrust(root);
  assert.equal(summary.keyId, keyId); assert.equal(summary.expiresAt, expiresAt); assert.equal(summary.sequence, 1);
  const result = await sepoliaRegistrySource(structuredClone(bundle))();
  assert.equal(result.kind, 'ready'); assert.equal(result.label, 'sepolia-testnet'); assert.deepEqual(result.samples, []);
  assert.deepEqual(result.trust, { keyId, sequence: 1, expiresAt });
  assert.equal(result.registry.deployment('sepolia', 'escrow-sepolia-v1').address, FIXTURE_ESCROW);
  const reviewed = await reviewTermsBytes(result.registry, new TextEncoder().encode(JSON.stringify(await fixtureTermsDocument(NOW))));
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  const unknown = await reviewTermsBytes(result.registry, new TextEncoder().encode(JSON.stringify(await fixtureTermsDocument(NOW, { deploymentId: 'escrow-other' }))));
  assert.deepEqual(unknown, { ok: false, code: 'UNKNOWN_DEPLOYMENT' });
});

test('runtime refuses an expired manifest, a swapped key id, altered bytes and malformed bundles (fail closed)', async t => {
  const { root, expiresAt } = await trustRoot(t);
  const { bundle } = await loadTestnetTrust(root);
  assert.deepEqual(await sepoliaRegistrySource(bundle, () => expiresAt)(), { kind: 'failed' }, 'expired at runtime');
  assert.deepEqual(await sepoliaRegistrySource({ ...bundle, keyId: 'f'.repeat(64) })(), { kind: 'failed' });
  const registry = Buffer.from(bundle.registry, 'base64url'); registry[registry.length - 3] ^= 1;
  assert.deepEqual(await sepoliaRegistrySource({ ...bundle, registry: registry.toString('base64url') })(), { kind: 'failed' });
  for (const bad of [null, undefined, 'x', [], { ...bundle, format: 'other' }, { ...bundle, extra: 1 }, (({ envelope, ...rest }) => rest)(bundle),
    { ...bundle, manifest: '!!' }, Object.assign(Object.create({ inherited: true }), bundle)]) {
    assert.deepEqual(await sepoliaRegistrySource(bad)(), { kind: 'failed' });
  }
});

test('a signed registry naming a non-testnet network is never served by the testnet build', async t => {
  const { root } = await trustRoot(t, { registry: fixtureRegistry({ environment: 'mainnet' }) });
  await assert.rejects(loadTestnetTrust(root), /TESTNET_TRUST_INVALID: NETWORK/);
});

test('build-time loader fails closed on missing files, a tampered registry and an expired manifest', async t => {
  const { root, expiresAt } = await trustRoot(t);
  await assert.rejects(loadTestnetTrust(root, { nowSeconds: () => expiresAt }), /TESTNET_TRUST_INVALID: MANIFEST_EXPIRED/);
  const registryPath = resolve(root, TESTNET_TRUST_FILES.registry);
  const original = await readFile(registryPath, 'utf8');
  await writeFile(registryPath, original.replace(FIXTURE_ESCROW, `0x${'6f'.repeat(20)}`));
  await assert.rejects(loadTestnetTrust(root), /TESTNET_TRUST_INVALID: ASSET_MISMATCH/);
  await rm(registryPath);
  await assert.rejects(loadTestnetTrust(root), /TESTNET_TRUST_MISSING/);
});

const MAINNET = { id: 'ethereum', chain: 'evm', chainIdentity: '1', genesisHash: '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
  endpoints: [{ id: 'mainnet-public', url: 'https://ethereum-rpc.publicnode.com/' }], finality: { kind: 'evm-finalized-tag' },
  assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
  deployments: [{ id: 'escrow-sepolia-v1', address: FIXTURE_ESCROW, protocolVersion: 1, artifactSha256: 'd'.repeat(64),
    runtime: { kind: 'evm-code', keccak256: 'e'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] }] };
/** The bundle exactly as the build would embed it, assembled from the files without the build's own checks. */
async function rawBundle(root) {
  const read = path => readFile(resolve(root, path));
  const trusted = JSON.parse(await read(TESTNET_TRUST_FILES.key));
  return { format: TESTNET_TRUST_FORMAT, keyId: trusted.keyId, publicKey: trusted.publicKey, registry: (await read(TESTNET_TRUST_FILES.registry)).toString('base64url'),
    manifest: (await read(TESTNET_TRUST_FILES.manifest)).toString('base64url'), envelope: JSON.parse(await read(TESTNET_TRUST_FILES.envelope)) };
}
test('a signed registry that is not exactly Sepolia (chain id and genesis) is refused at build time and at runtime', async t => {
  const sepolia = fixtureRegistry().networks[0];
  const cases = {
    'mainnet labelled testnet': [sepolia, { ...MAINNET, environment: 'testnet' }],
    'mainnet labelled mainnet': [sepolia, { ...MAINNET, environment: 'mainnet' }],
    'sepolia id with a foreign genesis': [{ ...sepolia, genesisHash: `0x${'12'.repeat(32)}` }],
    'sepolia id with another chain id': [{ ...sepolia, chainIdentity: '17000' }],
    'Sepolia under another network id': [{ ...sepolia, id: 'sepolia-alt' }],
  };
  for (const [name, networks] of Object.entries(cases)) {
    const { root } = await trustRoot(t, { registry: { ...fixtureRegistry(), networks } });
    await assert.rejects(loadTestnetTrust(root), /TESTNET_TRUST_INVALID: NETWORK/, name);
    assert.deepEqual(await sepoliaRegistrySource(await rawBundle(root))(), { kind: 'failed' }, name);
  }
});

test('a pinned release keyId refuses any other key at build time and at runtime; unpinned builds say so', async t => {
  const { root, keyId } = await trustRoot(t);
  const other = 'e'.repeat(64);
  assert.equal((await loadTestnetTrust(root)).summary.keyPinned, false, 'SEPOLIA_RELEASE_KEY_ID is null until the owner supplies a key');
  const { bundle, summary } = await loadTestnetTrust(root, { pinnedKeyId: keyId });
  assert.equal(summary.keyPinned, true);
  assert.equal((await sepoliaRegistrySource(structuredClone(bundle), undefined, keyId)()).kind, 'ready');
  await assert.rejects(loadTestnetTrust(root, { pinnedKeyId: other }), /TESTNET_TRUST_INVALID: KEY_ID/);
  assert.deepEqual(await sepoliaRegistrySource(structuredClone(bundle), undefined, other)(), { kind: 'failed' });
});
