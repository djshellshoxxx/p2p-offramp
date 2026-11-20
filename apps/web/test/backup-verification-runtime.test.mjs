import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EncryptedVaultService,EncryptedBackupService} from '../../../packages/storage/index.ts';
import {VaultStorageError} from '../../../packages/storage/src/idb-vault-store.ts';
import {createVaultWorkerEndpoint} from '../src/runtime/worker-endpoint.ts';
import {startAppServices} from '../src/app-services.ts';
import {parseRuntimeCommand} from '../../../packages/schemas/index.ts';
import {capturePendingMetadata} from '../src/runtime/pending-metadata.ts';
const fixture=JSON.parse(await readFile(new URL('../../../packages/storage/test/fixtures/vault-python-v1.json',import.meta.url)));
const clone=value=>structuredClone(value),val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const config={version:1,ReleaseEnabled:0,connectOrigins:[]};
class Store{
 rows=new Map([[fixture.envelope.profileId,clone(fixture.envelope)]]);writes=0;failure;
 async get(id){return clone(this.rows.get(id));}
 async listProfileIds(){return{profileIds:[...this.rows.keys()],truncated:false};}
 async add(envelope,options){options?.assertCurrent?.();if(this.rows.has(envelope.profileId))throw new VaultStorageError('ALREADY_EXISTS');this.rows.set(envelope.profileId,clone(envelope));this.writes++;}
 async compareAndSwap(before,after,options){options?.assertCurrent?.();if(this.failure)throw new VaultStorageError(this.failure);if(JSON.stringify(this.rows.get(before.profileId))!==JSON.stringify(before))throw new VaultStorageError('CONFLICT');this.rows.set(after.profileId,clone(after));this.writes++;}
 subscribeInvalidation(){return()=>{};}
}
function setup(){const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store),messages=[];const endpoint=createVaultWorkerEndpoint(message=>messages.push(clone(message)),{createServices:()=>({vault,backup})});let id=0;return{store,vault,backup,messages,endpoint,send:(operation,fields={},generation=0)=>endpoint.dispatch({version:1,requestId:++id,generation,operation,...fields})};}
const unlock=s=>s.send('unlock',{profileId:fixture.envelope.profileId,passphrase:fixture.passphrase});
const last=s=>s.messages.at(-1).result;

test('Worker verification fact is not granted by unlock/export and expires on selected mutation attempts',async()=>{
 const s=setup();try{
  await s.send('init',{config});await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.equal(last(s).error.code,'LOCKED');
  await unlock(s);await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.equal(val(last(s)).verification,null);
  await s.send('exportEncrypted',{profileId:fixture.envelope.profileId});const bytes=val(last(s)).bytes;
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.equal(val(last(s)).verification,null);
  await s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase});const receipt=val(last(s));assert.equal(receipt.scope,'complete-profile-v1');
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.deepEqual(val(last(s)).verification,receipt);
  s.store.failure='QUOTA_EXCEEDED';await s.send('saveTermsReview',{profileId:fixture.envelope.profileId,source:'file',bytes:new Uint8Array([1])});assert.equal(last(s).error.code,'QUOTA_EXCEEDED');
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.equal(val(last(s)).verification,null,'even uncertain/failed mutation attempts require explicit re-verification');
  s.store.failure=undefined;await s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase});val(last(s));
  await s.send('saveTermsReview',{profileId:fixture.envelope.profileId,source:'file',bytes:new Uint8Array([1])});val(last(s));
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.equal(val(last(s)).verification,null);
  await s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase});assert.equal(last(s).error.code,'CONFLICT');
  assert.equal(s.store.writes,1);assert.doesNotMatch(JSON.stringify(s.messages),/fixture only password|payload|sessionId|wrappedKey/);
 }finally{s.endpoint.dispose();}
});

test('a cross-tab commit prevents the Worker from reusing an older verification fact',async()=>{
 const s=setup(),other=new EncryptedVaultService(s.store,crypto,{lifecycle:false});try{
  await s.send('init',{config});await unlock(s);const bytes=await s.backup.export(fixture.envelope.profileId);
  await s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase});val(last(s));
  const session=val(await other.unlock(fixture.envelope.profileId,fixture.passphrase));
  val(await other.commit(session.sessionId,session.revision,[{op:'put',record:{id:'f'.repeat(32),kind:'preference',schemaVersion:77,payload:'e30'}}]));
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.equal(last(s).ok,false);assert.equal(s.messages.some(m=>m.kind==='locked'),true);
  await s.send('lock',{},1);await s.send('unlock',{profileId:fixture.envelope.profileId,passphrase:fixture.passphrase},1);
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId},1);assert.equal(val(last(s)).verification,null);
 }finally{other.dispose();s.endpoint.dispose();}
});

