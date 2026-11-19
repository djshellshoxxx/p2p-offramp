import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSolanaTrade } from '../src/bind.ts';
import { bindRecoveryTrade, createRecoveryDocument, parseRecoveryDocument } from '../src/recovery.ts';
import { bindingOf, makeRegistry, makeTerms, ok } from './support.mjs';

for (const field of ['network', 'deployment', 'asset']) {
  test(`independent review: registry-valid mixed-case dotted ${field} ID survives recovery`, () => {
    const base = makeRegistry();
    const originalNetwork = base.network('solana-localnet');
    const originalDeployment = base.deployment('solana-localnet', 'escrow-v1');
    const asset = { ...originalNetwork.assets[0], id: field === 'asset' ? 'Sol.Native' : 'sol' };
    const deployment = { ...originalDeployment,
      id: field === 'deployment' ? 'Escrow.V1' : originalDeployment.id, supportedAssetIds: [asset.id] };
    const network = { ...originalNetwork,
      id: field === 'network' ? 'Solana.Localnet' : originalNetwork.id, assets: [asset], deployments: [deployment] };
    const registry = {
      network: id => id === network.id ? network : null,
      deployment: (networkId, deploymentId) =>
        networkId === network.id && deploymentId === deployment.id ? deployment : null,
    };
    const terms = makeTerms('native');
    const bound = ok(bindSolanaTrade(registry, bindingOf(terms, {
      networkId: network.id, deploymentId: deployment.id,
    }), terms));
    const document = ok(createRecoveryDocument(bound));
    const parsed = parseRecoveryDocument(JSON.parse(JSON.stringify(document)));
    const restored = ok(bindRecoveryTrade(parsed));
    assert.deepEqual(restored.binding, bound.binding);
    assert.equal(restored.asset.id, asset.id);
    assert.equal(restored.escrow.address, bound.escrow.address);
  });
}

test('recovery IDs retain the registry length, separator and traversal constraints', () => {
  const terms = makeTerms('native');
  const original = ok(createRecoveryDocument(ok(bindSolanaTrade(makeRegistry(), bindingOf(terms), terms))));
  for (const field of ['networkId', 'deploymentId', 'asset']) {
    for (const id of ['', '.hidden', 'two..dots', 'path/segment', 'path\\segment', 'a'.repeat(65)]) {
      const document = structuredClone(original);
      if (field === 'asset') document.asset.id = id;
      else document.network[field] = id;
      assert.throws(() => parseRecoveryDocument(document), error => error?.code === 'INVALID_INPUT',
        `${field}: ${id}`);
    }
  }
});
