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
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), [
    '--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions',
    '--rootDir', 'packages', '--outDir', output, 'packages/storage/src/vault-service.ts',
  ], { cwd: root, stdio: 'inherit' });
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'");
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local vault test</title>'); return; }
    const target = resolve(output, `.${pathname}`);
    if (!target.startsWith(`${output}${sep}`) || !target.endsWith('.js')) { response.writeHead(404); response.end(); return; }
    void readFile(target).then((contents) => { response.setHeader('Content-Type', 'text/javascript'); response.end(contents); }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
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
    window.testService.dispose();
    window.testStore.close();
    const disposed = await window.testService.unlock(profileId, 'local browser fixture passphrase');
    return { revoked: revoked.error?.code, futureVersion, version: databases.find((db) => db.name === 'p2p-offramp-vault')?.version, disposed: disposed.error?.code };
  }, { profileId: session.profileId, token: reopened.restored.value.sessionId });
  assert.deepEqual(future, { revoked: 'LOCKED', futureVersion: 'UNSUPPORTED_VERSION', version: 2, disposed: 'LOCKED' });
  assert.deepEqual(unexpected, []);
  await context.close();
  console.log('PASS: Chromium encrypted IndexedDB persistence, two-tab conflict, exact-ciphertext CAS, stale-session abort, lock/reopen, versionchange/disposal, no external egress.');
} finally {
  await browser?.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(output, { recursive: true, force: true });
}
