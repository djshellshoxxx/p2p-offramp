/** Actual emitted app + native Worker/IndexedDB reload/lock/profile-isolation recovery inspection. Loopback only. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(resolve(tmpdir(), 'p2p-recovery-references-'));
let server, browser;
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
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' }), failures = [];
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); failures.push('EGRESS'); return route.abort(); });
  const page = await context.newPage(); let downloads = 0; page.on('download', () => { downloads++; });
  page.on('pageerror', error => failures.push(error.message)); page.on('dialog', dialog => { failures.push('DIALOG'); void dialog.dismiss(); });
  await page.goto(origin + '/#/home');
  const data = await page.evaluate(async () => (await import('/seed.js')).seedRecoveryReferences());
  const [a, b] = data.profiles;
  await page.reload();
  async function unlock(profile) {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Profile ID', { exact: true }).fill(profile.profileId); await page.getByLabel('Passphrase', { exact: true }).fill(data.passphrase);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click(); await page.getByRole('button', { name: 'Lock vault', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Recovery', exact: true }).click();
  }
  await unlock(a);
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Offline transaction recovery references', exact: true }) }).last();
  await panel.getByRole('button', { name: 'Inspect recovery references', exact: true }).click();
  await panel.getByText('finalized', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('checkbox').count(), 64, '63 supported records plus explicit privacy consent, one unknown record retained');
  assert.ok((await panel.innerText()).includes('1 record on this page could not be interpreted'));
  assert.equal((await page.locator('body').innerText()).includes('PRIVATE_CALLDATA_BANK_SECRET'), false);
  await panel.getByRole('button', { name: 'Next reference page', exact: true }).click();
  await panel.getByText('private-a-trade-65', { exact: true }).waitFor();
  await panel.getByLabel('Reference 65', { exact: false }).check();
  await panel.getByLabel('I understand the selected file contains private recovery metadata', { exact: false }).check();
  await panel.getByRole('button', { name: 'Preview selected private references', exact: true }).click();
  const text = await panel.getByLabel('Exact private recovery export (UTF-8 JSON)', { exact: true }).inputValue(), exported = JSON.parse(text);
  assert.equal(exported.authority, 'unverified-offline-reference'); assert.equal(exported.items.length, 1); assert.equal(exported.items[0].binding.tradeId, 'private-a-trade-65');
  assert.doesNotMatch(text, /PRIVATE|preparedRequest|walletGeneration|replacementOf|secretKey/);
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
  console.log(JSON.stringify({ fixture: 'native-worker-offline-recovery-references', readonly: true, revisionPinnedPages: true, exactPrivatePreview: true, staleRevisionExportRefused: true, reloadLocked: true, lockAndProfileIsolation: true, preservedFutureRecord: true, noRawTransaction: true, tradingEnabled: false }));
  await context.close();
} finally { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } await rm(temporary, { recursive: true, force: true }); }
