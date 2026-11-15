/** Native emitted-App sharing checks; local hosting only, no deployment/release qualification. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { offlinePolicy } from '../apps/web/scripts/static-build-plugin.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-generic-share-'));
const bases = ['/nested/project/', '/ipfs/bafy-local-share-fixture/'];
const failures = [], reports = [], contexts = [];
let server, browser;

function instrument() {
  const probe = { writes: [], outcomes: [], permissionQueries: 0, networkCalls: 0, mode: 'native', pending: [] };
  window.__shareProbe = probe;
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    const nativeWrite = clipboard.writeText.bind(clipboard);
    clipboard.writeText = value => {
      probe.writes.push(value);
      if (probe.mode === 'pending') return new Promise(resolve => probe.pending.push(resolve));
      if (probe.mode === 'private-error') return Promise.reject(new Error('SYNTHETIC_PRIVATE_PLATFORM_DETAIL'));
      return nativeWrite(value).then(() => { probe.outcomes.push('written'); }, error => { probe.outcomes.push(error.name); throw error; });
    };
  }
  if (navigator.permissions) {
    const nativeQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (...args) => { probe.permissionQueries++; return nativeQuery(...args); };
  }
  const nativeFetch = window.fetch;
  window.fetch = (...args) => { probe.networkCalls++; return nativeFetch(...args); };
  const nativeBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (...args) => { probe.networkCalls++; return nativeBeacon(...args); };
  const NativeWebSocket = window.WebSocket, NativeXhr = window.XMLHttpRequest;
  window.WebSocket = class extends NativeWebSocket { constructor(...args) { probe.networkCalls++; super(...args); } };
  window.XMLHttpRequest = class extends NativeXhr { open(...args) { probe.networkCalls++; return super.open(...args); } };
}

try {
  const output = resolve(temporary, 'app'), fixtureOutput = resolve(temporary, 'fixture');
  const evidence = await buildWeb({ outDir: output });
  assert.equal(evidence.ReleaseEnabled, 0); assert.equal(evidence.signedRelease, false);
  const graph = JSON.parse(await readFile(resolve(output, 'core-graph-document.json'), 'utf8'));
  for (const path of ['apps/web/src/main.tsx', 'apps/web/src/ui/App.tsx', 'apps/web/src/ui/Pages.tsx', 'apps/web/src/ui/GenericAppShare.tsx', 'apps/web/src/sharing/generic-app-link.ts']) assert.equal(graph.modules.some(module => module.path === path), true, 'actual App consumer must include ' + path);
  const html = await readFile(resolve(output, 'index.html'), 'utf8');
  const mainAsset = /src="\.\/(assets\/index-[A-Za-z0-9_-]+\.js)"/.exec(html)?.[1];
  assert.ok(mainAsset, 'emitted main must use the known relative assets/index-hash.js path');

  // This temporary fixture only controls prop/owner lifetime; the ordinary App above is
  // exercised first and supplies the actual trusted main-module URL without a fixture seam.
  const fixtureEntry = resolve(temporary, 'lifetime.tsx');
  await writeFile(fixtureEntry, `import { createElement } from ${JSON.stringify(resolve(root, 'node_modules/react/index.js'))};
import { createRoot } from ${JSON.stringify(resolve(root, 'node_modules/react-dom/client.js'))};
import { flushSync } from ${JSON.stringify(resolve(root, 'node_modules/react-dom/index.js'))};
import { GenericAppShare } from ${JSON.stringify(resolve(root, 'apps/web/src/ui/GenericAppShare.tsx'))};
const root=createRoot(document.getElementById('root'));
window.__shareFixture={show(appLink){flushSync(()=>root.render(createElement(GenericAppShare,{appLink})));},hide(){flushSync(()=>root.render(null));}};
window.__shareFixture.show('https://fixture.example/a/');
`);
  await build({ configFile: false, plugins: [react()], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { outDir: fixtureOutput, emptyOutDir: true, minify: false, sourcemap: false, target: 'es2023', lib: { entry: fixtureEntry, formats: ['es'], fileName: () => 'fixture.js' } } });
  const files = new Map();
  async function include(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name), name = prefix + entry.name;
      if (entry.isDirectory()) await include(path, name + '/');
      else files.set(name, await readFile(path));
    }
  }
  await include(output);
  const fixtureBytes = await readFile(resolve(fixtureOutput, 'fixture.js'));
  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    for (const [name, value] of Object.entries(offlinePolicy('header').headers)) response.setHeader(name, value);
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/fixture/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><meta charset="utf-8"><title>Local sharing lifetime fixture</title><div id="root"></div><script type="module" src="/fixture/fixture.js"></script>'); return; }
    if (path === '/fixture/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(fixtureBytes); return; }
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const base = bases.find(base => path.startsWith(base));
    const relative = base === undefined ? null : path.slice(base.length) || 'index.html';
    if (relative === null || !files.has(relative)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.html') ? 'text/html' : 'application/json'); response.end(files.get(relative));
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.addInitScript(instrument);
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); failures.push('PRODUCT_EGRESS'); return route.abort(); });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(15000);
  const requested = []; page.on('request', request => requested.push(request.url()));
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') failures.push(message.text()); });
  const copy = page.getByRole('button', { name: 'Copy app address', exact: true });
  const address = page.getByLabel('App address', { exact: true });
  for (const base of bases) {
    const expected = origin + base;
    await page.goto(expected + '?profile=SYNTHETIC_PRIVATE_QUERY#/trade/SYNTHETIC_PRIVATE_ROUTE');
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await address.waitFor();
    const loadedEntryUrl = requested.find(url => url === expected + mainAsset);
    assert.ok(loadedEntryUrl, 'the browser must request the actual emitted main entry under this subpath');
    assert.equal(await address.inputValue(), expected, 'main import.meta.url must identify the actual deployed subpath');
    assert.equal(await address.getAttribute('readonly'), '');
    assert.equal(await page.evaluate(() => window.__shareProbe.writes.length), 0, 'startup never writes to clipboard');
    assert.equal(await page.evaluate(() => window.__shareProbe.permissionQueries), 0, 'startup never queries clipboard permission');
    assert.equal((await address.inputValue()).includes('PRIVATE'), false);
    assert.equal(new URL(page.url()).search, '?profile=SYNTHETIC_PRIVATE_QUERY');
    await address.focus(); await page.keyboard.press('ControlOrMeta+a');
    assert.equal(await address.evaluate(input => input.selectionEnd - input.selectionStart), expected.length, 'manual URL remains keyboard-selectable');
    await copy.focus(); await page.keyboard.press('Enter');
    await page.getByRole('status').filter({ hasText: 'App address copied.' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__shareProbe.writes), [expected]);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected, 'native clipboard contains the exact generic URL');
    for (const width of [320, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    assert.equal(await page.evaluate(() => window.__shareProbe.networkCalls), 0);
    reports.push({ base, actualEntryUrl: loadedEntryUrl, privateQueryAndInitialRouteExcluded: true, startupClipboardWrites: 0, startupPermissionQueries: 0, nativeCopyExact: true, manualKeyboardSelection: true, productNetworkCalls: 0 });
  }

  // Native permission denial exercises the actual browser clipboard API, rather than a
  // fabricated success/failure return. The same visible readonly address must remain.
  const session = await context.newCDPSession(page);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  await session.send('Browser.setPermission', { permission: { name: 'clipboard-write' }, setting: 'denied', origin, browserContextId: targetInfo.browserContextId });
  await copy.click();
  await page.getByRole('status').filter({ hasText: 'Copying is unavailable.' }).waitFor();
  assert.equal(await address.inputValue(), origin + bases[1]);
  assert.equal(await address.isEnabled(), true);
  assert.equal(await page.evaluate(() => window.__shareProbe.outcomes.at(-1)), 'NotAllowedError');
  assert.equal(await page.getByRole('status').filter({ hasText: 'App address copied.' }).count(), 0);
  await session.detach();
  await page.evaluate(() => { window.__shareProbe.mode = 'pending'; });
  const writesBeforeRouteChange = await page.evaluate(() => window.__shareProbe.writes.length);
  await copy.click();
  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click();
  await address.waitFor();
  assert.equal(await copy.isDisabled(), true, 'a route replacement retains the physical clipboard admission');
  assert.equal(await page.evaluate(() => window.__shareProbe.writes.length), writesBeforeRouteChange + 1);
  await page.evaluate(() => { window.__shareProbe.pending.shift()(); });
  await page.waitForFunction(() => !document.querySelector('[aria-labelledby="generic-app-share-title"] button').disabled);
  assert.equal(await page.getByRole('status').filter({ hasText: 'App address copied.' }).count(), 0, 'retired route completion cannot announce success in its replacement');
  if (process.env.P2P_SHARE_SCREENSHOT) await page.locator('[aria-labelledby="generic-app-share-title"]').screenshot({ path: process.env.P2P_SHARE_SCREENSHOT });

  await page.goto(origin + '/fixture/');
  await address.waitFor();
  assert.equal(await page.evaluate(() => window.__shareProbe.writes.length), 0);
  await page.evaluate(() => { window.__shareProbe.mode = 'pending'; });
  await copy.click();
  assert.equal(await copy.isDisabled(), true);
  assert.equal(await address.isEnabled(), true);
  await page.evaluate(() => { window.__shareFixture.show('https://fixture.example/b/'); window.__shareFixture.show('https://fixture.example/a/'); window.__shareProbe.pending.shift()(); });
  await copy.waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('button').disabled);
  assert.equal(await page.getByRole('status').textContent(), '', 'A→B→A owner replacement cannot publish an old copy success');
  await copy.click();
  await page.evaluate(() => { window.__shareFixture.hide(); window.__shareFixture.show('https://fixture.example/c/'); });
  assert.equal(await copy.isDisabled(), true, 'unmounting cannot release the pending physical clipboard promise');
  assert.equal(await page.evaluate(() => window.__shareProbe.writes.length), 2);
  await page.evaluate(() => { window.__shareProbe.pending.shift()(); });
  await page.waitForFunction(() => !document.querySelector('button').disabled);
  await address.waitFor(); assert.equal(await page.getByRole('status').textContent(), '', 'unmounted owner cannot publish into its replacement');
  await copy.click(); await page.evaluate(() => window.__shareProbe.pending.shift()());
  await page.getByRole('status').filter({ hasText: 'App address copied.' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__shareProbe.writes), ['https://fixture.example/a/', 'https://fixture.example/a/', 'https://fixture.example/c/']);
  await page.evaluate(() => { window.__shareProbe.mode = 'private-error'; }); await copy.click();
  await page.getByRole('status').filter({ hasText: 'Copying is unavailable.' }).waitFor();
  assert.equal((await page.locator('body').innerText()).includes('SYNTHETIC_PRIVATE_PLATFORM_DETAIL'), false);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })); await copy.click();
  await page.getByRole('status').filter({ hasText: 'Copying is unavailable.' }).waitFor();
  assert.equal(await address.inputValue(), 'https://fixture.example/c/');
  await page.evaluate(() => window.__shareFixture.show(null));
  await page.getByRole('status').filter({ hasText: 'A generic app address is unavailable.' }).waitFor();
  assert.equal(await copy.count(), 0); assert.equal(await address.count(), 0);
  assert.equal(await page.evaluate(() => window.__shareProbe.permissionQueries), 0);
  assert.equal(await page.evaluate(() => window.__shareProbe.networkCalls), 0);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ task: 'T83', browser: await browser.version(), ReleaseEnabled: 0, approvedRelease: false, actualAppConsumers: reports,
    nativeClipboardDeniedManualFallback: true, routeRemountRetainsPhysicalAdmission: true, delayedOwnerReplacementSuppressed: true, unmountedOwnerSuppressed: true, currentOwnerCopyConfirmed: true, privateExceptionNotRendered: true,
    absentClipboardManualFallback: true, unsupportedEntryFallback: true, productEgress: 0, pageErrors: 0, graph: graph.modules, assets: evidence.assets }));
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
