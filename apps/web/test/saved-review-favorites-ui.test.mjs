import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OffersPage } from '../src/ui/trade/TradePages.tsx';
import { tradePageMessages as messages } from '../src/ui/trade/trade-messages.ts';
import { sourceCatalog } from '../src/ui/locale/en.ts';

const recordId = 'a'.repeat(32);
const item = { localId: 'A'.repeat(22), savedId: recordId, loaded: true, source: 'file', bytes: new Uint8Array([1]), review: { orderId: '0x' + 'b'.repeat(64), revision: '1' } };
function render(favorites, { store = {}, reviews = [item], saved = { kind: 'idle' } } = {}) {
  let calls = 0;
  const snapshot = { registry: { kind: 'ready', label: 'synthetic-demo', samples: [], trust: null }, job: { kind: 'idle' },
    reviews, saved, unreviewable: [], persistence: { unlocked: !!store, kind: 'idle' }, favorites };
  const trade = { getSnapshot: () => snapshot, subscribe: () => () => {},
    loadFavorites: () => { calls++; }, setReviewFavorite: () => { calls++; }, openFavorite: () => { calls++; } };
  const html = renderToStaticMarkup(createElement(OffersPage, { trade, store }));
  assert.equal(calls, 0, 'rendering cannot initiate a preference read, write or open');
  return html;
}

test('favorite controls require an unlocked profile and an explicitly loaded revision', () => {
  const locked = render({ kind: 'idle' }, { store: null });
  assert.equal(locked.includes(messages.loadFavorites), false); assert.equal(locked.includes(messages.addFavorite), false);
  const unloaded = render({ kind: 'idle' });
  assert.ok(unloaded.includes(messages.loadFavorites)); assert.equal(unloaded.includes(messages.addFavorite), false);
  const ready = render({ kind: 'ready', revision: 2, recordIds: [] });
  assert.match(ready, /aria-pressed="false"/); assert.ok(ready.includes(messages.addFavorite)); assert.ok(ready.includes(messages.favoritesEmpty));
  assert.doesNotMatch(ready, /<img|<[^>]+\sonerror=/);
});

test('favorite rows use explicit recheck buttons and never embed a direct route or terms payload', () => {
  const html = render({ kind: 'ready', revision: 3, recordIds: [recordId] });
  const list = /<ul class="favorites-list">([\s\S]*?)<\/ul>/.exec(html)?.[1]; assert.ok(list);
  assert.ok(list.includes(messages.openFavorite)); assert.ok(list.includes(messages.removeFavorite));
  assert.doesNotMatch(list, /href=|#\/trade\/|src=|Uint8Array|bytes|revision=/);
  assert.match(html, /aria-pressed="true"/);
  const dangling = render({ kind: 'ready', revision: 4, recordIds: [recordId] }, { reviews: [] });
  assert.ok(dangling.includes(messages.removeFavorite), 'an explicitly loaded dangling reference remains removable');
  assert.doesNotMatch(dangling, /href="#\/trade\//);
});

test('pending operations disable favorite controls and cancellation and uncertainty have explicit copy', () => {
  const busy = render({ kind: 'busy', action: 'set' });
  assert.ok(busy.includes(messages.cancelFavorites)); assert.ok(busy.includes(messages.favoritesBusy));
  assert.match(busy, /<button[^>]*disabled=""[^>]*>Load favorites<\/button>/);
  const loadingReviews = render({ kind: 'ready', revision: 3, recordIds: [recordId] }, { saved: { kind: 'busy', action: 'load' } });
  assert.match(loadingReviews, /<button[^>]*disabled=""[^>]*>Open and recheck favorite<\/button>/);
  const failed = render({ kind: 'failed', code: 'CONFLICT' });
  assert.ok(failed.includes(messages.favoritesFailed)); assert.doesNotMatch(failed, /class="favorites-list"/);
});

test('favorite controls and authority explanations are owned by the reviewed locale catalog', () => {
  for (const key of ['favoritesTitle', 'favoritesHelp', 'loadFavorites', 'addFavorite', 'removeFavorite', 'openFavorite', 'favoritesFailed', 'cancelFavorites', 'favoriteItem']) {
    assert.ok(sourceCatalog[`tradePage.${key}`], key);
  }
});
