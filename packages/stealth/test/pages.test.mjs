import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { createEncryptedComparisonStore, createOfflineStealth } from '../index.ts';
import { scopeHashOf, cursorIdOf, candidateIdOf, CANDIDATE_FORMAT, CURSOR_FORMAT } from '../src/records.ts';
import { REF, SDK, CONTEXT, SPEND, HASH, ANNOUNCER, setup, val, fail, eventFor, requestFor, pageFor, deferred, tick, nativeFill } from './fixtures/helpers.mjs';
const decode = payload => JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
const foreign = { id: 'f1'.repeat(16), kind: 'preference', schemaVersion: 8, payload: Buffer.from('unrelated future preference').toString('base64url') };
async function records(s) { return val(await s.vault.list(s.session.sessionId, 'preference')); }
async function put(s, record) { val(await s.vault.commit(s.session.sessionId, s.storage.rows.get(s.session.profileId).revision, [{ op: 'put', record }])); }
const binding = s => ({ profileId: REF, context: CONTEXT, viewingPublicKeyHex: s.view.viewingPublicKeyHex, spendingPublicKeyHex: SPEND });
test('actual G02 encryption: complete comparison atomically adds candidate+cursor, preserves foreign records and exposes no secret/plaintext', async t => {
  const s = await setup(t); await put(s, foreign); const before = s.storage.writes;
  const report = val(await s.run()); assert.equal(report.added, 1); assert.equal(report.tracked, 1); assert.equal(report.compared, 1); assert.equal(report.economicAuthority, false);
  assert.deepEqual(report.cursor, { blockNumber: 1n, blockHash: HASH }); assert.equal(s.storage.writes, before + 1);
  const saved = await records(s); assert.equal(saved.length, 3); assert.deepEqual(saved.find(r => r.id === foreign.id), foreign);
  assert.deepEqual(saved.filter(r => r.id !== foreign.id).map(r => decode(r.payload).format).sort(), [CANDIDATE_FORMAT, CURSOR_FORMAT].sort());
  const serialized = JSON.stringify([...s.storage.rows.values()]); assert.doesNotMatch(serialized, /stealth-cursor|stealth-candidate|ephemeralPublicKey|viewingPublicKey|offline-fixture/);
  const next = requestFor({ fromBlock: 2n, toBlock: 2n, expectedCursor: report.cursor });
  const repeat = val(await s.run(next, { async readOfflinePage(q) { return pageFor(q, []); } }));
  assert.equal(repeat.compared, 1); assert.equal(repeat.added, 0); assert.equal(repeat.tracked, 1); // Cached candidate is rederived under the live key.
});
test('complete multipage request has one atomic commit; identical duplicates compare once', async t => {
  const s = await setup(t); let calls = 0;
  const result = val(await s.run(requestFor(), { async readOfflinePage(q) { calls++; return pageFor(q, [eventFor(s.claim)], q.token === null ? { nextToken: 'page2', complete: false } : {}); } }));
  assert.equal(calls, 2); assert.equal(result.pages, 2); assert.equal(result.added, 1); assert.equal(result.compared, 1); assert.equal(s.storage.writes, 2);
});
test('partial pages, token cycles and late malformed pages never advance the cursor or save earlier matches', async t => {
  for (const mode of ['partial', 'cycle', 'bad-late', 'too-many']) {
    const s = await setup(t); let calls = 0;
    const result = await s.run(requestFor(), { async readOfflinePage(q) {
      calls++;
      if (mode === 'partial') return pageFor(q, [eventFor(s.claim)], { nextToken: null, complete: false });
      if (mode === 'bad-late' && q.token !== null) return pageFor(q, [eventFor(s.claim, { logIndex: 1n, log: { ...eventFor(s.claim).log, data: '0x00' } })]);
      return pageFor(q, calls === 1 ? [eventFor(s.claim)] : [], { nextToken: mode === 'cycle' ? 'same' : 'page' + calls, complete: false });
    } });
    fail(result, mode === 'too-many' ? 'CAPACITY_EXCEEDED' : mode === 'bad-late' ? undefined : 'INCOMPLETE_PAGE');
    assert.equal(calls <= 10, true); assert.equal(s.storage.writes, 1); assert.equal((await records(s)).length, 0);
  }
});
test('request range/page log caps refuse before source or scalar work; named profile/context binding is strict', async t => {
  const s = await setup(t); let calls = 0; const source = { async readOfflinePage(q) { calls++; return pageFor(q, []); } };
  fail(await s.run(requestFor({ toBlock: 2001n }), source), 'CAPACITY_EXCEEDED'); assert.equal(calls, 0);
  fail(await s.run(requestFor({ profileId: SDK }), source), 'PROFILE_MISMATCH'); fail(await s.run(requestFor({ context: { ...CONTEXT, id: 'mixed' } }), source), 'CONTEXT_MISMATCH'); assert.equal(calls, 0);
  fail(await s.run(requestFor(), { async readOfflinePage(q) { return pageFor(q, Array(1001).fill(null)); } }), 'CAPACITY_EXCEEDED'); assert.equal(s.storage.writes, 1);
});
test('wrong emitter/profile/context/range/anchor, ordering, conflicting duplicate or mixed block hashes abort whole page', async t => {
  const s = await setup(t), good = eventFor(s.claim), bads = [
    [good, { ...good, log: { ...good.log, data: good.log.data.slice(0, -2) + '01' } }],
    [good, { ...good, transactionHash: '0x' + '89'.repeat(32) }],
    [{ ...good, logIndex: 1n }, good], [{ ...good, blockHash: '0x' + 'ef'.repeat(32) }], [{ ...good, blockNumber: 2n }],
    [{ ...good, log: { ...good.log, address: '0x' + '44'.repeat(20) } }],
  ];
  for (const logs of bads) fail(await s.run(requestFor(), { async readOfflinePage(q) { return pageFor(q, logs); } }));
  for (const over of [{ profileId: SDK }, { context: { ...CONTEXT, id: 'mixed' } }, { fromBlock: 0n }, { anchorHash: '0x' + 'ee'.repeat(32) }])
    fail(await s.run(requestFor(), { async readOfflinePage(q) { return pageFor(q, [good], over); } }));
  assert.equal(s.storage.writes, 1); assert.equal((await records(s)).length, 0);
});
test('wrong-tag/address valid events are nonmatches and cannot become imported balance proofs', async t => {
  const s = await setup(t), wrong = { ...s.claim, metadataHex: s.claim.metadataHex === '00' ? '01' : '00' };
  const r = val(await s.run(requestFor(), { async readOfflinePage(q) { return pageFor(q, [eventFor(wrong)]); } }));
  assert.equal(r.added, 0); assert.equal(r.tracked, 0); assert.equal(r.compared, 1); assert.equal((await records(s)).length, 1);
});
test('cursor comparison is exact and contiguous; copied or mismatched encrypted stores confer no authority', async t => {
  const s = await setup(t), result = val(await s.run()); const writes = s.storage.writes; let called = 0;
  const source = { async readOfflinePage(q) { called++; return pageFor(q, []); } };
  fail(await s.run(requestFor(), source), 'CURSOR_CONFLICT'); fail(await s.run(requestFor({ fromBlock: 3n, toBlock: 3n, expectedCursor: result.cursor }), source), 'CURSOR_CONFLICT'); assert.equal(called, 0);
  fail(await s.service.comparePages(s.view, SPEND, requestFor(), source, { ...s.store }), 'INVALID_HANDLE');
  const other = val(s.service.createViewingKey()); fail(await s.service.comparePages(other, SPEND, requestFor(), source, s.store), 'CONTEXT_MISMATCH');
  assert.equal(s.storage.writes, writes);
});
test('future own namespace and deterministic-id collision fail closed while unrelated future records survive', async t => {
  for (const future of [false, true]) {
    const s = await setup(t), scopeHash = scopeHashOf(binding(s)), id = cursorIdOf(scopeHash);
    await put(s, { id, kind: 'preference', schemaVersion: future ? 2 : 1, payload: Buffer.from(JSON.stringify(future ? { format: CURSOR_FORMAT, version: 2, scopeHash } : { format: 'future-unrelated', value: 1 })).toString('base64url') });
    const before = s.storage.writes; fail(await s.run(), future ? 'UNSUPPORTED_PROFILE' : 'INTEGRITY_FAILURE'); assert.equal(s.storage.writes, before); assert.equal((await records(s)).length, 1);
  }
});
test('a foreign preference occupying a new candidate id is preserved rather than overwritten', async t => {
  const s = await setup(t), id = candidateIdOf(scopeHashOf(binding(s)), eventFor(s.claim)), record = { ...foreign, id };
  await put(s, record); const before = s.storage.writes;
  fail(await s.run(), 'CONFLICT'); assert.equal(s.storage.writes, before); assert.deepEqual(await records(s), [record]);
});
test('cached match bytes are revalidated instead of accepting encrypted claimed match flags', async t => {
  const s = await setup(t), result = val(await s.run()); const saved = await records(s), candidate = saved.find(r => decode(r.payload).format === CANDIDATE_FORMAT), value = decode(candidate.payload);
  value.observed.log.topics[2] = '0x' + '00'.repeat(32); await put(s, { ...candidate, payload: Buffer.from(JSON.stringify(value)).toString('base64url') }); const before = s.storage.writes;
  fail(await s.run(requestFor({ fromBlock: 2n, toBlock: 2n, expectedCursor: result.cursor }), { async readOfflinePage(q) { return pageFor(q, []); } }), 'INTEGRITY_FAILURE'); assert.equal(s.storage.writes, before);
});
test('actual G02 CAS conflict with another unlocked tab writes no stale candidate or cursor', async t => {
  const s = await setup(t), other = new EncryptedVaultService(s.storage, crypto, { lifecycle: false }); t.after(() => other.dispose());
  const second = val(await other.unlock(s.session.profileId, 'Synthetic offline stealth fixture passphrase'));
  const result = await s.run(requestFor(), { async readOfflinePage(q) {
    val(await other.commit(second.sessionId, second.revision, [{ op: 'put', record: foreign }])); return pageFor(q, [eventFor(s.claim)]);
  } });
  assert.equal(['CONFLICT', 'LOCKED'].includes(fail(result)), true); assert.equal(s.storage.writes, 2); // G02 may revoke the stale lease while rejecting its CAS.
  assert.deepEqual(val(await other.list(second.sessionId, 'preference')), [foreign]);
});
test('cancel is prompt but ignored source retains physical admission until drain, then no mutation', async t => {
  const s = await setup(t), waiting = deferred(), entered = deferred(), abort = new AbortController();
  const pending = s.run(requestFor(), { async readOfflinePage(q) { entered.resolve(); await waiting.promise; return pageFor(q, [eventFor(s.claim)]); } }, abort.signal);
  await entered.promise; abort.abort(); fail(await pending, 'CANCELLED'); fail(await s.run(), 'CONFLICT'); fail(s.service.createViewingKey(), 'CONFLICT');
  waiting.resolve(); await tick(); await tick(); assert.equal(s.storage.writes, 1); val(s.service.createViewingKey());
});
test('vault lock synchronously wipes native view buffer and retires pending comparison while ignored source drains', async t => {
  const s = await setup(t); let secret;
  const view = nativeFill(bytes => { if (!secret) secret = bytes; bytes.fill(0); bytes[31] = 9; return bytes; }, () => val(s.service.createViewingKey()));
  const store = val(createEncryptedComparisonStore({ ...binding(s), viewingPublicKeyHex: view.viewingPublicKeyHex, vault: s.vault, session: s.session, isCurrent: () => true })); t.after(() => store.close());
  const entered = deferred(), waiting = deferred();
  const pending = s.service.comparePages(view, SPEND, requestFor(), { async readOfflinePage(q) { entered.resolve(); await waiting.promise; return pageFor(q, []); } }, store);
  await entered.promise; assert.equal(secret[31], 9); s.vault.lock(s.session.sessionId); assert.equal(secret.every(b => b === 0), true);
  fail(await pending, 'LOCKED'); fail(s.service.createViewingKey(), 'CONFLICT'); waiting.resolve(); await tick(); await tick(); fail(s.service.createViewingKey(), 'LOCKED'); assert.equal(s.storage.writes, 1);
});
test('page parsing callback retirement is checked before candidate allocation, crypto or atomic write', async t => {
  const s = await setup(t); let nested;
  const result = await s.run(requestFor(), { async readOfflinePage(q) {
    return new Proxy(pageFor(q, [eventFor(s.claim)]), { getPrototypeOf(target) { nested = s.service.createViewingKey(); s.service.close(); return Object.getPrototypeOf(target); } });
  } });
  fail(result, 'LOCKED'); fail(nested, 'CONFLICT'); assert.equal(s.storage.writes, 1);
});

