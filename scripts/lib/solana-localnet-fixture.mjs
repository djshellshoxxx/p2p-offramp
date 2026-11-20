/** Real Agave fixture only. Starts ledger first, compiles its ACTUAL genesis, deploys/finalizes, then seeds native escrows. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createPortProbe } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';
import { resolveTool } from '../../contracts/solana/localnet/tool-path.mjs';
import * as d from '../../contracts/solana/localnet/driver.mjs';
import { createSolanaEscrowClient } from '../../packages/chain-solana/src/compose.ts';
import { createRecoveryDocument } from '../../packages/chain-solana/src/recovery.ts';
import { programDataSha256FromElf } from '../../packages/chain-solana/src/layout.ts';
import { encodeSolanaTerms } from '../../packages/domain/index.ts';
import { rejectWithheldSolanaSend } from './solana-localnet-withheld-send.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHAIN = 'solana:localnet';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const unwrap = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
export async function waitSolana(check, label, timeoutMs = 120000, intervalMs = 500) {
  const start = Date.now();
  for (;;) { if (await check()) return; if (Date.now() - start >= timeoutMs) throw Error(`Timed out: ${label}`); await d.sleep(intervalMs); }
}
function fixtureJournal() {
  const trades = new Map();
  const entry = b => trades.get(b.tradeId) ?? { revision: 0, records: new Map() };
  return { profileId: () => 'a'.repeat(32),
    async read(b) { const e = entry(b); return { ok: true, value: { revision: e.revision, records: [...e.records.values()].map(r => structuredClone(r)) } }; },
    async write(b, revision, record) {
      const e = entry(b); if (e.revision !== revision) return { ok: false, error: { code: 'CONFLICT' } };
      e.records.set(record.intentId, structuredClone(record)); e.revision++; trades.set(b.tradeId, e);
      return { ok: true, value: e.revision };
    } };
}
export async function startSolanaLocalnetFixture() {
  // Resolve all prerequisites before starting anything. No simulated fallback or skipped success exists.
  const tools = Object.fromEntries(['solana', 'solana-test-validator', 'cargo-build-sbf'].map(name => [name, resolveTool(name)]));
  const work = await mkdtemp(join(tmpdir(), 'p2p-solana-browser-')), logs = join(work, 'logs'); await mkdir(logs);
  const keys = Object.fromEntries(['payer', 'authority', 'program', 'seller', 'buyer'].map(name => [name, d.generateKeypair()]));
  for (const [name, key] of Object.entries(keys)) d.writeKeypairFile(join(work, `${name}.json`), key);
  const validatorUrl = 'http://127.0.0.1:19699/';
  const rpc = new d.Rpc(validatorUrl), children = new Set(); let validator, proxy, closed = false, beforeSend = null, withhold = false;
  const observed = [], summary = { genesisHash: null, programId: keys.program.address, programDataSha256: null,
    artifactSha256: null, validatorVersion: null, actualGenesisRpc: true, realClock: true, setupFunding: [], appSends: observed, fixtureErrors: [] };
  const close = async () => {
    if (closed) return; closed = true;
    if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(work, { recursive: true, force: true });
  };
  const onExit = () => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); };
  process.once('exit', onExit);
  async function run(name, args, env = process.env, timeoutMs = 600000) {
    const path = join(logs, `${name}-${Date.now()}.log`), fd = openSync(path, 'w');
    const child = spawn(tools[name], args, { cwd: resolve(ROOT, 'contracts/solana'), env, stdio: ['ignore', fd, fd] });
    closeSync(fd); children.add(child);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    try {
      const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
      if (code !== 0) throw Error(`${name} failed (${code}): ${(await readFile(path, 'utf8')).slice(-8000)}`);
    } finally { clearTimeout(timer); children.delete(child); }
  }
  const cli = args => run('solana', [...args, '--url', validatorUrl, '--keypair', join(work, 'payer.json'), '--commitment', 'confirmed']);
  const rpcPort = { request: ({ method, params }) => rpc.call(method, params ?? []) };
  function account(key) { return { address: key.address, publicKey: Uint8Array.from(key.publicKey), chains: [CHAIN], features: ['solana:signTransaction'] }; }
  function sign(address, transaction) {
    const key = [keys.seller, keys.buyer].find(k => k.address === address); assert.ok(key, 'fixture signs only its test role keys');
    const wire = Uint8Array.from(transaction); assert.equal(wire[0], 1); assert.ok(wire.slice(1, 65).every(b => b === 0));
    const message = wire.slice(65), signature = ed25519.sign(message, key.seed);
    return Uint8Array.from([1, ...signature, ...message]);
  }
  try {
    // A healthy process already on this port is not evidence that our newly minted ledger started.
    for (const port of [19699, 19700]) await new Promise((resolve, reject) => {
      const probe = createPortProbe(); probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
    const out = openSync(join(logs, 'validator.log'), 'w');
    validator = spawn(tools['solana-test-validator'], ['--ledger', join(work, 'ledger'), '--reset', '--quiet', '--bind-address', '127.0.0.1',
      '--rpc-port', '19699', '--faucet-port', '20700', '--gossip-port', '18801', '--dynamic-port-range', '18802-18830', '--mint', keys.payer.address],
    { stdio: ['ignore', out, out] }); closeSync(out); children.add(validator);
    let startupError; validator.once('error', error => { startupError = error; });
    await waitSolana(async () => {
      if (startupError) throw startupError;
      if (validator.exitCode !== null || validator.signalCode !== null) throw Error(`Validator exited: ${(await readFile(join(logs, 'validator.log'), 'utf8')).slice(-6000)}`);
      try {
        const healthy = await rpc.call('getHealth') === 'ok' && await rpc.call('getSlot', [{ commitment: 'finalized' }]) > 0;
        return healthy && validator.exitCode === null && validator.signalCode === null;
      } catch { return false; }
    }, 'actual validator startup');
    const version = await rpc.call('getVersion'); assert.equal(version['solana-core'], '4.1.2'); summary.validatorVersion = version;
    const genesisHash = await rpc.call('getGenesisHash'); summary.genesisHash = genesisHash;
    assert.notEqual(genesisHash, d.base58Encode(d.utf8(d.GENESIS_HASH_ASCII)), 'no synthetic genesis substitution');
    const artifactDir = join(work, 'artifacts'); await mkdir(artifactDir);
    await run('cargo-build-sbf', ['--manifest-path', 'programs/basic-escrow/Cargo.toml', '--features', 'browser-localnet', '--arch', 'v3',
      '--sbf-out-dir', artifactDir, '--', '--locked'], { ...process.env,
      P2P_SOLANA_BROWSER_FIXTURE: 'local-validator-only', P2P_SOLANA_BROWSER_GENESIS_HEX: Buffer.from(d.decodeKey(genesisHash)).toString('hex'),
      P2P_SOLANA_BROWSER_PROGRAM_ID: keys.program.address });
    const soPath = join(artifactDir, 'basic_escrow.so'), so = new Uint8Array(await readFile(soPath)); summary.artifactSha256 = sha(so);
    // Agave v4.1.2 cli/src/program.rs supports exact max-len. This immutable fixture needs no upgrade padding.
    assert.ok(so.length > 0 && so.length <= 1048576, 'program fits the native reader ProgramData bound');
    await cli(['program', 'deploy', soPath, '--max-len', String(so.length), '--program-id', join(work, 'program.json'), '--upgrade-authority', join(work, 'authority.json')]);
    await cli(['program', 'set-upgrade-authority', keys.program.address, '--final', '--upgrade-authority', join(work, 'authority.json')]);
    let programData;
    await waitSolana(async () => {
      programData = await d.getAccount(rpc, d.programDataAddress(keys.program.address), 'finalized');
      return programData !== null && d.decodeProgramDataHeader(programData.data).upgradeAuthority === null;
    }, 'immutable deployed program at finalized');
    assert.equal(Buffer.from(programData.data.slice(45, 45 + so.length)).equals(Buffer.from(so)), true);
    summary.programDataSha256 = programDataSha256FromElf(so, programData.data.length);
    // The independent proxy observes each physical app send, checks its encrypted marker, then forwards unchanged.
    proxy = createServer(async (request, response) => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
      if (request.method === 'OPTIONS') { response.writeHead(204, cors).end(); return; }
      try {
        let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 16384) throw Error('request bound'); }
        const raw = JSON.parse(body);
        if (raw.method === 'sendTransaction') {
          assert.ok(beforeSend, 'independent marker observer must be installed before app sends');
          const proof = await beforeSend(raw.params[0]);
          assert.deepEqual(raw.params[1], { encoding: 'base64', skipPreflight: true, maxRetries: 0 });
          const withheld = withhold; withhold = false; observed.push({ ...proof, withheld });
          if (withheld) { rejectWithheldSolanaSend(response, cors); return; }
        }
        const answer = await fetch(validatorUrl, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
        const result = await answer.text(); response.writeHead(answer.status, { ...cors, 'Content-Type': 'application/json' }).end(result);
      } catch (error) { summary.fixtureErrors.push(error.message); response.writeHead(500, { ...cors, 'Content-Type': 'text/plain' }).end('Fixture refused.'); console.error(error); }
    });
    await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
    const rpcUrl = `http://127.0.0.1:${proxy.address().port}/`;
    const network = { id: 'solana-localnet', chain: 'solana', chainIdentity: genesisHash, genesisHash, environment: 'local',
      endpoints: [{ id: 'local-rpc', url: rpcUrl }], finality: { kind: 'solana-commitment', commitment: 'finalized' },
      assets: [{ id: 'sol', kind: 'native', address: null, decimals: 9, transferPolicy: 'exact-transfer' }], deployments: [{ id: 'escrow-v1',
        address: keys.program.address, protocolVersion: 1, artifactSha256: summary.artifactSha256,
        runtime: { kind: 'solana-program', programDataSha256: summary.programDataSha256, upgradeAuthority: null }, supportedAssetIds: ['sol'] }] };
    const registryJson = JSON.stringify({ version: 1, releaseId: 'solana-local-browser-fixture', networks: [network] });
    const view = { network: id => id === network.id ? network : null,
      deployment: (id, deployment) => id === network.id && deployment === 'escrow-v1' ? network.deployments[0] : null };
    // Setup funds are held by Node fixture keys, never bundled or sent to the browser.
    for (const key of [keys.seller, keys.buyer]) {
      const sig = await rpc.call('requestAirdrop', [key.address, 10_000_000_000]); await d.waitForSignature(rpc, sig, 'finalized', 120000);
    }
    const wallet = { features: {
      'standard:connect': { version: '1.0.0', async connect() { return { accounts: [account(keys.seller), account(keys.buyer)] }; } },
      'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], async signTransaction(input) { return [{ signedTransaction: sign(input.account.address, input.transaction) }]; } },
    } };
    const client = createSolanaEscrowClient({ rpc: rpcPort, registry: view, wallet, journal: fixtureJournal(), clock: { now: Date.now },
      margins: { submitMarginSeconds: '10', releaseMarginSeconds: '300' }, walletChain: CHAIN });
    const documents = {};
    for (const name of ['refund', 'release', 'rebuild', 'absent']) {
      const now = (await d.readClock(rpc, 'finalized')).unixTimestamp;
      const terms = { genesisHash, programId: keys.program.address, orderId: randomBytes(32).toString('hex'), seller: keys.seller.address,
        buyer: keys.buyer.address, assetKind: 'native', mint: null, tokenProgram: null, amountBaseUnits: '100000000',
        privateAgreementHash: sha(Buffer.from(`fixture agreement ${name}`)), capabilitiesHash: sha(new Uint8Array([0])), sellerNonce: randomBytes(32).toString('hex'),
        revision: '1', acceptBeforeSeconds: String(now + 600), escrowExpirySeconds: String(now + (name === 'refund' ? 1950 : 7200)) };
      const binding = { chain: 'solana', networkId: network.id, deploymentId: 'escrow-v1', tradeId: sha(encodeSolanaTerms(terms)) };
      const trade = unwrap(client.bind(binding, terms));
      if (name !== 'absent') {
        const session = unwrap(await client.connect(trade, 'seller'));
        const submitted = unwrap(await client.fund(trade, session)); summary.setupFunding.push({ name, signature: submitted.signature, deadline: terms.escrowExpirySeconds });
        await waitSolana(async () => { unwrap(await client.reconcile(trade)); const read = unwrap(await client.read(trade)); return read.escrow?.state === 'funded'; }, `${name} original funding`);
      }
      documents[name] = unwrap(createRecoveryDocument(trade));
    }
    client.dispose();
    return { documents, summary, rpcUrl, rpc, seller: keys.seller.address, buyer: keys.buyer.address,
      buildOption: { registryJson, registrySha256: sha(Buffer.from(registryJson)), rpcUrl, margins: { submitMarginSeconds: '300', releaseMarginSeconds: '300' } },
      account: () => account(keys.seller), sign: transaction => sign(keys.seller.address, Buffer.from(transaction, 'base64')),
      observeSends(fn) { beforeSend = fn; }, withholdNextSend() { withhold = true; },
      async close() { process.removeListener('exit', onExit); await close(); } };
  } catch (error) { process.removeListener('exit', onExit); await close(); throw error; }
}
