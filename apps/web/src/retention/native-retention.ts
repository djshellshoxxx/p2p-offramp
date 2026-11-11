/** DATA01 native mixed-record adapter. Construct only inside an explicitly supplied private Worker. */
import {reviewTermsBytes,createCoreError,createOperationId,type RegistryService,type ReviewedEvmTerms,type CoreResult} from '../../../../packages/domain/index.ts';
import {createIdentityHistoryRetention} from '../../../../packages/identity/index.ts';
import {JournalNativeRetentionAuthority,MAX_RETENTION_DELETES,type EncryptedVaultService,type NativePayoutClosureAuthority,type NativeRetentionAuthority,type NativeRetentionLease,type RetentionScope} from '../../../../packages/storage/index.ts';
import {decodeIntentPayload,parseSavedReviewPayload,sameBinding,parseTradeBinding,type IntentV1,type TradeBinding,type VaultSession,type VaultSessionLease,type Result} from '../../../../packages/schemas/index.ts';
import {parseCanonicalPreparedRequest} from '../journey/private-trade.ts';
import type {EvmTerms,EvmDomain,NativeFactories,Journal,Lifecycle,EscrowCall,Request,NativeIntentObservation} from '../journey/native-contracts.ts';
type ReadOnlyJournalVault=Pick<EncryptedVaultService,'read'|'list'|'commit'|'captureSession'>;
/** Actual native function references are constructor capabilities, never runtime configuration or IPC. */
export interface RetentionNativeFunctions extends Pick<NativeFactories,'evmTermsHash'|'escrowCallFor'|'createEip1193ChainReader'|'createEvmTxLifecycle'|'readObservation'|'policy'> {
 createLifecycleJournal(options:{vault:ReadOnlyJournalVault;session:VaultSession;validateCanonical:(intent:Readonly<IntentV1>)=>Promise<CoreResult<void>>;readNative?:(intent:Readonly<IntentV1>,signal:AbortSignal)=>Promise<CoreResult<NativeIntentObservation>>}):Journal;
 buildPendingWithdrawals(escrow:string,recipient:string,token:string):EscrowCall;
}
export interface RetentionConversationContext {readonly identityRecordId:string;readonly binding:TradeBinding;readonly participants:readonly [string,string];}
export interface NativeRetentionOptions {
 readonly vault:EncryptedVaultService;readonly session:VaultSession;readonly registry:RegistryService;
 readonly native:RetentionNativeFunctions;readonly request:Request;readonly contexts:readonly RetentionConversationContext[];
 readonly currentScope:()=>boolean;readonly now?:()=>number;readonly maxAgeMs?:number;
}
interface ReviewedBinding {readonly binding:TradeBinding;readonly terms:EvmTerms;readonly domain:EvmDomain;}
const ZERO=`0x${'0'.repeat(40)}`;
const signalAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const signalListen=EventTarget.prototype.addEventListener,signalUnlisten=EventTarget.prototype.removeEventListener;
const READ_METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt']);
class Protected extends Error {constructor(){super('Native retention dependencies remain protected.');}}
const protect=():never=>{throw new Protected();};
const field=(value:unknown,name:string):unknown=>{if(!value||typeof value!=='object')return protect();const d=Object.getOwnPropertyDescriptor(value,name);if(!d||!('value'in d))return protect();return d.value;};
const termsOf=(r:ReviewedEvmTerms):EvmTerms=>({orderId:r.orderId,revision:r.revision,networkId:r.network.id,deploymentId:r.deployment.id,seller:r.seller,buyer:r.buyer,assetKind:r.asset.kind,asset:r.asset.address??ZERO,amountBaseUnits:r.amountBaseUnits,privateAgreementHash:r.privateAgreementSha256,capabilitiesHash:r.capabilitiesSha256,sellerNonce:r.sellerNonce,acceptBeforeSeconds:r.acceptBeforeSeconds,escrowExpirySeconds:r.escrowExpirySeconds});
const bindingKey=(binding:TradeBinding):string=>JSON.stringify([binding.chain,binding.networkId,binding.deploymentId,binding.tradeId]);
const failure=<T>():CoreResult<T>=>({ok:false,error:createCoreError('INTEGRITY_FAILURE',{operationId:createOperationId(),readOnly:true})});
function vaultValue<T>(result:Result<T>):T{if(result.ok)return result.value;return protect();}
class NativeMixedRetentionAuthority implements NativeRetentionAuthority {
 readonly #options:NativeRetentionOptions;readonly #lease:VaultSessionLease;readonly #contexts:readonly RetentionConversationContext[];
 readonly #history:ReturnType<typeof createIdentityHistoryRetention>;
 #disposed=false;#epoch=0;#active:AbortController|undefined;
 constructor(options:NativeRetentionOptions){
  const max=options.maxAgeMs??5000;
  if(!Number.isSafeInteger(max)||max<1||max>30000||typeof options.currentScope!=='function'||!Array.isArray(options.contexts)||options.contexts.length>8)throw new Protected();
  this.#options={...options,maxAgeMs:max};
  this.#contexts=Object.freeze(options.contexts.map(context=>{
   if(!/^[0-9a-f]{32}$/.test(context.identityRecordId)||!Array.isArray(context.participants)||context.participants.length!==2||context.participants[0]===context.participants[1]||context.participants.some((publicKey:unknown)=>typeof publicKey!=='string'||!/^[0-9a-f]{64}$/.test(publicKey)))return protect();
   return Object.freeze({identityRecordId:context.identityRecordId,binding:parseTradeBinding(context.binding),participants:Object.freeze([...context.participants]) as readonly [string,string]});
  }));
  this.#lease=vaultValue(options.vault.captureSession(options.session,()=>this.dispose()));this.#history=createIdentityHistoryRetention(options.vault);
 }
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#epoch++;this.#active?.abort();try{this.#history?.dispose();}catch{/* Continue revocation. */}try{this.#lease?.dispose();}catch{/* Continue revocation. */}}
 async reviewNative(scope:RetentionScope,external:AbortSignal):Promise<NativeRetentionLease>{
  try{Reflect.apply(signalAborted,external,[]);}catch{throw new Protected();}
  const {vault,registry,native}=this.#options,controller=new AbortController(),epoch=++this.#epoch;
  this.#active?.abort();this.#active=controller;
  const abort=()=>controller.abort();let listening=false;
  let disposed=false,last=NaN,started=NaN;const now=this.#options.now??(()=>performance.now());
  const resources:{dispose():void}[]=[];
  const owned=()=>!disposed&&!this.#disposed&&epoch===this.#epoch&&!controller.signal.aborted;
  const current=()=>{
   try{if(!owned())return false;const time=now(),source=this.#options.currentScope(),session=this.#lease.current();
    if(source!==true||!session||session.profileId!==scope.profileId||session.revision!==scope.revision||!Number.isFinite(started)||started<0||!Number.isFinite(time)||time<0||time<started||time<last||time-started>=this.#options.maxAgeMs!)return false;
    last=time;return owned();
   }catch{return false;}
  };
  const guard=()=>{if(!current())return protect();};
  const cleanup=()=>{if(disposed)return;disposed=true;controller.abort();if(listening){try{Reflect.apply(signalUnlisten,external,['abort',abort]);}catch{/* Continue resource disposal. */}}for(const resource of [...resources].reverse()){try{resource.dispose();}catch{/* Local revocation cannot depend on foreign cleanup. */}}if(this.#active===controller)this.#active=undefined;};
  const empty=():NativeRetentionLease=>Object.freeze({scope,safeRecordIds:Object.freeze([]),current,dispose:cleanup});
  try{
   Reflect.apply(signalListen,external,['abort',abort,{once:true}]);listening=true;if(Reflect.apply(signalAborted,external,[]))abort();
   started=now();guard();const candidates=new Set(scope.candidates.map(candidate=>candidate.record.id));
   // Ambiguous/future dependencies block the complete closure. Identity material always survives.
   if(scope.candidates.length<1||scope.candidates.length>MAX_RETENTION_DELETES||scope.records.some(record=>record.schemaVersion!==1||record.kind!=='identity'&&!candidates.has(record.id)))return empty();
   const journalRecords=scope.records.filter(record=>record.kind==='journal');if(!journalRecords.length)return empty();
   const intents=journalRecords.map(record=>decodeIntentPayload(record.payload));
   if(intents.some(intent=>intent.binding.chain!=='evm'||!['finalized','failed'].includes(intent.state)))return empty();
   const bindings=new Map<string,ReviewedBinding>();
   for(const candidate of scope.candidates.filter(candidate=>candidate.purpose==='saved-terms-review')){
    const saved=parseSavedReviewPayload(candidate.record.payload,candidate.record.schemaVersion);if(!saved)return empty();
    try{
     const reviewed=await reviewTermsBytes(registry,saved.terms);guard();if(!reviewed.ok)return empty();
     const terms=termsOf(reviewed.value),domain={chainId:reviewed.value.network.chainId,verifyingContract:reviewed.value.deployment.address};
     const binding=parseTradeBinding({chain:'evm',networkId:terms.networkId,deploymentId:terms.deploymentId,tradeId:native.evmTermsHash(domain,terms)});guard();
     if(!intents.some(intent=>sameBinding(intent.binding,binding)))return empty();
     bindings.set(bindingKey(binding),{binding,terms,domain});
    }finally{saved.terms.fill(0);}
   }
   if(intents.some(intent=>!bindings.has(bindingKey(intent.binding))))return empty();
   const request:Request=async input=>{guard();if(!READ_METHODS.has(input.method))return protect();const value=await this.#options.request(input);guard();return value;};
   // Existing G12 can read, but cannot persist a reconciliation transition in this operation.
   const readOnlyVault:ReadOnlyJournalVault={read:vault.read.bind(vault),list:vault.list.bind(vault),captureSession:vault.captureSession.bind(vault),commit:(id,revision,mutations,signal,assertCurrent)=>mutations.length?Promise.resolve({ok:false,error:{code:'CONFLICT',retryable:false,message:'Normal reconciliation is required before retention review.'}}):vault.commit(id,revision,[],signal,assertCurrent)};
   const canonical=async(intent:Readonly<IntentV1>):Promise<CoreResult<void>>=>{
    try{
     guard();const reviewed=bindings.get(bindingKey(intent.binding));if(!reviewed)return failure();const {terms,domain}=reviewed,call=parseCanonicalPreparedRequest(intent.preparedRequest);
     if(intent.submission.chain!=='evm'||call.chainId!==domain.chainId||call.from!==intent.account||call.nonce!==intent.submission.nonce||!['finalized','failed'].includes(intent.state))return failure();
     if(intent.action!=='refund'&&intent.account!==terms.seller)return failure();
     const actions=intent.action==='fund'?[{action:'fund' as const,domain,terms}]:intent.action==='approve'?(terms.assetKind==='erc20'?[{action:'approve' as const,token:terms.asset,spender:domain.verifyingContract,amountBaseUnits:'0'},{action:'approve' as const,token:terms.asset,spender:domain.verifyingContract,amountBaseUnits:terms.amountBaseUnits}]:[]):[{action:intent.action,escrow:domain.verifyingContract,tradeId:intent.binding.tradeId}];
     if(!actions.some(action=>{const expected=native.escrowCallFor(action);return expected.expectedEscrowState===intent.expectedEscrowState&&expected.call.to===call.to&&expected.call.data===call.data&&expected.call.value===call.value;}))return failure();
     guard();return{ok:true,value:undefined};
    }catch{return failure();}
   };
   const journal=native.createLifecycleJournal({vault:readOnlyVault,session:this.#options.session,validateCanonical:canonical});resources.push(journal);
   const lifecycles=new Map<string,Lifecycle>(),creditChecks:(()=>Promise<boolean>)[]=[];
   for(const reviewed of bindings.values()){
    const {binding,terms,domain}=reviewed;
    const observation=await native.readObservation({registry,binding,terms,domain,request,generation:0,requestSequence:1,signal:controller.signal});guard();
    if(!observation.ok||!sameBinding(observation.value.binding,binding)||!['released','refunded'].includes(observation.value.state)||observation.value.finality!=='finalized')return empty();
    // Released/Refunded can retain unpaid deferred credit. Read the existing ABI at the SAME canonical anchor.
    const initial=observation.value;
    const zeroCredit=async(observed:typeof initial):Promise<boolean>=>{
     const anchor=observed.anchor,block=`0x${BigInt(anchor.height).toString(16)}`,recipient=observed.state==='released'?terms.buyer:terms.seller;
     const call=native.buildPendingWithdrawals(domain.verifyingContract,recipient,terms.asset);guard();
     const credit=await request({method:'eth_call',params:[{to:call.to,data:call.data},block]});
     if(typeof credit!=='string'||!/^0x[0-9a-f]{64}$/.test(credit)||BigInt(credit)!==0n)return false;
     const repeated=await request({method:'eth_getBlockByNumber',params:[block,false]});
     return field(repeated,'hash')===anchor.hash&&field(repeated,'number')===block;
    };
    if(!await zeroCredit(initial))return empty();
    creditChecks.push(async()=>{
     const refreshed=await native.readObservation({registry,binding,terms,domain,request,generation:0,requestSequence:2,signal:controller.signal});guard();
     if(!refreshed.ok||!sameBinding(refreshed.value.binding,binding)||refreshed.value.finality!=='finalized'||refreshed.value.state!==initial.state||BigInt(refreshed.value.anchor.height)<BigInt(initial.anchor.height)||refreshed.value.anchor.height===initial.anchor.height&&refreshed.value.anchor.hash!==initial.anchor.hash)return false;
     return zeroCredit(refreshed.value);
    });
    const base=native.createEip1193ChainReader({request,escrow:domain.verifyingContract});
    const reader={...base,escrowObservation:(requested:TradeBinding,context:{signal:AbortSignal;generation:number;requestSequence:number})=>sameBinding(requested,binding)?native.readObservation({registry,binding,terms,domain,request,...context}):Promise.resolve(failure<never>())};
    const life=native.createEvmTxLifecycle({journal,reader,wallet:async()=>protect(),policy:native.policy});resources.push(life);lifecycles.set(bindingKey(binding),life);
   }
   const journalScope:RetentionScope=Object.freeze({...scope,records:Object.freeze(journalRecords),candidates:Object.freeze(scope.candidates.filter(candidate=>candidate.purpose==='terminal-intent'))});
   const payoutClosure:NativePayoutClosureAuthority={reviewPayoutClosure:async(ownedScope,ownedIntents,signal)=>{
    let released=false;const live=()=>!released&&!Reflect.apply(signalAborted,signal,[])&&current();
    if(ownedScope!==journalScope||ownedIntents.length!==intents.length||ownedIntents.some((intent,index)=>JSON.stringify(intent)!==JSON.stringify(intents[index]))||!live())return protect();
    for(const check of creditChecks){if(!await check()||!live())return protect();}
    return Object.freeze({scope:ownedScope,intents:ownedIntents,current:live,dispose(){released=true;}});
   }};
   const baseAuthority=new JournalNativeRetentionAuthority({vault,session:this.#options.session,journal,reconciler:{reconcile:async(id,signal)=>{const intent=intents.find(intent=>intent.intentId===id),life=intent&&lifecycles.get(bindingKey(intent.binding));return life?life.reconcile(id,signal):failure();}},payoutClosure,currentScope:current,now,maxAgeMs:this.#options.maxAgeMs!});resources.push(baseAuthority);
   const journalProof=await baseAuthority.reviewNative(journalScope,controller.signal);resources.push(journalProof);guard();
   const authenticated=new Set<string>();
   for(const context of this.#contexts){
    if(!bindings.has(bindingKey(context.binding)))continue;
    const history=await this.#history.authenticate(this.#options.session,context.identityRecordId,{binding:context.binding,participants:context.participants},controller.signal);guard();if(!history.ok)return empty();
    const metadata=history.value;if(metadata.profileId!==scope.profileId||metadata.revision!==scope.revision||!sameBinding(metadata.binding,context.binding)||!context.participants.includes(metadata.selfPublicKey))return empty();
    const expected=scope.candidates.filter(candidate=>candidate.conversationId===metadata.conversationId);
    if(expected.length!==metadata.records.length||metadata.records.some(record=>!expected.some(candidate=>candidate.record.id===record.recordId&&candidate.reviewTimestamp===record.receivedAt))||new Set(metadata.records.map(record=>record.recordId)).size!==metadata.records.length)return empty();
    for(const record of metadata.records)authenticated.add(record.recordId);
   }
   if(scope.candidates.some(candidate=>candidate.purpose==='chat-history'&&!authenticated.has(candidate.record.id)))return empty();
   // Recheck payout dependencies after asynchronous history authentication, immediately before the lease.
   for(const check of creditChecks){if(!await check())return empty();guard();}
   guard();if(!journalProof.current())return empty();guard();
   const selected=Object.freeze(scope.candidates.map(candidate=>candidate.record.id));
   return Object.freeze({scope,safeRecordIds:selected,current:()=>{if(!current())return false;const valid=journalProof.current();return valid&&current();},dispose:cleanup});
  }catch{
   // Unknown source, malformed proof, identity mismatch and unresolved recovery grant no deletion authority.
   return empty();
  }
 }
}
export function createNativeRetentionAuthority(options:NativeRetentionOptions):NativeRetentionAuthority&{dispose():void}{return new NativeMixedRetentionAuthority(options);}
