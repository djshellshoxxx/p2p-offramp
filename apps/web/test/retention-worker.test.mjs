/** Synthetic native ports here verify Worker/CAS mechanics only; native qualification uses the browser/Anvil proof. */
import test,{beforeEach,afterEach} from 'node:test';
let priorSecure;beforeEach(()=>{priorSecure=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});});
afterEach(()=>{if(priorSecure)Object.defineProperty(globalThis,'isSecureContext',priorSecure);else delete globalThis.isSecureContext;});
import assert from 'node:assert/strict';
import {EncryptedVaultService,EncryptedBackupService} from '../../../packages/storage/index.ts';
import {encodeSavedReviewPayload,encodeBase64url} from '../../../packages/schemas/index.ts';
import {VaultStorageError} from '../../../packages/storage/src/idb-vault-store.ts';
import {createVaultWorkerEndpoint} from '../src/runtime/worker-endpoint.ts';
const pass='local retention worker fixture passphrase',clone=v=>structuredClone(v),id=n=>n.toString(16).padStart(32,'0');
const saved=n=>({id:id(n),kind:'trade',schemaVersion:1,payload:encodeSavedReviewPayload('file',new TextEncoder().encode(`private terms ${n}`))});
class Store{
 rows=new Map();writes=0;beforeWrite;afterWrite;
 async get(p){return clone(this.rows.get(p));}
 async listProfileIds(){return{profileIds:[...this.rows.keys()],truncated:false};}
 async add(row,options){options?.assertCurrent?.();this.rows.set(row.profileId,clone(row));this.writes++;}
 async compareAndSwap(expected,next,options){await this.beforeWrite?.();options?.assertCurrent?.();if(JSON.stringify(this.rows.get(expected.profileId))!==JSON.stringify(expected))throw new VaultStorageError('CONFLICT');this.rows.set(next.profileId,clone(next));this.writes++;this.afterWrite?.();}
 subscribeInvalidation(){return()=>{};}
}
async function setup(t,{records=[saved(1)],factory,now,wrapVault}={}){
 const store=new Store(),creator=new EncryptedVaultService(store,crypto,{lifecycle:false});let session=good(await creator.create(pass));
 for(let i=0;i<records.length;i+=256)session={...session,revision:good(await creator.commit(session.sessionId,session.revision,records.slice(i,i+256).map(record=>({op:'put',record}))))};
 creator.dispose();const vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),messages=[];let sequence=0,generation=0;
 const privateVault=wrapVault?wrapVault(vault):vault;
 const endpoint=createVaultWorkerEndpoint(message=>messages.push(clone(message)),{...(now?{now}:{}),createServices:()=>({vault:privateVault,backup:new EncryptedBackupService(store),...(factory?{createRetentionAuthority:session=>factory(session,privateVault)}:{})})});
 t.after(()=>endpoint.dispose());
 const send=async(operation,fields={})=>{const requestId=++sequence;if(operation==='lock')generation++;await endpoint.dispatch({version:1,requestId,generation,operation,...fields});return messages.find(message=>message.requestId===requestId)?.result;};
 good(await send('init',{config:{version:1,ReleaseEnabled:0,connectOrigins:[]}}));good(await send('unlock',{profileId:session.profileId,passphrase:pass}));
 return{store,vault,session,messages,endpoint,send,profileId:session.profileId};
}
function good(r){assert.equal(r?.ok,true,JSON.stringify(r));return r.value;}
function bad(r,code){assert.equal(r?.ok,false,JSON.stringify(r));assert.equal(r.error.code,code);}
const consent=preview=>({previewId:preview.previewId,expectedRevision:preview.revision,consentRevision:preview.revision,reviewed:true,logicalOnly:true,backupAndRemoteLimitsAcknowledged:true});
function syntheticFactory(){return{async reviewNative(scope){return{scope,safeRecordIds:scope.candidates.map(candidate=>candidate.record.id),current:()=>true,dispose(){}};},dispose(){}};}
test('offline preview never constructs native authority and absent native source protects every record',async t=>{
 let calls=0;const s=await setup(t,{factory:()=>{calls++;return syntheticFactory();}}),writes=s.store.writes;
 const preview=good(await s.send('planRetention',{profileId:s.profileId}));assert.equal(calls,0);assert.equal(preview.protectedCount,1);assert.equal(preview.reviewedDeleteCount,0);assert.equal(preview.nativeReviewAvailable,true);
 assert.doesNotMatch(JSON.stringify(preview),/payload|private terms|recordId|sessionId/);
 bad(await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(preview)}),'NATIVE_PROOF_REQUIRED');assert.equal(calls,0);assert.equal(s.store.writes,writes);
 const d=await setup(t);const native=good(await d.send('reviewRetention',{profileId:d.profileId}));assert.equal(native.nativeReviewAvailable,false);assert.equal(native.reviewedDeleteCount,0);assert.equal(native.protectedCount,1);
});
test('opaque Worker preview authorizes one explicit atomic selected-profile delete; copied metadata cannot mint a token',async t=>{
 const s=await setup(t,{factory:syntheticFactory}),writes=s.store.writes;
 const old=good(await s.send('reviewRetention',{profileId:s.profileId}));const current=good(await s.send('reviewRetention',{profileId:s.profileId}));assert.notEqual(old.previewId,current.previewId);
 bad(await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(old)}),'INVALID_INPUT');assert.equal(s.store.writes,writes);
 const preview=good(await s.send('reviewRetention',{profileId:s.profileId}));const receipt=good(await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(preview)}));
 assert.equal(receipt.deletedCount,1);assert.equal(receipt.revision,preview.revision+1);assert.equal(s.store.writes,writes+1);
 bad(await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(preview)}),'INVALID_INPUT');
 const check=good(await s.send('planRetention',{profileId:s.profileId}));assert.equal(check.protectedCount,0);
});
test('old saved-review deletion cannot bypass retention preview and consent or write any record',async t=>{
 const s=await setup(t,{factory:syntheticFactory}),writes=s.store.writes;
 const preview=good(await s.send('reviewRetention',{profileId:s.profileId}));bad(await s.send('deleteTermsReview',{profileId:s.profileId,recordId:id(1)}),'NATIVE_PROOF_REQUIRED');
 bad(await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(preview)}),'INVALID_INPUT');assert.equal(s.store.writes,writes);
 const list=good(await s.send('listTermsReviews',{profileId:s.profileId}));assert.equal(list.items.length,1);
});
test('known-purpose closure retains opaque identity/future data and never silently splits 257 deletions',async t=>{
 const protectedRecords=[{id:id(2),kind:'identity',schemaVersion:1,payload:encodeBase64url(new Uint8Array([1]))},{...saved(3),schemaVersion:2}];
 const s=await setup(t,{records:[saved(1),...protectedRecords],factory:syntheticFactory});const preview=good(await s.send('reviewRetention',{profileId:s.profileId}));assert.equal(preview.reviewedDeleteCount,1);assert.equal(preview.protectedCount,2);
 good(await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(preview)}));assert.equal(good(await s.send('planRetention',{profileId:s.profileId})).protectedCount,2);
 const large=await setup(t,{records:Array.from({length:257},(_,i)=>saved(i+1)),factory:syntheticFactory});const group=good(await large.send('reviewRetention',{profileId:large.profileId})),writes=large.store.writes;
 bad(await large.send('deleteReviewedRecords',{profileId:large.profileId,...consent(group)}),'LIMIT_EXCEEDED');assert.equal(large.store.writes,writes);
});
test('same-tab mutation and real second-vault CAS invalidate preview without erasing source',async t=>{
 for(const otherTab of [false,true]){
  const s=await setup(t,{factory:syntheticFactory}),preview=good(await s.send('reviewRetention',{profileId:s.profileId}));
  if(otherTab){const writer=new EncryptedVaultService(s.store,crypto,{lifecycle:false});const session=good(await writer.unlock(s.profileId,pass));good(await writer.commit(session.sessionId,session.revision,[{op:'put',record:saved(2)}]));writer.dispose();}
  else good(await s.send('saveTermsReview',{profileId:s.profileId,source:'file',bytes:new TextEncoder().encode('another local review')}));
  const writes=s.store.writes,result=await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(preview)});assert.equal(result.ok,false);assert.equal(s.store.writes,writes);
 }
});
test('lock revokes held native review and suppresses its late preview; durable deletion receipt survives late native lock',async t=>{
 let release,started;const ready=new Promise(r=>started=r);const s=await setup(t,{factory:()=>({async reviewNative(scope){started();await new Promise(r=>release=r);return{scope,safeRecordIds:[id(1)],current:()=>true,dispose(){}};},dispose(){}})});
 const writes=s.store.writes,pending=s.send('reviewRetention',{profileId:s.profileId});await ready;good(await s.send('lock'));release();await pending;assert.equal(s.store.writes,writes);assert.equal(s.messages.some(m=>m.operation==='reviewRetention'&&m.result?.ok),false);
 const durable=await setup(t,{factory:syntheticFactory}),preview=good(await durable.send('reviewRetention',{profileId:durable.profileId}));durable.store.afterWrite=()=>durable.vault.lockAll();
 const receipt=good(await durable.send('deleteReviewedRecords',{profileId:durable.profileId,...consent(preview)}));assert.equal(receipt.deletedCount,1);
 const fresh=new EncryptedVaultService(durable.store,crypto,{lifecycle:false});const session=good(await fresh.unlock(durable.profileId,pass));assert.equal(good(await fresh.list(session.sessionId)).length,0);fresh.dispose();
});

