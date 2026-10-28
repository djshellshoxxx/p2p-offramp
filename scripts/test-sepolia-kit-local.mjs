#!/usr/bin/env node
/**
 * Local proof of the Sepolia kit (G25) against a private anvil started with Sepolia's chain id 11155111: guarded
 * deploy (chain, genesis, funding), on-chain record, G11 registry draft, owner-signed G15 release with an ephemeral
 * key, and verification through the app's own verifier, plus refusals. Loopback only: no Sepolia access, no real
 * funds; anvil's public development key stands in for the deployer. Writes only into a temporary directory.
 *
 *   npm run test:sepolia:kit   (needs Foundry: FOUNDRY_BIN, ~/.foundry/bin or PATH)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deploy } from './sepolia/deploy.mjs';
import { recordDeployment } from './sepolia/record-deployment.mjs';
import { keygen, REGISTRY_ASSET, signRelease } from './sepolia/owner-release.mjs';
import { TRUSTED_KEY_PATH, verifySepoliaRelease } from './sepolia/verify-release.mjs';
import { chainIdentity, ROOT, rpcClient, SEPOLIA } from './sepolia/lib.mjs';

const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const PATH = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}:${process.env.PATH ?? ''}` : process.env.PATH ?? '';
// Anvil's documented deterministic development key 0 (public, worthless) and an unfunded throwaway key.
const DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const UNFUNDED_KEY = '0x' + '11'.repeat(32);
const PUBLIC_ENDPOINT = 'https://ethereum-sepolia-rpc.publicnode.com/';
const passed = [];
const pass = name => { passed.push(name); console.log(`ok - ${name}`); };
const code = expected => error => { assert.equal(error?.code, expected, String(error)); return true; };

const freePort = () => new Promise((done, fail) => { const server = createServer(); server.once('error', fail); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)); }); });
async function startAnvil(chainId) {
  const port = await freePort();
  const child = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', String(chainId), '--silent'], { env: { ...process.env, PATH }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`, rpc = rpcClient(url, { timeoutMs: 2000 });
  for (let attempt = 0; ; attempt++) { try { await rpc('eth_chainId'); break; } catch (error) { if (attempt > 100) throw error; await new Promise(done => setTimeout(done, 100)); } }
  return { url, rpc, stop: () => child.kill('SIGTERM') };
}

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-sepolia-kit-'));
const anvils = [];
try {
  const env = (url, key = DEV_KEY) => ({ ...process.env, PATH, SEPOLIA_RPC_URL: url, SEPOLIA_DEPLOYER_PRIVATE_KEY: key });
  const out = { outDir: resolve(temporary, 'records'), registryPath: resolve(temporary, 'root', REGISTRY_ASSET) };

  // Refusals happen before any transaction: wrong chain id, unknown genesis, unfunded key.
  const mainnetLike = await startAnvil(1); anvils.push(mainnetLike);
  await assert.rejects(deploy({ env: env(mainnetLike.url), publicEndpoint: PUBLIC_ENDPOINT, ...out }), code('WRONG_CHAIN'));
  assert.equal(await mainnetLike.rpc('eth_getTransactionCount', ['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', 'latest']), '0x0', 'nothing sent on a wrong chain');
  const node = await startAnvil(SEPOLIA.chainId); anvils.push(node);
  await assert.rejects(deploy({ env: env(node.url), publicEndpoint: PUBLIC_ENDPOINT, ...out }), code('WRONG_GENESIS'));
  const { genesisHash } = await chainIdentity(node.rpc);
  assert.notEqual(genesisHash, SEPOLIA.genesisHash, 'a local node never passes as real Sepolia by default');
  await assert.rejects(deploy({ env: env(node.url, UNFUNDED_KEY), publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, ...out }), code('DEPLOYER_UNFUNDED'));
  await assert.rejects(deploy({ env: { ...env(node.url), SEPOLIA_DEPLOYER_PRIVATE_KEY: '' }, publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, ...out }), code('DEPLOYER_KEY_MISSING'));
  assert.equal(await node.rpc('eth_blockNumber'), '0x0', 'refusals sent nothing');
  pass('refuses wrong chain id, non-Sepolia genesis, unfunded or missing key before sending anything');

  // Guarded deploy → on-chain record → G11 registry accepted by the app parser.
  const deployed = await deploy({ env: env(node.url), publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, ...out });
  const record = deployed.record;
  assert.equal(record.chainId, '11155111'); assert.equal(record.genesisIdentity, genesisHash);
  assert.equal(record.authorityModel, 'immutable'); assert.deepEqual(record.assetAllowlist, []);
  assert.equal(record.deployer, '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
  assert.match(record.codeDigest.runtime, /^[0-9a-f]{64}$/); assert.match(record.artifactSha256, /^[0-9a-f]{64}$/);
  const written = await readFile(deployed.recordPath, 'utf8') + await readFile(deployed.registryPath, 'utf8');
  assert.ok(!written.includes(DEV_KEY.slice(2)) && !written.includes(node.url), 'no key or RPC URL in recorded files');
  pass('deploys the native-only escrow, verifies runtime code and empty allowlist from chain state, writes record and registry');

  // The recorder refuses a deployment whose runtime is not the pinned BasicEscrow.
  const other = await node.rpc('eth_sendTransaction', [{ from: record.deployer, data: '0x600a600c600039600a6000f3602a60005260206000f3' }]);
  await assert.rejects(recordDeployment({ rpcUrl: node.url, txHash: other, publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, outDir: resolve(temporary, 'x'), registryPath: resolve(temporary, 'x/r.json') }), code('RUNTIME_CODE_MISMATCH'));
  await assert.rejects(recordDeployment({ rpcUrl: node.url, txHash: record.initializationTx, publicEndpoint: PUBLIC_ENDPOINT, outDir: resolve(temporary, 'x'), registryPath: resolve(temporary, 'x/r.json') }), code('WRONG_GENESIS'));
  await assert.rejects(recordDeployment({ rpcUrl: node.url, txHash: record.initializationTx, publicEndpoint: 'http://example.invalid/', expectGenesis: genesisHash, outDir: resolve(temporary, 'x'), registryPath: resolve(temporary, 'x/r.json') }));
  pass('recorder refuses foreign runtime code, wrong genesis and a non-https public endpoint');

  // Owner signs with an ephemeral testnet key; the app's G15→G11 verifier accepts it and finds the escrow.
  const root = resolve(temporary, 'root');
  for (const file of ['contracts/evm/foundry.toml', 'package-lock.json', 'THIRD_PARTY_NOTICES.md']) { await mkdir(resolve(root, file, '..'), { recursive: true }); await copyFile(resolve(ROOT, file), resolve(root, file)); }
  const owner = keygen();
  await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  const now = 1_900_000_000;
  const signed = await signRelease({ privateJwk: owner.privateJwk, sequence: 1, days: 30, now, root, sourceCommit: 'a'.repeat(40) });
  await writeFile(resolve(root, 'registry/testnet/sepolia.release.json'), signed.manifestBytes);
  await writeFile(resolve(root, 'registry/testnet/sepolia.release.sig.json'), JSON.stringify(signed.envelope));
  const verified = await verifySepoliaRelease({ root, nowSeconds: () => now + 60 });
  assert.equal(verified.ok, true, JSON.stringify(verified));
  assert.equal(verified.value.escrow, record.contractAddress); assert.equal(verified.value.runtimeKeccak, record.codeDigest.runtime);
  assert.equal(verified.value.releaseEnabled, false);
  pass('owner-signed release verifies with the trusted testnet key and binds the registry deployment');

  // Refusals: expired manifest, untrusted key, tampered registry.
  assert.equal((await verifySepoliaRelease({ root, nowSeconds: () => now + 31 * 86_400 })).error.code, 'MANIFEST_EXPIRED');
  const stranger = keygen();
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: stranger.keyId, publicKey: stranger.publicKey }));
  assert.equal((await verifySepoliaRelease({ root, nowSeconds: () => now + 60 })).ok, false, 'a manifest signed by another key is refused');
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  const registryFile = resolve(root, REGISTRY_ASSET);
  const original = await readFile(registryFile, 'utf8');
  await writeFile(registryFile, original.replace(record.contractAddress, '0x' + 'de'.repeat(20)));
  assert.equal((await verifySepoliaRelease({ root, nowSeconds: () => now + 60 })).error.code, 'ASSET_MISMATCH');
  pass('refuses an expired manifest, an untrusted key and a tampered registry');

  // The broadcast cache Forge writes must not hold the key either (it is git-ignored, but check anyway).
  const broadcastDir = resolve(ROOT, 'contracts/evm/broadcast/DeployBasicEscrow.s.sol/11155111');
  for (const name of await readdir(broadcastDir)) assert.ok(!(await readFile(resolve(broadcastDir, name), 'utf8')).includes(DEV_KEY.slice(2)), name);
  pass('Forge broadcast logs contain no private key');
  console.log(`\n${passed.length} sepolia kit checks passed`);
} finally {
  for (const anvil of anvils) anvil.stop();
  await rm(temporary, { recursive: true, force: true });
  await rm(resolve(ROOT, 'contracts/evm/broadcast/DeployBasicEscrow.s.sol/11155111'), { recursive: true, force: true });
}