test('completed comparisons retain idle vault and store revocation until viewing-service closure', async t => {
  for (const retirement of ['vault', 'store']) {
    const s = await setup(t); let secret;
    const view = nativeFill(bytes => { if (!secret) secret = bytes; bytes.fill(0); bytes[31] = 9; return bytes; }, () => val(s.service.createViewingKey()));
    const store = val(createEncryptedComparisonStore({ ...binding(s), viewingPublicKeyHex: view.viewingPublicKeyHex, vault: s.vault, session: s.session, isCurrent: () => true })); t.after(() => store.close());
    val(await s.service.comparePages(view, SPEND, requestFor(), { async readOfflinePage(q) { return pageFor(q, []); } }, store));
    assert.equal(secret[31], 9); val(s.service.recipientMetaAddress(view, SPEND));
    if (retirement === 'vault') s.vault.lock(s.session.sessionId); else store.close();
    assert.equal(secret.every(b => b === 0), true, retirement + ' retirement must wipe the idle owned view');
    fail(s.service.recipientMetaAddress(view, SPEND), 'LOCKED');
    fail(s.service.createViewingKey(), 'LOCKED');
  }
});
test('store-owner callback reentry is denied and revocation retires the viewing capability before source work', async t => {
  const s = await setup(t); let current = true, reenter = true, nested, calls = 0;
  const store = val(createEncryptedComparisonStore({ ...binding(s), vault: s.vault, session: s.session, isCurrent() {
    if (reenter) { reenter = false; nested = s.service.createViewingKey(); } return current;
  } })); t.after(() => store.close());
  const source = { async readOfflinePage(q) { calls++; return pageFor(q, []); } };
  val(await s.service.comparePages(s.view, SPEND, requestFor(), source, store)); fail(nested, 'CONFLICT');
  current = false;
  fail(await s.service.comparePages(s.view, SPEND, requestFor(), source, store), 'LOCKED');
  assert.equal(calls, 1); fail(s.service.recipientMetaAddress(s.view, SPEND), 'LOCKED'); assert.equal(s.storage.writes, 2);
});
test('intrinsic AbortSignal methods ignore hostile own listener methods without invoking them', async t => {
  const s = await setup(t), abort = new AbortController(); let called = 0;
  Object.defineProperties(abort.signal, { addEventListener: { get() { called++; throw Error('secret error'); } }, removeEventListener: { get() { called++; throw Error('secret error'); } } });
  val(await s.run(requestFor(), { async readOfflinePage(q) { return pageFor(q, []); } }, abort.signal)); assert.equal(called, 0);
});
test('ambiguous storage completion is never reported as successful or rolled back by the model', async t => {
  const s = await setup(t); s.storage.afterWrite = () => { throw new VaultStorageError('STORAGE_UNAVAILABLE'); };
  const result = await s.run(); fail(result); assert.equal(s.storage.writes, 2); // Actual encrypted CAS may have persisted before the port lost its reply.
  s.storage.afterWrite = undefined;
  const reopened = new EncryptedVaultService(s.storage, crypto, { lifecycle: false }); t.after(() => reopened.dispose());
  const session = val(await reopened.unlock(s.session.profileId, 'Synthetic offline stealth fixture passphrase'));
  assert.equal(val(await reopened.list(session.sessionId, 'preference')).length, 2);
});
test('wall-clock rollback after await suppresses late page output and retires viewing capability', async t => {
  const s = await setup(t), original = Date.now; let wall = 1_700_000_000_000;
  Date.now = () => wall;
  try {
    const result = await s.run(requestFor(), { async readOfflinePage(q) { wall--; return pageFor(q, [eventFor(s.claim)]); } });
    fail(result, 'CLOCK_REVERSED'); assert.equal(s.storage.writes, 1); await tick(); await tick(); fail(s.service.recipientMetaAddress(s.view, SPEND), 'LOCKED');
  } finally { Date.now = original; }
});
test('local30-second wall deadline refuses late output without waiting for a throttled timer', async t => {
  const s = await setup(t), original = Date.now; let wall = 1_700_000_000_000;
  Date.now = () => wall;
  try {
    fail(await s.run(requestFor(), { async readOfflinePage(q) { wall += 30_001; return pageFor(q, [eventFor(s.claim)]); } }), 'TIMEOUT');
    assert.equal(s.storage.writes, 1);
  } finally { Date.now = original; }
});
