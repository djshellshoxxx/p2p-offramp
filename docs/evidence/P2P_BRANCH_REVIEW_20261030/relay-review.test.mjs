// Independent lifecycle review: actual relay pool + transport policy + schemas.
// Event signatures are fixtures; this is not a cryptographic or real-relay test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { SessionTransportPolicy } = await import(pathToFileURL(resolve('packages/transport/src/policy.ts')).href);
const { createRelayPool } = await import(pathToFileURL(resolve('packages/relay/src/pool.ts')).href);

function fixture(onStatus) {
  const registry = {
    inspect: channel => ({ channel, coverage: 'verified-private', adapterId: 'fixture', expiresAt: 1e15 }),
    subscribeInvalidation: () => () => {},
    capture(request, owner) {
      let live = true;
      return { owner, snapshot: () => ({ version: 1, request: { ...request },
        endpoint: { id: 'r1', channel: 'relay', url: 'wss://fixture.example/', adapterId: 'fixture', methods: ['read', 'publish'] },
        evidence: registry.inspect('relay'), directConsent: true }),
        current: candidate => live && candidate === owner,
        subscribeInvalidation: () => () => {}, dispose: () => { live = false; } };
    },
  };
  const broker = new SessionTransportPolicy({ trustedRegistry: registry }); broker.setMode('strict');
  const sockets = [];
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'r1', url: 'wss://fixture.example/' }],
    verifier: { verifyEvent: () => true }, nowSeconds: () => 100,
    timing: { connectTimeoutMs: 250, publishTimeoutMs: 250 },
    onStatus: status => onStatus?.(status, broker),
    connect: () => { const socket = { onopen: null, onclose: null, onerror: null, onmessage: null,
      sent: [], closed: false, send(value) { this.sent.push(JSON.parse(value)); }, close() { this.closed = true; } };
      sockets.push(socket); return socket; },
  });
  return { pool, broker, sockets };
}
const event = { id: 'a'.repeat(64), pubkey: 'b'.repeat(64), created_at: 100, kind: 30078, tags: [], content: '{}', sig: 'c'.repeat(128) };
test('review: abort after open resolution retains ownership and sends no EVENT', async () => {
  const f = fixture(), controller = new AbortController();
  try {
    const pending = f.pool.publish(event, controller.signal);
    assert.equal(f.sockets.length, 1);
    f.sockets[0].onopen({}); controller.abort();
    const result = await pending;
    assert.equal(result.ok, true); assert.equal(result.value[0].status, 'unknown');
    assert.equal(f.sockets[0].closed, true); assert.equal(f.sockets[0].sent.length, 0);
  } finally { f.pool.close(); f.broker.dispose(); }
});
test('review: revocation from open status observer precedes subscription send', async () => {
  const f = fixture((status, broker) => { if (status[0].state === 'open') broker.dispose(); });
  try {
    const sub = f.pool.subscribe([{ kinds: [30078], since: 90, limit: 1 }], { onEvent() {} });
    assert.equal(sub.ok, true); f.sockets[0].onopen({}); await setImmediate();
    assert.equal(f.sockets[0].closed, true); assert.equal(f.sockets[0].sent.length, 0);
    assert.notEqual(f.pool.status()[0].state, 'open');
  } finally { f.pool.close(); f.broker.dispose(); }
});
test('review: close after send settles unknown and late ACK cannot upgrade it', async () => {
  const f = fixture();
  try {
    const pending = f.pool.publish(event);
    f.sockets[0].onopen({}); await setImmediate();
    assert.equal(f.sockets[0].sent.length, 1);
    const late = f.sockets[0].onmessage; f.pool.close();
    late?.({ data: JSON.stringify(['OK', event.id, true, 'late']) });
    const result = await pending;
    assert.equal(result.ok, true); assert.equal(result.value[0].status, 'unknown'); assert.equal(f.sockets[0].closed, true);
  } finally { f.pool.close(); f.broker.dispose(); }
});
