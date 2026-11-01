import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyStatusPanel } from '../src/ui/PrivacyStatusPanel.tsx';
import { englishGroup } from '../src/ui/locale/en.ts';
const p = englishGroup('privacy');
const render = props => renderToStaticMarkup(createElement(PrivacyStatusPanel, props));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const row = (html, label) => html.slice(html.indexOf(`<h3>${label}</h3>`), html.indexOf('</li>', html.indexOf(`<h3>${label}</h3>`)));
const services = state => ({ selectionScope: () => 7, getSnapshot: () => ({ state }) });

test('absent services show independent unknown indicators and unconditional safety disclosures', () => {
  const html = render({ scope: 0 });
  for (const label of [p.rpc, p.relay, p.map, p.proofChannel, p.update, p.wallet, p.vault, p.messaging, p.proof]) assert.match(row(html, label), new RegExp(p.unknown));
  for (const disclosure of [p.chainWarning, p.fiatWarning, p.authorityWarning]) assert.ok(text(html).includes(disclosure));
  assert.equal((html.match(/No network policy selected/g) ?? []).length, 6);
  assert.doesNotMatch(html, /Local scope changed/);
  assert.doesNotMatch(html, /<button|<input|<form|href=|Verified private route|Authenticated encryption observed/);
});

test('actual local vault-only service projection distinguishes locked and unlocked without network claims', () => {
  for (const [state, label] of [['locked', p.locked], ['unlocked', p.unlocked]]) {
    const html = render({ services: services(state), scope: 7 });
    assert.ok(row(html, p.vault).includes(`<dd>${label}</dd>`));
    assert.ok(row(html, p.vault).includes(p.localVault));
    for (const channel of [p.rpc, p.relay, p.map, p.proofChannel, p.update, p.wallet, p.messaging, p.proof]) assert.ok(row(html, channel).includes(`<dd>${p.unknown}</dd>`));
    assert.ok(text(html).includes(p.authorityWarning));
    assert.doesNotMatch(html, /Verified private route|Authenticated encryption observed|SECRET/);
  }
});

test('scope mismatch or scope change during local inspection cannot display unlocked observation', () => {
  let html = render({ services: services('unlocked'), scope: 6 });
  assert.ok(row(html, p.vault).includes(p.scopeChanged));
  assert.ok(row(html, p.vault).includes(`<dd>${p.unknown}</dd>`));
  let generation = 7;
  html = render({ services: { selectionScope: () => generation, getSnapshot: () => { generation++; return { state: 'unlocked' }; } }, scope: 7 });
  assert.ok(row(html, p.vault).includes(p.scopeChanged));
  assert.ok(row(html, p.vault).includes(`<dd>${p.unknown}</dd>`));
});

test('private service exceptions cannot reach panel text', () => {
  const html = render({ services: { selectionScope: () => 7, getSnapshot: () => { throw new Error('SECRET https://private'); } }, scope: 7 });
  assert.ok(row(html, p.vault).includes(`<dd>${p.unknown}</dd>`));
  assert.doesNotMatch(html, /SECRET|https:/);
});
