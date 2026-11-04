/** Finite LOCAL G02/Web Locks proof with two concurrent pages and an explicit reopen. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from '../../../scripts/lib/chromium-path.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url)), output = await mkdtemp(resolve(tmpdir(), 'p2p-origin-ledger-'));
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const refused = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); if (code) assert.equal(result.error.code, code); };
const HOUR = 3_600_000, DAY = 86_400_000;
let server, browser;
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions', '--lib', 'ES2023,DOM',
    '--rootDir', 'packages', '--outDir', output, 'packages/meetup/test/fixtures/origin-ledger-fixture.ts'], { cwd: root, stdio: 'inherit' });
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'");
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local origin ledger proof</title>'); return; }
    const path = resolve(output, '.' + pathname);
    if (!path.startsWith(output + sep) || !path.endsWith('.js')) { response.writeHead(404); response.end(); return; }
    void readFile(path).then(bytes => { response.setHeader('Content-Type', 'text/javascript'); response.end(bytes); }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' }), unexpected = [];
  async function pageFor(profileId = null) {
    const page = await context.newPage();
    await page.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); unexpected.push(route.request().url()); return route.abort(); });
    await page.goto(origin);
    await page.evaluate(async id => { window.fixtureModule = await import('/meetup/test/fixtures/origin-ledger-fixture.js'); window.f = await window.fixtureModule.createOriginLedgerFixture(id); }, profileId);
    return page;
  }
  let a = await pageFor();
  const profileId = await a.evaluate(async () => {
    const missing = await window.f.budget.inspect();
    if (missing.ok || missing.error.code !== 'LEDGER_UNAVAILABLE') throw Error('FIXTURE_MISSING_LEDGER');
    const cap = window.f.consent(0), before = JSON.stringify(await window.f.store.get(window.f.ledgerProfileId));
    const noOutput = await window.f.budget.marker(cap, window.f.claim(cap));
    if (noOutput.ok || noOutput.error.code !== 'LEDGER_UNAVAILABLE' || JSON.stringify(await window.f.store.get(window.f.ledgerProfileId)) !== before) throw Error('FIXTURE_IMPLICIT_PROVISION');
    window.fixtureModule.value(await window.f.budget.provisionFreshLedger());
    const repeated = await window.f.budget.provisionFreshLedger();
    if (repeated.ok || repeated.error.code !== 'LEDGER_UNAVAILABLE') throw Error('FIXTURE_REPEAT_PROVISION');
    const { encodeBase64url } = await import('/schemas/index.js'), row = await window.f.store.get(window.f.ledgerProfileId);
    const result = await window.f.vault.commit(window.f.session.sessionId, row.revision, [{ op: 'put', record: { id: 'aa'.repeat(16), kind: 'preference', schemaVersion: 9, payload: encodeBase64url(new TextEncoder().encode('foreign future preference')) } }]);
    if (!result.ok) throw Error('FIXTURE_FOREIGN_RECORD'); return window.f.ledgerProfileId;
  });
  const sticky = await a.evaluate(async () => {
    const { value } = window.fixtureModule, f = window.f, firstCap = f.consent(1000), first = value(await f.budget.marker(firstCap, f.claim(firstCap)));
    for (let i = 0; i < 100; i++) { const cap = f.consent(2000 + i), marker = value(await f.budget.marker(cap, f.claim(cap))); if (JSON.stringify(marker) !== JSON.stringify(first)) throw Error('FIXTURE_FRESH_NOISE'); }
    const { LEDGER_RECORD_ID } = await import('/meetup/src/disclosure-budget.js'), { decodeBase64url } = await import('/schemas/index.js');
    const row = await f.vault.read(f.session.sessionId, LEDGER_RECORD_ID); if (!row.ok || !row.value) throw Error('FIXTURE_LEDGER');
    const ledger = new TextDecoder().decode(decodeBase64url(row.value.payload, 1, 65_536)), encrypted = JSON.stringify(await f.store.get(f.ledgerProfileId));
    return { counts: value(await f.budget.inspect()), stickyRequests: 100, nativeLockCallbacks: f.nativeLockCallbacks, ledgerHasRaw: /latE6|lonE6|accuracy|recipient|42\.6|-5\.6/.test(ledger),
      envelopeHasPlaintext: /"latE6"|"lonE6"|foreign future preference|42\.6|-5\.6/.test(encrypted) };
  });
  assert.equal(sticky.stickyRequests, 100); assert.ok(sticky.nativeLockCallbacks > 100); assert.equal(sticky.counts.regionsDay, 1); assert.equal(sticky.ledgerHasRaw, false); assert.equal(sticky.envelopeHasPlaintext, false);
  val(await a.evaluate(async () => { const cap = window.f.consent(100); return window.f.budget.reserveDistance(cap, window.f.digest(0)); }));
  await a.close(); // Real document loss after durable reservation, with no fictional send outcome.
  const b = await pageFor(profileId);
  const uncertain = await b.evaluate(async () => {
    const f = window.f, cap = f.consent(100), result = await f.budget.reserveDistance(cap, f.digest(0));
    if (!result.ok) throw Error('FIXTURE_REOPEN'); return { reservation: result.value, cancel: await f.budget.cancelBeforeSend(result.value), consume: await f.budget.consume(result.value, true), counts: await f.budget.inspect() };
  });
  assert.equal(uncertain.reservation.state, 'consumed'); assert.equal(uncertain.reservation.cachedResult, null);
  refused(uncertain.cancel, 'CONFLICT'); refused(uncertain.consume, 'LEDGER_UNAVAILABLE'); assert.equal(val(uncertain.counts).distanceDay, 1);
  const seeded = await b.evaluate(async () => {
    const f = window.f, { value } = window.fixtureModule;
    for (const [trade, challenges] of [[100, [1, 2]], [101, [0, 1, 2]], [102, [0, 1, 2]], [103, [0, 1]]]) {
      const cap = f.consent(trade); for (const challenge of challenges) value(await f.budget.consume(value(await f.budget.reserveDistance(cap, f.digest(challenge))), true));
    }
    return f.budget.inspect();
  });
  assert.equal(val(seeded).distanceDay, 11);
  a = await pageFor(profileId); // Both actual native services now start at the same current revision.
  const races = await Promise.all([a, b].map((page, pageIndex) => page.evaluate(async index => {
    const f = window.f, cap = f.consent(103), budgets = Array.from({ length: 10 }, () => f.makeBudget());
    return Promise.all(budgets.map((budget, n) => budget.reserveDistance(cap, f.digest(10_000 + index * 10 + n))));
  }, pageIndex)));
  assert.equal(races.flat().filter(result => result.ok).length, 1, 'native two-page 20-way last-unit race must reserve once');
  await b.evaluate(() => window.f.reopen());
  const capped = await b.evaluate(async () => {
    const f = window.f; return { counts: await f.budget.inspect(), perTrade: await f.budget.reserveDistance(f.consent(103), f.digest(90_000)), global: await f.budget.reserveDistance(f.consent(104), f.digest(90_001)) };
  });
  assert.equal(val(capped.counts).distanceDay, 12); refused(capped.perTrade, 'EXHAUSTED'); refused(capped.global, 'EXHAUSTED');
  const cleared = await b.evaluate(async () => {
    const f = window.f; window.fixtureModule.value(await f.budget.clearCachedMarker());
    const cap = f.consent(3000); return { counts: await f.budget.inspect(), resample: await f.budget.marker(cap, f.claim(cap)), resetSurface: ['reset', 'send', 'publish', 'network', 'sign', 'delete'].some(name => name in f.budget) };
  });
  assert.equal(val(cleared.counts).regionsDay, 1); assert.equal(val(cleared.counts).distanceDay, 12); refused(cleared.resample, 'LEDGER_UNAVAILABLE'); assert.equal(cleared.resetSurface, false);
  const regionCaps = await b.evaluate(async hour => {
    const f = window.f, { value } = window.fixtureModule, checks = [];
    for (let epochHour = 0; epochHour < 3; epochHour++) {
      f.setOffset(epochHour * hour); const cap = f.consent(4000 + epochHour);
      for (let i = 0; i < (epochHour === 0 ? 3 : 4); i++) value(await f.budget.marker(cap, f.claim(cap), { newEpoch: true }));
      checks.push({ counts: value(await f.budget.inspect()), refused: await f.budget.marker(cap, f.claim(cap), { newEpoch: true }) });
    }
    f.setOffset(3 * hour); const cap = f.consent(5000);
    return { checks, dayRefused: await f.budget.marker(cap, f.claim(cap), { newEpoch: true }), dayCounts: await f.budget.inspect() };
  }, HOUR);
  assert.deepEqual(regionCaps.checks.map(check => check.counts.regionsHour), [4, 4, 4]);
  assert.deepEqual(regionCaps.checks.map(check => check.counts.regionsDay), [4, 8, 12]);
  for (const check of regionCaps.checks) refused(check.refused, 'EXHAUSTED');
  refused(regionCaps.dayRefused, 'EXHAUSTED'); assert.equal(val(regionCaps.dayCounts).regionsHour, 0); assert.equal(val(regionCaps.dayCounts).regionsDay, 12);
  await a.evaluate(async () => {
    const { BUDGET_LOCK_NAME } = await import('/meetup/src/disclosure-budget.js'); window.nativeLockHeld = false;
    const release = new Promise(done => { window.releaseNativeLock = done; });
    window.nativeHolder = navigator.locks.request(BUDGET_LOCK_NAME, { mode: 'exclusive' }, async () => { window.nativeLockHeld = true; try { await release; } finally { window.nativeLockHeld = false; } });
  });
  await a.waitForFunction(() => window.nativeLockHeld === true);
  const cancelledLock = await b.evaluate(async () => {
    const { BUDGET_LOCK_NAME } = await import('/meetup/src/disclosure-budget.js'), f = window.f, before = JSON.stringify(await f.store.get(f.ledgerProfileId)), abort = new AbortController();
    const pending = f.budget.inspect(abort.signal); let observedQueued = false;
    for (let i = 0; i < 32; i++) { const locks = await navigator.locks.query(); if (locks.pending.some(lock => lock.name === BUDGET_LOCK_NAME)) { observedQueued = true; break; } await new Promise(done => setTimeout(done, 0)); }
    abort.abort(); const result = await pending;
    return { observedQueued, result, sourceUnchanged: JSON.stringify(await f.store.get(f.ledgerProfileId)) === before };
  });
  assert.equal(cancelledLock.observedQueued, true); refused(cancelledLock.result, 'CANCELLED'); assert.equal(cancelledLock.sourceUnchanged, true);
  await a.evaluate(async () => { window.releaseNativeLock(); await window.nativeHolder; });
  await b.evaluate(() => window.f.reopen());
  const retained = await b.evaluate(async offset => {
    const f = window.f; f.setOffset(offset); const cap = f.consent(100);
    return { counts: await f.budget.inspect(), oldTrade: await f.budget.reserveDistance(cap, f.digest(999_999)) };
  }, 3 * HOUR + DAY + 1);
  assert.equal(val(retained.counts).distanceDay, 0); assert.equal(val(retained.counts).regionsDay, 0); assert.equal(val(retained.counts).trackedTrades, 4); refused(retained.oldTrade, 'EXHAUSTED');
  const noReset = await b.evaluate(async () => {
    const f = window.f, { LEDGER_RECORD_ID } = await import('/meetup/src/disclosure-budget.js'), { encodeBase64url } = await import('/schemas/index.js');
    const row = await f.store.get(f.ledgerProfileId), corrupted = await f.vault.commit(f.session.sessionId, row.revision, [{ op: 'put', record: { id: LEDGER_RECORD_ID, kind: 'preference', schemaVersion: 1, payload: encodeBase64url(new TextEncoder().encode('{"invalid":"controlled-local-fixture"}')) } }]);
    if (!corrupted.ok) throw Error('FIXTURE_CORRUPTION'); const before = JSON.stringify(await f.store.get(f.ledgerProfileId));
    const inspect = await f.budget.inspect(), provision = await f.budget.provisionFreshLedger(), rows = await f.vault.list(f.session.sessionId);
    return { inspect, provision, unchangedAfterRefusal: JSON.stringify(await f.store.get(f.ledgerProfileId)) === before,
      foreignPreserved: rows.ok && rows.value.some(row => row.id === 'aa'.repeat(16) && row.kind === 'preference' && row.schemaVersion === 9 && row.payload === encodeBase64url(new TextEncoder().encode('foreign future preference'))), lockCallbacks: f.nativeLockCallbacks };
  });
  refused(noReset.inspect, 'LEDGER_UNAVAILABLE'); refused(noReset.provision, 'LEDGER_UNAVAILABLE'); assert.equal(noReset.unchangedAfterRefusal, true); assert.equal(noReset.foreignPreserved, true); assert.ok(noReset.lockCallbacks > 0);
  assert.equal(unexpected.length, 0);
  for (const page of [a, b]) await page.evaluate(() => window.f.close());
  console.log(JSON.stringify({ fixture: 'meetup-native-origin-ledger', browser: browser.version(), documentsCreated: 3, maximumConcurrentDocuments: 2, reopenedAfterDocumentLoss: true, actualIndexedDB: true, actualWebLocks: true, actualNativeCrypto: true,
    fixedDesignatedLedgerProfile: true, raceRequests: 20, successfulLastDistanceReservations: 1, stickyRequests: 100, uncertainReservationRetained: true, regionsPerHour: 4, regionsPerDay: 12,
    distancePerDay: 12, distancePerTradeLifetime: 3, queuedNativeLockCancelled: true, missingLedgerRefused: true, repeatedProvisionRefused: true, corruptionRefusedWithoutReset: true, foreignPreferencePreserved: true,
    syntheticClockAndManualClaims: true, syntheticConsentPorts: true, sensorPermissionRequested: false, sends: 0, providerActivation: false, instantaneousWriteBroadcast: false, defaultAppIntegration: false, physicalLocationAuthentication: false, externalPageRequests: unexpected.length }));
  await context.close();
} finally { await browser?.close(); if (server) await new Promise(done => server.close(done)); await rm(output, { recursive: true, force: true }); }
