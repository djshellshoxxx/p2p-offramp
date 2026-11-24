/**
 * Deleted-review recovery through the emitted demo UI, native module Worker and real IndexedDB.
 * Retains a disk-backed Chromium userDataDir across complete browser closes; never imports storageState,
 * substitutes storage/crypto, or restores any browser fixture state. All records and passphrases are synthetic.
 * Optional P2P_RECOVERY_EVIDENCE_DIR receives the bounded result and screenshots, never backup/key material.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { freshCoreNativeDocument } from '../apps/web/src/demo/synthetic-local.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-review-recovery-'));
const userDataDir = resolve(temporary, 'browser-profile');
const backupPath = resolve(temporary, 'older-backup.json');
const evidenceDir = process.env.P2P_RECOVERY_EVIDENCE_DIR ? resolve(process.env.P2P_RECOVERY_EVIDENCE_DIR) : null;
const sourcePassphrase = 'synthetic source saved review recovery passphrase';
const destinationPassphrase = 'synthetic restored saved review recovery passphrase';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const unexpected = [], launches = [], checkpoints = [];
let context, page, server, origin, browserVersion;
const checkpoint = name => { checkpoints.push(name); console.log(`PASS ${name}`); };

async function launch(profileDirectory = userDataDir) {
  context = await chromium.launchPersistentContext(profileDirectory, {
    executablePath: resolveChromiumPath(), args: ['--no-sandbox'], headless: true,
    acceptDownloads: true, serviceWorkers: 'block', viewport: { width: 1440, height: 1050 },
  });
  context.setDefaultTimeout(30_000);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
  });
  // Passive observation only: native Workers still receive and execute all unmodified UI requests.
  // Copy successful list bytes synchronously, before the application consumes/wipes transferred buffers.
  await context.addInitScript(() => {
    window.__savedReviewRecovery = { workers: [], responses: [] };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        window.__savedReviewRecovery.workers.push({ url: String(args[0]), type: args[1]?.type });
        this.addEventListener('message', ({ data }) => {
          if (!['saveTermsReview', 'listTermsReviews', 'deleteTermsReview', 'restore', 'unlock'].includes(data?.operation) || !data?.result) return;
          const entry = { operation: data.operation, ok: data.result.ok };
          if (!data.result.ok) entry.error = data.result.error?.code;
          else if (data.operation === 'listTermsReviews') entry.value = {
            skipped: data.result.value.skipped,
            items: data.result.value.items.map(item => ({ recordId: item.recordId, source: item.source, bytes: Array.from(item.bytes) })),
          };
          else if (data.operation !== 'unlock') entry.value = structuredClone(data.result.value);
          window.__savedReviewRecovery.responses.push(entry);
        });
      }
    };
  });
  page = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', error => unexpected.push(`PAGE_ERROR: ${error.message}`));
  page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  const cdp = await context.browser().newBrowserCDPSession();
  browserVersion = (await cdp.send('Browser.getVersion')).product;
  const processes = (await cdp.send('SystemInfo.getProcessInfo')).processInfo;
  const pid = processes.find(item => item.type === 'browser')?.id;
  assert.ok(Number.isSafeInteger(pid));
  assert.ok(!launches.some(item => item.pid === pid), 'a relaunch must use a different browser process');
  launches.push({ pid, profile: profileDirectory === userDataDir ? 'retained' : 'clean' });
  await cdp.detach();
  await page.goto(origin + '/#/offers');
  await page.getByText('Vault locked', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Refresh vault status', exact: true }).waitFor();
  await page.getByText('Unlock a profile to save reviews or load saved ones.', { exact: true }).waitFor();
  assert.equal(await page.locator('.session-list li').count(), 0, 'a cold start exposes no reviews');
  const workers = await page.evaluate(() => window.__savedReviewRecovery.workers);
  assert.ok(workers.some(worker => /\/assets\/vault\.worker-[^/]+\.js$/.test(worker.url) && worker.type === 'module'), 'emitted native module Worker is running');
}

async function closeBrowser() {
  const closed = context;
  context = undefined;
  await closed.close(); // Playwright closes the browser for a persistent context.
  const pid = launches.at(-1).pid;
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'old browser process must actually exit');
}
async function restart() { await closeBrowser(); await launch(); }
async function offers() {
  await page.getByRole('link', { name: 'Offers', exact: true }).click();
  await page.getByRole('heading', { level: 2, name: 'Saved in this profile', exact: true }).waitFor();
}
async function lock() {
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await page.getByText('Vault locked', { exact: true }).waitFor();
}
async function unlock(profileId, passphrase, expected = true) {
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
  const form = page.getByRole('form', { name: 'Unlock existing profile', exact: true });
  await form.getByLabel('Profile ID', { exact: true }).fill(profileId);
  await form.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await form.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
  if (expected) await page.getByText('Vault unlocked', { exact: true }).waitFor();
  else {
    await form.getByRole('alert').waitFor();
    await page.getByText('Vault locked', { exact: true }).waitFor();
    assert.equal((await lastResponse('unlock')).ok, false);
    assert.equal((await lastResponse('unlock')).error, 'AUTHENTICATION_FAILED');
    assert.equal(await form.getByLabel('Passphrase', { exact: true }).inputValue(), '');
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
}
async function lastResponse(operation) {
  return page.evaluate(op => window.__savedReviewRecovery.responses.filter(item => item.operation === op).at(-1), operation);
}
async function load(expectedItems) {
  await offers();
  assert.equal(await page.locator('.session-list li').count(), 0, 'nothing auto-loads after unlock or profile switch');
  const previousReplies = await page.evaluate(() => window.__savedReviewRecovery.responses.filter(item => item.operation === 'listTermsReviews').length);
  await page.getByRole('button', { name: 'Load saved reviews', exact: true }).click();
  await page.waitForFunction(count => window.__savedReviewRecovery.responses.filter(item => item.operation === 'listTermsReviews').length > count, previousReplies);
  await page.getByRole('status').filter({ hasText: 'Saved reviews loaded and checked again.' }).waitFor();
  const reply = await lastResponse('listTermsReviews');
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.value, { items: expectedItems, skipped: 0 }, 'exact persisted record identity, source and bytes');
  assert.equal(await page.locator('.session-list li').count(), expectedItems.length, 're-reviewed records are visible in UI');
  if (expectedItems.length) await page.locator('.session-list li').getByText('(Saved in profile)', { exact: true }).waitFor();
}
async function vaultRows() {
  return page.evaluate(() => new Promise((done, fail) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onupgradeneeded = () => { request.transaction.abort(); fail(new Error('Expected existing vault database')); };
    request.onerror = () => fail(new Error('Cannot read vault database'));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('vaults', 'readonly');
      const all = tx.objectStore('vaults').getAll();
      tx.oncomplete = () => { db.close(); done(all.result); };
      tx.onabort = tx.onerror = () => { db.close(); fail(new Error('Cannot read vault rows')); };
    };
  }));
}
async function sourceUnchanged(profileId, envelopeText) {
  const row = (await vaultRows()).find(item => item.profileId === profileId);
  assert.equal(JSON.stringify(row), envelopeText, 'source post-deletion encrypted envelope is byte-identical');
}
async function restoreBackup() {
  await page.getByRole('link', { name: 'Recovery', exact: true }).click();
  const form = page.getByRole('form', { name: 'Restore an encrypted file', exact: true });
  await form.getByLabel('Encrypted backup file', { exact: true }).setInputFiles(backupPath);
  await form.getByLabel('Backup passphrase', { exact: true }).fill(sourcePassphrase);
  await form.getByLabel('New passphrase', { exact: true }).fill(destinationPassphrase);
  await form.getByLabel('Confirm new passphrase', { exact: true }).fill(destinationPassphrase);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
  const status = form.getByRole('status').filter({ hasText: 'Restored as a new locked profile' });
  await status.waitFor();
  const receipt = await lastResponse('restore');
  assert.equal(receipt.ok, true);
  assert.equal(receipt.value.records, 1);
  assert.equal(receipt.value.revision, 0);
  assert.ok((await status.innerText()).includes(receipt.value.newProfileId));
  return receipt.value;
}
async function screenshot(name) {
  if (evidenceDir) await page.screenshot({ path: resolve(evidenceDir, name), fullPage: true });
}

try {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const out = resolve(temporary, 'demo');
  const build = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(build.syntheticDemo, true); assert.equal(build.ReleaseEnabled, 0);
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
  origin = `http://127.0.0.1:${server.address().port}`;
  await launch();

  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
  await page.getByLabel('New passphrase', { exact: true }).fill(sourcePassphrase);
  await page.getByLabel('Confirm new passphrase', { exact: true }).fill(sourcePassphrase);
  await page.getByLabel(/no passphrase reset/).check();
  await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
  const created = page.getByRole('status').filter({ hasText: 'was created and unlocked' }); await created.waitFor();
  const sourceId = /Profile ([0-9a-f]{32}) was created/.exec(await created.innerText())?.[1]; assert.ok(sourceId);
  const reviewBytes = Buffer.from(await freshCoreNativeDocument(BigInt(Math.floor(Date.now() / 1000))));
  await offers();
  await page.getByLabel('Trade-terms file (JSON, at most 64 KiB)', { exact: true }).setInputFiles({ name: 'synthetic-terms.json', mimeType: 'application/json', buffer: reviewBytes });
  await page.getByRole('button', { name: 'Check terms', exact: true }).click();
  await page.waitForURL(/#\/trade\//);
  await offers();
  await page.getByRole('button', { name: 'Save to profile', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved in the open profile.' }).waitFor();
  const saved = await lastResponse('saveTermsReview'); assert.equal(saved.ok, true);
  const expectedItems = [{ recordId: saved.value.recordId, source: 'file', bytes: Array.from(reviewBytes) }];
  const sourceBeforeDeletion = (await vaultRows()).find(item => item.profileId === sourceId); assert.ok(sourceBeforeDeletion);
  assert.doesNotMatch(JSON.stringify(sourceBeforeDeletion), /SYNTHETIC demo instructions|local-terms-review|saved-terms-review/, 'review is encrypted at rest');

  await page.getByRole('link', { name: 'Recovery', exact: true }).click();
  const exportForm = page.getByRole('form', { name: 'Export an encrypted file', exact: true });
  await exportForm.getByLabel('Profile ID', { exact: true }).fill(sourceId);
  await exportForm.getByRole('checkbox').check();
  const downloadPromise = page.waitForEvent('download');
  await exportForm.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
  const download = await downloadPromise; await download.saveAs(backupPath); assert.equal(await download.failure(), null);
  const backup = await readFile(backupPath), backupDigest = sha256(backup);
  assert.deepEqual(JSON.parse(backup).envelope, sourceBeforeDeletion);
  checkpoint('save-and-real-backup-download');

  await restart();
  await unlock(sourceId, sourcePassphrase); await load(expectedItems);
  checkpoint('saved-review-survives-full-browser-restart');
  await page.getByRole('button', { name: 'Delete from profile', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Deleted from the open profile.' }).waitFor();
  assert.equal(await page.locator('.session-list li').count(), 0);
  const sourceAfterDeletion = (await vaultRows()).find(item => item.profileId === sourceId);
  const sourceAfterDeletionText = JSON.stringify(sourceAfterDeletion);
  assert.equal(sourceAfterDeletion.revision, sourceBeforeDeletion.revision + 1);
  assert.notEqual(sourceAfterDeletionText, JSON.stringify(sourceBeforeDeletion));
  await restart();
  await sourceUnchanged(sourceId, sourceAfterDeletionText);
  await unlock(sourceId, sourcePassphrase); await load([]);
  checkpoint('acknowledged-deletion-survives-full-browser-restart');

  const restored = await restoreBackup();
  assert.notEqual(restored.newProfileId, sourceId);
  assert.notEqual(restored.newKeyId, sourceAfterDeletion.keyId);
  const restoredRow = (await vaultRows()).find(item => item.profileId === restored.newProfileId);
  assert.equal(restoredRow.keyId, restored.newKeyId); assert.equal(restoredRow.revision, 0);
  await sourceUnchanged(sourceId, sourceAfterDeletionText);
  assert.equal((await vaultRows()).length, 2);
  await lock();
  await unlock(restored.newProfileId, sourcePassphrase, false);
  await unlock(restored.newProfileId, destinationPassphrase); await load(expectedItems);
  await screenshot('restored-review-before-restart.png');
  checkpoint('older-backup-restores-exact-review-to-new-keyed-profile');

  await restart();
  await sourceUnchanged(sourceId, sourceAfterDeletionText);
  assert.deepEqual((await vaultRows()).find(item => item.profileId === restored.newProfileId), restoredRow);
  await unlock(restored.newProfileId, destinationPassphrase); await load(expectedItems);
  await screenshot('restored-review-after-restart.png');
  checkpoint('restored-profile-survives-full-browser-restart');
  await lock(); await unlock(sourceId, sourcePassphrase); await load([]);
  await sourceUnchanged(sourceId, sourceAfterDeletionText);
  await screenshot('original-profile-remains-empty.png');
  checkpoint('source-still-empty-after-destination-reopen');

  await page.reload();
  await page.getByText('Vault locked', { exact: true }).waitFor();
  assert.equal(await page.locator('.session-list li').count(), 0);
  await unlock(restored.newProfileId, destinationPassphrase); await load(expectedItems);
  await sourceUnchanged(sourceId, sourceAfterDeletionText);
  assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
  checkpoint('reload-locks-and-explicit-load-recovers-destination');

  // A separate, empty browser user-data directory can restore the downloaded file without source IndexedDB.
  await closeBrowser();
  await launch(resolve(temporary, 'clean-browser-profile'));
  const cleanDatabases = await page.evaluate(async () => (await indexedDB.databases()).map(item => item.name));
  if (cleanDatabases.includes('p2p-offramp-vault')) assert.deepEqual(await vaultRows(), []);
  const cleanRestore = await restoreBackup();
  assert.notEqual(cleanRestore.newProfileId, sourceId);
  assert.notEqual(cleanRestore.newProfileId, restored.newProfileId);
  assert.equal((await vaultRows()).length, 1);
  await unlock(cleanRestore.newProfileId, destinationPassphrase); await load(expectedItems);
  checkpoint('download-restores-in-clean-browser-profile-without-source-database');
  await closeBrowser();
  await launch();
  await sourceUnchanged(sourceId, sourceAfterDeletionText);
  assert.equal((await vaultRows()).length, 2, 'clean-profile restore cannot modify original browser storage');
  await unlock(sourceId, sourcePassphrase); await load([]);
  await lock(); await unlock(restored.newProfileId, destinationPassphrase); await load(expectedItems);
  assert.deepEqual(await readFile(backupPath), backup);
  assert.equal(sha256(await readFile(backupPath)), backupDigest);
  assert.deepEqual(unexpected, []);
  checkpoint('final-source-destination-and-original-backup-integrity');

  const result = {
    fixture: 'deleted-saved-review-disk-persistence', passed: true,
    productHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    productTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(),
    runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    browser: browserVersion, node: process.version, platform: process.platform,
    browserLaunches: launches, retainedProfileRestarts: launches.filter(item => item.profile === 'retained').length - 1,
    originUnchanged: true, nativeWorker: true, realIndexedDB: true, storageMocks: false, storageStateInjection: false,
    sourceProfileId: sourceId, restoredProfileId: restored.newProfileId, savedReviewRecordId: saved.value.recordId,
    reviewBytes: reviewBytes.length, reviewSha256: sha256(reviewBytes), originalBackupSha256: backupDigest,
    sourceAfterDeletionSha256: sha256(sourceAfterDeletionText), restoredEnvelopeSha256: sha256(JSON.stringify(restoredRow)),
    sourceRevision: sourceAfterDeletion.revision, destinationRevision: restoredRow.revision,
    wrongDestinationPassphraseRefused: true, cleanBrowserRestore: true, checkpoints,
    unexpectedRequestsOrErrors: unexpected.length, ReleaseEnabled: 0, releaseAcceptance: false,
    limitations: ['Chromium on Linux only', 'orderly process restarts, not power-loss/crash simulation', 'synthetic local demo build, not deployed release'],
  };
  if (evidenceDir) await writeFile(resolve(evidenceDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} catch (error) {
  if (evidenceDir && page && !page.isClosed()) await screenshot('failure.png').catch(() => {});
  throw error;
} finally {
  await context?.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
