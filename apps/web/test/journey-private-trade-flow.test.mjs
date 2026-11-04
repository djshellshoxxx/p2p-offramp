// Negotiated private journey over the REAL encrypted vault, messaging identity, relay event crypto, terms exchange,
// intent journal and tx lifecycle. Only wallets, the escrow observation, payment preflight, the relay transport and
// the chain (RPC and chain reader) are fakes. Every fake send is counted; nothing is resent automatically.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPrivateTradeJourney} from '../src/journey/private-trade.ts';
import {EncryptedVaultService,EncryptedBackupService} from '../../../packages/storage/index.ts';
import {MessagingIdentityService} from '../../../packages/identity/src/identity-service.ts';
import {createLocalNobleIdentityProvider} from '../../../packages/identity/index.ts';
import {evmTermsHash} from '../../../packages/wallet/src/evm-terms.ts';
import {escrowCallFor} from '../../../packages/wallet/src/evm-submit.ts';
import {decodeEscrowLog,buildPendingWithdrawals,buildWithdraw,topicOf,EVENT_SIGNATURES} from '../../../packages/wallet/src/evm-escrow.ts';
import {createLifecycleJournal} from '../../../packages/domain/src/intent-journal.ts';
import {createEvmTxLifecycle,evmFinalityPolicy} from '../../../packages/domain/src/tx-lifecycle.ts';
import {decodeIntentPayload} from '../../../packages/schemas/index.ts';
import {matchesFilters} from '../../../packages/relay/src/nip01.ts';
import {RegistryService} from '../../../packages/domain/index.ts';

