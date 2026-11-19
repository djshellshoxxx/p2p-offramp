/** Actual pinned nak/Khatru process, never the repository fake relay. Opt-in; no public traffic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { startNak, NAK_PIN } from '../lib/nostr-relay-fixture.mjs';
import { createRelayPool } from '../../packages/relay/index.ts';
import { createLocalNobleNostrProvider, signEvent, verifyEventSync, createTradeChat, createSeal, createGiftWrap } from '../../packages/nostr-crypto/index.ts';
import { makeBroker, loopbackRelayFixture, until } from '../../packages/relay/test/support/harness.mjs';

const nativeProvider = createLocalNobleNostrProvider();
let signatures = 0;
const provider = { ...nativeProvider, signSchnorr(...args) { signatures++; return nativeProvider.signSchnorr(...args); } };
const now = () => Math.floor(Date.now() / 1000);
const good = result => { assert.equal(result.ok, true); return result.value; };
const verifier = { verifyEvent(event) { try { verifyEventSync(event); return true; } catch { return false; } } };
const timing = { backoffCeilingsMs: [50, 50, 50, 50, 50, 50], stableMs: 60_000, connectTimeoutMs: 3_000, publishTimeoutMs: 1_000 };

/** Fault injection retains native frames byte-for-byte. It cannot fabricate an ACK, event or signature. */
function observedConnector(relay) {
  const fixture = loopbackRelayFixture([relay]);
  const outbound = [], inbound = [], sockets = [];
  const net = { outbound, inbound, sockets, hook: null, relays: fixture.relays, endpointURLs: fixture.endpointURLs,
    connect(url, signal) {
      const native = fixture.connect(url, signal);
      const rec = { id: sockets.length, native, sent: [], closed: false };
      sockets.push(rec);
      const socket = { onopen: null, onmessage: null, onerror: null, onclose: null,
        send(text) { const frame = JSON.parse(text); rec.sent.push(frame); outbound.push({ socket: rec.id, frame, text }); native.send(text); },
        close() { native.close(); },
      };
      native.onopen = event => socket.onopen?.(event);
      native.onerror = event => socket.onerror?.(event);
      native.onclose = event => { rec.closed = true; socket.onclose?.(event); };
      native.onmessage = event => {
        const frame = JSON.parse(event.data);
        inbound.push({ socket: rec.id, frame, text: event.data });
        const deliver = () => socket.onmessage?.({ data: event.data });
        if (net.hook?.(frame, rec, deliver) !== true) deliver();
      };
      return socket;
    },
    count(type, id) { return outbound.filter(item => item.frame[0] === type && (id === undefined || item.frame[1]?.id === id)).length; },
    dropReaders() { for (const rec of sockets) if (!rec.closed && rec.sent.some(frame => frame[0] === 'REQ')) rec.native.close(); },
    async close() { for (const rec of sockets) rec.native.close(); await until(() => sockets.every(rec => rec.closed), 3_000); },
  };
  return net;
}

function productPool(relay) {
  const net = observedConnector(relay);
  const { broker } = makeBroker({ endpointURLs: net.endpointURLs, endpoints: ['relay-a'], mode: 'ordinary', coverage: 'direct' });
  const pool = createRelayPool({ broker, relays: net.relays, connect: net.connect, verifier, nowSeconds: now, timing, random: () => 0.5 });
  return { pool, net, broker, async close() { pool.close(); broker.dispose(); await net.close(); } };
}

async function rawClient(relay) {
  const socket = new WebSocket(relay.wsUrl), frames = [];
  socket.addEventListener('message', event => frames.push(JSON.parse(event.data)));
  await until(() => socket.readyState === WebSocket.OPEN, 3_000);
  return {
    frames, send(frame) { socket.send(JSON.stringify(frame)); },
    async frame(predicate, after = 0) { await until(() => frames.slice(after).some(predicate), 3_000); return frames.slice(after).find(predicate); },
    async close() { socket.close(); await until(() => socket.readyState === WebSocket.CLOSED, 3_000); },
  };
}

