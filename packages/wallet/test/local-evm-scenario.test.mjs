import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { evmTermsHash, verifyEoaAcceptance } from '../src/evm-terms.ts';
// SYNTHETIC, TEST-ONLY local scenario fixture (packages/domain/test/fixtures/local-evm-scenario). Keys are deterministic
// test-only values, never credentials. Not an independent golden vector: same authorship as the code under test.
const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const { domain, sets, testOnlyKeys } = scenario;
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'));
const sign = (keyHex, digestHex) => { const raw = secp256k1.sign(bytes(digestHex), bytes(keyHex), { prehash: false, format: 'recovered', lowS: true });
  return Uint8Array.from([...raw.subarray(1), raw[0] + 27]); };

test('local scenario EVM terms hashes equal the recorded values', () => {
  assert.equal(evmTermsHash(domain, sets.native.terms), '005201bb0d2410a9bf411023a96cfc57009fb52d8c7a69e9f71b511af3ce666a');
  assert.equal(evmTermsHash(domain, sets.erc20.terms), '9f5c68d4d66adafb7a96e298f82b880d4fa9bf6cb197ceea9c4bfb2a18c32524');
  for (const set of Object.values(sets)) assert.equal(evmTermsHash(domain, set.terms), set.expectedEvmTermsHash);
  assert.notEqual(sets.native.expectedEvmTermsHash, sets.erc20.expectedEvmTermsHash);
});
test('local scenario: seller test-key signature verifies as seller acceptance, not buyer; tampered amount fails', () => {
  assert.equal(testOnlyKeys.seller.address, sets.native.terms.seller); assert.equal(testOnlyKeys.buyer.address, sets.native.terms.buyer);
  for (const [name, set] of Object.entries(sets)) {
    const sellerSig = sign(testOnlyKeys.seller.privateKeyHex, set.expectedEvmTermsHash), buyerSig = sign(testOnlyKeys.buyer.privateKeyHex, set.expectedEvmTermsHash);
    assert.equal(verifyEoaAcceptance(domain, set.terms, 'seller', sellerSig), true, name);
    assert.equal(verifyEoaAcceptance(domain, set.terms, 'buyer', buyerSig), true, name);
    assert.equal(verifyEoaAcceptance(domain, set.terms, 'buyer', sellerSig), false, `${name}: seller sig is not buyer acceptance`);
    assert.equal(verifyEoaAcceptance(domain, { ...set.terms, amountBaseUnits: String(BigInt(set.terms.amountBaseUnits) + 1n) }, 'seller', sellerSig), false, `${name}: tampered amount`);
  }
  const crossSet = sign(testOnlyKeys.seller.privateKeyHex, sets.native.expectedEvmTermsHash);
  assert.equal(verifyEoaAcceptance(domain, sets.erc20.terms, 'seller', crossSet), false, 'signature for one set does not accept the other');
});
