import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { schnorr } from '@noble/curves/secp256k1.js';
import { createLocalNobleIdentityProvider } from '../../identity/index.ts';
import { createLocalNobleNostrProvider } from '../src/provider.ts';
import * as ev from '../src/event.ts';
import { NostrCryptoError } from '../src/bytes.ts';

const provider = createLocalNobleNostrProvider();
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
const hex = data => Buffer.from(data).toString('hex');
const code = expected => error => { assert.equal(error?.name, 'NostrCryptoError', String(error)); assert.equal(error.code, expected); return true; };
const secret = bytes('0000000000000000000000000000000000000000000000000000000000000003');
const template = { kind: 1, created_at: 1700000000, tags: [['e', 'a'.repeat(64)], ['p', 'b'.repeat(64), 'wss://relay.invalid']], content: 'hi "there"\n\\ 🤝' };

test('provider keeps the G01 identity interface and adds BIP340 and ECDH', async () => {
  const identity = createLocalNobleIdentityProvider();
  assert.equal(provider.id, identity.id);
  assert.equal(await provider.publicKey(secret), await identity.publicKey(secret));
  const pair = await provider.generate(); assert.equal(pair.publicKey, await identity.publicKey(pair.secretKey)); pair.secretKey.fill(0);
  assert.equal(Object.isFrozen(provider), true);
  await assert.rejects(provider.signSchnorr(new Uint8Array(31), secret), code('INVALID_INPUT'));
  await assert.rejects(provider.signSchnorr(new Uint8Array(32), new Uint8Array(32)), code('INVALID_INPUT'));
  assert.equal(await provider.verifySchnorr(new Uint8Array(64), new Uint8Array(32), new Uint8Array(32)), false);
});

