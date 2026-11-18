import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayPool, POOL_LIMITS } from '../src/pool.ts';
import { AD_KIND, FAST, makeBroker, memoryNetwork, NOW, until } from './support/harness.mjs';

// Delivery accounting is per logical subscription (NIP-01): one subscription's history never suppresses another's.
const filter = () => ({ kinds: [AD_KIND], '#t': ['p2p-offramp-ad-v1'], since: NOW - 3600, limit: 50 });
const fake = i => ({ id: i.toString(16).padStart(64, '0'), pubkey: 'b'.repeat(64), created_at: NOW, kind: AD_KIND,
  tags: [['t', 'p2p-offramp-ad-v1']], content: '', sig: 'c'.repeat(128) });
const stateOf = (pool, id) => pool.status().find(s => s.endpointId === id);

function harness(endpointIds) {
  const net = memoryNetwork();
  const { broker } = makeBroker({ endpoints: endpointIds });
  const verified = [];
  let clock = 0;
  const relays = endpointIds.map(endpointId => ({ endpointId, url: 'wss://fixture.example/' }));
  const pool = createRelayPool({ broker, relays,
    verifier: { verifyEvent: event => { verified.push(event.id); return true; } }, connect: net.connector,
    nowSeconds: () => NOW, clock: () => clock, timing: FAST });
  // Advancing the monotonic clock keeps every relay's token bucket refilled.
  const send = (socket, subId, event) => { clock += 600; socket.deliver(JSON.stringify(['EVENT', subId, event])); };
  return { net, pool, send, verified };
}
const counter = () => { const got = []; return { got, handlers: { onEvent: event => { got.push(event.id); } } }; };

test('an event delivered to one subscription is still delivered once to an overlapping subscription', async () => {
  const { net, pool, send, verified } = harness(['relay-a']);
  try {
    const a = counter(), b = counter();
    const subA = pool.subscribe([filter()], a.handlers).value;
    const subB = pool.subscribe([filter()], b.handlers).value;
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    const socket = net.sockets[0], event = fake(1);
    send(socket, subA.id, event);
    send(socket, subB.id, event);
    assert.deepEqual(a.got, [event.id]);
    assert.deepEqual(b.got, [event.id], 'subscription B receives the event A already received');
    send(socket, subA.id, event);
    send(socket, subB.id, event);
    assert.deepEqual(a.got, [event.id], 'same-subscription duplicate stays suppressed');
    assert.deepEqual(b.got, [event.id], 'same-subscription duplicate stays suppressed');
    assert.equal(verified.length, 2, 'a suppressed duplicate does no signature work');
  } finally { pool.close(); }
});

test('a recreated subscription receives requested history that an earlier subscription already saw', async () => {
  const { net, pool, send } = harness(['relay-a']);
  try {
    const first = counter(), second = counter();
    const keep = pool.subscribe([filter()], counter().handlers).value;
    const subA = pool.subscribe([filter()], first.handlers).value;
    await until(() => stateOf(pool, 'relay-a').state === 'open');
    const socket = net.sockets[0], event = fake(2);
    send(socket, subA.id, event);
    subA.close();
    const subB = pool.subscribe([filter()], second.handlers).value;
    send(socket, subB.id, event);
    assert.deepEqual(first.got, [event.id]);
    assert.deepEqual(second.got, [event.id], 'retained history is replayed to the new subscription');
    keep.close();
  } finally { pool.close(); }
});

test('closing a subscription frees its dedupe entries so they cannot evict another subscription\'s', async () => {
  const ids = ['relay-0', 'relay-1', 'relay-2', 'relay-3'];
  const { net, pool, send } = harness(ids);
  try {
    const noisy = counter(), quiet = counter();
    const subA = pool.subscribe([filter()], noisy.handlers).value;
    const subB = pool.subscribe([filter()], quiet.handlers).value;
    await until(() => ids.every(id => stateOf(pool, id).state === 'open'));
    const marker = fake(0);
    send(net.sockets[0], subB.id, marker);
    // A fills the shared cap from four relays (each relay accepts maxEventsPerSubscription per subscription).
    let next = 1;
    for (const socket of net.sockets) {
      for (let i = 0; i < POOL_LIMITS.maxEventsPerSubscription; i++) send(socket, subA.id, fake(next++));
    }
    assert.equal(noisy.got.length, 4 * POOL_LIMITS.maxEventsPerSubscription);
    subA.close();
    for (let i = 0; i < 200; i++) send(net.sockets[1], subB.id, fake(next++));
    const retained = 4 * POOL_LIMITS.maxEventsPerSubscription + 200 + 1;
    assert.ok(retained > POOL_LIMITS.maxDedupIds, 'without freeing, the marker would be evicted');
    send(net.sockets[2], subB.id, marker);
    assert.equal(quiet.got.filter(id => id === marker.id).length, 1, 'B still dedupes its own earlier event');
    assert.equal(quiet.got.length, 201);
  } finally { pool.close(); }
});

test('verification cannot deliver or penalize after retiring its subscription, transport or pool', async () => {
  for (const retirement of ['subscription', 'transport', 'pool']) for (const verification of ['valid', 'invalid', 'throw']) {
    const net = memoryNetwork(), { broker } = makeBroker({ endpoints: ['relay-a'] });
    let subscription, deliveries = 0;
    const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], connect: net.connector,
      nowSeconds: () => NOW, timing: FAST, verifier: { verifyEvent() {
        if (retirement === 'subscription') subscription.close();
        else if (retirement === 'transport') broker.dispose();
        else pool.close();
        if (verification === 'throw') throw new Error('fixture verification failure');
        return verification === 'valid';
      } } });
    try {
      subscription = pool.subscribe([filter()], { onEvent() { deliveries++; } }).value;
      await until(() => stateOf(pool, 'relay-a').state === 'open');
      net.sockets[0].deliver(JSON.stringify(['EVENT', subscription.id, fake(100)]));
      assert.equal(deliveries, 0, `${retirement} retirement suppresses the ${verification} result`);
      assert.equal(stateOf(pool, 'relay-a').penalty, 0, 'retired verification cannot penalize the relay');
    } finally { pool.close(); }
  }
});
