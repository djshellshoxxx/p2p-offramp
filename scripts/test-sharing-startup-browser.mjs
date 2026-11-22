/** Native Chromium acceptance of the ordinary built offline shell; no wallet/device/release attestation. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const directory = await mkdtemp(resolve(tmpdir(), 'p2p-sharing-startup-native-'));
const failures = [];
let server, browser;
const listen = target => new Promise((ok, fail) => {
  target.once('error', fail);
  target.listen(0, '127.0.0.1', ok);
});
try {
  await buildWeb({ outDir: directory });
  server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = resolve(directory, relative);
    if (!target.startsWith(directory + sep)) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(data => {
      response.setHeader('Content-Type', {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'
      }[extname(target)] ?? 'application/octet-stream');
      response.end(data);
    }, () => { response.writeHead(404); response.end(); });
  });
  await listen(server);
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });

  async function scenario(label, setup, check) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const unexpected = [];
    try {
      if (setup) await context.addInitScript(setup);
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        unexpected.push('cross-origin-request'); return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => unexpected.push('pageerror:' + error.message));
      await page.goto(origin + '/#/settings');
      await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
      await check(page);
      assert.deepEqual(unexpected, [], label + ': unexpected network or error');
      console.log('ok - ' + label);
    } finally { await context.close(); }
  }

  await scenario('share is explicit and uses the host root, not fragment', () => {
    window.__copyCalls = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.__copyCalls.push(value); }
    } });
  }, async page => {
    const input = page.locator('#generic-app-url');
    await input.waitFor();
    assert.equal(await input.inputValue(), origin + '/');
    assert.equal(await page.evaluate(() => window.__copyCalls.length), 0);
    await page.locator('#generic-app-share-title').getByText('Share').count(); // Rendering never invokes copying.
    const copy = page.locator('#generic-app-share-title').locator('..').getByRole('button');
    await copy.click();
    await page.waitForFunction(() => window.__copyCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__copyCalls), [origin + '/']);
    assert.equal(await input.inputValue(), origin + '/');
  });

  await scenario('missing Worker blocks startup and displays recovery', () => {
    Object.defineProperty(window, 'Worker', { configurable: true, value: undefined });
  }, async page => {
    await page.locator('#startup-compatibility-title').waitFor();
    await page.getByRole('link', { name: /recovery/i }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Unlock existing profile' }).count(), 0);
    assert.equal(await page.locator('#generic-app-url').inputValue(), origin + '/');
  });

  await scenario('optional clipboard absence does not block startup', () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  }, async page => {
    await page.locator('#generic-app-url').waitFor();
    const copy = page.locator('#generic-app-share-title').locator('..').getByRole('button');
    await copy.click();
    await page.getByRole('status').filter({ hasText: /manual|select|copy/i }).first().waitFor();
    assert.equal(await page.locator('#generic-app-url').inputValue(), origin + '/');
  });

  await scenario('clipboard rejection leaves canonical URL selectable', () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('fixture-clipboard-denied'); }
    } });
  }, async page => {
    await page.locator('#generic-app-share-title').locator('..').getByRole('button').click();
    await page.locator('#generic-app-url').focus();
    assert.equal(await page.locator('#generic-app-url').inputValue(), origin + '/');
  });
} catch (error) {
  failures.push(error);
  console.error(error);
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(ok => server.close(ok)); }
  await rm(directory, { recursive: true, force: true });
}
if (failures.length) process.exitCode = 1;
