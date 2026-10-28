/**
 * Send one escrow call as the seller through contracts/evm/script/SendCall.s.sol (G25 trade proof). The key is read by
 * Forge from SEPOLIA_SELLER_PRIVATE_KEY (falling back to SEPOLIA_DEPLOYER_PRIVATE_KEY, set here in the child
 * environment only) and the RPC URL from SEPOLIA_RPC_URL via foundry.toml; neither appears in argv or output. The
 * broadcast transaction is checked against the exact call that was requested before its hash is trusted.
 *
 * Gas: BasicEscrow pays out only with gasleft() >= MIN_PAYOUT_GAS (120k), so Forge's own estimate (simulated gas used
 * x 1.3) is too low for release/refund and the transaction reverts on chain. The limit is therefore taken from the
 * node's eth_estimateGas (a binary search that finds the gas at which the call succeeds, as wallets do) plus a margin,
 * and passed to the script, which forwards it as the call's gas.
 *
 * Forge stores the RPC URL (possibly with a provider API key) under contracts/evm/cache/<script>/<chain>; that
 * directory is deleted after every run. Forge runs offline (FOUNDRY_OFFLINE) so trace decoding never sends call data
 * to third-party signature services, and writes its broadcast record to a per-send directory (FOUNDRY_BROADCAST), so
 * a stale record from another run is never read and local proofs never touch the checkout's records.
 *
 * Outcomes. Nothing broadcast: SIMULATION_REVERTED (the node or Forge's simulation reverted; the caller re-observes),
 * FORGE_FAILED (any other Forge failure) or an RPC error code. Something broadcast: success, or TX_REVERTED /
 * RECEIPT_TIMEOUT / BROADCAST_MISMATCH carrying `hash`, so the caller can record what was actually sent. A nonce change
 * without a readable record is BROADCAST_UNCERTAIN. Only SIMULATION_REVERTED may be treated as "nothing happened".
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { EVM_DIR, forgeKey, SEPOLIA } from './lib.mjs';

const run = promisify(execFile);
export class SendError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'SendError'; this.code = code; Object.assign(this, details); }
}
const fail = (code, details) => { throw new SendError(code, details); };

/** The seller key in the form Forge reads (0x-prefixed); wallets often export it without the prefix. */
export function sellerKeyEnv(env) {
  return forgeKey(env.SEPOLIA_SELLER_PRIVATE_KEY || env.SEPOLIA_DEPLOYER_PRIVATE_KEY) ?? fail('SELLER_KEY_MISSING');
}

/** Removes Forge's per-run "sensitive values" cache (it holds the RPC URL) for one script on this chain. */
export async function clearForgeCache(script) {
  await rm(resolve(EVM_DIR, 'cache', script, SEPOLIA.chainId.toString()), { recursive: true, force: true });
}

/** The transactions Forge recorded for `script` under `dir`, or [] when it wrote no record. */
export async function recordedTransactions(dir, script) {
  let record;
  try { record = JSON.parse(await readFile(resolve(dir, script, SEPOLIA.chainId.toString(), 'run-latest.json'), 'utf8')); } catch { return []; }
  return Array.isArray(record?.transactions) ? record.transactions : fail('BROADCAST_UNREADABLE');
}

async function receiptOf(rpc, hash, pollMs, maxPolls) {
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const receipt = await rpc('eth_getTransactionReceipt', [hash]);
    if (receipt) return receipt;
    await new Promise(done => setTimeout(done, pollMs));
  }
  return fail('RECEIPT_TIMEOUT', { hash });
}

/**
 * Broadcasts `call` ({to, data, value}) from the seller and waits for its receipt. `broadcastDir` keeps Forge's record
 * (tests inspect it); by default a temporary directory is used and removed.
 */
export async function sendAsSeller({ env, rpc, call, seller, pollMs = 3000, maxPolls = 200, broadcastDir }) {
  let estimate;
  try { estimate = BigInt(await rpc('eth_estimateGas', [{ from: seller, to: call.to, data: call.data, value: `0x${BigInt(call.value).toString(16)}` }])); }
  catch (error) { if (error?.code === 'RPC_ERROR_3') fail('SIMULATION_REVERTED'); throw error; } // JSON-RPC 3 = execution reverted
  const gas = estimate + estimate / 5n + 10_000n;
  if (gas > 2_000_000n) fail('GAS_LIMIT_UNREASONABLE');
  const dir = broadcastDir ?? await mkdtemp(resolve(tmpdir(), 'p2p-sepolia-send-'));
  const childEnv = { ...env, SEPOLIA_SELLER_PRIVATE_KEY: sellerKeyEnv(env),
    FOUNDRY_OFFLINE: 'true', FOUNDRY_BROADCAST: dir, CALL_TO: call.to, CALL_DATA: call.data, CALL_VALUE: BigInt(call.value).toString(), CALL_GAS: gas.toString() };
  try {
    const nonceBefore = BigInt(await rpc('eth_getTransactionCount', [seller, 'pending']));
    let forgeFailure;
    try {
      await run('forge', ['script', 'script/SendCall.s.sol:SendCall', '--rpc-url', 'sepolia', '--broadcast'], { cwd: EVM_DIR, env: childEnv, maxBuffer: 16 * 1024 * 1024 });
    } catch (error) { forgeFailure = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`; } // Forge output may echo RPC details: matched, never relayed
    finally { await clearForgeCache('SendCall.s.sol'); }
    const sent = await recordedTransactions(dir, 'SendCall.s.sol');
    if (sent.length === 0) {
      // No record: before reporting "nothing sent", make sure no transaction left this account.
      if (BigInt(await rpc('eth_getTransactionCount', [seller, 'pending'])) !== nonceBefore) fail('BROADCAST_UNCERTAIN');
      fail(forgeFailure === undefined ? 'BROADCAST_UNREADABLE' : /script failed: CallReverted\(/.test(forgeFailure) ? 'SIMULATION_REVERTED' : 'FORGE_FAILED');
    }
    if (sent.length !== 1) fail('BROADCAST_UNREADABLE');
    const tx = sent[0], body = tx.transaction ?? {};
    if (!/^0x[0-9a-f]{64}$/.test(tx.hash ?? '')) fail('BROADCAST_UNREADABLE');
    // The transaction Forge broadcast must be exactly the requested call from the seller.
    if (body.from?.toLowerCase() !== seller || body.to?.toLowerCase() !== call.to.toLowerCase() || (body.input ?? body.data)?.toLowerCase() !== call.data.toLowerCase() ||
        BigInt(body.value ?? '0x0') !== BigInt(call.value) || BigInt(body.gas ?? '0x0') < gas) fail('BROADCAST_MISMATCH', { hash: tx.hash });
    const receipt = await receiptOf(rpc, tx.hash, pollMs, maxPolls);
    const result = { hash: tx.hash, block: BigInt(receipt.blockNumber), blockHash: receipt.blockHash, fee: BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice) };
    if (receipt.status !== '0x1') fail('TX_REVERTED', result);
    return result;
  } finally { if (!broadcastDir) await rm(dir, { recursive: true, force: true }); }
}
