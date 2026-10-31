// Saved terms reviews in the document: controller semantics (re-review on load, lock forgetting, stale results) and
// AppRuntime reply binding to the profile the command named.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTradeReviewController, MAX_SESSION_REVIEWS } from '../src/trade/review-controller.ts';

const registry = { network: () => null, deployment: () => null };
const source = async () => ({ kind: 'ready', label: 'synthetic-demo', registry, samples: [] });
const enc = text => new TextEncoder().encode(text);
const dec = bytes => new TextDecoder().decode(bytes);
// Review oracle: "ok:<order>" is accepted, "bad:<code>" is rejected with that code.
const review = async (_registry, bytes) => { const [kind, value] = dec(bytes).split(':'); return kind === 'ok' ? { ok: true, value: Object.freeze({ orderId: value, revision: '1' }) } : { ok: false, code: value }; };
const file = text => ({ size: text.length, arrayBuffer: async () => enc(text).buffer });
const ok = value => ({ ok: true, value });
const err = code => ({ ok: false, error: { code, messageKey: `runtime.error.${code.toLowerCase()}` } });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
let counter = 0;
const randomBytes = () => { const bytes = new Uint8Array(16); bytes[15] = ++counter; bytes[14] = counter >> 8; return bytes; };

/** In-memory stand-in for the open profile's saved-review commands. */
function memoryStore() {
  const rows = new Map(); let next = 0;
  return {
    rows,
    async saveTermsReview(src, bytes) {
      for (const [recordId, row] of rows) if (row.source === src && dec(row.bytes) === dec(bytes)) return ok({ recordId });
      if (rows.size >= 8) return err('LIMIT_EXCEEDED');
      const recordId = (++next).toString(16).padStart(32, '0'); rows.set(recordId, { source: src, bytes: bytes.slice() }); return ok({ recordId });
    },
    async listTermsReviews() { return ok({ items: [...rows].map(([recordId, row]) => ({ recordId, source: row.source, bytes: row.bytes.slice() })), skipped: 0 }); },
    async deleteTermsReview(recordId) { return rows.delete(recordId) ? ok({ recordId }) : err('NOT_FOUND'); },
  };
}
async function controller() { const trade = createTradeReviewController({ source, review, randomBytes }); await trade.loadRegistry(); return trade; }

test('save keeps the exact reviewed bytes, marks the review saved, and a later load re-reviews them into a fresh session', async () => {
  const store = memoryStore(), trade = await controller();
  const imported = await trade.importFile(file('ok:order-1'));
  await trade.saveToProfile(imported.localId, store);
  const saved = trade.find(imported.localId);
  assert.match(saved.savedId, /^[0-9a-f]{32}$/); assert.equal(dec(store.rows.get(saved.savedId).bytes), 'ok:order-1');
  assert.deepEqual(trade.getSnapshot().saved, { kind: 'done', action: 'save', skipped: 0 });
  // A new page/session: nothing in memory until the profile is loaded.
  const fresh = await controller();
  await fresh.loadSaved(store);
  const [loaded] = fresh.getSnapshot().reviews;
  assert.equal(loaded.review.orderId, 'order-1'); assert.equal(loaded.savedId, saved.savedId); assert.equal(loaded.loaded, true);
  assert.notEqual(loaded.localId, imported.localId, 'route IDs are per session, never stored');
});

test('loading matches an identical session review instead of duplicating it', async () => {
  const store = memoryStore(), trade = await controller();
  const a = await trade.importFile(file('ok:order-2'));
  await store.saveTermsReview('file', enc('ok:order-2'));
  await trade.loadSaved(store);
  assert.equal(trade.getSnapshot().reviews.length, 1);
  assert.equal(trade.find(a.localId).savedId !== null, true);
  assert.equal(trade.find(a.localId).loaded, false);
});

test('saved bytes that no longer pass review are listed by record id for deletion, never shown as a review', async () => {
  const store = memoryStore(), trade = await controller();
  const { value: { recordId } } = await store.saveTermsReview('file', enc('bad:UNFUNDABLE_WINDOW'));
  await trade.loadSaved(store);
  assert.equal(trade.getSnapshot().reviews.length, 0);
  assert.deepEqual(trade.getSnapshot().unreviewable, [{ recordId, code: 'UNFUNDABLE_WINDOW' }]);
  await trade.deleteSaved(recordId, store);
  assert.equal(store.rows.size, 0); assert.deepEqual(trade.getSnapshot().unreviewable, []);
});

