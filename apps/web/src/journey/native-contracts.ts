/** Structural contracts for trusted private constructors; no production/private package facade is widened. */
import type {CoreResult,RegistryService,PrivateAgreementV1,ReviewedEvmTerms,createJourneyProjection,PrivacyView,PrivacyTransportPort,PrivacyEndpointPort} from '../../../../packages/domain/index.ts';
import type {JourneyPaymentGuidanceObservation} from '../../../../packages/domain/index.ts';
import type {EncryptedVaultService,EncryptedBackupService} from '../../../../packages/storage/index.ts';
import type {MessagingIdentityProvider} from '../../../../packages/identity/index.ts';
import type {CreatedIdentity,IdentityHandle,IdentityResult,VaultSession,IntentV1,TradeBinding,ChainObservation,TradeView,RuntimeResponse} from '../../../../packages/schemas/index.ts';
import type {createJourneyVaultComposition} from './vault-composition.ts';
import type {WorkerTransportPolicy} from '../runtime/worker-endpoint.ts';
import type {createRelayEventCrypto,createTermsExchange} from '../../../../packages/exchange/index.ts';
import type {createOrderBook,RelayPool} from '../../../../packages/relay/index.ts';
export type JourneyRuntimeInput=Parameters<ReturnType<typeof createJourneyVaultComposition>['request']>[0];
export interface EvmDomain {readonly chainId:string;readonly verifyingContract:string;}
export interface EvmTerms {readonly orderId:string;readonly revision:string;readonly networkId:string;readonly deploymentId:string;readonly seller:string;readonly buyer:string;readonly assetKind:'native'|'erc20';readonly asset:string;readonly amountBaseUnits:string;readonly privateAgreementHash:string;readonly capabilitiesHash:string;readonly sellerNonce:string;readonly acceptBeforeSeconds:string;readonly escrowExpirySeconds:string;}
export interface NativeRequest {readonly method:string;readonly params?:readonly unknown[];}
export type Request=(request:NativeRequest)=>Promise<unknown>;
export interface WalletSession {readonly providerId:string;readonly chain:'evm';readonly networkId:string;readonly account:string;readonly generation:number;readonly capabilities:Readonly<{signTerms:boolean;sendTransaction:boolean;signTransaction:boolean}>;}
export interface WalletProvider {request:Request;on?(event:string,listener:(...args:unknown[])=>void):void;removeListener?(event:string,listener:(...args:unknown[])=>void):void;}
export interface WalletAdapter {connect(networkId:string,signal?:AbortSignal):Promise<CoreResult<WalletSession>>;inspect():WalletSession|null;signTerms(session:WalletSession,domain:EvmDomain,terms:EvmTerms,role:'seller'|'buyer',signal?:AbortSignal):Promise<CoreResult<Uint8Array<ArrayBuffer>>>;subscribe(listener:()=>void):()=>void;dispose():void;}
export interface IdentityService {create(session:VaultSession,signal?:AbortSignal):Promise<IdentityResult<CreatedIdentity>>;unlock(session:VaultSession,recordId:string,signal?:AbortSignal):Promise<IdentityResult<IdentityHandle>>;publicIdentity(handle:IdentityHandle):Promise<IdentityResult<string>>;dispose():void;}
export interface BlockRef {readonly number:string;readonly hash:string;}
export interface ReceiptView {readonly transactionHash:string;readonly blockNumber:string;readonly blockHash:string;readonly status:'success'|'reverted';}
export interface TransactionView {readonly hash:string;readonly from:string;readonly to:string|null;readonly nonce:string;readonly input:string;readonly value:string;readonly blockNumber:string|null;}
export interface ChainReader {chainId(signal:AbortSignal):Promise<CoreResult<string>>;transactionCount(account:string,tag:'latest'|'pending',signal:AbortSignal):Promise<CoreResult<string>>;escrowState(binding:TradeBinding,height:string,signal:AbortSignal):Promise<CoreResult<ChainObservation['state']>>;escrowObservation(binding:TradeBinding,request:{signal:AbortSignal;generation:number;requestSequence:number}):Promise<CoreResult<ChainObservation>>;head(tag:'latest'|'finalized',signal:AbortSignal):Promise<CoreResult<BlockRef|null>>;blockHashAt(number:string,signal:AbortSignal):Promise<CoreResult<string|null>>;transaction(hash:string,signal:AbortSignal):Promise<CoreResult<TransactionView|null>>;receipt(hash:string,signal:AbortSignal):Promise<CoreResult<ReceiptView|null>>;}
export interface PreparedRequest {readonly v:1;readonly chainId:string;readonly from:string;readonly to:string;readonly data:string;readonly value:string;readonly nonce:string;readonly preparedAtBlock:string;}
export interface EscrowCall {readonly to:string;readonly data:string;readonly value:string;}
export interface TokenCheck {readonly token:string;readonly spender:string;readonly principal:string;readonly balance:string;readonly allowance:string;readonly anchor:{readonly height:string;readonly hash:string};}
export interface ActionFee {readonly action:IntentV1['action'];readonly transactionHash:string;readonly fee:string;readonly nativeAssetId:string;readonly nativeDecimals:number;}
export interface AssetChoice {readonly id:string;readonly kind:'native'|'erc20';readonly decimals:number;}
export type SigningAction='accept'|'accept-recovered'|'approve'|'reset-approval'|'fund'|'release'|'refund';
export interface JourneyPrivacyServices {
 readonly transport:PrivacyTransportPort;
 readonly endpoints:PrivacyEndpointPort;
 subscribeInvalidation(listener:()=>void):()=>void;
}
export interface SigningReview {
 readonly version:1;readonly action:SigningAction;readonly profileId:string;readonly scopeGeneration:number;
 readonly observedAt:number;readonly expiresAt:number;readonly clockOrigin:number;readonly networkId:string;readonly chainId:string;readonly deploymentId:string;
 readonly escrow:string;readonly termsHash:string;readonly destination:string;readonly spender:string|null;readonly value:string;readonly amount:string;
 readonly wallets:readonly {readonly role:'seller'|'buyer';readonly providerId:string;readonly account:string;readonly networkId:string;readonly generation:number}[];
 readonly extensions:readonly {readonly id:string;readonly version:string;readonly policyHash:string}[];
 readonly privacy:PrivacyView;
}
export type EscrowAction={readonly action:'approve';readonly token:string;readonly spender:string;readonly amountBaseUnits:string}|{readonly action:'fund';readonly domain:EvmDomain;readonly terms:EvmTerms}|{readonly action:'release'|'refund';readonly escrow:string;readonly tradeId:string};
export interface PrepareInput {readonly binding:TradeBinding;readonly action:IntentV1['action'];readonly expectedEscrowState:'absent'|'funded';readonly call:EscrowCall;}
export interface PreparedIntent {readonly intentId:string;readonly request:PreparedRequest;readonly generation:number;}
export interface Reconciliation {readonly outcome:'prepared'|'pending'|'confirmed'|'finalized'|'replaced'|'dropped'|'reverted'|'reorged';readonly intent:IntentV1;readonly escrowState:ChainObservation['state']|null;readonly evidence:'none'|'receipt'|'nonce'|'escrow-effect'|'authority-conflict';}
export interface NativeIntentObservation {readonly binding:TradeBinding;readonly account:string;readonly action:IntentV1['action'];readonly state:'broadcast-unknown'|'pending'|'confirmed'|'finalized'|'failed'|'reorged'|'replaced';readonly hash:string|null;readonly nonce:string|null;readonly replacementHash:string|null;readonly anchor:{readonly height:string;readonly hash:string};readonly canonical:boolean;readonly finalized:boolean;}
export interface Journal {reserve(intent:IntentV1,revision:number,signal?:AbortSignal):Promise<CoreResult<string>>;markSending(id:string,signal?:AbortSignal):Promise<CoreResult<void>>;recordBroadcast(id:string,hash:string,signal?:AbortSignal):Promise<CoreResult<void>>;isTerminalVerified(id:string):boolean;revokeTerminalVerification(id:string):void;authorizeTerminal(id:string,transition:{state:IntentV1['state'];hash:string|null},signal?:AbortSignal):Promise<CoreResult<void>>;observe(id:string,transition:{state:IntentV1['state'];hash:string|null},signal?:AbortSignal):Promise<CoreResult<IntentV1>>;currentRevision():number|null;reconcileNative(id:string,signal?:AbortSignal):Promise<CoreResult<IntentV1>>;list(signal?:AbortSignal):Promise<CoreResult<readonly IntentV1[]>>;unresolved(binding:TradeBinding,account:string,signal?:AbortSignal):Promise<CoreResult<readonly IntentV1[]>>;dispose():void;}
export interface Lifecycle {walletChanged(next:{account:string;chainId:string;generation:number}|null):Promise<void>;prepare(input:PrepareInput,signal?:AbortSignal):Promise<CoreResult<PreparedIntent>>;submit(prepared:PreparedIntent,signal?:AbortSignal):Promise<CoreResult<{intent:IntentV1;hash:string}>>;reconcile(id:string,signal?:AbortSignal):Promise<CoreResult<Reconciliation>>;recover(signal?:AbortSignal):Promise<CoreResult<readonly IntentV1[]>>;dispose():void;}
export interface Authority {readonly currentGeneration:number;readView(now:number):Readonly<TradeView>;refresh(binding:TradeBinding,signal?:AbortSignal):Promise<CoreResult<ChainObservation>>;dispose():void;}
export type TradeComposition=Parameters<typeof createJourneyProjection>[0]['composition']&{dispose():void};
/** Native G18 result as this journey reads it. remainingSeconds is the actual escrow deadline minus the latest
 * anchored chain time and may be zero or negative. The 900-second guidance buffer is not a release deadline. */
