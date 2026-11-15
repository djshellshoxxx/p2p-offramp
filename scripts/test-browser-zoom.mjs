/** Actual desktop zoom through normal X input in an owned headful Chromium.
 * Requires explicitly supplied, locally verified X11 tools. No policy changes,
 * viewport/device-scale/CSS emulation, pinch, deployment or physical-device claim.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), exec = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');
const toolsInput = process.env.P2P_X11_TOOLS;
assert.ok(typeof toolsInput === 'string' && isAbsolute(toolsInput), 'P2P_X11_TOOLS must name the explicitly trusted local X11 extraction; no fallback');
const tools = await realpath(toolsInput);
const provenanceBytes = await readFile(resolve(tools, 'provenance.json'));
assert.ok(provenanceBytes.length <= 32768, 'bounded local tooling provenance');
const provenance = JSON.parse(provenanceBytes), toolFiles = [];
for (const path of ['usr/bin/Xvfb', 'usr/bin/xdotool', 'usr/lib/x86_64-linux-gnu/libxdo.so.3']) {
  const target = resolve(tools, path), metadata = await lstat(target);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size <= 16 * 1024 * 1024, 'regular owned tool file');
  const bytes = await readFile(target), expected = provenance.exercisedToolFiles?.find(row => row.path === path);
  assert.ok(expected, `provenance binds ${path}`); assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256);
  toolFiles.push({ path, bytes: bytes.length, sha256: sha(bytes) });
}
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-browser-zoom-'));
const checks = [], observations = [], unexpected = [];
let server, context, xvfb, xvfbClosed, nativeWindow, xdo, page, sourceModules, buildEvidence, browserDeadline;
let browserDeadlineExpired = false;
const pass = name => { checks.push(name); console.log(`ok - ${name}`); };
const pause = ms => new Promise(done => setTimeout(done, ms));
async function within(promise, ms, label) {
  let timeout;
  try { return await Promise.race([promise, new Promise((_, fail) => { timeout = setTimeout(() => fail(Error(label)), ms); })]); }
  finally { clearTimeout(timeout); }
}
function instrumentProduct() {
  window.__zoomObserved = { walletPrompts: 0, fetchCalls: 0, workers: [] };
  const denied = async () => { window.__zoomObserved.walletPrompts++; throw Error('PUBLIC_ZOOM_FIXTURE_WALLET_DENIED'); };
  Object.defineProperty(window, 'ethereum', { configurable: true, value: { request: denied, enable: denied } });
  Object.defineProperty(window, 'solana', { configurable: true, value: { connect: denied, signTransaction: denied } });
  const fetch = window.fetch;
  window.fetch = (...args) => { window.__zoomObserved.fetchCalls++; return fetch(...args); };
  const Worker = window.Worker;
  window.Worker = class extends Worker {
    constructor(url, options) { super(url, options); window.__zoomObserved.workers.push({ url: String(url), type: options?.type }); }
  };
}
const metrics = () => page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio,
  visualViewport: { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } }));
async function nativeZoom(factor) {
  await xdo(['windowfocus', '--sync', nativeWindow]); await xdo(['key', '--clearmodifiers', 'ctrl+0']);
  await page.waitForFunction(() => Math.abs(devicePixelRatio - 1) < .001 && innerWidth === 1280);
  for (let index = 0; index < (factor === 1 ? 0 : factor === 2 ? 5 : 8); index++) {
    const before = (await metrics()).devicePixelRatio;
    await xdo(['key', '--clearmodifiers', 'ctrl+plus']);
    await page.waitForFunction(before => devicePixelRatio > before, before);
  }
  await page.waitForFunction(factor => Math.abs(devicePixelRatio - factor) < .001 && innerWidth === 1280 / factor && visualViewport.scale === 1, factor);
  await xdo(['key', '--clearmodifiers', 'Escape']);
  const observed = await metrics();
  assert.equal(observed.outerWidth, 1280); assert.equal(observed.devicePixelRatio, factor);
  assert.equal(observed.innerWidth, 1280 / factor); assert.equal(observed.visualViewport.scale, 1);
  return observed;
}
async function geometry(label) {
  const value = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll('main button, main input, main select, main textarea, main a, header button, nav a')]
      .filter(node => node.getClientRects().length).filter(node => { const rect = node.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; })
      .map(node => ({ tag: node.tagName, id: node.id })) }));
  assert.ok(value.document <= value.viewport + 1, `${label}: document overflow ${JSON.stringify(value)}`);
  assert.deepEqual(value.clipped, [], `${label}: rendered controls fit horizontally`);
  assert.equal(await page.locator('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').count(), 0);
  const controls = page.locator('main button:enabled, main input:enabled, main select:enabled, main textarea:enabled, main a, header button:enabled, nav a');
  assert.ok(await controls.count() <= 96, 'finite enabled control inspection'); let reached = 0;
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue;
    await control.focus(); assert.equal(await control.evaluate(node => document.activeElement === node), true, `${label}: native DOM focus`);
    await control.click({ trial: true }); reached++;
  }
  assert.ok(reached > 0, `${label}: enabled controls are actionable without activating them`);
  return { ...value, reachableEnabledControls: reached };
}
async function navigate(name, heading) {
  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name, exact: true }).click();
  await page.getByRole('heading', { name: heading, level: 1, exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement === document.querySelector('h1'));
}
async function checkSourceModules() {
  for (const row of sourceModules) assert.equal(sha(await readFile(resolve(root, row.path))), row.sha256, `compiled source stays frozen: ${row.path}`);
}
let result;
try {
  const out = resolve(temporary, 'demo'); buildEvidence = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(buildEvidence.ReleaseEnabled, 0); assert.equal(buildEvidence.syntheticDemo, true);
  const modules = new Map();
  for (const file of ['core-graph-document.json', 'core-graph-worker.json']) {
    for (const row of JSON.parse(await readFile(resolve(out, file), 'utf8')).modules) modules.set(row.path, row);
  }
  sourceModules = [...modules.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')); await checkSourceModules();
  const auth = resolve(temporary, 'Xauthority'), cookie = randomBytes(16).toString('hex');
  await writeFile(auth, '', { mode: 0o600, flag: 'wx' });
  await exec('/usr/bin/xauth', ['-f', auth, 'add', ':0', 'MIT-MAGIC-COOKIE-1', cookie], { timeout: 5000 });
  xvfb = spawn(resolve(tools, 'usr/bin/Xvfb'), ['-displayfd', '3', '-screen', '0', '1600x1000x24', '-nolisten', 'tcp', '-auth', auth],
    { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe'] });
  xvfbClosed = new Promise(done => xvfb.once('close', done));
  let diagnostics = 0; xvfb.stderr.on('data', bytes => { diagnostics += bytes.length; if (diagnostics > 32768) { try { process.kill(-xvfb.pid, 'SIGTERM'); } catch {} } });
  const number = await within(new Promise((done, fail) => {
    let text = ''; xvfb.once('error', fail); xvfb.once('exit', () => fail(Error('XVFB_EXITED_BEFORE_READY')));
    xvfb.stdio[3].on('data', bytes => { text += bytes; if (text.length > 16) fail(Error('XVFB_DISPLAY_REFUSED')); else if (/^\d+\n$/.test(text)) done(text.trim()); });
  }), 10000, 'XVFB_READY_TIMEOUT');
  const display = ':' + number;
  await exec('/usr/bin/xauth', ['-f', auth, 'add', display, 'MIT-MAGIC-COOKIE-1', cookie], { timeout: 5000 });
  const env = { ...process.env, DISPLAY: display, XAUTHORITY: auth }, xenv = { ...env, LD_LIBRARY_PATH: resolve(tools, 'usr/lib/x86_64-linux-gnu') };
  xdo = (args, timeout = 10000) => exec(resolve(tools, 'usr/bin/xdotool'), args, { env: xenv, timeout, maxBuffer: 16384 });
  await assert.rejects(exec(resolve(tools, 'usr/bin/xdotool'), ['getmouselocation'], { env: { ...xenv, XAUTHORITY: '/dev/null' }, timeout: 5000, maxBuffer: 4096 }), 'private display refuses a missing cookie');
  pass('owned Xvfb display requires its private cookie and disables TCP listening');
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const target = resolve(out, pathname === '/' ? 'index.html' : '.' + pathname);
    if (!target.startsWith(out + sep) || !/\.(?:html|js|css|json)$/.test(target)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json');
    void readFile(target).then(bytes => response.end(bytes), () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  context = await chromium.launchPersistentContext(resolve(temporary, 'profile'), { executablePath: resolveChromiumPath(), headless: false, viewport: null,
    env, serviceWorkers: 'block', reducedMotion: 'reduce', args: ['--no-sandbox', '--window-position=0,0', '--window-size=1280,960'] });
  browserDeadline = setTimeout(() => { browserDeadlineExpired = true; void context.close().catch(() => {}); }, 180000);
  context.setDefaultTimeout(10000); context.setDefaultNavigationTimeout(10000);
  await context.addInitScript(instrumentProduct);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (unexpected.push('PRODUCT_NON_LOOPBACK_REQUEST'), route.abort()));
  await context.routeWebSocket('**/*', socket => { unexpected.push('PRODUCT_WEBSOCKET'); socket.close(); });
  page = await context.newPage(); page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z')); await page.goto(origin + '/#/offers');
  await page.getByRole('heading', { name: 'Offers', level: 1, exact: true }).waitFor(); await page.bringToFront();
  const windowDeadline = Date.now() + 10000;
  while (Date.now() < windowDeadline) {
    try {
      const windows = (await xdo(['search', '--onlyvisible', '--name', '^Offers ·'], Math.max(1, Math.min(1000, windowDeadline - Date.now())))).stdout.trim().split('\n');
      if (windows.length === 1 && /^\d+$/.test(windows[0])) { nativeWindow = windows[0]; break; }
    } catch {}
    await pause(100);
  }
  assert.ok(nativeWindow, 'only owned Chromium window becomes available before native input');
  const initial = await metrics(); assert.equal(initial.innerWidth, 1280); assert.equal(initial.devicePixelRatio, 1);
  await page.getByRole('button', { name: 'Core native sample (deadlines from now)', exact: true }).click();
  await page.getByRole('heading', { name: 'Trade review', level: 1, exact: true }).waitFor();
  const canonicalAcrossZoom = await page.locator('main code, main pre').allTextContents();
  await navigate('Offers', 'Offers');
  for (const factor of [1, 2, 4]) {
    const native = await nativeZoom(factor);
    await navigate('Home', 'Your local workspace');
    const home = await geometry('Home/' + factor);
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    const profile = page.locator('#unlock-profile'); await profile.fill('a'.repeat(32));
    await page.locator('#unlock-passphrase').fill('PUBLIC zoom input fixture only');
    const unlock = await geometry('Unlock form/' + factor); assert.equal(await profile.inputValue(), 'a'.repeat(32));
    await page.locator('form').filter({ has: profile }).getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).evaluate(node => document.activeElement === node), true);
    await navigate('Offers', 'Offers'); const offers = await geometry('Offers/' + factor);
    assert.equal(await page.locator('.session-list a[href^="#/trade/"]').count(), 1, 'reuse the same reviewed terms at every zoom');
    await page.locator('.session-list a[href^="#/trade/"]').click();
    await page.getByRole('heading', { name: 'Trade review', level: 1, exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement === document.querySelector('h1'));
    const canonical = await page.locator('main code, main pre').allTextContents();
    assert.deepEqual(canonical, canonicalAcrossZoom, 'native zoom preserves the same exact review bytes');
    assert.ok(canonical.some(text => /^0x[0-9a-f]{40}$/.test(text)), 'full machine addresses remain available');
    const reviewText = await page.locator('main').innerText();
    for (const value of ['250000000000000000 base units at 18 decimals', '123.45 EUR', 'Preview only. Trading is disabled in this build.']) assert.ok(reviewText.includes(value), 'exact canonical review/safety value ' + value);
    const review = await geometry('Review/' + factor);
    assert.deepEqual(await page.locator('main code, main pre').allTextContents(), canonical);
    for (const warning of await page.locator('main .warning').all()) assert.equal(await warning.isVisible(), true, 'review warnings stay present');
    await navigate('Recovery', 'Recovery'); const recovery = await geometry('Recovery/' + factor);
    await page.locator('#export-profile').fill('b'.repeat(32)); assert.equal(await page.locator('#export-profile').inputValue(), 'b'.repeat(32));
    await navigate('Settings', 'Settings'); await page.locator('#privacy-observations-title').waitFor();
    const settings = await geometry('Settings/' + factor);
    // A native Tab reaches the real skip link, followed by the App's normal Enter handler.
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex'); });
    await xdo(['windowfocus', '--sync', nativeWindow]); await xdo(['key', '--clearmodifiers', 'Tab']);
    await page.waitForFunction(() => document.activeElement?.classList.contains('skip-link'));
    assert.equal(await page.getByRole('link', { name: 'Skip to main content', exact: true }).evaluate(node => document.activeElement === node), true);
    await xdo(['key', '--clearmodifiers', 'Return']); await page.waitForFunction(() => document.activeElement === document.querySelector('main'));
    assert.equal(await page.locator('main').evaluate(node => document.activeElement === node), true);
    const last = await metrics(); assert.equal(last.devicePixelRatio, factor); assert.equal(last.innerWidth, 1280 / factor); assert.equal(last.visualViewport.scale, 1);
    observations.push({ factor, native, home, unlock, offers, review, recovery, settings, canonical, skipAndRouteFocus: true, formCancelFocusRestored: true });
    pass(`${factor * 100}% native desktop zoom: App/forms/Offers/review/Recovery/Settings geometry, controls, focus and exact values`);
  }
  const product = await page.evaluate(() => window.__zoomObserved);
  assert.equal(product.walletPrompts, 0); assert.equal(product.fetchCalls, 0);
  assert.ok(product.workers.length >= 1 && product.workers.every(worker => worker.type === 'module' && worker.url.startsWith(origin + '/assets/')));
  assert.deepEqual(unexpected, []); await checkSourceModules(); assert.equal(browserDeadlineExpired, false, 'native browser inspection stays within180s');
  pass('observed product page/Worker traffic stays local and no wallet or provider prompt occurs');
  result = { status: 'PASS_FINITE_LOCAL_NATIVE_ZOOM', chromium: context.browser().version(), node: process.version,
    method: 'Headful Chromium; ordinary focused-window XTEST Ctrl+0/Ctrl+plus; viewport:null', windowWidth: 1280,
    viewportDeviceScaleCssOrPinchEmulation: false, managedPolicyChanged: false, physicalDeviceQualified: false,
    egressScope: 'Observed product page and dedicated Worker traffic only; unrelated managed-browser background traffic is outside this observation.',
    provenanceSha256: sha(provenanceBytes), publicPackages: provenance.packages, toolFiles, sourceModules, buildAssets: buildEvidence.assets,
    releaseEnabled: false, checks, observations, product };
} finally {
  clearTimeout(browserDeadline);
  const cleanupErrors = [];
  try { if (context) await within(context.close(), 10000, 'BROWSER_CLOSE_UNCONFIRMED'); } catch { cleanupErrors.push('BROWSER_CLOSE_UNCONFIRMED'); }
  try { if (server) { server.closeAllConnections(); await within(new Promise(done => server.close(done)), 5000, 'SERVER_CLOSE_UNCONFIRMED'); } } catch { cleanupErrors.push('SERVER_CLOSE_UNCONFIRMED'); }
  try {
    if (xvfb?.pid) {
      try { process.kill(-xvfb.pid, 'SIGTERM'); } catch {}
      try { await within(xvfbClosed, 2000, 'XVFB_TERM_TIMEOUT'); }
      catch { try { process.kill(-xvfb.pid, 'SIGKILL'); } catch {} await within(xvfbClosed, 2000, 'XVFB_CLOSE_UNCONFIRMED'); }
    }
  } catch { cleanupErrors.push('XVFB_CLOSE_UNCONFIRMED'); }
  try { await rm(temporary, { recursive: true, force: true }); } catch { cleanupErrors.push('TEMPORARY_CLEANUP_UNCONFIRMED'); }
  assert.deepEqual(cleanupErrors, [], 'all owned browser/display/server/profile cleanup must finish before a pass');
}
console.log(JSON.stringify({ nativeBrowserZoomReport: { ...result, ownedBrowserDisplayServerAndProfileClosed: true } }));
