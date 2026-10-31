#!/usr/bin/env node
/**
 * Local proof of the Sepolia kit (G25) against a private anvil started with Sepolia's chain id 11155111: guarded
 * deploy (endpoint, chain, genesis, funding, clean sources, pinned toolchain), the pending-deployment marker after a
 * post-broadcast failure, on-chain record with every recorder refusal, G11 registry draft, re-recording after finality,
 * owner signing with an ephemeral key (Sepolia-only, finalized record, 30-day cap), verification through the app's own
 * verifier, acceptance and rollback refusal, and the CLI entry guard. Loopback only: no Sepolia access, no real funds;
 * anvil's public development key stands in for the deployer. Writes only into a temporary directory.
 *
 *   npm run test:sepolia:kit   (needs Foundry: FOUNDRY_BIN, ~/.foundry/bin or PATH)
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { deploy } from './sepolia/deploy.mjs';
import { PENDING_FILE, recordDeployment } from './sepolia/record-deployment.mjs';
import { keygen, REGISTRY_ASSET, signRelease } from './sepolia/owner-release.mjs';
import { acceptSepoliaRelease, TRUSTED_KEY_PATH, verifySepoliaRelease } from './sepolia/verify-release.mjs';
import { chainIdentity, checkCleanSource, checkToolchain, EVM_DIR, ROOT, rpcClient, SEPOLIA, TOOLCHAIN } from './sepolia/lib.mjs';
import { TESTNET_ACCEPTED_FILE } from '../apps/web/scripts/testnet-trust.mjs';

const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const PATH = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}:${process.env.PATH ?? ''}` : process.env.PATH ?? '';
// Anvil's documented deterministic development keys 0 and 1 (public, worthless) and an unfunded throwaway key.
const DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEPLOYER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const OTHER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const UNFUNDED_KEY = '0x' + '11'.repeat(32);
const PUBLIC_ENDPOINT = 'https://ethereum-sepolia-rpc.publicnode.com/';
// An operator session holds real Sepolia settings; none of them may reach this loopback-only proof.
process.env.SEPOLIA_SELLER_PRIVATE_KEY = '0x' + '22'.repeat(32);
process.env.SEPOLIA_CROSSCHECK_RPC_URL = 'http://127.0.0.1:9/';
const KEYED_RPC = 'https://eth-sepolia.g.alchemy.com/v2/AbCdEf0123456789xyzKEY';
const runNode = promisify(execFile);
const passed = [];
const pass = name => { passed.push(name); console.log(`ok - ${name}`); };
const code = expected => error => { assert.equal(error?.code, expected, String(error?.stack ?? error)); return true; };
const message = expected => error => { assert.equal(error?.message, expected, String(error?.stack ?? error)); return true; };

const freePort = () => new Promise((done, fail) => { const server = createServer(); server.once('error', fail); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)); }); });
async function startAnvil(chainId) {
  const port = await freePort();
  const child = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', String(chainId), '--silent'], { env: { ...process.env, PATH }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`, rpc = rpcClient(url, { timeoutMs: 2000 });
  for (let attempt = 0; ; attempt++) { try { await rpc('eth_chainId'); break; } catch (error) { if (attempt > 100) throw error; await new Promise(done => setTimeout(done, 100)); } }
  return { url, rpc, stop: () => child.kill('SIGTERM') };
}
/** A JSON-RPC proxy that reports a different block hash in every receipt: an endpoint that disagrees with the primary. */
async function disagreeingProxy(target) {
  const server = createHttpServer(async (request, response) => {
    let body = ''; for await (const part of request) body += part;
    const call = JSON.parse(body), reply = await (await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).json();
    if (call.method === 'eth_getTransactionReceipt' && reply.result) reply.result.blockHash = `0x${'ab'.repeat(32)}`;
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(reply));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(done => { server.closeAllConnections(); server.close(done); }) };
}

