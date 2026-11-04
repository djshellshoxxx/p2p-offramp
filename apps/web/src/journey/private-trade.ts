/** Private LOCALPROOF composition. Import only from an isolated, explicitly constructed Worker entry.
 * Native constructors are capabilities supplied by the trusted composition root, never protocol data.
 * No production peer-acceptance carrier is defined here and this module cannot enable the default app.
 */
import {RegistryService,reviewTermsBytes,buildTradeDraftDocument,checkFundingWindow,createJourneyProjection,createCoreError,createOperationId,createPrivacyViewReader,type CoreResult,type PrivateAgreementV1,type PrivacyView} from '../../../../packages/domain/index.ts';
import {createLocalNobleNostrProvider,type NostrEvent} from '../../../../packages/nostr-crypto/index.ts';
import {createOrderBook,createAdEvent,AD_KIND} from '../../../../packages/relay/index.ts';
import {createRelayEventCrypto,createTermsExchange,adBookKey} from '../../../../packages/exchange/index.ts';
import {decodeIdentityPayload,decodeBase64url,parseStrictJsonBytes,type IntentV1,type TradeBinding,type RuntimeResponse} from '../../../../packages/schemas/index.ts';
import {createJourneyVaultComposition} from './vault-composition.ts';
import type {JourneyOptions,JourneyController,JourneySnapshot,Phase,EvmTerms,EvmDomain,Party,NegotiatingParty,NativeFeeReceipt,PreparedIntent,ChainReader,Journal,Lifecycle,PaymentGuidance,Authority,TradeComposition,NativeIntentObservation,ReviewedEvmTerms,PreparedRequest,JourneyRuntimeInput,EscrowCall,Request,TokenCheck,ActionFee,SigningAction,SigningReview,WalletSession,WalletProvider} from './native-contracts.ts';
import type {PaymentGuidanceObservation,PayoutStatus,EscrowLogEvent,ChainStateView} from './native-contracts.ts';
import type {JourneyVaultSelection} from './vault-composition.ts';
const utf8=new TextEncoder(),ZERO=`0x${'0'.repeat(40)}`;
// Comparison pin for the unchanged native EvmWalletAdapter payload; this module never signs a replacement domain.
const signingTypes={EIP712Domain:[['name','string'],['version','string'],['chainId','uint256'],['verifyingContract','address']].map(([name,type])=>({name,type})),TradeTerms:[['v','uint8'],['orderId','bytes32'],['revision','uint64'],['networkId','string'],['deploymentId','string'],['seller','address'],['buyer','address'],['assetKind','uint8'],['asset','address'],['amountBaseUnits','uint256'],['privateAgreementHash','bytes32'],['capabilitiesHash','bytes32'],['sellerNonce','bytes32'],['acceptBeforeSeconds','uint64'],['escrowExpirySeconds','uint64'],['mode','uint8']].map(([name,type])=>({name,type}))};
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
export function decodeUintWord(raw:unknown):string{if(typeof raw!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(raw))throw Error('INTEGRITY_FAILURE');return String(BigInt(raw));}
export function feeProduct(gas:string,price:string):string{if(!/^(0|[1-9][0-9]{0,77})$/.test(gas)||!/^(0|[1-9][0-9]{0,77})$/.test(price))throw Error('INTEGRITY_FAILURE');const product=BigInt(gas)*BigInt(price);if(BigInt(gas)>=(1n<<256n)||BigInt(price)>=(1n<<256n)||product>=(1n<<256n))throw Error('INTEGRITY_FAILURE');return String(product);}
export function canonicalPrincipal(raw:unknown):string{if(typeof raw!=='string'||!/^[1-9][0-9]{0,77}$/.test(raw)||BigInt(raw)>=(1n<<256n))throw Error('INVALID_INPUT');return raw;}
function failure<T>():CoreResult<T>{return{ok:false,error:createCoreError('INTEGRITY_FAILURE',{operationId:createOperationId(),readOnly:true})};}
export function createPrivateTradeJourney({services,native,registryBytes,registryDigest,request,createRelay,localPeerAcceptance,onInvalidated,privacy,onSigningReviewInvalidated}:JourneyOptions):JourneyController{
 const vault=createJourneyVaultComposition(services,message=>{if(message.kind==='locked'||message.kind==='closed')clearPrivate();}),registry=new RegistryService(),provider=createLocalNobleNostrProvider();
 let initialization:Promise<void>|undefined;let recoveryCancellationEpoch:number|undefined;let ready=false,closed=false,busy=false,epoch=0,context:JourneyVaultSelection|undefined,phase:Phase='setup';
 let terms:EvmTerms|undefined,domain:EvmDomain|undefined,binding:TradeBinding|undefined,agreement:PrivateAgreementV1|undefined,document:Uint8Array<ArrayBuffer>|undefined,sessionId:string|undefined,prepared:PreparedIntent|undefined,intentId:string|undefined,receipt:NativeFeeReceipt|null=null,backupRevision:number|null=null,clock=0,clockObservedAt=performance.now(),sends=0;
 let tokenCheck:TokenCheck|null=null,acceptedProof=false,communicationAccepted=false;const fees:ActionFee[]=[];
 // Owned outgoing negotiation awaiting delivery. The exact signed ad and wraps are kept so an explicit retry
 // republishes identical events; nothing is re-signed or regenerated. Every field clears with clearPrivate().
 interface PendingNegotiation {
  readonly ad:NostrEvent;adDelivered:boolean;take?:{readonly sessionId:string;readonly recipientWrap:NostrEvent};
  takeDelivered:boolean;offer?:{readonly recipientWrap:NostrEvent};
 }
 const MAX_DELIVERY_RETRIES=5;
 let negotiation:PendingNegotiation|undefined,pendingAccept:{readonly recipientWrap:NostrEvent}|undefined;
 let deliveryRetries=0;
 let chainState:ChainStateView|null=null;
 const parties:Party[]=[],owned:Uint8Array[]=[],cleanup:(()=>void)[]=[];const nativeRequests=new Set<Promise<unknown>>();
 interface OwnedReview {readonly view:SigningReview;readonly fingerprint:string;readonly epoch:number;readonly sessionId:string;readonly wallets:readonly WalletSession[];readonly invalidation:number;}
 let pendingReview:OwnedReview|undefined,activeReview:OwnedReview|undefined,privacyOff:(()=>void)|undefined,privacyReady=false,reviewInvalidation=0;
 const monotonic=()=>Math.floor(performance.now());
 const unknownPrivacy=createPrivacyViewReader({monotonicNow:monotonic});
 const privacyReader=createPrivacyViewReader({monotonicNow:monotonic,...(privacy?{transport:privacy.transport,endpoints:privacy.endpoints}:{}),observations:{get generation(){return epoch;},read(){current();const observedAt=monotonic();return{version:1,generation:epoch,vault:{state:'unlocked',observedAt,expiresAt:observedAt+30000},messaging:null,proof:null};}}});
 const snapshot=():JourneySnapshot=>{if(context){try{context.assertCurrent();}catch{clearPrivate();}}if(pendingReview&&monotonic()>=pendingReview.view.expiresAt)pendingReview=undefined;const selectedTerms=terms;const reviewed=selectedTerms?registry.network(selectedTerms.networkId)?.assets.find(asset=>asset.kind===selectedTerms.assetKind&&(asset.address??ZERO)===selectedTerms.asset):undefined;return Object.freeze({label:'LOCALPROOF',tradingEnabled:false,productionBlocker:'Peer wallet-acceptance carrier and maintained signing trust root remain undefined.',phase,profileId:context?.session.profileId??null,backupRevision,account:parties[0]?.walletSession.account??null,terms:terms&&domain&&reviewed?{...terms,assetId:reviewed.id,decimals:reviewed.decimals,chainId:domain.chainId,escrowAddress:domain.verifyingContract}:null,manualPayment:agreement?{currency:agreement.fiatCurrency,minorUnits:agreement.fiatMinorUnits,scale:agreement.fiatScale,instructions:agreement.paymentInstructions}:null,tradeId:binding?.tradeId??null,intentId:intentId??null,receipt,assets:registry.network('local-evm')?.assets.filter(asset=>asset.kind!=='spl'&&registry.deployment('local-evm','escrow-local-v1')?.supportedAssetIds.includes(asset.id)).map(asset=>({id:asset.id,kind:asset.kind==='native'?'native' as const:'erc20' as const,decimals:asset.decimals}))??[],tokenCheck,fees:[...fees],signingReview:pendingReview?.view??null,paymentGuidance:gate?.view()??null,submissionsThisWorker:sends,chainState});};
 const selected=():JourneyVaultSelection=>defined(context);
 const trade=()=>({terms:defined(terms),domain:defined(domain),binding:defined(binding),agreement:defined(agreement)});
 const negotiating=():[NegotiatingParty,NegotiatingParty]=>{const seller=parties[0],buyer=parties[1];if(!seller||!buyer||seller.kind!=='negotiation'||buyer.kind!=='negotiation')throw Error('LOCKED');return[seller,buyer];};
 const current=()=>{if(closed||!context)throw Error('LOCKED');context.assertCurrent();for(const party of parties)if(party.walletSession&&party.wallet.inspect()!==party.walletSession)throw Error('WALLET_CHANGED');};
 const fresh=async()=>{context=await vault.requireCurrent();current();};
 const step=async<T>(promise:Promise<T>):Promise<T>=>{const result=await promise;current();return result;};
 const acquire=async<T>(promise:Promise<T>,release:(resource:T)=>void):Promise<T>=>{const resource=await promise;try{current();return resource;}catch(error){release(resource);throw error;}};
 const signingActions:readonly SigningAction[]=['accept','accept-recovered','approve','reset-approval','fund','release','refund'];
 function invalidateSigningReview():void{reviewInvalidation++;pendingReview=undefined;onSigningReviewInvalidated?.(snapshot());}
 function connectPrivacyInspection():void{
  if(!privacy||privacyReady||privacyOff)return;
  const mine=epoch;
  try{
   const off=privacy.subscribeInvalidation(()=>{if(epoch===mine)invalidateSigningReview();});
   if(typeof off!=='function')throw Error();
   if(epoch!==mine||closed){off();return;}
   privacyOff=off;privacyReady=true;
  }catch{privacyReady=false;privacyOff=()=>{};}
 }
 function readPrivacy():PrivacyView{
  let inspected:PrivacyView;
  try{inspected=value((privacy&&privacyReady?privacyReader:unknownPrivacy).buildPrivacyView(privacy&&privacyReady?privacy.transport.mode:null,privacy&&privacyReady?epoch:undefined));}
  catch{inspected=value(unknownPrivacy.buildPrivacyView(null));}
  current();
  // No reviewed external-wallet route producer exists. App routing never implies wallet routing.
  return Object.freeze({...inspected,routes:Object.freeze(inspected.routes.map(route=>route.channel==='wallet'?Object.freeze({...route,state:'unknown' as const,source:'none' as const,observedPolicy:'unknown' as const,observedAt:null,expiresAt:null,reason:'not-observed' as const}):route))});
 }
 function requestFor(action:SigningAction):EscrowCall{
  const {terms,domain,binding}=trade();
  if(action==='accept'||action==='accept-recovered')return{to:domain.verifyingContract,data:'0x',value:'0'};
  return native.escrowCallFor(action==='approve'||action==='reset-approval'?{action:'approve',token:terms.asset,spender:domain.verifyingContract,amountBaseUnits:action==='reset-approval'?'0':terms.amountBaseUnits}:action==='fund'?{action:'fund',domain,terms}:{action,escrow:domain.verifyingContract,tradeId:binding.tradeId}).call;
 }
 // A funded escrow in either phase may be released; only payment-coordination also shows payment instructions.
 const releasePhase=():boolean=>phase==='payment-coordination'||phase==='payment-guidance-closed';
 // remainingSeconds is measured against the latest block, but a release is included in a strictly later block and
 // BasicEscrow reverts at block.timestamp >= deadline. The margin covers several block intervals (12 s on Ethereum
 // L1, more under congestion), mempool delay and a human wallet confirmation of a few minutes. It is far below the
 // 900-second guidance buffer. It is a client-side refusal only; the chain stays authoritative for the deadline.
 const RELEASE_DEADLINE_MARGIN_SECONDS=300n;
 // Release eligibility is independent of the payment-guidance buffer. It needs a fresh, funded, matching native
 // read (reason ok or near-expiry) with more than the margin left before the actual deadline.
 function releaseOpen(observation:PaymentGuidanceObservation):boolean{
  if(observation.termsHash!==trade().binding.tradeId)return false;
  if(observation.reason!=='ok'&&observation.reason!=='near-expiry')return false;
  const remaining=observation.remainingSeconds;
  if(typeof remaining!=='string'||!/^-?(0|[1-9][0-9]{0,77})$/.test(remaining))return false;
  return BigInt(remaining)>RELEASE_DEADLINE_MARGIN_SECONDS;
 }
 // After a blocked projection only a near-expiry read with the deadline ahead keeps release open.
 function guidanceClosedForRelease(gate:PaymentGuidance):boolean{
  const viewed=gate.view();
  return viewed.ok&&viewed.value.reason==='near-expiry'&&releaseOpen(viewed.value);
 }
 // Builds the receipt from one finalized, canonical settlement transaction and its own escrow logs.
 async function enterReceipt(state:'released'|'refunded',hash:string,settledBy:'this-wallet'|'another-account'){
  const {binding}=trade(),{reader,authority,journey}=attached();
  value(await step(authority.refresh(binding)));
  const projected=value(await step(journey.read()));
  if(projected.kind!=='resolved'||projected.view.step!=='receipt')throw Error('RECEIPT_UNAVAILABLE');
  const rawReceipt=await rpc('eth_getTransactionReceipt',[hash]);
  const raw={transactionHash:text(rawReceipt,'transactionHash',/^0x[0-9a-f]{64}$/),
   status:text(rawReceipt,'status',/^0x1$/),
   gasUsed:quantity(field(rawReceipt,'gasUsed')),effectiveGasPrice:quantity(field(rawReceipt,'effectiveGasPrice')),
   blockNumber:quantity(field(rawReceipt,'blockNumber')),blockHash:text(rawReceipt,'blockHash',/^0x[0-9a-f]{64}$/)};
  const canonical=value(await step(reader.blockHashAt(String(BigInt(raw.blockNumber)),new AbortController().signal)));
  if(raw.transactionHash!==hash||raw.status!=='0x1'||canonical!==raw.blockHash)throw Error('RECEIPT_UNAVAILABLE');
  const final=value(await step(reader.head('finalized',new AbortController().signal)));
  if(!final||BigInt(raw.blockNumber)>BigInt(final.number))throw Error('RECEIPT_UNAVAILABLE');
  const finalHash=value(await step(reader.blockHashAt(final.number,new AbortController().signal)));
  if(finalHash!==final.hash)throw Error('RECEIPT_UNAVAILABLE');
  const payout=await payoutStatus(state,rawReceipt,final.number);
  const nativeAsset=defined(registry.network(binding.networkId)?.assets.find(asset=>asset.kind==='native'));
  receipt={nativeAssetId:nativeAsset.id,nativeDecimals:nativeAsset.decimals,tradeId:binding.tradeId,
   transactionHash:hash,state,blockNumber:String(BigInt(raw.blockNumber)),
   gasUsed:String(BigInt(raw.gasUsed)),effectiveGasPrice:String(BigInt(raw.effectiveGasPrice)),
   fee:feeProduct(raw.gasUsed,raw.effectiveGasPrice),payout,settledBy};
  phase='receipt';
 }
 // An escrow settled on chain by another account (refund is callable by anyone at or after the deadline) is shown
 // from the escrow's own settlement event; who sent it does not change the outcome. Bounded and read-only.
 async function enterChainReceipt(state:'released'|'refunded',fromBlock:string):Promise<void>{
  const {binding,domain,terms}=trade(),{reader}=attached();
  const final=value(await step(reader.head('finalized',new AbortController().signal)));
  if(!final||BigInt(final.number)<BigInt(fromBlock))throw Error('RECEIPT_UNAVAILABLE');
  // Beyond the bounded search the outcome is still shown, from the canonical state read alone.
  if(BigInt(final.number)-BigInt(fromBlock)>50000n)return enterUnlocatedReceipt(state);
  const range={fromBlock:'0x'+BigInt(fromBlock).toString(16),toBlock:'0x'+BigInt(final.number).toString(16)};
  const logs=await rpc('eth_getLogs',[{address:domain.verifyingContract,...range,topics:[null,'0x'+binding.tradeId]}]);
  if(!Array.isArray(logs)||logs.length>16)throw Error('RECEIPT_UNAVAILABLE');
  const kind=state==='released'?'Released':'Refunded';
  const settlements=logs.filter(log=>decodeEscrowEvent(log).kind===kind);
  if(settlements.length===0)return enterUnlocatedReceipt(state);
  if(settlements.length!==1)throw Error('RECEIPT_UNAVAILABLE');
  const hash=text(settlements[0],'transactionHash',/^0x[0-9a-f]{64}$/);
  const sender=text(await rpc('eth_getTransactionReceipt',[hash]),'from',/^0x[0-9a-fA-F]{40}$/).toLowerCase();
  await enterReceipt(state,hash,sender===terms.seller?'this-wallet':'another-account');
 }
 // Reconciles leftover settlement intents read-only. A reverted one becomes terminal-verified, so the original
 // refund can reserve beside it; the first one the chain has not resolved is returned and nothing else is tried.
 type Leftover={readonly kind:'resolved'}|{readonly kind:'settling'|'external';readonly intentId:string};
 async function classifyLeftovers(intents:readonly IntentV1[]):Promise<Leftover>{
  const {journal,life}=attached();
  // A null-hash row is never reconciled: whether that wallet request was broadcast cannot be proven either way
  // without a durable send marker (D9), and lifecycle reconciliation would rewrite the row.
  const ambiguous=intents.find(settle=>settle.submission.chain!=='evm'||settle.submission.hash===null);
  if(ambiguous)return{kind:'external',intentId:ambiguous.intentId};
  let settling:string|undefined;
  for(const settle of intents){
   await step(journal.reconcileNative(settle.intentId));
   const result=value(await step(life.reconcile(settle.intentId)));
   if(result.outcome==='reverted'&&journal.isTerminalVerified(settle.intentId))continue;
   // Still progressing on chain: reconcile alone can resolve it later.
   if(['pending','confirmed','reorged'].includes(result.outcome)){settling??=settle.intentId;continue;}
   // Expired or replaced rows need a successor the app cannot create; anything else contradicts a funded escrow.
   return{kind:'external',intentId:settle.intentId};
  }
  return settling?{kind:'settling',intentId:settling}:{kind:'resolved'};
 }
 async function intentOf(id:string):Promise<IntentV1>{
  const found=value(await step(attached().journal.list())).find(intent=>intent.intentId===id);
  if(!found)throw Error('RECONCILE_REQUIRED');
  return found;
 }
 async function preparedAtOf(id:string):Promise<string>{
  return parseCanonicalPreparedRequest((await intentOf(id)).preparedRequest).preparedAtBlock;
 }
 // A null-hash settlement that the bounded 64-block nonce scan can no longer reach stays ambiguous for good.
 async function nullHashBeyondScan(id:string):Promise<boolean>{
  const intent=await intentOf(id);
  if(intent.submission.chain!=='evm'||intent.submission.hash!==null)return false;
  if(intent.action!=='release'&&intent.action!=='refund')return false;
  const latest=value(await step(attached().reader.head('latest',new AbortController().signal)));
  const preparedAt=BigInt(parseCanonicalPreparedRequest(intent.preparedRequest).preparedAtBlock);
  return latest!==null&&BigInt(latest.number)-preparedAt>64n;
 }
 // Fresh finalized escrow-state read for display only; it grants no action.
 async function readChainState():Promise<ChainStateView>{
  const {terms,domain,binding}=trade(),{reader}=attached(),request=scopedRequest;
  const observation={registry,binding,terms,domain,request,generation:0,requestSequence:1};
  const observed=value(await step(native.readObservation(observation)));
  const final=value(await step(reader.head('finalized',new AbortController().signal)));
  if(!final)throw Error('FINALITY_UNAVAILABLE');
  chainState=Object.freeze({state:observed.state,observedAtHeight:final.number});
  return chainState;
 }
 // The app cannot resolve this settlement row without D9: it shows the chain state, sends nothing and never
 // touches the row. If the escrow has since been settled on chain (for example with the recovery package), the
 // outcome is shown as a receipt instead.
 async function enterExternalRecovery(ambiguousIntentId:string,fromBlock:string):Promise<void>{
  intentId=ambiguousIntentId;
  const observed=await readChainState();
  if(observed.state==='released'||observed.state==='refunded')return enterChainReceipt(observed.state,fromBlock);
  phase='external-recovery-required';
 }
 // Terminal on chain, but the settlement transaction was not located within the bounded search: the outcome comes
 // from the canonical finalized state read alone, with no transaction, fee or payout detail.
 async function enterUnlocatedReceipt(state:'released'|'refunded'):Promise<void>{
  const {binding}=trade(),{authority,journey}=attached();
  value(await step(authority.refresh(binding)));
  const projected=value(await step(journey.read()));
  if(projected.kind!=='resolved'||projected.view.step!=='receipt')throw Error('RECEIPT_UNAVAILABLE');
  const observed=await readChainState();
  if(observed.state!==state)throw Error('STATE_MISMATCH');
  receipt=null;
  phase='receipt';
 }
 // Enters the funded phase from fresh native evidence: payment guidance, guidance-closed release, or neither.
 async function enterFundedPhase():Promise<void>{
  const {binding}=trade(),{gate,authority,journey}=attached();
  value(await step(authority.refresh(binding)));
  const projected=value(await step(journey.read()));
  const coordinating=projected.kind==='resolved'&&projected.view.step==='payment-coordination';
  const closed=projected.kind==='blocked'&&projected.blockingReason==='payment-guidance-blocked';
  if(coordinating)phase='payment-coordination';
  else if(closed&&guidanceClosedForRelease(gate))phase='payment-guidance-closed';
  else{phase='payment-guidance-unavailable';throw Error('PAYMENT_GUIDANCE_BLOCKED');}
 }
 function reviewActionReady(action:SigningAction):void{
  const allowed=action==='accept'?phase==='review'
   :action==='accept-recovered'?phase==='recovered-acceptance-required'
   :action==='release'?releasePhase()
   :action==='refund'?releasePhase()||phase==='payment-guidance-unavailable'
   :phase==='accepted'&&acceptedProof;
  if(!allowed)throw Error('OUT_OF_ORDER');
  if((action==='approve'||action==='reset-approval')&&trade().terms.assetKind!=='erc20')throw Error('INVALID_INPUT');
 }
 function reviewView(action:SigningAction):SigningReview{
  current();const {terms,domain,binding,agreement}=trade(),call=requestFor(action),inspected=readPrivacy(),observedAt=monotonic();if(native.evmTermsHash(domain,terms)!==binding.tradeId)throw Error('SIGNING_REVIEW_CHANGED');
  const selectedParties=action==='accept'||action==='accept-recovered'?parties.slice(0,2):parties.slice(0,1);
  if(selectedParties.length!==(action==='accept'||action==='accept-recovered'?2:1))throw Error('WALLET_CHANGED');
  const wallets=selectedParties.map((party,index)=>Object.freeze({role:index===0?'seller' as const:'buyer' as const,providerId:party.walletSession.providerId,account:party.walletSession.account,networkId:party.walletSession.networkId,generation:party.walletSession.generation}));
  const result:SigningReview=Object.freeze({version:1,action,profileId:selected().session.profileId,scopeGeneration:epoch,observedAt,clockOrigin:Math.floor(performance.timeOrigin),expiresAt:Math.min(observedAt+20000,inspected.endpointDetails.expiresAt??Infinity),networkId:binding.networkId,chainId:domain.chainId,deploymentId:binding.deploymentId,escrow:domain.verifyingContract,termsHash:binding.tradeId,destination:call.to,spender:action==='approve'||action==='reset-approval'?domain.verifyingContract:null,value:call.value,amount:action==='reset-approval'?'0':terms.amountBaseUnits,wallets:Object.freeze(wallets),extensions:Object.freeze(agreement.capabilities.map(item=>Object.freeze({...item}))),privacy:inspected});
  current();return result;
 }
 function fingerprint(review:SigningReview):string{
  const p=review.privacy;
  return JSON.stringify({call:requestFor(review.action),action:review.action,profileId:review.profileId,scopeGeneration:review.scopeGeneration,networkId:review.networkId,chainId:review.chainId,deploymentId:review.deploymentId,escrow:review.escrow,termsHash:review.termsHash,destination:review.destination,spender:review.spender,value:review.value,amount:review.amount,wallets:review.wallets,extensions:review.extensions,privacy:{selectedPolicy:p.selectedPolicy,scopeGeneration:p.scopeGeneration,routes:p.routes.map(({channel,state,source,reason,observedPolicy})=>({channel,state,source,reason,observedPolicy})),vault:p.vault.state,messaging:p.messaging.state,proof:p.proof.state,endpoints:{generation:p.endpointDetails.generation,reason:p.endpointDetails.reason,endpoints:p.endpointDetails.endpoints}}});
 }
 function assertSigningReview():OwnedReview{
  current();const review=activeReview;
  if(!review)throw Error('SIGNING_REVIEW_REQUIRED');
  if(monotonic()>=review.view.expiresAt)throw Error('SIGNING_REVIEW_EXPIRED');
  if(review.epoch!==epoch||review.sessionId!==selected().session.sessionId||review.invalidation!==reviewInvalidation||review.wallets.some((session,index)=>parties[index]?.walletSession!==session)||fingerprint(reviewView(review.view.action))!==review.fingerprint)throw Error('SIGNING_REVIEW_CHANGED');
  current();
  // Inspection callbacks may revoke this same review without changing their returned display data.
  if(activeReview!==review||review.epoch!==epoch||review.invalidation!==reviewInvalidation||review.sessionId!==selected().session.sessionId||review.wallets.some((session,index)=>parties[index]?.walletSession!==session))throw Error('SIGNING_REVIEW_CHANGED');
  if(monotonic()>=review.view.expiresAt)throw Error('SIGNING_REVIEW_EXPIRED');
  return review;
 }
 function walletProvider(index:number):WalletProvider{
  const provider=native.walletProvider(index),owner=selected(),mine=epoch;
  const guard=()=>{if(epoch!==mine)throw Error('LOCKED');owner.assertCurrent();current();};
  return{request(args){
   guard();if(args.method==='eth_signTypedData_v4'){
    const review=assertSigningReview();if(review.view.action!=='accept'&&review.view.action!=='accept-recovered')throw Error('SIGNING_REVIEW_CHANGED');
    if(args.params?.length!==2||args.params[0]!==parties[index]?.walletSession.account||typeof args.params[1]!=='string')throw Error('SIGNING_REVIEW_CHANGED');
    const raw=parseStrictJsonBytes(utf8.encode(args.params[1]),65536),{terms,domain}=trade();
    const expectedDomain={name:'P2POfframp',version:'1',chainId:domain.chainId,verifyingContract:domain.verifyingContract};
    const expectedMessage={...terms,v:1,mode:0,assetKind:terms.assetKind==='native'?0:1,orderId:'0x'+terms.orderId,privateAgreementHash:'0x'+terms.privateAgreementHash,capabilitiesHash:'0x'+terms.capabilitiesHash,sellerNonce:'0x'+terms.sellerNonce};
    for(const[key,expected]of Object.entries({domain:expectedDomain,message:expectedMessage})){
     const actual=field(raw,key);if(typeof actual!=='object'||actual===null||Reflect.ownKeys(actual).length!==Object.keys(expected).length||Object.entries(expected).some(([name,value])=>field(actual,name)!==value))throw Error('SIGNING_REVIEW_CHANGED');
    }
    if(typeof raw!=='object'||raw===null||Array.isArray(raw)||Reflect.ownKeys(raw).length!==4||field(raw,'primaryType')!=='TradeTerms'||JSON.stringify(field(raw,'types'))!==JSON.stringify(signingTypes))throw Error('SIGNING_REVIEW_CHANGED');
   }
   const pending=(async()=>{const result=await provider.request.call(provider,args);guard();return result;})();nativeRequests.add(pending);void pending.then(()=>nativeRequests.delete(pending),()=>nativeRequests.delete(pending));return pending;
  },...(provider.on?{on:(event:string,listener:(...args:unknown[])=>void)=>provider.on?.call(provider,event,listener)}:{}),...(provider.removeListener?{removeListener:(event:string,listener:(...args:unknown[])=>void)=>provider.removeListener?.call(provider,event,listener)}:{})};
 }
 async function connectRecoveredBuyer():Promise<void>{
  if(parties[1])return;const {terms,binding}=trade();
  const wallet=new native.EvmWalletAdapter(walletProvider(1),'explicit-recovered-buyer-wallet',registry),unsubscribe=wallet.subscribe(walletInvalidated);cleanup.push(()=>{unsubscribe();wallet.dispose();});
  const walletSession=value(await step(wallet.connect(binding.networkId)));if(walletSession.account!==terms.buyer)throw Error('WALLET_CHANGED');parties.push({kind:'watch',wallet,walletSession});
 }
 function checkSendReview(args:Parameters<Request>[0]):void{
  const review=assertSigningReview();if(review.view.action==='accept'||review.view.action==='accept-recovered')throw Error('SIGNING_REVIEW_CHANGED');
  const call=requestFor(review.view.action),raw=defined(args.params?.[0]);
  if(args.params?.length!==1||field(raw,'from')!==trade().terms.seller||field(raw,'to')!==call.to||field(raw,'data')!==call.data||quantity(field(raw,'value'))!==call.value||quantity(field(raw,'chainId'))!==trade().domain.chainId)throw Error('SIGNING_REVIEW_CHANGED');
  quantity(field(raw,'nonce')); // Exact nonce/body binding remains the canonical G12 journal's responsibility.
  assertSigningReview(); // Canonical-builder/descriptor callbacks above cannot retire consent before the provider call.
 }
 const ownedRequest=(owner:JourneyVaultSelection,mine:number):Request=>args=>{
  const guard=():void=>{if(epoch!==mine)throw Error('LOCKED');owner.assertCurrent();current();};guard();
  const pending=(async()=>{if(args.method==='eth_sendTransaction'){checkSendReview(args);sends++;}const result=await request(args);guard();return result;})();nativeRequests.add(pending);void pending.then(()=>nativeRequests.delete(pending),()=>nativeRequests.delete(pending));return pending;
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
 // Every negotiation publish goes through here; only these attempts count against the delivery retry budget.
 let relayPublishes=0;
 const publish=async(pool:NegotiatingParty['pool'],event:NostrEvent):Promise<void>=>{
  relayPublishes++;
  value(await step(pool.publish(event)));
 };
 const deliver=async(message:{recipientWrap:NostrEvent},from:NegotiatingParty,to:NegotiatingParty)=>{
  await publish(from.pool,message.recipientWrap);
  const found=(await pull(to)).find(event=>event.id===message.recipientWrap.id);
  if(!found)throw Error('MISSING_WRAP');
  const received=value(await step(to.exchange.receive(found,to.secret)));
  if('own'in received)throw Error('WRONG_COUNTERPARTY');
  return received;
 };
 // Terminal end of an undelivered negotiation. The reviewed trade stays visible; the pending messages are dropped so
 // nothing republishes, and no state claims the peer received or did not receive them.
 function stopDelivery():void{
  negotiation=pendingAccept=undefined;
  phase='delivery-stopped';
 }
 // A retry first asks the owned peer whether it already applied the message, then republishes the identical wrap.
 async function deliverAcceptance(message:{recipientWrap:NostrEvent}):Promise<void>{
  const {binding}=trade(),[seller,buyer]=negotiating(),applied=seller.exchange.session(defined(sessionId));
  if(applied?.state==='accepted'){
   if(applied.terms?.hash!==binding.tradeId)throw Error('TERMS_MISMATCH');
   return;
  }
  const got=await deliver(message,buyer,seller);
  if(got.state!=='accepted'||got.termsHash!==binding.tradeId)throw Error('TERMS_MISMATCH');
 }
 // Resumes ad publication, take and offer from the first undelivered step. Each message is created at most once.
 async function negotiate(pending:PendingNegotiation):Promise<void>{
  const {terms,binding}=trade(),document=definedDocument(),[seller,buyer]=negotiating();
  if(!pending.adDelivered){
   await publish(seller.pool,pending.ad);
   const received=(await pull(buyer,AD_KIND)).find(event=>event.id===pending.ad.id);
   // Re-ingesting this exact event id is a benign duplicate; any other result refuses the ad.
   const ingested=received?buyer.book.ingest(received):'invalid';
   if(ingested!=='accepted'&&ingested!=='duplicate')throw Error('BAD_AD');
   pending.adDelivered=true;
  }
  if(!pending.take){
   const adKey=adBookKey(seller.pub,terms.orderId);
   pending.take=value(await step(buyer.exchange.take(adKey,terms.buyer,buyer.secret)));
   sessionId=pending.take.sessionId;
  }
  if(!pending.takeDelivered){
   if(!seller.exchange.session(defined(sessionId)))await deliver(pending.take,buyer,seller);
   pending.takeDelivered=true;
  }
  pending.offer??=value(await step(seller.exchange.offer(defined(sessionId),document,seller.secret)));
  const applied=buyer.exchange.session(defined(sessionId));
  if(applied?.state==='offered'){
   if(applied.terms?.hash!==binding.tradeId)throw Error('TERMS_MISMATCH');
   return;
  }
  const got=await deliver(pending.offer,seller,buyer);
  if(got.state!=='offered'||got.termsHash!==binding.tradeId)throw Error('TERMS_MISMATCH');
 }
 function approvalAmount(intent:Readonly<IntentV1>):string{
  const {terms,domain}=trade();if(terms.assetKind!=='erc20')throw Error('INVALID_INPUT');const call=parseCanonicalPreparedRequest(intent.preparedRequest);
  for(const amount of['0',terms.amountBaseUnits]){const expected=native.escrowCallFor({action:'approve',token:terms.asset,spender:domain.verifyingContract,amountBaseUnits:amount}).call;if(call.to===expected.to&&call.data===expected.data&&call.value===expected.value)return amount;}throw Error('INTEGRITY_FAILURE');
 }
 async function checkToken(nativeRequest:Request=scopedRequest):Promise<TokenCheck>{
  const {terms,domain,binding}=trade();if(terms.assetKind!=='erc20')throw Error('INVALID_INPUT');tokenCheck=null;
  value(await step(native.readObservation({registry,binding,terms,domain,request:nativeRequest,generation:0,requestSequence:1})));
  const read=(method:string,params:readonly unknown[])=>nativeRequest({method,params}),anchor=await read('eth_getBlockByNumber',['finalized',false]),height=quantity(field(anchor,'number')),hash=text(anchor,'hash',/^0x[0-9a-f]{64}$/),tag='0x'+BigInt(height).toString(16);
  const code=await read('eth_getCode',[terms.asset,tag]);if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2}){1,24576}$/.test(code))throw Error('TOKEN_CODE_UNAVAILABLE');
  const addressWord=(address:string)=>address.slice(2).padStart(64,'0');
  const call=async(to:string,data:string)=>decodeUintWord(await read('eth_call',[{to,data},tag]));
  // Canonical Solidity selectors: isAllowlisted(address), decimals(), balanceOf(address), allowance(address,address).
  const allow=await call(domain.verifyingContract,'0x'+native.selectorOf('isAllowlisted(address)')+addressWord(terms.asset));if(allow!=='1')throw Error('TOKEN_NOT_ALLOWLISTED');
  const decimals=await call(terms.asset,'0x313ce567'),asset=defined(registry.network(binding.networkId)?.assets.find(asset=>asset.kind==='erc20'&&asset.address===terms.asset));if(decimals!==String(asset.decimals))throw Error('TOKEN_DECIMALS_MISMATCH');
  const balance=await call(terms.asset,'0x70a08231'+addressWord(terms.seller)),allowance=await call(terms.asset,'0xdd62ed3e'+addressWord(terms.seller)+addressWord(domain.verifyingContract));
  const again=await read('eth_getBlockByNumber',[tag,false]);if(text(again,'hash',/^0x[0-9a-f]{64}$/)!==hash||quantity(field(again,'number'))!==height)throw Error('ANCHOR_CHANGED');current();
  tokenCheck={token:terms.asset,spender:domain.verifyingContract,principal:terms.amountBaseUnits,balance,allowance,anchor:{height,hash}};return tokenCheck;
 }
 async function recordFee(intent:IntentV1):Promise<void>{
  if(intent.submission.chain!=='evm'||!intent.submission.hash)throw Error('RECEIPT_UNAVAILABLE');const hash=intent.submission.hash,raw=await rpc('eth_getTransactionReceipt',[hash]),height=quantity(field(raw,'blockNumber')),blockHash=text(raw,'blockHash',/^0x[0-9a-f]{64}$/);if(text(raw,'transactionHash',/^0x[0-9a-f]{64}$/)!==hash||field(raw,'status')!=='0x1'||value(await step(definedReader().blockHashAt(height,new AbortController().signal)))!==blockHash)throw Error('RECEIPT_UNAVAILABLE');
  const final=value(await step(definedReader().head('finalized',new AbortController().signal)));if(!final||BigInt(height)>BigInt(final.number)||value(await step(definedReader().blockHashAt(final.number,new AbortController().signal)))!==final.hash)throw Error('RECEIPT_UNAVAILABLE');
  const asset=defined(registry.network(trade().binding.networkId)?.assets.find(asset=>asset.kind==='native'));const fee=feeProduct(quantity(field(raw,'gasUsed')),quantity(field(raw,'effectiveGasPrice')));if(!fees.some(item=>item.transactionHash===hash)){if(fees.length===128)fees.shift();fees.push({action:intent.action,transactionHash:hash,fee,nativeAssetId:asset.id,nativeDecimals:asset.decimals});}
 }
 // Escrow disposition and asset delivery are separate facts: a failed push leaves the trade terminal and credits
 // pendingWithdrawals instead (BasicEscrow _payout). Only this finalized receipt's own escrow logs attribute a credit
 // to this trade; the aggregate pending balance can include other trades and is reported as such, never as arrived.
 // Decodes one log of the registry-bound escrow; any other emitter or malformed log is refused.
 function decodeEscrowEvent(log:unknown):EscrowLogEvent{
  const topics=field(log,'topics');
  if(!Array.isArray(topics)||topics.some(topic=>typeof topic!=='string'))throw Error('RECEIPT_UNAVAILABLE');
  const raw={address:text(log,'address',/^0x[0-9a-fA-F]{40}$/),topics,data:text(log,'data',/^0x(?:[0-9a-fA-F]{2})*$/)};
  try{return native.decodeEscrowLog(trade().domain.verifyingContract,raw);}catch{throw Error('RECEIPT_UNAVAILABLE');}
 }
 async function payoutStatus(state:'released'|'refunded',rawReceipt:unknown,finalHeight:string):Promise<PayoutStatus>{
  const {terms,domain,binding}=trade(),escrow=domain.verifyingContract;
  const recipient=state==='released'?terms.buyer:terms.seller,token=terms.assetKind==='native'?ZERO:terms.asset;
  const logs=field(rawReceipt,'logs');
  if(!Array.isArray(logs)||logs.length>64)throw Error('RECEIPT_UNAVAILABLE');
  const fromEscrow=logs.filter(log=>text(log,'address',/^0x[0-9a-fA-F]{40}$/).toLowerCase()===escrow);
  const events=fromEscrow.map(decodeEscrowEvent).filter(event=>'tradeId'in event&&event.tradeId===binding.tradeId);
  // The settlement event proves these are this trade's complete escrow logs for the exact receipt.
  const settled=events.filter(event=>event.kind==='Released'&&state==='released'&&event.buyer===recipient||
   event.kind==='Refunded'&&state==='refunded'&&event.seller===recipient);
  const exact=(event:EscrowLogEvent)=>'amount'in event&&event.token===token&&event.amount===terms.amountBaseUnits;
  if(settled.length!==1||!settled.every(exact))throw Error('RECEIPT_UNAVAILABLE');
  const deferred=events.filter(event=>event.kind==='PayoutDeferred');
  if(deferred.length===0)return Object.freeze({status:'pushed',recipient,token,amount:terms.amountBaseUnits});
  const credit=deferred[0];
  const owedHere=credit?.kind==='PayoutDeferred'&&credit.recipient===recipient&&exact(credit);
  if(deferred.length!==1||!owedHere)throw Error('RECEIPT_UNAVAILABLE');
  const read=native.buildPendingWithdrawals(escrow,recipient,token),tag='0x'+BigInt(finalHeight).toString(16);
  const outstanding=decodeUintWord(await rpc('eth_call',[{to:read.to,data:read.data},tag]));
  current();
  const route=native.buildWithdraw(escrow,recipient,token);
  const withdraw=Object.freeze({to:route.to,data:route.data,value:route.value});
  // Aggregate pending below this trade's credit means some or all of it may already have been withdrawn.
  const creditState=BigInt(outstanding)>=BigInt(terms.amountBaseUnits)?'owed' as const:'possibly-withdrawn' as const;
  return Object.freeze({status:'credited',recipient,token,amount:terms.amountBaseUnits,creditOutstanding:outstanding,
   creditObservedAtHeight:finalHeight,creditState,withdraw});
 }
 async function validateCanonical(intent:Readonly<IntentV1>,nativeRequest:Request):Promise<CoreResult<void>>{
  const {terms,domain,binding}=trade();
  try{
   current();if(intent.action!=='approve'&&intent.action!=='fund'&&intent.action!=='release'&&intent.action!=='refund')throw Error('INVALID_INPUT');value(await step(native.readObservation({registry,binding,terms,domain,request:nativeRequest,generation:0,requestSequence:1})));const expected=native.escrowCallFor(intent.action==='approve'?{action:'approve',token:terms.asset,spender:domain.verifyingContract,amountBaseUnits:approvalAmount(intent)}:intent.action==='fund'?{action:'fund',domain,terms}:{action:intent.action,escrow:domain.verifyingContract,tradeId:binding.tradeId});
   if(!['approve','fund','release','refund'].includes(intent.action)||intent.binding.chain!==binding.chain||intent.binding.tradeId!==binding.tradeId||intent.binding.networkId!==binding.networkId||intent.binding.deploymentId!==binding.deploymentId||intent.account!==terms.seller||intent.expectedEscrowState!==expected.expectedEscrowState)throw Error();
   const call=parseCanonicalPreparedRequest(intent.preparedRequest);if(call.chainId!==domain.chainId||call.from!==terms.seller||(['to','data','value'] satisfies readonly (keyof EscrowCall)[]).some(key=>call[key]!==expected.call[key]))throw Error();
   if(intent.state==='prepared'&&recoveryCancellationEpoch!==epoch)assertSigningReview();
   if((intent.action==='fund'||intent.action==='approve')&&intent.state==='prepared'&&recoveryCancellationEpoch!==epoch){if(!acceptedProof||phase!=='accepted'&&phase!=='fund-prepared')throw Error();checkFundingWindow(terms.acceptBeforeSeconds,terms.escrowExpirySeconds,quantity(field(await nativeRequest({method:'eth_getBlockByNumber',params:['latest',false]}),'timestamp')));}
   current();return{ok:true,value:undefined};
  }catch{return failure();}
 }
 let journal:Journal|undefined,life:Lifecycle|undefined,reader:ChainReader|undefined,gate:PaymentGuidance|undefined,authority:Authority|undefined,composition:TradeComposition|undefined,journey:ReturnType<typeof createJourneyProjection>|undefined;
 async function nativeObservation(intent:Readonly<IntentV1>,signal:AbortSignal,nativeRequest:Request):Promise<CoreResult<NativeIntentObservation>>{
  const {terms,domain,binding}=trade(),reader=definedReader();const readRpc=(method:string,params:readonly unknown[]=[])=>nativeRequest({method,params});
  try{
   current();if(intent.submission.chain!=='evm')throw Error('INVALID_INPUT');if(intent.binding.chain!==binding.chain||intent.binding.tradeId!==binding.tradeId||intent.binding.networkId!==binding.networkId||intent.binding.deploymentId!==binding.deploymentId||intent.account!==terms.seller)throw Error('INTENT_MISMATCH');
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
   if(intent.action==='approve'){approvalAmount(intent);await checkToken(nativeRequest);return{ok:true,value:{...base,state:'finalized',canonical:true,finalized:true}};}
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
   const wallet=new native.EvmWalletAdapter(walletProvider(index),'explicit-local-wallet-'+index,registry),unsubscribe=wallet.subscribe(walletInvalidated);cleanup.push(()=>{unsubscribe();wallet.dispose();});
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
     life=native.createEvmTxLifecycle({journal:selectedJournal,reader,wallet:async args=>{current();if(args.method==='eth_sendTransaction'){checkSendReview(args);const rows=value(await services.vault.list(selected().session.sessionId,'journal'));current();const markers=rows.map(row=>native.decodeIntentPayload(row.payload)).filter(intent=>intent.state==='broadcast-unknown'&&intent.binding.tradeId===binding.tradeId&&parseCanonicalPreparedRequest(intent.preparedRequest).data===text(defined(args.params?.[0]),'data',/^0x(?:[0-9a-f]{2})*$/));if(markers.length!==1)throw Error('DURABLE_MARKER_REQUIRED');checkSendReview(args);}return nativeRequest(args);},policy:native.policy});cleanup.push((owned=>()=>owned.dispose())(life));
     await step(life.walletChanged({account:terms.seller,chainId:domain.chainId,generation:defined(parties[0]).walletSession.generation}));
     gate=value(native.createEvmPaymentPreflight({registry,binding,terms,request:nativeRequest}));cleanup.push((owned=>()=>owned.dispose())(gate));
     authority=native.createTradeAuthority({binding,generation:0,walletGeneration:defined(parties[0]).walletSession.generation,readValidated:(_binding,job)=>native.readObservation({registry,binding,terms,domain,request:nativeRequest,...job})});cleanup.push((owned=>()=>owned.dispose())(authority));
     composition=native.createTradeComposition({binding,account:terms.seller,authority,journal});cleanup.push((owned=>()=>owned.dispose())(composition));journey=createJourneyProjection({composition,paymentGuidance:gate});cleanup.push((owned=>()=>owned.dispose())(journey));
 }
 function walletInvalidated():void{gate?.invalidate();const previous=life;clearPrivate();void previous?.walletChanged(null).catch(()=>{});onInvalidated?.(snapshot());}
 function clearPrivate(){epoch++;reviewInvalidation++;pendingReview=activeReview=undefined;privacyReady=false;const off=privacyOff;privacyOff=undefined;try{off?.();}catch{}recoveryCancellationEpoch=undefined;for(const close of cleanup.splice(0)){try{close();}catch{ /* Continue clearing every owned capability. */ }}for(const bytes of owned.splice(0))bytes.fill(0);parties.length=0;context=undefined;terms=domain=binding=agreement=document=sessionId=prepared=intentId=undefined;journal=life=reader=gate=authority=composition=journey=undefined;receipt=null;tokenCheck=null;acceptedProof=false;communicationAccepted=false;fees.length=0;backupRevision=null;clock=0;clockObservedAt=performance.now();phase='setup';
  negotiation=pendingAccept=undefined;
  deliveryRetries=0;
  chainState=null;
 }
 function initialize():Promise<void>{if(ready)return Promise.resolve();initialization??=(async()=>{value(await registry.load(registryBytes,registryDigest));value<unknown>((await vault.request({operation:'init',config:{version:1,ReleaseEnabled:0,connectOrigins:[]}})).result);ready=true;})();return initialization;}
 return Object.freeze({
  snapshot,
  async runtime(input:JourneyRuntimeInput):Promise<RuntimeResponse>{
   if(input.operation==='getTransportSelection'||input.operation==='selectTransportMode'){if(!ready||closed)throw Error('LOCKED');return vault.request(input);}
   await initialize();if(busy&&input.operation!=='lock'&&input.operation!=='dispose')throw Error('BUSY');if(['create','unlock','lock','dispose'].includes(input.operation)){clearPrivate();}
   const response=await vault.request(input);if(input.operation==='create'&&response.result.ok){context=await vault.requireCurrent();const identity=new native.MessagingIdentityService(services.vault,{provider:native.createIdentityProvider(),lifecycle:false});try{value(await step(identity.create(selected().session)));await fresh();}finally{identity.dispose();}}if(response.operation==='verifyBackup'&&response.result.ok)backupRevision=response.result.value.revision;return response;
  },
  async act(action:string,options:{readonly signingAction?:SigningAction|undefined;readonly assetId?:string|undefined;readonly amountBaseUnits?:string|undefined;readonly recordId?:string|undefined;readonly attestFiatReceived?:boolean|undefined;readonly reviewRiskAccepted?:boolean|undefined}={}):Promise<JourneySnapshot>{
   if(busy)throw Error('BUSY');const mine=epoch;busy=true;try{
   if(action==='confirm-signing'){const review=pendingReview;pendingReview=undefined;if(!review)throw Error('SIGNING_REVIEW_REQUIRED');activeReview=review;reviewActionReady(review.view.action);assertSigningReview();action=review.view.action;}else if(action!=='review-signing')pendingReview=undefined;
   if(action==='review-signing'){
    const target=options.signingAction;if(!target||!signingActions.includes(target))throw Error('INVALID_INPUT');reviewActionReady(target);await fresh();if(target==='accept-recovered')await connectRecoveredBuyer();connectPrivacyInspection();const view=reviewView(target);pendingReview=Object.freeze({view,fingerprint:fingerprint(view),epoch,sessionId:selected().session.sessionId,wallets:Object.freeze(parties.slice(0,view.wallets.length).map(p=>p.walletSession)),invalidation:reviewInvalidation});return snapshot();
   }else if(action==='discard-signing-review'){pendingReview=undefined;return snapshot();}
    await initialize();
    if(action==='assets')return snapshot();
    if(action==='connect'){
     if(phase!=='setup')throw Error('OUT_OF_ORDER');context=await vault.requireVerifiedBackup();backupRevision=selected().session.revision;
     // Explicit two-wallet fixture acceptance capability is absent in the production/default construction.
     if(typeof localPeerAcceptance!=='function')throw Error('PEER_ACCEPTANCE_CARRIER_UNDEFINED');
     const assetId=options.assetId??'native',asset=registry.network('local-evm')?.assets.find(asset=>asset.id===assetId);if(!asset||asset.kind==='spl'||!registry.deployment('local-evm','escrow-local-v1')?.supportedAssetIds.includes(asset.id)||asset.transferPolicy!=='exact-transfer')throw Error('UNSUPPORTED_ASSET');const principal=canonicalPrincipal(options.amountBaseUnits??'1000000000000000');
     domain={chainId:'31337',verifyingContract:defined(registry.deployment('local-evm','escrow-local-v1')).address};await refreshClock();await makeParties();
     const [seller,buyer]=negotiating();
     const generated=await buildTradeDraftDocument(registry,{networkId:'local-evm',deploymentId:'escrow-local-v1',assetId,amountBaseUnits:principal,
      fiatCurrency:'USD',fiatMinorUnits:'100',fiatScale:2,paymentInstructions:'SYNTHETIC manual bank transfer instruction. No fiat payment proof.',
      seller:seller.walletSession.account,buyer:buyer.walletSession.account,acceptBeforeSeconds:String(clock+600),escrowExpirySeconds:String(clock+7200)},
      {nowSeconds:()=>BigInt(observedNow()),isCurrent:()=>{if(epoch!==mine)return false;current();return epoch===mine;}});
     if(generated.ok)owned.push(generated.bytes); // Own the returned plaintext before any scope check can revoke it.
     try{
      current();if(epoch!==mine)throw Error('LOCKED');if(!generated.ok)throw Error(generated.code);
      const reviewed=value(await step(reviewTermsBytes(registry,generated.bytes)));
      if(reviewed.network.chainId!==domain.chainId||reviewed.deployment.address!==domain.verifyingContract)throw Error('INTEGRITY_FAILURE');
      const nextTerms=asTerms(reviewed),nextAgreement:PrivateAgreementV1={v:1,orderId:reviewed.orderId,revision:reviewed.revision,...reviewed.agreement,
       agreementSalt:text(field(parseStrictJsonBytes(generated.bytes,65536),'privateAgreement'),'agreementSalt',/^[0-9a-f]{64}$/)};
      const nextBinding={chain:'evm' as const,networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:native.evmTermsHash(domain,nextTerms)};
      current();if(epoch!==mine)throw Error('LOCKED');
      const retained=new Uint8Array(generated.bytes);owned.push(retained);
      terms=nextTerms;agreement=nextAgreement;document=retained;binding=nextBinding;
     }finally{if(generated.ok){generated.bytes.fill(0);const index=owned.indexOf(generated.bytes);if(index>=0)owned.splice(index,1);}}
     phase='wallet';
    }else if(action==='watch'){
     if(phase!=='setup'||typeof options.recordId!=='string'||!/^[0-9a-f]{32}$/.test(options.recordId))throw Error('INVALID_INPUT');context=await vault.requireCurrent();
     const response=await acquire(vault.request({operation:'listTermsReviews',profileId:selected().session.profileId}),reply=>{if(reply.operation==='listTermsReviews'&&reply.result.ok)for(const item of reply.result.value.items)item.bytes.fill(0);});if(response.operation!=='listTermsReviews')throw Error('PROTOCOL_ERROR');const items=value(response.result).items;for(const item of items)owned.push(item.bytes);
     try{const saved=items.find(item=>item.recordId===options.recordId);if(!saved)throw Error('NOT_FOUND');const reviewed=value(await step(reviewTermsBytes(registry,saved.bytes)));terms=asTerms(reviewed);domain={chainId:reviewed.network.chainId,verifyingContract:reviewed.deployment.address};binding={chain:'evm',networkId:terms.networkId,deploymentId:terms.deploymentId,tradeId:native.evmTermsHash(domain,terms)};agreement={v:1,orderId:terms.orderId,revision:terms.revision,...reviewed.agreement,agreementSalt:text(field(parseStrictJsonBytes(saved.bytes,65536),'privateAgreement'),'agreementSalt',/^[0-9a-f]{64}$/)};}
     finally{for(const item of items)item.bytes.fill(0);}
     const watched=trade();const wallet=new native.EvmWalletAdapter(walletProvider(0),'explicit-original-seller-wallet',registry),unsubscribe=wallet.subscribe(walletInvalidated);cleanup.push(()=>{unsubscribe();wallet.dispose();});const walletSession=value(await step(wallet.connect(watched.binding.networkId)));if(walletSession.account!==watched.terms.seller)throw Error('WALLET_CHANGED');parties.push({kind:'watch',wallet,walletSession});
     // Invariant: a restored {failed, hash null} approval is never treated as never-sent. The same durable row
     // follows a recover() cancellation (tx-lifecycle.ts:442) and a wallet 4001 after the send marker
     // (tx-lifecycle.ts:296,307-309); never-sent proof is per-journal memory (intent-journal.ts:353). Such an
     // approval therefore stops recovery here, before any re-approval or funding, instead of leaving a funded
     // escrow whose later restart cannot reconcile that approval.
     await attachNative();const recoveryBinding=defined(binding),recoveryTerms=defined(terms);const originalPrepared=value(await step(defined(journal).list())).filter(intent=>intent.binding.chain===recoveryBinding.chain&&intent.binding.networkId===recoveryBinding.networkId&&intent.binding.deploymentId===recoveryBinding.deploymentId&&intent.binding.tradeId===recoveryBinding.tradeId&&intent.account===recoveryTerms.seller&&intent.action==='fund'&&intent.state==='prepared');let recovered:readonly IntentV1[];recoveryCancellationEpoch=mine;try{recovered=value(await step(defined(life).recover()));}finally{if(epoch===mine)recoveryCancellationEpoch=undefined;}const observed=value(await step(native.readObservation({registry,binding:watched.binding,terms:watched.terms,domain:watched.domain,request:scopedRequest,generation:0,requestSequence:1})));
     const selectedBinding=watched.binding,selectedTerms=watched.terms;const approvalCandidates=recovered.filter(intent=>intent.action==='approve'&&!['failed','expired','replaced'].includes(intent.state));const action=observed.state==='absent'&&approvalCandidates.length>0?'approve':observed.state==='released'?'release':observed.state==='refunded'?'refund':'fund';const matches=recovered.filter(intent=>intent.binding.tradeId===selectedBinding.tradeId&&intent.binding.networkId===selectedBinding.networkId&&intent.binding.deploymentId===selectedBinding.deploymentId&&intent.account===selectedTerms.seller&&intent.action===action);if(matches.length===0&&observed.state==='absent'&&originalPrepared.length===1&&defined(journal).isTerminalVerified(defined(originalPrepared[0]).intentId)){phase='cancelled-before-send';return snapshot();}const chosen=action==='approve'?matches.sort((a,b)=>BigInt(a.submission.chain==='evm'?a.submission.nonce??'0':'0')>BigInt(b.submission.chain==='evm'?b.submission.nonce??'0':'0')?-1:1)[0]:matches.length===1?matches[0]:undefined;
     // Settled on chain without this wallet's matching intent (e.g. a third-party refund): show the chain outcome.
     const terminalOnChain=observed.state==='released'||observed.state==='refunded';
     // An own matching intent without a hash cannot be reconciled, so the chain outcome is shown instead.
     const ownAmbiguous=!chosen||chosen.submission.chain!=='evm'||chosen.submission.hash===null;
     if(terminalOnChain&&ownAmbiguous&&recovered.length>0){
      const preparedAt=(intent:IntentV1)=>BigInt(parseCanonicalPreparedRequest(intent.preparedRequest).preparedAtBlock);
      const heights=recovered.map(preparedAt);
      const fromBlock=heights.reduce((low,height)=>height<low?height:low);
      await enterChainReceipt(observed.state==='released'?'released':'refunded',String(fromBlock));
      return snapshot();
     }
     if(!chosen)throw Error('RECOVERY_SELECTION_REQUIRED');intentId=chosen.intentId;for(const previous of recovered.filter(intent=>intent.action==='approve'&&intent.intentId!==chosen.intentId)){value(await step(defined(journal).reconcileNative(previous.intentId)));const verified=value(await step(defined(life).reconcile(previous.intentId)));if(verified.outcome!=='finalized')throw Error('APPROVAL_RECOVERY_UNRESOLVED');await recordFee(verified.intent);}
     // A release or refund sent before this restart may still be unresolved, or may have reverted (e.g. included at
     // or after the deadline) while the escrow stays funded. Each is reconciled read-only, never cancelled or resent.
     if(observed.state==='funded'){
      const isSettle=(intent:IntentV1)=>intent.action==='release'||intent.action==='refund';
      const leftovers=recovered.filter(intent=>isSettle(intent)&&intent.intentId!==chosen.intentId);
      const leftover=await classifyLeftovers(leftovers);
      if(leftover.kind==='external'){
       const fromBlock=parseCanonicalPreparedRequest(chosen.preparedRequest).preparedAtBlock;
       await enterExternalRecovery(leftover.intentId,fromBlock);
       return snapshot();
      }
      if(leftover.kind==='settling'){
       // Reconcile-only on that intent: no refund may be reserved beside an unresolved settlement.
       intentId=leftover.intentId;
       phase='settling';
       return snapshot();
      }
     }
     phase=action==='approve'?'approval-reconcile':action==='fund'?'reconcile':'settling';
    }else if(action==='offer'){
     if(phase!=='wallet')throw Error('OUT_OF_ORDER');
     await fresh();
     await requireAcceptanceTime();
     const {terms}=trade(),[seller]=negotiating();
     const ad=await step(createAdEvent(seller.eventCrypto,{app:'p2p-offramp',v:1,orderId:terms.orderId,revision:1,networkId:'eip155:31337',assetId:defined(registry.network(terms.networkId)?.assets.find(asset=>(asset.address??ZERO)===terms.asset)).id,amountMin:terms.amountBaseUnits,amountMax:terms.amountBaseUnits,currency:'USD',railClass:'bank-transfer',expiresAtSeconds:String(clock+1800),maker:seller.pub},clock));
     if(seller.book.ingest(ad)!=='accepted')throw Error('BAD_AD');
     // The ad is committed locally: from here a failure leaves an explicit, same-event retry, never a new ad.
     negotiation={ad,adDelivered:false,takeDelivered:false};
     deliveryRetries=0;
     phase='delivery-pending';
     await negotiate(negotiation);
     negotiation=undefined;
     phase='review';
    }else if(action==='retry-delivery'){
     if(phase!=='delivery-pending'||!negotiation&&!pendingAccept)throw Error('OUT_OF_ORDER');
     if(deliveryRetries>=MAX_DELIVERY_RETRIES){stopDelivery();throw Error('DELIVERY_RETRY_LIMIT');}
     // Only a retry that actually reaches the relay uses the budget; vault or chain-clock failures do not.
     const publishedBefore=relayPublishes;
     try{
      await fresh();
      await requireAcceptanceTime();
      if(negotiation){
       await negotiate(negotiation);
       negotiation=undefined;
      }else{
       await deliverAcceptance(defined(pendingAccept));
       pendingAccept=undefined;
       communicationAccepted=true;
      }
     }catch(error){
      if(relayPublishes>publishedBefore)deliveryRetries++;
      // Past acceptBefore or out of attempts nothing can still complete; stop instead of leaving a dead retry.
      const expired=error instanceof Error&&error.message==='EXPIRED';
      if(epoch===mine&&(expired||deliveryRetries>=MAX_DELIVERY_RETRIES))stopDelivery();
      throw error;
     }
     // Wallet acceptance still needs its own fresh signing review; delivery never signs.
     phase='review';
    }else if(action==='accept'){
     if(phase!=='review')throw Error('OUT_OF_ORDER');if(options.reviewRiskAccepted!==true)throw Error('RISK_CONFIRMATION_REQUIRED');assertSigningReview();await fresh();await requireAcceptanceTime();const {terms,domain,binding,agreement}=trade(),document=definedDocument();const[seller,buyer]=negotiating(),exact=defined(buyer.exchange.session(defined(sessionId))?.terms).bytes;
     try{if(!equal(exact,document))throw Error('TERMS_MISMATCH');const reviewed=value(await step(reviewTermsBytes(registry,exact)));if(native.evmTermsHash(domain,asTerms(reviewed))!==binding.tradeId)throw Error('TERMS_MISMATCH');
      if(!communicationAccepted){
       // Accept commits locally before delivery; a failure keeps this exact message for an explicit retry.
       pendingAccept=value(await step(buyer.exchange.accept(defined(sessionId),exact,buyer.secret)));
       deliveryRetries=0;
       phase='delivery-pending';
       await deliverAcceptance(pendingAccept);
       pendingAccept=undefined;
       communicationAccepted=true;
       phase='review';
      }
      await requireAcceptanceTime();const sellerSignature=value(await acquire(seller.wallet.signTerms(seller.walletSession,domain,terms,'seller'),result=>{if(result.ok)result.value.fill(0);}));owned.push(sellerSignature);await requireAcceptanceTime();
      const buyerSignature=await acquire(defined(localPeerAcceptance)({wallet:buyer.wallet,session:buyer.walletSession,domain,terms}),signature=>signature.fill(0));owned.push(buyerSignature);await requireAcceptanceTime();
      const bundle=value(await step(native.verifyEvmAgreementBundle({privateAgreement:agreement,domain,terms,acceptances:[{termsHash:binding.tradeId,role:'seller',walletAccount:terms.seller,signature:sellerSignature},{termsHash:binding.tradeId,role:'buyer',walletAccount:terms.buyer,signature:buyerSignature}]},{isCurrent:()=>{try{current();return true;}catch{return false;}}})));
      sellerSignature.fill(0);buyerSignature.fill(0);if(bundle.termsHash!==binding.tradeId)throw Error('TERMS_MISMATCH');value<unknown>((await step(vault.request({operation:'saveTermsReview',profileId:selected().session.profileId,source:'file',bytes:exact}))).result);await fresh();
     }finally{exact.fill(0);}
     await attachNative();acceptedProof=true;phase='accepted';
    }else if(action==='accept-recovered'){
     if(phase!=='recovered-acceptance-required'||options.reviewRiskAccepted!==true)throw Error('RISK_CONFIRMATION_REQUIRED');assertSigningReview();await fresh();await requireAcceptanceTime();const {terms,domain,agreement,binding}=trade(),seller=defined(parties[0]);
     await connectRecoveredBuyer();const {wallet,walletSession}=defined(parties[1]);
     const own=value(await acquire(seller.wallet.signTerms(seller.walletSession,domain,terms,'seller'),r=>{if(r.ok)r.value.fill(0);}));owned.push(own);const peer=await acquire(defined(localPeerAcceptance)({wallet,session:walletSession,domain,terms}),s=>s.fill(0));owned.push(peer);
     try{await requireAcceptanceTime();value(await step(native.verifyEvmAgreementBundle({privateAgreement:agreement,domain,terms,acceptances:[{termsHash:binding.tradeId,role:'seller',walletAccount:terms.seller,signature:own},{termsHash:binding.tradeId,role:'buyer',walletAccount:terms.buyer,signature:peer}]},{isCurrent:()=>{try{current();return true;}catch{return false;}}})));acceptedProof=true;phase='accepted';}finally{own.fill(0);peer.fill(0);}
    }else if(action==='token-check'){
     if(!['accepted','recovered-acceptance-required'].includes(phase))throw Error('OUT_OF_ORDER');await fresh();await checkToken();
    }else if(action==='approve'||action==='reset-approval'){
     if(phase!=='accepted'||!acceptedProof)throw Error('OUT_OF_ORDER');assertSigningReview();await fresh();await requireAcceptanceTime();const {terms,domain,binding}=trade(),checked=await checkToken();if(action==='approve'&&checked.allowance!=='0'&&BigInt(checked.allowance)<BigInt(terms.amountBaseUnits))throw Error('ALLOWANCE_RESET_REQUIRED');if(action==='approve'&&BigInt(checked.allowance)>=BigInt(terms.amountBaseUnits))throw Error('ALLOWANCE_ALREADY_SUFFICIENT');if(action==='reset-approval'&&checked.allowance==='0')throw Error('ALLOWANCE_ALREADY_ZERO');
     const call=native.escrowCallFor({action:'approve',token:terms.asset,spender:domain.verifyingContract,amountBaseUnits:action==='reset-approval'?'0':terms.amountBaseUnits});prepared=value(await step(attached().life.prepare({binding,action:'approve',expectedEscrowState:'absent',call:call.call})));intentId=prepared.intentId;phase='fund-prepared';let sent;try{sent=await step(attached().life.submit(prepared));}finally{if(epoch===mine)phase='approval-reconcile';}if(!sent.ok&&sent.error?.code!=='BROADCAST_UNKNOWN')throw Error(sent.error?.code??'SUBMIT_FAILED');
    }else if(action==='fund'){
     if(phase!=='accepted'||!acceptedProof)throw Error('OUT_OF_ORDER');assertSigningReview();await fresh();const{terms,domain,binding}=trade(),{life}=attached();if(terms.assetKind==='erc20'){const checked=await checkToken();if(BigInt(checked.balance)<BigInt(terms.amountBaseUnits))throw Error('TOKEN_BALANCE_INSUFFICIENT');if(BigInt(checked.allowance)<BigInt(terms.amountBaseUnits))throw Error('TOKEN_ALLOWANCE_INSUFFICIENT');}const call=native.escrowCallFor({action:'fund',domain,terms});
     prepared=value(await step(life.prepare({binding,action:'fund',expectedEscrowState:call.expectedEscrowState,call:call.call})));intentId=prepared.intentId;phase='fund-prepared';
     let sent;try{sent=await step(life.submit(prepared));}finally{if(epoch===mine)phase='reconcile';}if(!sent.ok&&sent.error?.code!=='BROADCAST_UNKNOWN')throw Error(sent.error?.code??'SUBMIT_FAILED');
    }else if(action==='reconcile'){
     const reconcilable=['approval-reconcile','reconcile','settling','payment-coordination','payment-guidance-closed',
      'payment-guidance-unavailable','external-recovery-required'];
     if(!reconcilable.includes(phase))throw Error('OUT_OF_ORDER');
     if(releasePhase())phase='payment-guidance-unavailable';
     attached().gate.invalidate();
     await fresh();
     const{binding}=trade(),{journal,life,reader,authority,journey}=attached(),intentId=definedIntentId();
     if(phase==='external-recovery-required'){
      // Only the chain state is re-read; the ambiguous row is never reconciled, cancelled or rewritten.
      await enterExternalRecovery(intentId,await preparedAtOf(intentId));
      return snapshot();
     }
     const observedNative=await step(journal.reconcileNative(intentId));
     if(!observedNative.ok&&phase==='settling'&&await nullHashBeyondScan(intentId)){
      await enterExternalRecovery(intentId,await preparedAtOf(intentId));
      return snapshot();
     }
     value(observedNative);const result=value(await step(life.reconcile(intentId)));
     // Expired or replaced settlements need a successor the app cannot create (D9): hand over, never resend.
     const handover=result.outcome==='replaced'||result.outcome==='dropped';
     if((result.intent.action==='release'||result.intent.action==='refund')&&handover){
      const fromBlock=parseCanonicalPreparedRequest(result.intent.preparedRequest).preparedAtBlock;
      await enterExternalRecovery(intentId,fromBlock);
      return snapshot();
     }
     // A settlement the chain reverted (e.g. a release included at or after the deadline) leaves the escrow funded.
     // Re-enter the funded phase from a fresh native read so the original refund path is offered; never resend.
     const settle=result.intent.action==='release'||result.intent.action==='refund';
     if(settle&&result.outcome==='reverted'&&result.escrowState==='funded'){
      await enterFundedPhase();
      return snapshot();
     }
     // Reverted while the escrow was settled by someone else: show that on-chain outcome, never resend.
     const settledOnChain=result.escrowState==='released'||result.escrowState==='refunded';
     if(settle&&result.outcome==='reverted'&&settledOnChain){
      const preparedAtBlock=parseCanonicalPreparedRequest(result.intent.preparedRequest).preparedAtBlock;
      await enterChainReceipt(result.escrowState,preparedAtBlock);
      return snapshot();
     }
     if(result.outcome!=='finalized')return snapshot();await recordFee(result.intent);
     if(result.intent.action==='approve'){await checkToken();phase=acceptedProof?'accepted':'recovered-acceptance-required';return snapshot();}
     if(result.escrowState==='funded'){
      await enterFundedPhase();
     }else if(result.escrowState==='released'||result.escrowState==='refunded'){
      // Receipt is native and bound to the original exact intent; JSON terminal labels are insufficient.
      if(result.intent.submission.chain!=='evm'||!result.intent.submission.hash)throw Error('RECEIPT_UNAVAILABLE');
      await enterReceipt(result.escrowState,result.intent.submission.hash,'this-wallet');
     }else throw Error('STATE_MISMATCH');
    }else if(action==='release'||action==='refund'){
     if(!releasePhase()&&!(action==='refund'&&phase==='payment-guidance-unavailable'))throw Error('OUT_OF_ORDER');
     if(action==='release'&&options.attestFiatReceived!==true)throw Error('FIAT_ATTESTATION_REQUIRED');
     assertSigningReview();
     phase='payment-guidance-unavailable';
     attached().gate.invalidate();
     await fresh();
     const{terms,domain,binding}=trade(),{gate,life}=attached();
     if(action==='refund'&&await chainNow()<Number(terms.escrowExpirySeconds))throw Error('REFUND_NOT_AVAILABLE');
     const guidance=value(await step(gate.read()));
     // The guidance buffer only discourages starting a fiat payment. Release re-checks the deadline margin on this
     // fresh read, immediately before prepare.
     if(action==='release'&&!releaseOpen(guidance))throw Error('RELEASE_NOT_AVAILABLE');
     const call=native.escrowCallFor({action,escrow:domain.verifyingContract,tradeId:binding.tradeId});prepared=value(await step(life.prepare({binding,action,expectedEscrowState:'funded',call:call.call})));intentId=prepared.intentId;phase='settling';const sent=await step(life.submit(prepared));if(!sent.ok&&sent.error?.code!=='BROADCAST_UNKNOWN')throw Error(sent.error?.code??'SUBMIT_FAILED');
    }else throw Error('INVALID_INPUT');return snapshot();
   }catch(error){if(epoch===mine&&(action==='connect'||action==='watch')&&phase==='setup'){clearPrivate();}throw error;}finally{while(nativeRequests.size>0)await Promise.allSettled([...nativeRequests]);activeReview=undefined;busy=false;}
  },
  dispose(){if(closed)return;closed=true;clearPrivate();privacyReader.dispose();unknownPrivacy.dispose();vault.dispose();},
 });
}
