/** Finite LOCAL module proof in two actual Chromium documents, IndexedDB and native WebCrypto. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from '../../../scripts/lib/chromium-path.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url)), output = await mkdtemp(resolve(tmpdir(), 'p2p-local-controls-'));
let browser, server;
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions', '--lib', 'ES2023,DOM',
    '--rootDir', 'packages', '--outDir', output, 'packages/privacy-controls/index.ts', 'packages/storage/src/vault-service.ts'], { cwd: root, stdio: 'inherit' });
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'");
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local privacy controls proof</title>'); return; }
    const path = resolve(output, '.' + pathname);
    if (!path.startsWith(output + sep) || !path.endsWith('.js')) { response.writeHead(404); response.end(); return; }
    void readFile(path).then(bytes => { response.setHeader('Content-Type', 'text/javascript'); response.end(bytes); }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' }), unexpected = [], pages = await Promise.all([context.newPage(), context.newPage()]);
  for (const page of pages) { await page.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); unexpected.push(route.request().url()); return route.abort(); }); await page.goto(origin); }
  const initialize = async page => page.evaluate(async () => {
    const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js'), { EncryptedVaultService } = await import('/storage/src/vault-service.js');
    window.controls = await import('/privacy-controls/index.js'); window.schemas = await import('/schemas/index.js');
    window.store = new IndexedDbVaultStore(); window.vault = new EncryptedVaultService(window.store); window.ownerCurrent = true;
  });
  await Promise.all(pages.map(initialize));
  const created = await pages[0].evaluate(async () => {
    const value = result => { if (!result.ok) throw Error(result.error.code); return result.value; };
    window.normal = value(await window.vault.create('T59 normal browser fixture passphrase'));
    value(await window.vault.commit(window.normal.sessionId, 0, [{ op: 'put', record: { id: 'aa'.repeat(16), kind: 'preference', schemaVersion: 9, payload: window.schemas.encodeBase64url(new TextEncoder().encode('foreign future preference')) } }]));
    const made = value(await window.controls.createDecoyProfile(window.vault, 'T59 decoy browser fixture passphrase')); if (!made.initialized) throw Error('DECOY_UNINITIALIZED');
    window.decoy = made.decoy; window.controller = value(window.controls.createDuressController({ vault: window.vault, normalSession: window.normal, isCurrent: () => window.ownerCurrent, now: () => Date.now() }));
    value(await window.controller.enrollDuress(window.decoy, { explainedLimits: true, explicit: true }));
    const real = await window.store.get(window.normal.profileId), independent = await window.store.get(window.decoy.profileId); window.sourceBefore = structuredClone(real);
    return { realId: real.profileId, decoyId: independent.profileId, separateKey: real.keyId !== independent.keyId, separateSalt: real.wrappedKey.salt !== independent.wrappedKey.salt,
      secretAbsent: !/local-duress|local-decoy|foreign future preference|fixture passphrase/.test(JSON.stringify([real, independent])) };
  });
  assert.notEqual(created.realId, created.decoyId); assert.equal(created.separateKey, true); assert.equal(created.separateSalt, true); assert.equal(created.secretAbsent, true);
  const switched = await pages[0].evaluate(async () => {
    const result = await window.controller.enterCredential({ purpose: 'decoy', passphrase: 'T59 decoy browser fixture passphrase' }, 1);
    const locked = await window.vault.list(window.normal.sessionId), after = await window.store.get(window.normal.profileId);
    return { result, realLocked: !locked.ok && locked.error.code === 'LOCKED', preserved: JSON.stringify(after) === JSON.stringify(window.sourceBefore), sessionAbsent: !/sessionId|keyId/.test(JSON.stringify(result)) };
  });
  assert.equal(switched.result.ok, true); assert.equal(switched.result.value.readOnly, true); assert.equal(switched.result.value.walletAuthority, false); assert.equal(switched.realLocked, true); assert.equal(switched.preserved, true); assert.equal(switched.sessionAbsent, true);
  const oldSession = await pages[0].evaluate(() => window.normal); await pages[0].reload(); await initialize(pages[0]);
  const reload = await pages[0].evaluate(async old => {
    const bad = window.controls.createDuressController({ vault: window.vault, normalSession: old, isCurrent: () => true, now: () => Date.now() });
    const opened = await window.vault.unlock(old.profileId, 'T59 normal browser fixture passphrase'); if (!opened.ok) throw Error(opened.error.code); window.normal = opened.value;
    const result = window.controls.createDuressController({ vault: window.vault, normalSession: window.normal, isCurrent: () => window.ownerCurrent, now: () => Date.now() }); if (!result.ok) throw Error(result.error.code); window.controller = result.value;
    const loaded = await window.controller.load(), rows = await window.vault.list(window.normal.sessionId);
    return { oldRejected: !bad.ok && bad.error.code === 'LOCKED', loaded, foreignPreserved: rows.ok && rows.value.some(row => row.id === 'aa'.repeat(16) && row.schemaVersion === 9) };
  }, oldSession);
  assert.equal(reload.oldRejected, true); assert.equal(reload.loaded.ok, true); assert.equal(reload.loaded.value.enabled, true); assert.equal(reload.foreignPreserved, true);
  const reminder = await pages[0].evaluate(async () => {
    const value = r => { if (!r.ok) throw Error(r.error.code); return r.value; };
    const scope = { chain: 'evm', networkId: 'local-31337', account: '0x' + '11'.repeat(20), accountGeneration: 1, policyRevision: 1 }; window.time = { wall: 1000, mono: 0 };
    window.reminders = value(window.controls.createSweepReminders({ vault: window.vault, session: window.normal, scope, isCurrent: () => window.ownerCurrent, clock: { wall: () => window.time.wall, monotonic: () => window.time.mono } }));
    const made = value(await window.reminders.createPlan({ ...scope, destination: '0x' + '22'.repeat(20), assets: [{ id: 'ETH', amountCap: '1000' }], feeCap: '100', expiresAt: 10_000 }, { explainedLimits: true, explicit: true }));
    const scheduled = value(await window.reminders.schedule(made.handle, 2000, 9000)); window.time.wall += 1000; window.time.mono += 1000;
    return { view: value(await window.reminders.inspect(scheduled.handle)), review: value(await window.reminders.prepareReady(scheduled.handle)), sendMethodPresent: 'executeNext' in window.reminders };
  });
  assert.equal(reminder.view.state, 'ready'); assert.equal(reminder.review.requiresFreshWalletConsent, true); assert.equal(reminder.review.executionSupported, false); assert.equal(reminder.sendMethodPresent, false);
  const beforeOther = await pages[0].evaluate(() => window.controller.inspect()); assert.equal(beforeOther.enrolled, true);
  const other = await pages[1].evaluate(async profileId => {
    const opened = await window.vault.unlock(profileId, 'T59 normal browser fixture passphrase'); if (!opened.ok) throw Error(opened.error.code); window.other = opened.value;
    return window.vault.commit(opened.value.sessionId, opened.value.revision, [{ op: 'put', record: { id: 'bb'.repeat(16), kind: 'preference', schemaVersion: 9, payload: window.schemas.encodeBase64url(new TextEncoder().encode('other native tab')) } }]);
  }, created.realId);
  assert.equal(other.ok, true);
  const conflict = await pages[0].evaluate(async () => {
    const cached = window.controller.inspect(), checked = await window.controller.load(); return { cached, checked, after: window.controller.inspect() };
  });
  assert.equal(conflict.cached.enrolled, true, 'no instantaneous other-tab write notification is claimed');
  assert.equal(conflict.checked.ok, false); assert.ok(['CONFLICT', 'LOCKED'].includes(conflict.checked.error.code)); assert.equal(conflict.after.phase, 'closed');
  assert.equal(unexpected.length, 0);
  for (const page of pages) await page.evaluate(() => { window.controller?.dispose(); window.reminders?.dispose(); window.vault.dispose(); window.store.close(); });
  console.log(JSON.stringify({ fixture: 'local-privacy-controls-native-storage', actualDocuments: 2, actualIndexedDB: true, nativeCrypto: true,
    independentDecoyKeys: true, realLockedBeforeDecoyView: true, sourceCiphertextPreserved: true, reloadRequiresNormalAuthentication: true,
    encryptedReminderOnly: true, anotherTabDetectedOnExplicitFreshnessCAS: true, instantaneousWriteBroadcast: false,
    nativeSubmissions: 0, defaultAppIntegration: false, workerIsolationQualification: false, tradingEnabled: false, externalRequests: unexpected.length }));
  await context.close();
} finally { await browser?.close(); if (server) await new Promise(done => server.close(done)); await rm(output, { recursive: true, force: true }); }
