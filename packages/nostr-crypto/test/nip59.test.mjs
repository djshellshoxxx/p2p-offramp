import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalNobleNostrProvider } from '../src/provider.ts';
import * as ev from '../src/event.ts';
import * as nip44 from '../src/nip44.ts';
import * as nip59 from '../src/nip59.ts';

const base = createLocalNobleNostrProvider();
const code = expected => error => { assert.equal(error?.name, 'NostrCryptoError', String(error)); assert.equal(error.code, expected); return true; };
const NOW = 1_800_000_000;
async function party() { const pair = await base.generate(); return { secret: pair.secretKey, pub: pair.publicKey }; }
/** Spy provider: records every generated one-time secret and every conversation key so the test can check wiping. */
function spy() {
  const generated = [], keys = [];
  return { generated, keys, provider: Object.freeze({ ...base, async generate() { const pair = await base.generate(); generated.push(pair.secretKey); return pair; }, async conversationKey(s, p) { const key = await base.conversationKey(s, p); keys.push(key); return key; } }) };
}
const rumorFor = (author, extra = {}) => ev.createUnsignedEvent(author.pub, { kind: 14, created_at: NOW, tags: [['p', 'f'.repeat(64)]], content: 'hello', ...extra });

test('rumor -> seal -> gift wrap round trip with layer invariants', async () => {
  const alice = await party(), bob = await party(), s = spy();
  const rumor = rumorFor(alice);
  const seal = await nip59.createSeal(rumor, alice.secret, bob.pub, s.provider, NOW);
  assert.equal(seal.kind, 13); assert.equal(seal.pubkey, alice.pub); assert.deepEqual(seal.tags, []);
  const wrap = await nip59.createGiftWrap(seal, bob.pub, s.provider, NOW);
  assert.equal(wrap.kind, 1059); assert.deepEqual(wrap.tags, [['p', bob.pub]]); assert.notEqual(wrap.pubkey, alice.pub);
  for (const event of [seal, wrap]) assert.ok(event.created_at <= NOW && event.created_at >= NOW - nip59.TIMESTAMP_WINDOW_SECONDS);
  assert.equal(s.generated.length, 1); assert.ok(s.generated[0].every(byte => byte === 0), 'one-time wrap secret wiped');
  assert.ok(s.keys.length === 2 && s.keys.every(key => key.every(byte => byte === 0)), 'conversation keys wiped');
  const opened = await nip59.unwrapGiftWrap(JSON.parse(JSON.stringify(wrap)), bob.secret, s.provider, { now: NOW });
  assert.deepEqual(opened.rumor, rumor); assert.equal(opened.seal.id, seal.id);
  assert.ok(s.keys.length === 4 && s.keys.every(key => key.every(byte => byte === 0)));
});

test('each wrap uses a fresh one-time key and timestamps spread across the 2-day window', async () => {
  const alice = await party(), bob = await party();
  const seal = await nip59.createSeal(rumorFor(alice), alice.secret, bob.pub, base, NOW);
  const wraps = await Promise.all(Array.from({ length: 24 }, () => nip59.createGiftWrap(seal, bob.pub, base, NOW)));
  assert.equal(new Set(wraps.map(w => w.pubkey)).size, 24);
  const times = wraps.map(w => w.created_at);
  assert.ok(times.every(t => t <= NOW && t >= NOW - 172800)); assert.ok(new Set(times).size > 20);
  assert.throws(() => nip59.randomizedTimestamp(1.5), code('INVALID_INPUT'));
});

