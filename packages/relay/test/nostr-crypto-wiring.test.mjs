// Composition test: the relay pool and order book with the real packages/nostr-crypto EventCrypto instead of the
// test double. packages/relay/src itself still imports no crypto (asserted in pool.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayPool } from '../src/pool.ts';
import { createAdEvent, createDeletionEvent, createOrderBook, adKey } from '../src/ad.ts';
import { createLocalNobleNostrProvider } from '../../nostr-crypto/src/provider.ts';
import { createRelayEventCrypto } from '../../nostr-crypto/src/relay-event-crypto.ts';
import { startFakeRelay } from './support/fake-relay.mjs';
import { adFor, AD_KIND, FAST, makeBroker, makeKey, memoryNetwork, NOW, ORDER, signWith, until, loopbackRelayFixture } from './support/harness.mjs';

const filter = () => ({ kinds: [AD_KIND], '#t': ['p2p-offramp-ad-v1'], since: NOW - 3600, limit: 50 });
const key = Uint8Array.from(Buffer.from('7f'.repeat(31) + '01', 'hex'));
const real = () => createRelayEventCrypto(createLocalNobleNostrProvider(), key);

test('real nostr-crypto signs an ad that the pool publishes, a second pool discovers and the order book accepts', async () => {
  const fake = await startFakeRelay();
  const crypto = await real();
  const fixture = loopbackRelayFixture([fake]);
  const publisher = createRelayPool({ broker: makeBroker({ endpointURLs: fixture.endpointURLs }).broker, relays: fixture.relays, connect: fixture.connect, verifier: crypto, timing: FAST, nowSeconds: () => NOW });
  const reader = createRelayPool({ broker: makeBroker({ endpointURLs: fixture.endpointURLs }).broker, relays: fixture.relays, connect: fixture.connect, verifier: crypto, timing: FAST, nowSeconds: () => NOW });
  try {
    const ad = await createAdEvent(crypto, adFor({ maker: crypto.pubkey }), NOW);
    assert.equal(ad.pubkey, crypto.pubkey);
    assert.deepEqual(await publisher.publish(ad), { ok: true, value: [{ eventId: ad.id, relayId: 'relay-a', status: 'accepted' }] });
    const book = createOrderBook({ nowSeconds: () => NOW + 1, verifier: crypto });
    reader.subscribe([filter()], { onEvent: e => book.ingest(e) });
    await until(() => book.size === 1);
    assert.equal(book.list()[0].ad.maker, crypto.pubkey);
    const del = await createDeletionEvent(crypto, crypto.pubkey, ORDER, NOW + 2);
    assert.equal((await publisher.publish(del)).value[0].status, 'accepted');
    assert.equal(book.ingest(del), 'accepted');
    assert.equal(book.revalidate(adKey(crypto.pubkey, ORDER)).ok, false);
  } finally { publisher.close(); reader.close(); crypto.dispose(); await fake.stop(); }
});

test('with the real verifier a forged event is never delivered and penalizes the relay; a genuine one is delivered once', async () => {
  const crypto = await real();
  const net = memoryNetwork(); const { broker } = makeBroker();
  const pool = createRelayPool({ broker, relays: [{ endpointId: 'relay-a', url: 'wss://fixture.example/' }], verifier: crypto, connect: net.connector, nowSeconds: () => NOW, timing: FAST });
  try {
    const got = [];
    pool.subscribe([filter()], { onEvent: e => got.push(e.id) });
    await until(() => pool.status()[0].state === 'open');
    const sock = net.sockets[0]; const subId = sock.sent.find(m => m[0] === 'REQ')[1];
    const genuine = await createAdEvent(crypto, adFor({ maker: crypto.pubkey }), NOW);
    const forged = signWith(makeKey('mallory'), { kind: AD_KIND, created_at: NOW, tags: genuine.tags, content: genuine.content });
    sock.deliver(JSON.stringify(['EVENT', subId, { ...forged, pubkey: crypto.pubkey }]));
    sock.deliver(JSON.stringify(['EVENT', subId, genuine]));
    sock.deliver(JSON.stringify(['EVENT', subId, genuine]));
    // Verification is synchronous, so each frame is fully handled inside deliver(): no waiting needed or allowed.
    assert.deepEqual(got, [genuine.id], 'forged event dropped; genuine delivered once despite the duplicate');
    const status = pool.status()[0];
    assert.equal(status.penalty, 4, 'one invalid-signature penalty, below the ban threshold (reason is recorded on ban)');
    assert.equal(status.state, 'open');
    assert.deepEqual(await pool.publish({ ...genuine, content: genuine.content + ' ' }), { ok: false, error: 'INVALID_FILTER' }, 'tampered events are refused before any send');
  } finally { pool.close(); crypto.dispose(); }
});

test('a disposed signer cannot produce new ads, while the pool keeps verifying with public data only', async () => {
  const crypto = await real();
  const ad = await createAdEvent(crypto, adFor({ maker: crypto.pubkey }), NOW);
  crypto.dispose();
  await assert.rejects(createAdEvent(crypto, adFor({ maker: crypto.pubkey, revision: 2 }), NOW + 1), e => e?.code === 'UNAUTHORIZED');
  assert.equal(crypto.verifyEvent(ad), true);
});
