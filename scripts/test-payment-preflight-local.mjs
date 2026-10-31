#!/usr/bin/env node
/** G18 native canonical BasicEscrow evidence. Private loopback Anvil, worthless
 * published development accounts, no app networking or production trust claim.
 * All adapter calls are inspected to prove that guidance never sends/signs. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { RegistryService } from '../packages/domain/index.ts';
import { buildFundNative, buildRefund, buildRelease } from '../packages/wallet/src/evm-escrow.ts';
import { evmTermsHash, keccak256 } from '../packages/wallet/src/evm-terms.ts';
import { createEvmPaymentPreflight } from '../packages/wallet/src/evm-payment-preflight.ts';
import { checkToolchain, forgeEnv, rpcClient } from './sepolia/lib.mjs';

const run = promisify(execFile);
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const ENV = { ...process.env, PATH: `${FOUNDRY}:${process.env.PATH ?? ''}`, FOUNDRY_OFFLINE: 'true' };
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const EVM_DIR = fileURLToPath(new URL('../contracts/evm/', import.meta.url));
// Documented public Anvil development key: never an operator credential.
const KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ZERO = `0x${'0'.repeat(40)}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const quantity = value => `0x${BigInt(value).toString(16)}`;
const good = (result, label = 'operation') => { assert.equal(result.ok, true, `${label}: ${JSON.stringify(result)}`); return result.value; };
const bad = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); };
const checks = [], readers = [], methods = [];
const pass = name => { checks.push(name); console.log(`ok - ${name}`); };
let anvil, rpc, registry, escrow, accounts, monotonic = 10;

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(error => error ? reject(error) : resolve(port)); });
});
const mine = (count = 1) => rpc('anvil_mine', [quantity(count)]);
const block = tag => rpc('eth_getBlockByNumber', [tag, false]);
const time = async () => BigInt((await block('latest')).timestamp);
const request = ({ method, params }) => { methods.push(method); return rpc(method, params ?? []); };
async function send(from, call) {
  const hash = await rpc('eth_sendTransaction', [{ from, to: call.to, data: call.data, value: quantity(call.value) }]);
  const receipt = await rpc('eth_getTransactionReceipt', [hash]);
  assert.equal(receipt?.status, '0x1'); return receipt;
}
async function loadRegistry(raw) {
  const service = new RegistryService(), bytes = new TextEncoder().encode(JSON.stringify(raw));
  good(await service.load(bytes, sha(bytes)), 'local fixture registry'); return service;
}
function makeTerms(label, expiry, now) {
  return { orderId: sha(`preflight-${label}`), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-local-v1',
    seller: accounts[0], buyer: accounts[1], assetKind: 'native', asset: ZERO, amountBaseUnits: '1000000000000000',
    privateAgreementHash: sha('synthetic manual local agreement'), capabilitiesHash: sha('synthetic core-only'),
    sellerNonce: sha(`preflight-nonce-${label}`), acceptBeforeSeconds: String(now + 600n), escrowExpirySeconds: String(expiry) };
}
function readerFor(terms, selectedRegistry = registry) {
  const binding = { chain: 'evm', networkId: terms.networkId, deploymentId: terms.deploymentId,
    tradeId: evmTermsHash({ chainId: '31337', verifyingContract: escrow }, terms) };
  const reader = good(createEvmPaymentPreflight({ registry: selectedRegistry, terms, binding, request, monotonicNow: () => monotonic }));
  readers.push(reader); return { reader, tradeId: binding.tradeId };
}
async function finalizedTime(target) {
  await rpc('evm_setNextBlockTimestamp', [Number(target)]); await mine();
  for (let attempt = 0; attempt < 8; attempt++) {
    const observed = BigInt((await block('finalized')).timestamp);
    if (observed >= target) { assert.equal(observed, target, 'exact native finalized timestamp'); return; }
    await mine();
  }
  assert.fail('finality did not reach the target within bounded mining');
}

try {
  await checkToolchain(ENV);
  const anvilVersion = await run(ANVIL, ['--version'], { env: ENV, timeout: 5000 });
  assert.match(anvilVersion.stdout, /anvil Version: 1\.5\.1(?:-|\s)/);
  assert.match(anvilVersion.stdout, /b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2/);
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  rpc = rpcClient(url, { timeoutMs: 5000 });
  anvil = spawn(ANVIL, ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', '31337', '--slots-in-an-epoch', '1'], { env: forgeEnv(ENV), stdio: 'ignore' });
  let spawnError; anvil.once('error', error => { spawnError = error; });
  for (let attempt = 0; ; attempt++) {
    try { await rpc('eth_chainId'); break; }
    catch { if (spawnError || anvil.exitCode !== null || attempt >= 100) throw Error('Local Anvil startup failed'); await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.equal(BigInt(await rpc('eth_chainId')), 31337n);
  accounts = (await rpc('eth_accounts')).map(account => account.toLowerCase());
  const deployed = await run('forge', ['create', 'src/BasicEscrow.sol:BasicEscrow', '--rpc-url', url, '--private-key', `0x${KEY}`, '--broadcast', '--json', '--constructor-args', '[]'],
    { cwd: EVM_DIR, env: forgeEnv(ENV), timeout: 30_000, maxBuffer: 1 << 20 });
  escrow = JSON.parse(deployed.stdout.slice(deployed.stdout.indexOf('{'))).deployedTo.toLowerCase();
  const raw = JSON.parse(await readFile(new URL('../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url)));
  const network = raw.networks[0]; network.genesisHash = (await block('0x0')).hash;
  network.endpoints = [{ id: 'local-node', url: url + '/' }]; network.assets = network.assets.filter(asset => asset.kind === 'native');
  network.deployments = [{ ...network.deployments[0], address: escrow,
    runtime: { kind: 'evm-code', keccak256: hex(keccak256(Buffer.from((await rpc('eth_getCode', [escrow, 'latest'])).slice(2), 'hex'))), upgradeable: false }, supportedAssetIds: ['native'] }];
  registry = await loadRegistry(raw);
  const beforeFunding = await rpc('evm_snapshot');
  const now = await time(), terms = makeTerms('release', now + 7200n, now), domain = { chainId: '31337', verifyingContract: escrow };
  await send(accounts[0], buildFundNative(domain, terms)); await mine(5);
  const { reader, tradeId } = readerFor(terms);
  assert.equal(good(await reader.read()).decision, 'allow-guidance');
  pass('native finalized funding matches canonical terms, registry runtime, chain and genesis');

  await finalizedTime(BigInt(terms.escrowExpirySeconds) - 901n);
  const far = good(await reader.read()); assert.equal(far.remainingSeconds, '901'); assert.equal(far.decision, 'allow-guidance');
  await finalizedTime(BigInt(terms.escrowExpirySeconds) - 900n);
  const near = good(await reader.read()); assert.equal(near.remainingSeconds, '900'); assert.equal(near.reason, 'near-expiry');
  pass('actual finalized native time permits 901 seconds and refuses 900 seconds');

  monotonic += 30_000; assert.equal(good(reader.view()).reason, 'stale'); reader.invalidate(); bad(reader.view(), 'UNAVAILABLE');
  monotonic += 1; assert.equal(good(await reader.read()).decision, 'block');
  await send(accounts[0], buildRelease(escrow, tradeId)); await mine(5);
  assert.equal(good(await reader.read()).reason, 'unfunded');
  pass('monotonic expiry/resume hide guidance, and native release remains independently available');

  const badCode = structuredClone(raw); badCode.networks[0].deployments[0].runtime.keccak256 = 'ab'.repeat(32);
  bad(await readerFor(terms, await loadRegistry(badCode)).reader.read(), 'INTEGRITY_FAILURE');
  const badGenesis = structuredClone(raw); badGenesis.networks[0].genesisHash = `0x${'ab'.repeat(32)}`;
  bad(await readerFor(terms, await loadRegistry(badGenesis)).reader.read(), 'WRONG_CHAIN');
  pass('native runtime/genesis identity mismatches block guidance');

  assert.equal(await rpc('evm_revert', [beforeFunding]), true); await mine(5); reader.invalidate();
  assert.equal(good(await reader.read()).reason, 'unfunded');
  pass('deep native snapshot rollback followed by explicit re-read cannot retain funded guidance');

  const refundNow = await time(), refundTerms = makeTerms('refund', refundNow + 3600n, refundNow);
  await send(accounts[0], buildFundNative(domain, refundTerms)); await mine(5);
  const refund = readerFor(refundTerms); assert.equal(good(await refund.reader.read()).decision, 'allow-guidance');
  await finalizedTime(BigInt(refundTerms.escrowExpirySeconds));
  assert.equal(good(await refund.reader.read()).reason, 'near-expiry');
  await send(accounts[2], buildRefund(escrow, refund.tradeId)); await mine(5);
  assert.equal(good(await refund.reader.read()).reason, 'unfunded');
  assert.equal(BigInt(await rpc('eth_getBalance', [escrow, 'latest'])), 0n);
  pass('native timeout refund remains available with guidance blocked and leaves no escrow principal');

  assert.ok(methods.every(method => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(method)));
  console.log(JSON.stringify({ fixture: 'canonical-native-payment-preflight', checks: checks.length, adapterReads: methods.length,
    adapterSendOrSignCalls: 0, finalizedPolicy: true, nativeBoundary901And900: true, externalNetwork: false, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  readers.forEach(reader => reader.dispose());
  if (anvil?.pid && anvil.exitCode === null && anvil.signalCode === null) {
    const stopped = new Promise(resolve => anvil.once('exit', resolve));
    anvil.kill('SIGTERM'); const timer = setTimeout(() => anvil.kill('SIGKILL'), 1000); timer.unref();
    await stopped; clearTimeout(timer);
  }
}
