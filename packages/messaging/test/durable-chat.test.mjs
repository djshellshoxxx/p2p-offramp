import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableTradeChat, HISTORY_FORMAT, MAX_HISTORY_MESSAGES } from '../index.ts';
import { createTradeChat, createUnsignedEvent, createSeal, createGiftWrap } from '../../nostr-crypto/index.ts';
import { EncryptedVaultService, EncryptedBackupService } from '../../storage/index.ts';
import { encodeBase64url, decodeBase64url } from '../../schemas/index.ts';
import { setup, envelope, provider, binding, NOW, PASS, ok, bad, deferred } from './support.mjs';

const payload = object => encodeBase64url(new TextEncoder().encode(JSON.stringify(object)));
const record = (id, object, schemaVersion = 1) => ({ id: id.repeat(16), kind: 'chat', schemaVersion, payload: payload(object) });
const native = (s, who) => ok(createTradeChat({ binding, participants: s.participants, selfPublicKey: who.publicKey, provider, now: () => NOW }));
async function craft(s, author, recipient, body, changes = {}) {
  const rumor = createUnsignedEvent(author.publicKey, { kind: 14, created_at: NOW,
    tags: [['p', recipient.publicKey], ['trade', binding.tradeId], ['conversation', s.make().conversationId]], content: new TextDecoder().decode(body), ...changes });
  return createGiftWrap(await createSeal(rumor, author.secretKey, recipient.publicKey, provider, NOW), recipient.publicKey, provider, NOW);
}

test('real NIP-17 send/receive persists authenticated proofs, reauthenticates text and preserves receipt order', async () => {
  const s = await setup();
  try {
    const alice = s.make(), bob = s.make(s.bob);
    assert.deepEqual(Object.keys(alice).sort(), ['close', 'conversationId', 'list', 'receive', 'send']);
    const sent = ok(await alice.send(envelope(s.alice, s.bob), s.alice.secretKey));
    const received = ok(await bob.receive(sent.recipientWrap, s.bob.secretKey));
    assert.equal(received.receivedSequence, 1);
    const second = ok(await alice.send(envelope(s.alice, s.bob, { messageId: '23'.repeat(16), createdAt: 0, body: 'earlier claimed time' }), s.alice.secretKey));
    ok(await bob.receive(second.recipientWrap, s.bob.secretKey));
    const history = ok(await bob.list(s.bob.secretKey));
    assert.equal(history.provenance, 'native-reauthenticated-local-history'); assert.equal(history.economicAuthority, false);
    assert.deepEqual(history.messages.map(message => message.receivedSequence), [1, 2]);
    assert.deepEqual(history.messages.map(message => message.message.createdAt), [100, 0]);
    assert.equal(history.messages[0].message.body, 'fixture private note <b>inert</b>');
    assert.ok(history.messages.every(message => message.direction === 'inbound' && Object.isFrozen(message.message)));
    assert.equal(ok(await alice.list(s.alice.secretKey)).messages[0].direction, 'outbound');
    const reply = ok(await bob.send(envelope(s.bob, s.alice), s.bob.secretKey));
    ok(await alice.receive(reply.recipientWrap, s.alice.secretKey));
    assert.equal(ok(await alice.list(s.alice.secretKey)).messages.length, 3, 'the other authenticated sender may independently use the same messageId');
    assert.equal(JSON.stringify([...s.store.rows.values()]).includes('fixture private note'), false, 'vault persistence is encrypted');
    const stored = ok(await s.bobVault.list(s.bobSession.sessionId, 'chat'));
    for (const row of stored) assert.equal(new TextDecoder().decode(decodeBase64url(row.payload, 1, 262144)).includes('fixture private note'), false, 'history wrapper retains an encrypted native proof rather than plaintext');
  } finally { s.dispose(); }
});

