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
