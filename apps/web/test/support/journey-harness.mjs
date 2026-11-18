// Shared test support for the private-journey suites (flow and recovery): the in-memory profile store, the
// fake EVM chain, the fake native adapter set, the Worker-equivalent journey builder and journal readers.
// Test-only; lives outside the *.test.mjs glob so `npm test` never runs it as a suite.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPrivateTradeJourney} from '../../src/journey/private-trade.ts';
import {RegistryService} from '../../../../packages/domain/index.ts';
import {EncryptedVaultService,EncryptedBackupService} from '../../../../packages/storage/index.ts';
import {MessagingIdentityService} from '../../../../packages/identity/src/identity-service.ts';
import {createLocalNobleIdentityProvider} from '../../../../packages/identity/index.ts';
import {evmTermsHash} from '../../../../packages/wallet/src/evm-terms.ts';
import {escrowCallFor} from '../../../../packages/wallet/src/evm-submit.ts';
import {buildPendingWithdrawals} from '../../../../packages/wallet/src/evm-escrow.ts';
import {createLifecycleJournal} from '../../../../packages/domain/src/intent-journal.ts';
import {createEvmTxLifecycle,evmFinalityPolicy} from '../../../../packages/domain/src/tx-lifecycle.ts';
import {decodeIntentPayload} from '../../../../packages/schemas/index.ts';