test('late successful verification is not published after lock or a new selection',async()=>{
 const s=setup();let release;const gate=new Promise(resolve=>release=resolve),original=s.vault.verifyBackup.bind(s.vault);let markStarted;const started=new Promise(resolve=>markStarted=resolve);
 s.vault.verifyBackup=async(...args)=>{const result=await original(...args);markStarted();await gate;return result;};
 try{
  await s.send('init',{config});await unlock(s);const bytes=await s.backup.export(fixture.envelope.profileId);
  const pending=s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase});await started;
  await s.send('lock',{},1);release();await pending;
  assert.equal(s.messages.some(m=>m.operation==='verifyBackup'&&m.result.ok),false);
  await s.send('unlock',{profileId:fixture.envelope.profileId,passphrase:fixture.passphrase},1);
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId},1);assert.equal(val(last(s)).verification,null);
 }finally{release?.();s.endpoint.dispose();}
});

let oldSecure;beforeEach(()=>{oldSecure=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});});afterEach(()=>{if(oldSecure)Object.defineProperty(globalThis,'isSecureContext',oldSecure);else delete globalThis.isSecureContext;});
class Port extends EventTarget{
 endpoint;sent=[];
 postMessage(value){const command=clone(value);this.sent.push(command.operation);queueMicrotask(()=>void this.endpoint.dispatch(command));}
 reply(message){queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:clone(message)})));}
 terminate(){this.endpoint.dispose();}
}
test('real facade verifies provided bytes and checks the Worker-owned revision without caching authority in UI state',async()=>{
 const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store),port=new Port();port.endpoint=createVaultWorkerEndpoint(m=>port.reply(m),{createServices:()=>({vault,backup})});const services=val(await startAppServices({createWorker:()=>port,lifecycle:false}));
 try{
  assert.equal((await services.verifyBackup(new Uint8Array([1]),fixture.passphrase)).error.code,'LOCKED');
  val(await services.unlock(fixture.envelope.profileId,fixture.passphrase));const before=services.selectionScope();
  assert.equal(val(await services.checkBackupVerification()).verification,null);const bytes=(await backup.export(fixture.envelope.profileId));
  const receipt=val(await services.verifyBackup(bytes,fixture.passphrase));assert.equal(receipt.profileId,services.profileId);assert.equal(val(await services.checkBackupVerification()).verification.revision,fixture.envelope.revision);
  val(await services.lock());assert.ok(services.selectionScope()>before);assert.equal((await services.checkBackupVerification()).error.code,'LOCKED');
  val(await services.unlock(fixture.envelope.profileId,fixture.passphrase));assert.equal(val(await services.checkBackupVerification()).verification,null,'reopening the same profile does not inherit proof');
 }finally{await services.dispose();}
});

test('pending metadata never retains verification file bytes or its passphrase',()=>{
 const command=parseRuntimeCommand({version:1,requestId:1,generation:0,operation:'verifyBackup',profileId:fixture.envelope.profileId,bytes:new Uint8Array([1]),passphrase:fixture.passphrase});
 assert.deepEqual(capturePendingMetadata(command),{operation:'verifyBackup',generation:0,profileId:fixture.envelope.profileId});assert.equal('bytes'in capturePendingMetadata(command),false);assert.equal('passphrase'in capturePendingMetadata(command),false);
});


test('fresh-key restore never transfers source verification to its new profile or makes the source file current there',async()=>{
 const s=setup();try{
  await s.send('init',{config});await unlock(s);const bytes=await s.backup.export(fixture.envelope.profileId);
  await s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase});const sourceReceipt=val(last(s));
  const destinationPass='fresh verification restore passphrase';await s.send('restore',{bytes,sourcePassphrase:fixture.passphrase,destinationPassphrase:destinationPass});const restored=val(last(s));
  assert.notEqual(restored.newProfileId,fixture.envelope.profileId);
  await s.send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.deepEqual(val(last(s)).verification,sourceReceipt,'unmodified source receipt remains narrow to the source');
  await s.send('unlock',{profileId:restored.newProfileId,passphrase:destinationPass});
  await s.send('checkBackupVerification',{profileId:restored.newProfileId});assert.equal(val(last(s)).verification,null,'restore and unlock are not backup verification');
  await s.send('verifyBackup',{profileId:restored.newProfileId,bytes,passphrase:fixture.passphrase});assert.equal(last(s).error.code,'CONFLICT');
  const destinationBytes=await s.backup.export(restored.newProfileId);
  await s.send('verifyBackup',{profileId:restored.newProfileId,bytes:destinationBytes,passphrase:destinationPass});const receipt=val(last(s));assert.equal(receipt.profileId,restored.newProfileId);assert.equal(receipt.revision,0);
  assert.equal(s.store.rows.size,2);assert.equal(s.store.writes,1,'verification never writes');
 }finally{s.endpoint.dispose();}
});

