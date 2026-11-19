import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSolanaTerms } from '../../domain/index.ts';
import {
  decodeSolanaPeerAcceptance, decodeSolanaTermsConsent, solanaPeerAcceptanceRequest, solanaTermsConsentRequest,
  verifySolanaPeerAcceptance,
} from '../src/acceptance.ts';
import { MAX_OFFCHAIN_MESSAGE_BYTES } from '../src/offchain.ts';
import { boundTrade, contextFor, KEYS, NOW, proofFor, SEEDS, WALLETS } from './acceptance-support.mjs';
import { error, makeRegistry, ok } from './support.mjs';

const trade = boundTrade();
const code = result => (result.ok ? 'ok' : result.error.code);
const draft = (role, changes = {}) => ({ role, ownMessagingKey: KEYS[role],
  counterpartyMessagingKey: KEYS[role === 'seller' ? 'buyer' : 'seller'], notAfterSeconds: String(NOW + 300),
  ...changes });

test('signing requests: one terms consent for both parties, role-specific acceptances, ASCII, frozen', () => {
  const terms = ok(solanaTermsConsentRequest(trade));
  assert.deepEqual([...terms.requiredSigners], [WALLETS.seller, WALLETS.buyer]);
  assert.ok(Object.isFrozen(terms) && Object.isFrozen(terms.statement) && Object.isFrozen(terms.requiredSigners));
  for (const role of ['seller', 'buyer']) {
    const request = ok(solanaPeerAcceptanceRequest(trade, draft(role)));
    assert.deepEqual([...request.requiredSigners], [WALLETS[role]]);
    assert.equal(request.statement.wallet, WALLETS[role]);
    assert.equal(request.message[0], 0xff);
    assert.match(request.text, /^[\x20-\x7e\n]+$/);
    assert.ok(request.message.length <= MAX_OFFCHAIN_MESSAGE_BYTES);
    assert.deepEqual({ ...ok(decodeSolanaPeerAcceptance(request.message)) }, { ...request.statement });
  }
  assert.deepEqual({ ...ok(decodeSolanaTermsConsent(terms.message)) }, { ...terms.statement });
  // The raw G16 bytes start with ASCII 'p', never with the 0xff off-chain domain, so neither is mistaken for the other.
  assert.equal(encodeSolanaTerms(trade.terms)[0], 0x70);
});

test('signing requests refuse invalid drafts and unbound trades', () => {
  for (const changes of [{ role: 'arbiter' }, { ownMessagingKey: KEYS.buyer }, { notAfterSeconds: '0' },
    { notAfterSeconds: '01' }, { counterpartyMessagingKey: 'ff'.repeat(32) }]) {
    error(solanaPeerAcceptanceRequest(trade, draft('seller', changes)), 'INVALID_INPUT');
  }
  error(solanaPeerAcceptanceRequest(trade, { ...draft('seller'), extra: 1 }), 'INVALID_INPUT');
  error(solanaTermsConsentRequest({ ...trade }), 'INVALID_INPUT');
  error(solanaPeerAcceptanceRequest(structuredClone(trade), draft('seller')), 'INVALID_INPUT');
});

test('longest registry ids still fit the hardware-wallet message bound', () => {
  const network = 'n'.repeat(64), deployment = 'd'.repeat(64), base = makeRegistry();
  const registry = {
    network: id => (id === network ? { ...base.network('solana-localnet'), id: network } : null),
    deployment: (networkId, id) => (networkId === network && id === deployment ?
      { ...base.deployment('solana-localnet', 'escrow-v1'), id: deployment } : null),
  };
  const long = boundTrade('long', {}, registry, { networkId: network, deploymentId: deployment });
  const request = ok(solanaPeerAcceptanceRequest(long, draft('seller')));
  assert.ok(request.message.length <= MAX_OFFCHAIN_MESSAGE_BYTES, String(request.message.length));
  assert.ok(ok(solanaTermsConsentRequest(long)).message.length <= MAX_OFFCHAIN_MESSAGE_BYTES);
  assert.equal(code(verifySolanaPeerAcceptance(long, contextFor('seller'), proofFor(long, 'seller'))), 'ok');
});

