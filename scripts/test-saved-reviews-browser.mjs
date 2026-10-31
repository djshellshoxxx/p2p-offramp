/**
 * Saved trade-terms reviews (G07) on the emitted `demo` build in local Chromium, through the real UI, Worker and
 * encrypted IndexedDB vault: save → reload → unlock → load (re-reviewed) → lock hides it → delete. SYNTHETIC test-only
 * data; no wallet, relay, RPC or funds are involved, and no release is attested.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-saved-reviews-'));
const PASS = 'saved review browser fixture passphrase';
const SAMPLE = 'Core native sample (deadlines from now)';
const unexpected = [];
let browser, server;

try {
  const out = resolve(temporary, 'demo');
  const evidence = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(evidence.syntheticDemo, true); assert.equal(evidence.ReleaseEnabled, 0);
  void root;
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
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
  });
  const page = await context.newPage();
  page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  const main = page.locator('main');
  const sessionItems = () => page.locator('.session-list li').count();
  const offers = async () => {
    await page.getByRole('link', { name: 'Offers', exact: true }).click();
    await page.getByRole('heading', { level: 2, name: 'Saved in this profile', exact: true }).waitFor();
  };
  const unlock = async profileId => {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Profile ID', { exact: true }).fill(profileId);
    await page.getByLabel('Passphrase', { exact: true }).fill(PASS);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
    await page.getByText('Vault unlocked', { exact: true }).waitFor();
  };
  const rawVault = () => page.evaluate(() => new Promise((done, fail) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onerror = () => fail(new Error('idb'));
    request.onsuccess = () => {
      const tx = request.result.transaction('vaults', 'readonly'); const all = tx.objectStore('vaults').getAll();
      all.onsuccess = () => { request.result.close(); done(JSON.stringify(all.result)); };
    };
  }));

  // 1. Locked: saving is not offered; the panel says why.
  await page.goto(origin + '/#/offers');
  await page.getByRole('heading', { level: 2, name: 'Saved in this profile', exact: true }).waitFor();
  await page.getByText('Unlock a profile to save reviews or load saved ones.', { exact: true }).waitFor();
  await page.getByRole('button', { name: SAMPLE, exact: true }).click();
  await page.waitForURL(/#\/trade\//);
  assert.equal(await page.getByRole('button', { name: 'Save to profile', exact: true }).count(), 0, 'no save while locked');

  // 2. Create a profile, then save the reviewed sample into it.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
  await page.getByLabel('New passphrase', { exact: true }).fill(PASS);
  await page.getByLabel('Confirm new passphrase', { exact: true }).fill(PASS);
  await page.getByLabel(/no passphrase reset/).check();
  await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
  await page.getByText('Vault unlocked', { exact: true }).waitFor();
  const profileId = /Profile ([0-9a-f]{32}) was created/.exec(await page.getByRole('status').filter({ hasText: 'was created and unlocked' }).innerText())?.[1];
  assert.ok(profileId);
  await offers();
  assert.equal(await sessionItems(), 0, 'opening another profile selection clears earlier private session reviews');
  await page.getByRole('button',{name:SAMPLE,exact:true}).click();
  await page.waitForURL(/#\/trade\//);
  await offers();
  assert.equal(await sessionItems(), 1);
  await page.locator('.session-list li').getByRole('button', { name: 'Save to profile', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved in the open profile.' }).waitFor();
  await page.locator('.session-list li').getByText('(Saved in profile)').waitFor();
  const vaultText = await rawVault();
  assert.ok(vaultText.length > 0);
  assert.doesNotMatch(vaultText, /SYNTHETIC demo instructions|local-terms-review|saved-terms-review|31337/, 'saved terms are encrypted at rest');

  // 3. Reload: memory is empty and the vault is locked; unlock and load re-reviews the saved file.
  await page.reload();
  await page.getByText('Vault locked', { exact: true }).waitFor();
  await unlock(profileId);
  await offers();
  assert.equal(await sessionItems(), 0, 'nothing is loaded without an explicit load');
  await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked again.' }).waitFor();
  assert.equal(await sessionItems(), 1);
  await page.locator('.session-list li a').first().click();
  await page.getByRole('heading', { level: 1, name: 'Trade review', exact: true }).waitFor();
  const reviewUrl = page.url();
  const text = await main.innerText();
  for (const expected of ['0.25 native', '123.45 EUR', 'SYNTHETIC test-only sample', 'Saved in profile']) assert.ok(text.includes(expected), expected);

  // 4. Lock clears both loaded and newly imported private reviews.
  await offers();
  await page.getByRole('button',{name:'Frozen scenario: native (expired, has capability)',exact:true}).click();
  await page.waitForURL(/#\/trade\//);
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await page.getByText('Vault locked', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  await page.goto(reviewUrl);
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  await offers();
  assert.equal(await sessionItems(), 0, 'locking clears both loaded and unsaved reviews');

  // 5. Unlock, load, delete from the profile; a reload + load finds nothing.
  await unlock(profileId);
  await offers();
  await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked again.' }).waitFor();
  await page.locator('.session-list li').getByRole('button', { name: 'Delete from profile', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Deleted from the open profile.' }).waitFor();
  assert.equal(await sessionItems(), 0, 'a deleted loaded review leaves memory too');
  await page.reload();
  await unlock(profileId);
  await offers();
  await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked again.' }).waitFor();
  assert.equal(await sessionItems(), 0);

  const surfaces = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  assert.deepEqual(surfaces, { local: 0, session: 0 });
  assert.deepEqual(unexpected, []);
  await context.close();
  console.log(JSON.stringify({ fixture: 'synthetic-demo-saved-reviews-local-chromium', browser: browser.version(),
    journey: ['locked-no-save', 'create', 'save', 'encrypted-at-rest', 'reload-unlock-load', 'lock-hides', 'delete', 'reload-empty'],
    unexpectedRequests: unexpected.length, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
