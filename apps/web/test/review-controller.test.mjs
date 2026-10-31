import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradeReviewController, noApprovedRegistry, MAX_SESSION_REVIEWS } from '../src/trade/review-controller.ts';

const registry = { network: () => null, deployment: () => null };
const ready = async () => ({ kind: 'ready', label: 'synthetic-demo', registry, samples: [{ id: 's1', label: 'Sample', load: async now => new TextEncoder().encode(String(now)) }] });
const accepted = order => ({ ok: true, value: Object.freeze({ orderId: order, revision: '1' }) });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
let counter = 0;
const randomBytes = () => { const bytes = new Uint8Array(16); bytes[15] = ++counter; return bytes; };
const file = (text, size) => ({ size: size ?? text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer });

test('registry: loading → unavailable for the default build, and import is refused without a registry', async () => {
  const trade = createTradeReviewController({ source: noApprovedRegistry });
  assert.equal(trade.getSnapshot().registry.kind, 'loading');
  await trade.loadRegistry();
  assert.equal(trade.getSnapshot().registry.kind, 'unavailable');
  assert.deepEqual(await trade.importFile(file('{}')), { kind: 'rejected', code: 'REGISTRY_NOT_READY' });
});

test('registry: a throwing source fails closed; loadRegistry is idempotent', async () => {
  let calls = 0;
  const trade = createTradeReviewController({ source: async () => { calls++; throw new Error('boom'); } });
  await Promise.all([trade.loadRegistry(), trade.loadRegistry()]);
  await trade.loadRegistry();
  assert.equal(calls, 1);
  assert.equal(trade.getSnapshot().registry.kind, 'failed');
});

test('accepted import stores a frozen review under a random opaque route ID, never derived from the terms', async () => {
  const trade = createTradeReviewController({ source: ready, randomBytes, review: async () => accepted('a1') });
  await trade.loadRegistry();
  const states = [];
  trade.subscribe(() => states.push(trade.getSnapshot().job.kind));
  const outcome = await trade.importFile(file('{"x":1}'));
  assert.equal(outcome.kind, 'accepted');
  assert.match(outcome.localId, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(states, ['busy', 'busy', 'accepted']);
  const stored = trade.find(outcome.localId);
  assert.equal(stored.source, 'file');
  assert.equal(stored.review.orderId, 'a1');
  assert.ok(Object.isFrozen(trade.getSnapshot()) && Object.isFrozen(trade.getSnapshot().reviews));
});

test('oversize files are refused before any bytes are read', async () => {
  let read = false;
  const trade = createTradeReviewController({ source: ready, randomBytes, review: async () => accepted('a1') });
  await trade.loadRegistry();
  const outcome = await trade.importFile({ size: 64 * 1024 + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } });
  assert.deepEqual(outcome, { kind: 'rejected', code: 'TOO_LARGE' });
  assert.equal(read, false);
});

test('rejections, unreadable files and a throwing validator map to fixed codes and store nothing', async () => {
  let result = { ok: false, code: 'AGREEMENT_HASH_MISMATCH' };
  const trade = createTradeReviewController({ source: ready, randomBytes, review: async () => { if (result === 'throw') throw new Error('x'); return result; } });
  await trade.loadRegistry();
  assert.deepEqual(await trade.importFile(file('{}')), { kind: 'rejected', code: 'AGREEMENT_HASH_MISMATCH' });
  assert.deepEqual(await trade.importFile({ size: 2, arrayBuffer: async () => { throw new Error('denied'); } }), { kind: 'rejected', code: 'FILE_UNREADABLE' });
  result = 'throw';
  assert.deepEqual(await trade.importFile(file('{}')), { kind: 'rejected', code: 'UNAVAILABLE' });
  assert.equal(trade.getSnapshot().reviews.length, 0);
});

