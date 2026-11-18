#!/usr/bin/env node
/**
 * Generates packages/qr/test/fixtures/vectors.json from the TypeScript codec. Every value is computed here from
 * synthetic labels; no hex is typed by hand. scripts/vectors/check_qr_codec.py re-derives all of it with an
 * independent stdlib-only Python implementation of base45, RFC 8785 and the envelope checks.
 *
 *   node --import ./scripts/test-support/register-tsx.mjs packages/qr/test/fixtures/generate-vectors.mjs          # write
 *   node --import ./scripts/test-support/register-tsx.mjs packages/qr/test/fixtures/generate-vectors.mjs --check  # verify
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  QR_TEXT_PREFIX, QR_PROTOCOL, QR_ENVELOPE_VERSION, MAX_ENVELOPE_BYTES, GENERATION_TARGET_BYTES, MAX_ENVELOPE_DEPTH,
  INVITE_SIGNING_DOMAIN, EXPIRY_SAFETY_MARGIN_SECONDS, MAX_FUTURE_SKEW_SECONDS,
  canonicalize, canonicalBytes, parseStrictJson, encodeBase45, encodeUtf8, decodeUtf8, createQrEnvelope, encodeQrText,
  inviteSigningDigest, attachInviteSignature, decodeQrText, createReplayLedger, JcsError,
  encodeQrMatrix, qrCapacity, formatInformation, versionInformation, reedSolomonRemainder, QR_EC_LEVELS, DEFAULT_QR_EC_LEVEL,
} from '../../index.ts';
import {
  NOW, CHAINS, EVM_CHAIN, OTHER_EVM_CHAIN, SOLANA_CHAIN, INPUTS, deps, sha256, hashHex, solanaKey, evmAddress,
  TEST_PROFILE, TEST_PUBLIC_KEY, TEST_BOUND_AUTHOR, testSign, testVerifier, encodeDeps, adAddress,
} from '../helpers.mjs';

export const VECTORS_PATH = fileURLToPath(new URL('./vectors.json', import.meta.url));
export const SIDECAR_PATH = `${VECTORS_PATH}.sha256`;
const GENERATOR = 'packages/qr/test/fixtures/generate-vectors.mjs';
const DECODE_NOW = NOW + 5;

const text = bytes => QR_TEXT_PREFIX + encodeBase45(bytes);
const treeText = tree => text(canonicalBytes(tree));
const hexOf = bytes => Buffer.from(bytes).toString('hex');
const plain = value => JSON.parse(canonicalize(value));

async function envelopeFor(type, label = type, change = {}) {
  const created = await createQrEnvelope({ ...INPUTS[type], ...change }, deps(`vectors/${label}`));
  if (!created.ok) throw new Error(`${label}: ${created.code}`);
  return created.envelope;
}

async function signedInvite(label) {
  const unsigned = await envelopeFor('trade-invite', label);
  const digest = await inviteSigningDigest(unsigned, sha256);
  if (!digest.ok) throw new Error(digest.code);
  const signed = attachInviteSignature(unsigned, { profile: TEST_PROFILE, publicKey: TEST_PUBLIC_KEY, value: testSign(digest.digest) });
  if (!signed.ok) throw new Error(signed.code);
  return { envelope: signed.envelope, digest: hexOf(digest.digest) };
}

/** Pads an unverifiable signature and the origin hint until the canonical envelope is exactly `size` bytes. */
async function sizedInvite(size) {
  const base = await envelopeFor('trade-invite', `size-${size}`);
  for (let pad = 0; pad < 2; pad++) {
    const originHint = `${'a'.repeat(1 + pad)}.example`;
    const probe = { ...plain(base), originHint, signature: { profile: 'size-probe', publicKey: hashHex('size-key'), value: '' } };
    const remaining = size - canonicalBytes(probe).length;
    if (remaining >= 2 && remaining % 2 === 0) {
      probe.signature.value = createHash('sha512').update(`size-${size}`).digest('hex').repeat(64).slice(0, remaining);
      if (canonicalBytes(probe).length !== size) throw new Error('size search failed');
      return probe;
    }
  }
  throw new Error('size search failed');
}

