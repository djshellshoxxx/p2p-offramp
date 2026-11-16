import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { evmTermsHash, verifyEoaAcceptance } from '../src/evm-terms.ts';

// Synthetic local-chain keys and fixtures only. This is neither independent
// cryptographic validation nor evidence of accepted fiat/payment settlement.
const scenario = JSON.parse(await readFile(
  new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8',
));
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
function sign(keyHex, digest) {
  const recovered = secp256k1.sign(bytes(digest), bytes(keyHex), {
    prehash: false, format: 'recovered', lowS: true,
  });
  return Uint8Array.from([...recovered.subarray(1), recovered[0] + 27]);
}

test('G16 synthetic buyer and seller accept only the same immutable EVM terms and deployment domain', () => {
  const domain = scenario.domain;
  for (const [kind, set] of Object.entries(scenario.sets)) {
    const terms = set.terms, digest = evmTermsHash(domain, terms);
    assert.equal(digest, set.expectedEvmTermsHash, kind);
    const seller = sign(scenario.testOnlyKeys.seller.privateKeyHex, digest);
    const buyer = sign(scenario.testOnlyKeys.buyer.privateKeyHex, digest);
    assert.equal(verifyEoaAcceptance(domain, terms, 'seller', seller), true, kind);
    assert.equal(verifyEoaAcceptance(domain, terms, 'buyer', buyer), true, kind);
    assert.equal(verifyEoaAcceptance(domain, terms, 'seller', buyer), false, kind);
    assert.equal(verifyEoaAcceptance(domain, terms, 'buyer', seller), false, kind);

    // Both parties must reject any replay with a changed network, contract,
    // immutable order, participant, asset, private agreement or time window.
    const changes = [
      ['networkId', 'other-local-evm'],
      ['deploymentId', 'escrow-other-v1'],
      ['orderId', 'cc'.repeat(32)],
      ['revision', '2'],
      ['seller', '0x' + '44'.repeat(20)],
      ['buyer', '0x' + '55'.repeat(20)],
      ['amountBaseUnits', (BigInt(terms.amountBaseUnits) + 1n).toString()],
      ['privateAgreementHash', 'dd'.repeat(32)],
      ['capabilitiesHash', 'bb'.repeat(32)],
      ['sellerNonce', 'ee'.repeat(32)],
      ['acceptBeforeSeconds', (BigInt(terms.acceptBeforeSeconds) - 1n).toString()],
      ['escrowExpirySeconds', (BigInt(terms.escrowExpirySeconds) + 1n).toString()],
    ];
    if (kind === 'erc20') changes.push(['asset', '0x' + '88'.repeat(20)]);
    for (const [field, next] of changes) {
      const altered = { ...terms, [field]: next };
      assert.notEqual(evmTermsHash(domain, altered), digest, `${kind}:${field}:digest`);
      assert.equal(verifyEoaAcceptance(domain, altered, 'seller', seller), false, `${kind}:${field}:seller`);
      assert.equal(verifyEoaAcceptance(domain, altered, 'buyer', buyer), false, `${kind}:${field}:buyer`);
    }
    for (const changedDomain of [
      { ...domain, chainId: (BigInt(domain.chainId) + 1n).toString() },
      { ...domain, verifyingContract: '0x' + '66'.repeat(20) },
    ]) {
      assert.notEqual(evmTermsHash(changedDomain, terms), digest, `${kind}:domain`);
      assert.equal(verifyEoaAcceptance(changedDomain, terms, 'seller', seller), false, `${kind}:domain:seller`);
      assert.equal(verifyEoaAcceptance(changedDomain, terms, 'buyer', buyer), false, `${kind}:domain:buyer`);
    }
  }
});
