import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayPool } from '../src/pool.ts';
import { FAST, NOW, AD_KIND, makeBroker, memoryNetwork, sellerCrypto, signedAd, until, wait, loopbackRelayFixture } from './support/harness.mjs';

const filter = { kinds: [AD_KIND], since: NOW - 60, limit: 10 };
const ignored = { onEvent() {} };

test('read and publication pass the same canonical registered WSS URL to capture and the connector', async () => {
  const { broker } = makeBroker(), net = memoryNetwork(), captured = [], methods = [], destinations = [];
  const port = {
    authorize(request) { methods.push(request.method); return broker.authorize(request); },
    capture(permit, options) { captured.push(options.expectedURL); return broker.capture(permit, options); },
  };
  const connect = (url, signal) => {
    destinations.push(url); assert.equal(signal.aborted, false);
    const socket = net.connector(), original = socket.send;
    socket.send = function(text) {
      original.call(this, text); const message = JSON.parse(text);
      if (message[0] === 'EVENT') queueMicrotask(() => this.deliver(JSON.stringify(['OK', message[1].id, true, ''])));
    };
    return socket;
  };
  const pool = createRelayPool({ broker: port, relays: [{ endpointId: 'relay-a', url: 'WSS://FIXTURE.EXAMPLE:443' }], connect,
    verifier: sellerCrypto, timing: FAST, nowSeconds: () => NOW });
  try {
    assert.equal(pool.subscribe([filter], ignored).ok, true); await until(() => pool.status()[0].state === 'open');
    const published = await pool.publish(await signedAd()); assert.equal(published.value[0].status, 'accepted');
    assert.deepEqual(methods, ['read', 'publish']);
    assert.deepEqual(captured, ['wss://fixture.example/', 'wss://fixture.example/']); assert.deepEqual(destinations, captured);
  } finally { pool.close(); broker.dispose(); }
});

test('mismatched relay origin, port, path and query fail both reads and publications without connector calls or retries', async () => {
  const ad = await signedAd();
  for (const url of ['wss://other.example/', 'wss://fixture.example:444/', 'wss://fixture.example/private', 'wss://fixture.example/?secret=not-approved']) {
    const { broker } = makeBroker(), net = memoryNetwork();
    const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url }], connect: net.connector, verifier: sellerCrypto, timing: FAST, nowSeconds: () => NOW });
    try {
      pool.subscribe([filter], ignored); await until(() => pool.status()[0].state === 'blocked');
      assert.equal(pool.status()[0].reason, 'INVALID_ENDPOINT');
      assert.equal((await pool.publish(ad)).value[0].status, 'unknown');
      await wait(20); assert.equal(net.attempts, 0); assert.equal(pool.status()[0].failures, 0);
    } finally { pool.close(); broker.dispose(); }
  }
});

test('non-WSS, credential, fragment and malformed relay candidates never reach authorization or connector', async () => {
  const ad = await signedAd();
  for (const url of ['ws://127.0.0.1:1234/', 'https://fixture.example/', 'wss:fixture.example', 'wss://u:p@fixture.example/', 'wss://@fixture.example/',
    'wss://fixture.example/#', 'wss://fixture.example/#fragment', ' wss://fixture.example/', 'wss://fixture.example/\n', 'wss://fixture.example\\path']) {
    let authorized = 0; const { broker } = makeBroker(), net = memoryNetwork();
    const port = { authorize(request) { authorized++; return broker.authorize(request); }, capture: (...args) => broker.capture(...args) };
    const pool = createRelayPool({ broker: port, relays: [{ endpointId: 'relay-a', url }], connect: net.connector, verifier: sellerCrypto, timing: FAST, nowSeconds: () => NOW });
    try {
      pool.subscribe([filter], ignored); await until(() => pool.status()[0].state === 'blocked');
      assert.equal((await pool.publish(ad)).value[0].status, 'unknown'); assert.equal(authorized, 0); assert.equal(net.attempts, 0);
    } finally { pool.close(); broker.dispose(); }
  }
});

test('default WebSocket connector uses the bound canonical WSS argument without scheme fallback', async t => {
  const { broker } = makeBroker(), net = memoryNetwork(), destinations = [];
  // Intercept construction only: this test proves the default constructor argument, not actual TLS.
  t.mock.method(globalThis, 'WebSocket', function(url) { destinations.push(url); return net.connector(); });
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://FIXTURE.example:443' }], verifier: sellerCrypto, timing: FAST, nowSeconds: () => NOW });
  try { pool.subscribe([filter], ignored); await until(() => pool.status()[0].state === 'open'); assert.deepEqual(destinations, ['wss://fixture.example/']); }
  finally { pool.close(); broker.dispose(); }
});

test('loopback fixtures register logical destinations independently and refuse caller-chosen routing', () => {
  const owned = { wsUrl: 'ws://127.0.0.1:32123/' }, fixture = loopbackRelayFixture([owned]);
  owned.wsUrl = 'ws://attacker.invalid:80/';
  assert.deepEqual(fixture.endpointURLs, { 'relay-a': 'wss://relay-a.fixture.invalid/' });
  assert.equal(Object.isFrozen(fixture.relays), true); assert.equal(Object.isFrozen(fixture.endpointURLs), true);
  assert.throws(() => fixture.connect('ws://127.0.0.1:32123/', new AbortController().signal), /Unregistered/);
  assert.throws(() => loopbackRelayFixture([{ wsUrl: 'ws://attacker.invalid/' }]), /Invalid owned/);
});
