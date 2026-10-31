import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalNobleNostrProvider } from '../src/provider.ts';
import * as ev from '../src/event.ts';
import * as nip59 from '../src/nip59.ts';
import * as nip17 from '../src/nip17.ts';

const provider = createLocalNobleNostrProvider();
const NOW = 1_800_000_000;
const binding = Object.freeze({ chain: 'evm', networkId: 'eip155:31337', deploymentId: 'basic-escrow-v1', tradeId: 'ab'.repeat(32) });
async function party() { const pair = await provider.generate(); return { secret: pair.secretKey, pub: pair.publicKey }; }
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const err = (result, expected) => { assert.equal(result.ok, false, 'expected failure'); assert.equal(result.error.code, expected); assert.doesNotMatch(JSON.stringify(result), /hello|secret/i); };
async function setup(options = {}) {
  const seller = await party(), buyer = await party(), outsider = await party();
  const participants = [seller.pub, buyer.pub];
  const chat = who => ok(nip17.createTradeChat({ binding, participants, selfPublicKey: who.pub, provider, now: () => NOW, ...options }));
  return { seller, buyer, outsider, participants, sellerChat: chat(seller), buyerChat: chat(buyer) };
}
/** Hand-build a trade message from any author with arbitrary tags, bypassing the chat's own checks. */
async function craft(author, recipient, tags, content = 'hello') {
  const rumor = ev.createUnsignedEvent(author.pub, { kind: 14, created_at: NOW, tags, content });
  return nip59.createGiftWrap(await nip59.createSeal(rumor, author.secret, recipient.pub, provider, NOW), recipient.pub, provider, NOW);
}

test('two counterparties exchange trade-bound messages with a self copy and deduplication', async () => {
  const s = await setup();
  assert.equal(s.sellerChat.conversationId, s.buyerChat.conversationId);
  assert.equal(s.sellerChat.conversationId, nip17.tradeConversationId(binding, [s.buyer.pub, s.seller.pub]));
  const sent = ok(await s.sellerChat.send('hello buyer', s.seller.secret));
  assert.deepEqual(sent.rumor.tags, [['p', s.buyer.pub], ['trade', binding.tradeId], ['conversation', s.sellerChat.conversationId]]);
  assert.equal(sent.rumor.kind, 14); assert.equal('sig' in sent.rumor, false);
  assert.deepEqual(sent.recipientWrap.tags, [['p', s.buyer.pub]]); assert.deepEqual(sent.selfWrap.tags, [['p', s.seller.pub]]);
  assert.notEqual(sent.recipientWrap.pubkey, sent.selfWrap.pubkey);
  const received = ok(await s.buyerChat.receive(JSON.parse(JSON.stringify(sent.recipientWrap)), s.buyer.secret));
  assert.deepEqual(received, { duplicate: false, message: { rumorId: sent.rumor.id, author: s.seller.pub, direction: 'inbound', claimedCreatedAt: NOW, content: 'hello buyer' } });
  assert.equal(ok(await s.buyerChat.receive(sent.recipientWrap, s.buyer.secret)).duplicate, true);
  const self = ok(await s.sellerChat.receive(sent.selfWrap, s.seller.secret));
  assert.equal(self.duplicate, true); assert.equal(self.message.direction, 'outbound');
  // A second wrap of the same rumor (relay re-delivery via another one-time key) is still one message.
  const rewrapped = await nip59.createGiftWrap(await nip59.createSeal(sent.rumor, s.seller.secret, s.buyer.pub, provider, NOW), s.buyer.pub, provider, NOW);
  assert.equal(ok(await s.buyerChat.receive(rewrapped, s.buyer.secret)).duplicate, true);
  const reply = ok(await s.buyerChat.send('ok', s.buyer.secret));
  assert.equal(ok(await s.sellerChat.receive(reply.recipientWrap, s.seller.secret)).message.author, s.buyer.pub);
  // A fresh session (after reload) on the self copy recovers the outbound message.
  const reloaded = ok(nip17.createTradeChat({ binding, participants: s.participants, selfPublicKey: s.seller.pub, provider, now: () => NOW }));
  assert.equal(ok(await reloaded.receive(sent.selfWrap, s.seller.secret)).message.content, 'hello buyer');
});