/** Paths and mtimes of the checkout's Forge broadcast records: a local proof must leave real deployment records untouched. */
async function broadcastSnapshot() {
  const dir = resolve(EVM_DIR, 'broadcast');
  if (!existsSync(dir)) return '[]';
  const names = (await readdir(dir, { recursive: true })).sort();
  return JSON.stringify(await Promise.all(names.map(async name => [name, (await stat(resolve(dir, name))).mtimeMs])));
}

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-sepolia-kit-'));
const recordsBefore = await broadcastSnapshot();
const anvils = [];
let proxy;
try {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('SEPOLIA_')));
  const env = (url, key = DEV_KEY) => ({ ...inherited, PATH, SEPOLIA_RPC_URL: url, SEPOLIA_DEPLOYER_PRIVATE_KEY: key });
  // A temporary repository root laid out like the checkout: records, registry and trust files live where the tools look.
  const root = resolve(temporary, 'root');
  for (const file of ['contracts/evm/foundry.toml', 'package-lock.json', 'THIRD_PARTY_NOTICES.md']) { await mkdir(resolve(root, file, '..'), { recursive: true }); await copyFile(resolve(ROOT, file), resolve(root, file)); }
  const recordsDir = resolve(root, 'docs/deployments/sepolia');
  const out = { outDir: recordsDir, registryPath: resolve(root, REGISTRY_ASSET) };
  const broadcastDir = resolve(temporary, 'broadcast');

  // Pins: the README and the kit agree, and the installed toolchain is the pinned one.
  const readme = await readFile(resolve(EVM_DIR, 'README.md'), 'utf8');
  assert.ok(readme.includes(TOOLCHAIN.forgeCommit.slice(0, 8)) && readme.includes(TOOLCHAIN.solcSha256) && readme.includes(`solc ${TOOLCHAIN.solcVersion}`), 'README pins match the kit');
  assert.equal((await checkToolchain({ ...inherited, PATH })).forgeCommit, TOOLCHAIN.forgeCommit);
  const fakeBin = resolve(temporary, 'fake-bin'); await mkdir(fakeBin);
  await writeFile(resolve(fakeBin, 'forge'), '#!/bin/sh\necho "forge Version: 1.4.0-v1.4.0"\necho "Commit SHA: 0000000000000000000000000000000000000000"\n'); await chmod(resolve(fakeBin, 'forge'), 0o755);
  await assert.rejects(checkToolchain({ ...inherited, PATH: `${fakeBin}:${PATH}` }), code('TOOLCHAIN_MISMATCH'));
  await writeFile(resolve(temporary, 'solc-fake'), 'not the pinned compiler');
  await assert.rejects(checkToolchain({ ...inherited, PATH, FOUNDRY_SOLC: resolve(temporary, 'solc-fake') }), code('TOOLCHAIN_MISMATCH'));
  // Sources: any change under contracts/evm makes the recorded commit untrue, so it is refused.
  const scratchRepo = resolve(temporary, 'scratch-repo'); await mkdir(resolve(scratchRepo, 'contracts/evm/src'), { recursive: true });
  const git = (...args) => runNode('git', ['-c', 'user.email=kit@example.invalid', '-c', 'user.name=kit', ...args], { cwd: scratchRepo });
  await writeFile(resolve(scratchRepo, 'contracts/evm/src/A.sol'), '// committed\n'); await git('init', '-q'); await git('add', '.'); await git('commit', '-q', '-m', 'base');
  assert.match(await checkCleanSource(scratchRepo), /^[0-9a-f]{40}$/);
  await writeFile(resolve(scratchRepo, 'contracts/evm/src/A.sol'), '// edited, not committed\n');
  await assert.rejects(checkCleanSource(scratchRepo), code('DIRTY_SOURCE'));
  await git('checkout', '--', '.'); await writeFile(resolve(scratchRepo, 'contracts/evm/src/B.sol'), '// untracked\n');
  await assert.rejects(checkCleanSource(scratchRepo), code('DIRTY_SOURCE'));
  pass('pins agree with the README; a different forge or solc and dirty or untracked contract sources are refused');

  // Refusals happen before any transaction: endpoint, wrong chain id, unknown genesis, unfunded or missing key.
  const mainnetLike = await startAnvil(1); anvils.push(mainnetLike);
  await assert.rejects(deploy({ env: env(mainnetLike.url), publicEndpoint: PUBLIC_ENDPOINT, ...out }), code('WRONG_CHAIN'));
  assert.equal(await mainnetLike.rpc('eth_getTransactionCount', [DEPLOYER, 'latest']), '0x0', 'nothing sent on a wrong chain');
  const node = await startAnvil(SEPOLIA.chainId); anvils.push(node);
  await assert.rejects(deploy({ env: env(node.url), publicEndpoint: PUBLIC_ENDPOINT, ...out }), code('WRONG_GENESIS'));
  const { genesisHash } = await chainIdentity(node.rpc);
  assert.notEqual(genesisHash, SEPOLIA.genesisHash, 'a local node never passes as real Sepolia by default');
  await assert.rejects(deploy({ env: env(node.url, UNFUNDED_KEY), publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, ...out }), code('DEPLOYER_UNFUNDED'));
  await assert.rejects(deploy({ env: { ...env(node.url), SEPOLIA_DEPLOYER_PRIVATE_KEY: '' }, publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, ...out }), code('DEPLOYER_KEY_MISSING'));
  for (const bad of [undefined, 'http://example.invalid/', 'https://user:pass@example.invalid/', 'https://example.invalid/?key=x', 'not a url']) {
    await assert.rejects(deploy({ env: env(node.url), publicEndpoint: bad, expectGenesis: genesisHash, ...out }), code('PUBLIC_ENDPOINT_INVALID'), String(bad));
  }
  // A keyed provider URL never becomes the registry's public endpoint (it would be signed and shipped in the bundle).
  await assert.rejects(deploy({ env: { ...env(node.url), SEPOLIA_CROSSCHECK_RPC_URL: KEYED_RPC }, publicEndpoint: KEYED_RPC, expectGenesis: genesisHash, ...out }), code('PUBLIC_ENDPOINT_IS_PRIVATE_RPC'));
  await assert.rejects(deploy({ env: { ...env(node.url), SEPOLIA_CROSSCHECK_RPC_URL: KEYED_RPC }, publicEndpoint: 'https://proxy.example/AbCdEf0123456789xyzKEY/', expectGenesis: genesisHash, ...out }), code('PUBLIC_ENDPOINT_IS_PRIVATE_RPC'));
  // The genesis override is programmatic (tests) only: the CLIs refuse it before contacting the node.
  for (const [script, args] of [['scripts/sepolia/deploy.mjs', ['--public-endpoint', PUBLIC_ENDPOINT, '--expect-genesis', genesisHash]],
    ['scripts/sepolia/record-deployment.mjs', ['--tx', '0x' + '00'.repeat(32), '--public-endpoint', PUBLIC_ENDPOINT, '--expect-genesis', genesisHash, '--out-dir', resolve(temporary, 'cli'), '--registry', resolve(temporary, 'cli/r.json')]]]) {
    await assert.rejects(runNode(process.execPath, ['--import', resolve(ROOT, 'scripts/test-support/register-tsx.mjs'), resolve(ROOT, script), ...args],
      { cwd: ROOT, env: env(node.url) }), error => /expect-genesis/.test(String(error?.stderr)), script);
  }
  assert.equal(await node.rpc('eth_blockNumber'), '0x0', 'refusals sent nothing');
  pass('refuses a bad or keyed public endpoint, wrong chain id, non-Sepolia genesis, unfunded or missing key and a CLI genesis override before sending anything');

  // A failure after the broadcast names the transaction and contract, and blocks a second deployment until it is recorded.
  // The key is given without 0x (the form wallets export); Forge needs the prefix, so the kit normalizes it.
  const unreachable = { ...env(node.url, DEV_KEY.slice(2)), SEPOLIA_CROSSCHECK_RPC_URL: 'http://127.0.0.1:9/' };
  let pendingTx, pendingAddress;
  await assert.rejects(deploy({ env: unreachable, publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, broadcastDir, ...out }), error => {
    assert.equal(error?.code, 'RPC_UNREACHABLE'); assert.match(error.tx, /^0x[0-9a-f]{64}$/); assert.match(error.address, /^0x[0-9a-f]{40}$/);
    pendingTx = error.tx; pendingAddress = error.address; return true;
  });
  assert.deepEqual((({ tx, address }) => ({ tx, address }))(JSON.parse(await readFile(resolve(recordsDir, PENDING_FILE), 'utf8'))), { tx: pendingTx, address: pendingAddress });
  const sentBefore = await node.rpc('eth_getTransactionCount', [DEPLOYER, 'latest']);
  await assert.rejects(deploy({ env: env(node.url), publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash, ...out }), error => error?.code === 'UNRECORDED_DEPLOYMENT_PENDING' && error.tx === pendingTx);
  assert.equal(await node.rpc('eth_getTransactionCount', [DEPLOYER, 'latest']), sentBefore, 'no second deployment while one is unrecorded');
  for (const name of await readdir(broadcastDir, { recursive: true })) {
    if (name.endsWith('.json')) assert.ok(!(await readFile(resolve(broadcastDir, name), 'utf8')).includes(DEV_KEY.slice(2)), name);
  }
  const recorded = await recordDeployment({ rpcUrl: node.url, txHash: pendingTx, publicEndpoint: PUBLIC_ENDPOINT, expectedDeployer: DEPLOYER, expectGenesis: genesisHash, ...out, env: env(node.url) });
  assert.equal(existsSync(resolve(recordsDir, PENDING_FILE)), false, 'recording the broadcast clears the marker');
  const record = recorded.record;
  assert.equal(record.contractAddress, pendingAddress); assert.equal(record.chainId, '11155111'); assert.equal(record.genesisIdentity, genesisHash);
  assert.equal(record.authorityModel, 'immutable'); assert.deepEqual(record.assetAllowlist, []); assert.equal(record.deployer, DEPLOYER); assert.equal(record.deployerVerified, true);
  assert.equal(record.sourceTreeClean, true); assert.match(record.sourceCommit, /^[0-9a-f]{40}$/); assert.deepEqual(record.toolchain, { ...TOOLCHAIN });
  assert.equal(record.finalizedAtRecording, false, 'the deployment block is not finalized yet');
  assert.match(record.codeDigest.runtime, /^[0-9a-f]{64}$/); assert.match(record.artifactSha256, /^[0-9a-f]{64}$/);
  const written = await readFile(recorded.recordPath, 'utf8') + await readFile(recorded.registryPath, 'utf8');
  assert.ok(!written.includes(DEV_KEY.slice(2)) && !written.includes(node.url), 'no key or RPC URL in recorded files');
  pass('a post-broadcast failure names the transaction and contract, blocks redeploying, and record-deployment completes it from chain state');

  // Every recorder refusal, each from real chain state.
  const recordInto = (txHash, extra = {}) => recordDeployment({ rpcUrl: node.url, txHash, publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash,
    outDir: resolve(temporary, 'x'), registryPath: resolve(temporary, 'x/r.json'), env: env(node.url), ...extra });
  const other = await node.rpc('eth_sendTransaction', [{ from: DEPLOYER, data: '0x600a600c600039600a6000f3602a60005260206000f3' }]);
  await assert.rejects(recordInto(other), code('RUNTIME_CODE_MISMATCH'));
  await assert.rejects(recordInto(pendingTx, { expectGenesis: SEPOLIA.genesisHash }), code('WRONG_GENESIS'));
  await assert.rejects(recordInto(pendingTx, { publicEndpoint: 'http://example.invalid/' }), code('PUBLIC_ENDPOINT_INVALID'));
  await assert.rejects(recordInto(pendingTx, { expectedDeployer: '0x' + '70'.repeat(20) }), code('UNEXPECTED_DEPLOYER'));
  const transfer = await node.rpc('eth_sendTransaction', [{ from: DEPLOYER, to: '0x' + '70'.repeat(20), value: '0x1' }]);
  await assert.rejects(recordInto(transfer), code('NOT_A_DEPLOYMENT'));
  const revertedCreate = await node.rpc('eth_sendTransaction', [{ from: DEPLOYER, data: '0x60006000fd', gas: '0x30000' }]);
  await assert.rejects(recordInto(revertedCreate), code('DEPLOY_REVERTED'));
  // The runtime code does not depend on the allowlist, so only the allowlist read stops a token-enabled deployment.
  // The constructor only requires code at each allowlisted address; the contract created above serves as a stand-in token.
  const standInToken = (await node.rpc('eth_getTransactionReceipt', [other])).contractAddress;
  const { stdout: created } = await runNode('forge', ['create', 'src/BasicEscrow.sol:BasicEscrow', '--rpc-url', node.url, '--private-key', OTHER_KEY, '--broadcast',
    '--constructor-args', `[${standInToken}]`], { cwd: EVM_DIR, env: { ...inherited, PATH, FOUNDRY_OFFLINE: 'true' } });
  const tokenDeployment = /Transaction hash: (0x[0-9a-f]{64})/.exec(created)?.[1];
  assert.ok(tokenDeployment, 'forge create reported its transaction');
  await assert.rejects(recordInto(tokenDeployment), code('ALLOWLIST_NOT_EMPTY'));
  proxy = await disagreeingProxy(node.url);
  await assert.rejects(recordInto(pendingTx, { crosscheckUrl: proxy.url }), code('CROSSCHECK_MISMATCH'));
  pass('recorder refuses foreign runtime code, wrong genesis, a non-https endpoint, an unexpected deployer, a non-deployment, a reverted deployment, a non-empty allowlist and a disagreeing cross-check');

  // Owner signing: Sepolia-only registry, deployment recorded after finality, at most 30 days.
  const owner = keygen();
  await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  const now = 1_900_000_000;
  const sign = extra => signRelease({ privateJwk: owner.privateJwk, sequence: 1, days: 30, now, root, sourceCommit: 'a'.repeat(40), expectGenesis: genesisHash, ...extra });
  await assert.rejects(sign({ expectGenesis: undefined }), message('REGISTRY_NOT_SEPOLIA'));
  await assert.rejects(sign(), message('DEPLOYMENT_NOT_FINALIZED'));
  await node.rpc('anvil_mine', ['0x46']); // anvil finalizes latest - 64
  const refreshed = await recordDeployment({ rpcUrl: node.url, txHash: pendingTx, publicEndpoint: PUBLIC_ENDPOINT, expectedDeployer: DEPLOYER, expectGenesis: genesisHash, ...out, env: env(node.url) });
  assert.equal(refreshed.record.finalizedAtRecording, true, 're-recording after finality marks the record finalized');
  await assert.rejects(sign({ days: 31 }), message('DAYS_INVALID'));
  const signed = await sign();
  assert.deepEqual(signed.summary.networks.map(network => [network.id, network.chainIdentity, network.genesisHash, network.environment, network.endpoints, network.deployments.map(item => item.address)]),
    [['sepolia', '11155111', genesisHash, 'testnet', [PUBLIC_ENDPOINT], [record.contractAddress]]], 'the owner sees exactly what is signed');
  const recordPath = resolve(recordsDir, `BasicEscrow-${record.contractAddress}.json`), recordText = await readFile(recordPath, 'utf8');
  await writeFile(recordPath, recordText.replace(record.codeDigest.runtime, 'f'.repeat(64)));
  await assert.rejects(sign(), message('DEPLOYMENT_RECORD_MISMATCH'));
  await writeFile(recordPath, recordText);
  const publish = async release => {
    await writeFile(resolve(root, 'registry/testnet/sepolia.release.json'), release.manifestBytes);
    await writeFile(resolve(root, 'registry/testnet/sepolia.release.sig.json'), JSON.stringify(release.envelope));
  };
  await publish(signed);
  pass('owner signing refuses a non-Sepolia registry, a deployment not recorded after finality or not matching its record, and more than 30 days');

  // Verification by the app's verifier: real-Sepolia identity by default, then the local stand-in.
  assert.equal((await verifySepoliaRelease({ root, nowSeconds: () => now + 60 })).error.code, 'NETWORK_NOT_SEPOLIA', 'real-Sepolia identity by default');
  const check = (nowSeconds = () => now + 60) => verifySepoliaRelease({ root, nowSeconds, expectGenesis: genesisHash });
  const verified = await check();
  assert.equal(verified.ok, true, JSON.stringify(verified));
  assert.equal(verified.value.escrow, record.contractAddress); assert.equal(verified.value.runtimeKeccak, record.codeDigest.runtime);
  assert.equal(verified.value.releaseEnabled, false);
  assert.equal((await check(() => now + 31 * 86_400)).error.code, 'MANIFEST_EXPIRED');
  const stranger = keygen();
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: stranger.keyId, publicKey: stranger.publicKey }));
  assert.equal((await check()).ok, false, 'a manifest signed by another key is refused');
  // The pinned keyId is enforced as the build enforces it: neither half of the trusted-key file can be swapped alone.
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: 'f'.repeat(64), publicKey: owner.publicKey }));
  assert.equal((await check()).error.code, 'KEY_UNTRUSTED');
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: stranger.publicKey }));
  assert.equal((await check()).ok, false);
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  const registryFile = resolve(root, REGISTRY_ASSET), registryText = await readFile(registryFile, 'utf8');
  await writeFile(registryFile, registryText.replace(record.contractAddress, '0x' + 'de'.repeat(20)));
  assert.equal((await check()).error.code, 'ASSET_MISMATCH');
  await writeFile(registryFile, registryText);
  pass('verification binds the registry deployment; refuses the real-Sepolia mismatch, an expired manifest, an untrusted or mismatched key and a tampered registry');

  // Acceptance (G25 §4.3): once a release is accepted, an older one or another manifest at the same sequence is a rollback.
  await acceptSepoliaRelease(verified, { root });
  assert.deepEqual(JSON.parse(await readFile(resolve(root, TESTNET_ACCEPTED_FILE), 'utf8')), { sequence: 1, manifestSha256: verified.value.manifestSha256 });
  assert.equal((await check()).ok, true, 'the accepted release itself still verifies');
  const second = await sign({ sequence: 2 });
  await publish(second);
  const verifiedSecond = await check();
  assert.equal(verifiedSecond.ok, true); assert.equal(verifiedSecond.value.sequence, 2);
  await acceptSepoliaRelease(verifiedSecond, { root });
  await publish(signed);
  assert.equal((await check()).error.code, 'RELEASE_ROLLBACK', 'an older signed release is refused after a newer one was accepted');
  await publish(await sign({ sequence: 2, days: 29 }));
  assert.equal((await check()).error.code, 'RELEASE_ROLLBACK', 'a different manifest at the accepted sequence is refused');
  await publish(second);
  pass('an accepted release is recorded; an older release or a substitute at the accepted sequence is refused as a rollback');

  // CLI entry guard: a checkout path with spaces, reached through a symlink, still runs the CLI (it used to exit 0 silently).
  const linked = resolve(temporary, 'path with spaces'); await mkdir(linked); await symlink(ROOT, resolve(linked, 'checkout'));
  const cli = await runNode(process.execPath, ['--import', resolve(ROOT, 'scripts/test-support/register-tsx.mjs'), resolve(linked, 'checkout/scripts/sepolia/verify-release.mjs')],
    { cwd: ROOT, env: { ...inherited, PATH } }).then(result => ({ exit: 0, out: result.stdout }), error => ({ exit: error.code, out: String(error.stdout) }));
  assert.match(cli.out, /"ok":/, 'the CLI ran and printed its result'); assert.notEqual(cli.exit, undefined);
  pass('the Sepolia CLIs run from a checkout path with spaces reached through a symlink');

  // Nothing on disk holds the key or the RPC URL: Forge's caches are removed and no checkout broadcast record is written.
  for (const dir of ['cache', 'broadcast']) {
    for (const name of existsSync(resolve(EVM_DIR, dir)) ? await readdir(resolve(EVM_DIR, dir), { recursive: true }) : []) {
      if (!name.endsWith('.json')) continue;
      const text = await readFile(resolve(EVM_DIR, dir, name), 'utf8').catch(() => '');
      assert.ok(!text.includes(DEV_KEY.slice(2)) && !text.includes(node.url), `${dir}/${name}`);
    }
  }
  assert.equal(existsSync(resolve(EVM_DIR, 'cache/DeployBasicEscrow.s.sol/11155111')), false, 'Forge RPC-URL cache removed after deploy');
  assert.equal(await broadcastSnapshot(), recordsBefore, 'the checkout broadcast records are never touched');
  pass('no key or RPC URL in any Forge cache or broadcast file; the checkout broadcast records are untouched');
  console.log(`\n${passed.length} sepolia kit checks passed`);
} finally {
  await proxy?.close();
  for (const anvil of anvils) anvil.stop();
  await rm(temporary, { recursive: true, force: true });
}
