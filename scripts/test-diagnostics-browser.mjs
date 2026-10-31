/** Native local diagnostics UI proof plus default-app refusal; no release/network/funds authority. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';
import { fixture } from '../packages/security/test/lib/release-fixture.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-diagnostics-browser-'));
let server, browser;
try {
  const plain = resolve(temporary, 'plain'), qualified = resolve(temporary, 'fixture');
  await buildWeb({ outDir: plain });
  const graph = JSON.parse(await readFile(resolve(plain, 'core-graph-document.json')));
  assert.equal(graph.modules.some(module => /release-manifest|release-locator|nostr-crypto|packages\/wallet|packages\/identity/.test(module.path)), false, 'default artifact includes only the tiny proof checker, no verifier/wallet/identity');
  await build({ configFile: false, plugins: [react()], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { outDir: qualified, emptyOutDir: true, minify: false, sourcemap: false, target: 'es2023',
    lib: { entry: resolve(root, 'scripts/fixtures/diagnostics-browser.mjs'), formats: ['es'], fileName: () => 'fixture.js' } } });
  const files = new Map();
  async function include(dir, prefix) { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, entry.name), name = prefix + '/' + entry.name; if (entry.isDirectory()) await include(path, name); else files.set(name, await readFile(path)); } }
  await include(plain, '/plain'); await include(qualified, '/fixture');
  const fixtureCss = [...files.keys()].find(name => name.startsWith('/fixture/') && name.endsWith('.css'));
  const policy = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; worker-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', policy); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/fixture/') { response.setHeader('Content-Type', 'text/html'); response.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>UNAPPROVED local diagnostics proof</title><link rel="stylesheet" href="${fixtureCss}"><h1>UNAPPROVED local proof · synthetic signed release</h1><div id="root"></div>`); return; }
    const name = path === '/plain/' ? '/plain/index.html' : path;
    if (!files.has(name)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/json'); response.end(files.get(name));
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  const failures = [];
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); failures.push('EGRESS'); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => failures.push(error.message)); page.on('dialog', dialog => { failures.push('DIALOG'); void dialog.dismiss(); });
  // The actual unsigned app keeps collection closed, while locked erase remains functional.
  await page.goto(origin + '/plain/#/settings');
  await page.getByRole('heading', { name: 'Local diagnostics', exact: true }).waitFor();
  await page.getByText('Collection unavailable:', { exact: false }).waitFor();
  await page.evaluate(() => localStorage.setItem('p2p-offramp-diagnostics-v1', 'SECRET raw error token=SECRET'));
  await page.getByRole('button', { name: 'Clear local diagnostics', exact: true }).click();
  await page.getByText('Local diagnostics cleared. No vault passphrase was needed.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('p2p-offramp-diagnostics-v1')), null);
  assert.equal(await page.getByRole('button', { name: 'Download the previewed diagnostics', exact: true }).count(), 0);
  assert.equal((await page.locator('body').innerText()).includes('SECRET'), false);
  await page.goto(origin + '/fixture/');
  const f = fixture();
  const corpus = { bytes: [...f.bytes], envelope: f.envelope, key: f.key, channel: f.manifest.channel, assets: f.assets.map(asset => ({ path: asset.path, bytes: [...asset.bytes] })) };
  const mounted = await page.evaluate(async corpus => (await import('/fixture/fixture.js')).mountDiagnosticsFixture(corpus), corpus);
  assert.deepEqual(mounted, { verifiedFixture: true, tradingEnabled: false, approvedRelease: false });
  await page.getByLabel('Event 1', { exact: false }).check();
  await page.getByRole('button', { name: 'Preview selected diagnostic export', exact: true }).click();
  const text = await page.getByLabel('Exact export text (UTF-8 JSON)', { exact: true }).inputValue();
  assert.equal(JSON.parse(text).length, 1); assert.equal(JSON.parse(text)[0].errorCode, 'TIMEOUT');
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download the previewed diagnostics', exact: true }).click();
  const download = await downloading; assert.equal(await readFile(await download.path(), 'utf8'), text, 'download exactly matches selected preview bytes');
  await page.evaluate(() => window.revokeDiagnosticsFixture());
  await page.getByRole('button', { name: 'Download the previewed diagnostics', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'authenticated release context is unavailable or expired' }).waitFor();
  assert.equal(await page.getByLabel('Exact export text (UTF-8 JSON)', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('fixture-diagnostics')), null, 'revoked release context purges the disposable ring before an explicit clear');
  await page.getByRole('button', { name: 'Clear local diagnostics', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('fixture-diagnostics')), null);
  for (const width of [320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ fixture: 'diagnostics-local-browser', signedFixture: true, approvedRelease: false, defaultCollectionBlocked: true, selectedPreviewExact: true, revocationRefused: true, lockedClear: true, externalNetwork: false }));
  await context.close();
} finally { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } await rm(temporary, { recursive: true, force: true }); }
