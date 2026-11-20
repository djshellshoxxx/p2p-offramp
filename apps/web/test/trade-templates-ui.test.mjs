import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TradeDraftPanel } from '../src/ui/trade/TradeDraftPanel.tsx';
import { DRAFT_FIELD_NAMES } from '../src/trade/draft-controller.ts';
import { TRADE_DRAFT_LIBRARY_FORMAT } from '../../../packages/schemas/index.ts';
const defaults = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 };
const base = { unlocked: true, generation: 1, fields: Object.fromEntries(DRAFT_FIELD_NAMES.map(field => [field, ''])),
  library: { revision: 0, library: { format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: [{ slot: 0, defaults }], repeatDefaultSlot: 0 } }, preview: null, busy: null, status: 'idle', code: null };
const render = patch => {
  const snapshot = { ...base, ...patch }, drafts = { getSnapshot: () => snapshot, subscribe: () => () => {}, currentIdentity: () => null };
  return renderToStaticMarkup(React.createElement(TradeDraftPanel, { drafts }));
};
test('locked projection exposes no draft inputs or library while preserving a scalar uncertain-write notice', () => {
  const html = render({ unlocked: false, status: 'failed', code: 'UNKNOWN_OUTCOME', library: null });
  assert.match(html, /Unlock a profile to edit a private draft/); assert.match(html, /a write may have committed/);
  assert.doesNotMatch(html, /draft-seller|templates-list|escrow-local-v1|Confirm local change/);
});
test('template application and repeat selection are explicit controls with eight slots and a disabled fresh review', () => {
  const html = render({}); assert.equal((html.match(/<option /g) ?? []).length, 8);
  for (const text of ['Use template', 'New draft from repeat defaults', 'Remove template', 'Use for repeat defaults', 'Clear repeat defaults']) assert.ok(html.includes(text));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Review fresh draft<\/button>/); assert.match(html, /Older backups can restore removed templates/);
});
test('preview renders old and new exact defaults, logical deletion limits and unselected explicit commit consent', () => {
  const html = render({ preview: { previewId: 'a'.repeat(32), revision: 0, change: { kind: 'put-template', slot: 0, defaults: { ...defaults, fiatMinorUnits: '200' } },
    affectedTemplateCount: 1, clearsRepeatDefault: false, logicalOnly: true, backupAndRemoteCopiesUnaffected: true } });
  for (const text of ['Previous values', 'New values', '100', '200', 'five minutes', 'I reviewed these local changes']) assert.ok(html.includes(text));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Confirm local change<\/button>/);
  assert.doesNotMatch(html, /name="signature"|name="nonce"|name="acceptedTerms"/);
});