test('a typed but wrong-profile verification receipt closes the document runtime without granting a fact',async()=>{
 const receipt={profileId:'f'.repeat(32),revision:0,scope:'complete-profile-v1',envelopeSha256:'a'.repeat(64),backupSha256:'b'.repeat(64)};
 class ForgedPort extends EventTarget{
  terminated=0;
  postMessage(command){
   const base={version:1,requestId:command.requestId,generation:command.generation,operation:command.operation,kind:'response'};
   const value=command.operation==='unlock'?{state:'unlocked',handle:{id:'A'.repeat(43),generation:command.generation,purpose:'vault',profileId:fixture.envelope.profileId}}:command.operation==='verifyBackup'?receipt:{state:'locked',handle:null};
   queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:{...base,result:{ok:true,value}}})));
  }
  terminate(){this.terminated++;}
 }
 const port=new ForgedPort(),services=val(await startAppServices({createWorker:()=>port,lifecycle:false}));try{
  val(await services.unlock(fixture.envelope.profileId,fixture.passphrase));const result=await services.verifyBackup(new Uint8Array([1]),fixture.passphrase);assert.equal(result.ok,false);assert.equal(result.error.code,'PROTOCOL_ERROR');assert.equal(services.current.state,'locked');assert.equal(port.terminated,1);
 }finally{await services.dispose();}
});

test('Worker request expiry refuses a native verification that completed after its deadline',async()=>{
 let clock=0;const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store),messages=[];
 const original=vault.verifyBackup.bind(vault);vault.verifyBackup=async(...args)=>{const result=await original(...args);clock+=30000;return result;};
 const endpoint=createVaultWorkerEndpoint(message=>messages.push(clone(message)),{now:()=>clock,createServices:()=>({vault,backup})});let id=0;
 const send=(operation,fields={})=>endpoint.dispatch({version:1,requestId:++id,generation:0,operation,...fields});
 try{
  await send('init',{config});await send('unlock',{profileId:fixture.envelope.profileId,passphrase:fixture.passphrase});const bytes=await backup.export(fixture.envelope.profileId);
  await send('verifyBackup',{profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase});
  assert.equal(messages.some(message=>message.operation==='verifyBackup'&&message.result.ok),false);assert.equal(messages.at(-1).result.error.code,'TIMEOUT');assert.equal(messages.some(message=>message.kind==='locked'),true);
  await send('unlock',{profileId:fixture.envelope.profileId,passphrase:fixture.passphrase});await send('checkBackupVerification',{profileId:fixture.envelope.profileId});assert.equal(val(messages.at(-1).result).verification,null);
 }finally{endpoint.dispose();}
});

test('early BUSY and stale-generation replies clear endpoint-owned verification copies without touching caller bytes',async()=>{
 const s=setup();let release;const gate=new Promise(resolve=>release=resolve);s.vault.listProfiles=async()=>{await gate;return{ok:true,value:{profileIds:[],truncated:false}};};
 const input=new Uint8Array([7]),cleared=[],original=Uint8Array.prototype.fill;
 Uint8Array.prototype.fill=function(...args){if(this.byteLength===1&&this[0]===7&&args[0]===0)cleared.push(this);return Reflect.apply(original,this,args);};
 try{
  await s.send('init',{config});const pending=s.send('listProfiles');
  await s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes:input,passphrase:fixture.passphrase});assert.equal(last(s).error.code,'BUSY');
  await s.send('lock',{},1);
  await s.send('verifyBackup',{profileId:fixture.envelope.profileId,bytes:input,passphrase:fixture.passphrase},0);assert.equal(last(s).error.code,'CONFLICT');
  assert.equal(cleared.length,2);assert.ok(cleared.every(bytes=>bytes!==input&&bytes[0]===0));assert.equal(input[0],7);
  release();await pending;
 }finally{Uint8Array.prototype.fill=original;release?.();s.endpoint.dispose();}
});
