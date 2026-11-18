// Restart recovery of the private journey over the REAL encrypted vault, intent journal and tx lifecycle.
// Only the wallet adapter, escrow observation and the chain (RPC and chain reader) are fakes; every fake RPC
// send from a restarted journey is counted and refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTradeDraftDocument,reviewTermsBytes} from '../../../packages/domain/index.ts';
import {escrowCallFor} from '../../../packages/wallet/src/evm-submit.ts';
import {evmTermsHash} from '../../../packages/wallet/src/evm-terms.ts';
import {createEvmTxLifecycle} from '../../../packages/domain/src/tx-lifecycle.ts';
import {encodeBase64url} from '../../../packages/schemas/index.ts';
import {
 registry,ok,Store,value,SELLER,BUYER,NOW,policy,fakeChain as harnessChain,workerJourney,withJournal as harnessJournal,
 journalIntents,
} from './support/journey-harness.mjs';

const pass='Native localproof recovery profile passphrase';
const OTHER='0x'+'3'.repeat(40);
const SENT_HASH='0x'+'b'.repeat(64);
const PREPARED_AT=16;
const deployment=registry.deployment('local-evm','escrow-local-v1');
const token=registry.network('local-evm').assets.find(asset=>asset.id==='test-usd');
const domain={chainId:'31337',verifyingContract:deployment.address};
const bindingOf=terms=>({
 chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:evmTermsHash(domain,terms),
});
const approveCall=(terms,amount=terms.amountBaseUnits)=>
 escrowCallFor({action:'approve',token:token.address,spender:deployment.address,amountBaseUnits:amount});

/** The shared fake chain, prepared at block 16 over the 12-digit-balance test token; every restart send is refused. */
const fakeChain=escrowState=>harnessChain({
 escrow:deployment.address,escrowState,send:'refuse',head:PREPARED_AT,decimals:token.decimals,balance:10n**12n,
});
const withJournal=(store,profileId,work)=>harnessJournal(store,profileId,pass,work);

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

/** One simulated Worker over a shared encrypted store, reading the shared fake `chain`. */
function worker(store,chain){
 const unexpected=async()=>{throw Error('UNEXPECTED');};
 const guidanceOf=(binding,finalizedAnchor)=>({
  evidence:'native-rpc',economicPreparationAllowed:false,binding,termsHash:binding.tradeId,
  finalizedAnchor,decision:'allow-guidance',reason:'ok',
 });
 const nativeExtras={verifyEvmAgreementBundle:unexpected};
 const journeyOptions={createRelay(){throw Error('UNEXPECTED_RELAY');}};
 return workerJourney({store,chain,FakeWallet,guidanceOf,nativeExtras,journeyOptions});
}

/** Worker 1: a profile with one saved ERC-20 trade review and a verified backup, then the Worker stops. */
async function savedTrade(store,chain){
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
  return{profileId,recordId,terms:await reviewedTerms(generated.bytes)};
 }finally{journey.dispose();}
}

