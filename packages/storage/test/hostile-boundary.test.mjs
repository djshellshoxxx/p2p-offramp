import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {getEventListeners} from 'node:events';
import {EncryptedVaultService, VaultStorageError} from '../src/vault-service.ts';
import {EncryptedBackupService, BackupError} from '../src/backup-service.ts';
const id='1'.repeat(32), secret='PRIVATE_PROVIDER_DETAIL';
const poison=()=>new Proxy({},{getPrototypeOf(){throw Error(secret)}});
const storeFor=error=>({subscribeInvalidation:()=>()=>{},listProfileIds:async()=>{throw error},get:async()=>{throw error}});
const fixed=(result,code='STORAGE_UNAVAILABLE')=>{assert.equal(result.ok,false);assert.equal(result.error.code,code);assert.equal(typeof result.error.message,'string');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_DETAIL/);};
const rejected=(promise,code='STORAGE_UNAVAILABLE',original)=>assert.rejects(promise,error=>{assert.notEqual(error,original);assert.equal(error.code,code);assert.equal(typeof error.message,'string');assert.doesNotMatch(error.message,/PRIVATE_PROVIDER_DETAIL/);return true;});
function shadowed(){const controller=new AbortController();for(const key of ['aborted','addEventListener','removeEventListener'])Object.defineProperty(controller.signal,key,{get(){throw Error(secret)}});return controller;}

test('hostile store throws and code accessors produce fresh fixed diagnostics without invoking accessors',async()=>{
 const badCode=new VaultStorageError('CONFLICT');Object.defineProperty(badCode,'code',{get(){throw Error(secret)}});
 const unknownCode=new VaultStorageError('CONFLICT');Object.defineProperty(unknownCode,'code',{value:secret});
 const descriptorPoison=new Proxy(new VaultStorageError('CONFLICT'),{getOwnPropertyDescriptor(){throw Error(secret)}});
 const hostileBackup=new BackupError('CONFLICT');Object.defineProperty(hostileBackup,'message',{get(){throw Error(secret)}});
 for(const error of [poison(),badCode,unknownCode,descriptorPoison]){
  const store=storeFor(error),vault=new EncryptedVaultService(store,webcrypto,{lifecycle:false}),backup=new EncryptedBackupService(store,webcrypto);
  try{fixed(await vault.listProfiles());fixed(await vault.exportEncrypted(id));await rejected(backup.export(id),'STORAGE_UNAVAILABLE',error);}finally{vault.dispose();backup.dispose();}
 }
 const backup=new EncryptedBackupService(storeFor(hostileBackup),webcrypto);
 try{await rejected(backup.export(id),'CONFLICT',hostileBackup);}finally{backup.dispose();}
 const recognized=new VaultStorageError('QUOTA_EXCEEDED');recognized.message=secret;
 const vault=new EncryptedVaultService(storeFor(recognized),webcrypto,{lifecycle:false});
 try{fixed(await vault.listProfiles(),'QUOTA_EXCEEDED');}finally{vault.dispose();}
});

test('proxy signals reject with fixed diagnostics before consuming shared recovery capacity',async()=>{
 const vault=new EncryptedVaultService(storeFor(poison()),webcrypto,{lifecycle:false});
 const backup=new EncryptedBackupService({subscribeInvalidation:()=>()=>{},get:async()=>undefined},webcrypto);
 try{
  for(const signal of [poison(),{get aborted(){throw Error(secret)}},new Proxy(new AbortController().signal,{get(){throw Error(secret)}})]){
   fixed(await vault.listProfiles(signal),'INVALID_INPUT');await rejected(backup.export(id,signal),'INVALID_INPUT');
  }
  await rejected(backup.export(id),'NOT_FOUND');
 }finally{vault.dispose();backup.dispose();}
});

