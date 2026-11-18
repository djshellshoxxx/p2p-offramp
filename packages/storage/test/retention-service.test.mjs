import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {EncryptedVaultService} from '../src/vault-service.ts';
import {VaultStorageError} from '../src/idb-vault-store.ts';
import {RetentionService,RETENTION_REVIEW_AGE_MS as AGE} from '../src/retention-service.ts';
import {encodeSavedReviewPayload,encodeIntentPayload} from '../../schemas/index.ts';
const id=n=>n.toString(16).padStart(32,'0'), clone=v=>structuredClone(v);
const good=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const bad=(r,code)=>{assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.error.code,code);assert.doesNotMatch(JSON.stringify(r),/SECRET|private-record|https:/);};
const saved=n=>({id:id(n),kind:'trade',schemaVersion:1,payload:encodeSavedReviewPayload('file',new TextEncoder().encode('private-record terms'))});
const opaque=(n,kind='trade')=>({id:id(n),kind,schemaVersion:1,payload:Buffer.from('private-record opaque').toString('base64url')});
const chat=(n,at=0,conversation='a'.repeat(64))=>({id:id(n),kind:'chat',schemaVersion:1,payload:Buffer.from(JSON.stringify({format:'p2p-offramp-chat-history',version:1,conversationId:conversation,receivedSequence:n,receivedAt:at,wrap:{}})).toString('base64url')});
const journal=(n,state='finalized',updatedAt=0)=>({id:id(n),kind:'journal',schemaVersion:1,payload:encodeIntentPayload({version:1,intentId:Buffer.alloc(32,n).toString('base64url'),binding:{chain:'evm',networkId:'evm:1',deploymentId:'escrow-v1',tradeId:'trade-1'},account:'0x'+'12'.repeat(20),action:'fund',state,walletGeneration:0,expectedEscrowState:'absent',preparedRequest:'{"to":"escrow","value":"1"}',submission:{chain:'evm',hash:state==='prepared'?null:'0x'+'23'.repeat(32),nonce:state==='prepared'?null:'0'},replacementOf:null,createdAt:0,updatedAt})});
class Store {
  rows=new Map();writes=0;beforeWrite;afterWrite;
  async get(p){return clone(this.rows.get(p));}
  async add(row,options){options?.assertCurrent?.();this.rows.set(row.profileId,clone(row));this.writes++;}
  async compareAndSwap(expected,next,options){await this.beforeWrite?.();options?.assertCurrent?.();if(options?.signal?.aborted)throw new VaultStorageError('CANCELLED');if(JSON.stringify(this.rows.get(expected.profileId))!==JSON.stringify(expected))throw new VaultStorageError('CONFLICT');this.rows.set(next.profileId,clone(next));this.writes++;this.afterWrite?.();}
  subscribeInvalidation(){return()=>{};}
}
async function setup(t,records,authority){const store=new Store(),vault=new EncryptedVaultService(store,webcrypto,{lifecycle:false});let session=good(await vault.create('local retention fixture passphrase'));for(let at=0;at<records.length;at+=256){session={...session,revision:good(await vault.commit(session.sessionId,session.revision,records.slice(at,at+256).map(record=>({op:'put',record}))))};}const service=new RetentionService(vault,session,authority);t.after(()=>{service.dispose();vault.dispose();});return{store,vault,session,service};}
const consent=plan=>({version:1,expectedRevision:plan.revision,consentRevision:plan.revision,reviewed:true,logicalOnly:true,backupAndRemoteLimitsAcknowledged:true});
// Deliberately synthetic injected authority: these tests establish atomic local mechanics, NEVER native qualification.
function fixtureAuthority(choose=scope=>scope.candidates.map(c=>c.record.id)){let live=true,disposed=0,calls=0;return{get calls(){return calls;},get disposed(){return disposed;},invalidate(){live=false;},async reviewNative(scope){calls++;return{scope,safeRecordIds:choose(scope),current:()=>live,dispose(){disposed++;}};}};}