function base45Vectors() {
  const rfc = [
    ['rfc9285-AB', 'AB', 'BB8'],
    ['rfc9285-Hello!!', 'Hello!!', '%69 VD92EX0'],
    ['rfc9285-base-45', 'base-45', 'UJCLQE7W581'],
    ['rfc9285-ietf!', 'ietf!', 'QED8WEX0'],
  ].map(([name, input, expected]) => {
    const bytes = encodeUtf8(input), actual = encodeBase45(bytes);
    if (actual !== expected) throw new Error(`${name}: ${actual}`);
    return { name, source: 'RFC 9285 section 4', inputHex: hexOf(bytes), base45: actual };
  });
  const edges = [[], [0], [0xff], [0, 0], [0xff, 0xff], [0xff, 0xff, 0xff], [0, 0, 0]];
  const generated = edges.map((bytes, index) => ({ name: `edge-${index}`, source: 'generated', inputHex: hexOf(Uint8Array.from(bytes)), base45: encodeBase45(Uint8Array.from(bytes)) }));
  for (let length = 1; length <= 33; length += 8) {
    const bytes = createHash('sha512').update(`base45-${length}`).digest().subarray(0, length);
    generated.push({ name: `sha512-prefix-${length}`, source: 'generated', inputHex: hexOf(bytes), base45: encodeBase45(bytes) });
  }
  return [...rfc, ...generated];
}

const BASE45_INVALID = [
  ['length-mod-3-is-1', 'A'],
  ['length-mod-3-is-1-long', 'BB8A'],
  ['lowercase-not-in-alphabet', 'bb8'],
  ['character-outside-alphabet', 'BB#'],
  ['non-ascii-character', 'BBÉ'],
  ['triple-overflow-65536', 'GGW'],
  ['triple-overflow-max', ':::'],
  ['pair-overflow-256', 'V5'],
  ['pair-overflow-max', '::'],
].map(([name, value]) => ({ name, text: value }));

const JCS_INPUTS = [
  ['rfc8785-utf16-key-order', '{"\\u20ac":"Euro Sign","\\r":"Carriage Return","\\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","\\ud83d\\ude00":"Emoji: Grinning Face","\\u0080":"Control","\\u00f6":"Latin Small Letter O With Diaeresis"}'],
  ['rfc8785-string-escapes', '{"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/"}'],
  ['literals-and-nesting', '{ "b": [1, -2, true, false, null, "x"], "a": { "z": 0, "y": "\\u2028\\u2029" } }'],
  ['safe-integer-bounds', '[9007199254740991, -9007199254740991, 0, -1]'],
  ['empty-containers-and-empty-key', '{"a": {}, "": [], "b": [[], {}]}'],
  ['all-c0-controls-and-del', `["${Array.from({ length: 32 }, (_, code) => `\\u${code.toString(16).padStart(4, '0')}`).join('')}\\u007f"]`],
  ['astral-and-private-use-keys', '{"\\uffff":1,"\\ue000":2,"\\ud800\\udc00":3,"\\udbff\\udfff":4,"~":5}'],
  ['proto-is-an-ordinary-key', '{"__proto__":{"polluted":true},"constructor":1}'],
];
const JCS_INVALID = [
  ['duplicate-key', '{"a":1,"a":2}', 'DUPLICATE_KEY'],
  ['duplicate-key-via-escape', '{"a":1,"\\u0061":2}', 'DUPLICATE_KEY'],
  ['duplicate-proto-key', '{"__proto__":1,"__proto__":2}', 'DUPLICATE_KEY'],
  ['fraction', '{"a":1.5}', 'UNSUPPORTED_NUMBER'],
  ['integral-fraction', '[1.0]', 'UNSUPPORTED_NUMBER'],
  ['exponent', '[1e3]', 'UNSUPPORTED_NUMBER'],
  ['unsafe-integer', '[9007199254740992]', 'UNSUPPORTED_NUMBER'],
  ['negative-zero', '[-0]', 'UNSUPPORTED_NUMBER'],
  ['lone-high-surrogate', '["\\ud800"]', 'INVALID_UNICODE'],
  ['lone-low-surrogate', '["\\udc00x"]', 'INVALID_UNICODE'],
  ['reversed-surrogate-pair', '["\\ude00\\ud83d"]', 'INVALID_UNICODE'],
  ['lone-surrogate-key', '{"\\udfff":1}', 'INVALID_UNICODE'],
  ['nan-literal', '[NaN]', 'INVALID_JSON'],
  ['trailing-comma', '[1,]', 'INVALID_JSON'],
  ['leading-zero', '[01]', 'INVALID_JSON'],
  ['single-quotes', "['a']", 'INVALID_JSON'],
  ['raw-control-character', '["a\tb"]', 'INVALID_JSON'],
  ['trailing-garbage', '{} {}', 'INVALID_JSON'],
  ['depth-9', `${'['.repeat(9)}${']'.repeat(9)}`, 'DEPTH_EXCEEDED'],
].map(([name, inputJson, expectedCode]) => ({ name, inputJson, expectedCode, maxDepth: MAX_ENVELOPE_DEPTH }));
const UTF8_INVALID = [
  ['overlong-solidus', [0x22, 0xc0, 0xaf, 0x22]],
  ['encoded-surrogate', [0x22, 0xed, 0xa0, 0x80, 0x22]],
  ['truncated-sequence', [0x22, 0xe2, 0x82, 0x22]],
  ['above-u10ffff', [0x22, 0xf4, 0x90, 0x80, 0x80, 0x22]],
  ['stray-continuation', [0x22, 0x80, 0x22]],
].map(([name, bytes]) => ({ name, inputHex: hexOf(Uint8Array.from(bytes)), expectedCode: 'INVALID_UNICODE' }));