const registryUrl=new URL('../../../packages/domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url);
const registryBytes=new Uint8Array(await readFile(registryUrl));
const registryDigest=createHash('sha256').update(registryBytes).digest('hex');
const registry=new RegistryService();
assert.equal((await registry.load(registryBytes,registryDigest)).ok,true);
const ESCROW=registry.deployment('local-evm','escrow-local-v1').address;
const pass='Native localproof flow profile passphrase';
const SELLER='0x'+'1'.repeat(40);
const BUYER='0x'+'2'.repeat(40);
const NOW=1_900_000_000;
const policy=evmFinalityPolicy({chain:'evm',finality:{kind:'evm-finalized-tag'}},2,3);

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
const hex=number=>'0x'+BigInt(number).toString(16);
const word=number=>'0x'+BigInt(number).toString(16).padStart(64,'0');
const blockHash=height=>'0x'+'a'+height.toString(16).padStart(63,'0');
const selector=action=>escrowCallFor({action,escrow:ESCROW,tradeId:'0'.repeat(64)}).call.data.slice(0,10);
const pendingSelector=buildPendingWithdrawals(ESCROW,SELLER,SELLER).data.slice(0,10);
const ZERO='0x'+'0'.repeat(40);
const topicWord=input=>'0x'+input.replace(/^0x/,'').padStart(64,'0');
/** The escrow logs a release or refund receipt carries; `deferred` adds the PayoutDeferred credit of a failed push. */
function settlementLogs(tradeId,{state,recipient,amount,deferred}){
 const data=topicWord(ZERO)+BigInt(amount).toString(16).padStart(64,'0');
 const settled=state==='released'
  ?{address:ESCROW,topics:['0x'+topicOf(EVENT_SIGNATURES.Released),topicWord(tradeId),topicWord(recipient)],data}
  :{address:ESCROW,topics:['0x'+topicOf(EVENT_SIGNATURES.Refunded),topicWord(tradeId),topicWord(recipient),
   topicWord(recipient)],data};
 const credit={address:ESCROW,topics:['0x'+topicOf(EVENT_SIGNATURES.PayoutDeferred),topicWord(tradeId),
  topicWord(recipient)],data};
 return deferred?[settled,credit]:[settled];
}

/**
 * A minimal fake EVM chain: one block per mined transaction, `finalized` equal to `latest`, a settable chain time,
 * and the escrow state that release/refund/fund calldata implies. `send` decides each wallet send: 'mine' includes
 * it, 'reject' answers EIP-1193 4001 without including anything.
 */
function fakeChain(){
 const chain={escrowState:'absent',sends:0,send:'mine',head:16,nonce:0,now:NOW,blocks:new Map(),txs:new Map()};
 chain.mine=tx=>{
  const mined={...tx,from:tx.from.toLowerCase(),to:tx.to.toLowerCase(),input:tx.input.toLowerCase(),blockNumber:++chain.head};
  mined.hash='0x'+createHash('sha256').update(JSON.stringify(mined)).digest('hex');
  chain.blocks.set(chain.head,[mined]);
  chain.txs.set(mined.hash,mined);
  if(mined.from===SELLER)chain.nonce++;
  // `revertNext` includes the next transaction with a reverted receipt and no escrow effect.
  if(chain.revertNext){
   chain.revertNext=false;
   mined.reverted=true;
   return mined.hash;
  }
  if(mined.to===ESCROW.toLowerCase()){
   const kind=mined.input.slice(0,10);
   chain.escrowState=kind===selector('release')?'released':kind===selector('refund')?'refunded':'funded';
  }
  return mined.hash;
 };
 const head=()=>({number:String(chain.head),hash:blockHash(chain.head)});
 const view=tx=>({
  hash:tx.hash,from:tx.from,to:tx.to,nonce:tx.nonce,input:tx.input,value:tx.value,blockNumber:String(tx.blockNumber),
 });
 const done=result=>Promise.resolve({ok:true,value:result});
 chain.reader=Object.freeze({
  chainId:()=>done('31337'),
  head:()=>done(head()),
  blockHashAt:number=>done(Number(number)<=chain.head?blockHash(Number(number)):null),
  transactionCount:account=>done(account.toLowerCase()===SELLER?String(chain.nonce):'0'),
  transaction:hash=>done(chain.txs.has(hash)?view(chain.txs.get(hash)):null),
  receipt:hash=>{
   const tx=chain.txs.get(hash);
   const receipt={transactionHash:hash,blockNumber:String(tx?.blockNumber),blockHash:blockHash(tx?.blockNumber??0)};
   return done(tx?{...receipt,status:tx.reverted?'reverted':'success'}:null);
  },
  escrowState:()=>done(chain.escrowState),
  escrowObservation:(binding,request)=>done({
   binding,generation:request.generation,requestSequence:request.requestSequence,
   anchor:{height:String(chain.head),hash:blockHash(chain.head)},
   state:chain.escrowState,finality:'finalized',observedAt:Date.now(),
  }),
 });
 chain.request=async({method,params=[]})=>{
  if(method==='eth_sendTransaction'){
   chain.sends++;
   const tx=params[0];
   if(chain.send==='reject')throw Object.assign(Error('User rejected the request.'),{code:4001});
   return chain.mine({from:tx.from,to:tx.to,input:tx.data,value:String(BigInt(tx.value)),nonce:String(BigInt(tx.nonce))});
  }
  if(method==='eth_accounts')return[SELLER];
  if(method==='eth_chainId')return'0x7a69';
  if(method==='eth_getBlockByNumber'){
   const height=['latest','finalized'].includes(params[0])?chain.head:Number(BigInt(params[0]??chain.head));
   const txs=chain.blocks.get(height)??[];
   const transactions=params[1]?txs.map(tx=>({hash:tx.hash,from:tx.from,nonce:hex(tx.nonce)})):txs.map(tx=>tx.hash);
   return{number:hex(height),hash:blockHash(height),timestamp:hex(chain.now),transactions};
  }
  if(method==='eth_getTransactionCount')return hex(chain.nonce);
  if(method==='eth_getCode')return'0x6001';
  if(method==='eth_call'){
   const data=params[0].data.slice(0,10);
   if(data===pendingSelector)return word(chain.pendingCredit??0);
   // decimals(), balanceOf(address), allowance(address,address); anything else is isAllowlisted(address).
   return data==='0x313ce567'?word(6):data==='0x70a08231'?word(10n**24n):data==='0xdd62ed3e'?word(0):word(1);
  }
  if(method==='eth_getTransactionReceipt'){
   const tx=chain.txs.get(params[0]);
   if(!tx)return null;
   return{
    transactionHash:tx.hash,blockNumber:hex(tx.blockNumber),blockHash:blockHash(tx.blockNumber),
    status:tx.reverted?'0x0':'0x1',
    gasUsed:'0x5208',effectiveGasPrice:'0x1',logs:chain.logsFor?.(tx)??[],
   };
  }
  throw Error('UNEXPECTED_RPC');
 };
 return chain;
}

/** An in-memory relay shared by both parties. `failPublishAt` lists 1-based publish attempts that fail. */
function fakeRelay(){
 const hub={events:[],published:[],publishes:0,failPublishAt:new Set()};
 hub.create=()=>({
  subscribe(filters,{onEvent,onEose}){
   let closed=false;
   queueMicrotask(()=>{
    if(closed)return;
    for(const event of hub.events)if(matchesFilters(event,filters))onEvent(event,'fake');
    onEose?.('fake');
   });
   return{ok:true,value:{id:'fake-subscription',close(){closed=true;}}};
  },
  async publish(event){
   hub.publishes++;
   hub.published.push(event.id);
   if(hub.failPublishAt.has(hub.publishes))return{ok:false,error:{code:'UNAVAILABLE'}};
   if(!hub.events.some(item=>item.id===event.id))hub.events.push(event);
   // A relay that stored the event but whose acknowledgement was lost.
   if(hub.lostAckAt?.has(hub.publishes))return{ok:false,error:{code:'TIMEOUT'}};
   return{ok:true,value:[{relayId:'fake',eventId:event.id,status:'accepted'}]};
  },
  retry(){},
  status(){return[];},
  close(){},
 });
 return hub;
}

class FakeWallet{
 constructor(_provider,providerId){
  const capabilities=Object.freeze({signTerms:true,sendTransaction:true,signTransaction:false});
  const account=/-1$|buyer/.test(providerId)?BUYER:SELLER;
  this.session=Object.freeze({providerId:'fixture-'+account.slice(2,6),chain:'evm',networkId:'local-evm',account,generation:1,capabilities});
 }
 async connect(){return{ok:true,value:this.session};}
 inspect(){return this.session;}
 async signTerms(){return{ok:true,value:new Uint8Array(65).fill(7)};}
 subscribe(){return()=>{};}
 dispose(){}
}

/**
 * One Worker-equivalent journey. `chain.guidance` is the native G18 decision the fake preflight reports; its
 * remainingSeconds is the actual escrow deadline minus the latest chain time, as the native adapter computes it.
 */
function harness(){
 const store=new Store(),chain=fakeChain(),relay=fakeRelay();
 chain.guidance={reason:'ok',remainingSeconds:'7200'};
 const vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
 const backup=new EncryptedBackupService(store);
 const inert={invalidate(){},dispose(){}};
 const anchor=()=>({height:String(chain.head),hash:blockHash(chain.head)});
 const guidance=binding=>({
  evidence:'native-rpc',economicPreparationAllowed:false,binding,termsHash:binding.tradeId,
  finalizedAnchor:anchor().hash,decision:chain.guidance.reason==='ok'?'allow-guidance':'block',
  reason:chain.guidance.reason,remainingSeconds:chain.guidance.remainingSeconds,
 });
 const native={
  MessagingIdentityService,
  createIdentityProvider:createLocalNobleIdentityProvider,
  EvmWalletAdapter:FakeWallet,
  walletProvider(){return{request:chain.request};},
  selectorOf(){return'c1d2e3f4';},
  decodeEscrowLog,
  buildPendingWithdrawals,
  buildWithdraw,
  evmTermsHash,
  escrowCallFor,
  decodeIntentPayload,
  async readObservation(){return{ok:true,value:{state:chain.escrowState}};},
  async verifyEvmAgreementBundle(input){return{ok:true,value:{termsHash:input.acceptances[0].termsHash}};},
  createEip1193ChainReader(){return chain.reader;},
  createLifecycleJournal,
  createEvmTxLifecycle,
  policy,
  createEvmPaymentPreflight({binding}){
   return{ok:true,value:{
    ...inert,view(){return{ok:true,value:guidance(binding)};},async read(){return{ok:true,value:guidance(binding)};},
   }};
  },
  createTradeAuthority(){
   const refresh=async()=>({ok:true,value:{}});
   return{...inert,currentGeneration:0,readView(){throw Error('UNEXPECTED');},refresh};
  },
  createTradeComposition({binding}){
   const chainView=()=>({
    binding,generation:0,requestSequence:1,anchor:anchor(),state:chain.escrowState,finality:'finalized',observedAt:NOW,
   });
   const view=()=>({
    binding,chain:chainView(),chainHealth:'fresh',pendingIntentIds:[],fiatClaim:'none',walletGeneration:0,
    economicPreparationAllowed:false,
   });
   return{...inert,async read(){return{ok:true,value:view()};}};
  },
 };
 const localPeerAcceptance=async()=>new Uint8Array(65).fill(9);
 const journey=createPrivateTradeJourney({
  services:{vault,backup},native,registryBytes,registryDigest,request:chain.request,createRelay:()=>relay.create(),
  localPeerAcceptance,
 });
 return{store,chain,relay,journey};
}

/** Encrypted profile with a verified current backup, as the screen requires before wallet selection. */
async function onboard(journey){
 const profileId=value(await journey.runtime({operation:'create',passphrase:pass})).handle.profileId;
 const exported=value(await journey.runtime({operation:'exportEncrypted',profileId}));
 value(await journey.runtime({operation:'verifyBackup',profileId,bytes:exported.bytes,passphrase:pass}));
 return profileId;
}
/** An explicit signing review followed by its explicit confirmation, exactly as the screen sends them. */
async function signed(journey,signingAction,options={}){
 await journey.act('review-signing',{signingAction});
 return journey.act('confirm-signing',options);
}
/** connect -> offer -> accept, with both communication deliveries succeeding. */
async function accepted(h,options={assetId:'native',amountBaseUnits:'1000000000000000'}){
 await onboard(h.journey);
 assert.equal((await h.journey.act('connect',options)).phase,'wallet');
 assert.equal((await h.journey.act('offer')).phase,'review');
 assert.equal((await signed(h.journey,'accept',{reviewRiskAccepted:true})).phase,'accepted');
}
/** A funded escrow in payment coordination: one fund send, natively reconciled. */
async function funded(h){
 await accepted(h);
 assert.equal((await signed(h.journey,'fund')).phase,'reconcile');
 assert.equal(h.chain.escrowState,'funded');
 assert.equal((await h.journey.act('reconcile')).phase,'payment-coordination');
 assert.equal(h.chain.sends,1);
 // Later release/refund receipts carry the escrow's settlement event with a direct (non-deferred) payout.
 const {tradeId,terms}=h.journey.snapshot();
 h.chain.logsFor=tx=>{
  const kind=tx.input.slice(0,10),state=kind===selector('release')?'released':kind===selector('refund')?'refunded':null;
  if(!state)return[];
  const recipient=state==='released'?BUYER:SELLER;
  return settlementLogs(tradeId,{state,recipient,amount:terms.amountBaseUnits,deferred:false});
 };
}

test('inside the payment-guidance buffer a fresh funded escrow still allows explicit seller release',async()=>{
 const h=harness();
 try{
  await funded(h);
  // 899 seconds before the actual deadline: payment guidance is withheld, release is still valid on chain.
  h.chain.guidance={reason:'near-expiry',remainingSeconds:'899'};
  const closed=await h.journey.act('reconcile');
  assert.equal(closed.phase,'payment-guidance-closed');
  assert.equal(closed.paymentGuidance.value.decision,'block','payment instructions stay withheld');
  await assert.rejects(h.journey.act('release',{attestFiatReceived:true}),/SIGNING_REVIEW_REQUIRED/);
  await assert.rejects(signed(h.journey,'release'),/FIAT_ATTESTATION_REQUIRED/);
  assert.equal(h.chain.sends,1,'no release without the seller fiat attestation');
  assert.equal((await signed(h.journey,'release',{attestFiatReceived:true})).phase,'settling');
  assert.equal(h.chain.sends,2);
  assert.equal(h.chain.escrowState,'released');
  assert.equal((await h.journey.act('reconcile')).phase,'receipt');
 }finally{h.journey.dispose();}
});

test('guidance that closes between review and release does not block a release before the actual deadline',async()=>{
 const h=harness();
 try{
  await funded(h);
  h.chain.guidance={reason:'ok',remainingSeconds:'901'};
  assert.equal((await h.journey.act('reconcile')).phase,'payment-coordination');
  await h.journey.act('review-signing',{signingAction:'release'});
  h.chain.guidance={reason:'near-expiry',remainingSeconds:'900'};
  assert.equal((await h.journey.act('confirm-signing',{attestFiatReceived:true})).phase,'settling');
  assert.equal(h.chain.escrowState,'released');
 }finally{h.journey.dispose();}
});

test('at the actual deadline release is refused and only the original refund remains',async()=>{
 const h=harness();
 try{
  await funded(h);
  h.chain.guidance={reason:'near-expiry',remainingSeconds:'0'};
  await assert.rejects(h.journey.act('reconcile'),/PAYMENT_GUIDANCE_BLOCKED/);
  assert.equal(h.journey.snapshot().phase,'payment-guidance-unavailable');
  await assert.rejects(h.journey.act('review-signing',{signingAction:'release'}),/OUT_OF_ORDER/);
  // A release review taken while open is re-checked against the fresh native deadline before any send.
  h.chain.guidance={reason:'near-expiry',remainingSeconds:'301'};
  assert.equal((await h.journey.act('reconcile')).phase,'payment-guidance-closed');
  await h.journey.act('review-signing',{signingAction:'release'});
  h.chain.guidance={reason:'near-expiry',remainingSeconds:'300'};
  await assert.rejects(h.journey.act('confirm-signing',{attestFiatReceived:true}),/RELEASE_NOT_AVAILABLE/);
  assert.equal(h.chain.sends,1,'no release send inside the deadline margin');
  assert.equal(h.chain.escrowState,'funded');
  h.chain.now=Number(h.journey.snapshot().terms.escrowExpirySeconds);
  assert.equal((await signed(h.journey,'refund')).phase,'settling');
  assert.equal(h.chain.escrowState,'refunded');
  const receipt=(await h.journey.act('reconcile')).receipt;
  assert.equal(receipt.state,'refunded');
  assert.deepEqual(receipt.payout,{status:'pushed',recipient:SELLER,token:ZERO,amount:'1000000000000000'});
 }finally{h.journey.dispose();}
});

// The latest block time is not the inclusion time: a release read with only seconds left would certainly revert.
test('release is not offered inside the 300-second margin before the actual deadline',async()=>{
 const h=harness();
 try{
  await funded(h);
  for(const remainingSeconds of['1','299','300']){
   h.chain.guidance={reason:'near-expiry',remainingSeconds};
   await assert.rejects(h.journey.act('reconcile'),/PAYMENT_GUIDANCE_BLOCKED/);
   assert.equal(h.journey.snapshot().phase,'payment-guidance-unavailable');
   await assert.rejects(h.journey.act('review-signing',{signingAction:'release'}),/OUT_OF_ORDER/);
  }
  h.chain.guidance={reason:'near-expiry',remainingSeconds:'301'};
  assert.equal((await h.journey.act('reconcile')).phase,'payment-guidance-closed');
  assert.equal(h.chain.sends,1);
 }finally{h.journey.dispose();}
});

test('a release that reverts after the deadline returns to the funded escrow and its refund, never a resend',async()=>{
 const h=harness();
 try{
  await funded(h);
  await h.journey.act('review-signing',{signingAction:'release'});
  // The release is included only after the deadline, so BasicEscrow reverts it and the escrow stays funded.
  h.chain.revertNext=true;
  assert.equal((await h.journey.act('confirm-signing',{attestFiatReceived:true})).phase,'settling');
  assert.equal(h.chain.sends,2);
  assert.equal(h.chain.escrowState,'funded');
  // Later empty blocks bury the reverted receipt past the confirmation depth.
  h.chain.head+=2;
  h.chain.now=Number(h.journey.snapshot().terms.escrowExpirySeconds);
  h.chain.guidance={reason:'near-expiry',remainingSeconds:'0'};
  await assert.rejects(h.journey.act('reconcile'),/PAYMENT_GUIDANCE_BLOCKED/);
  assert.equal(h.journey.snapshot().phase,'payment-guidance-unavailable');
  await assert.rejects(h.journey.act('review-signing',{signingAction:'release'}),/OUT_OF_ORDER/);
  assert.equal(h.chain.sends,2,'the reverted release is never resent');
  assert.equal((await signed(h.journey,'refund')).phase,'settling');
  assert.equal(h.chain.escrowState,'refunded');
  assert.equal((await h.journey.act('reconcile')).receipt.state,'refunded');
 }finally{h.journey.dispose();}
});

/** A funded native trade released by the seller, with the receipt logs `deferred` selects. */
async function released(h,{deferred,pendingCredit}){
 await funded(h);
 const {tradeId,terms}=h.journey.snapshot();
 h.chain.pendingCredit=pendingCredit;
 h.chain.logsFor=tx=>tx.input.startsWith(selector('release'))
  ?settlementLogs(tradeId,{state:'released',recipient:BUYER,amount:terms.amountBaseUnits,deferred}):[];
 assert.equal((await signed(h.journey,'release',{attestFiatReceived:true})).phase,'settling');
 return h.journey.act('reconcile');
}

test('a deferred payout credit is reported on the receipt with its exact withdraw route, never as arrived',async()=>{
 const h=harness();
 try{
  // The aggregate credit owed to the buyer can include other trades: it is shown separately from this trade's.
  const snapshot=await released(h,{deferred:true,pendingCredit:3_000_000_000_000_000n});
  assert.equal(snapshot.phase,'receipt');
  assert.equal(snapshot.receipt.state,'released');
  const withdraw=buildWithdraw(ESCROW,BUYER,ZERO);
  assert.deepEqual(snapshot.receipt.payout,{
   status:'credited',recipient:BUYER,token:ZERO,amount:snapshot.terms.amountBaseUnits,
   creditOutstanding:'3000000000000000',creditObservedAtHeight:snapshot.receipt.blockNumber,
   withdraw:{to:withdraw.to,data:withdraw.data,value:'0'},
  });
  assert.equal(h.chain.sends,2,'the withdraw route is shown, never sent');
 }finally{h.journey.dispose();}
});

test('a direct payout is reported as pushed with zero deferred credit from this receipt',async()=>{
 const h=harness();
 try{
  const snapshot=await released(h,{deferred:false,pendingCredit:0n});
  assert.equal(snapshot.phase,'receipt');
  assert.deepEqual(snapshot.receipt.payout,{
   status:'pushed',recipient:BUYER,token:ZERO,amount:snapshot.terms.amountBaseUnits,
  });
 }finally{h.journey.dispose();}
});

test('a receipt without the escrow settlement event for this trade is not accepted as a payout record',async()=>{
 const h=harness();
 try{
  await funded(h);
  h.chain.logsFor=()=>[];
  assert.equal((await signed(h.journey,'release',{attestFiatReceived:true})).phase,'settling');
  await assert.rejects(h.journey.act('reconcile'),/RECEIPT_UNAVAILABLE/);
  assert.equal(h.journey.snapshot().receipt,null);
 }finally{h.journey.dispose();}
});

/** Distinct signed events the relay ever accepted: one ad plus one wrap per negotiation message, never more. */
const distinct=h=>({ads:h.relay.events.filter(event=>event.kind!==1059).length,
 wraps:h.relay.events.filter(event=>event.kind===1059).length});

for(const[stage,attempt]of[['ad publication',1],['take delivery',2],['offer delivery',3]]){
 test(`a relay failure at ${stage} resumes by explicit retry of the same signed events`,async()=>{
  const h=harness();
  try{
   await onboard(h.journey);
   assert.equal((await h.journey.act('connect')).phase,'wallet');
   h.relay.failPublishAt.add(attempt);
   await assert.rejects(h.journey.act('offer'),/UNAVAILABLE/);
   assert.equal(h.journey.snapshot().phase,'delivery-pending');
   const failed=h.relay.published.at(-1);
   // Repeating the original step would regenerate committed content; only an explicit retry may resume.
   await assert.rejects(h.journey.act('offer'),/OUT_OF_ORDER/);
   assert.equal((await h.journey.act('retry-delivery')).phase,'review');
   assert.equal(h.relay.published[attempt],failed,'the retry republishes the identical event');
   assert.deepEqual(distinct(h),{ads:1,wraps:2},'nothing is re-signed or regenerated');
   assert.equal((await signed(h.journey,'accept',{reviewRiskAccepted:true})).phase,'accepted');
   assert.deepEqual(distinct(h),{ads:1,wraps:3});
   assert.equal(h.chain.sends,0);
  }finally{h.journey.dispose();}
 });
}

test('a relay failure delivering acceptance resumes by retry, then signing needs a fresh review',async()=>{
 const h=harness();
 try{
  await onboard(h.journey);
  await h.journey.act('connect');
  assert.equal((await h.journey.act('offer')).phase,'review');
  h.relay.failPublishAt.add(h.relay.publishes+1);
  await assert.rejects(signed(h.journey,'accept',{reviewRiskAccepted:true}),/UNAVAILABLE/);
  assert.equal(h.journey.snapshot().phase,'delivery-pending');
  await assert.rejects(signed(h.journey,'accept',{reviewRiskAccepted:true}),/OUT_OF_ORDER/);
  assert.equal((await h.journey.act('retry-delivery')).phase,'review');
  assert.deepEqual(distinct(h),{ads:1,wraps:3});
  await assert.rejects(h.journey.act('confirm-signing',{reviewRiskAccepted:true}),/SIGNING_REVIEW_REQUIRED/);
  assert.equal((await signed(h.journey,'accept',{reviewRiskAccepted:true})).phase,'accepted');
  assert.deepEqual(distinct(h),{ads:1,wraps:3},'the delivered acceptance is never sent again');
 }finally{h.journey.dispose();}
});

test('delivery retries are bounded and lock retires the pending message without a late send',async()=>{
 const h=harness();
 try{
  await onboard(h.journey);
  await h.journey.act('connect');
  for(let attempt=1;attempt<=20;attempt++)h.relay.failPublishAt.add(attempt);
  await assert.rejects(h.journey.act('offer'),/UNAVAILABLE/);
  for(let retry=0;retry<5;retry++)await assert.rejects(h.journey.act('retry-delivery'),/UNAVAILABLE/);
  const publishes=h.relay.publishes;
  await assert.rejects(h.journey.act('retry-delivery'),/DELIVERY_RETRY_LIMIT/);
  assert.equal(h.relay.publishes,publishes,'the limit stops before any further publish');
  assert.equal(h.journey.snapshot().phase,'delivery-pending');
  value(await h.journey.runtime({operation:'lock'}));
  assert.equal(h.journey.snapshot().phase,'setup');
  await assert.rejects(h.journey.act('retry-delivery'),/OUT_OF_ORDER/);
  assert.equal(h.relay.publishes,publishes);
 }finally{h.journey.dispose();}
});

test('a lost relay acknowledgement after storage resumes without a duplicate negotiation transition',async()=>{
 const h=harness();
 try{
  await onboard(h.journey);
  await h.journey.act('connect');
  h.relay.lostAckAt=new Set([2]);
  await assert.rejects(h.journey.act('offer'),/TIMEOUT/);
  assert.equal(h.journey.snapshot().phase,'delivery-pending');
  assert.deepEqual(distinct(h),{ads:1,wraps:1},'the take wrap already reached the relay');
  assert.equal((await h.journey.act('retry-delivery')).phase,'review');
  assert.deepEqual(distinct(h),{ads:1,wraps:2});
 }finally{h.journey.dispose();}
});
