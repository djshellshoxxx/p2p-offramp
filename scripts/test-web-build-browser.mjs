/** Emitted development-shell checks in local Chromium. No deployment/device/release attestation. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb, scanBuild } from '../apps/web/scripts/build.mjs';
import { offlinePolicy } from '../apps/web/scripts/static-build-plugin.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-emitted-web-'));
const fixture = JSON.parse(await readFile(resolve(root, 'packages/storage/test/fixtures/vault-python-v1.json'), 'utf8'));
const bases = ['/ipfs/bafy-local-fixture/', '/nested/project/', '/'];
const reports = [], unexpected = [];
let browser, server, forbiddenServer, webOrigin, forbiddenRequests = 0;
const close = async target => { if (target) { target.closeAllConnections(); await new Promise(done => target.close(done)); } };
const listen = target => new Promise((done, fail) => { target.once('error', fail); target.listen(0, '127.0.0.1', done); });
const getOrigin = target => `http://127.0.0.1:${target.address().port}`;
function instrument() {
  const observed = { prompts: 0, networkCalls: 0, workers: [], operations: [], secretReplies: 0, violations: {}, holdReplies: [], heldReplies: {} };
  window.__observed = observed;
  const prompt = async () => { observed.prompts++; throw new Error('FIXTURE_WALLET_DENIED'); };
  Object.defineProperty(window, 'ethereum', { value: { request: prompt, enable: prompt }, configurable: true });
  Object.defineProperty(window, 'solana', { value: { connect: prompt, signTransaction: prompt }, configurable: true });
  const originalFetch = window.fetch;
  window.fetch = (...args) => { observed.networkCalls++; return originalFetch(...args); };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options); observed.workers.push({ url: String(url), type: options?.type });
      // Deterministically hold a selected main-thread reply. A successful restore response is
      // posted only after its IndexedDB add transaction completes, so this can exercise the
      // committed-but-unacknowledged cancellation boundary without stubbing storage or the Worker.
      this.addEventListener('message', event => {
        const message = event.data;
        if (message?.kind !== 'response' || !observed.holdReplies.includes(message.operation)) return;
        event.stopImmediatePropagation();
        const messages = observed.heldReplies[message.operation] ??= [];
        messages.push(message);
      }, { capture: true });
      observed.releaseReply = operation => {
        observed.holdReplies = observed.holdReplies.filter(value => value !== operation);
        const messages = observed.heldReplies[operation] ?? [];
        observed.heldReplies[operation] = [];
        for (const message of messages) this.dispatchEvent(new MessageEvent('message', { data: message }));
      };
      this.addEventListener('message', event => {
        if (/passphrase|sessionId|private-records|fixture only password/.test(JSON.stringify(event.data))) observed.secretReplies++;
      });
    }
    postMessage(message, transfer) {
      observed.operations.push(message.operation);
      if (message.operation === 'status' && window.__holdStatus) { window.__statusHeld = true; return; }
      if (transfer === undefined) super.postMessage(message); else super.postMessage(message, transfer);
    }
  };
  document.addEventListener('securitypolicyviolation', event => {
    observed.violations[event.effectiveDirective] = (observed.violations[event.effectiveDirective] ?? 0) + 1;
  });
}
async function probeActualPolicy(forbidden) {
  const append = (tag, attrs) => { const node = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); document.body.append(node); return node; };
  const initialBase = document.baseURI;
  const base = document.createElement('base'); base.href = forbidden + '/base/'; document.head.append(base);
  append('script', { src: forbidden + '/script.js' }); append('img', { src: forbidden + '/image.png' });
  append('link', { rel: 'stylesheet', href: forbidden + '/style.css' }); append('iframe', { src: forbidden + '/frame' });
  append('object', { data: forbidden + '/object' });
  const inline = document.createElement('script'); inline.textContent = 'window.inlineProbe=true'; document.body.append(inline);
  const button = append('button', { onclick: 'window.eventProbe=true' }); button.click();
  const styled = append('div', { style: 'color:rgb(222,0,0)' });
  const font = new FontFace('Probe', `url(${forbidden}/font.woff2)`); void font.load().catch(() => {});
  void fetch(forbidden + '/fetch').catch(() => {});
  try { const ws = new WebSocket(forbidden.replace('http:', 'ws:') + '/socket'); ws.onerror = () => ws.close(); } catch {}
  let evalBlocked = false, functionBlocked = false;
  try { eval('window.evalProbe=true'); } catch (error) { evalBlocked = error instanceof EvalError; }
  try { new Function('window.functionProbe=true')(); } catch (error) { functionBlocked = error instanceof EvalError; }
  const form = append('form', { action: forbidden + '/form', method: 'post' }); form.submit();
  const blobUrl = URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }));
  const blobWorker = new Worker(blobUrl, { type: 'module' });
  const dataWorker = new Worker('data:text/javascript,postMessage(1)', { type: 'module' });
  await new Promise(done => setTimeout(done, 100)); dataWorker.terminate(); blobWorker.terminate(); URL.revokeObjectURL(blobUrl);
  window.__policyProbe = { baseBlocked: document.baseURI === initialBase, evalBlocked, functionBlocked, inlineBlocked: window.inlineProbe !== true, eventBlocked: window.eventProbe !== true,
    styleBlocked: getComputedStyle(styled).color !== 'rgb(222, 0, 0)' };
}


async function assertPrivateSurfaces(page, expectedHref) {
  const result = await page.evaluate(() => ({ href: location.href, localEntries: localStorage.length, sessionEntries: sessionStorage.length,
    cacheEntries: typeof caches === 'undefined' ? [] : undefined, observed: window.__observed,
    secretInDom: document.documentElement.outerHTML.includes('fixture only password'),
    serviceWorkers: typeof navigator.serviceWorker === 'undefined' ? 0 : undefined }));
  const cacheEntries = await page.evaluate(async () => typeof caches === 'undefined' ? [] : caches.keys());
  const registrations = await page.evaluate(async () => navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0);
  assert.equal(result.href, expectedHref); assert.equal(result.localEntries, 0); assert.equal(result.sessionEntries, 0);
  assert.deepEqual(cacheEntries, []); assert.equal(registrations, 0); assert.equal(result.secretInDom, false);
  assert.equal(result.observed.prompts, 0); assert.equal(result.observed.secretReplies, 0);
  return result.observed;
}
async function seed(page) {
  await page.evaluate(envelope => new Promise((done, fail) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vaults', { keyPath: 'profileId' });
    request.onerror = () => fail(new Error('FIXTURE_IDB_OPEN'));
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('vaults', 'readwrite'); tx.objectStore('vaults').put(envelope);
      tx.oncomplete = () => { db.close(); done(); }; tx.onerror = () => { db.close(); fail(new Error('FIXTURE_IDB_WRITE')); };
    };
  }), fixture.envelope);
}
async function assertSeedPreserved(page) {
  const same = await page.evaluate(envelope => new Promise((done, fail) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onerror = () => fail(new Error('FIXTURE_IDB_READ'));
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('vaults', 'readonly'), get = tx.objectStore('vaults').get(envelope.profileId);
      get.onsuccess = () => done(JSON.stringify(get.result) === JSON.stringify(envelope));
      get.onerror = () => fail(new Error('FIXTURE_IDB_GET')); tx.oncomplete = () => db.close();
    };
  }), fixture.envelope);
  assert.equal(same, true, 'Recovery failures must preserve the original encrypted fixture');
}

/** Actual compiled consumer; the observer is never imported or called by this fixture. */
async function probeLocalScreenCounts(origin) {
  const native = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'],
    ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  try {
    const context = await native.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(instrument);
    await context.addInitScript(() => {
      window.__analyticsLifecycle = { hides: [], shows: [] };
      addEventListener('pagehide', event => window.__analyticsLifecycle.hides.push(event.persisted));
      addEventListener('pageshow', event => window.__analyticsLifecycle.shows.push(event.persisted));
    });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push('UNEXPECTED_ANALYTICS_REQUEST'); return route.abort();
    });
    await context.routeWebSocket('**/*', socket => { unexpected.push('UNEXPECTED_ANALYTICS_SOCKET'); socket.close(); });
    const page = await context.newPage(); let pageErrors = 0, downloads = 0;
    page.on('pageerror', () => { pageErrors++; }); page.on('download', () => { downloads++; });
    const href = origin + '/analytics-fixture/?profile=PRIVATE_ANALYTICS_QUERY_20261102';
    const panel = page.locator('section[aria-labelledby="local-screen-counts-title"]');
    const frame = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const counts = async () => (await panel.locator('tbody td').allTextContents()).map(Number);
    const expectCounts = async expected => {
      await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('section[aria-labelledby="local-screen-counts-title"] tbody td')].map(node => Number(node.textContent))) === JSON.stringify(expected), expected);
      assert.deepEqual(await counts(), expected);
    };
    const settings = async () => { await page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true }).click(); await panel.waitFor(); await frame(); };
    const durable = () => page.evaluate(async () => {
      const databases = [];
      for (const info of (await indexedDB.databases()).sort((a, b) => a.name < b.name ? -1 : 1)) {
        const db = await new Promise((done, fail) => { const request = indexedDB.open(info.name); request.onsuccess = () => done(request.result); request.onerror = fail; });
        try {
          const stores = [];
          for (const name of [...db.objectStoreNames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
            const rows = await new Promise((done, fail) => { const tx = db.transaction(name), request = tx.objectStore(name).getAll(); request.onsuccess = () => done(request.result); request.onerror = fail; });
            stores.push({ name, rows });
          }
          databases.push({ name: info.name, version: db.version, stores });
        } finally { db.close(); }
      }
      return JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, caches: await caches.keys(), databases });
    });
    await page.goto(href + '#/settings');
    await page.getByRole('button', { name: 'Refresh vault status', exact: true }).waitFor(); await panel.waitFor();
    // Recovery's native inventory creates the existing empty vault schema. Establish it
    // with counting still off so the complete durable snapshot can stay byte-exact below.
    await page.getByRole('navigation').getByRole('link', { name: 'Recovery', exact: true }).click();
    await page.getByText('No local profiles exist on this origin yet. Create or restore one first.', { exact: true }).first().waitFor();
    await settings();
    await expectCounts([0, 0, 0, 0, 0]);
    const persistedBefore = await durable(), operationsBefore = await page.evaluate(() => [...window.__observed.operations]);
    assert.equal(await panel.locator('#local-screen-counts-export').count(), 0); assert.equal(downloads, 0);
    await panel.locator('#local-screen-counts-opt-in').click(); await expectCounts([0, 0, 0, 0, 1]);
    await page.evaluate(() => { dispatchEvent(new HashChangeEvent('hashchange')); dispatchEvent(new Event('online')); });
    await frame(); await expectCounts([0, 0, 0, 0, 1]);
    assert.deepEqual(await page.evaluate(() => window.__observed.operations), operationsBefore, 'consent and duplicate commits add no Worker IPC');
    await page.getByRole('navigation').getByRole('link', { name: 'Offers', exact: true }).click(); await frame(); await settings();
    await expectCounts([0, 1, 0, 0, 2]);
    for (const id of ['PRIVATE_TRADE_ALPHA_20261102', 'PRIVATE_TRADE_BETA_20261102']) {
      await page.evaluate(id => { location.hash = '#/trade/' + id; }, id);
      await page.getByRole('heading', { level: 1, name: 'Trade review', exact: true }).waitFor(); await frame();
    }
    await settings(); await expectCounts([0, 1, 1, 0, 3]);
    await page.getByRole('navigation').getByRole('link', { name: 'Recovery', exact: true }).click(); await frame();
    await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click(); await frame();
    await settings(); await expectCounts([1, 1, 1, 1, 4]);
    await page.evaluate(() => { location.hash = '#/PRIVATE_UNKNOWN_ANALYTICS_ROUTE'; });
    await page.getByRole('heading', { level: 1, name: 'Page unavailable', exact: true }).waitFor(); await frame();
    await settings(); await expectCounts([1, 1, 1, 1, 5]);
    const operationsBeforeExport = await page.evaluate(() => [...window.__observed.operations]);
    await panel.locator('#local-screen-counts-review').click();
    const text = await panel.locator('#local-screen-counts-export').inputValue();
    assert.ok(Buffer.byteLength(text) <= 1024);
    assert.deepEqual(JSON.parse(text), { format: 'p2p-offramp/local-screen-counts/v1', counts: { home: 1, offers: 1, trade: 1, recovery: 1, settings: 5 } });
    assert.doesNotMatch(text, /PRIVATE|profile|tradeId|url|timestamp|duration|release|session|label/i);
    assert.equal(downloads, 0, 'review is never an automatic download');
    const ready = page.waitForEvent('download'); await panel.locator('#local-screen-counts-download').click(); const download = await ready;
    assert.equal(download.suggestedFilename(), 'p2p-offramp-screen-counts.json'); assert.equal((await readFile(await download.path(), 'utf8')), text);
    assert.equal(downloads, 1);
    assert.equal(await durable(), persistedBefore, 'analytics changes no local/session/cache/IndexedDB bytes or schema');
    assert.deepEqual(await page.evaluate(() => window.__observed.operations), operationsBeforeExport, 'analytics review/download add no Worker IPC');
    await panel.locator('#local-screen-counts-clear').click(); await expectCounts([0, 0, 0, 0, 0]);
    assert.equal(await panel.locator('#local-screen-counts-export').count(), 0);
    await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click(); await settings(); await expectCounts([0, 0, 0, 0, 0]);
    await panel.locator('#local-screen-counts-opt-in').click(); await expectCounts([0, 0, 0, 0, 1]);
    await panel.locator('#local-screen-counts-opt-out').click(); await expectCounts([0, 0, 0, 0, 0]);
    await panel.locator('#local-screen-counts-opt-in').click(); await panel.locator('#local-screen-counts-review').click();
    await page.evaluate(() => {
      const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
      window.__analyticsBlobs = { created: 0, revoked: 0 };
      URL.createObjectURL = blob => { const url = create(blob); window.__analyticsBlobs.created++; dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); return url; };
      URL.revokeObjectURL = url => { window.__analyticsBlobs.revoked++; return revoke(url); };
      window.__restoreAnalyticsFileHelpers = () => { URL.createObjectURL = create; URL.revokeObjectURL = revoke; };
    });
    await panel.locator('#local-screen-counts-download').click(); await frame();
    assert.equal(downloads, 1, 'retirement in a file helper invalidates the exact preview before click');
    assert.deepEqual(await page.evaluate(() => window.__analyticsBlobs), { created: 1, revoked: 1 });
    await page.evaluate(() => { window.__restoreAnalyticsFileHelpers(); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await panel.locator('#local-screen-counts-opt-in').waitFor(); await expectCounts([0, 0, 0, 0, 0]);
    // Actual native BFCache, separately from the preceding controlled lifecycle boundary.
    await panel.locator('#local-screen-counts-opt-in').click(); await panel.locator('#local-screen-counts-review').click();
    await page.evaluate(() => { window.__analyticsCacheMarker = 'PUBLIC_CACHED_DOCUMENT'; });
    const showsBeforeCache = await page.evaluate(() => window.__analyticsLifecycle.shows.length);
    await page.goto(origin + '/analytics-away.html'); await page.goBack({ waitUntil: 'commit' });
    await page.waitForFunction(before => window.__analyticsCacheMarker === 'PUBLIC_CACHED_DOCUMENT' && window.__analyticsLifecycle.shows.length === before + 1 && window.__analyticsLifecycle.shows.at(-1) === true && window.__analyticsLifecycle.hides.at(-1) === true, showsBeforeCache);
    await panel.locator('#local-screen-counts-opt-in').waitFor(); await expectCounts([0, 0, 0, 0, 0]);
    assert.equal(await panel.locator('#local-screen-counts-export').count(), 0);
    // Actual native profile ownership changes, not a cosmetic lock flag.
    await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click(); await seed(page);
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Profile ID', { exact: true }).fill(fixture.envelope.profileId); await page.getByLabel('Passphrase', { exact: true }).fill(fixture.passphrase);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click(); await page.getByText('Vault unlocked', { exact: true }).waitFor();
    await settings(); await panel.locator('#local-screen-counts-opt-in').click(); await panel.locator('#local-screen-counts-review').click();
    await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await page.getByText('Vault locked', { exact: true }).waitFor();
    await panel.locator('#local-screen-counts-opt-in').waitFor(); await expectCounts([0, 0, 0, 0, 0]);
    assert.equal(await panel.locator('#local-screen-counts-export').count(), 0); await assertSeedPreserved(page);
    await panel.locator('#local-screen-counts-opt-in').click(); await panel.locator('#local-screen-counts-review').click();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'analytics controls/export fit the existing layout');
    }
    await panel.locator('#local-screen-counts-download').focus(); assert.equal(await panel.locator('#local-screen-counts-download').evaluate(node => document.activeElement === node), true);
    await page.reload(); await page.getByRole('button', { name: 'Refresh vault status', exact: true }).waitFor();
    await panel.locator('#local-screen-counts-opt-in').waitFor(); await expectCounts([0, 0, 0, 0, 0]);
    const actual = await assertPrivateSurfaces(page, href + '#/settings'); assert.equal(actual.networkCalls, 0); assert.equal(pageErrors, 0);
    reports.push({ localScreenCounts: true, foregroundCategoryNavigation: true, sameCategoryPrivateIdsNotCounted: true,
      noQueryOrIdentifierExport: true, explicitBoundedDownload: true, noPersistenceOrWorkerIpc: true, nativeProfileLockErasure: true,
      reentrantFileHelperRetirement: true, actualBfCacheErasure: true, reloadRequiresFreshConsent: true, ordinaryVisibilityPolicy: 'unit-tested; headless tabs all report visible',
      bfcacheFixture: 'same emitted meta bytes at an owned cacheable prefix; only Playwright disable-BFCache argument omitted', deviceAcceptance: false });
    await context.close();
  } finally { await native.close(); }
}
try {
  const outputs = {};
  for (const delivery of ['meta', 'header']) {
    outputs[delivery] = resolve(temporary, delivery);
    await buildWeb({ delivery, outDir: outputs[delivery] });
  }
  const repeat = resolve(temporary, 'repeat-meta');
  await buildWeb({ delivery: 'meta', outDir: repeat });
  assert.deepEqual((await scanBuild(outputs.meta)).assets, (await scanBuild(repeat)).assets, 'Repeated local builds must match byte hashes');
  forbiddenServer = createServer((request, response) => {
    if (['/frame-parent/header', '/frame-parent/meta'].includes(request.url)) {
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><title>Local framing parent</title><iframe src="${webOrigin}${request.url.endsWith('header') ? '/header/' : '/'}"></iframe>`); return;
    }
    forbiddenRequests++; response.end('FORBIDDEN_LOOPBACK_REQUEST');
  });
  forbiddenServer.on('upgrade', (_request, socket) => { forbiddenRequests++; socket.destroy(); });
  await listen(forbiddenServer);
  const forbiddenOrigin = getOrigin(forbiddenServer);
  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1'), path = url.pathname;
    if (path === '/analytics-away.html') {
      response.setHeader('Cache-Control', 'private,max-age=3600'); response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Owned analytics history target</title><h1>Owned history target</h1>'); return;
    }
    const delivery = path.startsWith('/header/') ? 'header' : 'meta';
    if (delivery === 'header') for (const [name, value] of Object.entries(offlinePolicy('header').headers)) response.setHeader(name, value);
    const localPath = delivery === 'header' ? path.slice('/header'.length) : path;
    if (path === '/fixture-probes.js' || path === '/header/fixture-probes.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`(${probeActualPolicy.toString()})(${JSON.stringify(forbiddenOrigin)});`); return;
    }

    if (localPath.startsWith('/analytics-fixture/')) response.setHeader('Cache-Control', 'private,max-age=3600');
    const base = (localPath.startsWith('/analytics-fixture/') ? ['/analytics-fixture/'] : bases).find(candidate => localPath.startsWith(candidate));
    const relative = base === undefined ? undefined : localPath.slice(base.length) || 'index.html';
    const target = relative === undefined ? '' : resolve(outputs[delivery], relative);
    if (relative === undefined || !target.startsWith(outputs[delivery] + sep) || !/\.(?:html|js|css|json)$/.test(target)) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(bytes => {
      response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json');
      response.end(bytes);
    }, () => { response.writeHead(404); response.end(); });
  });
  await listen(server); const origin = getOrigin(server); webOrigin = origin;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript(instrument);
  await context.route('**/*', route => {
    const destination = new URL(route.request().url());
    if ([origin, forbiddenOrigin].includes(destination.origin) && destination.hostname === '127.0.0.1') return route.continue();
    unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
  });
  await context.routeWebSocket(url => new URL(url).origin !== forbiddenOrigin.replace('http:', 'ws:'), socket => { unexpected.push('UNEXPECTED_WEBSOCKET'); socket.close(); });
  for (const delivery of ['meta', 'header']) for (const base of bases) {
    const prefix = delivery === 'header' ? '/header' : '', href = origin + prefix + base;
    const page = await context.newPage(); page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
    const response = await page.goto(href + '#/home'); assert.equal(response.status(), 200);
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Primary navigation' }).waitFor();
    assert.equal(await page.getByText('Network access disabled', { exact: true }).count(), 1);
    const html = await response.text(), policy = offlinePolicy(delivery);
    if (delivery === 'meta') {
      assert.equal(response.headers()['content-security-policy'], undefined);
      assert.ok(html.indexOf('http-equiv="Content-Security-Policy"') < html.search(/<(?:script|link)\b/i));
    } else assert.equal(response.headers()['content-security-policy'], policy.csp);
    assert.equal(policy.manifest.framingProtected, false);
    assert.match(await page.locator('#content-policy-notice').innerText(), /Framing protection is unverified/);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal clipping at ${width}px`);
    }
    for (const [route, heading] of [['offers', 'Offers'], ['trade/' + 'a'.repeat(32), 'Trade review'], ['recovery', 'Recovery'], ['settings', 'Settings'], ['unknown', 'Page unavailable']]) {
      await page.goto(href + '#/' + route); await page.reload(); await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
    }
    // Default build: no approved registry, so terms review is unavailable and no synthetic demo is reachable.
    await page.goto(href + '#/offers');
    await page.getByText(/^No approved network registry is loaded in this build/).waitFor();
    assert.equal(await page.locator('#terms-file').count(), 0);
    assert.equal(await page.getByText(/SYNTHETIC/).count(), 0);
    await page.goto(href + '#/trade/' + 'a'.repeat(32));
    await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
    const hostile = '<img src=x onerror="window.hostileRan=true"><svg onload="window.hostileRan=true">';
    await page.goto(href + '#/' + encodeURIComponent(hostile));
    await page.getByRole('heading', { name: 'Page unavailable', exact: true }).waitFor();
    assert.equal(await page.locator('main img, main svg, main script').count(), 0);
    assert.equal(await page.evaluate(() => window.hostileRan === true || document.querySelector('main').textContent.includes('<img')), false);
    await page.goto(href + '#/home');
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    const hostileInput = '<img src=x onerror=alert(1)>';
    await page.getByLabel('Profile ID', { exact: true }).fill(hostileInput);
    await page.getByLabel('Passphrase', { exact: true }).fill('discarded fixture secret');
    assert.equal(await page.getByLabel('Profile ID', { exact: true }).inputValue(), hostileInput);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal((await page.getByLabel('Passphrase', { exact: true }).inputValue()) === '', true, 'Passphrase field must be empty');
    assert.equal(await page.evaluate(() => window.__observed.operations.includes('unlock')), false);
    assert.equal(await page.locator('main img, main svg, main script').count(), 0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Unlock existing profile');
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Passphrase', { exact: true }).fill('discarded route fixture secret');
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Passphrase', { exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    assert.equal((await page.getByLabel('Passphrase', { exact: true }).inputValue()) === '', true, 'Passphrase field must be empty');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const observed = await assertPrivateSurfaces(page, href + '#/home');
    assert.equal(observed.networkCalls, 0); assert.equal(observed.workers.length, 1);
    assert.equal(observed.workers[0].type, 'module'); assert.equal(new URL(observed.workers[0].url, href).origin, origin);
    assert.match(observed.workers[0].url, /vault\.worker-[A-Za-z0-9_-]+\.js$/);
    if (delivery === 'meta' && base === '/') {
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
      await page.getByLabel('Profile ID', { exact: true }).fill('f'.repeat(32));
      await page.getByLabel('Passphrase', { exact: true }).fill('nonexistent profile fixture');
      await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'No profile was found' }).waitFor();
      assert.equal((await page.getByLabel('Passphrase', { exact: true }).inputValue()) === '', true, 'Passphrase field must be empty');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await seed(page);
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
      await page.getByLabel('Profile ID', { exact: true }).fill(fixture.envelope.profileId);
      await page.getByLabel('Passphrase', { exact: true }).fill(fixture.passphrase);
      await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
      await page.getByText('Vault unlocked', { exact: true }).waitFor();
      await assertPrivateSurfaces(page, href + '#/home');
      // A status request may hang, but explicit lock must revoke immediately and supersede its notice.
      await page.evaluate(() => { window.__holdStatus = true; window.__statusHeld = false; });
      await page.getByRole('button', { name: 'Refresh vault status', exact: true }).click();
      await page.waitForFunction(() => window.__statusHeld);
      assert.equal(await page.getByRole('button', { name: 'Lock vault', exact: true }).isEnabled(), true, 'status refresh cannot disable lock');
      await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
      await page.getByText('Vault locked', { exact: true }).waitFor();
      await page.evaluate(() => { window.__holdStatus = false; });
      assert.equal(await page.locator('main').getByRole('alert').count(), 0, 'late cancelled refresh does not override explicit lock');
      await page.goto(href + '#/recovery');
      await page.getByLabel('Profile ID', { exact: true }).fill(fixture.envelope.profileId);
      let downloadCount = 0;
      page.on('download', () => { downloadCount++; });
      await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Read and accept the unchecked export notice' }).waitFor();
      assert.equal(downloadCount, 0);
      await page.getByLabel(/encrypted export is unchecked/).check();
      const downloadReady = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
      const download = await downloadReady;
      assert.equal(download.suggestedFilename(), 'p2p-offramp-unchecked-backup.json');
      const bytes = await readFile(await download.path());
      assert.ok(bytes.byteLength > 0); assert.equal(bytes.includes(Buffer.from(fixture.passphrase)), false);
      await page.getByText('Authentication not checked', { exact: true }).waitFor();
      await assertSeedPreserved(page); await assertPrivateSurfaces(page, href + '#/recovery');
      // Fresh-key restore of the downloaded file through the real UI and Worker.
      const restorePass = 'restored ui fixture passphrase', createPass = 'created ui fixture passphrase';
      await page.getByLabel('Encrypted backup file', { exact: true }).setInputFiles(await download.path());
      const fillRestore = async () => {
        await page.getByLabel('Backup passphrase', { exact: true }).fill(fixture.passphrase);
        await page.getByLabel('New passphrase', { exact: true }).fill(restorePass);
        await page.getByLabel('Confirm new passphrase', { exact: true }).fill(restorePass);
      };
      await fillRestore();
      await page.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Read and accept the restore notice' }).waitFor();
      assert.equal(await page.getByLabel('Backup passphrase', { exact: true }).inputValue(), '', 'restore secrets clear on refusal');
      await fillRestore(); await page.getByLabel(/file content is untrusted/).check();
      await page.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
      const restoredText = await page.getByRole('status').filter({ hasText: 'Restored as a new locked profile' }).innerText();
      const restoredId = /profile ([0-9a-f]{32})/.exec(restoredText)?.[1];
      assert.ok(restoredId && restoredId !== fixture.envelope.profileId, 'restore yields a distinct fresh profile');
      // H2: the sibling export list reflects the confirmed new profile without remounting the page.
      await page.getByRole('button', { name: `Use profile ${restoredId}`, exact: true }).waitFor({ timeout: 5000 });
      assert.equal(await page.getByText('Vault locked', { exact: true }).count(), 1, 'restore does not unlock');
      await assertSeedPreserved(page);
      // G03: a confirmed destination can be selected without copying its ID or carrying a passphrase.
      const openRestored = page.getByRole('button', { name: 'Open restored profile', exact: true });
      assert.equal(await openRestored.count(), 1, 'confirmed restore provides an explicit open-profile handoff');
      const unlocksBeforeOpen = await page.evaluate(() => window.__observed.operations.filter(op => op === 'unlock').length);
      await openRestored.click();
      await page.getByRole('heading', { level: 1, name: 'Your local workspace', exact: true }).waitFor();
      assert.equal(await page.getByLabel('Profile ID', { exact: true }).inputValue(), restoredId);
      assert.equal(await page.getByLabel('Passphrase', { exact: true }).inputValue(), '', 'handoff carries no passphrase');
      assert.equal(await page.evaluate(() => window.__observed.operations.filter(op => op === 'unlock').length), unlocksBeforeOpen, 'selection does not unlock');
      await assertPrivateSurfaces(page, href + '#/home');
      await page.getByLabel('Passphrase', { exact: true }).fill(fixture.passphrase);
      await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'could not be authenticated' }).waitFor();
      assert.equal(await page.getByLabel('Passphrase', { exact: true }).inputValue(), '');
      await page.getByLabel('Passphrase', { exact: true }).fill(restorePass);
      await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
      await page.getByText('Vault unlocked', { exact: true }).waitFor();
      assert.equal(await page.getByRole('status').filter({ hasText: 'is selected for unlock in this page only' }).count(), 0, 'successful unlock consumes the handoff');
      await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
      await page.getByText('Vault locked', { exact: true }).waitFor();
      await page.getByRole('link', { name: 'Recovery', exact: true }).click();
      // G03 R1: hold the successful Worker receipt after its IDB add transaction committed.
      // Cancellation then revokes the response generation; retry stays blocked until fresh inventory.
      await page.evaluate(() => { window.__observed.holdReplies = ['restore', 'lock']; });
      await page.getByLabel('Encrypted backup file', { exact: true }).setInputFiles(await download.path());
      await fillRestore(); await page.getByLabel(/file content is untrusted/).check();
      await page.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
      await page.waitForFunction(() => window.__observed.heldReplies.restore?.length === 1);
      const heldRestore = await page.evaluate(() => window.__observed.heldReplies.restore[0]);
      assert.equal(heldRestore.result.ok, true, 'the actual Worker completed restore before its UI reply was held');
      const interruptedId = heldRestore.result.value.newProfileId;
      assert.ok(interruptedId && ![restoredId, fixture.envelope.profileId].includes(interruptedId));
      const destinationCommitted = await page.evaluate(id => new Promise((done, fail) => {
        const request = indexedDB.open('p2p-offramp-vault', 1);
        request.onerror = () => fail(new Error('FIXTURE_IDB_OPEN'));
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('vaults', 'readonly'), get = tx.objectStore('vaults').get(id);
          get.onsuccess = () => done(get.result !== undefined);
          get.onerror = () => fail(new Error('FIXTURE_IDB_GET'));
          tx.oncomplete = () => db.close();
        };
      }), interruptedId);
      assert.equal(destinationCommitted, true, 'destination add is durable before the held reply');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'may have completed' }).waitFor();
      assert.equal(await openRestored.count(), 0, 'cancelled restore cannot select a destination');
      assert.equal(await page.getByRole('button', { name: 'Restore as new profile', exact: true }).isDisabled(), true, 'no blind retry after an uncertain restore');
      const check = page.getByRole('button', { name: 'Check local profiles', exact: true });
      await page.waitForFunction(() => window.__observed.heldReplies.lock?.length === 1);
      await check.click();
      await page.getByText('Another local operation is running. Wait for it to finish before trying again.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Restore as new profile', exact: true }).isDisabled(), true, 'BUSY inventory does not enable retry');
      assert.equal(await page.getByText(/^Profiles on this origin now \(\d+\)/).count(), 0, 'BUSY is not treated as a fresh inventory');
      // Deliver the stale committed receipt after cancellation, then let the new-generation lock finish.
      // The runtime must ignore the old response; only the subsequent local inventory may resolve uncertainty.
      await page.evaluate(() => window.__observed.releaseReply('restore'));
      await page.evaluate(() => window.__observed.releaseReply('lock'));

      // A bounded inventory can be fresh but incomplete. It must not resolve uncertainty or enable a
      // retry when an interrupted destination might be among the unlisted rows.
      const overflowIds = await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('p2p-offramp-vault', 1);
          request.onerror = () => reject(new Error('FIXTURE_IDB_OPEN'));
          request.onsuccess = () => resolve(request.result);
        });
        const transaction = db.transaction('vaults', 'readwrite'), store = transaction.objectStore('vaults');
        const keys = new Set(await new Promise((resolve, reject) => {
          const request = store.getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('FIXTURE_IDB_KEYS'));
        }));
        const ids = [];
        for (let value = 0; ids.length < 14; value++) {
          const id = value.toString(16).padStart(32, '0');
          if (!keys.has(id)) { store.add({ profileId: id, testOnlyOverflow: true }); ids.push(id); }
        }
        await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(new Error('FIXTURE_IDB_ADD')); });
        db.close(); return ids;
      });
      await page.getByRole('button', { name: 'Check local profiles', exact: true }).click();
      const restoreForm = page.getByRole('form', { name: 'Restore an encrypted file', exact: true });
      await restoreForm.getByText(/More rows exist than this build lists/).waitFor({ timeout: 5000 });
      assert.equal(await page.getByRole('button', { name: 'Restore as new profile', exact: true }).isDisabled(), true,
        'incomplete inventory keeps retry blocked');
      await page.evaluate(ids => new Promise((resolve, reject) => {
        const request = indexedDB.open('p2p-offramp-vault', 1);
        request.onerror = () => reject(new Error('FIXTURE_IDB_OPEN'));
        request.onsuccess = () => {
          const db = request.result, transaction = db.transaction('vaults', 'readwrite'), store = transaction.objectStore('vaults');
          for (const id of ids) store.delete(id);
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(new Error('FIXTURE_IDB_DELETE'));
        };
      }), overflowIds);
      await page.getByRole('button', { name: 'Check local profiles', exact: true }).click();
      await page.getByText(/^Profiles on this origin now \(\d+\)/).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Restore as new profile', exact: true }).isDisabled(), false, 'retry allowed after reconciliation');
      const inventoryStatus = page.getByRole('status').filter({ hasText: 'Profiles on this origin now' });
      assert.equal(await inventoryStatus.getByText(interruptedId, { exact: true }).count(), 1, 'fresh inventory reveals the opaque ID without a success receipt');
      assert.equal(await page.getByRole('status').filter({ hasText: 'Restored as a new locked profile' }).count(), 0, 'inventory does not attribute a profile to the interrupted restore');
      assert.equal(await openRestored.count(), 0, 'stale success and reconciliation do not produce a confirmed-destination handoff');
      assert.match(await inventoryStatus.innerText(), /may be from the interrupted restore; nothing was deleted/);
      await assertSeedPreserved(page);
      // Create through the UI: mismatch refusal, then explicit consent.
      await page.getByRole('link', { name: 'Home', exact: true }).click();
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
      assert.equal(await page.getByLabel('Profile ID', { exact: true }).inputValue(), '', 'uncertain restore does not preselect any inventory row');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
      await page.getByLabel('New passphrase', { exact: true }).fill(createPass);
      await page.getByLabel('Confirm new passphrase', { exact: true }).fill(createPass + ' typo');
      await page.getByLabel(/no passphrase reset/).check();
      await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'do not match' }).waitFor();
      assert.equal(await page.getByLabel('New passphrase', { exact: true }).inputValue(), '');
      await page.getByLabel('New passphrase', { exact: true }).fill(createPass);
      await page.getByLabel('Confirm new passphrase', { exact: true }).fill(createPass);
      await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
      await page.getByText('Vault unlocked', { exact: true }).waitFor();
      const createdId = /Profile ([0-9a-f]{32}) was created/.exec(await page.getByRole('status').filter({ hasText: 'was created and unlocked' }).innerText())?.[1];
      assert.ok(createdId && ![restoredId, fixture.envelope.profileId].includes(createdId));
      // T34: authenticate actual selected file bytes against the open profile; no export/unlock/restore flag.
      await page.getByRole('link', { name: 'Recovery', exact: true }).click();
      const verificationForm = page.getByRole('form', { name: 'Authenticate a backup file against this profile', exact: true });
      await verificationForm.getByRole('button', { name: 'Recheck verified revision', exact: true }).click();
      await verificationForm.getByText('No authenticated backup verification is held for this profile selection.', { exact: true }).waitFor();
      const exportCreated = async () => {
        await page.getByLabel('Profile ID', { exact: true }).fill(createdId);
        await page.getByLabel(/encrypted export is unchecked/).check();
        const ready = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
        return await (await ready).path();
      };
      const createdBackupPath = await exportCreated();
      const verifySelected = async (path, passphrase) => {
        await verificationForm.getByLabel('Backup file to authenticate', { exact: true }).setInputFiles(path);
        await verificationForm.getByLabel('Passphrase for this backup file', { exact: true }).fill(passphrase);
        await verificationForm.getByRole('button', { name: 'Verify this backup file', exact: true }).click();
      };
      await verifySelected(await download.path(), fixture.passphrase);
      await verificationForm.getByRole('alert').filter({ hasText: 'does not match the open profile' }).waitFor();
      await verifySelected(createdBackupPath, 'wrong but valid backup passphrase');
      await verificationForm.getByRole('alert').filter({ hasText: 'could not be authenticated' }).waitFor();
      assert.equal(await verificationForm.getByLabel('Passphrase for this backup file', { exact: true }).inputValue(), '');
      await verifySelected(createdBackupPath, createPass);
      await verificationForm.getByRole('status').filter({ hasText: `profile ${createdId}, revision 0` }).waitFor();
      await verificationForm.getByRole('button', { name: 'Recheck verified revision', exact: true }).click();
      await verificationForm.getByRole('status').filter({ hasText: `profile ${createdId}, revision 0` }).waitFor();
      // A second real Worker on a second page changes that same committed encrypted profile.
      const writerPage = await context.newPage();
      await writerPage.goto(href + '#/home');
      const mutation = await writerPage.evaluate(async ({ profileId, passphrase }) => {
        const url = window.__observed.workers[0].url, worker = new Worker(url, { type: 'module' });
        let sequence = 0;
        const call = (operation, fields = {}) => new Promise((resolve, reject) => {
          const requestId = ++sequence;
          const listener = event => {
            if (event.data.requestId !== requestId) return;
            worker.removeEventListener('message', listener);
            if (!event.data.result?.ok) reject(new Error('FIXTURE_BACKUP_MUTATION_FAILED')); else resolve(event.data.result.value);
          };
          worker.addEventListener('message', listener);
          worker.postMessage({ version: 1, requestId, generation: 0, operation, ...fields });
        });
        try {
          await call('init', { config: { version: 1, ReleaseEnabled: 0, connectOrigins: [] } });
          await call('unlock', { profileId, passphrase });
          await call('saveTermsReview', { profileId, source: 'file', bytes: new Uint8Array([1]) });
          return true;
        } finally { worker.terminate(); }
      }, { profileId: createdId, passphrase: createPass });
      assert.equal(mutation, true); await writerPage.close();
      await verificationForm.getByRole('button', { name: 'Recheck verified revision', exact: true }).click();
      await page.getByText('Vault locked', { exact: true }).waitFor();
      assert.equal(await verificationForm.getByText(/Backup file authenticated against profile/).count(), 0, 'cross-tab freshness failure clears display receipt');
      const openCreated = async () => {
        await page.getByRole('link', { name: 'Home', exact: true }).click();
        await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
        await page.getByLabel('Profile ID', { exact: true }).fill(createdId);
        await page.getByLabel('Passphrase', { exact: true }).fill(createPass);
        await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
        await page.getByText('Vault unlocked', { exact: true }).waitFor();
        await page.getByRole('link', { name: 'Recovery', exact: true }).click();
      };
      await openCreated();
      await verificationForm.getByRole('button', { name: 'Recheck verified revision', exact: true }).click();
      await verificationForm.getByText('No authenticated backup verification is held for this profile selection.', { exact: true }).waitFor();
      await verifySelected(createdBackupPath, createPass);
      await verificationForm.getByRole('alert').filter({ hasText: 'does not match the open profile' }).waitFor();
      const latestBackupPath = await exportCreated();
      await verifySelected(latestBackupPath, createPass);
      await verificationForm.getByRole('status').filter({ hasText: `profile ${createdId}, revision 1` }).waitFor();
      await page.evaluate(() => { window.__observed.holdReplies = ['verifyBackup']; });
      await verifySelected(latestBackupPath, createPass);
      await page.waitForFunction(() => window.__observed.heldReplies.verifyBackup?.length === 1);
      await verificationForm.getByRole('button', { name: 'Cancel verification', exact: true }).click();
      await page.getByText('Vault locked', { exact: true }).waitFor();
      await page.evaluate(() => window.__observed.releaseReply('verifyBackup'));
      assert.equal(await verificationForm.getByText(/Backup file authenticated against profile/).count(), 0, 'late native success cannot restore cancelled verification');
      await openCreated();
      await verificationForm.getByRole('button', { name: 'Recheck verified revision', exact: true }).click();
      await verificationForm.getByText('No authenticated backup verification is held for this profile selection.', { exact: true }).waitFor();
      await page.getByRole('link', { name: 'Home', exact: true }).click();
      await assertSeedPreserved(page);
      reports.push({ backupVerification: true, currentProfileRevision: true, wrongFileAndPassphrase: true, crossTabStaleCheck: true, lateCancelledVerification: true, noBackupReadinessFromExportUnlockRestore: true });
      await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
      await page.getByText('Vault locked', { exact: true }).waitFor();
      // Inventory lists all four opaque IDs; choosing one fills the editable field.
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
      await page.getByText('Profiles on this origin (4 of 16)', { exact: true }).waitFor();
      await page.getByRole('button', { name: `Use profile ${restoredId}`, exact: true }).click();
      assert.equal(await page.getByLabel('Profile ID', { exact: true }).inputValue(), restoredId);
      await page.getByLabel('Passphrase', { exact: true }).fill(restorePass);
      await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
      await page.getByText('Vault unlocked', { exact: true }).waitFor();
      // H1: unlocking a different profile must not show the earlier creation receipt next to it.
      assert.equal(await page.getByText('was created and unlocked').count(), 0, 'no stale creation receipt beside another unlocked profile');
      assert.equal(await page.evaluate(secrets => secrets.some(secret => document.documentElement.outerHTML.includes(secret)), [restorePass, createPass, fixture.passphrase]), false);
      await assertPrivateSurfaces(page, href + '#/home');
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal clipping at ${width}px with inventory`);
      }
      // A confirmed restore while another profile is unlocked never locks or switches implicitly.
      await page.getByRole('link', { name: 'Recovery', exact: true }).click();
      await page.getByLabel('Encrypted backup file', { exact: true }).setInputFiles(await download.path());
      await fillRestore(); await page.getByLabel(/file content is untrusted/).check();
      await page.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
      const switchText = await page.getByRole('status').filter({ hasText: 'Restored as a new locked profile' }).innerText();
      const switchId = /profile ([0-9a-f]{32})/.exec(switchText)?.[1];
      assert.ok(switchId && ![createdId, interruptedId, restoredId, fixture.envelope.profileId].includes(switchId));
      const operationsBeforeSwitch = await page.evaluate(() => window.__observed.operations.filter(op => ['unlock', 'lock'].includes(op)));
      await openRestored.click();
      await page.getByRole('heading', { level: 1, name: 'Your local workspace', exact: true }).waitFor();
      await page.getByText('A profile is already unlocked.', { exact: false }).waitFor();
      assert.equal(await page.getByText('Vault unlocked', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Passphrase', { exact: true }).count(), 0, 'explicit lock is required before switching');
      assert.deepEqual(await page.evaluate(() => window.__observed.operations.filter(op => ['unlock', 'lock'].includes(op))), operationsBeforeSwitch, 'handoff neither locks nor unlocks');
      await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
      await page.getByLabel('Passphrase', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Profile ID', { exact: true }).inputValue(), switchId);
      assert.equal(await page.getByLabel('Passphrase', { exact: true }).inputValue(), '');
      // Reload while the handoff is selected returns to manual profile selection.
      await page.reload();
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
      assert.equal(await page.getByLabel('Profile ID', { exact: true }).inputValue(), '', 'reload has no active-profile pointer');
      await page.getByText('Profiles on this origin (5 of 16)', { exact: true }).waitFor();
      await page.getByRole('button', { name: `Use profile ${switchId}`, exact: true }).click();
      await page.getByLabel('Passphrase', { exact: true }).fill(restorePass);
      await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
      await page.getByText('Vault unlocked', { exact: true }).waitFor();
      await assertPrivateSurfaces(page, href + '#/home');
      await assertSeedPreserved(page);
      // A later confirmed handoff can also be cancelled without leaving a sticky selection.
      await page.getByRole('link', { name: 'Recovery', exact: true }).click();
      await page.getByLabel('Encrypted backup file', { exact: true }).setInputFiles(await download.path());
      await fillRestore(); await page.getByLabel(/file content is untrusted/).check();
      await page.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Restored as a new locked profile' }).waitFor();
      await openRestored.click();
      await page.getByText('A profile is already unlocked.', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
      await page.getByLabel('Passphrase', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
      assert.equal(await page.getByLabel('Profile ID', { exact: true }).inputValue(), '', 'cancel clears the confirmed destination selection');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByText('Vault locked', { exact: true }).waitFor();
      await page.goto(href + '#/recovery');
      // Browser offline does not promise a fresh page load; an already loaded shell retains guidance.
      await context.setOffline(true);
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await page.getByText('Browser offline', { exact: true }).waitFor();
      await page.getByRole('link', { name: 'Recovery', exact: true }).click();
      await page.getByRole('heading', { level: 1, name: 'Recovery', exact: true }).waitFor();
      await context.setOffline(false);
    }
    reports.push({ delivery, base, widths: [320, 768, 1024, 1440], hashReload: true, lockedBoot: true, hostileRouteAndTextbox: true });
    await page.close();
  }
  // Compatibility is startup guidance only: absent optional APIs never request permission or block core.
  for (const mode of ['missing-file-export', 'optional-absent', 'runtime-constructor-failure']) {
    const page = await context.newPage();
    await page.addInitScript(mode => {
      window.__compatPermissions = 0; window.__compatWorkerAttempts = 0;
      const forbidden = () => { window.__compatPermissions++; throw Error('PRIVATE permission probe'); };
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: forbidden } });
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mode === 'optional-absent' ? undefined : { getUserMedia: forbidden } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'optional-absent' ? undefined : forbidden });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'optional-absent' ? undefined : { writeText: forbidden } });
      if (mode === 'missing-file-export') Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: undefined });
      if (mode === 'runtime-constructor-failure') {
        // Methods are present, so only the existing runtime's actual construction can find this failure.
        window.Worker = class {
          constructor() { window.__compatWorkerAttempts++; throw Error('PRIVATE worker construction failure'); }
          postMessage() {} terminate() {}
        };
      }
    }, mode);
    await page.goto(origin + '/#/home');
    if (mode === 'optional-absent') {
      await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).waitFor();
      assert.equal(await page.locator('#startup-compatibility-title').count(), 0, 'normal startup has no distracting API detail table');
    } else {
      await page.getByRole('alert').waitFor();
      await page.getByRole('heading', { level: 2, name: mode === 'missing-file-export' ? 'Read-only browser mode' : 'Recovery remains available', exact: true }).waitFor();
      if (mode === 'missing-file-export') await page.getByText('Missing or unavailable: encrypted file download.', { exact: true }).waitFor();
      await page.getByText('This local feature check does not verify wallet or device support. Browser storage can still be blocked or lost.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).count(), 0);
      await page.getByRole('link', { name: 'Read recovery guidance', exact: true }).click();
      await page.getByRole('heading', { level: 1, name: 'Recovery', exact: true }).waitFor();
    }
    const actual = await assertPrivateSurfaces(page, origin + (mode === 'optional-absent' ? '/#/home' : '/#/recovery'));
    assert.equal(actual.networkCalls, 0); assert.equal(actual.workers.length, mode === 'optional-absent' ? 1 : 0);
    const counters = await page.evaluate(() => ({ permissions: window.__compatPermissions, attempts: window.__compatWorkerAttempts,
      privateErrorVisible: document.documentElement.outerHTML.includes('PRIVATE') }));
    assert.equal(counters.permissions, 0); assert.equal(counters.attempts, mode === 'runtime-constructor-failure' ? 1 : 0);
    assert.equal(counters.privateErrorVisible, false);
    reports.push({ mode, startupCompatibility: true, readonlyRecovery: mode !== 'optional-absent', noPermissionOrWalletPrompt: true,
      actualRuntimeFailurePreserved: mode === 'runtime-constructor-failure', deviceQualification: false });
    await page.close();
  }
  // Apply negative probes to the actual generated policy and actual served artifact, rather than
  // interpreting a configuration object as browser enforcement evidence.
  for (const delivery of ['meta', 'header']) {
    const page = await context.newPage(); await page.goto(origin + (delivery === 'header' ? '/header' : '') + '/');
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).waitFor();
    await page.evaluate(() => { const script = document.createElement('script'); script.src = './fixture-probes.js'; document.body.append(script); });
    await page.waitForFunction(() => window.__policyProbe !== undefined);
    const blocked = await page.evaluate(() => window.__policyProbe);
    for (const [name, value] of Object.entries(blocked)) assert.equal(value, true, `${delivery}: ${name}`);
    await page.waitForFunction(() => ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-elem', 'style-src-attr', 'font-src', 'img-src', 'frame-src', 'object-src', 'connect-src', 'worker-src', 'form-action', 'base-uri'].every(key => window.__observed.violations[key] > 0));
    reports.push({ delivery, actualArtifactPolicyDenials: true }); await page.close();
  }
  for (const delivery of ['header', 'meta']) {
    const page = await context.newPage(); await page.goto(forbiddenOrigin + '/frame-parent/' + delivery);
    if (delivery === 'meta') await page.frameLocator('iframe').getByRole('heading', { level: 1, name: 'Your local workspace', exact: true }).waitFor();
    else await page.waitForFunction(() => document.querySelector('iframe') !== null);
    if (delivery === 'header') {
      if (!page.frames().some(frame => frame.url() === 'chrome-error://chromewebdata/')) await page.waitForEvent('framenavigated', {
        predicate: frame => frame.parentFrame() !== null && frame.url() === 'chrome-error://chromewebdata/', timeout: 10_000,
      }).catch(error => { if (!page.frames().some(frame => frame.url() === 'chrome-error://chromewebdata/')) throw error; });
    }
    reports.push({ delivery, localFraming: delivery === 'header' ? 'blocked' : 'permitted-as-disclosed', deployedAttestation: false });
    await page.close();
  }
  for (const mode of ['missing-entry', 'missing-worker', 'unsupported-document-crypto', 'unsupported-worker-storage']) {
    const page = await context.newPage();
    if (mode === 'missing-entry') await page.route('**/assets/index-*.js', route => route.abort('failed'));
    if (mode === 'missing-worker') await page.route('**/assets/vault.worker-*.js', route => route.abort('failed'));
    if (mode === 'unsupported-document-crypto') await page.addInitScript(() => Object.defineProperty(window, 'crypto', { value: undefined }));
    if (mode === 'unsupported-worker-storage') await page.route('**/assets/vault.worker-*.js', async route => {
      const response = await route.fetch(); await route.fulfill({ response, body: "Object.defineProperty(globalThis, 'indexedDB', {value:undefined});\n" + await response.text() });
    });
    await page.goto(origin + '/#/recovery');
    if (mode === 'missing-entry') assert.match(await page.locator('#root').innerText(), /encrypted local data is not reset/);
    else {
      await page.getByRole('heading', { name: 'Recovery', level: 1, exact: true }).waitFor();
      await page.getByRole('alert').waitFor({ timeout: 35_000 }).catch(() => { throw new Error(`RECOVERY_ALERT_MISSING: ${mode}`); });
      assert.equal(await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).count(), 0);
    }
    await page.close();
    const reader = await context.newPage(); await reader.goto(origin + '/'); await assertSeedPreserved(reader); await reader.close();
    reports.push({ mode, encryptedSourcePreserved: true });
  }
  await probeLocalScreenCounts(origin);
  assert.equal(forbiddenRequests, 0); assert.deepEqual(unexpected, []);
  await context.close();
  console.log(JSON.stringify({ fixture: 'emitted-react-vite-shell-local-chromium', browser: browser.version(), reports,
    localRebuildByteMatch: true, nativeEncryptedUnlockExport: true, uiCreateRestoreInventory: true, uiRestoreReconciliation: true, automaticWalletPrompts: 0, forbiddenLoopbackRequests: forbiddenRequests,
    unexpectedRequests: unexpected.length, deviceAcceptance: false, deployedFramingAttestation: false, signedRelease: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); await close(server); await close(forbiddenServer); await rm(temporary, { recursive: true, force: true });
}
