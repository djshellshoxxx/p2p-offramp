#!/usr/bin/env node
/**
 * Two-party LOCAL/TEST EVM trade evidence: offer (signed G16 terms) -> accept -> fund -> settle/refund against a real
 * BasicEscrow on a private anvil. Loopback only, no external network, no real funds. All escrow/ERC-20-approve
 * calldata comes from packages/wallet/src/evm-escrow.ts; the only calldata not built there is the test token's `mint`
 * (setup, via cast). Run: npm run test:evm:local  (needs Foundry in ~/.foundry/bin).
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { createTradeAuthority } from '../packages/domain/src/authority.ts';
import { evmTermsHash, keccak256, verifyEoaAcceptance } from '../packages/wallet/src/evm-terms.ts';
import {
  approveAmountFor, buildChainObservation, buildErc20Approve, buildErc20BalanceOf, buildFundNative, buildFundToken, buildGetTrade, buildPendingWithdrawals,
  buildRefund, buildRelease, buildSetAccept, buildTradeIdOf, buildWithdraw, decodeEscrowLog, decodeEscrowRevert, decodeTrade, tradeMatchesTerms,
} from '../packages/wallet/src/evm-escrow.ts';

const run = promisify(execFile);
// Prefer a local Foundry install; CI puts Foundry on PATH instead (foundry-toolchain).
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const EVM_DIR = fileURLToPath(new URL('../contracts/evm/', import.meta.url));
const ENV = { ...process.env, PATH: `${FOUNDRY}:${process.env.PATH ?? ''}` };
// Anvil's documented deterministic development accounts (public, worthless): 0 seller, 1 buyer, 2 third party, 3 impostor buyer.
const KEYS = {
  seller: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', buyer: '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  third: '5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', impostor: '7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
};
const hexBytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
const toHex = bytes => Buffer.from(bytes).toString('hex');
const addressOf = keyHex => `0x${toHex(keccak256(secp256k1.getPublicKey(hexBytes(keyHex), false).subarray(1)).subarray(12))}`;
const A = Object.fromEntries(Object.entries(KEYS).map(([role, key]) => [role, addressOf(key)]));
const ZERO = `0x${'0'.repeat(40)}`;
const sha = label => createHash('sha256').update(label).digest('hex');
const sign = (keyHex, digestHex) => {
  const raw = secp256k1.sign(hexBytes(digestHex), hexBytes(keyHex), { prehash: false, format: 'recovered', lowS: true });
  return Uint8Array.from([...raw.subarray(1), raw[0] + 27]);
};

let anvil, rpcUrl;
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}
let rpcId = 0;
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
  const body = await response.json();
  if (body.error) throw Object.assign(new Error(`${method}: ${body.error.message}`), { rpc: body.error });
  return body.result;
}
const big = hex => BigInt(hex);
const qty = value => `0x${BigInt(value).toString(16)}`;
const blockTime = async () => Number(big((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
const balance = async account => big(await rpc('eth_getBalance', [account, 'latest']));
const tokenBalance = async (token, account) => big(await rpc('eth_call', [{ to: token, data: buildErc20BalanceOf(token, account).data }, 'latest']));

/** Sends a built call as `from` (anvil dev accounts are unlocked); returns the receipt and the wei fee paid. */
async function send(from, call) {
  const hash = await rpc('eth_sendTransaction', [{ from, to: call.to, data: call.data, value: qty(call.value) }]);
  let receipt = null;
  for (let attempt = 0; receipt === null && attempt < 100; attempt++) {
    receipt = await rpc('eth_getTransactionReceipt', [hash]);
    if (receipt === null) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.notEqual(receipt, null, 'receipt available');
  assert.equal(receipt.status, '0x1', 'transaction must succeed');
  return { receipt, fee: big(receipt.gasUsed) * big(receipt.effectiveGasPrice) };
}
/** Executes `call` as `from` through eth_call and returns the decoded custom error; fails if it does not revert. */
async function revertOf(from, call) {
  try { await rpc('eth_call', [{ from, to: call.to, data: call.data, value: qty(call.value) }, 'latest']); }
  catch (error) {
    const data = error.rpc?.data;
    assert.equal(typeof data, 'string', `expected revert data, got ${error.message}`);
    return decodeEscrowRevert(data);
  }
  return assert.fail('call was expected to revert');
}
async function trade(escrow, tradeId) { return decodeTrade(await rpc('eth_call', [{ to: escrow, data: buildGetTrade(escrow, tradeId).data }, 'latest'])); }

async function deploy(contract, constructorArgs) {
  const { stdout } = await run('forge', ['create', contract, '--rpc-url', rpcUrl, '--private-key', `0x${KEYS.seller}`, '--broadcast', '--json', ...(constructorArgs ? ['--constructor-args', ...constructorArgs] : [])],
    { cwd: EVM_DIR, env: ENV, maxBuffer: 1 << 24 });
  const out = JSON.parse(stdout.slice(stdout.indexOf('{')));
  return out.deployedTo.toLowerCase();
}

let counter = 0;
/** Fresh terms for a trade: unique orderId and single-use seller nonce, window anchored to the chain clock. */
async function makeTerms(domain, kind, token, amount, buyer = A.buyer, lifetime = 7200) {
  const label = `local-trade-${++counter}`, now = await blockTime();
  return {
    orderId: toHex(keccak256(new TextEncoder().encode(`${label}-order`))), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-local-v1',
    seller: A.seller, buyer, assetKind: kind, asset: kind === 'native' ? ZERO : token, amountBaseUnits: String(amount),
    privateAgreementHash: sha(`${label}-private`), capabilitiesHash: sha(`${label}-caps`), sellerNonce: toHex(keccak256(new TextEncoder().encode(`${label}-nonce`))),
    acceptBeforeSeconds: String(now + 3600), escrowExpirySeconds: String(now + lifetime), _domain: domain,
  };
}
const clean = ({ _domain, ...terms }) => terms;

/** offer -> accept: both parties sign the same termsHash; both signatures are verified offline before any funds move. */
function negotiate(domain, terms) {
  const tradeId = evmTermsHash(domain, terms), sellerSig = sign(KEYS.seller, tradeId), buyerSig = sign(KEYS.buyer, tradeId);
  assert.equal(verifyEoaAcceptance(domain, terms, 'seller', sellerSig), true, 'seller acceptance verifies');
  assert.equal(verifyEoaAcceptance(domain, terms, 'buyer', buyerSig), true, 'buyer acceptance verifies');
  assert.equal(verifyEoaAcceptance(domain, terms, 'buyer', sellerSig), false, 'seller key is not buyer acceptance');
  return tradeId;
}

/** Domain authority fed only with observations decoded from the escrow's own state. */
function authorityFor(escrow, binding) {
  return createTradeAuthority({
    binding, generation: 0, walletGeneration: 0,
    readValidated: async (_binding, request) => {
      const block = await rpc('eth_getBlockByNumber', ['latest', false]);
      const logs = await rpc('eth_getLogs', [{ address: escrow, fromBlock: '0x0', toBlock: block.number }]);
      const getTradeReturn = await rpc('eth_call', [{ to: escrow, data: buildGetTrade(escrow, binding.tradeId).data }, block.number]);
      const tradeLogs = logs.filter(entry => entry.topics[1] === `0x${binding.tradeId}` || entry.topics.length < 2);
      return { ok: true, value: buildChainObservation(escrow, { binding, generation: request.generation, requestSequence: request.requestSequence, getTradeReturn,
        logs: tradeLogs, anchor: { height: String(big(block.number)), hash: block.hash }, finality: 'confirmed', observedAt: Date.now() }) };
    },
  });
}
async function observe(authority, binding, expected) {
  const result = await authority.refresh(binding);
  assert.equal(result.ok, true, 'authority accepts the escrow observation');
  assert.equal(result.value.state, expected);
  assert.equal(authority.readView(Date.now()).chain.state, expected);
}
async function logsOf(escrow, tradeId) {
  const logs = await rpc('eth_getLogs', [{ address: escrow, fromBlock: '0x0', toBlock: 'latest' }]);
  return logs.map(entry => decodeEscrowLog(escrow, entry)).filter(event => event.tradeId === tradeId).map(event => event.kind);
}

const results = [];
const pass = name => { results.push(name); console.log(`ok - ${name}`); };

async function main() {
  const port = await freePort();
  rpcUrl = `http://127.0.0.1:${port}`;
  anvil = spawn(ANVIL, ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', '31337'], { env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });
  anvil.once('error', error => { throw error; });
  for (let attempt = 0; ; attempt++) {
    try { await rpc('eth_chainId'); break; } catch (error) { if (attempt > 100) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const accounts = (await rpc('eth_accounts')).map(account => account.toLowerCase());
  for (const role of Object.keys(KEYS)) assert.ok(accounts.includes(A[role]), `${role} key matches an anvil dev account`);
  assert.equal(big(await rpc('eth_chainId')), 31337n);

  const token = await deploy('test/mocks/Mocks.sol:MockERC20', ['Test USD', 'TUSD']);
  const escrow = await deploy('src/BasicEscrow.sol:BasicEscrow', [`[${token}]`]);
  const domain = { chainId: '31337', verifyingContract: escrow };
  const mint = async (to, amount) => run('cast', ['send', '--rpc-url', rpcUrl, '--private-key', `0x${KEYS.seller}`, token, 'mint(address,uint256)', to, String(amount)], { env: ENV });
  await mint(A.seller, 10_000_000n);
  pass('deployed BasicEscrow and mock ERC-20 on private anvil (chain 31337, loopback)');

  const binding = id => ({ chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-local-v1', tradeId: id });
  const WEI = 10n ** 18n;

  // ---- 1. native: offer -> accept -> fund -> release ----
  {
    const terms = clean(await makeTerms(domain, 'native', ZERO, WEI)), tradeId = negotiate(domain, terms);
    assert.equal((await rpc('eth_call', [{ to: escrow, data: buildTradeIdOf(domain, terms).data }, 'latest'])).slice(2), tradeId, 'on-chain tradeIdOf equals off-chain termsHash');
    const authority = authorityFor(escrow, binding(tradeId));
    await observe(authority, binding(tradeId), 'absent');
    const sellerBefore = await balance(A.seller), buyerBefore = await balance(A.buyer);
    const fund = buildFundNative(domain, terms);
    assert.equal(fund.tradeId, tradeId);
    const funded = await send(A.seller, fund);
    assert.equal(await balance(escrow), WEI);
    assert.equal(await balance(A.seller), sellerBefore - WEI - funded.fee);
    assert.equal(tradeMatchesTerms(await trade(escrow, tradeId), terms), true);
    await observe(authority, binding(tradeId), 'funded');
    const released = await send(A.seller, buildRelease(escrow, tradeId));
    assert.equal(await balance(A.buyer), buyerBefore + WEI, 'buyer received exactly the principal');
    assert.equal(await balance(escrow), 0n);
    assert.equal(await balance(A.seller), sellerBefore - WEI - funded.fee - released.fee);
    assert.deepEqual(await logsOf(escrow, tradeId), ['Funded', 'Released']);
    await observe(authority, binding(tradeId), 'released');
    pass('native trade: signed terms -> fund -> release; buyer +1 ETH, escrow empty, authority observes absent/funded/released');

    // ---- negatives on the settled trade ----
    const again = await revertOf(A.seller, buildRelease(escrow, tradeId));
    assert.deepEqual([again.name, again.args[1]], ['InvalidState', '2'], 'double release reverts: already Released');
    const refundAfter = await revertOf(A.third, buildRefund(escrow, tradeId));
    assert.equal(refundAfter.name, 'InvalidState', 'refund after release reverts');
    assert.equal((await revertOf(A.seller, fund)).name, 'TradeIdUsed', 'a settled trade id cannot be funded again');
    pass('negative: double release, refund-after-release and re-funding a settled trade all revert');
  }

  // ---- 2. ERC-20: approve -> fund -> release ----
  {
    const amount = 2_500_000n, terms = clean(await makeTerms(domain, 'erc20', token, amount)), tradeId = negotiate(domain, terms);
    assert.equal(approveAmountFor(terms), String(amount));
    const fund = buildFundToken(domain, terms);
    // Funding without allowance reverts with the token's own error, bubbled through SafeERC20, not with an escrow error.
    await assert.rejects(rpc('eth_call', [{ from: A.seller, to: fund.to, data: fund.data }, 'latest']), error => {
      const data = error.rpc?.data;
      assert.equal(typeof data, 'string', `expected revert data, got ${error.message}`);
      assert.equal(data.slice(0, 10), '0xfb8f41b2', 'ERC20InsufficientAllowance(address,uint256,uint256)');
      assert.throws(() => decodeEscrowRevert(data), 'not an escrow custom error');
      return true;
    });
    await send(A.seller, buildErc20Approve(token, escrow, approveAmountFor(terms)));
    const sellerBefore = await tokenBalance(token, A.seller), buyerBefore = await tokenBalance(token, A.buyer);
    const authority = authorityFor(escrow, binding(tradeId));
    await send(A.seller, fund);
    assert.equal(await tokenBalance(token, escrow), amount);
    assert.equal(await tokenBalance(token, A.seller), sellerBefore - amount);
    await observe(authority, binding(tradeId), 'funded');
    await send(A.seller, buildRelease(escrow, tradeId));
    assert.equal(await tokenBalance(token, A.buyer), buyerBefore + amount);
    assert.equal(await tokenBalance(token, escrow), 0n);
    await observe(authority, binding(tradeId), 'released');
    pass('ERC-20 trade: exact approve -> fund -> release; buyer +2.5 TUSD, escrow empty');
  }

  // ---- 3. refund after the deadline by a third party (native and ERC-20) ----
  {
    const nativeTerms = clean(await makeTerms(domain, 'native', ZERO, WEI / 2n)), nativeId = negotiate(domain, nativeTerms);
    const tokenTerms = clean(await makeTerms(domain, 'erc20', token, 1_000_000n)), tokenId = negotiate(domain, tokenTerms);
    await send(A.seller, buildErc20Approve(token, escrow, approveAmountFor(tokenTerms)));
    const sellerNative = await balance(A.seller), sellerToken = await tokenBalance(token, A.seller), buyerNative = await balance(A.buyer);
    const fundN = await send(A.seller, buildFundNative(domain, nativeTerms));
    const fundT = await send(A.seller, buildFundToken(domain, tokenTerms));
    const authority = authorityFor(escrow, binding(nativeId));
    await observe(authority, binding(nativeId), 'funded');
    assert.equal((await revertOf(A.third, buildRefund(escrow, nativeId))).name, 'DeadlineNotReached', 'refund before the deadline reverts');

    const deadline = Number(nativeTerms.escrowExpirySeconds);
    await rpc('evm_increaseTime', [deadline - (await blockTime()) + 1]);
    await rpc('evm_mine');
    assert.ok((await blockTime()) >= deadline, 'chain clock is past the deadline');

    const early = await revertOf(A.seller, buildRelease(escrow, nativeId));
    assert.equal(early.name, 'DeadlinePassed', 'release after the deadline reverts');
    assert.equal((await revertOf(A.seller, buildRelease(escrow, tokenId))).name, 'DeadlinePassed');
    const thirdBefore = await balance(A.third);
    const refundN = await send(A.third, buildRefund(escrow, nativeId)), refundT = await send(A.third, buildRefund(escrow, tokenId));
    assert.equal(await balance(A.seller), sellerNative - fundN.fee - fundT.fee, 'seller is made whole except its own funding gas');
    assert.equal(await balance(A.third), thirdBefore - refundN.fee - refundT.fee, 'the caller pays only gas and receives nothing');
    assert.equal(await tokenBalance(token, A.seller), sellerToken, 'token principal returned to the seller');
    assert.equal(await balance(A.buyer), buyerNative, 'buyer received nothing');
    assert.equal(await balance(escrow), 0n); assert.equal(await tokenBalance(token, escrow), 0n);
    assert.deepEqual(await logsOf(escrow, nativeId), ['Funded', 'Refunded']);
    await observe(authority, binding(nativeId), 'refunded');
    assert.equal((await revertOf(A.third, buildRefund(escrow, nativeId))).name, 'InvalidState', 'double refund reverts');
    pass('refund trades: fund -> clock past deadline -> third party refunds to seller only (native and ERC-20); release after deadline reverts');
  }

  // ---- 4. substituted buyer ----
  {
    const terms = clean(await makeTerms(domain, 'native', ZERO, WEI / 10n)), tradeId = negotiate(domain, terms);
    const swapped = { ...terms, buyer: A.impostor }, swappedId = evmTermsHash(domain, swapped);
    assert.notEqual(swappedId, tradeId, 'a different buyer is a different tradeId');
    assert.equal(verifyEoaAcceptance(domain, swapped, 'buyer', sign(KEYS.buyer, tradeId)), false, 'the real buyer never accepted the substituted terms');
    assert.equal((await rpc('eth_call', [{ to: escrow, data: buildTradeIdOf(domain, swapped).data }, 'latest'])).slice(2), swappedId);
    await send(A.seller, buildFundNative(domain, terms));
    const impostorBefore = await balance(A.impostor);
    const wrong = await revertOf(A.seller, buildRelease(escrow, swappedId));
    assert.deepEqual([wrong.name, wrong.args[1]], ['InvalidState', '0'], 'release for the substituted id finds nothing funded');
    const stored = await trade(escrow, tradeId);
    assert.equal(stored.buyer, A.buyer); assert.equal(tradeMatchesTerms(stored, swapped), false, 'record does not match substituted terms');
    assert.equal((await trade(escrow, swappedId)).state, 'absent');
    await send(A.seller, buildRelease(escrow, tradeId));
    assert.equal(await balance(A.impostor), impostorBefore, 'impostor receives nothing');
    pass('negative: substituted buyer changes tradeId; release cannot apply to it and the bound buyer is paid');
  }

  // ---- 5. only the seller can release ----
  {
    const terms = clean(await makeTerms(domain, 'native', ZERO, WEI / 10n)), tradeId = negotiate(domain, terms);
    await send(A.seller, buildFundNative(domain, terms));
    assert.equal((await revertOf(A.buyer, buildRelease(escrow, tradeId))).name, 'Unauthorized', 'buyer cannot release');
    assert.equal((await revertOf(A.third, buildRelease(escrow, tradeId))).name, 'Unauthorized', 'third party cannot release');
    pass('negative: buyer and third party cannot release');
  }

  // ---- 6. reverting buyer: the buyer is a contract whose receive() rejects native payments ----
  {
    // A contract cannot produce an EOA acceptance signature, so the buyer is the mock's address and the buyer's
    // "signature" is a dev-key stand-in. verifyEoaAcceptance rejects it (the signer is not the contract), and
    // BasicEscrow never checks acceptance signatures at all: fund/release/withdraw take no signature. The proof
    // below is about payout only.
    const receiver = await deploy('test/mocks/Mocks.sol:RevertingReceiver');
    const amount = WEI / 4n;
    const terms = clean(await makeTerms(domain, 'native', ZERO, amount, receiver)), tradeId = evmTermsHash(domain, terms);
    assert.equal(verifyEoaAcceptance(domain, terms, 'seller', sign(KEYS.seller, tradeId)), true, 'seller acceptance verifies');
    assert.equal(verifyEoaAcceptance(domain, terms, 'buyer', sign(KEYS.buyer, tradeId)), false, 'a dev EOA signature does not verify for a contract buyer');
    assert.equal((await rpc('eth_call', [{ to: escrow, data: buildTradeIdOf(domain, terms).data }, 'latest'])).slice(2), tradeId, 'on-chain tradeId matches terms');
    const authority = authorityFor(escrow, binding(tradeId));
    await send(A.seller, buildFundNative(domain, terms));
    assert.equal(tradeMatchesTerms(await trade(escrow, tradeId), terms), true);
    await observe(authority, binding(tradeId), 'funded');

    const credit = async (account, token) => big(await rpc('eth_call', [{ to: escrow, data: buildPendingWithdrawals(escrow, account, token).data }, 'latest']));
    // Section 5 leaves a funded trade behind, so the escrow holds other principal: assert deltas from the funded balance.
    const receiverBefore = await balance(receiver), escrowBefore = await balance(escrow);
    await send(A.seller, buildRelease(escrow, tradeId));
    // The push to the reverting receiver fails inside settlement; the trade still settles and the principal is credited.
    assert.equal((await trade(escrow, tradeId)).state, 'released', 'release settles the trade despite the reverting buyer');
    assert.deepEqual(await logsOf(escrow, tradeId), ['Funded', 'Released', 'PayoutDeferred'], 'the failed push is recorded');
    assert.equal(await credit(receiver, ZERO), amount, 'escrow credited the buyer');
    assert.equal(await balance(receiver), receiverBefore, 'buyer balance unchanged by settlement');
    assert.equal(await balance(escrow), escrowBefore, 'principal stays in escrow as credit');
    await observe(authority, binding(tradeId), 'released');

    const rejected = await revertOf(A.third, buildWithdraw(escrow, receiver, ZERO));
    assert.equal(rejected.name, 'WithdrawalFailed', 'withdraw reverts while the receiver still rejects');
    assert.equal(await credit(receiver, ZERO), amount, 'credit intact after the failed withdraw');
    assert.equal(await balance(escrow), escrowBefore);
    assert.equal(await balance(receiver), receiverBefore);

    // The mock's accept flag can be toggled, so the same third-party withdraw now pays out.
    await send(A.seller, buildSetAccept(receiver, true));
    const thirdBefore = await balance(A.third);
    const paid = await send(A.third, buildWithdraw(escrow, receiver, ZERO));
    assert.equal(await balance(receiver), receiverBefore + amount, 'buyer paid the credited principal');
    assert.equal(await balance(escrow), escrowBefore - amount, 'escrow paid exactly the credit');
    assert.equal(await credit(receiver, ZERO), 0n, 'credit cleared');
    assert.equal(await balance(A.third), thirdBefore - paid.fee, 'third party pays only gas');
    const withdrawn = (await rpc('eth_getLogs', [{ address: escrow, fromBlock: '0x0', toBlock: 'latest' }]))
      .map(entry => decodeEscrowLog(escrow, entry)).filter(event => event.kind === 'Withdrawn');
    assert.deepEqual(withdrawn.map(({ recipient, caller, token, amount: paidAmount }) => [recipient, caller, token, paidAmount]), [[receiver, A.third, ZERO, String(amount)]]);
    assert.equal((await revertOf(A.third, buildWithdraw(escrow, receiver, ZERO))).name, 'NothingToWithdraw', 'a second withdraw finds no credit');
    pass('reverting buyer: release settles and credits the buyer; third-party withdraw reverts while rejecting, then pays after the receiver accepts');
  }
  console.log(`\n${results.length} local trade checks passed`);
}

let failed = false;
try { await main(); }
catch (error) { failed = true; console.error(error); }
finally {
  if (anvil && anvil.exitCode === null) {
    anvil.kill('SIGKILL');
    await new Promise(resolve => anvil.once('exit', resolve));
  }
}
process.exit(failed ? 1 : 0);
