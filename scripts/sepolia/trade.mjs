#!/usr/bin/env node
/**
 * Two-party Sepolia trade proof (G25; lean-scope "offer -> accept -> fund -> settle/refund on a test network").
 * Runs two native trades against the deployment named in the (owner-signed) Sepolia registry:
 *   - "release": offer -> both parties sign the G16 terms -> seller funds -> seller releases -> buyer is paid;
 *   - "refund":  offer -> sign -> fund -> chain clock passes the deadline -> refund to the seller.
 * Every step is verified from chain state (escrow events, getTrade, balances at the receipt block) and through the
 * domain trade authority. Replay (same trade id, reused seller nonce), amount and expiry controls are exercised with
 * eth_call so they cost nothing. The run is RESUMABLE: terms and signatures are written to the state file before any
 * transaction, and each run reconciles from chain state first (a crash after broadcast is recovered from the logs).
 * The state file is an editable document: on resume every negotiated trade is re-checked (parties, deployment, amount,
 * the app terms review, termsHash and both acceptance signatures) before any transaction is built from it, and the
 * amount comes from this invocation (--amount-wei, default 1e14 wei), never from the file.
 * The refund trade cannot settle before MIN_DURATION (30 min) after funding: rerun later, or pass --wait.
 *
 * Keys: SEPOLIA_SELLER_PRIVATE_KEY (or SEPOLIA_DEPLOYER_PRIVATE_KEY) sends every transaction through Forge;
 * SEPOLIA_BUYER_PRIVATE_KEY only signs the off-chain acceptance and needs no ETH. Keys are held in memory only and are
 * never logged or written. RPC: SEPOLIA_RPC_URL (never logged).
 *
 *   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/trade.mjs --run <id> [--amount-wei N] [--wait] [--wait-finalized]
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { RegistryService, reviewTermsBytes, encodePrivateAgreement, encodeCapabilities, sha256Hex, checkFundingWindow, TERMS_REVIEW_FORMAT } from '../../packages/domain/index.ts';
import { createTradeAuthority } from '../../packages/domain/src/authority.ts';
import { evmTermsHash, verifyEoaAcceptance } from '../../packages/wallet/src/evm-terms.ts';
import {
  buildChainObservation, buildFundNative, buildGetTrade, buildRefund, buildRelease, buildTradeIdOf, decodeEscrowLog, decodeEscrowRevert, decodeTrade, tradeMatchesTerms,
} from '../../packages/wallet/src/evm-escrow.ts';
import { chainIdentity, hexToBytes, keccakHex, ROOT, rpcClient, SEPOLIA, sha256Hex as sha } from './lib.mjs';
import { REGISTRY_ASSET } from './owner-release.mjs';
import { loadVerifiedRegistry } from './verify-release.mjs';
import { sellerKeyEnv, sendAsSeller } from './send.mjs';

export const NETWORK_ID = 'sepolia', DEPLOYMENT_ID = 'escrow-sepolia-v1';
const ZERO = `0x${'0'.repeat(40)}`;
const MIN_DURATION = 1800; // BasicEscrow.MIN_DURATION and trade-terms MIN_ESCROW_SECONDS
export class TradeError extends Error { constructor(code) { super(code); this.name = 'TradeError'; this.code = code; } }
const fail = code => { throw new TradeError(code); };
const hex = bytes => Buffer.from(bytes).toString('hex');
const qty = value => `0x${BigInt(value).toString(16)}`;

function keyFromEnv(value, code) {
  if (!/^(0x)?[0-9a-f]{64}$/i.test(value ?? '')) fail(code);
  return hexToBytes(value.toLowerCase());
}
const addressOf = key => `0x${keccakHex(secp256k1.getPublicKey(key, false).subarray(1)).slice(24)}`;
/** 65-byte r||s||v (v = 27/28), low-s, over the 32-byte G16 termsHash (no prehash): the EOA acceptance format. */
function signDigest(key, digestHex) {
  const raw = secp256k1.sign(hexToBytes(digestHex), key, { prehash: false, format: 'recovered', lowS: true });
  return Uint8Array.from([...raw.subarray(1), raw[0] + 27]);
}

