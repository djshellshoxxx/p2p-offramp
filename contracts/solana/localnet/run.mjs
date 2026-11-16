#!/usr/bin/env node
// Native end-to-end check of basic_escrow on a real pinned solana-test-validator (Agave 4.1.2).
// Deploys (genesis-loaded upgradeable program), makes it immutable, inspects it, runs native and SPL
// release+payout and one real refund after the >= 1800 s minimum. Prints a JSON summary on stdout,
// progress on stderr; exits 1 on any failed expectation.
// SBPF v0-v2 ELFs: Agave 4.1.2 refuses `--final` while SIMD-0500 (disable_sbpf_v0_v1_v2_deployment) is active,
// so the run first proves that refusal on an all-features validator, then runs the flows on a validator with
// only that feature deactivated (reported in `deviations`). SBPF v3+ ELFs run with every feature active.
// Env: SOLANA_LOCALNET_DIR (work dir, default fresh tmp dir); SOLANA_LOCALNET_SO (alternate .so; no fixture is
// written); SOLANA_LOCALNET_PORT_OFFSET (added to every port); SOLANA_LOCALNET_SKIP_REFUND_WAIT=1 (debug only,
// skips the ~31 min refund and therefore always exits 1).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as d from './driver.mjs';
import { confinedPath, resolveTool } from './tool-path.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLANA_DIR = resolve(HERE, '..');
const DEFAULT_SO = join(SOLANA_DIR, 'target/deploy/basic_escrow.so');
// Overrides must stay inside this checkout or the OS temp directory; the default is the built program.
const ALLOWED_ROOTS = [resolve(SOLANA_DIR, '../..'), tmpdir()];
const SO_PATH = confinedPath(process.env.SOLANA_LOCALNET_SO ?? DEFAULT_SO, ALLOWED_ROOTS);
const IDL_PATH = join(SOLANA_DIR, 'idl/basic_escrow.json');
const FIXTURE_PATH = join(HERE, 'fixtures/accounts-localnet.json');
const PINNED_VERSION = '4.1.2';
const OFFSET = Number(process.env.SOLANA_LOCALNET_PORT_OFFSET ?? 0);
if (!Number.isInteger(OFFSET) || OFFSET < 0 || OFFSET > 1000) throw new Error('SOLANA_LOCALNET_PORT_OFFSET: 0..1000');
const PORTS = { rpc: 18899 + OFFSET, faucet: 19900 + OFFSET, gossip: 18001 + OFFSET,
  dynamic: `${18002 + OFFSET}-${18030 + OFFSET}` };
const RPC_URL = `http://127.0.0.1:${PORTS.rpc}`;
const AMOUNTS = { native: 500_000_000, splMinted: 100_000_000, spl: 25_000_000, refund: 300_000_000 };
const RELEASE_EXPIRY_S = 3600;
const MIN_DURATION_S = 1800;
const REFUND_MARGIN_S = 5;
const ACCEPT_WINDOW_S = 60;
const LONG_POLL_MS = 15_000;
const FINALIZE_TIMEOUT_MS = 120_000;
const ZERO_KEY = '11111111111111111111111111111111';
const SIMD0500_FEATURE = 'B8JJXCy5amZyWG9r7EnUYLwzXSXTxG7GZ1qZ1qggo83g';
const SKIP_REFUND = process.env.SOLANA_LOCALNET_SKIP_REFUND_WAIT === '1';

const WORKDIR = confinedPath(process.env.SOLANA_LOCALNET_DIR ?? mkdtempSync(join(tmpdir(), 'p2p-offramp-sol-')),
  ALLOWED_ROOTS);
const LEDGER = join(WORKDIR, 'localnet-ledger');
const KEYS_DIR = join(WORKDIR, 'keys');
const rpc = new d.Rpc(RPC_URL);
const t0 = Date.now();
const summary = {
  ok: false, startedAt: new Date(t0).toISOString(), workdir: WORKDIR, rpc: RPC_URL,
  soPath: SO_PATH, validator: {}, sbpf: {}, deviations: [], program: {}, flows: {}, durations: {}, checks: [],
  error: null,
};
const fixture = { trades: [], escrows: [] };
const keys = {};
let validator = null;
let soBytes = null;

// ---- logging and expectations ----
const log = (...a) => console.error(`[${new Date().toISOString()}]`, ...a);
const sinceStart = () => Math.round((Date.now() - t0) / 1000);

