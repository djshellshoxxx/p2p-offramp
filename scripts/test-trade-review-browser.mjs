/**
 * Synthetic local trade-terms review journey on the emitted `demo` build in local Chromium. Exercises the real app:
 * routing, the trade review controller, the domain terms review against the synthetic registry, and the review
 * screen. SYNTHETIC test-only data; no wallet, relay, RPC or funds are involved, and no release is attested.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { encodePrivateAgreement } from '../packages/domain/src/trade-terms.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-trade-review-'));
const scenario = JSON.parse(await readFile(resolve(root, 'packages/domain/test/fixtures/local-evm-scenario/scenario.json'), 'utf8'));
const FORMAT = 'p2p-offramp/local-terms-review/v1';
const SELLER = scenario.sets.native.terms.seller, BUYER = scenario.sets.native.terms.buyer;
const FIXED_NOW = new Date('2026-01-01T00:00:00Z');
const unexpected = [];
let browser, server;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const documentFor = (set, overrides = {}) => ({ format: FORMAT, terms: { ...scenario.sets[set].terms, ...overrides.terms }, privateAgreement: { ...scenario.sets[set].privateAgreementInput, ...overrides.privateAgreement } });
async function writeDoc(name, value) {
  const path = resolve(temporary, name);
  await writeFile(path, typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value, null, 2));
  return path;
}
function instrument() {
  const observed = { prompts: 0, networkCalls: 0 };
  window.__observed = observed;
  window.__reviewReplyCodes = [];
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', ({data}) => {
        if (data?.operation === 'saveTermsReview' || data?.operation === 'listTermsReviews')
          window.__reviewReplyCodes.push(data.result?.ok ? 'OK' : data.result?.error?.code);
      });
    }
  };
  const prompt = async () => { observed.prompts++; throw new Error('FIXTURE_WALLET_DENIED'); };
  Object.defineProperty(window, 'ethereum', { value: { request: prompt, enable: prompt }, configurable: true });
  const originalFetch = window.fetch;
  window.fetch = (...args) => { observed.networkCalls++; return originalFetch(...args); };
  // Test hook: hold SHA-256 calls while __holdDigest is set, so cancel/stale handling can be observed.
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  window.__releaseDigest = []; window.__digestsStarted = 0; window.__digestsDone = 0;
  crypto.subtle.digest = async (...args) => {
    window.__digestsStarted++;
    try {
      if (window.__holdDigest) await new Promise(release => window.__releaseDigest.push(release));
      return await digest(...args);
    } finally { window.__digestsDone++; }
  };
}

try {
  const out = resolve(temporary, 'demo');
  const evidence = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(evidence.syntheticDemo, true);
  assert.equal(evidence.ReleaseEnabled, 0);

  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const target = resolve(out, path === '/' ? 'index.html' : '.' + path);
    if (!target.startsWith(out + sep) || !/\.(?:html|js|css|json)$/.test(target)) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(bytes => {
      response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json');
      response.end(bytes);
    }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(instrument);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
  });
  const page = await context.newPage();
  page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  await page.clock.setFixedTime(FIXED_NOW);
  const main = page.locator('main');
  const mainText = () => main.innerText();
  /** Exact <dd> text for a review <dt> label, so a wrong-decimals value cannot pass as a substring. */
  const field = label => page.evaluate(wanted => {
    const term = [...document.querySelectorAll('dl.terms dt')].find(node => node.textContent === wanted);
    return term?.nextElementSibling?.innerText ?? null;
  }, label);
  const amountLine = async () => (await field('Crypto amount'))?.split('\n')[0];
  const sessionItems = async () => {
    await page.getByRole('heading', { level: 2, name: 'Reviewed in this session', exact: true }).waitFor();
    return page.locator('.session-list li').count();
  };

  // 1. Offers: demo is visibly distinct; empty session; missing file is refused locally.
  await page.goto(origin + '/#/offers');
  await page.getByRole('heading', { level: 1, name: 'Offers', exact: true }).waitFor();
  await page.getByText('SYNTHETIC DEMO · test-only data', { exact: true }).waitFor();
  await page.getByText(/^SYNTHETIC LOCAL DEMO: test-only registry for local chain 31337/).waitFor();
  assert.match(await mainText(), /Offer discovery is unavailable/);
  assert.match(await mainText(), /No terms reviewed yet in this session\./);
  await page.getByRole('button', { name: 'Check terms', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Choose a trade-terms file first.' }).waitFor();

  // 2. Fresh core sample → navigates to the review with exact values and live deadlines.
  await page.getByRole('button', { name: 'Core native sample (deadlines from now)', exact: true }).click();
  await page.waitForURL(/#\/trade\/[A-Za-z0-9_-]{22}$/);
  const freshUrl = page.url();
  await page.getByRole('heading', { level: 1, name: 'Trade review', exact: true }).waitFor();
  let text = await mainText();
  for (const expected of ['Preview only. Trading is disabled in this build.', '0.25 native', '250000000000000000 base units at 18 decimals', '123.45 EUR',
    SELLER, BUYER, '1 h remaining', '1 d 1 h remaining', 'None (core manual trade).', 'SYNTHETIC demo instructions.\nDo not send real money.',
    'SYNTHETIC test-only sample', 'Manual settlement risk', 'Not computed in this build because signing is disabled.', '31337']) {
    assert.ok(text.includes(expected), `fresh review shows ${JSON.stringify(expected)}`);
  }
  assert.ok(!text.includes('The acceptance deadline has passed'));
  assert.equal(await amountLine(), '0.25 native');
  assert.equal(await field('Fiat amount'), '123.45 EUR');
  assert.equal(await field('Crypto seller (funds escrow, confirms fiat receipt)'), `${SELLER}\nGrouped for reading: 0x ${SELLER.slice(2).match(/.{4}/g).join(' ')}`);
  assert.equal(await main.getByRole('button', { name: /accept|sign|fund/i }).count(), 0, 'no accept/sign/fund controls');
  // Long exact hex values must wrap, not clip, from phone to desktop widths.
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal overflow at ${width}px`);
  }
  // Keyboard: the review heading receives focus after route changes and the page has no positive tabindex traps.
  assert.equal(await page.locator('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').count(), 0);

  // 3. Reload: memory-only session is honest about losing the review; nothing is replayed from the link.
  await page.reload();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Back to offers', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Offers', exact: true }).waitFor();
  assert.equal(await sessionItems(), 0);

  // 4. A real file: frozen native scenario (expired by the fixed clock, has an unsupported capability).
  await page.setInputFiles('#terms-file', await writeDoc('native.json', documentFor('native')));
  await page.getByRole('button', { name: 'Check terms', exact: true }).click();
  await page.waitForURL(/#\/trade\/[A-Za-z0-9_-]{22}$/);
  text = await mainText();
  for (const expected of ['1 native', '1000000000000000000 base units at 18 decimals', '50.00 USD', 'Expired', 'local-test-cap v1',
    'Not supported by this build.', 'The acceptance deadline has passed', 'The terms require optional capabilities', 'a local file you selected',
    scenario.sets.native.privateAgreementSha256, scenario.domain.verifyingContract]) {
    assert.ok(text.includes(expected), `file review shows ${JSON.stringify(expected)}`);
  }
  assert.ok(!text.includes('SYNTHETIC test-only sample'));
  assert.equal(await amountLine(), '1 native');
  assert.equal(await field('Fiat amount'), '50.00 USD');
  assert.notEqual(page.url(), freshUrl);

  // 5. ERC-20 frozen scenario through a file.
  await page.goto(origin + '/#/offers');
  await page.setInputFiles('#terms-file', await writeDoc('erc20.json', documentFor('erc20')));
  await page.getByRole('button', { name: 'Check terms', exact: true }).click();
  await page.waitForURL(/#\/trade\//);
  text = await mainText();
  for (const expected of ['25 test-usd', '25000000 base units at 6 decimals', '25.00 USD', 'ERC-20 token', scenario.sets.erc20.terms.asset]) {
    assert.ok(text.includes(expected), `erc20 review shows ${JSON.stringify(expected)}`);
  }
  assert.equal(await amountLine(), '25 test-usd');
  assert.equal(await field('Fiat amount'), '25.00 USD');

  // 6. Rejections: each stays on Offers with a fixed message and stores nothing.
  await page.goto(origin + '/#/offers');
  assert.equal(await sessionItems(), 2);
  const tamperedHash = documentFor('native', { privateAgreement: { fiatMinorUnits: '5001' } });
  const unknownNetwork = documentFor('native', { terms: { networkId: 'other-evm' } });
  const rejections = [
    ['tampered.json', tamperedHash, 'Refused: the private agreement does not match the hash in the public terms.'],
    ['unknown-network.json', unknownNetwork, 'Refused: the network is not in the loaded registry.'],
    ['malformed.json', '{"format": "p2p-offramp/local-terms-review/v1", "terms": ', 'Refused: the file is not a valid trade-terms document.'],
    ['oversize.json', new Uint8Array(64 * 1024 + 1).fill(0x20), 'Refused: the file or one of its fields is larger than allowed.'],
    ['uppercase.json', documentFor('native', { terms: { seller: SELLER.toUpperCase().replace('0X', '0x') } }), 'Refused: the public terms are not in canonical form.'],
  ];
  for (const [name, value, message] of rejections) {
    await page.setInputFiles('#terms-file', await writeDoc(name, value));
    await page.getByRole('button', { name: 'Check terms', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: message }).waitFor();
    assert.match(page.url(), /#\/offers$/, `${name} stays on offers`);
    assert.equal(await sessionItems(), 2, `${name} stores nothing`);
  }

  // 7. Hostile but correctly hashed payment instructions are hidden, never rendered as markup.
  const hostileAgreement = { ...scenario.sets.native.privateAgreementInput, paymentInstructions: '<img src=x onerror="window.hostileRan=true"> pay\u202Efdp' };
  const hostile = documentFor('native', { privateAgreement: hostileAgreement, terms: { privateAgreementHash: sha(encodePrivateAgreement(hostileAgreement)) } });
  await page.setInputFiles('#terms-file', await writeDoc('hostile.json', hostile));
  await page.getByRole('button', { name: 'Check terms', exact: true }).click();
  await page.waitForURL(/#\/trade\//);
  await page.getByText(/^Hidden: the text contains characters that can disguise its meaning/).waitFor();
  assert.equal(await main.locator('img, svg, script').count(), 0);
  assert.equal(await page.evaluate(() => window.hostileRan === true), false);

  // 8. Cancel while checking: the late result is discarded and nothing is stored.
  await page.goto(origin + '/#/offers');
  const before = await sessionItems();
  await page.setInputFiles('#terms-file', await writeDoc('slow.json', documentFor('erc20', { terms: { acceptBeforeSeconds: '1700000001' } })));
  await page.evaluate(() => { window.__holdDigest = true; });
  await page.getByRole('button', { name: 'Check terms', exact: true }).click();
  await page.getByText('Checking the terms against the registry…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Check terms', exact: true }).isDisabled(), true, 'no duplicate submission while busy');
  await page.getByRole('button', { name: 'Cancel check', exact: true }).click();
  await page.getByText('Check cancelled. Nothing was stored.', { exact: true }).waitFor();
  await page.evaluate(() => { window.__holdDigest = false; for (const release of window.__releaseDigest.splice(0)) release(); });
  // Wait until every digest of the cancelled check (including any it starts after release) has settled, then one task more.
  await page.waitForFunction(() => window.__digestsDone === window.__digestsStarted && window.__releaseDigest.length === 0);
  await page.evaluate(() => new Promise(done => setTimeout(done, 0)));
  await page.waitForFunction(() => window.__digestsDone === window.__digestsStarted);
  assert.match(page.url(), /#\/offers$/);
  assert.equal(await sessionItems(), before);
  assert.match(await mainText(), /Check cancelled\. Nothing was stored\./);

  // 9. Session list navigation and removal.
  await page.getByRole('link', { name: /^Order b2b2/ }).first().click();
  await page.getByRole('heading', { level: 1, name: 'Trade review', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remove from session', exact: true }).click();
  await page.waitForURL(/#\/offers$/);
  assert.equal(await sessionItems(), before - 1);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Your local workspace', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Offers', exact: true }).click();
  await page.getByRole('heading', { level: 2, name: 'Reviewed in this session', exact: true }).waitFor();
  assert.equal(await sessionItems(), before - 1, 'in-memory session survives in-app navigation');

  // 10. Import → review → remove: the Offers status must not keep linking to the removed review.
  const count = await sessionItems();
  await page.getByRole('button', { name: 'Core native sample (deadlines from now)', exact: true }).click();
  await page.waitForURL(/#\/trade\//);
  await page.getByRole('heading', { level: 1, name: 'Trade review', exact: true }).waitFor();
  await main.locator('.actions').getByRole('button', { name: 'Remove from session', exact: true }).click();
  await page.waitForURL(/#\/offers$/);
  assert.equal(await sessionItems(), count);
  assert.equal(await page.getByRole('link', { name: 'Open review', exact: true }).count(), 0, 'no status link to a removed review');

  // 11. Explicit encrypted persistence: real Worker/IndexedDB, reload and fresh-key backup restore.
  const reviewPass = 'synthetic review persistence test passphrase';
  const restoredPass = 'synthetic review restored test passphrase';
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
  await page.getByLabel('New passphrase', { exact: true }).fill(reviewPass);
  await page.getByLabel('Confirm new passphrase', { exact: true }).fill(reviewPass);
  await page.getByLabel(/no passphrase reset/).check();
  await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
  await page.getByText('Vault unlocked', { exact: true }).waitFor();
  const createdId = /Profile ([0-9a-f]{32}) was created/.exec(await page.getByRole('status').filter({ hasText: 'was created and unlocked' }).innerText())?.[1];
  assert.ok(createdId);
  await page.getByRole('link', { name: 'Offers', exact: true }).click();
  await page.getByRole('button', { name: 'Core native sample (deadlines from now)', exact: true }).click();
  await page.waitForURL(/#\/trade\//);
  await page.getByRole('button', { name: 'Save encrypted review', exact: true }).click();
  await page.waitForFunction(() => /Review saved|review operation did not complete|quota was exceeded/.test(document.querySelector('main').textContent));
  assert.match(await mainText(), /Review saved/, `encrypted save must report a confirmed result: ${JSON.stringify(await page.evaluate(() => window.__reviewReplyCodes))}`);
  await page.getByRole('status').filter({ hasText: 'Review saved' }).waitFor();
  // A duplicate save must remain idempotent: loading below must yield one record.
  await page.getByRole('button', { name: 'Save encrypted review', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Review saved' }).waitFor();
  const unlock = async (id, secret, target = page) => {
    await target.getByRole('link', { name: 'Home', exact: true }).click();
    await target.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await target.getByLabel('Profile ID', { exact: true }).fill(id);
    await target.getByLabel('Passphrase', { exact: true }).fill(secret);
    await target.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
    await target.getByText('Vault unlocked', { exact: true }).waitFor();
  };
  let savedCount = 1;
  const loadReview = async () => {
    await page.getByRole('link', { name: 'Offers', exact: true }).click();
    await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked' }).waitFor();
    assert.equal(await sessionItems(), savedCount, 'all saved reviews survive');
    await page.locator('.session-list a').filter({ hasText: /^Order c3c3/ }).click();
    await page.getByRole('heading', { level: 1, name: 'Trade review', exact: true }).waitFor();
    assert.equal(await amountLine(), '0.25 native');
    assert.equal(await field('Fiat amount'), '123.45 EUR');
  };
  await page.reload();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  await unlock(createdId, reviewPass);
  await loadReview();
  // A second tab saves another review; the stale first tab must re-unlock, never overwrite it.
  const other = await context.newPage();
  other.on('pageerror', () => unexpected.push('SECOND_TAB_PAGE_ERROR'));
  await other.goto(origin + '/#/home');
  await unlock(createdId, reviewPass, other);
  await other.getByRole('link', { name: 'Offers', exact: true }).click();
  await other.getByRole('button', { name: 'Frozen scenario: ERC-20 (expired, has capability)', exact: true }).click();
  await other.waitForURL(/#\/trade\//);
  await other.getByRole('button', { name: 'Save encrypted review', exact: true }).click();
  await other.getByRole('status').filter({ hasText: 'Review saved' }).waitFor();
  savedCount = 2;
  await page.getByRole('button', { name: 'Save encrypted review', exact: true }).click();
  await page.getByText('Vault locked', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  await other.close();
  await unlock(createdId, reviewPass);
  await loadReview();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await page.getByText('Vault locked', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  assert.ok(!(await mainText()).includes('SYNTHETIC demo instructions.'), 'lock clears decrypted review from DOM');
  await page.getByRole('link', { name: 'Recovery', exact: true }).click();
  await page.getByLabel('Profile ID', { exact: true }).fill(createdId);
  await page.getByLabel(/encrypted export is unchecked/).check();
  const reviewDownloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
  const reviewDownload = await reviewDownloadReady;
  const reviewBackup = await readFile(await reviewDownload.path());
  assert.equal(reviewBackup.includes(Buffer.from(reviewPass)), false);
  assert.equal(reviewBackup.includes(Buffer.from('SYNTHETIC demo instructions.')), false, 'backup contains no plaintext review');
  await page.getByLabel('Encrypted backup file', { exact: true }).setInputFiles(await reviewDownload.path());
  await page.getByLabel('Backup passphrase', { exact: true }).fill(reviewPass);
  await page.getByLabel('New passphrase', { exact: true }).fill(restoredPass);
  await page.getByLabel('Confirm new passphrase', { exact: true }).fill(restoredPass);
  await page.getByLabel(/file content is untrusted/).check();
  await page.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
  const restoredText = await page.getByRole('status').filter({ hasText: 'Restored as a new locked profile' }).innerText();
  const restoredId = /profile ([0-9a-f]{32})/.exec(restoredText)?.[1];
  assert.ok(restoredId && restoredId !== createdId);
  await unlock(restoredId, restoredPass);
  await loadReview();

  const observed = await page.evaluate(() => ({ ...window.__observed, local: localStorage.length, session: sessionStorage.length }));
  assert.deepEqual(observed, { prompts: 0, networkCalls: 0, local: 0, session: 0 });
  assert.deepEqual(unexpected, []);
  await context.close();
  console.log(JSON.stringify({ fixture: 'synthetic-demo-trade-review-local-chromium', browser: browser.version(), syntheticDemo: true,
    journey: ['offers', 'sample-review', 'reload-not-in-session', 'file-native', 'file-erc20', 'rejections', 'hostile-instructions', 'cancel-stale', 'session-remove', 'encrypted-save', 'reload-unlock-load', 'cross-tab-stale-save', 'lock-clears-review', 'fresh-key-backup-restore-load'],
    walletPrompts: observed.prompts, networkCalls: observed.networkCalls, unexpectedRequests: unexpected.length, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