async function loadTrust({ root, requireSignedRegistry, nowSeconds, expectGenesis }) {
  const registryBytes = new Uint8Array(await readFile(resolve(root, REGISTRY_ASSET)));
  let signed;
  try { signed = await loadVerifiedRegistry({ root, expectGenesis, ...(nowSeconds ? { nowSeconds } : {}) }); }
  catch (error) { signed = { ok: false, error: { code: error?.code === 'ENOENT' ? 'RELEASE_MISSING' : 'RELEASE_UNREADABLE' } }; }
  if (signed.ok) return { lookup: signed.value.registry, trust: { verified: true, keyId: signed.value.keyId, sequence: signed.value.sequence, manifestSha256: signed.value.manifestSha256 } };
  if (requireSignedRegistry) fail(`REGISTRY_NOT_VERIFIED_${signed.error.code}`);
  const service = new RegistryService();
  const loaded = await service.load(registryBytes, sha(registryBytes));
  if (!loaded.ok) fail('REGISTRY_INVALID');
  return { lookup: service, trust: { verified: false, reason: signed.error.code } };
}

async function saveState(path, state) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n');
  await rename(temporary, path);
}

export async function runTrades({
  env = process.env, root = ROOT, run, statePath, amountWei = 10n ** 14n, expectGenesis = SEPOLIA.genesisHash, requireSignedRegistry = true,
  wait = false, waitFinalized = false, maxWaitSeconds = 3600, pollSeconds = 15, advanceTime, nowSeconds, log = () => {},
  /** Test hook: runs before each funding decision (the local proof uses it to let an acceptance window lapse). */
  beforeFund,
}) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(run ?? '')) fail('RUN_ID_INVALID');
  const path = statePath ?? resolve(root, 'docs/deployments/sepolia/trades', `${run}.json`);
  const rpc = rpcClient(env.SEPOLIA_RPC_URL);
  const identity = await chainIdentity(rpc);
  if (identity.chainId !== SEPOLIA.chainId) fail('WRONG_CHAIN');
  if (identity.genesisHash !== expectGenesis) fail('WRONG_GENESIS');

  const { lookup, trust } = await loadTrust({ root, requireSignedRegistry, nowSeconds, expectGenesis });
  const network = lookup.network(NETWORK_ID), deployment = lookup.deployment(NETWORK_ID, DEPLOYMENT_ID);
  if (!network || !deployment || network.chainIdentity !== SEPOLIA.chainId.toString() || network.genesisHash !== identity.genesisHash) fail('REGISTRY_NETWORK_MISMATCH');
  if (!deployment.supportedAssetIds.includes('native')) fail('REGISTRY_ASSET_UNSUPPORTED');
  const escrow = deployment.address;
  const code = hexToBytes(await rpc('eth_getCode', [escrow, 'latest']));
  if (code.length === 0 || keccakHex(code) !== deployment.runtime.keccak256) fail('ESCROW_CODE_MISMATCH');
  const record = JSON.parse(await readFile(resolve(root, 'docs/deployments/sepolia', `BasicEscrow-${escrow}.json`), 'utf8'));
  if (record.contractAddress !== escrow || record.codeDigest?.runtime !== deployment.runtime.keccak256) fail('DEPLOYMENT_RECORD_MISMATCH');
  const fromBlock = qty(record.deployBlock);

  const sellerKey = keyFromEnv(sellerKeyEnv(env), 'SELLER_KEY_MISSING'), buyerKey = keyFromEnv(env.SEPOLIA_BUYER_PRIVATE_KEY, 'BUYER_KEY_MISSING');
  const seller = addressOf(sellerKey), buyer = addressOf(buyerKey);
  if (seller === buyer) fail('BUYER_EQUALS_SELLER');
  const domain = { chainId: SEPOLIA.chainId.toString(), verifyingContract: escrow };

  /** A stored trade must be exactly what both keys accepted for this deployment and amount. */
  async function checkStoredTrade(trade) {
    const { terms, privateAgreement, acceptance } = trade ?? {};
    if (!terms || !privateAgreement || !acceptance || terms.seller !== seller || terms.buyer !== buyer || terms.networkId !== NETWORK_ID ||
        terms.deploymentId !== DEPLOYMENT_ID || terms.assetKind !== 'native' || terms.asset !== ZERO || terms.amountBaseUnits !== amountWei.toString()) fail('STATE_MISMATCH');
    const reviewed = await reviewTermsBytes(lookup, new TextEncoder().encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms, privateAgreement })));
    let accepted = false;
    try {
      accepted = reviewed.ok && evmTermsHash(domain, terms) === trade.tradeId &&
        verifyEoaAcceptance(domain, terms, 'seller', hexToBytes(acceptance.seller)) && verifyEoaAcceptance(domain, terms, 'buyer', hexToBytes(acceptance.buyer));
    } catch { accepted = false; }
    if (!accepted) fail('STATE_MISMATCH');
  }

  let state;
  try { state = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; state = null; }
  if (state) {
    if (state.escrow !== escrow || state.seller !== seller || state.buyer !== buyer || state.genesisHash !== identity.genesisHash ||
        state.amountWei !== amountWei.toString() || !Array.isArray(state.trades)) fail('STATE_MISMATCH');
    for (const trade of state.trades) if (trade?.status !== 'planned') await checkStoredTrade(trade);
  } else {
    state = { format: 'p2p-offramp/sepolia-trade-run/v1', run, network: NETWORK_ID, chainId: domain.chainId, genesisHash: identity.genesisHash, escrow,
      runtimeKeccak: deployment.runtime.keccak256, deploymentRecord: `docs/deployments/sepolia/BasicEscrow-${escrow}.json`, registryTrust: trust, seller, buyer,
      amountWei: amountWei.toString(), releaseEnabled: 0,
      trades: [{ label: 'release', status: 'planned', checks: [] }, { label: 'refund', status: 'planned', checks: [] }] };
    await saveState(path, state);
  }
  state.registryTrust = trust;

  const chainTime = async () => Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const balanceAt = async (account, block) => BigInt(await rpc('eth_getBalance', [account, qty(block)]));
  /** eth_call as the seller; returns the decoded escrow error, or fails when the call does not revert. */
  async function revertOf(call) {
    try { await rpc('eth_call', [{ from: seller, to: call.to, data: call.data, value: qty(call.value) }, 'latest']); }
    catch (error) {
      // The read-only client hides node messages, so re-ask with a raw request to read the revert data.
      const response = await fetch(env.SEPOLIA_RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ from: seller, to: call.to, data: call.data, value: qty(call.value) }, 'latest'] }) });
      const data = (await response.json())?.error?.data;
      if (typeof data !== 'string') fail('REVERT_DATA_MISSING');
      return decodeEscrowRevert(data);
    }
    return fail('EXPECTED_REVERT');
  }
  const expectRevert = async (trade, call, name, label) => {
    const reverted = await revertOf(call);
    if (reverted.name !== name) fail(`UNEXPECTED_REVERT_${reverted.name}`);
    trade.checks.push(`${label}: reverts ${name}`);
  };
  async function tradeLogs(tradeId) {
    const logs = await rpc('eth_getLogs', [{ address: escrow, fromBlock, toBlock: 'latest', topics: [null, `0x${tradeId}`] }]);
    return logs.map(entry => ({ ...decodeEscrowLog(escrow, entry), tx: entry.transactionHash, block: BigInt(entry.blockNumber).toString() }));
  }
  const binding = tradeId => ({ chain: 'evm', networkId: NETWORK_ID, deploymentId: DEPLOYMENT_ID, tradeId });
  async function observe(trade) {
    const authority = createTradeAuthority({ binding: binding(trade.tradeId), generation: 0, walletGeneration: 0,
      readValidated: async (_binding, request) => {
        const block = await rpc('eth_getBlockByNumber', ['latest', false]);
        const logs = await rpc('eth_getLogs', [{ address: escrow, fromBlock, toBlock: block.number, topics: [null, `0x${trade.tradeId}`] }]);
        const getTradeReturn = await rpc('eth_call', [{ to: escrow, data: buildGetTrade(escrow, trade.tradeId).data }, block.number]);
        return { ok: true, value: buildChainObservation(escrow, { binding: binding(trade.tradeId), generation: request.generation, requestSequence: request.requestSequence,
          getTradeReturn, logs, anchor: { height: String(BigInt(block.number)), hash: block.hash }, finality: 'confirmed', observedAt: Date.now() }) };
      } });
    const result = await authority.refresh(binding(trade.tradeId));
    authority.dispose?.();
    if (!result.ok) fail('OBSERVATION_REJECTED');
    const observed = result.value.state;
    trade.observations = [...(trade.observations ?? []), { state: observed, height: result.value.anchor?.height ?? null }].slice(-12);
    return observed;
  }

  async function negotiate(trade) {
    const now = await chainTime();
    const orderId = hex(randomBytes(32));
    const agreement = { v: 1, orderId, revision: '1', fiatCurrency: 'EUR', fiatMinorUnits: '100', fiatScale: 2,
      paymentInstructions: 'SEPOLIA TESTNET PROOF. No fiat payment is made or expected.', capabilities: [], agreementSalt: hex(randomBytes(32)) };
    const expiry = trade.label === 'release' ? now + 7200 : now + MIN_DURATION + 900;
    const terms = { orderId, revision: '1', networkId: NETWORK_ID, deploymentId: DEPLOYMENT_ID, seller, buyer, assetKind: 'native', asset: ZERO,
      amountBaseUnits: amountWei.toString(), privateAgreementHash: await sha256Hex(encodePrivateAgreement(agreement)), capabilitiesHash: await sha256Hex(encodeCapabilities([])),
      sellerNonce: hex(randomBytes(32)), acceptBeforeSeconds: String(now + 900), escrowExpirySeconds: String(expiry) };
    // The app's own terms review must accept exactly these terms against the verified registry.
    const document = { format: TERMS_REVIEW_FORMAT, terms, privateAgreement: agreement };
    const reviewed = await reviewTermsBytes(lookup, new TextEncoder().encode(JSON.stringify(document)));
    if (!reviewed.ok) fail(`TERMS_REVIEW_${reviewed.code}`);
    const tradeId = evmTermsHash(domain, terms);
    const sellerSig = signDigest(sellerKey, tradeId), buyerSig = signDigest(buyerKey, tradeId);
    if (!verifyEoaAcceptance(domain, terms, 'seller', sellerSig) || !verifyEoaAcceptance(domain, terms, 'buyer', buyerSig)) fail('ACCEPTANCE_INVALID');
    if (verifyEoaAcceptance(domain, terms, 'buyer', sellerSig)) fail('ACCEPTANCE_ROLE_CONFUSION');
    // Acceptance is bound to this chain and this deployment: it must not verify anywhere else.
    if (verifyEoaAcceptance({ ...domain, chainId: '1' }, terms, 'buyer', buyerSig) ||
        verifyEoaAcceptance({ ...domain, verifyingContract: `0x${'11'.repeat(20)}` }, terms, 'buyer', buyerSig)) fail('ACCEPTANCE_NOT_BOUND');
    const onChainId = (await rpc('eth_call', [{ to: escrow, data: buildTradeIdOf(domain, terms).data }, 'latest'])).slice(2);
    if (onChainId !== tradeId) fail('TRADE_ID_MISMATCH');
    Object.assign(trade, { status: 'negotiated', terms, privateAgreement: agreement, tradeId, acceptance: { seller: hex(sellerSig), buyer: hex(buyerSig) } });
    trade.checks.push('terms pass the app terms review against the registry', 'seller and buyer acceptances verify; not across roles, chains or deployments', 'on-chain tradeIdOf equals the off-chain termsHash');
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(resolve(path, '..', `${run}.${trade.label}.terms-review.json`), JSON.stringify(document, null, 2) + '\n');
  }

  async function fund(trade) {
    checkFundingWindow(trade.terms.acceptBeforeSeconds, trade.terms.escrowExpirySeconds, String(await chainTime()));
    const call = buildFundNative(domain, trade.terms);
    if (call.tradeId !== trade.tradeId) fail('FUND_CALL_MISMATCH');
    await expectRevert(trade, { ...call, value: (BigInt(call.value) - 1n).toString() }, 'IncorrectDeposit', 'amount control (one wei short)');
    trade.fund = { requestedAt: new Date().toISOString(), tx: null }; await saveState(path, state);
    const sent = await sendAsSeller({ env, rpc, call, seller });
    trade.fund = { ...trade.fund, tx: sent.hash, block: sent.block.toString(), fee: sent.fee.toString() }; await saveState(path, state);
  }

  async function verifyFunded(trade) {
    const onChain = decodeTrade(await rpc('eth_call', [{ to: escrow, data: buildGetTrade(escrow, trade.tradeId).data }, 'latest']));
    if (!tradeMatchesTerms(onChain, trade.terms)) fail('ESCROW_TERMS_MISMATCH');
    const funded = (await tradeLogs(trade.tradeId)).find(event => event.kind === 'Funded');
    if (!funded || funded.seller !== seller || funded.buyer !== buyer || funded.token !== ZERO || funded.amount !== trade.terms.amountBaseUnits || funded.deadline !== trade.terms.escrowExpirySeconds) fail('FUNDED_EVENT_MISMATCH');
    trade.fund = { ...(trade.fund ?? {}), tx: trade.fund?.tx ?? funded.tx, block: trade.fund?.block ?? funded.block };
    if (!trade.checks.includes('escrow record and Funded event match the signed terms')) {
      trade.checks.push('escrow record and Funded event match the signed terms');
      await expectRevert(trade, buildFundNative(domain, trade.terms), 'TradeIdUsed', 'replay: funding the same terms again');
      const reused = { ...trade.terms, orderId: hex(randomBytes(32)) };
      await expectRevert(trade, buildFundNative(domain, reused), 'SellerNonceUsed', 'replay: new terms reusing the seller nonce');
    }
  }

  async function settle(trade) {
    const deadline = Number(trade.terms.escrowExpirySeconds);
    if (trade.label === 'release') {
      const sent = await sendAsSeller({ env, rpc, call: buildRelease(escrow, trade.tradeId), seller });
      trade.settle = { kind: 'release', tx: sent.hash, block: sent.block.toString(), fee: sent.fee.toString() };
      const paid = (await balanceAt(buyer, sent.block)) - (await balanceAt(buyer, sent.block - 1n));
      if (paid !== BigInt(trade.terms.amountBaseUnits)) fail('BUYER_NOT_PAID_EXACTLY');
      trade.checks.push('buyer balance rose by exactly the principal in the release block');
      return;
    }
    let now = await chainTime();
    if (now < deadline) {
      if (!trade.checks.some(check => check.startsWith('expiry control (before deadline)'))) await expectRevert(trade, buildRefund(escrow, trade.tradeId), 'DeadlineNotReached', 'expiry control (before deadline): refund');
      if (!wait) { trade.status = 'awaiting-deadline'; trade.refundableAt = new Date(deadline * 1000).toISOString(); return; }
      const started = now;
      while (now < deadline) {
        if (now - started > maxWaitSeconds) { trade.status = 'awaiting-deadline'; trade.refundableAt = new Date(deadline * 1000).toISOString(); return; }
        log(`refund trade: waiting for chain time ${deadline} (now ${now})`);
        if (advanceTime) await advanceTime(Math.min(deadline - now + 1, 600)); else await new Promise(done => setTimeout(done, pollSeconds * 1000));
        now = await chainTime();
      }
    }
    await expectRevert(trade, buildRelease(escrow, trade.tradeId), 'DeadlinePassed', 'expiry control (after deadline): release');
    const sent = await sendAsSeller({ env, rpc, call: buildRefund(escrow, trade.tradeId), seller });
    trade.settle = { kind: 'refund', tx: sent.hash, block: sent.block.toString(), fee: sent.fee.toString() };
    const back = (await balanceAt(seller, sent.block)) - (await balanceAt(seller, sent.block - 1n));
    if (back !== BigInt(trade.terms.amountBaseUnits) - sent.fee) fail('SELLER_NOT_REFUNDED_EXACTLY');
    trade.checks.push('seller balance rose by exactly the principal minus the refund fee in the refund block');
  }

  async function verifySettled(trade, observed) {
    const events = await tradeLogs(trade.tradeId);
    const kind = observed === 'released' ? 'Released' : 'Refunded';
    const event = events.find(entry => entry.kind === kind);
    if (!event || event.amount !== trade.terms.amountBaseUnits || event.token !== ZERO) fail(`${kind.toUpperCase()}_EVENT_MISMATCH`);
    if (kind === 'Released' && event.buyer !== buyer) fail('RELEASED_TO_WRONG_BUYER');
    if (kind === 'Refunded' && event.seller !== seller) fail('REFUNDED_TO_WRONG_SELLER');
    if (events.some(entry => entry.kind === 'PayoutDeferred')) fail('PAYOUT_DEFERRED_UNEXPECTEDLY');
    trade.settle = { ...(trade.settle ?? { kind: observed === 'released' ? 'release' : 'refund' }), tx: trade.settle?.tx ?? event.tx, block: trade.settle?.block ?? event.block };
    if (!trade.checks.includes(`${kind} event pays the right party the exact principal`)) {
      trade.checks.push(`${kind} event pays the right party the exact principal`);
      await expectRevert(trade, buildRelease(escrow, trade.tradeId), 'InvalidState', 'settled trade: release again');
      await expectRevert(trade, buildRefund(escrow, trade.tradeId), 'InvalidState', 'settled trade: refund again');
    }
    trade.status = observed;
  }

  for (const trade of state.trades) {
    if (trade.status === 'released' || trade.status === 'refunded' || trade.status === 'expired-unfunded') continue;
    if (trade.status === 'planned') { await negotiate(trade); await saveState(path, state); }
    let observed = await observe(trade);
    if (observed === 'absent') {
      if (beforeFund) await beforeFund(trade);
      if (await chainTime() >= Number(trade.terms.acceptBeforeSeconds)) {
        // The acceptance window closed before funding (for example a long interruption): an honest terminal outcome.
        trade.status = 'expired-unfunded'; await saveState(path, state); continue;
      }
      log(`${trade.label} trade: funding`);
      try { await fund(trade); } catch (error) { if (error?.code !== 'SIMULATION_REVERTED') throw error; }
      observed = await observe(trade);
      if (observed === 'absent') fail('FUND_NOT_OBSERVED');
    }
    if (observed === 'funded') {
      await verifyFunded(trade); trade.status = 'funded'; await saveState(path, state);
      log(`${trade.label} trade: settling`);
      try { await settle(trade); } catch (error) { if (error?.code !== 'SIMULATION_REVERTED') throw error; }
      await saveState(path, state);
      observed = await observe(trade);
    }
    if (observed === 'released' || observed === 'refunded') {
      if ((trade.label === 'release') !== (observed === 'released')) fail('UNEXPECTED_SETTLEMENT');
      await verifyFunded(trade); await verifySettled(trade, observed);
    }
    await saveState(path, state);
  }

  // Finality of every recorded transaction (Sepolia finalizes roughly 13-15 minutes after inclusion).
  const finalizedNumber = async () => { const block = await rpc('eth_getBlockByNumber', ['finalized', false]).catch(() => null); return block?.number ? BigInt(block.number) : -1n; };
  const blocks = state.trades.flatMap(trade => [trade.fund?.block, trade.settle?.block]).filter(Boolean).map(BigInt);
  let finalized = await finalizedNumber();
  const started = Date.now();
  while (waitFinalized && blocks.some(block => block > finalized) && Date.now() - started < maxWaitSeconds * 1000) {
    log('waiting for finality');
    await new Promise(done => setTimeout(done, pollSeconds * 1000));
    finalized = await finalizedNumber();
  }
  state.finality = { finalizedBlock: finalized.toString(), allFinalized: blocks.length > 0 && blocks.every(block => block <= finalized) };
  await saveState(path, state);
  sellerKey.fill(0); buyerKey.fill(0);
  return { state, path };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { run: { type: 'string' }, 'amount-wei': { type: 'string' }, wait: { type: 'boolean' }, 'wait-finalized': { type: 'boolean' } } });
  try {
    const { state, path } = await runTrades({ run: values.run, ...(values['amount-wei'] ? { amountWei: BigInt(values['amount-wei']) } : {}),
      wait: Boolean(values.wait), waitFinalized: Boolean(values['wait-finalized']), log: message => console.error(message) });
    console.log(JSON.stringify({ ok: true, state: path, trades: state.trades.map(trade => ({ label: trade.label, status: trade.status, tradeId: trade.tradeId, fund: trade.fund?.tx ?? null, settle: trade.settle?.tx ?? null })), finality: state.finality }));
  } catch (error) { console.error(JSON.stringify({ ok: false, code: error?.code ?? 'FAILED' })); process.exitCode = 1; }
}
