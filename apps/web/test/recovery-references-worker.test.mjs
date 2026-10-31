import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { encodeIntentPayload } from '../../../packages/schemas/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
const live=[];afterEach(()=>live.splice(0).forEach(value=>value.dispose()));
const pass='local private recovery fixture passphrase',clone=structuredClone,config={version:1,ReleaseEnabled:0,connectOrigins:[]};
const good=value=>{assert.equal(value.ok,true,JSON.stringify(value));return value.value;};
const intent=n=>({version:1,intentId:Buffer.alloc(32,n).toString('base64url'),binding:{chain:'evm',networkId:'evm:1',deploymentId:'escrow-v1',tradeId:'trade-'+n},account:'0x'+'12'.repeat(20),action:'fund',state:n===1?'finalized':'broadcast-unknown',walletGeneration:0,expectedEscrowState:'absent',preparedRequest:'PRIVATE_CALLDATA_BANK_SECRET',submission:{chain:'evm',hash:null,nonce:String(n)},replacementOf:null,createdAt:0,updatedAt:0});
async function setup(count=3){
  const rows=new Map();let writes=0,holdList;
  const store={get:async id=>clone(rows.get(id)),listProfileIds:async()=>({profileIds:[...rows.keys()],truncated:false}),add:async(row,o)=>{o?.assertCurrent?.();rows.set(row.profileId,clone(row));writes++;},
    compareAndSwap:async(expected,next,o)=>{o?.assertCurrent?.();if(JSON.stringify(rows.get(expected.profileId))!==JSON.stringify(expected))throw Error('CONFLICT');rows.set(next.profileId,clone(next));writes++;},subscribeInvalidation:()=>()=>{}};
  const seed=new EncryptedVaultService(store,crypto,{lifecycle:false});live.push(seed);let session=good(await seed.create(pass));
  const mutations=Array.from({length:count},(_,i)=>({op:'put',record:{id:(i+1).toString(16).padStart(32,'0'),kind:'journal',schemaVersion:i===2?2:1,payload:encodeIntentPayload(intent(i+1))}}));
  if(count)good(await seed.commit(session.sessionId,session.revision,mutations));
  seed.lockAll();
  const vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store);live.push(vault,backup);
  const wrapped=new Proxy(vault,{get(target,key){if(key==='list')return async(...args)=>{await holdList?.();return target.list(...args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  const messages=[];let sequence=0;const endpoint=createVaultWorkerEndpoint(message=>messages.push(clone(message)),{createServices:()=>({vault:wrapped,backup})});live.push(endpoint);
  const send=(operation,fields={},generation=0)=>endpoint.dispatch({version:1,requestId:++sequence,generation,operation,...fields});
  await send('init',{config});
  return{rows,store,seed,session,vault,backup,endpoint,messages,send,last:()=>messages.at(-1),writes:()=>writes,hold:fn=>{holdList=fn;}};
}
test('selected encrypted profile exposes only unverified scalar recovery references with zero writes',async()=>{
  const s=await setup();const before=JSON.stringify([...s.rows]),writes=s.writes(),profileId=s.session.profileId;
  await s.send('listRecoveryReferences',{profileId,offset:0,expectedRevision:null});assert.equal(s.last().result.error.code,'LOCKED');
  await s.send('unlock',{profileId,passphrase:pass});
  await s.send('listRecoveryReferences',{profileId:'f'.repeat(32),offset:0,expectedRevision:null});assert.equal(s.last().result.error.code,'LOCKED');
  await s.send('listRecoveryReferences',{profileId,offset:0,expectedRevision:null});const page=good(s.last().result);
  assert.equal(page.items.length,2);assert.equal(page.unsupported,1);assert.equal(page.authority,'unverified-offline-reference');assert.equal(page.items[0].storedState,'finalized');
  assert.doesNotMatch(JSON.stringify(s.messages),/PRIVATE|preparedRequest|walletGeneration|replacementOf|secretKey/);
  assert.equal(JSON.stringify([...s.rows]),before);assert.equal(s.writes(),writes);
});
test('revision-pinned pages refuse a changed encrypted snapshot and malformed offsets stay readonly',async()=>{
  const s=await setup(66),profileId=s.session.profileId;await s.send('unlock',{profileId,passphrase:pass});
  await s.send('listRecoveryReferences',{profileId,offset:0,expectedRevision:null});const page=good(s.last().result);assert.equal(page.nextOffset,64);
  await s.send('listRecoveryReferences',{profileId,offset:64,expectedRevision:page.revision});assert.equal(good(s.last().result).items.length,2);
  const other=new EncryptedVaultService(s.store,crypto,{lifecycle:false});live.push(other);const current=good(await other.unlock(profileId,pass));good(await other.commit(current.sessionId,current.revision,[{op:'put',record:{id:'f'.repeat(32),kind:'preference',schemaVersion:1,payload:'AA'}}]));
  await s.send('listRecoveryReferences',{profileId,offset:64,expectedRevision:page.revision});assert.equal(s.last().result.error.code,'CONFLICT');
  await s.send('unlock',{profileId,passphrase:pass});const writes=s.writes();
  await s.send('listRecoveryReferences',{profileId,offset:64,expectedRevision:page.revision});assert.equal(s.last().result.error.code,'CONFLICT');
  await s.send('listRecoveryReferences',{profileId,offset:128,expectedRevision:null});assert.equal(s.last().kind,'closed');assert.equal(s.writes(),writes);
});
test('lock suppresses a held recovery read, and fresh-key backup restore remains entirely unverified',async()=>{
  const s=await setup(),profileId=s.session.profileId;await s.send('unlock',{profileId,passphrase:pass});
  let entered,release;const started=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});s.hold(()=>{entered();return held;});
  const pending=s.send('listRecoveryReferences',{profileId,offset:0,expectedRevision:null});await started;await s.send('lock',{},1);release();await pending;
  assert.equal(s.messages.filter(message=>message.operation==='listRecoveryReferences').length,0);
  s.hold(undefined);const exported=await s.backup.exportWithStatus(profileId),restored=await s.backup.restore(exported.bytes,pass,pass);
  assert.notEqual(restored.newProfileId,profileId);assert.ok(s.rows.has(profileId));await s.send('unlock',{profileId:restored.newProfileId,passphrase:pass},1);
  await s.send('listRecoveryReferences',{profileId:restored.newProfileId,offset:0,expectedRevision:null},1);const value=good(s.last().result);
  assert.equal(value.authority,'unverified-offline-reference');assert.equal(value.revision,0);assert.equal(value.items[0].storedState,'finalized');assert.equal(value.unsupported,1);
});
