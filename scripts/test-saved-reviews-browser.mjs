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
import { parseVaultEnvelope } from '../packages/schemas/index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-saved-reviews-'));
const PASS = 'saved review browser fixture passphrase';
const SAMPLE = 'Core native sample (deadlines from now)';
const unexpected = [];
let browser, server;

try {
  const out = resolve(temporary, 'demo');
  const defaultOut = resolve(temporary, 'default');
  const evidence = await buildWeb({ delivery: 'demo', outDir: out });
  const defaultEvidence = await buildWeb({ delivery: 'meta', outDir: defaultOut });
  assert.equal(defaultEvidence.ReleaseEnabled, 0); assert.equal(defaultEvidence.syntheticDemo, false);
  assert.equal(evidence.syntheticDemo, true); assert.equal(evidence.ReleaseEnabled, 0);
  void root;
  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const base = path.startsWith('/default/') ? defaultOut : out, relative = base === defaultOut ? path.slice('/default'.length) : path;
    const target = resolve(base, relative === '/' ? 'index.html' : '.' + relative);
    if (!target.startsWith(base + sep) || !/\.(?:html|js|css|json)$/.test(target)) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(bytes => {
      response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json');
      response.end(bytes);
    }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args); globalThis.__t80Worker = this;
        this.addEventListener('message', event => {
          if (globalThis.__t80Hold && event.data?.operation === 'loadTradeDraftLibrary') {
            event.stopImmediatePropagation(); globalThis.__t80Held = event.data; globalThis.__t80Hold = false;
          }
        });
      }
    };
  });
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

  // 5. Saved deletion navigates to explicit retention review. This offline build protects unknown dependencies.
  await unlock(profileId);
  await offers();
  await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked again.' }).waitFor();
  await page.locator('.session-list li').getByRole('link', { name: 'Review deletion in Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Preview local records offline', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '0 records eligible for this complete reviewed deletion; 1 record protected' }).waitFor();
  assert.equal(await page.getByRole('button',{name:'Delete the reviewed eligible group',exact:true}).count(),0);
  await page.getByText('This build has no native dependency provider.',{exact:false}).waitFor();
  await page.reload();
  await unlock(profileId);
  await offers();
  await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked again.' }).waitFor();
  assert.equal(await sessionItems(), 1, 'unknown native dependencies preserve the encrypted saved copy across reload');

  // 6. The actual emitted editor stores only safe defaults, then opens two independently fresh reviews.
  const editor = page.locator('section[aria-labelledby="draft-editor-title"]');
  await editor.getByRole('heading', { name: 'New local draft', exact: true }).waitFor();
  await editor.getByRole('button', { name: 'Load templates', exact: true }).click();
  await editor.getByLabel('Network', { exact: true }).selectOption('local-evm');
  await editor.getByLabel('Escrow deployment', { exact: true }).selectOption('escrow-local-v1');
  await editor.getByLabel('Asset', { exact: true }).selectOption('native');
  await editor.getByLabel('Crypto amount in base units', { exact: true }).fill('123456789');
  await editor.getByLabel('Fiat currency code', { exact: true }).fill('USD');
  await editor.getByLabel('Fiat decimal scale', { exact: true }).fill('2');
  await editor.getByLabel('Fiat amount in minor units', { exact: true }).fill('500');
  const confirmChange = async () => {
    await editor.getByLabel('I reviewed these local changes and understand backup copies are unaffected.', { exact: true }).check();
    await editor.getByRole('button', { name: 'Confirm local change', exact: true }).click();
    await editor.getByRole('status').filter({ hasText: 'The local template change is saved.' }).waitFor();
  };
  await editor.getByRole('button', { name: 'Save amounts as template', exact: true }).click(); await confirmChange();
  await editor.getByRole('button', { name: 'Use for repeat defaults', exact: true }).click(); await confirmChange();
  await editor.getByLabel('Crypto amount in base units', { exact: true }).fill('7654321');
  await editor.getByLabel('Template slot', { exact: true }).selectOption('1');
  await editor.getByRole('button', { name: 'Save amounts as template', exact: true }).click(); await confirmChange();
  assert.equal(await editor.locator('.session-list li').count(), 2);
  const blankFresh = async () => {
    for (const name of ['Full seller address', 'Full buyer address', 'New private draft instructions', 'New acceptance deadline (Unix seconds)', 'New escrow expiry (Unix seconds)']) assert.equal(await editor.getByLabel(name, { exact: true }).inputValue(), '', name);
    assert.equal(await editor.getByLabel('I rechecked the exact crypto and fiat amounts for this draft.', { exact: true }).isChecked(), false);
    assert.equal(await editor.getByLabel('I checked the current chain, escrow, asset and full party addresses.', { exact: true }).isChecked(), false);
    assert.equal(await editor.getByRole('button', { name: 'Review fresh draft', exact: true }).isDisabled(), true);
  };
  const fillFresh = async note => {
    await editor.getByLabel('Full seller address', { exact: true }).fill(`0x${'12'.repeat(20)}`);
    await editor.getByLabel('Full buyer address', { exact: true }).fill(`0x${'34'.repeat(20)}`);
    await editor.getByLabel('New private draft instructions', { exact: true }).fill(note);
    const now = Math.floor(Date.now() / 1000);
    await editor.getByLabel('New acceptance deadline (Unix seconds)', { exact: true }).fill(String(now + 600));
    await editor.getByLabel('New escrow expiry (Unix seconds)', { exact: true }).fill(String(now + 7200));
    await editor.getByLabel('I rechecked the exact crypto and fiat amounts for this draft.', { exact: true }).check();
    await editor.getByLabel('I checked the current chain, escrow, asset and full party addresses.', { exact: true }).check();
  };
  await editor.getByRole('button', { name: 'New draft from repeat defaults', exact: true }).click(); await blankFresh();
  assert.equal(await editor.getByLabel('Crypto amount in base units', { exact: true }).inputValue(), '123456789');
  await fillFresh('SYNTHETIC new private instruction A; never a reusable default.');
  await editor.getByRole('button', { name: 'Review fresh draft', exact: true }).click(); await page.waitForURL(/#\/trade\//);
  await page.getByText('Source: newly entered local draft. No acceptance is authenticated.', { exact: true }).waitFor();
  const exactReviewField = label => page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]').innerText();
  const firstOrder = await exactReviewField('Order ID'), firstNonce = await exactReviewField('Seller nonce');
  await offers(); await editor.getByRole('button', { name: 'New draft from repeat defaults', exact: true }).click(); await blankFresh();
  await fillFresh('SYNTHETIC new private instruction B; never a reusable default.');
  await editor.getByRole('button', { name: 'Review fresh draft', exact: true }).click(); await page.waitForURL(/#\/trade\//);
  assert.notEqual(await exactReviewField('Order ID'), firstOrder); assert.notEqual(await exactReviewField('Seller nonce'), firstNonce);
  for (const envelope of JSON.parse(await rawVault())) parseVaultEnvelope(envelope);
  assert.doesNotMatch(await rawVault(), /"fiatCurrency"\s*:|SYNTHETIC new private instruction|local-trade-drafts\/v1/);

  // 7. Reload and the actual G03 download/restore path retain only safe defaults under fresh destination keys.
  await page.reload(); await page.getByText('Vault locked', { exact: true }).waitFor(); await unlock(profileId); await offers();
  await editor.getByRole('button', { name: 'Load templates', exact: true }).click(); await editor.locator('.session-list li').nth(1).waitFor();
  await editor.getByRole('button', { name: 'New draft from repeat defaults', exact: true }).click(); await blankFresh();
  await page.getByRole('link', { name: 'Recovery', exact: true }).click();
  await page.locator('#export-profile').fill(profileId); await page.locator('#export-consent').check();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
  const download = await downloadPromise, backupPath = resolve(temporary, 'draft-template-backup.json'); await download.saveAs(backupPath);
  const sourceBackup = JSON.parse(await readFile(backupPath, 'utf8'));
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await page.getByText('Vault locked', { exact: true }).waitFor();
  await page.locator('#restore-file').setInputFiles(backupPath); await page.locator('#restore-source').fill(PASS);
  await page.locator('#restore-passphrase').fill(PASS); await page.locator('#restore-confirm').fill(PASS); await page.locator('#restore-consent').check();
  await page.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
  const restoredNotice = page.getByRole('status').filter({ hasText: 'Restored as a new locked profile' }); await restoredNotice.waitFor();
  const restoredId = /profile ([0-9a-f]{32})/.exec(await restoredNotice.innerText())?.[1]; assert.ok(restoredId); assert.notEqual(restoredId, profileId);
  const restoredEnvelope = JSON.parse(await rawVault()).find(row => row.profileId === restoredId); assert.notEqual(restoredEnvelope.keyId, sourceBackup.envelope.keyId);
  await unlock(restoredId); await offers(); await editor.getByRole('button', { name: 'Load templates', exact: true }).click();
  await editor.locator('.session-list li').nth(1).waitFor(); await editor.getByRole('button', { name: 'New draft from repeat defaults', exact: true }).click(); await blankFresh();
  await fillFresh('SYNTHETIC private form must disappear before a late old-scope reply.');
  await page.evaluate(() => { globalThis.__t80Hold = true; globalThis.__t80Held = null; });
  await editor.getByRole('button', { name: 'Load templates', exact: true }).click(); await page.waitForFunction(() => globalThis.__t80Held !== null);
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await unlock(restoredId); await offers();
  await page.evaluate(() => { globalThis.__t80Worker.dispatchEvent(new MessageEvent('message', { data: globalThis.__t80Held })); globalThis.__t80Held = null; });
  await blankFresh(); assert.equal(await editor.locator('.session-list li').count(), 0, 'late old-generation library reply cannot repopulate the new selection');

  // 8. A separately emitted default artifact has no approved registry and never prompts a wallet or contacts a provider.
  const plainContext = await browser.newContext({ serviceWorkers: 'block' });
  await plainContext.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); unexpected.push('DEFAULT_UNEXPECTED_NETWORK'); return route.abort(); });
  await plainContext.addInitScript(() => { globalThis.__t80WalletCalls = 0; globalThis.ethereum = { request: async () => { globalThis.__t80WalletCalls++; throw new Error('fixture wallet must stay inert'); } }; });
  const plain = await plainContext.newPage(); plain.on('pageerror', () => unexpected.push('DEFAULT_PAGE_ERROR'));
  await plain.goto(origin + '/default/#/home'); await plain.getByRole('button', { name: 'Create new profile', exact: true }).click();
  await plain.getByLabel('New passphrase', { exact: true }).fill(PASS); await plain.getByLabel('Confirm new passphrase', { exact: true }).fill(PASS);
  await plain.getByLabel(/no passphrase reset/).check(); await plain.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
  await plain.getByText('Vault unlocked', { exact: true }).waitFor(); await plain.getByRole('link', { name: 'Offers', exact: true }).click();
  await plain.getByText('No current registry choices are available for this draft.', { exact: true }).waitFor();
  assert.equal(await plain.getByRole('button', { name: 'Review fresh draft', exact: true }).isDisabled(), true); assert.equal(await plain.evaluate(() => globalThis.__t80WalletCalls), 0);
  await plainContext.close();

  const surfaces = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  assert.deepEqual(surfaces, { local: 0, session: 0 });
  assert.deepEqual(unexpected, []);
  await context.close();
  console.log(JSON.stringify({ fixture: 'synthetic-demo-saved-reviews-local-chromium', browser: browser.version(),
    journey: ['locked-no-save', 'create', 'save', 'encrypted-at-rest', 'reload-unlock-load', 'lock-hides', 'explicit-retention-review', 'unknown-protected', 'reload-preserved'],
    draftTemplates: true, repeatDefaults: true, freshReviewedDrafts: 2, actualWorkerAndEncryptedIdb: true, freshKeyTemplateRestore: true,
    lateDraftReplyDiscarded: true, defaultRegistryUnavailable: true, defaultWalletCalls: 0,
    unexpectedRequests: unexpected.length, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
