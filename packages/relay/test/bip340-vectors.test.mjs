import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schnorr } from '@noble/curves/secp256k1.js';
// Existing independently authored bitcoin/bips vectors; provenance/hash is retained in crypto inventory.
test('relay Schnorr verifier agrees with all official positive and negative BIP340 vectors',()=>{
 const rows=readFileSync(new URL('../../identity/test/fixtures/bip340-test-vectors.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1);
 assert.ok(rows.length>=19);
 for(const row of rows){
  const [index,,pubkey,,message,signature,expected]=row.split(',');let valid=false;
  try{valid=schnorr.verify(Buffer.from(signature,'hex'),Buffer.from(message,'hex'),Buffer.from(pubkey,'hex'));}catch{valid=false;}
  assert.equal(valid,expected==='TRUE',`official BIP340 vector ${index}`);
 }
});
