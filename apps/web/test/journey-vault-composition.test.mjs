import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EncryptedVaultService,EncryptedBackupService} from '../../../packages/storage/index.ts';
import {VaultStorageError} from '../../../packages/storage/src/idb-vault-store.ts';
import {createJourneyVaultComposition} from '../src/journey/vault-composition.ts';
const fixture=JSON.parse(await readFile(new URL('../../../packages/storage/test/fixtures/vault-python-v1.json',import.meta.url)));
const config={version:1,ReleaseEnabled:0,connectOrigins:[]},clone=value=>structuredClone(value);
const val=response=>{assert.equal(response.result.ok,true,JSON.stringify(response));return response.result.value;};
class Store{
 rows=new Map([[fixture.envelope.profileId,clone(fixture.envelope)]]);
 async get(id){return clone(this.rows.get(id));}
 async listProfileIds(){return{profileIds:[...this.rows.keys()],truncated:false};}
 async add(row,options){options?.assertCurrent?.();this.rows.set(row.profileId,clone(row));}
 async compareAndSwap(before,after,options){options?.assertCurrent?.();if(JSON.stringify(this.rows.get(before.profileId))!==JSON.stringify(before))throw new VaultStorageError('CONFLICT');this.rows.set(after.profileId,clone(after));}
 subscribeInvalidation(){return()=>{};}
}
async function setup(){const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store),messages=[];const host=createJourneyVaultComposition({vault,backup},message=>messages.push(clone(message)));val(await host.request({operation:'init',config}));val(await host.request({operation:'unlock',profileId:fixture.envelope.profileId,passphrase:fixture.passphrase}));return{host,store,vault,backup,messages};}
async function verify(s){const {bytes}=val(await s.host.request({operation:'exportEncrypted',profileId:fixture.envelope.profileId}));val(await s.host.request({operation:'verifyBackup',profileId:fixture.envelope.profileId,bytes,passphrase:fixture.passphrase}));return bytes;}
test('private composition reuses actual same-Worker T34 fact; unlock/export/imported receipt never authorize start',async()=>{
 const s=await setup();try{
  await assert.rejects(s.host.requireVerifiedBackup(),/BACKUP_REQUIRED/);
  val(await s.host.request({operation:'exportEncrypted',profileId:fixture.envelope.profileId}));await assert.rejects(s.host.requireVerifiedBackup(),/BACKUP_REQUIRED/);
  await assert.rejects(s.host.request({operation:'checkBackupVerification',profileId:fixture.envelope.profileId,verification:{revision:0}}));
  await verify(s);const current=await s.host.requireVerifiedBackup();assert.equal(current.session.profileId,fixture.envelope.profileId);current.assertCurrent();
  assert.doesNotMatch(JSON.stringify(s.messages),/sessionId|fixture only password|wrappedKey/);
 }finally{s.host.dispose();}
});
test('actual selected mutation invalidates backup pre-start but permits current-session journal recovery',async()=>{
 const s=await setup();try{
  await verify(s);const before=await s.host.requireVerifiedBackup();
  val(await s.host.request({operation:'saveTermsReview',profileId:fixture.envelope.profileId,source:'file',bytes:new Uint8Array([1])}));
  await assert.rejects(s.host.requireVerifiedBackup(),/BACKUP_REQUIRED/);
  const recovery=await s.host.requireCurrent();assert.equal(recovery.session.revision,before.session.revision+1);recovery.assertCurrent();
  val(await s.host.request({operation:'lock'}));assert.throws(()=>recovery.assertCurrent(),/LOCKED/);await assert.rejects(s.host.requireCurrent(),/LOCKED/);
 }finally{s.host.dispose();}
});
test('cross-tab current row change revokes selected capabilities and cannot reuse earlier verification',async()=>{
 const s=await setup(),other=new EncryptedVaultService(s.store,crypto,{lifecycle:false});try{
  await verify(s);const before=await s.host.requireVerifiedBackup();const peer=await other.unlock(fixture.envelope.profileId,fixture.passphrase);assert.equal(peer.ok,true);
  const result=await other.commit(peer.value.sessionId,peer.value.revision,[{op:'put',record:{id:'f'.repeat(32),kind:'preference',schemaVersion:42,payload:'e30'}}]);assert.equal(result.ok,true);
  await assert.rejects(s.host.requireCurrent(),/CONFLICT|LOCKED/);assert.throws(()=>before.assertCurrent(),/LOCKED/);await assert.rejects(s.host.requireVerifiedBackup(),/LOCKED/);
 }finally{other.dispose();s.host.dispose();}
});
test('lock interrupts a pending actual freshness read and drains the private request rather than hanging',async()=>{
 const s=await setup();try{
  await verify(s);let release,started;const held=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>started=resolve),get=s.store.get.bind(s.store);
  s.store.get=async id=>{started();await held;return get(id);};
  const pending=s.host.requireVerifiedBackup();const rejected=assert.rejects(pending,/LOCKED/);await seen;val(await s.host.request({operation:'lock'}));release();await rejected;
 }finally{s.host.dispose();}
});