test('only the two counterparties, with exact trade and conversation tags, are accepted', async () => {
  const s = await setup(), conversation = s.sellerChat.conversationId;
  const tags = (p, trade = binding.tradeId, conv = conversation) => [['p', p], ['trade', trade], ['conversation', conv]];
  await assert.doesNotReject(async () => ok(await s.buyerChat.receive(await craft(s.seller, s.buyer, tags(s.buyer.pub)), s.buyer.secret)));
  err(await s.buyerChat.receive(await craft(s.outsider, s.buyer, tags(s.buyer.pub)), s.buyer.secret), 'UNAUTHORIZED');
  err(await s.buyerChat.receive(await craft(s.seller, s.buyer, tags(s.buyer.pub, 'cd'.repeat(32))), s.buyer.secret), 'UNAUTHORIZED');
  err(await s.buyerChat.receive(await craft(s.seller, s.buyer, tags(s.buyer.pub, binding.tradeId, 'ee'.repeat(32))), s.buyer.secret), 'UNAUTHORIZED');
  err(await s.buyerChat.receive(await craft(s.seller, s.buyer, tags(s.outsider.pub)), s.buyer.secret), 'UNAUTHORIZED');
  err(await s.buyerChat.receive(await craft(s.seller, s.buyer, tags(s.buyer.pub).reverse()), s.buyer.secret), 'UNAUTHORIZED');
  err(await s.buyerChat.receive(await craft(s.seller, s.buyer, [...tags(s.buyer.pub), ['subject', 'x']]), s.buyer.secret), 'LIMIT_EXCEEDED');
  err(await s.buyerChat.receive(await craft(s.seller, s.buyer, tags(s.buyer.pub).slice(0, 2)), s.buyer.secret), 'UNAUTHORIZED');
  // Another trade between the same two people does not leak into this conversation.
  const other = ok(nip17.createTradeChat({ binding: { ...binding, tradeId: 'cd'.repeat(32) }, participants: s.participants, selfPublicKey: s.seller.pub, provider, now: () => NOW }));
  err(await s.buyerChat.receive(ok(await other.send('other trade', s.seller.secret)).recipientWrap, s.buyer.secret), 'UNAUTHORIZED');
  // A wrap addressed to the seller cannot be opened by the buyer session.
  err(await s.buyerChat.receive(ok(await s.buyerChat.send('x', s.buyer.secret)).recipientWrap, s.buyer.secret), 'UNAUTHORIZED');
  // Wrong secret for the session's identity.
  err(await s.buyerChat.receive(await craft(s.seller, s.buyer, tags(s.buyer.pub)), s.seller.secret), 'UNAUTHORIZED');
  err(await s.sellerChat.send('x', s.buyer.secret), 'UNAUTHORIZED');
});

test('NIP-04 kind 4 is rejected at the outer and inner layers', async () => {
  const s = await setup();
  const legacy = await ev.signEvent({ kind: 1, created_at: NOW, tags: [['p', s.buyer.pub]], content: 'x?iv=y' }, s.seller.secret, provider);
  err(await s.buyerChat.receive({ ...legacy, kind: 4 }, s.buyer.secret), 'UNSUPPORTED_VERSION');
  assert.throws(() => ev.createUnsignedEvent(s.seller.pub, { kind: 4, created_at: NOW, tags: [], content: 'x' }), error => error.code === 'UNSUPPORTED_VERSION');
  // A kind-4 rumor smuggled inside a valid seal and wrap is rejected too.
  const rumor = { ...ev.createUnsignedEvent(s.seller.pub, { kind: 1, created_at: NOW, tags: [], content: 'x' }), kind: 4 };
  const { encrypt } = await import('../src/nip44.ts');
  const seal = await ev.signEvent({ kind: 13, created_at: NOW, tags: [], content: encrypt(JSON.stringify(rumor), await provider.conversationKey(s.seller.secret, s.buyer.pub)) }, s.seller.secret, provider);
  err(await s.buyerChat.receive(await nip59.createGiftWrap(seal, s.buyer.pub, provider, NOW), s.buyer.secret), 'UNSUPPORTED_VERSION');
});

