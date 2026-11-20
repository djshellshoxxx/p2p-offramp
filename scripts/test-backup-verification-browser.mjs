/** Actual emitted offline app, native module Worker and IndexedDB; synthetic local profiles only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-backup-verification-'));
const passphrase = 'synthetic complete backup browser passphrase';
const destinationPassphrase = 'synthetic fresh profile browser passphrase';
const unexpected = [];
let browser, server;
try {
  const out = resolve(temporary, 'app'), evidence = await buildWeb({ outDir: out });
  assert.equal(evidence.ReleaseEnabled, 0);
  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const target = resolve(out, path === '/' ? 'index.html' : '.' + path);
    if (!target.startsWith(out + sep) || !/\.(?:html|js|css|json)$/.test(target)) {
      response.writeHead(404); response.end(); return;
    }
    void readFile(target).then(bytes => {
      response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ?
        'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json'); response.end(bytes);
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
  await context.addInitScript(() => {
    window.__backupObservation = { operations: [], walletPrompts: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message, ...args) {
        if (message?.operation === 'verifyBackup' || message?.operation === 'checkBackupVerification')
          window.__backupObservation.operations.push(message.operation);
        return super.postMessage(message, ...args);
      }
    };
    const denied = async () => { window.__backupObservation.walletPrompts++; throw Error('FIXTURE_WALLET_DENIED'); };
    window.ethereum = { request: denied, enable: denied };
    window.solana = { connect: denied, signTransaction: denied, signMessage: denied };
  });
  const page = await context.newPage(); page.setDefaultTimeout(30_000);
  page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  page.on('dialog', dialog => { unexpected.push('DIALOG'); void dialog.dismiss(); });
  await page.goto(origin + '/#/home');
  await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
  await page.getByLabel('New passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('Confirm new passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel(/no passphrase reset/).check();
  await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
  const created = page.getByRole('status').filter({ hasText: 'was created and unlocked' }); await created.waitFor();
  const sourceId = /Profile ([0-9a-f]{32}) was created/.exec(await created.innerText())?.[1]; assert.ok(sourceId);
  const recovery = () => page.getByRole('link', { name: 'Recovery', exact: true }).click();
  const panel = () => page.getByRole('region', { name: 'Authenticate a backup file against this profile', exact: true });
  const recheck = () => panel().getByRole('button', { name: 'Recheck verified revision', exact: true });
  const result = id => panel().getByText(new RegExp(`Backup file authenticated against profile ${id}, revision`));
  const absent = () => panel().getByText('No authenticated backup verification is held for this profile selection.', { exact: true });
  const lock = async () => {
    await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
    await page.getByText('Vault locked', { exact: true }).waitFor();
  };
  const unlock = async (id, secret) => {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Profile ID', { exact: true }).fill(id);
    await page.getByLabel('Passphrase', { exact: true }).fill(secret);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click();
    await page.getByText('Vault unlocked', { exact: true }).waitFor(); await recovery();
  };
  const downloadBackup = async id => {
    const form = page.getByRole('form', { name: 'Export an encrypted file', exact: true });
    await form.getByLabel('Profile ID', { exact: true }).fill(id);
    await form.getByRole('checkbox').check();
    const waiting = page.waitForEvent('download');
    await form.getByRole('button', { name: 'Download unchecked encrypted backup', exact: true }).click();
    const download = await waiting; return readFile(await download.path());
  };
  const verify = async (bytes, secret) => {
    await panel().getByLabel('Backup file to authenticate', { exact: true }).setInputFiles({
      name: 'synthetic-backup.json', mimeType: 'application/json', buffer: bytes,
    });
    await panel().getByLabel('Passphrase for this backup file', { exact: true }).fill(secret);
    await panel().getByRole('button', { name: 'Verify this backup file', exact: true }).click();
  };
  await recovery();
  assert.deepEqual(await page.evaluate(() => window.__backupObservation.operations), [], 'navigation does not authenticate or recheck');
  await recheck().click(); await absent().waitFor();
  const backup = await downloadBackup(sourceId);
  await recheck().click(); await absent().waitFor();
  await verify(backup, passphrase); await result(sourceId).waitFor();
  assert.equal(await panel().getByLabel('Passphrase for this backup file', { exact: true }).inputValue(), '');
  assert.equal(await panel().getByLabel('Backup file to authenticate', { exact: true }).inputValue(), '');
  const digest = createHash('sha256').update(backup).digest('hex');
  assert.ok((await panel().innerText()).includes(digest), 'the visible digest describes the exact authenticated file');
  await recheck().click(); await result(sourceId).waitFor();
  await verify(backup, 'different synthetic passphrase'); await panel().getByRole('alert').waitFor();
  assert.equal(await result(sourceId).count(), 0);
  await recheck().click(); await absent().waitFor();
  await verify(backup, passphrase); await result(sourceId).waitFor(); await lock();
  assert.equal(await result(sourceId).count(), 0); assert.ok(await recheck().isDisabled());
  await unlock(sourceId, passphrase); await recheck().click(); await absent().waitFor();
  // Fresh-key restore creates another local profile. Its file must be exported and authenticated independently.
  const restore = page.getByRole('form', { name: 'Restore an encrypted file', exact: true });
  await restore.getByLabel('Encrypted backup file', { exact: true }).setInputFiles({
    name: 'source-backup.json', mimeType: 'application/json', buffer: backup,
  });
  await restore.getByLabel('Backup passphrase', { exact: true }).fill(passphrase);
  await restore.getByLabel('New passphrase', { exact: true }).fill(destinationPassphrase);
  await restore.getByLabel('Confirm new passphrase', { exact: true }).fill(destinationPassphrase);
  await restore.getByRole('checkbox').check(); await restore.getByRole('button', { name: 'Restore as new profile', exact: true }).click();
  const restored = restore.getByRole('status').filter({ hasText: 'Restored as a new locked profile' }); await restored.waitFor();
  const destinationId = /Restored as a new locked profile ([0-9a-f]{32})/.exec(await restored.innerText())?.[1];
  assert.ok(destinationId); assert.notEqual(destinationId, sourceId);
  await lock(); await unlock(destinationId, destinationPassphrase); await recheck().click(); await absent().waitFor();
  await verify(backup, passphrase); await panel().getByRole('alert').waitFor();
  assert.equal(await result(destinationId).count(), 0);
  const destinationBackup = await downloadBackup(destinationId);
  await verify(destinationBackup, destinationPassphrase); await result(destinationId).waitFor();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `layout at ${width}px`);
  }
  const operations = await page.evaluate(() => window.__backupObservation.operations);
  assert.equal(operations.filter(value => value === 'verifyBackup').length, 5);
  assert.equal(await page.evaluate(() => window.__backupObservation.walletPrompts), 0);
  await page.reload(); await panel().getByText(/Unlock the matching local profile/).waitFor();
  assert.equal(await result(destinationId).count(), 0); assert.ok(await recheck().isDisabled());
  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ fixture: 'native-worker-backup-verification-ui', browser: browser.version(),
    actualFileAuthenticated: true, displayedDigestMatched: true, explicitRecheck: true, wrongPassphraseRefused: true,
    lockAndReloadClear: true, restoredProfileRequiresOwnBackup: true, responsiveWidths: [320, 768, 1440],
    ReleaseEnabled: 0, walletPrompts: 0 }));
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
