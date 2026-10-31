/** Real Chromium/IndexedDB boundary tests. Only loopback is permitted; no wallet/network adapter exists here. */
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
const output = await mkdtemp(resolve(tmpdir(), 'p2p-vault-browser-'));
let browser;
let server;
let recoveryServer;
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), [
    '--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions',
    '--rootDir', 'packages', '--outDir', output, 'packages/storage/src/vault-service.ts',
    'packages/storage/src/backup-service.ts', 'packages/storage/src/migration-service.ts',
    'packages/domain/src/intent-journal.ts', 'packages/domain/src/authority.ts', 'packages/domain/src/trade-composition.ts',
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
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
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
  // G12 uses actual encrypted IDB transactions in two independent documents.
  // The local validator checks fixture encoding only: it supplies no chain/wallet authority.
  const journalFixture = await pages[0].evaluate(async () => {
    const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
    window.journalVault = new EncryptedVaultService(window.testStore, crypto, { lifecycle: false });
    const created = await window.journalVault.create('local journal browser passphrase');
    if (!created.ok) throw new Error('journal profile creation failed');
    window.journalSession = created.value;
    return { profileId: created.value.profileId,
      binding: { chain: 'evm', networkId: 'evm:1', deploymentId: 'fixture-escrow', tradeId: 'fixture-trade' },
      account: '0x' + '12'.repeat(20) };
  });
  for (let index = 0; index < pages.length; index++) {
    await pages[index].evaluate(async ({ fixture, index }) => {
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const { createIntentJournal } = await import('/domain/src/intent-journal.js');
      const { encodeBase64url } = await import('/schemas/src/vault.js');
      if (index !== 0) {
        window.journalVault = new EncryptedVaultService(window.testStore, crypto, { lifecycle: false });
        const opened = await window.journalVault.unlock(fixture.profileId, 'local journal browser passphrase');
        if (!opened.ok) throw new Error('second journal session failed');
        window.journalSession = opened.value;
      }
      window.journalIntent = { version: 1, intentId: encodeBase64url(new Uint8Array(32).fill(index + 1)),
        binding: fixture.binding, account: fixture.account, action: 'fund', state: 'prepared', walletGeneration: 0,
        expectedEscrowState: 'absent', preparedRequest: '{"fixture":"not-a-real-transaction"}',
        submission: { chain: 'evm', hash: null, nonce: null }, replacementOf: null, createdAt: 0, updatedAt: 0 };
      window.journal = createIntentJournal({ vault: window.journalVault, session: window.journalSession,
        validateCanonical: () => ({ ok: true, value: undefined }) });
    }, { fixture: journalFixture, index });
  }
  const reserved = await Promise.all(pages.map(page => page.evaluate(() => window.journal.reserve(window.journalIntent, 0))));
  assert.equal(reserved.filter(result => result.ok).length, 1, 'two tabs reserve only one logical attempt');
  assert.equal(reserved.find(result => !result.ok)?.error.code, 'CONFLICT');
  const winner = reserved.findIndex(result => result.ok);
  const reservedRow = await pages[0].evaluate(id => window.testStore.get(id), journalFixture.profileId);
  assert.equal(reservedRow.revision, 1);
  assert.doesNotMatch(JSON.stringify(reservedRow), /fixture-trade|not-a-real-transaction|preparedRequest|journal/);
  const prepared = await pages[winner].evaluate(() => window.journalIntent);
  // Reopen both tabs at the same durable revision, then race the non-idempotent marker.
  for (const page of pages) {
    await page.evaluate(async ({ fixture, prepared }) => {
      const { createIntentJournal } = await import('/domain/src/intent-journal.js');
      window.journal.dispose(); window.journalVault.lockAll();
      const opened = await window.journalVault.unlock(fixture.profileId, 'local journal browser passphrase');
      if (!opened.ok) throw new Error('journal reopen failed');
      window.journal = createIntentJournal({ vault: window.journalVault, session: opened.value,
        validateCanonical: () => ({ ok: true, value: undefined }) });
      window.journalIntent = prepared;
    }, { fixture: journalFixture, prepared });
  }
  const marked = await Promise.all(pages.map(page => page.evaluate(() => window.journal.markSending(window.journalIntent.intentId))));
  assert.equal(marked.filter(result => result.ok).length, 1, 'only one document obtains a completed marker');
  assert.equal(marked.find(result => !result.ok)?.error.code, 'CONFLICT');
  const markerRow = await pages[0].evaluate(id => window.testStore.get(id), journalFixture.profileId);
  assert.equal(markerRow.revision, 2, 'exactly one encrypted marker was committed');
  const durable = await pages[0].evaluate(async ({ fixture, prepared }) => {
    const { createIntentJournal } = await import('/domain/src/intent-journal.js');
    window.journal.dispose(); window.journalVault.lockAll();
    const opened = await window.journalVault.unlock(fixture.profileId, 'local journal browser passphrase');
    if (!opened.ok) throw new Error('journal recovery failed');
    window.journal = createIntentJournal({ vault: window.journalVault, session: opened.value,
      validateCanonical: () => ({ ok: true, value: undefined }), now: () => Number.MAX_SAFE_INTEGER - 1 });
    const unresolved = await window.journal.unresolved(fixture.binding, fixture.account);
    const repeated = await window.journal.markSending(prepared.intentId);
    const duplicate = await window.journal.reserve({ ...prepared, action: 'approve', state: 'prepared' }, 2);
    return { unresolved, repeated, duplicate };
  }, { fixture: journalFixture, prepared });
  assert.equal(durable.unresolved.ok, true);
  assert.equal(durable.unresolved.value.length, 1);
  assert.equal(durable.unresolved.value[0].state, 'broadcast-unknown');
  assert.equal(durable.repeated.error.code, 'CONFLICT');
  assert.equal(durable.duplicate.error.code, 'CONFLICT', 'age/action changes cannot clear unknown outcomes');
  for (const page of pages) await page.evaluate(() => { window.journal.dispose(); window.journalVault.dispose(); });

  // G08/G12 diagnostic composition in real separate documents, backed by native IndexedDB.
  const compositionContext = await browser.newContext({ serviceWorkers: 'block' });
  const compositionPages = await Promise.all([compositionContext.newPage(), compositionContext.newPage()]);
  const compositionErrors = [], compositionReports = [];
  for (const page of compositionPages) {
    page.on('pageerror', error => compositionErrors.push(error.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await page.goto(origin);
  }
  async function compositionCase(seeded) {
    for (const page of compositionPages) await page.evaluate(() => {
      const c = window.comp; if (!c) return;
      c.releaseRead?.(); c.releaseChain?.(); c.heldComposition?.dispose(); c.heldJournal?.dispose();
      c.composition.dispose(); c.journal.dispose(); c.authority.dispose(); c.vault.dispose(); c.store.close();
    });
    const fixture = await compositionPages[0].evaluate(async () => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const store = new IndexedDbVaultStore(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
      const created = await vault.create('local composition browser passphrase');
      if (!created.ok) throw new Error('composition profile create failed');
      window.comp = { store, vault, session: created.value };
      return { profileId: created.value.profileId,
        binding: { chain: 'evm', networkId: 'local-evm', deploymentId: 'fixture-escrow', tradeId: 'fixture-trade-01' },
        account: '0x' + '12'.repeat(20) };
    });
    for (let index = 0; index < compositionPages.length; index++) await compositionPages[index].evaluate(async ({ fixture, seeded, index }) => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const { createIntentJournal } = await import('/domain/src/intent-journal.js');
      const { createTradeAuthority } = await import('/domain/src/authority.js');
      const { createTradeComposition } = await import('/domain/src/trade-composition.js');
      const { encodeBase64url } = await import('/schemas/src/vault.js');
      if (index !== 0) {
        const store = new IndexedDbVaultStore(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
        const opened = await vault.unlock(fixture.profileId, 'local composition browser passphrase');
        if (!opened.ok) throw new Error('composition peer unlock failed'); window.comp = { store, vault, session: opened.value };
      }
      const c = window.comp; c.fixture = fixture;
      c.intent = { version: 1, intentId: encodeBase64url(new Uint8Array(32).fill(1)), binding: fixture.binding,
        account: fixture.account, action: 'fund', state: 'prepared', walletGeneration: 0, expectedEscrowState: 'absent',
        preparedRequest: '{"fixture":"not-a-real-transaction"}', submission: { chain: 'evm', hash: null, nonce: null },
        replacementOf: null, createdAt: 0, updatedAt: 0 };
      // This validates fixture encoding only; there is no ABI/provider/deployment approval.
      c.makeJournal = (port = c.vault) => createIntentJournal({ vault: port, session: c.session, validateCanonical: () => ({ ok: true, value: undefined }) });
      c.journal = c.makeJournal();
      if (index === 0 && seeded) { const result = await c.journal.reserve(c.intent, 0); if (!result.ok) throw new Error('composition seed failed'); }
      let chainReads = 0;
      c.authority = createTradeAuthority({ binding: fixture.binding, generation: 0, walletGeneration: 0,
        readValidated: async (_binding, request) => {
          const sequence = ++chainReads;
          if (c.holdChain && sequence === 1) { c.chainHeld = true; await new Promise(resolve => { c.releaseChain = resolve; }); }
          return { ok: true, value: { binding: fixture.binding, generation: request.generation, requestSequence: request.requestSequence,
            anchor: { height: String(100 + sequence), hash: 'fixture-anchor-' + sequence }, state: sequence === 1 ? 'absent' : 'funded',
            finality: 'finalized', observedAt: 1000 } };
        } });
      c.makeComposition = journal => createTradeComposition({ binding: fixture.binding, account: fixture.account, authority: c.authority, journal, now: () => 1000 });
      c.composition = c.makeComposition(c.journal);
    }, { fixture, seeded, index });
    return fixture;
  }
  async function holdComposition(point) {
    await compositionPages[0].evaluate(point => {
      const c = window.comp; c.readHeld = false; c.abort = new AbortController(); let first = true;
      const gate = new Promise(resolve => { c.releaseRead = resolve; });
      const hold = async () => { if (first) { first = false; c.readHeld = true; await gate; } };
      let reader = c.journal;
      if (point === 'before-preflight') {
        const get = c.store.get.bind(c.store); c.store.get = async id => { await hold(); return get(id); };
      } else {
        reader = c.heldJournal = c.makeJournal({ captureSession: (...args) => c.vault.captureSession(...args),
          read: (...args) => c.vault.read(...args), commit: (...args) => c.vault.commit(...args),
          list: async (...args) => { const result = await c.vault.list(...args); await hold(); return result; } });
      }
      c.heldComposition = c.makeComposition(reader); c.pendingRead = c.heldComposition.read(c.abort.signal);
    }, point);
    await compositionPages[0].waitForFunction(() => window.comp.readHeld);
  }
  async function recoverComposition() {
    return compositionPages[0].evaluate(async () => {
      const c = window.comp; c.heldComposition.dispose(); c.heldJournal?.dispose(); c.composition.dispose(); c.journal.dispose(); c.vault.lockAll();
      const opened = await c.vault.unlock(c.fixture.profileId, 'local composition browser passphrase');
      if (!opened.ok) throw new Error('composition recovery unlock failed'); c.session = opened.value; c.journal = c.makeJournal(); c.composition = c.makeComposition(c.journal);
      const view = await c.composition.read(), unresolved = await c.journal.unresolved(c.fixture.binding, c.fixture.account);
      const duplicate = await c.journal.reserve({ ...c.intent, intentId: 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk', action: 'approve' }, opened.value.revision);
      return { view, count: unresolved.ok ? unresolved.value.length : -1, state: unresolved.ok ? unresolved.value[0]?.state : null,
        idMatches: view.ok && view.value.pendingIntentIds.length === 1 && view.value.pendingIntentIds[0] === c.intent.intentId,
        duplicate: duplicate.ok ? 'unexpected-success' : duplicate.error.code };
    });
  }
  for (const schedule of ['before-preflight', 'after-snapshot', 'peer-marker']) {
    const fixture = await compositionCase(schedule === 'peer-marker');
    await holdComposition(schedule === 'before-preflight' ? schedule : 'after-snapshot');
    const peer = await compositionPages[1].evaluate(async marker => {
      const c = window.comp, result = marker ? await c.journal.markSending(c.intent.intentId) : await c.journal.reserve(c.intent, 0);
      c.committed = JSON.stringify(await c.store.get(c.fixture.profileId)); return result;
    }, schedule === 'peer-marker');
    assert.equal(peer.ok, true);
    const stale = await compositionPages[0].evaluate(() => { const c = window.comp; c.releaseRead(); return c.pendingRead; });
    assert.equal(stale.ok, false); assert.equal(stale.error.code, 'CONFLICT');
    const locked = await compositionPages[0].evaluate(() => window.comp.heldComposition.read());
    assert.equal(locked.ok, false); assert.equal(locked.error.code, 'LOCKED');
    const recovered = await recoverComposition();
    assert.equal(recovered.view.ok, true); assert.equal(recovered.idMatches, true); assert.equal(recovered.count, 1);
    assert.equal(recovered.view.value.economicPreparationAllowed, false); assert.equal(recovered.duplicate, 'CONFLICT');
    assert.equal(recovered.state, schedule === 'peer-marker' ? 'broadcast-unknown' : 'prepared');
    const same = await compositionPages[1].evaluate(async () => { const c = window.comp; return JSON.stringify(await c.store.get(c.fixture.profileId)) === c.committed; });
    assert.equal(same, true, 'refused diagnostic and duplicate must not change the committed ciphertext');
    compositionReports.push({ schedule, stale: stale.error.code, recoveredState: recovered.state, reserved: recovered.count, ciphertextUnchanged: same });
  }
  for (const cancellation of ['abort', 'dispose', 'wallet-generation']) {
    const fixture = await compositionCase(true);
    await compositionPages[0].evaluate(async () => { const c = window.comp; c.committed = JSON.stringify(await c.store.get(c.fixture.profileId)); });
    if (cancellation === 'wallet-generation') {
      await compositionPages[0].evaluate(() => { const c = window.comp; c.holdChain = true; c.pendingChain = c.authority.refresh(c.fixture.binding); });
      await compositionPages[0].waitForFunction(() => window.comp.chainHeld);
    }
    await holdComposition('after-snapshot');
    const cancelled = await compositionPages[0].evaluate(async cancellation => {
      const c = window.comp;
      if (cancellation === 'abort') c.abort.abort();
      if (cancellation === 'dispose') c.heldComposition.dispose();
      if (cancellation === 'wallet-generation') {
        const { encodeBase64url } = await import('/schemas/src/vault.js');
        const dispatched = c.authority.dispatchLocal({ version: 1, eventId: encodeBase64url(new Uint8Array(32).fill(9)),
          binding: c.fixture.binding, generation: 0, sequence: 1, observedAt: 1000, source: 'wallet', kind: 'wallet-invalidated', data: { walletGeneration: 1 } });
        if (dispatched !== 'accepted') throw new Error('wallet fixture invalidation refused');
        const old = await c.pendingChain; if (old.ok || old.error.code !== 'CANCELLED') throw new Error('old authority read survived invalidation');
        const newer = await c.authority.refresh(c.fixture.binding); if (!newer.ok) throw new Error('fresh authority fixture read failed'); c.releaseChain();
      }
      c.releaseRead(); return c.pendingRead;
    }, cancellation);
    assert.equal(cancelled.ok, false); assert.equal(cancelled.error.code, 'CANCELLED');
    const recovered = await recoverComposition();
    assert.equal(recovered.view.ok, true); assert.equal(recovered.idMatches, true); assert.equal(recovered.state, 'prepared');
    assert.equal(recovered.view.value.economicPreparationAllowed, false); assert.equal(recovered.duplicate, 'CONFLICT');
    if (cancellation === 'wallet-generation') {
      assert.equal(recovered.view.value.walletGeneration, 1); assert.equal(recovered.view.value.chain.state, 'funded');
    }
    const same = await compositionPages[0].evaluate(async () => { const c = window.comp; return JSON.stringify(await c.store.get(c.fixture.profileId)) === c.committed; });
    assert.equal(same, true);
    compositionReports.push({ cancellation, stale: cancelled.error.code, reserved: recovered.count, ciphertextUnchanged: same });
  }
  assert.deepEqual(compositionErrors, []);
  assert.deepEqual(unexpected, []);
  await compositionContext.close();
  console.log(JSON.stringify({ fixture: 'native-indexeddb-authority-composition', browser: browser.version(), reports: compositionReports,
    syntheticChainObservationsOnly: true, economicPreparationAllowed: false, pageErrors: compositionErrors.length, externalEgress: unexpected.length }));
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
  // Profile bound on fresh storage: two documents race creates and restore at the boundary.
  const capacityContext = await browser.newContext({ serviceWorkers: 'block' });
  const capacityPages = await Promise.all([capacityContext.newPage(), capacityContext.newPage()]);
  for (const page of capacityPages) {
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await page.goto(origin);
    await page.evaluate(async () => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const { EncryptedBackupService } = await import('/storage/src/backup-service.js');
      const { MAX_VAULT_PROFILES } = await import('/schemas/src/vault.js');
      window.capStore = new IndexedDbVaultStore();
      window.capVault = new EncryptedVaultService(window.capStore, crypto, { lifecycle: false });
      window.capBackup = new EncryptedBackupService(window.capStore);
      window.capMax = MAX_VAULT_PROFILES;
    });
  }
  const capacity = await capacityPages[0].evaluate(async () => {
    const first = await window.capVault.create('capacity fixture passphrase');
    if (!first.ok) throw new Error('capacity seed failed');
    const exported = await window.capBackup.exportWithStatus(first.value.profileId);
    for (let n = 1; n < window.capMax - 2; n++) {
      const created = await window.capVault.create('capacity fixture passphrase');
      if (!created.ok) throw new Error('capacity fill failed');
    }
    window.capFirst = first.value; window.capExport = exported.bytes;
    return { max: window.capMax, seeded: (await window.capVault.listProfiles()).value.profileIds.length, profileId: first.value.profileId };
  });
  assert.equal(capacity.seeded, capacity.max - 2);
  // Two slots remain; four concurrent creates from two tabs plus one restore race for them.
  const raced = await Promise.all([
    ...capacityPages.flatMap(page => [0, 1].map(() => page.evaluate(() => window.capVault.create('capacity fixture passphrase')))),
    capacityPages[1].evaluate(async (bytes) => {
      try { const receipt = await window.capBackup.restore(new Uint8Array(bytes), 'capacity fixture passphrase', 'capacity restore passphrase');
        return { ok: true, value: receipt }; } catch (error) { return { ok: false, error: { code: error.code } }; }
    }, [...await capacityPages[0].evaluate(() => [...window.capExport])]),
  ]);
  assert.equal(raced.filter(result => result.ok).length, 2, 'exactly the remaining slots are filled under concurrency');
  assert.deepEqual(raced.filter(result => !result.ok).map(result => result.error.code), ['LIMIT_EXCEEDED', 'LIMIT_EXCEEDED', 'LIMIT_EXCEEDED']);
  const atCapacity = await capacityPages[1].evaluate(async ({ profileId }) => {
    const inventory = await window.capVault.listProfiles();
    const opened = await window.capVault.unlock(profileId, 'capacity fixture passphrase');
    const committed = await window.capVault.commit(opened.value.sessionId, 0, [
      { op: 'put', record: { id: 'c'.repeat(32), kind: 'preference', schemaVersion: 1, payload: 'Y2FwYWNpdHk' } }]);
    const extra = await window.capVault.create('capacity fixture passphrase');
    let restored = '';
    try { await window.capBackup.restore(new Uint8Array(0), 'x'.repeat(12), 'y'.repeat(12)); } catch (error) { restored = error.code; }
    const after = await window.capVault.listProfiles();
    return { count: inventory.value.profileIds.length, truncated: inventory.value.truncated, unique: new Set(inventory.value.profileIds).size,
      committed: committed.ok && committed.value, extra: extra.error?.code, restored, after: after.value.profileIds.length };
  }, { profileId: capacity.profileId });
  assert.deepEqual(atCapacity, { count: capacity.max, truncated: false, unique: capacity.max, committed: 1, extra: 'LIMIT_EXCEEDED', restored: 'INVALID_INPUT', after: capacity.max });
  const restoreAtCapacity = await capacityPages[0].evaluate(async () => {
    try { await window.capBackup.restore(window.capExport, 'capacity fixture passphrase', 'capacity restore passphrase'); return 'restored'; }
    catch (error) { return error.code; }
  });
  assert.equal(restoreAtCapacity, 'LIMIT_EXCEEDED', 'restore at the bound fails without a partial row');
  // Saturated origin stays recoverable: export at the bound, restore on a fresh origin/storage as a
  // fresh-key locked profile, and the saturated source row is retained unchanged.
  const saturated = await capacityPages[0].evaluate(async ({ profileId }) => {
    const exported = await window.capBackup.exportWithStatus(profileId);
    return { bytes: [...exported.bytes], source: JSON.stringify(await window.capStore.get(profileId)),
      count: (await window.capVault.listProfiles()).value.profileIds.length };
  }, { profileId: capacity.profileId });
  assert.equal(saturated.count, capacity.max);
  const freshContext = await browser.newContext({ serviceWorkers: 'block' });
  const freshPage = await freshContext.newPage();
  await freshPage.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === recoveryOrigin) return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  await freshPage.goto(recoveryOrigin);
  const recovered = await freshPage.evaluate(async ({ bytes, sourceProfileId }) => {
    const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
    const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
    const { EncryptedBackupService } = await import('/storage/src/backup-service.js');
    const store = new IndexedDbVaultStore(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), backup = new EncryptedBackupService(store);
    const before = (await vault.listProfiles()).value.profileIds.length;
    const receipt = await backup.restore(new Uint8Array(bytes), 'capacity fixture passphrase', 'fresh origin passphrase');
    const row = await store.get(receipt.newProfileId);
    const wrongPass = await vault.unlock(receipt.newProfileId, 'capacity fixture passphrase');
    const opened = await vault.unlock(receipt.newProfileId, 'fresh origin passphrase');
    const records = opened.ok ? (await vault.list(opened.value.sessionId)).value : [];
    const out = { before, after: (await vault.listProfiles()).value.profileIds.length, revision: row.revision, distinct: receipt.newProfileId !== sourceProfileId,
      wrongPass: wrongPass.ok ? 'unexpected' : wrongPass.error.code, records: records.map(r => r.id[0]), origin: location.origin };
    backup.dispose(); vault.dispose(); store.close(); return out;
  }, { bytes: saturated.bytes, sourceProfileId: capacity.profileId });
  assert.deepEqual({ ...recovered, origin: undefined }, { before: 0, after: 1, revision: 0, distinct: true, wrongPass: 'AUTHENTICATION_FAILED', records: ['c'], origin: undefined });
  assert.equal(recovered.origin, recoveryOrigin);
  const sourceAfter = await capacityPages[0].evaluate(async ({ profileId }) => ({
    source: JSON.stringify(await window.capStore.get(profileId)), count: (await window.capVault.listProfiles()).value.profileIds.length }), { profileId: capacity.profileId });
  assert.deepEqual(sourceAfter, { source: saturated.source, count: capacity.max }, 'saturated source retained, origin unchanged');
  await freshContext.close();
  assert.equal(await capacityPages[0].evaluate(async () => (await window.capVault.listProfiles()).value.profileIds.length), capacity.max);
  for (const page of capacityPages) await page.evaluate(() => { window.capBackup.dispose(); window.capVault.dispose(); window.capStore.close(); });
  assert.deepEqual(unexpected, []);
  await capacityContext.close();
  // G03 reseal across two real documents: a stale source session must conflict, a fresh one copies.
  const resealContext = await browser.newContext({ serviceWorkers: 'block' });
  const resealPages = await Promise.all([resealContext.newPage(), resealContext.newPage()]);
  for (const page of resealPages) {
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await page.goto(origin);
    await page.evaluate(async () => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const { MigrationRegistry, InternalMigrationResealer, RecordMigrationService } = await import('/storage/src/migration-service.js');
      const kinds = ['identity', 'preference', 'trade', 'chat', 'journal'];
      const schemas = [...kinds.filter(k => k !== 'trade').map(kind => ({ kind, version: 1, validate: () => true })),
        { kind: 'trade', version: 1, validate: () => true }, { kind: 'trade', version: 2, validate: p => new TextDecoder().decode(p).endsWith('|v2') }];
      const registry = new MigrationRegistry({ identity: 1, preference: 1, trade: 2, chat: 1, journal: 1 }, schemas,
        [{ kind: 'trade', fromVersion: 1, toVersion: 2, migrate: p => new TextEncoder().encode(new TextDecoder().decode(p) + '|v2') }]);
      window.rsStore = new IndexedDbVaultStore();
      window.rsVault = new EncryptedVaultService(window.rsStore, crypto, { lifecycle: false });
      window.rsResealer = new InternalMigrationResealer(window.rsVault, new Map([['trade-v2', registry]]));
      window.rsMigrations = new RecordMigrationService(window.rsVault, registry);
    });
  }
  const resealSeed = await resealPages[0].evaluate(async () => {
    const created = await window.rsVault.create('reseal fixture passphrase');
    const revision = await window.rsVault.commit(created.value.sessionId, 0, [{ op: 'put', record: { id: '1'.repeat(32), kind: 'trade', schemaVersion: 1, payload: 'dHJhZGU' } }]);
    window.rsSession = { ...created.value, revision: revision.value };
    return { profileId: created.value.profileId, revision: revision.value, keyId: (await window.rsStore.get(created.value.profileId)).keyId };
  });
  // Tab B commits; tab A's cached session is now stale.
  await resealPages[1].evaluate(async ({ profileId }) => {
    const opened = await window.rsVault.unlock(profileId, 'reseal fixture passphrase');
    const done = await window.rsVault.commit(opened.value.sessionId, opened.value.revision, [{ op: 'put', record: { id: '2'.repeat(32), kind: 'preference', schemaVersion: 1, payload: 'cHJlZg' } }]);
    if (!done.ok) throw new Error('tab B commit failed');
  }, resealSeed);
  const stale = await resealPages[0].evaluate(seed => window.rsResealer.migrateAndReseal({ sourceSessionId: window.rsSession.sessionId,
    expectedKeyId: seed.keyId, expectedRevision: seed.revision, migrationId: 'trade-v2' }, 'reseal destination passphrase'), resealSeed);
  assert.equal(stale.ok, false); assert.equal(stale.error.code, 'CONFLICT', 'stale source session cannot produce a copy that omits tab B work');
  const resealed = await resealPages[0].evaluate(async seed => {
    const opened = await window.rsVault.unlock(seed.profileId, 'reseal fixture passphrase');
    const sourceBefore = JSON.stringify(await window.rsStore.get(seed.profileId));
    const result = await window.rsResealer.migrateAndReseal({ sourceSessionId: opened.value.sessionId, expectedKeyId: seed.keyId,
      expectedRevision: opened.value.revision, migrationId: 'trade-v2' }, 'reseal destination passphrase');
    const sourceAfter = JSON.stringify(await window.rsStore.get(seed.profileId));
    return { result, sourceKept: sourceBefore === sourceAfter, profiles: (await window.rsVault.listProfiles()).value.profileIds.length };
  }, resealSeed);
  assert.equal(resealed.result.ok, true); assert.equal(resealed.sourceKept, true); assert.equal(resealed.profiles, 2);
  const copy = await resealPages[1].evaluate(async id => {
    const opened = await window.rsVault.unlock(id, 'reseal destination passphrase');
    return (await window.rsVault.list(opened.value.sessionId)).value.map(r => [r.id[0], r.kind, r.schemaVersion, atob(r.payload.replace(/-/g, '+').replace(/_/g, '/'))]);
  }, resealed.result.value.newProfileId);
  assert.deepEqual(copy, [['1', 'trade', 2, 'trade|v2'], ['2', 'preference', 1, 'pref']], 'copy includes tab B work and migrated payload');
  // G09 stale empty plan across real documents: tab A holds a no-op plan, tab B commits, A must conflict.
  const staleNoop = await resealPages[0].evaluate(async () => {
    const created = await window.rsVault.create('noop fixture passphrase');
    const revision = await window.rsVault.commit(created.value.sessionId, 0, [{ op: 'put', record: { id: '3'.repeat(32), kind: 'preference', schemaVersion: 1, payload: 'eA' } }]);
    window.noopSession = { ...created.value, revision: revision.value };
    window.noopPlan = (await window.rsMigrations.plan(window.noopSession)).value;
    return { profileId: created.value.profileId, changes: window.noopPlan.changes.length };
  });
  assert.equal(staleNoop.changes, 0);
  await resealPages[1].evaluate(async ({ profileId }) => {
    const opened = await window.rsVault.unlock(profileId, 'noop fixture passphrase');
    const done = await window.rsVault.commit(opened.value.sessionId, opened.value.revision, [{ op: 'put', record: { id: '4'.repeat(32), kind: 'trade', schemaVersion: 1, payload: 'eQ' } }]);
    if (!done.ok) throw new Error('tab B noop-race commit failed');
  }, staleNoop);
  const staleResult = await resealPages[0].evaluate(async ({ profileId }) => {
    const before = JSON.stringify(await window.rsStore.get(profileId));
    const result = await window.rsMigrations.apply(window.noopSession, window.noopPlan);
    const after = JSON.stringify(await window.rsStore.get(profileId));
    const reopened = await window.rsVault.unlock(profileId, 'noop fixture passphrase');
    const replanned = await window.rsMigrations.plan(reopened.value);
    return { code: result.ok ? 'unexpected-success' : result.error.code, unchanged: before === after, replannedChanges: replanned.value.changes.length };
  }, staleNoop);
  assert.deepEqual(staleResult, { code: 'CONFLICT', unchanged: true, replannedChanges: 1 }, 'stale no-op conflicts; fresh replan sees tab B work');
  for (const page of resealPages) await page.evaluate(() => { window.rsVault.dispose(); window.rsStore.close(); });
  // Interrupted reseal: close the document mid-job at several points; a fresh document must find the source
  // intact and every other row a complete authenticated profile (never a partial or source-overwriting row).
  const setupReseal = async (page) => {
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await page.goto(origin);
    await page.evaluate(async () => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const { MigrationRegistry, InternalMigrationResealer } = await import('/storage/src/migration-service.js');
      const schemas = [...['identity', 'preference', 'chat', 'journal'].map(kind => ({ kind, version: 1, validate: () => true })),
        { kind: 'trade', version: 1, validate: () => true }, { kind: 'trade', version: 2, validate: p => new TextDecoder().decode(p).endsWith('|v2') }];
      const registry = new MigrationRegistry({ identity: 1, preference: 1, trade: 2, chat: 1, journal: 1 }, schemas,
        [{ kind: 'trade', fromVersion: 1, toVersion: 2, migrate: p => new TextEncoder().encode(new TextDecoder().decode(p) + '|v2') }]);
      window.rsStore = new IndexedDbVaultStore();
      window.rsVault = new EncryptedVaultService(window.rsStore, crypto, { lifecycle: false });
      window.rsResealer = new InternalMigrationResealer(window.rsVault, new Map([['trade-v2', registry]]));
    });
  };
  const interruptions = [];
  for (const delay of [0, 50, 300, 900, 2500]) {
    const crashContext = await browser.newContext({ serviceWorkers: 'block' });
    const victim = await crashContext.newPage(); await setupReseal(victim);
    const seed = await victim.evaluate(async () => {
      const created = await window.rsVault.create('crash fixture passphrase');
      const revision = await window.rsVault.commit(created.value.sessionId, 0, [{ op: 'put', record: { id: '1'.repeat(32), kind: 'trade', schemaVersion: 1, payload: 'dHJhZGU' } }]);
      const source = await window.rsStore.get(created.value.profileId);
      void window.rsResealer.migrateAndReseal({ sourceSessionId: created.value.sessionId, expectedKeyId: source.keyId,
        expectedRevision: revision.value, migrationId: 'trade-v2' }, 'crash destination passphrase');
      return { profileId: created.value.profileId, source: JSON.stringify(source) };
    });
    await new Promise(resolveDelay => setTimeout(resolveDelay, delay));
    await victim.close({ runBeforeUnload: false });
    const observer = await crashContext.newPage(); await setupReseal(observer);
    const after = await observer.evaluate(async seed => {
      const ids = (await window.rsVault.listProfiles()).value.profileIds;
      const sourceSame = JSON.stringify(await window.rsStore.get(seed.profileId)) === seed.source;
      const others = [];
      for (const id of ids.filter(id => id !== seed.profileId)) {
        const opened = await window.rsVault.unlock(id, 'crash destination passphrase');
        const records = opened.ok ? (await window.rsVault.list(opened.value.sessionId)).value : null;
        others.push(opened.ok && records.length === 1 && records[0].schemaVersion === 2 && atob(records[0].payload) === 'trade|v2');
      }
      const reopened = await window.rsVault.unlock(seed.profileId, 'crash fixture passphrase');
      return { count: ids.length, sourceSame, sourceUnlocks: reopened.ok, othersComplete: others.every(Boolean) };
    }, seed);
    assert.equal(after.sourceSame, true, `source retained after interruption at ${delay}ms`);
    assert.equal(after.sourceUnlocks, true); assert.ok(after.count === 1 || after.count === 2);
    assert.equal(after.othersComplete, true, `any destination row is complete at ${delay}ms`);
    interruptions.push(after.count === 2 ? 'copied' : 'absent');
    await crashContext.close();
  }
  console.log(`reseal interruption outcomes by delay: ${interruptions.join(',')}`);
  assert.deepEqual(unexpected, []);
  await resealContext.close();
  console.log('PASS: Chromium encrypted IndexedDB persistence, two-tab conflict, exact-ciphertext CAS, stale-session abort, lock/reopen, same/fresh-origin fresh-key backup restore, two-tab G12 reservation/marker CAS and unknown-outcome restart protection, versionchange/disposal, two-tab create/restore race at the profile bound with inventory and at-capacity update, saturated-origin export to fresh-origin fresh-key locked restore with source retained, two-tab G03 reseal stale-source conflict and source-retaining fresh-key copy, document-close interruption at five points leaving source intact and no partial copy, two-tab G09 stale empty-plan conflict without write, no external egress.');
} finally {
  await browser?.close();
  if (recoveryServer) await new Promise((resolveClose) => recoveryServer.close(resolveClose));
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(output, { recursive: true, force: true });
}
