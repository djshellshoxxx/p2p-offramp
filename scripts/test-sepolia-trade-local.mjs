#!/usr/bin/env node
/**
 * Local proof of the Sepolia two-party trade tool (scripts/sepolia/trade.mjs) on a private anvil started with Sepolia's
 * chain id 11155111: kit deploy + owner-signed registry (ephemeral key), then a release trade and a refund trade with
 * replay/amount/expiry controls, a resumed run (refund after the deadline), recovery of a fund transaction whose hash
 * was lost in a crash, an acceptance window that lapses before funding, and refusals. Loopback only: anvil's public
 * development keys stand in for seller and buyer; anvil time is advanced instead of waiting 30 minutes.
 *
 *   npm run test:sepolia:trade   (needs Foundry: FOUNDRY_BIN, ~/.foundry/bin or PATH)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { deploy } from './sepolia/deploy.mjs';
import { keygen, REGISTRY_ASSET, signRelease } from './sepolia/owner-release.mjs';
import { TRUSTED_KEY_PATH } from './sepolia/verify-release.mjs';
import { runTrades } from './sepolia/trade.mjs';
import { chainIdentity, ROOT, rpcClient, SEPOLIA } from './sepolia/lib.mjs';
import { reviewTermsBytes, RegistryService } from '../packages/domain/index.ts';

const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const PATH = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}:${process.env.PATH ?? ''}` : process.env.PATH ?? '';
// Anvil's documented deterministic development keys 0 (seller/deployer) and 1 (buyer): public and worthless.
const SELLER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const BUYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const SELLER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const PUBLIC_ENDPOINT = 'https://ethereum-sepolia-rpc.publicnode.com/';
const passed = [];
const pass = name => { passed.push(name); console.log(`ok - ${name}`); };
const code = expected => error => { assert.equal(error?.code, expected, String(error?.stack ?? error)); return true; };
const freePort = () => new Promise((done, fail) => { const server = createServer(); server.once('error', fail); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)); }); });

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-sepolia-trade-'));
let anvil;
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
  const env = { ...process.env, PATH, SEPOLIA_RPC_URL: url, SEPOLIA_DEPLOYER_PRIVATE_KEY: SELLER_KEY, SEPOLIA_BUYER_PRIVATE_KEY: BUYER_KEY };
  const deployed = await deploy({ env, publicEndpoint: PUBLIC_ENDPOINT, expectGenesis: genesisHash,
    outDir: resolve(root, 'docs/deployments/sepolia'), registryPath: resolve(root, REGISTRY_ASSET) });
  const escrow = deployed.record.contractAddress;

  // Refusals before any trade transaction.
  await assert.rejects(runTrades({ env, root, run: 'unsigned', expectGenesis: genesisHash }), error => /^REGISTRY_NOT_VERIFIED_/.test(error?.code));
  const owner = keygen();
  await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: owner.keyId, publicKey: owner.publicKey }));
  const signed = await signRelease({ privateJwk: owner.privateJwk, sequence: 1, days: 30, now: Math.floor(Date.now() / 1000) - 60, root, sourceCommit: 'b'.repeat(40) });
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

  // Crash recovery: the refund trade's fund hash is lost as if the process died right after broadcasting.
  const recorded = JSON.parse(await readFile(statePath, 'utf8'));
  const lostHash = recorded.trades[1].fund.tx;
  recorded.trades[1].fund = { requestedAt: recorded.trades[1].fund.requestedAt, tx: null }; recorded.trades[1].status = 'negotiated';
  await writeFile(statePath, JSON.stringify(recorded));
  const resumed = await runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash });
  assert.equal(resumed.state.trades[1].fund.tx, lostHash, 'the fund transaction is recovered from the escrow logs');
  assert.equal(resumed.state.trades[1].status, 'awaiting-deadline');
  assert.equal(await rpc('eth_getTransactionCount', [SELLER, 'latest']), '0x4', 'no second funding was sent (deploy, fund, release, fund)');
  pass('resume after a lost transaction hash recovers it from chain state and does not fund twice');

  // Run 2 with time advanced past the deadline: refund settles to the seller.
  const second = await runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash, wait: true, advanceTime, pollSeconds: 0 });
  const settled = second.state.trades[1];
  assert.equal(settled.status, 'refunded');
  for (const check of ['expiry control (after deadline): release: reverts DeadlinePassed', 'seller balance rose by exactly the principal minus the refund fee in the refund block',
    'Refunded event pays the right party the exact principal']) assert.ok(settled.checks.includes(check), check);
  pass('run 2: after the deadline, release reverts and the refund returns the exact principal to the seller');

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

  // A state file that names another deployment or party is refused.
  const tampered = JSON.parse(await readFile(statePath, 'utf8')); tampered.escrow = `0x${'ab'.repeat(20)}`;
  await writeFile(statePath, JSON.stringify(tampered));
  await assert.rejects(runTrades({ env, root, run: 'local-proof', expectGenesis: genesisHash }), code('STATE_MISMATCH'));
  pass('refuses to resume a state file bound to a different escrow');

  // Evidence holds no secrets, and each trade's terms file passes the app review against the registry.
  const evidence = await readFile(resolve(root, 'docs/deployments/sepolia/trades/lapsed.json'), 'utf8') + await readFile(resolve(root, 'docs/deployments/sepolia/trades/local-proof.release.terms-review.json'), 'utf8');
  for (const secret of [SELLER_KEY.slice(2), BUYER_KEY.slice(2), url]) assert.ok(!evidence.includes(secret), 'no key or RPC URL in evidence');
  const registryBytes = new Uint8Array(await readFile(resolve(root, REGISTRY_ASSET)));
  const service = new RegistryService(); assert.equal((await service.load(registryBytes, (await import('./sepolia/lib.mjs')).sha256Hex(registryBytes))).ok, true);
  const reviewed = await reviewTermsBytes(service, new Uint8Array(await readFile(resolve(root, 'docs/deployments/sepolia/trades/local-proof.release.terms-review.json'))));
  assert.equal(reviewed.ok, true); assert.equal(reviewed.value.deployment.address, escrow);
  pass('evidence contains no key or RPC URL; the written terms-review file passes the app review and names the deployed escrow');
  console.log(`\n${passed.length} sepolia trade checks passed`);
} finally {
  anvil?.kill('SIGTERM');
  await rm(temporary, { recursive: true, force: true });
  for (const dir of ['broadcast/DeployBasicEscrow.s.sol/11155111', 'broadcast/SendCall.s.sol/11155111']) await rm(resolve(ROOT, 'contracts/evm', dir), { recursive: true, force: true });
}
