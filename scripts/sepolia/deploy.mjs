#!/usr/bin/env node
/**
 * Deploy the native-only BasicEscrow to Sepolia (G25 test network) and record it. Refuses to send anything unless
 * the node reports Sepolia's chain id AND genesis hash, the public endpoint is a valid keyless https URL, the contract
 * sources are clean and the toolchain is the pinned one. The deployer key is read by the Forge script from
 * SEPOLIA_DEPLOYER_PRIVATE_KEY; the RPC URL comes from SEPOLIA_RPC_URL through foundry.toml `rpc_endpoints`. Neither
 * appears in a process argument list or in this script's output.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/deploy.mjs --public-endpoint https://<public rpc>/
 *
 * Once a CREATE has been broadcast, every failure prints its transaction hash and contract address, and a pending
 * marker (docs/deployments/sepolia/pending-deploy.json) blocks another deployment until that one is recorded with
 * record-deployment.mjs --tx. The genesis override (`expectGenesis`) is a programmatic parameter for the local proofs
 * only; the CLI has no such option.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { chainIdentity, checkCleanSource, checkToolchain, EVM_DIR, forgeEnv, forgeKey, hexToBytes, isMain, keccakHex, leaksPrivateRpc, ROOT, rpcClient, SEPOLIA } from './lib.mjs';
import { checkPublicEndpoint, PENDING_FILE, recordDeployment } from './record-deployment.mjs';
import { clearForgeCache, recordedTransactions } from './send.mjs';

const run = promisify(execFile);
export class DeployError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'DeployError'; this.code = code; Object.assign(this, details); }
}
const fail = (code, details) => { throw new DeployError(code, details); };

/** Deployer address derived in memory; the key bytes are wiped after use (best effort). */
function deployerAddress(keyHex) {
  if (!/^(0x)?[0-9a-f]{64}$/i.test(keyHex ?? '')) fail('DEPLOYER_KEY_MISSING');
  const key = hexToBytes(keyHex);
  try { return '0x' + keccakHex(secp256k1.getPublicKey(key, false).subarray(1)).slice(24); } finally { key.fill(0); }
}

export async function deploy({ env = process.env, publicEndpoint, expectGenesis = SEPOLIA.genesisHash, minBalanceWei = 10n ** 15n,
  outDir = resolve(ROOT, 'docs/deployments/sepolia'), registryPath, broadcastDir, root = ROOT }) {
  checkPublicEndpoint(publicEndpoint);
  if (leaksPrivateRpc(publicEndpoint, [env.SEPOLIA_RPC_URL, env.SEPOLIA_CROSSCHECK_RPC_URL])) fail('PUBLIC_ENDPOINT_IS_PRIVATE_RPC');
  const pendingPath = resolve(outDir, PENDING_FILE);
  const pending = await readFile(pendingPath, 'utf8').then(JSON.parse, () => null);
  if (pending) fail('UNRECORDED_DEPLOYMENT_PENDING', { tx: pending.tx, address: pending.address });
  const rpc = rpcClient(env.SEPOLIA_RPC_URL);
  const identity = await chainIdentity(rpc);
  if (identity.chainId !== SEPOLIA.chainId) fail('WRONG_CHAIN');
  if (identity.genesisHash !== expectGenesis) fail('WRONG_GENESIS');
  const from = deployerAddress(env.SEPOLIA_DEPLOYER_PRIVATE_KEY);
  const balance = BigInt(await rpc('eth_getBalance', [from, 'latest']));
  if (balance < minBalanceWei) fail('DEPLOYER_UNFUNDED');
  await checkCleanSource(root);
  await checkToolchain(env);
  try { await run('forge', ['build'], { cwd: EVM_DIR, env: forgeEnv(env) }); } catch { fail('BUILD_FAILED'); }
  const dir = broadcastDir ?? await mkdtemp(resolve(tmpdir(), 'p2p-sepolia-deploy-'));
  let created;
  try {
    let forgeFailed = false;
    try {
      await run('forge', ['script', 'script/DeployBasicEscrow.s.sol:DeployBasicEscrow', '--rpc-url', 'sepolia', '--broadcast', '--slow'],
        { cwd: EVM_DIR, env: forgeEnv(env, { SEPOLIA_DEPLOYER_PRIVATE_KEY: forgeKey(env.SEPOLIA_DEPLOYER_PRIVATE_KEY),
          FOUNDRY_OFFLINE: 'true', FOUNDRY_BROADCAST: dir }), maxBuffer: 16 * 1024 * 1024 });
    } catch { forgeFailed = true; } // Forge output can echo RPC details; it is not relayed. A CREATE may still have gone out.
    finally { await clearForgeCache('DeployBasicEscrow.s.sol'); } // Forge caches the RPC URL (maybe with an API key) here
    const sent = (await recordedTransactions(dir, 'DeployBasicEscrow.s.sol')).filter(tx => tx.transactionType === 'CREATE' && tx.contractName === 'BasicEscrow');
    if (sent.length === 0) fail(forgeFailed ? 'BROADCAST_FAILED' : 'BROADCAST_UNREADABLE');
    if (sent.length !== 1 || !/^0x[0-9a-f]{64}$/.test(sent[0].hash ?? '')) fail('BROADCAST_UNREADABLE');
    created = sent[0];
  } finally { if (!broadcastDir) await rm(dir, { recursive: true, force: true }); }
  const tx = created.hash, address = typeof created.contractAddress === 'string' ? created.contractAddress.toLowerCase() : null;
  // From here a contract may exist on chain: every failure names it, and the marker blocks a second deployment.
  await mkdir(outDir, { recursive: true });
  await writeFile(pendingPath, JSON.stringify({ tx, address, at: new Date().toISOString() }, null, 2) + '\n');
  try {
    if (created.transaction?.from?.toLowerCase() !== from) fail('UNEXPECTED_SENDER');
    for (let attempt = 0; ; attempt++) {
      if (await rpc('eth_getTransactionReceipt', [tx])) break;
      if (attempt === 59) fail('RECEIPT_TIMEOUT');
      await new Promise(done => setTimeout(done, 5000));
    }
    return await recordDeployment({ rpcUrl: env.SEPOLIA_RPC_URL, crosscheckUrl: env.SEPOLIA_CROSSCHECK_RPC_URL, txHash: tx, publicEndpoint, expectedDeployer: from,
      expectGenesis, outDir, ...(registryPath ? { registryPath } : {}), root, env });
  } catch (error) {
    if (error?.code === 'DEPLOY_REVERTED') await rm(pendingPath, { force: true }); // a reverted CREATE left no contract
    try { Object.assign(error, { tx, address }); } catch { /* the code still reaches the caller */ }
    throw error;
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { 'public-endpoint': { type: 'string' } } });
  try {
    const result = await deploy({ publicEndpoint: values['public-endpoint'] });
    console.log(JSON.stringify({ ok: true, address: result.record.contractAddress, tx: result.record.initializationTx, record: result.recordPath, registry: result.registryPath }));
  } catch (error) {
    // The transaction hash and contract address are public chain data; printing them prevents an accidental second deployment.
    console.error(JSON.stringify({ ok: false, code: error?.code ?? 'FAILED', ...(error?.tx ? { tx: error.tx, address: error.address,
      next: 'record it: scripts/sepolia/record-deployment.mjs --tx <tx> --public-endpoint <url> --deployer <address>' } : {}) }));
    process.exitCode = 1;
  }
}
