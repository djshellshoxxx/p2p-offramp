/** Actual emitted app + native Worker/IndexedDB cold-start, reload, lock and profile-isolation recovery inspection. Loopback only. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import { chromium, firefox, webkit } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
const { values } = parseArgs({ options: { browser: { type: 'string', default: 'chromium' } } });
const engine = [chromium, firefox, webkit].find(candidate => candidate.name() === values.browser);
if (!engine) throw new Error('Expected --browser=chromium, --browser=firefox or --browser=webkit');
const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(resolve(tmpdir(), 'p2p-recovery-references-'));
let server, context;
try {
  const out = resolve(temporary, 'app'), seed = resolve(temporary, 'seed'); await buildWeb({ outDir: out });
  await build({ configFile: false, build: { outDir: seed, emptyOutDir: true, target: 'es2023', sourcemap: false, lib: {
    entry: resolve(root, 'scripts/fixtures/recovery-references-browser.mjs'), formats: ['es'], fileName: () => 'seed.js' } } });
  const files = new Map();
  async function include(dir, prefix) { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, entry.name), name = prefix + '/' + entry.name; if (entry.isDirectory()) await include(path, name); else files.set(name, await readFile(path)); } }
  await include(out, ''); files.set('/seed.js', await readFile(resolve(seed, 'seed.js')));
  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname, name = path === '/' ? '/index.html' : path;
    if (!files.has(name)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/json'); response.end(files.get(name));
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const directory = resolve(temporary, 'browser-profile');
  const failures = [];
  let downloads = 0;
  async function startBrowser() {
    context = await engine.launchPersistentContext(directory, {
      ...(engine === chromium ? { executablePath: resolveChromiumPath(), args: ['--no-sandbox'] } : {}),
      acceptDownloads: true, serviceWorkers: 'block',
    });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      failures.push('EGRESS');
      return route.abort();
    });
    // An inert provider records any wallet request from the offline app on either launch.
    await context.exposeFunction('unexpectedWalletCall', () => { failures.push('WALLET_REQUEST'); });
    await context.addInitScript(() => {
      window.ethereum = { request: () => window.unexpectedWalletCall(), enable: () => window.unexpectedWalletCall() };
    });
    const page = await context.newPage();
    page.on('download', () => { downloads++; });
    page.on('pageerror', error => failures.push(error.message));
    page.on('dialog', dialog => { failures.push('DIALOG'); void dialog.dismiss(); });
    return page;
  }
  let page = await startBrowser();
  await page.goto(origin + '/#/home');
  const data = await page.evaluate(async () => (await import('/seed.js')).seedRecoveryReferences());
  const [a, b] = data.profiles;
  await page.reload();
  async function unlock(profile) {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByRole('button', { name: 'Use profile ' + profile.profileId, exact: true }).click();
    await page.getByLabel('Passphrase', { exact: true }).fill(data.passphrase);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click(); await page.getByRole('button', { name: 'Lock vault', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Recovery', exact: true }).click();
  }
  await unlock(a);
  const recoveryPanel = () => page.getByRole('region', { name: 'Offline transaction recovery references', exact: true });
  let panel = recoveryPanel();
  await panel.getByRole('button', { name: 'Inspect recovery references', exact: true }).click();
  await panel.getByText('finalized', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('checkbox').count(), 64, '63 supported records plus explicit privacy consent, one unknown record retained');
  assert.ok((await panel.innerText()).includes('1 record on this page could not be interpreted'));
  assert.equal((await page.locator('body').innerText()).includes('PRIVATE_CALLDATA_BANK_SECRET'), false);
  await panel.getByRole('button', { name: 'Next reference page', exact: true }).press('Enter');
  await panel.getByText('private-a-trade-65', { exact: true }).waitFor();
  const pageSummary = panel.getByText(/^Journal records 65–70 of 70;/);
  assert.ok(await pageSummary.evaluate(summary => summary === document.activeElement), 'focus remains on the results when the last page removes the Next button');
  await page.keyboard.press('Tab');
  assert.ok(await panel.getByLabel('Reference 65', { exact: false }).evaluate(field => field === document.activeElement), 'the next Tab reaches the first reference on the new page');
  await panel.getByLabel('Reference 65', { exact: false }).check();
  await panel.getByLabel('I understand the selected file contains private recovery metadata', { exact: false }).check();
  await panel.getByRole('button', { name: 'Preview selected private references', exact: true }).press('Enter');
  const previewTitle = panel.getByRole('heading', { name: 'Private recovery-reference preview', exact: true });
  await previewTitle.waitFor();
  assert.ok(await previewTitle.evaluate(heading => heading === document.activeElement), 'opening the preview focuses its heading before the export controls');
  await page.keyboard.press('Tab');
  assert.ok(await panel.getByLabel('Exact private recovery export (UTF-8 JSON)', { exact: true }).evaluate(field => field === document.activeElement), 'the next Tab reaches the exact preview text');
  const text = await panel.getByLabel('Exact private recovery export (UTF-8 JSON)', { exact: true }).inputValue(), exported = JSON.parse(text);
  assert.equal(exported.authority, 'unverified-offline-reference'); assert.equal(exported.items.length, 1); assert.equal(exported.items[0].binding.tradeId, 'private-a-trade-65');
  assert.doesNotMatch(text, /PRIVATE|preparedRequest|walletGeneration|replacementOf|secretKey/);
  // Close the unlocked browser with a live, consented preview. Only the on-disk profile survives.
  assert.equal(exported.items[0].storedState, 'broadcast-unknown');
  assert.equal(exported.items[0].chainReference, null);
  assert.equal(exported.items[0].nonce, '65');
  await context.close();
  page = await startBrowser();
  await page.goto(origin + '/#/recovery');
  panel = recoveryPanel();
  await panel.getByText('Unlock the local profile to inspect its recovery references.', { exact: false }).waitFor();
  assert.doesNotMatch(await panel.innerText(), /private-a-trade|broadcast-unknown/);
  assert.equal(await panel.getByRole('button', { name: 'Download previewed private recovery file' }).count(), 0);
  await unlock(a);
  await panel.getByRole('button', { name: 'Inspect recovery references', exact: true }).click();
  await panel.getByRole('button', { name: 'Next reference page', exact: true }).click();
  const item = panel.getByLabel('Reference 65', { exact: false });
  const consent = panel.getByLabel('I understand the selected file contains private recovery metadata', { exact: false });
  const preview = panel.getByRole('button', { name: 'Preview selected private references', exact: true });
  assert.equal(await panel.getByLabel('Exact private recovery export (UTF-8 JSON)', { exact: true }).count(), 0);
  assert.equal(await panel.getByRole('button', { name: 'Download previewed private recovery file' }).count(), 0);
  assert.equal(await item.isChecked(), false);
  assert.equal(await consent.isChecked(), false);
  assert.ok(await preview.isDisabled());
  await item.check();
  assert.ok(await preview.isDisabled(), 'a new selection still requires fresh consent after restart');
  await consent.check();
  await preview.click();
  const reopened = panel.getByLabel('Exact private recovery export (UTF-8 JSON)', { exact: true });
  await reopened.waitFor();
  assert.equal(await reopened.inputValue(), text, 'fresh inspection reproduces the original reference and revision');
  assert.equal(downloads, 0, 'reopening and previewing a reference must not start a download');
  const downloading = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Download previewed private recovery file', exact: true }).click();
  const download = await downloading; assert.equal(await readFile(await download.path(), 'utf8'), text);
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await panel.getByText('Unlock the local profile to inspect its recovery references.', { exact: false }).waitFor();
  assert.equal((await page.locator('body').innerText()).includes(a.account), false); assert.equal((await page.locator('body').innerText()).includes('private-a-trade-65'), false);
  assert.equal(await panel.getByLabel('Exact private recovery export (UTF-8 JSON)', { exact: true }).count(), 0);
  await unlock(b); await panel.getByRole('button', { name: 'Inspect recovery references', exact: true }).click(); await panel.getByText(b.account, { exact: true }).waitFor();
  assert.equal((await panel.innerText()).includes(a.account), false); assert.equal((await panel.innerText()).includes('private-a-trade-'), false);
  await page.reload(); await page.getByText('Unlock the local profile to inspect its recovery references.', { exact: false }).waitFor();
  assert.equal((await page.locator('body').innerText()).includes(b.account), false);
  await unlock(a); await panel.getByRole('button', { name: 'Inspect recovery references', exact: true }).click(); await panel.getByText('finalized', { exact: true }).waitFor();
  for (const width of [320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
  await panel.getByLabel('Reference 1 ·', { exact: false }).check();
  await panel.getByLabel('I understand the selected file contains private recovery metadata', { exact: false }).check();
  await panel.getByRole('button', { name: 'Preview selected private references', exact: true }).click();
  await panel.getByLabel('Exact private recovery export (UTF-8 JSON)', { exact: true }).waitFor();
  await page.evaluate(async profileId => (await import('/seed.js')).changeRecoveryFixture(profileId), a.profileId);
  const before = downloads;
  await panel.getByRole('button', { name: 'Download previewed private recovery file', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('recovery-reference-bytes') === null);
  assert.equal(downloads, before, 'a different durable revision refuses the private download');
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ fixture: 'native-worker-offline-recovery-references', browser: engine.name(), version: context.browser().version(), readonly: true, revisionPinnedPages: true, exactPrivatePreview: true, staleRevisionExportRefused: true, coldStartReauthenticated: true, coldStartReferencePreserved: true, reloadLocked: true, lockAndProfileIsolation: true, preservedFutureRecord: true, noRawTransaction: true, tradingEnabled: false }));
} finally { await context?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } await rm(temporary, { recursive: true, force: true }); }