function jcsVectors() {
  const valid = JCS_INPUTS.map(([name, inputJson]) => {
    const canonical = canonicalize(parseStrictJson(inputJson));
    return { name, inputJson, canonical, canonicalHex: hexOf(encodeUtf8(canonical)) };
  });
  for (const vector of JCS_INVALID) {
    try { parseStrictJson(vector.inputJson, vector.maxDepth); throw new Error(`${vector.name} parsed`); }
    catch (error) { if (!(error instanceof JcsError) || error.code !== vector.expectedCode) throw new Error(`${vector.name}: ${error.code ?? error}`); }
  }
  for (const vector of UTF8_INVALID) {
    let decoded = true;
    try { decodeUtf8(Uint8Array.from(Buffer.from(vector.inputHex, 'hex'))); } catch { decoded = false; }
    if (decoded) throw new Error(`${vector.name} decoded`);
  }
  return valid;
}

/** Rows of `0`/`1` packed MSB-first into hex, each row zero-padded to a multiple of four modules. */
const rowsHex = rows => rows.map(row => {
  const padded = row.padEnd(Math.ceil(row.length / 4) * 4, '0');
  let out = '';
  for (let i = 0; i < padded.length; i += 4) out += parseInt(padded.slice(i, i + 4), 2).toString(16);
  return out;
});

function matrixVectors(envelopes) {
  const matrices = [];
  const add = (name, value, options = {}) => {
    const result = encodeQrMatrix(value, options);
    if (!result.ok) throw new Error(`${name}: ${result.code}`);
    const { matrix } = result;
    matrices.push({ name, text: value, ecLevel: matrix.ecLevel, mode: matrix.mode, version: matrix.version, mask: matrix.mask, size: matrix.size,
      rowsSha256: createHash('sha256').update(matrix.rows.join('\n')).digest('hex'), rowsHex: rowsHex(matrix.rows) });
  };
  for (const level of QR_EC_LEVELS) add(`hello-world-${level}`, 'HELLO WORLD', { ecLevel: level });
  for (const envelope of envelopes.filter(vector => vector.name !== 'trade-invite-signed-no-verifier')) add(`envelope-${envelope.name}`, envelope.text);
  for (const level of QR_EC_LEVELS) add(`byte-utf8-${level}`, 'p2p offramp é€\u{1F600}', { ecLevel: level });
  add('alphanumeric-capacity-7M', 'A1'.repeat(qrCapacity(7, 'M', 'alphanumeric')).slice(0, qrCapacity(7, 'M', 'alphanumeric')), { minVersion: 7, maxVersion: 7 });
  add('byte-capacity-10H-mask-5', 'b'.repeat(qrCapacity(10, 'H', 'byte')), { ecLevel: 'H', minVersion: 10, maxVersion: 10, mask: 5 });
  add('alphanumeric-capacity-40H', 'Z9'.repeat(qrCapacity(40, 'H', 'alphanumeric')).slice(0, qrCapacity(40, 'H', 'alphanumeric')), { ecLevel: 'H' });
  return {
    defaultEcLevel: DEFAULT_QR_EC_LEVEL,
    reedSolomon: [
      { name: 'iso-18004-annex-i-1M', source: 'ISO/IEC 18004 Annex I', dataHex: hexOf(Uint8Array.of(16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17)), ecc: 10 },
      { name: 'hello-world-1Q', source: 'published HELLO WORLD walkthrough', dataHex: hexOf(Uint8Array.of(32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236)), ecc: 13 },
    ].map(vector => ({ ...vector, eccHex: hexOf(reedSolomonRemainder(Uint8Array.from(Buffer.from(vector.dataHex, 'hex')), vector.ecc)) })),
    formatInformation: QR_EC_LEVELS.flatMap(level => Array.from({ length: 8 }, (_, mask) => ({ ecLevel: level, mask, bits: formatInformation(level, mask) }))),
    versionInformation: Array.from({ length: 34 }, (_, index) => ({ version: index + 7, bits: versionInformation(index + 7) })),
    capacities: Array.from({ length: 40 }, (_, index) => index + 1).flatMap(version => QR_EC_LEVELS.map(level => ({
      version, ecLevel: level, alphanumeric: qrCapacity(version, level, 'alphanumeric'), byte: qrCapacity(version, level, 'byte'),
    }))),
    matrices,
  };
}

