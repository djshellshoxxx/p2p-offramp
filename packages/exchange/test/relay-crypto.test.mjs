import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalNobleNostrProvider } from '../../nostr-crypto/src/provider.ts';
import { createNostrEventCrypto } from '../src/relay-crypto.ts';
import { createRelayPool } from '../../relay/src/pool.ts';
import { createAdEvent, createOrderBook, AD_KIND } from '../../relay/src/ad.ts';
import { startFakeRelay } from '../../relay/test/support/fake-relay.mjs';
import { makeBroker, FAST, NOW, ORDER, until } from '../../relay/test/support/harness.mjs';

const provider = createLocalNobleNostrProvider();
const pair = await provider.generate();
const crypto = createNostrEventCrypto({ provider, secretKey: pair.secretKey });
const adFor = (over = {}) => ({ app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:8453', assetId: 'erc20:usdc', amountMin: '10000000', amountMax: '500000000',
  currency: 'EUR', railClass: 'bank-transfer', expiresAtSeconds: String(NOW + 1800), maker: pair.publicKey, ...over });

test('adapter signs with the identity provider and verifies synchronously; tampering fails closed', async () => {
  const event = await createAdEvent(crypto, adFor(), NOW);
  assert.equal(event.pubkey, pair.publicKey);
  assert.equal(crypto.verifyEvent(event), true);
  assert.equal(crypto.verifyEvent({ ...event, content: event.content + ' ' }), false);
  assert.equal(crypto.verifyEvent({ ...event, sig: 'f'.repeat(128) }), false);
  assert.equal(crypto.verifyEvent({ ...event, id: '0'.repeat(64) }), false);
  assert.equal(crypto.verifyEvent({ ...event, extra: 1 }), false);
  assert.equal(crypto.verifyEvent(null), false);
  assert.equal(crypto.verifyEvent({ ...event, tags: [['d', '\u0001']] }), false);
});

test('adapter requires a provider with sync verification and wipes on dispose', async () => {
  assert.throws(() => createNostrEventCrypto({ provider: { ...provider, verifySchnorrSync: undefined }, secretKey: pair.secretKey }));
  const other = await provider.generate();
  const mine = createNostrEventCrypto({ provider, secretKey: other.secretKey });
  assert.equal((await mine.signEvent({ kind: 1, created_at: NOW, tags: [], content: 'x' })).pubkey, other.publicKey);
  mine.dispose();
  await assert.rejects(mine.signEvent({ kind: 1, created_at: NOW, tags: [], content: 'x' }));
});

test('relay pool + order book run against the fake relay with REAL nostr-crypto (no test double)', async () => {
  const fake = await startFakeRelay();
  let pool;
  try {
    const ad = await createAdEvent(crypto, adFor(), NOW);
    const forged = { ...ad, id: 'e'.repeat(64) };
    fake.events.push(forged, ad);
    pool = createRelayPool({ broker: makeBroker().broker, relays: [{ endpointId: 'relay-a', url: fake.wsUrl }], verifier: crypto, timing: FAST, nowSeconds: () => NOW });
    const got = [];
    assert.equal(pool.subscribe([{ kinds: [AD_KIND], '#t': ['p2p-offramp-ad-v1'], since: NOW - 3600, limit: 50 }], { onEvent: e => got.push(e), onEose: () => got.push('eose') }).ok, true);
    await until(() => got.includes('eose'));
    assert.deepEqual(got.filter(g => g !== 'eose').map(e => e.id), [ad.id], 'forged id never reaches the handler');
    const book = createOrderBook({ nowSeconds: () => NOW, verifier: crypto });
    assert.equal(book.ingest(got[0]), 'accepted');
    const result = await pool.publish(await createAdEvent(crypto, adFor({ orderId: 'b'.repeat(64) }), NOW));
    assert.equal(result.ok, true); assert.equal(result.value[0].status, 'accepted');
    assert.equal((await pool.publish({ ...ad, sig: '0'.repeat(128) })).ok, false);
  } finally { pool?.close(); await fake.stop(); }
});