export type PaymentGuidanceObservation=JourneyPaymentGuidanceObservation&{readonly remainingSeconds:string};
export interface PaymentGuidance {
 read(signal?:AbortSignal):Promise<CoreResult<PaymentGuidanceObservation>>;
 view():CoreResult<PaymentGuidanceObservation>;
 invalidate():void;
 dispose():void;
}
export interface ReadObservationInput {readonly registry:RegistryService;readonly binding:TradeBinding;readonly terms:EvmTerms;readonly domain:EvmDomain;readonly request:Request;readonly generation:number;readonly requestSequence:number;readonly signal?:AbortSignal;}
export interface NativeFactories {
 readonly MessagingIdentityService:new(vault:EncryptedVaultService,options:{provider:MessagingIdentityProvider;lifecycle:false})=>IdentityService;
 createIdentityProvider():MessagingIdentityProvider;
 readonly EvmWalletAdapter:new(provider:WalletProvider,providerId:string,registry:RegistryService)=>WalletAdapter;
 walletProvider(index:number):WalletProvider;
 selectorOf(signature:string):string;
 /** Decodes one log emitted by the registry-bound escrow; any other emitter or malformed log throws. */
 decodeEscrowLog(escrow:string,log:EscrowLog):EscrowLogEvent;
 buildPendingWithdrawals(escrow:string,recipient:string,token:string):EscrowCall;
 buildWithdraw(escrow:string,recipient:string,token:string):EscrowCall;
 evmTermsHash(domain:EvmDomain,terms:EvmTerms):string;
 escrowCallFor(action:EscrowAction):{readonly call:EscrowCall;readonly expectedEscrowState:'absent'|'funded'};
 decodeIntentPayload(payload:string):IntentV1;
 readObservation(input:ReadObservationInput):Promise<CoreResult<ChainObservation>>;
 verifyEvmAgreementBundle(input:{readonly privateAgreement:PrivateAgreementV1;readonly domain:EvmDomain;readonly terms:EvmTerms;readonly acceptances:readonly {readonly termsHash:string;readonly role:'seller'|'buyer';readonly walletAccount:string;readonly signature:Uint8Array<ArrayBuffer>}[]},context:{readonly isCurrent:()=>boolean}):Promise<CoreResult<{readonly termsHash:string}>>;
 createEip1193ChainReader(options:{request:Request;escrow:string}):ChainReader;
 createLifecycleJournal(options:{vault:EncryptedVaultService;session:VaultSession;validateCanonical:(intent:Readonly<IntentV1>)=>Promise<CoreResult<void>>;readNative:(intent:Readonly<IntentV1>,signal:AbortSignal)=>Promise<CoreResult<NativeIntentObservation>>}):Journal;
 createEvmTxLifecycle(options:{journal:Journal;reader:ChainReader;wallet:Request;policy:{readonly finality:{readonly kind:'evm-finalized-tag'};readonly confirmations:number;readonly dropAfterBlocks:number}}):Lifecycle;
 readonly policy:{readonly finality:{readonly kind:'evm-finalized-tag'};readonly confirmations:number;readonly dropAfterBlocks:number};
 createEvmPaymentPreflight(options:{registry:RegistryService;binding:TradeBinding;terms:EvmTerms;request:Request}):CoreResult<PaymentGuidance>;
 createTradeAuthority(options:{binding:TradeBinding;generation:number;walletGeneration:number;readValidated:(binding:TradeBinding,request:{signal:AbortSignal;generation:number;requestSequence:number})=>Promise<CoreResult<ChainObservation>>}):Authority;
 createTradeComposition(options:{binding:TradeBinding;account:string;authority:Authority;journal:Journal}):TradeComposition;
}
export interface JourneyOptions {readonly onInvalidated?:((snapshot:JourneySnapshot)=>void)|undefined;readonly onSigningReviewInvalidated?:((snapshot:JourneySnapshot)=>void)|undefined;readonly privacy?:JourneyPrivacyServices|undefined;readonly services:{vault:EncryptedVaultService;backup:EncryptedBackupService;readonly transportPolicy?:WorkerTransportPolicy};readonly native:NativeFactories;readonly registryBytes:Uint8Array<ArrayBuffer>;readonly registryDigest:string;readonly request:Request;readonly createRelay:(options:{verifier:Awaited<ReturnType<typeof createRelayEventCrypto>>;nowSeconds:()=>number})=>RelayPool;readonly localPeerAcceptance?:((options:{wallet:WalletAdapter;session:WalletSession;domain:EvmDomain;terms:EvmTerms})=>Promise<Uint8Array<ArrayBuffer>>)|undefined;}
export interface WatchParty {readonly kind:'watch';readonly wallet:WalletAdapter;readonly walletSession:WalletSession;}
export interface NegotiatingParty {readonly kind:'negotiation';readonly wallet:WalletAdapter;readonly walletSession:WalletSession;readonly pub:string;readonly secret:Uint8Array;readonly eventCrypto:Awaited<ReturnType<typeof createRelayEventCrypto>>;readonly book:ReturnType<typeof createOrderBook>;readonly exchange:ReturnType<typeof createTermsExchange>;readonly pool:RelayPool;}
export type Party=WatchParty|NegotiatingParty;
export type Phase=
 |'setup'
 |'wallet'
 |'delivery-pending'
 |'review'
 |'accepted'
 |'fund-prepared'
 |'approval-reconcile'
 |'recovered-acceptance-required'
 |'reconcile'
 |'payment-coordination'
 |'payment-guidance-closed'
 |'payment-guidance-unavailable'
 |'settling'
 |'receipt'
 |'cancelled-before-send';
