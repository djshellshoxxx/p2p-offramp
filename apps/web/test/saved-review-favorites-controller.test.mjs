import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTradeReviewController } from '../src/trade/review-controller.ts';

const encode = value => new TextEncoder().encode(value), decode = value => new TextDecoder().decode(value);
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, messageKey: `runtime.error.${code.toLowerCase()}` } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const source = async () => ({ kind: 'ready', label: 'synthetic-demo', registry: { fixture: true }, samples: [] });
const file = text => ({ size: encode(text).length, arrayBuffer: async () => encode(text).buffer });
const live = []; afterEach(() => { for (const trade of live.splice(0)) trade.dispose(); });
async function setup(review = async (_registry, value) => ok(Object.freeze({ orderId: decode(value), revision: '1' }))) {
  let next = 0;
  const trade = createTradeReviewController({ source, review, randomBytes: length => { const out = new Uint8Array(length); out[0] = ++next; return out; } });
  live.push(trade); await trade.loadRegistry();
  return trade;
}
function memoryStore() {
  let revision = 0, next = 0, favorites = [], scope = 1, state = { state: 'unlocked' };
  const rows = new Map(), commands = [], listeners = new Set();
  const store = {
    rows, commands, getSnapshot: () => state, selectionScope: () => scope,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    select(notify = true) { scope++; state = { state: 'unlocked' }; if (notify) for (const listener of listeners) listener(); },
    lock() { scope++; state = { state: 'locked' }; for (const listener of listeners) listener(); },
    async saveTermsReview(source, bytes) { const recordId = (++next).toString(16).padStart(32, '0'); rows.set(recordId, { source, bytes: bytes.slice() }); revision++; return ok({ recordId }); },
    async listTermsReviews() { return ok({ items: [...rows].map(([recordId, item]) => ({ recordId, ...item, bytes: item.bytes.slice() })), skipped: 0 }); },
    async deleteTermsReview(recordId) { if (!rows.delete(recordId)) return fail('NOT_FOUND'); revision++; return ok({ recordId }); },
    async listFavoriteReviews(signal) { commands.push({ operation: 'list', signal }); return ok({ revision, recordIds: favorites.slice() }); },
    async setReviewFavorite(recordId, favorite, expectedRevision, signal) {
      commands.push({ operation: 'set', recordId, favorite, expectedRevision, signal });
      if (expectedRevision !== revision) return fail('CONFLICT');
      if (favorite && !rows.has(recordId)) return fail('NOT_FOUND');
      favorites = favorite ? [...favorites, recordId] : favorites.filter(id => id !== recordId); revision++;
      return ok({ recordId, favorite, revision });
    },
  };
  return store;
}
async function saved(trade, store, text = 'reviewed fixture') {
  const imported = await trade.importFile(file(text)); await trade.saveToProfile(imported.localId, store);
  return trade.find(imported.localId).savedId;
}

test('favorites are loaded explicitly, use the observed revision, and never auto-retry a conflict', async () => {
  const trade = await setup(), store = memoryStore(), recordId = await saved(trade, store);
  assert.deepEqual(trade.getSnapshot().favorites, { kind: 'idle' }); assert.equal(store.commands.length, 0);
  await trade.loadFavorites(store); assert.deepEqual(trade.getSnapshot().favorites, { kind: 'ready', revision: 1, recordIds: [] });
  await trade.setReviewFavorite(recordId, true, store);
  assert.deepEqual(trade.getSnapshot().favorites, { kind: 'ready', revision: 2, recordIds: [recordId] });
  assert.equal(store.commands.at(-1).expectedRevision, 1); assert.equal(store.commands.at(-1).signal instanceof AbortSignal, true);
  await store.saveTermsReview('file', encode('another tab changed the vault'));
  await trade.setReviewFavorite(recordId, false, store);
  assert.deepEqual(trade.getSnapshot().favorites, { kind: 'failed', code: 'CONFLICT' });
  assert.equal(store.commands.filter(command => command.operation === 'set').length, 2, 'one request per explicit click');
  await trade.loadFavorites(store); assert.deepEqual(trade.getSnapshot().favorites.recordIds, [recordId]);
  await trade.setReviewFavorite(recordId, false, store); assert.deepEqual(trade.getSnapshot().favorites.recordIds, []);
});

test('new save/delete operations retire the observed favorites revision; deleting never prunes a favorite', async () => {
  const trade = await setup(), store = memoryStore(), recordId = await saved(trade, store);
  await trade.loadFavorites(store); await trade.setReviewFavorite(recordId, true, store);
  await saved(trade, store, 'another review'); assert.deepEqual(trade.getSnapshot().favorites, { kind: 'idle' });
  await trade.loadFavorites(store); await trade.deleteSaved(recordId, store);
  assert.deepEqual(trade.getSnapshot().favorites, { kind: 'idle' });
  await trade.loadFavorites(store); assert.deepEqual(trade.getSnapshot().favorites.recordIds, [recordId]);
  assert.equal(await trade.openFavorite(recordId, store), null); assert.equal(trade.getSnapshot().saved.code, 'REVIEW_MISSING');
  await trade.setReviewFavorite(recordId, false, store); assert.deepEqual(trade.getSnapshot().favorites.recordIds, []);
});

