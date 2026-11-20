/** Emitted Solana App/Worker and IndexedDB profile lifecycle only. No validator, RPC or signing. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { configOption } from '../apps/web/test/solana-localnet-support.mjs';
import { buildSolanaLocalnetContentPolicy } from '../packages/security/src/content-policy.ts';
import { openEnvelope, disposeMaterial } from '../packages/storage/src/vault-crypto.ts';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const PASS = 'public browser restore source passphrase', DEST = 'public browser restore destination passphrase';
const wait = async (check, label) => {
  const start = Date.now();
  while (!await check()) { if (Date.now() - start >= 45000) throw Error(`Timed out: ${label}`); await new Promise(done => setTimeout(done, 50)); }
};
export async function buildSolanaRestoreArtifact(outDir) {
  // Structural identity only: this diagnostic never imports a trade or reads/sends to this endpoint.
  const option = configOption(), evidence = await buildWeb({ delivery: 'solana-localnet', outDir, solanaLocalnet: option });
  assert.equal(evidence.ReleaseEnabled, 0);
  const files = new Map(await Promise.all(evidence.assets.map(async asset => [asset.path, await readFile(join(outDir, asset.path))])));
  const graph = JSON.parse(files.get('core-graph-document.json').toString()).modules;
  const workerGraph = JSON.parse(files.get('core-graph-worker.json').toString()).modules;
  for (const path of ['apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx', 'apps/web/src/solana-localnet/client.ts']) assert.ok(graph.some(item => item.path === path));
  assert.ok(workerGraph.some(item => item.path === 'apps/web/src/solana-localnet/controller.ts'));
  return { evidence, files, headers: buildSolanaLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', rpcOrigin: new URL(option.rpcUrl).origin }).headers };
}
async function encryptedRow(page, profileId) {
  return page.evaluate(id => new Promise((yes, no) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onerror = () => no(Error('Encrypted row inspection failed'));
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('vaults', 'readonly'), get = tx.objectStore('vaults').get(id);
      get.onsuccess = () => yes(get.result); get.onerror = () => no(Error('Encrypted row read failed'));
      tx.oncomplete = () => db.close(); tx.onabort = () => db.close();
    };
  }), profileId);
}

export async function runSolanaRestoreBrowser() {
  const temporary = await mkdtemp(join(tmpdir(), 'p2p-solana-restore-browser-'));
  let server, browser;
  const unexpected = [], failures = [], workers = [];
  try {
    const { evidence, files, headers } = await buildSolanaRestoreArtifact(join(temporary, 'app'));
    server = createServer((request, response) => {
      if (request.method !== 'GET') { unexpected.push(`HTTP ${request.method}`); response.writeHead(405).end(); return; }
      const path = request.url === '/' ? 'index.html' : request.url?.slice(1), bytes = files.get(path);
      if (!bytes) { response.writeHead(404).end(); return; }
      const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/json';
      response.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes);
    });
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin === origin && request.method() === 'GET') return route.continue();
      unexpected.push(`${request.method()} ${request.url()}`); return route.abort();
    });
    await context.routeWebSocket(() => true, socket => { unexpected.push(socket.url()); socket.close(); });
    await context.addInitScript(() => {
      const NativeWorker = window.Worker, nativeRead = File.prototype.arrayBuffer;
      const commands = [], buffers = [], workerUrls = [];
      let armLock = false, held = null, fileGate = null, walletCalls = 0, walletRequests = 0;
      const invoke = (listener, event, owner) => typeof listener === 'function' ? listener.call(owner, event) : listener.handleEvent(event);
      // Retain actual native Workers and payloads. Only delivery of one lock's real responses is delayed.
      window.Worker = class extends NativeWorker {
        wrappers = new Map();
        constructor(url, options) { super(url, options); workerUrls.push(String(url)); }
        postMessage(...args) {
          const message = args[0];
          if (message?.kind === 'command') {
            commands.push(message.command.type);
            if (armLock && message.command.type === 'profile.lock') { armLock = false; held = { id: message.id, events: [], result: false, locked: false }; }
          }
          return super.postMessage(...args);
        }
        addEventListener(type, listener, options) {
          if (type !== 'message') return super.addEventListener(type, listener, options);
          const wrapped = event => {
            if (event.data?.kind === 'wallet.request') walletRequests++;
            if (held) {
              if (held.events.length >= 16) throw Error('Excess lock responses');
              held.events.push({ listener, event, owner: this });
              if (event.data?.kind === 'snapshot' && event.data.snapshot.profileId === null) held.locked = true;
              if (event.data?.kind === 'result' && event.data.id === held.id) held.result = true;
              return;
            }
            invoke(listener, event, this);
          };
          this.wrappers.set(listener, wrapped); return super.addEventListener(type, wrapped, options);
        }
        removeEventListener(type, listener, options) { return super.removeEventListener(type, type === 'message' ? this.wrappers.get(listener) ?? listener : listener, options); }
      };
      File.prototype.arrayBuffer = async function () {
        const bytes = await nativeRead.call(this); buffers.push(bytes);
        if (fileGate) { const gate = fileGate; gate.entered = true; await gate.promise; }
        return bytes;
      };
      window.__solanaRestoreFixture = {
        armLock() { if (held || armLock) throw Error('Already holding lock'); armLock = true; },
        releaseLock() {
          if (!held?.result || !held.locked) throw Error('Actual lock acknowledgment missing');
          const events = held.events; held = null;
          for (const entry of events) invoke(entry.listener, entry.event, entry.owner);
          return events.length;
        },
        armFile() { if (fileGate) throw Error('Already holding file'); let resolve; const promise = new Promise(done => { resolve = done; }); fileGate = { promise, resolve, entered: false }; },
        releaseFile() { if (!fileGate?.entered) throw Error('Actual file read missing'); const gate = fileGate; fileGate = null; gate.resolve(); },
        state() { return { commands: commands.slice(), workerUrls: workerUrls.slice(), walletCalls, walletRequests,
          heldLockResult: !!held?.result, heldLockedSnapshot: !!held?.locked, heldFileRead: !!fileGate?.entered,
          buffers: buffers.map(buffer => ({ length: buffer.byteLength, zero: new Uint8Array(buffer).every(value => value === 0) })) }; },
      };
      const wallet = { name: 'Local restore-only wallet', version: '1.0.0', chains: ['solana:localnet'], accounts: [], features: {
        'standard:connect': { version: '1.0.0', async connect() { walletCalls++; throw Error('Wallet not allowed in profile diagnostic'); } },
        'standard:events': { version: '1.0.0', on() { return () => {}; } },
        'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], async signTransaction() { walletCalls++; throw Error('Signing not allowed in profile diagnostic'); } },
        'solana:signAndSendTransaction': { async signAndSendTransaction() { walletCalls++; throw Error('Sending not allowed in profile diagnostic'); } },
      } };
      window.addEventListener('wallet-standard:app-ready', event => event.detail.register(wallet));
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: api => api.register(wallet) }));
    });
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', error => failures.push(error.message)); page.on('worker', worker => workers.push(worker.url()));
    const main = page.locator('main[data-profile-id]'), profileId = () => main.getAttribute('data-profile-id');
    const idle = () => wait(async () => await main.getAttribute('aria-busy') === 'false', 'acknowledged UI command completion');
    const state = () => page.evaluate(() => window.__solanaRestoreFixture.state());
    const lock = async () => { await page.getByRole('button', { name: 'Lock profile', exact: true }).click(); await wait(async () => await profileId() === '', 'immediate profile redaction'); await idle(); };
    await page.goto(origin);
    await page.getByLabel('Wallet Standard wallet', { exact: true }).selectOption({ label: 'Local restore-only wallet' });
    await page.getByRole('button', { name: 'Use selected wallet', exact: true }).click();
    await page.getByRole('heading', { name: 'Your encrypted recovery profile', exact: true }).waitFor(); await idle();
    await page.getByLabel('Profile passphrase', { exact: true }).fill(PASS);
    await page.getByRole('button', { name: 'Create recovery profile', exact: true }).click();
    await wait(async () => /^[0-9a-f]{32}$/.test(await profileId()), 'created encrypted profile'); await idle();
    const originalId = await profileId(), originalRow = await encryptedRow(page, originalId);
    const original = await openEnvelope(originalRow, PASS, crypto);
    try { assert.deepEqual(original.snapshot.records, []); } finally { disposeMaterial(original.material); }
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export encrypted backup', exact: true }).click();
    const backup = await readFile(await (await downloading).path()); await idle();
    await page.evaluate(() => window.__solanaRestoreFixture.armLock());
    await page.getByRole('button', { name: 'Lock profile', exact: true }).click();
    await wait(async () => (await state()).heldLockResult, 'real Worker lock result held at the document boundary');
    assert.equal(await profileId(), ''); assert.equal(await main.getAttribute('aria-busy'), 'true');
    for (const label of ['Encrypted backup', 'Backup passphrase', 'New profile passphrase', 'Profile passphrase']) assert.equal(await page.getByLabel(label, { exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Restore with a fresh key', exact: true }).isDisabled(), true);
    const heldResponses = await page.evaluate(() => window.__solanaRestoreFixture.releaseLock()); assert.ok(heldResponses >= 2); await idle();
    const chooseBackup = () => page.getByLabel('Encrypted backup', { exact: true }).setInputFiles({ name: 'public-restore.backup', mimeType: 'application/octet-stream', buffer: backup });
    await chooseBackup(); await page.getByLabel('Backup passphrase', { exact: true }).fill(PASS); await page.getByLabel('New profile passphrase', { exact: true }).fill(DEST);
    await page.getByRole('button', { name: 'Restore with a fresh key', exact: true }).click();
    await wait(async () => /^[0-9a-f]{32}$/.test(await profileId()) && await profileId() !== originalId, 'fresh-profile restore with intact Worker payload'); await idle();
    const restoredId = await profileId(), restoredRow = await encryptedRow(page, restoredId), restored = await openEnvelope(restoredRow, DEST, crypto);
    try { assert.deepEqual(restored.snapshot.records, []); } finally { disposeMaterial(restored.material); }
    assert.notEqual(restoredRow.keyId, originalRow.keyId); assert.notEqual(restoredRow.wrappedKey.salt, originalRow.wrappedKey.salt);
    assert.notEqual(restoredRow.snapshot.ciphertext, originalRow.snapshot.ciphertext); assert.deepEqual(await encryptedRow(page, originalId), originalRow);
    assert.equal((await state()).buffers[0].zero, true, 'submitted document buffer was disposed after native Worker cloning');
    await lock();
    for (const label of ['Encrypted backup', 'Backup passphrase', 'New profile passphrase', 'Profile passphrase']) assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), '');
    await page.evaluate(() => window.__solanaRestoreFixture.armFile()); await chooseBackup();
    await wait(async () => (await state()).heldFileRead, 'actual native File read held');
    await page.getByLabel('Profile', { exact: true }).selectOption(restoredId); await page.getByLabel('Profile passphrase', { exact: true }).fill(DEST);
    await page.getByRole('button', { name: 'Unlock recovery profile', exact: true }).click();
    await wait(async () => await profileId() === restoredId, 'explicit profile opening supersedes file input'); await idle();
    await page.evaluate(() => window.__solanaRestoreFixture.releaseFile());
    await wait(async () => (await state()).buffers.at(-1).zero, 'stale File buffer discarded');
    await lock();
    assert.equal(await page.getByRole('button', { name: 'Restore with a fresh key', exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Encrypted backup', { exact: true }).inputValue(), '');
    const observed = await state();
    assert.equal(observed.walletCalls, 0); assert.equal(observed.walletRequests, 0); assert.equal(observed.buffers.length, 2);
    assert.ok(observed.buffers.every(buffer => buffer.zero)); assert.equal(observed.commands.filter(type => type === 'backup.restore').length, 1);
    assert.ok(observed.commands.every(type => ['status', 'profile.create', 'profile.unlock', 'profile.lock', 'backup.export', 'backup.restore'].includes(type)));
    assert.equal(workers.length, 1); assert.ok(workers[0].includes('/assets/solana-localnet.worker-'));
    assert.deepEqual(unexpected, []); assert.deepEqual(failures, []);
    console.log(JSON.stringify({ ok: true, kind: 'SOLANA_RESTORE_ACK_BROWSER_DIAGNOSTIC', browser: await browser.version(),
      actualEmittedApp: true, actualModuleWorker: true, encryptedIndexedDB: true, heldActualLockResponses: heldResponses,
      freshProfileAndKey: true, staleFileBufferDiscarded: true, submittedDocumentBufferDiscarded: true,
      walletPrompts: 0, rpcRequests: 0, financialTransactions: 0, nativeChainQualified: false, ReleaseEnabled: 0,
      artifactSha256: createHash('sha256').update(JSON.stringify(evidence.assets)).digest('hex') }));
  } finally {
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSolanaRestoreBrowser();