/** The exact EvmTerms the journey derives from the saved review (same fields as its `asTerms`). */
async function reviewedTerms(bytes){
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
 return withJournal(store,profileId,async journal=>{
  const intents=[];
  for(const[index,{action,terms,marked,finalizedHash,amount}]of entries.entries()){
   const nonce=String(index);
   const {call,expectedEscrowState}=action==='approve'
    ?approveCall(terms,amount)
    :escrowCallFor({action:'fund',domain,terms});
   const preparedRequest=JSON.stringify({
    v:1,chainId:'31337',from:SELLER,to:call.to,data:call.data,value:call.value,nonce,
    preparedAtBlock:String(PREPARED_AT),
   });
   const intent={
    version:1,intentId:encodeBase64url(crypto.getRandomValues(new Uint8Array(32))),binding:bindingOf(terms),
    account:SELLER,action,state:'prepared',walletGeneration:1,expectedEscrowState,preparedRequest,
    submission:{chain:'evm',hash:null,nonce},replacementOf:null,createdAt:NOW,updatedAt:NOW,
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
 });
}

/** A real EvmTxLifecycle over the shared journal and fake chain; `send` answers its single send-capable call. */
async function withLifecycle(store,chain,profileId,send,work){
 return withJournal(store,profileId,async journal=>{
  const wallet=async({method,params})=>{
   if(method==='eth_accounts')return[SELLER];
   if(method==='eth_chainId')return'0x7a69';
   if(method==='eth_sendTransaction')return send(params[0]);
   throw Error('UNEXPECTED_WALLET');
  };
  const life=createEvmTxLifecycle({journal,reader:chain.reader,wallet,policy});
  try{
   await life.walletChanged({account:SELLER,chainId:'31337',generation:1});
   return await work(life);
  }finally{life.dispose();}
 });
}
const mineSent=chain=>tx=>chain.mine({
 from:tx.from,to:tx.to,input:tx.data,value:String(BigInt(tx.value)),nonce:String(BigInt(tx.nonce)),
});

/**
 * The durable outcome of the reverted 45630ba path: one live restart cancels the never-sent approval A1 (only
 * that Worker's journal holds its never-sent proof), then re-approval A2 and funding F1 are sent and natively
 * finalized through the same lifecycle, exactly the writes its accept-recovered/approve/fund steps make.
 * `foreignSend` first spends A1's nonce on an unrelated wallet transaction; `approveAmount` sets A2's calldata.
 */
async function fundAfterRecoveredCancellation(store,chain,profileId,terms,{approveAmount,foreignSend=false}={}){
 await withLifecycle(store,chain,profileId,mineSent(chain),async life=>{
  assert.deepEqual(ok(await life.recover()),[],'the restart cancels the never-sent approval and keeps nothing else');
  if(foreignSend)chain.mine({from:SELLER,to:OTHER,input:'0x',value:'1',nonce:String(chain.nonce)});
  const steps=[['approve',approveCall(terms,approveAmount)],['fund',escrowCallFor({action:'fund',domain,terms})]];
  for(const[action,{call,expectedEscrowState}]of steps){
   const prepared=ok(await life.prepare({binding:bindingOf(terms),action,expectedEscrowState,call}));
   ok(await life.submit(prepared));
   assert.equal(ok(await life.reconcile(prepared.intentId)).outcome,'finalized');
  }
 });
 assert.equal(chain.escrowState,'funded');
}

/** Worker 3: a fresh restart unlocks the same profile; the caller then asks it to recover the saved trade. */
async function restart(store,chain,profileId){
 const restarted=worker(store,chain);
 value(await restarted.journey.runtime({operation:'unlock',profileId,passphrase:pass}));
 return restarted.journey;
}

/** Durable journal rows as written, read through an independent session. */
const journalRows=(store,profileId)=>journalIntents(store,profileId,pass);
async function journalStates(store,profileId){
 return(await journalRows(store,profileId))
  .map(intent=>({action:intent.action,state:intent.state,hash:intent.submission.hash}))
  .sort((a,b)=>a.action.localeCompare(b.action)||String(a.hash).localeCompare(String(b.hash)));
}

/** A saved trade whose Worker crashed with `entries` journaled for it (built from that trade's terms). */
async function crashedTrade(escrowState,entriesFor){
 const store=new Store(),chain=fakeChain(escrowState);
 const {profileId,recordId,terms}=await savedTrade(store,chain);
 const intents=await crashAfterPrepare(store,profileId,entriesFor(terms));
 return{store,chain,profileId,recordId,terms,intents};
}

/** A restart of the crashed trade is refused with a recovery selection, stays in setup and never sends. */
async function failsClosedAtRestart(escrowState,entriesFor){
 const {store,chain,profileId,recordId}=await crashedTrade(escrowState,entriesFor);
 const journey=await restart(store,chain,profileId);
 try{
  await assert.rejects(journey.act('watch',{recordId}),/RECOVERY_SELECTION_REQUIRED/);
  assert.equal(journey.snapshot().phase,'setup');
  assert.equal(chain.sends,0);
 }finally{journey.dispose();}
}

test('an approval prepared but never marked fails closed before funding at every restart, never a send',async()=>{
 const {store,chain,profileId,recordId}=await crashedTrade('absent',terms=>[{action:'approve',terms}]);
 for(let attempt=0;attempt<2;attempt++){
  const journey=await restart(store,chain,profileId);
  try{
   // A durable {failed, hash null} approval cannot be told apart from a wallet-rejected send (see the 4001 test
   // below), so a later restart could never reconcile it. No path to re-approval or funding may open here.
   await assert.rejects(journey.act('watch',{recordId}),/RECOVERY_SELECTION_REQUIRED/);
   assert.equal(journey.snapshot().phase,'setup');
   await assert.rejects(journey.act('accept-recovered',{reviewRiskAccepted:true}),/RISK_CONFIRMATION_REQUIRED/);
   for(const action of['approve','fund'])await assert.rejects(journey.act(action),/OUT_OF_ORDER/);
   assert.deepEqual(await journalStates(store,profileId),[{action:'approve',state:'failed',hash:null}]);
   assert.equal(chain.sends,0,'restart recovery never resubmits the cancelled approval');
  }finally{journey.dispose();}
 }
});

test('a wallet-rejected send after its marker leaves the same durable row as a never-sent cancellation',async()=>{
 const rows={};
 for(const kind of['never-marked','wallet-rejected']){
  const store=new Store(),chain=fakeChain('absent');
  const {profileId,recordId,terms}=await savedTrade(store,chain);
  if(kind==='never-marked'){
   await crashAfterPrepare(store,profileId,[{action:'approve',terms}]);
   await withLifecycle(store,chain,profileId,()=>{throw Error('UNEXPECTED_SEND');},async life=>{
    assert.deepEqual(ok(await life.recover()),[]);
   });
  }else{
   const rejected=()=>{throw Object.assign(Error('rejected'),{code:4001});};
   await withLifecycle(store,chain,profileId,rejected,async life=>{
    const {call,expectedEscrowState}=approveCall(terms);
    const prepared=ok(await life.prepare({binding:bindingOf(terms),action:'approve',expectedEscrowState,call}));
    const sent=await life.submit(prepared);
    assert.equal(sent.ok,false);
    assert.equal(sent.error.code,'USER_REJECTED');
   });
  }
  const [row]=await journalRows(store,profileId);
  rows[kind]={state:row.state,submission:row.submission,action:row.action,replacementOf:row.replacementOf,
   fields:Object.keys(row).sort((a,b)=>a<b?-1:a>b?1:0)};
  // Either way a restart has no durable fact proving "never broadcast", so it fails closed and never sends.
  const journey=await restart(store,chain,profileId);
  try{
   await assert.rejects(journey.act('watch',{recordId}),/RECOVERY_SELECTION_REQUIRED/);
   assert.equal(chain.sends,0);
  }finally{journey.dispose();}
 }
 assert.deepEqual(rows['wallet-rejected'],rows['never-marked']);
 assert.deepEqual(rows['never-marked'].submission,{chain:'evm',hash:null,nonce:'0'});
});

/**
 * Reviewer regression for the reverted 45630ba path: A1 prepared, crash before its send marker; a restart
 * cancels it; A2 approve and F1 fund are sent and finalized (escrow funded); a later restart must still reach
 * the funded phases where release and the timeout refund are offered, without re-sending anything.
 */
async function fundedRestart({approveAmount,foreignSend=false,laterBlocks=0,a1Amount}={}){
 const {store,chain,profileId,recordId,terms}=await crashedTrade('absent',terms=>[
  {action:'approve',terms,amount:a1Amount},
 ]);
 await fundAfterRecoveredCancellation(store,chain,profileId,terms,{approveAmount,foreignSend});
 chain.advance(laterBlocks);
 const journey=await restart(store,chain,profileId);
 try{
  const recovered=await journey.act('watch',{recordId});
  assert.equal(recovered.phase,'reconcile');
  // payment-coordination is the phase in which both release and the timeout refund are signable.
  assert.equal((await journey.act('reconcile')).phase,'payment-coordination');
  assert.equal(chain.sends,0,'restart recovery of a funded escrow never resends');
 }finally{journey.dispose();}
}
// The durable {failed, hash null} A1 these scenarios start from is unreachable while restart recovery fails closed
// (first test); recovering it after funding needs a durable never-sent fact from packages/domain.
// The three funded-restart variants that need a durable never-sent fact in packages/domain
// (restart more than 64 blocks later, re-approval at another nonce, re-approval with other
// calldata) are recorded as acceptance tests in docs/adr/proposed/D9-durable-send-marker.md.
// Until that decision lands, the app fails closed before funding instead.

test('a funded escrow whose cancelled approval shares its re-approval nonce and calldata recovers',async()=>{
 await fundedRestart();
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

test('a never-sent approval for another trade does not unlock recovery of the selected trade',async()=>{
 const otherTrade=terms=>[{action:'approve',terms:{...terms,sellerNonce:'0'.repeat(63)+'1'}}];
 await failsClosedAtRestart('absent',otherTrade);
});

test('a cancelled never-sent approval never hides a funded escrow from reconciliation',async()=>{
 await failsClosedAtRestart('funded',terms=>[{action:'approve',terms}]);
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