test('a mixed saved load publishes each valid review and refuses invalid records in either listing order without rewriting originals', async () => {
  for (const texts of [['ok:valid', 'bad:EXPIRED'], ['bad:EXPIRED', 'ok:valid']]) {
    const store = memoryStore(), trade = await controller();
    for (const text of texts) await store.saveTermsReview('file', enc(text));
    const original = [...store.rows].map(([id, row]) => [id, { source: row.source, bytes: row.bytes.slice() }]);
    const invalidId = [...store.rows].find(([, row]) => dec(row.bytes) === 'bad:EXPIRED')[0];
    try {
      await trade.loadSaved(store);
      assert.deepEqual(trade.getSnapshot().reviews.map(item => item.review.orderId), ['valid']);
      assert.deepEqual(trade.getSnapshot().unreviewable, [{ recordId: invalidId, code: 'EXPIRED' }]);
      assert.deepEqual(trade.getSnapshot().saved, { kind: 'failed', action: 'load', code: 'INVALID_SAVED_REVIEW' });
      assert.deepEqual([...store.rows], original, 'loading neither rewrites nor deletes either encrypted record');
      assert.equal(trade.getSnapshot().reviews[0].loaded, true);
      assert.equal(dec(trade.getSnapshot().reviews[0].bytes), 'ok:valid');
    } finally { trade.dispose(); }
  }
});

test('forgetSaved (lock or profile switch) drops loaded reviews, unmarks session ones and resets the job link', async () => {
  const store = memoryStore(), trade = await controller();
  await store.saveTermsReview('file', enc('ok:loaded'));
  await trade.loadSaved(store); // Establish the valid loaded copy before a mixed invalid load is refused atomically.
  await store.saveTermsReview('file', enc('bad:UNKNOWN_NETWORK'));
  const session = await trade.importFile(file('ok:session'));
  await trade.saveToProfile(session.localId, store);
  await trade.loadSaved(store);
  const loaded = trade.getSnapshot().reviews.find(item => item.loaded);
  assert.ok(loaded); assert.equal(trade.getSnapshot().unreviewable.length, 1);
  trade.forgetSaved();
  const after = trade.getSnapshot();
  assert.deepEqual(after.reviews.map(item => item.review.orderId), ['session']);
  assert.equal(after.reviews[0].savedId, null);
  assert.deepEqual(after.unreviewable, []); assert.deepEqual(after.saved, { kind: 'idle' });
  assert.equal(trade.find(loaded.localId), null);
});

test('a saved-review result that arrives after forgetSaved is discarded (no stale data after lock)', async () => {
  const gate = deferred(), store = memoryStore(), trade = await controller();
  await store.saveTermsReview('file', enc('ok:late'));
  const slow = { ...store, listTermsReviews: async () => { await gate.promise; return store.listTermsReviews(); } };
  const pending = trade.loadSaved(slow);
  assert.deepEqual(trade.getSnapshot().saved, { kind: 'busy', action: 'load' });
  trade.forgetSaved();
  gate.resolve(); await pending;
  assert.equal(trade.getSnapshot().reviews.length, 0); assert.deepEqual(trade.getSnapshot().saved, { kind: 'idle' });
  const emptyGate = deferred();
  const empty = trade.loadSaved({ ...store, listTermsReviews: async () => { await emptyGate.promise; return ok({ items: [], skipped: 3 }); } });
  trade.forgetSaved(); emptyGate.resolve(); await empty;
  assert.deepEqual(trade.getSnapshot().saved, { kind: 'idle' }, 'even an empty late listing publishes nothing after lock');
  const saveGate = deferred();
  const imported = await trade.importFile(file('ok:x'));
  const pendingSave = trade.saveToProfile(imported.localId, { ...store, saveTermsReview: async (...args) => { await saveGate.promise; return store.saveTermsReview(...args); } });
  trade.forgetSaved(); saveGate.resolve(); await pendingSave;
  assert.equal(trade.find(imported.localId).savedId, null, 'a save completing after lock does not mark the review saved');
});