test('cancel during checking discards the late result and stores nothing', async () => {
  const gate = deferred();
  const trade = createTradeReviewController({ source: ready, randomBytes, review: () => gate.promise });
  await trade.loadRegistry();
  const pending = trade.importFile(file('{}'));
  await new Promise(r => setImmediate(r));
  assert.deepEqual(trade.getSnapshot().job, { kind: 'busy', step: 'checking' });
  trade.cancel();
  assert.equal(trade.getSnapshot().job.kind, 'cancelled');
  gate.resolve(accepted('late'));
  assert.deepEqual(await pending, { kind: 'stale' });
  assert.equal(trade.getSnapshot().reviews.length, 0);
  assert.equal(trade.getSnapshot().job.kind, 'cancelled');
  trade.cancel();
  assert.equal(trade.getSnapshot().job.kind, 'cancelled', 'cancel when idle is a no-op');
});

test('a newer import supersedes an older one; the stale result never overwrites the newer state', async () => {
  const first = deferred(), second = deferred();
  const gates = [first, second];
  const trade = createTradeReviewController({ source: ready, randomBytes, review: () => gates.shift().promise });
  await trade.loadRegistry();
  const older = trade.importFile(file('{}'));
  await new Promise(r => setImmediate(r));
  const newer = trade.importFile(file('{}'));
  await new Promise(r => setImmediate(r));
  second.resolve(accepted('new'));
  const newerOutcome = await newer;
  first.resolve(accepted('old'));
  assert.deepEqual(await older, { kind: 'stale' });
  assert.equal(newerOutcome.kind, 'accepted');
  assert.deepEqual(trade.getSnapshot().reviews.map(item => item.review.orderId), ['new']);
  assert.equal(trade.getSnapshot().job.localId, newerOutcome.localId);
});

test('re-importing identical terms reuses the existing review (duplicate submission)', async () => {
  const trade = createTradeReviewController({ source: ready, randomBytes, review: async () => accepted('same') });
  await trade.loadRegistry();
  const one = await trade.importFile(file('{}'));
  const two = await trade.importFile(file('{}'));
  assert.equal(one.localId, two.localId);
  assert.equal(trade.getSnapshot().reviews.length, 1);
  const sample = await trade.importSample('s1');
  assert.notEqual(sample.localId, one.localId, 'a synthetic sample is kept apart from a file with equal terms');
});

test('session is bounded: the oldest review is evicted after MAX_SESSION_REVIEWS', async () => {
  let n = 0;
  const trade = createTradeReviewController({ source: ready, randomBytes, review: async () => accepted(`o${n++}`) });
  await trade.loadRegistry();
  const ids = [];
  for (let i = 0; i < MAX_SESSION_REVIEWS + 2; i++) ids.push((await trade.importFile(file('{}'))).localId);
  assert.equal(trade.getSnapshot().reviews.length, MAX_SESSION_REVIEWS);
  assert.equal(trade.find(ids[0]), null);
  assert.equal(trade.find(ids[1]), null);
  assert.ok(trade.find(ids.at(-1)));
  trade.remove(ids.at(-1));
  assert.equal(trade.find(ids.at(-1)), null);
});

test('samples receive the injected clock; unknown samples fail closed', async () => {
  let seen = '';
  const trade = createTradeReviewController({ source: ready, randomBytes, nowSeconds: () => 1234n, review: async (_registry, bytes) => { seen = new TextDecoder().decode(bytes); return accepted('s'); } });
  await trade.loadRegistry();
  assert.equal((await trade.importSample('s1')).kind, 'accepted');
  assert.equal(seen, '1234');
  assert.equal(trade.nowSeconds(), '1234');
  assert.deepEqual(await trade.importSample('nope'), { kind: 'rejected', code: 'FILE_UNREADABLE' });
});

