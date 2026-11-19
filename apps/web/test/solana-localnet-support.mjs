import { createHash } from 'node:crypto';
// Structural fixtures only. Real genesis/program identity is qualified by the separate validator/browser gate.
export const GENESIS = 'EETubP5AKHgjPAhz8mQxh4knaXwvoSLb7o1FzR8NVDuU';
export const rpcUrl = 'http://127.0.0.1:18999/';
export function configOption(change = () => {}) {
  const registry = { version: 1, releaseId: 'solana-browser-unit-only', networks: [{
    id: 'solana-localnet', chain: 'solana', chainIdentity: GENESIS, genesisHash: GENESIS, environment: 'local',
    endpoints: [{ id: 'local-rpc', url: rpcUrl }], finality: { kind: 'solana-commitment', commitment: 'finalized' },
    assets: [{ id: 'sol', kind: 'native', address: null, decimals: 9, transferPolicy: 'exact-transfer' }],
    deployments: [{ id: 'escrow-v1', address: '7q2EChqznfQea58ZfUvBzRd97Bc28kwHaey1tYy7ADjq', protocolVersion: 1,
      artifactSha256: 'ab'.repeat(32), runtime: { kind: 'solana-program', programDataSha256: 'cd'.repeat(32), upgradeAuthority: null }, supportedAssetIds: ['sol'] }],
  }] };
  change(registry.networks[0]);
  const registryJson = JSON.stringify(registry);
  return { registryJson, registrySha256: createHash('sha256').update(registryJson).digest('hex'), rpcUrl,
    margins: { submitMarginSeconds: '300', releaseMarginSeconds: '300' } };
}