test('restart and fresh-key backup restore retain durable dedup and native authentication without changing the source', async () => {
  const s = await setup(); let reopened, restoredVault;
  try {
    const alice = s.make(), bob = s.make(s.bob), sent = ok(await alice.send(envelope(s.alice, s.bob), s.alice.secretKey));
    const receipt = ok(await bob.receive(sent.recipientWrap, s.bob.secretKey)); bob.close(); s.bobVault.lockAll();
    reopened = new EncryptedVaultService(s.store, crypto, { lifecycle: false });
    const session = ok(await reopened.unlock(s.bobSession.profileId, PASS)), next = s.make(s.bob, { vault: reopened, session });
    assert.equal(ok(await next.receive(sent.recipientWrap, s.bob.secretKey)).duplicate, true);
    assert.equal(ok(await next.list(s.bob.secretKey)).messages.length, 1);
    const sourceBefore = JSON.stringify(await s.store.get(session.profileId));
    const backup = new EncryptedBackupService(s.store);
    try {
      const exported = await backup.exportWithStatus(session.profileId), restored = await backup.restore(exported.bytes, PASS, PASS);
      assert.notEqual(restored.newProfileId, session.profileId); assert.notEqual(restored.newKeyId, s.store.rows.get(session.profileId).keyId);
      restoredVault = new EncryptedVaultService(s.store, crypto, { lifecycle: false });
      const freshSession = ok(await restoredVault.unlock(restored.newProfileId, PASS)), fresh = s.make(s.bob, { vault: restoredVault, session: freshSession });
      const replay = ok(await fresh.receive(sent.recipientWrap, s.bob.secretKey));
      assert.deepEqual(replay, { ...receipt, duplicate: true });
      assert.equal(ok(await fresh.list(s.bob.secretKey)).messages[0].message.body, 'fixture private note <b>inert</b>');
      assert.equal(JSON.stringify(await s.store.get(session.profileId)), sourceBefore, 'source ciphertext is never rewritten');
      assert.equal(restoredVault.captureSession(freshSession, () => {}).value.current().revision, 0, 'durable duplicate does not add a new record');
    } finally { backup.dispose(); }
  } finally { reopened?.dispose(); restoredVault?.dispose(); s.dispose(); }
});

test('same authenticated sender/messageId is idempotent; changed content conflicts without replacing the first message', async () => {
  const s = await setup();
  try {
    const alice = s.make(), bob = s.make(s.bob), data = envelope(s.alice, s.bob), sent = ok(await alice.send(data, s.alice.secretKey));
    ok(await bob.receive(sent.recipientWrap, s.bob.secretKey));
    const writes = s.store.writes;
    assert.equal(ok(await bob.receive(sent.recipientWrap, s.bob.secretKey)).duplicate, true);
    assert.equal(ok(await alice.send(data, s.alice.secretKey)).duplicate, true);
    assert.equal(s.store.writes, writes);
    const forgedConflict = ok(await native(s, s.alice).send(new TextDecoder().decode(envelope(s.alice, s.bob, { body: 'changed private text' })), s.alice.secretKey));
    bad(await bob.receive(forgedConflict.recipientWrap, s.bob.secretKey), 'CONFLICT');
    assert.equal(s.store.writes, writes); assert.equal(ok(await bob.list(s.bob.secretKey)).messages.length, 1);
  } finally { s.dispose(); }
});

test('native author, envelope author/recipient/trade and supported kind are checked before history writes', async () => {
  const s = await setup();
  try {
    const bob = s.make(s.bob), source = native(s, s.alice);
    const wrongAuthor = envelope(s.outsider, s.bob);
    bad(await bob.receive(ok(await source.send(new TextDecoder().decode(wrongAuthor), s.alice.secretKey)).recipientWrap, s.bob.secretKey), 'UNAUTHORIZED');
    const wrongRecipient = envelope(s.alice, s.outsider);
    bad(await bob.receive(ok(await source.send(new TextDecoder().decode(wrongRecipient), s.alice.secretKey)).recipientWrap, s.bob.secretKey), 'UNAUTHORIZED');
    const unsupported = JSON.parse(new TextDecoder().decode(envelope(s.alice, s.bob))); unsupported.kind = 'receipt-status';
    bad(await bob.receive(ok(await source.send(JSON.stringify(unsupported), s.alice.secretKey)).recipientWrap, s.bob.secretKey), 'UNSUPPORTED_PROVIDER');
    bad(await bob.receive(await craft(s, s.outsider, s.bob, envelope(s.outsider, s.bob)), s.bob.secretKey), 'UNAUTHORIZED');
    bad(await bob.receive(await craft(s, s.alice, s.bob, envelope(s.alice, s.bob), { tags: [['p', s.bob.publicKey], ['trade', 'cd'.repeat(32)], ['conversation', bob.conversationId]] }), s.bob.secretKey), 'UNAUTHORIZED');
    const good = await craft(s, s.alice, s.bob, envelope(s.alice, s.bob));
    bad(await bob.receive(good, s.alice.secretKey), 'UNAUTHORIZED');
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('SECRET trap'); } });
    bad(await bob.receive(hostile, s.bob.secretKey));
    bad(await bob.list(s.alice.secretKey), 'UNAUTHORIZED');
    assert.equal(s.store.writes, 0); assert.equal(ok(await bob.list(s.bob.secretKey)).messages.length, 0);
  } finally { s.dispose(); }
});

