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
import {decodeIntentPayload,encodeIntentPayload,encodeBase64url} from '../../../packages/schemas/index.ts';
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
 chain.held=[];
 chain.hold=tx=>{
  const held={...tx,from:tx.from.toLowerCase(),to:tx.to.toLowerCase(),input:tx.input.toLowerCase()};
  held.hash='0x'+createHash('sha256').update('held'+JSON.stringify(held)).digest('hex');
  chain.held.push(held);
  chain.queued=(chain.queued??0)+1;
  return held.hash;
 };
 /** Includes every held transaction in its own block; `reverted` includes it without any escrow effect. */
 chain.includeHeld=({reverted})=>{
  for(const held of chain.held.splice(0)){
   const mined={...held,blockNumber:++chain.head,reverted};
   chain.blocks.set(chain.head,[mined]);
   chain.txs.set(mined.hash,mined);
   chain.queued--;
   if(mined.from===SELLER)chain.nonce++;
   const kind=mined.input.slice(0,10);
   if(!reverted)chain.escrowState=kind===selector('release')?'released':kind===selector('refund')?'refunded':'funded';
  }
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
  // `queued` counts held transactions the node reports at the next pending nonces.
  transactionCount:(account,tag)=>{
   if(account.toLowerCase()!==SELLER)return done('0');
   return done(String(chain.nonce+(tag==='pending'?chain.queued??0:0)));
  },
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
   // 'hold' answers with a hash while the transaction stays in the node's pool until includeHeld().
   if(chain.send==='hold')return chain.hold({from:tx.from,to:tx.to,input:tx.data,value:String(BigInt(tx.value)),
    nonce:String(BigInt(tx.nonce))});
   return chain.mine({from:tx.from,to:tx.to,input:tx.data,value:String(BigInt(tx.value)),nonce:String(BigInt(tx.nonce))});
  }
  if(method==='eth_accounts')return[SELLER];
  if(method==='eth_chainId')return'0x7a69';
  if(method==='eth_getBlockByNumber'){
   // `failBlockReads` models a chain RPC outage before anything reaches the relay.
   if(chain.failBlockReads>0){
    chain.failBlockReads--;
    throw Error('RPC_DOWN');
   }
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
  if(method==='eth_getLogs'){
   // Escrow logs of included, non-reverted transactions in the block range, matched on address and topic[1].
   const filter=params[0],from=Number(BigInt(filter.fromBlock)),to=Number(BigInt(filter.toBlock));
   const logs=[];
   for(const tx of chain.txs.values()){
    if(tx.reverted||tx.blockNumber<from||tx.blockNumber>to)continue;
    for(const log of chain.logsFor?.(tx)??[]){
     if(log.address.toLowerCase()!==filter.address.toLowerCase()||log.topics[1]!==filter.topics[1])continue;
     logs.push({...log,transactionHash:tx.hash,blockNumber:hex(tx.blockNumber)});
    }
   }
   return logs;
  }
  if(method==='eth_getTransactionReceipt'){
   const tx=chain.txs.get(params[0]);
   if(!tx)return null;
   return{
    transactionHash:tx.hash,from:tx.from,blockNumber:hex(tx.blockNumber),blockHash:blockHash(tx.blockNumber),
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
 const h={store,chain,relay};
 h.journey=workerJourney(h);
 return h;
}
/** One Worker-equivalent journey over the harness's shared encrypted store, chain and relay. */
function workerJourney({store,chain,relay}){
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
 return createPrivateTradeJourney({
  services:{vault,backup},native,registryBytes,registryDigest,request:chain.request,createRelay:()=>relay.create(),
  localPeerAcceptance,
 });
}
/** The Worker stops (tab closed or lock); a fresh one unlocks the same profile and recovers the saved trade. */
async function restartAndWatch(h){
 h.journey.dispose();
 h.journey=workerJourney(h);
 value(await h.journey.runtime({operation:'unlock',profileId:h.profileId,passphrase:pass}));
 const [saved]=value(await h.journey.runtime({operation:'listTermsReviews',profileId:h.profileId})).items;
 for(const item of value(await h.journey.runtime({operation:'listTermsReviews',profileId:h.profileId})).items){
  item.bytes.fill(0);
 }
 return h.journey.act('watch',{recordId:saved.recordId});
}
/** Durable journal rows for the profile, read through an independent session. */
async function journalActions(h){
 const vault=new EncryptedVaultService(h.store,crypto,{lifecycle:false});
 try{
  const session=await vault.unlock(h.profileId,pass);
  assert.equal(session.ok,true);
  const rows=await vault.list(session.value.sessionId,'journal');
  assert.equal(rows.ok,true);
  return rows.value.map(row=>decodeIntentPayload(row.payload)).map(intent=>`${intent.action}:${intent.state}`).sort();
 }finally{
  vault.lockAll();
  vault.dispose();
 }
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
 h.profileId=await onboard(h.journey);
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

/** A release sent with a recorded hash that is still in the pool when the Worker stops. */
async function heldRelease(h){
 await funded(h);
 await h.journey.act('review-signing',{signingAction:'release'});
 h.chain.send='hold';
 assert.equal((await h.journey.act('confirm-signing',{attestFiatReceived:true})).phase,'settling');
 h.chain.send='mine';
 assert.equal(h.chain.sends,2);
 h.chain.now=Number(h.journey.snapshot().terms.escrowExpirySeconds);
 h.chain.guidance={reason:'near-expiry',remainingSeconds:'0'};
}

test('after restart a release that reverted past the deadline is reconciled so the refund can reserve',async()=>{
 const h=harness();
 try{
  await heldRelease(h);
  // Included only after the deadline: BasicEscrow reverts it and the escrow stays funded.
  h.chain.includeHeld({reverted:true});
  h.chain.head+=2;
  assert.equal((await restartAndWatch(h)).phase,'reconcile');
  await assert.rejects(h.journey.act('reconcile'),/PAYMENT_GUIDANCE_BLOCKED/);
  assert.equal(h.journey.snapshot().phase,'payment-guidance-unavailable');
  assert.equal((await signed(h.journey,'refund')).phase,'settling');
  assert.equal(h.chain.escrowState,'refunded');
  assert.equal(h.chain.sends,3,'the reverted release is never resent');
  assert.equal((await h.journey.act('reconcile')).receipt.state,'refunded');
 }finally{h.journey.dispose();}
});

test('after restart an unresolved release offers only reconcile and reserves no refund beside it',async()=>{
 const h=harness();
 try{
  await heldRelease(h);
  const recovered=await restartAndWatch(h);
  assert.equal(recovered.phase,'settling');
  await assert.rejects(h.journey.act('review-signing',{signingAction:'refund'}),/OUT_OF_ORDER/);
  assert.equal((await h.journey.act('reconcile')).phase,'settling');
  assert.deepEqual(await journalActions(h),['fund:finalized','release:pending']);
  // Once the chain resolves the release as reverted, the original refund opens; nothing was cancelled or resent.
  h.chain.includeHeld({reverted:true});
  h.chain.head+=2;
  await assert.rejects(h.journey.act('reconcile'),/PAYMENT_GUIDANCE_BLOCKED/);
  assert.equal((await signed(h.journey,'refund')).phase,'settling');
  assert.equal(h.chain.escrowState,'refunded');
  assert.equal(h.chain.sends,3);
 }finally{h.journey.dispose();}
});

/** Anyone may refund at or after the deadline: an unrelated account settles the escrow to the original seller. */
function thirdPartyRefund(h){
 const call=escrowCallFor({action:'refund',escrow:ESCROW,tradeId:h.journey.snapshot().tradeId}).call;
 const hash=h.chain.mine({from:'0x'+'3'.repeat(40),to:call.to,input:call.data,value:'0',nonce:'0'});
 h.chain.head+=2;
 return hash;
}

test('a reverted release beside a third-party refund shows the on-chain refund as the receipt',async()=>{
 const h=harness();
 try{
  await funded(h);
  await h.journey.act('review-signing',{signingAction:'release'});
  h.chain.revertNext=true;
  assert.equal((await h.journey.act('confirm-signing',{attestFiatReceived:true})).phase,'settling');
  h.chain.now=Number(h.journey.snapshot().terms.escrowExpirySeconds);
  const refundHash=thirdPartyRefund(h);
  const settled=await h.journey.act('reconcile');
  assert.equal(settled.phase,'receipt');
  assert.equal(settled.receipt.state,'refunded');
  assert.equal(settled.receipt.transactionHash,refundHash);
  assert.equal(settled.receipt.settledBy,'another-account');
  assert.deepEqual(settled.receipt.payout,{status:'pushed',recipient:SELLER,token:ZERO,amount:'1000000000000000'});
  assert.equal(h.chain.sends,2);
 }finally{h.journey.dispose();}
});

test('after restart a third-party refund beside a reverted release is shown as the receipt, not refused',async()=>{
 const h=harness();
 try{
  await heldRelease(h);
  h.chain.includeHeld({reverted:true});
  const refundHash=thirdPartyRefund(h);
  const recovered=await restartAndWatch(h);
  assert.equal(recovered.phase,'receipt');
  assert.equal(recovered.receipt.state,'refunded');
  assert.equal(recovered.receipt.transactionHash,refundHash);
  assert.equal(h.chain.sends,2);
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
   creditOutstanding:'3000000000000000',creditObservedAtHeight:snapshot.receipt.blockNumber,creditState:'owed',
   withdraw:{to:withdraw.to,data:withdraw.data,value:'0'},
  });
  assert.equal(h.chain.sends,2,'the withdraw route is shown, never sent');
 }finally{h.journey.dispose();}
});

test('a deferred credit with less pending than this trade credited is reported as possibly withdrawn',async()=>{
 for(const pendingCredit of[0n,999_999_999_999_999n]){
  const h=harness();
  try{
   // The finalized pendingWithdrawals read is below this trade's credit: someone may already have withdrawn it.
   const {receipt}=await released(h,{deferred:true,pendingCredit});
   assert.equal(receipt.payout.status,'credited');
   assert.equal(receipt.payout.creditOutstanding,String(pendingCredit));
   assert.equal(receipt.payout.creditState,'possibly-withdrawn');
  }finally{h.journey.dispose();}
 }
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
  // The last allowed attempt ends delivery explicitly; the trade stays visible and nothing claims receipt.
  const stopped=h.journey.snapshot();
  assert.equal(stopped.phase,'delivery-stopped');
  assert.notEqual(stopped.tradeId,null);
  await assert.rejects(h.journey.act('retry-delivery'),/OUT_OF_ORDER/);
  await assert.rejects(h.journey.act('offer'),/OUT_OF_ORDER/);
  assert.equal(h.relay.publishes,publishes,'a stopped delivery never publishes again');
  value(await h.journey.runtime({operation:'lock'}));
  assert.equal(h.journey.snapshot().phase,'setup');
  await assert.rejects(h.journey.act('retry-delivery'),/OUT_OF_ORDER/);
  assert.equal(h.relay.publishes,publishes);
 }finally{h.journey.dispose();}
});

