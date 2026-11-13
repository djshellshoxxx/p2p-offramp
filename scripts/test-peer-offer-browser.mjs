// Standalone canonical G19/G21 discovery evidence. No Pages UI, private terms exchange or wallet is involved.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, firefox, webkit } from 'playwright-core';
import { build } from 'vite';
import { matchesFilters } from '../packages/relay/index.ts';
import { startFakeRelay } from '../packages/relay/test/support/fake-relay.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const { values } = parseArgs({ options: { browser: { type: 'string', default: 'chromium' } } });
const engine = [chromium, firefox, webkit].find(candidate => candidate.name() === values.browser);
if (!engine) throw new Error('Expected --browser=chromium, --browser=firefox or --browser=webkit');

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

// The existing relay fixture handles storage, history replay, EOSE and publication ACKs.
const relay = await startFakeRelay({
  onMessage(_sender, [kind, event], relay) {
    if (kind !== 'EVENT') return;
    for (const connection of relay.conns) {
      for (const [subId, filters] of connection.subs) {
        if (matchesFilters(event, filters)) connection.send(JSON.stringify(['EVENT', subId, event]));
      }
    }
  },
});
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
  browser = await engine.launch(engine === chromium ? { executablePath: resolveChromiumPath() } : {});
  const version = engine.name() + ' ' + browser.version();
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

  const subscribe = orderId => buyer.evaluateHandle(async ({ orderId, relayUrl }) => {
    const { subscribeToOrder } = await import('/peer.mjs');
    return subscribeToOrder(orderId, relayUrl);
  }, { orderId, relayUrl: relay.wsUrl });
  const stop = async subscription => {
    try { await subscription.evaluate(peer => peer.close()); }
    finally { await subscription.dispose(); }
  };
  const discover = async orderId => {
    const subscription = await subscribe(orderId);
    try { return await subscription.evaluate(peer => peer.offers()); }
    finally { await stop(subscription); }
  };

  // The browser resolves subscribe() only after EOSE. Keep that connection open through publication.
  const live = await subscribe(fields.orderId);
  try {
    assert.deepEqual(await live.evaluate(peer => peer.offers()), []);
    assert.equal(relay.received.filter(frame => frame[0] === 'REQ').length, 1);
    const [liveConnection] = relay.conns;
    const [liveSubscriptionId] = liveConnection.subs.keys();

    const sent = await seller.evaluate(async ({ fields, relayUrl }) => {
      const { publishOffer } = await import('/peer.mjs');
      return publishOffer(fields, relayUrl);
    }, { fields, relayUrl: relay.wsUrl });
    assert.deepEqual(sent.acknowledgments, [{ eventId: sent.eventId, relayId: 'relay-a', status: 'accepted' }]);
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
    console.log(version, 'PASS: stored offer was verified and unrelated order was filtered.');
    await buyer.waitForFunction(peer => peer.offers().length === 1, live, { timeout: 5_000 });
    assert.deepEqual(await live.evaluate(peer => peer.offers()), offers);
    assert.ok(relay.conns.has(liveConnection) && liveConnection.subs.has(liveSubscriptionId),
      'the original buyer socket and subscription stayed active');
    assert.equal(relay.received.filter(frame => frame[0] === 'REQ').length, 3,
      'the live buyer never re-subscribed to fetch stored history');
    assert.deepEqual(unexpectedDestinations, []);
    console.log(version, 'PASS: the pre-existing buyer subscription received the same signed offer live.');
  } finally {
    await stop(live);
  }
} finally {
  try { await browser?.close(); } finally {
    server.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), relay.stop()]);
  }
}
