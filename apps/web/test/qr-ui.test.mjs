import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QrSymbol } from '../src/qr/display.tsx';
import { QrReviewDetails } from '../src/ui/QrPanel.tsx';
import { QR_APP_CODES } from '../src/qr/protocol.ts';
import { qrMessages as q } from '../src/ui/qr-messages.ts';
import { sourceCatalog } from '../src/ui/locale/en.ts';
import { createQrEnvelope, encodeQrText, decodeQrText, encodeQrMatrix } from '../../../packages/qr/index.ts';
import { INPUTS, deps, context, encodeDeps } from '../../../packages/qr/test/helpers.mjs';

test('display uses static SVG geometry with a full four-module quiet zone and escaped accessible text', () => {
  const { matrix } = encodeQrMatrix('P2POFFRAMP:1:TEST');
  const html = renderToStaticMarkup(createElement(QrSymbol, { matrix, label: '<img src=x onerror=alert(1)>' }));
  assert.ok(html.includes(`viewBox="0 0 ${matrix.size + 8} ${matrix.size + 8}"`));
  assert.ok(html.includes('aria-label="&lt;img src=x onerror=alert(1)&gt;"'));
  assert.doesNotMatch(html, /<img|<script/);
  for (const tag of html.match(/<[^>]*>/g) ?? []) assert.doesNotMatch(tag.replace(/"[^"]*"|'[^']*'/g, '""'), /\s(?:on\w+|style)=/);
  assert.ok(html.includes('fill="#ffffff"') && html.includes('fill="#000000"'));
});

test('full exact payment identities and unauthenticated state remain visible without links or action controls', async () => {
  const created = await createQrEnvelope(INPUTS['payment-request'], deps('ui'));
  const encoded = await encodeQrText(created.envelope, encodeDeps());
  const decoded = await decodeQrText(encoded.text, context());
  const html = renderToStaticMarkup(createElement(QrReviewDetails, { review: decoded.review }));
  for (const value of [INPUTS['payment-request'].payload.recipient, INPUTS['payment-request'].payload.amount, INPUTS['payment-request'].chain, q.unauthenticated]) assert.ok(html.includes(value));
  assert.doesNotMatch(html, /<a\b|<button\b|<form\b/);
});

test('all five public reviews label every full display field, including release sequence', async () => {
  for (const type of Object.keys(INPUTS)) {
    const created = await createQrEnvelope(INPUTS[type], deps('all-ui-' + type));
    const encoded = await encodeQrText(created.envelope, encodeDeps());
    const decoded = await decodeQrText(encoded.text, context());
    const html = renderToStaticMarkup(createElement(QrReviewDetails, { review: decoded.review }));
    for (const field of decoded.review.display) {
      assert.equal(typeof q.fields[field.field], 'string', `${type}/${field.field}`);
      assert.ok(html.includes(q.fields[field.field]), `${type}/${field.field} label`);
    }
    assert.doesNotMatch(html, /<dt><\/dt>/);
  }
});

test('every public QR failure and critical authority statement is catalog-backed', () => {
  for (const code of QR_APP_CODES) assert.equal(typeof q.errors[code], 'string', code);
  for (const name of ['intro', 'chainScope', 'fingerprintHelp', 'unauthenticated', 'inviteOpen', 'confirmed', 'compareHelp', 'match']) assert.equal(sourceCatalog[`qr.${name}`].severity, 'critical');
});
