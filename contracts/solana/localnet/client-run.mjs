#!/usr/bin/env node
// Drives the packages/chain-solana client (compose/plan/submit/wallet/message) against a real pinned
// solana-test-validator (Agave 4.1.2): every escrow transaction below is built by the client's own legacy-message
// serializer, signed through its Wallet Standard port by a synthetic localnet keypair, journaled with the durable
// send marker and reconciled from finalized chain state. Flows:
//   native     fund -> release alone -> finalized Released -> payout_native
//   spl-hazard (i) a manually bundled [release, payout_spl] to a frozen ATA fails and rolls the release back;
//              (ii) the client's sequenced flow: release alone, finalized, payout fails (frozen), escrow stays
//              Released, payout retried after thaw succeeds
//   crash      crash after the marker before send -> restart -> no resend -> dropped after expiry -> explicit
//              rebuild; and a vault restore with the marker -> reconciled, not resent
//   refund     fund with deadline = clock + 1815 s, client refuses an early refund, waits real time, refunds,
//              then pays out to the seller
// Run from the repo root:  node --import ./scripts/test-support/register-tsx.mjs contracts/solana/localnet/client-run.mjs
// Env: SOLANA_LOCALNET_DIR (work dir), SOLANA_LOCALNET_PORT_OFFSET (default 400), SOLANA_CLIENT_SKIP_REFUND=1
// (debug only; the run then exits 1). Prints a JSON summary on stdout, progress on stderr.
//
// Localnet-only shim: the program binds G16 terms to its compiled synthetic genesis constant
// (`genesis-hash:p2p-offramp:localv1`), which no real validator can have, so this harness's RPC adapter answers
// getGenesisHash with that constant. Everything else is the validator's own answer.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as d from './driver.mjs';
import { confinedPath, resolveTool } from './tool-path.mjs';
import { createSolanaEscrowClient } from '../../../packages/chain-solana/src/compose.ts';
import { encodeSolanaTerms } from '../../../packages/domain/index.ts';
import { buildPayout, buildRelease } from '../../../packages/chain-solana/src/instructions.ts';
import { programDataSha256FromElf } from '../../../packages/chain-solana/src/layout.ts';
import {
  compileLegacyMessage, encodeBase64, encodeTransaction, parseLegacyMessage,
} from '../../../packages/chain-solana/src/message.ts';
import { verifyPlanMessage } from '../../../packages/chain-solana/src/plan.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLANA_DIR = resolve(HERE, '..');
const ALLOWED_ROOTS = [resolve(SOLANA_DIR, '../..'), tmpdir()];
const SO_PATH = join(SOLANA_DIR, 'target/deploy/basic_escrow.so');
const OFFSET = Number(process.env.SOLANA_LOCALNET_PORT_OFFSET ?? 400);
if (!Number.isInteger(OFFSET) || OFFSET < 0 || OFFSET > 1000) throw new Error('SOLANA_LOCALNET_PORT_OFFSET: 0..1000');
const PORTS = { rpc: 18899 + OFFSET, faucet: 19900 + OFFSET, gossip: 18001 + OFFSET,
  dynamic: `${18002 + OFFSET}-${18030 + OFFSET}` };
const RPC_URL = `http://127.0.0.1:${PORTS.rpc}`;
const WORKDIR = confinedPath(process.env.SOLANA_LOCALNET_DIR ?? mkdtempSync(join(tmpdir(), 'p2p-offramp-client-')),
  ALLOWED_ROOTS);
const SKIP_REFUND = process.env.SOLANA_CLIENT_SKIP_REFUND === '1';
const COMPILED_GENESIS = d.base58Encode(d.utf8(d.GENESIS_HASH_ASCII));
const CHAIN = 'solana:localnet';
const MARGINS = { submitMarginSeconds: '60', releaseMarginSeconds: '600' };
const REFUND_MARGINS = { submitMarginSeconds: '10', releaseMarginSeconds: '600' };
const AMOUNTS = { native: 400_000_000, spl: 25_000_000, splMinted: 100_000_000, refund: 300_000_000 };
const DESTINATION_FROZEN = 'InstructionError:1:Custom:6016';
const rpc = new d.Rpc(RPC_URL);
const t0 = Date.now();
const summary = { ok: false, startedAt: new Date(t0).toISOString(), workdir: WORKDIR, rpc: RPC_URL, validator: {},
  program: {}, flows: {}, sendCounts: {}, cliDecode: null, checks: [], deviations: [
    'getGenesisHash answered with the compiled synthetic genesis constant (localnet-only shim; see header)'],
  error: null };
