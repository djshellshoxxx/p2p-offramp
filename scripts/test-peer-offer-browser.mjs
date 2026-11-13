// Standalone canonical G19/G21 discovery evidence. No Pages UI, private terms exchange or wallet is involved.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from 'vite';
import { startFakeRelay } from '../packages/relay/test/support/fake-relay.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const scenario = JSON.parse(await readFile(new URL('../packages/domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const terms = scenario.sets.native.terms;
const fields = {
  orderId: terms.orderId, revision: Number(terms.revision), networkId: terms.networkId, assetId: terms.assetKind,
  amountMin: terms.amountBaseUnits, amountMax: terms.amountBaseUnits, currency: 'USD', railClass: 'bank-transfer',
};
const artifact = await build({ configFile: false, logLevel: 'error', build: {
  write: false, target: 'es2023', lib: { entry: fileURLToPath(new URL('./fixtures/peer-offer-browser.mjs', import.meta.url)), formats: ['es'] },
} });
const entry = artifact[0].output.find(output => output.type === 'chunk' && output.isEntry);
assert.ok(entry, 'Vite emitted the peer fixture module');

const relay = await startFakeRelay();
const server = createServer((req, res) => {
  if (req.url === '/peer.mjs') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(entry.code);
  } else if (req.url === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src " + relay.wsUrl,
    }).end('<!doctype html><title>Local relay discovery fixture</title>');
  } else {
    res.writeHead(404).end();
  }
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const unexpectedDestinations = [];
  browser = await chromium.launch({ executablePath: resolveChromiumPath() });
  async function isolatedPage() {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpectedDestinations.push(route.request().url());
      return route.abort();
    });
    // Let the one approved socket use the real network. Intercept and reject any other destination.
    await context.routeWebSocket(url => url.href !== new URL(relay.wsUrl).href, socket => {
      unexpectedDestinations.push(socket.url());
      socket.close();
    });
    const page = await context.newPage();
    await page.goto(origin);
    return page;
  }
  const seller = await isolatedPage();
  const buyer = await isolatedPage();
  await seller.evaluate(() => localStorage.setItem('peer-isolation-check', 'seller'));
  assert.equal(await buyer.evaluate(() => localStorage.getItem('peer-isolation-check')), null);

  const sent = await seller.evaluate(async ({ fields, relayUrl }) => {
    const { publishOffer } = await import('/peer.mjs');
    return publishOffer(fields, relayUrl);
  }, { fields, relayUrl: relay.wsUrl });
  assert.deepEqual(sent.acknowledgments, [{ eventId: sent.eventId, relayId: 'relay-a', status: 'accepted' }]);
  const discover = orderId => buyer.evaluate(async ({ orderId, relayUrl }) => {
    const { discoverOrder } = await import('/peer.mjs');
    return discoverOrder(orderId, relayUrl);
  }, { orderId, relayUrl: relay.wsUrl });

  // The fake relay returns every stored event, including for this unrelated subscription.
  assert.deepEqual(await discover('ff'.repeat(32)), []);
  const offers = await discover(fields.orderId);
  assert.equal(offers.length, 1, 'buyer received one matching, signed offer');
  const [received] = offers;
  assert.equal(received.eventId, sent.eventId);
  assert.equal(received.author, sent.author);
  assert.equal(received.authority, 'relay-discovery-only');
  assert.deepEqual(received.ad, { app: 'p2p-offramp', v: 1, ...fields, maker: sent.author, expiresAtSeconds: String(received.createdAt + 600) });
  assert.equal(relay.events.length, 1);
  assert.equal(relay.events[0].id, received.eventId);
  assert.deepEqual(JSON.parse(relay.events[0].content), received.ad, 'only the expected public fields were published');
  assert.equal(relay.received.filter(frame => frame[0] === 'REQ').length, 2);
  assert.deepEqual(unexpectedDestinations, []);
  console.log('PASS: isolated Chromium peers verified one matching signed offer over loopback and rejected the unrelated order.');
} finally {
  try { await browser?.close(); } finally {
    server.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), relay.stop()]);
  }
}