test('every favorite open rechecks stored terms with the current registry and rejects a newly invalid saved review', async () => {
  let accepted = true, checks = 0;
  const trade = await setup(async (registry, bytes) => {
    assert.deepEqual(registry, { fixture: true }); checks++;
    return accepted ? ok({ orderId: decode(bytes), revision: String(checks) }) : { ok: false, code: 'UNKNOWN_DEPLOYMENT' };
  });
  const store = memoryStore(), recordId = await saved(trade, store);
  await trade.loadFavorites(store); await trade.setReviewFavorite(recordId, true, store);
  const localId = await trade.openFavorite(recordId, store); assert.ok(localId); assert.equal(checks, 2);
  assert.equal(trade.find(localId).review.revision, '2');
  accepted = false;
  assert.equal(await trade.openFavorite(recordId, store), null); assert.equal(checks, 3);
  assert.equal(trade.getSnapshot().reviews.some(item => item.savedId === recordId), false);
  assert.deepEqual(trade.getSnapshot().unreviewable, [{ recordId, code: 'UNKNOWN_DEPLOYMENT' }]);
  assert.deepEqual(trade.getSnapshot().favorites.recordIds, [recordId], 'failed review never changes the encrypted preference');
});

test('a completed mixed load may open its freshly valid favorite while a different saved row is rejected', async () => {
  const trade = await setup(async (_registry, bytes) => decode(bytes) === 'invalid row'
    ? { ok: false, code: 'UNKNOWN_DEPLOYMENT' } : ok({ orderId: decode(bytes), revision: '1' }));
  const store = memoryStore(), recordId = await saved(trade, store, 'valid favorite');
  const invalid = (await store.saveTermsReview('file', encode('invalid row'))).value.recordId;
  await trade.loadFavorites(store); await trade.setReviewFavorite(recordId, true, store);
  const localId = await trade.openFavorite(recordId, store); assert.ok(localId);
  assert.equal(trade.find(localId).savedId, recordId);
  assert.deepEqual(trade.getSnapshot().unreviewable, [{ recordId: invalid, code: 'UNKNOWN_DEPLOYMENT' }]);
  assert.equal(trade.getSnapshot().saved.code, 'INVALID_SAVED_REVIEW');
});

test('lock, silent profile change, forget and disposal discard held list/set replies', async () => {
  for (const action of ['lock', 'silent-switch', 'forget', 'dispose']) {
    for (const operation of ['list', 'set']) {
      const trade = await setup(), store = memoryStore(); trade.setPersistence(store);
      const recordId = await saved(trade, store); await trade.loadFavorites(store);
      const gate = deferred(); let signal;
      const held = { ...store,
        listFavoriteReviews: async incoming => { signal = incoming; await gate.promise; return ok({ revision: 7, recordIds: [recordId] }); },
        setReviewFavorite: async (_id, favorite, expectedRevision, incoming) => { signal = incoming; await gate.promise; return ok({ recordId, favorite, revision: expectedRevision + 1 }); },
      };
      const pending = operation === 'list' ? trade.loadFavorites(held) : trade.setReviewFavorite(recordId, true, held);
      if (action === 'lock') store.lock();
      else if (action === 'silent-switch') store.select(false);
      else if (action === 'forget') trade.forgetSaved();
      else trade.dispose();
      gate.resolve(); await pending;
      assert.notEqual(trade.getSnapshot().favorites.kind, 'ready', `${action}/${operation} cannot publish IDs`);
      if (action !== 'silent-switch') assert.equal(signal.aborted, true);
    }
  }
});

test('cancelling a held favorite write passes an aborted signal and cannot publish its durable late receipt', async () => {
  const trade = await setup(), store = memoryStore(), recordId = await saved(trade, store), gate = deferred();
  await trade.loadFavorites(store); let signal, writes = 0;
  const held = { ...store, setReviewFavorite: async (_id, favorite, revision, incoming) => { signal = incoming; writes++; await gate.promise; return ok({ recordId, favorite, revision: revision + 1 }); } };
  const pending = trade.setReviewFavorite(recordId, true, held);
  await trade.loadFavorites(held); await trade.setReviewFavorite(recordId, false, held); assert.equal(writes, 1, 'busy operations cannot overlap');
  trade.cancel(); assert.equal(signal.aborted, true); assert.deepEqual(trade.getSnapshot().favorites, { kind: 'failed', code: 'UNKNOWN_OUTCOME' });
  gate.resolve(); await pending; assert.deepEqual(trade.getSnapshot().favorites, { kind: 'failed', code: 'UNKNOWN_OUTCOME' });
});

