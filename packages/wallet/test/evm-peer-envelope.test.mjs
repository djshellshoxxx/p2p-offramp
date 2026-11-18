import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnvelope } from '../../exchange/src/messages.ts';
import { parseCandidatePeerEnvelope, verifyCandidatePeerEnvelope, MAX_PEER_ENVELOPE_BYTES,
  MAX_PEER_TERMS_BYTES } from '../src/evm-peer-envelope.ts';

const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url)));
const vectors = JSON.parse(await readFile(new URL('./fixtures/peer-acceptance-v1.json', import.meta.url)));
function fixture(role = 'seller', asset = 'native') {
  const vector = vectors.vectors.find(row => row.role === role && row.assetKind === asset);
  const terms = scenario.sets[asset].terms, { binding, termsSignature, bindingSignature } = structuredClone(vector);
  const sender = binding.ownMessagingKey, recipient = binding.counterpartyMessagingKey;
  const ad = `30078:${role === 'seller' ? sender : recipient}:p2p-offramp:v1:${terms.orderId}`;
  const acceptance = { binding, termsSignature, bindingSignature };
  const envelope = { v: 2, type: role === 'seller' ? 'terms-offer' : 'terms-accept', ad, orderId: terms.orderId,
    sender, recipient, nonce: 'ab'.repeat(32), expiresAtSeconds: '1699993600', termsHash: binding.termsHash,
    body: role === 'seller' ? { terms: 'opaque reviewed document fixture', acceptance } : { revision: terms.revision, acceptance } };
  return { envelope, terms, domain: scenario.domain, context: { sender, recipient, ad, nowSeconds: '1699990000' } };
}
const encoded = f => JSON.stringify(f.envelope);
const verify = f => verifyCandidatePeerEnvelope(f.domain, f.terms, f.context, encoded(f));

