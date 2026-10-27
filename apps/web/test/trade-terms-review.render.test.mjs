import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TradeTermsReview, acceptanceExpired } from '../src/ui/trade/TradeTermsReview.tsx';
import { tradeMessages as t } from '../src/ui/trade/trade-messages.ts';

// Static DOM render of the real component (react-dom/server, .tsx loaded via scripts/test-support/register-tsx.mjs).
// Values mirror the synthetic local scenario; they are regression inputs, not independent golden vectors.
const SELLER = '0xacf7b7c8271e99b3be70c3f476c7c20963e06b8e';
const BUYER = '0x3b0d3efcce062566bd2a28c2f2bba7e1d1504ee5';
const CONTRACT = '0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e';
const TOKEN = '0x7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a';
function review(overrides = {}) {
  return {
    network: { id: 'local-evm', chainId: '31337', environment: 'local' },
    deployment: { id: 'escrow-local-v1', address: CONTRACT, protocolVersion: 1 },
    asset: { id: 'native', kind: 'native', address: null, decimals: 18 },
    orderId: 'a1'.repeat(32), revision: '1', sellerNonce: '3c'.repeat(32), seller: SELLER, buyer: BUYER,
    amountBaseUnits: '1000000000000000000', acceptBeforeSeconds: '1700000000', escrowExpirySeconds: '1700086400',
    agreement: { fiatCurrency: 'USD', fiatMinorUnits: '5000', fiatScale: 2, paymentInstructions: 'SYNTHETIC test payment note A', capabilities: [] },
    privateAgreementSha256: '97'.repeat(32), capabilitiesSha256: '6a'.repeat(32), unsupportedCapabilities: [],
    ...overrides,
  };
}
const render = (props) => renderToStaticMarkup(createElement(TradeTermsReview, { nowSeconds: '1699990000', source: 'file', ...props }));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('disabled-trading banner, read-only intro and manual settlement risk always render', () => {
  const html = render({ review: review() });
  assert.match(html, /<p class="warning" role="status">Preview only\. Trading is disabled in this build\.<\/p>/);
  assert.ok(text(html).includes(t.intro));
  assert.ok(text(html).includes(t.risk));
  assert.ok(text(html).includes(t.blockedTrading));
  assert.ok(text(html).includes(t.termsDigestUnavailable));
  assert.doesNotMatch(html, /<button|<form|<input|href=/, 'review is display only: no actions');
});

test('exact amounts: native 18 decimals, ERC-20 6 decimals, uint256 maximum, fiat minor units', () => {
  const native = text(render({ review: review() }));
  assert.ok(native.includes('1 native'));
  assert.ok(native.includes('1000000000000000000 base units at 18 decimals'));
  assert.ok(native.includes('50.00 USD'));
  const erc20 = text(render({ review: review({ asset: { id: 'test-usd', kind: 'erc20', address: TOKEN, decimals: 6 }, amountBaseUnits: '25000000',
    agreement: { ...review().agreement, fiatMinorUnits: '2500' } }) }));
  assert.ok(erc20.includes('25 test-usd'));
  assert.ok(erc20.includes('25000000 base units at 6 decimals'));
  assert.ok(erc20.includes('25.00 USD'));
  assert.ok(erc20.includes(TOKEN), 'token contract shown in full');
  // Regression: uint256 amounts (G16 EVM) used to render as "Not displayable" because the formatter capped at 40 digits.
  const max = ((1n << 256n) - 1n).toString();
  const big = text(render({ review: review({ amountBaseUnits: max }) }));
  assert.ok(big.includes('115792089237316195423570985008687907853269984665640564039457.584007913129639935 native'));
  assert.ok(!big.includes(t.invalid));
  const tiny = text(render({ review: review({ amountBaseUnits: '1' }) }));
  assert.ok(tiny.includes('0.000000000000000001 native'));
});

test('full addresses: seller, buyer and contract appear exactly, never shortened', () => {
  const html = render({ review: review() });
  for (const address of [SELLER, BUYER, CONTRACT]) {
    assert.ok(html.includes(`<code class="exact">${address}</code>`), address);
    const grouped = `0x ${address.slice(2).match(/.{4}/g).join(' ')}`;
    assert.ok(html.includes(grouped), `grouped ${address}`);
  }
  assert.doesNotMatch(html, /…|\.\.\./);
  assert.ok(text(html).includes('Crypto seller (funds escrow, confirms fiat receipt)'));
  assert.ok(text(html).includes('Crypto buyer (pays fiat, receives crypto)'));
});