const keys = {};
let validator = null;

const log = (...a) => console.error(`[${new Date().toISOString()}]`, ...a);
function check(name, ok, detail) {
  summary.checks.push({ name, ok: Boolean(ok), detail: detail ?? null });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`);
  return Boolean(ok);
}
function must(name, ok, detail) { if (!check(name, ok, detail)) throw new Error(`fatal expectation failed: ${name}`); }
const eq = (name, actual, expected) => check(name, actual === expected, { actual, expected });
const unwrap = (label, result) => {
  if (!result.ok) throw new Error(`${label}: ${result.error.code}`);
  return result.value;
};

// ---- processes ----
function run(cmd, args, { allowFail = false, timeoutMs = 180_000 } = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(resolveTool(cmd), args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  const res = { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
  if (!allowFail && r.status !== 0) throw new Error(`${cmd} ${args[0]} exited ${r.status}: ${res.stderr || res.stdout}`);
  return res;
}
const cli = (args, opts) =>
  run('solana', [...args, '--url', RPC_URL, '--keypair', keys.payerPath, '--commitment', 'confirmed'], opts);
function killValidatorSync() {
  if (validator && validator.exitCode === null && validator.signalCode === null) validator.kill('SIGKILL');
}
process.on('exit', killValidatorSync);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { killValidatorSync(); process.exit(1); });

async function startValidator() {
  const dir = join(WORKDIR, 'accounts');
  mkdirSync(dir, { recursive: true });
  const mintFiles = [[d.OPEN_MINT, null], [d.FREEZABLE_MINT, keys.mintAuthority.address]].map(([mint, freeze], i) => {
    const path = join(dir, `mint-${i}.json`);
    writeFileSync(path, JSON.stringify(d.mintAccountFile(mint, { mintAuthority: keys.mintAuthority.address,
      freezeAuthority: freeze, decimals: 6, lamports: 1_461_600 })));
    return path;
  });
  const args = ['--ledger', join(WORKDIR, 'ledger'), '--reset', '--quiet', '--bind-address', '127.0.0.1',
    '--rpc-port', String(PORTS.rpc), '--faucet-port', String(PORTS.faucet), '--gossip-port', String(PORTS.gossip),
    '--dynamic-port-range', PORTS.dynamic, '--mint', keys.payer.address,
    '--upgradeable-program', d.PROGRAM_ID, SO_PATH, keys.authority.address,
    ...mintFiles.flatMap(f => ['--account', '-', f])];
  const out = openSync(join(WORKDIR, 'validator.out'), 'w');
  log(`$ solana-test-validator ${args.join(' ')}`);
  validator = spawn(resolveTool('solana-test-validator'), args, { stdio: ['ignore', out, out] });
  closeSync(out);
  const started = Date.now();
  for (;;) {
    if (validator.exitCode !== null) throw new Error(`validator exited early (${validator.exitCode})`);
    try {
      if ((await rpc.call('getHealth')) === 'ok' && (await rpc.call('getSlot', [{ commitment: 'finalized' }])) > 0) break;
    } catch {}
    if (Date.now() - started > 90_000) throw new Error('validator not healthy within 90 s');
    await d.sleep(500);
  }
  const version = await rpc.call('getVersion');
  must('validator reports solana-core 4.1.2', version['solana-core'] === '4.1.2', version);
  summary.validator = { version, realGenesisHash: await rpc.call('getGenesisHash') };
}

async function finalizeProgram() {
  cli(['program', 'set-upgrade-authority', d.PROGRAM_ID, '--final', '--upgrade-authority', keys.authorityPath]);
  const pd = d.programDataAddress(d.PROGRAM_ID), stop = Date.now() + 120_000;
  for (;;) {
    const acc = await d.getAccount(rpc, pd, 'finalized');
    if (acc && d.decodeProgramDataHeader(acc.data).upgradeAuthority === null) {
      summary.program = { id: d.PROGRAM_ID, programData: pd, length: acc.data.length };
      return acc.data.length;
    }
    if (Date.now() > stop) throw new Error('upgrade authority still set at finalized');
    await d.sleep(1000);
  }
}

// ---- injected ports: RPC adapter, Wallet Standard keypair wallet, CAS journal ----
const sendLog = [];
const rpcPort = {
  async request({ method, params = [], signal }) {
    if (method === 'getGenesisHash') return COMPILED_GENESIS;
    if (method === 'sendTransaction') sendLog.push(params[0]);
    const res = await fetch(RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal });
    const json = await res.json();
    if (json.error) throw new Error(`rpc ${method} error ${json.error.code}`);
    return json.result;
  },
};
function keypairWallet(pairs) {
  const accounts = pairs.map(p => ({ address: p.address, publicKey: p.publicKey, chains: [CHAIN],
    features: ['standard:connect', 'solana:signTransaction'] }));
  return { features: {
    'standard:connect': { version: '1.0.0', connect: async () => ({ accounts }) },
    'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'],
      async signTransaction(input) {
        const wire = input.transaction, message = wire.slice(1 + 64 * wire[0]);
        const pair = pairs.find(p => p.address === input.account.address);
        return [{ signedTransaction: Uint8Array.from([1, ...ed25519.sign(message, pair.seed), ...message]) }];
      } },
  } };
}
function casJournal(profileId, initial = new Map()) {
  let store = initial;
  const hooks = {};
  const keyOf = b => `${b.networkId}|${b.deploymentId}|${b.tradeId}`;
  const entry = b => store.get(keyOf(b)) ?? { revision: 0, records: new Map() };
  return {
    hooks,
    backup: () => structuredClone(store),
    journal: {
      profileId: () => profileId,
      async read(binding) {
        const e = entry(binding);
        return { ok: true, value: { revision: e.revision, records: [...e.records.values()].map(r => structuredClone(r)) } };
      },
      async write(binding, expected, record) {
        const e = entry(binding);
        if (e.revision !== expected) return { ok: false, error: { code: 'CONFLICT' } };
        e.records.set(record.intentId, structuredClone(record));
        e.revision++;
        store.set(keyOf(binding), e);
        if (hooks.after?.(record) === 'crash') throw new Error('simulated crash after commit');
        return { ok: true, value: e.revision };
      },
    },
  };
}
function registry() {
  const network = { id: 'solana-localnet', chain: 'solana', chainIdentity: COMPILED_GENESIS, genesisHash: COMPILED_GENESIS,
    endpoints: [], finality: { kind: 'solana-commitment', commitment: 'finalized' }, environment: 'local',
    deployments: [], assets: [
      { id: 'sol', kind: 'native', address: null, decimals: 9, transferPolicy: 'exact-transfer' },
      { id: 'usd6', kind: 'spl', address: d.OPEN_MINT, decimals: 6, transferPolicy: 'exact-transfer' },
      { id: 'usd6f', kind: 'spl', address: d.FREEZABLE_MINT, decimals: 6, transferPolicy: 'exact-transfer' }] };
  const deployment = { id: 'escrow-v1', address: d.PROGRAM_ID, protocolVersion: 1, artifactSha256: '0'.repeat(64),
    runtime: { kind: 'solana-program', programDataSha256: summary.program.pin, upgradeAuthority: null },
    supportedAssetIds: ['sol', 'usd6', 'usd6f'] };
  return { network: id => (id === network.id ? network : null),
    deployment: (n, id) => (n === network.id && id === deployment.id ? deployment : null) };
}
let intentCounter = 0;
function makeClient(journal, margins = MARGINS) {
  return createSolanaEscrowClient({ rpc: rpcPort, wallet: keypairWallet([keys.seller, keys.buyer, keys.refundSeller]),
    journal, registry: registry(), clock: { now: () => Date.now() }, margins, walletChain: CHAIN,
    freezeAuthorityPermits: [{ mint: d.FREEZABLE_MINT, freezeAuthority: keys.mintAuthority.address }],
    random: n => Uint8Array.from(randomBytes(n)), timeoutMs: 15_000 });
}

// ---- trades ----
const hex = bytes => Buffer.from(bytes).toString('hex');
async function newTerms(seller, buyer, { mint = null, amount, expiryOffset }) {
  const clock = await d.readClock(rpc, 'processed');
  return { genesisHash: COMPILED_GENESIS, programId: d.PROGRAM_ID, orderId: hex(randomBytes(32)), seller, buyer,
    assetKind: mint ? 'spl' : 'native', mint, tokenProgram: mint ? d.SPL_PROGRAM_ID : null,
    privateAgreementHash: hex(d.sha256(d.utf8(`agreement-${Date.now()}`))),
    capabilitiesHash: hex(d.sha256(Uint8Array.of(0))), sellerNonce: hex(randomBytes(32)), revision: '1',
    amountBaseUnits: String(amount), acceptBeforeSeconds: String(clock.unixTimestamp + 600),
    escrowExpirySeconds: String(clock.unixTimestamp + expiryOffset) };
}
const bindingOf = terms => ({ chain: 'solana', networkId: 'solana-localnet', deploymentId: 'escrow-v1',
  tradeId: hex(d.sha256(encodeSolanaTerms(terms))) });

/** Polls reconcile until the intent is terminal. */
async function settle(client, trade, intentId, label, timeoutMs = 180_000) {
  const stop = Date.now() + timeoutMs;
  for (;;) {
    const records = unwrap(`${label} reconcile`, await client.reconcile(trade));
    const record = records.find(r => r.intentId === intentId);
    if (['finalized', 'failed', 'dropped', 'cancelled'].includes(record.state)) {
      log(`${label}: ${record.state} ${JSON.stringify(record.outcome)}`);
      return record;
    }
    if (Date.now() > stop) throw new Error(`${label}: not terminal after ${timeoutMs} ms (${record.state})`);
    await d.sleep(1500);
  }
}
async function act(client, trade, label, call) {
  const submission = unwrap(label, await call());
  eq(`${label}: send answered with the journaled signature`, submission.state, 'sent');
  const record = await settle(client, trade, submission.intentId, label);
  return { submission, record };
}
const snapshot = async (client, trade, label) => unwrap(`${label} read`, await client.read(trade));
const sendsFor = signature => sendLog.filter(w => d.base58Encode(Buffer.from(w, 'base64').subarray(1, 65)) === signature)
  .length;

async function nativeFlow() {
  const client = makeClient(casJournal('1'.repeat(32)).journal);
  const terms = await newTerms(keys.seller.address, keys.buyer.address, { amount: AMOUNTS.native, expiryOffset: 3600 });
  const trade = unwrap('bind', client.bind(bindingOf(terms), terms));
  const seller = unwrap('connect seller', await client.connect(trade, 'seller'));
  const fund = await act(client, trade, 'native fund', () => client.fund(trade, seller));
  eq('native fund finalized', fund.record.state, 'finalized');
  eq('native: escrow Funded at finalized', (await snapshot(client, trade, 'native')).escrow.state, 'funded');
  const release = await act(client, trade, 'native release', () => client.release(trade, seller));
  eq('native release finalized', release.record.state, 'finalized');
  const released = await snapshot(client, trade, 'native');
  check('native: Released, unpaid, after a release-only message', released.escrow.state === 'released' &&
    !released.escrow.paidOut, released.escrow);
  const buyerBefore = await d.getBalance(rpc, keys.buyer.address);
  const payout = await act(client, trade, 'native payout', () => client.payout(trade, seller));
  eq('native payout finalized', payout.record.state, 'finalized');
  eq('native: buyer credited exactly the amount', (await d.getBalance(rpc, keys.buyer.address)) - buyerBefore,
    AMOUNTS.native);
  eq('native: paid out at finalized', (await snapshot(client, trade, 'native')).escrow.paidOut, true);
  for (const step of [fund, release, payout]) eq('native: one sendTransaction per intent', sendsFor(step.submission.signature), 1);
  cliDecode(fund.submission.signature);
  summary.flows.native = { escrow: trade.escrow.address, fund: fund.record.outcome, release: release.record.outcome,
    payout: payout.record.outcome };
}

/** `solana decode-transaction` of one of our signed wire transactions: same keys, header and a passing sigverify. */
function cliDecode(signature) {
  const wire = sendLog.find(w => d.base58Encode(Buffer.from(w, 'base64').subarray(1, 65)) === signature);
  const out = JSON.parse(run('solana', ['decode-transaction', wire, 'base64', '--output', 'json']).stdout);
  const message = parseLegacyMessage(Uint8Array.from(Buffer.from(wire, 'base64').subarray(65)));
  const decoded = out.transaction.message;
  eq('CLI decode: sigverify pass', JSON.stringify(out.sigverifyStatus), JSON.stringify(['pass']));
  eq('CLI decode: account keys equal ours', JSON.stringify(decoded.accountKeys), JSON.stringify(message.accountKeys));
  eq('CLI decode: header equal ours', JSON.stringify([decoded.header.numRequiredSignatures,
    decoded.header.numReadonlySignedAccounts, decoded.header.numReadonlyUnsignedAccounts]),
  JSON.stringify([message.header.numRequiredSignatures, message.header.numReadonlySigned, message.header.numReadonlyUnsigned]));
  summary.cliDecode = { signature, sigverifyStatus: out.sigverifyStatus, accountKeys: decoded.accountKeys.length };
}

const tokenIx = (index, account, authority) => ({ programId: d.SPL_PROGRAM_ID, keys: [d.meta(account, false, true),
  d.meta(d.FREEZABLE_MINT, false, false), d.meta(authority, true, false)], data: Uint8Array.of(index) });
async function tokenAmount(address) {
  const acc = await d.getAccount(rpc, address, 'finalized');
  return acc ? d.decodeTokenAccount(acc.data) : null;
}

async function splHazardFlow() {
  const seller = keys.seller.address, buyer = keys.buyer.address, mint = d.FREEZABLE_MINT;
  const sellerAta = d.createAtaIdempotentIx(seller, seller, mint), buyerAta = d.createAtaIdempotentIx(seller, buyer, mint);
  await sendFinal('spl setup: ATAs, mint_to, freeze buyer ATA', keys.seller, [sellerAta.ix, buyerAta.ix,
    { ...d.mintToIx(mint, sellerAta.ata, keys.mintAuthority.address, AMOUNTS.splMinted) },
    tokenIx(10, buyerAta.ata, keys.mintAuthority.address)], [keys.seller, keys.mintAuthority]);
  eq('spl: buyer ATA frozen', (await tokenAmount(buyerAta.ata)).state, 2);
  const client = makeClient(casJournal('2'.repeat(32)).journal);
  const terms = await newTerms(seller, buyer, { mint, amount: AMOUNTS.spl, expiryOffset: 3600 });
  const trade = unwrap('bind spl', client.bind(bindingOf(terms), terms));
  const session = unwrap('connect seller', await client.connect(trade, 'seller'));
  const fund = await act(client, trade, 'spl fund', () => client.fund(trade, session));
  eq('spl fund finalized', fund.record.state, 'finalized');

  // (i) The hazard: one transaction [release, payout_spl] whose payout leg fails rolls the release back.
  const latest = (await rpc.call('getLatestBlockhash', [{ commitment: 'finalized' }])).value;
  const bundle = [unwrap('release ix', buildRelease(trade)), unwrap('payout ix', buildPayout(trade, 'released'))];
  const message = compileLegacyMessage(seller, bundle, latest.blockhash);
  let refused = null;
  try { verifyPlanMessage(trade, 'payout', 'released', seller, message); } catch (error) { refused = error.code; }
  eq('client refuses the bundled [release, payout_spl] message (C-L2)', refused, 'INVALID_INPUT');
  const wire = encodeTransaction([ed25519.sign(message, keys.seller.seed)], message);
  const signature = await rpc.call('sendTransaction', [encodeBase64(wire), { encoding: 'base64', skipPreflight: true,
    maxRetries: 0 }]);
  const status = await d.waitForSignature(rpc, signature, 'finalized', 120_000);
  eq('hazard: bundled tx fails on the payout leg (DestinationFrozen 6016)', JSON.stringify(status.err),
    JSON.stringify({ InstructionError: [1, { Custom: 6016 }] }));
  eq('hazard: release rolled back, escrow still Funded', (await snapshot(client, trade, 'hazard')).escrow.state, 'funded');

  // (ii) The client's sequenced flow keeps the release.
  const release = await act(client, trade, 'spl release', () => client.release(trade, session));
  eq('spl release finalized', release.record.state, 'finalized');
  const failedPayout = await act(client, trade, 'spl payout (frozen)', () => client.payout(trade, session));
  eq('spl payout to frozen ATA recorded failed', failedPayout.record.state, 'failed');
  eq('spl payout failure label', failedPayout.record.outcome?.err, DESTINATION_FROZEN);
  const after = await snapshot(client, trade, 'after failed payout');
  check('spl: escrow stays Released and unpaid after the failed payout', after.escrow.state === 'released' &&
    !after.escrow.paidOut && after.payout === 'pending', after.escrow);
  await sendFinal('thaw buyer ATA', keys.seller, [tokenIx(11, buyerAta.ata, keys.mintAuthority.address)],
    [keys.seller, keys.mintAuthority]);
  const retry = await act(client, trade, 'spl payout retry', () => client.payout(trade, session));
  eq('spl payout retry finalized', retry.record.state, 'finalized');
  eq('spl: buyer ATA holds the amount', (await tokenAmount(buyerAta.ata)).amount, String(AMOUNTS.spl));
  eq('spl: paid out at finalized', (await snapshot(client, trade, 'spl')).escrow.paidOut, true);
  summary.flows.splHazard = { escrow: trade.escrow.address, hazardSignature: signature, hazardErr: status.err,
    release: release.record.outcome, failedPayout: failedPayout.record.outcome, retry: retry.record.outcome };
}

async function sendFinal(label, feePayer, instructions, signers) {
  const res = await d.sendTx(rpc, { feePayer, instructions, signers });
  const st = await d.waitForSignature(rpc, res.signature, 'finalized', 120_000);
  must(`${label}: finalized without error`, st.err === null, st.err);
}

async function crashFlow() {
  const store = casJournal('3'.repeat(32));
  let client = makeClient(store.journal);
  const terms = await newTerms(keys.seller.address, keys.buyer.address, { amount: AMOUNTS.native, expiryOffset: 3600 });
  const trade = unwrap('bind crash', client.bind(bindingOf(terms), terms));
  let session = unwrap('connect', await client.connect(trade, 'seller'));
  await act(client, trade, 'crash fund', () => client.fund(trade, session));
  // Crash after the durable marker, before sendTransaction.
  store.hooks.after = record => (record.state === 'sendMarked' ? 'crash' : undefined);
  const sendsBefore = sendLog.length;
  const crashed = await client.release(trade, session);
  store.hooks.after = undefined;
  eq('crash: release reports UNAVAILABLE after a crash at the marker', crashed.ok ? 'ok' : crashed.error.code, 'UNAVAILABLE');
  eq('crash: nothing was sent', sendLog.length, sendsBefore);
  // Restart: a new client over the same journal.
  client.dispose();
  client = makeClient(store.journal);
  session = unwrap('reconnect', await client.connect(trade, 'seller'));
  const recovered = unwrap('recover', await client.recover(trade));
  const marked = recovered.find(r => r.action === 'release');
  eq('crash: marked intent not cancelled on recover', marked.state, 'sendMarked');
  const conflict = await client.release(trade, session);
  eq('crash: a new release is refused while the marked one is open', conflict.ok ? 'ok' : conflict.error.code, 'CONFLICT');
  const dropped = await settle(client, trade, marked.intentId, 'crash marked release', 300_000);
  eq('crash: marked intent dropped after finalized expiry', dropped.state, 'dropped');
  eq('crash: never sent at any point', sendLog.length, sendsBefore);
  const implicit = await client.release(trade, session);
  eq('crash: rebuild must name the dropped intent', implicit.ok ? 'ok' : implicit.error.code, 'CONFLICT');
  const rebuilt = await act(client, trade, 'crash rebuild release', () => client.release(trade, session,
    { rebuildOf: marked.intentId }));
  eq('crash: explicit rebuild finalized', rebuilt.record.state, 'finalized');
  eq('crash: rebuild uses a new blockhash', rebuilt.record.blockhash !== marked.blockhash, true);

  // Vault restore with the marker: the restored profile reconciles the payout, never resends it.
  const payout = unwrap('crash payout', await client.payout(trade, session));
  const backup = store.backup();
  const sendsAfterPayout = sendLog.length;
  client.dispose();
  const restored = makeClient(casJournal('4'.repeat(32), backup).journal);
  const afterRestore = unwrap('recover restored', await restored.recover(trade));
  check('restore: marked payout kept, not cancelled', afterRestore.find(r => r.intentId === payout.intentId).state !==
    'cancelled');
  const settled = await settle(restored, trade, payout.intentId, 'restored payout');
  eq('restore: payout reconciled finalized from chain state', settled.state, 'finalized');
  eq('restore: no resend', sendLog.length, sendsAfterPayout);
  eq('restore: paid out', (await snapshot(restored, trade, 'restored')).escrow.paidOut, true);
  summary.flows.crash = { escrow: trade.escrow.address, droppedIntent: marked.intentId,
    droppedLastValidBlockHeight: marked.lastValidBlockHeight, rebuild: rebuilt.record.outcome, payout: settled.outcome };
}

async function refundStart() {
  const client = makeClient(casJournal('5'.repeat(32)).journal, REFUND_MARGINS);
  const terms = await newTerms(keys.refundSeller.address, keys.buyer.address, { amount: AMOUNTS.refund,
    expiryOffset: 1815 });
  const trade = unwrap('bind refund', client.bind(bindingOf(terms), terms));
  const session = unwrap('connect refund seller', await client.connect(trade, 'seller'));
  const fund = await act(client, trade, 'refund fund', () => client.fund(trade, session));
  eq('refund trade funded', fund.record.state, 'finalized');
  const early = await client.refund(trade, session);
  eq('refund: client refuses before the finalized Clock reaches the deadline', early.ok ? 'ok' : early.error.code,
    'EXPIRED');
  return { client, trade, session, terms, fundedAt: Date.now() };
}

async function refundFinish({ client, trade, session, terms, fundedAt }) {
  const deadline = Number(terms.escrowExpirySeconds), stop = Date.now() + 3_000_000;
  for (;;) {
    const snap = await snapshot(client, trade, 'refund wait');
    if (Number(snap.live.timestampSeconds) >= deadline) break;
    if (Date.now() > stop) throw new Error('refund: deadline never reached');
    log(`refund: finalized clock ${snap.live.timestampSeconds}, deadline ${deadline}`);
    await d.sleep(20_000);
  }
  const refund = await act(client, trade, 'refund', () => client.refund(trade, session));
  eq('refund finalized', refund.record.state, 'finalized');
  eq('refund: escrow Refunded', (await snapshot(client, trade, 'refund')).escrow.state, 'refunded');
  const lamportsBefore = (await d.getAccount(rpc, trade.escrow.address, 'finalized')).lamports;
  const payout = await act(client, trade, 'refund payout', () => client.payout(trade, session));
  eq('refund payout finalized', payout.record.state, 'finalized');
  eq('refund: escrow released exactly the amount', lamportsBefore -
    (await d.getAccount(rpc, trade.escrow.address, 'finalized')).lamports, AMOUNTS.refund);
  summary.flows.refund = { escrow: trade.escrow.address, deadline, waitedSeconds: Math.round((Date.now() - fundedAt) / 1000),
    refund: refund.record.outcome, payout: payout.record.outcome };
}

async function main() {
  must('program .so exists (cargo build-sbf)', existsSync(SO_PATH), SO_PATH);
  const so = new Uint8Array(readFileSync(SO_PATH));
  const tv = run('solana-test-validator', ['--version']).stdout;
  must('solana-test-validator is pinned Agave 4.1.2', tv.includes('4.1.2 '), tv);
  mkdirSync(join(WORKDIR, 'keys'), { recursive: true });
  for (const name of ['payer', 'authority']) {
    const path = join(WORKDIR, 'keys', `${name}.json`);
    run('solana-keygen', ['new', '--no-bip39-passphrase', '-s', '--force', '-o', path]);
    keys[name] = d.loadKeypairFile(path);
    keys[`${name}Path`] = path;
  }
  for (const name of ['seller', 'refundSeller', 'buyer', 'mintAuthority']) keys[name] = d.generateKeypair();
  await startValidator();
  const length = await finalizeProgram();
  summary.program.pin = programDataSha256FromElf(so, length);
  await sendFinal('wallet funding', keys.payer, [d.transferIx(keys.payer.address, keys.seller.address, 10_000_000_000),
    d.transferIx(keys.payer.address, keys.refundSeller.address, 2_000_000_000)], [keys.payer]);
  const refund = await refundStart();
  await nativeFlow();
  await splHazardFlow();
  await crashFlow();
  if (SKIP_REFUND) check('refund flow executed (skipped by SOLANA_CLIENT_SKIP_REFUND)', false);
  else await refundFinish(refund);
  summary.sendCounts = { sendTransaction: sendLog.length };
}

try { await main(); } catch (e) { summary.error = e.stack ?? String(e); log(`ERROR ${summary.error}`); }
killValidatorSync();
summary.durationSeconds = Math.round((Date.now() - t0) / 1000);
summary.ok = summary.error === null && summary.checks.length > 0 && summary.checks.every(c => c.ok);
summary.finishedAt = new Date().toISOString();
const out = JSON.stringify(summary, null, 2);
writeFileSync(join(WORKDIR, 'client-summary.json'), out + '\n');
console.log(out);
process.exitCode = summary.ok ? 0 : 1;
