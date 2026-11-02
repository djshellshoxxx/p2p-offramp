/** Compiled LOCALPROOF root: public development wallets and owned loopback endpoints only. Never a default app Worker. */
import {createPrivateTradeJourney} from '../../apps/web/src/journey/private-trade.ts';
import {EncryptedVaultService,EncryptedBackupService} from '../../packages/storage/index.ts';
import {IndexedDbVaultStore} from '../../packages/storage/src/idb-vault-store.ts';
import {MessagingIdentityService} from '../../packages/identity/src/identity-service.ts';
import {createLocalNobleIdentityProvider} from '../../packages/identity/index.ts';
import {EvmWalletAdapter} from '../../packages/wallet/src/evm-adapter.ts';
import {verifyEvmAgreementBundle} from '../../packages/wallet/src/evm-agreement.ts';
import {evmTermsHash,keccak256} from '../../packages/wallet/src/evm-terms.ts';
import {createEip1193ChainReader,escrowCallFor} from '../../packages/wallet/src/evm-submit.ts';
import {buildGetTrade,buildTradeIdOf,decodeTrade,tradeMatchesTerms,buildChainObservation} from '../../packages/wallet/src/evm-escrow.ts';
import {createEvmPaymentPreflight} from '../../packages/wallet/src/evm-payment-preflight.ts';
import {createLifecycleJournal} from '../../packages/domain/src/intent-journal.ts';
import {createEvmTxLifecycle,evmFinalityPolicy} from '../../packages/domain/src/tx-lifecycle.ts';
import {createTradeAuthority} from '../../packages/domain/src/authority.ts';
import {createTradeComposition} from '../../packages/domain/src/trade-composition.ts';
import {decodeIntentPayload} from '../../packages/schemas/index.ts';
import {createRelayPool} from '../../packages/relay/index.ts';
import {makeBroker,FAST} from '../../packages/relay/test/support/harness.mjs';
let journey,setupPromise,lastId=0,activeRequests=0,controlPending=false,commandEpoch=0,rpcId=0,loseResponse=true;const walletEventTargets=new Set();
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
async function request({method,params=[]}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:controller.signal});const text=await response.text();if(text.length>262144)throw Error('LIMIT_EXCEEDED');const raw=JSON.parse(text);if(raw.error)throw Error('NATIVE_RPC_FAILED');if(method==='eth_sendTransaction'&&loseResponse){loseResponse=false;throw Error('Synthetic lost response after native broadcast');}return raw.result;}finally{clearTimeout(timer);}
}
async function readObservation({registry,binding,terms,domain,request,generation,requestSequence,signal}){
 try{
  const read=async(method,params=[])=>{if(signal?.aborted)throw Error();const value=await request({method,params});if(signal?.aborted)throw Error();return value;};
  const network=registry.network(binding.networkId),deployment=registry.deployment(binding.networkId,binding.deploymentId);
  if(BigInt(await read('eth_chainId'))!==BigInt(network.chainIdentity)||(await read('eth_getBlockByNumber',['0x0',false])).hash!==network.genesisHash)throw Error();
  const anchor=await read('eth_getBlockByNumber',['finalized',false]);if(!anchor)throw Error();
  const code=await read('eth_getCode',[deployment.address,anchor.number]);if(!/^0x(?:[0-9a-f]{2})+$/i.test(code)||hex(keccak256(Uint8Array.from(code.slice(2).match(/../g),v=>parseInt(v,16))))!==deployment.runtime.keccak256)throw Error();
  if(await read('eth_call',[{to:deployment.address,data:buildTradeIdOf(domain,terms).data},anchor.number])!==`0x${binding.tradeId}`)throw Error();
  const encoded=await read('eth_call',[{to:deployment.address,data:buildGetTrade(deployment.address,binding.tradeId).data},anchor.number]);const trade=decodeTrade(encoded);if(trade.state!=='absent'&&!tradeMatchesTerms(trade,terms))throw Error();
  const repeated=await read('eth_getBlockByNumber',[anchor.number,false]);if(repeated?.hash!==anchor.hash||repeated.number!==anchor.number)throw Error();
  return{ok:true,value:buildChainObservation(deployment.address,{binding,generation,requestSequence,getTradeReturn:encoded,anchor:{height:String(BigInt(anchor.number)),hash:anchor.hash},finality:'finalized',observedAt:Date.now()})};
 }catch{return{ok:false,error:{code:'INTEGRITY_FAILURE'}};}
}
async function setup(){
 const config=await(await fetch('/configuration.json')).json();const store=new IndexedDbVaultStore(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store);
 const native={decodeIntentPayload,MessagingIdentityService,createIdentityProvider:createLocalNobleIdentityProvider,EvmWalletAdapter,verifyEvmAgreementBundle,evmTermsHash,createEip1193ChainReader,escrowCallFor,createEvmPaymentPreflight,createLifecycleJournal,createEvmTxLifecycle,createTradeAuthority,createTradeComposition,readObservation,policy:evmFinalityPolicy({chain:'evm',finality:{kind:'evm-finalized-tag'}},2,3),walletProvider(index){const listeners=new Map(),emit=(event,args)=>{for(const listener of listeners.get(event)??[])listener(args);};return{async request({method,params=[]}){if(method==='eth_requestAccounts'||method==='eth_accounts')return[(await request({method:'eth_accounts'}))[index]];return request({method,params});},on(event,listener){const set=listeners.get(event)??new Set();set.add(listener);listeners.set(event,set);walletEventTargets.add(emit);},removeListener(event,listener){const set=listeners.get(event);set?.delete(listener);if(set?.size===0)listeners.delete(event);if(listeners.size===0)walletEventTargets.delete(emit);}};}};
 journey=createPrivateTradeJourney({services:{vault,backup},native,registryBytes:new TextEncoder().encode(JSON.stringify(config.registry)),registryDigest:config.registryDigest,request,
  onInvalidated:snapshot=>self.postMessage({kind:'scope-invalidated',snapshot}),
  localPeerAcceptance:async({wallet,session,domain,terms})=>{const result=await wallet.signTerms(session,domain,terms,'buyer');if(!result.ok)throw Error('PEER_SIGNATURE_FAILED');return result.value;},
  createRelay({verifier,nowSeconds}){const url='wss://relay-a.fixture.invalid/',broker=makeBroker({endpoints:['relay-a'],endpointURLs:{'relay-a':url},coverage:'direct',mode:'ordinary'}).broker;const pool=createRelayPool({broker,relays:[{endpointId:'relay-a',url}],connect:(target,signal)=>{if(signal.aborted||target!==url)throw Error('DENIED');return new WebSocket(config.relayURL);},verifier,timing:FAST,nowSeconds});return Object.freeze({...pool,close(){pool.close();broker.dispose();}});},
 });
}
self.onmessage=async({data})=>{
 // Negative native-provider event seam exists only in this compiled fixture root; it cannot grant any fact.
 if(data?.kind==='fixture-wallet-event'){if(data.event!=='accountsChanged'||!Array.isArray(data.accounts)||data.accounts.length!==1||!/^0x[0-9a-f]{40}$/.test(data.accounts[0]))return;for(const emit of walletEventTargets)emit('accountsChanged',data.accounts);self.postMessage({kind:'fixture-event-applied'});return;}
 const id=data?.id;if(!Number.isSafeInteger(id)||id<=lastId||!data||Object.keys(data).some(key=>!['id','kind','input','action','recordId','attestFiatReceived','reviewRiskAccepted'].includes(key))){self.postMessage({id,error:'INVALID_INPUT'});return;}lastId=id;
 const control=data.kind==='runtime'&&(data.input?.operation==='lock'||data.input?.operation==='dispose');if(control)commandEpoch++;const mine=commandEpoch;
 if(activeRequests>0&&(!control||controlPending)){self.postMessage({id,error:'BUSY'});return;}
 activeRequests++;if(control)controlPending=true;try{setupPromise??=setup();await setupPromise;if(!control&&mine!==commandEpoch)throw Error('LOCKED');const value=data.kind==='runtime'?await journey.runtime(data.input):data.kind==='action'?await journey.act(data.action,{recordId:data.recordId,attestFiatReceived:data.attestFiatReceived,reviewRiskAccepted:data.reviewRiskAccepted}):(()=>{throw Error('INVALID_INPUT');})();self.postMessage({id,value});}
 catch(error){const code=/^[A-Z_]{1,64}$/.test(error?.message??'')?error.message:'OPERATION_FAILED';self.postMessage({id,error:code,snapshot:journey?.snapshot()});}
 finally{if(data?.input?.bytes instanceof Uint8Array)data.input.bytes.fill(0);activeRequests--;if(control)controlPending=false;}
};
