/**
 * G12 lifecycle-mode journal races in two real Chromium documents sharing one encrypted IndexedDB profile.
 * Spec acceptance (spec-transaction-lifecycle-journal.md): exactly one prepared-state CAS may authorize a send,
 * conflicting observations commit at most once, and a stale document never overwrites a newer record.
 * Loopback only; the canonical validator is a fixture that supplies no chain or wallet authority.
 */
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
const output = await mkdtemp(resolve(tmpdir(), 'p2p-lifecycle-tabs-'));
const PASSPHRASE = 'local lifecycle browser passphrase';
const hashOf = byte => '0x' + byte.repeat(32);
let browser;
let server;
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), [
    '--ignoreConfig', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'Bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--rewriteRelativeImportExtensions',
    '--rootDir', 'packages', '--outDir', output, 'packages/storage/src/vault-service.ts', 'packages/storage/src/idb-vault-store.ts',
    'packages/domain/src/intent-journal.ts', 'packages/domain/src/tx-lifecycle.ts',
  ], { cwd: root, stdio: 'inherit' });
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'");
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Lifecycle tabs</title>'); return; }
    const target = resolve(output, `.${pathname}`);
    if (!target.startsWith(`${output}${sep}`) || !target.endsWith('.js')) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(contents => { response.setHeader('Content-Type', 'text/javascript'); response.end(contents); }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const unexpected = [];
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  for (const page of pages) {
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await page.goto(origin);
    await page.evaluate(async () => {
      const { IndexedDbVaultStore } = await import('/storage/src/idb-vault-store.js');
      const { EncryptedVaultService } = await import('/storage/src/vault-service.js');
      const { createLifecycleJournal } = await import('/domain/src/intent-journal.js');
      const { createEvmTxLifecycle } = await import('/domain/src/tx-lifecycle.js');
      const { encodeBase64url } = await import('/schemas/src/vault.js');
      window.store = new IndexedDbVaultStore();
      window.vault = new EncryptedVaultService(window.store, crypto, { lifecycle: false });
      window.makeIntent = (fill, extra = {}) => ({ version: 1, intentId: encodeBase64url(new Uint8Array(32).fill(fill)),
        binding: { chain: 'evm', networkId: 'evm:31337', deploymentId: 'fixture-escrow', tradeId: 'fixture-lifecycle-trade' },
        account: '0x' + '34'.repeat(20), action: 'fund', state: 'prepared', walletGeneration: 0, expectedEscrowState: 'absent',
        preparedRequest: JSON.stringify({ v: 1, chainId: '31337', from: '0x' + '34'.repeat(20), to: '0x' + '56'.repeat(20),
          data: '0x', value: '0', nonce: '7', preparedAtBlock: '0' }), submission: { chain: 'evm', hash: null, nonce: '7' },
        replacementOf: null, createdAt: 0, updatedAt: 0, ...extra });
      // Fresh session and journal at the current durable revision (what a reloaded tab sees).
      window.reopen = async (profileId, passphrase) => {
        window.journal?.dispose(); window.vault.lockAll();
        const opened = await window.vault.unlock(profileId, passphrase);
        if (!opened.ok) throw new Error('unlock failed');
        window.journal = createLifecycleJournal({ vault: window.vault, session: opened.value, validateCanonical: () => ({ ok: true, value: undefined }), now: () => 1 });
        const listed = await window.journal.list();
        if (!listed.ok) throw new Error('list failed');
        return window.journal.currentRevision();
      };
      window.codeOf = result => result.ok ? 'ok' : result.error.code;
      // Restore native authority through the coordinator. Serialized labels do not authorize successors.
      // This deterministic chain fixture cannot send/sign: the wallet port always throws.
      window.revalidate = async ({ id, hash, outcome }) => {
        let reads = 0;
        const ok = value => { reads++; return Promise.resolve({ ok: true, value }); };
        const blockHash = height => '0x' + height.toString(16).padStart(64, '0');
        const state = outcome === 'finalized' ? 'funded' : 'absent';
        const reader = {
          chainId: () => ok('31337'),
          head: () => ok({ number: '20', hash: blockHash(20) }),
          blockHashAt: height => ok(blockHash(Number(height))),
          transactionCount: () => ok('8'),
          transaction: () => ok(outcome === 'finalized' ? { hash, from: '0x' + '34'.repeat(20), to: '0x' + '56'.repeat(20),
            nonce: '7', input: '0x', value: '0', blockNumber: '10' } : null),
          receipt: () => ok(outcome === 'finalized' ? { transactionHash: hash, blockNumber: '10', blockHash: blockHash(10), status: 'success' } : null),
          escrowState: () => ok(state),
          escrowObservation: (binding, request) => ok({ binding, generation: request.generation, requestSequence: request.requestSequence,
            anchor: { height: '20', hash: blockHash(20) }, state, finality: 'finalized', observedAt: 1 }),
        };
        const life = createEvmTxLifecycle({ journal: window.journal, reader,
          wallet: async () => { throw new Error('This read-only fixture may not call a wallet.'); },
          policy: { finality: { kind: 'evm-finalized-tag' }, confirmations: 2, dropAfterBlocks: 5 } });
        try { const result = await life.reconcile(id); return { code: window.codeOf(result), outcome: result.ok ? result.value.outcome : null, reads }; }
        finally { life.dispose(); }
      };
    });
  }
  async function runProfile(forced) {
    const created = await pages[0].evaluate(async passphrase => { const r = await window.vault.create(passphrase); if (!r.ok) throw new Error('create failed'); return r.value.profileId; }, PASSPHRASE);
  const reopenAll = () => Promise.all(pages.map(page => page.evaluate(({ id, pass }) => window.reopen(id, pass), { id: created, pass: PASSPHRASE })));
  const storedRevision = () => pages[0].evaluate(async id => (await window.store.get(id)).revision, created);
  const listIn = page => page.evaluate(async () => { const r = await window.journal.list(); if (!r.ok) throw new Error(r.error.code); return r.value; });
  const revalidateAll = async outcome => {
    const results = await Promise.all(pages.map(page => page.evaluate(args => window.revalidate(args), { id: intentId, hash: recordedHash, outcome })));
    for (const result of results) {
      assert.equal(result.code, 'ok'); assert.equal(result.outcome, outcome);
      assert.ok(result.reads > 0, 'each restored tab rechecks native chain evidence');
    }
  };

  // 1. Reservation: two tabs, two different intents for the same binding/account at the same revision.
  let revisions = await reopenAll();
  assert.equal(revisions[0], revisions[1]);
  const reserved = await Promise.all(pages.map((page, index) => page.evaluate(({ fill, revision }) => window.journal.reserve(window.makeIntent(fill), revision).then(window.codeOf), { fill: index + 1, revision: revisions[index] })));
  assert.deepEqual([...reserved].sort(), ['CONFLICT', 'ok'], 'exactly one tab reserves the binding');
  const winner = reserved.indexOf('ok');
  const intentId = await pages[winner].evaluate(fill => window.makeIntent(fill).intentId, winner + 1);
  assert.equal(await storedRevision(), revisions[0] + 1);

  // 2. Send authorization: both tabs at the same revision race the non-idempotent marker.
  revisions = await reopenAll();
  const marked = await Promise.all(pages.map(page => page.evaluate(id => window.journal.markSending(id).then(window.codeOf), intentId)));
  assert.deepEqual([...marked].sort(), ['CONFLICT', 'ok'], 'exactly one prepared-state CAS authorizes a send');
  assert.equal(await storedRevision(), revisions[0] + 1, 'exactly one marker committed');

  // 3. Conflicting observations of an unknown broadcast: two different hashes, at most one is ever recorded.
  revisions = await reopenAll();
  const observedHashes = [hashOf('aa'), hashOf('bb')];
  const observed = await Promise.all(pages.map((page, index) => page.evaluate(({ id, hash }) => window.journal.observe(id, { state: 'pending', hash }).then(window.codeOf), { id: intentId, hash: observedHashes[index] })));
  assert.deepEqual([...observed].sort(), ['CONFLICT', 'ok']);
  const recordedHash = observedHashes[observed.indexOf('ok')];
  const loserHash = observedHashes[observed.indexOf('CONFLICT')];
  let current = await reopenAll().then(() => listIn(pages[0]));
  assert.equal(current.length, 1);
  assert.equal(current[0].state, 'pending'); assert.equal(current[0].submission.hash, recordedHash);
  // A recorded hash is immutable even for a fresh, non-stale document.
  const loserRetry = await pages[observed.indexOf('CONFLICT')].evaluate(({ id, hash }) => window.journal.observe(id, { state: 'confirmed', hash }).then(window.codeOf), { id: intentId, hash: loserHash });
  assert.equal(loserRetry, 'CONFLICT');

  // 4. Contradictory outcomes from the same pending state: confirmed vs replaced. One wins; the other cannot follow it.
  revisions = await reopenAll();
  const outcomes = ['confirmed', 'replaced'];
  // forced === null: real race. Otherwise tab 0 records `forced` alone first, so the follow-up branch for that outcome
  // is exercised whichever tab won the racing run; tab 1 then attempts the contradictory outcome at the same revision.
  const raced = forced === null
    ? await Promise.all(pages.map((page, index) => page.evaluate(({ id, state, hash }) => window.journal.observe(id, { state, hash }).then(window.codeOf), { id: intentId, state: outcomes[index], hash: recordedHash })))
    : await (async () => {
      const first = await pages[0].evaluate(({ id, state, hash }) => window.journal.observe(id, { state, hash }).then(window.codeOf), { id: intentId, state: forced, hash: recordedHash });
      const second = await pages[1].evaluate(({ id, state, hash }) => window.journal.observe(id, { state, hash }).then(window.codeOf), { id: intentId, state: outcomes.find(o => o !== forced), hash: recordedHash });
      outcomes.splice(0, 2, forced, outcomes.find(o => o !== forced));
      return [first, second];
    })();
  assert.deepEqual([...raced].sort(), ['CONFLICT', 'ok']);
  const outcome = outcomes[raced.indexOf('ok')];
  await reopenAll();
  const followUp = await pages[raced.indexOf('CONFLICT')].evaluate(({ id, state, hash }) => window.journal.observe(id, { state, hash }).then(window.codeOf), { id: intentId, state: outcomes[raced.indexOf('CONFLICT')], hash: recordedHash });
  assert.equal(followUp, 'CONFLICT', `${outcomes[raced.indexOf('CONFLICT')]} may not follow ${outcome}`);
  current = await listIn(pages[0]);
  assert.equal(current[0].state, outcome);

  // 5. Stale document: tab B keeps an old session while tab A commits; B's write must refuse, never overwrite.
  if (outcome === 'confirmed') {
    await reopenAll();
    const a = await pages[0].evaluate(({ id, hash }) => window.journal.observe(id, { state: 'finalized', hash }).then(window.codeOf), { id: intentId, hash: recordedHash });
    assert.equal(a, 'ok');
    const before = await storedRevision();
    const staleWrite = await pages[1].evaluate(({ id, hash }) => window.journal.observe(id, { state: 'reorged', hash }).then(window.codeOf), { id: intentId, hash: recordedHash });
    assert.notEqual(staleWrite, 'ok', 'a stale document cannot overwrite a newer record');
    assert.ok(['CONFLICT', 'LOCKED'].includes(staleWrite), staleWrite);
    assert.equal(await storedRevision(), before);
    current = await reopenAll().then(() => listIn(pages[1]));
    assert.equal(current[0].state, 'finalized');

    // 6. After a finalized intent, two tabs race to reserve successors for the same binding: still exactly one.
    revisions = await reopenAll();
    const blocked = await pages[0].evaluate(revision => window.journal.reserve(window.makeIntent(30, { submission: { chain: 'evm', hash: null, nonce: '8' } }), revision).then(window.codeOf), revisions[0]);
    assert.equal(blocked, 'CONFLICT', 'a restored finalized label alone never releases the binding');
    await revalidateAll('finalized');
    const next = await Promise.all(pages.map((page, index) => page.evaluate(({ fill, revision }) => window.journal.reserve(window.makeIntent(fill, { submission: { chain: 'evm', hash: null, nonce: '8' } }), revision).then(window.codeOf), { fill: 10 + index, revision: revisions[index] })));
    assert.deepEqual([...next].sort(), ['CONFLICT', 'ok'], 'released binding admits exactly one new intent');
  } else {
    // replaced is terminal and admits only one explicit successor naming it; race two successors.
    revisions = await reopenAll();
    const blocked = await pages[0].evaluate(({ revision, replaced }) => window.journal.reserve(window.makeIntent(31, { replacementOf: replaced, submission: { chain: 'evm', hash: null, nonce: '8' } }), revision).then(window.codeOf), { revision: revisions[0], replaced: intentId });
    assert.equal(blocked, 'CONFLICT', 'a restored replaced label alone never authorizes its successor');
    await revalidateAll('replaced');
    const successors = await Promise.all(pages.map((page, index) => page.evaluate(({ fill, revision, replaced }) => window.journal.reserve(window.makeIntent(fill, { replacementOf: replaced, submission: { chain: 'evm', hash: null, nonce: '8' } }), revision).then(window.codeOf), { fill: 20 + index, revision: revisions[index], replaced: intentId })));
    assert.deepEqual([...successors].sort(), ['CONFLICT', 'ok'], 'a replaced intent has exactly one successor');
  }

    const rows = await pages[0].evaluate(id => window.store.get(id), created);
    assert.doesNotMatch(JSON.stringify(rows), /fixture-lifecycle-trade|not-a-real-transaction|preparedRequest/, 'journal stays encrypted at rest');
    return { outcome, reserved, marked, observed, raced };
  }
  const racing = await runProfile(null);
  const forcedOther = await runProfile(racing.outcome === 'confirmed' ? 'replaced' : 'confirmed');
  assert.deepEqual(new Set([racing.outcome, forcedOther.outcome]), new Set(['confirmed', 'replaced']), 'both follow-up branches ran');
  assert.deepEqual(unexpected, []);
  for (const page of pages) await page.evaluate(() => { window.journal.dispose(); window.vault.dispose(); });
  console.log(JSON.stringify({ suite: 'G12-lifecycle-two-tab', racing, forcedOther, unexpectedRequests: unexpected.length }));
} finally {
  await browser?.close();
  await new Promise(resolveClose => server ? server.close(() => resolveClose()) : resolveClose());
  await rm(output, { recursive: true, force: true });
}