test('failures are typed and leave state unchanged; one saved-review operation at a time', async () => {
  const store = memoryStore(), trade = await controller();
  const imported = await trade.importFile(file('ok:y'));
  await trade.saveToProfile(imported.localId, { ...store, saveTermsReview: async () => err('LIMIT_EXCEEDED') });
  assert.deepEqual(trade.getSnapshot().saved, { kind: 'failed', action: 'save', code: 'LIMIT_EXCEEDED' });
  assert.equal(trade.find(imported.localId).savedId, null);
  await trade.loadSaved({ ...store, listTermsReviews: async () => { throw new Error('SECRET'); } });
  assert.deepEqual(trade.getSnapshot().saved, { kind: 'failed', action: 'load', code: 'PROTOCOL_ERROR' });
  const gate = deferred(); let calls = 0;
  const first = trade.loadSaved({ ...store, listTermsReviews: async () => { calls++; await gate.promise; return store.listTermsReviews(); } });
  await trade.loadSaved({ ...store, listTermsReviews: async () => { calls++; return store.listTermsReviews(); } });
  gate.resolve(); await first; assert.equal(calls, 1, 'second operation refused while busy');
  const noRegistry = createTradeReviewController({ source: async () => ({ kind: 'unavailable' }), review });
  await noRegistry.loadRegistry(); await noRegistry.loadSaved(store);
  assert.deepEqual(noRegistry.getSnapshot().saved, { kind: 'failed', action: 'load', code: 'REGISTRY_NOT_READY' });
});

test('deleting a saved review keeps a session copy unsaved; NOT_FOUND reconciles the stale mark', async () => {
  const store = memoryStore(), trade = await controller();
  const imported = await trade.importFile(file('ok:z'));
  await trade.saveToProfile(imported.localId, store);
  const recordId = trade.find(imported.localId).savedId;
  store.rows.delete(recordId); // deleted in another tab
  await trade.deleteSaved(recordId, store);
  assert.equal(trade.find(imported.localId).savedId, null);
  assert.deepEqual(trade.getSnapshot().saved, { kind: 'done', action: 'delete', skipped: 0 });
});

test('saved reviews are exempt from session eviction; unsaved ones keep the newest MAX_SESSION_REVIEWS', async () => {
  const store = memoryStore(), trade = await controller();
  const first = await trade.importFile(file('ok:keep'));
  await trade.saveToProfile(first.localId, store);
  for (let i = 0; i < MAX_SESSION_REVIEWS + 3; i++) await trade.importFile(file(`ok:n${i}`));
  const reviews = trade.getSnapshot().reviews;
  assert.ok(trade.find(first.localId), 'saved review not evicted');
  assert.equal(reviews.filter(item => item.savedId === null).length, MAX_SESSION_REVIEWS);
});

