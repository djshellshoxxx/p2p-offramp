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

const HASH = /^0x[0-9a-f]{64}$/, ADDRESS = /^0x[0-9a-f]{40}$/;
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(value) ? BigInt(value) : fail('DEPLOYMENT_PROOF_INVALID');
function header(raw) {
  if (!raw || !HASH.test(raw.hash ?? '')) fail('DEPLOYMENT_PROOF_INVALID');
  return { number: quantity(raw.number), hash: raw.hash };
}
function createAddress(sender, nonce) {
  // RLP([20-byte sender, nonce]); nonce is bounded by the native EVM account width.
  if (nonce >= 1n << 64n) fail('DEPLOYMENT_PROOF_INVALID');
  let encoded = nonce === 0n ? '80' : nonce.toString(16).padStart(Math.ceil(nonce.toString(16).length / 2) * 2, '0');
  if (nonce >= 128n) encoded = (128 + encoded.length / 2).toString(16) + encoded;
  const payload = '94' + sender.slice(2) + encoded;
  return '0x' + keccakHex(hexToBytes('0x' + (192 + payload.length / 2).toString(16) + payload)).slice(-40);
}
/** Native inclusion proof. Early canonical records are permitted; finality is never inferred without inclusion. */
export async function inspectDeployment(rpc, txHash, expectedGenesis, expectedCreation) {
  if (!HASH.test(txHash ?? '')) fail('TX_HASH_INVALID');
  const identity = await chainIdentity(rpc);
  if (identity.chainId !== SEPOLIA.chainId) fail('WRONG_CHAIN');
  if (identity.genesisHash !== expectedGenesis) fail('WRONG_GENESIS');
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) fail('RECEIPT_MISSING');
  if (receipt.status !== '0x1' && receipt.status !== '0x0') fail('DEPLOYMENT_PROOF_INVALID');
  const reverted = receipt.status === '0x0';
  const address = reverted ? null : typeof receipt.contractAddress === 'string' ? receipt.contractAddress.toLowerCase() : fail('NOT_A_DEPLOYMENT');
  if (!reverted && (!ADDRESS.test(address) || address === '0x' + '0'.repeat(40))) fail('NOT_A_DEPLOYMENT');
  const from = typeof receipt.from === 'string' ? receipt.from.toLowerCase() : '';
  if (receipt.transactionHash !== txHash || !ADDRESS.test(from) || !HASH.test(receipt.blockHash ?? '') || receipt.to !== null) fail('DEPLOYMENT_PROOF_INVALID');
  const height = quantity(receipt.blockNumber), tag = '0x' + height.toString(16);
  const transaction = await rpc('eth_getTransactionByHash', [txHash]);
  if (!transaction || transaction.hash !== txHash || transaction.from?.toLowerCase() !== from || transaction.to !== null ||
      transaction.blockHash !== receipt.blockHash || quantity(transaction.blockNumber) !== height || !reverted && createAddress(from, quantity(transaction.nonce)) !== address) fail('DEPLOYMENT_PROOF_INVALID');
  if (expectedCreation !== undefined && transaction.input?.toLowerCase() !== expectedCreation) fail('DEPLOYMENT_CREATION_MISMATCH');
  const anchor = header(await rpc('eth_getBlockByNumber', [tag, false]));
  if (anchor.number !== height || anchor.hash !== receipt.blockHash) fail('DEPLOYMENT_PROOF_INVALID');
  const createdAddress = createAddress(from, quantity(transaction.nonce));
  // Clients differ: Anvil may return null, while geth derives the CREATE address even on failure.
  // Accept either only after authenticating the transaction and canonical inclusion above.
  if (reverted && receipt.contractAddress !== null && (typeof receipt.contractAddress !== 'string' || receipt.contractAddress.toLowerCase() !== createdAddress)) fail('DEPLOYMENT_PROOF_INVALID');
  const code = hexToBytes(await rpc('eth_getCode', [createdAddress, tag]));
  if (reverted ? code.length !== 0 : code.length === 0) fail(reverted ? 'DEPLOYMENT_PROOF_INVALID' : 'NO_CODE');
  const allowlist = reverted ? null : await rpc('eth_call', [{ to: address, data: ALLOWLIST_SELECTOR }, tag]);
  const finalizedRaw = await rpc('eth_getBlockByNumber', ['finalized', false]).catch(() => null);
  const finalized = finalizedRaw === null ? null : header(finalizedRaw);
  const check = header(await rpc('eth_getBlockByNumber', [tag, false]));
  if (check.number !== anchor.number || check.hash !== anchor.hash) fail('DEPLOYMENT_PROOF_INVALID');
  if (finalized) {
    const finalCheck = header(await rpc('eth_getBlockByNumber', ['0x' + finalized.number.toString(16), false]));
    if (finalCheck.number !== finalized.number || finalCheck.hash !== finalized.hash) fail('DEPLOYMENT_PROOF_INVALID');
  }
  const identityAfter = await chainIdentity(rpc);
  if (identityAfter.chainId !== identity.chainId || identityAfter.genesisHash !== identity.genesisHash) fail('DEPLOYMENT_PROOF_INVALID');
  // Only a successful exact inclusion proof can authorize the deployer's reverted-attempt cleanup.
  if (reverted) fail('DEPLOY_REVERTED');
  return { identity, receipt, transaction, address, runtimeKeccak: keccakHex(code), allowlist, finalizedBlock: finalized?.number ?? null };
}

