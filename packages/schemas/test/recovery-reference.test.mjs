import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRecoveryReferences, parseRecoveryReferences, parseRuntimeCommand, parseRuntimeMessage, encodeIntentPayload, RECOVERY_REFERENCE_PAGE_SIZE } from '../index.ts';
const profileId='a'.repeat(32), binding={chain:'evm',networkId:'evm:1',deploymentId:'escrow-v1',tradeId:'trade-1'};
const intent=(n,change={})=>({version:1,intentId:Buffer.alloc(32,n).toString('base64url'),binding,account:'0x'+'12'.repeat(20),action:'fund',state:'finalized',walletGeneration:0,expectedEscrowState:'absent',preparedRequest:'PRIVATE_CALLDATA_BANK_SECRET',submission:{chain:'evm',hash:'0x'+'12'.repeat(32),nonce:'7'},replacementOf:null,createdAt:0,updatedAt:0,...change});
const record=n=>({id:n.toString(16).padStart(32,'0'),kind:'journal',schemaVersion:1,payload:encodeIntentPayload(intent(n))});
const command=(extra={})=>({version:1,operation:'listRecoveryReferences',requestId:1,generation:0,profileId,offset:0,expectedRevision:null,...extra});
test('offline references are exact scalar projections and do not promote persisted terminal labels',()=>{
  const page=projectRecoveryReferences([record(1),{...record(2),schemaVersion:2},{...record(3),payload:'not-valid'},{...record(4),kind:'trade'}],0,3);
  assert.equal(page.authority,'unverified-offline-reference');assert.equal(page.unsupported,2);assert.equal(page.totalJournalRecords,3);assert.equal(page.items.length,1);
  assert.equal(page.items[0].storedState,'finalized');assert.equal(page.items[0].chainReference,'0x'+'12'.repeat(32));
  assert.doesNotMatch(JSON.stringify(page),/PRIVATE|preparedRequest|walletGeneration|replacementOf|signature|secretKey/);
  assert.equal(Object.isFrozen(page.items[0].binding),true);
  const solana=record(1);solana.payload=encodeIntentPayload(intent(1,{binding:{...binding,chain:'solana'},account:'1'.repeat(32),submission:{chain:'solana',signature:'1'.repeat(64),blockhash:'1'.repeat(32),lastValidBlockHeight:'99'}}));
  const sol=projectRecoveryReferences([solana],0,1);assert.equal(sol.items[0].chainReference,'1'.repeat(64));assert.equal(sol.items[0].nonce,null);assert.equal(sol.authority,'unverified-offline-reference');
});
test('bounded raw-record pagination counts unsupported entries without rewriting or losing cursor progress',()=>{
  const records=Array.from({length:66},(_,i)=>record(i+1)),before=JSON.stringify(records);records[0].schemaVersion=2;
  const first=projectRecoveryReferences(records,0,9),next=projectRecoveryReferences(records,64,9);
  assert.equal(first.items.length,63);assert.equal(first.unsupported,1);assert.equal(first.nextOffset,64);assert.equal(next.items.length,2);assert.equal(next.nextOffset,null);
  records[0].schemaVersion=1;assert.equal(JSON.stringify(records),before);assert.equal(RECOVERY_REFERENCE_PAGE_SIZE,64);
});
test('runtime command requires a revision on subsequent pages and rejects unknown fields/accessors/offsets',()=>{
  assert.equal(parseRuntimeCommand(command()).operation,'listRecoveryReferences');assert.equal(parseRuntimeCommand(command({offset:64,expectedRevision:9})).offset,64);
  for(const extra of [{offset:1},{offset:64},{offset:-64},{offset:10048},{expectedRevision:-1},{expectedRevision:'9'},{calldata:'SECRET'}])assert.throws(()=>parseRuntimeCommand(command(extra)));
  let read=false;const bad=command();Object.defineProperty(bad,'offset',{enumerable:true,get(){read=true;return 0;}});assert.throws(()=>parseRuntimeCommand(bad));assert.equal(read,false);
});
test('runtime response refuses authority promotion, arbitrary fields, oversized items and incoherent cursors',()=>{
  const page=projectRecoveryReferences([record(1)],0,0),message={version:1,requestId:1,generation:0,operation:'listRecoveryReferences',kind:'response',result:{ok:true,value:page}};
  assert.deepEqual(parseRuntimeMessage(message).result.value,page);
  for(const change of [{authority:'finalized'},{verified:true},{nextOffset:64},{unsupported:1},{items:Array(65).fill(page.items[0])}])assert.throws(()=>parseRecoveryReferences({...page,...change}));
  for(const change of [{preparedRequest:'SECRET'},{chainReference:'https://SECRET.invalid'},{storedState:'paid'},{nonce:'-1'}])assert.throws(()=>parseRecoveryReferences({...page,items:[{...page.items[0],...change}]}));
});
test('changing array length and item getters cannot exceed the fixed page bound or invoke getters',()=>{
  const item=projectRecoveryReferences([record(1)],0,0).items[0];let reads=0;
  const items=new Proxy(Array(65).fill(item),{get(target,key,receiver){if(key==='length'){reads++;return 64;}return Reflect.get(target,key,receiver);}});
  assert.throws(()=>parseRecoveryReferences({authority:'unverified-offline-reference',revision:0,offset:0,nextOffset:null,totalJournalRecords:64,unsupported:0,items}));
  assert.equal(reads,0);
  const one=[item];Object.defineProperty(one,'0',{get(){reads++;return item;},enumerable:true});
  assert.throws(()=>parseRecoveryReferences({authority:'unverified-offline-reference',revision:0,offset:0,nextOffset:null,totalJournalRecords:1,unsupported:0,items:one}));assert.equal(reads,0);
});
