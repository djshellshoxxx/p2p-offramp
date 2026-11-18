import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {EncryptedVaultService} from '../src/vault-service.ts';
import {EncryptedBackupService} from '../src/backup-service.ts';
import {VaultStorageError} from '../src/idb-vault-store.ts';
import {claimRecoverySlot} from '../src/recovery-slot.ts';
import {encodeBackup,canonicalEnvelopeBytes,MAX_BACKUP_BYTES} from '../../schemas/index.ts';
const fixture=JSON.parse(await readFile(new URL('./fixtures/vault-python-v1.json',import.meta.url)));
const clone=value=>structuredClone(value),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytesFor=(envelope=fixture.envelope)=>encodeBackup({format:'p2p-offramp-backup',version:1,envelope,checksum:sha(canonicalEnvelopeBytes(envelope))});
const value=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const error=(result,code)=>{assert.equal(result.ok,false);assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/SECRET|fixture only password|PRIVATE/);};
class Store {
 rows=new Map([[fixture.envelope.profileId,clone(fixture.envelope)]]);writes=0;beforeGet;
 async get(id){await this.beforeGet?.();return clone(this.rows.get(id));}
 async compareAndSwap(before,after,options){options?.assertCurrent?.();if(JSON.stringify(this.rows.get(before.profileId))!==JSON.stringify(before))throw new VaultStorageError('CONFLICT');this.rows.set(after.profileId,clone(after));this.writes++;}
 async add(envelope,options){options?.assertCurrent?.();this.rows.set(envelope.profileId,clone(envelope));this.writes++;}
 subscribeInvalidation(){return()=>{};}
}
function provider(hook={}){let derivations=0;return{get derivations(){return derivations;},provider:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto),subtle:new Proxy(webcrypto.subtle,{get(target,name){if(name==='deriveKey')return async(...args)=>{derivations++;await hook.derive?.();return target.deriveKey(...args);};const member=Reflect.get(target,name);return typeof member==='function'?member.bind(target):member;}})}};}
async function setup(hook={}){const store=new Store(),spy=provider(hook),vault=new EncryptedVaultService(store,spy.provider,{lifecycle:false}),session=value(await vault.unlock(fixture.envelope.profileId,fixture.passphrase));return{store,spy,vault,session};}

test('verification authenticates the exact complete current profile without a write or private reply',async()=>{
 const s=await setup();try{
  assert.equal(typeof s.vault.verifyBackup,'function','missing substantive current-backup verification');
  const bytes=bytesFor(),before=JSON.stringify(s.store.rows.get(s.session.profileId));
  const receipt=value(await s.vault.verifyBackup(s.session.sessionId,bytes,fixture.passphrase));
  assert.deepEqual(receipt,{profileId:s.session.profileId,revision:fixture.envelope.revision,scope:'complete-profile-v1',envelopeSha256:sha(canonicalEnvelopeBytes(fixture.envelope)),backupSha256:sha(bytes)});
  assert.equal(s.spy.derivations,2,'the supplied file passphrase is independently derived after unlock');
  assert.equal(s.store.writes,0);assert.equal(JSON.stringify(s.store.rows.get(s.session.profileId)),before);
  assert.doesNotMatch(JSON.stringify(receipt),/records|payload|ciphertext|sessionId|keyId|passphrase/);
 }finally{s.vault.dispose();}
});

test('public-invalid, wrong-profile and stale files fail before a KDF and cannot mutate records',async()=>{
 const s=await setup();try{
  const badChecksum=JSON.parse(new TextDecoder().decode(bytesFor()));badChecksum.checksum='0'.repeat(64);
  const other=clone(fixture.envelope);other.profileId='f'.repeat(32);
  for(const [bytes,code]of [[new Uint8Array(MAX_BACKUP_BYTES+1),'LIMIT_EXCEEDED'],[new TextEncoder().encode('{"format":"p2p-offramp-backup","format":"p2p-offramp-backup"}'),'INVALID_INPUT'],[new TextEncoder().encode(JSON.stringify(badChecksum)),'INVALID_INPUT'],[bytesFor(other),'CONFLICT']])error(await s.vault.verifyBackup(s.session.sessionId,bytes,fixture.passphrase),code);
  assert.equal(s.spy.derivations,1);assert.equal(s.store.writes,0);
  value(await s.vault.commit(s.session.sessionId,s.session.revision,[{op:'put',record:{id:'f'.repeat(32),kind:'preference',schemaVersion:42,payload:'e30'}}]));
  error(await s.vault.verifyBackup(s.session.sessionId,bytesFor(),fixture.passphrase),'CONFLICT');
  const current=s.store.rows.get(s.session.profileId);const receipt=value(await s.vault.verifyBackup(s.session.sessionId,bytesFor(current),fixture.passphrase));
  assert.equal(receipt.revision,s.session.revision+1,'opaque future consumer records are included in complete-profile coverage');assert.equal(s.store.writes,1);
 }finally{s.vault.dispose();}
});

