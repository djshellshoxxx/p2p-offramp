import test from 'node:test';
import assert from 'node:assert/strict';
import { AD_KIND, adKey, adTags, createAdEvent, createDeletionEvent, createOrderBook, parseAdContent, serializeAd, validateAdEvent, DELETION_KIND, MAX_AD_LIFETIME_SECONDS } from '../src/ad.ts';
import { adFor, makeKey, NOW, ORDER, seller, sellerCrypto, signedAd, signWith } from './support/harness.mjs';

const book = (now = NOW, extra = {}) => { const clock = { now }; const b = createOrderBook({ nowSeconds: () => clock.now, verifier: sellerCrypto, ...extra }); return { b, clock }; };
const KEY = adKey(seller.pubkey, ORDER);

test('ad event carries only public metadata with fixed tags and the chosen kind', async () => {
  const event = await signedAd();
  assert.equal(event.kind, 30078); assert.equal(AD_KIND, 30078);
  assert.deepEqual(event.tags, [['d', `p2p-offramp:v1:${ORDER}`], ['t', 'p2p-offramp-ad-v1'], ['expiration', String(NOW + 1800)]]);
  assert.deepEqual(Object.keys(JSON.parse(event.content)).sort(), ['amountMax', 'amountMin', 'app', 'assetId', 'currency', 'expiresAtSeconds', 'maker', 'networkId', 'orderId', 'railClass', 'revision', 'v']);
  assert.doesNotMatch(event.content, /iban|account|reference|location|termsDigest|price/i);
  assert.equal(serializeAd(JSON.parse(event.content)), event.content);
});

test('strict content parser rejects unknown keys, floats, bad ranges and oversized content', () => {
  const ok = adFor();
  assert.ok(parseAdContent(JSON.stringify(ok)));
  for (const bad of [{ ...ok, extra: 1 }, { ...ok, amountMin: '1.5' }, { ...ok, amountMin: '600000000' }, { ...ok, amountMin: '0' }, { ...ok, currency: 'eur' },
    { ...ok, railClass: 'iban' }, { ...ok, revision: 0 }, { ...ok, revision: 1.5 }, { ...ok, v: 2 }, { ...ok, maker: 'zz' }, { ...ok, amountMax: '1'.repeat(40) }, { ...ok, bank: 'DE00' }]) {
    assert.equal(parseAdContent(JSON.stringify(bad)), null, JSON.stringify(bad));
  }
  const { maker, ...missing } = ok; assert.equal(parseAdContent(JSON.stringify(missing)), null);
  assert.equal(parseAdContent(JSON.stringify({ ...ok, assetId: 'x'.repeat(2100) })), null);
  assert.equal(parseAdContent('not json'), null);
});

const raw = (over, createdAt = NOW) => { const ad = adFor(over); return signWith(seller, { kind: AD_KIND, created_at: createdAt, tags: adTags(ad), content: serializeAd(ad) }); };
test('lifetime is capped at 3600 s, tags must match content, future-dated and already-expired ads are refused', async () => {
  assert.equal(validateAdEvent(await signedAd({ expiresAtSeconds: String(NOW + MAX_AD_LIFETIME_SECONDS) }), NOW).ok, true);
  await assert.rejects(signedAd({ expiresAtSeconds: String(NOW + MAX_AD_LIFETIME_SECONDS + 1) }), /INVALID_AD/, 'builder refuses over-long ads');
  assert.deepEqual(validateAdEvent(raw({ expiresAtSeconds: String(NOW + MAX_AD_LIFETIME_SECONDS + 1) }), NOW), { ok: false, reason: 'LIFETIME' });
  assert.deepEqual(validateAdEvent(raw({ expiresAtSeconds: String(NOW) }), NOW), { ok: false, reason: 'LIFETIME' });
  assert.deepEqual(validateAdEvent(await signedAd(), NOW + 1800), { ok: false, reason: 'EXPIRED' });
  assert.deepEqual(validateAdEvent(await signedAd({}, NOW + 500), NOW), { ok: false, reason: 'FUTURE' });
  const good = await signedAd();
  const retag = (tags) => signWith(seller, { kind: AD_KIND, created_at: NOW, tags, content: good.content });
  assert.equal(validateAdEvent(retag([['d', `p2p-offramp:v1:${'b'.repeat(64)}`], ['t', 'p2p-offramp-ad-v1'], ['expiration', String(NOW + 1800)]]), NOW).ok, false);
  assert.equal(validateAdEvent(retag([['d', `p2p-offramp:v1:${ORDER}`], ['t', 'p2p-offramp-ad-v1'], ['expiration', String(NOW + 3000)]]), NOW).ok, false);
  assert.equal(validateAdEvent(retag([...good.tags, ['alt', 'x']]), NOW).ok, false);
  assert.equal(validateAdEvent(signWith(seller, { kind: 1, created_at: NOW, tags: good.tags, content: good.content }), NOW).ok, false);
});

