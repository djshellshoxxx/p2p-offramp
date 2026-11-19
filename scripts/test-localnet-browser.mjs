#!/usr/bin/env node
/** Built-app browser qualification with separate IndexedDB profiles, real loopback escrow/relay and external fixture wallets. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { buildLocalnetContentPolicy } from '../packages/security/src/content-policy.ts';
import { openEnvelope, disposeMaterial } from '../packages/storage/src/vault-crypto.ts';
import { decodeIntentPayload } from '../packages/schemas/index.ts';
import { buildGetTrade, decodeTrade } from '../packages/wallet/localnet.ts';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { startLocalnetFixture } from './lib/localnet-fixture.mjs';
import { assertLocalnetSendMarked } from './lib/localnet-send-evidence.mjs';

const PASS = 'public synthetic localnet browser profile passphrase';
const RESTORED_PASS = 'public synthetic restored localnet browser passphrase';
const PAYMENT = 'SYNTHETIC bank instructions <img src="https://private.invalid/terms" onerror="globalThis.localnetInjected=true">';
const MESSAGE = 'SYNTHETIC encrypted message: bank payment claimed, never independently confirmed.';
const checks = [], unexpected = [], pages = new Set();
const pass = label => { checks.push(label); console.log(`ok - ${label}`); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let fixture, browser, server, temporary, origin, markers = 0;
async function until(check, label, timeout = 30_000) {
  const started = Date.now();
  while (!await check()) { if (Date.now() - started >= timeout) throw new Error(`Timed out: ${label}`); await pause(50); }
}
const profileId = page => page.locator('[data-profile-id]').getAttribute('data-profile-id');
const trade = (page, id) => page.locator(`[data-trade-id="${id}"]`);
const state = async (page, id, expected) => until(async () => await trade(page, id).getByTestId('chain-state').textContent() === expected, `chain state ${expected}`);
async function encryptedRow(page, id) {
  return page.evaluate(profile => new Promise((resolve, reject) => {
    const open = indexedDB.open('p2p-offramp-vault', 1);
    open.onerror = () => reject(new Error('Fixture could not inspect encrypted profile.'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('vaults', 'readonly'), request = tx.objectStore('vaults').get(profile);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Fixture encrypted profile read failed.'));
      tx.oncomplete = () => db.close(); tx.onabort = () => db.close();
    };
  }), id);
}
async function party(index, passphrase = PASS) {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket(url => url.href !== fixture.config.relayUrl, socket => { unexpected.push(socket.url()); socket.close(); });
  let page;
  const provider = fixture.provider(index, { beforeSend: async request => {
    const id = await profileId(page), row = await encryptedRow(page, id);
    const opened = await openEnvelope(row, passphrase, crypto);
    try {
      const records = opened.snapshot.records.filter(record => record.kind === 'journal').map(record => decodeIntentPayload(record.payload));
      const marked = assertLocalnetSendMarked(records, request, id); markers++;
      for (const secretText of [PAYMENT, MESSAGE, marked.preparedRequest]) assert.equal(JSON.stringify(row).includes(secretText), false);
    } finally { disposeMaterial(opened.material); }
  } });
  await context.exposeBinding('__localnetFixtureRequest', async (_source, request) => {
    try { return { ok: true, value: await provider.request(request) }; }
    catch (error) { return { ok: false, code: typeof error?.code === 'number' ? error.code : 5000 }; }
  });
  await context.addInitScript(() => {
    const listeners = new Map();
    Object.defineProperty(window, 'ethereum', { value: Object.freeze({
      async request(request) {
        const reply = await window.__localnetFixtureRequest(request);
        if (!reply.ok) throw Object.assign(new Error('External fixture wallet refused.'), { code: reply.code });
        return reply.value;
      },
      on(event, listener) { const set = listeners.get(event) ?? new Set(); set.add(listener); listeners.set(event, set); },
      removeListener(event, listener) { listeners.get(event)?.delete(listener); },
    }), configurable: false });
  });
  page = await context.newPage(); pages.add(page); page.setDefaultTimeout(30_000);
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Your encrypted profile' }).waitFor();
  return { page, context, provider, passphrase, close: async () => { pages.delete(page); await context.close(); } };
}
async function createProfile(owner) {
  await owner.page.getByLabel('New profile passphrase', { exact: true }).fill(owner.passphrase);
  await owner.page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await owner.page.locator('[data-private="localnet-profile"]').waitFor();
}
async function connect(owner) {
  await owner.page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await until(async () => await owner.page.getByTestId('wallet-account').textContent() === owner.provider.state.account, 'external wallet connection');
  await idle(owner);
}
async function idle(owner) {
  await until(() => owner.page.getByRole('button', { name: 'Connect wallet', exact: true }).isEnabled(), 'localnet command completion');
}
async function refresh(owner) {
  await owner.page.getByRole('button', { name: 'Refresh chain and messages', exact: true }).click();
  await idle(owner);
}
async function confirm(owner) {
  await owner.page.getByTestId('review-confirm').click();
  await owner.page.getByRole('region', { name: 'Wallet action review' }).waitFor({ state: 'hidden' });
  // Review authority is consumed before signing/submission settles; wait for the UI operation too.
  await idle(owner);
}
async function negotiate(seller, buyer, amount) {
  const before = fixture.counts.signatures, known = await seller.page.locator('[data-session-key]').evaluateAll(items => items.map(item => item.getAttribute('data-session-key')));
  await seller.page.getByLabel('Amount in base units', { exact: true }).fill(amount);
  await seller.page.getByRole('button', { name: 'Publish sell offer', exact: true }).click();
  const offer = buyer.page.locator('[data-ad-key]').filter({ hasText: `${amount} base units` });
  await offer.getByRole('button', { name: 'Request private terms', exact: true }).click();
  await until(async () => (await seller.page.locator('[data-session-key]').evaluateAll(items => items.map(item => item.getAttribute('data-session-key')))).some(id => !known.includes(id)), 'new private seller negotiation');
  const session = (await seller.page.locator('[data-session-key]').evaluateAll(items => items.map(item => item.getAttribute('data-session-key')))).find(id => !known.includes(id));
  await seller.page.locator(`[data-session-key="${session}"]`).click();
  await seller.page.getByLabel('Private payment instructions', { exact: true }).fill(PAYMENT);
  await seller.page.getByRole('button', { name: 'Review terms to offer', exact: true }).click();
  await seller.page.getByRole('region', { name: 'Wallet action review' }).waitFor();
  assert.equal(fixture.counts.signatures, before, 'review preparation does not open a signing prompt');
  assert.equal(await seller.page.locator('[data-private] img').count(), 0, 'hostile payment text stays text');
  await confirm(seller);
  const id = await seller.page.locator(`[data-session-id="${session}"]`).evaluate(element => {
    const all = [...document.querySelectorAll('[data-trade-id]')];
    return all.at(-1)?.getAttribute('data-trade-id');
  });
  assert.match(id, /^[0-9a-f]{64}$/);
  await trade(buyer.page, id).waitFor();
  const buyerSession = await buyer.page.locator('[data-session-key]').last().getAttribute('data-session-key');
  await buyer.page.locator(`[data-session-key="${buyerSession}"]`).click();
  await buyer.page.getByRole('button', { name: 'Review terms to accept', exact: true }).click(); await confirm(buyer);
  await until(async () => await trade(seller.page, id).getByRole('button', { name: 'Review funding', exact: true }).isEnabled(), 'both wallet-to-messaging acceptances');
  assert.equal(fixture.counts.signatures, before + 4);
  assert.equal(await buyer.page.evaluate(() => globalThis.localnetInjected ?? false), false);
  return id;
}
async function prepare(owner, id, action) {
  const before = fixture.counts.sends;
  await trade(owner.page, id).getByRole('button', { name: `Review ${action}`, exact: true }).click();
  await owner.page.getByRole('region', { name: 'Wallet action review' }).waitFor();
  assert.equal(fixture.counts.sends, before, 'transaction preparation does not send');
}

try {
  fixture = await startLocalnetFixture();
  temporary = await mkdtemp(join(tmpdir(), 'p2p-localnet-browser-'));
  const outDir = join(temporary, 'app'), evidence = await buildWeb({ delivery: 'localnet', outDir, localnet: fixture.buildOption });
  assert.equal(evidence.ReleaseEnabled, 0);
  const files = new Map(await Promise.all(evidence.assets.map(async asset => [asset.path, await readFile(join(outDir, asset.path))])));
  const headers = buildLocalnetContentPolicy({ version: 1, releaseId: 'local-development', delivery: 'header', relayOrigin: fixture.config.relayOrigin }).headers;
  server = createServer((request, response) => {
    const path = request.url === '/' ? 'index.html' : request.url?.slice(1), bytes = files.get(path);
    if (!bytes) { response.writeHead(404).end(); return; }
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/json';
    response.writeHead(200, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' }).end(bytes);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const seller = await party(0), buyer = await party(1);
  await createProfile(seller); await createProfile(buyer);
  assert.notEqual(await profileId(seller.page), await profileId(buyer.page));
  await seller.page.evaluate(() => localStorage.setItem('localnet-isolation', 'seller'));
  assert.equal(await buyer.page.evaluate(() => localStorage.getItem('localnet-isolation')), null);
  assert.equal(fixture.counts.connects, 0); assert.equal(fixture.counts.signatures, 0); assert.equal(fixture.counts.sends, 0);
  seller.provider.state.chainId = '0x1'; await seller.page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await seller.page.getByRole('alert').waitFor(); assert.equal(await seller.page.getByTestId('wallet-account').textContent(), 'not connected');
  seller.provider.state.chainId = '0x7a69'; await connect(seller); await connect(buyer);
  pass('built application creates isolated encrypted profiles, performs no automatic wallet action, and refuses a wrong-chain wallet');
  const first = await negotiate(seller, buyer, '10000000000000000');
  assert.equal(fixture.counts.sends, 0);
  pass('buyer and seller negotiate exact private terms through real encrypted relay traffic and four separately reviewed wallet signatures');
  await trade(buyer.page, first).getByLabel('Message to peer', { exact: true }).fill(MESSAGE);
  await trade(buyer.page, first).getByRole('button', { name: 'Send encrypted message', exact: true }).click();
  await until(async () => (await trade(seller.page, first).getByRole('list', { name: 'Trade messages' }).textContent()).includes(MESSAGE), 'encrypted peer chat');
  assert.equal(fixture.counts.sends, 0);
  await prepare(seller, first, 'funding');
  await seller.page.getByRole('button', { name: 'Cancel review', exact: true }).click();
  assert.equal(fixture.counts.sends, 0); await prepare(seller, first, 'funding'); await confirm(seller);
  await fixture.mine(); await refresh(seller); await refresh(buyer); await state(seller.page, first, 'funded'); await state(buyer.page, first, 'funded');
  assert.equal(await trade(seller.page, first).getByRole('button', { name: 'Review release', exact: true }).isEnabled(), false);
  await trade(seller.page, first).getByRole('checkbox').check(); await prepare(seller, first, 'release'); await confirm(seller);
  await fixture.mine(); await refresh(seller); await state(seller.page, first, 'released');
  assert.equal(decodeTrade(await fixture.rpc('eth_call', [{ to: fixture.escrow, data: buildGetTrade(fixture.escrow, first).data }, 'latest'])).state, 'released');
  pass('explicit funding and bank-receipt release reach the real escrow; cancelled review and chat alone send nothing');

  const second = await negotiate(seller, buyer, '20000000000000000');
  await prepare(seller, second, 'funding'); seller.provider.state.loseNextSend = true; await confirm(seller);
  await seller.page.getByRole('alert').filter({ hasText: 'BROADCAST_UNKNOWN' }).waitFor();
  assert.ok((await trade(seller.page, second).textContent()).includes('broadcast-unknown'));
  const oldId = await profileId(seller.page), beforeRestore = fixture.counts.sends;
  const [download] = await Promise.all([seller.page.waitForEvent('download'), seller.page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click()]);
  const backup = await readFile(await download.path());
  for (const privateText of [PAYMENT, MESSAGE]) assert.equal(backup.toString().includes(privateText), false);
  await seller.close(); await fixture.mine();
  const restored = await party(0, RESTORED_PASS);
  await restored.page.getByText('Restore an encrypted backup', { exact: true }).click();
  await restored.page.getByLabel('Encrypted backup file', { exact: true }).setInputFiles({ name: 'profile.backup.json', mimeType: 'application/json', buffer: backup });
  await restored.page.getByLabel('Backup source passphrase', { exact: true }).fill(PASS);
  await restored.page.getByLabel('Restored profile passphrase', { exact: true }).fill(RESTORED_PASS);
  await restored.page.getByRole('button', { name: 'Restore to a fresh profile', exact: true }).click();
  await restored.page.locator('[data-private="localnet-profile"]').waitFor();
  assert.notEqual(await profileId(restored.page), oldId); assert.equal(fixture.counts.sends, beforeRestore);
  await connect(restored); await state(restored.page, second, 'funded'); assert.equal(fixture.counts.sends, beforeRestore);
  assert.equal(await trade(restored.page, second).getByRole('button', { name: 'Review funding', exact: true }).isEnabled(), false);
  assert.ok((await trade(restored.page, first).getByRole('list', { name: 'Trade messages' }).textContent()).includes(MESSAGE));
  pass('unknown broadcast survives encrypted backup into an independent fresh-key profile and reconciles without a resend; prior encrypted chat survives');
  const deadline = await trade(restored.page, second).locator('dt').filter({ hasText: 'Refund deadline' }).evaluate(element => element.nextElementSibling.textContent.split(' ')[0]);
  await fixture.rpc('evm_setNextBlockTimestamp', [Number(deadline) + 1]); await fixture.mine(); await refresh(restored);
  await prepare(restored, second, 'refund'); await confirm(restored); await fixture.mine(); await refresh(restored); await state(restored.page, second, 'refunded');
  assert.equal(decodeTrade(await fixture.rpc('eth_call', [{ to: fixture.escrow, data: buildGetTrade(fixture.escrow, second).data }, 'latest'])).state, 'refunded');
  assert.equal(fixture.counts.sends, beforeRestore + 1); assert.equal(markers, fixture.counts.sends);
  await restored.page.getByRole('button', { name: 'Lock profile', exact: true }).click();
  await restored.page.locator('[data-private]').waitFor({ state: 'hidden' });
  const locked = await restored.page.locator('body').textContent(); assert.equal(locked.includes(PAYMENT), false); assert.equal(locked.includes(MESSAGE), false);
  const wire = JSON.stringify(fixture.relay.events);
  for (const privateText of [PAYMENT, MESSAGE, ...fixture.accounts, 'sellerNonce', 'terms-accept']) assert.equal(wire.includes(privateText), false);
  assert.deepEqual(unexpected, []);
  pass('refund follows native chain expiry after restore; every send has an IndexedDB marker and lock removes private views without network leakage');
  console.log(JSON.stringify({ ok: true, kind: 'LOCAL_BROWSER_PROOF', engine: browser.version(), checks: checks.length, ...fixture.counts, durableMarkers: markers, ReleaseEnabled: 0,
    externalWallet: 'Node-hosted public Anvil fixture; physical wallet compatibility not tested', publicTestnetQualification: false }, null, 2));
} catch (error) {
  for (const page of pages) { try { console.error((await page.locator('body').innerText()).slice(0, 6000)); } catch { /* Page already closed. */ } }
  throw error;
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fixture?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
