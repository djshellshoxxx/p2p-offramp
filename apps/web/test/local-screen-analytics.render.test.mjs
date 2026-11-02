import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createScreenCounts } from '../src/analytics/screen-counts.ts';

const ui = await import('../src/ui/LocalScreenAnalytics.tsx').catch(() => null);
const messages = Object.freeze({ title: 'Local screen counts', help: 'Optional category counts stay in memory. Nothing is uploaded.',
  off: 'Screen counts are off.', on: 'Screen counts are on for this page session.', unavailable: 'Screen counts are unavailable.',
  optIn: 'Enable local screen counts', optOut: 'Turn off and erase screen counts', clear: 'Clear counts and turn off',
  reviewExport: 'Review screen-count export', previewTitle: 'Exact screen-count export', download: 'Download screen-count JSON',
  exportUnavailable: 'The export is unavailable. Review the current counts again.', screenColumn: 'Screen category', countColumn: 'Entries',
  categoryLabels: Object.freeze({ home: 'Home', offers: 'Offers', trade: 'Trade', recovery: 'Recovery', settings: 'Settings' }) });
function render(controller) {
  assert.equal(typeof ui?.LocalScreenAnalytics, 'function', 'Settings consumer component must exist');
  return renderToStaticMarkup(createElement(ui.LocalScreenAnalytics, { controller, messages }));
}

test('initial Settings controls describe off-by-default memory-only counts and require explicit opt-in', () => {
  const { controller } = createScreenCounts(), html = render(controller);
  assert.match(html, /<h2[^>]*>Local screen counts<\/h2>/);
  assert.match(html, /Screen counts are off\./);
  assert.match(html, />Enable local screen counts<\/button>/);
  assert.doesNotMatch(html, />Download screen-count JSON<\/button>|<textarea/);
  assert.equal(controller.getSnapshot().enabled, false, 'rendering cannot consent or count');
});

test('only fixed category rows and an explicit current export preview render', () => {
  const { controller, observer } = createScreenCounts();
  observer.commit('settings', true); controller.optIn(); controller.reviewExport();
  const html = render(controller);
  assert.equal((html.match(/scope="row"/g) ?? []).length, 5);
  assert.match(html, /<th scope="row">Settings<\/th><td>1<\/td>/);
  assert.match(html, /<label[^>]*>Exact screen-count export<\/label>/);
  assert.match(html, /<textarea[^>]*readOnly=""/);
  assert.match(html, />Download screen-count JSON<\/button>/);
  assert.doesNotMatch(html, /onclick=|<input|timestamp|duration|tradeId|profileId|http/);
});

test('retired or absent owners cannot render consent, review or download controls', () => {
  const { controller, observer } = createScreenCounts();
  observer.commit('settings', true); controller.optIn(); controller.reviewExport(); observer.retire();
  for (const html of [render(controller), render(null)]) {
    assert.match(html, /Screen counts are unavailable\./);
    assert.doesNotMatch(html, /<button|<textarea/);
  }
});
