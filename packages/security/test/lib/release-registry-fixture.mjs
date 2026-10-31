/** Synthetic G11 data bound as one G15 asset. Repeated addresses/hashes are not real deployments. */
import { fixture, sha, encode } from './release-fixture.mjs';
export function registryFixture({ editRegistry = () => {}, editManifest = () => {} } = {}) {
  const registry = { version: 1, releaseId: 'fixture-0001', networks: [{ id: 'local-evm', chain: 'evm', chainIdentity: '31337', genesisHash: '0x' + 'ab'.repeat(32), environment: 'local',
    endpoints: [{ id: 'loopback-fixture', url: 'http://127.0.0.1:8545/' }], finality: { kind: 'evm-finalized-tag' },
    assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
    deployments: [{ id: 'escrow-fixture', address: '0x' + '22'.repeat(20), protocolVersion: 1, artifactSha256: 'a'.repeat(64),
      runtime: { kind: 'evm-code', keccak256: 'b'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] }] }] };
  editRegistry(registry);
  const registryBytes = encode(JSON.stringify(registry)), registryPath = 'registry.json';
  const f = fixture(m => {
    m.releaseId = 'fixture-0001'; m.assets.push({ path: registryPath, bytes: registryBytes.length, sha256: sha(registryBytes) });
    editManifest(m);
  });
  f.assets.push({ path: registryPath, bytes: registryBytes });
  return { ...f, registryBytes, registryPath, registry };
}
