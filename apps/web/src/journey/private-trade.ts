/** Private LOCALPROOF composition. Import only from an isolated, explicitly constructed Worker entry.
 * Native constructors are capabilities supplied by the trusted composition root, never protocol data.
 * No production peer-acceptance carrier is defined here and this module cannot enable the default app.
 */
import {RegistryService,reviewTermsBytes,TERMS_REVIEW_FORMAT,encodePrivateAgreement,encodeCapabilities,sha256Hex,checkFundingWindow,createJourneyProjection,createCoreError,createOperationId,type CoreResult,type PrivateAgreementV1} from '../../../../packages/domain/index.ts';
import {createLocalNobleNostrProvider,type NostrEvent} from '../../../../packages/nostr-crypto/index.ts';
import {createOrderBook,createAdEvent,AD_KIND} from '../../../../packages/relay/index.ts';
import {createRelayEventCrypto,createTermsExchange,adBookKey} from '../../../../packages/exchange/index.ts';
import {decodeIdentityPayload,decodeBase64url,parseStrictJsonBytes,type IntentV1,type TradeBinding,type RuntimeResponse} from '../../../../packages/schemas/index.ts';
import {createJourneyVaultComposition} from './vault-composition.ts';
import type {JourneyOptions,JourneyController,JourneySnapshot,Phase,EvmTerms,EvmDomain,Party,NegotiatingParty,NativeFeeReceipt,PreparedIntent,ChainReader,Journal,Lifecycle,PaymentGuidance,Authority,TradeComposition,NativeIntentObservation,ReviewedEvmTerms,PreparedRequest,JourneyRuntimeInput,EscrowCall,Request} from './native-contracts.ts';
import type {JourneyVaultSelection} from './vault-composition.ts';
const utf8=new TextEncoder(),ZERO=`0x${'0'.repeat(40)}`;
type ResultLike<T>={readonly ok:true;readonly value:T}|{readonly ok:false;readonly error?:unknown;readonly code?:string};
function value<T>(result:ResultLike<T>):T{if(result.ok)return result.value;const descriptor=result.error&&typeof result.error==='object'?Object.getOwnPropertyDescriptor(result.error,'code'):undefined;throw Error(typeof descriptor?.value==='string'?descriptor.value:typeof result.error==='string'?result.error:result.code??'OPERATION_FAILED');}
const equal=(a:Uint8Array,b:Uint8Array):boolean=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function defined<T>(input:T|undefined|null):T{if(input===undefined||input===null)throw Error('LOCKED');return input;}
function field(input:unknown,key:string):unknown{if(typeof input!=='object'||input===null||Array.isArray(input))throw Error('INTEGRITY_FAILURE');const d=Object.getOwnPropertyDescriptor(input,key);if(!d||!('value'in d))throw Error('INTEGRITY_FAILURE');return d.value;}
function text(input:unknown,key:string,pattern:RegExp):string{const v=field(input,key);if(typeof v!=='string'||!pattern.test(v))throw Error('INTEGRITY_FAILURE');return v;}
const quantity=(v:unknown):string=>{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(v))throw Error('INTEGRITY_FAILURE');return String(BigInt(v));};
export function parseCanonicalPreparedRequest(input:string):PreparedRequest{
 const raw=parseStrictJsonBytes(utf8.encode(input),65536);if(field(raw,'v')!==1)throw Error('INTEGRITY_FAILURE');
 const parsed:PreparedRequest={v:1,chainId:text(raw,'chainId',/^(0|[1-9][0-9]{0,77})$/),from:text(raw,'from',/^0x[0-9a-f]{40}$/),to:text(raw,'to',/^0x[0-9a-f]{40}$/),data:text(raw,'data',/^0x(?:[0-9a-f]{2})*$/),value:text(raw,'value',/^(0|[1-9][0-9]{0,77})$/),nonce:text(raw,'nonce',/^(0|[1-9][0-9]{0,77})$/),preparedAtBlock:text(raw,'preparedAtBlock',/^(0|[1-9][0-9]{0,77})$/)};
 if(JSON.stringify(parsed)!==input)throw Error('INTEGRITY_FAILURE');return parsed;
}
function failure<T>():CoreResult<T>{return{ok:false,error:createCoreError('INTEGRITY_FAILURE',{operationId:createOperationId(),readOnly:true})};}
export function createPrivateTradeJourney({services,native,registryBytes,registryDigest,request,createRelay,localPeerAcceptance,onInvalidated}:JourneyOptions):JourneyController{
 const vault=createJourneyVaultComposition(services,message=>{if(message.kind==='locked'||message.kind==='closed')clearPrivate();}),registry=new RegistryService(),provider=createLocalNobleNostrProvider();
 let initialization:Promise<void>|undefined;let recoveryCancellationEpoch:number|undefined;let ready=false,closed=false,busy=false,epoch=0,context:JourneyVaultSelection|undefined,phase:Phase='setup';
 let terms:EvmTerms|undefined,domain:EvmDomain|undefined,binding:TradeBinding|undefined,agreement:PrivateAgreementV1|undefined,document:Uint8Array<ArrayBuffer>|undefined,sessionId:string|undefined,prepared:PreparedIntent|undefined,intentId:string|undefined,receipt:NativeFeeReceipt|null=null,backupRevision:number|null=null,clock=0,clockObservedAt=performance.now(),sends=0;
 const parties:Party[]=[],owned:Uint8Array[]=[],cleanup:(()=>void)[]=[];const nativeRequests=new Set<Promise<unknown>>();
 const snapshot=():JourneySnapshot=>{if(context){try{context.assertCurrent();}catch{clearPrivate();}}const selectedTerms=terms;const reviewed=selectedTerms?registry.network(selectedTerms.networkId)?.assets.find(asset=>asset.kind===selectedTerms.assetKind&&(asset.address??ZERO)===selectedTerms.asset):undefined;return Object.freeze({label:'LOCALPROOF',tradingEnabled:false,productionBlocker:'Peer wallet-acceptance carrier and maintained signing trust root remain undefined.',phase,profileId:context?.session.profileId??null,backupRevision,account:parties[0]?.walletSession.account??null,terms:terms&&domain&&reviewed?{...terms,assetId:reviewed.id,decimals:reviewed.decimals,chainId:domain.chainId,escrowAddress:domain.verifyingContract}:null,manualPayment:agreement?{currency:agreement.fiatCurrency,minorUnits:agreement.fiatMinorUnits,scale:agreement.fiatScale,instructions:agreement.paymentInstructions}:null,tradeId:binding?.tradeId??null,intentId:intentId??null,receipt,paymentGuidance:gate?.view()??null,submissionsThisWorker:sends});};
 const selected=():JourneyVaultSelection=>defined(context);
 const trade=()=>({terms:defined(terms),domain:defined(domain),binding:defined(binding),agreement:defined(agreement)});
 const negotiating=():[NegotiatingParty,NegotiatingParty]=>{const seller=parties[0],buyer=parties[1];if(!seller||!buyer||seller.kind!=='negotiation'||buyer.kind!=='negotiation')throw Error('LOCKED');return[seller,buyer];};
 const current=()=>{if(closed||!context)throw Error('LOCKED');context.assertCurrent();for(const party of parties)if(party.walletSession&&party.wallet.inspect()!==party.walletSession)throw Error('WALLET_CHANGED');};
 const fresh=async()=>{context=await vault.requireCurrent();current();};
 const step=async<T>(promise:Promise<T>):Promise<T>=>{const result=await promise;current();return result;};
 const acquire=async<T>(promise:Promise<T>,release:(resource:T)=>void):Promise<T>=>{const resource=await promise;try{current();return resource;}catch(error){release(resource);throw error;}};
 const hashOwned=async(bytes:Uint8Array<ArrayBuffer>):Promise<string>=>{try{return await step(sha256Hex(bytes));}finally{bytes.fill(0);}};
 const ownedRequest=(owner:JourneyVaultSelection,mine:number):Request=>args=>{
  const guard=():void=>{if(epoch!==mine)throw Error('LOCKED');owner.assertCurrent();current();};guard();
  const pending=(async()=>{const result=await request(args);guard();return result;})();nativeRequests.add(pending);void pending.then(()=>nativeRequests.delete(pending),()=>nativeRequests.delete(pending));return pending;
 };
 const scopedRequest:Request=args=>ownedRequest(selected(),epoch)(args);
 const rpc=(method:string,params:readonly unknown[]=[]):Promise<unknown>=>scopedRequest({method,params});
 const chainNow=async()=>Number(BigInt(quantity(field(await rpc('eth_getBlockByNumber',['latest',false]),'timestamp'))));
 const observedNow=():number=>clock+Math.floor(Math.max(0,performance.now()-clockObservedAt)/1000);
 const refreshClock=async():Promise<void>=>{clock=Math.max(observedNow(),await chainNow());clockObservedAt=performance.now();current();};
 const requireAcceptanceTime=async():Promise<void>=>{await refreshClock();if(BigInt(defined(terms).acceptBeforeSeconds)<=BigInt(observedNow()))throw Error('EXPIRED');};
 const pull=async(party:NegotiatingParty,kind=1059)=>{
  const events:NostrEvent[]=[];let end:(value:boolean)=>void=()=>{};const done=new Promise<boolean>(resolve=>end=resolve),timer=setTimeout(()=>end(false),5000);
  const filters=kind===1059?[{kinds:[kind],'#p':[party.pub],since:clock-250000,limit:50}]:[{kinds:[kind],'#t':['p2p-offramp-ad-v1'],since:clock-3600,limit:50}];
  const sub=value(party.pool.subscribe(filters,{onEvent:event=>events.push(event),onEose:()=>end(true)}));
  try{if(!await step(done))throw Error('RELAY_TIMEOUT');return events;}finally{clearTimeout(timer);sub.close();}
 };
 const deliver=async(message:{recipientWrap:NostrEvent},from:NegotiatingParty,to:NegotiatingParty)=>{value(await step(from.pool.publish(message.recipientWrap)));const found=(await pull(to)).find(event=>event.id===message.recipientWrap.id);if(!found)throw Error('MISSING_WRAP');const received=value(await step(to.exchange.receive(found,to.secret)));if('own'in received)throw Error('WRONG_COUNTERPARTY');return received;};
 async function validateCanonical(intent:Readonly<IntentV1>,nativeRequest:Request):Promise<CoreResult<void>>{
  const {terms,domain,binding}=trade();
  try{
   current();if(intent.action!=='fund'&&intent.action!=='release'&&intent.action!=='refund')throw Error('INVALID_INPUT');value(await step(native.readObservation({registry,binding,terms,domain,request:nativeRequest,generation:0,requestSequence:1})));const expected=native.escrowCallFor(intent.action==='fund'?{action:'fund',domain,terms}:{action:intent.action,escrow:domain.verifyingContract,tradeId:binding.tradeId});
   if(!['fund','release','refund'].includes(intent.action)||intent.binding.tradeId!==binding.tradeId||intent.binding.networkId!==binding.networkId||intent.binding.deploymentId!==binding.deploymentId||intent.account!==terms.seller||intent.expectedEscrowState!==expected.expectedEscrowState)throw Error();
   const call=parseCanonicalPreparedRequest(intent.preparedRequest);if(call.chainId!==domain.chainId||call.from!==terms.seller||(['to','data','value'] satisfies readonly (keyof EscrowCall)[]).some(key=>call[key]!==expected.call[key]))throw Error();
   if(intent.action==='fund'&&intent.state==='prepared'&&recoveryCancellationEpoch!==epoch){if(phase!=='accepted'&&phase!=='fund-prepared')throw Error();checkFundingWindow(terms.acceptBeforeSeconds,terms.escrowExpirySeconds,quantity(field(await nativeRequest({method:'eth_getBlockByNumber',params:['latest',false]}),'timestamp')));}
   current();return{ok:true,value:undefined};
  }catch{return failure();}
 }
 let journal:Journal|undefined,life:Lifecycle|undefined,reader:ChainReader|undefined,gate:PaymentGuidance|undefined,authority:Authority|undefined,composition:TradeComposition|undefined,journey:ReturnType<typeof createJourneyProjection>|undefined;
 async function nativeObservation(intent:Readonly<IntentV1>,signal:AbortSignal,nativeRequest:Request):Promise<CoreResult<NativeIntentObservation>>{
  const {terms,domain,binding}=trade(),reader=definedReader();const readRpc=(method:string,params:readonly unknown[]=[])=>nativeRequest({method,params});
  try{
   current();if(intent.submission.chain!=='evm')throw Error('INVALID_INPUT');if(intent.binding.tradeId!==binding.tradeId||intent.binding.networkId!==binding.networkId||intent.binding.deploymentId!==binding.deploymentId||intent.account!==terms.seller)throw Error('INTENT_MISMATCH');
   const observation=value(await step(native.readObservation({registry,binding,terms,domain,request:nativeRequest,generation:0,requestSequence:1,signal})));const final=value(await step(reader.head('finalized',signal)));if(!final)throw Error('FINALITY_UNAVAILABLE');
   let hash=intent.submission.hash;const nonce=intent.submission.nonce;
   if(!hash){
    const expected=parseCanonicalPreparedRequest(intent.preparedRequest),latest=await readRpc('eth_getBlockByNumber',['latest',false]),start=BigInt(expected.preparedAtBlock),end=BigInt(quantity(field(latest,'number')));if(end<start||end-start>64n)throw Error('BOUNDED_RECOVERY_UNAVAILABLE');
    for(let height=start;height<=end;height++){
     const block=await readRpc('eth_getBlockByNumber',[`0x${height.toString(16)}`,true]),raw=field(block,'transactions');if(!Array.isArray(raw)||raw.length>128)throw Error('BOUNDED_RECOVERY_UNAVAILABLE');const transactions:readonly unknown[]=raw;
     for(const tx of transactions)if(text(tx,'from',/^0x[0-9a-f]{40}$/)===expected.from&&quantity(field(tx,'nonce'))===expected.nonce){const candidate=text(tx,'hash',/^0x[0-9a-f]{64}$/);if(hash&&hash!==candidate)throw Error('DUPLICATE_NONCE');hash=candidate;}
    }
    if(!hash)throw Error('TRANSACTION_UNKNOWN');
   }
   const base={binding:intent.binding,account:intent.account,action:intent.action,hash,nonce,replacementHash:null,anchor:{height:final.number,hash:final.hash},canonical:false,finalized:false};
   if(!hash)return{ok:true,value:{...base,state:'broadcast-unknown'}};
   const tx=value(await step(reader.transaction(hash,signal))),receipt=value(await step(reader.receipt(hash,signal)));if(!tx||!receipt)return{ok:true,value:{...base,state:'pending'}};
   const expected=parseCanonicalPreparedRequest(intent.preparedRequest);
   if(tx.hash!==hash||tx.from!==intent.account||tx.to!==expected.to||tx.input!==expected.data||tx.value!==expected.value||tx.nonce!==expected.nonce||nonce!==expected.nonce||receipt.transactionHash!==hash||tx.blockNumber!==receipt.blockNumber)throw Error('TRANSACTION_MISMATCH');
   if(value(await step(reader.blockHashAt(receipt.blockNumber,signal)))!==receipt.blockHash)return{ok:true,value:{...base,state:'reorged'}};
   if(BigInt(receipt.blockNumber)>BigInt(final.number))return{ok:true,value:{...base,state:'confirmed',canonical:true}};
   if(value(await step(reader.blockHashAt(final.number,signal)))!==final.hash)throw Error('ANCHOR_CHANGED');
   if(receipt.status==='reverted')return{ok:true,value:{...base,state:'failed',canonical:true,finalized:true}};
   const allowed=intent.action==='fund'?['funded','released','refunded']:intent.action==='release'?['released']:intent.action==='refund'?['refunded']:[];
   if(!allowed.includes(observation.state))throw Error('STATE_MISMATCH');
   return{ok:true,value:{...base,state:'finalized',canonical:true,finalized:true}};
  }catch{return failure();}
 }
 async function makeParties(){
  const identity=new native.MessagingIdentityService(services.vault,{provider:native.createIdentityProvider(),lifecycle:false});cleanup.push(()=>identity.dispose());
  for(let index=0;index<2;index++){
   await fresh();let pub,secret;
   if(index===0){
    const records=value(await step(services.vault.list(selected().session.sessionId,'identity'))),active=records.filter(record=>record.schemaVersion===1&&decodeIdentityPayload(defined(record).payload).state==='active');if(active.length!==1)throw Error('IDENTITY_MISMATCH');
    const handle=value(await step(identity.unlock(selected().session,defined(active[0]).id)));pub=value(await step(identity.publicIdentity(handle)));const record=value(await step(services.vault.read(selected().session.sessionId,defined(active[0]).id)));
    const payload=decodeIdentityPayload(defined(record).payload);if(payload.profileId!==selected().session.profileId||payload.publicKey!==pub||payload.state!=='active')throw Error('IDENTITY_MISMATCH');
    secret=decodeBase64url(payload.secretKey,32,32);
   }else{
    // The peer is a constructor-authorized synthetic fixture party, not a second identity in the user's profile.
    const pair=await acquire(provider.generate(),pair=>pair.secretKey.fill(0));pub=pair.publicKey;secret=pair.secretKey;
   }
   owned.push(secret);
   const eventCrypto=await acquire(createRelayEventCrypto(provider,secret),crypto=>crypto.dispose());cleanup.push(()=>eventCrypto.dispose());const book=createOrderBook({nowSeconds:observedNow,verifier:eventCrypto});
   const exchange=createTermsExchange({provider,selfPublicKey:pub,ads:book,registry,hashTerms:r=>native.evmTermsHash(defined(domain),asTerms(r)),now:observedNow});
   cleanup.push(()=>exchange.close());const relay=createRelay({verifier:eventCrypto,nowSeconds:observedNow});cleanup.push(()=>relay.close());
   const wallet=new native.EvmWalletAdapter(native.walletProvider(index),'explicit-local-wallet-'+index,registry),unsubscribe=wallet.subscribe(walletInvalidated);cleanup.push(()=>{unsubscribe();wallet.dispose();});
   const walletSession=value(await step(wallet.connect('local-evm')));parties.push({kind:'negotiation',pub,secret,eventCrypto,book,exchange,pool:relay,wallet,walletSession});
  }
 }
 const asTerms=(r:ReviewedEvmTerms):EvmTerms=>({orderId:r.orderId,revision:r.revision,networkId:r.network.id,deploymentId:r.deployment.id,seller:r.seller,buyer:r.buyer,assetKind:r.asset.kind,asset:r.asset.address??ZERO,amountBaseUnits:r.amountBaseUnits,privateAgreementHash:r.privateAgreementSha256,capabilitiesHash:r.capabilitiesSha256,sellerNonce:r.sellerNonce,acceptBeforeSeconds:r.acceptBeforeSeconds,escrowExpirySeconds:r.escrowExpirySeconds});
 const definedDocument=()=>defined(document),definedIntentId=()=>defined(intentId);
 const attached=()=>({journal:defined(journal),life:defined(life),reader:defined(reader),gate:defined(gate),authority:defined(authority),journey:defined(journey)});
 const definedReader=():ChainReader=>defined(reader);
 async function attachNative(){
  const {terms,domain,binding}=trade(),nativeRequest=ownedRequest(selected(),epoch);
     reader=native.createEip1193ChainReader({request:nativeRequest,escrow:domain.verifyingContract});
     journal=native.createLifecycleJournal({vault:services.vault,session:selected().session,validateCanonical:intent=>validateCanonical(intent,nativeRequest),readNative:(intent,signal)=>nativeObservation(intent,signal,nativeRequest)});cleanup.push((owned=>()=>owned.dispose())(journal));
     const baseJournal=journal;const selectedJournal:Journal={...baseJournal,async list(signal){const result=await baseJournal.list(signal);current();return result.ok?{ok:true,value:result.value.filter(intent=>intent.binding.chain===binding.chain&&intent.binding.networkId===binding.networkId&&intent.binding.deploymentId===binding.deploymentId&&intent.binding.tradeId===binding.tradeId&&intent.account===terms.seller)}:result;}};
     life=native.createEvmTxLifecycle({journal:selectedJournal,reader,wallet:async args=>{current();if(args.method==='eth_sendTransaction'){const rows=value(await services.vault.list(selected().session.sessionId,'journal'));current();const markers=rows.map(row=>native.decodeIntentPayload(row.payload)).filter(intent=>intent.state==='broadcast-unknown'&&intent.binding.tradeId===binding.tradeId&&parseCanonicalPreparedRequest(intent.preparedRequest).data===text(defined(args.params?.[0]),'data',/^0x(?:[0-9a-f]{2})*$/));if(markers.length!==1)throw Error('DURABLE_MARKER_REQUIRED');sends++;}return nativeRequest(args);},policy:native.policy});cleanup.push((owned=>()=>owned.dispose())(life));
     await step(life.walletChanged({account:terms.seller,chainId:domain.chainId,generation:defined(parties[0]).walletSession.generation}));
     gate=value(native.createEvmPaymentPreflight({registry,binding,terms,request:nativeRequest}));cleanup.push((owned=>()=>owned.dispose())(gate));
     authority=native.createTradeAuthority({binding,generation:0,walletGeneration:defined(parties[0]).walletSession.generation,readValidated:(_binding,job)=>native.readObservation({registry,binding,terms,domain,request:nativeRequest,...job})});cleanup.push((owned=>()=>owned.dispose())(authority));
     composition=native.createTradeComposition({binding,account:terms.seller,authority,journal});cleanup.push((owned=>()=>owned.dispose())(composition));journey=createJourneyProjection({composition,paymentGuidance:gate});cleanup.push((owned=>()=>owned.dispose())(journey));
 }
 function walletInvalidated():void{gate?.invalidate();const previous=life;clearPrivate();void previous?.walletChanged(null).catch(()=>{});onInvalidated?.(snapshot());}
 function clearPrivate(){epoch++;recoveryCancellationEpoch=undefined;for(const close of cleanup.splice(0)){try{close();}catch{ /* Continue clearing every owned capability. */ }}for(const bytes of owned.splice(0))bytes.fill(0);parties.length=0;context=undefined;terms=domain=binding=agreement=document=sessionId=prepared=intentId=undefined;journal=life=reader=gate=authority=composition=journey=undefined;receipt=null;backupRevision=null;clock=0;clockObservedAt=performance.now();phase='setup';}
 function initialize():Promise<void>{if(ready)return Promise.resolve();initialization??=(async()=>{value(await registry.load(registryBytes,registryDigest));value<unknown>((await vault.request({operation:'init',config:{version:1,ReleaseEnabled:0,connectOrigins:[]}})).result);ready=true;})();return initialization;}
 return Object.freeze({
  snapshot,
  async runtime(input:JourneyRuntimeInput):Promise<RuntimeResponse>{await initialize();if(busy&&input.operation!=='lock'&&input.operation!=='dispose')throw Error('BUSY');if(['create','unlock','lock','dispose'].includes(input.operation)){clearPrivate();}
   const response=await vault.request(input);if(input.operation==='create'&&response.result.ok){context=await vault.requireCurrent();const identity=new native.MessagingIdentityService(services.vault,{provider:native.createIdentityProvider(),lifecycle:false});try{value(await step(identity.create(selected().session)));await fresh();}finally{identity.dispose();}}if(response.operation==='verifyBackup'&&response.result.ok)backupRevision=response.result.value.revision;return response;
  },
  async act(action:string,options:{readonly recordId?:string|undefined;readonly attestFiatReceived?:boolean|undefined;readonly reviewRiskAccepted?:boolean|undefined}={}):Promise<JourneySnapshot>{
   if(busy)throw Error('BUSY');const mine=epoch;busy=true;try{
    await initialize();
    if(action==='connect'){
     if(phase!=='setup')throw Error('OUT_OF_ORDER');context=await vault.requireVerifiedBackup();backupRevision=selected().session.revision;
     // Explicit two-wallet fixture acceptance capability is absent in the production/default construction.
     if(typeof localPeerAcceptance!=='function')throw Error('PEER_ACCEPTANCE_CARRIER_UNDEFINED');
     domain={chainId:'31337',verifyingContract:defined(registry.deployment('local-evm','escrow-local-v1')).address};await refreshClock();await makeParties();
     const [seller,buyer]=negotiating(),orderId=await hashOwned(crypto.getRandomValues(new Uint8Array(32)));current();
     agreement={v:1,orderId,revision:'1',fiatCurrency:'USD',fiatMinorUnits:'100',fiatScale:2,paymentInstructions:'SYNTHETIC manual bank transfer instruction. No fiat payment proof.',capabilities:[],agreementSalt:await hashOwned(crypto.getRandomValues(new Uint8Array(32)))};current();
     terms={orderId,revision:'1',networkId:'local-evm',deploymentId:'escrow-local-v1',seller:seller.walletSession.account,buyer:buyer.walletSession.account,assetKind:'native',asset:ZERO,amountBaseUnits:'1000000000000000',privateAgreementHash:await hashOwned(encodePrivateAgreement(agreement)),capabilitiesHash:await hashOwned(encodeCapabilities([])),sellerNonce:await hashOwned(crypto.getRandomValues(new Uint8Array(32))),acceptBeforeSeconds:String(clock+600),escrowExpirySeconds:String(clock+7200)};current();
     document=utf8.encode(JSON.stringify({format:TERMS_REVIEW_FORMAT,terms,privateAgreement:agreement}));owned.push(document);binding={chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:native.evmTermsHash(domain,terms)};
     phase='wallet';
    }else if(action==='watch'){
     if(phase!=='setup'||typeof options.recordId!=='string'||!/^[0-9a-f]{32}$/.test(options.recordId))throw Error('INVALID_INPUT');context=await vault.requireCurrent();
     const response=await acquire(vault.request({operation:'listTermsReviews',profileId:selected().session.profileId}),reply=>{if(reply.operation==='listTermsReviews'&&reply.result.ok)for(const item of reply.result.value.items)item.bytes.fill(0);});if(response.operation!=='listTermsReviews')throw Error('PROTOCOL_ERROR');const items=value(response.result).items;for(const item of items)owned.push(item.bytes);
     try{const saved=items.find(item=>item.recordId===options.recordId);if(!saved)throw Error('NOT_FOUND');const reviewed=value(await step(reviewTermsBytes(registry,saved.bytes)));terms=asTerms(reviewed);domain={chainId:reviewed.network.chainId,verifyingContract:reviewed.deployment.address};binding={chain:'evm',networkId:terms.networkId,deploymentId:terms.deploymentId,tradeId:native.evmTermsHash(domain,terms)};agreement={v:1,orderId:terms.orderId,revision:terms.revision,...reviewed.agreement,agreementSalt:text(field(parseStrictJsonBytes(saved.bytes,65536),'privateAgreement'),'agreementSalt',/^[0-9a-f]{64}$/)};}
     finally{for(const item of items)item.bytes.fill(0);}
     const watched=trade();const wallet=new native.EvmWalletAdapter(native.walletProvider(0),'explicit-original-seller-wallet',registry),unsubscribe=wallet.subscribe(walletInvalidated);cleanup.push(()=>{unsubscribe();wallet.dispose();});const walletSession=value(await step(wallet.connect(watched.binding.networkId)));if(walletSession.account!==watched.terms.seller)throw Error('WALLET_CHANGED');parties.push({kind:'watch',wallet,walletSession});
     await attachNative();const recoveryBinding=defined(binding),recoveryTerms=defined(terms);const originalPrepared=value(await step(defined(journal).list())).filter(intent=>intent.binding.chain===recoveryBinding.chain&&intent.binding.networkId===recoveryBinding.networkId&&intent.binding.deploymentId===recoveryBinding.deploymentId&&intent.binding.tradeId===recoveryBinding.tradeId&&intent.account===recoveryTerms.seller&&intent.action==='fund'&&intent.state==='prepared');let recovered:readonly IntentV1[];recoveryCancellationEpoch=mine;try{recovered=value(await step(defined(life).recover()));}finally{if(epoch===mine)recoveryCancellationEpoch=undefined;}const observed=value(await step(native.readObservation({registry,binding:watched.binding,terms:watched.terms,domain:watched.domain,request:scopedRequest,generation:0,requestSequence:1})));
     const selectedBinding=watched.binding,selectedTerms=watched.terms;const action=observed.state==='released'?'release':observed.state==='refunded'?'refund':'fund';const matches=recovered.filter(intent=>intent.binding.tradeId===selectedBinding.tradeId&&intent.binding.networkId===selectedBinding.networkId&&intent.binding.deploymentId===selectedBinding.deploymentId&&intent.account===selectedTerms.seller&&intent.action===action);if(matches.length===0&&observed.state==='absent'&&originalPrepared.length===1&&defined(journal).isTerminalVerified(defined(originalPrepared[0]).intentId)){phase='cancelled-before-send';return snapshot();}if(matches.length!==1)throw Error('RECOVERY_SELECTION_REQUIRED');intentId=defined(matches[0]).intentId;phase=action==='fund'?'reconcile':'settling';
    }else if(action==='offer'){
     if(phase!=='wallet')throw Error('OUT_OF_ORDER');await fresh();await requireAcceptanceTime();const {terms,domain,binding}=trade(),document=definedDocument();const[seller,buyer]=negotiating();
     const ad=await step(createAdEvent(seller.eventCrypto,{app:'p2p-offramp',v:1,orderId:terms.orderId,revision:1,networkId:'eip155:31337',assetId:'native',amountMin:terms.amountBaseUnits,amountMax:terms.amountBaseUnits,currency:'USD',railClass:'bank-transfer',expiresAtSeconds:String(clock+1800),maker:seller.pub},clock));
     if(seller.book.ingest(ad)!=='accepted')throw Error('BAD_AD');value(await step(seller.pool.publish(ad)));const received=(await pull(buyer,AD_KIND)).find(event=>event.id===ad.id);if(!received||buyer.book.ingest(received)!=='accepted')throw Error('BAD_AD');
     const take=value(await step(buyer.exchange.take(adBookKey(seller.pub,terms.orderId),terms.buyer,buyer.secret)));sessionId=take.sessionId;await deliver(take,buyer,seller);
     const offered=value(await step(seller.exchange.offer(defined(sessionId),document,seller.secret)));const got=await deliver(offered,seller,buyer);if(got.state!=='offered'||got.termsHash!==binding.tradeId)throw Error('TERMS_MISMATCH');phase='review';
    }else if(action==='accept'){
     if(phase!=='review')throw Error('OUT_OF_ORDER');if(options.reviewRiskAccepted!==true)throw Error('RISK_CONFIRMATION_REQUIRED');await fresh();await requireAcceptanceTime();const {terms,domain,binding,agreement}=trade(),document=definedDocument();const[seller,buyer]=negotiating(),exact=defined(buyer.exchange.session(defined(sessionId))?.terms).bytes;
     try{if(!equal(exact,document))throw Error('TERMS_MISMATCH');const reviewed=value(await step(reviewTermsBytes(registry,exact)));if(native.evmTermsHash(domain,asTerms(reviewed))!==binding.tradeId)throw Error('TERMS_MISMATCH');
      const accepted=value(await step(buyer.exchange.accept(defined(sessionId),exact,buyer.secret)));const got=await deliver(accepted,buyer,seller);if(got.state!=='accepted'||got.termsHash!==binding.tradeId)throw Error('TERMS_MISMATCH');
      await requireAcceptanceTime();const sellerSignature=value(await acquire(seller.wallet.signTerms(seller.walletSession,domain,terms,'seller'),result=>{if(result.ok)result.value.fill(0);}));owned.push(sellerSignature);await requireAcceptanceTime();
      const buyerSignature=await acquire(defined(localPeerAcceptance)({wallet:buyer.wallet,session:buyer.walletSession,domain,terms}),signature=>signature.fill(0));owned.push(buyerSignature);await requireAcceptanceTime();
      const bundle=value(await step(native.verifyEvmAgreementBundle({privateAgreement:agreement,domain,terms,acceptances:[{termsHash:binding.tradeId,role:'seller',walletAccount:terms.seller,signature:sellerSignature},{termsHash:binding.tradeId,role:'buyer',walletAccount:terms.buyer,signature:buyerSignature}]},{isCurrent:()=>{try{current();return true;}catch{return false;}}})));
      sellerSignature.fill(0);buyerSignature.fill(0);if(bundle.termsHash!==binding.tradeId)throw Error('TERMS_MISMATCH');value<unknown>((await step(vault.request({operation:'saveTermsReview',profileId:selected().session.profileId,source:'file',bytes:exact}))).result);await fresh();
     }finally{exact.fill(0);}
     await attachNative();phase='accepted';
    }else if(action==='fund'){
     if(phase!=='accepted')throw Error('OUT_OF_ORDER');await fresh();const{terms,domain,binding}=trade(),{life}=attached();const call=native.escrowCallFor({action:'fund',domain,terms});
     prepared=value(await step(life.prepare({binding,action:'fund',expectedEscrowState:call.expectedEscrowState,call:call.call})));intentId=prepared.intentId;phase='fund-prepared';
     let sent;try{sent=await step(life.submit(prepared));}finally{if(epoch===mine)phase='reconcile';}if(!sent.ok&&sent.error?.code!=='BROADCAST_UNKNOWN')throw Error(sent.error?.code??'SUBMIT_FAILED');
    }else if(action==='reconcile'){
     if(!['reconcile','settling','payment-coordination','payment-guidance-unavailable'].includes(phase))throw Error('OUT_OF_ORDER');if(phase==='payment-coordination')phase='payment-guidance-unavailable';attached().gate.invalidate();await fresh();const{binding}=trade(),{journal,life,reader,authority,journey}=attached(),intentId=definedIntentId();
     value(await step(journal.reconcileNative(intentId)));const result=value(await step(life.reconcile(intentId)));if(result.outcome!=='finalized')return snapshot();
     if(result.escrowState==='funded'){
      value(await step(authority.refresh(binding)));const projected=value(await step(journey.read()));if(projected.kind!=='resolved'||projected.view.step!=='payment-coordination'){phase='payment-guidance-unavailable';throw Error('PAYMENT_GUIDANCE_BLOCKED');}phase='payment-coordination';
     }else if(result.escrowState==='released'||result.escrowState==='refunded'){
      // Receipt is native and bound to the original exact intent; JSON terminal labels are insufficient.
      value(await step(authority.refresh(binding)));const projected=value(await step(journey.read()));if(projected.kind!=='resolved'||projected.view.step!=='receipt')throw Error('RECEIPT_UNAVAILABLE');
      if(result.intent.submission.chain!=='evm'||!result.intent.submission.hash)throw Error('RECEIPT_UNAVAILABLE');const hash=result.intent.submission.hash,rawReceipt=await rpc('eth_getTransactionReceipt',[hash]);const raw={transactionHash:text(rawReceipt,'transactionHash',/^0x[0-9a-f]{64}$/),status:text(rawReceipt,'status',/^0x1$/),gasUsed:quantity(field(rawReceipt,'gasUsed')),effectiveGasPrice:quantity(field(rawReceipt,'effectiveGasPrice')),blockNumber:quantity(field(rawReceipt,'blockNumber')),blockHash:text(rawReceipt,'blockHash',/^0x[0-9a-f]{64}$/)};if(!raw||raw.transactionHash!==hash||raw.status!=='0x1'||value(await step(reader.blockHashAt(String(BigInt(raw.blockNumber)),new AbortController().signal)))!==raw.blockHash)throw Error('RECEIPT_UNAVAILABLE');const final=value(await step(reader.head('finalized',new AbortController().signal)));if(!final||BigInt(raw.blockNumber)>BigInt(final.number)||value(await step(reader.blockHashAt(final.number,new AbortController().signal)))!==final.hash)throw Error('RECEIPT_UNAVAILABLE');
      const nativeAsset=defined(registry.network(binding.networkId)?.assets.find(asset=>asset.kind==='native'));receipt={nativeAssetId:nativeAsset.id,nativeDecimals:nativeAsset.decimals,tradeId:binding.tradeId,transactionHash:hash,state:result.escrowState,blockNumber:String(BigInt(raw.blockNumber)),gasUsed:String(BigInt(raw.gasUsed)),effectiveGasPrice:String(BigInt(raw.effectiveGasPrice)),fee:String(BigInt(raw.gasUsed)*BigInt(raw.effectiveGasPrice))};phase='receipt';
     }else throw Error('STATE_MISMATCH');
    }else if(action==='release'||action==='refund'){
     if(phase!=='payment-coordination'&&!(action==='refund'&&phase==='payment-guidance-unavailable'))throw Error('OUT_OF_ORDER');if(action==='release'&&options.attestFiatReceived!==true)throw Error('FIAT_ATTESTATION_REQUIRED');phase='payment-guidance-unavailable';attached().gate.invalidate();await fresh();const{terms,domain,binding}=trade(),{gate,life}=attached();if(action==='refund'&&await chainNow()<Number(terms.escrowExpirySeconds))throw Error('REFUND_NOT_AVAILABLE');const guidance=value(await step(gate.read()));if(action==='release'&&guidance.decision!=='allow-guidance')throw Error('PAYMENT_GUIDANCE_BLOCKED');
     const call=native.escrowCallFor({action,escrow:domain.verifyingContract,tradeId:binding.tradeId});prepared=value(await step(life.prepare({binding,action,expectedEscrowState:'funded',call:call.call})));intentId=prepared.intentId;phase='settling';const sent=await step(life.submit(prepared));if(!sent.ok&&sent.error?.code!=='BROADCAST_UNKNOWN')throw Error(sent.error?.code??'SUBMIT_FAILED');
    }else throw Error('INVALID_INPUT');return snapshot();
   }catch(error){if(epoch===mine&&(action==='connect'||action==='watch')&&phase==='setup'){clearPrivate();}throw error;}finally{while(nativeRequests.size>0)await Promise.allSettled([...nativeRequests]);busy=false;}
  },
  dispose(){if(closed)return;closed=true;clearPrivate();vault.dispose();},
 });
}
