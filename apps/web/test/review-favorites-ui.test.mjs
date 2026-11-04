import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTradeReviewController } from '../src/trade/review-controller.ts';
import { messages } from '../src/ui/messages.ts';
const api = await import('../src/ui/FavoriteSavedReviews.tsx').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ENOENT') return {}; throw error; });
const recordId = 'ab'.repeat(16), second = 'cd'.repeat(16), enc = s => new TextEncoder().encode(s);
const ok = value => ({ ok: true, value });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function requireUI() { assert.equal(typeof api.openFavoriteSavedReview, 'function', 'fresh favorite-open consumer is missing'); }
async function setup(t) {
  requireUI(); let accepted = true, calls = 0; const rejected = new Set();
  const registry = { network: () => null, deployment: () => null };
  const trade = createTradeReviewController({ source: async () => ({ kind: 'ready', label: 'synthetic-demo', registry, samples: [] }),
    review: async (actual, bytes) => { assert.equal(actual, registry); calls++; const text = new TextDecoder().decode(bytes); return accepted && !rejected.has(text) ? { ok: true, value: { orderId: text, revision: '1' } } : { ok: false, code: 'UNAVAILABLE' }; } });
  t.after(() => trade.dispose()); await trade.loadRegistry();
  const rows = new Map([[recordId, 'original saved terms']]);
  const store = { listTermsReviews: async () => ok({ items: [...rows].map(([id, text]) => ({ recordId: id, source: 'file', bytes: enc(text) })), skipped: 0 }) };
  return { trade, store, rows, reject: () => { accepted = false; }, rejectText: text => rejected.add(text), calls: () => calls };
}
test('favorite open always runs the existing current-registry review and resolves the fresh saved-ID mapping', async t => {
  const s = await setup(t), first = await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true);
  assert.match(first, /^[A-Za-z0-9_-]{22}$/); assert.equal(s.trade.find(first).savedId, recordId); assert.equal(s.calls(), 1);
  const secondOpen = await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true); assert.equal(secondOpen, first); assert.equal(s.calls(), 2, 'existing in-memory validity is never reused');
});
test('deleted and unreviewable favorite targets become unavailable without resurrecting their old terms', async t => {
  const s = await setup(t), old = await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true); assert.ok(s.trade.find(old));
  s.reject(); assert.equal(await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true), null);
  assert.equal(s.trade.getSnapshot().reviews.some(row => row.savedId === recordId), false);
  s.rows.delete(recordId); assert.equal(await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true), null);
  assert.equal(await api.openFavoriteSavedReview(s.trade, s.store, second, () => true), null);
});
test('a malformed fresh load cannot return an earlier saved mapping retained by the review controller', async t => {
  const s = await setup(t), old = await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true); assert.ok(old);
  s.store.listTermsReviews = async () => ok({ items: [
    { recordId, source: 'file', bytes: enc('new bytes') },
    { recordId, source: 'file', bytes: enc('duplicate ID') },
  ], skipped: 0 });
  assert.equal(await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true), null);
  assert.equal(s.trade.getSnapshot().saved.code, 'INVALID_SAVED_REVIEW');
});
test('a separately refreshed valid favorite stays available when an unrelated saved row fails review', async t => {
  const s = await setup(t), first = await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true);
  s.rows.set(second, 'unsupported terms'); s.rejectText('unsupported terms');
  assert.equal(await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true), first);
  assert.equal(s.trade.getSnapshot().saved.code, 'INVALID_SAVED_REVIEW'); assert.equal(s.trade.getSnapshot().unreviewable[0].recordId, second);
});
test('owner retirement, lock and an already active saved load cannot navigate from an older favorite result', async t => {
  const s = await setup(t), entered = deferred(), release = deferred(); let current = true;
  const original = s.store.listTermsReviews; s.store.listTermsReviews = async () => { entered.resolve(); await release.promise; return original(); };
  const pending = api.openFavoriteSavedReview(s.trade, s.store, recordId, () => current); await entered.promise;
  assert.equal(await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => true), null, 'a no-op load may not reuse an old review');
  current = false; s.trade.forgetSaved(); release.resolve(); assert.equal(await pending, null);
  current = true; assert.equal(await api.openFavoriteSavedReview(s.trade, s.store, recordId, () => false), null);
});
test('real favorite panel renders locked, empty and bounded ID-only saved-review controls using source messages', () => {
  requireUI(); assert.equal(typeof api.FavoriteSavedReviews, 'function');
  const model = { store: null, value: null, busy: false, failed: false, unavailable: false, load() {}, set() {}, open() {} };
  const render = next => renderToStaticMarkup(createElement(api.FavoriteSavedReviews, { model: { ...model, ...next } }));
  const locked = render({}); assert.ok(locked.includes(messages.favorites.locked)); assert.equal(locked.includes('<button'), false);
  const empty = render({ store: {}, value: { revision: 2, recordIds: [] } }); assert.ok(empty.includes(messages.favorites.empty)); assert.ok(empty.includes(messages.favorites.load));
  const full = render({ store: {}, value: { revision: 2, recordIds: [recordId, second] } });
  assert.ok(full.includes(recordId)); assert.ok(full.includes(second)); assert.ok(full.includes(messages.favorites.open)); assert.ok(full.includes(messages.favorites.unstar));
  assert.doesNotMatch(full, /original saved terms|orderId|sellerNonce|signature/);
});