test('content and resource limits, invalid configuration, close and cancellation', async () => {
  const s = await setup({ maxSeenMessages: 2 });
  err(await s.sellerChat.send('', s.seller.secret), 'INVALID_INPUT');
  err(await s.sellerChat.send('x'.repeat(nip17.MAX_CHAT_CONTENT_BYTES + 1), s.seller.secret), 'LIMIT_EXCEEDED');
  const biggest = ok(await s.sellerChat.send('"'.repeat(nip17.MAX_CHAT_CONTENT_BYTES - 6000), s.seller.secret));
  assert.ok(ok(await s.buyerChat.receive(biggest.recipientWrap, s.buyer.secret)).message.content.length > 18000);
  err(await s.sellerChat.send('"'.repeat(nip17.MAX_CHAT_CONTENT_BYTES), s.seller.secret), 'LIMIT_EXCEEDED');
  ok(await s.sellerChat.send('second', s.seller.secret));
  err(await s.sellerChat.send('third', s.seller.secret), 'LIMIT_EXCEEDED');
  const controller = new AbortController(); controller.abort();
  err(await s.buyerChat.send('x', s.buyer.secret, controller.signal), 'CANCELLED');
  const late = s.buyerChat.send('late', s.buyer.secret); s.buyerChat.close();
  err(await late, 'LOCKED');
  err(await s.buyerChat.receive(biggest.recipientWrap, s.buyer.secret), 'LOCKED');
  const make = overrides => nip17.createTradeChat({ binding, participants: s.participants, selfPublicKey: s.seller.pub, provider, ...overrides });
  err(make({ binding: { ...binding, tradeId: '0x' + 'ab'.repeat(32) } }), 'INVALID_INPUT');
  err(make({ binding: { ...binding, extra: 1 } }), 'INVALID_INPUT');
  err(make({ participants: [s.seller.pub, s.seller.pub] }), 'INVALID_INPUT');
  err(make({ participants: [s.seller.pub, s.buyer.pub, s.outsider.pub] }), 'INVALID_INPUT');
  err(make({ selfPublicKey: s.outsider.pub }), 'UNAUTHORIZED');
  err(make({ provider: { ...provider, conversationKey: undefined } }), 'UNSUPPORTED_PROVIDER');
  err(make({ maxSeenMessages: 0 }), 'INVALID_INPUT');
  const bad = ok(make({ now: () => 1.5 }));
  err(await bad.send('x', s.seller.secret), 'INVALID_INPUT');
});

test('a hostile relay cannot crash receive with arbitrary input', async () => {
  const s = await setup();
  for (const input of [null, 1, 'x', [], {}, { kind: 1059 }, new Proxy({}, { ownKeys() { throw new Error('SECRET'); } })]) {
    const result = await s.buyerChat.receive(input, s.buyer.secret);
    assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  }
});

test('hostile thrown proxies from a relay or provider stay fixed typed failures', async () => {
  const s = await setup();
  const {proxy: revoked, revoke} = Proxy.revocable({}, {}); revoke();
  const hostile = new Proxy({}, {ownKeys(){throw revoked;}});
  const result = await s.buyerChat.receive(hostile, s.buyer.secret);
  assert.equal(result.ok, false); assert.equal(result.error.code, 'INVALID_INPUT');
  assert.doesNotMatch(JSON.stringify(result), /SECRET|proxy|TypeError/);
  s.buyerChat.close(); s.sellerChat.close();
});
