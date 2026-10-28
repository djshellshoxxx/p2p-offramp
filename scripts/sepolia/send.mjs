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
 * to third-party signature services. A revert in Forge's simulation is SIMULATION_REVERTED (the caller re-observes);
 * any other Forge failure (bad key format, missing binary, compile error) is FORGE_FAILED and is never swallowed.
 */
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { EVM_DIR, forgeKey, SEPOLIA } from './lib.mjs';

const run = promisify(execFile);
export class SendError extends Error { constructor(code) { super(code); this.name = 'SendError'; this.code = code; } }
const fail = code => { throw new SendError(code); };

/** The seller key in the form Forge reads (0x-prefixed); wallets often export it without the prefix. */
export function sellerKeyEnv(env) {
  return forgeKey(env.SEPOLIA_SELLER_PRIVATE_KEY || env.SEPOLIA_DEPLOYER_PRIVATE_KEY) ?? fail('SELLER_KEY_MISSING');
}

/**
 * Broadcasts `call` ({to, data, value}) from the seller and waits for its receipt. Throws SIMULATION_REVERTED when
 * Forge refused to broadcast (the call would revert), so the caller can re-observe chain state and decide.
 */
/** Removes Forge's per-run "sensitive values" cache (it holds the RPC URL) for one script on this chain. */
export async function clearForgeCache(script) {
  await rm(resolve(EVM_DIR, 'cache', script, SEPOLIA.chainId.toString()), { recursive: true, force: true });
}

export async function sendAsSeller({ env, rpc, call, seller, pollMs = 3000, maxPolls = 200 }) {
  let estimate;
  try { estimate = BigInt(await rpc('eth_estimateGas', [{ from: seller, to: call.to, data: call.data, value: `0x${BigInt(call.value).toString(16)}` }])); }
  catch { fail('SIMULATION_REVERTED'); } // the node refuses to estimate a call that reverts: nothing is broadcast
  const gas = estimate + estimate / 5n + 10_000n;
  if (gas > 2_000_000n) fail('GAS_LIMIT_UNREASONABLE');
  const childEnv = { ...env, SEPOLIA_SELLER_PRIVATE_KEY: sellerKeyEnv(env), DEPLOY_EXPECTED_CHAIN_ID: SEPOLIA.chainId.toString(), FOUNDRY_OFFLINE: 'true',
    CALL_TO: call.to, CALL_DATA: call.data, CALL_VALUE: BigInt(call.value).toString(), CALL_GAS: gas.toString() };
  try {
    await run('forge', ['script', 'script/SendCall.s.sol:SendCall', '--rpc-url', 'sepolia', '--broadcast'], { cwd: EVM_DIR, env: childEnv, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    // Forge output may echo RPC details: it is only matched against the script's own revert marker, never relayed.
    fail(/script failed: CallReverted\(/.test(`${error?.stdout ?? ''}\n${error?.stderr ?? ''}`) ? 'SIMULATION_REVERTED' : 'FORGE_FAILED');
  } finally { await clearForgeCache('SendCall.s.sol'); }
  const broadcast = JSON.parse(await readFile(resolve(EVM_DIR, 'broadcast/SendCall.s.sol', SEPOLIA.chainId.toString(), 'run-latest.json'), 'utf8'));
  const sent = broadcast.transactions ?? [];
  if (sent.length !== 1) fail('BROADCAST_UNREADABLE');
  const tx = sent[0], body = tx.transaction ?? {};
  // The transaction Forge broadcast must be exactly the requested call from the seller.
  if (!/^0x[0-9a-f]{64}$/.test(tx.hash ?? '') || body.from?.toLowerCase() !== seller || body.to?.toLowerCase() !== call.to.toLowerCase() ||
      (body.input ?? body.data)?.toLowerCase() !== call.data.toLowerCase() || BigInt(body.value ?? '0x0') !== BigInt(call.value) || BigInt(body.gas ?? '0x0') < gas) fail('BROADCAST_MISMATCH');
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const receipt = await rpc('eth_getTransactionReceipt', [tx.hash]);
    if (receipt) {
      if (receipt.status !== '0x1') fail('TX_REVERTED');
      return { hash: tx.hash, block: BigInt(receipt.blockNumber), blockHash: receipt.blockHash, fee: BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice) };
    }
    await new Promise(done => setTimeout(done, pollMs));
  }
  return fail('RECEIPT_TIMEOUT');
}
