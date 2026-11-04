// Restart recovery of the private journey over the REAL encrypted vault, intent journal and tx lifecycle.
// Only the wallet adapter, escrow observation and RPC are fakes; every fake RPC send is counted and refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPrivateTradeJourney} from '../src/journey/private-trade.ts';
import {RegistryService,buildTradeDraftDocument,reviewTermsBytes} from '../../../packages/domain/index.ts';
import {EncryptedVaultService,EncryptedBackupService} from '../../../packages/storage/index.ts';
import {MessagingIdentityService} from '../../../packages/identity/src/identity-service.ts';
import {createLocalNobleIdentityProvider} from '../../../packages/identity/index.ts';
import {evmTermsHash} from '../../../packages/wallet/src/evm-terms.ts';
import {createEip1193ChainReader,escrowCallFor} from '../../../packages/wallet/src/evm-submit.ts';
import {createLifecycleJournal} from '../../../packages/domain/src/intent-journal.ts';
import {createEvmTxLifecycle,evmFinalityPolicy} from '../../../packages/domain/src/tx-lifecycle.ts';
import {decodeIntentPayload,encodeBase64url} from '../../../packages/schemas/index.ts';

const registryUrl=new URL('../../../packages/domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url);
const registryBytes=new Uint8Array(await readFile(registryUrl));
const registryDigest=createHash('sha256').update(registryBytes).digest('hex');
const pass='Native localproof recovery profile passphrase';
const SELLER='0x'+'1'.repeat(40);
const BUYER='0x'+'2'.repeat(40);
const NOW=1_900_000_000;
const SENT_HASH='0x'+'b'.repeat(64);

class Store{
 rows=new Map();
 async get(id){return structuredClone(this.rows.get(id));}
 async add(row,o){
  o?.assertCurrent?.();
  this.rows.set(row.profileId,structuredClone(row));
 }
 async compareAndSwap(old,row,o){
  o?.assertCurrent?.();
  assert.equal(JSON.stringify(this.rows.get(old.profileId)),JSON.stringify(old));
  this.rows.set(row.profileId,structuredClone(row));
 }
 subscribeInvalidation(){return()=>{};}
 async listProfileIds(){return{profileIds:[...this.rows.keys()],truncated:false};}
}
const value=response=>{
 assert.equal(response.result.ok,true,JSON.stringify(response));
 return response.result.value;
};
const ok=result=>{
 assert.equal(result.ok,true,JSON.stringify(result));
 return result.value;
};
async function loadedRegistry(){
 const registry=new RegistryService();
 ok(await registry.load(registryBytes,registryDigest));
 return registry;
}

class FakeWallet{
 constructor(){
  const capabilities=Object.freeze({signTerms:true,sendTransaction:true,signTransaction:false});
  this.session=Object.freeze({
   providerId:'fixture',chain:'evm',networkId:'local-evm',account:SELLER,generation:1,capabilities,
  });
 }
 async connect(){return{ok:true,value:this.session};}
 inspect(){return this.session;}
 async signTerms(){throw Error('UNEXPECTED_SIGNATURE');}
 subscribe(){return()=>{};}
 dispose(){}
}

/** One simulated Worker over a shared encrypted store. `chain.escrowState` is what native observation reports. */
function worker(store,chain){
 const vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
 const backup=new EncryptedBackupService(store);
 const request=async({method})=>{
  if(method==='eth_sendTransaction'){
   chain.sends++;
   throw Error('UNEXPECTED_SEND');
  }
  if(method==='eth_chainId')return'0x7a69';
  if(method==='eth_getBlockByNumber')return{number:'0x10',hash:'0x'+'a'.repeat(64),timestamp:'0x'+NOW.toString(16)};
  if(method==='eth_getTransactionCount')return'0x0';
  throw Error('UNEXPECTED_RPC');
 };
 const unexpected=async()=>{throw Error('UNEXPECTED');};
 const inert={invalidate(){},dispose(){}};
 const native={
  MessagingIdentityService,
  createIdentityProvider:createLocalNobleIdentityProvider,
  EvmWalletAdapter:FakeWallet,
  walletProvider(){return{request};},
  selectorOf(){throw Error('UNEXPECTED');},
  evmTermsHash,
  escrowCallFor,
  decodeIntentPayload,
  async readObservation(){return{ok:true,value:{state:chain.escrowState}};},
  verifyEvmAgreementBundle:unexpected,
  createEip1193ChainReader,
  createLifecycleJournal,
  createEvmTxLifecycle,
  policy:evmFinalityPolicy({chain:'evm',finality:{kind:'evm-finalized-tag'}},2,3),
  createEvmPaymentPreflight(){return{ok:true,value:{...inert,view(){return null;},read:unexpected}};},
  createTradeAuthority(){
   return{...inert,currentGeneration:0,readView(){throw Error('UNEXPECTED');},refresh:unexpected};
  },
  createTradeComposition(){return{...inert,read:unexpected};},
 };
 const createRelay=()=>{throw Error('UNEXPECTED_RELAY');};
 const services={vault,backup};
 const journey=createPrivateTradeJourney({services,native,registryBytes,registryDigest,request,createRelay});
 return{vault,journey};
}

/** Worker 1: a profile with one saved ERC-20 trade review and a verified backup, then the Worker stops. */
async function savedTrade(store,chain){
 const registry=await loadedRegistry();
 const {journey}=worker(store,chain);
 try{
  const profileId=value(await journey.runtime({operation:'create',passphrase:pass})).handle.profileId;
  const draft={
   networkId:'local-evm',deploymentId:'escrow-local-v1',assetId:'test-usd',amountBaseUnits:'1000',
   fiatCurrency:'USD',fiatMinorUnits:'100',fiatScale:2,
   paymentInstructions:'SYNTHETIC manual bank transfer instruction.',
   seller:SELLER,buyer:BUYER,acceptBeforeSeconds:String(NOW+600),escrowExpirySeconds:String(NOW+7200),
  };
  const generated=await buildTradeDraftDocument(registry,draft,{nowSeconds:()=>BigInt(NOW),isCurrent:()=>true});
  assert.equal(generated.ok,true,JSON.stringify(generated));
  value(await journey.runtime({operation:'saveTermsReview',profileId,source:'file',bytes:generated.bytes}));
  const exported=value(await journey.runtime({operation:'exportEncrypted',profileId}));
  value(await journey.runtime({operation:'verifyBackup',profileId,bytes:exported.bytes,passphrase:pass}));
  const saved=value(await journey.runtime({operation:'listTermsReviews',profileId})).items;
  assert.equal(saved.length,1);
  const recordId=saved[0].recordId;
  for(const item of saved)item.bytes.fill(0);
  return{profileId,recordId,terms:await reviewedTerms(registry,generated.bytes)};
 }finally{journey.dispose();}
}

/** The exact EvmTerms the journey derives from the saved review (same fields as its `asTerms`). */
async function reviewedTerms(registry,bytes){
 const r=ok(await reviewTermsBytes(registry,bytes));
 return{
  orderId:r.orderId,revision:r.revision,networkId:r.network.id,deploymentId:r.deployment.id,
  seller:r.seller,buyer:r.buyer,assetKind:r.asset.kind,asset:r.asset.address,amountBaseUnits:r.amountBaseUnits,
  privateAgreementHash:r.privateAgreementSha256,capabilitiesHash:r.capabilitiesSha256,sellerNonce:r.sellerNonce,
  acceptBeforeSeconds:r.acceptBeforeSeconds,escrowExpirySeconds:r.escrowExpirySeconds,
 };
}

/**
 * Worker 2 crashes after `prepare` reserved its intents. An entry with `marked: true` also crossed the durable
 * send marker (`markSending`, written before any broadcast), so its outcome is uncertain. An entry with
 * `finalizedHash` was sent and natively verified final in that Worker. Every other entry was never sent.
 * Reservations go through the real lifecycle journal, exactly as `EvmTxLifecycle.prepare`/`submit` write them.
 */
async function crashAfterPrepare(store,profileId,entries){
 const registry=await loadedRegistry();
 const vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
 try{
  const session=ok(await vault.unlock(profileId,pass));
  const deployment=registry.deployment('local-evm','escrow-local-v1');
  const token=registry.network('local-evm').assets.find(asset=>asset.id==='test-usd').address;
  const domain={chainId:'31337',verifyingContract:deployment.address};
  const journal=createLifecycleJournal({vault,session,validateCanonical:async()=>({ok:true,value:undefined})});
  try{
   const intents=[];
   for(const[index,{action,terms,marked,finalizedHash}]of entries.entries()){
    const nonce=String(index);
    const binding={chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:evmTermsHash(domain,terms)};
    const {call,expectedEscrowState}=action==='approve'
     ?escrowCallFor({action:'approve',token,spender:deployment.address,amountBaseUnits:terms.amountBaseUnits})
     :escrowCallFor({action:'fund',domain,terms});
    const preparedRequest=JSON.stringify({
     v:1,chainId:'31337',from:SELLER,to:call.to,data:call.data,value:call.value,nonce,preparedAtBlock:'16',
    });
    const intent={
     version:1,intentId:encodeBase64url(crypto.getRandomValues(new Uint8Array(32))),binding,account:SELLER,action,
     state:'prepared',walletGeneration:1,expectedEscrowState,preparedRequest,submission:{chain:'evm',hash:null,nonce},
     replacementOf:null,createdAt:NOW,updatedAt:NOW,
    };
    ok(await journal.reserve(intent,journal.currentRevision()));
    if(marked||finalizedHash)ok(await journal.markSending(intent.intentId));
    if(finalizedHash){
     ok(await journal.observe(intent.intentId,{state:'finalized',hash:finalizedHash}));
     ok(await journal.authorizeTerminal(intent.intentId,{state:'finalized',hash:finalizedHash}));
    }
    intents.push(intent);
   }
   return intents;
  }finally{journal.dispose();}
 }finally{
  vault.lockAll();
  vault.dispose();
 }
}

/** Worker 3: a fresh restart unlocks the same profile; the caller then asks it to recover the saved trade. */
async function restart(store,chain,profileId){
 const restarted=worker(store,chain);
 value(await restarted.journey.runtime({operation:'unlock',profileId,passphrase:pass}));
 return restarted.journey;
}

/** Durable journal rows as written, read through an independent session. */
async function journalStates(store,profileId){
 const vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
 try{
  const session=ok(await vault.unlock(profileId,pass));
  const rows=ok(await vault.list(session.sessionId,'journal'));
  return rows.map(row=>decodeIntentPayload(row.payload))
   .map(intent=>({action:intent.action,state:intent.state,hash:intent.submission.hash}))
   .sort((a,b)=>a.action.localeCompare(b.action));
 }finally{
  vault.lockAll();
  vault.dispose();
 }
}

/** A saved trade whose Worker crashed with `entries` journaled for it (built from that trade's terms). */
async function crashedTrade(escrowState,entriesFor){
 const store=new Store(),chain={escrowState,sends:0};
 const {profileId,recordId,terms}=await savedTrade(store,chain);
 const intents=await crashAfterPrepare(store,profileId,entriesFor(terms));
 return{store,chain,profileId,recordId,intents};
}

test('an approval prepared but never marked for sending returns to explicit re-acceptance, never a send',async()=>{
 const {store,chain,profileId,recordId}=await crashedTrade('absent',terms=>[{action:'approve',terms}]);
 const journey=await restart(store,chain,profileId);
 try{
  const recovered=await journey.act('watch',{recordId});
  assert.equal(recovered.phase,'recovered-acceptance-required');
  assert.equal(recovered.intentId,null,'a cancelled never-sent approval is not selected for reconciliation');
  assert.deepEqual(await journalStates(store,profileId),[{action:'approve',state:'failed',hash:null}]);
  assert.equal(chain.sends,0,'restart recovery never resubmits the cancelled approval');
  // Re-acceptance still requires a fresh explicit signing review; nothing is imported from the recovered state.
  await assert.rejects(journey.act('accept-recovered',{reviewRiskAccepted:true}),/SIGNING_REVIEW_REQUIRED/);
  for(const action of['approve','fund'])await assert.rejects(journey.act(action),/OUT_OF_ORDER/);
  assert.equal(chain.sends,0);
 }finally{journey.dispose();}
});

test('a later restart never treats the restored cancellation label as never-sent proof and never sends',async()=>{
 const {store,chain,profileId,recordId}=await crashedTrade('absent',terms=>[{action:'approve',terms}]);
 const first=await restart(store,chain,profileId);
 try{
  assert.equal((await first.act('watch',{recordId})).phase,'recovered-acceptance-required');
 }finally{first.dispose();}
 // Only the live cancellation above proved "never sent"; the persisted "failed" label alone is not proof.
 const second=await restart(store,chain,profileId);
 try{
  await assert.rejects(second.act('watch',{recordId}),/RECOVERY_SELECTION_REQUIRED/);
  assert.equal(second.snapshot().phase,'setup');
  assert.deepEqual(await journalStates(store,profileId),[{action:'approve',state:'failed',hash:null}]);
  assert.equal(chain.sends,0);
 }finally{second.dispose();}
});

test('a never-sent fund intent keeps its terminal cancellation phase at restart',async()=>{
 const {store,chain,profileId,recordId}=await crashedTrade('absent',terms=>[{action:'fund',terms}]);
 const journey=await restart(store,chain,profileId);
 try{
  assert.equal((await journey.act('watch',{recordId})).phase,'cancelled-before-send');
  assert.deepEqual(await journalStates(store,profileId),[{action:'fund',state:'failed',hash:null}]);
  assert.equal(chain.sends,0);
 }finally{journey.dispose();}
});

test('a never-sent approval for another trade does not unlock re-acceptance of the selected trade',async()=>{
 const otherTrade=terms=>[{action:'approve',terms:{...terms,sellerNonce:'0'.repeat(63)+'1'}}];
 const {store,chain,profileId,recordId}=await crashedTrade('absent',otherTrade);
 const journey=await restart(store,chain,profileId);
 try{
  await assert.rejects(journey.act('watch',{recordId}),/RECOVERY_SELECTION_REQUIRED/);
  assert.equal(journey.snapshot().phase,'setup');
  assert.equal(chain.sends,0);
 }finally{journey.dispose();}
});

test('a cancelled never-sent approval never hides a funded escrow from reconciliation',async()=>{
 const {store,chain,profileId,recordId}=await crashedTrade('funded',terms=>[{action:'approve',terms}]);
 const journey=await restart(store,chain,profileId);
 try{
  await assert.rejects(journey.act('watch',{recordId}),/RECOVERY_SELECTION_REQUIRED/);
  assert.equal(journey.snapshot().phase,'setup');
  assert.equal(chain.sends,0);
 }finally{journey.dispose();}
});

test('an approval that crossed its send marker is reconciled at restart, never resent or cancelled',async()=>{
 const uncertain=terms=>[{action:'approve',terms,marked:true}];
 const {store,chain,profileId,recordId,intents}=await crashedTrade('absent',uncertain);
 const journey=await restart(store,chain,profileId);
 try{
  const recovered=await journey.act('watch',{recordId});
  assert.equal(recovered.phase,'approval-reconcile');
  assert.equal(recovered.intentId,intents[0].intentId);
  assert.deepEqual(await journalStates(store,profileId),[{action:'approve',state:'broadcast-unknown',hash:null}]);
  assert.equal(chain.sends,0);
 }finally{journey.dispose();}
});

test('a never-sent fund after a sent approval is cancelled; the approval is re-read, never resent',async()=>{
 const sentThenUnsent=terms=>[{action:'approve',terms,finalizedHash:SENT_HASH},{action:'fund',terms}];
 const {store,chain,profileId,recordId,intents}=await crashedTrade('absent',sentThenUnsent);
 const journey=await restart(store,chain,profileId);
 try{
  const recovered=await journey.act('watch',{recordId});
  // A restored "finalized" label is not proof: the approval must be re-read natively before re-acceptance.
  assert.equal(recovered.phase,'approval-reconcile');
  assert.equal(recovered.intentId,intents[0].intentId);
  assert.deepEqual(await journalStates(store,profileId),[
   {action:'approve',state:'finalized',hash:SENT_HASH},
   {action:'fund',state:'failed',hash:null},
  ]);
  assert.equal(chain.sends,0);
 }finally{journey.dispose();}
});

test('the journal never holds a fund intent beside an unsent or uncertain approval of the same trade',async()=>{
 for(const marked of[false,true]){
  const bothOutstanding=terms=>[{action:'approve',terms,marked},{action:'fund',terms}];
  await assert.rejects(crashedTrade('absent',bothOutstanding),/CONFLICT/);
 }
});