test('a favorite open held in current-registry review cannot return a route after cancellation or lock', async () => {
  for (const action of ['cancel', 'forget']) {
    const gate = deferred(); let held = false;
    const trade = await setup(async (_registry, bytes) => { if (held) await gate.promise; return ok({ orderId: decode(bytes), revision: '1' }); });
    const store = memoryStore(), recordId = await saved(trade, store);
    await trade.loadFavorites(store); await trade.setReviewFavorite(recordId, true, store); held = true;
    const opening = trade.openFavorite(recordId, store);
    await new Promise(resolve => setImmediate(resolve));
    if (action === 'cancel') trade.cancel(); else trade.forgetSaved();
    gate.resolve(); assert.equal(await opening, null);
  }
});

test('malformed lists and mismatched change receipts never become UI favorites', async () => {
  const trade = await setup(), store = memoryStore(), recordId = await saved(trade, store);
  for (const value of [{ revision: -1, recordIds: [] }, { revision: 0, recordIds: [recordId, recordId] },
    { revision: 0, recordIds: Array.from({ length: 9 }, (_, n) => String(n).repeat(32)) }]) {
    await trade.loadFavorites({ ...store, listFavoriteReviews: async () => ok(value) });
    assert.deepEqual(trade.getSnapshot().favorites, { kind: 'failed', code: 'PROTOCOL_ERROR' });
  }
  for (const changed of [{ recordId: '2'.repeat(32) }, { favorite: false }, { revision: 9 }]) {
    await trade.loadFavorites(store);
    await trade.setReviewFavorite(recordId, true, { ...store, setReviewFavorite: async () => ok({ recordId, favorite: true, revision: 2, ...changed }) });
    assert.deepEqual(trade.getSnapshot().favorites, { kind: 'failed', code: 'PROTOCOL_ERROR' });
  }
});

test('replacing the persistence port at the same numeric scope retires a held favorite open', async () => {
  const trade = await setup(), first = memoryStore(), second = memoryStore();
  const oldId = (await first.saveTermsReview('file', encode('first profile review'))).value.recordId;
  const newId = (await second.saveTermsReview('file', encode('second profile review'))).value.recordId;
  assert.equal(oldId, newId, 'record IDs deliberately collide across independent fixture ports');
  assert.equal(first.selectionScope(), second.selectionScope());
  assert.equal((await first.setReviewFavorite(oldId, true, 1)).ok, true);
  assert.equal((await second.setReviewFavorite(newId, true, 1)).ok, true);
  const gate = deferred(), entered = deferred();
  let hold = false, signal, transferred;
  const oldPort = { ...first, async listTermsReviews(incoming) {
    const response = await first.listTermsReviews();
    if (hold) {
      signal = incoming; transferred = response.value.items[0].bytes; entered.resolve();
      await gate.promise; // Intentionally ignore abort to deliver the stale physical reply.
    }
    return response;
  } };
  trade.setPersistence(oldPort);
  await trade.loadFavorites();
  const oldRoute = await trade.openFavorite(oldId, oldPort);
  assert.ok(oldRoute);
  assert.equal(trade.find(oldRoute).review.orderId, 'first profile review');
  hold = true;
  const pending = trade.openFavorite(oldId, oldPort);
  try {
    await entered.promise;
    assert.equal(signal.aborted, false);
    trade.setPersistence(second);
    assert.equal(signal.aborted, true);
    assert.equal(trade.find(oldRoute), undefined);
    assert.deepEqual(trade.getSnapshot().favorites, { kind: 'idle' });
    assert.equal(trade.getSnapshot().reviews.length, 0);
    await trade.loadFavorites();
    const currentRoute = await trade.openFavorite(newId, second);
    assert.ok(currentRoute);
    assert.notEqual(currentRoute, oldRoute);
    assert.equal(trade.find(currentRoute).review.orderId, 'second profile review');
    gate.resolve();
    assert.equal(await pending, null);
    assert.ok(transferred.length > 0);
    assert.ok(transferred.every(byte => byte === 0), 'late transferred bytes are wiped');
    assert.equal(trade.getSnapshot().reviews.length, 1);
    assert.equal(trade.find(currentRoute).review.orderId, 'second profile review');
    assert.deepEqual(trade.getSnapshot().favorites, { kind: 'ready', revision: 2, recordIds: [newId] });
    assert.equal(first.commands.filter(command => command.operation === 'set').length, 1);
    assert.equal(second.commands.filter(command => command.operation === 'set').length, 1);
  } finally {
    gate.resolve();
    await pending;
  }
});
