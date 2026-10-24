/** Native module runtime fixture, not a React/Vite build or physical-device acceptance. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(resolve(tmpdir(), 'p2p-runtime-browser-'));
let browser, server;
const policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'";
try {
  for (const [kind, file, lib] of [
    ['main', 'apps/web/src/runtime/app-runtime.ts', 'DOM'],
    ['worker', 'apps/web/src/workers/vault.worker.ts', 'WebWorker'],
  ]) {
    const config = resolve(output, `${kind}.json`);
    await writeFile(config, JSON.stringify({ compilerOptions: {
      target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
      noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, rewriteRelativeImportExtensions: true,
      rootDir: root, outDir: output, lib: ['ES2023', lib], types: [], skipLibCheck: false,
    }, files: [resolve(root, file)] }));
    execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['-p', config], { cwd: root, stdio: 'inherit' });
  }
  const bases = ['/ipfs/bafy-runtime/', '/nested/', '/'];
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', policy);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const base = bases.find(candidate => pathname.startsWith(candidate));
    const relative = base === undefined ? '' : pathname.slice(base.length);
    if (base !== undefined && relative === '') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local runtime fixture</title>'); return; }
    const target = resolve(output, relative);
    if (base === undefined || !target.startsWith(output + sep) || !target.endsWith('.js')) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(bytes => { response.setHeader('Content-Type', 'text/javascript'); response.end(bytes); }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const unexpected = [];
  let preservedProfile;
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  for (const base of ['/', '/nested/', '/ipfs/bafy-runtime/']) {
    const page = await context.newPage(); await page.goto(origin + base);
    const result = await page.evaluate(async base => {
      const { EncryptedVaultService } = await import(`${base}packages/storage/index.js`);
      const { AppRuntime } = await import(`${base}apps/web/src/runtime/app-runtime.js`);
      const creator = new EncryptedVaultService(undefined, crypto, { lifecycle: false });
      const created = await creator.create('runtime browser fixture passphrase');
      if (!created.ok) throw new Error(created.error.code);
      const record = { id: 'a'.repeat(32), kind: 'trade', schemaVersion: 1, payload: btoa('historical runtime fixture').replace(/=+$/, '') };
      const committed = await creator.commit(created.value.sessionId, 0, [{ op: 'put', record }]);
      if (!committed.ok) throw new Error(committed.error.code);
      creator.dispose();
      const observations = { workers: [], operations: [], secretReply: false };
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options); observations.workers.push({ url: String(url), type: options?.type });
          this.addEventListener('message', event => { if (/passphrase|secretKey|sessionId|private-records|historical runtime fixture/.test(JSON.stringify(event.data))) observations.secretReply = true; });
        }
        postMessage(message, transfer) { observations.operations.push(message.operation); if (transfer === undefined) super.postMessage(message); else super.postMessage(message, transfer); }
      };
      const started = await AppRuntime.start({ version: 1, ReleaseEnabled: 0, connectOrigins: [] });
      if (!started.ok) throw new Error(started.error.code);
      const runtime = started.value; const initiallyLocked = runtime.current.state === 'locked';
      const opened = await runtime.unlock(created.value.profileId, 'runtime browser fixture passphrase');
      if (!opened.ok) throw new Error(opened.error.code);
      const handle = opened.value, exact = runtime.isCurrent(handle), cloned = runtime.isCurrent({ ...handle });
      const exported = await runtime.exportEncrypted(created.value.profileId);
      if (!exported.ok) throw new Error(exported.error.code);
      const restored = await runtime.restore(exported.value.bytes, 'runtime browser fixture passphrase', 'runtime browser restore passphrase');
      if (!restored.ok) throw new Error(restored.error.code);
      const stillCurrent = runtime.isCurrent(handle);
      const lock = runtime.lock(), revokedSynchronously = !runtime.isCurrent(handle); await lock;
      const fresh = await runtime.create('runtime browser create passphrase');
      if (!fresh.ok) throw new Error(fresh.error.code);
      const freshCurrent = runtime.isCurrent(fresh.value);
      const listed = await runtime.listProfiles();
      if (!listed.ok) throw new Error(listed.error.code);
      await runtime.lock();
      const pending = runtime.unlock(created.value.profileId, 'runtime browser fixture passphrase');
      const closing = runtime.dispose(); const late = await pending; await closing;
      const afterDispose = await runtime.status(); window.Worker = NativeWorker;
      const reader = new EncryptedVaultService(undefined, crypto, { lifecycle: false });
      const preserved = await reader.unlock(created.value.profileId, 'runtime browser fixture passphrase');
      const records = preserved.ok ? await reader.list(preserved.value.sessionId) : preserved;
      const copy = await reader.unlock(restored.value.newProfileId, 'runtime browser restore passphrase');
      const copyRecords = copy.ok ? await reader.list(copy.value.sessionId) : copy;
      reader.dispose();
      return { observations, initiallyLocked, exact, cloned, revokedSynchronously,
        exported: { size: exported.value.bytes.byteLength, authentication: exported.value.authentication },
        lateCode: late.ok ? 'unexpected-success' : late.error.code,
        disposedCode: afterDispose.ok ? 'unexpected-success' : afterDispose.error.code,
        recordsPreserved: records.ok && JSON.stringify(records.value) === JSON.stringify([record]),
        restoredCopy: copyRecords.ok && JSON.stringify(copyRecords.value) === JSON.stringify([record]) && restored.value.records === 1 &&
          restored.value.newProfileId !== created.value.profileId,
        stillCurrent, freshCurrent, freshDistinct: fresh.value.profileId !== created.value.profileId,
        listed: [created.value.profileId, restored.value.newProfileId, fresh.value.profileId].every(id => listed.value.profileIds.includes(id)),
        profileId: created.value.profileId, localStorageEntries: localStorage.length, caches: await caches.keys(), href: location.href };
    }, base);
    assert.equal(result.initiallyLocked, true); assert.equal(result.exact, true); assert.equal(result.cloned, false);
    assert.equal(result.revokedSynchronously, true); assert.equal(result.disposedCode, 'LOCKED');
    assert.ok(['LOCKED', 'CANCELLED'].includes(result.lateCode));
    assert.equal(result.exported.authentication, 'not-checked'); assert.ok(result.exported.size > 0);
    assert.equal(result.recordsPreserved, true); assert.equal(result.restoredCopy, true);
    assert.equal(result.stillCurrent, true); assert.equal(result.freshCurrent, true); assert.equal(result.freshDistinct, true); assert.equal(result.listed, true); assert.equal(result.observations.workers.length, 1);
    assert.equal(result.observations.workers[0].type, 'module');
    assert.equal(new URL(result.observations.workers[0].url).origin, origin);
    assert.equal(result.observations.secretReply, false); assert.equal(result.localStorageEntries, 0);
    assert.deepEqual(result.caches, []); assert.equal(result.href, origin + base);
    preservedProfile ??= result.profileId;
    await page.close();
  }
  for (const mode of ['missing-worker-chunk', 'modeled-denied-idb']) {
    const page = await context.newPage();
    await page.route('**/vault.worker.js', async route => {
      if (mode === 'missing-worker-chunk') return route.abort('failed');
      const source = await readFile(resolve(output, 'apps/web/src/workers/vault.worker.js'), 'utf8');
      return route.fulfill({ status: 200, contentType: 'text/javascript', headers: {
        'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff',
      }, body: `Object.defineProperty(globalThis, 'indexedDB', { value: undefined });\n${source}` });
    });
    await page.goto(origin + '/');
    const result = await page.evaluate(async profileId => {
      const { AppRuntime } = await import('/apps/web/src/runtime/app-runtime.js');
      const { EncryptedVaultService } = await import('/packages/storage/index.js');
      const started = await AppRuntime.start({ version: 1, ReleaseEnabled: 0, connectOrigins: [] });
      if (started.ok) await started.value.dispose();
      const reader = new EncryptedVaultService(undefined, crypto, { lifecycle: false });
      const opened = await reader.unlock(profileId, 'runtime browser fixture passphrase'); reader.dispose();
      return { code: started.ok ? 'unexpected-success' : started.error.code, sourcePreserved: opened.ok };
    }, preservedProfile);
    assert.equal(result.code, mode === 'missing-worker-chunk' ? 'STORAGE_UNAVAILABLE' : 'UNSUPPORTED_ENVIRONMENT');
    assert.equal(result.sourcePreserved, true); await page.close();
  }
  assert.deepEqual(unexpected, []); await context.close();
  console.log('PASS: Chromium same-origin module Worker at root/nested/IPFS-style paths, locked boot, native encrypted unlock/export/create/restore/inventory, exact opaque handles, synchronous revocation, pending-unlock disposal, missing chunk/modeled denied-IDB recovery, preserved source, no private replies/localStorage/cache/URL or external egress. Native fixture only; React/Vite/device acceptance remains open.');
} finally {
  await browser?.close(); if (server) await new Promise(done => server.close(done));
  await rm(output, { recursive: true, force: true });
}
