import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {schnorr,secp256k1} from '@noble/curves/secp256k1.js';
const api=await import('../src/noble-provider.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const bytes=hex=>Uint8Array.from(Buffer.from(hex,'hex'));
const csv=readFileSync(new URL('./fixtures/bip340-test-vectors.csv',import.meta.url));
const rows=csv.toString('utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
test('pinned official BIP340 fixture bytes have unchanged provenance',()=>{
 assert.equal(createHash('sha256').update(csv).digest('hex'),'34c9d1d9c3a88d524bc80778540dc43f8306ec249a7485293063c376db851c2d');assert.equal(rows.length,19);
});
test('local Noble provider derives every official secret/public KAT and rejects invalid scalars',async()=>{
 assert.equal(typeof api.createLocalNobleIdentityProvider,'function','missing provider');const provider=api.createLocalNobleIdentityProvider();let vectors=0;
 for(const row of rows){if(!row[1])continue;vectors++;assert.equal(await provider.publicKey(bytes(row[1])),row[2].toLowerCase());}
 assert.equal(vectors,8);
 for(const secret of [new Uint8Array(31),new Uint8Array(32),new Uint8Array(33),bytes('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),new Uint8Array(32).fill(255)]){
  assert.equal(secp256k1.utils.isValidSecretKey(secret),false);await assert.rejects(()=>provider.publicKey(secret),error=>error.code==='INVALID_IDENTITY');
 }
 const pair=await provider.generate();assert.equal(pair.secretKey.byteLength,32);assert.equal(pair.publicKey.length,64);assert.equal(pair.publicKey,await provider.publicKey(pair.secretKey));pair.secretKey.fill(0);
});
test('full official BIP340 signature verification diagnostic runs every row without filtering',()=>{
 for(const row of rows)assert.equal(schnorr.verify(bytes(row[5]),bytes(row[4]),bytes(row[2])),row[6]==='TRUE',`official vector${row[0]}`);
});