test('foreign chat records survive untouched; unknown versions fail closed, and persisted labels cannot fabricate native authentication', async () => {
  const s = await setup();
  try {
    const alice = s.make();
    const foreign = record('11', { format: 'other-chat', opaque: 'preserve' });
    ok(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: foreign }]));
    assert.equal(ok(await alice.list(s.alice.secretKey)).skippedRecords, 1);
    const sent = ok(await alice.send(envelope(s.alice, s.bob), s.alice.secretKey));
    const rows = ok(await s.vault.list(s.session.sessionId, 'chat')); assert.deepEqual(rows.find(row => row.id === foreign.id), foreign);
    const own = rows.find(row => row.id === sent.recordId), value = JSON.parse(new TextDecoder().decode(decodeBase64url(own.payload, 1, 262144)));
    const currentRevision = ok(s.vault.captureSession(s.session, () => {})).current().revision;
    value.version = 2;
    ok(await s.vault.commit(s.session.sessionId, currentRevision, [{ op: 'put', record: { ...own, payload: payload(value) } }]));
    const futureBefore = JSON.stringify(ok(await s.vault.list(s.session.sessionId, 'chat')));
    bad(await alice.list(s.alice.secretKey), 'UNSUPPORTED_VERSION');
    assert.equal(JSON.stringify(ok(await s.vault.list(s.session.sessionId, 'chat'))), futureBefore);
    value.version = 1; value.wrap.content += 'tampered';
    ok(await s.vault.commit(s.session.sessionId, currentRevision + 1, [{ op: 'put', record: { ...own, payload: payload(value) } }]));
    bad(await alice.list(s.alice.secretKey));
    assert.equal(ok(await s.vault.list(s.session.sessionId, 'chat')).length, 2, 'invalid native proof is retained for recovery, never rewritten');
  } finally { s.dispose(); }
});

test('two independent encrypted sessions racing append have one durable winner and no lost update', async () => {
  const s = await setup(); let secondVault;
  try {
    secondVault = new EncryptedVaultService(s.store, crypto, { lifecycle: false });
    const secondSession = ok(await secondVault.unlock(s.session.profileId, PASS));
    const first = s.make(), second = s.make(s.alice, { vault: secondVault, session: secondSession });
    const gate = deferred(); let reached = 0;
    s.store.beforeCas = async () => { if (++reached === 2) gate.resolve(); await gate.promise; };
    const outcomes = await Promise.all([first.send(envelope(s.alice, s.bob), s.alice.secretKey),
      second.send(envelope(s.alice, s.bob, { messageId: '23'.repeat(16) }), s.alice.secretKey)]);
    assert.equal(outcomes.filter(result => result.ok).length, 1); assert.equal(s.store.writes, 1);
    s.store.beforeCas = undefined;
    first.close(); second.close(); s.vault.lockAll(); secondVault.lockAll();
    const reopened = ok(await s.vault.unlock(s.session.profileId, PASS)), history = s.make(s.alice, { session: reopened });
    assert.equal(ok(await history.list(s.alice.secretKey)).messages.length, 1);
  } finally { secondVault?.dispose(); s.dispose(); }
});