test('verification is candidate-only, holds no signature bytes and leaves caller buffers untouched', () => {
  const proof = proofFor(trade, 'buyer');
  const before = [new Uint8Array(proof.termsSignature), new Uint8Array(proof.acceptanceSignature)];
  const verified = ok(verifySolanaPeerAcceptance(trade, contextFor('buyer'), proof));
  assert.deepEqual([proof.termsSignature, proof.acceptanceSignature], before);
  assert.equal(verified.candidateOnly, true);
  assert.equal(verified.economicPreparationAllowed, false);
  assert.ok(Object.isFrozen(verified) && Object.isFrozen(verified.statement));
  const json = JSON.stringify(verified), hex = bytes => Buffer.from(bytes).toString('hex');
  assert.ok(!json.includes(hex(before[0])) && !json.includes(hex(before[1])));
  assert.doesNotMatch(json, /Signature/);
});

test('no downgrade: a terms signature alone, or reused as the acceptance, is never a peer acceptance', () => {
  const proof = proofFor(trade, 'seller');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), { termsSignature: proof.termsSignature }),
    'INVALID_INPUT');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'),
    { ...proof, acceptanceSignature: proof.termsSignature }), 'UNAUTHORIZED');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), { ...proof, acceptanceSignature: undefined }),
    'INVALID_INPUT');
});

test('unknown fields, accessors and proxies fail closed without invoking foreign code', () => {
  const proof = proofFor(trade, 'seller');
  let calls = 0;
  const getter = { ...proof };
  Object.defineProperty(getter, 'statement', { enumerable: true, get() { calls++; return proof.statement; } });
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), getter), 'INVALID_INPUT');
  const trapped = new Proxy(proof, { get(target, key) { calls++; return Reflect.get(target, key); } });
  assert.equal(code(verifySolanaPeerAcceptance(trade, contextFor('seller'), trapped)), 'ok');
  assert.equal(calls, 0);
  error(verifySolanaPeerAcceptance(trade, { ...contextFor('seller'), extra: 1 }, proof), 'INVALID_INPUT');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), { ...proof, extra: 1 }), 'INVALID_INPUT');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), { ...proof, statement: { ...proof.statement, x: 1 } }),
    'INVALID_INPUT');
  error(verifySolanaPeerAcceptance({ ...trade }, contextFor('seller'), proof), 'INVALID_INPUT');
  class Fake extends Uint8Array { get length() { return 64; } }
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), { ...proof, termsSignature: new Fake(65) }),
    'INVALID_INPUT');
});

test('deadline is the earliest of notAfter, acceptBefore and the envelope expiry, exclusive', () => {
  const proof = proofFor(trade, 'seller', { notAfterSeconds: String(NOW + 900) });
  const at = (now, envelope = NOW + 3600) => code(verifySolanaPeerAcceptance(trade,
    contextFor('seller', { nowSeconds: String(now), envelopeExpiresAtSeconds: String(envelope) }), proof));
  assert.equal(at(NOW + 599), 'ok');
  assert.equal(at(NOW + 600), 'EXPIRED');
  assert.equal(at(NOW + 99, NOW + 100), 'ok');
  assert.equal(at(NOW + 100, NOW + 100), 'EXPIRED');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller', { envelopeExpiresAtSeconds: '0' }), proof),
    'INVALID_INPUT');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller', { nowSeconds: '1e9' }), proof), 'INVALID_INPUT');
});

test('a wallet signing for the other role, or another wallet, is refused', () => {
  error(verifySolanaPeerAcceptance(trade, contextFor('buyer'), proofFor(trade, 'buyer', {}, SEEDS.seller)),
    'UNAUTHORIZED');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), proofFor(trade, 'seller', {}, SEEDS.mallory)),
    'UNAUTHORIZED');
  const other = boundTrade('other');
  error(verifySolanaPeerAcceptance(trade, contextFor('seller'), proofFor(other, 'seller')), 'UNAUTHORIZED');
});

test('decoders refuse non-byte inputs with fixed codes', () => {
  for (const input of [undefined, 'bytes', [0xff], new Proxy(new Uint8Array(60), {})]) {
    error(decodeSolanaPeerAcceptance(input), 'INVALID_INPUT');
    error(decodeSolanaTermsConsent(input), 'INVALID_INPUT');
  }
});
