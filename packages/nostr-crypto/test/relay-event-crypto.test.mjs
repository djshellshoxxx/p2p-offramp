import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalNobleNostrProvider } from '../src/provider.ts';
import { createRelayEventCrypto } from '../src/relay-event-crypto.ts';
import * as ev from '../src/event.ts';

const provider = createLocalNobleNostrProvider();
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
const code = expected => error => { assert.equal(error?.name, 'NostrCryptoError', String(error)); assert.equal(error.code, expected); return true; };
const secretHex = '0000000000000000000000000000000000000000000000000000000000000003';
const template = { kind: 30078, created_at: 1700000000, tags: [['d', 'p2p-offramp:v1:' + 'a'.repeat(64)], ['t', 'p2p-offramp-ad-v1']], content: '{"v":1}' };

test('signs through the provider with the G01 key; the event verifies synchronously and through the async provider path', async () => {
  const crypto = await createRelayEventCrypto(provider, bytes(secretHex));
  assert.equal(crypto.pubkey, await provider.publicKey(bytes(secretHex)));
  const event = await crypto.signEvent(template);
  assert.equal(event.pubkey, crypto.pubkey);
  assert.equal(event.id, ev.computeEventId(crypto.pubkey, template));
  assert.equal(crypto.verifyEvent(event), true);
  assert.deepEqual(ev.verifyEventSync(event), event);
  assert.deepEqual(await ev.verifyEvent(event, provider), event);
  assert.ok(Object.isFrozen(event));
});

test('verifyEvent returns false, never throws, for tampered, forged, non-canonical, NIP-04 or exotic input', async () => {
  const crypto = await createRelayEventCrypto(provider, bytes(secretHex));
  const event = await crypto.signEvent(template);
  const other = await (await createRelayEventCrypto(provider, bytes('0'.repeat(63) + '5'))).signEvent(template);
  const flip = (hex, at) => hex.slice(0, at) + (hex[at] === '0' ? '1' : '0') + hex.slice(at + 1);
  const cases = [
    { ...event, content: event.content + ' ' },                 // id no longer matches
    { ...event, sig: flip(event.sig, 10) },                     // bad signature
    { ...event, sig: other.sig },                               // valid signature by another key over another id
    { ...event, pubkey: other.pubkey },                         // id recomputation fails
    { ...event, id: event.id.toUpperCase() },                   // not lowercase hex
    { ...event, extra: 1 },                                     // extra key
    Object.assign(Object.create({ inherited: 1 }), event),      // non-plain prototype
    Object.defineProperty({ ...event }, 'content', { get: () => event.content, enumerable: true }), // getter
    null, undefined, 'event', [], 42,
  ];
  for (const input of cases) assert.equal(crypto.verifyEvent(input), false);
  const nip04 = await crypto.signEvent({ ...template, kind: 1 }).then(e => ({ ...e, kind: 4 }));
  assert.equal(crypto.verifyEvent(nip04), false, 'NIP-04 is rejected even before signature work');
  await assert.rejects(crypto.signEvent({ ...template, kind: 4 }), code('UNSUPPORTED_VERSION'));
});

test('a proxy is read once through its exact own data properties; the verified event is a fresh frozen copy', async () => {
  // Proxies have Object.prototype and exact own data keys here, so the strict record() check reads them once.
  // The returned event is a fresh frozen object: later trap behaviour cannot change what was verified.
  const crypto = await createRelayEventCrypto(provider, bytes(secretHex));
  const event = await crypto.signEvent(template);
  let reads = 0; const proxy = new Proxy({ ...event }, { getOwnPropertyDescriptor(target, key) { reads++; return Reflect.getOwnPropertyDescriptor(target, key); } });
  const verified = ev.verifyEventSync(proxy);
  assert.ok(Object.isFrozen(verified)); assert.notEqual(verified, proxy); assert.ok(reads > 0);
});

test('the adapter holds its own key copy; caller mutation after creation has no effect', async () => {
  const caller = bytes(secretHex);
  const crypto = await createRelayEventCrypto(provider, caller);
  caller.fill(0);
  const event = await crypto.signEvent(template);
  assert.equal(event.pubkey, await provider.publicKey(bytes(secretHex)));
  assert.equal(crypto.verifyEvent(event), true);
});

test('creation refuses invalid keys and non-byte input without retaining anything', async () => {
  for (const key of [new Uint8Array(32), bytes('ff'.repeat(32)), new Uint8Array(31), 'k'.repeat(32), null, Array(32).fill(1)]) {
    await assert.rejects(createRelayEventCrypto(provider, key), code('INVALID_INPUT'));
  }
});

test('dispose wipes the key: later signing fails UNAUTHORIZED, an in-flight signature is refused, verification still works', async () => {
  const crypto = await createRelayEventCrypto(provider, bytes(secretHex));
  const before = await crypto.signEvent(template);
  const inflight = crypto.signEvent({ ...template, created_at: template.created_at + 1 });
  crypto.dispose();
  await assert.rejects(inflight, code('UNAUTHORIZED'));
  await assert.rejects(crypto.signEvent(template), code('UNAUTHORIZED'));
  crypto.dispose();
  assert.equal(crypto.verifyEvent(before), true, 'verification needs only public data');
});

test('a slow provider that completes after dispose cannot publish under the released key', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const slow = Object.freeze({ ...provider, async signSchnorr(message, key) { await gate; return provider.signSchnorr(message, key); } });
  const crypto = await createRelayEventCrypto(slow, bytes(secretHex));
  const pending = crypto.signEvent(template);
  crypto.dispose(); release();
  await assert.rejects(pending, code('UNAUTHORIZED'));
});

test('a provider that signs with a different key than it reported is refused', async () => {
  const otherKey = bytes('0'.repeat(63) + '5');
  const lying = Object.freeze({ ...provider, publicKey: async key => provider.publicKey(key), async signSchnorr(message) { return provider.signSchnorr(message, otherKey); } });
  const crypto = await createRelayEventCrypto(lying, bytes(secretHex));
  await assert.rejects(crypto.signEvent(template), code('INTEGRITY_FAILURE'));
});
