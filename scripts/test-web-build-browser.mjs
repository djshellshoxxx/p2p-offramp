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
  const observed = { prompts: 0, networkCalls: 0, workers: [], operations: [], secretReplies: 0, violations: {} };
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
      this.addEventListener('message', event => {
        if (/passphrase|sessionId|private-records|fixture only password/.test(JSON.stringify(event.data))) observed.secretReplies++;
      });
    }
    postMessage(message, transfer) {
      observed.operations.push(message.operation);
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
    const delivery = path.startsWith('/header/') ? 'header' : 'meta';
    if (delivery === 'header') for (const [name, value] of Object.entries(offlinePolicy('header').headers)) response.setHeader(name, value);
    const localPath = delivery === 'header' ? path.slice('/header'.length) : path;
    if (path === '/fixture-probes.js' || path === '/header/fixture-probes.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`(${probeActualPolicy.toString()})(${JSON.stringify(forbiddenOrigin)});`); return;
    }

    const base = bases.find(candidate => localPath.startsWith(candidate));
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
    for (const [route, heading] of [['offers', 'Offers'], ['trade/' + 'a'.repeat(32), 'Trade unavailable'], ['recovery', 'Recovery'], ['settings', 'Settings'], ['unknown', 'Page unavailable']]) {
      await page.goto(href + '#/' + route); await page.reload(); await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
    }
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
      await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
      await page.getByText('Vault locked', { exact: true }).waitFor();
      await page.goto(href + '#/recovery');
      await page.getByLabel('Profile ID', { exact: true }).fill(fixture.envelope.profileId);
      let downloadCount = 0;
      page.on('download', () => { downloadCount++; });
      await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Read and accept the unchecked export notice' }).waitFor();
      assert.equal(downloadCount, 0);
      await page.getByRole('checkbox').check();
      const downloadReady = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
      const download = await downloadReady;
      assert.equal(download.suggestedFilename(), 'p2p-offramp-unchecked-backup.json');
      const bytes = await readFile(await download.path());
      assert.ok(bytes.byteLength > 0); assert.equal(bytes.includes(Buffer.from(fixture.passphrase)), false);
      await page.getByText('Authentication not checked', { exact: true }).waitFor();
      await assertSeedPreserved(page); await assertPrivateSurfaces(page, href + '#/recovery');
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
  assert.equal(forbiddenRequests, 0); assert.deepEqual(unexpected, []);
  await context.close();
  console.log(JSON.stringify({ fixture: 'emitted-react-vite-shell-local-chromium', browser: browser.version(), reports,
    localRebuildByteMatch: true, nativeEncryptedUnlockExport: true, automaticWalletPrompts: 0, forbiddenLoopbackRequests: forbiddenRequests,
    unexpectedRequests: unexpected.length, deviceAcceptance: false, deployedFramingAttestation: false, signedRelease: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); await close(server); await close(forbiddenServer); await rm(temporary, { recursive: true, force: true });
}