test('request expiry at final CAS blocks delete, while completed CAS still reports its durable count receipt',async t=>{
 for(const late of [false,true]){let now=0;const s=await setup(t,{factory:syntheticFactory,now:()=>now}),preview=good(await s.send('reviewRetention',{profileId:s.profileId})),writes=s.store.writes;
  if(late)s.store.afterWrite=()=>{now=30000;};else s.store.beforeWrite=()=>{now=30000;};
  const result=await s.send('deleteReviewedRecords',{profileId:s.profileId,...consent(preview)});
  if(late){assert.equal(good(result).deletedCount,1);assert.equal(s.store.writes,writes+1);}else{bad(result,'TIMEOUT');assert.equal(s.store.writes,writes);}
 }
});
test('returned native authority is disposed once before adoption on guard, bind and service capture failure, even if cleanup throws',async t=>{
 for(const where of ['guard','bind','capture'])for(const throwing of [false,true]){
  let armed=false,disposed=0;
  const s=await setup(t,{factory:(_session,vault)=>{armed=true;if(where==='guard')vault.lockAll();return{...syntheticFactory(),dispose(){disposed++;if(throwing)throw Error('PRIVATE cleanup');}};},wrapVault:vault=>new Proxy(vault,{get(target,name){
   if(armed&&where==='bind'&&name==='list')throw Error('PRIVATE bind');
   if(armed&&where==='capture'&&name==='captureSession')return()=>({ok:false,error:{code:'LOCKED',retryable:false,message:'PRIVATE capture'}});
   const value=Reflect.get(target,name);return typeof value==='function'?value.bind(target):value;
  }})});
  const writes=s.store.writes,result=await s.send('reviewRetention',{profileId:s.profileId});assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);assert.equal(disposed,1);assert.equal(s.store.writes,writes);
  armed=false;good(await s.send('status'));s.endpoint.dispose();assert.equal(disposed,1,'later shutdown must not redispose an unadopted authority');
 }
});
class Loopback extends EventTarget{
 constructor(store,factory){super();this.endpoint=createVaultWorkerEndpoint(message=>{const data=clone(message);this.transform?.(data);queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data})));},{createServices:()=>({vault:new EncryptedVaultService(store,crypto,{lifecycle:false}),backup:new EncryptedBackupService(store),createRetentionAuthority:factory})});}
 postMessage(command){queueMicrotask(()=>{void this.endpoint.dispatch(clone(command));});}
 terminate(){this.endpoint.dispose();}
}
test('actual facade binds previews and rejects hostile consent before getters or native deletion',async t=>{
 const {startAppServices}=await import('../src/app-services.ts');const store=new Store(),port=new Loopback(store,syntheticFactory),services=good(await startAppServices({createWorker:()=>port,lifecycle:false}));t.after(()=>services.dispose());
 good(await services.create(pass));good(await services.saveTermsReview('file',new TextEncoder().encode('private local terms')));
 assert.equal(good(await services.planRetention()).reviewedDeleteCount,0);const preview=good(await services.reviewRetention());assert.equal(preview.reviewedDeleteCount,1);
 let getters=0;const hostile=consent(preview);Object.defineProperty(hostile,'previewId',{get(){getters++;throw Error('PRIVATE consent');}});bad(await services.deleteReviewedRecords(hostile),'INVALID_INPUT');assert.equal(getters,0);
 assert.equal(good(await services.deleteReviewedRecords(consent(preview))).deletedCount,1);assert.equal(good(await services.listTermsReviews()).items.length,0);
});
test('a typed wrong-profile retention preview closes the facade and preserves encrypted records',async t=>{
 const {startAppServices}=await import('../src/app-services.ts');const store=new Store(),port=new Loopback(store,syntheticFactory),services=good(await startAppServices({createWorker:()=>port,lifecycle:false}));t.after(()=>services.dispose());
 const created=good(await services.create(pass));good(await services.saveTermsReview('file',new TextEncoder().encode('private local terms')));const source=JSON.stringify(store.rows.get(created.profileId));
 port.transform=message=>{if(message.operation==='planRetention'&&message.result?.ok)message.result.value.profileId='ff'.repeat(16);};
 bad(await services.planRetention(),'PROTOCOL_ERROR');assert.equal(services.current.state,'locked');assert.equal(JSON.stringify(store.rows.get(created.profileId)),source);
});