test('abort while native crypto ignores cancellation settles promptly, wipes owned keys and holds the physical slot', async () => {
  const s = await setup();
  try {
    const gate = deferred(), entered = deferred(); let owned, paused = false;
    const slow = { ...provider, async publicKey(key) { const result = await provider.publicKey(key); if (!paused) { paused = true; owned = key; entered.resolve(); await gate.promise; } return result; } };
    const alice = s.make(s.alice, { provider: slow }), controller = new AbortController();
    const pending = alice.send(envelope(s.alice, s.bob), s.alice.secretKey, controller.signal); await entered.promise; controller.abort();
    bad(await pending, 'CANCELLED'); assert.notEqual(owned, s.alice.secretKey); assert.ok(owned.every(byte => byte === 0));
    bad(await alice.send(envelope(s.alice, s.bob), s.alice.secretKey), 'CONFLICT');
    gate.resolve(); await new Promise(done => setTimeout(done, 20));
    assert.equal(s.store.writes, 0); assert.equal(ok(await alice.list(s.alice.secretKey)).messages.length, 0);
    alice.close(); bad(await alice.list(s.alice.secretKey), 'LOCKED');
  } finally { s.dispose(); }
});

test('vault revocation during noncooperative native work suppresses late plaintext and closes the history capability', async () => {
  const s = await setup();
  try {
    const entered = deferred(), gate = deferred(); let once = false, owned;
    const slow = { ...provider, async publicKey(key) { const result = await provider.publicKey(key); if (!once) { once = true; owned = key; entered.resolve(); await gate.promise; } return result; } };
    const alice = s.make(s.alice, { provider: slow }), pending = alice.list(s.alice.secretKey);
    await entered.promise; s.vault.lockAll(); bad(await pending, 'LOCKED');
    assert.ok(owned.every(byte => byte === 0)); gate.resolve(); await new Promise(done => setTimeout(done, 20));
    bad(await alice.list(s.alice.secretKey), 'LOCKED'); assert.equal(s.store.writes, 0);
  } finally { s.dispose(); }
});

test('pre-CAS cancellation prevents writes; late cancellation after atomic success retains recoverable proof without publication', async () => {
  for (const stage of ['before', 'after']) {
    const s = await setup();
    try {
      const alice = s.make(), controller = new AbortController();
      s.store[stage === 'before' ? 'beforeCas' : 'afterCas'] = () => controller.abort();
      bad(await alice.send(envelope(s.alice, s.bob), s.alice.secretKey, controller.signal), 'CANCELLED');
      await new Promise(done => setTimeout(done, 20));
      assert.equal(s.store.writes, stage === 'before' ? 0 : 1);
      s.store.beforeCas = s.store.afterCas = undefined;
      alice.close(); s.vault.lockAll(); const session = ok(await s.vault.unlock(s.session.profileId, PASS));
      const reopened = s.make(s.alice, { session });
      assert.equal(ok(await reopened.list(s.alice.secretKey)).messages.length, stage === 'before' ? 0 : 1);
    } finally { s.dispose(); }
  }
});

test('message/byte caps refuse growth without eviction while full history and replay remain available', async () => {
  const s = await setup({ maxMessages: 1 });
  try {
    const alice = s.make(), first = ok(await alice.send(envelope(s.alice, s.bob), s.alice.secretKey));
    bad(await alice.send(envelope(s.alice, s.bob, { messageId: '23'.repeat(16) }), s.alice.secretKey), 'LIMIT_EXCEEDED');
    assert.equal(ok(await alice.send(envelope(s.alice, s.bob), s.alice.secretKey)).duplicate, true);
    assert.equal(ok(await alice.list(s.alice.secretKey)).messages[0].recordId, first.recordId);
    const limited = s.make(s.bob, { maxHistoryBytes: 1 });
    bad(await limited.receive(first.recipientWrap, s.bob.secretKey), 'LIMIT_EXCEEDED');
    assert.equal(ok(await limited.list(s.bob.secretKey)).messages.length, 0);
    bad(createDurableTradeChat({ vault: s.vault, session: s.session, provider, binding, participants: s.participants,
      selfPublicKey: s.alice.publicKey, maxMessages: MAX_HISTORY_MESSAGES + 1 }), 'INVALID_INPUT');
  } finally { s.dispose(); }
});