test('a pending delivery past the acceptance deadline stops explicitly without another publish',async()=>{
 const h=harness();
 try{
  await onboard(h.journey);
  const {terms}=await h.journey.act('connect');
  h.relay.failPublishAt.add(2);
  await assert.rejects(h.journey.act('offer'),/UNAVAILABLE/);
  const publishes=h.relay.publishes;
  h.chain.now=Number(terms.acceptBeforeSeconds);
  await assert.rejects(h.journey.act('retry-delivery'),/EXPIRED/);
  assert.equal(h.journey.snapshot().phase,'delivery-stopped');
  await assert.rejects(h.journey.act('retry-delivery'),/OUT_OF_ORDER/);
  assert.equal(h.relay.publishes,publishes);
 }finally{h.journey.dispose();}
});

test('retries that fail before reaching the relay do not use up the delivery budget',async()=>{
 const h=harness();
 try{
  await onboard(h.journey);
  await h.journey.act('connect');
  h.relay.failPublishAt.add(2);
  await assert.rejects(h.journey.act('offer'),/UNAVAILABLE/);
  const publishes=h.relay.publishes;
  h.chain.failBlockReads=8;
  for(let retry=0;retry<8;retry++)await assert.rejects(h.journey.act('retry-delivery'),/RPC_DOWN/);
  assert.equal(h.relay.publishes,publishes,'none of those attempts published');
  assert.equal(h.journey.snapshot().phase,'delivery-pending');
  assert.equal((await h.journey.act('retry-delivery')).phase,'review');
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

/**
 * Writes one durable settlement row exactly as a crashed Worker can leave it. This is a fixture of restart state:
 * it goes straight to the encrypted vault, so the row needs no live lifecycle to have produced it.
 */
async function writeSettleRow(h,{action,state,hash=null,nonce}){
 const tradeId=h.tradeId;
 const call=escrowCallFor({action,escrow:ESCROW,tradeId}).call;
 const preparedRequest=JSON.stringify({v:1,chainId:'31337',from:SELLER,to:call.to,data:call.data,value:call.value,
  nonce,preparedAtBlock:String(h.preparedAt)});
 const intent={version:1,intentId:encodeBase64url(crypto.getRandomValues(new Uint8Array(32))),
  binding:{chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId},account:SELLER,action,state,
  walletGeneration:1,expectedEscrowState:'funded',preparedRequest,submission:{chain:'evm',hash,nonce},
  replacementOf:null,createdAt:NOW,updatedAt:NOW};
 const vault=new EncryptedVaultService(h.store,crypto,{lifecycle:false});
 try{
  const session=await vault.unlock(h.profileId,pass);
  assert.equal(session.ok,true);
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const record={id,kind:'journal',schemaVersion:1,payload:encodeIntentPayload(intent)};
  assert.equal((await vault.commit(session.value.sessionId,session.value.revision,[{op:'put',record}])).ok,true);
 }finally{
  vault.lockAll();
  vault.dispose();
 }
}
/** The seller's settlement transaction with `nonce`, included now; `reverted` includes it without escrow effect. */
function includeSettle(h,{action,nonce,reverted}){
 const call=escrowCallFor({action,escrow:ESCROW,tradeId:h.tradeId}).call;
 h.chain.revertNext=reverted;
 const hash=h.chain.mine({from:SELLER,to:call.to,input:call.data,value:'0',nonce:String(nonce)});
 h.chain.head+=2;
 return hash;
}
function poolSettle(h,{action,nonce}){
 const call=escrowCallFor({action,escrow:ESCROW,tradeId:h.tradeId}).call;
 return h.chain.hold({from:SELLER,to:call.to,input:call.data,value:'0',nonce:String(nonce)});
}
const randomHash=()=>'0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0'))
 .join('');

/**
 * Restart regression matrix for one funded trade: the finalized fund row plus the leftover settlement rows each case
 * writes. Every case records the phase (or error) after watch, one explicit reconcile and, where offered, one explicit
 * refund. Only that explicit refund may send. MATRIX_RECORD=1 prints the outcomes instead of asserting them.
 */
const recovery='external-recovery-required';
const blocked='PAYMENT_GUIDANCE_BLOCKED (payment-guidance-unavailable)';
const restartMatrix=[
 ['release pending in the pool',async h=>{
  await writeSettleRow(h,{action:'release',state:'pending',hash:poolSettle(h,{action:'release',nonce:1}),nonce:'1'});
 },{watch:'settling',reconcile:'settling'}],
 ['release confirmed, inclusion reorganized away',async h=>{
  await writeSettleRow(h,{action:'release',state:'confirmed',hash:randomHash(),nonce:'1'});
 },{watch:'settling',reconcile:'settling'}],
 ['release reorged with a hash',async h=>{
  await writeSettleRow(h,{action:'release',state:'reorged',hash:randomHash(),nonce:'1'});
 },{watch:'settling',reconcile:'settling'}],
 ['release broadcast-unknown without a hash',async h=>{
  await writeSettleRow(h,{action:'release',state:'broadcast-unknown',nonce:'1'});
 },{watch:recovery,reconcile:recovery}],
 ['release broadcast-unknown beyond the 64-block scan',async h=>{
  await writeSettleRow(h,{action:'release',state:'broadcast-unknown',nonce:'1'});
  h.chain.head+=70;
 },{watch:recovery,reconcile:recovery}],
 ['release reverted with a hash, row still pending',async h=>{
  const hash=includeSettle(h,{action:'release',nonce:1,reverted:true});
  await writeSettleRow(h,{action:'release',state:'pending',hash,nonce:'1'});
 },{watch:'reconcile',reconcile:blocked,refund:'settling'}],
 ['release failed with a hash',async h=>{
  const hash=includeSettle(h,{action:'release',nonce:1,reverted:true});
  await writeSettleRow(h,{action:'release',state:'failed',hash,nonce:'1'});
 },{watch:'reconcile',reconcile:blocked,refund:'settling'}],
 ['release failed without a hash (wallet 4001)',async h=>{
  await writeSettleRow(h,{action:'release',state:'failed',nonce:'1'});
 },{watch:recovery,reconcile:recovery}],
 ['two rows: reverted release and a refund pending in the pool',async h=>{
  const hash=includeSettle(h,{action:'release',nonce:1,reverted:true});
  await writeSettleRow(h,{action:'release',state:'failed',hash,nonce:'1'});
  await writeSettleRow(h,{action:'refund',state:'pending',hash:poolSettle(h,{action:'refund',nonce:2}),nonce:'2'});
 },{watch:'settling',reconcile:'settling'}],
 ['two rows: release failed without a hash and a reverted refund',async h=>{
  await writeSettleRow(h,{action:'release',state:'failed',nonce:'1'});
  const hash=includeSettle(h,{action:'refund',nonce:1,reverted:true});
  await writeSettleRow(h,{action:'refund',state:'pending',hash,nonce:'1'});
 },{watch:recovery,reconcile:recovery}],
 ['third-party refund, no own settlement row',async h=>{
  thirdPartyRefund(h);
 },{watch:'receipt'}],
 ['third-party refund, own refund broadcast-unknown without a hash',async h=>{
  await writeSettleRow(h,{action:'refund',state:'broadcast-unknown',nonce:'1'});
  thirdPartyRefund(h);
 },{watch:'receipt'}],
 ['third-party refund, own release failed without a hash',async h=>{
  await writeSettleRow(h,{action:'release',state:'failed',nonce:'1'});
  thirdPartyRefund(h);
 },{watch:'receipt'}],
 ['third-party refund beyond the bounded log search',async h=>{
  thirdPartyRefund(h);
  h.chain.head+=50_001;
 },{watch:'receipt'}],
];
const outcome=async run=>{
 try{return(await run()).phase;}
 catch(error){return error instanceof Error?error.message:'THROWN';}
};
const recorded=[];
for(const[name,arrange,expected]of restartMatrix){
 test(`restart matrix: ${name}`,async()=>{
  const h=harness();
  try{
   await funded(h);
   h.tradeId=h.journey.snapshot().tradeId;
   h.preparedAt=h.chain.head;
   h.chain.now=Number(h.journey.snapshot().terms.escrowExpirySeconds);
   h.chain.guidance={reason:'near-expiry',remainingSeconds:'0'};
   await arrange(h);
   const sends=h.chain.sends;
   const funded_=['payment-coordination','payment-guidance-closed','payment-guidance-unavailable'];
   const step=async run=>{
    const result=await outcome(run);
    const now=h.journey.snapshot().phase;
    return result===now?result:`${result} (${now})`;
   };
   const actual={watch:await step(()=>restartAndWatch(h))};
   if(['reconcile','settling',recovery].includes(h.journey.snapshot().phase)){
    actual.reconcile=await step(()=>h.journey.act('reconcile'));
   }
   assert.equal(h.chain.sends,sends,'watch and reconcile never send');
   if(funded_.includes(h.journey.snapshot().phase))actual.refund=await step(()=>signed(h.journey,'refund'));
   if(process.env.MATRIX_RECORD){recorded.push({name,...actual});return;}
   assert.deepEqual(actual,expected);
   if(actual.refund==='settling')assert.equal(h.chain.escrowState,'refunded');
   assert.ok(h.chain.sends-sends<=(actual.refund?1:0),'only the explicit refund may send');
  }finally{h.journey.dispose();}
 });
}
test.after(()=>{if(process.env.MATRIX_RECORD)console.log('MATRIX '+JSON.stringify(recorded));});

/** A funded trade restarted with one release row the app cannot reconcile without a durable send marker. */
async function ambiguousRestart(h){
 await funded(h);
 h.tradeId=h.journey.snapshot().tradeId;
 h.preparedAt=h.chain.head;
 h.chain.now=Number(h.journey.snapshot().terms.escrowExpirySeconds);
 h.chain.guidance={reason:'near-expiry',remainingSeconds:'0'};
 await writeSettleRow(h,{action:'release',state:'failed',nonce:'1'});
 return restartAndWatch(h);
}

test('an ambiguous settlement row hands over to external recovery with the fresh chain state and no app action',
 async()=>{
  const h=harness();
  try{
   const recovered=await ambiguousRestart(h);
   assert.equal(recovered.phase,'external-recovery-required');
   assert.equal(recovered.chainState.state,'funded');
   assert.equal(recovered.chainState.observedAtHeight,String(h.chain.head));
   for(const signingAction of['release','refund']){
    await assert.rejects(h.journey.act('review-signing',{signingAction}),/OUT_OF_ORDER/);
   }
   assert.equal((await h.journey.act('reconcile')).phase,'external-recovery-required');
   assert.deepEqual(await journalActions(h),['fund:finalized','release:failed'],'the row is never rewritten');
   // The seller refunds with the recovery package outside the app; reconcile then shows that chain outcome.
   const call=escrowCallFor({action:'refund',escrow:ESCROW,tradeId:h.tradeId}).call;
   const hash=h.chain.mine({from:SELLER,to:call.to,input:call.data,value:'0',nonce:'1'});
   h.chain.head+=2;
   const settled=await h.journey.act('reconcile');
   assert.equal(settled.phase,'receipt');
   assert.equal(settled.receipt.transactionHash,hash);
   assert.equal(settled.receipt.settledBy,'this-wallet');
   assert.deepEqual(await journalActions(h),['fund:finalized','release:failed']);
  }finally{h.journey.dispose();}
 });

test('a settlement beyond the bounded log search is shown from the canonical state without a transaction',async()=>{
 const h=harness();
 try{
  await funded(h);
  h.chain.now=Number(h.journey.snapshot().terms.escrowExpirySeconds);
  thirdPartyRefund(h);
  h.chain.head+=50_001;
  const recovered=await restartAndWatch(h);
  assert.equal(recovered.phase,'receipt');
  assert.equal(recovered.receipt,null,'no transaction, fee or payout is claimed');
  assert.deepEqual(recovered.chainState,{state:'refunded',observedAtHeight:String(h.chain.head)});
 }finally{h.journey.dispose();}
});
