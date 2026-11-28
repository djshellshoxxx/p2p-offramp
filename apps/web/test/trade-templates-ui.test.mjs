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
const render = (patch, identity = null) => {
  const snapshot = { ...base, ...patch }, drafts = { getSnapshot: () => snapshot, subscribe: () => () => {}, currentIdentity: () => identity };
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

const populatedFields = {
  ...base.fields, ...defaults, fiatScale: String(defaults.fiatScale),
  seller: `0x${'12'.repeat(20)}`, buyer: `0x${'34'.repeat(20)}`,
  paymentInstructions: 'é🙂', acceptBeforeSeconds: '0', escrowExpirySeconds: '1',
};
const identity = { defaults, chainId: '31337', deploymentAddress: `0x${'56'.repeat(20)}`, assetAddress: null, assetDecimals: 6 };

test('fresh draft presents exact formatted amounts, display-only deadline previews and UTF-8 instruction count', () => {
  const html = render({ fields: populatedFields }, identity);
  assert.match(html, /id="draft-amountBaseUnits-preview"[^>]*>.*123\.456789 native/);
  assert.match(html, /id="draft-fiatMinorUnits-preview"[^>]*>.*1\.00 USD/);
  assert.match(html, /id="draft-acceptBeforeSeconds-preview"[^>]*>.*Expired/);
  assert.match(html, /id="draft-escrowExpirySeconds-preview"[^>]*>.*Expired/);
  assert.match(html, /Remaining time uses this device’s clock for display only/);
  assert.match(html, /id="draft-paymentInstructions-preview"[^>]*>.*6\/4096/);
  assert.match(html, /<input[^>]*id="draft-amountBaseUnits"[^>]*inputmode="numeric"[^>]*maxlength="78"/i);
  assert.match(html, /<input[^>]*id="draft-fiatCurrency"[^>]*inputmode="text"[^>]*maxlength="3"/i);
  assert.match(html, /<textarea[^>]*id="draft-paymentInstructions"[^>]*maxlength="4096"/i);
});

test('blank amount fields never show a formatted amount or throw during rendering', () => {
  const html = render({ fields: { ...populatedFields, amountBaseUnits: '', fiatMinorUnits: '' } }, identity);
  assert.doesNotMatch(html, /id="draft-(amountBaseUnits|fiatMinorUnits)-preview"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Review fresh draft<\/button>/);
});

test('oversized multibyte instructions report their actual byte count rather than character count', () => {
  const html = render({ fields: { ...populatedFields, paymentInstructions: 'é'.repeat(2049) } }, identity);
  assert.match(html, /id="draft-paymentInstructions-preview"[^>]*>.*4098\/4096/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Review fresh draft<\/button>/);
});
