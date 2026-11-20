/** Real browser fixture: emitted module Worker + IndexedDB. External wallet test keys remain in Node. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { buildWeb } from '../../apps/web/scripts/build.mjs';
import { buildSolanaLocalnetContentPolicy } from '../../packages/security/src/content-policy.ts';
import { openEnvelope, disposeMaterial } from '../../packages/storage/src/vault-crypto.ts';
import { resolveChromiumPath } from './chromium-path.mjs';
import { startSolanaLocalnetFixture } from './solana-localnet-fixture.mjs';
import { assertSolanaSendMarked, readSolanaVaultRecords } from './solana-localnet-send-evidence.mjs';

export async function waitSolanaBrowser(check, label, timeoutMs = 45000, intervalMs = 100) {
  const start = Date.now();
  for (;;) { if (await check()) return; if (Date.now() - start >= timeoutMs) throw Error(`Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, intervalMs)); }
}
const profileId = page => page.locator('main[data-profile-id]').getAttribute('data-profile-id');
async function encryptedRow(page, id) {
  return page.evaluate(profile => new Promise((resolve, reject) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onerror = () => reject(Error('Fixture encrypted profile inspection failed.'));
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('vaults', 'readonly'), get = tx.objectStore('vaults').get(profile);
      get.onsuccess = () => resolve(get.result); get.onerror = () => reject(Error('Fixture encrypted profile read failed.'));
      tx.oncomplete = () => db.close(); tx.onabort = () => db.close();
    };
  }), id);
}

export async function startSolanaBrowserFixture() {
  let chain, browser, server, temporary, page, context, passphrase, closed = false, heldSign = null, holdNext = false;
  const unexpected = [], errors = [], prompts = [], workers = [], seen = new Set(); let walletConnects = 0;
  const close = async () => {
    if (closed) return; closed = true; heldSign?.resolve();
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await chain?.close(); if (temporary) await rm(temporary, { recursive: true, force: true });
  };
  async function vault() {
    const id = await profileId(page); assert.match(id, /^[0-9a-f]{32}$/); assert.equal(typeof passphrase, 'string');
    const row = await encryptedRow(page, id), opened = await openEnvelope(row, passphrase, crypto);
    try { return { id, row, snapshot: opened.snapshot, ...readSolanaVaultRecords(opened.snapshot) }; }
    finally { disposeMaterial(opened.material); }
  }
  try {
    chain = await startSolanaLocalnetFixture(); temporary = await mkdtemp(join(tmpdir(), 'p2p-solana-browser-artifact-'));
    const outDir = join(temporary, 'app'), evidence = await buildWeb({ delivery: 'solana-localnet', outDir, solanaLocalnet: chain.buildOption });
    assert.equal(evidence.ReleaseEnabled, 0);
    const files = new Map(await Promise.all(evidence.assets.map(async asset => [asset.path, await readFile(join(outDir, asset.path))])));
    const headers = buildSolanaLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', rpcOrigin: new URL(chain.rpcUrl).origin }).headers;
    server = createServer((request, response) => {
      const path = request.url === '/' ? 'index.html' : request.url?.slice(1), bytes = files.get(path);
      if (!bytes) { response.writeHead(404).end(); return; }
      const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/json';
      response.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`, rpcOrigin = new URL(chain.rpcUrl).origin;
    browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
    context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if ([origin, rpcOrigin].includes(url.origin)) return route.continue();
      unexpected.push(url.href); return route.abort();
    });
    await context.routeWebSocket(() => true, socket => { unexpected.push(socket.url()); socket.close(); });
    await context.exposeBinding('__solanaFixtureConnect', async () => { walletConnects++; });
    await context.exposeBinding('__solanaFixtureSign', async (_source, request) => {
      assert.equal(request.account, chain.seller); assert.equal(request.chain, 'solana:localnet');
      const wire = Buffer.from(request.transaction, 'base64'); assert.equal(wire[0], 1); assert.ok(wire.subarray(1, 65).every(byte => byte === 0));
      const review = page.locator('[data-review-id]'); assert.equal(await review.count(), 1);
      const displayedMessage = await review.locator('dt').filter({ hasText: /^Message \(base64\)$/ }).evaluate(node => node.nextElementSibling.textContent);
      assert.equal(wire.subarray(65).toString('base64'), displayedMessage, 'wallet receives exactly the message reviewed by the person');
      const stored = await vault(), matching = stored.intents.filter(record => record.state === 'prepared' && record.message === displayedMessage && record.originProfileId === stored.id);
      assert.equal(matching.length, 1, 'the reviewed intent is durable before the external wallet prompt');
      prompts.push({ intentId: matching[0].intentId, profileId: stored.id, action: matching[0].action,
        messageSha256: createHash('sha256').update(wire.subarray(65)).digest('hex') });
      if (holdNext) { holdNext = false; await new Promise(resolve => { heldSign = { resolve }; }); heldSign = null; }
      return Buffer.from(chain.sign(request.transaction)).toString('base64');
    });
    const account = chain.account();
    await context.addInitScript(({ address, publicKey }) => {
      const listeners = new Set(), account = { address, publicKey: new Uint8Array(publicKey), chains: ['solana:localnet'], features: ['solana:signTransaction'] };
      const wallet = { name: 'Local fixture sign-only wallet', version: '1.0.0', chains: ['solana:localnet'], accounts: [account], features: {
        'standard:connect': { version: '1.0.0', async connect() { await window.__solanaFixtureConnect(); return { accounts: wallet.accounts }; } },
        'standard:events': { version: '1.0.0', on(event, listener) { if (event !== 'change') throw Error('Wrong event'); listeners.add(listener); return () => listeners.delete(listener); } },
        'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], async signTransaction(...inputs) {
          if (inputs.length !== 1) throw Error('Single transaction only'); const input = inputs[0];
          const transaction = btoa(String.fromCharCode(...input.transaction));
          const wire = await window.__solanaFixtureSign({ account: input.account.address, chain: input.chain, transaction });
          return [{ signedTransaction: Uint8Array.from(atob(wire), c => c.charCodeAt(0)) }];
        } },
        'solana:signAndSendTransaction': { version: '1.0.0', async signAndSendTransaction() { throw Error('Forbidden sign-and-send wallet method'); } },
      } };
      // This is the external fixture wallet's event control, not an application/testing backdoor.
      window.__solanaFixtureWalletChange = () => { for (const listener of listeners) listener({ accounts: wallet.accounts }); };
      window.addEventListener('wallet-standard:app-ready', event => event.detail.register(wallet));
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: api => api.register(wallet) }));
    }, { address: account.address, publicKey: [...account.publicKey] });
    chain.observeSends(async wire => {
      const stored = await vault();
      const proof = assertSolanaSendMarked(stored.intents, wire, stored.id, chain.summary, seen);
      assert.equal(JSON.stringify(stored.row).includes(stored.intents.find(r => r.intentId === proof.intentId).message), false, 'signed message is encrypted at rest');
      return proof;
    });
    page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('worker', worker => workers.push(worker.url())); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await page.getByRole('heading', { name: 'Choose your wallet' }).waitFor();
    await page.getByLabel('Wallet Standard wallet').selectOption({ label: 'Local fixture sign-only wallet' });
    await page.getByRole('button', { name: 'Use selected wallet', exact: true }).click();
    await page.getByRole('heading', { name: 'Your encrypted recovery profile' }).waitFor();
    await waitSolanaBrowser(() => workers.some(url => /solana-localnet\.worker-/.test(url)), 'actual native module Worker');
    return { page, context, chain, evidence, unexpected, errors, workers, prompts, vault, get walletConnects() { return walletConnects; },
      profileId: () => profileId(page), setPassphrase(value) { passphrase = value; },
      holdNextSign() { assert.equal(holdNext, false); holdNext = true; },
      get signPending() { return heldSign !== null; }, settleSign() { assert.ok(heldSign); heldSign.resolve(); }, close };
  } catch (error) { await close(); throw error; }
}
