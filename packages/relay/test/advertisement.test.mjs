import test from 'node:test';
import assert from 'node:assert/strict';
import { schnorr } from '@noble/curves/secp256k1.js';
import { AdvertisementBook, advertisementEventId, validateAdvertisement } from '../src/advertisement.ts';
const key=new Uint8Array(32);key[31]=1;
const hex=bytes=>Buffer.from(bytes).toString('hex');
const pubkey=hex(schnorr.getPublicKey(key)),encode=value=>new TextEncoder().encode(JSON.stringify(value));
const ad={app:'p2p-offramp',v:1,orderId:'a'.repeat(64),revision:1,networkId:'local-evm',assetId:'native',amount:'1000000000000000000',currency:'USD',railClass:'manual',maker:pubkey,expiresAtSeconds:'2000',termsDigest:'b'.repeat(64)};
export function event(overrides={},eventOverrides={}){
 const value={...ad,...overrides};const raw={pubkey,created_at:1000,kind:30078,tags:[['d',`p2p-offramp:v1:${value.orderId}`],['expiration',value.expiresAtSeconds]],content:JSON.stringify(value),...eventOverrides};
 const id=advertisementEventId(raw);return {...raw,id,sig:hex(schnorr.sign(Buffer.from(id,'hex'),key,new Uint8Array(32)))};
}
test('native NIP01 signature binds exact G19 fields and public metadata; unknown time/expiry fail closed',()=>{
 const valid=event();const result=validateAdvertisement(encode(valid),1000n);assert.equal(result.ok,true);assert.deepEqual(result.value.ad,ad);
 assert.equal(validateAdvertisement(encode(valid),null).code,'TIME_UNKNOWN');assert.equal(validateAdvertisement(encode(valid),2000n).code,'EXPIRED');
 assert.equal(validateAdvertisement(encode({...valid,content:valid.content.replace('1000000000000000000','2')}),1000n).code,'INVALID_SIGNATURE');
 assert.equal(validateAdvertisement(encode({...valid,sig:'0'.repeat(128)}),1000n).ok,false);
 for(const malformed of [event({bankAccount:'private'}),event({maker:'c'.repeat(64)}),event({amount:'01'}),event({amount:'0'}),event({revision:0}),event({expiresAtSeconds:'4601'}),event({}, {created_at:1001}),event({}, {kind:1}),event({}, {tags:[['d','wrong'],['expiration','2000']]})])assert.equal(validateAdvertisement(encode(malformed),1000n).ok,false);
 assert.equal(validateAdvertisement(new Uint8Array(65537),1000n).code,'LIMIT_EXCEEDED');
 assert.equal(validateAdvertisement(new TextEncoder().encode('{"id":"a","id":"b"}'),1000n).ok,false);
 assert.equal(validateAdvertisement(new Proxy(new Uint8Array(),{}),1000n).ok,false);
});
test('book rejects stale revisions, retains equivocation until newer revision, and prunes expiry',()=>{
 const book=new AdvertisementBook(),one=event();assert.equal(book.ingest(encode(one),1000n).value,'accepted');assert.equal(book.ingest(encode(one),1000n).value,'duplicate');
 assert.equal(book.ingest(encode(event({amount:'2'})),1000n).value,'conflicted');assert.equal(book.snapshot(1000n)[0].conflicted,true);
 assert.equal(book.ingest(encode(event({revision:2})),1000n).value,'accepted');assert.equal(book.snapshot(1000n)[0].conflicted,false);
 assert.equal(book.ingest(encode(event({revision:1,amount:'3'})),1000n).value,'stale');assert.equal(book.snapshot(null).length,0);assert.equal(book.snapshot(2000n).length,0);
});
test('book bounds retained orders and dedup IDs under authenticated flood',()=>{
 const book=new AdvertisementBook();
 for(let index=0;index<4097;index++){
  const bytes=encode(event({orderId:(index%1001).toString(16).padStart(64,'0'),revision:Math.floor(index/1001)+1}));
  assert.equal(book.ingest(bytes,1000n).ok,true);
 }
 assert.equal(book.retainedOrders,1000);assert.equal(book.dedupIds,4096);book.clear();assert.equal(book.retainedOrders,0);assert.equal(book.dedupIds,0);
});