test('book accepts, dedupes, orders by revision, and is not decided by created_at', async () => {
  const { b } = book();
  const r1 = await signedAd({ revision: 1 }), r2 = await signedAd({ revision: 2, amountMax: '900000000' }, NOW + 5), r3 = await signedAd({ revision: 3 }, NOW + 6);
  assert.equal(b.ingest(r2), 'accepted');
  assert.equal(b.ingest(r2), 'duplicate');
  assert.equal(b.ingest(r1), 'stale-revision', 'older revision cannot replace, even if replayed later');
  assert.equal(b.list()[0].ad.revision, 2);
  assert.equal(b.ingest(r3), 'replaced');
  assert.equal(b.size, 1);
  // A higher revision wins even with an older created_at than the current event.
  const r4 = await signedAd({ revision: 4 }, NOW - 100); assert.equal(b.ingest(r4), 'replaced');
  assert.equal(b.list()[0].ad.revision, 4);
});

test('same revision with a different event id is a conflict that blocks use until a higher revision', async () => {
  const { b } = book();
  const a = await signedAd({ revision: 1 }), c = await signedAd({ revision: 1, amountMax: '400000000' });
  assert.notEqual(a.id, c.id);
  assert.equal(b.ingest(a), 'accepted');
  assert.equal(b.ingest(c), 'conflict');
  assert.deepEqual(b.revalidate(KEY), { ok: false, reason: 'conflict' });
  assert.equal(b.list().length, 0);
  assert.equal(b.ingest(a), 'duplicate');
  assert.equal(b.ingest(await signedAd({ revision: 2 })), 'replaced');
  assert.equal(b.revalidate(KEY).ok, true);
});

test('expiry: expired ads vanish from the list and fail revalidation; unknown clock blocks everything', async () => {
  const { b, clock } = book();
  assert.equal(b.ingest(await signedAd()), 'accepted');
  assert.equal(b.revalidate(KEY).ok, true);
  clock.now = NOW + 1799; assert.equal(b.revalidate(KEY).ok, true);
  clock.now = NOW + 1800; assert.deepEqual(b.revalidate(KEY), { ok: false, reason: 'expired' });
  assert.equal(b.list().length, 0); assert.equal(b.size, 0);
  assert.equal(b.ingest(await signedAd()), 'expired', 'signed already-expired offer');
  clock.now = null; assert.deepEqual(b.revalidate(KEY), { ok: false, reason: 'clock-unknown' });
  assert.equal(b.ingest(await signedAd({ revision: 9 }, NOW - 10)), 'clock-unknown');
  clock.now = NaN; assert.equal(b.list().length, 0);
});

test('clock skew: a quickly advancing local clock expires early; a lagging one still honours the signed expiry on revalidate', async () => {
  const { b, clock } = book();
  b.ingest(await signedAd()); clock.now = NOW - 60;
  assert.equal(b.revalidate(KEY).ok, true, 'earlier local clock does not extend the signed expiry');
  clock.now = NOW + 2000; assert.equal(b.revalidate(KEY).ok, false);
});

test('forged or unverifiable events are rejected by the book when a verifier is supplied', async () => {
  const { b } = book();
  const event = await signedAd();
  assert.equal(b.ingest({ ...event, sig: '0'.repeat(128) }), 'invalid');
  assert.equal(b.ingest({ ...event, content: event.content.replace('EUR', 'USD') }), 'invalid');
  assert.equal(b.ingest({ ...event, extra: 1 }), 'invalid');
  assert.equal(b.ingest('garbage'), 'invalid');
  assert.equal(b.size, 0);
});

