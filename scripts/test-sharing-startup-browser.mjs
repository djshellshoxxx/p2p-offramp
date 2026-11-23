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
const bases = ['/nested/project/', '/ipfs/bafy-local-share-fixture/', '/'];
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
    const base = bases.find(prefix => pathname.startsWith(prefix));
    const relative = pathname.slice(base.length) || 'index.html';
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

  async function scenario(label, setup, check, { base = '/', setupArg } = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const unexpected = [];
    try {
      if (setup) await context.addInitScript(setup, setupArg);
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        unexpected.push('cross-origin-request'); return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => unexpected.push('pageerror:' + error.message));
      await page.goto(origin + base + '?profile=fixture#/settings');
      await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
      await check(page, origin + base);
      assert.deepEqual(unexpected, [], label + ': unexpected network or error');
      console.log('ok - ' + label);
    } finally { await context.close(); }
  }

  const copyButton = page => page.getByRole('button', { name: 'Copy app address', exact: true });
  const shareStatus = page => page.locator('[aria-labelledby="generic-app-share-title"]').getByRole('status');
  const navigate = (page, name) => page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true }).click();

  // Recover the nested-host and delayed-copy cases from the historical S06
  // emitted-app sharing driver, using the current Settings route and copy control.
  for (const base of bases) {
    await scenario('copy shares only the app address at ' + base, () => {
      window.__copyCalls = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async value => { window.__copyCalls.push(value); }
      } });
    }, async (page, expected) => {
      const input = page.getByLabel('App address', { exact: true });
      assert.equal(await input.inputValue(), expected);
      assert.deepEqual(await page.evaluate(() => window.__copyCalls), []);
      await copyButton(page).click();
      await shareStatus(page).filter({ hasText: /^App address copied\.$/ }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__copyCalls), [expected]);
    }, { base });
  }

  await scenario('a pending clipboard write stays owned across navigation', () => {
    window.__copyCalls = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: value => {
        window.__copyCalls.push(value);
        return new Promise(resolve => { window.__finishCopy = resolve; });
      }
    } });
  }, async (page, expected) => {
    await copyButton(page).click();
    await navigate(page, 'Home');
    await page.getByRole('heading', { name: 'Your local workspace', level: 1 }).waitFor();
    await navigate(page, 'Settings');
    await copyButton(page).waitFor();
    assert.equal(await copyButton(page).isDisabled(), true);
    await page.evaluate(() => window.__finishCopy());
    await page.waitForFunction(() => document.querySelector('[aria-labelledby="generic-app-share-title"] button')?.disabled === false);
    assert.equal(await shareStatus(page).innerText(), '');
    assert.deepEqual(await page.evaluate(() => window.__copyCalls), [expected]);
    await copyButton(page).click();
    await page.evaluate(() => window.__finishCopy());
    await shareStatus(page).filter({ hasText: /^App address copied\.$/ }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__copyCalls), [expected, expected]);
  });

  for (const [api, feature] of [
    ['Worker', 'isolated local processing'], ['indexedDB', 'encrypted local storage'], ['crypto', 'browser encryption'],
  ]) {
    await scenario('missing ' + api + ' leaves recovery guidance available', name => {
      Object.defineProperty(window, name, { configurable: true, value: undefined });
    }, async (page, expected) => {
      const notice = page.locator('[aria-labelledby="startup-compatibility-title"]');
      await notice.getByRole('heading', { name: 'Read-only browser mode' }).waitFor();
      await notice.getByText('Missing or unavailable: ' + feature + '.', { exact: true }).waitFor();
      assert.equal(await page.locator('#generic-app-url').inputValue(), expected);
      await navigate(page, 'Home');
      await page.getByRole('heading', { name: 'Your local workspace', level: 1 }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Create new profile', exact: true }).count(), 0);
      await notice.getByRole('link', { name: 'Read recovery guidance', exact: true }).click();
      await page.getByRole('heading', { name: 'Recovery', level: 1 }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).count(), 0);
    }, { setupArg: api });
  }

  for (const clipboard of ['absent', 'denied']) {
    await scenario('clipboard ' + clipboard + ' preserves manual copying and private startup', mode => {
      const value = mode === 'absent' ? undefined : { async writeText() { throw Error('fixture-clipboard-denied'); } };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
    }, async (page, expected) => {
      await page.getByRole('button', { name: 'Refresh vault status', exact: true }).waitFor();
      await copyButton(page).click();
      await shareStatus(page).filter({ hasText: /^Copying is unavailable\. Select and copy the address above\.$/ }).waitFor();
      const input = page.locator('#generic-app-url');
      await input.focus();
      assert.equal(await input.evaluate(field => field.value.slice(field.selectionStart, field.selectionEnd)), expected);
      assert.equal((await page.locator('body').innerText()).includes('fixture-clipboard-denied'), false);
      await navigate(page, 'Home');
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).waitFor();
    }, { setupArg: clipboard });
  }
} catch (error) {
  failures.push(error);
  console.error(error);
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(ok => server.close(ok)); }
  await rm(directory, { recursive: true, force: true });
}
if (failures.length) process.exitCode = 1;
