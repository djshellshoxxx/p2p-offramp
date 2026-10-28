#!/usr/bin/env node
/**
 * Local proof of the Sepolia two-party trade tool (scripts/sepolia/trade.mjs) on a private anvil started with Sepolia's
 * chain id 11155111: kit deploy + owner-signed registry (ephemeral key), then a release trade and a refund trade with
 * replay/amount/expiry controls, a resumed run (refund after the deadline), recovery after a crash between broadcast
 * and save resumed past the acceptance window, a release trade resumed past its deadline, a release mined after its
 * deadline (recorded, then refunded), terminal statuses re-checked from chain, paged log queries, an acceptance window
 * that lapses before funding, edited state files and refusals. Loopback only: anvil's public development keys stand in
 * for seller and buyer; anvil time is advanced instead of waiting.
 *
 *   npm run test:sepolia:trade   (needs Foundry: FOUNDRY_BIN, ~/.foundry/bin or PATH)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deploy } from './sepolia/deploy.mjs';
import { recordDeployment } from './sepolia/record-deployment.mjs';
import { keygen, REGISTRY_ASSET, signRelease } from './sepolia/owner-release.mjs';
import { TRUSTED_KEY_PATH } from './sepolia/verify-release.mjs';
import { runTrades } from './sepolia/trade.mjs';
import { chainIdentity, EVM_DIR, ROOT, rpcClient, SEPOLIA } from './sepolia/lib.mjs';
import { reviewTermsBytes, RegistryService } from '../packages/domain/index.ts';
import { evmTermsHash } from '../packages/wallet/src/evm-terms.ts';

const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const PATH = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}:${process.env.PATH ?? ''}` : process.env.PATH ?? '';
// Anvil's documented deterministic development keys 0 (seller/deployer) and 1 (buyer): public and worthless.
const SELLER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const BUYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const SELLER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const PUBLIC_ENDPOINT = 'https://ethereum-sepolia-rpc.publicnode.com/';
// An operator session holds real Sepolia settings; none of them may reach this loopback-only proof.
process.env.SEPOLIA_SELLER_PRIVATE_KEY = '0x' + '22'.repeat(32);
process.env.SEPOLIA_CROSSCHECK_RPC_URL = 'http://127.0.0.1:9/';
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('SEPOLIA_')));
const passed = [];
const pass = name => { passed.push(name); console.log(`ok - ${name}`); };
const code = expected => error => { assert.equal(error?.code, expected, String(error?.stack ?? error)); return true; };
const freePort = () => new Promise((done, fail) => { const server = createServer(); server.once('error', fail); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)); }); });

/** JSON-RPC proxy that refuses eth_getLogs spans wider than `maxSpan` blocks, as hosted providers do. */
async function cappedLogsProxy(target, maxSpan) {
  const server = createHttpServer(async (request, response) => {
    let body = ''; for await (const part of request) body += part;
    const call = JSON.parse(body);
    if (call.method === 'eth_getLogs') {
      const { fromBlock, toBlock } = call.params[0];
      if (!/^0x/.test(fromBlock) || !/^0x/.test(toBlock) || BigInt(toBlock) - BigInt(fromBlock) + 1n > BigInt(maxSpan)) {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, error: { code: -32005, message: 'block range too large' } })); return;
      }
    }
    const upstream = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    response.setHeader('content-type', 'application/json'); response.end(await upstream.text());
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

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-sepolia-trade-'));
const recordsBefore = await broadcastSnapshot();
let anvil, capped;
try {
  const port = await freePort();
  anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', SEPOLIA.chainId.toString(), '--silent'], { env: { ...process.env, PATH }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`, rpc = rpcClient(url, { timeoutMs: 2000 });
  for (let attempt = 0; ; attempt++) { try { await rpc('eth_chainId'); break; } catch (error) { if (attempt > 100) throw error; await new Promise(done => setTimeout(done, 100)); } }
  const { genesisHash } = await chainIdentity(rpc);
  const advanceTime = async seconds => { await rpc('evm_increaseTime', [seconds]); await rpc('evm_mine'); };

  // Kit: deploy, record and owner-sign the registry inside a temporary repository root.
  const root = resolve(temporary, 'root');
  for (const file of ['contracts/evm/foundry.toml', 'package-lock.json', 'THIRD_PARTY_NOTICES.md']) { await mkdir(resolve(root, file, '..'), { recursive: true }); await copyFile(resolve(ROOT, file), resolve(root, file)); }
  // The seller key is given without 0x (the form wallets export); the kit normalizes it for Forge.
  const env = { ...inherited, PATH, SEPOLIA_RPC_URL: url, SEPOLIA_DEPLOYER_PRIVATE_KEY: SELLER_KEY.slice(2), SEPOLIA_BUYER_PRIVATE_KEY: BUYER_KEY };
  const deployed = await deploy({ env, publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash,
    outDir: resolve(root, 'docs/deployments/sepolia'), registryPath: resolve(root, REGISTRY_ASSET) });
  const escrow = deployed.record.contractAddress;
  // G25: the registry is signed only after the deployment block is finalized and re-recorded (anvil finalizes latest - 64).
  await rpc('anvil_mine', ['0x46']);
  assert.equal((await recordDeployment({ rpcUrl: url, txHash: deployed.record.initializationTx, publicEndpoint: PUBLIC_ENDPOINT, expectedDeployer: SELLER, expectGenesis: genesisHash,
    outDir: resolve(root, 'docs/deployments/sepolia'), registryPath: resolve(root, REGISTRY_ASSET), env })).record.finalizedAtRecording, true);

  // Refusals before any trade transaction.
  await assert.rejects(runTrades({ env, root, run: 'unsigned', expectGenesis: genesisHash }), error => /^REGISTRY_NOT_VERIFIED_/.test(error?.code));
  const owner = keygen();
  await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  const signed = await signRelease({ privateJwk: owner.privateJwk, sequence: 1, days: 30, now: Math.floor(Date.now() / 1000) - 60, root, sourceCommit: 'b'.repeat(40), expectGenesis: genesisHash });
  await writeFile(resolve(root, 'registry/testnet/sepolia.release.json'), signed.manifestBytes);
  await writeFile(resolve(root, 'registry/testnet/sepolia.release.sig.json'), JSON.stringify(signed.envelope));
  await assert.rejects(runTrades({ env, root, run: 'wrong-genesis' }), code('WRONG_GENESIS'));
  await assert.rejects(runTrades({ env: { ...env, SEPOLIA_BUYER_PRIVATE_KEY: SELLER_KEY }, root, run: 'same-party', expectGenesis: genesisHash }), code('BUYER_EQUALS_SELLER'));
  await assert.rejects(runTrades({ env: { ...env, SEPOLIA_BUYER_PRIVATE_KEY: '' }, root, run: 'no-buyer', expectGenesis: genesisHash }), code('BUYER_KEY_MISSING'));
  await assert.rejects(runTrades({ env, root, run: 'Bad Id', expectGenesis: genesisHash }), code('RUN_ID_INVALID'));
  assert.equal(await rpc('eth_getTransactionCount', [SELLER, 'latest']), '0x1', 'only the deployment was sent');
  pass('refuses an unverified registry, wrong genesis, buyer = seller, missing buyer key and a bad run id before sending anything');

  // Run 1: release trade settles; refund trade is funded and waits for its deadline.
  const first = await runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash });
  const statePath = first.path;
  const [release, refund] = first.state.trades;
  assert.equal(first.state.registryTrust.verified, true); assert.equal(first.state.registryTrust.keyId, owner.keyId);
  assert.equal(release.status, 'released'); assert.equal(refund.status, 'awaiting-deadline');
  for (const check of ['terms pass the app terms review against the registry', 'seller and buyer acceptances verify; not across roles, chains or deployments',
    'on-chain tradeIdOf equals the off-chain termsHash', 'amount control (one wei short): reverts IncorrectDeposit', 'escrow record and Funded event match the signed terms',
    'replay: funding the same terms again: reverts TradeIdUsed', 'replay: new terms reusing the seller nonce: reverts SellerNonceUsed',
    'buyer balance rose by exactly the principal in the release block', 'Released event pays the right party the exact principal',
    'settled trade: release again: reverts InvalidState', 'settled trade: refund again: reverts InvalidState']) assert.ok(release.checks.includes(check), check);
  assert.ok(refund.checks.includes('expiry control (before deadline): refund: reverts DeadlineNotReached'));
  pass('run 1: release trade signed, funded, released and verified; refund trade funded and waiting for its deadline');

  // Crash between the fund broadcast and its save: the refund trade's state exactly as saveState wrote it before the
  // broadcast (no hash, none of the post-funding checks), resumed only after acceptBefore has passed.
  const recorded = JSON.parse(await readFile(statePath, 'utf8'));
  const lostHash = recorded.trades[1].fund.tx;
  recorded.trades[1] = { label: 'refund', status: 'negotiated', checks: [...recorded.trades[1].checks.slice(0, 3), 'amount control (one wei short): reverts IncorrectDeposit'],
    terms: recorded.trades[1].terms, privateAgreement: recorded.trades[1].privateAgreement, tradeId: recorded.trades[1].tradeId, fromBlock: recorded.trades[1].fromBlock,
    acceptance: recorded.trades[1].acceptance, fund: { requestedAt: recorded.trades[1].fund.requestedAt, tx: null } };
  await writeFile(statePath, JSON.stringify(recorded));
  await advanceTime(901); // past acceptBefore (negotiation + 900 s), still before the refund deadline (negotiation + 2700 s)
  const resumed = await runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash });
  assert.equal(resumed.state.trades[1].fund.tx, lostHash, 'the fund transaction is recovered from the escrow logs');
  assert.equal(resumed.state.trades[1].status, 'awaiting-deadline');
  for (const check of ['escrow record and Funded event match the signed terms', 'replay: funding the same terms again: reverts TradeIdUsed',
    'replay: new terms reusing the seller nonce: reverts SellerNonceUsed']) assert.ok(resumed.state.trades[1].checks.includes(check), check);
  assert.equal(await rpc('eth_getTransactionCount', [SELLER, 'latest']), '0x4', 'no second funding was sent (deploy, fund, release, fund)');
  pass('a crash between broadcast and save, resumed after the acceptance window, recovers the funding and runs the replay controls at the funding block');

  // Run 2 with time advanced past the deadline: refund settles to the seller.
  const second = await runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash, wait: true, advanceTime, pollSeconds: 0 });
  const settled = second.state.trades[1];
  assert.equal(settled.status, 'refunded');
  for (const check of ['expiry control (after deadline): release: reverts DeadlinePassed', 'seller balance rose by exactly the principal minus the refund fee in the refund block',
    'Refunded event pays the right party the exact principal']) assert.ok(settled.checks.includes(check), check);
  pass('run 2: after the deadline, release reverts and the refund returns the exact principal to the seller');

  // Terminal outcomes are re-checked against the chain on every run; a recorded transaction re-included in another
  // block is detected by its block hash and recorded again.
  const settledState = JSON.parse(await readFile(statePath, 'utf8'));
  settledState.trades[0].settle.blockHash = `0x${'00'.repeat(32)}`;
  await writeFile(statePath, JSON.stringify(settledState));
  const rechecked = await runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash });
  assert.deepEqual(rechecked.state.trades.map(trade => trade.status), ['released', 'refunded']);
  assert.equal(rechecked.state.trades[0].settle.reincluded, true);
  assert.equal(rechecked.state.trades[0].settle.blockHash, (await rpc('eth_getTransactionReceipt', [rechecked.state.trades[0].settle.tx])).blockHash);
  assert.equal(await rpc('eth_getTransactionCount', [SELLER, 'latest']), '0x5', 'a settled run sends nothing more');
  pass('settled trades are re-observed on every run and a re-included transaction is detected by its block hash');

  // A release trade interrupted before settlement and resumed after its deadline is settled by refund and labelled so;
  // the refund trade is unaffected by the release trade's failure. This run goes through an RPC that caps eth_getLogs at
  // 3 blocks (as hosted providers do), so observation must page from each trade's own lower bound.
  capped = await cappedLogsProxy(url, 3);
  const cappedEnv = { ...env, SEPOLIA_RPC_URL: capped.url };
  const interrupted = new Error('interrupted before settlement');
  let interruptions = 0;
  await assert.rejects(runTrades({ env: cappedEnv, root, run: 'late-release', expectGenesis: genesisHash, logChunk: 3,
    beforeSettle: async trade => { if (trade.label === 'release' && interruptions++ === 0) throw interrupted; } }), error => error === interrupted);
  const lateState = JSON.parse(await readFile(resolve(root, 'docs/deployments/sepolia/trades/late-release.json'), 'utf8'));
  assert.deepEqual(lateState.trades.map(trade => trade.status), ['funded', 'awaiting-deadline'], 'the refund trade ran despite the release trade failing');
  assert.equal(lateState.trades[0].lastError.code, 'FAILED');
  assert.ok(lateState.trades.every(trade => /^[0-9]+$/.test(trade.fromBlock)), 'each trade records its own lower log bound');
  await advanceTime(7300);
  const late = await runTrades({ env: cappedEnv, root, run: 'late-release', expectGenesis: genesisHash, logChunk: 3, wait: true, advanceTime, pollSeconds: 0 });
  assert.deepEqual(late.state.trades.map(trade => trade.status), ['refunded-after-release-deadline', 'refunded']);
  for (const check of ['release window missed (deadline too close or passed): settled by refund after the deadline', 'expiry control (after deadline): release: reverts DeadlinePassed',
    'Refunded event pays the right party the exact principal']) assert.ok(late.state.trades[0].checks.includes(check), check);
  assert.equal(late.state.trades[0].lastError, undefined);
  pass('a release trade resumed after its deadline is refunded and labelled refunded-after-release-deadline; the other trade is unaffected');

  // A release that passes simulation but is mined after the deadline reverts on chain: the transaction is recorded with
  // its hash (TX_REVERTED), never reported as "nothing sent", and the next run settles the trade by refund.
  const nonceBeforeRevert = BigInt(await rpc('eth_getTransactionCount', [SELLER, 'latest']));
  await assert.rejects(runTrades({ env, root, run: 'revert-after-broadcast', expectGenesis: genesisHash,
    beforeSettle: async trade => {
      if (trade.label !== 'release') return;
      const deadline = Number(trade.terms.escrowExpirySeconds);
      const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
      await advanceTime(deadline - 300 - now); // inside the release window, clear of the 120 s margin
      await rpc('evm_setAutomine', [false]);
      // Mine the release only once it is pending, in a block after the deadline.
      void (async () => {
        const mined = await rpc('eth_getTransactionCount', [SELLER, 'latest']);
        while (await rpc('eth_getTransactionCount', [SELLER, 'pending']) === mined) await new Promise(done => setTimeout(done, 100));
        await rpc('evm_setNextBlockTimestamp', [deadline + 5]); await rpc('evm_mine'); await rpc('evm_setAutomine', [true]);
      })().catch(() => {});
    } }), code('TX_REVERTED'));
  const reverted = JSON.parse(await readFile(resolve(root, 'docs/deployments/sepolia/trades/revert-after-broadcast.json'), 'utf8'));
  const failedRelease = reverted.trades[0].failedSends?.[0];
  assert.equal(failedRelease?.kind, 'release'); assert.equal(failedRelease?.outcome, 'TX_REVERTED');
  assert.equal((await rpc('eth_getTransactionReceipt', [failedRelease.tx])).status, '0x0', 'the recorded transaction really reverted on chain');
  assert.equal(reverted.trades[0].status, 'funded'); assert.equal(reverted.trades[0].lastError.code, 'TX_REVERTED');
  assert.equal(reverted.trades[1].status, 'awaiting-deadline', 'the refund trade ran despite the failed release');
  const recovered = await runTrades({ env, root, run: 'revert-after-broadcast', expectGenesis: genesisHash, wait: true, advanceTime, pollSeconds: 0 });
  assert.deepEqual(recovered.state.trades.map(trade => trade.status), ['refunded-after-release-deadline', 'refunded']);
  assert.equal(BigInt(await rpc('eth_getTransactionCount', [SELLER, 'latest'])), nonceBeforeRevert + 5n, 'fund, failed release, fund, refund, refund');
  pass('a release mined after its deadline is recorded as TX_REVERTED with its hash, and the next run refunds the trade');

  // A lapsed acceptance window is an honest terminal outcome: nothing is funded.
  const nonceBefore = await rpc('eth_getTransactionCount', [SELLER, 'latest']);
  let lapsed = false;
  const expired = await runTrades({ env, root, run: 'lapsed', expectGenesis: genesisHash,
    beforeFund: async trade => { if (trade.label === 'release' && !lapsed) { lapsed = true; await advanceTime(901); } } });
  assert.equal(expired.state.trades[0].status, 'expired-unfunded');
  assert.equal(expired.state.trades[0].fund, undefined);
  assert.equal(expired.state.trades[1].status, 'awaiting-deadline', 'the other trade still runs');
  assert.equal(BigInt(await rpc('eth_getTransactionCount', [SELLER, 'latest'])), BigInt(nonceBefore) + 1n, 'only the refund trade was funded');
  pass('an acceptance window that lapses before funding ends as expired-unfunded without any transaction');

  // A trade wrongly recorded as expired-unfunded while the chain shows it funded is processed again, not skipped.
  const lapsedPath = resolve(root, 'docs/deployments/sepolia/trades/lapsed.json');
  const wrong = JSON.parse(await readFile(lapsedPath, 'utf8')); wrong.trades[1].status = 'expired-unfunded';
  await writeFile(lapsedPath, JSON.stringify(wrong));
  const reprocessed = await runTrades({ env, root, run: 'lapsed', expectGenesis: genesisHash });
  assert.deepEqual(reprocessed.state.trades.map(trade => trade.status), ['expired-unfunded', 'awaiting-deadline']);
  assert.ok(reprocessed.state.trades[1].checks.includes('re-observed funded for a trade recorded as expired-unfunded: processing again'));
  pass('a terminal status that the chain contradicts is re-observed and processed again');

  // A negotiated trade is re-validated from the state file before any transaction: edited terms are refused.
  const crash = new Error('crash after negotiation, before funding');
  await assert.rejects(runTrades({ env, root, run: 'tamper', expectGenesis: genesisHash, beforeFund: async () => { throw crash; } }), error => error === crash);
  const tamperPath = resolve(root, 'docs/deployments/sepolia/trades/tamper.json');
  const negotiated = JSON.parse(await readFile(tamperPath, 'utf8'));
  assert.equal(negotiated.trades[0].status, 'negotiated');
  const nonceAtTamper = await rpc('eth_getTransactionCount', [SELLER, 'latest']);
  const domain = { chainId: SEPOLIA.chainId.toString(), verifyingContract: escrow };
  for (const change of [trade => { trade.terms.buyer = `0x${'77'.repeat(20)}`; }, trade => { trade.terms.amountBaseUnits = '5000000000000000000'; },
    trade => { trade.terms.escrowExpirySeconds = String(Number(trade.terms.escrowExpirySeconds) + 86_400); },
    trade => { trade.acceptance.buyer = trade.acceptance.seller; }, trade => { trade.privateAgreement.fiatMinorUnits = '999'; }]) {
    const edited = structuredClone(negotiated); change(edited.trades[0]); edited.trades[0].tradeId = evmTermsHash(domain, edited.trades[0].terms);
    await writeFile(tamperPath, JSON.stringify(edited));
    await assert.rejects(runTrades({ env, root, run: 'tamper', expectGenesis: genesisHash }), code('STATE_MISMATCH'));
  }
  // The invocation, not the file, sets the amount: a consistently edited file amount is refused as well.
  const larger = structuredClone(negotiated); larger.amountWei = '5000000000000000000';
  await writeFile(tamperPath, JSON.stringify(larger));
  await assert.rejects(runTrades({ env, root, run: 'tamper', expectGenesis: genesisHash }), code('STATE_MISMATCH'));
  assert.equal(await rpc('eth_getTransactionCount', [SELLER, 'latest']), nonceAtTamper, 'nothing was sent for an edited state file');
  pass('a resumed run re-validates every negotiated trade (parties, amount, terms review, termsHash, both signatures) before any transaction');

  // A Forge failure that is not a simulated revert is reported, never swallowed as "not funded".
  await assert.rejects(runTrades({ env: { ...env, PATH: '/usr/bin:/bin' }, root, run: 'no-forge', expectGenesis: genesisHash }), code('FORGE_FAILED'));
  assert.equal(await rpc('eth_getTransactionCount', [SELLER, 'latest']), nonceAtTamper);
  pass('a Forge failure other than a revert stops the run as FORGE_FAILED');

  // A state file that names another deployment or party is refused.
  const tampered = JSON.parse(await readFile(statePath, 'utf8')); tampered.escrow = `0x${'ab'.repeat(20)}`;
  await writeFile(statePath, JSON.stringify(tampered));
  await assert.rejects(runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash }), code('STATE_MISMATCH'));
  pass('refuses to resume a state file bound to a different escrow');

  // Evidence holds no secrets, and each trade's terms file passes the app review against the registry.
  let evidence = '';
  for (const name of ['lapsed.json', 'local-proof.json', 'late-release.json', 'revert-after-broadcast.json', 'tamper.json', 'local-proof.release.terms-review.json']) evidence += await readFile(resolve(root, 'docs/deployments/sepolia/trades', name), 'utf8');
  for (const secret of [SELLER_KEY.slice(2), BUYER_KEY.slice(2), url]) assert.ok(!evidence.includes(secret), 'no key or RPC URL in evidence');
  const registryBytes = new Uint8Array(await readFile(resolve(root, REGISTRY_ASSET)));
  const service = new RegistryService(); assert.equal((await service.load(registryBytes, (await import('./sepolia/lib.mjs')).sha256Hex(registryBytes))).ok, true);
  const reviewed = await reviewTermsBytes(service, new Uint8Array(await readFile(resolve(root, 'docs/deployments/sepolia/trades/local-proof.release.terms-review.json'))));
  assert.equal(reviewed.ok, true); assert.equal(reviewed.value.deployment.address, escrow);
  pass('evidence contains no key or RPC URL; the written terms-review file passes the app review and names the deployed escrow');
  // Forge wrote every broadcast record to per-run directories: the checkout's records (real deployments) are untouched.
  assert.equal(await broadcastSnapshot(), recordsBefore, 'the checkout broadcast records are untouched');
  console.log(`\n${passed.length} sepolia trade checks passed`);
} finally {
  await capped?.close(); anvil?.kill('SIGTERM');
  await rm(temporary, { recursive: true, force: true });
}