test('candidate carrier verifies fixed seller/buyer native/ERC-20 vectors without granting authority', () => {
  for (const role of ['seller', 'buyer']) for (const asset of ['native', 'erc20']) {
    const f = fixture(role, asset), parsed = parseCandidatePeerEnvelope(encoded(f));
    assert.deepEqual(parsed, f.envelope);
    for (const value of [parsed, parsed.body, parsed.body.acceptance, parsed.body.acceptance.binding]) assert.ok(Object.isFrozen(value));
    const result = verify(f);
    assert.equal(result?.candidateOnly, true); assert.equal(result?.economicPreparationAllowed, false);
    assert.equal(result.effectiveNotAfterSeconds, f.envelope.expiresAtSeconds);
    assert.doesNotMatch(JSON.stringify(result), /Signature|0x/);
    assert.equal(parseEnvelope(encoded(f)), null, 'v1 exchange must refuse v2');
  }
});
test('reject v1, omitted binding/signatures, extra authority or scheme fields, and duplicate JSON keys', () => {
  const variants = [f => { f.envelope.v = 1; }, f => { f.envelope.v = 3; },
    f => { delete f.envelope.body.acceptance; }, f => { delete f.envelope.body.acceptance.binding; },
    f => { delete f.envelope.body.acceptance.termsSignature; }, f => { delete f.envelope.body.acceptance.bindingSignature; },
    f => { f.envelope.body.acceptance.scheme = 'eoa'; }, f => { f.envelope.economicPreparationAllowed = true; },
    f => { f.envelope.body.acceptance.binding.extra = true; }];
  for (const mutate of variants) { const f = fixture(); mutate(f); assert.equal(parseCandidatePeerEnvelope(encoded(f)), null); }
  const text = encoded(fixture());
  assert.equal(parseCandidatePeerEnvelope(text.replace('"v":2', '"v":2,"v":2')), null);
  assert.equal(parseCandidatePeerEnvelope(text.replace('"role":"seller"', '"role":"seller","role":"seller"')), null);
  assert.equal(parseCandidatePeerEnvelope({ toString() { throw Error('must not coerce'); } }), null);
});
test('signed identity is bound to carrier role, sender, recipient, terms and advertisement', () => {
  for (const mutate of [f => { f.envelope.sender = '11'.repeat(32); }, f => { f.envelope.recipient = '22'.repeat(32); },
    f => { f.envelope.termsHash = 'cd'.repeat(32); }, f => { f.envelope.orderId = 'ef'.repeat(32); },
    f => { f.envelope.ad = f.envelope.ad.replace(f.envelope.sender, f.envelope.recipient); },
    f => { f.envelope.body.acceptance.binding.role = 'buyer'; }, f => { f.envelope.nonce = 'AF'.repeat(32); }]) {
    const f = fixture(); mutate(f); assert.equal(parseCandidatePeerEnvelope(encoded(f)), null);
  }
});
test('exact EOA signature budget refuses malformed hex, alternate encodings and contract-sized signatures', () => {
  for (const field of ['termsSignature', 'bindingSignature']) for (const value of [null, [], 'ff'.repeat(65),
    '0x' + 'FF'.repeat(65), '0x' + 'ff'.repeat(64), '0x' + 'ff'.repeat(66), '0x' + 'ab'.repeat(4096)]) {
    const f = fixture(); f.envelope.body.acceptance[field] = value; assert.equal(parseCandidatePeerEnvelope(encoded(f)), null);
  }
});
test('decoded terms and aggregate JSON have separate UTF-8 byte bounds', () => {
  const f = fixture();
  for (const terms of ['a'.repeat(MAX_PEER_TERMS_BYTES), 'é'.repeat(MAX_PEER_TERMS_BYTES / 2)]) {
    f.envelope.body.terms = terms; assert.ok(parseCandidatePeerEnvelope(encoded(f)));
    f.envelope.body.terms += 'a'; assert.equal(parseCandidatePeerEnvelope(encoded(f)), null);
  }
  f.envelope.body.terms = '\u0000'.repeat(MAX_PEER_TERMS_BYTES);
  assert.equal(parseCandidatePeerEnvelope(encoded(f)), null, 'escaping still counts toward aggregate bytes');
  f.envelope.body.terms = '';
  assert.equal(parseCandidatePeerEnvelope(encoded(f)), null);
  const text = encoded(fixture());
  assert.ok(parseCandidatePeerEnvelope(text + ' '.repeat(MAX_PEER_ENVELOPE_BYTES - Buffer.byteLength(text))));
  assert.equal(parseCandidatePeerEnvelope(text + ' '.repeat(MAX_PEER_ENVELOPE_BYTES + 1 - Buffer.byteLength(text))), null);
});
test('authenticated conversation, locally reviewed terms and local registry domain cannot be supplied by peer', () => {
  for (const field of ['sender', 'recipient', 'ad']) {
    const f = fixture(); f.context[field] += 'x'; assert.equal(verify(f), null);
  }
  for (const [field, value] of [['chainId', '1'], ['verifyingContract', '0x' + '55'.repeat(20)]]) {
    const f = fixture(); f.domain = { ...f.domain, [field]: value }; assert.equal(verify(f), null);
  }
  const f = fixture('buyer'); f.envelope.body.revision = '2'; assert.equal(verify(f), null);
  const other = fixture(); other.terms = { ...other.terms, orderId: 'ef'.repeat(32) }; assert.equal(verify(other), null);
  let called = 0; Object.defineProperty(other.context, 'nowSeconds', { get() { called++; return '1699990000'; } });
  assert.equal(verify(other), null); assert.equal(called, 0);
});
test('current time, lifetime and every signature are checked after parsing', () => {
  for (const expiresAtSeconds of ['1699990000', '1699989999', '1699993601']) {
    const f = fixture(); f.envelope.expiresAtSeconds = expiresAtSeconds;
    assert.ok(parseCandidatePeerEnvelope(encoded(f))); assert.equal(verify(f), null);
  }
  for (const nowSeconds of ['01', '-1', '1.1', '18446744073709551616']) {
    const f = fixture(); f.context.nowSeconds = nowSeconds; assert.equal(verify(f), null);
  }
  for (const field of ['termsSignature', 'bindingSignature']) {
    const f = fixture(); f.envelope.body.acceptance[field] = '0x' + '00'.repeat(65);
    assert.ok(parseCandidatePeerEnvelope(encoded(f))); assert.equal(verify(f), null);
  }
});
test('unsupported negotiation types and invalid revisions remain unavailable', () => {
  for (const type of ['take-request', 'cancel', 'terms-reject', 'unknown']) {
    const f = fixture(); f.envelope.type = type; assert.equal(parseCandidatePeerEnvelope(encoded(f)), null);
  }
  for (const revision of ['0', '01', '18446744073709551616', 1]) {
    const f = fixture('buyer'); f.envelope.body.revision = revision; assert.equal(parseCandidatePeerEnvelope(encoded(f)), null);
  }
});
