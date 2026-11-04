#!/usr/bin/env node
/** Actual retention UI -> AppServices -> private Worker/G02/G01/G12 -> owned Anvil. LOCALPROOF only. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { resolveTool } from './lib/tool-path.mjs';
import { rpcClient, checkToolchain, forgeEnv } from './sepolia/lib.mjs';
import { keccak256 } from '../packages/wallet/src/evm-terms.ts';
import { buildPendingWithdrawals } from '../packages/wallet/src/evm-escrow.ts';
const root = fileURLToPath(new URL('../', import.meta.url)), output = await mkdtemp(resolve(tmpdir(), 'p2p-retention-'));
const run = promisify(execFile), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const env = { ...process.env, PATH: `${process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`}:${process.env.PATH ?? ''}` };
const PASS = 'Synthetic local retention browser passphrase', transactions = [], withdrawals = [], reads = [], errors = [], cases = [];
let server, browser, anvil, hold, pendingGate, cleanupPromise, report, fault = null, phase = 'seed', unexpected = 0, nativeJournalPutWrites = 0;
const freePort = () => new Promise((done, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); }); });
function cleanup() {
  return cleanupPromise ??= (async () => {
    hold?.release(); pendingGate?.release(); hold = undefined; pendingGate = undefined;
    let failure;
    try { await browser?.close(); browser = undefined; } catch (error) { failure = error; }
    try { if (server) { const closed = new Promise(done => server.close(done)); server.closeAllConnections(); await closed; server = undefined; } }
    catch (error) { failure ??= error; }
    if (anvil?.pid && anvil.exitCode === null && anvil.signalCode === null) {
      const exited = new Promise(done => anvil.once('exit', done)); anvil.kill('SIGTERM');
      const timer = setTimeout(() => anvil?.kill('SIGKILL'), 2000); await exited; clearTimeout(timer);
    }
    if (failure) throw failure;
  })();
}
const terminate = () => { process.exitCode = 1; void cleanup(); };
process.once('SIGTERM', terminate); process.once('SIGINT', terminate);
async function sourceSnapshot() {
  const pins = new Map(); let bytes = 0, nodes = 0;
  const walk = async (relative, depth = 0) => {
    if (depth > 32 || ++nodes > 50000) throw Error('SOURCE_INVENTORY_LIMIT');
    for (const item of await readdir(resolve(root, relative), { withFileTypes: true })) {
      if (['.git', 'out', 'cache', 'dist'].includes(item.name)) continue;
      const path = relative + '/' + item.name;
      if (item.isDirectory()) await walk(path, depth + 1);
      else if (item.isFile() && /\.(?:ts|tsx|mjs|js|json|sol)$/.test(item.name)) {
        if (++nodes > 50000) throw Error('SOURCE_INVENTORY_LIMIT');
        const content = await readFile(resolve(root, path)); bytes += content.length;
        if (bytes > 256 * 1024 * 1024) throw Error('SOURCE_INVENTORY_LIMIT'); pins.set(path, sha(content));
      }
    }
  };
  for (const path of ['apps/web/src', 'packages', 'scripts', 'node_modules', 'contracts/evm/src', 'contracts/evm/test', 'contracts/evm/lib']) await walk(path);
  for (const path of ['package.json', 'package-lock.json', 'contracts/evm/foundry.toml']) pins.set(path, sha(await readFile(resolve(root, path))));
  return pins;
}
try {
  const beforeSources = await sourceSnapshot();
  const toolchain = await checkToolchain(env), port = await freePort(), rpcURL = `http://127.0.0.1:${port}`, rpc = rpcClient(rpcURL, { timeoutMs: 10000 });
  anvil = spawn(resolveTool('anvil'), ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', '31337', '--slots-in-an-epoch', '1'], { env: forgeEnv(env), stdio: 'ignore' });
  for (let n = 0;; n++) { try { await rpc('eth_chainId'); break; } catch { if (n === 100) throw Error('ANVIL_UNAVAILABLE'); await new Promise(done => setTimeout(done, 50)); } }
  const deploy = async (target, args = []) => {
    const result = await run('forge', ['create', target, '--rpc-url', rpcURL, '--private-key',
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', '--broadcast', '--json', ...(args.length ? ['--constructor-args', ...args] : [])],
    { cwd: resolve(root, 'contracts/evm'), env: forgeEnv(env, { FOUNDRY_OFFLINE: 'true' }), timeout: 30000, maxBuffer: 1 << 20 });
    return JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).deployedTo.toLowerCase();
  };
  const escrow = await deploy('src/BasicEscrow.sol:BasicEscrow', ['[]']);
  const receiver = await deploy('test/mocks/Mocks.sol:RevertingReceiver');
  await rpc('anvil_mine', ['0x5']);
  const accounts = await rpc('eth_accounts'), domain = { chainId: '31337', verifyingContract: escrow };
  const registry = JSON.parse(await readFile(resolve(root, 'packages/domain/test/fixtures/local-evm-scenario/registry.json')));
  const network = registry.networks[0]; network.genesisHash = (await rpc('eth_getBlockByNumber', ['0x0', false])).hash;
  network.endpoints = [{ id: 'local-node', url: rpcURL + '/' }]; network.assets = network.assets.filter(a => a.kind === 'native');
  network.deployments = [{ ...network.deployments[0], address: escrow, supportedAssetIds: ['native'], runtime: {
    kind: 'evm-code', upgradeable: false, keccak256: Buffer.from(keccak256(Buffer.from((await rpc('eth_getCode', [escrow, 'latest'])).slice(2), 'hex'))).toString('hex') } }];
  const scenario = JSON.parse(await readFile(resolve(root, 'packages/domain/test/fixtures/local-evm-scenario/scenario.json'))).sets.native;
  const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const terms = { ...scenario.terms, seller: accounts[0], buyer: receiver, acceptBeforeSeconds: String(now + 3600), escrowExpirySeconds: String(now + 7200) };
  const configuration = { registry, registryDigest: sha(JSON.stringify(registry)), terms, domain,
    document: { format: 'p2p-offramp/local-terms-review/v1', terms, privateAgreement: scenario.privateAgreementInput } };
  const modules = new Set();
  for (const [name, entry] of [['browser', 'retention-browser.tsx'], ['worker', 'retention-worker.mjs']]) await build({ configFile: false, logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [{ name: 'retention-source-closure', generateBundle() {
      for (const id of this.getModuleIds()) if (id.startsWith(root)) modules.add(id.split('?')[0]);
    } }],
    build: { outDir: output, emptyOutDir: name === 'browser', target: 'es2023', minify: false, sourcemap: false,
      lib: { entry: resolve(root, 'scripts/fixtures', entry), formats: ['es'], fileName: () => `retention-${name}.js` } } });
  for (const suffix of ['apps/web/src/app-services.ts', 'apps/web/src/ui/RetentionPanel.tsx', 'apps/web/src/runtime/worker-endpoint.ts',
    'apps/web/src/retention/native-retention.ts', 'packages/storage/src/idb-vault-store.ts', 'packages/identity/src/identity-service.ts',
    'packages/domain/src/tx-lifecycle.ts', 'packages/messaging/src/durable-chat.ts']) assert.ok([...modules].some(p => p.endsWith(suffix)), suffix);
  const assetPaths = [];
  async function collect(path = '') { for (const item of await readdir(resolve(output, path), { withFileTypes: true })) {
    const name = path ? path + '/' + item.name : item.name; if (item.isDirectory()) await collect(name); else assetPaths.push(name);
  } }
  await collect();
  const readMethods = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getTransactionCount', 'eth_getTransactionByHash', 'eth_getTransactionReceipt']);
  const creditSelector = buildPendingWithdrawals(escrow, receiver, terms.asset).data.slice(0, 10);
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      if (path === '/rpc' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 131072) throw Error('RPC_BODY_LIMIT'); }
        const input = JSON.parse(body); assert.ok(readMethods.has(input.method) || phase === 'seed' && ['eth_accounts', 'eth_sendTransaction', 'anvil_mine'].includes(input.method));
        if (input.method === 'eth_sendTransaction') { assert.equal(phase, 'seed'); assert.equal(input.params[0].to, escrow); transactions.push({ phase, method: input.method }); }
        else reads.push({ phase, method: input.method });
        if (hold && input.method === 'eth_getCode') { const gate = hold; hold = undefined; pendingGate = gate; gate.started(); await gate.wait; pendingGate = undefined; }
        let result = await rpc(input.method, input.params ?? []);
        if (fault === 'credit' && input.method === 'eth_call' && input.params[0].data.startsWith(creditSelector)) result = '0x01';
        if (fault === 'anchor' && input.method === 'eth_getBlockByNumber' && /^0x[1-9a-f]/.test(input.params[0])) result = { ...result, hash: '0x' + 'f'.repeat(64) };
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result })); return;
      }
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>LOCALPROOF retention</title><div id="root"></div><script type="module" src="/retention-browser.js"></script>'); return; }
      if (path === '/configuration.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(configuration)); return; }
      if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const target = resolve(output, '.' + path);
      if (!target.startsWith(output + sep) || !assetPaths.includes(path.slice(1))) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(target));
    } catch (error) { errors.push(String(error)); res.writeHead(500); res.end(JSON.stringify({ error: { code: -32000 } })); }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); }); const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin) return route.continue(); unexpected++; return route.abort(); });
  await context.routeWebSocket('**/*', socket => { unexpected++; socket.close(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(String(error))); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); page.on('dialog', dialog => { unexpected++; void dialog.dismiss(); });
  await page.goto(origin); await page.getByRole('heading', { name: 'LOCALPROOF native retention', exact: true }).waitFor();
  const fixture = async name => { await page.locator(`[data-fixture="${name}"]`).click(); await page.locator('[data-fixture-status]').filter({ hasText: `${name} complete` }).waitFor(); };
  await fixture('create'); await fixture('seed'); phase = 'review';
  const original = await page.evaluate(() => window.__retention.stats()), profileId = original.profileId;
  assert.deepEqual([original.identity, original.journal, original.review, original.chat, original.total], [1, 2, 1, 1, 5]);
  const row = id => page.evaluate(id => new Promise((done, fail) => { const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onerror = () => fail(Error('IDB')); request.onsuccess = () => { const db = request.result, tx = db.transaction('vaults', 'readonly'), get = tx.objectStore('vaults').get(id);
      get.onsuccess = () => done(get.result); tx.oncomplete = () => db.close(); }; }), id);
  const sourceBefore = await row(profileId); const pendingDownload = page.waitForEvent('download'); await fixture('export');
  const oldFile = resolve(output, 'old-backup.json'); await (await pendingDownload).saveAs(oldFile);
  const oldBytes = await readFile(oldFile), oldDigest = sha(oldBytes), oldEncoded = oldBytes.toString('base64');
  const panel = page.locator('section[aria-labelledby="retention-title"]');
  async function preview(kind) {
    const count = await page.evaluate(() => window.__retention.seen.previews.length);
    await panel.getByRole('button', { name: kind === 'plan' ? 'Preview local records offline' : 'Check native deletion eligibility', exact: true }).click();
    await page.waitForFunction(count => window.__retention.seen.previews.length > count, count);
    await panel.getByRole('button', { name: 'Preview local records offline', exact: true }).waitFor({ state: 'visible' });
    return page.evaluate(() => window.__retention.seen.previews.at(-1));
  }
  async function unchanged(action, expectedEligible) {
    const before = await page.evaluate(() => window.__retention.stats()), envelope = await row(before.profileId), sent = transactions.length;
    const nonce = await rpc('eth_getTransactionCount', [accounts[0], 'pending']);
    const value = await action(); assert.equal(value.reviewedDeleteCount, expectedEligible);
    const after = await page.evaluate(() => window.__retention.stats()); nativeJournalPutWrites += after.journalPutWrites - before.journalPutWrites;
    assert.equal(after.writes, before.writes); assert.equal(after.journalPutWrites, before.journalPutWrites); assert.deepEqual(await row(before.profileId), envelope);
    assert.equal(transactions.length, sent); assert.equal(await rpc('eth_getTransactionCount', [accounts[0], 'pending']), nonce); return value;
  }
  const readsBefore = reads.length; await unchanged(() => preview('plan'), 0);
  assert.equal(reads.length, readsBefore); assert.equal((await page.evaluate(() => window.__retention.stats())).factories, 0); cases.push('offline preview acquires no native provider or RPC');
  assert.equal(BigInt(await rpc('eth_call', [{ to: escrow, data: buildPendingWithdrawals(escrow, receiver, terms.asset).data }, 'finalized'])), BigInt(terms.amountBaseUnits));
  await unchanged(() => preview('review'), 0); cases.push('actual released escrow with deferred credit protects complete closure');
  const calldata = async (signature, ...args) => (await run('cast', ['calldata', signature, ...args], { env: forgeEnv(env), timeout: 5000, maxBuffer: 8192 })).stdout.trim();
  withdrawals.push(await rpc('eth_sendTransaction', [{ from: accounts[2], to: receiver, data: await calldata('setAccept(bool)', 'true') }]));
  withdrawals.push(await rpc('eth_sendTransaction', [{ from: accounts[2], to: escrow, data: await calldata('withdraw(address,address)', receiver, terms.asset) }]));
  await rpc('anvil_mine', ['0x5']);
  assert.equal(BigInt(await rpc('eth_call', [{ to: escrow, data: buildPendingWithdrawals(escrow, receiver, terms.asset).data }, 'finalized'])), 0n);
  const nonceBaseline = await Promise.all(accounts.map(account => rpc('eth_getTransactionCount', [account, 'pending'])));
  for (const mode of ['credit', 'anchor']) { fault = mode; await unchanged(() => preview('review'), 0); fault = null; cases.push(`${mode} uncertainty protects all records`); }
  const eligible = await unchanged(() => preview('review'), 4); assert.equal(eligible.protectedCount, 1); cases.push('actual finalized zero-credit native closure authenticates journal, terms and NIP17 history');
  for (const operation of ['cancel', 'lock']) {
    let start, release; const started = new Promise(done => start = done), wait = new Promise(done => release = done); hold = { started: start, wait, release };
    const before = await row(profileId), counters = await page.evaluate(() => window.__retention.stats()), count = await page.evaluate(() => window.__retention.seen.previews.length);
    await panel.getByRole('button', { name: 'Check native deletion eligibility', exact: true }).click();
    let deadline;
    try { await Promise.race([started, new Promise((_done, fail) => { deadline = setTimeout(() => fail(Error('NATIVE_HOLD_NOT_REACHED')), 30000); })]); }
    finally { clearTimeout(deadline); }
    if (operation === 'cancel') await panel.getByRole('button', { name: 'Cancel retention operation', exact: true }).click(); else await fixture('lock');
    release(); await page.waitForFunction(() => !document.querySelector('section[aria-labelledby="retention-title"]')?.textContent?.includes('Checking the selected profile'));
    assert.deepEqual(await row(profileId), before); assert.equal(await page.evaluate(() => window.__retention.seen.previews.length), count);
    assert.equal(await panel.getByRole('checkbox', { name: /^I reviewed this exact revision/ }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Delete the reviewed eligible group', exact: true }).count(), 0);
    await fixture('unlock');
    const after = await page.evaluate(() => window.__retention.stats()); nativeJournalPutWrites += after.journalPutWrites - counters.journalPutWrites;
    assert.equal(after.writes, counters.writes); assert.equal(after.journalPutWrites, counters.journalPutWrites); await preview('plan');
    cases.push(`${operation} discards held native reply without writes`);
  }
  await preview('review'); const beforeDelete = await page.evaluate(() => window.__retention.stats()), deletes = await page.evaluate(() => window.__retention.seen.deletes.length);
  const remove = panel.getByRole('button', { name: 'Delete the reviewed eligible group', exact: true }); assert.equal(await remove.isEnabled(), false);
  await panel.getByRole('checkbox', { name: /^I reviewed this exact revision/ }).check(); phase = 'delete'; await remove.click();
  await page.waitForFunction(n => window.__retention.seen.deletes.length === n + 1, deletes);
  const afterDelete = await page.evaluate(() => window.__retention.stats()); nativeJournalPutWrites += afterDelete.journalPutWrites - beforeDelete.journalPutWrites;
  assert.equal(afterDelete.writes, beforeDelete.writes + 1); assert.equal(afterDelete.journalPutWrites, beforeDelete.journalPutWrites); phase = 'review';
  assert.deepEqual([afterDelete.total, afterDelete.identity, afterDelete.journal, afterDelete.review, afterDelete.chat], [1, 1, 0, 0, 0]);
  const deletedSource = await row(profileId); assert.notDeepEqual(deletedSource, sourceBefore); assert.equal(sha(await readFile(oldFile)), oldDigest); cases.push('one consented CAS deletes entire eligible group and preserves identity/old backup');
  await page.evaluate(encoded => window.__retention.restore(encoded), oldEncoded); await preview('plan'); const stale = await preview('review');
  await page.evaluate(() => window.__retention.secondWorkerWrite()); const changedProfile = stale.profileId, changed = await row(changedProfile);
  const refused = await page.evaluate(preview => window.__retention.staleDelete(preview), stale); assert.equal(refused.ok, false); assert.deepEqual(await row(changedProfile), changed); cases.push('actual second Worker revision change refuses stale consent without another write');
  for (const kind of ['unknown', 'future', 'foreign', 'imported', 'large']) {
    await page.evaluate(encoded => window.__retention.restore(encoded), oldEncoded); await page.evaluate(kind => window.__retention.mutate(kind), kind);
    await preview('plan'); const result = await unchanged(() => preview('review'), 0); assert.ok(result.protectedCount >= 6); cases.push(`${kind} dependency protects the complete restored closure`);
  }
  await fixture('lock'); await page.locator('[data-fixture="show-recovery"]').click();
  const restore = page.locator('form[aria-label="Restore an encrypted file"]'); await restore.waitFor();
  await page.locator('#restore-file').setInputFiles(oldFile); await page.locator('#restore-source').fill(PASS);
  await page.locator('#restore-passphrase').fill(PASS); await page.locator('#restore-confirm').fill(PASS); await restore.locator('input[name="consent"]').check();
  const priorRestore = await page.evaluate(() => window.__retention.seen.restores.length); await restore.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
  await page.waitForFunction(n => window.__retention.seen.restores.length > n, priorRestore);
  const restored = await page.evaluate(() => window.__retention.seen.restores.at(-1)); assert.equal(restored.records, 5);
  assert.equal(await page.evaluate(() => window.__retention.seen.deletes.at(-1).deletedCount), 4);
  assert.ok((await page.locator('[data-fixture-recovery]').textContent()).includes('Restoring an older backup can bring back records that you previously deleted.'));
  await page.evaluate(id => window.__retention.unlock(id), restored.newProfileId); const returned = await page.evaluate(() => window.__retention.stats()); assert.equal(returned.total, 5);
  assert.deepEqual(await row(profileId), deletedSource); assert.equal(sha(await readFile(oldFile)), oldDigest); cases.push('actual Recovery UI warns and fresh-key old-backup restore reintroduces copies without changing deleted source');
  assert.equal(transactions.length, 2); assert.equal(nativeJournalPutWrites, 0); assert.equal(unexpected, 0); assert.deepEqual(errors, []);
  assert.deepEqual(await Promise.all(accounts.map(account => rpc('eth_getTransactionCount', [account, 'pending']))), nonceBaseline);
  assert.equal((await page.locator('body').textContent()).includes('SYNTHETIC RETENTION PRIVATE HISTORY'), false);
  const sourcePaths = new Set([...modules].map(path => path.slice(root.length)));
  for (const path of beforeSources.keys()) if (path.startsWith('contracts/evm/') && (path.endsWith('.sol') || path.endsWith('foundry.toml'))) sourcePaths.add(path);
  for (const path of ['package.json', 'package-lock.json', 'scripts/test-retention-browser.mjs', 'scripts/sepolia/lib.mjs', 'scripts/test-support/register-tsx.mjs']) sourcePaths.add(path);
  const sourceInputs = [];
  for (const path of [...sourcePaths].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) {
    const actual = sha(await readFile(resolve(root, path)));
    assert.equal(beforeSources.get(path), actual, `source changed during native/browser run: ${path}`); sourceInputs.push({ path, sha256: actual });
  }
  const emittedAssets = await Promise.all([...assetPaths].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map(async path => ({ path, sha256: sha(await readFile(resolve(output, path))) })));
  report = { fixture: 'actual-native-mixed-retention-worker-ui', browser: browser.version(), toolchain,
    runtimeVersions: { node: process.version, playwright: JSON.parse(await readFile(resolve(root, 'node_modules/playwright-core/package.json'))).version,
      vite: JSON.parse(await readFile(resolve(root, 'node_modules/vite/package.json'))).version },
    cases, explicitSeedSends: transactions.length, explicitWithdrawalSends: withdrawals.length, withdrawalTransactions: withdrawals,
    reviewDeleteSends: transactions.filter(t => t.phase !== 'seed').length, unchangedNativeSignerNonces: true, nativeReconciliationJournalPutWrites: nativeJournalPutWrites,
    reviewRPCs: reads.filter(read => read.phase === 'review').length, deleteRPCs: reads.filter(read => read.phase === 'delete').length,
    oneConsentedCAS: true, retainedIdentity: true, sourceOldBackupSha256: oldDigest, sourcePreservedAcrossRestore: true,
    actualG01Authentication: true, actualIndexedDB: true, actualDeferredCredit: true, externalRequests: unexpected,
    moduleSources: [...modules].filter(p => p.startsWith(root)).map(p => p.slice(root.length)).sort((left, right) => left < right ? -1 : left > right ? 1 : 0), sourceInputs, emittedAssets, sourceStableBeforeAndAfter: true, releaseEnabled: false,
    limits: ['Local Chromium/Anvil native asset fixture only; no ERC20/Solana/device/production acceptance.', 'Clock/identity/deletion mechanics have separate unit coverage; no memory-erasure or off-device retention claim.'] };
} catch (error) { console.error(JSON.stringify({ phase, completedCases: cases, observedErrors: errors })); throw error; }
finally { await cleanup(); await rm(output, { recursive: true, force: true }); process.removeListener('SIGTERM', terminate); process.removeListener('SIGINT', terminate); }
if (report) console.log(JSON.stringify({ ...report, cleanup: { browserClosed: browser === undefined, serverClosed: server === undefined,
  ownedAnvilPid: anvil?.pid, anvilExited: anvil?.exitCode !== null || anvil?.signalCode !== null, temporaryDirectoryRemoved: true } }));
