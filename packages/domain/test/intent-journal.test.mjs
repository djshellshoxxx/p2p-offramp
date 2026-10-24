import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
const api=await import('../src/intent-journal.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const schema=await import('../../schemas/src/intent.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const clone=value=>structuredClone(value),pass='local journal fixture passphrase';
const binding={chain:'evm',networkId:'evm:1',deploymentId:'escrow-v1',tradeId:'trade-1'},account='0x'+'12'.repeat(20);
let counter=0;
const intent=(change={})=>({version:1,intentId:Buffer.alloc(32,++counter).toString('base64url'),binding,account,action:'fund',state:'prepared',walletGeneration:0,expectedEscrowState:'absent',preparedRequest:'{"to":"escrow","value":"1"}',submission:{chain:'evm',hash:null,nonce:null},replacementOf:null,createdAt:0,updatedAt:0,...change});
const val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const err=(result,code)=>{assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/SECRET|https:\/\//);return result;};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
class Store{
 rows=new Map();listeners=new Set();writes=0;beforeGet;beforeWrite;afterCommit;failure;
 async get(id){await this.beforeGet?.();return clone(this.rows.get(id));}
 async add(row,options){options?.assertCurrent?.();assert.equal(this.rows.has(row.profileId),false);this.rows.set(row.profileId,clone(row));this.writes++;}
 async compareAndSwap(expected,next,options){await this.beforeWrite?.();options?.assertCurrent?.();if(options?.signal?.aborted)throw new VaultStorageError('CANCELLED');if(JSON.stringify(this.rows.get(expected.profileId))!==JSON.stringify(expected))throw new VaultStorageError('CONFLICT');if(this.failure)throw new VaultStorageError(this.failure);this.rows.set(next.profileId,clone(next));this.writes++;this.afterCommit?.();}
 subscribeInvalidation(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
}
// Fixture validation establishes only local test encoding, never chain/deployment or wallet authority.
const fixtureValidator=()=>({ok:true,value:undefined});
function journal(vault,session,options={}){assert.equal(typeof api.createIntentJournal,'function','missing G12 encrypted journal');return api.createIntentJournal({vault,session,validateCanonical:fixtureValidator,...options});}
async function setup(options={}){const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),session=val(await vault.create(pass)),service=journal(vault,session,options);return{store,vault,session,journal:service};}
test('journal persists one encrypted reservation before returning a distinct record ID, without a send surface',async()=>{
 const s=await setup(),prepared=intent();const recordId=val(await s.journal.reserve(prepared,0));assert.match(recordId,/^[0-9a-f]{32}$/);assert.notEqual(recordId,prepared.intentId);
 assert.deepEqual(val(await s.journal.unresolved(binding,account)),[prepared]);assert.equal(s.store.writes,2);assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]),/preparedRequest|trade-1|journal|payload/);
 for(const name of ['send','submit','sign','clear','delete','observe','reconcile'])assert.equal(name in s.journal,false);assert.deepEqual(Reflect.ownKeys(s.journal),[]);s.journal.dispose();s.vault.dispose();
});
test('canonical validator is unsupported by default and no malformed or unsupported reservation writes',async()=>{
 const s=await setup(),unsupported=api.createIntentJournal({vault:s.vault,session:s.session});err(await unsupported.reserve(intent(),0),'UNSUPPORTED_PROVIDER');
 err(await s.journal.reserve(intent({state:'broadcast-unknown'}),0),'CONFLICT');err(await s.journal.reserve(intent({replacementOf:Buffer.alloc(32,99).toString('base64url')}),0),'UNSUPPORTED_PROVIDER');assert.equal(s.store.writes,1);unsupported.dispose();s.journal.dispose();s.vault.dispose();
});
test('one binding/account reservation spans actions, survives disposal/restart and never expires by clock age',async()=>{
 const s=await setup(),prepared=intent();val(await s.journal.reserve(prepared,0));err(await s.journal.reserve(intent({action:'approve'}),1),'CONFLICT');
 s.journal.dispose();s.journal=journal(s.vault,s.session,{now:()=>Number.MAX_SAFE_INTEGER-1});assert.deepEqual(val(await s.journal.unresolved(binding,account)),[prepared]);err(await s.journal.reserve(intent(),1),'CONFLICT');s.journal.dispose();s.vault.dispose();
});
test('markSending is durable prepared-only CAS, and repeated or restarted calls conflict',async()=>{
 const s=await setup(),prepared=intent();val(await s.journal.reserve(prepared,0));val(await s.journal.markSending(prepared.intentId));assert.equal(s.store.rows.get(s.session.profileId).revision,2);
 assert.equal(val(await s.journal.unresolved(binding,account))[0].state,'broadcast-unknown');err(await s.journal.markSending(prepared.intentId),'CONFLICT');
 s.journal.dispose();s.journal=journal(s.vault,s.session);err(await s.journal.markSending(prepared.intentId),'CONFLICT');err(await s.journal.reserve(intent(),2),'CONFLICT');assert.equal(s.store.writes,3);s.journal.dispose();s.vault.dispose();
});
test('independent sessions racing reservation commit one intent and require loser reload',async()=>{
 const s=await setup(),otherVault=new EncryptedVaultService(s.store,crypto,{lifecycle:false}),otherSession=val(await otherVault.unlock(s.session.profileId,pass)),other=journal(otherVault,otherSession);
 const results=await Promise.all([s.journal.reserve(intent(),0),other.reserve(intent(),0)]);assert.equal(results.filter(result=>result.ok).length,1);assert.ok(results.some(result=>!result.ok&&result.error.code==='CONFLICT'));assert.equal(s.store.rows.get(s.session.profileId).revision,1);
 other.dispose();otherVault.dispose();s.journal.dispose();s.vault.dispose();
});
test('unrelated unknown/future journal records block the entire profile instead of being skipped',async()=>{
 for(const kind of ['outer-future','inner-future','malformed']){
  const s=await setup(),stored=intent({binding:{...binding,tradeId:'other-trade'}});let payload=schema.encodeIntentPayload(stored),schemaVersion=1;
  if(kind==='outer-future')schemaVersion=2;else if(kind==='inner-future')payload=Buffer.from(JSON.stringify({...stored,version:2})).toString('base64url');else payload='bm90LWpzb24';
  val(await s.vault.commit(s.session.sessionId,0,[{op:'put',record:{id:'ab'.repeat(16),kind:'journal',schemaVersion,payload}}]));
  const code=kind==='malformed'?'INTEGRITY_FAILURE':'UNSUPPORTED_VERSION';err(await s.journal.reserve(intent(),1),code);err(await s.journal.unresolved(binding,account),code);assert.equal(s.store.writes,2);s.journal.dispose();s.vault.dispose();
 }
});
test('imported terminal labels stay reserved and duplicate intent IDs are integrity failures',async()=>{
 const s=await setup(),stored=intent({state:'finalized'});val(await s.vault.commit(s.session.sessionId,0,[{op:'put',record:{id:'ab'.repeat(16),kind:'journal',schemaVersion:1,payload:schema.encodeIntentPayload(stored)}}]));
 assert.equal(val(await s.journal.unresolved(binding,account))[0].state,'finalized');err(await s.journal.reserve(intent(),1),'CONFLICT');
 val(await s.vault.commit(s.session.sessionId,1,[{op:'put',record:{id:'cd'.repeat(16),kind:'journal',schemaVersion:1,payload:schema.encodeIntentPayload({...stored,binding:{...binding,tradeId:'other'}})}}]));
 err(await s.journal.unresolved(binding,account),'INTEGRITY_FAILURE');s.journal.dispose();s.vault.dispose();
});
test('simultaneous markSending with a shared revoked session retains one marker and suppresses the losing authority',async()=>{
 const s=await setup(),prepared=intent();val(await s.journal.reserve(prepared,0));const other=journal(s.vault,s.session);
 const results=await Promise.all([s.journal.markSending(prepared.intentId),other.markSending(prepared.intentId)]);assert.deepEqual(results.map(result=>result.ok?'ok':result.error.code).sort(),['BROADCAST_UNKNOWN','CONFLICT']);assert.equal(s.store.writes,3);assert.equal(s.store.rows.get(s.session.profileId).revision,2);other.dispose();s.journal.dispose();s.vault.dispose();
});
test('simultaneous markSending across independently unlocked sessions has exactly one successful CAS winner',async()=>{
 const s=await setup(),prepared=intent();val(await s.journal.reserve(prepared,0));const otherVault=new EncryptedVaultService(s.store,crypto,{lifecycle:false}),otherSession=val(await otherVault.unlock(s.session.profileId,pass)),other=journal(otherVault,otherSession);
 const results=await Promise.all([s.journal.markSending(prepared.intentId),other.markSending(prepared.intentId)]);assert.equal(results.filter(result=>result.ok).length,1);assert.equal(results.filter(result=>!result.ok&&result.error.code==='CONFLICT').length,1);assert.equal(s.store.writes,3);assert.equal(s.store.rows.get(s.session.profileId).revision,2);other.dispose();otherVault.dispose();s.journal.dispose();s.vault.dispose();
});
test('snapshot revision stays bound across canonical validation while another coordinator marks the intent',async()=>{
 const s=await setup(),prepared=intent();val(await s.journal.reserve(prepared,0));const entered=deferred(),gate=deferred();const delayed=journal(s.vault,s.session,{validateCanonical:async()=>{entered.resolve();await gate.promise;return fixtureValidator();}});
 const pending=delayed.markSending(prepared.intentId);await entered.promise;val(await s.journal.markSending(prepared.intentId));gate.resolve();err(await pending,'CONFLICT');assert.equal(s.store.writes,3);delayed.dispose();s.journal.dispose();s.vault.dispose();
});
test('cancellation and lock during validation suppress writes; immutable caller snapshots survive awaits',async()=>{
 for(const reason of ['cancel','lock']){
  const entered=deferred(),gate=deferred(),s=await setup({validateCanonical:async()=>{entered.resolve();await gate.promise;return fixtureValidator();}}),controller=new AbortController(),prepared=intent();
  const pending=s.journal.reserve(prepared,0,controller.signal);await entered.promise;if(reason==='cancel')controller.abort();else s.vault.lockAll();gate.resolve();err(await pending,reason==='cancel'?'CANCELLED':'LOCKED');assert.equal(s.store.writes,1);s.journal.dispose();s.vault.dispose();
 }
 const entered=deferred(),gate=deferred(),s=await setup({validateCanonical:async()=>{entered.resolve();await gate.promise;return fixtureValidator();}}),prepared=intent(),original=clone(prepared);
 const pending=s.journal.reserve(prepared,0);await entered.promise;prepared.preparedRequest='SECRET changed';prepared.binding={...binding,tradeId:'changed'};gate.resolve();val(await pending);assert.deepEqual(val(await s.journal.unresolved(binding,account)),[original]);s.journal.dispose();s.vault.dispose();
});
test('completed reservation winning lock/cancel returns only its discoverable durable reference',async()=>{
 const s=await setup(),prepared=intent(),controller=new AbortController();s.store.afterCommit=()=>{s.vault.lockAll();controller.abort();};
 const recordId=val(await s.journal.reserve(prepared,0,controller.signal));assert.match(recordId,/^[a-f0-9]{32}$/);assert.equal(s.store.writes,2);err(await s.journal.unresolved(binding,account),'LOCKED');
 s.store.afterCommit=undefined;const session=val(await s.vault.unlock(s.session.profileId,pass)),fresh=journal(s.vault,session);assert.deepEqual(val(await fresh.unresolved(binding,account)),[prepared]);fresh.dispose();s.journal.dispose();s.vault.dispose();
});
test('completed pre-send marker winning lock/cancel remains broadcast-unknown and never reports rollback',async()=>{
 const s=await setup(),prepared=intent(),controller=new AbortController();val(await s.journal.reserve(prepared,0));s.store.afterCommit=()=>{s.vault.lockAll();controller.abort();};
 err(await s.journal.markSending(prepared.intentId,controller.signal),'BROADCAST_UNKNOWN');s.store.afterCommit=undefined;
 const session=val(await s.vault.unlock(s.session.profileId,pass)),fresh=journal(s.vault,session);assert.equal(val(await fresh.unresolved(binding,account))[0].state,'broadcast-unknown');err(await fresh.markSending(prepared.intentId),'CONFLICT');assert.equal(s.store.writes,3);fresh.dispose();s.journal.dispose();s.vault.dispose();
});
test('quota failures preserve prepared state and uncertain post-commit storage never permits automatic retry',async()=>{
 const s=await setup(),prepared=intent();s.store.failure='QUOTA_EXCEEDED';err(await s.journal.reserve(prepared,0),'LIMIT_EXCEEDED');assert.deepEqual(val(await s.journal.unresolved(binding,account)),[]);
 s.store.failure=undefined;val(await s.journal.reserve(prepared,0));s.store.failure='QUOTA_EXCEEDED';err(await s.journal.markSending(prepared.intentId),'LIMIT_EXCEEDED');assert.equal(val(await s.journal.unresolved(binding,account))[0].state,'prepared');assert.equal(s.store.writes,2);
 s.store.failure=undefined;s.store.afterCommit=()=>{throw Error('SECRET https://private.invalid signed bytes');};const failed=err(await s.journal.markSending(prepared.intentId),'BROADCAST_UNKNOWN');assert.equal(failed.error.action,'reconcile');assert.equal(failed.error.retryable,false);
 s.store.afterCommit=undefined;const session=val(await s.vault.unlock(s.session.profileId,pass)),fresh=journal(s.vault,session);assert.equal(val(await fresh.unresolved(binding,account))[0].state,'broadcast-unknown');err(await fresh.markSending(prepared.intentId),'CONFLICT');assert.equal(s.store.writes,3);fresh.dispose();s.journal.dispose();s.vault.dispose();
});
test('cancelled unsettled jobs retain their single slot, and disposal is terminal',async()=>{
 const entered=deferred(),gate=deferred();let calls=0;const s=await setup({validateCanonical:async()=>{calls++;entered.resolve();await gate.promise;return fixtureValidator();}}),controller=new AbortController();
 const pending=s.journal.reserve(intent(),0,controller.signal);await entered.promise;controller.abort();err(await s.journal.reserve(intent(),0),'CONFLICT');assert.equal(calls,1);s.journal.dispose();s.journal.dispose();err(await s.journal.reserve(intent(),0),'LOCKED');gate.resolve();err(await pending,'LOCKED');assert.equal(s.store.writes,1);s.vault.dispose();
});
test('EVM address case cannot bypass reservation; malformed lookup data receives fixed input errors',async()=>{
 const s=await setup(),prepared=intent({account:'0x'+'ab'.repeat(20)});val(await s.journal.reserve(prepared,0));err(await s.journal.reserve(intent({account:'0x'+'AB'.repeat(20)}),1),'CONFLICT');
 err(await s.journal.unresolved({...binding,extra:true},account),'INVALID_INPUT');err(await s.journal.unresolved(binding,'SECRET invalid'),'INVALID_INPUT');s.journal.dispose();s.vault.dispose();
});
test('contradictory imported prepared metadata and unsupported replacements cannot become a sending marker',async()=>{
 for(const change of [{submission:{chain:'evm',hash:'0x'+'aa'.repeat(32),nonce:null}},{replacementOf:Buffer.alloc(32,99).toString('base64url')}]){
  const s=await setup(),stored=intent(change);val(await s.vault.commit(s.session.sessionId,0,[{op:'put',record:{id:'ab'.repeat(16),kind:'journal',schemaVersion:1,payload:schema.encodeIntentPayload(stored)}}]));
  err(await s.journal.markSending(stored.intentId),change.replacementOf?'UNSUPPORTED_PROVIDER':'CONFLICT');assert.equal(s.store.writes,2);s.journal.dispose();s.vault.dispose();
 }
});
test('a generated journal record ID cannot overwrite another private record kind',async()=>{
 const s=await setup(),record={id:'aa'.repeat(16),kind:'trade',schemaVersion:1,payload:'cHJlc2VydmU'};val(await s.vault.commit(s.session.sessionId,0,[{op:'put',record}]));
 const original=crypto.getRandomValues;
 try{crypto.getRandomValues=function(bytes){if(bytes.length===16){bytes.fill(0xaa);return bytes;}return original.call(crypto,bytes);};err(await s.journal.reserve(intent(),1),'CONFLICT');}
 finally{crypto.getRandomValues=original;}
 assert.deepEqual(val(await s.vault.read(s.session.sessionId,record.id)),record);assert.equal(s.store.writes,2);s.journal.dispose();s.vault.dispose();
});
test('validator failures use fixed codes and malformed success accessors are never invoked',async()=>{
 for(const validateCanonical of [()=>{throw Error('SECRET https://private.invalid raw transaction');},()=>Object.defineProperty({value:undefined},'ok',{get(){throw Error('SECRET accessor');}})]){
  const s=await setup({validateCanonical}),result=await s.journal.reserve(intent(),0);assert.equal(result.ok,false);assert.ok(['UNAVAILABLE','INTEGRITY_FAILURE'].includes(result.error.code));assert.doesNotMatch(JSON.stringify(result),/SECRET|https:\/\//);assert.equal(s.store.writes,1);s.journal.dispose();s.vault.dispose();
 }
});
test('a validator throwing a revoked Proxy returns a fixed failure instead of rejecting',async()=>{
 const revoked=Proxy.revocable({},{});revoked.revoke();
 const s=await setup({validateCanonical:()=>{throw revoked.proxy;}});
 err(await s.journal.reserve(intent(),0),'UNAVAILABLE');assert.equal(s.store.writes,1);s.journal.dispose();s.vault.dispose();
});
test('hostile thrown values at capture, scan and marker boundaries remain fixed results',async()=>{
 const hostile=()=>{const revoked=Proxy.revocable({},{});revoked.revoke();return revoked.proxy;};
 const s=await setup();
 const capture=journal({captureSession(){throw hostile();}},s.session);err(await capture.reserve(intent(),0),'LOCKED');capture.dispose();
 const scan=journal({captureSession:s.vault.captureSession.bind(s.vault),commit:s.vault.commit.bind(s.vault),read:s.vault.read.bind(s.vault),list:async()=>({ok:true,value:new Proxy([],{getPrototypeOf(){throw hostile();}})})},s.session);
 err(await scan.unresolved(binding,account),'INTEGRITY_FAILURE');scan.dispose();
 const prepared=intent();val(await s.journal.reserve(prepared,0));
 const marker=journal({captureSession:s.vault.captureSession.bind(s.vault),list:s.vault.list.bind(s.vault),read:s.vault.read.bind(s.vault),commit:async(sessionId,revision,mutations,signal)=>{if(mutations.length)throw hostile();return s.vault.commit(sessionId,revision,mutations,signal);}},s.session);
 const failed=err(await marker.markSending(prepared.intentId),'BROADCAST_UNKNOWN');assert.equal(failed.error.action,'reconcile');assert.equal(failed.error.retryable,false);assert.equal(s.store.writes,2);marker.dispose();s.journal.dispose();s.vault.dispose();
});