test('30-day archive threshold is read-only and never turns persisted terminal labels into deletion proof',async t=>{
  const s=await setup(t,[journal(1),journal(2,'pending'),chat(3),saved(4),opaque(5),opaque(6,'identity'),opaque(7,'preference')]);const writes=s.store.writes;
  const before=good(await s.service.planRetention(AGE-1));assert.equal(before.archiveReviewCount,0);
  const exact=good(await s.service.planRetention(AGE));assert.equal(exact.archiveReviewCount,2);assert.equal(exact.reviewedDeleteCount,0);assert.equal(exact.protectedCount,7);assert.equal(s.store.writes,writes);
  assert.deepEqual(new Set(Object.keys(exact)),new Set(['version','revision','archiveReviewCount','reviewedDeleteCount','protectedCount','logicalOnly','backupAndRemoteCopiesUnaffected']));
  assert.doesNotMatch(JSON.stringify(exact),/trade-1|private-record|payload|recordId|conversationId/);
  bad(await s.service.deleteReviewedRecords(exact,consent(exact)),'NATIVE_PROOF_REQUIRED');assert.equal(s.store.writes,writes);
});
test('synthetic current dependency lease permits one actual atomic known-purpose deletion while retaining unknown records',async t=>{
  const authority=fixtureAuthority();const s=await setup(t,[saved(1),journal(2),opaque(3),opaque(4,'identity')],authority);const writes=s.store.writes;
  const plan=good(await s.service.reviewRetention(AGE));assert.equal(plan.reviewedDeleteCount,2);assert.equal(plan.protectedCount,2);
  const receipt=good(await s.service.deleteReviewedRecords(plan,consent(plan)));assert.deepEqual(receipt,{revision:s.session.revision+1,deletedCount:2,logicalOnly:true,backupAndRemoteCopiesUnaffected:true});
  assert.equal(s.store.writes,writes+1);assert.deepEqual(good(await s.vault.list(s.session.sessionId)).map(r=>r.id),[id(3),id(4)]);assert.equal(authority.calls,2);assert.equal(authority.disposed,2);
  bad(await s.service.deleteReviewedRecords(plan,consent(plan)),'INVALID_INPUT');
});
test('cloned plans, forged consent, getters and duplicate/nonexistent/identity proof IDs cannot delete',async t=>{
  const authority=fixtureAuthority();const s=await setup(t,[saved(1),opaque(2,'identity')],authority);const plan=good(await s.service.reviewRetention(AGE)),writes=s.store.writes;
  bad(await s.service.deleteReviewedRecords({...plan},consent(plan)),'INVALID_INPUT');
  for(const change of [{reviewed:false},{backupAndRemoteLimitsAcknowledged:false},{consentRevision:99},{extra:true}])assert.equal((await s.service.deleteReviewedRecords(plan,{...consent(plan),...change})).ok,false);
  let calls=0;const hostile=consent(plan);Object.defineProperty(hostile,'reviewed',{get(){calls++;return true;}});assert.equal((await s.service.deleteReviewedRecords(plan,hostile)).ok,false);assert.equal(calls,0);assert.equal(s.store.writes,writes);
  for(const ids of [[id(1),id(1)],[id(999)],[id(2)]]){const service=new RetentionService(s.vault,s.session,fixtureAuthority(()=>ids));assert.equal((await service.reviewRetention(AGE)).ok,false);service.dispose();}
});
test('complete conversation deletion preserves durable-history sequence invariant; partial selection is refused',async t=>{
  const s=await setup(t,[chat(1),chat(2)]);const partial=new RetentionService(s.vault,s.session,fixtureAuthority(()=>[id(1)]));bad(await partial.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');partial.dispose();
  const complete=new RetentionService(s.vault,s.session,fixtureAuthority());const plan=good(await complete.reviewRetention(AGE));assert.equal(good(await complete.deleteReviewedRecords(plan,consent(plan))).deletedCount,2);complete.dispose();
});
test('more than 256 reviewed deletes never splits into implicit or partial batches',async t=>{
  const s=await setup(t,Array.from({length:257},(_,i)=>saved(i+1)),fixtureAuthority());const plan=good(await s.service.reviewRetention(AGE));assert.equal(plan.reviewedDeleteCount,257);const writes=s.store.writes;
  bad(await s.service.deleteReviewedRecords(plan,consent(plan)),'LIMIT_EXCEEDED');assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,257);
});
test('same-tab revision change and other-tab durable change reject reviewed plans without deletion',async t=>{
  for(const otherTab of [false,true]){const s=await setup(t,[saved(1)],fixtureAuthority());const plan=good(await s.service.reviewRetention(AGE));const writer=otherTab?new EncryptedVaultService(s.store,webcrypto,{lifecycle:false}):s.vault;const session=otherTab?good(await writer.unlock(s.session.profileId,'local retention fixture passphrase')):s.session;
    good(await writer.commit(session.sessionId,session.revision,[{op:'put',record:saved(2)}]));const writes=s.store.writes;bad(await s.service.deleteReviewedRecords(plan,consent(plan)),'CONFLICT');assert.equal(s.store.writes,writes);if(otherTab)writer.dispose();}
});
test('native proof invalidation immediately before CAS cannot delete; old plan cannot bypass fresh scope',async t=>{
  const authority=fixtureAuthority(),s=await setup(t,[saved(1)],authority),plan=good(await s.service.reviewRetention(AGE));const writes=s.store.writes;s.store.beforeWrite=()=>authority.invalidate();
  bad(await s.service.deleteReviewedRecords(plan,consent(plan)),'CANCELLED');assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,1);
});
test('cancellation before the write retains records; cancellation/lock after durable commit returns actual success',async t=>{
  const s=await setup(t,[saved(1)],fixtureAuthority()),plan=good(await s.service.reviewRetention(AGE));const controller=new AbortController();controller.abort();const writes=s.store.writes;
  bad(await s.service.deleteReviewedRecords(plan,consent(plan),controller.signal),'CANCELLED');assert.equal(s.store.writes,writes);
  const after=new AbortController();s.store.afterWrite=()=>{after.abort();s.vault.lock(s.session.sessionId);};const receipt=good(await s.service.deleteReviewedRecords(plan,consent(plan),after.signal));assert.equal(receipt.deletedCount,1);assert.equal(s.store.writes,writes+1);
  const restarted=new EncryptedVaultService(s.store,webcrypto,{lifecycle:false}),session=good(await restarted.unlock(s.session.profileId,'local retention fixture passphrase'));assert.equal(good(await restarted.list(session.sessionId)).length,0);restarted.dispose();
});
test('lock while native review is pending disposes late proof and preserves encrypted data',async t=>{
  let resolve,started;const ready=new Promise(r=>started=r);let disposed=0;const authority={reviewNative(scope){started();return new Promise(r=>resolve=()=>r({scope,safeRecordIds:[id(1)],current:()=>true,dispose(){disposed++;}}));}};
  const s=await setup(t,[saved(1)],authority);const pending=s.service.reviewRetention(AGE);await ready;s.vault.lock(s.session.sessionId);resolve();bad(await pending,'LOCKED');assert.equal(disposed,1);
  const session=good(await s.vault.unlock(s.session.profileId,'local retention fixture passphrase'));assert.equal(good(await s.vault.list(session.sessionId)).length,1);
});
test('opaque/future namespaces are never candidates and hostile provider errors/accessors do not leak',async t=>{
  const s=await setup(t,[opaque(1),{...saved(2),schemaVersion:2},opaque(3,'identity'),journal(4,'prepared')],fixtureAuthority());const plan=good(await s.service.reviewRetention(AGE));assert.equal(plan.reviewedDeleteCount,0);assert.equal(plan.protectedCount,4);
  const poisoned=new RetentionService(s.vault,s.session,{async reviewNative(){throw new Proxy({}, {getPrototypeOf(){throw Error('SECRET');}});}});bad(await poisoned.reviewRetention(AGE),'UNAVAILABLE');poisoned.dispose();
  let calls=0;const getter=new RetentionService(s.vault,s.session,{async reviewNative(scope){const proof={scope,current:()=>true,dispose(){}};Object.defineProperty(proof,'safeRecordIds',{get(){calls++;return[];}});return proof;}});bad(await getter.reviewRetention(AGE),'UNAVAILABLE');assert.equal(calls,0);getter.dispose();
});
// Synthetic coordinator ports below exercise adapter guard failures; real native proof is separately exercised in test-evm-reconcile-local.mjs.
async function nativeFixture(t,records=[journal(1)],overrides={}){
  const {JournalNativeRetentionAuthority}=await import('../src/retention-service.ts');
  const s=await setup(t,records);let clock=100,live=true,verified=true,reconcileCalls=0;
  const intents=records.filter(r=>r.kind==='journal').map(r=>{const text=Buffer.from(r.payload,'base64url').toString();return JSON.parse(text);});
  const journalPort={list:async()=>({ok:true,value:intents}),currentRevision:()=>s.vault.captureSession(s.session,()=>{}).value?.current()?.revision??null,isTerminalVerified:()=>verified};
  // Avoid creating leases on guard calls in the fixture.
  const lease=good(s.vault.captureSession(s.session,()=>{}));journalPort.currentRevision=()=>lease.current()?.revision??null;t.after(()=>lease.dispose());
  const reconciler={async reconcile(intentId){reconcileCalls++;await overrides.duringRead?.();return{ok:true,value:{outcome:'finalized',intent:intents.find(i=>i.intentId===intentId),evidence:'receipt',escrowState:overrides.escrowState??'released'}};}};
  const authority=new JournalNativeRetentionAuthority({vault:s.vault,session:s.session,journal:journalPort,reconciler,...(overrides.omitPayout?{}:{payoutClosure:{async reviewPayoutClosure(scope,intents,signal){assert.equal(Object.isFrozen(intents),true);return overrides.payout?overrides.payout(scope,intents,signal):{scope,intents,current:()=>live&&verified&&!signal.aborted,dispose(){}};}}}),currentScope:()=>overrides.currentScope?overrides.currentScope():live,now:()=>clock,maxAgeMs:100});
  const service=new RetentionService(s.vault,s.session,authority);t.after(()=>{service.dispose();authority.dispose();});
  return{...s,service,authority,journalPort,reconcileCalls:()=>reconcileCalls,setTime:value=>clock=value,invalidate:()=>live=false,unverify:()=>verified=false};
}
test('real adapter constructor needs explicit maintained scope; only terminal escrow and journal-only closure are supported',async t=>{
  for(const escrowState of ['funded','absent']){const s=await nativeFixture(t,undefined,{escrowState});bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');}
  for(const records of [[saved(1)],[journal(1),opaque(2)],[journal(1,'pending')]]){const s=await nativeFixture(t,records);bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');}
  const s=await nativeFixture(t);const plan=good(await s.service.reviewRetention(AGE));assert.equal(plan.reviewedDeleteCount,1);s.invalidate();bad(await s.service.deleteReviewedRecords(plan,consent(plan)),'NATIVE_PROOF_REQUIRED');
});
test('native adapter rejects expired/backward/nonfinite clock and invalidated verification after async read',async t=>{
  for(const variant of ['expiry','backward','nan','unverified']){let s;const overrides={duringRead:()=>{if(variant==='expiry')s.setTime(200);if(variant==='backward')s.setTime(99);if(variant==='nan')s.setTime(Number.NaN);if(variant==='unverified')s.unverify();}};s=await nativeFixture(t,undefined,overrides);const writes=s.store.writes;bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');assert.equal(s.store.writes,writes);}
});
test('native reconcile changing a profile revision cannot authorize deletion from the previous scope',async t=>{
  let s,written=false;s=await nativeFixture(t,undefined,{duringRead:async()=>{if(!written){written=true;good(await s.vault.commit(s.session.sessionId,s.session.revision,[{op:'put',record:saved(2)}]));}}});
  const result=await s.service.reviewRetention(AGE);bad(result,'NATIVE_PROOF_REQUIRED');assert.equal(good(await s.vault.list(s.session.sessionId)).length,2);
});
test('native source scope invalidated synchronously during its current check cannot grant a lease',async t=>{
  let s;s=await nativeFixture(t,undefined,{currentScope:()=>{s.authority.dispose();return true;}});const writes=s.store.writes;
  bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');assert.equal(s.store.writes,writes);
});
test('revocation by the final native terminal/revision callback at durable CAS prevents every delete write',async t=>{
  for(const callback of ['isTerminalVerified','currentRevision']){
    const s=await nativeFixture(t);const plan=good(await s.service.reviewRetention(AGE));let armed=false,revoked=false;
    const original=s.journalPort[callback];
    s.journalPort[callback]=(...args)=>{const value=original(...args);if(armed){revoked=true;s.authority.dispose();}return value;};
    s.store.beforeWrite=()=>{armed=true;};const writes=s.store.writes;
    bad(await s.service.deleteReviewedRecords(plan,consent(plan)),'CANCELLED');
    assert.equal(revoked,true,'callback actually revoked authority immediately before durable write');
    assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,1);
  }
});
test('proof current and cleanup callbacks cannot return a successful plan after closing its owner',async t=>{
  for(const where of ['current','dispose']){
    let s,calls=0;const authority={async reviewNative(scope){return{scope,safeRecordIds:[id(1)],current(){calls++;if(where==='current'&&calls===3)s.service.dispose();return true;},dispose(){if(where==='dispose')s.service.dispose();}};}};
    s=await setup(t,[saved(1)],authority);const writes=s.store.writes;
    bad(await s.service.reviewRetention(AGE),'LOCKED');assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,1);
  }
});
test('post-commit proof cleanup cannot reverse durable deletion success even if cleanup closes owner and throws',async t=>{
  let s,committed=false;const authority={async reviewNative(scope){return{scope,safeRecordIds:[id(1)],current:()=>true,dispose(){if(committed){s.service.dispose();throw Error('SECRET cleanup');}}};}};
  s=await setup(t,[saved(1)],authority);const plan=good(await s.service.reviewRetention(AGE));const writes=s.store.writes;
  s.store.afterWrite=()=>{committed=true;};const receipt=good(await s.service.deleteReviewedRecords(plan,consent(plan)));
  assert.equal(receipt.deletedCount,1);assert.equal(s.store.writes,writes+1);assert.equal(good(await s.vault.list(s.session.sessionId)).length,0);
});

test('offline planning never calls an installed native authority',async t=>{
  let calls=0;const authority={async reviewNative(){calls++;throw Error('native request must not run');}};
  const s=await setup(t,[saved(1),journal(2)],authority),writes=s.store.writes;
  const plan=good(await s.service.planRetention(AGE));
  assert.equal(calls,0);assert.equal(plan.reviewedDeleteCount,0);assert.equal(plan.protectedCount,2);assert.equal(s.store.writes,writes);
  bad(await s.service.deleteReviewedRecords(plan,consent(plan)),'NATIVE_PROOF_REQUIRED');assert.equal(calls,0);
});

test('old journal-only adapter without a constructor-owned payout closure stays protected before native reconciliation',async t=>{
 const s=await nativeFixture(t,undefined,{omitPayout:true}),writes=s.store.writes;
 bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');assert.equal(s.reconcileCalls(),0);assert.equal(s.store.writes,writes);
});
test('payout closure must keep the exact scope and frozen intents identities and a current live lease',async t=>{
 for(const variant of ['scope','intents','expired']){let disposed=0;const s=await nativeFixture(t,undefined,{payout:(scope,intents)=>({scope:variant==='scope'?{...scope}:scope,intents:variant==='intents'?[...intents]:intents,current:()=>variant!=='expired',dispose(){disposed++;}})}),writes=s.store.writes;
  bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');assert.equal(s.store.writes,writes);assert.equal(disposed,1);
 }
});
test('imported paid JSON cannot replace a live payout capability',async t=>{
 for(const payout of [(scope,intents)=>JSON.parse(JSON.stringify({scope,intents,paid:true})),(scope,intents)=>({scope,intents,paid:true,current:()=>true,dispose(){}})]){
  const s=await nativeFixture(t,undefined,{payout}),writes=s.store.writes;bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');assert.equal(s.store.writes,writes);
 }
});
test('payout revocation at actual CAS protects all records and throwing lease cleanup cannot reverse completed deletion',async t=>{
 let invalid=false,throwCleanup=false,disposed=0;
 const s=await nativeFixture(t,undefined,{payout:(scope,intents)=>({scope,intents,current:()=>!invalid,dispose(){disposed++;if(throwCleanup)throw Error('PRIVATE payout cleanup');}})});
 const plan=good(await s.service.reviewRetention(AGE)),writes=s.store.writes;s.store.beforeWrite=()=>{invalid=true;};
 const refused=await s.service.deleteReviewedRecords(plan,consent(plan));assert.equal(refused.ok,false);assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,1);
 s.store.beforeWrite=undefined;invalid=false;throwCleanup=true;const fresh=good(await s.service.reviewRetention(AGE));
 assert.equal(good(await s.service.deleteReviewedRecords(fresh,consent(fresh))).deletedCount,1);assert.equal(s.store.writes,writes+1);assert.equal(disposed,4);
});
test('a valid late payout lease is disposed once when its source retires during awaited native review',async t=>{
 let s,disposed=0;s=await nativeFixture(t,undefined,{payout:(scope,intents)=>{s.authority.dispose();return{scope,intents,current:()=>true,dispose(){disposed++;}};}});const writes=s.store.writes;
 bad(await s.service.reviewRetention(AGE),'NATIVE_PROOF_REQUIRED');assert.equal(disposed,1);assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,1);
});
test('a terminal callback cannot revoke payout closure while returning true and still authorize the final CAS',async t=>{
 let live=true,armed=false;const s=await nativeFixture(t,undefined,{payout:(scope,intents)=>({scope,intents,current:()=>live,dispose(){}})});
 const plan=good(await s.service.reviewRetention(AGE)),original=s.journalPort.isTerminalVerified,writes=s.store.writes;
 s.journalPort.isTerminalVerified=(...args)=>{const value=original(...args);if(armed)live=false;return value;};s.store.beforeWrite=()=>{armed=true;};
 const result=await s.service.deleteReviewedRecords(plan,consent(plan));assert.equal(result.ok,false);assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,1);
});
