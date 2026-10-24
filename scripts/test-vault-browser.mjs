/** Real Chromium/IndexedDB boundary tests. Only loopback is permitted; no wallet/network adapter exists here. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(resolve(tmpdir(), 'p2p-vault-browser-'));
let browser;
let server;
let recoveryServer;
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), [
    '--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions',
    '--rootDir', 'packages', '--outDir', output, 'packages/storage/src/vault-service.ts',
    'packages/storage/src/backup-service.ts',
  ], { cwd: root, stdio: 'inherit' });
  const handler = (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'");
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local vault test</title>'); return; }
    const target = resolve(output, `.${pathname}`);
    if (!target.startsWith(`${output}${sep}`) || !target.endsWith('.js')) { response.writeHead(404); response.end(); return; }
    void readFile(target).then((contents) => { response.setHeader('Content-Type', 'text/javascript'); response.end(contents); }, () => { response.writeHead(404); response.end(); });
  };
  server = createServer(handler);
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  recoveryServer = createServer(handler);
  await new Promise((resolveListen, reject) => { recoveryServer.once('error', reject); recoveryServer.listen(0, '127.0.0.1', resolveListen); });
  const recoveryAddress = recoveryServer.address();
  assert.ok(recoveryAddress && typeof recoveryAddress === 'object');
  const recoveryOrigin = `http://127.0.0.1:${recoveryAddress.port}`;
  browser = await chromium.launch({ executablePath: process.env.P2P_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const unexpected = [];
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  for (const page of pages) {
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await page.goto(origin);
    await page.evaluate(async () => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      window.testStore = new IndexedDbVaultStore();
      window.testService = new EncryptedVaultService(window.testStore, crypto, { lifecycle: false });
    });
  }
  const created = await pages[0].evaluate(() => window.testService.create('local browser fixture passphrase'));
  assert.equal(created.ok, true);
  const session = created.value;
  const opened = await pages[1].evaluate((profileId) => window.testService.unlock(profileId, 'local browser fixture passphrase'), session.profileId);
  assert.equal(opened.ok, true);
  const tokens = [session.sessionId, opened.value.sessionId];
  const results = await Promise.all(pages.map((page, index) => page.evaluate(({ token, index }) => window.testService.commit(token, 0, [
    { op: 'put', record: { id: 'a'.repeat(32), kind: 'preference', schemaVersion: 1, payload: index === 0 ? 'cHJpdmF0ZS1maXh0dXJl' : 'b3RoZXItZml4dHVyZQ' } },
  ]), { token: tokens[index], index })));
  assert.equal(results.filter((result) => result.ok).length, 1, 'one same-revision tab writer must win');
  assert.equal(results.find((result) => !result.ok)?.error.code, 'CONFLICT');
  const stored = await pages[0].evaluate((id) => window.testStore.get(id), session.profileId);
  assert.equal(stored.revision, 1);
  assert.doesNotMatch(JSON.stringify(stored), /private-fixture|other-fixture|cHJpdmF0ZS1maXh0dXJl|b3RoZXItZml4dHVyZQ|passphrase/);
  const checks = await pages[0].evaluate(async (id) => {
    const previous = await window.testStore.get(id);
    const next = structuredClone(previous); next.revision++;
    const wrong = structuredClone(previous);
    wrong.snapshot.ciphertext = `${wrong.snapshot.ciphertext[0] === 'A' ? 'B' : 'A'}${wrong.snapshot.ciphertext.slice(1)}`;
    let mismatch = ''; let cancelled = ''; let guards = 0;
    try { await window.testStore.compareAndSwap(wrong, next); } catch (error) { mismatch = error.code; }
    try { await window.testStore.compareAndSwap(previous, next, { assertCurrent: () => { if (++guards === 3) throw new Error('stale session'); } }); }
    catch (error) { cancelled = error.code; }
    return { mismatch, cancelled, guards, unchanged: JSON.stringify(await window.testStore.get(id)) === JSON.stringify(previous) };
  }, session.profileId);
  assert.deepEqual(checks, { mismatch: 'CONFLICT', cancelled: 'CANCELLED', guards: 3, unchanged: true });
  const reopened = await pages[0].evaluate(async ({ profileId, token }) => {
    window.testService.lock(token);
    const locked = await window.testService.list(token);
    const restored = await window.testService.unlock(profileId, 'local browser fixture passphrase');
    const records = restored.ok ? await window.testService.list(restored.value.sessionId) : restored;
    return { locked: locked.error?.code, restored, records };
  }, { profileId: session.profileId, token: session.sessionId });
  assert.equal(reopened.locked, 'LOCKED');
  assert.equal(reopened.restored.ok, true);
  assert.equal(reopened.records.ok, true);
  assert.equal(reopened.records.value.length, 1);
  // Same-origin recovery retains the healthy original and authenticates a separately keyed profile.
  const exported = await pages[0].evaluate(async ({ profileId, token }) => {
    const { EncryptedBackupService } = await import('/storage/src/backup-service.js');
    window.testBackup = new EncryptedBackupService(window.testStore);
    const source = await window.testStore.get(profileId);
    const records = await window.testService.list(token);
    const exported = await window.testBackup.exportWithStatus(profileId);
    const receipt = await window.testBackup.restore(exported.bytes, 'local browser fixture passphrase', 'fresh recovery browser passphrase');
    const restored = await window.testService.unlock(receipt.newProfileId, 'fresh recovery browser passphrase');
    if (!restored.ok) throw new Error('restored profile did not authenticate');
    const restoredRecords = await window.testService.list(restored.value.sessionId);
    const destination = await window.testStore.get(receipt.newProfileId);
    const sourceAfter = await window.testStore.get(profileId);
    return { bytes: Array.from(exported.bytes), authentication: exported.authentication, source, sourceAfter,
      receipt, destination, records, restoredRecords };
  }, { profileId: session.profileId, token: reopened.restored.value.sessionId });
  assert.equal(exported.authentication, 'not-checked');
  assert.deepEqual(exported.sourceAfter, exported.source, 'recovery never replaces the healthy source');
  assert.deepEqual(exported.restoredRecords, exported.records, 'record IDs/kinds/payload bytes remain historical and unchanged');
  assert.equal(exported.receipt.revision, 0);
  assert.equal(exported.destination.revision, 0);
  for (const field of ['profileId', 'keyId']) assert.notEqual(exported.destination[field], exported.source[field]);
  for (const field of ['salt', 'nonce', 'ciphertext']) {
    if (Object.hasOwn(exported.source.wrappedKey, field)) assert.notEqual(exported.destination.wrappedKey[field], exported.source.wrappedKey[field]);
  }
  assert.notEqual(exported.destination.snapshot.nonce, exported.source.snapshot.nonce);
  assert.notEqual(exported.destination.snapshot.ciphertext, exported.source.snapshot.ciphertext);
  // A second loopback origin starts without the source IndexedDB, then restores using only portable bytes.
  const fresh = await context.newPage();
  await fresh.route('**/*', route => {
    if (new URL(route.request().url()).origin === recoveryOrigin) return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  await fresh.goto(recoveryOrigin);
  const portable = await fresh.evaluate(async ({ bytes, sourceId }) => {
    const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
    const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
    const { EncryptedBackupService } = await import('/storage/src/backup-service.js');
    const store = new IndexedDbVaultStore(); const vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
    const backup = new EncryptedBackupService(store);
    const missingBefore = await store.get(sourceId) === undefined;
    const receipt = await backup.restore(new Uint8Array(bytes), 'local browser fixture passphrase', 'portable recovery browser passphrase');
    const opened = await vault.unlock(receipt.newProfileId, 'portable recovery browser passphrase');
    const records = opened.ok ? await vault.list(opened.value.sessionId) : opened;
    const sourceStillAbsent = await store.get(sourceId) === undefined;
    backup.dispose(); vault.dispose(); store.close();
    return { missingBefore, sourceStillAbsent, receipt, records };
  }, { bytes: exported.bytes, sourceId: session.profileId });
  assert.equal(portable.missingBefore, true); assert.equal(portable.sourceStillAbsent, true);
  assert.equal(portable.receipt.sourceProfileId, session.profileId);
  assert.notEqual(portable.receipt.newProfileId, exported.receipt.newProfileId);
  assert.deepEqual(portable.records, exported.records);
  await fresh.close();
  await pages[1].evaluate(() => new Promise((resolveUpgrade, reject) => {
    const request = indexedDB.open('p2p-offramp-vault', 2);
    request.onblocked = () => reject(new Error('existing adapters did not close on versionchange'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolveUpgrade(); };
  }));
  const future = await pages[0].evaluate(async ({ profileId, token }) => {
    const revoked = await window.testService.list(token);
    let futureVersion = '';
    try { await window.testStore.get(profileId); } catch (error) { futureVersion = error.code; }
    const databases = await indexedDB.databases();
    window.testBackup.dispose();
    window.testService.dispose();
    window.testStore.close();
    const disposed = await window.testService.unlock(profileId, 'local browser fixture passphrase');
    return { revoked: revoked.error?.code, futureVersion, version: databases.find((db) => db.name === 'p2p-offramp-vault')?.version, disposed: disposed.error?.code };
  }, { profileId: session.profileId, token: reopened.restored.value.sessionId });
  assert.deepEqual(future, { revoked: 'LOCKED', futureVersion: 'UNSUPPORTED_VERSION', version: 2, disposed: 'LOCKED' });
  assert.deepEqual(unexpected, []);
  await context.close();
  console.log('PASS: Chromium encrypted IndexedDB persistence, two-tab conflict, exact-ciphertext CAS, stale-session abort, lock/reopen, same/fresh-origin fresh-key backup restore, versionchange/disposal, no external egress.');
} finally {
  await browser?.close();
  if (recoveryServer) await new Promise((resolveClose) => recoveryServer.close(resolveClose));
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(output, { recursive: true, force: true });
}
