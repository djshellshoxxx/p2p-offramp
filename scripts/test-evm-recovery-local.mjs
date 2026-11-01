#!/usr/bin/env node
/** Portable G25 canonical-EVM recovery proof. Private loopback Anvil and public
 * development accounts only. The copied recovery executable has no loader,
 * checkout dependencies or signing keys. Only this separate fixture wallet
 * submits its unsigned plans; the executable's RPC proxy permits reads only. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createServer as createHttpsServer } from 'node:https';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { verifyRelease } from '../packages/security/src/release-manifest.ts';
import { fixture, sha } from '../packages/security/test/lib/release-fixture.mjs';
import { buildFundNative, buildGetTrade, buildSetAccept, decodeTrade } from '../packages/wallet/src/evm-escrow.ts';
import { evmTermsHash, keccak256 } from '../packages/wallet/src/evm-terms.ts';
import { buildEvmRecoveryPackage } from './recovery/build-evm.mjs';
import { checkToolchain, forgeEnv, rpcClient } from './sepolia/lib.mjs';

const run = promisify(execFile), ROOT = fileURLToPath(new URL('../', import.meta.url));
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('SEPOLIA_')));
const ENV = { ...inherited, PATH: `${FOUNDRY}:${inherited.PATH ?? ''}` };
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Published Anvil development key.
const ZERO = `0x${'0'.repeat(40)}`, AMOUNT = 1_000_000_000_000_000n;
const quantity = value => `0x${BigInt(value).toString(16)}`;
const hex = value => Buffer.from(value).toString('hex');
const good = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const methods = [], checks = [], allowed = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call']);
const pass = label => { checks.push(label); console.log(`ok - ${label}`); };
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-evm-recovery-'));
const certificatePath = resolve(temporary, 'loopback-cert.pem');
let anvil, proxy, rpc, accounts, escrow, portable, mode = null, latestAnchor;

const freePort = () => new Promise((done, fail) => {
  const server = createServer(); server.once('error', fail);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(error => error ? fail(error) : done(port)); });
});
const mine = (count = 5) => rpc('anvil_mine', [quantity(count)]);
const block = tag => rpc('eth_getBlockByNumber', [tag, false]);
const chainTime = async () => BigInt((await block('latest')).timestamp);
async function send(from, call) {
  const hash = await rpc('eth_sendTransaction', [{ from, to: call.to, data: call.data, value: quantity(call.value ?? '0'), gas: '0x7a120' }]);
  let receipt;
  for (let attempt = 0; attempt < 100; attempt++) {
    receipt = await rpc('eth_getTransactionReceipt', [hash]); if (receipt) break;
    await new Promise(done => setTimeout(done, 20));
  }
  assert.equal(receipt?.status, '0x1', 'separate fixture-wallet transaction succeeded'); return receipt;
}
async function stored(tradeId) {
  const call = buildGetTrade(escrow, tradeId);
  return decodeTrade(await rpc('eth_call', [{ to: call.to, data: call.data }, 'latest']));
}
function terms(label, now, buyer = accounts[1]) {
  return { orderId: sha(`recovery-${label}`), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-local-v1',
    seller: accounts[0], buyer, assetKind: 'native', asset: ZERO, amountBaseUnits: String(AMOUNT),
    privateAgreementHash: sha('synthetic independent recovery'), capabilitiesHash: sha('core-only'), sellerNonce: sha(`nonce-${label}`),
    acceptBeforeSeconds: String(now + 600n), escrowExpirySeconds: String(now + 3600n) };
}
async function fund(label, buyer) {
  const value = terms(label, await chainTime(), buyer), domain = { chainId: '31337', verifyingContract: escrow };
  await send(accounts[0], buildFundNative(domain, value)); await mine();
  return { terms: value, tradeId: evmTermsHash(domain, value) };
}
async function cli(command, args, { succeeds = true, fault = null, endpointId = 'recovery-loopback' } = {}) {
  mode = fault; latestAnchor = undefined;
  let result;
  try {
    result = await run(process.execPath, [portable, command, '--endpoint', endpointId, ...args],
      { cwd: resolve(temporary, 'consumer'), env: { PATH: inherited.PATH ?? '', TZ: 'UTC', NODE_EXTRA_CA_CERTS: certificatePath }, timeout: 15_000, maxBuffer: 128 * 1024 });
  } catch (error) { result = error; }
  finally { mode = null; }
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, succeeds, `${command}: ${result.stdout}`);
  if (succeeds) { assert.equal(result.code, undefined); return parsed.value; }
  assert.ok(result.code !== undefined); assert.equal(typeof parsed.error.code, 'string');
  assert.equal(Object.hasOwn(parsed, 'value'), false); assert.doesNotMatch(result.stdout, /https?:|SECRET|privateKey/);
  return parsed.error;
}
async function deploy(target, args = []) {
  const result = await run('forge', ['create', target, '--rpc-url', rpc.url, '--private-key', KEY, '--broadcast', '--json', ...args],
    { cwd: resolve(ROOT, 'contracts/evm'), env: forgeEnv(ENV, { FOUNDRY_OFFLINE: 'true' }), timeout: 30_000, maxBuffer: 1 << 20 });
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).deployedTo.toLowerCase();
}

try {
  await checkToolchain(ENV);
  const port = await freePort(), url = `http://127.0.0.1:${port}/`;
  rpc = Object.assign(rpcClient(url, { timeoutMs: 5000 }), { url });
  anvil = spawn(ANVIL, ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', '31337', '--slots-in-an-epoch', '1'],
    { env: forgeEnv(ENV), stdio: 'ignore' });
  let spawnError; anvil.once('error', error => { spawnError = error; });
  for (let attempt = 0; ; attempt++) {
    try { await rpc('eth_chainId'); break; }
    catch { if (spawnError || anvil.exitCode !== null || attempt >= 100) throw Error('Local Anvil startup failed'); await new Promise(done => setTimeout(done, 50)); }
  }
  accounts = (await rpc('eth_accounts')).map(value => value.toLowerCase());
  escrow = await deploy('src/BasicEscrow.sol:BasicEscrow', ['--constructor-args', '[]']); await mine();

  const certificateKeyPath = resolve(temporary, 'loopback-key.pem');
  await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', certificateKeyPath, '-out', certificatePath,
    '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { timeout: 10_000, maxBuffer: 1 << 20 });
  proxy = createHttpsServer({ key: await readFile(certificateKeyPath), cert: await readFile(certificatePath) }, async (request, response) => {
    try {
      let text = ''; for await (const part of request) { text += part; assert.ok(text.length <= 65_536); }
      const call = JSON.parse(text); methods.push(call.method); assert.ok(allowed.has(call.method), `recovery attempted ${call.method}`);
      let result = await rpc(call.method, call.params);
      if (mode === 'chain' && call.method === 'eth_chainId') result = '0x1';
      if (mode === 'genesis' && call.method === 'eth_getBlockByNumber' && call.params[0] === '0x0') result = { ...result, hash: `0x${'ab'.repeat(32)}` };
      if (mode === 'runtime' && call.method === 'eth_getCode') result = '0x6000';
      if (call.method === 'eth_getBlockByNumber' && call.params[0] === 'latest') latestAnchor = result;
      else if (mode === 'anchor' && latestAnchor && call.method === 'eth_getBlockByNumber' && /^0x[0-9a-f]+$/.test(call.params[0]) && BigInt(call.params[0]) === BigInt(latestAnchor.number))
        result = { ...result, hash: `0x${'ac'.repeat(32)}` };
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
    } catch { response.writeHead(500); response.end('{}'); }
  });
  await new Promise((done, fail) => { proxy.once('error', fail); proxy.listen(0, '127.0.0.1', done); });
  const proxyUrl = `https://127.0.0.1:${proxy.address().port}/`;
  const raw = JSON.parse(await readFile(resolve(ROOT, 'packages/domain/test/fixtures/local-evm-scenario/registry.json')));
  raw.releaseId = 'recovery-local-fixture';
  const network = raw.networks[0]; network.genesisHash = (await block('0x0')).hash;
  network.endpoints = [{ id: 'recovery-loopback', url: proxyUrl }]; network.assets = network.assets.filter(value => value.kind === 'native');
  network.deployments = [{ ...network.deployments[0], address: escrow,
    runtime: { kind: 'evm-code', keccak256: hex(keccak256(Buffer.from((await rpc('eth_getCode', [escrow, 'latest'])).slice(2), 'hex'))), upgradeable: false }, supportedAssetIds: ['native'] }];
  const registryBytes = new TextEncoder().encode(JSON.stringify(raw)), registryPath = 'registry.json';
  const abiBytes = new Uint8Array(await readFile(resolve(ROOT, 'contracts/evm/abi/BasicEscrow.json'))), abiPath = 'BasicEscrow.json';
  const assets = [{ path: abiPath, bytes: abiBytes }, { path: registryPath, bytes: registryBytes }];
  const signed = fixture(manifest => { manifest.releaseId = raw.releaseId; manifest.assets = assets.map(({ path, bytes }) => ({ path, bytes: bytes.length, sha256: sha(bytes) })); });
  const verifiedRelease = good(await verifyRelease(signed.bytes, signed.envelope, [signed.key], 0,
    { channel: 'fixture-beta', assets, nowSeconds: () => 1500 }));
  const bundle = await buildEvmRecoveryPackage({ verifiedRelease, registryPath, registryBytes, abiPath, abiBytes,
    networkId: network.id, deploymentId: network.deployments[0].id, outDir: resolve(temporary, 'built') });
  await mkdir(resolve(temporary, 'consumer')); await cp(bundle.directory, resolve(temporary, 'consumer/recovery'), { recursive: true });
  await rm(bundle.directory, { recursive: true });
  portable = resolve(temporary, 'consumer/recovery', basename(bundle.executable));
  assert.equal((await verifyRelease(signed.bytes, signed.envelope, [signed.key], 0,
    { channel: 'fixture-beta', assets, nowSeconds: () => 2000 })).error.code, 'MANIFEST_EXPIRED');

  const release = await fund('release');
  const snapshot = await cli('inspect', ['--trade-id', release.tradeId]);
  assert.equal(snapshot.historicalOnly, true); assert.equal(snapshot.releaseEnabled, false);
  assert.deepEqual(snapshot.trade, await stored(release.tradeId)); assert.equal(Object.hasOwn(snapshot, 'transaction'), false);
  pass('copied bundle runs with Node alone and reads original escrow after its release manifest expires');

  const hints = { format: 'p2p-offramp/offline-recovery-references/v1', authority: 'unverified-offline-reference', localSnapshotRevision: 7,
    items: [{ recordId: 'aa'.repeat(16), intentId: Buffer.alloc(32, 7).toString('base64url'),
      binding: { chain: 'evm', networkId: network.id, deploymentId: network.deployments[0].id, tradeId: release.tradeId },
      account: accounts[9], action: 'refund', storedState: 'finalized', chainReference: `0x${'ab'.repeat(32)}`, nonce: '99' }] };
  const reference = resolve(temporary, 'consumer/references.json'); await writeFile(reference, JSON.stringify(hints));
  const releasePlan = await cli('prepare-release', ['--reference', reference, '--item', '0', '--from', accounts[0]]);
  assert.equal(releasePlan.trade.seller, accounts[0]); assert.equal(releasePlan.trade.buyer, accounts[1]);
  assert.equal(releasePlan.transaction.to, escrow); assert.equal(releasePlan.transaction.value, '0x0');
  assert.equal(releasePlan.transaction.chainId, '0x7a69');
  await cli('prepare-release', ['--trade-id', release.tradeId, '--from', accounts[2]], { succeeds: false });
  await cli('prepare-refund', ['--trade-id', release.tradeId, '--from', accounts[2]], { succeeds: false });
  const buyerBefore = BigInt(await rpc('eth_getBalance', [accounts[1], 'latest']));
  await send(accounts[0], releasePlan.transaction); await mine();
  assert.equal((await stored(release.tradeId)).state, 'released');
  assert.equal(BigInt(await rpc('eth_getBalance', [accounts[1], 'latest'])) - buyerBefore, AMOUNT);
  await cli('prepare-release', ['--trade-id', release.tradeId, '--from', accounts[0]], { succeeds: false });
  pass('unverified journal hints do not override native parties; only bound-seller pre-expiry release is prepared and paid');

  const refund = await fund('refund');
  await rpc('evm_setNextBlockTimestamp', [Number(refund.terms.escrowExpirySeconds)]); await mine(1);
  await cli('prepare-release', ['--trade-id', refund.tradeId, '--from', accounts[0]], { succeeds: false });
  const refundPlan = await cli('prepare-refund', ['--trade-id', refund.tradeId, '--from', accounts[2]]);
  const sellerBefore = BigInt(await rpc('eth_getBalance', [accounts[0], 'latest']));
  await send(accounts[2], refundPlan.transaction); await mine();
  assert.equal((await stored(refund.tradeId)).state, 'refunded');
  assert.equal(BigInt(await rpc('eth_getBalance', [accounts[0], 'latest'])) - sellerBefore, AMOUNT);
  pass('latest chain deadline disables release and permits anyone to refund only the bound seller');

  const receiver = await deploy('test/mocks/Mocks.sol:RevertingReceiver');
  const deferred = await fund('deferred', receiver);
  const deferredPlan = await cli('prepare-release', ['--trade-id', deferred.tradeId, '--from', accounts[0]]);
  await send(accounts[0], deferredPlan.transaction); await mine();
  const credit = await cli('inspect', ['--trade-id', deferred.tradeId]);
  assert.equal(credit.pendingWithdrawal.recipient, receiver); assert.equal(credit.pendingWithdrawal.amount, String(AMOUNT));
  await send(accounts[0], buildSetAccept(receiver, true));
  const withdrawal = await cli('prepare-withdraw', ['--trade-id', deferred.tradeId, '--from', accounts[2]]);
  assert.equal(withdrawal.pendingWithdrawal.recipient, receiver);
  await cli('prepare-withdraw', ['--trade-id', deferred.tradeId, '--from', accounts[2], '--recipient', accounts[2]], { succeeds: false });
  await send(accounts[2], withdrawal.transaction); await mine();
  assert.equal(BigInt(await rpc('eth_getBalance', [receiver, 'latest'])), AMOUNT);
  assert.equal((await cli('inspect', ['--trade-id', deferred.tradeId])).pendingWithdrawal.amount, '0');
  assert.equal(BigInt(await rpc('eth_getBalance', [escrow, 'latest'])), 0n);
  pass('deferred principal is withdrawn only to its immutable native beneficiary by a separate fixture wallet');

  for (const fault of ['chain', 'genesis', 'runtime', 'anchor'])
    await cli('inspect', ['--trade-id', deferred.tradeId], { succeeds: false, fault });
  const beforeUnregistered = methods.length;
  await cli('inspect', ['--trade-id', deferred.tradeId], { succeeds: false, endpointId: 'unregistered' });
  assert.equal(methods.length, beforeUnregistered, 'unknown endpoint cannot start networking');
  pass('wrong chain, genesis, runtime, changing state anchor and unregistered endpoint refuse recovery output');

  for (const name of ['profile.json', 'registry.json', 'BasicEscrow.json']) {
    const path = resolve(temporary, 'consumer/recovery', name), original = await readFile(path), before = methods.length;
    await writeFile(path, Buffer.concat([original, Buffer.from(' ')]));
    const error = await cli('inspect', ['--trade-id', deferred.tradeId], { succeeds: false });
    assert.equal(error.code, 'ASSET_MISMATCH'); assert.equal(methods.length, before, 'tampered archive fails before RPC');
    await writeFile(path, original);
  }
  pass('edited archived profile, registry or ABI is rejected against the executable pins before networking');

  assert.ok(methods.length > 0 && methods.every(method => allowed.has(method)));
  console.log(JSON.stringify({ fixture: 'portable-canonical-evm-recovery', checks: checks.length, recoveryReads: methods.length,
    runtimeSendOrSignCalls: 0, separateFixtureWallet: true, copiedOutsideCheckout: true, expiredManifestStillExitsOriginalEscrow: true,
    fixedWithdrawalBeneficiary: true, externalNetwork: false, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  if (proxy) { proxy.closeAllConnections(); await new Promise(done => proxy.close(done)); }
  if (anvil?.pid && anvil.exitCode === null && anvil.signalCode === null) {
    const stopped = new Promise(done => anvil.once('exit', done)); anvil.kill('SIGTERM');
    const timer = setTimeout(() => anvil.kill('SIGKILL'), 1000); timer.unref(); await stopped; clearTimeout(timer);
  }
  await rm(temporary, { recursive: true, force: true });
}
