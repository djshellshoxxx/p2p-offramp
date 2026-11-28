/**
 * Hosted qualification of the emitted demo App, its real module Worker and encrypted IndexedDB.
 * Synthetic local inputs only. No wallet, relay, RPC, transaction, release or deployment authority.
 * Worker observation is pass-through; the separate boundary probes use the same emitted Worker.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-trade-templates-'));
const PASS = 'encrypted template browser fixture passphrase';
const DEFAULTS = Object.freeze({ networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native',
  amountBaseUnits: '250000000000000000', fiatCurrency: 'EUR', fiatMinorUnits: '12345', fiatScale: 2 });
const DEFAULT_KEYS = Object.keys(DEFAULTS).sort();
const TRANSIENT_KEYS = ['seller', 'buyer', 'paymentInstructions', 'acceptBeforeSeconds', 'escrowExpirySeconds'];
const PRIVATE_INSTRUCTIONS = 'SYNTHETIC fresh draft instructions; never retained in a template.';
const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
const TRANSIENT = Object.freeze({ seller: '0xacf7b7c8271e99b3be70c3f476c7c20963e06b8e',
  buyer: '0x3b0d3efcce062566bd2a28c2f2bba7e1d1504ee5', paymentInstructions: PRIVATE_INSTRUCTIONS,
  acceptBeforeSeconds: String(nowSeconds + 3600n), escrowExpirySeconds: String(nowSeconds + 90_000n) });
const unexpected = [];
let browser, server;

function observeNativeWorker() {
  const observation = { requests: [], replies: [], walletPrompts: 0 };
  window.__templateObservation = observation;
  const NativeWorker = window.Worker;
  const operations = new Set(['loadTradeTemplates', 'previewTradeTemplateChange', 'commitTradeTemplateChange', 'cancelTradeTemplateChange']);
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', ({ data }) => {
        if (data?.kind === 'response' && operations.has(data.operation))
          observation.replies.push(structuredClone({ operation: data.operation, result: data.result }));
      });
    }
    postMessage(message, ...args) {
      if (operations.has(message?.operation)) {
        // Never copy profile credentials or arbitrary Worker traffic into this fixture observation.
        observation.requests.push(structuredClone({ operation: message.operation,
          ...(message.expectedRevision === undefined ? {} : { expectedRevision: message.expectedRevision }),
          ...(message.change === undefined ? {} : { change: message.change }) }));
      }
      return super.postMessage(message, ...args);
    }
  };
  const denied = async () => { observation.walletPrompts++; throw new Error('FIXTURE_WALLET_DENIED'); };
  Object.defineProperty(window, 'ethereum', { value: { request: denied, enable: denied }, configurable: true });
  Object.defineProperty(window, 'solana', { value: { connect: denied, signTransaction: denied, signMessage: denied }, configurable: true });
}

try {
  const out = resolve(temporary, 'demo'), evidence = await buildWeb({ delivery: 'demo', outDir: out });
  assert.equal(evidence.syntheticDemo, true); assert.equal(evidence.ReleaseEnabled, 0);
  const [documentGraph, workerGraph, qrGraph] = await Promise.all(['core-graph-document.json', 'core-graph-worker.json', 'qr-graph-worker.json']
    .map(async name => JSON.parse(await readFile(resolve(out, name), 'utf8'))));
  const privateModules = ['packages/personalization/favorites.ts', 'packages/personalization/src/favorites.ts',
    'packages/personalization/src/trade-draft-store.ts', 'packages/personalization/templates.ts'];
  assert.deepEqual(workerGraph.modules.filter(module => module.path.startsWith('packages/personalization/')).map(module => module.path).sort(), privateModules);
  assert.equal([...documentGraph.modules, ...qrGraph.modules].some(module => module.path.startsWith('packages/personalization/')), false);
  const workerName = (await readdir(resolve(out, 'assets'))).find(name => /^vault\.worker-[A-Za-z0-9_-]+\.js$/.test(name)); assert.ok(workerName);
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(observeNativeWorker);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(30_000);
  page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
  page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  const panel = () => page.locator('section[aria-labelledby="draft-title"]');
  const form = () => panel().getByRole('form', { name: 'New local draft', exact: true });
  const templates = () => panel().locator('.templates-list li');
  const slot = index => panel().locator(`.templates-list li[data-template-slot="${index}"]`);
  const preview = () => panel().getByRole('region', { name: 'Review local template change', exact: true });
  const saveButton = () => form().getByRole('button', { name: 'Save amounts as template', exact: true });
  const reviewButton = () => form().getByRole('button', { name: 'Review fresh draft', exact: true });
  const offers = async () => {
    await page.getByRole('link', { name: 'Offers', exact: true }).click();
    await panel().getByRole('heading', { name: 'New local draft', exact: true }).waitFor();
    await page.getByText(/^SYNTHETIC LOCAL DEMO: test-only registry/).waitFor();
  };
  const create = async () => {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Create new profile', exact: true }).click();
    await page.getByLabel('New passphrase', { exact: true }).fill(PASS); await page.getByLabel('Confirm new passphrase', { exact: true }).fill(PASS);
    await page.getByLabel(/no passphrase reset/).check(); await page.getByRole('button', { name: 'Create encrypted profile', exact: true }).click();
    const status = page.getByRole('status').filter({ hasText: 'was created and unlocked' }); await status.waitFor();
    const id = /Profile ([0-9a-f]{32}) was created/.exec(await status.innerText())?.[1]; assert.ok(id); return id;
  };
  const unlock = async profileId => {
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
    await page.getByLabel('Profile ID', { exact: true }).fill(profileId); await page.getByLabel('Passphrase', { exact: true }).fill(PASS);
    await page.getByRole('button', { name: 'Unlock local vault', exact: true }).click(); await page.getByText('Vault unlocked', { exact: true }).waitFor();
  };
  const lock = async () => { await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await page.getByText('Vault locked', { exact: true }).waitFor(); };
  const fill = async values => { for (const [key, value] of Object.entries(values)) await form().locator(`#draft-${key}`).fill(String(value)); };
  const assertFields = async values => {
    for (const [key, value] of Object.entries(values)) assert.equal(await form().locator(`#draft-${key}`).inputValue(), String(value), key);
  };
  const latest = operation => page.evaluate(wanted => window.__templateObservation.replies.filter(reply => reply.operation === wanted).at(-1)?.result, operation);
  const load = async count => {
    const before = await page.evaluate(() => window.__templateObservation.replies.filter(reply => reply.operation === 'loadTradeTemplates').length);
    await panel().getByRole('button', { name: 'Load templates', exact: true }).click();
    await page.waitForFunction(length => window.__templateObservation.replies.filter(reply => reply.operation === 'loadTradeTemplates').length > length, before);
    await page.waitForFunction(() => [...document.querySelectorAll('#draft-title ~ * button')].some(button => button.textContent === 'Load templates' && !button.disabled));
    if (count === 0) await panel().getByText('No templates are saved in this profile.', { exact: true }).waitFor();
    else await page.waitForFunction(expected => document.querySelectorAll('.templates-list li').length === expected, count);
    assert.equal(await templates().count(), count);
    const result = await latest('loadTradeTemplates'); assert.equal(result?.ok, true); assert.equal(result.value.library.templates.length, count);
    return result.value;
  };
  const checkPreview = async () => {
    await preview().waitFor(); assert.equal(await preview().getByRole('button', { name: 'Confirm local change', exact: true }).isEnabled(), false);
    await preview().getByText('This preview expires after five minutes. Confirm only the change shown here.', { exact: true }).waitFor();
    assert.match(await preview().innerText(), /Older backups can restore removed templates/);
  };
  const confirm = async () => {
    await checkPreview();
    await preview().getByLabel('I reviewed these local changes and understand backup copies are unaffected.', { exact: true }).check();
    await preview().getByRole('button', { name: 'Confirm local change', exact: true }).click();
    await panel().getByRole('status').filter({ hasText: 'The local template change is saved.' }).waitFor();
    assert.equal(await preview().count(), 0); assert.equal(await templates().count(), 0);
    assert.equal(await saveButton().isEnabled(), false, 'successful commit retires the observed library revision');
    const result = await latest('commitTradeTemplateChange'); assert.equal(result?.ok, true); assert.equal(result.value.persisted, true); assert.equal(result.value.sessionCurrent, true);
    return result.value;
  };
  const rawVault = () => page.evaluate(() => new Promise((done, fail) => {
    const opening = indexedDB.open('p2p-offramp-vault', 1); opening.onerror = () => fail(new Error('IDB'));
    opening.onsuccess = () => { const tx = opening.result.transaction('vaults', 'readonly'), all = tx.objectStore('vaults').getAll();
      all.onsuccess = () => { opening.result.close(); done(JSON.stringify(all.result)); }; all.onerror = () => fail(new Error('IDB')); };
  }));
  const noWallet = async () => assert.equal(await page.evaluate(() => window.__templateObservation.walletPrompts), 0);
  const termsField = label => page.evaluate(wanted => [...document.querySelectorAll('dl.terms dt')].find(node => node.textContent === wanted)?.nextElementSibling?.textContent?.trim() ?? null, label);
  const completeAndReview = async () => {
    await fill(TRANSIENT);
    assert.match(await form().locator('#draft-acceptBeforeSeconds-preview').innerText(), /remaining/);
    assert.match(await form().locator('#draft-escrowExpirySeconds-preview').innerText(), /remaining/);
    await form().getByLabel('I rechecked the exact crypto and fiat amounts for this draft.', { exact: true }).check();
    await form().getByLabel('I checked the current chain, escrow, asset and full party addresses.', { exact: true }).check();
    await reviewButton().click(); await page.waitForURL(/#\/trade\//);
    await page.getByText('Source: newly entered local draft. No acceptance is authenticated.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save to profile', exact: true }).count(), 0);
    assert.match(await page.locator('main').innerText(), /0\.25 native/);
    const identity = { order: await termsField('Order ID'), nonce: await termsField('Seller nonce'), agreement: await termsField('Private agreement SHA-256 (recomputed and matched)') };
    for (const value of Object.values(identity)) assert.match(value, /^[0-9a-f]{64}$/);
    return identity;
  };

  await page.goto(origin + '/#/offers');
  await panel().getByText('Unlock a profile to edit a private draft or manage encrypted templates.', { exact: true }).waitFor();
  assert.equal(await form().count(), 0); assert.equal(await panel().getByRole('button', { name: 'Load templates', exact: true }).count(), 0);
  const profileA = await create(); await offers();
  assert.equal(await saveButton().isEnabled(), false); assert.equal(await templates().count(), 0);
  assert.equal((await load(0)).revision, 0, 'the first valid observed revision is zero');
  await fill({ ...DEFAULTS, ...TRANSIENT });
  assert.equal(await form().locator('#template-slot option').count(), 8);
  await saveButton().click(); await checkPreview();
  const firstPlan = await latest('previewTradeTemplateChange'); assert.equal(firstPlan.ok, true); assert.equal(firstPlan.value.revision, 0);
  assert.deepEqual(firstPlan.value.change, { kind: 'put-template', slot: 0, defaults: DEFAULTS });
  await preview().getByRole('button', { name: 'Cancel', exact: true }).click(); await preview().waitFor({ state: 'detached' });
  assert.equal((await load(0)).revision, 0, 'preview and explicit cancellation do not write a template');
  await saveButton().click(); assert.equal((await confirm()).revision, 1);
  const stored = await load(1); assert.deepEqual(stored.library.templates, [{ slot: 0, defaults: DEFAULTS }]);
  assert.deepEqual(Object.keys(stored.library.templates[0].defaults).sort(), DEFAULT_KEYS);
  // A same-slot update uses the same explicit preview and consent path and never appends a ninth entry.
  await fill({ fiatMinorUnits: '54321' }); await saveButton().click(); await checkPreview();
  assert.deepEqual((await latest('previewTradeTemplateChange')).value.change, { kind: 'put-template', slot: 0, defaults: { ...DEFAULTS, fiatMinorUnits: '54321' } });
  await confirm(); assert.deepEqual((await load(1)).library.templates, [{ slot: 0, defaults: { ...DEFAULTS, fiatMinorUnits: '54321' } }]);
  // Restore the initial reusable amount through another explicit update so the remainder shares one exact fixture.
  await fill({ fiatMinorUnits: DEFAULTS.fiatMinorUnits }); await saveButton().click(); await confirm();
  assert.deepEqual((await load(1)).library.templates, [{ slot: 0, defaults: DEFAULTS }]);
  const encrypted = await rawVault();
  for (const value of ['p2p-offramp/local-trade-drafts/v1', '7032702d64726166742d763100000000', PRIVATE_INSTRUCTIONS, TRANSIENT.seller, TRANSIENT.buyer]) assert.equal(encrypted.includes(value), false);
  await slot(0).getByRole('button', { name: 'Use template', exact: true }).click();
  await assertFields(DEFAULTS); await assertFields(Object.fromEntries(TRANSIENT_KEYS.map(key => [key, ''])));
  assert.equal(await reviewButton().isEnabled(), false, 'applying defaults clears prior review consent');
  for (const label of ['I rechecked the exact crypto and fiat amounts for this draft.', 'I checked the current chain, escrow, asset and full party addresses.', 'I intentionally leave draft payment instructions empty.'])
    await form().getByLabel(label, { exact: true }).check();
  assert.equal(await reviewButton().isEnabled(), false, 'canonical input preflight prevents review before fresh parties and deadlines');
  await panel().getByRole('alert').filter({ hasText: 'Enter complete canonical values.' }).waitFor();
  // Exercise form submission as well: a disabled control alone must not admit an incomplete draft.
  await form().evaluate(node => node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.ok(page.url().endsWith('#/offers'), 'missing fresh parties and deadlines cannot produce a review');
  assert.equal(await reviewButton().isEnabled(), false);
  assert.equal(await form().locator('#draft-amountBaseUnits-preview').innerText(), '0.25 native');
  assert.equal(await form().locator('#draft-fiatMinorUnits-preview').innerText(), '123.45 EUR');
  assert.equal(await form().locator('#draft-amountBaseUnits').getAttribute('inputmode'), 'numeric');
  assert.equal(await form().locator('#draft-amountBaseUnits').getAttribute('maxlength'), '78');
  assert.equal(await form().locator('#draft-fiatCurrency').getAttribute('maxlength'), '3');
  await fill({ paymentInstructions: 'é'.repeat(2049) });
  assert.match(await form().locator('#draft-paymentInstructions-preview').innerText(), /4098\/4096/);
  assert.equal(await reviewButton().isEnabled(), false);
  await fill({ paymentInstructions: '' });
  assert.match(await form().locator('#draft-paymentInstructions-preview').innerText(), /0\/4096/);
  const firstIdentity = await completeAndReview(); const firstRoute = page.url(); await noWallet();

  await page.reload(); await page.getByText('Vault locked', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  await unlock(profileA); await offers(); assert.equal(await templates().count(), 0);
  await assertFields(Object.fromEntries([...Object.keys(DEFAULTS), ...TRANSIENT_KEYS].map(key => [key, ''])));
  assert.deepEqual((await load(1)).library.templates, [{ slot: 0, defaults: DEFAULTS }]);
  await slot(0).getByRole('button', { name: 'Use for repeat defaults', exact: true }).click(); await confirm();
  assert.equal((await load(1)).library.repeatDefaultSlot, 0);
  await panel().getByRole('button', { name: 'New draft from repeat defaults', exact: true }).click();
  await assertFields(DEFAULTS); await assertFields(Object.fromEntries(TRANSIENT_KEYS.map(key => [key, ''])));
  const secondIdentity = await completeAndReview();
  for (const key of Object.keys(firstIdentity)) assert.notEqual(secondIdentity[key], firstIdentity[key], `fresh ${key} on repeated defaults`);
  assert.notEqual(page.url(), firstRoute); await lock();
  await page.getByRole('heading', { name: 'Review not in this session', exact: true }).waitFor();
  const profileB = await create(); assert.notEqual(profileA, profileB); await offers(); assert.equal((await load(0)).revision, 0);
  await lock(); await unlock(profileA); await offers(); assert.equal(await templates().count(), 0);
  assert.equal((await load(1)).library.repeatDefaultSlot, 0);
  await panel().getByRole('button', { name: 'Clear repeat defaults', exact: true }).click(); await confirm();
  assert.equal((await load(1)).library.repeatDefaultSlot, null);
  assert.equal(await panel().getByRole('button', { name: 'New draft from repeat defaults', exact: true }).count(), 0);
  await slot(0).getByRole('button', { name: 'Use for repeat defaults', exact: true }).click(); await confirm(); await load(1);
  await slot(0).getByRole('button', { name: 'Remove template', exact: true }).click(); await checkPreview();
  await preview().getByText('Removing this template also clears repeat defaults.', { exact: true }).waitFor();
  await preview().getByRole('button', { name: 'Cancel', exact: true }).click(); await preview().waitFor({ state: 'detached' });
  assert.equal((await load(1)).library.repeatDefaultSlot, 0);
  await slot(0).getByRole('button', { name: 'Remove template', exact: true }).click(); await confirm();
  assert.equal((await load(0)).library.repeatDefaultSlot, null);
  await fill(DEFAULTS); await saveButton().click(); await checkPreview(); await lock();
  assert.equal(await preview().count(), 0); assert.equal(await form().count(), 0);
  await unlock(profileA); await offers(); assert.equal((await load(0)).library.templates.length, 0, 'lock retires the uncommitted preview');
  await lock(); await noWallet();

  // A separate real Worker pair opens the empty second profile. No port, vault, IDB or CAS mock.
  const nativeProbe = await page.evaluate(async ({ workerURL, profileId, passphrase, defaults }) => {
    const workers = [];
    const ensure = (condition, message) => { if (!condition) throw new Error(message); };
    const ok = result => { ensure(result?.ok === true, `FIXTURE_WORKER_${result?.error?.code ?? result?.closed ?? 'INVALID'}`); return result.value; };
    const open = async () => {
      const worker = new Worker(workerURL, { type: 'module' }); workers.push(worker); let next = 0;
      const request = (operation, fields = {}, generation = 0) => new Promise((done, fail) => {
        const requestId = ++next;
        const finish = value => { clearTimeout(timer); worker.removeEventListener('message', receive); done(value); };
        const receive = ({ data }) => {
          if (data?.kind === 'closed') finish({ closed: data.code });
          else if (data?.kind === 'response' && data.requestId === requestId) finish(data.result);
        };
        const timer = setTimeout(() => { worker.removeEventListener('message', receive); fail(new Error('FIXTURE_WORKER_TIMEOUT')); }, 30_000);
        worker.addEventListener('message', receive); worker.postMessage({ version: 1, requestId, generation, operation, ...fields });
      });
      ok(await request('init', { config: { version: 1, ReleaseEnabled: 0, connectOrigins: [] } }));
      ok(await request('unlock', { profileId, passphrase }));
      return { request, worker };
    };
    const consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
    const load = client => client.request('loadTradeTemplates', { profileId });
    const plan = (client, expectedRevision, change) => client.request('previewTradeTemplateChange', { profileId, expectedRevision, change });
    const commit = (client, preview) => client.request('commitTradeTemplateChange', { profileId, expectedRevision: preview.revision, previewId: preview.previewId, consent });
    try {
      const a = await open(), b = await open();
      const initialA = ok(await load(a)), initialB = ok(await load(b));
      ensure(initialA.revision === 0 && initialB.revision === 0 && initialA.library.templates.length === 0 && initialB.library.templates.length === 0, 'FIXTURE_INITIAL_REVISION');
      const aPreview = ok(await plan(a, 0, { kind: 'put-template', slot: 0, defaults }));
      const bPreview = ok(await plan(b, 0, { kind: 'put-template', slot: 1, defaults }));
      const winner = ok(await commit(a, aPreview)), stale = await commit(b, bPreview);
      ensure(winner.revision === 1 && winner.persisted === true && winner.sessionCurrent === true, 'FIXTURE_FIRST_COMMIT');
      // IndexedDB invalidation can revoke B before its queued stale command reaches the native CAS fence.
      // Both refusals preserve the same single-winner/no-retry proof below.
      ensure(stale.ok === false && ['CONFLICT', 'LOCKED'].includes(stale.error.code), 'FIXTURE_STALE_CAS');
      b.worker.terminate();
      const afterConflict = ok(await load(a)); ensure(afterConflict.revision === 1 && afterConflict.library.templates.length === 1 && afterConflict.library.templates[0].slot === 0, 'FIXTURE_NO_STALE_WRITE');
      let revision = 1;
      for (let slot = 1; slot < 8; slot++) {
        // Slot seven models a schema-valid preference for a registry identity that is no longer available.
        const values = slot === 7 ? { ...defaults, networkId: 'retired-network' } : defaults;
        revision = ok(await commit(a, ok(await plan(a, revision, { kind: 'put-template', slot, defaults: values })))).revision;
      }
      ensure(revision === 8, 'FIXTURE_EIGHT_COMMITS');
      const abandoned = ok(await plan(a, revision, { kind: 'remove-template', slot: 0 }));
      ensure(ok(await a.request('cancelTradeTemplateChange', { profileId })).cancelled === true, 'FIXTURE_CANCEL');
      const cancelled = await commit(a, abandoned); ensure(cancelled.ok === false && cancelled.error.code === 'NOT_FOUND', 'FIXTURE_CANCELLED_PREVIEW');
      const ninth = await plan(a, revision, { kind: 'put-template', slot: 8, defaults });
      ensure(ninth.closed === 'PROTOCOL_ERROR', 'FIXTURE_NINTH_SLOT_BOUNDARY');
      const c = await open(), beforeExtra = ok(await load(c)); ensure(beforeExtra.revision === 8 && beforeExtra.library.templates.length === 8, 'FIXTURE_NINTH_NO_WRITE');
      const extra = await plan(c, 8, { kind: 'put-template', slot: 0, defaults: { ...defaults, seller: '0x1212121212121212121212121212121212121212' } });
      ensure(extra.closed === 'PROTOCOL_ERROR', 'FIXTURE_SEVEN_FIELDS_BOUNDARY');
      const d = await open(), final = ok(await load(d));
      ensure(final.revision === 8 && final.library.templates.length === 8, 'FIXTURE_EXTRA_NO_WRITE');
      for (const template of final.library.templates) ensure(Object.keys(template.defaults).sort().join(',') === Object.keys(defaults).sort().join(','), 'FIXTURE_DEFAULT_KEYS');
      return { initialRevision: initialA.revision, winnerRevision: winner.revision, staleCode: stale.error.code,
        cancelledCode: cancelled.error.code, ninthCode: ninth.closed, extraFieldCode: extra.closed,
        finalRevision: final.revision, slots: final.library.templates.map(template => template.slot) };
    } finally { for (const worker of workers) worker.terminate(); }
  }, { workerURL: `${origin}/assets/${workerName}`, profileId: profileB, passphrase: PASS, defaults: DEFAULTS });
  assert.ok(['CONFLICT', 'LOCKED'].includes(nativeProbe.staleCode));
  assert.deepEqual(nativeProbe, { initialRevision: 0, winnerRevision: 1, staleCode: nativeProbe.staleCode, cancelledCode: 'NOT_FOUND',
    ninthCode: 'PROTOCOL_ERROR', extraFieldCode: 'PROTOCOL_ERROR', finalRevision: 8, slots: [0, 1, 2, 3, 4, 5, 6, 7] });
  await unlock(profileB); await offers(); assert.equal((await load(8)).revision, 8);
  await slot(7).getByRole('button', { name: 'Use template', exact: true }).click(); await panel().getByRole('alert').waitFor();
  await assertFields(Object.fromEntries([...Object.keys(DEFAULTS), ...TRANSIENT_KEYS].map(key => [key, ''])));
  assert.ok(page.url().endsWith('#/offers'), 'unavailable current registry identity cannot apply an old template');
  await slot(0).getByRole('button', { name: 'Use template', exact: true }).click(); await assertFields(DEFAULTS);
  await assertFields(Object.fromEntries(TRANSIENT_KEYS.map(key => [key, '']))); await noWallet();
  await panel().getByRole('button', { name: 'Start blank draft', exact: true }).click();
  await assertFields(Object.fromEntries([...Object.keys(DEFAULTS), ...TRANSIENT_KEYS].map(key => [key, ''])));
  assert.equal(await reviewButton().isEnabled(), false);
  assert.doesNotMatch(await rawVault(), /local-trade-drafts|retired-network|SYNTHETIC fresh draft instructions/);
  assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
  assert.deepEqual(unexpected, []); await context.close();
  console.log(JSON.stringify({ fixture: 'synthetic-emitted-trade-templates-native-worker-idb', browser: browser.version(),
    journey: ['locked', 'explicit-load-revision-zero', 'preview-consent', 'cancel-no-write', 'seven-defaults-only', 'same-slot-update', 'encrypted-at-rest',
      'apply-clears-transient-fields', 'missing-fresh-inputs-refused', 'fresh-order-nonce-and-agreement', 'reload', 'profile-isolation',
      'explicit-repeat-default', 'clear-repeat-default', 'delete-clears-default', 'lock-revokes-preview', 'native-two-worker-cas',
      'native-eight-slot-bound', 'native-extra-field-refusal', 'current-registry-refusal', 'explicit-blank-draft'],
    nativeProbe, workerOnlyTemplates: true, unexpectedRequests: unexpected.length, walletPrompts: 0,
    tradingEnabled: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
