/** Compiled LOCALPROOF root: public development wallets and owned loopback endpoints only. Never a default app Worker. */
import {createPrivateTradeJourney} from '../../apps/web/src/journey/private-trade.ts';
import {RegistryService} from '../../packages/domain/index.ts';
import {EncryptedVaultService,EncryptedBackupService} from '../../packages/storage/index.ts';
import {IndexedDbVaultStore} from '../../packages/storage/src/idb-vault-store.ts';
import {MessagingIdentityService} from '../../packages/identity/src/identity-service.ts';
import {createLocalNobleIdentityProvider} from '../../packages/identity/index.ts';
import {EvmWalletAdapter} from '../../packages/wallet/src/evm-adapter.ts';
import {verifyEvmAgreementBundle} from '../../packages/wallet/src/evm-agreement.ts';
import {evmTermsHash,keccak256} from '../../packages/wallet/src/evm-terms.ts';
import {createEip1193ChainReader,escrowCallFor} from '../../packages/wallet/src/evm-submit.ts';
import {selectorOf,buildGetTrade,buildTradeIdOf,decodeTrade,tradeMatchesTerms,buildChainObservation} from '../../packages/wallet/src/evm-escrow.ts';
import {decodeEscrowLog,buildPendingWithdrawals,buildWithdraw} from '../../packages/wallet/src/evm-escrow.ts';
import {createEvmPaymentPreflight} from '../../packages/wallet/src/evm-payment-preflight.ts';
import {createLifecycleJournal} from '../../packages/domain/src/intent-journal.ts';
import {createEvmTxLifecycle,evmFinalityPolicy} from '../../packages/domain/src/tx-lifecycle.ts';
import {createTradeAuthority} from '../../packages/domain/src/authority.ts';
import {createTradeComposition} from '../../packages/domain/src/trade-composition.ts';
import {decodeIntentPayload} from '../../packages/schemas/index.ts';
import {createRelayPool,POOL_LIMITS} from '../../packages/relay/index.ts';
import {makeBroker,FAST} from '../../packages/relay/test/support/harness.mjs';
let journey,setupPromise,lastId=0,activeRequests=0,controlPending=false,commandEpoch=0,rpcId=0,loseResponse=true,privacyRevoke,invalidateDuringInspect,shortNextReview=false,markerListMode=null,releaseMarkerList,renewTransport,policyProbe;const walletEventTargets=new Set();
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
 // Negative-only native test seam: pause an ACTUAL read of a durable unknown marker.
 const originalList=vault.list.bind(vault);
 vault.list=async(...args)=>{const result=await originalList(...args);if(markerListMode&&args[1]==='journal'&&result.ok&&result.value.some(row=>decodeIntentPayload(row.payload).state==='broadcast-unknown')){const mode=markerListMode;markerListMode=null;await new Promise(done=>{releaseMarkerList=done;self.postMessage({kind:'fixture-marker-list-held',mode});});releaseMarkerList=undefined;if(mode==='revocation')privacyRevoke?.();self.postMessage({kind:'fixture-marker-list-released',mode,durableState:'broadcast-unknown'});}return result;};
 const registryBytes=new TextEncoder().encode(JSON.stringify(config.registry)),registry=new RegistryService(),loaded=await registry.load(registryBytes,config.registryDigest);if(!loaded.ok)throw Error('INTEGRITY_FAILURE');
 const node=registry.network('local-evm')?.endpoints[0];if(!node)throw Error('INTEGRITY_FAILURE');
 const logicalRelayURL='wss://relay-a.fixture.invalid/',{broker:primaryBroker,registry:relayIssuer}=makeBroker({endpoints:['relay-a'],endpointURLs:{'relay-a':logicalRelayURL},coverage:'direct',mode:'ordinary'});
 const poolRecords=new Map(),poolBrokers=new Set(),physicalSockets=new Set(),heldCloses=new Map(),probeSubscriptions=[],probeScopes=[];let poolId=0,connectionStarts=0,holdCloses=false,collectProbeScopes=false;
 const originalCapture=primaryBroker.capture.bind(primaryBroker);
 primaryBroker.capture=(...args)=>{const scope=originalCapture(...args);if(collectProbeScopes&&typeof scope!=='string'&&probeScopes.length<2){probeScopes.push(scope);if(probeScopes.length===2)collectProbeScopes=false;}return scope;};
 const listeners=new Set();let invalidateNextInspection=false;invalidateDuringInspect=()=>{invalidateNextInspection=true;};let seenBroker,seenGeneration=-1,detailsGeneration=0,relayPoolCount=0;
 const generation=()=>{const next=primaryBroker?.generation??-1;if(primaryBroker!==seenBroker||next!==seenGeneration){if(detailsGeneration>=Number.MAX_SAFE_INTEGER-1)throw Error('LIMIT_EXCEEDED');detailsGeneration++;seenBroker=primaryBroker;seenGeneration=next;}return detailsGeneration;};
 const notify=()=>{generation();for(const listener of [...listeners])listener();self.postMessage({kind:'native-transport-selection-invalidated'});};
 primaryBroker.subscribeInvalidation(notify);
 // This test issuer alone renews its own generation after explicit successful create/unlock.
 // It preserves the SAME broker and mode, opens nothing and never revives an old captured grant.
 renewTransport=()=>{for(const listener of [...relayIssuer.listeners])listener();notify();};
 const privacy={
  transport:{get generation(){return generation();},get mode(){return primaryBroker?.mode??'ordinary';},inspect(channel){if(channel==='relay'&&invalidateNextInspection){invalidateNextInspection=false;notify();}const inspected=channel==='relay'&&primaryBroker?primaryBroker.inspect(channel):null;return{channel,coverage:inspected?.coverage??'unknown',adapterId:inspected?.adapterId??'no-app-route-observation',generation:generation()};}},
  endpoints:{get generation(){return generation();},read(){const observedAt=Math.floor(performance.now()),lifetime=shortNextReview?2000:30000;shortNextReview=false;return{version:1,generation:generation(),observedAt,expiresAt:observedAt+lifetime,endpoints:[{channel:'rpc',id:node.id,configuredUrl:node.url,connectionUrl:new URL('/rpc',self.location.href).href},...(relayPoolCount?[{channel:'relay',id:'relay-a',configuredUrl:logicalRelayURL,connectionUrl:config.relayURL}]:[])]};}},
  subscribeInvalidation(listener){if(listeners.size>=64)throw Error('LIMIT_EXCEEDED');listeners.add(listener);return()=>listeners.delete(listener);},
 };
 const proofSnapshot=()=>({mode:primaryBroker.mode,brokerGeneration:primaryBroker.generation,brokerOwners:poolBrokers.size,pools:[...poolRecords].map(([id,record])=>({id,sameBroker:record.broker===primaryBroker,states:record.pool.status().map(row=>row.state)})),probeScopeCurrent:probeScopes.map(scope=>scope.current()),probeScopeAborted:probeScopes.map(scope=>scope.signal.aborted),physicalSockets:physicalSockets.size,heldCloses:heldCloses.size,connectionStarts,rpcCoverage:privacy.transport.inspect('rpc').coverage,walletCoverage:privacy.transport.inspect('wallet').coverage});
 policyProbe=action=>{
  if(action==='observe')return proofSnapshot();
  if(action==='keep-relays'){if(probeSubscriptions.length||poolRecords.size!==2)throw Error('INVALID_INPUT');collectProbeScopes=probeScopes.length<2;for(const{pool}of poolRecords.values()){const result=pool.subscribe([{kinds:[1],since:Math.floor(Date.now()/1000)-30,limit:1}],{onEvent(){}});if(!result.ok)throw Error(result.error);probeSubscriptions.push(result.value);}}
  else if(action==='hold-closes')holdCloses=true;
  else if(action==='release-closes'){holdCloses=false;const closes=[...heldCloses.values()];heldCloses.clear();for(const close of closes)close();}
  else if(action==='release-subscriptions'){for(const subscription of probeSubscriptions.splice(0))subscription.close();}
  else if(action==='retry-relays'){for(const{pool}of poolRecords.values())pool.retry('relay-a');}
  else if(action==='check-direct'){const permit=primaryBroker.authorize({channel:'relay',endpointId:'relay-a',method:'read'});if(typeof permit==='string')return{...proofSnapshot(),authorization:permit};const scope=primaryBroker.capture(permit);if(typeof scope!=='string')scope.dispose();return{...proofSnapshot(),authorization:'ALLOWED'};}
  else throw Error('INVALID_INPUT');
  return proofSnapshot();
 };
 privacyRevoke=()=>{primaryBroker?.revoke('fixture-adapter');notify();};
 const native={selectorOf,decodeEscrowLog,buildPendingWithdrawals,buildWithdraw,decodeIntentPayload,MessagingIdentityService,createIdentityProvider:createLocalNobleIdentityProvider,EvmWalletAdapter,verifyEvmAgreementBundle,evmTermsHash,createEip1193ChainReader,escrowCallFor,createEvmPaymentPreflight,createLifecycleJournal,createEvmTxLifecycle,createTradeAuthority,createTradeComposition,readObservation,policy:evmFinalityPolicy({chain:'evm',finality:{kind:'evm-finalized-tag'}},2,3),walletProvider(index){const listeners=new Map(),emit=(event,args)=>{for(const listener of listeners.get(event)??[])listener(args);};return{async request({method,params=[]}){if(method==='eth_requestAccounts'||method==='eth_accounts')return[(await request({method:'eth_accounts'}))[index]];return request({method,params});},on(event,listener){const set=listeners.get(event)??new Set();set.add(listener);listeners.set(event,set);walletEventTargets.add(emit);},removeListener(event,listener){const set=listeners.get(event);set?.delete(listener);if(set?.size===0)listeners.delete(event);if(listeners.size===0)walletEventTargets.delete(emit);}};}};
 journey=createPrivateTradeJourney({services:{vault,backup,transportPolicy:{broker:primaryBroker,brokeredChannels:['relay'],onSelectionChanged:notify}},native,registryBytes,registryDigest:config.registryDigest,request,privacy,
  onInvalidated:snapshot=>self.postMessage({kind:'scope-invalidated',snapshot}),
  onSigningReviewInvalidated:snapshot=>self.postMessage({kind:'signing-review-invalidated',snapshot}),
  localPeerAcceptance:async({wallet,session,domain,terms})=>{const result=await wallet.signTerms(session,domain,terms,'buyer');if(!result.ok)throw Error('PEER_SIGNATURE_FAILED');return result.value;},
  createRelay({verifier,nowSeconds}){const broker=primaryBroker,pool=createRelayPool({broker,relays:[{endpointId:'relay-a',url:logicalRelayURL}],connect:(target,signal)=>{if(signal.aborted||target!==logicalRelayURL)throw Error('DENIED');if(physicalSockets.size>=2*POOL_LIMITS.maxRelays)throw Error('LIMIT_EXCEEDED');const socket=new WebSocket(config.relayURL),close=socket.close.bind(socket);connectionStarts++;physicalSockets.add(socket);socket.addEventListener('close',()=>{physicalSockets.delete(socket);heldCloses.delete(socket);},{once:true});socket.close=(...args)=>{if(holdCloses){if(!heldCloses.has(socket))heldCloses.set(socket,()=>close(...args));return;}close(...args);};return socket;},verifier,timing:FAST,nowSeconds});let closed=false;const id=++poolId;poolRecords.set(id,{broker,pool});poolBrokers.add(broker);relayPoolCount++;notify();return Object.freeze({...pool,close(){if(closed)return;closed=true;pool.close();poolRecords.delete(id);relayPoolCount--;notify();}});},
 });
}
self.onmessage=async({data})=>{
 if(data?.kind==='fixture-policy-probe'){const probeId=data.probeId;if(!Number.isSafeInteger(probeId)||probeId<1||Object.keys(data).some(key=>!['kind','probeId','action'].includes(key)))return;try{if(!policyProbe)throw Error('LOCKED');self.postMessage({kind:'fixture-policy-probe-result',probeId,value:policyProbe(data.action)});}catch(error){self.postMessage({kind:'fixture-policy-probe-result',probeId,error:/^[A-Z_]{1,64}$/.test(error?.message??'')?error.message:'OPERATION_FAILED'});}return;}
 if(data?.kind==='fixture-privacy-event'){if(data.event==='revoke')privacyRevoke?.();if(data.event==='expire-next-review')shortNextReview=true;if(data.event==='invalidate-during-inspect')invalidateDuringInspect?.();if(data.event==='arm-marker-list'&&(data.mode==='expiry'||data.mode==='revocation'))markerListMode=data.mode;if(data.event==='release-marker-list')releaseMarkerList?.();return;}
 // Negative native-provider event seam exists only in this compiled fixture root; it cannot grant any fact.
 if(data?.kind==='fixture-wallet-event'){if(data.event!=='accountsChanged'||!Array.isArray(data.accounts)||data.accounts.length!==1||!/^0x[0-9a-f]{40}$/.test(data.accounts[0]))return;for(const emit of walletEventTargets)emit('accountsChanged',data.accounts);self.postMessage({kind:'fixture-event-applied'});return;}
 const id=data?.id;if(!Number.isSafeInteger(id)||id<=lastId||!data||Object.keys(data).some(key=>!['id','kind','input','action','signingAction','recordId','attestFiatReceived','reviewRiskAccepted','assetId','amountBaseUnits'].includes(key))){self.postMessage({id,error:'INVALID_INPUT'});return;}lastId=id;
 const policy=data.kind==='runtime'&&(data.input?.operation==='getTransportSelection'||data.input?.operation==='selectTransportMode');
 if(policy&&!journey){self.postMessage({id,error:'LOCKED'});return;}
 const control=data.kind==='runtime'&&(data.input?.operation==='lock'||data.input?.operation==='dispose');if(control)commandEpoch++;const mine=commandEpoch;
 if(activeRequests>0&&((!control&&!policy)||controlPending)){self.postMessage({id,error:'BUSY'});return;}
 activeRequests++;if(control)controlPending=true;try{setupPromise??=setup();await setupPromise;if(!control&&mine!==commandEpoch)throw Error('LOCKED');const value=data.kind==='runtime'?await journey.runtime(data.input):data.kind==='action'?await journey.act(data.action,{signingAction:data.signingAction,assetId:data.assetId,amountBaseUnits:data.amountBaseUnits,recordId:data.recordId,attestFiatReceived:data.attestFiatReceived,reviewRiskAccepted:data.reviewRiskAccepted}):(()=>{throw Error('INVALID_INPUT');})();if(data.kind==='runtime'&&(data.input.operation==='create'||data.input.operation==='unlock')&&value.result?.ok)renewTransport?.();self.postMessage({id,value});}
 catch(error){const code=/^[A-Z_]{1,64}$/.test(error?.message??'')?error.message:'OPERATION_FAILED';self.postMessage({id,error:code,snapshot:journey?.snapshot()});}
 finally{if(data?.input?.bytes instanceof Uint8Array)data.input.bytes.fill(0);activeRequests--;if(control)controlPending=false;}
};