/** One raw receipt log, as eth_getTransactionReceipt returns it. */
export interface EscrowLog {readonly address:string;readonly topics:readonly string[];readonly data:string;}
/** Escrow events this journey reads from a finalized settlement receipt (BasicEscrow event fields, lowercase). */
export type EscrowLogEvent=
 |{readonly kind:'Released';readonly tradeId:string;readonly buyer:string;readonly token:string;readonly amount:string}
 |{readonly kind:'Refunded';readonly tradeId:string;readonly seller:string;readonly caller:string;
   readonly token:string;readonly amount:string}
 |{readonly kind:'PayoutDeferred';readonly tradeId:string;readonly recipient:string;
   readonly token:string;readonly amount:string}
 |{readonly kind:'Funded'|'Withdrawn'};
/** Asset delivery after a terminal escrow state. 'pushed': the escrow's own push succeeded in this receipt (no
 * PayoutDeferred). 'credited': the push failed and the amount is owed via withdraw(recipient, token); it has not
 * arrived. creditOutstanding is the aggregate pendingWithdrawals at the finalized height and may include other
 * trades. */
export type PayoutStatus=
 |{readonly status:'pushed';readonly recipient:string;readonly token:string;readonly amount:string}
 |{readonly status:'credited';readonly recipient:string;readonly token:string;readonly amount:string;
   readonly creditOutstanding:string;readonly creditObservedAtHeight:string;readonly withdraw:EscrowCall};
