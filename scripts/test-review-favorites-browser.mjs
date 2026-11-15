/** T82 local proof: actual emitted UI/Worker, Chromium IndexedDB/G02 and fresh-key G03; synthetic terms only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { messages } from '../apps/web/src/ui/messages.ts';

const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(resolve(tmpdir(), 'p2p-review-favorites-'));
const PASS = 'public favorite browser fixture passphrase', RESTORED = 'independent favorite browser restored passphrase';
const favorite = messages.favorites, SAMPLE = 'Core native sample (deadlines from now)', unexpected = [];
let browser, server;
try {
  const out = resolve(temporary, 'demo'), evidence = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(evidence.syntheticDemo, true); assert.equal(evidence.ReleaseEnabled, 0);
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions', '--lib', 'ES2023,DOM',
    '--rootDir', 'packages', '--outDir', resolve(out, '__native'), 'packages/personalization/index.ts', 'packages/storage/index.ts'], { cwd: root, stdio: 'inherit' });
  // A temporary real-React fixture controls controller lifetime only; it never appears in the emitted application.
  const fixtureEntry = resolve(temporary, 'favorite-owner.tsx');
  await writeFile(fixtureEntry, `import {createElement} from ${JSON.stringify(resolve(root, 'node_modules/react/index.js'))};
import {createRoot} from ${JSON.stringify(resolve(root, 'node_modules/react-dom/client.js'))};
import {flushSync} from ${JSON.stringify(resolve(root, 'node_modules/react-dom/index.js'))};
import {FavoriteSavedReviews,useReviewFavorites} from ${JSON.stringify(resolve(root, 'apps/web/src/ui/FavoriteSavedReviews.tsx'))};
import {createTradeReviewController} from ${JSON.stringify(resolve(root, 'apps/web/src/trade/review-controller.ts'))};
const id='ab'.repeat(16),ok=value=>({ok:true,value}),registry={network:()=>null,deployment:()=>null};
const state={ready:false,entered:false,settled:false,listReads:0,model:null,opening:null,held:null,controllers:{}};
const make=label=>createTradeReviewController({source:async()=>({kind:'ready',label:'synthetic-demo',registry,samples:[]}),
 review:async()=>({ok:true,value:{orderId:label,revision:'1'}}),randomBytes:()=>new Uint8Array(16).fill(label==='A'?1:2)});
state.controllers.A=make('A');state.controllers.B=make('B');await Promise.all(Object.values(state.controllers).map(trade=>trade.loadRegistry()));
const store={selectionScope:()=>7,getSnapshot:()=>({state:'unlocked'}),subscribe:()=>()=>{},
 listReviewFavorites:async()=>{state.listReads++;return ok({revision:0,recordIds:[id]});},
 listTermsReviews:async()=>{state.entered=true;await state.held;return ok({items:[{recordId:id,source:'file',bytes:new TextEncoder().encode('saved fixture terms')}],skipped:0});}};
const root=createRoot(document.getElementById('root'));
function Consumer({trade}){const model=useReviewFavorites(store,trade);state.model=model;return createElement(FavoriteSavedReviews,{model});}
state.show=label=>flushSync(()=>root.render(createElement(Consumer,{trade:state.controllers[label]})));
state.begin=()=>{state.entered=false;state.held=new Promise(resolve=>state.release=resolve);state.opening=state.model.open(id);};
state.finish=async()=>{state.release();await state.opening;state.settled=true;};
state.dispose=()=>{flushSync(()=>root.unmount());for(const trade of Object.values(state.controllers))trade.dispose();};
window.favoriteOwnerFixture=state;state.show('A');state.ready=true;
`);
  await build({ configFile: false, logLevel: 'warn', plugins: [react()], define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: {
    outDir: resolve(out, '__favorite-fixture'), emptyOutDir: true, minify: false, sourcemap: false, target: 'es2023',
    lib: { entry: fixtureEntry, formats: ['es'], fileName: () => 'fixture.js' } } });
  await writeFile(resolve(out, 'favorite-fixture.html'), '<!doctype html><title>Favorite controller lifetime fixture</title><div id="root"></div><script type="module" src="/__favorite-fixture/fixture.js"></script>');
  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname, target = resolve(out, path === '/' ? 'index.html' : '.' + path);
    if (!target.startsWith(out + sep) || !/\.(?:html|js|css|json)$/.test(target)) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(bytes => { response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json'); response.end(bytes); }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); unexpected.push('UNEXPECTED_NETWORK'); return route.abort(); });
  const lifetime = await context.newPage(); lifetime.on('pageerror', error => unexpected.push('PAGE_ERROR:' + error.message));
  await lifetime.goto(origin + '/favorite-fixture.html#/offers'); await lifetime.waitForFunction(() => window.favoriteOwnerFixture?.ready);
  await lifetime.evaluate(() => window.favoriteOwnerFixture.model.load()); await lifetime.locator('.favorite-list li').waitFor();
  await lifetime.evaluate(() => window.favoriteOwnerFixture.begin()); await lifetime.waitForFunction(() => window.favoriteOwnerFixture.entered);
  await lifetime.evaluate(() => window.favoriteOwnerFixture.show('B'));
  const heldReplacement = await lifetime.evaluate(async () => { const state = window.favoriteOwnerFixture; await state.model.load(); return { busy: state.model.busy, listReads: state.listReads }; });
  assert.deepEqual(heldReplacement, { busy: true, listReads: 1 }, 'controller replacement retains physical admission while the ignored old load drains');
  await lifetime.evaluate(() => window.favoriteOwnerFixture.finish()); await lifetime.waitForFunction(() => !window.favoriteOwnerFixture.model.busy);
  assert.equal(new URL(lifetime.url()).hash, '#/offers', 'an old controller may not route after replacement with the same store and scope');
  assert.equal(await lifetime.locator('.favorite-list li').count(), 0, 'controller replacement clears the previous consumer view');
  await lifetime.evaluate(() => window.favoriteOwnerFixture.model.load()); await lifetime.locator('.favorite-list li').waitFor();
  await lifetime.evaluate(() => window.favoriteOwnerFixture.model.open('ab'.repeat(16))); await lifetime.waitForURL(/#\/trade\//);
  const replacement = await lifetime.evaluate(() => ({ hash: location.hash, old: window.favoriteOwnerFixture.controllers.A.getSnapshot().reviews[0].localId,
    current: window.favoriteOwnerFixture.controllers.B.getSnapshot().reviews[0].localId }));
  assert.equal(replacement.hash, '#/trade/' + replacement.current); assert.notEqual(replacement.current, replacement.old);
  await lifetime.evaluate(() => window.favoriteOwnerFixture.dispose()); await lifetime.close();
  const page = await context.newPage(); page.on('pageerror', error => unexpected.push('PAGE_ERROR:' + error.message));
  page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  const offers = async () => { await page.getByRole('link', { name: 'Offers', exact: true }).click(); await page.getByRole('heading', { name: favorite.title, exact: true }).waitFor(); };
  const unlock = async (profileId, passphrase = PASS) => {
    await page.getByRole('link', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Profile ID', { exact: true }).fill(profileId); await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click(); await page.getByText('Vault unlocked', { exact: true }).waitFor();
  };
  const lock = async () => { await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await page.getByText('Vault locked', { exact: true }).waitFor(); };
  const loadFavorites = async () => { await page.getByRole('button', { name: favorite.load, exact: true }).click(); await page.getByRole('status').filter({ hasText: favorite.busy }).waitFor({ state: 'hidden' }); };
  const raw = () => page.evaluate(() => new Promise((done, reject) => {
    const request = indexedDB.open('p2p-offramp-vault', 1); request.onerror = () => reject(Error('IDB'));
    request.onsuccess = () => { const tx = request.result.transaction('vaults', 'readonly'), all = tx.objectStore('vaults').getAll(); all.onsuccess = () => { request.result.close(); done(JSON.stringify(all.result)); }; };
  }));
  const initializeNative = async document => document.evaluate(async () => {
    const { IndexedDbVaultStore } = await import('/__native/storage/src/idb-vault-store.js');
    const { EncryptedVaultService, EncryptedBackupService } = await import('/__native/storage/index.js');
    window.favoriteAPI = await import('/__native/personalization/index.js'); window.favoriteSchemas = await import('/__native/schemas/index.js');
    window.favoriteStore = new IndexedDbVaultStore(); window.favoriteVault = new EncryptedVaultService(window.favoriteStore, crypto, { lifecycle: false });
    window.favoriteBackup = new EncryptedBackupService(window.favoriteStore); window.favoriteValue = result => { if (!result.ok) throw Error(result.error.code); return result.value; };
  });

  await page.goto(origin + '/#/offers'); await page.getByText(favorite.locked, { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
  await page.getByLabel('New passphrase', { exact: true }).fill(PASS); await page.getByLabel('Confirm new passphrase', { exact: true }).fill(PASS);
  await page.getByLabel(/no passphrase reset/).check(); await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
  await page.getByText('Vault unlocked', { exact: true }).waitFor();
  const profileId = /Profile ([0-9a-f]{32}) was created/.exec(await page.getByRole('status').filter({ hasText: 'was created and unlocked' }).innerText())?.[1]; assert.ok(profileId);
  await offers(); await page.getByRole('button', { name: SAMPLE, exact: true }).click(); await page.waitForURL(/#\/trade\//);
  await page.getByRole('button', { name: 'Save to profile', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Saved in the open profile.' }).waitFor();
  await offers(); await loadFavorites(); await page.getByText(favorite.empty, { exact: true }).waitFor();
  await page.locator('.session-list li').getByRole('button', { name: favorite.star, exact: true }).click();
  await page.locator('.favorite-list li').waitFor(); const recordId = await page.locator('.favorite-list bdi').innerText(); assert.match(recordId, /^[0-9a-f]{32}$/);
  const ciphertext = await raw(); assert.doesNotMatch(ciphertext, /saved-review-favorites|recordIds|SYNTHETIC demo instructions/); assert.equal(ciphertext.includes(recordId), false);
  await page.locator('.favorite-list').getByRole('button', { name: favorite.open, exact: true }).click(); await page.waitForURL(/#\/trade\//);
  const firstUrl = page.url(); assert.ok((await page.locator('main').innerText()).includes('0.25 native')); assert.equal(await raw(), ciphertext, 'fresh open performs no native write');

  await page.reload(); await page.getByText('Vault locked', { exact: true }).waitFor(); await unlock(profileId); await offers();
  assert.equal(await page.locator('.favorite-list li').count(), 0); assert.equal(await page.locator('.session-list a[href^="#/trade/"]').count(), 0);
  await loadFavorites(); assert.equal(await page.locator('.favorite-list bdi').innerText(), recordId);
  await page.locator('.favorite-list').getByRole('button', { name: favorite.open, exact: true }).click(); await page.waitForURL(/#\/trade\//);
  assert.notEqual(page.url(), firstUrl, 'fresh document gets a new local route, never a retained validity capability'); assert.equal(await raw(), ciphertext);
  await offers(); await loadFavorites(); await lock(); await page.getByText(favorite.locked, { exact: true }).waitFor(); assert.equal(await page.locator('.favorite-list li').count(), 0);

  await initializeNative(page);
  const recovery = await page.evaluate(async ({ profileId, PASS, RESTORED }) => {
    const value = window.favoriteValue, vault = window.favoriteVault, store = window.favoriteStore, schemas = window.favoriteSchemas;
    const session = value(await vault.unlock(profileId, PASS));
    const foreign = { id: 'ff'.repeat(16), kind: 'preference', schemaVersion: 77, payload: schemas.encodeBase64url(new TextEncoder().encode('foreign future favorite proof')) };
    value(await vault.commit(session.sessionId, session.revision, [{ op: 'put', record: foreign }]));
    const source = await store.get(profileId), before = JSON.stringify(source), bytes = await window.favoriteBackup.export(profileId);
    const receipt = await window.favoriteBackup.restore(bytes, PASS, RESTORED), destination = await store.get(receipt.newProfileId);
    const freshSession = value(await vault.unlock(receipt.newProfileId, RESTORED));
    const manager = value(window.favoriteAPI.createSavedReviewFavorites({ vault, session: freshSession }));
    const loaded = value(await manager.list()), rows = value(await vault.list(freshSession.sessionId)); manager.dispose(); vault.lockAll();
    return { newProfileId: receipt.newProfileId, sourceUnchanged: before === JSON.stringify(await store.get(profileId)),
      freshKey: source.keyId !== destination.keyId, freshSalt: source.wrappedKey.salt !== destination.wrappedKey.salt,
      freshWrapNonce: source.wrappedKey.nonce !== destination.wrappedKey.nonce, freshSnapshotNonce: source.snapshot.nonce !== destination.snapshot.nonce,
      recordIds: loaded.recordIds, revision: loaded.revision, foreignPreserved: JSON.stringify(rows.find(row => row.id === foreign.id)) === JSON.stringify(foreign) };
  }, { profileId, PASS, RESTORED });
  assert.notEqual(recovery.newProfileId, profileId); for (const key of ['sourceUnchanged', 'freshKey', 'freshSalt', 'freshWrapNonce', 'freshSnapshotNonce', 'foreignPreserved']) assert.equal(recovery[key], true, key);
  assert.deepEqual(recovery.recordIds, [recordId]); assert.equal(recovery.revision, 0);
  await unlock(recovery.newProfileId, RESTORED); await offers(); await loadFavorites();
  await page.locator('.favorite-list').getByRole('button', { name: favorite.open, exact: true }).click(); await page.waitForURL(/#\/trade\//);
  assert.ok((await page.locator('main').innerText()).includes('0.25 native')); await lock();

  // A missing favorite keeps only its ID. Loading cannot resurrect a deleted or newly unreviewable saved document.
  await page.evaluate(async ({ profileId, recordId, PASS }) => {
    const session = window.favoriteValue(await window.favoriteVault.unlock(profileId, PASS));
    window.favoriteValue(await window.favoriteVault.commit(session.sessionId, session.revision, [{ op: 'delete', id: recordId }])); window.favoriteVault.lockAll();
  }, { profileId, recordId, PASS });
  await unlock(profileId); await offers(); await loadFavorites(); await page.locator('.favorite-list').getByRole('button', { name: favorite.open, exact: true }).click();
  await page.getByText(favorite.unavailable, { exact: true }).waitFor(); assert.ok(page.url().endsWith('#/offers')); assert.equal(await page.locator('.session-list a[href^="#/trade/"]').count(), 0); await lock();
  await page.evaluate(async ({ profileId, recordId, PASS }) => {
    const session = window.favoriteValue(await window.favoriteVault.unlock(profileId, PASS));
    const record = { id: recordId, kind: 'trade', schemaVersion: 1, payload: window.favoriteSchemas.encodeSavedReviewPayload('file', new Uint8Array([1, 2, 3])) };
    window.favoriteValue(await window.favoriteVault.commit(session.sessionId, session.revision, [{ op: 'put', record }])); window.favoriteVault.lockAll();
  }, { profileId, recordId, PASS });
  await unlock(profileId); await offers(); await loadFavorites(); await page.locator('.favorite-list').getByRole('button', { name: favorite.open, exact: true }).click();
  await page.getByText(favorite.unavailable, { exact: true }).waitFor(); assert.equal(await page.locator('.session-list a[href^="#/trade/"]').count(), 0);
  await page.locator('.favorite-list').getByRole('button', { name: favorite.unstar, exact: true }).click(); await page.getByText(favorite.empty, { exact: true }).waitFor(); await lock();

  // Two actual documents/services detect a foreign commit only through native explicit freshness, with no retry.
  const other = await context.newPage(); other.on('pageerror', error => unexpected.push('PAGE_ERROR:' + error.message)); await other.goto(origin); await initializeNative(other);
  const before = await page.evaluate(async ({ profileId, PASS }) => {
    const session = window.favoriteValue(await window.favoriteVault.unlock(profileId, PASS));
    window.favoriteManager = window.favoriteValue(window.favoriteAPI.createSavedReviewFavorites({ vault: window.favoriteVault, session })); return window.favoriteValue(await window.favoriteManager.list());
  }, { profileId, PASS });
  await other.evaluate(async ({ profileId, PASS }) => {
    const session = window.favoriteValue(await window.favoriteVault.unlock(profileId, PASS));
    const manager = window.favoriteValue(window.favoriteAPI.createSavedReviewFavorites({ vault: window.favoriteVault, session }));
    const listed = window.favoriteValue(await manager.list()); window.favoriteValue(await manager.set('1'.repeat(32), false, listed.revision)); manager.dispose(); window.favoriteVault.lockAll();
  }, { profileId, PASS });
  const conflict = await page.evaluate(async ({ profileId, recordId, revision }) => {
    const before = JSON.stringify(await window.favoriteStore.get(profileId));
    const result = await window.favoriteManager.set(recordId, false, revision);
    return { result, stillLocked: !(await window.favoriteManager.list()).ok, unchanged: before === JSON.stringify(await window.favoriteStore.get(profileId)) };
  }, { profileId, recordId, revision: before.revision });
  assert.equal(conflict.result.ok, false); assert.equal(conflict.result.error.code, 'CONFLICT'); assert.equal(conflict.stillLocked, true); assert.equal(conflict.unchanged, true);
  const surfaces = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })); assert.deepEqual(surfaces, { local: 0, session: 0 }); assert.deepEqual(unexpected, []);
  for (const document of [page, other]) await document.evaluate(() => { window.favoriteManager?.dispose(); window.favoriteVault.dispose(); window.favoriteBackup.dispose(); window.favoriteStore.close(); });
  console.log(JSON.stringify({ fixture: 'T82-encrypted-saved-review-favorites', browser: browser.version(), actualUI: true, actualWorker: true, actualDocuments: 2,
    actualIndexedDB: true, nativeWebCrypto: true, encryptedReload: true, freshKeyBackupRestore: true, foreignPreservation: true,
    freshRegistryReviewOnOpen: true, controllerReplacementSuppressesHeldOpen: true, deletedAndUnreviewableUnavailable: true, noOpenWrite: true, nativeStaleCASRefusesWithoutRetry: true,
    nativeSubmissions: 0, unexpectedRequests: unexpected.length, tradingEnabled: false, releaseAcceptance: false })); await context.close();
} finally { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); } await rm(temporary, { recursive: true, force: true }); }