test('wrong file passphrase cannot establish verification even though the selected profile is unlocked',async()=>{
 const s=await setup();try{error(await s.vault.verifyBackup(s.session.sessionId,bytesFor(),'wrong but structurally valid passphrase'),'AUTHENTICATION_FAILED');assert.equal(s.store.writes,0);}finally{s.vault.dispose();}
});

test('verification rejects cross-tab changes during authentication and locks the stale source session',async()=>{
 let stage=false;const s=await setup({derive:()=>{if(stage){const row=clone(s.store.rows.get(s.session.profileId));row.revision++;s.store.rows.set(s.session.profileId,row);}}});
 try{stage=true;error(await s.vault.verifyBackup(s.session.sessionId,bytesFor(),fixture.passphrase),'CONFLICT');error(await s.vault.list(s.session.sessionId),'LOCKED');assert.equal(s.store.writes,0);}finally{s.vault.dispose();}
});

test('lock, cancellation and trusted selection guards reject late authentication without writes',async()=>{
 for(const mode of ['lock','cancel','selection']){
  let stage=false;const controller=new AbortController();let current=true;
  const s=await setup({derive:()=>{if(stage){if(mode==='lock')s.vault.lock(s.session.sessionId);else if(mode==='cancel')controller.abort();else current=false;}}});
  try{stage=true;error(await s.vault.verifyBackup(s.session.sessionId,bytesFor(),fixture.passphrase,controller.signal,()=>{if(!current)throw Error('SECRET');}),mode==='lock'?'LOCKED':'CANCELLED');assert.equal(s.store.writes,0);}finally{s.vault.dispose();}
 }
});

test('verification copies caller bytes and shares recovery capacity until native crypto actually drains',async()=>{
 let stage=false,release,markStarted;const held=new Promise(resolve=>release=resolve),started=new Promise(resolve=>{markStarted=resolve;});
 const s=await setup({derive:async()=>{if(stage){markStarted();await held;}}});const backup=new EncryptedBackupService(s.store,webcrypto);
 try{
  stage=true;const input=bytesFor(),before=sha(input);const controller=new AbortController();
  const pending=s.vault.verifyBackup(s.session.sessionId,input,fixture.passphrase,controller.signal);input.fill(0);
  await started;await assert.rejects(backup.export(s.session.profileId),e=>e.code==='BUSY');controller.abort();
  await assert.rejects(backup.export(s.session.profileId),e=>e.code==='BUSY');release();error(await pending,'CANCELLED');
  assert.equal(s.store.writes,0);stage=false;const receipt=value(await s.vault.verifyBackup(s.session.sessionId,bytesFor(),fixture.passphrase));assert.equal(receipt.backupSha256,before);
  const slot=claimRecoverySlot();assert.ok(slot);error(await s.vault.verifyBackup(s.session.sessionId,bytesFor(),fixture.passphrase),'BUSY');slot();
  assert.ok(await backup.export(s.session.profileId));
 }finally{release?.();backup.dispose();s.vault.dispose();}
});

test('final persisted-row recheck refuses a cross-tab change after successful backup authentication', async () => {
 const s=await setup();let reads=0;
 try {
  s.store.beforeGet=()=>{if(++reads===2){const row=clone(s.store.rows.get(s.session.profileId));row.revision++;s.store.rows.set(s.session.profileId,row);}};
  error(await s.vault.verifyBackup(s.session.sessionId,bytesFor(),fixture.passphrase),'CONFLICT');
  assert.equal(reads,2);assert.equal(s.spy.derivations,2,'the final refusal follows independent successful authentication');
  error(await s.vault.list(s.session.sessionId),'LOCKED');assert.equal(s.store.writes,0);
 }finally{s.vault.dispose();}
});

test('backup byte snapshots use intrinsic typed-array size without caller accessors', async () => {
 const s=await setup();let reads=0;
 try {
  const bytes=bytesFor(),expected=sha(bytes);
  for(const key of ['byteLength','length'])Object.defineProperty(bytes,key,{get(){reads++;throw Error('SECRET byte size');}});
  const receipt=value(await s.vault.verifyBackup(s.session.sessionId,bytes,fixture.passphrase));
  assert.equal(receipt.backupSha256,expected);assert.equal(reads,0);assert.equal(s.store.writes,0);
 }finally{s.vault.dispose();}
});