export interface NativeFeeReceipt {
 readonly tradeId:string;
 readonly transactionHash:string;
 readonly state:'released'|'refunded';
 readonly blockNumber:string;
 readonly gasUsed:string;
 readonly effectiveGasPrice:string;
 readonly fee:string;
 readonly nativeAssetId:string;
 readonly nativeDecimals:number;
 readonly payout:PayoutStatus;
}
export interface TermsDisplay extends EvmTerms {readonly assetId:string;readonly decimals:number;readonly chainId:string;readonly escrowAddress:string;}
export interface JourneySnapshot {readonly label:'LOCALPROOF';readonly tradingEnabled:false;readonly productionBlocker:string;readonly phase:Phase;readonly profileId:string|null;readonly backupRevision:number|null;readonly account:string|null;readonly terms:TermsDisplay|null;readonly manualPayment:{readonly currency:string;readonly minorUnits:string;readonly scale:number;readonly instructions:string}|null;readonly tradeId:string|null;readonly intentId:string|null;readonly receipt:NativeFeeReceipt|null;readonly assets:readonly AssetChoice[];readonly tokenCheck:TokenCheck|null;readonly fees:readonly ActionFee[];readonly signingReview:SigningReview|null;readonly paymentGuidance:ReturnType<PaymentGuidance['view']>|null;readonly submissionsThisWorker:number;}
export interface JourneyController {snapshot():JourneySnapshot;runtime(input:JourneyRuntimeInput):Promise<RuntimeResponse>;act(action:string,options?:{readonly signingAction?:SigningAction|undefined;readonly assetId?:string|undefined;readonly amountBaseUnits?:string|undefined;readonly recordId?:string|undefined;readonly attestFiatReceived?:boolean|undefined;readonly reviewRiskAccepted?:boolean|undefined}):Promise<JourneySnapshot>;dispose():void;}
export type {ReviewedEvmTerms};