/** Both known and hashless attempts need canonical native proof. Known attempts may be recorded before
 * finality; unknown attempts additionally require finalized inclusion and exact account/nonce binding.
 * Failure preserves the guard; no imported record or pending hash alone authorizes clearing it.
 */
export async function clearRecordedAttempt({ pendingPath, txHash, record, rpc }) {
  const pending = await readFile(pendingPath, 'utf8').then(JSON.parse, () => null);
  const known = pending?.tx === txHash;
  const unknown = pending?.format === 'p2p-offramp/deployment-attempt/v1' && pending.state === 'broadcast-unknown' && pending.tx === null;
  if (!known && !unknown) return false;
  try {
    if (record.initializationTx !== txHash || record.chainId !== SEPOLIA.chainId.toString()) return false;
    const proof = await inspectDeployment(rpc, txHash, record.genesisIdentity);
    if (proof.address !== record.contractAddress || proof.receipt.from.toLowerCase() !== record.deployer ||
        proof.receipt.blockHash !== record.deployBlockHash || quantity(proof.receipt.blockNumber).toString() !== record.deployBlock ||
        proof.runtimeKeccak !== record.codeDigest?.runtime) return false;
    if (known && (pending.address !== undefined && pending.address !== proof.address || pending.chainId !== undefined && pending.chainId !== record.chainId ||
        pending.from !== undefined && pending.from !== record.deployer || pending.nonce !== undefined && BigInt(pending.nonce) !== quantity(proof.transaction.nonce))) return false;
    if (unknown && (pending.chainId !== record.chainId || pending.from !== record.deployer || BigInt(pending.nonce) !== quantity(proof.transaction.nonce) ||
        proof.finalizedBlock === null || proof.finalizedBlock < quantity(proof.receipt.blockNumber))) return false;
  } catch { return false; }
  // Do not remove a guard replaced while native reads were outstanding.
  const current = await readFile(pendingPath, 'utf8').then(JSON.parse, () => null);
  if (JSON.stringify(current) !== JSON.stringify(pending)) return false;
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
  const primary = await inspectDeployment(rpc, txHash, expectGenesis);
  if (primary.runtimeKeccak !== artifact.runtimeKeccak) fail('RUNTIME_CODE_MISMATCH');
  const expectedCreation = '0x' + Buffer.from(artifact.creation).toString('hex') + '20'.padStart(64, '0') + '0'.repeat(64);
  if (expectedDeployer !== undefined && primary.receipt.from?.toLowerCase() !== expectedDeployer) fail('UNEXPECTED_DEPLOYER');
  // An ABI-encoded empty address[]: offset 0x20, length 0. Native-only deployments must have no ERC-20 allowlist.
  if (primary.allowlist !== '0x' + '20'.padStart(64, '0') + '0'.repeat(64)) fail('ALLOWLIST_NOT_EMPTY');
  if (primary.transaction.input?.toLowerCase() !== expectedCreation) fail('DEPLOYMENT_CREATION_MISMATCH');
  if (crosscheckUrl) {
    let second;
    try { second = await inspectDeployment(rpcClient(crosscheckUrl), txHash, expectGenesis); }
    catch (error) { if (error instanceof RecordError) fail('CROSSCHECK_MISMATCH'); throw error; }
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