function check(name, ok, detail) {
  summary.checks.push({ name, ok: Boolean(ok), detail: detail ?? null });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`);
  return Boolean(ok);
}

function must(name, ok, detail) {
  if (!check(name, ok, detail)) throw new Error(`fatal expectation failed: ${name}`);
}

const eq = (name, actual, expected) => check(name, actual === expected, { actual, expected });
const hex = (b) => d.toHex(d.sha256(b));

// ---- processes ----
function run(cmd, args, { allowFail = false, timeoutMs = 180_000 } = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(resolveTool(cmd), args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  const res = { status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
  if (!allowFail && r.status !== 0) {
    throw new Error(`${cmd} ${args[0]} exited ${r.status}: ${res.stderr || res.stdout}`);
  }
  return res;
}

const cli = (args, opts) =>
  run('solana', [...args, '--url', RPC_URL, '--keypair', keys.payerPath, '--commitment', 'confirmed'], opts);

function killValidatorSync() {
  if (validator && validator.exitCode === null && validator.signalCode === null) validator.kill('SIGKILL');
}

async function stopValidator() {
  if (!validator || validator.exitCode !== null || validator.signalCode !== null) return;
  const exited = new Promise((r) => validator.once('exit', r));
  validator.kill('SIGTERM');
  const timer = new Promise((r) => setTimeout(r, 15_000, 'timeout'));
  if ((await Promise.race([exited, timer])) === 'timeout') {
    log('validator did not exit on SIGTERM; sending SIGKILL');
    validator.kill('SIGKILL');
  }
  log('validator stopped');
}

process.on('exit', killValidatorSync);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    log(`received ${sig}; killing validator`);
    killValidatorSync();
    process.exit(1);
  });
}

// ---- setup ----
function preflight() {
  must('program .so exists', existsSync(SO_PATH), SO_PATH);
  soBytes = new Uint8Array(readFileSync(SO_PATH));
  summary.sbpf.version = elfSbpfVersion(soBytes);
  const tv = run('solana-test-validator', ['--version']).stdout;
  const cv = run('solana', ['--version']).stdout;
  must('solana-test-validator is pinned Agave 4.1.2', tv.includes(`${PINNED_VERSION} `), tv);
  must('solana CLI is pinned 4.1.2', cv.includes(`${PINNED_VERSION} `), cv);
  summary.validator.binaryVersion = tv;
}

/// SBPF version from the ELF64 header e_flags (offset 48), as solana-sbpf's get_sbpf_version reads it.
function elfSbpfVersion(bytes) {
  const magic = bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46;
  must('program is an ELF64 file', magic && bytes[4] === 2 && bytes.length > 52);
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(48, true);
}

async function assertPortFree() {
  let up = false;
  try {
    await rpc.call('getHealth');
    up = true;
  } catch {}
  must('rpc port free before start (no stale validator)', !up, RPC_URL);
}

function keygen(name) {
  const path = join(KEYS_DIR, `${name}.json`);
  run('solana-keygen', ['new', '--no-bip39-passphrase', '-s', '--force', '-o', path]);
  return { path, kp: d.loadKeypairFile(path) };
}

function setupKeys() {
  mkdirSync(KEYS_DIR, { recursive: true });
  for (const name of ['payer', 'authority', 'buffer']) {
    const { path, kp } = keygen(name);
    keys[name] = kp;
    keys[`${name}Path`] = path;
  }
  const generated = ['seller', 'refundSeller', 'mintAuthority', 'buyerNative', 'buyerSpl'];
  for (const name of generated) keys[name] = d.generateKeypair();
  summary.accounts = Object.fromEntries(['payer', 'authority', ...generated].map((n) => [n, keys[n].address]));
}

function writeMintFiles() {
  const dir = join(WORKDIR, 'accounts');
  mkdirSync(dir, { recursive: true });
  const lamports = 1_461_600;
  const files = [
    [d.OPEN_MINT, null],
    [d.FREEZABLE_MINT, keys.mintAuthority.address],
  ].map(([mint, freeze], i) => {
    const path = join(dir, `mint-${i}.json`);
    const body = d.mintAccountFile(mint, { mintAuthority: keys.mintAuthority.address, freezeAuthority: freeze,
      decimals: 6, lamports });
    writeFileSync(path, JSON.stringify(body, null, 2));
    return path;
  });
  return files;
}

function validatorArgs(mintFiles, { ledger, deactivate }) {
  return [
    '--ledger', ledger, '--reset', '--quiet', '--bind-address', '127.0.0.1',
    '--rpc-port', String(PORTS.rpc), '--faucet-port', String(PORTS.faucet),
    '--gossip-port', String(PORTS.gossip), '--dynamic-port-range', PORTS.dynamic,
    '--mint', keys.payer.address,
    '--upgradeable-program', d.PROGRAM_ID, SO_PATH, keys.authority.address,
    ...mintFiles.flatMap((f) => ['--account', '-', f]),
    ...deactivate.flatMap((f) => ['--deactivate-feature', f]),
  ];
}

async function startValidator(mintFiles, { label, ledger, deactivate }) {
  const out = openSync(join(WORKDIR, `validator-${label}.out`), 'w');
  const args = validatorArgs(mintFiles, { ledger, deactivate });
  log(`$ solana-test-validator ${args.join(' ')}`);
  validator = spawn(resolveTool('solana-test-validator'), args, { stdio: ['ignore', out, out] });
  closeSync(out);
  validator.on('exit', (code, sig) => log(`validator exited code=${code} signal=${sig}`));
  const started = Date.now();
  for (;;) {
    if (validator.exitCode !== null) throw new Error(`${label} validator exited early (${validator.exitCode})`);
    try {
      const healthy = (await rpc.call('getHealth')) === 'ok';
      if (healthy && (await rpc.call('getSlot', [{ commitment: 'finalized' }])) > 0) break;
    } catch {}
    if (Date.now() - started > 90_000) throw new Error('validator not healthy within 90 s');
    await d.sleep(500);
  }
  summary.durations[`validatorStartupMs_${label}`] = Date.now() - started;
  const version = await rpc.call('getVersion');
  must(`${label} validator: rpc reports solana-core 4.1.2`, version['solana-core'] === PINNED_VERSION, version);
  const feature = await d.getAccount(rpc, SIMD0500_FEATURE, 'finalized');
  eq(`${label} validator: SIMD-0500 activation as planned`, feature !== null, !deactivate.includes(SIMD0500_FEATURE));
  return { rpcVersion: version, genesisHash: await rpc.call('getGenesisHash'), pid: validator.pid, ledger,
    deactivatedFeatures: deactivate, simd0500Active: feature !== null };
}

/// v0-v2 ELF: on an all-features validator `--final` must be refused (InvalidAccountData) and leave the
/// authority in place. Returns the evidence; the validator is stopped afterwards.
async function probeSimd0500(mintFiles) {
  const info = await startValidator(mintFiles, { label: 'probe', ledger: join(WORKDIR, 'probe-ledger'),
    deactivate: [] });
  const fin = cli(['program', 'set-upgrade-authority', d.PROGRAM_ID, '--final', '--upgrade-authority',
    keys.authorityPath], { allowFail: true });
  const message = (fin.stderr || fin.stdout).split('\n').find((l) => l.includes('invalid account data')) ?? null;
  check('SIMD-0500 active: --final of SBPF v0-v2 program refused', fin.status !== 0 && message, message);
  const pd = await d.getAccount(rpc, d.programDataAddress(d.PROGRAM_ID), 'confirmed');
  eq('SIMD-0500 probe: upgrade authority still set', d.decodeProgramDataHeader(pd.data).upgradeAuthority,
    keys.authority.address);
  await stopValidator();
  summary.sbpf.simd0500Probe = { genesisHash: info.genesisHash, simd0500Active: info.simd0500Active,
    finalExit: fin.status, finalError: message };
}

// ---- IDL cross-check ----
/// Builds each instruction with placeholder keys and requires the driver to be at least as permissive as the
/// IDL (IDL signer => signer, IDL writable => writable) and to use every fixed IDL address.
function sampleIx(name) {
  const k = (i) => d.base58Encode(d.sha256(d.utf8(`idl-sample-${i}`)));
  const args = { orderId: new Uint8Array(32), buyer: k(9), privateAgreementHash: new Uint8Array(32),
    capabilitiesHash: new Uint8Array(32), sellerNonce: new Uint8Array(32), revision: 1, amount: 1,
    acceptBefore: 1, expiry: 1 };
  const build = {
    fund_native: () => d.fundNativeIx({ seller: k(1), escrow: k(2), args }),
    fund_spl: () => d.fundSplIx({ seller: k(1), escrow: k(2), mint: k(3), sellerToken: k(4), vault: k(5), args }),
    release: () => d.releaseIx(k(1), k(2)),
    refund: () => d.refundIx(k(2)),
    payout_native: () => d.payoutNativeIx(k(2), k(6)),
    payout_spl: () => d.payoutSplIx({ escrow: k(2), vault: k(5), mint: k(3), destination: k(7) }),
  };
  return build[name]();
}

function checkIdlFlags(name, idlAccounts) {
  const metas = sampleIx(name).keys;
  const bad = idlAccounts.filter((a, i) => (a.signer && !metas[i].isSigner) || (a.writable && !metas[i].isWritable)
    || (a.address && a.address !== metas[i].pubkey)).map((a) => a.name);
  eq(`IDL ${name} signer/writable/address flags covered by driver`, bad.join(','), '');
}

function checkIdl() {
  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  eq('IDL address == program id', idl.address, d.PROGRAM_ID);
  for (const [name, order] of Object.entries(d.ACCOUNT_ORDER)) {
    const ix = idl.instructions.find((i) => i.name === name);
    must(`IDL has instruction ${name}`, ix);
    eq(`IDL ${name} discriminator`, d.toHex(Uint8Array.from(ix.discriminator)), d.toHex(d.ixDiscriminator(name)));
    eq(`IDL ${name} account order`, ix.accounts.map((a) => a.name).join(','), order.join(','));
    checkIdlFlags(name, ix.accounts);
  }
  const fields = idl.types.find((t) => t.name === 'FundArgs').type.fields.map((f) => f.name).join(',');
  const want = 'order_id,buyer,private_agreement_hash,capabilities_hash,seller_nonce,revision,amount,'
    + 'accept_before,expiry';
  eq('IDL FundArgs field order', fields, want);
}

// ---- program inspection and immutability ----
async function inspectProgram() {
  const prog = await d.getAccount(rpc, d.PROGRAM_ID, 'finalized');
  must('program account exists', prog);
  const pdAddress = d.decodeProgramAccount(prog.data).programData;
  const pd = await d.getAccount(rpc, pdAddress, 'finalized');
  must('ProgramData account exists', pd);
  const header = d.decodeProgramDataHeader(pd.data);
  const elf = pd.data.slice(d.PROGRAMDATA_HEADER_LEN, d.PROGRAMDATA_HEADER_LEN + soBytes.length);
  const tail = pd.data.slice(d.PROGRAMDATA_HEADER_LEN + soBytes.length);
  return {
    prog, pd, pdAddress, header,
    hashes: {
      programDataSha256: hex(pd.data), elfSha256: hex(elf), soSha256: hex(soBytes),
      afterHeaderSha256: hex(pd.data.slice(d.PROGRAMDATA_HEADER_LEN)), tailBytes: tail.length,
      tailAllZero: tail.every((b) => b === 0),
    },
  };
}

function cliShow() {
  const raw = cli(['program', 'show', d.PROGRAM_ID, '--output', 'json']).stdout;
  return JSON.parse(raw);
}

async function latestSignatureFor(address) {
  const sigs = await rpc.call('getSignaturesForAddress', [address, { limit: 1, commitment: 'confirmed' }]);
  must(`signature exists for ${address}`, sigs.length === 1);
  return sigs[0].signature;
}

async function waitAuthorityCleared(pdAddress) {
  const stop = Date.now() + FINALIZE_TIMEOUT_MS;
  for (;;) {
    const pd = await d.getAccount(rpc, pdAddress, 'finalized');
    if (d.decodeProgramDataHeader(pd.data).upgradeAuthority === null) return;
    if (Date.now() > stop) throw new Error('upgrade authority still set at finalized after 120 s');
    await d.sleep(1000);
  }
}

async function deployAndFinalize() {
  const before = await inspectProgram();
  must('program executable', before.prog.executable, before.prog.executable);
  eq('program owner is loader-v3', before.prog.owner, d.LOADER_V3_ID);
  eq('ProgramData address is loader PDA', before.pdAddress, d.programDataAddress(d.PROGRAM_ID));
  eq('authority before --final', before.header.upgradeAuthority, keys.authority.address);
  const showBefore = cliShow();
  eq('solana program show (before) authority', showBefore.authority, keys.authority.address);
  const fin = cli(['program', 'set-upgrade-authority', d.PROGRAM_ID, '--final',
    '--upgrade-authority', keys.authorityPath, '--output', 'json']);
  const finalizeSignature = await latestSignatureFor(before.pdAddress);
  const st = await d.waitForSignature(rpc, finalizeSignature, 'finalized', FINALIZE_TIMEOUT_MS);
  must('set-upgrade-authority --final tx finalized without error', st.err === null, st.err);
  await waitAuthorityCleared(before.pdAddress);
  const after = await inspectProgram();
  const showAfter = cliShow();
  recordProgram(before, after, { showBefore, showAfter, finalizeSignature, finalizeSlot: st.slot, cliOut: fin.stdout });
  return after;
}

function recordProgram(before, after, extra) {
  const h = after.hashes;
  eq('ProgramData upgrade authority after --final (finalized)', after.header.upgradeAuthority, null);
  eq('solana program show (after) authority', extra.showAfter.authority, 'none');
  eq('ProgramData length == 45 + .so length', after.pd.data.length, d.PROGRAMDATA_HEADER_LEN + soBytes.length);
  eq('on-chain ELF sha256 == .so sha256', h.elfSha256, h.soSha256);
  eq('ProgramData slot unchanged by --final', after.header.slot, before.header.slot);
  summary.program = {
    id: d.PROGRAM_ID, owner: after.prog.owner, executable: after.prog.executable,
    programDataAddress: after.pdAddress, programDataLength: after.pd.data.length, soLength: soBytes.length,
    soSha256: h.soSha256, programDataSha256: h.programDataSha256, elfSha256: h.elfSha256,
    programDataSha256BeforeFinal: before.hashes.programDataSha256,
    authorityBefore: before.header.upgradeAuthority, authorityAfter: after.header.upgradeAuthority,
    deploySlot: after.header.slot, finalize: { signature: extra.finalizeSignature, slot: extra.finalizeSlot,
      commitment: 'finalized', cliOutput: extra.cliOut },
    cliShowBefore: extra.showBefore, cliShowAfter: extra.showAfter,
  };
  fixture.program = {
    address: d.PROGRAM_ID, owner: after.prog.owner, executable: after.prog.executable,
    dataBase64: Buffer.from(after.prog.data).toString('base64'),
  };
  fixture.programData = {
    address: after.pdAddress, owner: after.pd.owner, dataLength: after.pd.data.length,
    headerBase64: Buffer.from(after.pd.data.slice(0, d.PROGRAMDATA_HEADER_LEN)).toString('base64'),
    sha256OfBytesAfterHeader: h.afterHeaderSha256, sha256OfWholeData: h.programDataSha256,
    soLength: soBytes.length, soSha256: h.soSha256,
  };
}

// ---- transactions ----
async function finalize(label, res) {
  const st = await d.waitForSignature(rpc, res.signature, 'finalized', FINALIZE_TIMEOUT_MS);
  must(`${label}: finalized without error`, st.err === null, { signature: res.signature, err: st.err });
  return { signature: res.signature, slot: st.slot, commitment: st.confirmationStatus };
}

async function sendOk(label, opts) {
  const res = await d.sendTx(rpc, opts);
  if (res.err) throw new Error(`${label}: transaction ${res.signature} failed: ${JSON.stringify(res.err)}`);
  return finalize(label, res);
}

async function fundWallets() {
  const ixs = [
    d.transferIx(keys.payer.address, keys.seller.address, 10_000_000_000),
    d.transferIx(keys.payer.address, keys.refundSeller.address, 1_000_000_000),
  ];
  summary.flows.walletFunding = await sendOk('wallet funding', { feePayer: keys.payer, instructions: ixs,
    signers: [keys.payer] });
}

function newFundArgs(label, buyer, amount, now, expiryOffset) {
  return {
    orderId: randomBytes(32), buyer,
    privateAgreementHash: d.sha256(d.utf8(`private-agreement:${label}`)),
    capabilitiesHash: d.sha256(d.utf8(`capabilities:${label}`)),
    sellerNonce: randomBytes(32), revision: 1, amount,
    acceptBefore: now + ACCEPT_WINDOW_S, expiry: now + expiryOffset,
  };
}

function fundArgsJson(a) {
  return {
    orderId: d.toHex(a.orderId), buyer: a.buyer, privateAgreementHash: d.toHex(a.privateAgreementHash),
    capabilitiesHash: d.toHex(a.capabilitiesHash), sellerNonce: d.toHex(a.sellerNonce),
    revision: String(a.revision), amount: String(a.amount), acceptBefore: String(a.acceptBefore),
    expiry: String(a.expiry),
  };
}

/// Funds one trade. Retries (fresh nonce, fresh clock) only on DeadlineOutOfRange (6005), at most 3 times.
async function fundTrade(name, { seller, buyer, amount, expiryOffset, spl = null }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const clock = await d.readClock(rpc, 'processed');
    const args = newFundArgs(name, buyer, amount, clock.unixTimestamp, expiryOffset);
    const escrow = d.escrowAddress(seller.address, args.sellerNonce);
    const vault = spl ? d.vaultAddress(escrow.address) : null;
    const ix = spl
      ? d.fundSplIx({ seller: seller.address, escrow: escrow.address, mint: spl.mint, sellerToken: spl.sellerToken,
        vault: vault.address, args })
      : d.fundNativeIx({ seller: seller.address, escrow: escrow.address, args });
    let res;
    try {
      res = await d.sendTx(rpc, { feePayer: seller, instructions: [ix], signers: [seller] });
    } catch (e) {
      if (!/Custom":6005/.test(e.message) || attempt === 3) throw e;
      log(`${name}: DeadlineOutOfRange (6005) in preflight on attempt ${attempt}; retrying with a fresh clock`);
      continue;
    }
    if (res.err?.InstructionError?.[1]?.Custom === 6005 && attempt < 3) continue;
    if (res.err) throw new Error(`${name}: fund tx ${res.signature} failed: ${JSON.stringify(res.err)}`);
    const fund = await finalize(`${name} fund`, res);
    const trade = { name, seller, args, escrow: escrow.address, escrowBump: escrow.bump, vault, spl: Boolean(spl),
      clock, attempt, fund };
    fixture.trades.push({ trade: name, escrowAddress: escrow.address, clockUnixTimestampAtFunding: clock.unixTimestamp,
      fundSignature: fund.signature });
    return trade;
  }
  throw new Error(`${name}: funding failed after 3 attempts`);
}

async function rentReserve() {
  return rpc.call('getMinimumBalanceForRentExemption', [d.ESCROW_ACCOUNT_LEN, { commitment: 'finalized' }]);
}

/// Reads the escrow at finalized, records a fixture snapshot when `snapshotLabel` is set, returns decoded state.
async function readEscrow(trade, snapshotLabel = null) {
  const acc = await d.getAccount(rpc, trade.escrow, 'finalized');
  must(`${trade.name}: escrow account exists`, acc);
  eq(`${trade.name}: escrow owner is program`, acc.owner, d.PROGRAM_ID);
  const e = d.decodeEscrow(acc.data);
  if (snapshotLabel) {
    fixture.escrows.push({
      label: snapshotLabel, trade: trade.name, escrowAddress: trade.escrow, vaultAddress: trade.vault?.address ?? null,
      fundArgs: fundArgsJson(trade.args), seller: trade.seller.address, buyer: trade.args.buyer,
      mint: trade.spl ? d.OPEN_MINT : null, clockUnixTimestampAtFunding: trade.clock.unixTimestamp,
      slot: acc.slot, lamports: acc.lamports, dataBase64: Buffer.from(acc.data).toString('base64'),
    });
  }
  return { ...e, lamports: acc.lamports };
}

async function checkFunded(trade, snapshotLabel) {
  const e = await readEscrow(trade, snapshotLabel);
  const { spl } = trade;
  const want = d.termsHash({ seller: trade.seller.address, mint: spl ? d.OPEN_MINT : null,
    tokenProgram: spl ? d.SPL_PROGRAM_ID : null, assetKind: spl ? 2 : 0, args: trade.args });
  eq(`${trade.name}: state Funded`, e.state, 'Funded');
  eq(`${trade.name}: amount`, e.amount, String(trade.args.amount));
  eq(`${trade.name}: deadline == expiry`, e.deadline, trade.args.expiry);
  eq(`${trade.name}: buyer`, e.buyer, trade.args.buyer);
  eq(`${trade.name}: seller`, e.seller, trade.seller.address);
  eq(`${trade.name}: asset kind`, e.assetKind, spl ? 2 : 0);
  eq(`${trade.name}: mint`, e.mint, spl ? d.OPEN_MINT : ZERO_KEY);
  eq(`${trade.name}: escrow bump canonical`, e.escrowBump, trade.escrowBump);
  eq(`${trade.name}: on-chain terms hash == off-chain rebuild`, e.termsHash, want);
  if (spl) eq(`${trade.name}: vault bump canonical`, e.vaultBump, trade.vault.bump);
  const rent = await rentReserve();
  const label = `${trade.name}: escrow lamports == rent${spl ? '' : ' + principal'}`;
  eq(label, e.lamports, rent + (spl ? 0 : trade.args.amount));
  return e;
}

async function checkSettled(trade, label, state) {
  const e = await readEscrow(trade, label);
  eq(`${trade.name}: state ${state}`, e.state, state);
  eq(`${trade.name}: paid_out`, e.paidOut, true);
  eq(`${trade.name}: escrow lamports == rent reserve`, e.lamports, await rentReserve());
  return e;
}

// ---- flows ----
async function nativeReleaseFlow() {
  const buyer = keys.buyerNative.address;
  const trade = await fundTrade('native-release', { seller: keys.seller, buyer, amount: AMOUNTS.native,
    expiryOffset: RELEASE_EXPIRY_S });
  await checkFunded(trade, 'native-funded');
  const buyerBefore = await d.getBalance(rpc, buyer);
  const ixs = [d.releaseIx(keys.seller.address, trade.escrow), d.payoutNativeIx(trade.escrow, buyer)];
  const settle = await sendOk('native release+payout', { feePayer: keys.seller, instructions: ixs,
    signers: [keys.seller] });
  await checkSettled(trade, 'native-released-paid', 'Released');
  const buyerAfter = await d.getBalance(rpc, buyer);
  eq('native: buyer balance before == 0', buyerBefore, 0);
  eq('native: buyer balance == amount (finalized)', buyerAfter, AMOUNTS.native);
  summary.flows.native = { escrow: trade.escrow, amount: AMOUNTS.native, deadline: trade.args.expiry,
    clockAtFunding: trade.clock.unixTimestamp, fundAttempts: trade.attempt, signatures: { fund: trade.fund,
      releasePayout: settle }, buyer, buyerBalanceBefore: buyerBefore, buyerBalanceAfter: buyerAfter };
}

async function tokenAmount(address) {
  const acc = await d.getAccount(rpc, address, 'finalized');
  must(`token account ${address} exists`, acc);
  eq(`token account ${address} owned by SPL Token`, acc.owner, d.SPL_PROGRAM_ID);
  return d.decodeTokenAccount(acc.data);
}

async function prepareSplAccounts() {
  const seller = keys.seller.address;
  const sellerAta = d.createAtaIdempotentIx(seller, seller, d.OPEN_MINT);
  const buyerAta = d.createAtaIdempotentIx(seller, keys.buyerSpl.address, d.OPEN_MINT);
  const ixs = [sellerAta.ix, buyerAta.ix,
    d.mintToIx(d.OPEN_MINT, sellerAta.ata, keys.mintAuthority.address, AMOUNTS.splMinted)];
  const sig = await sendOk('spl ATAs + mint_to', { feePayer: keys.seller, instructions: ixs,
    signers: [keys.seller, keys.mintAuthority] });
  return { sellerAta: sellerAta.ata, buyerAta: buyerAta.ata, setup: sig };
}

async function splReleaseFlow() {
  const { sellerAta, buyerAta, setup } = await prepareSplAccounts();
  const trade = await fundTrade('spl-release', { seller: keys.seller, buyer: keys.buyerSpl.address,
    amount: AMOUNTS.spl, expiryOffset: RELEASE_EXPIRY_S, spl: { mint: d.OPEN_MINT, sellerToken: sellerAta } });
  await checkFunded(trade, 'spl-funded');
  const vault = await tokenAmount(trade.vault.address);
  eq('spl: vault holds amount', vault.amount, String(AMOUNTS.spl));
  eq('spl: vault token owner is escrow', vault.owner, trade.escrow);
  eq('spl: vault mint', vault.mint, d.OPEN_MINT);
  const ixs = [d.releaseIx(keys.seller.address, trade.escrow),
    d.payoutSplIx({ escrow: trade.escrow, vault: trade.vault.address, mint: d.OPEN_MINT, destination: buyerAta })];
  const settle = await sendOk('spl release+payout', { feePayer: keys.seller, instructions: ixs,
    signers: [keys.seller] });
  await checkSettled(trade, 'spl-released-paid', 'Released');
  const tokenAccounts = [buyerAta, trade.vault.address, sellerAta];
  const [buyerTok, vaultTok, sellerTok] = await Promise.all(tokenAccounts.map(tokenAmount));
  eq('spl: buyer ATA == amount (finalized)', buyerTok.amount, String(AMOUNTS.spl));
  eq('spl: buyer ATA owner', buyerTok.owner, keys.buyerSpl.address);
  eq('spl: vault empty after payout', vaultTok.amount, '0');
  eq('spl: seller ATA == minted - amount', sellerTok.amount, String(AMOUNTS.splMinted - AMOUNTS.spl));
  summary.flows.spl = { escrow: trade.escrow, vault: trade.vault.address, mint: d.OPEN_MINT, amount: AMOUNTS.spl,
    deadline: trade.args.expiry, clockAtFunding: trade.clock.unixTimestamp, fundAttempts: trade.attempt,
    buyerAta, sellerAta, signatures: { setup, fund: trade.fund, releasePayout: settle },
    buyerAtaAmount: buyerTok.amount, vaultAmountAfter: vaultTok.amount, sellerAtaAmount: sellerTok.amount };
}

async function startRefundTrade() {
  const trade = await fundTrade('native-refund', { seller: keys.refundSeller, buyer: keys.buyerNative.address,
    amount: AMOUNTS.refund, expiryOffset: MIN_DURATION_S + REFUND_MARGIN_S });
  trade.fundedWallMs = Date.now();
  await checkFunded(trade, null);
  eq('refund trade: deadline - clock at funding', trade.args.expiry - trade.clock.unixTimestamp,
    MIN_DURATION_S + REFUND_MARGIN_S);
  return trade;
}

async function earlyRefundMustFail(trade) {
  const res = await d.sendTx(rpc, { feePayer: keys.payer, instructions: [d.refundIx(trade.escrow)],
    signers: [keys.payer], skipPreflight: true });
  const st = await d.waitForSignature(rpc, res.signature, 'finalized', FINALIZE_TIMEOUT_MS);
  const code = st.err?.InstructionError?.[1]?.Custom;
  eq('early refund fails on chain with 6013 DeadlineNotReached (0x177d)', code, 6013);
  const tx = await d.getTransactionLogs(rpc, res.signature);
  const line = tx.logs.find((l) => l.includes('DeadlineNotReached')) ?? null;
  check('early refund log names DeadlineNotReached', line, line);
  const e = await readEscrow(trade);
  eq('escrow still Funded after failed refund', e.state, 'Funded');
  return { signature: res.signature, slot: st.slot, commitment: st.confirmationStatus, err: st.err,
    blockTime: tx.blockTime, logLine: line };
}

async function waitForDeadline(deadline) {
  const hardStop = Date.now() + (MIN_DURATION_S + 900) * 1000;
  for (;;) {
    const clock = await d.readClock(rpc, 'confirmed');
    if (clock.unixTimestamp >= deadline) return clock;
    if (Date.now() > hardStop) throw new Error(`clock ${clock.unixTimestamp} never reached deadline ${deadline}`);
    log(`waiting for refund deadline: clock ${clock.unixTimestamp}, deadline ${deadline}, ` +
      `${deadline - clock.unixTimestamp} s left, elapsed ${sinceStart()} s`);
    await d.sleep(LONG_POLL_MS);
  }
}

async function refundFlow(trade, early) {
  const clock = await waitForDeadline(trade.args.expiry);
  const seller = keys.refundSeller.address;
  const sellerBefore = await d.getBalance(rpc, seller);
  const ixs = [d.refundIx(trade.escrow), d.payoutNativeIx(trade.escrow, seller)];
  const settle = await sendOk('refund+payout_native (third-party fee payer)', { feePayer: keys.payer,
    instructions: ixs, signers: [keys.payer] });
  const waitedS = Math.round((Date.now() - trade.fundedWallMs) / 1000);
  const tx = await d.getTransactionLogs(rpc, settle.signature);
  await checkSettled(trade, 'native-refunded-paid', 'Refunded');
  const sellerAfter = await d.getBalance(rpc, seller);
  eq('refund: seller credited exactly amount (finalized)', sellerAfter - sellerBefore, AMOUNTS.refund);
  check('refund: block time >= deadline', tx.blockTime >= trade.args.expiry, { blockTime: tx.blockTime,
    deadline: trade.args.expiry });
  check('refund: real wall-clock wait >= 1800 s', waitedS >= MIN_DURATION_S, { waitedS });
  summary.flows.refund = { escrow: trade.escrow, amount: AMOUNTS.refund, seller,
    clockAtFunding: trade.clock.unixTimestamp,
    deadline: trade.args.expiry, acceptBefore: trade.args.acceptBefore, fundAttempts: trade.attempt,
    clockWhenDeadlineSeen: clock.unixTimestamp, refundBlockTime: tx.blockTime, refundFeePayer: keys.payer.address,
    wallClockWaitSeconds: waitedS, sellerBalanceBefore: sellerBefore, sellerBalanceAfter: sellerAfter,
    signatures: { fund: trade.fund, earlyRefundFailed: early, refundPayout: settle } };
  summary.durations.refundWallClockWaitSeconds = waitedS;
}

// ---- upgrade attempt after --final ----
async function upgradeAttempt(pdAddress, finalShaBefore) {
  const wb = cli(['program', 'write-buffer', SO_PATH, '--buffer', keys.bufferPath, '--buffer-authority',
    keys.authorityPath, '--use-rpc'], { timeoutMs: 300_000 });
  const buffer = keys.buffer.address;
  const viaCli = cli(['program', 'upgrade', buffer, d.PROGRAM_ID, '--upgrade-authority', keys.authorityPath],
    { allowFail: true });
  check('CLI `solana program upgrade` refused', viaCli.status !== 0, { status: viaCli.status,
    stderr: viaCli.stderr.split('\n').slice(-3).join(' | ') });
  const ix = d.loaderUpgradeIx({ programId: d.PROGRAM_ID, programData: pdAddress, buffer,
    spill: keys.payer.address, authority: keys.authority.address });
  const res = await d.sendTx(rpc, { feePayer: keys.payer, instructions: [ix], signers: [keys.payer, keys.authority],
    skipPreflight: true });
  const st = await d.waitForSignature(rpc, res.signature, 'finalized', FINALIZE_TIMEOUT_MS);
  eq('raw loader-v3 Upgrade fails on chain with Immutable', JSON.stringify(st.err),
    JSON.stringify({ InstructionError: [0, 'Immutable'] }));
  const after = await inspectProgram();
  eq('ProgramData bytes unchanged after upgrade attempts', after.hashes.programDataSha256, finalShaBefore);
  summary.program.upgradeAttempt = { buffer, writeBufferOutput: wb.stdout.split('\n').slice(-1)[0],
    cliUpgradeExit: viaCli.status, cliUpgradeError: viaCli.stderr.split('\n').slice(-3).join(' | '),
    rawUpgrade: { signature: res.signature, slot: st.slot, commitment: st.confirmationStatus, err: st.err },
    programDataSha256After: after.hashes.programDataSha256 };
}

// ---- fixture ----
const SNAPSHOT_ORDER = ['native-funded', 'native-released-paid', 'native-refunded-paid', 'spl-funded',
  'spl-released-paid'];

function writeFixture() {
  const escrows = SNAPSHOT_ORDER.map((label) => {
    const s = fixture.escrows.find((e) => e.label === label);
    if (!s) throw new Error(`fixture: missing snapshot ${label}`);
    return s;
  });
  const order = ['native-release', 'native-refund', 'spl-release'];
  const trades = order.map((t) => fixture.trades.find((x) => x.trade === t));
  const body = {
    format: 'p2p-offramp/solana-localnet-accounts/v1',
    note: 'Finalized getAccountInfo bytes from a real local solana-test-validator. Synthetic program id, '
      + 'mints and compiled genesis; not a cluster deployment.',
    validator: { solanaCore: summary.validator.rpcVersion['solana-core'],
      featureSet: summary.validator.rpcVersion['feature-set'], genesisHash: summary.validator.genesisHash,
      deactivatedFeatures: summary.validator.deactivatedFeatures },
    sbpfVersion: summary.sbpf.version,
    program: fixture.program, programData: fixture.programData, trades, escrows,
  };
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(body, null, 2) + '\n');
  summary.fixture = FIXTURE_PATH;
  log(`wrote ${FIXTURE_PATH}`);
}

// ---- main ----
async function startMainValidator() {
  const mintFiles = writeMintFiles();
  const legacy = summary.sbpf.version < 3;
  if (legacy) await probeSimd0500(mintFiles);
  const deactivate = legacy ? [SIMD0500_FEATURE] : [];
  if (legacy) {
    summary.deviations.push(`SBPF v${summary.sbpf.version} ELF: main validator runs with SIMD-0500 `
      + `(${SIMD0500_FEATURE}, disable_sbpf_v0_v1_v2_deployment) deactivated so --final is accepted`);
  }
  Object.assign(summary.validator, await startValidator(mintFiles, { label: 'main', ledger: LEDGER, deactivate }));
}

async function main() {
  preflight();
  checkIdl();
  await assertPortFree();
  setupKeys();
  await startMainValidator();
  const finalProg = await deployAndFinalize();
  await fundWallets();
  const refundTrade = await startRefundTrade();
  const early = await earlyRefundMustFail(refundTrade);
  await nativeReleaseFlow();
  await splReleaseFlow();
  await upgradeAttempt(finalProg.pdAddress, finalProg.hashes.programDataSha256);
  if (SKIP_REFUND) check('refund flow executed (skipped by SOLANA_LOCALNET_SKIP_REFUND_WAIT)', false);
  else await refundFlow(refundTrade, early);
}

try {
  await main();
} catch (e) {
  summary.error = e.stack ?? String(e);
  log(`ERROR ${e.stack ?? e}`);
}
await stopValidator();
summary.durations.totalSeconds = sinceStart();
summary.ok = summary.error === null && summary.checks.length > 0 && summary.checks.every((c) => c.ok);
if (summary.ok && SO_PATH === DEFAULT_SO) {
  try {
    writeFixture();
  } catch (e) {
    summary.ok = false;
    summary.error = `fixture: ${e.stack ?? e}`;
  }
}
summary.finishedAt = new Date().toISOString();
const out = JSON.stringify(summary, null, 2);
writeFileSync(join(WORKDIR, 'summary.json'), out + '\n');
console.log(out);
process.exitCode = summary.ok ? 0 : 1;
