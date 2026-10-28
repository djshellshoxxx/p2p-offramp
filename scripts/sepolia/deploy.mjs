#!/usr/bin/env node
/**
 * Deploy the native-only BasicEscrow to Sepolia (G25 test network) and record it. Refuses to send anything unless
 * the node reports Sepolia's chain id AND genesis hash. The deployer key is read by the Forge script from
 * SEPOLIA_DEPLOYER_PRIVATE_KEY; the RPC URL comes from SEPOLIA_RPC_URL through foundry.toml `rpc_endpoints`.
 * Neither appears in a process argument list or in this script's output.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/deploy.mjs --public-endpoint https://<public rpc>/
 * Test-only: `--expect-genesis` lets the local kit test aim at an anvil started with chain id 11155111.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { chainIdentity, EVM_DIR, hexToBytes, keccakHex, rpcClient, SEPOLIA } from './lib.mjs';
import { recordDeployment } from './record-deployment.mjs';
import { clearForgeCache } from './send.mjs';

const run = promisify(execFile);
export class DeployError extends Error { constructor(code) { super(code); this.name = 'DeployError'; this.code = code; } }
const fail = code => { throw new DeployError(code); };

/** Deployer address derived in memory; the key bytes are wiped after use (best effort). */
function deployerAddress(keyHex) {
  if (!/^(0x)?[0-9a-f]{64}$/i.test(keyHex ?? '')) fail('DEPLOYER_KEY_MISSING');
  const key = hexToBytes(keyHex);
  try { return '0x' + keccakHex(secp256k1.getPublicKey(key, false).subarray(1)).slice(24); } finally { key.fill(0); }
}

export async function deploy({ env = process.env, publicEndpoint, expectGenesis = SEPOLIA.genesisHash, minBalanceWei = 10n ** 15n, outDir, registryPath }) {
  const rpc = rpcClient(env.SEPOLIA_RPC_URL);
  const identity = await chainIdentity(rpc);
  if (identity.chainId !== SEPOLIA.chainId) fail('WRONG_CHAIN');
  if (identity.genesisHash !== expectGenesis) fail('WRONG_GENESIS');
  const from = deployerAddress(env.SEPOLIA_DEPLOYER_PRIVATE_KEY);
  const balance = BigInt(await rpc('eth_getBalance', [from, 'latest']));
  if (balance < minBalanceWei) fail('DEPLOYER_UNFUNDED');
  try { await run('forge', ['build'], { cwd: EVM_DIR, env }); } catch { fail('BUILD_FAILED'); }
  try {
    await run('forge', ['script', 'script/DeployBasicEscrow.s.sol:DeployBasicEscrow', '--rpc-url', 'sepolia', '--broadcast', '--slow'],
      { cwd: EVM_DIR, env: { ...env, DEPLOY_EXPECTED_CHAIN_ID: SEPOLIA.chainId.toString() }, maxBuffer: 16 * 1024 * 1024 });
  } catch { fail('BROADCAST_FAILED'); } // forge output can echo RPC details; it is not relayed
  finally { await clearForgeCache('DeployBasicEscrow.s.sol'); } // Forge caches the RPC URL (maybe with an API key) here
  const broadcast = JSON.parse(await readFile(resolve(EVM_DIR, 'broadcast/DeployBasicEscrow.s.sol', SEPOLIA.chainId.toString(), 'run-latest.json'), 'utf8'));
  const created = broadcast.transactions?.filter(tx => tx.transactionType === 'CREATE' && tx.contractName === 'BasicEscrow') ?? [];
  if (created.length !== 1 || !/^0x[0-9a-f]{64}$/.test(created[0].hash)) fail('BROADCAST_UNREADABLE');
  if (created[0].transaction?.from?.toLowerCase() !== from) fail('UNEXPECTED_SENDER');
  // Wait for the receipt (bounded), then verify everything from chain state.
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await rpc('eth_getTransactionReceipt', [created[0].hash])) break;
    if (attempt === 59) fail('RECEIPT_TIMEOUT');
    await new Promise(done => setTimeout(done, 5000));
  }
  return recordDeployment({ rpcUrl: env.SEPOLIA_RPC_URL, crosscheckUrl: env.SEPOLIA_CROSSCHECK_RPC_URL, txHash: created[0].hash, publicEndpoint, expectGenesis,
    ...(outDir ? { outDir } : {}), ...(registryPath ? { registryPath } : {}) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { 'public-endpoint': { type: 'string' }, 'expect-genesis': { type: 'string' } } });
  try {
    const result = await deploy({ publicEndpoint: values['public-endpoint'], ...(values['expect-genesis'] ? { expectGenesis: values['expect-genesis'] } : {}) });
    console.log(JSON.stringify({ ok: true, address: result.record.contractAddress, tx: result.record.initializationTx, record: result.recordPath, registry: result.registryPath }));
  } catch (error) { console.error(JSON.stringify({ ok: false, code: error?.code ?? 'FAILED' })); process.exitCode = 1; }
}
