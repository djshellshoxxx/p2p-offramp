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
test('G16 canonical object encoders reject accessors without invoking them or leaking diagnostics', () => {
  const agreement = { ...vectors.privateAgreements[0].input };
  const solana = { ...vectors.solanaTerms[0].input };
  let invoked = 0;
  Object.defineProperty(agreement, 'paymentInstructions', { enumerable: true, get() { invoked++; throw new Error('SECRET accessor'); } });
  Object.defineProperty(solana, 'buyer', { enumerable: true, get() { invoked++; throw new Error('SECRET accessor'); } });
  rejects(() => encodePrivateAgreement(agreement));
  rejects(() => encodeSolanaTerms(solana));
  const nested = { ...vectors.privateAgreements[1].input, capabilities: [{ ...vectors.privateAgreements[1].input.capabilities[0] }] };
  Object.defineProperty(nested.capabilities[0], 'id', { enumerable: true, get() { invoked++; throw new Error('SECRET accessor'); } });
  rejects(() => encodePrivateAgreement(nested));
  const arrayTerms = { ...vectors.privateAgreements[1].input, capabilities: [{ ...vectors.privateAgreements[1].input.capabilities[0] }] };
  Object.defineProperty(arrayTerms.capabilities, '0', { enumerable: true, get() { invoked++; throw new Error('SECRET array accessor'); } });
  rejects(() => encodePrivateAgreement(arrayTerms));
  const revoked = Proxy.revocable({ ...vectors.solanaTerms[0].input }, {}); revoked.revoke();
  rejects(() => encodeSolanaTerms(revoked.proxy));
  assert.equal(invoked, 0);
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

/** Observe TextEncoder.encode receiving a specific oversized sentinel; delegate every other call natively. */
function withEncodeSpy(sentinel, work) {
  const original = TextEncoder.prototype.encode;
  const seen = [];
  TextEncoder.prototype.encode = function (value) {
    if (value === sentinel) { seen.push(value.length); throw new Error('oversized sentinel reached TextEncoder'); }
    return original.call(this, value);
  };
  try { work(); } finally { TextEncoder.prototype.encode = original; }
  return seen;
}
const limitCode = error => error?.code === 'LIMIT_EXCEEDED';

test('G16 oversized instructions are refused before being passed to TextEncoder', () => {
  const base = vectors.privateAgreements[0].input;
  for (const sentinel of ['x'.repeat(4097), 'x'.repeat(100_000), '\u20ac'.repeat(4097), '\u{1F600}'.repeat(2049)]) {
    let thrown;
    const seen = withEncodeSpy(sentinel, () => {
      try { encodePrivateAgreement({ ...base, paymentInstructions: sentinel }); } catch (error) { thrown = error; }
    });
    assert.equal(seen.length, 0, 'oversized instruction string must not reach TextEncoder');
    assert.equal(limitCode(thrown), true, 'fixed LIMIT_EXCEEDED code');
    assert.equal(String(thrown?.message).includes('xxxx'), false, 'no payload in diagnostics');
  }
});

test('G16 oversized capability id and version are refused before being passed to TextEncoder', () => {
  const base = vectors.privateAgreements[1].input;
  const cap = base.capabilities[0];
  const sentinels = [
    { id: 'a'.repeat(65), version: cap.version, key: 'id' },
    { id: 'a'.repeat(5000), version: cap.version, key: 'id' },
    { id: cap.id, version: 'v'.repeat(33), key: 'version' },
    { id: cap.id, version: 'v'.repeat(5000), key: 'version' },
  ];
  for (const item of sentinels) {
    const sentinel = item[item.key];
    let thrown;
    const seen = withEncodeSpy(sentinel, () => {
      try { encodePrivateAgreement({ ...base, capabilities: [{ ...cap, id: item.id, version: item.version }] }); } catch (error) { thrown = error; }
    });
    assert.equal(seen.length, 0, 'oversized capability string must not reach TextEncoder');
    assert.equal(limitCode(thrown), true);
  }
});

test('G16 exact instruction byte boundaries stay valid and over-byte-cap strings still fail', () => {
  const base = vectors.privateAgreements[0].input;
  const ok = value => encodePrivateAgreement({ ...base, paymentInstructions: value });
  assert.equal(ok('x'.repeat(4096)).byteLength > 4096, true);
  const euro = '\u20ac'.repeat(1365) + 'x'; // 3*1365 + 1 = 4096 bytes, 1366 code units
  assert.equal(new TextEncoder().encode(euro).byteLength, 4096);
  assert.equal(ok(euro).byteLength > 4096, true);
  const emoji = '\u{1F600}'.repeat(1024); // 4096 bytes, 2048 code units
  assert.equal(new TextEncoder().encode(emoji).byteLength, 4096);
  assert.equal(ok(emoji).byteLength > 4096, true);
  // Code-unit count fits (<= 4096) but UTF-8 byte count exceeds the cap.
  const tooManyBytes = '\u20ac'.repeat(1366);
  assert.equal(tooManyBytes.length <= 4096, true);
  rejects(() => ok(tooManyBytes), 'LIMIT_EXCEEDED');
  rejects(() => ok('\u{1F600}'.repeat(1025)), 'LIMIT_EXCEEDED');
  rejects(() => ok('x'.repeat(4097)), 'LIMIT_EXCEEDED');
});

test('G16 bounded lone surrogates fail INVALID_INPUT and nonstrings are rejected without coercion', () => {
  const base = vectors.privateAgreements[0].input;
  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: 'ab\uD800cd' }));
  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: '\uDC00' }));
  let coerced = 0;
  const evil = { toString() { coerced++; return 'x'; }, valueOf() { coerced++; return 'x'; } };
  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: evil }));
  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: 5 }));
  rejects(() => encodePrivateAgreement({ ...base, paymentInstructions: new String('x') }));
  assert.equal(coerced, 0);
});