test('imports and removals made while a load is re-reviewing are kept, not overwritten (review finding 2)', async () => {
  const store = memoryStore(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const slowReview = async (registryArg, bytes) => { if (dec(bytes) === 'ok:saved' && calls++ === 0) await gate; return review(registryArg, bytes); };
  const trade = createTradeReviewController({ source, review: slowReview, randomBytes }); await trade.loadRegistry();
  const doomed = await trade.importFile(file('ok:doomed'));
  await store.saveTermsReview('file', enc('ok:saved'));
  const loading = trade.loadSaved(store);
  await new Promise(resolve => setImmediate(resolve));
  const during = await trade.importFile(file('ok:during'));
  trade.remove(doomed.localId);
  release(); await loading;
  const orders = trade.getSnapshot().reviews.map(item => item.review.orderId).sort();
  assert.deepEqual(orders, ['during', 'saved']);
  assert.deepEqual(trade.getSnapshot().job, { kind: 'accepted', localId: during.localId });
});

test('a load replaces an earlier review with today\'s result, and saved bytes that now fail are never shown (review finding 3)', async () => {
  const store = memoryStore(); let mode = 'first';
  const changing = async (registryArg, bytes) => dec(bytes) === 'ok:drift'
    ? (mode === 'first' ? { ok: true, value: Object.freeze({ orderId: 'drift', revision: '1' }) } : mode === 'second' ? { ok: true, value: Object.freeze({ orderId: 'drift', revision: '2' }) } : { ok: false, code: 'UNKNOWN_DEPLOYMENT' })
    : review(registryArg, bytes);
  const trade = createTradeReviewController({ source, review: changing, randomBytes }); await trade.loadRegistry();
  const { value: { recordId } } = await store.saveTermsReview('file', enc('ok:drift'));
  await trade.loadSaved(store);
  const first = trade.getSnapshot().reviews[0];
  assert.equal(first.review.revision, '1'); assert.equal(first.loaded, true);
  mode = 'second'; await trade.loadSaved(store);
  assert.equal(trade.getSnapshot().reviews.length, 1);
  assert.equal(trade.getSnapshot().reviews[0].localId, first.localId); assert.equal(trade.getSnapshot().reviews[0].review.revision, '2');
  mode = 'fail'; await trade.loadSaved(store);
  assert.equal(trade.getSnapshot().reviews.length, 0, 'a loaded review that now fails is removed from display');
  assert.deepEqual(trade.getSnapshot().unreviewable, [{ recordId, code: 'UNKNOWN_DEPLOYMENT' }]);
  // A session-imported copy of the same bytes stays as the user's own check, unmarked, and the record is listed once.
  mode = 'first';
  const own = await trade.importFile(file('ok:drift'));
  await trade.saveToProfile(own.localId, store);
  mode = 'fail'; await trade.loadSaved(store);
  assert.equal(trade.find(own.localId).savedId, null);
  assert.deepEqual(trade.getSnapshot().unreviewable, [{ recordId, code: 'UNKNOWN_DEPLOYMENT' }]);
});

// AppRuntime: replies for saved-review commands must belong to the profile that is still open.
let oldSecure;
beforeEach(() => { oldSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'); Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true }); });
afterEach(() => { if (oldSecure) Object.defineProperty(globalThis, 'isSecureContext', oldSecure); else delete globalThis.isSecureContext; });
const { AppRuntime } = await import('../src/runtime/app-runtime.ts');
const PROFILE = 'a'.repeat(32);
class Port extends EventTarget {
  sent = []; terminated = 0; handler;
  postMessage(value) { const command = structuredClone(value); this.sent.push(command); queueMicrotask(() => this.handler?.(command)); }
  reply(value) { const data = structuredClone(value); queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data }))); }
  terminate() { this.terminated++; }
}
const response = (command, value) => { const { config, profileId, passphrase, bytes, source: s, recordId: r, ...base } = command; return { ...base, kind: 'response', result: { ok: true, value } }; };
const handle = generation => ({ id: 'A'.repeat(43), generation, purpose: 'vault', profileId: PROFILE });
async function unlockedRuntime(port, savedReply) {
  port.handler = command => port.reply(response(command,
    (command.operation === 'unlock' || command.operation === 'create') ? { state: 'unlocked', handle: handle(command.generation) } :
    command.operation.endsWith('TermsReview') || command.operation === 'listTermsReviews' ? savedReply(command) : { state: 'locked', handle: null }));
  const runtime = (await AppRuntime.start({ version: 1, ReleaseEnabled: 0, connectOrigins: [] }, { createWorker: () => port, lifecycle: false })).value;
  assert.equal((await runtime.unlock(PROFILE, 'local runtime fixture passphrase')).ok, true);
  return runtime;
}

test('runtime names the open profile in every saved-review command and returns the bound value', async () => {
  const port = new Port();
  const runtime = await unlockedRuntime(port, command => command.operation === 'listTermsReviews' ? { items: [], skipped: 0 } : { recordId: 'b'.repeat(32) });
  assert.deepEqual((await runtime.saveTermsReview('file', enc('ok:1'))).value, { recordId: 'b'.repeat(32) });
  assert.deepEqual((await runtime.listTermsReviews()).value, { items: [], skipped: 0 });
  assert.deepEqual((await runtime.deleteTermsReview('b'.repeat(32))).value, { recordId: 'b'.repeat(32) });
  for (const command of port.sent.filter(c => /TermsReview/.test(c.operation))) assert.equal(command.profileId, PROFILE);
  await runtime.dispose();
});

test('runtime refuses saved-review commands while locked and drops a reply that arrives after lock', async () => {
  const port = new Port(); let held;
  const runtime = await unlockedRuntime(port, command => { held = command; return undefined; });
  port.handler = command => { if (command.operation === 'listTermsReviews') { held = command; return; } port.reply(response(command, { state: 'locked', handle: null })); };
  const pending = runtime.listTermsReviews();
  await new Promise(resolve => setImmediate(resolve));
  await runtime.lock();
  port.reply(response(held, { items: [{ recordId: 'b'.repeat(32), source: 'file', bytes: enc('ok:secret') }], skipped: 0 }));
  const result = await pending;
  assert.equal(result.ok, false); assert.equal(result.error.code, 'LOCKED');
  const locked = await runtime.saveTermsReview('file', enc('ok:2'));
  assert.equal(locked.ok, false); assert.equal(locked.error.code, 'LOCKED');
  assert.equal(port.sent.filter(c => c.operation === 'saveTermsReview').length, 0, 'nothing is posted while locked');
  await runtime.dispose();
});

