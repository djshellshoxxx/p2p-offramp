import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyStatusPanel } from '../src/ui/PrivacyStatusPanel.tsx';
import { englishGroup } from '../src/ui/locale/en.ts';
const p = englishGroup('privacy');
test('a supplied broker cannot produce positive server-rendered routes before invalidation subscription exists', () => {
  let calls = 0;
  const transport = {
    get generation() { calls++; throw Error('PRIVATE_GENERATION'); },
    get mode() { calls++; throw Error('PRIVATE_MODE'); },
    inspect() { calls++; throw Error('PRIVATE_ROUTE'); },
    subscribeInvalidation() { calls++; throw Error('PRIVATE_SUBSCRIPTION'); },
  };
  const services = { selectionScope: () => 1, getSnapshot: () => ({ state: 'unlocked' }) };
  const html = renderToStaticMarkup(createElement(PrivacyStatusPanel, { services, scope: 1, transport }));
  assert.equal(calls, 0, 'server rendering does not inspect or subscribe an unmounted broker');
  assert.equal((html.match(/No network policy selected/g) ?? []).length, 6);
  assert.ok(html.includes(p.localVault)); assert.ok(html.includes(`<dd>${p.unlocked}</dd>`));
  assert.ok(html.includes(p.chainWarning)); assert.ok(html.includes(p.authorityWarning));
  assert.doesNotMatch(html, /PRIVATE_|Verified private route|Authenticated encryption observed/);
});
