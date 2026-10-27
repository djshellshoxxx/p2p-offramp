/** G03 reseal under abrupt browser process kill (SIGKILL), then reopen the same on-disk profile. Loopback only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(resolve(tmpdir(), 'p2p-reseal-crash-'));
let server;
const sleep = ms => new Promise(done => setTimeout(done, ms));
function killProfile(dir) {
  // Every Chromium process launched for this exact user-data-dir; SIGKILL gives no shutdown hooks.
  // pkill exits 0 only when at least one process matched, so the caller can prove a real kill.
  try { execFileSync('pkill', ['-KILL', '-f', dir]); return true; } catch { return false; }
}
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), [
    '--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions',
    '--rootDir', 'packages', '--outDir', resolve(output, 'js'), 'packages/storage/src/migration-service.ts', 'packages/storage/src/vault-service.ts',
  ], { cwd: root, stdio: 'inherit' });
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'");
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Reseal crash fixture</title>'); return; }
    const target = resolve(output, 'js', `.${pathname}`);
    if (!target.startsWith(`${resolve(output, 'js')}${sep}`) || !target.endsWith('.js')) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(body => { response.setHeader('Content-Type', 'text/javascript'); response.end(body); }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const setup = async page => {
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin);
    await page.evaluate(async () => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const { MigrationRegistry, InternalMigrationResealer } = await import('/storage/src/migration-service.js');
      const schemas = [...['identity', 'preference', 'chat', 'journal'].map(kind => ({ kind, version: 1, validate: () => true })),
        { kind: 'trade', version: 1, validate: () => true }, { kind: 'trade', version: 2, validate: p => new TextDecoder().decode(p).endsWith('|v2') }];
      const registry = new MigrationRegistry({ identity: 1, preference: 1, trade: 2, chat: 1, journal: 1 }, schemas,
        [{ kind: 'trade', fromVersion: 1, toVersion: 2, migrate: p => new TextEncoder().encode(new TextDecoder().decode(p) + '|v2') }]);
      window.store = new IndexedDbVaultStore();
      window.vault = new EncryptedVaultService(window.store, crypto, { lifecycle: false });
      window.resealer = new InternalMigrationResealer(window.vault, new Map([['trade-v2', registry]]));
    });
  };
  const outcomes = [];
  for (const delay of [0, 200, 600, 1200, 3000]) {
    const dir = await mkdtemp(resolve(tmpdir(), 'p2p-reseal-profile-'));
    try {
      let context = await chromium.launchPersistentContext(dir, { executablePath: resolveChromiumPath(), args: ['--no-sandbox'], serviceWorkers: 'block' });
      let page = context.pages()[0] ?? await context.newPage(); await setup(page);
      const seed = await page.evaluate(async () => {
        const created = await window.vault.create('crash source passphrase');
        const revision = await window.vault.commit(created.value.sessionId, 0, [{ op: 'put', record: { id: '1'.repeat(32), kind: 'trade', schemaVersion: 1, payload: 'dHJhZGU' } }]);
        const source = await window.store.get(created.value.profileId);
        void window.resealer.migrateAndReseal({ sourceSessionId: created.value.sessionId, expectedKeyId: source.keyId,
          expectedRevision: revision.value, migrationId: 'trade-v2' }, 'crash destination passphrase');
        return { profileId: created.value.profileId, source: JSON.stringify(source) };
      });
      await sleep(delay); assert.equal(killProfile(dir), true, 'live Chromium processes were SIGKILLed'); await context.close().catch(() => undefined); await sleep(300);
      context = await chromium.launchPersistentContext(dir, { executablePath: resolveChromiumPath(), args: ['--no-sandbox'], serviceWorkers: 'block' });
      page = context.pages()[0] ?? await context.newPage(); await setup(page);
      const after = await page.evaluate(async seed => {
        const ids = (await window.vault.listProfiles()).value.profileIds;
        const sourceSame = JSON.stringify(await window.store.get(seed.profileId)) === seed.source;
        const reopened = await window.vault.unlock(seed.profileId, 'crash source passphrase');
        const others = [];
        for (const id of ids.filter(id => id !== seed.profileId)) {
          const opened = await window.vault.unlock(id, 'crash destination passphrase');
          const records = opened.ok ? (await window.vault.list(opened.value.sessionId)).value : null;
          others.push(opened.ok && records.length === 1 && records[0].schemaVersion === 2 && atob(records[0].payload) === 'trade|v2');
        }
        return { count: ids.length, sourceSame, sourceUnlocks: reopened.ok, othersComplete: others.every(Boolean) };
      }, seed);
      assert.equal(after.sourceSame, true, `source byte-identical after SIGKILL at ${delay}ms`);
      assert.equal(after.sourceUnlocks, true); assert.ok(after.count === 1 || after.count === 2, `count ${after.count}`);
      assert.equal(after.othersComplete, true, `no partial destination after SIGKILL at ${delay}ms`);
      outcomes.push(after.count === 2 ? 'copied' : 'absent');
      await context.close();
    } finally { killProfile(dir); await rm(dir, { recursive: true, force: true }); }
  }
  console.log(`PASS: G03 reseal under browser SIGKILL at 0/200/600/1200/3000 ms: ${outcomes.join(',')}; source byte-identical and unlockable, no partial destination. Chromium/Linux only.`);
} finally {
  if (server) await new Promise(done => server.close(done));
  await rm(output, { recursive: true, force: true });
}
