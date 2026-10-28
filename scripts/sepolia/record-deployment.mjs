#!/usr/bin/env node
/**
 * Verify a BasicEscrow deployment from chain state and write its G25 DeploymentRecord plus the G11 testnet registry
 * draft. Everything recorded is read from the node (chain id, genesis, receipt, runtime code, allowlist), never taken
 * from configuration alone, and is compared with the pinned-toolchain artifact.
 *
 * Usage (RPC URL from the environment, never argv):
 *   SEPOLIA_RPC_URL=... node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/record-deployment.mjs \
 *     --tx 0x<deploy tx hash> --public-endpoint https://<public rpc>/ [--expect-genesis 0x..] [--out-dir dir]
 * Optional SEPOLIA_CROSSCHECK_RPC_URL repeats the identity and code checks against an independent endpoint.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseRegistryBytes } from '../../packages/schemas/index.ts';
import { chainIdentity, escrowArtifact, hexToBytes, keccakHex, ROOT, rpcClient, SEPOLIA } from './lib.mjs';

const ALLOWLIST_SELECTOR = '0x' + keccakHex(new TextEncoder().encode('allowlistedTokens()')).slice(0, 8);

export class RecordError extends Error { constructor(code) { super(code); this.name = 'RecordError'; this.code = code; } }
const fail = code => { throw new RecordError(code); };

async function inspect(rpc, txHash, expectedGenesis) {
  const identity = await chainIdentity(rpc);
  if (identity.chainId !== SEPOLIA.chainId) fail('WRONG_CHAIN');
  if (identity.genesisHash !== expectedGenesis) fail('WRONG_GENESIS');
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) fail('RECEIPT_MISSING');
  if (receipt.status !== '0x1') fail('DEPLOY_REVERTED');
  const address = typeof receipt.contractAddress === 'string' ? receipt.contractAddress.toLowerCase() : fail('NOT_A_DEPLOYMENT');
  const code = hexToBytes(await rpc('eth_getCode', [address, 'latest']));
  if (code.length === 0) fail('NO_CODE');
  const allowlist = await rpc('eth_call', [{ to: address, data: ALLOWLIST_SELECTOR }, 'latest']);
  const finalized = await rpc('eth_getBlockByNumber', ['finalized', false]).catch(() => null);
  return { identity, receipt, address, runtimeKeccak: keccakHex(code), allowlist, finalizedBlock: finalized?.number ? BigInt(finalized.number) : null };
}

export async function recordDeployment({ rpcUrl, crosscheckUrl, txHash, publicEndpoint, expectGenesis = SEPOLIA.genesisHash, outDir = resolve(ROOT, 'docs/deployments/sepolia'), registryPath = resolve(ROOT, 'registry/testnet/sepolia.registry.json') }) {
  if (!/^0x[0-9a-f]{64}$/.test(txHash ?? '')) fail('TX_HASH_INVALID');
  const artifact = await escrowArtifact();
  const primary = await inspect(rpcClient(rpcUrl), txHash, expectGenesis);
  if (primary.runtimeKeccak !== artifact.runtimeKeccak) fail('RUNTIME_CODE_MISMATCH');
  // An ABI-encoded empty address[]: offset 0x20, length 0. Native-only deployments must have no ERC-20 allowlist.
  if (primary.allowlist !== '0x' + '20'.padStart(64, '0') + '0'.repeat(64)) fail('ALLOWLIST_NOT_EMPTY');
  if (crosscheckUrl) {
    const second = await inspect(rpcClient(crosscheckUrl), txHash, expectGenesis);
    if (second.address !== primary.address || second.runtimeKeccak !== primary.runtimeKeccak || second.receipt.blockHash !== primary.receipt.blockHash) fail('CROSSCHECK_MISMATCH');
  }
  const deployBlock = BigInt(primary.receipt.blockNumber);
  const record = {
    format: 'p2p-offramp/deployment-record/v1', network: 'sepolia', environment: 'testnet',
    chainId: primary.identity.chainId.toString(), genesisIdentity: primary.identity.genesisHash,
    contract: 'BasicEscrow', contractAddress: primary.address, authorityModel: 'immutable',
    codeDigest: { algorithm: 'keccak256', runtime: primary.runtimeKeccak },
    artifactSha256: artifact.creationSha256, artifactDefinition: 'sha256 of the creation bytecode from forge v1.5.1 (b0a9dd9c), solc 0.8.30, contracts/evm/foundry.toml',
    assetAllowlist: [], supportedAssetIds: ['native'],
    initializationTx: txHash, deployBlock: deployBlock.toString(), deployBlockHash: primary.receipt.blockHash, deployer: primary.receipt.from.toLowerCase(),
    finalizedAtRecording: primary.finalizedBlock !== null && primary.finalizedBlock >= deployBlock,
    crosschecked: Boolean(crosscheckUrl),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    releaseEnabled: 0, reviewEvidence: null,
  };
  const registry = {
    version: 1, releaseId: `sepolia-testnet-${primary.address.slice(2, 10)}`,
    networks: [{
      id: 'sepolia', chain: 'evm', chainIdentity: record.chainId, genesisHash: record.genesisIdentity,
      endpoints: [{ id: 'sepolia-public', url: publicEndpoint }], finality: { kind: 'evm-finalized-tag' },
      assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
      deployments: [{ id: 'escrow-sepolia-v1', address: record.contractAddress, protocolVersion: 1, artifactSha256: record.artifactSha256,
        runtime: { kind: 'evm-code', keccak256: record.codeDigest.runtime, upgradeable: false }, supportedAssetIds: ['native'] }],
      environment: 'testnet',
    }],
  };
  const registryBytes = new TextEncoder().encode(JSON.stringify(registry, null, 2) + '\n');
  parseRegistryBytes(registryBytes); // the app's own G11 parser must accept it (https endpoint, lowercase address, etc.)
  await mkdir(outDir, { recursive: true }); await mkdir(resolve(registryPath, '..'), { recursive: true });
  const recordPath = resolve(outDir, `BasicEscrow-${record.contractAddress}.json`);
  await writeFile(recordPath, JSON.stringify(record, null, 2) + '\n');
  await writeFile(registryPath, registryBytes);
  return { record, recordPath, registryPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { tx: { type: 'string' }, 'public-endpoint': { type: 'string' }, 'expect-genesis': { type: 'string' }, 'out-dir': { type: 'string' }, registry: { type: 'string' } } });
  try {
    const result = await recordDeployment({ rpcUrl: process.env.SEPOLIA_RPC_URL, crosscheckUrl: process.env.SEPOLIA_CROSSCHECK_RPC_URL, txHash: values.tx,
      publicEndpoint: values['public-endpoint'], ...(values['expect-genesis'] ? { expectGenesis: values['expect-genesis'] } : {}),
      ...(values['out-dir'] ? { outDir: resolve(values['out-dir']) } : {}), ...(values.registry ? { registryPath: resolve(values.registry) } : {}) });
    console.log(JSON.stringify({ ok: true, address: result.record.contractAddress, codeDigest: result.record.codeDigest.runtime, finalized: result.record.finalizedAtRecording, record: result.recordPath, registry: result.registryPath }));
  } catch (error) { console.error(JSON.stringify({ ok: false, code: error?.code ?? 'FAILED' })); process.exitCode = 1; }
}
