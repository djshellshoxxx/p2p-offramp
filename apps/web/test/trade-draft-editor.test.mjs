import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TradeDraftEditor } from '../src/ui/trade/TradeDraftEditor.tsx';
import { createTradeDraftController, TRADE_DRAFT_FIELDS } from '../src/trade/draft-controller.ts';

const keys = ['title','help','locked','unavailable','templatesTitle','templatesEmpty','loadTemplates','newBlank','useTemplate','useRepeatDefault','saveTemplate','removeTemplate','setRepeatDefault','clearRepeatDefault','slotLabel','review','cancel','previewTitle','reviewChange','confirmChange','backupLimits','savedAmountsNeedReview','confirmAmounts','confirmIdentities','confirmEmptyInstructions','busy','saved','choose','identityTitle','invalid','oldValues','newValues','repeatDefaultRemoved'];
const copy = { ...Object.fromEntries(keys.map(key => [key, `SYNTHETIC ${key}`])), fields: Object.fromEntries(TRADE_DRAFT_FIELDS.map(key => [key, `FIELD ${key}`])), templateName: slot => `SYNTHETIC template ${slot}`, affectedTemplates: count => `SYNTHETIC count ${count}`, error: code => `SYNTHETIC error ${code}` };
const choice = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', chainId: '31337', environment: 'local', escrowAddress: `0x${'56'.repeat(20)}`, assetKind: 'native', assetAddress: null, decimals: 18 };
function controller(unlocked) { return createTradeDraftController({ review: { getDraftChoices: () => [choice], subscribe: () => () => {}, reviewDraft: async () => ({kind:'idle'}) },
  persistence: { getSnapshot: () => ({state:unlocked?'unlocked':'locked'}), selectionScope: () => 1, subscribe: () => () => {}, loadTradeDraftLibrary: async () => {throw Error('not called');} } }); }
const render = c => renderToStaticMarkup(createElement(TradeDraftEditor, { controller: c, copy, onOpenReview: () => {} }));

test('locked editor renders only explanation and never private form inputs', () => {
  const c = controller(false), html = render(c); assert.match(html, /SYNTHETIC locked/); assert.doesNotMatch(html, /<input|<textarea|<select|<form/); c.dispose();
});
test('actual editor renders all named field controls, explicit confirmations and inert review until complete', () => {
  const c = controller(true), html = render(c);
  for (const field of TRADE_DRAFT_FIELDS) assert.ok(html.includes(`name="${field}"`), field);
  assert.match(html, /<textarea/); assert.match(html, /SYNTHETIC confirmAmounts/); assert.match(html, /SYNTHETIC confirmIdentities/);
  assert.match(html, /type="submit" disabled=""/); assert.match(html, /SYNTHETIC savedAmountsNeedReview/);
  assert.doesNotMatch(html, /eth_send|wallet_request|funding|<pre/); c.dispose();
});
test('selecting a current asset before entering principal does not format invalid empty signed units',()=>{
  const c=controller(true);c.edit('networkId','local-evm');c.edit('deploymentId','escrow-local-v1');c.edit('assetId','native');
  assert.doesNotThrow(()=>render(c));assert.match(render(c),/31337/);c.dispose();
});