test('native relay accepts exact signed bytes; duplicate/reordered delivery and reconnect do not republish', { timeout: 35_000 }, async t => {
  const relay = await startNak({ eagerAuth: true });
  t.after(() => relay.close());
  const product = productPool(relay); t.after(() => product.close());
  const { pool, net } = product;
  const seller = await provider.generate(); t.after(() => seller.secretKey.fill(0));
  const topic = randomBytes(16).toString('hex');
  const event = (content, created_at = now()) => signEvent({ kind: 1, created_at, tags: [['t', topic]], content }, seller.secretKey, provider);
  const first = await event('native relay first', now() - 2), second = await event('native relay second', now() - 1);
  const filter = { kinds: [1], since: now() - 3600, limit: 20, authors: [seller.publicKey], '#t': [topic] };
  const delivered = [], eoses = [];
  const sub = good(pool.subscribe([filter], { onEvent: value => delivered.push(value), onEose: id => eoses.push(id) }));
  await until(() => eoses.length === 1, 5_000);
  const held = [];
  net.hook = (frame, _socket, deliver) => { if (frame[0] === 'EVENT') { held.push({ frame, deliver }); return true; } };
  for (const signed of [first, second]) assert.equal(good(await pool.publish(signed))[0].status, 'accepted');
  await until(() => held.length === 2, 5_000);
  assert.equal(delivered.length, 0, 'relay acceptance alone is not peer delivery');
  net.hook = null;
  held[1].deliver(); held[1].deliver(); held[0].deliver(); held[0].deliver();
  assert.deepEqual(delivered.map(value => value.id), [second.id, first.id]);
  assert.deepEqual(delivered, [second, first], 'signed event fields survive independent relay serialization');
  assert.equal(net.count('EVENT', first.id), 1); assert.equal(net.count('EVENT', second.id), 1);
  assert.equal(net.count('AUTH'), 0, 'an eager challenge never grants implicit authentication consent');

  const writes = net.count('EVENT'), requests = net.count('REQ');
  net.dropReaders();
  await until(() => net.count('REQ') > requests && eoses.length >= 2, 5_000);
  assert.equal(net.count('EVENT'), writes, 'read reconnect cannot retry publication');
  assert.equal(delivered.length, 2, 'stored native replay remains deduplicated for the existing subscription');
  const history = []; let historicalEose = false;
  const historical = good(pool.subscribe([filter], { onEvent: value => history.push(value), onEose() { historicalEose = true; } }));
  await until(() => historicalEose, 5_000);
  assert.deepEqual(new Set(history.map(value => value.id)), new Set([first.id, second.id]), 'a new consumer gets native history independently');
  historical.close();

  const lost = await event('stored but acknowledgement lost');
  net.hook = frame => frame[0] === 'OK' && frame[1] === lost.id;
  assert.equal(good(await pool.publish(lost))[0].status, 'unknown');
  net.hook = null;
  await until(() => delivered.some(value => value.id === lost.id), 5_000);
  assert.ok(net.inbound.some(item => item.frame[0] === 'OK' && item.frame[1] === lost.id && item.frame[2] === true), 'loss is after the actual native relay accepted the event');
  const beforeReconnect = eoses.length;
  net.dropReaders();
  await until(() => eoses.length > beforeReconnect, 5_000);
  await pause(2 * Math.max(...timing.backoffCeilingsMs));
  assert.equal(net.count('EVENT', lost.id), 1, 'unknown publication is never automatically retried');
  assert.equal(delivered.filter(value => value.id === lost.id).length, 1);

  const outsider = await provider.generate(); t.after(() => outsider.secretKey.fill(0));
  const outsideFilter = await signEvent({ kind: 1, created_at: now(), tags: [['t', topic]], content: 'different author' }, outsider.secretKey, provider);
  assert.equal(good(await pool.publish(outsideFilter))[0].status, 'accepted');
  const proof = await rawClient(relay); t.after(() => proof.close());
  proof.send(['REQ', 'filter-proof', filter]);
  await proof.frame(frame => frame[0] === 'EOSE' && frame[1] === 'filter-proof');
  assert.deepEqual(new Set(proof.frames.filter(frame => frame[0] === 'EVENT').map(frame => frame[2].id)), new Set([first.id, second.id, lost.id]));
  assert.ok(!delivered.some(value => value.id === outsideFilter.id));
  sub.close();
  t.diagnostic(JSON.stringify({ relay: NAK_PIN.version, source: NAK_PIN.commit, nativeWrites: net.count('EVENT'), implicitAuth: net.count('AUTH'), recoveredUnknown: true, exactSignedFields: true, tlsQualified: false }));
});

