import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { canonicalize, canonicalBytes, decodeBase45, encodeBase45, parseStrictJson, decodeQrText, createReplayLedger, JcsError } from '../index.ts';
import { renderVectors, VECTORS_PATH, SIDECAR_PATH } from './fixtures/generate-vectors.mjs';
import { sha256, testVerifier } from './helpers.mjs';

const test = (name, run) => nodeTest(name, { timeout: 60_000 }, run);
const body = await readFile(VECTORS_PATH, 'utf8');
const document = JSON.parse(body);
const { vectors } = document;
const decodeWith = (text, ctx) => decodeQrText(text, {
  sha256, nowSeconds: () => ctx.now, chains: ctx.chains,
  ...(ctx.expectedChain ? { expectedChain: ctx.expectedChain } : {}), ...(ctx.verifierProfile ? { inviteVerifier: testVerifier() } : {}),
  ...(ctx.requireInviteSignature === undefined ? {} : { requireInviteSignature: ctx.requireInviteSignature }),
});

test('committed vectors are exactly what the generator produces, with a matching content digest and sidecar', async () => {
  const fresh = await renderVectors();
  assert.equal(canonicalize(vectors), canonicalize(fresh.document.vectors), 'regenerate: node --import ./scripts/test-support/register-tsx.mjs packages/qr/test/fixtures/generate-vectors.mjs');
  assert.equal(document.meta.contentSha256, createHash('sha256').update(canonicalBytes(vectors)).digest('hex'));
  assert.equal((await readFile(SIDECAR_PATH, 'utf8')).split(/\s+/)[0], createHash('sha256').update(body).digest('hex'));
  assert.equal(document.meta.generator, 'packages/qr/test/fixtures/generate-vectors.mjs');
  assert.equal(document.meta.independentCheck, 'scripts/vectors/check_qr_codec.py');
  assert.match(document.meta.generatorRuntime, /^node \d+\.\d+\.\d+$/);
});

test('fixture covers the D6 vector requirements', () => {
  const types = new Set(vectors.envelopes.map(vector => vector.type));
  assert.deepEqual([...types].sort(), ['payment-request', 'public-address', 'recovery-fingerprint', 'release-fingerprint', 'trade-invite']);
  assert.ok(vectors.envelopes.some(vector => vector.envelopeBytes === 2048), 'largest permitted envelope');
  assert.ok(vectors.envelopes.some(vector => vector.type === 'trade-invite' && vector.authenticated), 'a signed invite that verifies');
  assert.deepEqual(vectors.base45.filter(vector => vector.source.startsWith('RFC 9285')).map(vector => vector.base45), ['BB8', '%69 VD92EX0', 'UJCLQE7W581', 'QED8WEX0']);
  const codes = new Set(vectors.rejections.map(vector => vector.expectedCode));
  for (const required of ['VERSION_UNSUPPORTED', 'TYPE_UNSUPPORTED', 'FIELD_UNSUPPORTED', 'QR_TOO_LARGE', 'INVALID_UNICODE', 'CHAIN_MISMATCH', 'EXPIRED', 'HASH_MISMATCH',
    'SIGNATURE_UNSUPPORTED', 'SIGNATURE_INVALID', 'SIGNATURE_REQUIRED', 'PROFILE_UNSUPPORTED', 'SECRET_REFUSED', 'WALLET_SESSION_REFUSED', 'URL_REFUSED',
    'INVALID_ENCODING', 'INVALID_JSON', 'NON_CANONICAL'])
    assert.ok(codes.has(required), required);
  assert.ok(vectors.rejections.some(vector => vector.name.includes('wallet-session')) && vectors.rejections.some(vector => vector.name.includes('auth-token')));
  assert.deepEqual(vectors.replays[0].expectedCodes, [null, 'REPLAYED']);
  const symbols = vectors.qrSymbol.matrices;
  assert.deepEqual([...new Set(symbols.map(symbol => symbol.ecLevel))].sort(), ['H', 'L', 'M', 'Q']);
  assert.deepEqual([...new Set(symbols.map(symbol => symbol.mode))].sort(), ['alphanumeric', 'byte']);
  assert.ok(symbols.some(symbol => symbol.version >= 7) && symbols.some(symbol => symbol.version === 40));
  assert.ok(symbols.some(symbol => symbol.name === 'envelope-largest-permitted-envelope-2048' && symbol.ecLevel === 'M'));
  assert.equal(vectors.qrSymbol.capacities.length, 160);
});

test('base45 and canonical JSON vectors hold against the committed values', () => {
  for (const vector of vectors.base45) {
    const bytes = Uint8Array.from(Buffer.from(vector.inputHex, 'hex'));
    assert.equal(encodeBase45(bytes), vector.base45, vector.name);
    assert.deepEqual(decodeBase45(vector.base45).bytes, bytes, vector.name);
  }
  for (const vector of vectors.base45Invalid) assert.equal(decodeBase45(vector.text).ok, false, vector.name);
  for (const vector of vectors.jcs) {
    assert.equal(canonicalize(parseStrictJson(vector.inputJson)), vector.canonical, vector.name);
    assert.equal(Buffer.from(vector.canonical).toString('hex'), vector.canonicalHex, vector.name);
  }
  for (const vector of vectors.jcsInvalid)
    assert.throws(() => parseStrictJson(vector.inputJson, vector.maxDepth), error => error instanceof JcsError && error.code === vector.expectedCode, vector.name);
});

test('every envelope vector decodes to its recorded bytes and authentication state', async () => {
  for (const vector of vectors.envelopes) {
    const result = await decodeWith(vector.text, vector.context);
    assert.equal(result.ok, true, `${vector.name}: ${result.code}`);
    assert.equal(result.review.type, vector.type);
    assert.equal(result.review.envelopeBytes, vector.envelopeBytes);
    assert.equal(result.review.authenticated, vector.authenticated, vector.name);
    assert.equal(result.review.payloadSha256, vector.payloadSha256);
    assert.equal(canonicalize(result.review.payload), vector.payloadCanonical);
  }
});

test('every rejection vector is refused with its recorded code, and the replay vector is refused on second admission', async () => {
  for (const vector of vectors.rejections) {
    const result = await decodeWith(vector.text, vector.context);
    assert.equal(result.ok ? 'ok' : result.code, vector.expectedCode, vector.name);
  }
  for (const vector of vectors.replays) {
    const ledger = createReplayLedger({ nowSeconds: () => vector.context.now });
    const codes = [];
    for (const _ of vector.expectedCodes) {
      const admitted = ledger.admit((await decodeWith(vector.text, vector.context)).review);
      codes.push(admitted.ok ? null : admitted.code);
    }
    assert.deepEqual(codes, vector.expectedCodes);
  }
});
