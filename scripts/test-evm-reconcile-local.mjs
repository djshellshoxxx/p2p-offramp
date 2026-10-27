#!/usr/bin/env node
/**
 * LOCAL/TEST G12 reconciliation evidence against a real BasicEscrow on a private anvil (loopback, dev accounts,
 * no real funds). The submit path is packages/domain/src/tx-lifecycle.ts with the EIP-1193 reader and calldata from
 * packages/wallet/src/evm-submit.ts; the journal is the encrypted G02 vault over a file-backed store, so it survives
 * a real process kill. Cases:
 *   1. unknown outcome: a child "client" process records send-started, its wallet broadcasts, and the child is
 *      SIGKILLed before the hash returns; a fresh process reconciles to confirmed and then finalized.
 *   2. replaced: a higher-gas same-nonce transaction from the same dev account replaces the pending fund; the
 *      intent reconciles to replaced and an explicit successor at the next nonce confirms.
 *   3. dropped: the pending fund is removed from anvil's pool; past the expiry it reconciles to dropped and a
 *      same-nonce successor confirms.
 *   4. receipt path: fund -> finalized, then release through the lifecycle -> confirmed.
 * Run: npm run test:evm:reconcile  (needs Foundry in ~/.foundry/bin or on PATH).
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { EncryptedVaultService } from '../packages/storage/src/vault-service.ts';
import { VaultStorageError } from '../packages/storage/src/idb-vault-store.ts';
import { createLifecycleJournal } from '../packages/domain/src/intent-journal.ts';
import { createEvmTxLifecycle, evmFinalityPolicy } from '../packages/domain/src/tx-lifecycle.ts';
import { createEip1193ChainReader, escrowCallFor } from '../packages/wallet/src/evm-submit.ts';
import { evmTermsHash, keccak256 } from '../packages/wallet/src/evm-terms.ts';

const run = promisify(execFile);
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const EVM_DIR = fileURLToPath(new URL('../contracts/evm/', import.meta.url));
const ENV = { ...process.env, PATH: `${FOUNDRY}:${process.env.PATH ?? ''}` };
// Anvil's documented deterministic development accounts (public, worthless): 0 seller, 1 buyer, 2 third party.
const SELLER_KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const PASS = 'local reconcile fixture passphrase';
const POLICY = evmFinalityPolicy({ chain: 'evm', finality: { kind: 'evm-finalized-tag' } }, 2, 3);

/** File-backed G02 envelope store: atomic rename + fsync, so a SIGKILLed writer leaves the last committed envelope. */
class FileStore {
  constructor(path) { this.path = path; }
  #load() { return existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {}; }
  #save(rows) {
    const temp = `${this.path}.tmp`, fd = openSync(temp, 'w');
    try { writeSync(fd, JSON.stringify(rows)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, this.path);
  }
  async get(id) { return this.#load()[id]; }
  async listProfileIds() { return Object.keys(this.#load()); }
  async add(row, options) {
    options?.assertCurrent?.();
    const rows = this.#load(); if (rows[row.profileId]) throw new VaultStorageError('ALREADY_EXISTS');
    rows[row.profileId] = row; this.#save(rows);
  }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    const rows = this.#load();
    if (JSON.stringify(rows[expected.profileId]) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    rows[next.profileId] = next; this.#save(rows);
  }
  async addWithSource() { throw new VaultStorageError('STORAGE_UNAVAILABLE'); }
  subscribeInvalidation() { return () => undefined; }
}

let rpcUrl, rpcId = 0;
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
  const body = await response.json();
  if (body.error) throw Object.assign(new Error(`${method}: ${body.error.message}`), { code: body.error.code });
  return body.result;
}
/** EIP-1193 request over the anvil node. Anvil's dev accounts are unlocked, so this is the "wallet" too. */
const request = ({ method, params }) => rpc(method, params ?? []);

/** One "process": an unlocked vault session, lifecycle journal and lifecycle over the shared file store. */
async function openClient(storePath, profileId, escrow, wallet = request) {
  const vault = new EncryptedVaultService(new FileStore(storePath), crypto, { lifecycle: false });
  const unlocked = await vault.unlock(profileId, PASS);
  assert.equal(unlocked.ok, true, 'vault unlocks');
  const journal = createLifecycleJournal({ vault, session: unlocked.value, validateCanonical: () => ({ ok: true, value: undefined }) });
  const base = createEip1193ChainReader({ request, escrow });
  const reader = process.env.DEBUG_RECONCILE ? Object.fromEntries(Object.entries(base).map(([name, fn]) => [name, async (...args) => { const r = await fn(...args); console.error('READ', name, JSON.stringify(args.filter(a => !(a instanceof AbortSignal) && !(a?.signal))), JSON.stringify(r)); return r; }])) : base;
  const life = createEvmTxLifecycle({ journal, reader, wallet, policy: POLICY });
  const [account] = await rpc('eth_accounts');
  await life.walletChanged({ account: account.toLowerCase(), chainId: String(BigInt(await rpc('eth_chainId'))), generation: 1 });
  return { vault, journal, life, close() { life.dispose(); journal.dispose(); vault.dispose(); } };
}
const val = (result, label) => { assert.equal(result.ok, true, `${label}: ${JSON.stringify(result)}`); return result.value; };

// ---------- child mode: the client that is killed after send-started ----------
if (process.argv[2] === '--client') {
  const config = JSON.parse(process.argv[3]);
  rpcUrl = config.rpcUrl;
  const wallet = async args => {
    if (args.method !== 'eth_sendTransaction') return request(args);
    await request(args); // the wallet broadcasts ...
    process.stdout.write('BROADCAST\n'); // ... and the client dies before the hash reaches the journal
    setInterval(() => undefined, 1000); // stay alive until the parent's SIGKILL
    return new Promise(() => {});
  };
  const client = await openClient(config.storePath, config.profileId, config.escrow, wallet);
  const prepared = val(await client.life.prepare(config.input), 'child prepare');
  process.stdout.write(`PREPARED ${prepared.intentId}\n`);
  await client.life.submit(prepared);
  process.exit(3); // unreachable: the parent kills this process first
}

// ---------- parent ----------
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
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
let counter = 0;
async function makeTerms(domain, seller, buyer, amount) {
  const label = `reconcile-${++counter}`, now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  return { orderId: Buffer.from(keccak256(new TextEncoder().encode(`${label}-order`))).toString('hex'), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-local-v1',
    seller, buyer, assetKind: 'native', asset: `0x${'0'.repeat(40)}`, amountBaseUnits: String(amount), privateAgreementHash: sha(`${label}-private`),
    capabilitiesHash: sha(`${label}-caps`), sellerNonce: Buffer.from(keccak256(new TextEncoder().encode(`${label}-nonce`))).toString('hex'),
    acceptBeforeSeconds: String(now + 3600), escrowExpirySeconds: String(now + 7200) };
}
const results = [];
const pass = name => { results.push(name); console.log(`ok - ${name}`); };
async function reconcileUntil(life, intentId, wanted, label, maxBlocks = 80) {
  for (let mined = 0; ; mined++) {
    const result = val(await life.reconcile(intentId), label);
    if (result.outcome === wanted) return result;
    assert.ok(mined < maxBlocks, `${label}: still ${result.outcome} after ${mined} blocks`);
    await mine();
  }
}

let anvil, workDir;
async function main() {
  const port = await freePort();
  rpcUrl = `http://127.0.0.1:${port}`;
  // One slot per epoch keeps anvil's `finalized` tag a few blocks behind `latest`.
  anvil = spawn(ANVIL, ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', '31337', '--slots-in-an-epoch', '1'], { env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });
  anvil.once('error', error => { throw error; });
  for (let attempt = 0; ; attempt++) {
    try { await rpc('eth_chainId'); break; } catch (error) { if (attempt > 100) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const [seller, buyer, third] = (await rpc('eth_accounts')).map(account => account.toLowerCase());
  const token = await deploy('test/mocks/Mocks.sol:MockERC20', ['Test USD', 'TUSD']);
  const escrow = await deploy('src/BasicEscrow.sol:BasicEscrow', [`[${token}]`]);
  const domain = { chainId: '31337', verifyingContract: escrow };
  const bindingOf = tradeId => ({ chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-local-v1', tradeId });
  const fundInput = terms => { const tradeId = evmTermsHash(domain, terms), { call, expectedEscrowState } = escrowCallFor({ action: 'fund', domain, terms });
    return { binding: bindingOf(tradeId), action: 'fund', expectedEscrowState, call }; };
  await rpc('evm_setAutomine', [false]); // transactions now wait in the pool until this script mines
  workDir = mkdtempSync(join(tmpdir(), 'g12-reconcile-'));
  const storePath = join(workDir, 'vault.json');
  const creator = new EncryptedVaultService(new FileStore(storePath), crypto, { lifecycle: false });
  const profileId = val(await creator.create(PASS), 'create vault').profileId;
  creator.dispose();
  pass('deployed BasicEscrow on private anvil (chain 31337, loopback); automine off; file-backed encrypted journal');

  // ---- 1. unknown outcome: kill the client after send-started ----
  {
    const input = fundInput(await makeTerms(domain, seller, buyer, 10n ** 17n));
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--client', JSON.stringify({ rpcUrl, storePath, profileId, escrow, input })],
      { env: ENV, stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('BROADCAST')) { child.kill('SIGKILL'); resolve(); } });
      child.once('exit', () => (output.includes('BROADCAST') ? resolve() : reject(new Error(`client exited early: ${output}`))));
    });
    assert.equal((await exited).signal, 'SIGKILL', 'client was killed');
    const intentId = /PREPARED (\S+)/.exec(output)[1];
    assert.ok(Object.keys((await rpc('txpool_content')).pending).some(key => key.toLowerCase() === seller), 'the broadcast is in the pool');
    const client = await openClient(storePath, profileId, escrow);
    const recovered = val(await client.life.recover(), 'recover');
    assert.deepEqual(recovered.map(intent => [intent.intentId, intent.state, intent.submission.hash]), [[intentId, 'broadcast-unknown', null]], 'durable send-started, hash never recorded');
    assert.equal(val(await client.life.reconcile(intentId), 'reconcile').outcome, 'pending', 'in the pool: still pending, never resent');
    const before = BigInt(await rpc('eth_getTransactionCount', [seller, 'pending']));
    await mine();
    const confirmed = await reconcileUntil(client.life, intentId, 'confirmed', 'unknown outcome');
    assert.deepEqual([confirmed.evidence, confirmed.intent.state, confirmed.escrowState], ['escrow-effect', 'confirmed', 'funded']);
    const finalized = await reconcileUntil(client.life, intentId, 'finalized', 'unknown outcome finality');
    assert.equal(finalized.intent.state, 'finalized');
    assert.equal(BigInt(await rpc('eth_getTransactionCount', [seller, 'latest'])), before, 'exactly one transaction was ever sent');
    client.close();
    pass('unknown outcome: client SIGKILLed after send-started and broadcast; fresh process reconciles confirmed -> finalized without resending');
  }

  // ---- 2. replaced by a higher-gas same-nonce transaction ----
  {
    const client = await openClient(storePath, profileId, escrow);
    const input = fundInput(await makeTerms(domain, seller, buyer, 10n ** 17n));
    const prepared = val(await client.life.prepare(input), 'prepare');
    const sent = val(await client.life.submit(prepared), 'submit');
    const original = await rpc('eth_getTransactionByHash', [sent.hash]);
    const bump = value => `0x${(BigInt(value) * 3n).toString(16)}`;
    const replacement = await rpc('eth_sendTransaction', [{ from: seller, to: third, value: '0x1', nonce: original.nonce, gas: '0x5208',
      maxFeePerGas: bump(original.maxFeePerGas ?? original.gasPrice), maxPriorityFeePerGas: bump(original.maxPriorityFeePerGas ?? original.gasPrice) }]);
    assert.notEqual(replacement, sent.hash);
    await mine(2);
    const result = val(await client.life.reconcile(prepared.intentId), 'reconcile replaced');
    assert.deepEqual([result.outcome, result.intent.state, result.intent.submission.hash, result.escrowState], ['replaced', 'replaced', sent.hash, 'absent']);
    assert.equal((await rpc('eth_getTransactionReceipt', [replacement])).status, '0x1');
    assert.equal((await client.life.prepare(input)).error.code, 'CONFLICT', 'a replaced intent is not silently re-prepared');
    const successor = val(await client.life.prepare({ ...input, supersedes: prepared.intentId }), 'successor');
    assert.equal(BigInt(successor.request.nonce), BigInt(original.nonce) + 1n);
    val(await client.life.submit(successor), 'successor submit');
    await mine();
    const done = await reconcileUntil(client.life, successor.intentId, 'confirmed', 'successor');
    assert.deepEqual([done.evidence, done.escrowState], ['receipt', 'funded']);
    client.close();
    pass('replaced: higher-gas same-nonce dev-account tx replaces the pending fund; intent -> replaced; explicit successor -> confirmed');
  }

  // ---- 3. dropped from the pool ----
  {
    const client = await openClient(storePath, profileId, escrow);
    const input = fundInput(await makeTerms(domain, seller, buyer, 10n ** 17n));
    const prepared = val(await client.life.prepare(input), 'prepare');
    const sent = val(await client.life.submit(prepared), 'submit');
    await rpc('anvil_dropTransaction', [sent.hash]);
    assert.equal(val(await client.life.reconcile(prepared.intentId), 'reconcile').outcome, 'pending', 'not dropped before the expiry');
    const dropped = await reconcileUntil(client.life, prepared.intentId, 'dropped', 'dropped', 10);
    assert.equal(dropped.intent.state, 'expired');
    const successor = val(await client.life.prepare({ ...input, supersedes: prepared.intentId }), 'same-nonce successor');
    assert.equal(successor.request.nonce, prepared.request.nonce);
    val(await client.life.submit(successor), 'successor submit');
    await mine();
    await reconcileUntil(client.life, successor.intentId, 'confirmed', 'dropped successor');
    client.close();
    pass('dropped: pending fund removed from the pool -> dropped after expiry; same-nonce successor -> confirmed');
  }

  // ---- 4. receipt path to finalized, then release through the lifecycle ----
  {
    const client = await openClient(storePath, profileId, escrow);
    const terms = await makeTerms(domain, seller, buyer, 10n ** 17n), input = fundInput(terms);
    const prepared = val(await client.life.prepare(input), 'prepare');
    val(await client.life.submit(prepared), 'submit');
    await mine();
    assert.equal((await reconcileUntil(client.life, prepared.intentId, 'finalized', 'fund finality')).evidence, 'receipt');
    const release = escrowCallFor({ action: 'release', escrow, tradeId: input.binding.tradeId });
    const releasing = val(await client.life.prepare({ binding: input.binding, action: 'release', expectedEscrowState: release.expectedEscrowState, call: release.call }), 'prepare release');
    const buyerBefore = BigInt(await rpc('eth_getBalance', [buyer, 'latest']));
    val(await client.life.submit(releasing), 'submit release');
    await mine();
    const released = await reconcileUntil(client.life, releasing.intentId, 'confirmed', 'release');
    assert.equal(released.escrowState, 'released');
    assert.equal(BigInt(await rpc('eth_getBalance', [buyer, 'latest'])), buyerBefore + 10n ** 17n);
    client.close();
    pass('receipt path: fund -> finalized (anvil finalized tag), then release via the lifecycle -> confirmed; buyer paid');
  }
  console.log(`\n${results.length} reconcile checks passed`);
}

let failed = false;
try { await main(); }
catch (error) { failed = true; console.error(error); }
finally {
  if (anvil && anvil.exitCode === null) {
    anvil.kill('SIGKILL');
    await new Promise(resolve => anvil.once('exit', resolve));
  }
  if (workDir) rmSync(workDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