test('native relay carries project NIP-17 gift wraps without treating transport acceptance as agreement authority', { timeout: 25_000 }, async t => {
  const relay = await startNak(); t.after(() => relay.close());
  const product = productPool(relay); t.after(() => product.close());
  const seller = await provider.generate(), buyer = await provider.generate();
  t.after(() => { seller.secretKey.fill(0); buyer.secretKey.fill(0); });
  const binding = { chain: 'evm', networkId: 'eip155:31337', deploymentId: 'native-relay-fixture', tradeId: randomBytes(32).toString('hex') };
  const participants = [seller.publicKey, buyer.publicKey];
  const sender = good(createTradeChat({ binding, participants, selfPublicKey: seller.publicKey, provider, now }));
  const receiver = good(createTradeChat({ binding, participants, selfPublicKey: buyer.publicKey, provider, now }));
  t.after(() => { sender.close(); receiver.close(); });
  const wrapped = good(await sender.send('synthetic native relay message', seller.secretKey));
  assert.equal(good(await product.pool.publish(wrapped.recipientWrap))[0].status, 'accepted');
  const stored = []; let eose = false;
  const sub = good(product.pool.subscribe([{ kinds: [1059], since: now() - 259_000, limit: 20, '#p': [buyer.publicKey] }], { onEvent: value => stored.push(value), onEose() { eose = true; } }));
  await until(() => eose && stored.length === 1, 5_000);
  const opened = good(await receiver.receive(stored[0], buyer.secretKey));
  assert.equal(opened.duplicate, false); assert.equal(opened.message.author, seller.publicKey);
  assert.equal(opened.message.content, 'synthetic native relay message');
  assert.equal(good(await receiver.receive(stored[0], buyer.secretKey)).duplicate, true);
  const freshWrap = await createGiftWrap(await createSeal(wrapped.rumor, seller.secretKey, buyer.publicKey, provider, now()), buyer.publicKey, provider, now());
  assert.equal(good(await product.pool.publish(freshWrap))[0].status, 'accepted');
  await until(() => stored.length === 2, 5_000);
  assert.equal(good(await receiver.receive(stored[1], buyer.secretKey)).duplicate, true, 'new outer event cannot replay the same authenticated inner rumor');
  const wrongScope = good(createTradeChat({ binding: { ...binding, deploymentId: 'other-fixture' }, participants, selfPublicKey: buyer.publicKey, provider, now }));
  t.after(() => wrongScope.close());
  assert.equal((await wrongScope.receive(stored[0], buyer.secretKey)).ok, false);
  assert.equal(product.net.count('AUTH'), 0);
  sub.close();
  t.diagnostic('Actual native stored/live NIP-59 transport and project NIP-17 authentication passed; no wallet, acceptance state or delivery receipt is created.');
});

