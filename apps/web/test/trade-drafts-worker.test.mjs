import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { parseRuntimeCommand, parseRuntimeMessage, RuntimeBoundaryError } from '../../../packages/schemas/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { capturePendingMetadata } from '../src/runtime/pending-metadata.ts';
import { startAppServices } from '../src/app-services.ts';

const pass = 'public synthetic draft Worker passphrase', config = {version:1,ReleaseEnabled:0,connectOrigins:[]};
const defaults = () => ({networkId:'local-evm',deploymentId:'escrow-local-v1',assetId:'native',amountBaseUnits:'123456789',fiatCurrency:'USD',fiatMinorUnits:'100',fiatScale:2});
const consent = {reviewed:true,logicalOnly:true,backupAndRemoteLimitsAcknowledged:true};
const val = result => {assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const err = (result, code) => {assert.equal(result.ok,false);assert.equal(result.error.code,code);};
const live = []; afterEach(()=>{for(const item of live.splice(0))item.dispose();});
const clone = value => structuredClone(value);
class Store {
 rows=new Map();writes=0;
 async get(id){return clone(this.rows.get(id));}
 async listProfileIds(){return{profileIds:[...this.rows.keys()],truncated:false};}
 async add(row,options){options?.assertCurrent?.();this.rows.set(row.profileId,clone(row));this.writes++;}
 async compareAndSwap(expected,next,options){options?.assertCurrent?.();if(JSON.stringify(this.rows.get(expected.profileId))!==JSON.stringify(expected)){const e=Error('CONFLICT');e.code='CONFLICT';throw e;}this.rows.set(next.profileId,clone(next));this.writes++;}
 subscribeInvalidation(){return()=>{};}
}
async function setup(options={}){
 const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store);live.push(vault,backup);
 const messages=[];let sequence=0;const endpoint=createVaultWorkerEndpoint(message=>messages.push(clone(message)),{...options,createServices:()=>({vault,backup})});live.push(endpoint);
 const send=async(operation,fields={},generation=0)=>{await endpoint.dispatch({version:1,requestId:++sequence,generation,operation,...fields});return messages.at(-1);};
 await send('init',{config});const created=await send('create',{passphrase:pass});const profileId=val(created.result).handle.profileId;
 return {store,vault,backup,endpoint,messages,profileId,send};
}
test('strict draft IPC copies only bounded purpose fields and pending metadata retains no defaults',()=>{
 const input={version:1,requestId:1,generation:0,operation:'planTradeDraftChange',profileId:'a'.repeat(32),expectedRevision:0,change:{kind:'put-template',slot:0,defaults:defaults()}};
 const command=parseRuntimeCommand(input);input.change.defaults.amountBaseUnits='9';assert.equal(command.change.defaults.amountBaseUnits,'123456789');
 assert.deepEqual(capturePendingMetadata(command),{operation:'planTradeDraftChange',generation:0,profileId:'a'.repeat(32)});
 for(const patch of [{recordId:'b'.repeat(32)},{change:{kind:'put',record:{}}},{change:{kind:'put-template',slot:0,defaults:{...defaults(),seller:'old-party'}}}])assert.throws(()=>parseRuntimeCommand({...input,...patch}),RuntimeBoundaryError);
 assert.throws(()=>parseRuntimeCommand({version:1,requestId:1,generation:0,operation:'commitTradeDraftChange',profileId:'a'.repeat(32),previewId:'b'.repeat(32),expectedRevision:0,...consent,reviewed:false}),RuntimeBoundaryError);
 assert.throws(()=>parseRuntimeMessage({version:1,requestId:1,generation:0,operation:'loadTradeDraftLibrary',kind:'response',result:{ok:true,value:{revision:0,library:{format:'future',version:2,templates:[],repeatDefaultSlot:null}}}}),RuntimeBoundaryError);
});
test('real Worker loads, previews and commits encrypted templates and repeat defaults through native G02',async()=>{
 const s=await setup(),profileId=s.profileId;let state=val((await s.send('loadTradeDraftLibrary',{profileId})).result);
 assert.equal(state.library.templates.length,0);const preview=val((await s.send('planTradeDraftChange',{profileId,expectedRevision:state.revision,change:{kind:'put-template',slot:0,defaults:defaults()}})).result);
 assert.equal(preview.affectedTemplateCount,1);assert.equal(preview.logicalOnly,true);
 const receipt=val((await s.send('commitTradeDraftChange',{profileId,previewId:preview.previewId,expectedRevision:preview.revision,...consent})).result);
 assert.equal(receipt.changed,true);assert.equal(receipt.persisted,true);state=val((await s.send('loadTradeDraftLibrary',{profileId})).result);
 assert.deepEqual(state.library.templates[0].defaults,defaults());
 const repeat=val((await s.send('planTradeDraftChange',{profileId,expectedRevision:state.revision,change:{kind:'set-repeat-default',slot:0}})).result);
 val((await s.send('commitTradeDraftChange',{profileId,previewId:repeat.previewId,expectedRevision:repeat.revision,...consent})).result);
 assert.equal(val((await s.send('loadTradeDraftLibrary',{profileId})).result).library.repeatDefaultSlot,0);
 err((await s.send('commitTradeDraftChange',{profileId,previewId:repeat.previewId,expectedRevision:repeat.revision,...consent})).result,'NOT_FOUND');
});
test('wrong selection, stale revision, lock and five-minute preview age refuse without mutation',async()=>{
 let clock=0;const s=await setup({now:()=>clock}),profileId=s.profileId,writes=s.store.writes;
 err((await s.send('loadTradeDraftLibrary',{profileId:'f'.repeat(32)})).result,'LOCKED');
 err((await s.send('planTradeDraftChange',{profileId,expectedRevision:9,change:{kind:'put-template',slot:0,defaults:defaults()}})).result,'CONFLICT');
 const preview=val((await s.send('planTradeDraftChange',{profileId,expectedRevision:0,change:{kind:'put-template',slot:0,defaults:defaults()}})).result);
 clock=299999;await s.send('activity');clock=300000;
 err((await s.send('commitTradeDraftChange',{profileId,previewId:preview.previewId,expectedRevision:0,...consent})).result,'CONFLICT');assert.equal(s.store.writes,writes);
 await s.send('lock',{},1);err((await s.send('loadTradeDraftLibrary',{profileId},1)).result,'LOCKED');
});
test('a real current-backup fact becomes unavailable after a committed template mutation',async()=>{
 const s=await setup(),profileId=s.profileId;
 const exported=val((await s.send('exportEncrypted',{profileId})).result);
 val((await s.send('verifyBackup',{profileId,bytes:exported.bytes,passphrase:pass})).result);
 assert.notEqual(val((await s.send('checkBackupVerification',{profileId})).result).verification,null);
 const preview=val((await s.send('planTradeDraftChange',{profileId,expectedRevision:0,change:{kind:'put-template',slot:0,defaults:defaults()}})).result);
 val((await s.send('commitTradeDraftChange',{profileId,previewId:preview.previewId,expectedRevision:0,...consent})).result);
 assert.equal(val((await s.send('checkBackupVerification',{profileId})).result).verification,null);
});

