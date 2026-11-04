/** T20/T52: native emitted UI stress and explicit compiled draft-locale App integration.
 * DOM stress and draft fixture selection are separate evidence; neither is translation or device approval. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { sourceCatalog } from '../apps/web/src/ui/locale/en.ts';
import { build as buildFixture } from 'vite';
import react from '@vitejs/plugin-react';

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
  const fixtureRoot = resolve(temporary, 'fixture-source');
  await mkdir(fixtureRoot);
  await writeFile(resolve(fixtureRoot, 'index.html'), '<!doctype html><html lang="en"><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>');
  await writeFile(resolve(fixtureRoot, 'entry.tsx'), `import ${JSON.stringify(resolve('scripts/fixtures/privacy-status-fixture.tsx'))};`);
  await buildFixture({ configFile: false, root: fixtureRoot, base: '/privacy-fixture/', plugins: [react()],
    resolve: { alias: { 'react-dom': resolve('node_modules/react-dom'), react: resolve('node_modules/react') } },
    build: { outDir: resolve(out, 'privacy-fixture'), emptyOutDir: true } });
  const localeRoot = resolve(temporary, 'locale-fixture-source'), compiledLocales = resolve(localeRoot, 'compiled-locales.ts');
  await mkdir(localeRoot);
  await writeFile(resolve(localeRoot, 'index.html'), '<!doctype html><html lang="en"><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>');
  await writeFile(resolve(localeRoot, 'entry.tsx'), `import ${JSON.stringify(resolve('scripts/fixtures/locale-runtime-fixture.tsx'))};`);
  await writeFile(compiledLocales, `import {sourceCatalog} from ${JSON.stringify(resolve('apps/web/src/ui/locale/en.ts'))};
import {pseudoMessage} from ${JSON.stringify(resolve('apps/web/test/locale-pseudo.mjs'))};
const texts=profile=>Object.fromEntries(Object.entries(sourceCatalog).map(([key,entry])=>[key,pseudoMessage(entry,profile).source]));
const incomplete=texts('rtl');delete incomplete['trade.risk'];
export const bundledLocaleConfiguration={developmentFixtures:true,fixtures:[
 {id:'fixture-rtl',locale:'ar',messages:texts('rtl')},
 {id:'fixture-expanded',locale:'en',messages:texts('expanded')},
 {id:'fixture-incomplete',locale:'ar',messages:incomplete}],
 preferences:{read:()=>localStorage.getItem('p2p-offramp.locale.v1'),write:id=>localStorage.setItem('p2p-offramp.locale.v1',id)}};`);
  await buildFixture({ configFile: false, root: localeRoot, base: '/locale-fixture/', plugins: [react(), {
    name: 'explicit-development-locale-registry', enforce: 'pre',
    resolveId(id, importer) { if (id === './bundled.ts' && importer?.replaceAll('\\', '/') === resolve('apps/web/src/ui/locale/runtime.ts').replaceAll('\\', '/')) return compiledLocales; },
  }], resolve: { alias: { 'react-dom': resolve('node_modules/react-dom'), react: resolve('node_modules/react') } },
    worker: { format: 'es' }, build: { target: 'esnext', outDir: resolve(out, 'locale-fixture'), emptyOutDir: true, modulePreload: false } });
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
  // The page-wide recorder also sees independent features that own their own resume listeners:
  // use-screen-counts.ts (T89: visibilitychange + pageshow) and main.tsx (BFcache draft lifecycle: pageshow).
  // Only the Settings panel's share is asserted to be exactly one per event; the others are pinned so a leak shows.
  const otherFeatureResumeListeners = [1, 2];
  const settingsResumeListeners = async () => {
    const sizes = await privacyPage.evaluate(() => Object.values(window.__privacyResumeListeners).map(set => set.size));
    return sizes.map((size, index) => size - otherFeatureResumeListeners[index]);
  };
  assert.deepEqual(await settingsResumeListeners(), [1, 1], 'Settings panel owns one resume listener per event');
  await privacyPage.clock.runFor(30_001);
  await privacyPage.waitForFunction(before => {
    const row = [...document.querySelectorAll('#privacy-observations-title ~ ul li')].find(node => node.querySelector('h3')?.textContent === 'Local vault');
    return Number(row?.textContent.match(/Inspected at (\d+) milliseconds/)?.[1]) >= before + 30_000;
  }, firstInspection);
  const renewedInspection = await inspectionTime();
  assert.ok(renewedInspection >= firstInspection + 30_000, 'expiry renews actual monotonic inspection without vault events');
  assert.ok((await vaultObservation.innerText()).includes('Locked'), 'expiry does not manufacture an unlocked state');
  assert.equal(await privacyPage.evaluate(() => window.__privacyDeadlineTimers.size), 1, 'renewed view owns only one deadline');
  assert.deepEqual(await settingsResumeListeners(), [1, 1], 'renewal re-subscribes without duplicating Settings listeners');
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
  assert.deepEqual(await settingsResumeListeners(), [0, 0], 'unmount removes both Settings resume listeners');
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
  const brokerPage = await context.newPage();
  await brokerPage.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await brokerPage.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  brokerPage.on('pageerror', () => unexpected.push('FIXTURE_PAGE_ERROR'));
  await brokerPage.goto(origin + '/privacy-fixture/index.html');
  const routeRow = brokerPage.locator('li').filter({ has: brokerPage.getByRole('heading', { name: 'RPC channel', exact: true }) });
  const invoke = (method, argument) => brokerPage.evaluate(({ method, argument }) => window.privacyFixture[method](argument), { method, argument });
  const snapshot = () => invoke('snapshot');
  await routeRow.getByText('Direct connection', { exact: true }).waitFor();
  assert.equal((await snapshot()).metrics[0].subscribed, 1, 'real broker subscription precedes positive UI');
  await invoke('strict');
  await routeRow.getByText('Blocked by policy', { exact: true }).waitFor();
  await invoke('revoke');
  await routeRow.getByText('Unknown', { exact: true }).waitFor();
  await invoke('renew');
  await routeRow.getByText('Blocked by policy', { exact: true }).waitFor();
  await brokerPage.clock.runFor(1001);
  await routeRow.getByText('Unknown', { exact: true }).waitFor();
  await invoke('renew');
  await routeRow.getByText('Blocked by policy', { exact: true }).waitFor();
  await invoke('dispose');
  await routeRow.getByText('Unsupported', { exact: true }).waitFor();
  await invoke('select', 1);
  await invoke('renew');
  await routeRow.getByText('Direct connection', { exact: true }).waitFor();
  const replaced = await snapshot();
  assert.equal(replaced.metrics[0].unsubscribed, 1, 'replacement unregisters the old broker');
  await invoke('late', 0);
  await brokerPage.clock.runFor(32);
  assert.equal((await snapshot()).metrics[1].inspected, replaced.metrics[1].inspected, 'retained old callbacks cannot rerender the new broker');
  await invoke('select', 2);
  await routeRow.getByText('Unknown', { exact: true }).waitFor();
  await brokerPage.getByRole('status').getByText('Privacy observations are unavailable. No privacy coverage or transaction authority is established.', { exact: true }).waitFor();
  const exhausted = await snapshot();
  assert.equal(exhausted.metrics[2].inspected, 0, 'real 64-observer exhaustion prevents inspection');
  const syntheticVault = brokerPage.locator('li').filter({ has: brokerPage.getByRole('heading', { name: 'Local vault', exact: true }) });
  await syntheticVault.getByText('Locked', { exact: true }).waitFor();
  await syntheticVault.getByText('Local vault service inspection', { exact: true }).waitFor();
  assert.equal(exhausted.metrics[1].unsubscribed, 1);
  await invoke('select', 1); await invoke('renew');
  await routeRow.getByText('Direct connection', { exact: true }).waitFor();
  await invoke('detach');
  await routeRow.getByText('Unknown', { exact: true }).waitFor();
  const detached = await snapshot();
  await invoke('reattachSameExhausted');
  await brokerPage.getByRole('status').getByText('Privacy observations are unavailable. No privacy coverage or transaction authority is established.', { exact: true }).waitFor();
  assert.equal((await snapshot()).metrics[1].inspected, detached.metrics[1].inspected, 'same broker identity cannot inspect using a detached registration before failed reattachment');
  await routeRow.getByText('Unknown', { exact: true }).waitFor();
  await syntheticVault.getByText('Locked', { exact: true }).waitFor();
  // A separate fresh broker verifies active successful-registration unmount cleanup.
  await invoke('select', 3); await invoke('renew');
  await routeRow.getByText('Direct connection', { exact: true }).waitFor();
  const beforeUnmount = await snapshot();
  await invoke('unmount');
  await invoke('late', 3);
  await brokerPage.clock.runFor(2000);
  const unmounted = await snapshot();
  assert.deepEqual(unmounted.metrics.map(item => item.inspected), beforeUnmount.metrics.map(item => item.inspected), 'unmounted panel cannot reinspect');
  assert.equal(unmounted.metrics[3].unsubscribed, 1, 'unmount unregisters the currently active successful subscription');
  assert.equal(unmounted.captures, 0); assert.equal(unmounted.authorizations, 0);
  await invoke('cleanup'); await brokerPage.close();
  pass('separate test-only emitted panel uses real direct-only broker invalidation, inspect-only expiry, disposal, replacement and bounded-subscription failure');
  // T68: a separate fixture mode supplies configuration only. An actual empty
  // broker owns observer limits/invalidation; no configuration grants coverage.
  const endpointPage = await context.newPage();
  await endpointPage.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await endpointPage.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  endpointPage.on('pageerror', () => unexpected.push('ENDPOINT_FIXTURE_PAGE_ERROR'));
  await endpointPage.goto(origin + '/privacy-fixture/index.html');
  const endpointInvoke = (method, argument) => endpointPage.evaluate(({ method, argument }) => window.privacyEndpointFixture[method](argument), { method, argument });
  const endpointSnapshot = () => endpointInvoke('snapshot');
  await endpointInvoke('mount');
  const endpointDetails = endpointPage.getByRole('region', { name: 'Configured endpoint origins', exact: true });
  const endpointRpc = endpointPage.locator('li').filter({ has: endpointPage.getByRole('heading', { name: 'RPC channel', exact: true }) });
  await endpointDetails.getByText('https://node-a.fixture.invalid', { exact: true }).waitFor();
  for (const normalized of ['https://app.fixture.invalid', 'wss://relay-a.fixture.invalid', 'ws://127.0.0.1:4321']) assert.ok((await endpointDetails.innerText()).includes(normalized));
  assert.doesNotMatch(await endpointDetails.innerText(), /PRIVATE_ENDPOINT_SENTINEL|\/rpc|\/socket|\?key|:443/);
  assert.equal(await endpointDetails.locator('a, button, input, form').count(), 0, 'endpoint details do not open or authorize a connection');
  await endpointRpc.getByText('Unknown', { exact: true }).waitFor();
  assert.ok((await endpointDetails.innerText()).includes('Configuration identifies a destination. It does not verify private routing.'));
  assert.ok((await endpointDetails.innerText()).includes('External wallet routing is unknown and may use connections outside this app.'));
  assert.equal((await endpointSnapshot()).metrics[0].subscribed, 1, 'metadata is not read before successful subscription');
  const beforeEndpointExpiry = await endpointSnapshot();
  await endpointPage.clock.runFor(1001);
  await endpointDetails.getByText('No current trusted endpoint configuration is available.', { exact: true }).waitFor();
  assert.doesNotMatch(await endpointDetails.innerText(), /node-a\.fixture\.invalid|app\.fixture\.invalid|relay-a\.fixture\.invalid/);
  assert.ok((await endpointSnapshot()).metrics[0].inspected > beforeEndpointExpiry.metrics[0].inspected, 'own deadline removes expired metadata without an unrelated state change');
  await endpointInvoke('renew');
  await endpointDetails.getByText('https://node-a.fixture.invalid', { exact: true }).waitFor();
  const endpointGeneration = await endpointDetails.locator('dt').filter({ hasText: 'Configuration generation' }).evaluate(node => node.nextElementSibling.textContent);
  assert.equal(endpointGeneration, '1');
  await endpointInvoke('revoke');
  await endpointDetails.getByText('No current trusted endpoint configuration is available.', { exact: true }).waitFor();
  assert.doesNotMatch(await endpointDetails.innerText(), /node-a\.fixture\.invalid/);
  await endpointInvoke('renew');
  await endpointDetails.getByText('https://node-a.fixture.invalid', { exact: true }).waitFor();
  await endpointInvoke('dispose');
  await endpointDetails.getByText('No current trusted endpoint configuration is available.', { exact: true }).waitFor();
  await endpointInvoke('select', 1); await endpointInvoke('renew');
  await endpointDetails.getByText('https://node-b.fixture.invalid', { exact: true }).waitFor();
  const endpointReplaced = await endpointSnapshot();
  assert.equal(endpointReplaced.metrics[0].unsubscribed, 1, 'replacement removes the previous metadata subscription');
  await endpointInvoke('late', 0); await endpointPage.clock.runFor(32);
  assert.equal((await endpointSnapshot()).metrics[1].inspected, endpointReplaced.metrics[1].inspected, 'old metadata callbacks cannot reread the replacement');
  await endpointInvoke('select', 2);
  await endpointDetails.getByText('No current trusted endpoint configuration is available.', { exact: true }).waitFor();
  const endpointExhausted = await endpointSnapshot();
  assert.equal(endpointExhausted.metrics[2].inspected, 0); assert.equal(endpointExhausted.metrics[2].generationReads, 0, 'real observer exhaustion prevents any metadata inspection');
  await endpointInvoke('select', 1); await endpointInvoke('renew');
  await endpointDetails.getByText('https://node-b.fixture.invalid', { exact: true }).waitFor();
  await endpointInvoke('detach');
  await endpointDetails.getByText('No current trusted endpoint configuration is available.', { exact: true }).waitFor();
  const endpointDetached = await endpointSnapshot();
  await endpointInvoke('reattachSameExhausted');
  await endpointPage.clock.runFor(32);
  await endpointDetails.getByText('No current trusted endpoint configuration is available.', { exact: true }).waitFor();
  assert.equal((await endpointSnapshot()).metrics[1].inspected, endpointDetached.metrics[1].inspected, 'same metadata object cannot reuse a detached lease before failed reattachment');
  assert.equal((await endpointSnapshot()).metrics[1].generationReads, endpointDetached.metrics[1].generationReads);
  await endpointInvoke('select', 3); await endpointInvoke('renew');
  await endpointDetails.getByText('https://node-d.fixture.invalid', { exact: true }).waitFor();
  const endpointBeforeUnmount = await endpointSnapshot();
  await endpointInvoke('unmount'); await endpointInvoke('late', 3); await endpointPage.clock.runFor(2000);
  const endpointUnmounted = await endpointSnapshot();
  assert.deepEqual(endpointUnmounted.metrics.map(item => item.inspected), endpointBeforeUnmount.metrics.map(item => item.inspected), 'unmounted metadata cannot be read by late callbacks or timers');
  assert.equal(endpointUnmounted.metrics[3].unsubscribed, 1);
  assert.equal(endpointUnmounted.captures, 0); assert.equal(endpointUnmounted.authorizations, 0);
  await endpointInvoke('cleanup'); await endpointPage.close();
  pass('normalized endpoint origins stay separate from coverage; real subscription limits, TTL, generation, revocation, replacement and same-object cleanup prevent stale details');
  const localePage = await context.newPage(); localePage.on('pageerror', () => unexpected.push('LOCALE_FIXTURE_PAGE_ERROR'));
  await localePage.goto(origin + '/locale-fixture/index.html#/home');
  await localePage.getByRole('heading', { name: 'Your local workspace', exact: true }).waitFor();
  await localePage.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
  await localePage.locator('#unlock-profile').fill('a'.repeat(32)); await localePage.locator('#unlock-passphrase').fill('PRIVATE_LOCALE_FORM_SENTINEL');
  await localePage.locator('#unlock-profile').evaluate(node => { window.__localeInput = node; node.focus(); });
  await localePage.locator('#unlock-profile-help-trigger').hover(); await localePage.locator('[role="tooltip"]').waitFor();
  await localePage.locator('#unlock-profile-help-trigger').click();
  const localeFocus = await localePage.evaluate(() => document.activeElement.id);
  const sourceHelp = await localePage.locator('[role="tooltip"]').innerText(), sourceTitle = await localePage.title();
  const selectLocale = id => localePage.evaluate(id => window.localeRuntimeFixture.select(id), id);
  const localeSnapshot = () => localePage.evaluate(() => window.localeRuntimeFixture.snapshot());
  await selectLocale('fixture-rtl');
  await localePage.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
  assert.equal(await localePage.locator('.app-shell').getAttribute('dir'), 'rtl');
  assert.notEqual(await localePage.title(), sourceTitle); assert.match(await localePage.locator('h1').innerText(), /اختبار/);
  assert.match(await localePage.locator('nav a').first().innerText(), /اختبار/); assert.match(await localePage.locator('[role="tooltip"]').innerText(), /اختبار/);
  assert.notEqual(await localePage.locator('[role="tooltip"]').innerText(), sourceHelp);
  assert.equal(await localePage.locator('#unlock-profile').evaluate(node => node === window.__localeInput), true, 'locale selection never remounts private forms');
  assert.equal(await localePage.locator('#unlock-profile').inputValue(), 'a'.repeat(32));
  assert.equal(await localePage.locator('#unlock-passphrase').inputValue(), 'PRIVATE_LOCALE_FORM_SENTINEL');
  assert.equal(await localePage.evaluate(() => document.activeElement.id), localeFocus, 'language selection preserves focus on the pinned help trigger');
  assert.equal(await localePage.locator('#locale-number').innerText(), new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(123456));
  assert.ok(!(await localePage.locator('#locale-date').innerText()).includes('2023-11-14T22:13:20.000Z'));
  assert.equal((await localeSnapshot()).fundsLocaleEligible, false); assert.equal((await localeSnapshot()).display, 'development-fixture');
  await selectLocale('fixture-expanded'); await localePage.waitForFunction(() => document.documentElement.dir === 'ltr');
  assert.notEqual(await localePage.title(), sourceTitle); assert.equal(await localePage.locator('#unlock-passphrase').inputValue(), 'PRIVATE_LOCALE_FORM_SENTINEL');
  for (const unavailable of ['fr', 'fixture-incomplete']) {
    await selectLocale(unavailable); await localePage.getByRole('heading', { name: 'Your local workspace', exact: true }).waitFor();
    await localePage.locator('#unlock-profile-help-trigger').focus(); await localePage.locator('[role="tooltip"]').waitFor();
    assert.equal((await localeSnapshot()).fallback, true); assert.equal((await localeSnapshot()).fundsLocaleEligible, false);
    assert.equal(await localePage.locator('nav a').first().innerText(), 'Home'); assert.equal(await localePage.locator('[role="tooltip"]').innerText(), sourceHelp);
    assert.ok((await localePage.locator('main').innerText()).includes('The requested language is unavailable or incomplete.'));
    await localePage.getByRole('button', { name: 'Use English source', exact: true }).click();
    assert.equal((await localeSnapshot()).fallback, false);
    assert.equal(await localePage.evaluate(() => localStorage.getItem('p2p-offramp.locale.v1')), 'en');
  }
  await selectLocale('fixture-rtl'); await localePage.reload();
  await localePage.waitForFunction(() => window.localeRuntimeFixture?.snapshot().id === 'fixture-rtl');
  assert.equal(await localePage.locator('.app-shell').getAttribute('lang'), 'ar');
  assert.equal(await localePage.evaluate(() => localStorage.getItem('p2p-offramp.locale.v1')), 'fixture-rtl', 'explicit local preference survives document reload');
  await selectLocale('en'); await localePage.goto(origin + '/locale-fixture/index.html#/offers');
  await localePage.getByRole('button', { name: 'Core native sample (deadlines from now)', exact: true }).click();
  await localePage.getByRole('heading', { name: 'Trade review', exact: true }).waitFor();
  const exactReview = await localePage.locator('main code, main pre').allTextContents();
  const exactBytes = await localePage.evaluate(() => window.localeRuntimeFixture.reviewBytes()); assert.equal(exactBytes.length, 1);
  await selectLocale('fixture-rtl'); await localePage.waitForFunction(() => document.documentElement.dir === 'rtl');
  assert.deepEqual(await localePage.locator('main code, main pre').allTextContents(), exactReview);
  assert.deepEqual(await localePage.evaluate(() => window.localeRuntimeFixture.reviewBytes()), exactBytes, 'locale display never changes reviewed canonical terms bytes');
  for (const width of [320, 768, 1440]) { await localePage.setViewportSize({ width, height: 900 }); await assertGeometry(localePage, `compiled-runtime-RTL/${width}`); }
  const copyAddress = localePage.locator('main code.exact').first(), rawAddress = await copyAddress.innerText();
  await copyAddress.evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await localePage.keyboard.press('Control+c'); assert.equal(await localePage.evaluate(() => navigator.clipboard.readText()), rawAddress);
  assert.equal(await localePage.locator('main code bdi').evaluateAll(nodes => nodes.length > 5 && nodes.every(node => getComputedStyle(node).direction === 'ltr')), true);
  await selectLocale('en'); await localePage.evaluate(() => window.localeRuntimeFixture.dispose()); await localePage.close();
  pass('compiled draft RTL/expanded catalogs switch the real App, navigation, titles, help, typed date/numerals and preference reload atomically without remounting inputs or changing canonical review/copy bytes');
  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ fixture: 'draft-locale-emitted-layout', browser: browser.version(), checks: checks.length,
    stress: 'DOM static-catalog substitution plus separate explicit development-only compiled runtime registry; no reviewed translation',
    zoom: { requestedPercent: 400, realBrowserZoomQualified: realZoomQualified, before, after,
      fallback: realZoomQualified ? null : '1280/4=320 CSS-pixel reflow simulation; real 400% browser zoom remains unqualified' },
    touch: 'Chromium touchscreen emulation, not physical-device qualification',
    translatedLocaleApproved: false, accessibilityAcceptance: false, releaseEnabled: false, unexpectedRequests: unexpected.length }));
} finally {
  await browser?.close(); if (server) await new Promise(done => server.close(done)); await rm(temporary, { recursive: true, force: true });
}