test('native AUTH-required relay refuses product reads/writes; explicit fixture AUTH is connection/challenge scoped', { timeout: 30_000 }, async t => {
  const relay = await startNak({ auth: true, eagerAuth: true }); t.after(() => relay.close());
  const product = productPool(relay); t.after(() => product.close());
  const publisher = await provider.generate(), authIdentity = await provider.generate();
  t.after(() => { publisher.secretKey.fill(0); authIdentity.secretKey.fill(0); });
  assert.notEqual(publisher.publicKey, authIdentity.publicKey, 'relay AUTH identity is separate from the event author');
  const signed = await signEvent({ kind: 1, created_at: now(), tags: [], content: 'synthetic auth control' }, publisher.secretKey, provider);
  const beforeProduct = signatures;
  let delivered = 0, eoses = 0;
  const filter = { kinds: [1], since: now() - 3600, limit: 20, authors: [publisher.publicKey] };
  const sub = good(product.pool.subscribe([filter], { onEvent() { delivered++; }, onEose() { eoses++; } }));
  await until(() => product.net.inbound.some(item => item.frame[0] === 'CLOSED' && item.frame[1] === sub.id), 5_000);
  const refusal = product.net.inbound.find(item => item.frame[0] === 'CLOSED').frame;
  assert.match(refusal[2], /^auth-required:/);
  assert.equal(good(await product.pool.publish(signed))[0].status, 'rejected');
  assert.equal(product.net.count('EVENT', signed.id), 1);
  assert.equal(product.net.count('AUTH'), 0);
  assert.equal(signatures, beforeProduct, 'the product AUTH challenge causes no cryptographic signing');
  assert.equal(delivered, 0); assert.equal(eoses, 0);
  const requests = product.net.count('REQ');
  await pause(100);
  assert.equal(product.net.count('REQ'), requests, 'CLOSED is not silently resubscribed');

  // The control is a standalone fixture client. No product signing API receives the challenge.
  const control = await rawClient(relay); t.after(() => control.close());
  const challenge = (await control.frame(frame => frame[0] === 'AUTH'))[1];
  const authenticate = (overrides = {}) => signEvent({ kind: 22242, created_at: now(), tags: [['relay', relay.wsUrl], ['challenge', challenge]], content: '', ...overrides }, authIdentity.secretKey, provider);
  for (const bad of [
    await authenticate({ tags: [['relay', 'wss://foreign.fixture.invalid/'], ['challenge', challenge]] }),
    await authenticate({ tags: [['relay', relay.wsUrl], ['challenge', 'wrong-challenge']] }),
    await authenticate({ created_at: now() - 86_400 }),
  ]) {
    control.send(['AUTH', bad]);
    assert.equal((await control.frame(frame => frame[0] === 'OK' && frame[1] === bad.id))[2], false);
  }
  const valid = await authenticate(); control.send(['AUTH', valid]);
  assert.equal((await control.frame(frame => frame[0] === 'OK' && frame[1] === valid.id))[2], true);
  control.send(['EVENT', signed]);
  assert.equal((await control.frame(frame => frame[0] === 'OK' && frame[1] === signed.id))[2], true);
  control.send(['REQ', 'authed-control', filter]);
  await control.frame(frame => frame[0] === 'EOSE' && frame[1] === 'authed-control');
  assert.ok(control.frames.some(frame => frame[0] === 'EVENT' && frame[2].id === signed.id));
  assert.equal(delivered, 0, 'another authenticated connection never authorizes the product connection');

  const reconnected = await rawClient(relay); t.after(() => reconnected.close());
  const freshChallenge = (await reconnected.frame(frame => frame[0] === 'AUTH'))[1];
  assert.notEqual(freshChallenge, challenge);
  reconnected.send(['AUTH', valid]);
  assert.equal((await reconnected.frame(frame => frame[0] === 'OK' && frame[1] === valid.id))[2], false, 'old connection proof cannot authenticate a new challenge');
  reconnected.send(['REQ', 'reconnected', filter]);
  assert.match((await reconnected.frame(frame => frame[0] === 'CLOSED' && frame[1] === 'reconnected'))[2], /^auth-required:/);
  const beforeProductReconnect = signatures;
  const closedBefore = product.net.inbound.filter(item => item.frame[0] === 'CLOSED').length;
  product.net.dropReaders();
  await until(() => product.net.inbound.filter(item => item.frame[0] === 'CLOSED').length > closedBefore, 5_000);
  assert.equal(signatures, beforeProductReconnect);
  assert.equal(delivered, 0); assert.equal(eoses, 0);
  assert.equal(product.net.count('AUTH'), 0); assert.equal(product.net.count('EVENT', signed.id), 1);
  sub.close();
  t.diagnostic('Actual NIP-42 control accepts only explicit fresh fixture authentication; product AUTH remains unsupported with no implicit signing or publication retry.');
});
