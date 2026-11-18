import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecoveryReferencesPanel } from '../src/ui/RecoveryReferencesPanel.tsx';
import { DiagnosticsPanel } from '../src/ui/DiagnosticsPanel.tsx';
import { ControlHelp } from '../src/ui/ControlHelp.tsx';
import { TooltipRegistry } from '../src/ui/help-registry.ts';
import { recoveryReferenceMessages as r } from '../src/ui/recovery-reference-messages.ts';
import { diagnosticsMessages as d } from '../src/ui/diagnostics-messages.ts';
import { englishGroup } from '../src/ui/locale/en.ts';
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const SECRET = /SECRET|PRIVATE|https?:|0x[0-9a-fA-F]{40}|passphrase=|<textarea|type="file"/;
// Every control must be labelled: a button has text, an input sits inside a label, and the section is named by its heading.
const assertNamedSection = (html, id) => {
  assert.match(html, new RegExp(`<section[^>]*aria-labelledby="${id}"`));
  assert.match(html, new RegExp(`<h2 id="${id}">[^<]+</h2>`));
  // A button is named when some text sits between its tags (checked without rewriting markup) or it has an aria-label.
  for (const button of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) assert.ok(/(?:^|>)[^<]*[^<\s]/.test(button[1]) || /aria-label="[^"]+"/.test(button[0]));
};

test('recovery references panel without services is locked: heading, warnings, no actions, no data', () => {
  const html = render(RecoveryReferencesPanel, { services: null });
  assertNamedSection(html, 'recovery-references-title');
  const t = text(html);
  for (const copy of [r.title, r.help, r.unverified, r.private, r.locked]) assert.ok(t.includes(copy), copy);
  assert.match(html, /<p role="status">/);
  assert.doesNotMatch(html, /<button|<input|<fieldset|<textarea|<dl|role="alert"/);
  assert.doesNotMatch(html, SECRET);
});

test('recovery references panel with a locked service never calls the listing and renders no references', () => {
  let calls = 0;
  const services = { subscribe: () => () => {}, getSnapshot: () => ({ state: 'locked' }), selectionScope: () => 3, current: { state: 'locked' },
    listRecoveryReferences: async () => { calls++; return { ok: true, value: { items: [{ recordId: 'PRIVATE-SECRET' }] } }; } };
  const html = render(RecoveryReferencesPanel, { services });
  assert.ok(text(html).includes(r.locked));
  assert.doesNotMatch(html, /<button|<input|PRIVATE-SECRET/);
  assert.equal(calls, 0);
});

test('diagnostics panel without a service renders unconfigured state with a named heading and no private data', () => {
  const html = render(DiagnosticsPanel, { service: null });
  assertNamedSection(html, 'diagnostics-title');
  const t = text(html);
  for (const copy of [d.title, d.help, d.privacy, d.unconfigured]) assert.ok(t.includes(copy), copy);
  assert.match(html, /<p class="warning" role="status">/);
  assert.ok(t.includes(d.refresh) && t.includes(d.clear));
  assert.match(html, /<button[^>]*disabled=""[^>]*>[^<]*<\/button>/);
  assert.doesNotMatch(html, /<input|<fieldset|<textarea|<dl|role="alert"/);
  assert.doesNotMatch(html, SECRET);
});

test('diagnostics panel with a service performs no collection during render and shows no events or exports', () => {
  let calls = 0;
  const service = { collectDiagnostics: () => { calls++; return { ok: true, value: { configured: true, warnings: [], events: [{ module: 'SECRET', operation: 'PRIVATE', errorCode: 'X', timeBucket: 'b' }] } }; },
    clearDiagnostics: () => ({ ok: true }), previewExport: () => { calls++; return { ok: false, error: { code: 'STORAGE_UNAVAILABLE' } }; }, confirmExport: () => { calls++; } };
  const html = render(DiagnosticsPanel, { service });
  assertNamedSection(html, 'diagnostics-title');
  assert.doesNotMatch(html, SECRET);
  assert.doesNotMatch(html, /<textarea|<input|role="alert"/);
  assert.equal(calls, 0);
});

test('control help renders a labelled, collapsed trigger for registered controls and nothing for unknown ones', () => {
  const labels = englishGroup('help');
  const html = render(ControlHelp, { controlId: 'unlock-passphrase', label: 'Passphrase' });
  assert.match(html, /<button[^>]*id="unlock-passphrase-help-trigger"[^>]*type="button"/);
  assert.match(html, /aria-label="[^"]*Passphrase[^"]*"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /role="tooltip"|aria-controls|aria-describedby/);
  assert.ok(text(html).includes(labels.label));
  assert.doesNotMatch(html, SECRET);
  assert.equal(render(ControlHelp, { controlId: 'not-registered', label: 'x' }), '');
  assert.equal(render(ControlHelp, { controlId: '', label: '' }), '');
});

test('control help renders for every registered control without a tooltip body and never reads the control value', () => {
  for (const id of ['unlock-profile', 'unlock-passphrase', 'export-profile', 'create-passphrase', 'restore-file', 'restore-passphrase', 'verification-file', 'export-consent', 'create-consent', 'restore-consent']) {
    assert.ok(TooltipRegistry.get(id), id);
    const html = render(ControlHelp, { controlId: id, label: 'Field' });
    assert.match(html, new RegExp(`data-control-help="${id}"`));
    assert.match(html, /aria-label="[^"]+"/);
    assert.doesNotMatch(html, /role="tooltip"|value=/);
  }
});