test('dispose discards in-flight work and stops notifications', async () => {
  const gate = deferred();
  const trade = createTradeReviewController({ source: ready, randomBytes, review: () => gate.promise });
  await trade.loadRegistry();
  let notified = 0;
  trade.subscribe(() => notified++);
  const pending = trade.importFile(file('{}'));
  await new Promise(r => setImmediate(r));
  const before = notified;
  trade.dispose();
  gate.resolve(accepted('late'));
  assert.deepEqual(await pending, { kind: 'stale' });
  assert.equal(notified, before);
  assert.deepEqual(await trade.importFile(file('{}')), { kind: 'stale' });
});

test('removing the review the last job accepted resets the job, so no link points at a missing review', async () => {
  const trade = createTradeReviewController({ source: ready, randomBytes, review: async () => accepted('gone') });
  await trade.loadRegistry();
  const outcome = await trade.importFile(file('{}'));
  trade.remove(outcome.localId);
  assert.deepEqual(trade.getSnapshot().job, { kind: 'idle' });
  const kept = await trade.importFile(file('{}'));
  trade.remove('not-this-one');
  assert.equal(trade.getSnapshot().job.localId, kept.localId, 'removing a different ID leaves the job alone');
});

test('cancel during reading, and a file import superseding a sample, both discard the older work', async () => {
  const reading = deferred();
  const trade = createTradeReviewController({ source: ready, randomBytes, review: async (_registry, bytes) => accepted(new TextDecoder().decode(bytes)) });
  await trade.loadRegistry();
  const pending = trade.importFile({ size: 2, arrayBuffer: () => reading.promise });
  assert.deepEqual(trade.getSnapshot().job, { kind: 'busy', step: 'reading' });
  trade.cancel();
  reading.resolve(new TextEncoder().encode('late').buffer);
  assert.deepEqual(await pending, { kind: 'stale' });
  assert.equal(trade.getSnapshot().job.kind, 'cancelled');
  const slowSample = createTradeReviewController({ source: async () => ({ kind: 'ready', label: 'synthetic-demo', registry,
    samples: [{ id: 's1', label: 'Slow', load: () => reading2.promise }] }), randomBytes, review: async (_registry, bytes) => accepted(new TextDecoder().decode(bytes)) });
  const reading2 = deferred();
  await slowSample.loadRegistry();
  const sample = slowSample.importSample('s1');
  const fileImport = await slowSample.importFile(file('file'));
  reading2.resolve(new TextEncoder().encode('sample'));
  assert.deepEqual(await sample, { kind: 'stale' });
  assert.deepEqual(slowSample.getSnapshot().reviews.map(item => item.review.orderId), ['file']);
  assert.equal(slowSample.getSnapshot().job.localId, fileImport.localId);
});

function persistencePort() {
  let state = 'unlocked', profileId = 'profile-a', scope = 0, counter = 0;
  const listeners = new Set(), saved = new Map();
  return {
    get profileId() { return state === 'unlocked' ? profileId : null; },
    getSnapshot: () => ({ state }),
    selectionScope:()=>scope,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    change(nextState, nextProfile = profileId) { state = nextState; profileId = nextProfile; scope++; for (const listener of listeners) listener(); },
    async saveTermsReview(_source, bytes) {
      for(const [recordId,existing] of saved)if(Buffer.from(existing).equals(Buffer.from(bytes)))return {ok:true,value:{recordId}};
      const recordId=(++counter).toString(16).padStart(32,'0');saved.set(recordId,bytes.slice());return {ok:true,value:{recordId}};
    },
    async listTermsReviews() { return { ok: true, value: { items: [...saved].map(([recordId, bytes]) => ({ recordId, source:'file', bytes: bytes.slice() })),skipped:0 } }; },
    deleteTermsReview:async recordId=>{saved.delete(recordId);return {ok:true,value:{recordId}};},
    saved,
  };
}
async function persistentController(review = async (_registry, bytes) => accepted(new TextDecoder().decode(bytes))) {
  const port = persistencePort();
  const trade = createTradeReviewController({ source: ready, randomBytes, review });
  trade.setPersistence(port); await trade.loadRegistry();
  return { trade, port };
}

