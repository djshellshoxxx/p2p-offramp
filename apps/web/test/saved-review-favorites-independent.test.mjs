import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradeReviewController } from '../src/trade/review-controller.ts';

const recordId = '1'.repeat(32), otherId = '2'.repeat(32);
const ok = value => ({ ok: true, value });
const bytes = text => new TextEncoder().encode(text);
const row = (id = recordId) => ({ recordId: id, source: 'file', bytes: bytes(id) });

async function fixture(t) {
  let rejectFavorite = false, failRandom = false;
  const trade = createTradeReviewController({
    source: async () => ({ kind: 'ready', label: 'synthetic-demo', registry: {}, samples: [] }),
    review: async (_registry, input) => rejectFavorite && new TextDecoder().decode(input) === recordId
      ? { ok: false, code: 'UNKNOWN_DEPLOYMENT' }
      : ok({ orderId: new TextDecoder().decode(input), revision: '1' }),
    randomBytes: length => { if (failRandom) throw new Error('random source unavailable'); return new Uint8Array(length); },
  });
  t.after(() => trade.dispose());
  let listing = () => ok({ items: [row()], skipped: 0 });
  const store = {
    getSnapshot: () => ({ state: 'unlocked' }), selectionScope: () => 1, subscribe: () => () => {},
    listTermsReviews: async () => listing(),
    listFavoriteReviews: async () => ok({ revision: 1, recordIds: [recordId] }),
  };
  trade.setPersistence(store); await trade.loadRegistry(); await trade.loadSaved(store); await trade.loadFavorites(store);
  const originalRoute = trade.getSnapshot().reviews[0].localId;
  return { trade, store, originalRoute, malformed() { listing = () => ok({ items: [row(), row()], skipped: 0 }); },
    randomFailure() { rejectFavorite = true; failRandom = true; listing = () => ok({ items: [row(), row(otherId)], skipped: 0 }); } };
}

test('independent: an invalid fresh saved-review list cannot reopen a cached favorite', async t => {
  const s = await fixture(t); s.malformed();
  const route = await s.trade.openFavorite(recordId, s.store);
  assert.equal(s.trade.getSnapshot().saved.kind, 'failed');
  assert.equal(s.trade.getSnapshot().saved.code, 'INVALID_SAVED_REVIEW');
  assert.equal(route, null, 'no route is authorized by a failed fresh list, even when an old matching review remains cached');
});

test('independent: aborted fresh review publication cannot reopen an old accepted favorite', async t => {
  const s = await fixture(t); s.randomFailure();
  const route = await s.trade.openFavorite(recordId, s.store);
  assert.equal(s.trade.getSnapshot().saved.kind, 'failed');
  assert.equal(s.trade.getSnapshot().saved.code, 'INVALID_SAVED_REVIEW');
  assert.equal(route, null, 'an infrastructure error after the favorite failed current review must not reuse its old accepted route');
});
