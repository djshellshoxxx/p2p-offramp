/** Actual G02/G01/NIP17/canonical hashing, synthetic chain/coordinator ports. Native RPC proof is separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RegistryService,TERMS_REVIEW_FORMAT} from '../../../packages/domain/index.ts';
import {EncryptedVaultService,RetentionService} from '../../../packages/storage/index.ts';
import {MessagingIdentityService} from '../../../packages/identity/src/identity-service.ts';
import {createLocalNobleIdentityProvider} from '../../../packages/identity/index.ts';
import {createLocalNobleNostrProvider} from '../../../packages/nostr-crypto/index.ts';
import {createDurableTradeChat,encodeMessage} from '../../../packages/messaging/index.ts';
import {decodeIntentPayload,encodeIntentPayload,encodeSavedReviewPayload,decodeBase64url,encodeBase64url} from '../../../packages/schemas/index.ts';
import {evmTermsHash} from '../../../packages/wallet/src/evm-terms.ts';
import {escrowCallFor} from '../../../packages/wallet/src/evm-submit.ts';
import {buildPendingWithdrawals} from '../../../packages/wallet/src/evm-escrow.ts';
import {Store} from '../../../packages/messaging/test/support.mjs';
import {createNativeRetentionAuthority} from '../src/retention/native-retention.ts';
const dir=new URL('../../../packages/domain/test/fixtures/local-evm-scenario/',import.meta.url);
const registryBytes=new Uint8Array(await readFile(new URL('registry.json',dir))),scenario=JSON.parse(await readFile(new URL('scenario.json',dir),'utf8'));
const registry=new RegistryService();good(await registry.load(registryBytes,createHash('sha256').update(registryBytes).digest('hex')));
const pass='native retention mixed fixture passphrase',id=n=>n.toString(16).padStart(32,'0'),anchor={height:'16',hash:'0x'+'aa'.repeat(32)};
function good(result){assert.equal(result.ok,true,JSON.stringify(result));return result.value;}
const consent=plan=>({version:1,expectedRevision:plan.revision,consentRevision:plan.revision,reviewed:true,logicalOnly:true,backupAndRemoteLimitsAcknowledged:true});
async function setup(t,{unknown=false,contexts='valid',tamper=false}={}){
 const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),session=good(await vault.create(pass));
 const provider=createLocalNobleIdentityProvider();let secret;
 const identity=new MessagingIdentityService(vault,{provider:{...provider,async generate(){const pair=await provider.generate();secret=new Uint8Array(pair.secretKey);return pair;}},lifecycle:false});
 const reference=good(await identity.create(session)),self=good(await identity.publicIdentity(reference.handle));
 const messaging=createLocalNobleNostrProvider(),peer=await messaging.generate(),other=await messaging.generate(),participants=[self,peer.publicKey];
 const document={format:TERMS_REVIEW_FORMAT,terms:structuredClone(scenario.sets.native.terms),privateAgreement:structuredClone(scenario.sets.native.privateAgreementInput)};
 const terms=document.terms,domain={chainId:'31337',verifyingContract:registry.deployment('local-evm','escrow-local-v1').address};
 const binding={chain:'evm',networkId:terms.networkId,deploymentId:terms.deploymentId,tradeId:evmTermsHash(domain,terms)};
 const rows=[{id:id(1),kind:'trade',schemaVersion:1,payload:encodeSavedReviewPayload('file',new TextEncoder().encode(JSON.stringify(document)))}];
 for(const [index,action] of ['fund','release'].entries()){
  const expected=escrowCallFor(action==='fund'?{action,domain,terms}:{action,escrow:domain.verifyingContract,tradeId:binding.tradeId});
  const prepared={v:1,chainId:domain.chainId,from:terms.seller,to:expected.call.to,data:expected.call.data,value:expected.call.value,nonce:String(index),preparedAtBlock:'1'};
  rows.push({id:id(2+index),kind:'journal',schemaVersion:1,payload:encodeIntentPayload({version:1,intentId:Buffer.alloc(32,index+2).toString('base64url'),binding,account:terms.seller,action,state:'finalized',walletGeneration:1,expectedEscrowState:expected.expectedEscrowState,preparedRequest:JSON.stringify(prepared),submission:{chain:'evm',hash:'0x'+String(index+2).repeat(64),nonce:String(index)},replacementOf:null,createdAt:0,updatedAt:0})});
 }
 if(unknown)rows.push({id:id(99),kind:'trade',schemaVersion:2,payload:'e30'});
 const lease=good(vault.captureSession(session,()=>{}));good(await vault.commit(session.sessionId,lease.current().revision,rows.map(record=>({op:'put',record}))));lease.dispose();
 const chat=good(createDurableTradeChat({vault,session,provider:messaging,binding,participants,selfPublicKey:self,nowMs:()=>100}));
 for(let i=0;i<2;i++){const bytes=good(encodeMessage({format:'p2p-offramp-message',version:1,binding,termsHash:binding.tradeId,messageId:String(i+4).repeat(32),sender:self,recipient:peer.publicKey,kind:'text',createdAt:100,body:'PRIVATE native retention chat'}));good(await chat.send(bytes,secret));bytes.fill(0);}
 const conversationId=chat.conversationId;chat.close();
 if(tamper){const record=good(await vault.list(session.sessionId,'chat'))[0],bytes=decodeBase64url(record.payload,1,262144);const raw=JSON.parse(new TextDecoder().decode(bytes));bytes.fill(0);raw.wrap.content+='A';const changed=new TextEncoder().encode(JSON.stringify(raw)),current=good(vault.captureSession(session,()=>{}));good(await vault.commit(session.sessionId,current.current().revision,[{op:'put',record:{...record,payload:encodeBase64url(changed)}}]));changed.fill(0);current.dispose();}
 const state={clock:1000,live:true,credit:'0x'+'0'.repeat(64),escrowState:'released',observations:0,requests:[],mutate:false,cleanupThrows:false,disposed:0};
 let journalOptions;
 const native={evmTermsHash,escrowCallFor,buildPendingWithdrawals,policy:{finality:{kind:'evm-finalized-tag'},confirmations:2,dropAfterBlocks:3},
  async readObservation(input){state.observations++;state.onObservation?.(state.observations);return{ok:true,value:{binding:input.binding,generation:0,requestSequence:1,anchor,state:state.escrowState,finality:'finalized',observedAt:Date.now()}};},
  createEip1193ChainReader(){return{};},
  createLifecycleJournal(options){journalOptions=options;const lease=good(vault.captureSession(session,()=>{})),verified=new Set();return{
   async list(){return{ok:true,value:good(await options.vault.list(session.sessionId,'journal')).map(record=>decodeIntentPayload(record.payload))};},
   currentRevision:()=>lease.current()?.revision??null,isTerminalVerified:intent=>verified.has(intent),verified,
   dispose(){lease.dispose();state.disposed++;if(state.cleanupThrows)throw Error('PRIVATE cleanup');},
  };},
  createEvmTxLifecycle({journal}){return{
   async reconcile(id){const intent=good(await journal.list()).find(intent=>intent.intentId===id),canonical=await journalOptions.validateCanonical(intent);if(!canonical.ok)return canonical;
    if(state.mutate){const lease=good(vault.captureSession(session,()=>{}));const result=await journalOptions.vault.commit(session.sessionId,lease.current().revision,[{op:'delete',id:'00'.repeat(16)}]);lease.dispose();assert.equal(result.ok,false);return{ok:false,error:{code:'CONFLICT'}};}
    journal.verified.add(id);return{ok:true,value:{outcome:'finalized',intent,evidence:'receipt',escrowState:state.escrowState}};
   },dispose(){state.disposed++;},
  };},
 };
 const request=async input=>{state.requests.push(input);if(input.method==='eth_call')return state.credit;if(input.method==='eth_getBlockByNumber')return{number:'0x10',hash:anchor.hash};throw Error('PRIVATE request');};
 const options={vault,session,registry,native,request,contexts:contexts==='missing'?[]:[{identityRecordId:reference.identityRecordId,binding,participants:contexts==='wrong'?[self,other.publicKey]:participants}],currentScope:()=>state.live,now:()=>state.clock,maxAgeMs:10000};
 const authority=createNativeRetentionAuthority(options),service=new RetentionService(vault,session,authority);
 t.after(()=>{service.dispose();authority.dispose();identity.dispose();vault.dispose();secret.fill(0);peer.secretKey.fill(0);other.secretKey.fill(0);});
 return{store,vault,session,reference,binding,conversationId,state,options,authority,service};
}
test('concrete adapter binds actual saved terms and complete native chat to one closed journal set; one CAS preserves identity',async t=>{
 const s=await setup(t),writes=s.store.writes;const plan=good(await s.service.reviewRetention(Date.now()));
 assert.equal(plan.reviewedDeleteCount,5);assert.equal(plan.protectedCount,1);assert.equal(s.store.writes,writes,'already terminal review never writes a journal transition');
 const receipt=good(await s.service.deleteReviewedRecords(plan,consent(plan)));assert.equal(receipt.deletedCount,5);assert.equal(s.store.writes,writes+1);
 const records=good(await s.vault.list(s.session.sessionId));assert.deepEqual(records.map(record=>record.id),[s.reference.identityRecordId]);
 assert.equal(s.state.requests.some(request=>/send|sign|requestAccounts/.test(request.method)),false);
});
test('funded escrow, nonzero or unknown canonical deferred credit never qualify a persisted terminal label',async t=>{
 const s=await setup(t),writes=s.store.writes;
 for(const [escrowState,credit] of [['funded','0x'+'0'.repeat(64)],['released','0x'+'0'.repeat(63)+'1'],['released','0x0'],['released',undefined]]){
  s.state.escrowState=escrowState;s.state.credit=credit;const plan=good(await s.service.reviewRetention(Date.now()));assert.equal(plan.reviewedDeleteCount,0);assert.equal(plan.protectedCount,6);assert.equal(s.store.writes,writes);
 }
 s.state.credit='0x'+'0'.repeat(64);assert.equal(good(await s.service.reviewRetention(Date.now())).reviewedDeleteCount,5);
});
test('future dependencies, missing or wrong native conversation and corrupted NIP17 protect the whole closure',async t=>{
 for(const options of [{unknown:true},{contexts:'missing'},{contexts:'wrong'},{tamper:true}]){
  const s=await setup(t,options),writes=s.store.writes,plan=good(await s.service.reviewRetention(Date.now()));assert.equal(plan.reviewedDeleteCount,0);assert.equal(s.store.writes,writes);
  if(options.unknown)assert.equal(s.state.observations,0,'future schema never starts native dependency work');
 }
});
test('a reconciliation transition cannot write during retention or erase the original scope',async t=>{
 const s=await setup(t);s.state.mutate=true;const original=JSON.stringify(good(await s.vault.list(s.session.sessionId))),writes=s.store.writes;
 assert.equal(good(await s.service.reviewRetention(Date.now())).reviewedDeleteCount,0);assert.equal(s.store.writes,writes);assert.equal(JSON.stringify(good(await s.vault.list(s.session.sessionId))),original);
});
test('native credit becoming unpaid after preview refuses confirmation and preserves every record',async t=>{
 const s=await setup(t),plan=good(await s.service.reviewRetention(Date.now())),writes=s.store.writes;s.state.credit='0x'+'0'.repeat(63)+'1';
 const result=await s.service.deleteReviewedRecords(plan,consent(plan));assert.equal(result.ok,false);assert.equal(s.store.writes,writes);assert.equal(good(await s.vault.list(s.session.sessionId)).length,6);
});
async function actualScope(s){
 const records=good(await s.vault.list(s.session.sessionId)),lease=good(s.vault.captureSession(s.session,()=>{})),revision=lease.current().revision;lease.dispose();
 const candidates=records.filter(record=>record.kind!=='identity').map(record=>({record,purpose:record.kind==='journal'?'terminal-intent':record.kind==='chat'?'chat-history':'saved-terms-review',reviewTimestamp:record.kind==='journal'?0:record.kind==='chat'?100:null,conversationId:record.kind==='chat'?s.conversationId:null}));
 return{profileId:s.session.profileId,revision,records,candidates};
}
test('native adapter honors branded signals through intrinsics and isolates every throwing cleanup',async t=>{
 const s=await setup(t),scope=await actualScope(s),controller=new AbortController();let calls=0;
 for(const name of ['addEventListener','removeEventListener'])Object.defineProperty(controller.signal,name,{value(){calls++;throw Error('PRIVATE shadowed signal');}});
 Object.defineProperty(controller.signal,'aborted',{get(){calls++;throw Error('PRIVATE shadowed flag');}});
 const proof=await s.authority.reviewNative(scope,controller.signal);assert.equal(proof.safeRecordIds.length,5);assert.equal(proof.current(),true);controller.abort();assert.equal(proof.current(),false);proof.dispose();assert.equal(calls,0);
 await assert.rejects(()=>s.authority.reviewNative(scope,new Proxy({},{get(){throw Error('PRIVATE malformed signal');}})),error=>!/PRIVATE/.test(String(error)));
 s.state.cleanupThrows=true;const plan=good(await s.service.reviewRetention(Date.now()));assert.equal(plan.reviewedDeleteCount,5);assert.ok(s.state.disposed>=4,'native journal and coordinator cleanup both run');
 const capture=s.vault.captureSession.bind(s.vault),wrapped=new Proxy(s.vault,{get(target,name){if(name==='captureSession')return(...args)=>{const result=capture(...args);return result.ok?{ok:true,value:{current:result.value.current.bind(result.value),dispose(){result.value.dispose();throw Error('PRIVATE lease cleanup');}}}:result;};const value=Reflect.get(target,name);return typeof value==='function'?value.bind(target):value;}});
 const guarded=createNativeRetentionAuthority({...s.options,vault:wrapped});assert.doesNotThrow(()=>guarded.dispose());assert.doesNotThrow(()=>guarded.dispose());
});

test('deferred credit discovered after history authentication protects the entire native closure',async t=>{
 const s=await setup(t),writes=s.store.writes;s.state.onObservation=count=>{if(count>=3)s.state.credit='0x'+'0'.repeat(63)+'1';};
 const plan=good(await s.service.reviewRetention(Date.now()));assert.equal(s.state.observations,3);assert.equal(plan.reviewedDeleteCount,0);assert.equal(plan.protectedCount,6);assert.equal(s.store.writes,writes);
});
