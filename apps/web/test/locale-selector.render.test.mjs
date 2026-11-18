import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleSelector } from '../src/ui/Pages.tsx';
import { createBundledLocaleStore, localeStore } from '../src/ui/locale/runtime.ts';
import { sourceCatalog } from '../src/ui/locale/en.ts';
import { messages as m } from '../src/ui/messages.ts';

const render = store => renderToStaticMarkup(createElement(LocaleSelector, store ? { store } : {}));
const memory = () => { let saved = null; return { read: () => saved, write: id => { saved = id; } }; };
// Synthetic fixture: source text with an RTL locale tag. Layout/direction test data, not a translation.
const fixture = (id, locale) => ({ id, locale, messages: Object.fromEntries(Object.entries(sourceCatalog).map(([key, entry]) => [key, entry.source])) });

test('the production bundle offers only the English source, so no language control is rendered', () => {
  assert.deepEqual(localeStore.available().map(option => option.id), ['en']);
  const html = render();
  assert.doesNotMatch(html, /<select/);
  assert.doesNotMatch(html, /role="note"|role="status"/);
});

test('development fixtures are listed with language and direction, labelled as fixtures, and selected only explicitly', () => {
  const store = createBundledLocaleStore({ developmentFixtures: true, fixtures: [fixture('fixture-rtl', 'ar')] }, memory());
  assert.deepEqual(store.available().map(option => [option.id, option.locale, option.direction, option.display]),
    [['en', 'en', 'ltr', 'source-draft'], ['fixture-rtl', 'ar', 'rtl', 'development-fixture']]);
  let html = render(store);
  assert.match(html, /<select[^>]*aria-describedby="locale-choose-help"/);
  assert.match(html, /<option value="fixture-rtl" lang="ar" dir="rtl">ar \(fixture-rtl\)<\/option>/);
  assert.equal(store.getSnapshot().id, 'en', 'no implicit selection');
  store.select('fixture-rtl');
  html = render(store);
  assert.equal(store.getSnapshot().direction, 'rtl');
  assert.ok(html.includes(m.localeFixture));
  assert.equal(store.getSnapshot().fundsLocaleEligible, false);
});

test('an unavailable requested language shows the fallback notice with an explicit return to the English source', () => {
  const store = createBundledLocaleStore({ developmentFixtures: true, fixtures: [fixture('fixture-fr', 'fr')] }, memory());
  store.select('fixture-missing');
  const html = render(store);
  assert.equal(store.getSnapshot().fallback, true);
  assert.match(html, /<p role="status">/);
  assert.ok(html.includes(m.localeUseSource));
});