test('deadline boundaries: one second before, at, and after the acceptance deadline', () => {
  const before = text(render({ review: review(), nowSeconds: '1699999999' }));
  assert.ok(before.includes('1 s remaining (Unix seconds: 1700000000 )'));
  assert.ok(!before.includes(t.blockedExpired));
  const at = text(render({ review: review(), nowSeconds: '1700000000' }));
  assert.ok(at.includes('Expired (Unix seconds: 1700000000 )'));
  assert.ok(at.includes('1 d remaining (Unix seconds: 1700086400 )'), 'escrow expiry still counts down');
  assert.ok(at.includes(t.blockedExpired));
  const after = text(render({ review: review(), nowSeconds: '1700086400' }));
  assert.equal((after.match(/Expired/g) ?? []).length, 2);
  assert.equal(acceptanceExpired(review(), '1699999999'), false);
  assert.equal(acceptanceExpired(review(), '1700000000'), true);
  assert.ok(text(render({ review: review() })).includes(t.clockNote));
});

test('invalid fallbacks: noncanonical values render the fixed notice, never the raw value', () => {
  const html = text(render({ review: review({ seller: '0xNOTANADDRESS', amountBaseUnits: '01', agreement: { ...review().agreement, fiatCurrency: 'usd' } }), nowSeconds: 'not-a-time' }));
  assert.ok((html.match(new RegExp(t.invalid.replace(/[.:]/g, '\\$&'), 'g')) ?? []).length >= 5);
  assert.ok(!html.includes('0xNOTANADDRESS'));
  assert.ok(acceptanceExpired(review(), 'not-a-time'), 'unknown clock is treated as expired, failing closed');
});

test('payment instructions: exact text, multi-line, hostile controls hidden, mixed script flagged, HTML escaped', () => {
  const plain = render({ review: review({ agreement: { ...review().agreement, paymentInstructions: 'Line 1\nLine 2' } }) });
  assert.ok(plain.includes('<pre class="instructions">Line 1\nLine 2</pre>'));
  const hostile = render({ review: review({ agreement: { ...review().agreement, paymentInstructions: 'pay\u202Efdp.exe' } }) });
  assert.ok(text(hostile).includes(t.instructionsHidden));
  assert.ok(!hostile.includes('fdp.exe'));
  const mixed = text(render({ review: review({ agreement: { ...review().agreement, paymentInstructions: 'p\u0430ypal account' } }) }));
  assert.ok(mixed.includes(t.mixedScript));
  assert.ok(mixed.includes('p\u0430ypal account'), 'text is displayed exactly, never normalized or marked inline');
  const html = render({ review: review({ agreement: { ...review().agreement, paymentInstructions: '<img src=x onerror=alert(1)>' } }) });
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img'));
  assert.ok(text(render({ review: review({ agreement: { ...review().agreement, paymentInstructions: '' } }) })).includes(t.instructionsEmpty));
});

test('capabilities: core trade shows none; listed capabilities are flagged unsupported and blocked', () => {
  assert.ok(text(render({ review: review() })).includes(t.capabilitiesNone));
  const caps = text(render({ review: review({ agreement: { ...review().agreement, capabilities: [{ id: 'local-test-cap', version: '1', policyHash: '9c'.repeat(32) }] },
    unsupportedCapabilities: ['local-test-cap'] }) }));
  assert.ok(caps.includes('local-test-cap v1'));
  assert.ok(caps.includes(t.capabilityUnsupported));
  assert.ok(caps.includes(t.blockedCapabilities));
});

test('source labelling: synthetic samples are visibly marked; files are not called trusted', () => {
  const synthetic = render({ review: review(), source: 'synthetic-sample' });
  assert.ok(synthetic.includes(`<p class="warning">${t.sourceSynthetic}</p>`));
  const file = text(render({ review: review(), source: 'file' }));
  assert.ok(file.includes(t.sourceFile));
  assert.ok(!file.includes('SYNTHETIC test-only sample'));
});