test('a wrong-shaped saved-review reply is a protocol failure that closes the runtime', async () => {
  const port = new Port();
  const runtime = await unlockedRuntime(port, () => ({ state: 'locked', handle: null }));
  const result = await runtime.saveTermsReview('file', enc('ok:3'));
  assert.equal(result.ok, false); assert.equal(result.error.code, 'PROTOCOL_ERROR'); assert.equal(port.terminated, 1);
  await runtime.dispose();
});

test('a click\'s own pending activity ping does not make its command BUSY; a second public command still is', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
  let runtime;
  try {
    const port = new Port(); const held = [];
    port.handler = command => {
      if (command.operation === 'activity') { held.push(command); return; } // reply withheld: the ping stays pending
      if (command.operation === 'listTermsReviews') { held.push(command); return; }
      port.reply(response(command, (command.operation === 'unlock' || command.operation === 'create') ? { state: 'unlocked', handle: handle(command.generation) } :
        command.operation === 'saveTermsReview' ? { recordId: 'b'.repeat(32) } : { state: 'locked', handle: null }));
    };
    runtime = (await AppRuntime.start({ version: 1, ReleaseEnabled: 0, connectOrigins: [] }, { createWorker: () => port })).value;
    assert.equal((await runtime.unlock(PROFILE, 'local runtime fixture passphrase')).ok, true);
    const pointer = new Event('pointerdown'); Object.defineProperty(pointer, 'isTrusted', { value: true });
    globalThis.document.dispatchEvent(pointer);
    assert.equal(port.sent.filter(c => c.operation === 'activity').length, 1, 'activity ping posted and left pending');
    const saved = await runtime.saveTermsReview('file', enc('ok:click'));
    assert.deepEqual(saved, { ok: true, value: { recordId: 'b'.repeat(32) } }, 'the click\'s own command is not BUSY');
    const listing = runtime.listTermsReviews();
    const busy = await runtime.deleteTermsReview('b'.repeat(32));
    assert.equal(busy.ok, false); assert.equal(busy.error.code, 'BUSY', 'still one public command at a time');
    void listing;
  } finally {
    await runtime?.dispose();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('unlock or create retires a pending activity waiter without a protocol close (combined lifecycle contract)', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
  let runtime, port;
  try {
    port = new Port(); const held = [];
    port.handler = command => {
      if (command.operation === 'activity') { held.push(command); return; }
      port.reply(response(command, (command.operation === 'unlock' || command.operation === 'create') ? { state: 'unlocked', handle: handle(command.generation) } : { state: 'locked', handle: null }));
    };
    runtime = (await AppRuntime.start({ version: 1, ReleaseEnabled: 0, connectOrigins: [] }, { createWorker: () => port })).value;
    assert.equal((await runtime.unlock(PROFILE, 'local runtime fixture passphrase')).ok, true);
    const key = new Event('keydown'); Object.defineProperty(key, 'isTrusted', { value: true });
    for (const open of [() => runtime.unlock(PROFILE, 'local runtime fixture passphrase'), () => runtime.create('fresh runtime fixture passphrase')]) {
      globalThis.document.dispatchEvent(key);
      const result = await open();
      assert.equal(result.ok, true);
      const ping=held.shift();port.reply(response(ping,{state:'unlocked',handle:handle(ping.generation)}));
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(port.terminated,0);assert.equal(runtime.current.state,'unlocked');
    }
    // The held activity reply (old handle) arrives: still unlocked, runtime still open.
    assert.equal(held.length,0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(port.terminated, 0); assert.equal(runtime.current.state, 'unlocked');
  } finally {
    await runtime?.dispose();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});


test('deleting a loaded review wipes retained snapshot bytes before later lock or disposal', async () => {
  const store = memoryStore(), trade = await controller();
  await store.saveTermsReview('file', enc('ok:loaded-private'));
  await trade.loadSaved(store);
  const held = trade.getSnapshot().reviews[0], recordId = held.savedId;
  assert.equal(dec(held.bytes), 'ok:loaded-private');
  await trade.deleteSaved(recordId, store);
  assert.equal(trade.find(held.localId), null);
  assert.ok(held.bytes.every(byte => byte === 0), 'deletion wipes bytes before dropping the last controller reference');
  trade.forgetSaved(); trade.dispose();
  assert.ok(held.bytes.every(byte => byte === 0));
});

for (const mode of ['accepted', 'rejected', 'oversized', 'too-many']) {
  test(`load wipes every transferred runtime buffer on ${mode} completion`, async () => {
    const trade = await controller();
    const bytes = mode === 'oversized' ? new Uint8Array(65537).fill(1) : enc(mode === 'rejected' ? 'bad:UNKNOWN_NETWORK' : 'ok:runtime-private');
    const items = Array.from({ length: mode === 'too-many' ? 9 : 1 }, (_, index) => ({ recordId: String(index + 1).padStart(32, '0'), source: 'file', bytes: index ? enc('ok:extra') : bytes }));
    await trade.loadSaved({ listTermsReviews: async () => ok({ items, skipped: 0 }) });
    for (const item of items) assert.ok(item.bytes.every(byte => byte === 0), 'the transferred runtime buffer is cleared on every result path');
    if (mode === 'accepted') {
      assert.equal(dec(trade.getSnapshot().reviews[0].bytes), 'ok:runtime-private', 'the adopted review owns a separate retained copy');
    } else assert.equal(trade.getSnapshot().reviews.length, 0);
    trade.dispose();
  });
}

test('lock wipes transferred runtime buffers while an uncooperative revalidation is still pending', async () => {
  const gate = deferred(), bytes = enc('ok:runtime-private');
  const trade = createTradeReviewController({ source, randomBytes, review: async (...args) => { await gate.promise; return review(...args); } });
  await trade.loadRegistry();
  const pending = trade.loadSaved({ listTermsReviews: async () => ok({ items: [{ recordId: 'a'.repeat(32), source: 'file', bytes }], skipped: 0 }) });
  await new Promise(resolve => setImmediate(resolve));
  trade.forgetSaved();
  assert.ok(bytes.every(byte => byte === 0), 'logical lock clears the owned response even when the review does not settle');
  gate.resolve(); await pending;
  assert.equal(trade.getSnapshot().reviews.length, 0); trade.dispose();
});

test('quota failure wipes only the save transfer, keeping the session source until it is removed', async () => {
  const trade = await controller(), imported = await trade.importFile(file('ok:keep-until-removed'));
  const held = trade.find(imported.localId).bytes; let transferred;
  await trade.saveToProfile(imported.localId, { saveTermsReview: async (_source, bytes) => { transferred = bytes; return err('QUOTA_EXCEEDED'); } });
  assert.equal(dec(held), 'ok:keep-until-removed');
  assert.ok(transferred.every(byte => byte === 0));
  trade.remove(imported.localId);
  assert.ok(held.every(byte => byte === 0)); trade.dispose();
});


test('load replacement wipes the earlier buffer and borrowed retained bytes survive a rejected list', async () => {
  const trade = await controller(), store = memoryStore();
  await store.saveTermsReview('file', enc('ok:replace'));
  await trade.loadSaved(store);
  const earlier = trade.getSnapshot().reviews[0].bytes;
  await trade.loadSaved(store);
  const current = trade.getSnapshot().reviews[0].bytes;
  assert.notEqual(current, earlier);
  assert.ok(earlier.every(byte => byte === 0));
  assert.equal(dec(current), 'ok:replace');
  await trade.loadSaved({ listTermsReviews: async () => ok({ items: [{ recordId: 'invalid-id', source: 'file', bytes: current }], skipped: 0 }) });
  assert.equal(trade.getSnapshot().reviews[0].bytes, current);
  assert.equal(dec(current), 'ok:replace', 'rejected input cannot erase an existing retained review it aliases');
  trade.dispose(); assert.ok(current.every(byte => byte === 0));
});


test('a candidate dropped by a failed merge cannot leave an unwiped transient buffer', async () => {
  let count = 0; const held = [];
  const trade = createTradeReviewController({ source, review: async (_registry, bytes) => {
    held.push(bytes); return review(_registry, bytes);
  }, randomBytes: () => { if (++count === 2) throw new Error('local RNG unavailable'); return randomBytes(); } });
  await trade.loadRegistry();
  const bytes = [enc('ok:first'), enc('ok:second')];
  await trade.loadSaved({ listTermsReviews: async () => ok({ items: bytes.map((value, index) => ({ recordId: String(index + 1).padStart(32, '0'), source: 'file', bytes: value })), skipped: 0 }) });
  assert.equal(trade.getSnapshot().reviews.length, 0);
  assert.equal(trade.getSnapshot().saved.code, 'INVALID_SAVED_REVIEW');
  assert.ok([...bytes, ...held].every(value => value.every(byte => byte === 0)));
  trade.dispose();
});
