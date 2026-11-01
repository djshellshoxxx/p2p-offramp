/** T20: native emitted UI stress. DOM pseudotext is a test-only layout simulation,
 * not a selectable translation, reviewed locale or assistive-technology audit. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { sourceCatalog } from '../apps/web/src/ui/locale/en.ts';

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-locale-layout-'));
const out = resolve(temporary, 'demo'), checks = [], unexpected = [];
let server, browser;
const pass = name => { checks.push(name); console.log(`ok - ${name}`); };
const source = [...new Set(Object.values(sourceCatalog).filter(entry => Object.keys(entry.variables).length === 0).map(entry => entry.source))];
async function stress(page, profile) {
  return page.evaluate(({ source, profile }) => {
    const known = new Set(source), walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), replacements = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest('code, pre, input, textarea, script, style, [data-canonical]')) continue;
      const raw = node.textContent, trimmed = raw.trim();
      if (!known.has(trimmed)) continue;
      const transformed = profile === 'cjk' ? `【仮試験文・未承認】${trimmed}漢字かな文字折返試験`.repeat(2) :
        profile === 'rtl' ? `اختبار مسودة ${trimmed} نص طويل للتخطيط فقط` : `[${trimmed} — ${trimmed} — ${trimmed}]`;
      replacements.push([node, raw, raw.replace(trimmed, transformed)]);
    }
    const protectedText = [...document.querySelectorAll('code, pre, input, textarea')].map(node => ({ node, text: node.textContent, value: 'value' in node ? node.value : null }));
    for (const [node, , text] of replacements) node.textContent = text;
    // The source locale sets an explicit shell direction, overriding the document.
    // Override both only inside this simulation and restore their exact attributes.
    const directionRoots = [document.documentElement, document.querySelector('.app-shell')].filter(Boolean);
    const originalDirections = directionRoots.map(node => [node, node.getAttribute('dir')]);
    for (const node of directionRoots) node.dir = profile === 'rtl' ? 'rtl' : 'ltr';
    window.__restoreLocaleStress = () => {
      for (const [node, original] of replacements) node.textContent = original;
      for (const [node, original] of originalDirections) {
        if (original === null) node.removeAttribute('dir'); else node.setAttribute('dir', original);
      }
    };
    window.__protectedLocaleText = protectedText;
    return replacements.length;
  }, { source, profile });
}
async function assertGeometry(page, label) {
  const result = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll('main button, main input, main select, main textarea, main a')]
      .filter(node => node.getClientRects().length).filter(node => { const rect = node.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; })
      .map(node => ({ tag: node.tagName, id: node.id })),
    protectedChanged: window.__protectedLocaleText?.some(({ node, text, value }) => node.textContent !== text || value !== null && node.value !== value) ?? false,
  }));
  assert.ok(result.document <= result.viewport + 1, `${label}: document overflow ${JSON.stringify(result)}`);
  assert.deepEqual(result.clipped, [], `${label}: controls remain reachable`);
  assert.equal(result.protectedChanged, false, `${label}: canonical DOM text/value remains exact`);
}
try {
  const evidence = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(evidence.ReleaseEnabled, 0);
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const path = resolve(out, pathname === '/' ? 'index.html' : '.' + pathname);
    if (!path.startsWith(out + sep) || !/\.(?:html|js|css|json)$/.test(path)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : 'application/json');
    void readFile(path).then(bytes => response.end(bytes), () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', hasTouch: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (unexpected.push('NETWORK'), route.abort()));
  const page = await context.newPage(); page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
  await page.goto(origin + '/#/offers');
  await page.getByRole('button', { name: 'Core native sample (deadlines from now)', exact: true }).click();
  await page.getByRole('heading', { name: 'Trade review', exact: true }).waitFor();
  assert.equal(await page.locator('h1').evaluate(node => document.activeElement === node), true, 'route restores heading focus');
  const canonical = await page.locator('main code, main pre').allTextContents();
  assert.ok(canonical.some(text => /^0x[0-9a-f]{40}$/i.test(text)), 'full native addresses are visible');
  assert.ok((await page.locator('main').innerText()).includes('250000000000000000 base units'), 'exact canonical base units are visible');
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  for (const profile of ['expanded', 'rtl', 'cjk']) {
    const count = await stress(page, profile); assert.ok(count > 20, 'real catalog-backed static UI text is stressed');
    assert.deepEqual(await page.locator('.app-shell, main').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction)), [profile === 'rtl' ? 'rtl' : 'ltr', profile === 'rtl' ? 'rtl' : 'ltr'], 'actual shell and review direction match the stress profile');
    for (const width of [320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await assertGeometry(page, `${profile}/${width}`); }
    assert.deepEqual(await page.locator('main code, main pre').allTextContents(), canonical);
    assert.ok((await page.locator('main').innerText()).includes('250000000000000000 base units'), 'canonical base units are not localized');
    assert.equal(await page.locator('main code bdi').evaluateAll(nodes => nodes.length > 5 && nodes.every(node => getComputedStyle(node).direction === 'ltr' && getComputedStyle(node).unicodeBidi === 'isolate')), true, 'machine addresses/hashes stay bidi-isolated');
    const fullAddress = page.locator('main code.exact').filter({ hasText: /^0x[0-9a-f]{40}$/i }).first();
    const expectedCopy = await fullAddress.textContent();
    await fullAddress.evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
    await page.keyboard.press('Control+c');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expectedCopy, 'native selection/copy bytes remain canonical under stress');
    await page.evaluate(() => getSelection().removeAllRanges());
    const warnings = page.locator('main .warning');
    assert.ok(await warnings.count() >= 2, 'critical safety warnings remain present');
    for (const warning of await warnings.all()) assert.equal(await warning.isVisible(), true, 'critical warnings remain visible without a tooltip');
    await page.evaluate(() => window.__restoreLocaleStress());
  }
  pass('expanded/RTL/CJK DOM stress preserves canonical bytes and reflows actual review at 320/768/1440');
  await page.setViewportSize({ width: 1280, height: 900 });
  const before = await page.evaluate(() => ({ width: innerWidth, ratio: devicePixelRatio }));
  for (let index = 0; index < 8; index++) await page.keyboard.press('Control+Equal');
  const after = await page.evaluate(() => ({ width: innerWidth, ratio: devicePixelRatio }));
  const realZoomQualified = Math.abs(before.width / after.width - 4) < .05 && Math.abs(after.ratio / before.ratio - 4) < .05;
  await page.keyboard.press('Control+Digit0');
  await page.setViewportSize({ width: 320, height: 900 }); await assertGeometry(page, '1280/4 reflow simulation');
  pass('320 CSS-pixel reflow simulation passes; actual 400% browser zoom is qualified separately');
  await page.goto(origin + '/#/');
  await page.getByRole('heading', { name: 'Your local workspace', exact: true }).waitFor();
  await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex'); });
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('link', { name: 'Skip to main content' }).evaluate(node => document.activeElement === node), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('main').evaluate(node => document.activeElement === node), true);
  assert.equal(await page.locator('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').count(), 0);
  assert.ok(await page.locator('[role="status"], [aria-live]').count() > 0, 'loading/local status has textual announcement surface');
  pass('real keyboard skip order, route focus, reduced motion and textual status remain available');
  await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
  const control = page.locator('#unlock-profile'), help = page.locator('#unlock-profile-help-trigger'), tooltip = page.locator('#unlock-profile-tooltip');
  await control.fill('a'.repeat(32)); await page.locator('#unlock-passphrase').fill('PRIVATE_HELP_SENTINEL');
  await control.focus(); await help.hover(); await tooltip.waitFor();
  const helpText = await tooltip.innerText();
  assert.equal(await control.evaluate(node => document.activeElement === node), true, 'hover help does not steal input focus');
  await page.keyboard.press('Escape');
  await tooltip.waitFor({ state: 'detached' });
  assert.equal(await control.evaluate(node => document.activeElement === node), true, 'hover-only Escape preserves prior input focus');
  await page.mouse.move(0, 0); await help.focus(); await tooltip.waitFor();
  assert.equal(await tooltip.innerText(), helpText, 'focus and hover expose equivalent help');
  assert.equal(await help.getAttribute('aria-describedby'), 'unlock-profile-tooltip');
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'detached' });
  assert.equal(await help.evaluate(node => document.activeElement === node), true, 'keyboard dismiss retains the help trigger');
  await control.focus(); await help.tap(); await tooltip.waitFor();
  assert.equal(await tooltip.innerText(), helpText, 'emulated tap exposes equivalent help');
  await help.tap(); await tooltip.waitFor({ state: 'detached' });
  assert.ok(!helpText.includes('PRIVATE_HELP_SENTINEL') && !helpText.includes('a'.repeat(32)), 'private field contents never enter help');
  assert.equal(await page.locator('#unlock-profile-help').isVisible(), true, 'primary visible helper remains without tooltip');
  const form = page.locator('form').filter({ has: control });
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).evaluate(node => document.activeElement === node), true, 'closing the form restores its opening control');
  pass('hover/focus/emulated-tap help, Escape, privacy and form focus restoration use the real UI');
  // T27: actual emitted Settings refreshes without a vault transition. A separate controlled
  // clock page preserves all T20 stress/keyboard assertions above.
  const privacyPage = await context.newPage();
  privacyPage.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  await privacyPage.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await privacyPage.addInitScript(() => {
    const timers = new Set(), timeout = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    window.__privacyDeadlineTimers = timers;
    window.__privacyResumeListeners = { visibilitychange: new Set(), pageshow: new Set() };
    for (const [target, event] of [[document, 'visibilitychange'], [window, 'pageshow']]) {
      const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
      target.addEventListener = (name, callback, options) => { if (name === event) window.__privacyResumeListeners[event].add(callback); add(name, callback, options); };
      target.removeEventListener = (name, callback, options) => { if (name === event) window.__privacyResumeListeners[event].delete(callback); remove(name, callback, options); };
    }
    window.setTimeout = (callback, delay, ...args) => {
      let id;
      const tracked = typeof callback === 'function' && delay >= 29_000 && delay <= 30_000;
      id = timeout(tracked ? (...values) => { timers.delete(id); callback(...values); } : callback, delay, ...args);
      if (tracked) timers.add(id);
      return id;
    };
    window.clearTimeout = id => { timers.delete(id); clear(id); };
  });
  await privacyPage.goto(origin + '/#/settings');
  const vaultObservation = privacyPage.locator('#privacy-observations-title').locator('..').locator('li').filter({ has: privacyPage.getByRole('heading', { name: 'Local vault', exact: true }) });
  await vaultObservation.getByText('Local vault service inspection', { exact: true }).waitFor();
  const inspectionTime = async () => Number((await vaultObservation.innerText()).match(/Inspected at (\d+) milliseconds/)[1]);
  const firstInspection = await inspectionTime();
  assert.equal(await privacyPage.evaluate(() => window.__privacyDeadlineTimers.size), 1, 'one bounded local expiry timer is active');
  assert.deepEqual(await privacyPage.evaluate(() => Object.values(window.__privacyResumeListeners).map(set => set.size)), [1, 1], 'one resume listener per event');
  await privacyPage.clock.runFor(30_001);
  await privacyPage.waitForFunction(before => {
    const row = [...document.querySelectorAll('#privacy-observations-title ~ ul li')].find(node => node.querySelector('h3')?.textContent === 'Local vault');
    return Number(row?.textContent.match(/Inspected at (\d+) milliseconds/)?.[1]) >= before + 30_000;
  }, firstInspection);
  const renewedInspection = await inspectionTime();
  assert.ok(renewedInspection >= firstInspection + 30_000, 'expiry renews actual monotonic inspection without vault events');
  assert.ok((await vaultObservation.innerText()).includes('Locked'), 'expiry does not manufacture an unlocked state');
  assert.equal(await privacyPage.evaluate(() => window.__privacyDeadlineTimers.size), 1, 'renewed view owns only one deadline');
  await privacyPage.clock.runFor(1000);
  await privacyPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await privacyPage.waitForFunction(before => {
    const row = [...document.querySelectorAll('#privacy-observations-title ~ ul li')].find(node => node.querySelector('h3')?.textContent === 'Local vault');
    return Number(row?.textContent.match(/Inspected at (\d+) milliseconds/)?.[1]) > before;
  }, renewedInspection);
  const visibleInspection = await inspectionTime();
  await privacyPage.clock.runFor(1000);
  await privacyPage.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await privacyPage.waitForFunction(before => {
    const row = [...document.querySelectorAll('#privacy-observations-title ~ ul li')].find(node => node.querySelector('h3')?.textContent === 'Local vault');
    return Number(row?.textContent.match(/Inspected at (\d+) milliseconds/)?.[1]) > before;
  }, visibleInspection);
  await privacyPage.getByRole('link', { name: 'Home', exact: true }).click();
  await privacyPage.getByRole('heading', { name: 'Your local workspace', exact: true }).waitFor();
  assert.equal(await privacyPage.evaluate(() => window.__privacyDeadlineTimers.size), 0, 'leaving Settings clears its local deadline');
  assert.deepEqual(await privacyPage.evaluate(() => Object.values(window.__privacyResumeListeners).map(set => set.size)), [0, 0], 'unmount removes both resume listeners');
  await privacyPage.clock.runFor(60_001);
  assert.equal(await privacyPage.evaluate(() => window.__privacyDeadlineTimers.size), 0, 'unmounted Settings does not reschedule');
  await privacyPage.getByRole('button', { name: 'Create new profile', exact: true }).click();
  await privacyPage.locator('#create-passphrase').fill('LOCAL_T27_TEST_ONLY_PASSPHRASE');
  await privacyPage.locator('#create-confirm').fill('LOCAL_T27_TEST_ONLY_PASSPHRASE');
  await privacyPage.locator('#create-consent').check();
  await privacyPage.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
  await privacyPage.getByRole('button', { name: 'Lock vault', exact: true }).waitFor();
  await privacyPage.getByRole('link', { name: 'Settings', exact: true }).click();
  await vaultObservation.getByText('Unlocked', { exact: true }).waitFor();
  await privacyPage.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await vaultObservation.getByText('Locked', { exact: true }).waitFor();
  assert.ok((await vaultObservation.innerText()).includes('Local vault service inspection'), 'actual lock notification refreshes observed state immediately');
  await privacyPage.close();
  pass('Settings expiry/resume reinspects the real local vault and unmount clears its sole deadline without network access');
  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ fixture: 'draft-locale-emitted-layout', browser: browser.version(), checks: checks.length,
    stress: 'test-only DOM static-catalog substitution; not a translated locale implementation',
    zoom: { requestedPercent: 400, realBrowserZoomQualified: realZoomQualified, before, after,
      fallback: realZoomQualified ? null : '1280/4=320 CSS-pixel reflow simulation; real 400% browser zoom remains unqualified' },
    touch: 'Chromium touchscreen emulation, not physical-device qualification',
    translatedLocaleApproved: false, accessibilityAcceptance: false, releaseEnabled: false, unexpectedRequests: unexpected.length }));
} finally {
  await browser?.close(); if (server) await new Promise(done => server.close(done)); await rm(temporary, { recursive: true, force: true });
}
