/** Native IndexedDB/CAS + real NIP-17 crypto proof. Private loopback fixture, not a shipping chat UI. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(resolve(tmpdir(), 'p2p-chat-browser-'));
const PASS = 'private synthetic native chat fixture passphrase';
let browser, server;
try {
  const modules = new Set();
  await build({ configFile: false, logLevel: 'warn', plugins: [{ name: 'isolated-history-proof', generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') for (const [name, info] of Object.entries(chunk.modules)) if (info.renderedLength) modules.add(name);
  } }], build: { outDir: output, emptyOutDir: true, target: 'es2023', minify: false, sourcemap: false,
    lib: { entry: resolve(root, 'scripts/fixtures/chat-history-browser.mjs'), formats: ['es'], fileName: () => 'fixture.js' } } });
  assert.ok([...modules].some(name => name.endsWith('/packages/messaging/src/durable-chat.ts')));
  assert.equal([...modules].some(name => /apps\/web|packages\/(?:wallet|exchange|chain-evm)/.test(name)), false);
  const bundle = await readFile(resolve(output, 'fixture.js'));
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'");
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Private encrypted history proof</title>'); return; }
    if (path === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); return; }
    response.writeHead(404); response.end();
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' }); let unexpected = 0, pageErrors = 0;
  await context.addInitScript(() => { window.walletCalls = 0; window.ethereum = { request() { window.walletCalls++; throw Error('No wallet in history fixture'); } }; });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ['/', '/fixture.js'].includes(url.pathname)) return route.continue();
    unexpected++; return route.abort();
  });
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  for (const page of pages) { page.on('pageerror', () => pageErrors++); await page.goto(origin); }
  async function initialize(page, identity) {
    return page.evaluate(async ({ identity, pass }) => {
      const api = await import('/fixture.js'); window.api = api; window.pass = pass;
      window.provider = api.createLocalNobleNostrProvider(); window.store = new api.IndexedDbVaultStore();
      window.vault = new api.EncryptedVaultService(window.store, crypto, { lifecycle: false });
      const value = result => { if (!result.ok) throw Error(result.error.code); return result.value; }; window.value = value;
      if (!identity) {
        const alice = await window.provider.generate(), bob = await window.provider.generate();
        window.session = value(await window.vault.create(pass));
        identity = { profileId: window.session.profileId, alicePublic: alice.publicKey, bobPublic: bob.publicKey,
          aliceSecret: Array.from(alice.secretKey), bobSecret: Array.from(bob.secretKey) };
        alice.secretKey.fill(0); bob.secretKey.fill(0);
      } else window.session = value(await window.vault.unlock(identity.profileId, pass));
      window.identity = identity;
      window.binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'basic-v1', tradeId: 'ab'.repeat(32) };
      window.openChat = () => value(api.createDurableTradeChat({ vault: window.vault, session: window.session, provider: window.provider,
        binding: window.binding, participants: [identity.alicePublic, identity.bobPublic], selfPublicKey: identity.alicePublic,
        now: () => 1800000000, nowMs: () => 5000 }));
      window.chat = window.openChat();
      window.envelope = (id, from = identity.alicePublic, to = identity.bobPublic) => value(api.encodeMessage({ format: 'p2p-offramp-message', version: 1,
        binding: window.binding, termsHash: window.binding.tradeId, messageId: id.repeat(16), sender: from, recipient: to,
        kind: 'text', createdAt: 100, body: 'private native IndexedDB history note' }));
      window.reopen = async () => { window.chat.close(); window.vault.lockAll(); window.session = value(await window.vault.unlock(identity.profileId, pass)); window.chat = window.openChat(); };
      window.list = () => window.chat.list(new Uint8Array(identity.aliceSecret));
      return identity;
    }, { identity, pass: PASS });
  }
  const identity = await initialize(pages[0]); await initialize(pages[1], identity);
  const raced = await Promise.all(pages.map(page => page.evaluate(() => window.chat.send(window.envelope('11'), new Uint8Array(window.identity.aliceSecret)))));
  assert.equal(raced.filter(result => result.ok).length, 1, 'native IndexedDB CAS admits one append');
  assert.ok(raced.some(result => !result.ok && ['CONFLICT', 'LOCKED'].includes(result.error.code)));
  await Promise.all(pages.map(page => page.evaluate(() => window.reopen())));
  for (const page of pages) {
    const view = await page.evaluate(async () => window.value(await window.list()));
    assert.equal(view.messages.length, 1); assert.equal(view.messages[0].receivedSequence, 1); assert.equal(view.messages[0].message.body, 'private native IndexedDB history note');
  }
  // Authenticate an inbound message too; the relay-like input is an actual fresh NIP-59 gift wrap.
  const inbound = await pages[0].evaluate(async () => {
    const { api, identity, binding, provider, value } = window;
    const bob = value(api.createTradeChat({ binding, participants: [identity.alicePublic, identity.bobPublic], selfPublicKey: identity.bobPublic, provider, now: () => 1800000000 }));
    try { return value(await bob.send(new TextDecoder().decode(window.envelope('22', identity.bobPublic, identity.alicePublic)), new Uint8Array(identity.bobSecret))).recipientWrap; }
    finally { bob.close(); }
  });
  const firstInbound = await pages[0].evaluate(async wrap => window.chat.receive(wrap, new Uint8Array(window.identity.aliceSecret)), inbound);
  assert.equal(firstInbound.ok, true); assert.equal(firstInbound.value.receivedSequence, 2);
  await pages[0].reload(); await initialize(pages[0], identity);
  const replay = await pages[0].evaluate(async wrap => {
    const before = JSON.stringify(await window.store.get(window.identity.profileId));
    const receipt = window.value(await window.chat.receive(wrap, new Uint8Array(window.identity.aliceSecret)));
    return { receipt, unchanged: before === JSON.stringify(await window.store.get(window.identity.profileId)), count: window.value(await window.list()).messages.length };
  }, inbound);
  assert.equal(replay.receipt.duplicate, true); assert.equal(replay.unchanged, true); assert.equal(replay.count, 2);
  const restored = await pages[0].evaluate(async wrap => {
    const { api, value, store, vault, identity, binding, provider, pass } = window;
    const original = JSON.stringify(await store.get(identity.profileId)), sourceKey = (await store.get(identity.profileId)).keyId;
    const backup = new api.EncryptedBackupService(store);
    try {
      const exported = await backup.exportWithStatus(identity.profileId), receipt = await backup.restore(exported.bytes, pass, pass);
      const session = value(await vault.unlock(receipt.newProfileId, pass));
      const fresh = value(api.createDurableTradeChat({ vault, session, provider, binding, participants: [identity.alicePublic, identity.bobPublic], selfPublicKey: identity.alicePublic, now: () => 1800000000 }));
      try {
        const duplicate = value(await fresh.receive(wrap, new Uint8Array(identity.aliceSecret))), view = value(await fresh.list(new Uint8Array(identity.aliceSecret)));
        const wrong = await fresh.list(new Uint8Array(identity.bobSecret));
        const row = await store.get(receipt.newProfileId);
        vault.lockAll(); const locked = await fresh.list(new Uint8Array(identity.aliceSecret));
        return { sourceUnchanged: original === JSON.stringify(await store.get(identity.profileId)), freshProfile: receipt.newProfileId !== identity.profileId,
          freshKey: sourceKey !== row.keyId, revision: row.revision, count: view.messages.length, duplicate: duplicate.duplicate,
          wrongKey: wrong.ok ? 'unexpected' : wrong.error.code, locked: locked.ok ? 'unexpected' : locked.error.code,
          ciphertextOnly: !JSON.stringify(await store.get(identity.profileId)).includes('private native IndexedDB history note') };
      } finally { fresh.close(); }
    } finally { backup.dispose(); }
  }, inbound);
  assert.deepEqual(restored, { sourceUnchanged: true, freshProfile: true, freshKey: true, revision: 0, count: 2,
    duplicate: true, wrongKey: 'UNAUTHORIZED', locked: 'LOCKED', ciphertextOnly: true });
  const surfaces = await pages[0].evaluate(async () => ({ walletCalls: window.walletCalls, localStorage: localStorage.length,
    sessionStorage: sessionStorage.length, caches: (await caches.keys()).length, serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length }));
  assert.deepEqual(Object.values(surfaces), [0, 0, 0, 0, 0]); assert.equal(unexpected, 0); assert.equal(pageErrors, 0);
  console.log(JSON.stringify({ fixture: 'native-encrypted-chat-history', browser: browser.version(), nativeTwoTabCas: true,
    reloadDurableDedup: true, nativeProofReauthentication: true, freshKeyRestore: restored, surfaces,
    unexpectedRequests: unexpected, pageErrors, appIncluded: false, releaseEnabled: false }));
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(output, { recursive: true, force: true });
}