test('explicit save preserves original document bytes including salt; stable record id differs from route and memory removal never deletes saved data', async () => {
  const { trade, port } = await persistentController(async (_registry, bytes) => { bytes.fill(0); return accepted('validated'); });
  const original = '{"agreementSalt":"exact original salt", "canonical":"document"}';
  const outcome = await trade.importFile(file(original));
  assert.equal(port.saved.size, 0, 'no implicit save');
  await trade.save(outcome.localId);
  assert.equal(trade.getSnapshot().persistence.kind, 'saved');
  const [id, bytes] = [...port.saved][0];
  assert.match(id, /^[0-9a-f]{32}$/); assert.notEqual(id, outcome.localId);
  assert.equal(new TextDecoder().decode(bytes), original);
  await trade.save(outcome.localId); assert.equal(port.saved.size, 1, 'retry reuses record id');
  trade.remove(outcome.localId); assert.equal(port.saved.size, 1);
  await trade.save(outcome.localId); assert.equal(trade.getSnapshot().persistence.code, 'REVIEW_MISSING');
});

test('load revalidates every saved document and fails atomically on corrupt terms without changing memory or vault', async () => {
  const checked = [];
  const { trade, port } = await persistentController(async (_registry, bytes) => {
    const text = new TextDecoder().decode(bytes); checked.push(text);
    return text === 'bad' ? { ok: false, code: 'MALFORMED' } : accepted(text);
  });
  const existing = await trade.importFile(file('existing'));
  port.saved.set('11'.repeat(16), new TextEncoder().encode('good'));
  port.saved.set('22'.repeat(16), new TextEncoder().encode('bad'));
  await trade.loadSaved();
  assert.deepEqual(checked, ['existing', 'good', 'bad']);
  assert.equal(trade.getSnapshot().persistence.code, 'INVALID_SAVED_REVIEW');
  assert.equal(trade.getSnapshot().reviews.length, 1); assert.ok(trade.find(existing.localId));
  assert.equal(port.saved.size, 2, 'load is read only');
  port.saved.delete('22'.repeat(16)); await trade.loadSaved();
  assert.equal(trade.getSnapshot().persistence.kind, 'loaded');
  assert.equal(trade.getSnapshot().reviews.length, 2);
  const loaded = trade.getSnapshot().reviews.find(item => item.review.orderId === 'good');
  assert.equal(loaded.loaded, true); await trade.save(loaded.localId); assert.equal(port.saved.size, 1, 'loaded record keeps saved id');
});

test('persistence refuses unavailable registry and locked profile without invoking vault commands', async () => {
  const port = persistencePort(); let calls = 0;
  port.listTermsReviews = async () => { calls++; throw Error('must not read'); };
  const unavailable = createTradeReviewController({ source: noApprovedRegistry });
  unavailable.setPersistence(port); await unavailable.loadRegistry(); await unavailable.loadSaved();
  assert.equal(unavailable.getSnapshot().persistence.code, 'REGISTRY_NOT_READY'); assert.equal(calls, 0);
  const { trade, port: locked } = await persistentController(); locked.change('locked'); await trade.loadSaved();
  assert.equal(trade.getSnapshot().persistence.code, 'LOCKED');
});