test('NIP-09 deletion is best effort: honoured for the same author, ignored from others, and later revisions survive', async () => {
  const { b } = book();
  const ad = await signedAd({ revision: 1 });
  b.ingest(ad);
  const del = await createDeletionEvent(sellerCrypto, seller.pubkey, ORDER, NOW + 10);
  assert.equal(del.kind, DELETION_KIND);
  assert.deepEqual(del.tags, [['a', `30078:${seller.pubkey}:p2p-offramp:v1:${ORDER}`], ['k', '30078']]);
  const forged = signWith(makeKey('other'), { kind: 5, created_at: NOW + 10, tags: del.tags, content: '' });
  assert.equal(b.ingest(forged), 'invalid', 'a deletion signed by another key cannot target this author');
  assert.equal(b.revalidate(KEY).ok, true);
  assert.equal(b.ingest(del), 'accepted');
  assert.deepEqual(b.revalidate(KEY), { ok: false, reason: 'unknown' });
  assert.equal(b.ingest(ad), 'deleted', 'a relay replaying the old ad cannot resurrect it');
  assert.equal(b.ingest(await signedAd({ revision: 2 }, NOW + 11)), 'accepted', 'a later republish is a new ad');
});

test('capacity: 1001 orders evict the soonest-expiring entry and the book stays bounded', async () => {
  const { b } = book(NOW, { maxOrders: 5 });
  for (let i = 0; i < 6; i++) {
    const ev = await signedAd({ orderId: String(i).repeat(64), expiresAtSeconds: String(NOW + 600 + i) });
    assert.equal(b.ingest(ev), 'accepted');
  }
  assert.equal(b.size, 5);
  assert.equal(b.revalidate(adKey(seller.pubkey, '0'.repeat(64))).ok, false);
  assert.equal(b.revalidate(adKey(seller.pubkey, '5'.repeat(64))).ok, true);
});

test('list order is deterministic: amountMin as integer, ties by event id; outputs are labelled discovery-only and frozen', async () => {
  const { b } = book();
  const big = await signedAd({ orderId: '1'.repeat(64), amountMin: '9' }), small = await signedAd({ orderId: '2'.repeat(64), amountMin: '10', amountMax: '10' });
  b.ingest(big); b.ingest(small);
  assert.deepEqual(b.list().map(x => x.ad.amountMin), ['9', '10'], 'numeric not lexicographic');
  for (const item of b.list()) { assert.equal(item.authority, 'relay-discovery-only'); assert.ok(Object.isFrozen(item)); assert.ok(Object.isFrozen(item.ad)); }
});

test('advertisement maker must be the signing author, at construction and discovery validation', async()=>{
 const other=makeKey('different-maker');
 await assert.rejects(signedAd({maker:other.pubkey}),/INVALID_AD/);
 const ad=adFor({maker:other.pubkey});
 const wrong=signWith(seller,{kind:AD_KIND,created_at:NOW,tags:adTags(ad),content:serializeAd(ad)});
 assert.equal(sellerCrypto.verifyEvent(wrong),true,'signature itself is valid');
 assert.deepEqual(validateAdEvent(wrong,NOW),{ok:false,reason:'INVALID'});
 const {b}=book();assert.equal(b.ingest(wrong),'invalid');assert.equal(b.list().length,0);
});


test('ad builder snapshots the maker before signing and rejects hostile signer output without reading getters', async () => {
  const ad = { ...adFor() };
  const event = await createAdEvent({ async signEvent(unsigned) {
    ad.maker = makeKey('late-maker').pubkey;
    return sellerCrypto.signEvent(unsigned);
  } }, ad, NOW);
  assert.equal(event.pubkey, seller.pubkey);
  assert.equal(JSON.parse(event.content).maker, seller.pubkey);
  let reads = 0;
  const valid = await signedAd();
  const hostile = { ...valid };
  Object.defineProperty(hostile, 'pubkey', { enumerable: true, get() { reads++; throw new Error('foreign detail'); } });
  await assert.rejects(createAdEvent({ signEvent: async () => hostile }, adFor(), NOW), /^Error: INVALID_AD$/);
  assert.equal(reads, 0);
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  await assert.rejects(createAdEvent({ signEvent: async () => ({ ...valid, tags: revoked.proxy }) }, adFor(), NOW), /^Error: INVALID_AD$/);
  const input = { ...adFor() };
  Object.defineProperty(input, 'maker', { enumerable: true, get() { reads++; return seller.pubkey; } });
  await assert.rejects(createAdEvent(sellerCrypto, input, NOW), /^Error: INVALID_AD$/);
  assert.equal(reads, 0);
});
