import test from 'node:test';
import assert from 'node:assert/strict';
import { adKey, createOrderBook, MAX_RETAINED_ORDERS, validateAdEvent } from '../src/ad.ts';
import { NOW, seller, sellerCrypto, signedAd } from './support/harness.mjs';

test('independent clock controls preserve epoch, future-skew and exact expiry boundaries', async () => {
  const epoch = await signedAd({ expiresAtSeconds: '1' }, 0);
  assert.equal(validateAdEvent(epoch, 0).ok, true);
  assert.deepEqual(validateAdEvent(epoch, 1), { ok: false, reason: 'EXPIRED' });
  const current = await signedAd({ expiresAtSeconds: String(NOW + 600) });
  assert.equal(validateAdEvent(current, NOW - 120).ok, true);
  assert.deepEqual(validateAdEvent(current, NOW - 121), { ok: false, reason: 'FUTURE' });
  assert.equal(validateAdEvent(current, NOW + 599).ok, true);
  assert.deepEqual(validateAdEvent(current, NOW + 600), { ok: false, reason: 'EXPIRED' });
});

test('independent clock inputs cannot obtain freshness through JavaScript coercion', async () => {
  const current = await signedAd();
  let coercions = 0;
  const boxed = { valueOf() { coercions++; return NOW; } };
  for (const clock of [null, String(NOW), BigInt(NOW), Symbol('clock'), boxed, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(validateAdEvent(current, clock), { ok: false, reason: 'INVALID' });
  }
  assert.equal(coercions, 0);
  assert.deepEqual(validateAdEvent(current, Number.MAX_SAFE_INTEGER), { ok: false, reason: 'EXPIRED' });
});

test('independent default capacity actually retains only 1000 distinct valid advertisements', async () => {
  const book = createOrderBook({ nowSeconds: () => NOW, verifier: sellerCrypto });
  let newest;
  for (let index = 0; index <= MAX_RETAINED_ORDERS; index++) {
    const event = await signedAd({
      orderId: index.toString(16).padStart(64, '0'), expiresAtSeconds: String(NOW + 600 + index),
    });
    assert.equal(book.ingest(event), 'accepted');
    assert.ok(book.size <= MAX_RETAINED_ORDERS);
    newest = event;
  }
  assert.equal(book.size, MAX_RETAINED_ORDERS);
  assert.equal(book.list().length, MAX_RETAINED_ORDERS);
  assert.deepEqual(book.revalidate(adKey(seller.pubkey, '0'.repeat(64))), { ok: false, reason: 'unknown' });
  assert.equal(book.revalidate(adKey(seller.pubkey, MAX_RETAINED_ORDERS.toString(16).padStart(64, '0'))).ok, true);
  assert.equal(book.ingest(newest), 'duplicate');
  assert.equal(book.size, MAX_RETAINED_ORDERS);
  assert.ok(book.list().every(entry => entry.authority === 'relay-discovery-only'));
});

test('independent captured capacity preserves expiry eviction and later option changes', async () => {
  let clock = NOW;
  const options = { nowSeconds: () => clock, verifier: sellerCrypto, maxOrders: 2 };
  const book = createOrderBook(options);
  options.maxOrders = Infinity;
  const first = await signedAd({ orderId: '1'.repeat(64), expiresAtSeconds: String(NOW + 1) });
  const second = await signedAd({ orderId: '2'.repeat(64), expiresAtSeconds: String(NOW + 600) });
  const third = await signedAd({ orderId: '3'.repeat(64), expiresAtSeconds: String(NOW + 1200) });
  assert.equal(book.ingest(first), 'accepted');
  assert.equal(book.ingest(second), 'accepted');
  clock++;
  assert.equal(book.ingest(third), 'accepted');
  assert.equal(book.size, 2);
  assert.equal(book.revalidate(adKey(seller.pubkey, '2'.repeat(64))).ok, true);
  assert.equal(book.revalidate(adKey(seller.pubkey, '3'.repeat(64))).ok, true);
  assert.deepEqual(book.revalidate(adKey(seller.pubkey, '1'.repeat(64))), { ok: false, reason: 'unknown' });
  const fourth = await signedAd({ orderId: '4'.repeat(64), expiresAtSeconds: String(NOW + 1800) });
  assert.equal(book.ingest(fourth), 'accepted');
  assert.equal(book.size, 2, 'later option mutation cannot enlarge the captured bound');
  assert.deepEqual(book.revalidate(adKey(seller.pubkey, '2'.repeat(64))), { ok: false, reason: 'unknown' });
  assert.equal(book.revalidate(adKey(seller.pubkey, '3'.repeat(64))).ok, true);
  assert.equal(book.revalidate(adKey(seller.pubkey, '4'.repeat(64))).ok, true);
});