test('actual AppServices/runtime/Worker composition scopes draft replies and survives native backup restore',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});
 let services;
 try{
  const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store);live.push(vault,backup);
  class Port extends EventTarget{postMessage(command){const copied=clone(command);queueMicrotask(()=>void endpoint.dispatch(copied));}terminate(){endpoint.dispose();}}
  const port=new Port(),endpoint=createVaultWorkerEndpoint(message=>queueMicrotask(()=>port.dispatchEvent(new MessageEvent('message',{data:clone(message)}))),{createServices:()=>({vault,backup})});live.push(endpoint);
  services=val(await startAppServices({createWorker:()=>port,lifecycle:false}));
  err(await services.loadTradeDraftLibrary(),'LOCKED');const created=val(await services.create(pass));const initial=val(await services.loadTradeDraftLibrary());
  const preview=val(await services.planTradeDraftChange(initial.revision,{kind:'put-template',slot:0,defaults:defaults()}));
  val(await services.commitTradeDraftChange(preview.previewId,preview.revision,consent));
  assert.deepEqual(val(await services.loadTradeDraftLibrary()).library.templates[0].defaults,defaults());
  const exported=val(await services.exportEncrypted(created.profileId));val(await services.lock());
  const restored=val(await services.restore(exported.bytes,pass,'fresh public draft runtime passphrase'));
  val(await services.unlock(restored.newProfileId,'fresh public draft runtime passphrase'));
  assert.deepEqual(val(await services.loadTradeDraftLibrary()).library.templates[0].defaults,defaults());
  assert.notEqual(restored.newProfileId,created.profileId);
 }finally{await services?.dispose();if(previous)Object.defineProperty(globalThis,'isSecureContext',previous);else delete globalThis.isSecureContext;}
});
