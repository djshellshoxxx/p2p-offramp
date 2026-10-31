import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { domainSeparator, tradeTermsStructHash, evmTermsHash, verifyEoaAcceptance } from '../src/evm-terms.ts';
const {vectors} = JSON.parse(readFileSync(new URL('./fixtures/g16-independent.json',import.meta.url)));
assert.deepEqual(vectors.map(vector => vector.name).sort(), ['erc20', 'native'], 'both asset vectors must remain present');
const hex = bytes => Buffer.from(bytes).toString('hex');
for (const vector of vectors) {
 test(`independent ethers G16 ${vector.name}: domain, struct, digest and both signatures`, () => {
  assert.equal(hex(domainSeparator(vector.domain)),vector.domainSeparator);
  assert.equal(hex(tradeTermsStructHash(vector.terms)),vector.structHash);
  assert.equal(evmTermsHash(vector.domain,vector.terms),vector.digest);
  for (const role of ['seller','buyer']) {
   const signature = Buffer.from(vector.signatures[role].slice(2),'hex');
   assert.equal(verifyEoaAcceptance(vector.domain,vector.terms,role,signature),true);
   assert.equal(verifyEoaAcceptance(vector.domain,{...vector.terms,amountBaseUnits:'2'},role,signature),false);
   assert.equal(verifyEoaAcceptance({...vector.domain,chainId:'1'},vector.terms,role,signature),false);
   assert.equal(verifyEoaAcceptance({...vector.domain,verifyingContract:'0x'+'77'.repeat(20)},vector.terms,role,signature),false);
   assert.equal(verifyEoaAcceptance(vector.domain,vector.terms,role === 'seller' ? 'buyer' : 'seller',signature),false);
  }
 });
}
