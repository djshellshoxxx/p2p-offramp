#!/usr/bin/env node
/**
 * Verify a BasicEscrow deployment from chain state and write its G25 DeploymentRecord plus the G11 testnet registry
 * draft. Everything recorded is read from the node (chain id, genesis, receipt, runtime code, allowlist), never taken
 * from configuration alone, and is compared with a fresh build of the committed sources by the pinned toolchain: the
 * contract sources must be clean (DIRTY_SOURCE otherwise) and forge/solc must be the pinned ones (TOOLCHAIN_MISMATCH),
 * so the recorded sourceCommit is exactly what was compared.
 *
 * Usage (RPC URL from the environment, never argv):
 *   SEPOLIA_RPC_URL=... node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/record-deployment.mjs \
 *     --tx 0x<deploy tx hash> --public-endpoint https://<public rpc>/ [--deployer 0x<address>] [--out-dir dir]
 * Optional SEPOLIA_CROSSCHECK_RPC_URL repeats the identity and code checks against an independent endpoint. The public
 * endpoint must be a keyless https URL carrying no credential of either RPC URL. Run it again once the deployment block
 * is finalized: the refreshed record says finalizedAtRecording: true, which owner signing requires (G25 §4.2).
 * `expectGenesis` is programmatic, for the local proofs only.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { parseRegistryBytes } from '../../packages/schemas/index.ts';
import { chainIdentity, checkCleanSource, checkToolchain, escrowArtifact, EVM_DIR, forgeEnv, hexToBytes, isMain, keccakHex, leaksPrivateRpc, ROOT, rpcClient, SEPOLIA } from './lib.mjs';

const run = promisify(execFile);
const ALLOWLIST_SELECTOR = '0x' + keccakHex(new TextEncoder().encode('allowlistedTokens()')).slice(0, 8);
/** Written by deploy once a CREATE was broadcast and removed once it is recorded; deploy refuses to run while it exists. */
export const PENDING_FILE = 'pending-deploy.json';

export class RecordError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'RecordError'; this.code = code; Object.assign(this, details); }
}
const fail = (code, details) => { throw new RecordError(code, details); };

/** The G11 registry's endpoint rules (https, no userinfo, query or fragment), applied before anything is sent. */
export function checkPublicEndpoint(publicEndpoint) {
  if (typeof publicEndpoint !== 'string') fail('PUBLIC_ENDPOINT_INVALID');
  const probe = { version: 1, releaseId: 'endpoint-check', networks: [{ id: 'sepolia', chain: 'evm', chainIdentity: SEPOLIA.chainId.toString(), genesisHash: SEPOLIA.genesisHash,
    endpoints: [{ id: 'sepolia-public', url: publicEndpoint }], finality: { kind: 'evm-finalized-tag' },
    assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
    deployments: [{ id: 'escrow-sepolia-v1', address: `0x${'11'.repeat(20)}`, protocolVersion: 1, artifactSha256: '0'.repeat(64),
      runtime: { kind: 'evm-code', keccak256: '0'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] }], environment: 'testnet' }] };
  try { parseRegistryBytes(new TextEncoder().encode(JSON.stringify(probe))); } catch { fail('PUBLIC_ENDPOINT_INVALID'); }
}

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

/** Clear only this verified native deployment's guard. Unknown attempts need finalized account/nonce
 * and canonical inclusion proof, not a missing file, imported terminal label or a new deployment request.
 */
export async function clearRecordedAttempt({ pendingPath, txHash, record, rpc }) {
  const pending = await readFile(pendingPath, 'utf8').then(JSON.parse, () => null);
  if (pending?.tx === txHash) { await rm(pendingPath, { force: true }); return true; }
  if (pending?.format !== 'p2p-offramp/deployment-attempt/v1' || pending.state !== 'broadcast-unknown' ||
      pending.tx !== null || pending.chainId !== record.chainId || pending.from !== record.deployer || !record.finalizedAtRecording) return false;
  let transaction, canonical;
  try {
    transaction = await rpc('eth_getTransactionByHash', [txHash]);
    if (!transaction || transaction.hash !== txHash || transaction.from?.toLowerCase() !== pending.from || transaction.to !== null ||
        BigInt(transaction.nonce) !== BigInt(pending.nonce) || BigInt(transaction.blockNumber) !== BigInt(record.deployBlock) ||
        transaction.blockHash !== record.deployBlockHash) return false;
    canonical = await rpc('eth_getBlockByNumber', [transaction.blockNumber, false]);
    if (!canonical || canonical.hash !== record.deployBlockHash || BigInt(canonical.number) !== BigInt(record.deployBlock)) return false;
  } catch { return false; }
  await rm(pendingPath, { force: true }); return true;
}

