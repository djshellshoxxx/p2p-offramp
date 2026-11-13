#!/usr/bin/env node
/**
 * DEV-ONLY differential qualification: the repo's hand-rolled read-only EvmChainReader (packages/chain-evm/src/reader.ts)
 * versus viem (pinned devDependency) on the SAME private-anvil state (loopback, public dev keys, no real funds).
 * viem is only an oracle here; it is never imported by packages/** or apps/**.
 * Run: npm run test:evm:viem  (needs Foundry: forge + anvil on PATH or ~/.foundry/bin)
 *
 * Known finding handled explicitly: the reader's read() issues `escrows(bytes32)` (the legacy packages/escrow-evm
 * layout seller,buyer,asset,amount,expiry,state) while contracts/evm BasicEscrow exposes `getTrade(bytes32)` with
 * (seller,deadline,state,buyer,token,amount). Check B1 asserts read() fails closed on the real contract; check B2
 * compares the reader's decoder with viem over a labelled layout shim so the decode path is still differentially tested.
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createPublicClient, decodeAbiParameters, encodeAbiParameters, http, keccak256 as viemKeccak, toFunctionSelector, TransactionReceiptNotFoundError } from 'viem';
import { EvmChainReader } from '../packages/chain-evm/src/reader.ts';
import { escrowCallFor } from '../packages/wallet/src/evm-submit.ts';
import { evmTermsHash, keccak256 } from '../packages/wallet/src/evm-terms.ts';
import { createViemReadRpc } from './test-support/viem-read-rpc.mjs';

const run = promisify(execFile);
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const EVM_DIR = fileURLToPath(new URL('../contracts/evm/', import.meta.url));
const ENV = { ...process.env, PATH: `${FOUNDRY}:${process.env.PATH ?? ''}` };
const SELLER_KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // anvil dev account 0 (public, worthless)
const ABI = JSON.parse(readFileSync(new URL('../contracts/evm/abi/BasicEscrow.json', import.meta.url), 'utf8'));
const GET_TRADE_ABI = ABI.filter(item => item.type === 'function' && item.name === 'getTrade');
assert.equal(GET_TRADE_ABI.length, 1, 'ABI has getTrade');
const STATES = ['absent', 'funded', 'released', 'refunded'];
const ZERO = `0x${'0'.repeat(40)}`;
const ESCROWS_SELECTOR = toFunctionSelector('escrows(bytes32)');
const GET_TRADE_SELECTOR = toFunctionSelector('getTrade(bytes32)');

let rpcUrl, rpcId = 0;
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
  const body = await response.json();
  if (body.error) throw Object.assign(new Error(`${method}: ${body.error.message}`), { code: body.error.code });
  return body.result;
}
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}
async function deploy(contract, args) {
  const { stdout } = await run('forge', ['create', contract, '--rpc-url', rpcUrl, '--private-key', `0x${SELLER_KEY}`, '--broadcast', '--json', ...(args ? ['--constructor-args', ...args] : [])],
    { cwd: EVM_DIR, env: ENV, maxBuffer: 1 << 24 });
  return JSON.parse(stdout.slice(stdout.indexOf('{'))).deployedTo.toLowerCase();
}
const mine = (blocks = 1) => rpc('anvil_mine', [`0x${blocks.toString(16)}`]);
const sha = label => createHash('sha256').update(label).digest('hex');
const hexOf = value => `0x${value.toString(16)}`;
const checks = [], findings = [];
const J = value => JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail: String(detail ?? '') }) }); console.error(`${ok ? 'ok' : 'FAIL'} - ${name}${ok ? '' : ` :: ${detail}`}`); };
const ctx = () => ({ generation: 1, requestSequence: 1, signal: new AbortController().signal });

async function sendTx(tx) { return rpc('eth_sendTransaction', [tx]); }
/** Mine until anvil's finalized tag covers `hash`'s block (one slot per epoch keeps finalized a few blocks behind latest). */
async function finalizeThrough(hash) {
  let receipt = null;
  for (let i = 0; i < 100 && !receipt; i++) { receipt = await rpc('eth_getTransactionReceipt', [hash]); if (!receipt) await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(receipt, 'tx mined');
  for (let i = 0; i < 40; i++) {
    const finalized = await rpc('eth_getBlockByNumber', ['finalized', false]);
    if (BigInt(finalized.number) >= BigInt(receipt.blockNumber)) return;
    await mine();
  }
  throw new Error('finalized tag never reached the tx block');
}

async function main() {
  const port = await freePort();
  rpcUrl = `http://127.0.0.1:${port}`;
  anvil = spawn(ANVIL, ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', '31337', '--slots-in-an-epoch', '1'], { env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });
  anvil.once('error', error => { throw error; });
  for (let attempt = 0; ; attempt++) {
    try { await rpc('eth_chainId'); break; } catch (error) { if (attempt > 100) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const [seller, buyer, third] = (await rpc('eth_accounts')).map(account => account.toLowerCase());
  const token = await deploy('test/mocks/Mocks.sol:MockERC20', ['Test USD', 'TUSD']);
  const escrow = await deploy('src/BasicEscrow.sol:BasicEscrow', [`[${token}]`]);
  const domain = { chainId: '31337', verifyingContract: escrow };

  // Registry for the local chain, same shape as scripts/test-evm-recovery-local.mjs / test-local-evm.mjs.
  const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
  const runtimeKeccak = Buffer.from(keccak256(Buffer.from((await rpc('eth_getCode', [escrow, 'latest'])).slice(2), 'hex'))).toString('hex');
  const makeRegistry = ({ chainIdentity = '31337', keccak = runtimeKeccak } = {}) => {
    const network = { id: 'local-evm', chain: 'evm', chainIdentity, genesisHash: genesis.hash, finality: { kind: 'evm-finalized-tag' }, assets: [{ id: 'native', kind: 'native', address: null }] };
    const deployment = { id: 'escrow-local-v1', address: escrow, runtime: { kind: 'evm-code', keccak256: keccak, upgradeable: false }, supportedAssetIds: ['native'] };
    return { network: id => id === 'local-evm' ? network : null, deployment: (n, id) => n === 'local-evm' && id === 'escrow-local-v1' ? deployment : null };
  };

  // viem client: retries/batching disabled so the reader's own bounded-read/timeout semantics are unchanged.
  const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 0, batch: false, timeout: 10_000 }) });
  const readerOver = (rpcImpl, registry = makeRegistry()) => new EvmChainReader({ rpc: rpcImpl, registry, timeoutMs: 15_000 });
  const viemRpc = createViemReadRpc(client);
  const reader = readerOver(viemRpc);

  const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const terms = { orderId: Buffer.from(keccak256(new TextEncoder().encode('viem-order'))).toString('hex'), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-local-v1',
    seller, buyer, assetKind: 'native', asset: ZERO, amountBaseUnits: String(10n ** 17n), privateAgreementHash: sha('viem-private'), capabilitiesHash: sha('viem-caps'),
    sellerNonce: Buffer.from(keccak256(new TextEncoder().encode('viem-nonce'))).toString('hex'), acceptBeforeSeconds: String(now + 3600), escrowExpirySeconds: String(now + 7200) };
  const tradeId = evmTermsHash(domain, terms);
  const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-local-v1', tradeId };
  const wanted = { seller, buyer, asset: ZERO, amountBaseUnits: terms.amountBaseUnits, expirySeconds: terms.escrowExpirySeconds };
  const fund = escrowCallFor({ action: 'fund', domain, terms }).call;
  const release = escrowCallFor({ action: 'release', escrow, tradeId }).call;
  const toTx = (call, from, extra = {}) => ({ from, to: call.to, data: call.data, value: hexOf(BigInt(call.value)), ...extra });
  const expectedTx = (call, hash, from, nonce) => ({ hash, from, to: call.to, data: call.data, value: call.value, nonce: String(nonce) });
  const viemTrade = async blockNumber => {
    const t = await client.readContract({ abi: GET_TRADE_ABI, address: escrow, functionName: 'getTrade', args: [`0x${tradeId}`], blockNumber });
    return { seller: t.seller.toLowerCase(), buyer: t.buyer.toLowerCase(), asset: t.token.toLowerCase(), amountBaseUnits: t.amount.toString(), expirySeconds: t.deadline.toString(), state: STATES[t.state] };
  };
  // Layout shim (labelled, B2): answer the reader's escrows(bytes32) from getTrade via viem's own ABI encoder.
  const shimRpc = { async request(input) {
    if (input.method === 'eth_call' && String(input.params?.[0]?.data).startsWith(ESCROWS_SELECTOR)) {
      const call = { ...input.params[0], data: `${GET_TRADE_SELECTOR}${input.params[0].data.slice(10)}` };
      const raw = await viemRpc.request({ ...input, params: [call, input.params[1]] });
      const [t] = decodeAbiParameters([{ type: 'tuple', components: [{ type: 'address' }, { type: 'uint64' }, { type: 'uint8' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }] }], raw);
      return encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'uint8' }], [t[0], t[3], t[4], t[5], t[1], t[2]]);
    }
    return viemRpc.request(input);
  } };
  const shimReader = readerOver(shimRpc);

  await mine(4); // finalize the deployment before the first live validation
  // ---- c) chain id and live validation ----
  const viemChain = await client.getChainId();
  const live = await reader.validateLive('local-evm', 'escrow-local-v1', ctx().signal);
  check('c) chain id: viem getChainId == registry chainIdentity and validateLive ok', viemChain === 31337 && live.ok, J(live));

  // ---- fund (native), finalize ----
  const fundHash = await sendTx(toTx(fund, seller));
  const fundNonce = BigInt((await rpc('eth_getTransactionByHash', [fundHash])).nonce);
  await finalizeThrough(fundHash);
  const anchor = (await reader.validateLive('local-evm', 'escrow-local-v1')).value;
  const viemFinalized = await client.getBlock({ blockTag: 'finalized' });
  check('c) finalized anchor: reader validateLive anchor == viem finalized block (height/hash/timestamp)',
    anchor.height === viemFinalized.number.toString() && anchor.hash === viemFinalized.hash && anchor.timestampSeconds === viemFinalized.timestamp.toString(), J({ anchor, viem: [viemFinalized.number, viemFinalized.hash] }));
  const viemCode = await client.getCode({ address: escrow, blockNumber: viemFinalized.number });
  check('c) runtime code keccak: reader anchor == viem keccak256(getCode)', anchor.codeKeccak256 === viemKeccak(viemCode).slice(2), anchor.codeKeccak256);

  // ---- B1: read() on the real contracts/evm BasicEscrow must fail closed (escrows(bytes32) does not exist there) ----
  const direct = await reader.read(binding, ctx(), wanted);
  const incompatible = direct.ok === false;
  if (incompatible) findings.push({ id: 'READER_SELECTOR_MISMATCH', detail: 'reader.read() calls escrows(bytes32); contracts/evm BasicEscrow exposes getTrade(bytes32) with a different word order; read() returns ' + direct.error.code });
  check('B1) reader.read() on contracts/evm BasicEscrow fails closed (known selector/layout mismatch, reported)', incompatible, J(direct));

  // ---- a) read(): decoded escrow vs viem readContract at the same finalized block (layout shim) ----
  const viemFunded = await viemTrade(viemFinalized.number);
  const shimmed = await shimReader.read(binding, ctx(), wanted);
  check('a) funded: reader.read (shim) decoded escrow == viem readContract getTrade @finalized', shimmed.ok && J(shimmed.value.escrow) === J(viemFunded) && viemFunded.state === 'funded' && shimmed.value.observation.anchor.height === anchor.height,
    J({ reader: shimmed.value?.escrow ?? shimmed.error, viem: viemFunded }));
  check('a) funded fields match the submitted terms', viemFunded.seller === seller && viemFunded.buyer === buyer && viemFunded.asset === ZERO && viemFunded.amountBaseUnits === terms.amountBaseUnits && viemFunded.expirySeconds === terms.escrowExpirySeconds, J(viemFunded));

  // ---- b) receipt(): reader vs viem getTransactionReceipt + getTransaction ----
  const compareReceipt = async (label, hash, call, from, nonce, expectKind, expectSucceeded) => {
    const observed = await reader.receipt(binding, expectedTx(call, hash, from, nonce), ctx().signal);
    const vr = await client.getTransactionReceipt({ hash }), vt = await client.getTransaction({ hash });
    const same = observed.ok && observed.value.kind === expectKind && observed.value.succeeded === expectSucceeded && (vr.status === 'success') === expectSucceeded
      && observed.value.nonce === String(vt.nonce) && observed.value.anchor.height === vr.blockNumber.toString() && observed.value.anchor.hash === vr.blockHash
      && vt.blockHash === vr.blockHash && vt.input === call.data && vt.to?.toLowerCase() === call.to && vt.from.toLowerCase() === from;
    check(`b) ${label}`, same, J({ reader: observed.value ?? observed.error, viem: { status: vr.status, nonce: vt.nonce, block: vr.blockNumber, hash: vr.blockHash } }));
    return { observed, vr, vt };
  };
  await compareReceipt('fund receipt finalized: status/nonce/anchor match viem', fundHash, fund, seller, fundNonce, 'finalized', true);

  // ---- d) reverted tx: second fund of the same trade (TradeIdUsed) ----
  const refundedHash = await sendTx(toTx(fund, seller, { gas: '0x7a120' }));
  await finalizeThrough(refundedHash);
  const revertNonce = BigInt((await rpc('eth_getTransactionByHash', [refundedHash])).nonce);
  const reverted = await compareReceipt('d) reverted duplicate fund: viem status "reverted" and reader succeeded === false', refundedHash, fund, seller, revertNonce, 'finalized', false);
  check('d) viem reports status reverted', reverted.vr.status === 'reverted', reverted.vr.status);

  // ---- e) missing hash ----
  const missing = `0x${'ab'.repeat(32)}`;
  const unknown = await reader.receipt(binding, expectedTx(fund, missing, seller, 0), ctx().signal);
  let viemMissing = false; try { await client.getTransactionReceipt({ hash: missing }); } catch (error) { viemMissing = error instanceof TransactionReceiptNotFoundError; }
  check('e) missing hash: reader kind unknown and viem throws TransactionReceiptNotFoundError', unknown.ok && unknown.value.kind === 'unknown' && unknown.value.succeeded === null && viemMissing, J(unknown));

  // ---- f) wrong chain / g) wrong code ----
  const wrongChain = await readerOver(viemRpc, makeRegistry({ chainIdentity: '1' })).validateLive('local-evm', 'escrow-local-v1');
  check('f) wrong chain identity in registry -> WRONG_CHAIN', !wrongChain.ok && wrongChain.error.code === 'WRONG_CHAIN', J(wrongChain));
  const wrongCode = await readerOver(viemRpc, makeRegistry({ keccak: 'ee'.repeat(32) })).validateLive('local-evm', 'escrow-local-v1');
  check('g) wrong runtime keccak in registry -> INTEGRITY_FAILURE', !wrongCode.ok && wrongCode.error.code === 'INTEGRITY_FAILURE', J(wrongCode));

  // ---- h) pending: release mined after the finalized anchor ----
  const buyerBefore = BigInt(await rpc('eth_getBalance', [buyer, 'latest']));
  const releaseHash = await sendTx(toTx(release, seller));
  const releaseNonce = BigInt((await rpc('eth_getTransactionByHash', [releaseHash])).nonce);
  const pending = await compareReceipt('h) release mined after finalized anchor reports pending (viem sees success)', releaseHash, release, seller, releaseNonce, 'pending', true);
  const stillFunded = await shimReader.read(binding, ctx(), wanted);
  check('h) finalized snapshot still funded while release is pending', stillFunded.ok && stillFunded.value.escrow.state === 'funded', J(stillFunded));
  assert.ok(pending);

  // ---- release finalized: compare again ----
  await finalizeThrough(releaseHash);
  const finalAnchor = await client.getBlock({ blockTag: 'finalized' });
  const viemReleased = await viemTrade(finalAnchor.number);
  const readerReleased = await shimReader.read(binding, ctx(), wanted);
  check('a) released: reader.read (shim) decoded escrow == viem getTrade @finalized, state released', readerReleased.ok && viemReleased.state === 'released' && J(readerReleased.value.escrow) === J(viemReleased) && readerReleased.value.observation.anchor.hash === finalAnchor.hash,
    J({ reader: readerReleased.value?.escrow ?? readerReleased.error, viem: viemReleased }));
  await compareReceipt('release receipt finalized: status/nonce/anchor match viem', releaseHash, release, seller, releaseNonce, 'finalized', true);
  check('release paid buyer exactly the escrowed amount (viem getBalance delta)', BigInt(await client.getBalance({ address: buyer })) === buyerBefore + BigInt(terms.amountBaseUnits), 'buyer balance delta mismatch');
  void third;
  reader.dispose(); shimReader.dispose();
}

let anvil, failed = false;
try { await main(); }
catch (error) { failed = true; console.error(error); checks.push({ name: 'unexpected error', ok: false, detail: String(error?.message ?? error) }); }
finally {
  if (anvil && anvil.exitCode === null) { anvil.kill('SIGKILL'); await new Promise(resolve => anvil.once('exit', resolve)); }
}
const mismatches = checks.filter(entry => !entry.ok);
console.log(JSON.stringify({ script: 'test-evm-viem-oracle-local', viem: '2.57.10', checks: checks.length, passed: checks.length - mismatches.length, mismatches, findings, ok: !failed && mismatches.length === 0 }));
process.exit(!failed && mismatches.length === 0 ? 0 : 1);
