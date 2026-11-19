/** Browser-test fixture only: serve the emitted localnet artifact and hold published wallet fixture keys in Node. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { buildWeb } from '../../apps/web/scripts/build.mjs';
import { buildLocalnetContentPolicy } from '../../packages/security/src/content-policy.ts';
import { openEnvelope, disposeMaterial } from '../../packages/storage/src/vault-crypto.ts';
import { decodeIntentPayload } from '../../packages/schemas/index.ts';
import { resolveChromiumPath } from './chromium-path.mjs';
import { startLocalnetFixture } from './localnet-fixture.mjs';
import { assertLocalnetSendMarked } from './localnet-send-evidence.mjs';

const profileId = page => page.locator('[data-profile-id]').getAttribute('data-profile-id');
async function encryptedRow(page, id) {
  return page.evaluate(profile => new Promise((resolve, reject) => {
    const open = indexedDB.open('p2p-offramp-vault', 1);
    open.onerror = () => reject(new Error('Fixture could not inspect encrypted profile.'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('vaults', 'readonly'), request = tx.objectStore('vaults').get(profile);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Fixture encrypted profile read failed.'));
      tx.oncomplete = () => db.close(); tx.onabort = () => db.close();
    };
  }), id);
}
export async function waitLocalnetBrowser(check, label, timeout = 30_000) {
  const started = Date.now();
  while (!await check()) {
    if (Date.now() - started >= timeout) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
export const idleLocalnetBrowser = party => waitLocalnetBrowser(() => party.page.getByRole('button', { name: 'Connect wallet', exact: true }).isEnabled(), 'localnet command completion');

export async function startLocalnetBrowserFixture(options = {}) {
  let chain, browser, server, temporary, closed = false, markers = 0;
  const unexpected = [];
  const close = async () => {
    if (closed) return; closed = true;
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await chain?.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  };
  try {
    chain = await startLocalnetFixture(options);
    temporary = await mkdtemp(join(tmpdir(), 'p2p-localnet-browser-'));
    const outDir = join(temporary, 'app'), evidence = await buildWeb({ delivery: 'localnet', outDir, localnet: chain.buildOption });
    assert.equal(evidence.ReleaseEnabled, 0);
    const files = new Map(await Promise.all(evidence.assets.map(async asset => [asset.path, await readFile(join(outDir, asset.path))])));
    const headers = buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', relayOrigin: chain.config.relayOrigin }).headers;
    server = createServer((request, response) => {
      const path = request.url === '/' ? 'index.html' : request.url?.slice(1), bytes = files.get(path);
      if (!bytes) { response.writeHead(404).end(); return; }
      const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/json';
      response.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
    const party = async (index, passphrase) => {
      const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        unexpected.push(route.request().url()); return route.abort();
      });
      await context.routeWebSocket(url => url.href !== chain.config.relayUrl, socket => { unexpected.push(socket.url()); socket.close(); });
      let page;
      const provider = chain.provider(index, { beforeSend: async transaction => {
        const id = await profileId(page), row = await encryptedRow(page, id), opened = await openEnvelope(row, passphrase, crypto);
        try {
          const intents = opened.snapshot.records.filter(record => record.kind === 'journal').map(record => decodeIntentPayload(record.payload));
          const marked = assertLocalnetSendMarked(intents, transaction, id); markers++;
          assert.equal(JSON.stringify(row).includes(marked.preparedRequest), false, 'the exact prepared request is encrypted at rest');
        } finally { disposeMaterial(opened.material); }
      } });
      await context.exposeBinding('__localnetFixtureRequest', async (_source, request) => {
        try { return { ok: true, value: await provider.request(request) }; }
        catch (error) { return { ok: false, code: typeof error?.code === 'number' ? error.code : 5000 }; }
      });
      await context.addInitScript(() => {
        const listeners = new Map();
        // Test-only event delivery uses the same listeners an external EIP-1193 wallet would notify.
        Object.defineProperty(window, '__localnetFixtureEmit', { value(event, value) {
          for (const listener of listeners.get(event) ?? []) listener(value);
        } });
        Object.defineProperty(window, 'ethereum', { value: Object.freeze({
          async request(request) {
            const reply = await window.__localnetFixtureRequest(request);
            if (!reply.ok) throw Object.assign(new Error('External fixture wallet refused.'), { code: reply.code });
            return reply.value;
          },
          on(event, listener) { const set = listeners.get(event) ?? new Set(); set.add(listener); listeners.set(event, set); },
          removeListener(event, listener) { listeners.get(event)?.delete(listener); },
        }), configurable: false });
      });
      page = await context.newPage(); page.setDefaultTimeout(30_000); await page.goto(origin);
      await page.getByRole('heading', { name: 'Your encrypted profile' }).waitFor();
      return { page, provider, passphrase, profileId: () => profileId(page),
        emit: (event, value) => page.evaluate(([name, payload]) => window.__localnetFixtureEmit(name, payload), [event, value]),
        close: async () => { await context.close(); } };
    };
    return { chain, evidence, browser, party, unexpected, get markers() { return markers; }, close };
  } catch (error) { await close(); throw error; }
}