test('wrong recipient, forged seal author, tampering and wrong kinds are rejected', async () => {
  const alice = await party(), bob = await party(), mallory = await party();
  const wrap = await nip59.createGiftWrap(await nip59.createSeal(rumorFor(alice), alice.secret, bob.pub, base, NOW), bob.pub, base, NOW);
  await assert.rejects(nip59.unwrapGiftWrap(wrap, mallory.secret, base, { now: NOW }), code('UNAUTHORIZED'));
  // Mallory signs a seal that contains a rumor claiming Alice's key.
  const claimed = rumorFor(alice);
  const key = await base.conversationKey(mallory.secret, bob.pub);
  const forgedSeal = await ev.signEvent({ kind: 13, created_at: NOW, tags: [], content: nip44.encrypt(JSON.stringify(claimed), key) }, mallory.secret, base);
  await assert.rejects(nip59.unwrapGiftWrap(await nip59.createGiftWrap(forgedSeal, bob.pub, base, NOW), bob.secret, base, { now: NOW }), code('UNAUTHORIZED'));
  await assert.rejects(nip59.createSeal(claimed, mallory.secret, bob.pub, base, NOW), code('UNAUTHORIZED'));
  // Seal with tags, seal of wrong kind, NIP-04 payload inside a wrap, tampered outer content, future-dated wrap.
  const taggedSeal = await ev.signEvent({ kind: 13, created_at: NOW, tags: [['p', bob.pub]], content: 'x' }, alice.secret, base);
  await assert.rejects(nip59.createGiftWrap(taggedSeal, bob.pub, base, NOW), code('LIMIT_EXCEEDED'));
  const eph = await party(), ephKey = await base.conversationKey(eph.secret, bob.pub);
  const wrapOf = async (inner, extra = {}) => ev.signEvent({ kind: 1059, created_at: NOW, tags: [['p', bob.pub]], content: nip44.encrypt(JSON.stringify(inner), ephKey), ...extra }, eph.secret, base);
  const kind4 = await ev.signEvent({ kind: 1, created_at: NOW, tags: [], content: 'x' }, alice.secret, base);
  await assert.rejects(nip59.unwrapGiftWrap(await wrapOf({ ...kind4, kind: 4 }), bob.secret, base, { now: NOW }), code('UNSUPPORTED_VERSION'));
  await assert.rejects(nip59.unwrapGiftWrap(await wrapOf(kind4), bob.secret, base, { now: NOW }), code('INVALID_INPUT'));
  await assert.rejects(nip59.unwrapGiftWrap(await wrapOf(taggedSeal), bob.secret, base, { now: NOW }), code('LIMIT_EXCEEDED'));
  await assert.rejects(nip59.unwrapGiftWrap(await wrapOf(taggedSeal, { created_at: NOW + 3600 }), bob.secret, base, { now: NOW }), code('INVALID_INPUT'));
  await assert.rejects(nip59.unwrapGiftWrap(await wrapOf(taggedSeal, { tags: [['p', bob.pub], ['p', mallory.pub]] }), bob.secret, base, { now: NOW }), code('UNAUTHORIZED'));
  await assert.rejects(nip59.unwrapGiftWrap({ ...wrap, kind: 4 }, bob.secret, base, { now: NOW }), code('UNSUPPORTED_VERSION'));
  await assert.rejects(nip59.unwrapGiftWrap({ ...wrap, content: wrap.content.slice(0, -4) + 'AAA=' }, bob.secret, base, { now: NOW }), code('INTEGRITY_FAILURE'));
  const resigned = await ev.signEvent({ kind: 1059, created_at: NOW, tags: [['p', bob.pub]], content: wrap.content }, eph.secret, base);
  await assert.rejects(nip59.unwrapGiftWrap(resigned, bob.secret, base, { now: NOW }), code('INTEGRITY_FAILURE'), 'payload bound to the original one-time key');
  const signedRumor = await ev.signEvent({ kind: 14, created_at: NOW, tags: [], content: 'x' }, alice.secret, base);
  const sealOfSigned = await ev.signEvent({ kind: 13, created_at: NOW, tags: [], content: nip44.encrypt(JSON.stringify(signedRumor), await base.conversationKey(alice.secret, bob.pub)) }, alice.secret, base);
  await assert.rejects(nip59.unwrapGiftWrap(await wrapOf(sealOfSigned), bob.secret, base, { now: NOW }), code('INVALID_INPUT'), 'rumor must be unsigned');
});
