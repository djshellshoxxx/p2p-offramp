import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument, parseSolanaRpcUrl } from '../src/solana-localnet/config.ts';
import { buildSolanaLocalnetContentPolicy, buildOfflineContentPolicy } from '../../../packages/security/src/content-policy.ts';
import { assertModuleAdmitted } from '../scripts/static-build-plugin.mjs';
import { inspectApplicationSource } from '../scripts/artifact-policy.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeb, scanBuild } from '../scripts/build.mjs';
import { createViteConfig } from '../vite.config.ts';

import { GENESIS, rpcUrl, configOption } from './solana-localnet-support.mjs';
test('Solana profile pins one local native network and exact registry bytes; policies are explicit', async () => {
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption()));
  assert.equal(config.ReleaseEnabled, 0);
  assert.equal(config.network.chain, 'solana');
  assert.equal(config.network.genesisHash, GENESIS);
  assert.equal(config.rpcOrigin, 'http://127.0.0.1:18999');
  assert.deepEqual(config.margins, { submitMarginSeconds: '300', releaseMarginSeconds: '300' });
  await assert.rejects(parseSolanaLocalnetConfig({ ...config.document, registrySha256: '00'.repeat(32) }));
  await assert.rejects(parseSolanaLocalnetConfig({ ...config.document, ReleaseEnabled: 1 }));
  assert.throws(() => solanaLocalnetConfigDocument({ ...configOption(), margins: undefined }));
});
test('Solana profile refuses nonlocal, SPL, multiple deployment and mutable program configurations', async () => {
  for (const mutate of [n => { n.environment = 'testnet'; }, n => { n.assets[0].decimals = 8; },
    n => { n.deployments.push(structuredClone(n.deployments[0])); }, n => { n.endpoints[0].url = 'https://rpc.example/'; },
    n => { n.deployments[0].runtime.upgradeAuthority = n.deployments[0].address; },
    n => { n.assets.push({ ...n.assets[0], id: 'spl', kind: 'spl', address: n.deployments[0].address }); }]) {
    await assert.rejects(parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption(mutate))));
  }
});
test('RPC configuration is a literal IPv4 loopback origin, canonical root URL and explicit port', () => {
  assert.equal(parseSolanaRpcUrl(rpcUrl).origin, 'http://127.0.0.1:18999');
  for (const bad of ['http://localhost:18999/', 'http://127.0.0.1/', 'http://127.1:18999/', 'http://[::1]:18999/',
    'https://127.0.0.1:18999/', 'http://127.0.0.1:18999/a', 'http://127.0.0.1:18999/?x=1',
    'http://u@127.0.0.1:18999/', 'http://127.0.0.1:18999/#x', 'http://127.0.0.1:18999']) assert.throws(() => parseSolanaRpcUrl(bad));
});
test('Solana content policy adds exactly its local RPC; ordinary policies remain offline', () => {
  const p = buildSolanaLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta', rpcOrigin: 'http://127.0.0.1:18999' });
  assert.deepEqual(p.manifest.connectOrigins, ['http://127.0.0.1:18999']);
  assert.match(p.csp, /connect-src http:\/\/127\.0\.0\.1:18999;/);
  assert.equal(p.manifest.profile, 'solana-localnet');
  assert.match(buildOfflineContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta' }).csp, /connect-src 'none'/);
  for (const origin of ['http://localhost:18999', 'https://rpc.example', 'http://127.0.0.1:18999/']) assert.throws(() => buildSolanaLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'meta', rpcOrigin: origin }));
});
test('native modules and RPC transport require their own explicit build profile', () => {
  for (const path of ['packages/chain-solana/src/compose.ts', 'packages/chain-solana/localnet.ts', 'apps/web/src/solana-localnet/controller.ts']) {
    assert.throws(() => assertModuleAdmitted(path));
    assert.throws(() => assertModuleAdmitted(path, true));
    assert.doesNotThrow(() => assertModuleAdmitted(path, false, true));
  }
  for (const path of ['packages/chain-evm/src/reader.ts', 'packages/exchange/src/exchange.ts', 'packages/chain-solana/test/wallet.test.mjs']) assert.throws(() => assertModuleAdmitted(path, false, true));
  assert.throws(() => inspectApplicationSource('apps/web/src/solana-localnet/rpc.ts', 'fetch(url)'));
  assert.doesNotThrow(() => inspectApplicationSource('apps/web/src/solana-localnet/rpc.ts', 'fetch(url)', { allowFetch: true }));
});
test('emitted native Worker artifact requires its own library profile, exact CSP and unchanged release refusal', async () => {
  assert.throws(() => createViteConfig('solana-localnet'));
  assert.throws(() => createViteConfig('production', null, { document: {}, rpcOrigin: new URL(rpcUrl).origin }));
  await assert.rejects(buildWeb({ delivery: 'solana-localnet' }));
  const temporary = await mkdtemp(join(tmpdir(), 'p2p-solana-profile-test-'));
  try {
    const evidence = await buildWeb({ delivery: 'solana-localnet', outDir: join(temporary, 'app'), solanaLocalnet: configOption() });
    assert.equal(evidence.ReleaseEnabled, 0); assert.equal(evidence.solanaLocalnet.genesisHash, GENESIS);
    assert.deepEqual(evidence.solanaLocalnet.connectOrigins, [new URL(rpcUrl).origin]);
    const graph = JSON.parse(await readFile(join(temporary, 'app/core-graph-worker.json'), 'utf8'));
    assert.ok(graph.modules.some(m => m.path === 'apps/web/src/solana-localnet/rpc.ts'));
    assert.ok(graph.modules.some(m => m.path === 'packages/chain-solana/src/compose.ts'));
    assert.equal(graph.modules.some(m => /packages\/(?:wallet|exchange|chain-evm|relay)\//.test(m.path)), false);
    const policy = JSON.parse(await readFile(join(temporary, 'app/content-policy.json'), 'utf8'));
    assert.equal(policy.manifest.profile, 'solana-localnet'); assert.equal(policy.ReleaseEnabled, 0);
    await assert.rejects(scanBuild(join(temporary, 'app')), /LOCALNET_DATA_IN_NON_LOCALNET_BUILD/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