test('lock and unlocked profile switch clear private memory; late save and late load cannot repopulate it', async () => {
  const { trade, port } = await persistentController();
  const one = await trade.importFile(file('one'));
  const save = deferred(); let signal;
  port.saveTermsReview = async (_id, _bytes, inputSignal) => { signal = inputSignal; return save.promise; };
  const saving = trade.save(one.localId); port.change('locked');
  assert.equal(signal.aborted, true); assert.equal(trade.getSnapshot().reviews.length, 0); assert.equal(trade.getSnapshot().persistence.kind, 'idle');
  save.resolve({ ok: true, value: { recordId: '11'.repeat(16) } }); await saving;
  assert.equal(trade.getSnapshot().persistence.kind, 'idle');
  port.change('unlocked'); await trade.importFile(file('two')); port.change('unlocked', 'profile-b');
  assert.equal(trade.getSnapshot().reviews.length, 0, 'same-state profile switch must clear');
  const load = deferred(); port.listTermsReviews = () => load.promise;
  const loading = trade.loadSaved(); port.change('locked');
  const lateBytes = new TextEncoder().encode('late-private');
  load.resolve({ ok: true, value: { items: [{ recordId: '33'.repeat(16),source:'file', bytes: lateBytes }],skipped:0 } }); await loading;
  assert.equal(trade.getSnapshot().reviews.length, 0); assert.ok(lateBytes.every(byte => byte === 0));
});

test('quota and cancelled save report failure without losing memory; overlapping persistence calls do not duplicate writes', async () => {
  const { trade, port } = await persistentController(); const one = await trade.importFile(file('one'));
  port.saveTermsReview = async () => ({ ok: false, error: { code: 'QUOTA_EXCEEDED' } });
  await trade.save(one.localId); assert.equal(trade.getSnapshot().persistence.code, 'QUOTA_EXCEEDED'); assert.ok(trade.find(one.localId));
  const gate = deferred(); let calls = 0;
  port.saveTermsReview = async () => { calls++; return gate.promise; };
  const pending = trade.save(one.localId); await trade.save(one.localId); await trade.loadSaved(); assert.equal(calls, 1);
  trade.cancel(); assert.equal(trade.getSnapshot().persistence.code, 'UNKNOWN_OUTCOME');
  gate.resolve({ ok: true, value: { recordId: '11'.repeat(16) } }); await pending;
  assert.equal(trade.getSnapshot().persistence.code, 'UNKNOWN_OUTCOME'); assert.ok(trade.find(one.localId));
});

test('detach/dispose invalidate pending imports and private bytes; removed or evicted documents cannot be saved', async () => {
  const { trade, port } = await persistentController(); const first = await trade.importFile(file('first'));
  for (let index = 0; index < MAX_SESSION_REVIEWS; index++) await trade.importFile(file(String(index)));
  await trade.save(first.localId); assert.equal(port.saved.size, 0);
  trade.setPersistence(null); assert.equal(trade.getSnapshot().reviews.length, 0); assert.equal(trade.getSnapshot().persistence.unlocked, false);
  trade.setPersistence(port); await trade.importFile(file('private')); trade.dispose(); assert.equal(trade.getSnapshot().reviews.length, 0);
});

test('lock during saved-document validation clears returned plaintext and discards all candidates', async () => {
  const gate = deferred(); let validatingBytes;
  const { trade, port } = await persistentController(async (_registry, bytes) => { validatingBytes = bytes; return gate.promise; });
  port.saved.set('44'.repeat(16), new TextEncoder().encode('private raw terms'));
  const loading = trade.loadSaved(); await new Promise(r => setImmediate(r));
  port.change('locked'); assert.ok(validatingBytes.every(byte => byte === 0));
  gate.resolve(accepted('late')); await loading;
  assert.equal(trade.getSnapshot().reviews.length, 0); assert.equal(trade.getSnapshot().persistence.kind, 'idle');
});

test('a subscriber locking during acceptance cannot leave private bytes behind or return a navigable accepted result', async () => {
  const { trade, port } = await persistentController();
  trade.subscribe(() => { if (trade.getSnapshot().job.kind === 'accepted') port.change('locked'); });
  assert.deepEqual(await trade.importFile(file('private')), { kind: 'stale' });
  assert.equal(trade.getSnapshot().reviews.length, 0); port.change('unlocked');
  await trade.save('not-a-review'); assert.equal(port.saved.size, 0);
});
