/** Hosted qualification of favorites in the emitted app, real module Worker and encrypted IndexedDB.
 * Synthetic local fixture only; no wallet, transaction, release or deployment authority is exercised.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-favorites-'));
const PASS = 'encrypted favorites browser fixture passphrase';
const RESTORED = 'independent restored favorites browser fixture passphrase';
const SAMPLE = 'Core native sample (deadlines from now)';
const unexpected = [];
let browser, server;
try {
  const out = resolve(temporary, 'demo'), evidence = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(evidence.syntheticDemo, true); assert.equal(evidence.ReleaseEnabled, 0);
  const documentGraph = JSON.parse(await readFile(resolve(out, 'core-graph-document.json'), 'utf8'));
  const workerGraph = JSON.parse(await readFile(resolve(out, 'core-graph-worker.json'), 'utf8'));
  const qrGraph = JSON.parse(await readFile(resolve(out, 'qr-graph-worker.json'), 'utf8'));
  const favoritesPaths = ['packages/personalization/favorites.ts', 'packages/personalization/src/favorites.ts', 'packages/personalization/src/trade-draft-store.ts', 'packages/personalization/templates.ts'];
  assert.deepEqual(workerGraph.modules.filter(module => module.path.startsWith('packages/personalization/')).map(module => module.path).sort(), favoritesPaths);
  assert.equal([...documentGraph.modules, ...qrGraph.modules].some(module => module.path.startsWith('packages/personalization/')), false);
  const workerName = (await readdir(resolve(out, 'assets'))).find(name => /^vault\.worker-[A-Za-z0-9_-]+\.js$/.test(name)); assert.ok(workerName);
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
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
  });
  const page = await context.newPage();
  page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  const favorites = () => page.locator('.favorites-list li');
  const reviews = () => page.locator('section[aria-labelledby="session-title"] .session-list li');
  const offers = async () => { await page.getByRole('link', { name: 'Offers', exact: true }).click(); await page.getByRole('heading', { name: 'Saved in this profile', exact: true }).waitFor(); };
  const loadFavorites = async (count) => {
    await page.getByRole('button', { name: 'Load favorites', exact: true }).click();
    if (count === 0) await page.getByText('No favorite saved reviews in this profile.', { exact: true }).waitFor();
    else await page.waitForFunction(expected => document.querySelectorAll('.favorites-list li').length === expected, count);
    assert.equal(await favorites().count(), count);
  };
  const create = async () => {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
    await page.getByLabel('New passphrase', { exact: true }).fill(PASS); await page.getByLabel('Confirm new passphrase', { exact: true }).fill(PASS);
    await page.getByLabel(/no passphrase reset/).check(); await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
    const status = page.getByRole('status').filter({ hasText: 'was created and unlocked' }); await status.waitFor();
    const id = /Profile ([0-9a-f]{32}) was created/.exec(await status.innerText())?.[1]; assert.ok(id); return id;
  };
  const unlock = async (profileId, passphrase = PASS) => {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Profile ID', { exact: true }).fill(profileId); await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click(); await page.getByText('Vault unlocked', { exact: true }).waitFor();
  };
  const lock = async () => { await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await page.getByText('Vault locked', { exact: true }).waitFor(); };
  const rawVault = () => page.evaluate(() => new Promise((done, fail) => {
    const opening = indexedDB.open('p2p-offramp-vault', 1); opening.onerror = () => fail(new Error('IDB'));
    opening.onsuccess = () => { const tx = opening.result.transaction('vaults', 'readonly'), all = tx.objectStore('vaults').getAll();
      all.onsuccess = () => { opening.result.close(); done(JSON.stringify(all.result)); }; all.onerror = () => fail(new Error('IDB')); };
  }));

  await page.goto(origin + '/#/offers');
  await page.getByText('Unlock a profile to save reviews or load saved ones.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Load favorites', exact: true }).count(), 0);
  const profileA = await create(); await offers();
  await page.getByRole('button', { name: SAMPLE, exact: true }).click(); await page.waitForURL(/#\/trade\//);
  await page.getByRole('button', { name: 'Save to profile', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved in the open profile.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add favorite', exact: true }).count(), 0, 'an observed revision is required');
  await loadFavorites(0);
  await page.getByRole('button', { name: 'Add favorite', exact: true }).click(); await favorites().waitFor();
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 1);
  const encrypted = await rawVault();
  assert.doesNotMatch(encrypted, /saved-review-favorites|SYNTHETIC demo instructions|saved-terms-review|synthetic-favorite-invalid/);
  assert.equal(page.url().includes(profileA), false);

  await page.reload(); await page.getByText('Vault locked', { exact: true }).waitFor();
  assert.equal(await favorites().count(), 0);
  await unlock(profileA); await offers(); assert.equal(await reviews().count(), 0);
  const beforeFavoriteRead = await rawVault();
  await loadFavorites(1); assert.equal(await reviews().count(), 0, 'loading favorite IDs never opens terms');
  assert.ok((await rawVault()) === beforeFavoriteRead, 'loading favorites leaves durable encrypted rows unchanged');
  await favorites().getByRole('button', { name: 'Open and recheck favorite', exact: true }).click(); await page.waitForURL(/#\/trade\//);
  assert.ok((await page.locator('main').innerText()).includes('0.25 native'));
  assert.ok((await rawVault()) === beforeFavoriteRead, 'opening and rechecking a favorite leaves durable encrypted rows unchanged');
  const oldRoute = page.url(); await lock();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  assert.equal(await favorites().count(), 0);
  await page.goto(oldRoute); await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();

  const profileB = await create(); assert.notEqual(profileB, profileA); await offers(); await loadFavorites(0);
  assert.equal(await reviews().count(), 0);
  await lock(); await unlock(profileA); await offers(); assert.equal(await favorites().count(), 0, 'a selection change never carries favorites across profiles');
  await loadFavorites(1);

  // Recover the historical favorite restore oracle through the maintained ordinary UI.
  // All profile material is synthetic. Observe only durable encrypted envelopes.
  const beforeRestore = JSON.parse(await rawVault());
  const sourceEnvelope = beforeRestore.find(row => row.profileId === profileA);
  const foreignEnvelope = beforeRestore.find(row => row.profileId === profileB);
  assert.ok(sourceEnvelope && foreignEnvelope && beforeRestore.length === 2);
  await page.getByRole('link', { name: 'Recovery', exact: true }).click();
  const exportForm = page.getByRole('form', { name: 'Export an encrypted file', exact: true });
  await exportForm.getByLabel('Profile ID', { exact: true }).fill(profileA);
  await exportForm.getByRole('checkbox').check();
  const downloadWaiting = page.waitForEvent('download');
  await exportForm.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
  const download = await downloadWaiting;
  assert.equal(await download.failure(), null);
  const backup = await readFile(await download.path());
  const restoreForm = page.getByRole('form', { name: 'Restore an encrypted file', exact: true });
  await restoreForm.getByLabel('Encrypted backup file', { exact: true }).setInputFiles({
    name: 'synthetic-favorites-backup.json', mimeType: 'application/json', buffer: backup,
  });
  await restoreForm.getByLabel('Backup passphrase', { exact: true }).fill(PASS);
  await restoreForm.getByLabel('New passphrase', { exact: true }).fill(RESTORED);
  await restoreForm.getByLabel('Confirm new passphrase', { exact: true }).fill(RESTORED);
  await restoreForm.getByRole('checkbox').check();
  await restoreForm.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
  const restored = restoreForm.getByRole('status').filter({ hasText: 'Restored as a new locked profile' });
  await restored.waitFor();
  const restoredId = /Restored as a new locked profile ([0-9a-f]{32})/.exec(await restored.innerText())?.[1];
  assert.ok(restoredId && restoredId !== profileA && restoredId !== profileB);
  const afterRestore = JSON.parse(await rawVault());
  const destination = afterRestore.find(row => row.profileId === restoredId);
  assert.ok(destination && afterRestore.length === 3);
  assert.equal(destination.revision, 0);
  assert.ok(destination.keyId !== sourceEnvelope.keyId, 'restore uses a fresh key identity');
  assert.ok(destination.wrappedKey.salt !== sourceEnvelope.wrappedKey.salt, 'restore uses a fresh salt');
  assert.ok(destination.wrappedKey.nonce !== sourceEnvelope.wrappedKey.nonce, 'restore uses a fresh wrapping nonce');
  assert.ok(destination.snapshot.nonce !== sourceEnvelope.snapshot.nonce, 'restore uses a fresh snapshot nonce');
  const preserveOriginals = rows => {
    assert.ok(JSON.stringify(rows.find(row => row.profileId === profileA)) === JSON.stringify(sourceEnvelope), 'source ciphertext preserved');
    assert.ok(JSON.stringify(rows.find(row => row.profileId === profileB)) === JSON.stringify(foreignEnvelope), 'unrelated profile ciphertext preserved');
  };
  preserveOriginals(afterRestore);
  await lock(); await unlock(restoredId, RESTORED); await offers(); await loadFavorites(1);
  assert.equal(await reviews().count(), 0, 'restored favorite listing does not open terms');
  await favorites().getByRole('button', { name: 'Open and recheck favorite', exact: true }).click();
  await page.waitForURL(/#\/trade\//);
  assert.ok((await page.locator('main').innerText()).includes('0.25 native'));
  const restoredRead = JSON.parse(await rawVault());
  preserveOriginals(restoredRead);
  assert.ok(JSON.stringify(restoredRead.find(row => row.profileId === restoredId)) === JSON.stringify(destination), 'restored favorite recheck preserves destination ciphertext');
  await lock(); await unlock(profileA); await offers(); await loadFavorites(1);
  await favorites().getByRole('button', { name: 'Remove favorite', exact: true }).click();
  await page.getByText('No favorite saved reviews in this profile.', { exact: true }).waitFor();
  await page.reload(); await unlock(profileA); await offers(); await loadFavorites(0);

  await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked again.' }).waitFor();
  await reviews().getByRole('button', { name: 'Add favorite', exact: true }).click(); await favorites().waitFor();
  await reviews().getByRole('button', { name: 'Delete from profile', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Deleted from the open profile.' }).waitFor();
  assert.equal(await favorites().count(), 0); await loadFavorites(1);
  const beforeDanglingRead = await rawVault();
  await favorites().getByRole('button', { name: 'Open and recheck favorite', exact: true }).click();
  await page.getByRole('alert').waitFor(); assert.ok(page.url().endsWith('#/offers')); assert.equal(await reviews().count(), 0);
  assert.ok((await rawVault()) === beforeDanglingRead, 'refusing a deleted review leaves durable encrypted rows unchanged');
  await favorites().getByRole('button', { name: 'Remove favorite', exact: true }).click();
  await page.getByText('No favorite saved reviews in this profile.', { exact: true }).waitFor(); await lock();

  // Fixture setup uses the SAME emitted Worker and its existing purpose-bound saved-review commands.
  // A structurally compatible saved wrapper can contain invalid terms; a favorite never upgrades those terms.
  const invalidRecord = await page.evaluate(async ({ workerURL, profileId, passphrase }) => {
    const worker = new Worker(workerURL, { type: 'module' }); let requestId = 0;
    const request = (operation, fields = {}, generation = 0) => new Promise((resolve, reject) => {
      const mine = ++requestId, timer = setTimeout(() => reject(new Error('FIXTURE_TIMEOUT')), 30_000);
      const reply = event => {
        if (event.data.kind !== 'response' || event.data.requestId !== mine) return;
        clearTimeout(timer); worker.removeEventListener('message', reply);
        if (event.data.result.ok) resolve(event.data.result.value); else reject(new Error(event.data.result.error.code));
      };
      worker.addEventListener('message', reply); worker.postMessage({ version: 1, requestId: mine, generation, operation, ...fields });
    });
    try {
      await request('init', { config: { version: 1, ReleaseEnabled: 0, connectOrigins: [] } });
      await request('unlock', { profileId, passphrase });
      const saved = await request('saveTermsReview', { profileId, source: 'file', bytes: new TextEncoder().encode('{"synthetic-favorite-invalid":true}') });
      const observed = await request('listFavoriteReviews', { profileId });
      await request('setReviewFavorite', { profileId, recordId: saved.recordId, favorite: true, expectedRevision: observed.revision });
      await request('dispose', {}, 1); return saved.recordId;
    } finally { worker.terminate(); }
  }, { workerURL: `${origin}/assets/${workerName}`, profileId: profileA, passphrase: PASS });
  assert.match(invalidRecord, /^[0-9a-f]{32}$/);
  await unlock(profileA); await offers(); await loadFavorites(1);
  const beforeInvalidRead = await rawVault();
  await favorites().getByRole('button', { name: 'Open and recheck favorite', exact: true }).click();
  await page.getByRole('heading', { name: 'Saved files that no longer pass review', exact: true }).waitFor();
  assert.ok((await rawVault()) === beforeInvalidRead, 'refusing invalid terms leaves durable encrypted rows unchanged');
  assert.ok(page.url().endsWith('#/offers')); assert.equal(await reviews().count(), 0);
  assert.equal(await favorites().count(), 1, 'rejection never rewrites the favorite preference');
  await favorites().getByRole('button', { name: 'Remove favorite', exact: true }).click();
  await page.getByText('No favorite saved reviews in this profile.', { exact: true }).waitFor();
  assert.doesNotMatch(await rawVault(), new RegExp(`synthetic-favorite-invalid|${invalidRecord}|saved-review-favorites`));
  // Two distinct documents own actual emitted module Workers with independent vault leases.
  // The already-created synthetic wrapper remains a valid preference target, not valid trade terms.
  await lock();
  const conflictBefore = await rawVault();
  const competing = await context.newPage();
  competing.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  competing.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  const attachFavoriteWorker = document => document.evaluate(async ({ workerURL, profileId, passphrase }) => {
    const worker = new Worker(workerURL, { type: 'module' }); let requestId = 0;
    const request = (operation, fields = {}, generation = 0) => new Promise((resolve, reject) => {
      const mine = ++requestId;
      const cleanup = () => { clearTimeout(timer); worker.removeEventListener('message', reply); worker.removeEventListener('error', failed); };
      const reply = event => {
        if (event.data.kind !== 'response' || event.data.requestId !== mine) return;
        cleanup(); resolve(event.data.result);
      };
      const failed = () => { cleanup(); reject(new Error('FAVORITE_WORKER_ERROR')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('FAVORITE_WORKER_TIMEOUT')); }, 30_000);
      worker.addEventListener('message', reply); worker.addEventListener('error', failed);
      worker.postMessage({ version: 1, requestId: mine, generation, operation, ...fields });
    });
    const value = result => { if (!result.ok) throw new Error(result.error.code); return result.value; };
    try {
      value(await request('init', { config: { version: 1, ReleaseEnabled: 0, connectOrigins: [] } }));
      value(await request('unlock', { profileId, passphrase }));
      const observed = value(await request('listFavoriteReviews', { profileId }));
      window.favoriteCasFixture = { request, terminate: () => worker.terminate() };
      return observed;
    } catch (error) { worker.terminate(); throw error; }
  }, { workerURL: `${origin}/assets/${workerName}`, profileId: profileA, passphrase: PASS });
  const favoriteCommand = (document, operation, fields = {}, generation = 0) =>
    document.evaluate(({ operation, fields, generation }) => window.favoriteCasFixture.request(operation, fields, generation),
      { operation, fields, generation });
  try {
    await competing.goto(origin + '/#/offers');
    await competing.getByText('Vault locked', { exact: true }).waitFor();
    const staleObserved = await attachFavoriteWorker(page), currentObserved = await attachFavoriteWorker(competing);
    assert.deepEqual(staleObserved, currentObserved); assert.deepEqual(staleObserved.recordIds, []);
    assert.ok((await rawVault()) === conflictBefore, 'opening two leases and listing favorites does not write');
    const winner = await favoriteCommand(competing, 'setReviewFavorite', {
      profileId: profileA, recordId: invalidRecord, favorite: true, expectedRevision: currentObserved.revision,
    });
    assert.equal(winner.ok, true);
    assert.deepEqual(winner.value, { recordId: invalidRecord, favorite: true, revision: currentObserved.revision + 1 });
    const committedRows = await rawVault();
    assert.notEqual(committedRows, conflictBefore);
    const beforeRows = JSON.parse(conflictBefore), afterRows = JSON.parse(committedRows);
    assert.equal(afterRows.length, beforeRows.length);
    for (const row of beforeRows.filter(row => row.profileId !== profileA)) {
      assert.ok(JSON.stringify(afterRows.find(candidate => candidate.profileId === row.profileId)) === JSON.stringify(row),
        'winner preserves each unrelated encrypted profile');
    }
    const stale = await favoriteCommand(page, 'setReviewFavorite', {
      profileId: profileA, recordId: invalidRecord, favorite: false, expectedRevision: staleObserved.revision,
    });
    assert.equal(stale.ok, false); assert.equal(stale.error.code, 'CONFLICT');
    const staleStatus = await favoriteCommand(page, 'status');
    assert.equal(staleStatus.ok, true); assert.equal(staleStatus.value.state, 'locked');
    assert.ok((await rawVault()) === committedRows, 'stale favorite operation cannot alter the winning ciphertext');
    const observedWinner = await favoriteCommand(competing, 'listFavoriteReviews', { profileId: profileA });
    assert.equal(observedWinner.ok, true);
    assert.deepEqual(observedWinner.value, { revision: winner.value.revision, recordIds: [invalidRecord] });
    assert.ok((await rawVault()) === committedRows, 'winner readback does not write');
    for (const document of [page, competing]) {
      const disposed = await favoriteCommand(document, 'dispose', {}, 1);
      assert.equal(disposed.ok, true);
    }
  } finally {
    try { await page.evaluate(() => { window.favoriteCasFixture?.terminate(); delete window.favoriteCasFixture; }); }
    finally { await competing.close(); }
  }
  await unlock(profileA); await offers(); await loadFavorites(1);
  assert.equal(await reviews().count(), 0, 'fresh unlock observes winner without implicitly reviewing terms');
  await favorites().getByRole('button', { name: 'Remove favorite', exact: true }).click();
  await page.getByText('No favorite saved reviews in this profile.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
  assert.deepEqual(unexpected, []); await context.close();
  console.log(JSON.stringify({ fixture: 'synthetic-emitted-favorites-native-worker-idb', browser: browser.version(),
    journey: ['locked', 'explicit-load-revision', 'star', 'encrypted-at-rest', 'reload', 'current-registry-open', 'lock-revokes-route', 'profile-isolation',
      'unstar-persists', 'delete-retains-dangling-reference', 'explicit-dangling-removal', 'invalid-terms-favorite-refused', 'read-and-refusal-preserve-durable-rows', 'fresh-key-favorite-restore-preserves-source-and-unrelated-profile', 'two-document-native-favorite-conflict-preserves-winner'],
    workerOnlyFavorites: true, unexpectedRequests: unexpected.length, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