/** Replaces the first occurrence of `find` in the canonical bytes of `tree`. */
function spliceText(tree, find, replacement) {
  const canonical = canonicalize(tree), at = canonical.indexOf(find);
  if (at < 0) throw new Error(`splice: ${find}`);
  const before = encodeUtf8(canonical.slice(0, at)), after = encodeUtf8(canonical.slice(at + find.length));
  const middle = replacement instanceof Uint8Array ? replacement : encodeUtf8(replacement);
  return text(Uint8Array.from([...before, ...middle, ...after]));
}

async function build() {
  const baseContext = { now: DECODE_NOW, chains: [...CHAINS] };
  const verifierContext = { ...baseContext, verifierProfile: TEST_PROFILE };
  const reviewOnlyContext = { ...verifierContext, requireInviteSignature: false };
  const envelopes = [], rejections = [];
  const addEnvelope = async (name, envelope, extra = {}) => {
    const encoded = await encodeQrText(envelope, encodeDeps());
    if (!encoded.ok) throw new Error(`${name}: ${encoded.code}`);
    envelopes.push({
      name, type: envelope.type, text: encoded.text, envelopeBytes: encoded.envelopeBytes, withinGenerationTarget: encoded.withinGenerationTarget,
      canonical: canonicalize(envelope), payloadCanonical: canonicalize(envelope.payload), payloadSha256: envelope.payloadSha256, ...extra,
    });
  };
  for (const type of Object.keys(INPUTS)) await addEnvelope(`${type}`, await envelopeFor(type), { context: baseContext, authenticated: false });
  await addEnvelope('public-address-solana', await envelopeFor('public-address', 'solana', { chain: SOLANA_CHAIN, payload: { address: solanaKey('qr-solana-address') } }), { context: baseContext, authenticated: false });
  await addEnvelope('payment-request-erc20', await envelopeFor('payment-request', 'erc20', { payload: { recipient: evmAddress('qr-recipient'), asset: evmAddress('qr-token'), amount: '115792089237316195423570985008687907853269984665640564039457584007913129639935' } }), { context: baseContext, authenticated: false });
  await addEnvelope('recovery-fingerprint-references', await envelopeFor('recovery-fingerprint', 'references', { payload: { format: 'p2p-offramp/offline-recovery-references/v1', byteLength: 131_072, sha256: hashHex('qr-references') } }), { context: baseContext, authenticated: false });
  const signed = await signedInvite('signed');
  await addEnvelope('trade-invite-signed-test-profile', signed.envelope, { context: verifierContext, authenticated: true, signingDigestHex: signed.digest });
  await addEnvelope('trade-invite-signed-no-verifier', signed.envelope, { context: baseContext, authenticated: false, signingDigestHex: signed.digest });
  const largest = await sizedInvite(MAX_ENVELOPE_BYTES);
  await addEnvelope('largest-permitted-envelope-2048', largest, { context: baseContext, authenticated: false });
  await addEnvelope('public-address-www-origin-hint', await envelopeFor('public-address', 'www', { originHint: 'www.offramp.example' }), { context: baseContext, authenticated: false });
  const onion = `${Array.from(Buffer.from(hashHex('onion-1') + hashHex('onion-2'), 'hex'), byte => 'abcdefghijkmnopqrstuvwxyz234567'[byte % 31]).join('').slice(0, 56)}.onion`;
  await addEnvelope('public-address-onion-origin-hint', await envelopeFor('public-address', 'onion', { originHint: onion }), { context: baseContext, authenticated: false });
  await addEnvelope('release-fingerprint-git-sha1-release-id', await envelopeFor('release-fingerprint', 'git-sha', { payload: { ...INPUTS['release-fingerprint'].payload, releaseId: hashHex('commit').slice(0, 40) } }), { context: baseContext, authenticated: false });
  await addEnvelope('trade-invite-unsigned-review-only', await envelopeFor('trade-invite', 'review-only'), { context: reviewOnlyContext, authenticated: false });

  const reject = (name, value, expectedCode, layer, context = baseContext) => rejections.push({ name, text: value, expectedCode, layer, context });
  const address = plain(await envelopeFor('public-address', 'reject-address'));
  const payment = plain(await envelopeFor('payment-request', 'reject-payment'));
  const invite = plain(await envelopeFor('trade-invite', 'reject-invite'));

  // Text layer.
  reject('url-instead-of-code', 'https://offramp.example/pay?to=0x00', 'URL_REFUSED', 'text');
  reject('erc681-uri', `ethereum:${evmAddress('qr-recipient')}@11155111?value=1`, 'URL_REFUSED', 'text');
  reject('wallet-session-uri', `wc:${hashHex('wc-topic')}@2?relay-protocol=irn&symKey=${hashHex('wc-key')}`, 'WALLET_SESSION_REFUSED', 'text');
  reject('bare-mnemonic', 'abandon ability able about above absent absorb abstract absurd abuse access accident', 'SECRET_REFUSED', 'text');
  reject('unknown-prefix-version', `P2POFFRAMP:2:${treeText(address).slice(QR_TEXT_PREFIX.length)}`, 'VERSION_UNSUPPORTED', 'text');
  reject('lowercase-prefix-is-scheme-like', treeText(address).replace('P2POFFRAMP', 'p2pofframp'), 'URL_REFUSED', 'text');
  reject('plain-text', 'HELLO WORLD', 'FORMAT_UNSUPPORTED', 'text');
  reject('decoded-2049-bytes-refused-before-parse', text(new Uint8Array(MAX_ENVELOPE_BYTES + 1).fill(0xff)), 'QR_TOO_LARGE', 'size');
  reject('envelope-2050-bytes', treeText(await sizedInvite(MAX_ENVELOPE_BYTES + 2)), 'QR_TOO_LARGE', 'size');
  // base45 layer: truncation and damage.
  const addressText = treeText(address);
  reject('truncated-one-character', addressText.slice(0, -1), 'INVALID_ENCODING', 'base45');
  reject('damaged-overflow-triple', `${addressText.slice(0, QR_TEXT_PREFIX.length + 3)}:::${addressText.slice(QR_TEXT_PREFIX.length + 6)}`, 'INVALID_ENCODING', 'base45');
  reject('damaged-character-outside-alphabet', `${addressText.slice(0, -1)}a`, 'INVALID_ENCODING', 'base45');
  // UTF-8 / JSON / canonical layers.
  reject('truncated-three-characters', addressText.slice(0, -3), 'INVALID_JSON', 'json');
  reject('invalid-utf8-encoded-surrogate', spliceText({ ...address, originHint: 'xx.example' }, 'xx', Uint8Array.from([0xed, 0xa0, 0x80])), 'INVALID_UNICODE', 'utf8');
  reject('invalid-utf8-overlong', spliceText({ ...address, originHint: 'xx.example' }, 'xx', Uint8Array.from([0xc1, 0x81])), 'INVALID_UNICODE', 'utf8');
  reject('lone-surrogate-escape', spliceText({ ...address, originHint: 'xx.example' }, 'xx', '\\ud800'), 'INVALID_UNICODE', 'json');
  reject('duplicate-envelope-key', spliceText(address, '"chain":', `"chain":"${OTHER_EVM_CHAIN}","chain":`), 'INVALID_JSON', 'json');
  reject('float-timestamp', spliceText(address, `"createdAt":${address.createdAt}`, `"createdAt":${address.createdAt}.5`), 'INVALID_JSON', 'json');
  reject('non-canonical-whitespace', text(encodeUtf8(JSON.stringify(address, null, 1))), 'NON_CANONICAL', 'canonical');
  reject('non-canonical-member-order', text(encodeUtf8(JSON.stringify({ protocol: address.protocol, ...address }))), 'NON_CANONICAL', 'canonical');
  reject('non-canonical-escape', spliceText(address, '"protocol":"p', '"protocol":"\\u0070'), 'NON_CANONICAL', 'canonical');
  // Envelope semantics.
  reject('unknown-envelope-version', treeText({ ...address, v: 2 }), 'VERSION_UNSUPPORTED', 'schema');
  reject('unknown-protocol', treeText({ ...address, protocol: 'other-qr' }), 'PROTOCOL_UNSUPPORTED', 'schema');
  reject('unknown-type', treeText({ ...address, type: 'seed-backup' }), 'TYPE_UNSUPPORTED', 'schema');
  reject('unknown-envelope-field', treeText({ ...address, note: 'hello' }), 'FIELD_UNSUPPORTED', 'schema');
  reject('unknown-payload-field', treeText({ ...payment, payload: { ...payment.payload, memo: 'x' } }), 'FIELD_UNSUPPORTED', 'schema');
  reject('trade-invite-carrying-terms', treeText({ ...invite, payload: { ...invite.payload, terms: 'price=1' } }), 'FIELD_UNSUPPORTED', 'schema');
  reject('invite-without-expiry', treeText({ ...invite, expiresAt: null }), 'INVALID_ENVELOPE', 'schema');
  reject('invite-lifetime-over-24h', treeText({ ...invite, expiresAt: invite.createdAt + 86_401 }), 'LIFETIME_EXCEEDED', 'schema');
  reject('chain-on-fingerprint', treeText({ ...plain(await envelopeFor('release-fingerprint', 'reject-release')), chain: EVM_CHAIN }), 'INVALID_ENVELOPE', 'schema');
  reject('mixed-case-address', treeText({ ...address, payload: { address: address.payload.address.toUpperCase().replace('0X', '0x') } }), 'INVALID_PAYLOAD', 'schema');
  // Secrets and URLs inside an envelope.
  reject('secret-field-mnemonic', treeText({ ...address, payload: { ...address.payload, mnemonic: 'redacted' } }), 'SECRET_REFUSED', 'secret');
  reject('secret-field-private-key', treeText({ ...address, privateKey: 'redacted' }), 'SECRET_REFUSED', 'secret');
  reject('secret-field-auth-token', treeText({ ...address, payload: { ...address.payload, authToken: 'redacted' } }), 'SECRET_REFUSED', 'secret');
  reject('secret-value-wallet-session-uri', treeText({ ...address, payload: { address: `wc:${hashHex('wc-topic')}@2?relay-protocol=irn&symKey=${hashHex('wc-key')}` } }), 'SECRET_REFUSED', 'secret');
  reject('secret-value-jwt', treeText({ ...address, originHint: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"sub":"x"}').toString('base64url')}.sig` }), 'SECRET_REFUSED', 'secret');
  reject('secret-value-bearer-token', treeText({ ...address, originHint: `Bearer ${hashHex('bearer')}` }), 'SECRET_REFUSED', 'secret');
  reject('secret-value-nsec', treeText({ ...address, payload: { address: `nsec1${'q'.repeat(58)}` } }), 'SECRET_REFUSED', 'secret');
  reject('secret-value-0x-private-key', treeText({ ...address, payload: { address: `0x${hashHex('not-a-real-key')}` } }), 'SECRET_REFUSED', 'secret');
  reject('url-payload-address', treeText({ ...address, payload: { address: 'https://offramp.example/a' } }), 'URL_REFUSED', 'url');
  reject('url-origin-hint-is-not-a-hostname', treeText({ ...address, originHint: 'https://offramp.example' }), 'INVALID_ENVELOPE', 'schema');
  // Chain, hash, clock and signature.
  reject('chain-not-in-registry', treeText({ ...address, chain: 'evm:999' }), 'CHAIN_UNSUPPORTED', 'chain');
  reject('wrong-chain', treeText(address), 'CHAIN_MISMATCH', 'chain', { ...baseContext, expectedChain: OTHER_EVM_CHAIN });
  reject('hash-mismatch', treeText({ ...payment, payload: { ...payment.payload, amount: '1500000000000000001' } }), 'HASH_MISMATCH', 'hash');
  reject('expired-invite-within-safety-margin', treeText(invite), 'EXPIRED', 'clock', { ...baseContext, now: invite.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS });
  reject('created-in-the-future', treeText(address), 'NOT_YET_VALID', 'clock', { ...baseContext, now: address.createdAt - MAX_FUTURE_SKEW_SECONDS - 1 });
  const signedPlain = plain(signed.envelope);
  reject('signature-copied-to-public-address', treeText({ ...address, signature: signedPlain.signature }), 'SIGNATURE_UNSUPPORTED', 'signature');
  reject('signature-copied-to-payment-request', treeText({ ...payment, signature: signedPlain.signature }), 'SIGNATURE_UNSUPPORTED', 'signature');
  reject('signature-copied-to-other-invite', treeText({ ...invite, signature: signedPlain.signature }), 'SIGNATURE_INVALID', 'signature', verifierContext);
  reject('signed-invite-expiry-extended', treeText({ ...signedPlain, expiresAt: signedPlain.expiresAt + 60 }), 'SIGNATURE_INVALID', 'signature', verifierContext);
  const { signature: _stripped, ...strippedPlain } = signedPlain;
  reject('stripped-signature-with-verifier', treeText(strippedPlain), 'SIGNATURE_REQUIRED', 'signature', verifierContext);
  reject('unknown-profile-with-verifier', treeText({ ...signedPlain, signature: { ...signedPlain.signature, profile: 'other-profile' } }), 'PROFILE_UNSUPPORTED', 'signature', verifierContext);
  reject('signature-wrong-size-for-profile', treeText({ ...signedPlain, signature: { ...signedPlain.signature, value: `${signedPlain.signature.value}00` } }), 'SIGNATURE_INVALID', 'signature', verifierContext);
  const foreign = await envelopeFor('trade-invite', 'foreign-author', { payload: { ...INPUTS['trade-invite'].payload, ad: adAddress(hashHex('qr-other-seller'), hashHex('qr-order')) } });
  const foreignDigest = await inviteSigningDigest(foreign, sha256);
  reject('key-not-bound-to-advert-author', treeText({ ...plain(foreign), signature: { profile: TEST_PROFILE, publicKey: TEST_PUBLIC_KEY, value: testSign(foreignDigest.digest) } }), 'SIGNATURE_INVALID', 'signature', verifierContext);
  const release = plain(await envelopeFor('release-fingerprint', 'reject-release-secret'));
  const rawKey = hashHex('not-a-real-release-key'), wifLike = `${solanaKey('wif-a')}${solanaKey('wif-b')}`.slice(0, 51);
  reject('secret-release-id-hex-key', treeText({ ...release, payload: { ...release.payload, releaseId: `${rawKey.slice(0, 32)}.${rawKey.slice(32)}` } }), 'SECRET_REFUSED', 'secret');
  reject('secret-release-id-bare-64-hex', treeText({ ...release, payload: { ...release.payload, releaseId: rawKey } }), 'SECRET_REFUSED', 'secret');
  reject('secret-release-id-hyphenated-wif', treeText({ ...release, payload: { ...release.payload, releaseId: `${wifLike.slice(0, 25)}-${wifLike.slice(25)}` } }), 'SECRET_REFUSED', 'secret');
  reject('secret-uppercase-mnemonic', treeText({ ...address, payload: { address: 'ABANDON ABILITY ABLE ABOUT ABOVE ABSENT ABSORB ABSTRACT ABSURD ABUSE ACCESS ACCIDENT' } }), 'SECRET_REFUSED', 'secret');
  reject('secret-comma-mnemonic', treeText({ ...address, payload: { address: 'abandon,ability,able,about,above,absent,absorb,abstract,absurd,abuse,access,accident' } }), 'SECRET_REFUSED', 'secret');
  // Replay: the second admission of the same code through one local ledger.
  const replayed = [{ name: 'replayed-invite', text: treeText(invite), expectedCodes: [null, 'REPLAYED'], layer: 'ledger', context: baseContext }];

  // Self-check every vector against the TS decoder before freezing it.
  const decodeWith = (value, ctx) => decodeQrText(value, {
    sha256, nowSeconds: () => ctx.now, chains: ctx.chains, ...(ctx.expectedChain ? { expectedChain: ctx.expectedChain } : {}),
    ...(ctx.verifierProfile ? { inviteVerifier: testVerifier() } : {}),
    ...(ctx.requireInviteSignature === undefined ? {} : { requireInviteSignature: ctx.requireInviteSignature }),
  });
  for (const vector of envelopes) {
    const result = await decodeWith(vector.text, vector.context);
    if (!result.ok || result.review.authenticated !== vector.authenticated) throw new Error(`${vector.name}: ${result.code ?? 'auth'}`);
  }
  for (const vector of rejections) {
    const result = await decodeWith(vector.text, vector.context);
    if (result.ok || result.code !== vector.expectedCode) throw new Error(`${vector.name}: expected ${vector.expectedCode}, got ${result.ok ? 'ok' : result.code}`);
  }
  for (const vector of replayed) {
    const ledger = createReplayLedger({ nowSeconds: () => vector.context.now });
    const codes = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await decodeWith(vector.text, vector.context);
      if (!result.ok) throw new Error(vector.name);
      const admitted = ledger.admit(result.review);
      codes.push(admitted.ok ? null : admitted.code);
    }
    if (canonicalize(codes) !== canonicalize(vector.expectedCodes)) throw new Error(vector.name);
  }

  const vectors = {
    base45: base45Vectors(), base45Invalid: BASE45_INVALID,
    jcs: jcsVectors(), jcsInvalid: JCS_INVALID, utf8Invalid: UTF8_INVALID,
    envelopes, rejections, replays: replayed,
    qrSymbol: matrixVectors(envelopes),
  };
  return {
    meta: {
      description: 'D6 QR interchange codec vectors (envelope v1, RFC 8785 canonical JSON, RFC 9285 base45 text) and ISO/IEC 18004 symbol vectors. Synthetic values only.',
      generator: GENERATOR,
      independentCheck: 'scripts/vectors/check_qr_codec.py',
      generatorRuntime: `node ${process.versions.node}`,
      codec: {
        prefix: QR_TEXT_PREFIX, protocol: QR_PROTOCOL, envelopeVersion: QR_ENVELOPE_VERSION, base45: 'RFC 9285', canonicalJson: 'RFC 8785',
        maxEnvelopeBytes: MAX_ENVELOPE_BYTES, generationTargetBytes: GENERATION_TARGET_BYTES, maxDepth: MAX_ENVELOPE_DEPTH,
        inviteSigningDomain: INVITE_SIGNING_DOMAIN, expirySafetyMarginSeconds: EXPIRY_SAFETY_MARGIN_SECONDS, maxFutureSkewSeconds: MAX_FUTURE_SKEW_SECONDS,
      },
      testOnlyInviteProfile: {
        profile: TEST_PROFILE, publicKey: TEST_PUBLIC_KEY, publicKeyBytes: 32, signatureBytes: 32, boundAuthor: TEST_BOUND_AUTHOR,
        hmacKeyDerivation: 'SHA-256("qr-test-only-hmac-key")', signature: 'HMAC-SHA-256(key, signingDigest)',
        binding: 'The verifier attests boundTo == advertisement author; the test key is bound to boundAuthor only.',
        note: 'Exercises the injected verifier interface only. Not a proposal for the open invite signing-key profile.',
      },
      contentSha256: hexOf(createHash('sha256').update(canonicalBytes(vectors)).digest()),
    },
    vectors,
  };
}

export async function renderVectors() {
  const document = await build();
  const body = `${JSON.stringify(document, null, 2)}\n`;
  return { document, body, sidecar: `${createHash('sha256').update(body).digest('hex')}  vectors.json\n` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { body, sidecar } = await renderVectors();
  if (process.argv.includes('--check')) {
    const current = JSON.parse(await readFile(VECTORS_PATH, 'utf8'));
    const fresh = JSON.parse(body);
    if (current.meta.contentSha256 !== fresh.meta.contentSha256 || canonicalize(current.vectors) !== canonicalize(fresh.vectors)) {
      console.error('vectors.json is stale; regenerate it.');
      process.exitCode = 1;
    } else console.log(`vectors.json is current (contentSha256 ${fresh.meta.contentSha256}).`);
  } else {
    await writeFile(VECTORS_PATH, body);
    await writeFile(SIDECAR_PATH, sidecar);
    console.log(`wrote ${VECTORS_PATH} and ${SIDECAR_PATH}`);
  }
}