test('native signals ignore shadowed accessors and listener methods, drain slots and detach actual listeners',async()=>{
 const controller=shadowed(),signal=controller.signal;
 const backup=new EncryptedBackupService({subscribeInvalidation:()=>()=>{},get:async()=>undefined},webcrypto);
 const vault=new EncryptedVaultService({subscribeInvalidation:()=>()=>{},listProfileIds:async()=>({profileIds:[],truncated:false})},webcrypto,{lifecycle:false});
 try{
  await rejected(backup.export(id,signal),'NOT_FOUND');assert.equal(getEventListeners(signal,'abort').length,0);
  const result=await vault.listProfiles(signal);assert.equal(result.ok,true);
  await rejected(backup.export(id),'NOT_FOUND');
  controller.abort();await rejected(backup.export(id,signal),'CANCELLED');fixed(await vault.listProfiles(signal),'CANCELLED');
 }finally{vault.dispose();backup.dispose();}
});

test('shadowed native cancellation waits for actual store read to drain before releasing recovery capacity',async()=>{
 let finish,entered;const ready=new Promise(resolve=>entered=resolve),read=new Promise(resolve=>finish=resolve);
 const backup=new EncryptedBackupService({subscribeInvalidation:()=>()=>{},get:()=>{entered();return read}},webcrypto);
 const other=new EncryptedBackupService({subscribeInvalidation:()=>()=>{},get:async()=>undefined},webcrypto);
 const controller=shadowed();
 try{
  const pending=backup.export(id,controller.signal);await ready;assert.equal(getEventListeners(controller.signal,'abort').length,1);controller.abort();
  await rejected(other.export(id),'BUSY');finish(undefined);await rejected(pending,'CANCELLED');assert.equal(getEventListeners(controller.signal,'abort').length,0);await rejected(other.export(id),'NOT_FOUND');
 }finally{backup.dispose();other.dispose();}
});

test('hostile crypto provider errors are fixed and leave recovery capacity available',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/vault-python-v1.json',import.meta.url)));
 const provider={getRandomValues(){throw poison()},get subtle(){throw poison()}};
 const vault=new EncryptedVaultService({subscribeInvalidation:()=>()=>{}},provider,{lifecycle:false});
 const backup=new EncryptedBackupService({subscribeInvalidation:()=>()=>{},get:async()=>fixture.envelope},provider);
 try{
  const result=await vault.create('hostile boundary test passphrase');assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_DETAIL/);
  await rejected(backup.export(fixture.envelope.profileId),'UNSUPPORTED_ENVIRONMENT');await rejected(backup.export(fixture.envelope.profileId),'UNSUPPORTED_ENVIRONMENT');
 }finally{vault.dispose();backup.dispose();}
});

test('vault open, commit and verification use native signal controls and detach listeners on every exit',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/vault-python-v1.json',import.meta.url)));
 const rows=new Map([[fixture.envelope.profileId,fixture.envelope]]);
 let fail;
 const store={subscribeInvalidation:()=>()=>{},get:async key=>{if(fail)throw fail;return structuredClone(rows.get(key))},compareAndSwap:async(expected,next,options)=>{options.assertCurrent();rows.set(next.profileId,structuredClone(next))}};
 const vault=new EncryptedVaultService(store,webcrypto,{lifecycle:false}),backup=new EncryptedBackupService(store,webcrypto),controller=shadowed();
 try{
  const opened=await vault.unlock(fixture.envelope.profileId,fixture.passphrase,controller.signal);assert.equal(opened.ok,true);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  const bytes=await backup.export(fixture.envelope.profileId,controller.signal);
  const verified=await vault.verifyBackup(opened.value.sessionId,bytes,fixture.passphrase,controller.signal);assert.equal(verified.ok,true);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  assert.equal((await vault.commit(opened.value.sessionId,0,[],controller.signal)).ok,true);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  fail=poison();fixed(await vault.commit(opened.value.sessionId,0,[],controller.signal));assert.equal(getEventListeners(controller.signal,'abort').length,0);fixed(await vault.read(opened.value.sessionId,'2'.repeat(32)),'LOCKED');
  fail=undefined;await backup.export(fixture.envelope.profileId);
 }finally{vault.dispose();backup.dispose();}
});
