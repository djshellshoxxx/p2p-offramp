// Frozen D1 version 2 carrier vectors (viem 2.57.10 + @noble/curves 2.4.0 generator; see peer-acceptance-v2-README.md),
// recomputed with this repository's digest, binding, verifier and envelope code. Synthetic keys; no approval implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../../domain/index.ts';
import { parseEnvelopeV2, encodeEnvelopeV2 } from '../../exchange/index.ts';
import { domainSeparator, evmTermsHash, keccak256, tradeTermsStructHash } from '../src/evm-terms.ts';
import { PEER_ACCEPTANCE_TYPE, peerAcceptanceHash, verifyEoaPeerAcceptance } from '../src/evm-peer-acceptance.ts';
import { verifyCandidatePeerEnvelope } from '../src/evm-peer-envelope.ts';

const FROZEN_SHA256 = '8d94487aae2243eaca1b812306a6a2ba938ef833dec2fc62b3c14b70c544fe77';
const bytes = await readFile(new URL('./fixtures/peer-acceptance-v2-carrier.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));
const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const registry = new RegistryService();
assert.equal((await registry.load(new Uint8Array(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url))), scenario.registrySha256)).ok, true);
const hex = value => Buffer.from(value).toString('hex'), sig = value => new Uint8Array(Buffer.from(value.slice(2), 'hex'));

test('the v2 carrier fixture is frozen and was produced by the pinned generator from the scenario', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), FROZEN_SHA256);
  assert.deepEqual(fixture.generator, { script: 'packages/wallet/test/fixtures/peer-acceptance-v2-generate.mjs', viem: '2.57.10', nobleCurves: '2.4.0' });
  assert.deepEqual(fixture.terms, scenario.sets.native.terms); assert.deepEqual(fixture.domain, scenario.domain);
  for (const envelope of fixture.envelopes) assert.equal(createHash('sha256').update(envelope.text).digest('hex'), envelope.sha256);
});
test('repository EIP-712 code reproduces every frozen intermediate value and both statements verify', () => {
  assert.equal(hex(domainSeparator(fixture.domain)), fixture.domainSeparator);
  assert.equal(hex(tradeTermsStructHash(fixture.terms)), fixture.tradeTermsStructHash);
  assert.equal(evmTermsHash(fixture.domain, fixture.terms), fixture.termsHash);
  assert.equal(hex(keccak256(new TextEncoder().encode(PEER_ACCEPTANCE_TYPE))), fixture.peerAcceptanceTypeHash);
  for (const statement of fixture.statements) {
    assert.equal(peerAcceptanceHash(fixture.domain, statement.binding), statement.digest);
    const context = { role: statement.role, ownMessagingKey: statement.binding.ownMessagingKey, counterpartyMessagingKey: statement.binding.counterpartyMessagingKey,
      nowSeconds: '1699990000', envelopeExpiresAtSeconds: '1699990900' };
    const verified = verifyEoaPeerAcceptance(registry, fixture.domain, fixture.terms, context,
      { binding: statement.binding, termsSignature: sig(statement.termsSignature), bindingSignature: sig(statement.bindingSignature) });
    assert.equal(verified?.termsHash, fixture.termsHash); assert.equal(verified.bindingHash, statement.digest);
  }
  // The buyer statement names the seller's key as counterparty and vice versa (reciprocal bindings).
  const [seller, buyer] = fixture.statements;
  assert.equal(seller.binding.ownMessagingKey, buyer.binding.counterpartyMessagingKey);
  assert.equal(buyer.binding.ownMessagingKey, seller.binding.counterpartyMessagingKey);
});
test('both frozen envelopes round-trip byte-for-byte through the exchange v2 parser and encoder and verify as a carrier', () => {
  for (const envelope of fixture.envelopes) {
    const parsed = parseEnvelopeV2(envelope.text);
    assert.ok(parsed, envelope.type); assert.equal(parsed.type, envelope.type);
    assert.equal(encodeEnvelopeV2(parsed), envelope.text, 'canonical field order');
    const verified = verifyCandidatePeerEnvelope(registry, fixture.domain, fixture.terms,
      { sender: parsed.sender, recipient: parsed.recipient, ad: parsed.ad, nowSeconds: '1699990000' }, envelope.text);
    assert.equal(verified?.termsHash, fixture.termsHash);
  }
  const offer = parseEnvelopeV2(fixture.envelopes[0].text);
  assert.equal(offer.body.terms, JSON.stringify({ format: 'p2p-offramp/local-terms-review/v1', terms: fixture.terms, privateAgreement: scenario.sets.native.privateAgreementInput }));
});
