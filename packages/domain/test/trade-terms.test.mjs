import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodePrivateAgreement, encodeCapabilities, encodeSolanaTerms, checkFundingWindow, sha256Hex } from '../src/trade-terms.ts';
const vectors = JSON.parse(await readFile(new URL('./fixtures/g16-vectors.json', import.meta.url), 'utf8'));
const hex = bytes => Buffer.from(bytes).toString('hex');
const rejects = (work, code = 'INVALID_INPUT') => assert.throws(work, error => error.code === code);

test('G16 TypeScript encodings match the independent Python vectors byte for byte', async () => {
  assert.equal(vectors.privateAgreements.length, 2); assert.equal(vectors.solanaTerms.length, 2);
  for (const vector of vectors.privateAgreements) {
    const bytes = encodePrivateAgreement(vector.input);
    assert.equal(hex(bytes), vector.bytesHex);
    assert.equal(await sha256Hex(bytes), vector.privateAgreementHash);
    assert.equal(await sha256Hex(encodeCapabilities(vector.input.capabilities)), vector.capabilitiesHash);
  }
  for (const vector of vectors.solanaTerms) {
    const bytes = encodeSolanaTerms(vector.input);
    assert.equal(hex(bytes), vector.bytesHex);
    assert.equal(await sha256Hex(bytes), vector.termsHash);
  }
});
test('G16 flipping any bound private-agreement field changes the hash', async () => {
  const base = vectors.privateAgreements[1].input;
  const original = await sha256Hex(encodePrivateAgreement(base));
  const flips = { orderId: 'f'.repeat(64), revision: '2', fiatCurrency: 'USD', fiatMinorUnits: '1', fiatScale: 3, paymentInstructions: 'x',
    capabilities: [base.capabilities[0]], agreementSalt: 'e'.repeat(64) };
  for (const [field, value] of Object.entries(flips)) assert.notEqual(await sha256Hex(encodePrivateAgreement({ ...base, [field]: value })), original, field);
});
test('G16 private agreement rejects unknown fields, noncanonical numbers, bad text and capability ordering', () => {
  const base = vectors.privateAgreements[0].input;
  const cap = id => ({ id, version: '1', policyHash: 'a'.repeat(64) });
  const invalid = [{ extra: 1 }, { revision: '0' }, { revision: '01' }, { revision: '1.0' }, { revision: 1 }, { revision: '18446744073709551616' },
    { fiatMinorUnits: '0' }, { fiatMinorUnits: '-5' }, { fiatMinorUnits: '1e3' }, { fiatMinorUnits: '340282366920938463463374607431768211456' },
    { fiatScale: 7 }, { fiatScale: 1.5 }, { fiatCurrency: 'eur' }, { fiatCurrency: 'EURO' }, { orderId: 'A'.repeat(64) }, { orderId: 'a'.repeat(63) },
    { agreementSalt: 'g'.repeat(64) }, { paymentInstructions: 'bad \uD800 surrogate' }, { capabilities: [cap('b'), cap('a')] }, { capabilities: [cap('a'), cap('a')] },
    { capabilities: [cap('')] }, { capabilities: [cap('café')] }, { capabilities: [{ ...cap('a'), policyHash: 'x' }] },
    { capabilities: [{ ...cap('a'), version: '' }] }, { capabilities: [{ ...cap('a'), extra: 1 }] }];
  for (const change of invalid) rejects(() => encodePrivateAgreement({ ...base, ...change }));
  rejects(() => encodePrivateAgreement({ ...base, v: 2 }), 'UNSUPPORTED_VERSION');
  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: 'x'.repeat(4097) }), 'LIMIT_EXCEEDED');
  rejects(() => encodePrivateAgreement({ ...base, capabilities: 'abcdefghi'.split('').map(cap) }), 'LIMIT_EXCEEDED');
  assert.equal(encodePrivateAgreement({ ...base, paymentInstructions: 'x'.repeat(4096) }).byteLength > 4096, true, '4 KiB instructions accepted');
});
test('G16 Solana terms bind every field and reject swapped roles, bad keys and kind mismatches', async () => {
  const [native, spl] = vectors.solanaTerms.map(v => v.input);
  const original = await sha256Hex(encodeSolanaTerms(native));
  const other = spl.mint;
  for (const [field, value] of Object.entries({ genesisHash: other, programId: other, orderId: 'f'.repeat(64), seller: other, buyer: other,
    privateAgreementHash: 'f'.repeat(64), capabilitiesHash: 'f'.repeat(64), sellerNonce: 'f'.repeat(64), revision: '2', amountBaseUnits: '2',
    acceptBeforeSeconds: '1', escrowExpirySeconds: '1' })) assert.notEqual(await sha256Hex(encodeSolanaTerms({ ...native, [field]: value })), original, field);
  assert.notEqual(await sha256Hex(encodeSolanaTerms({ ...native, seller: native.buyer, buyer: native.seller })), original, 'role swap changes the digest');
  for (const change of [{ buyer: native.seller }, { mint: other }, { tokenProgram: other }, { assetKind: 'erc20' }, { seller: '0' + native.seller.slice(1) },
    { seller: '1'.repeat(44) }, { amountBaseUnits: '0' }, { amountBaseUnits: '18446744073709551616' }, { revision: '0' }, { escrowExpirySeconds: '1.5' }, { extra: 1 }])
    rejects(() => encodeSolanaTerms({ ...native, ...change }));
  for (const change of [{ mint: null }, { tokenProgram: null }]) rejects(() => encodeSolanaTerms({ ...spl, ...change }));
});
test('G16 funding window: before acceptance deadline and 1800..604800 s of escrow left', () => {
  checkFundingWindow('1000', String(500 + 1800), '500'); checkFundingWindow('1000', String(500 + 604800), '500');
  rejects(() => checkFundingWindow('1000', '5000', '1000'), 'EXPIRED'); rejects(() => checkFundingWindow('1000', '5000', '1001'), 'EXPIRED');
  rejects(() => checkFundingWindow('1000', String(500 + 1799), '500')); rejects(() => checkFundingWindow('1000', String(500 + 604801), '500'));
  rejects(() => checkFundingWindow('1000', '400', '500')); rejects(() => checkFundingWindow('1000', '5000', '-1'));
});