export async function recordDeployment({ rpcUrl, crosscheckUrl, txHash, publicEndpoint, expectedDeployer, expectGenesis = SEPOLIA.genesisHash,
  outDir = resolve(ROOT, 'docs/deployments/sepolia'), registryPath = resolve(ROOT, 'registry/testnet/sepolia.registry.json'), root = ROOT, env = process.env }) {
  checkPublicEndpoint(publicEndpoint);
  if (leaksPrivateRpc(publicEndpoint, [rpcUrl, crosscheckUrl])) fail('PUBLIC_ENDPOINT_IS_PRIVATE_RPC');
  if (!/^0x[0-9a-f]{64}$/.test(txHash ?? '')) fail('TX_HASH_INVALID');
  if (expectedDeployer !== undefined && !/^0x[0-9a-f]{40}$/.test(expectedDeployer)) fail('DEPLOYER_INVALID');
  // Provenance: the chain is compared with the committed sources built by the pinned toolchain, nothing else.
  const sourceCommit = await checkCleanSource(root);
  const toolchain = await checkToolchain(env);
  try { await run('forge', ['build'], { cwd: EVM_DIR, env: forgeEnv(env) }); } catch { fail('BUILD_FAILED'); }
  const artifact = await escrowArtifact();
  const rpc = rpcClient(rpcUrl);
  const primary = await inspect(rpc, txHash, expectGenesis);
  if (primary.runtimeKeccak !== artifact.runtimeKeccak) fail('RUNTIME_CODE_MISMATCH');
  if (expectedDeployer !== undefined && primary.receipt.from?.toLowerCase() !== expectedDeployer) fail('UNEXPECTED_DEPLOYER');
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
    artifactSha256: artifact.creationSha256, artifactDefinition: 'sha256 of the creation bytecode built from sourceCommit with contracts/evm/foundry.toml by the toolchain below',
    toolchain, assetAllowlist: [], supportedAssetIds: ['native'],
    initializationTx: txHash, deployBlock: deployBlock.toString(), deployBlockHash: primary.receipt.blockHash,
    deployer: primary.receipt.from.toLowerCase(), deployerVerified: expectedDeployer !== undefined,
    finalizedAtRecording: primary.finalizedBlock !== null && primary.finalizedBlock >= deployBlock,
    crosschecked: Boolean(crosscheckUrl), sourceCommit, sourceTreeClean: true,
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
  // The broadcast this record covers is no longer pending.
  await clearRecordedAttempt({ pendingPath: resolve(outDir, PENDING_FILE), txHash, record, rpc });
  return { record, recordPath, registryPath };
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { tx: { type: 'string' }, 'public-endpoint': { type: 'string' }, deployer: { type: 'string' }, 'out-dir': { type: 'string' }, registry: { type: 'string' } } });
  try {
    const result = await recordDeployment({ rpcUrl: process.env.SEPOLIA_RPC_URL, crosscheckUrl: process.env.SEPOLIA_CROSSCHECK_RPC_URL, txHash: values.tx,
      publicEndpoint: values['public-endpoint'], ...(values.deployer ? { expectedDeployer: values.deployer.toLowerCase() } : {}),
      ...(values['out-dir'] ? { outDir: resolve(values['out-dir']) } : {}), ...(values.registry ? { registryPath: resolve(values.registry) } : {}) });
    console.log(JSON.stringify({ ok: true, address: result.record.contractAddress, codeDigest: result.record.codeDigest.runtime, finalized: result.record.finalizedAtRecording, record: result.recordPath, registry: result.registryPath }));
  } catch (error) { console.error(JSON.stringify({ ok: false, code: error?.code ?? 'FAILED' })); process.exitCode = 1; }
}