test('official BIP340 vectors with 32-byte messages verify through the provider', async () => {
  const rows = readFileSync(new URL('../../identity/test/fixtures/bip340-test-vectors.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split(','));
  let count = 0;
  for (const row of rows) {
    if (row[4].length !== 64) continue;
    assert.equal(await provider.verifySchnorr(bytes(row[5]), bytes(row[4]), bytes(row[2])), row[6] === 'TRUE', `vector ${row[0]}`); count++;
    if (row[1]) { const sig = await provider.signSchnorr(bytes(row[4]), bytes(row[1])); assert.equal(schnorr.verify(sig, bytes(row[4]), bytes(row[2])), true); }
  }
  assert.equal(count, 15);
});

test('NIP-01 id is SHA-256 of the canonical array and the signature verifies independently', async () => {
  const event = await ev.signEvent(template, secret, provider);
  const pubkey = hex(schnorr.getPublicKey(secret));
  const canonical = `[0,"${pubkey}",1700000000,1,[["e","${'a'.repeat(64)}"],["p","${'b'.repeat(64)}","wss://relay.invalid"]],"hi \\"there\\"\\n\\\\ 🤝"]`;
  assert.equal(ev.serializeEvent(pubkey, template), canonical);
  assert.equal(event.id, createHash('sha256').update(canonical, 'utf8').digest('hex'));
  assert.equal(schnorr.verify(bytes(event.sig), bytes(event.id), bytes(pubkey)), true);
  assert.deepEqual(await ev.verifyEvent(JSON.parse(JSON.stringify(event)), provider), event);
  assert.equal(Object.isFrozen(event) && Object.isFrozen(event.tags) && Object.isFrozen(event.tags[0]), true);
});

test('strict parse rejects every malformed or hostile event shape', async () => {
  const good = JSON.parse(JSON.stringify(await ev.signEvent(template, secret, provider)));
  const cases = [
    [e => { e.extra = 1; }, 'INVALID_INPUT'], [e => { delete e.sig; }, 'INVALID_INPUT'], [e => { e.id = e.id.toUpperCase(); }, 'INVALID_INPUT'],
    [e => { e.pubkey = e.pubkey.slice(2); }, 'INVALID_INPUT'], [e => { e.created_at = 1.5; }, 'INVALID_INPUT'], [e => { e.created_at = -1; }, 'INVALID_INPUT'],
    [e => { e.created_at = '1700000000'; }, 'INVALID_INPUT'], [e => { e.kind = 65536; }, 'INVALID_INPUT'], [e => { e.kind = 4; }, 'UNSUPPORTED_VERSION'],
    [e => { e.tags = [[]]; }, 'INVALID_INPUT'], [e => { e.tags = [['p', 1]]; }, 'INVALID_INPUT'], [e => { e.tags = 'p'; }, 'INVALID_INPUT'],
    [e => { e.tags = Array.from({ length: 65 }, () => ['t', 'x']); }, 'LIMIT_EXCEEDED'], [e => { e.tags = [Array(9).fill('x')]; }, 'LIMIT_EXCEEDED'],
    [e => { e.tags = [['t', 'x'.repeat(1025)]]; }, 'LIMIT_EXCEEDED'], [e => { e.content = 'x'.repeat(131073); }, 'LIMIT_EXCEEDED'],
    [e => { e.content = 'é'.repeat(70000); }, 'LIMIT_EXCEEDED'], [e => { e.content = 'a\u0000b'; }, 'INVALID_INPUT'], [e => { e.content = 'a\u001bb'; }, 'INVALID_INPUT'],
    [e => { e.content = '\uDC00'; }, 'INVALID_INPUT'], [e => { e.content = 'changed'; }, 'INTEGRITY_FAILURE'], [e => { e.sig = '0'.repeat(128); }, 'INTEGRITY_FAILURE'],
    [e => { e.tags = [['t', 'x', 'y']]; e.tags[0].length = 2; e.tags[0][5] = 'z'; }, 'LIMIT_EXCEEDED'],
  ];
  for (const [mutate, expected] of cases) { const e = structuredClone(good); mutate(e); await assert.rejects(ev.verifyEvent(e, provider), code(expected), mutate.toString()); }
  const getter = structuredClone(good); Object.defineProperty(getter, 'content', { get: () => good.content, enumerable: true });
  await assert.rejects(ev.verifyEvent(getter, provider), code('INVALID_INPUT'));
  await assert.rejects(ev.verifyEvent(Object.assign(Object.create({ polluted: true }), good), provider), code('INVALID_INPUT'));
  await assert.rejects(ev.verifyEvent([good], provider), code('INVALID_INPUT'));
  await assert.rejects(ev.verifyEvent(good, provider, { ...ev.DEFAULT_EVENT_LIMITS, allowedKinds: [14] }), code('INVALID_INPUT'));
  await assert.rejects(ev.signEvent({ ...template, kind: 4 }, secret, provider), code('UNSUPPORTED_VERSION'));
  assert.throws(() => ev.createUnsignedEvent(good.pubkey, { ...template, kind: 4 }), code('UNSUPPORTED_VERSION'));
});

test('rumors are unsigned, id-checked and refuse a sig field', () => {
  const pubkey = hex(schnorr.getPublicKey(secret));
  const rumor = ev.createUnsignedEvent(pubkey, { ...template, kind: 14 });
  assert.equal('sig' in rumor, false);
  assert.deepEqual(ev.parseUnsignedEvent(JSON.parse(JSON.stringify(rumor))), rumor);
  assert.throws(() => ev.parseUnsignedEvent({ ...rumor, sig: 'a'.repeat(128) }), code('INVALID_INPUT'));
  assert.throws(() => ev.parseUnsignedEvent({ ...rumor, content: 'x' }), code('INTEGRITY_FAILURE'));
});

test('strict JSON parser rejects duplicate keys, __proto__, depth, trailing data and oversize input', () => {
  assert.deepEqual(ev.parseEventJson('{"a":[1,"x\\u0041",true,null,-2.5e3],"b":{}}'), { a: [1, 'xA', true, null, -2500], b: {} });
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":{"x":1}}', '[[[[[1]]]]]', '{"a":1} x', '{"a":01}', "{'a':1}", '{"a":"\u0001"}', '{"a":1,}', '[1,]', '"\\x"', '']) {
    assert.throws(() => ev.parseEventJson(text), error => error?.name === 'NostrCryptoError', text);
  }
  assert.throws(() => ev.parseEventJson('"' + 'x'.repeat(300000) + '"'), code('LIMIT_EXCEEDED'));
  assert.equal(Object.getPrototypeOf(ev.parseEventJson('{"a":1}')), Object.prototype);
});

test('hostile reflection and provider throws never leak foreign diagnostics', async () => {
  const {proxy: revoked, revoke} = Proxy.revocable({}, {}); revoke();
  const foreign = new Proxy({}, {ownKeys(){throw Error('SECRET relay diagnostic');}});
  const revokedThrow = new Proxy({}, {ownKeys(){throw revoked;}});
  const forged = new Proxy({}, {ownKeys(){throw new NostrCryptoError('UNAUTHORIZED');}});
  for (const input of [foreign, revokedThrow, forged]) {
    await assert.rejects(ev.verifyEvent(input, provider), error => error.code === 'INVALID_INPUT' && error.message === 'Nostr cryptographic operation failed.');
    assert.throws(() => ev.verifyEventSync(input), error => error.code === 'INVALID_INPUT' && error.message === 'Nostr cryptographic operation failed.');
    assert.throws(() => ev.createUnsignedEvent('a'.repeat(64), input), error => error.code === 'INVALID_INPUT' && error.message === 'Nostr cryptographic operation failed.');
  }
  const key = new Uint8Array(32); key[31] = 1;
  const broken = { ...provider, publicKey: async () => {throw revoked;} };
  await assert.rejects(ev.signEvent({created_at:1700000000,kind:1,tags:[],content:'x'}, key, broken), error => error.code === 'INVALID_INPUT' && error.message === 'Nostr cryptographic operation failed.');
  key.fill(0);
});