const registryUrl=new URL('../../../../packages/domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url);
export const registryBytes=new Uint8Array(await readFile(registryUrl));
export const registryDigest=createHash('sha256').update(registryBytes).digest('hex');
export const registry=new RegistryService();
export const ok=result=>{
 assert.equal(result.ok,true,JSON.stringify(result));
 return result.value;
};
ok(await registry.load(registryBytes,registryDigest));
export const SELLER='0x'+'1'.repeat(40);
export const BUYER='0x'+'2'.repeat(40);
export const NOW=1_900_000_000;
export const policy=evmFinalityPolicy({chain:'evm',finality:{kind:'evm-finalized-tag'}},2,3);

export class Store{
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
export const value=response=>{
 assert.equal(response.result.ok,true,JSON.stringify(response));
 return response.result.value;
};
export const hex=number=>'0x'+BigInt(number).toString(16);
export const word=number=>'0x'+BigInt(number).toString(16).padStart(64,'0');
export const blockHash=height=>'0x'+'a'+height.toString(16).padStart(63,'0');

/**
 * A minimal fake EVM chain: one block per mined transaction, a settable chain time, and the escrow state that
 * release/refund/fund calldata implies. `send` decides each wallet send: 'mine' includes it, 'reject' answers
 * EIP-1193 4001, 'hold' keeps it in the pool until includeHeld(), 'refuse' counts it and throws UNEXPECTED_SEND.
 * `decimals` and `balance` are what the fake token reports through eth_call.
 */
export function fakeChain({escrow,escrowState='absent',send='mine',head=16,decimals=6,balance=10n**24n}){
 const selector=action=>escrowCallFor({action,escrow,tradeId:'0'.repeat(64)}).call.data.slice(0,10);
 const pendingSelector=buildPendingWithdrawals(escrow,SELLER,SELLER).data.slice(0,10);
 const stateOf=input=>{
  const kind=input.slice(0,10);
  return kind===selector('release')?'released':kind===selector('refund')?'refunded':'funded';
 };
 const chain={escrowState,sends:0,send,head,nonce:0,now:NOW,blocks:new Map(),txs:new Map()};
 chain.mine=tx=>{
  const lower={from:tx.from.toLowerCase(),to:tx.to.toLowerCase(),input:tx.input.toLowerCase()};
  const mined={...tx,...lower,blockNumber:++chain.head};
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
  if(mined.to===escrow.toLowerCase())chain.escrowState=stateOf(mined.input);
  return mined.hash;
 };
 chain.advance=blocks=>{chain.head+=blocks;};
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
   if(!reverted)chain.escrowState=stateOf(mined.input);
  }
 };
 const headOf=()=>({number:String(chain.head),hash:blockHash(chain.head)});
 const view=tx=>({
  hash:tx.hash,from:tx.from,to:tx.to,nonce:tx.nonce,input:tx.input,value:tx.value,blockNumber:String(tx.blockNumber),
 });
 const done=result=>Promise.resolve({ok:true,value:result});
 chain.reader=Object.freeze({
  chainId:()=>done('31337'),
  // `finalizedLag` keeps the finalized head that many blocks behind latest (0: finalized equals latest);
  // `finalizedUnavailable` models a node that does not report a finalized head yet.
  head:tag=>{
   if(tag!=='finalized')return done(headOf());
   if(chain.finalizedUnavailable)return done(null);
   const height=chain.head-(chain.finalizedLag??0);
   return done({number:String(height),hash:blockHash(height)});
  },
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
   if(chain.send==='refuse')throw Error('UNEXPECTED_SEND');
   if(chain.send==='reject')throw Object.assign(Error('User rejected the request.'),{code:4001});
   // 'hold' answers with a hash while the transaction stays in the node's pool until includeHeld().
   if(chain.send==='hold')return chain.hold({from:tx.from,to:tx.to,input:tx.data,value:String(BigInt(tx.value)),
    nonce:String(BigInt(tx.nonce))});
   return chain.mine({
    from:tx.from,to:tx.to,input:tx.data,value:String(BigInt(tx.value)),nonce:String(BigInt(tx.nonce)),
   });
  }
  if(method==='eth_accounts')return[SELLER];
  if(method==='eth_chainId')return'0x7a69';
  if(method==='eth_getBlockByNumber'){
   // `failBlockReads` models a chain RPC outage before anything reaches the relay.
   if(chain.failBlockReads>0){
    chain.failBlockReads--;
    throw Error('RPC_DOWN');
   }
   const lag=params[0]==='finalized'?chain.finalizedLag??0:0;
   const height=['latest','finalized'].includes(params[0])?chain.head-lag:Number(BigInt(params[0]??chain.head));
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
   return data==='0x313ce567'?word(decimals):data==='0x70a08231'?word(balance):data==='0xdd62ed3e'?word(0):word(1);
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

/**
 * One Worker-equivalent journey over a shared encrypted `store` and fake `chain`. `guidanceOf(binding,anchorHash)`
 * is the payment-guidance view the fake preflight reports, `nativeExtras` adds or overrides native adapters, and
 * `journeyOptions` adds createPrivateTradeJourney options (relay factory, peer acceptance, ...).
 */
export function workerJourney({store,chain,FakeWallet,guidanceOf,nativeExtras={},journeyOptions={}}){
 const vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
 const backup=new EncryptedBackupService(store);
 const inert={invalidate(){},dispose(){}};
 const anchor=()=>({height:String(chain.head),hash:blockHash(chain.head)});
 const native={
  MessagingIdentityService,
  createIdentityProvider:createLocalNobleIdentityProvider,
  EvmWalletAdapter:FakeWallet,
  walletProvider(){return{request:chain.request};},
  selectorOf(){return'c1d2e3f4';},
  evmTermsHash,
  escrowCallFor,
  decodeIntentPayload,
  async readObservation(){return{ok:true,value:{state:chain.escrowState}};},
  createEip1193ChainReader(){return chain.reader;},
  createLifecycleJournal,
  createEvmTxLifecycle,
  policy,
  createEvmPaymentPreflight({binding}){
   const guidance=()=>guidanceOf(binding,anchor().hash);
   return{ok:true,value:{
    ...inert,view(){return{ok:true,value:guidance()};},async read(){return{ok:true,value:guidance()};},
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
  ...nativeExtras,
 };
 const journey=createPrivateTradeJourney({
  services:{vault,backup},native,registryBytes,registryDigest,request:chain.request,...journeyOptions,
 });
 return{vault,journey};
}

/** Runs `work(vault,session)` over its own unlocked session of the shared store, then locks and disposes. */
export async function withUnlockedVault(store,profileId,pass,work){
 const vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
 try{
  const session=ok(await vault.unlock(profileId,pass));
  return await work(vault,session);
 }finally{
  vault.lockAll();
  vault.dispose();
 }
}

/** Runs `work` with a lifecycle journal over its own unlocked session of the shared store. */
export function withJournal(store,profileId,pass,work){
 return withUnlockedVault(store,profileId,pass,async(vault,session)=>{
  const journal=createLifecycleJournal({vault,session,validateCanonical:async()=>({ok:true,value:undefined})});
  try{return await work(journal);}finally{journal.dispose();}
 });
}

/** Durable journal rows for the profile as written, read through an independent session. */
export function journalIntents(store,profileId,pass){
 return withUnlockedVault(store,profileId,pass,async(vault,session)=>{
  const rows=ok(await vault.list(session.sessionId,'journal'));
  return rows.map(row=>decodeIntentPayload(row.payload));
 });
}
