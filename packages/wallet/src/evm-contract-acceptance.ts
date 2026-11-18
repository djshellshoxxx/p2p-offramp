/** Explicit local EIP-1271 read verification, never an EOA fallback or durable acceptance authority. */
import {createCoreError,createOperationId,type CoreResult,type CoreErrorCode,type RegistryService} from '../../domain/index.ts';
import {intentData} from '../../schemas/index.ts';
import {snapshotEvmDomain,snapshotEvmTerms,evmTermsHash,keccak256,type EvmDomainInput,type EvmTermsInput} from './evm-terms.ts';
import type {Eip1193Request} from './evm-submit.ts';
export const CONTRACT_ACCEPTANCE_LIMITS=Object.freeze({signatureBytes:4096,runtimeBytes:24576,gas:100000,pending:2,timeoutMs:10000});
export interface ContractAcceptanceScope {readonly account:string;readonly generation:number;}
export interface ContractAcceptanceInput {readonly domain:EvmDomainInput;readonly terms:EvmTermsInput;readonly role:'seller'|'buyer';readonly walletAccount:string;readonly signature:Uint8Array;readonly sessionGeneration:number;}
export interface ContractAcceptanceObservation {
 readonly testOnly:true;readonly economicPreparationAllowed:false;readonly evidence:'native-eip1271';readonly termsHash:string;
 readonly role:'seller'|'buyer';readonly account:string;readonly sessionGeneration:number;readonly chainId:string;
 readonly anchor:Readonly<{height:string;hash:string}>;readonly walletCodeKeccak256:string;
}
export interface ContractAcceptanceOptions {readonly registry:Pick<RegistryService,'network'|'deployment'>;readonly request:Eip1193Request;readonly isCurrent:(scope:ContractAcceptanceScope)=>boolean;readonly monotonicNow?:()=>number;readonly timeoutMs?:number;}
const abortedGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const addListener=EventTarget.prototype.addEventListener,removeListener=EventTarget.prototype.removeEventListener;
const HASH=/^0x[0-9a-f]{64}$/,ADDRESS=/^0x[0-9a-f]{40}$/,ZERO='0x'+'0'.repeat(40);
const errors=new WeakMap<object,CoreErrorCode>();
class Refusal extends Error {constructor(code:CoreErrorCode){super('Contract acceptance unavailable.');errors.set(this,code);}}
const stop=(code:CoreErrorCode):never=>{throw new Refusal(code);};
const field=(value:unknown,key:string):unknown=>{try{if(typeof value!=='object'||value===null)return stop('INTEGRITY_FAILURE');const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value'in d))return stop('INTEGRITY_FAILURE');return d.value;}catch{return stop('INTEGRITY_FAILURE');}};
const hash=(value:unknown):string=>typeof value==='string'&&HASH.test(value)?value:stop('INTEGRITY_FAILURE');
const quantity=(value:unknown):bigint=>typeof value==='string'&&value.length<=66&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)?BigInt(value):stop('INTEGRITY_FAILURE');
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function code(value:unknown):string {if(typeof value!=='string'||value.length>2+CONTRACT_ACCEPTANCE_LIMITS.runtimeBytes*2||!/^0x(?:[0-9a-f]{2})+$/.test(value))return stop('UNSUPPORTED_PROVIDER');return value;}
const codeHash=(value:string)=>hex(keccak256(Uint8Array.from(value.slice(2).match(/../g)!,v=>parseInt(v,16))));
const header=(raw:unknown)=>Object.freeze({height:quantity(field(raw,'number')).toString(),hash:hash(field(raw,'hash')),timestamp:quantity(field(raw,'timestamp')).toString()});
/** Each call revalidates current state. Proxy code identity cannot freeze its mutable signing policy.
 * Request results are bounded after allocation by the injected provider; this is not a streaming transport cap.
 */
export function createContractAcceptanceVerifier(options:ContractAcceptanceOptions){
 const request=options.request,registry=options.registry,isCurrent=options.isCurrent,clock=options.monotonicNow??(()=>performance.now()),timeout=options.timeoutMs??CONTRACT_ACCEPTANCE_LIMITS.timeoutMs;
 if(typeof request!=='function'||typeof isCurrent!=='function'||!Number.isSafeInteger(timeout)||timeout<1||timeout>30000)throw Error('Invalid contract acceptance configuration.');
 const jobs=new Set<AbortController>();let disposed=false;
 return Object.freeze({
  async verify(input:ContractAcceptanceInput,signal?:AbortSignal):Promise<CoreResult<Readonly<ContractAcceptanceObservation>>>{
   const failure=(c:CoreErrorCode):CoreResult<never>=>({ok:false,error:createCoreError(c,{operationId:createOperationId(),readOnly:true})});
   let signalAborted=false;try{if(signal!==undefined)signalAborted=abortedGetter.call(signal);}catch{return failure('INVALID_INPUT');}
   if(disposed||signalAborted)return failure('CANCELLED');if(jobs.size>=CONTRACT_ACCEPTANCE_LIMITS.pending)return failure('LIMIT_EXCEEDED');
   let signature:Uint8Array;let domain:Readonly<EvmDomainInput>,terms:Readonly<EvmTermsInput>,scope:Readonly<ContractAcceptanceScope>,role:'seller'|'buyer',digest:string;
   try{
    const raw=intentData(input,['domain','terms','role','walletAccount','signature','sessionGeneration']);domain=snapshotEvmDomain(raw.domain as EvmDomainInput);terms=snapshotEvmTerms(raw.terms as EvmTermsInput);
    if(raw.role!=='seller'&&raw.role!=='buyer')return failure('INVALID_INPUT');role=raw.role;
    if(typeof raw.walletAccount!=='string'||!ADDRESS.test(raw.walletAccount)||raw.walletAccount===ZERO||raw.walletAccount!==terms[role]||!Number.isSafeInteger(raw.sessionGeneration)||(raw.sessionGeneration as number)<0)return failure('INVALID_INPUT');
    scope=Object.freeze({account:raw.walletAccount,generation:raw.sessionGeneration as number});
    const size=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength')!.get!.call(raw.signature) as number;
    if(!(raw.signature instanceof Uint8Array)||size<1||size>CONTRACT_ACCEPTANCE_LIMITS.signatureBytes)return failure('LIMIT_EXCEEDED');
    digest=evmTermsHash(domain,terms);signature=new Uint8Array(size);Uint8Array.prototype.set.call(signature,raw.signature);
   }catch{return failure('INVALID_INPUT');}
   if(disposed||jobs.size>=CONTRACT_ACCEPTANCE_LIMITS.pending){signature.fill(0);return failure(disposed?'CANCELLED':'LIMIT_EXCEEDED');}
   const controller=new AbortController();jobs.add(controller);let reason:CoreErrorCode='CANCELLED',started:number;
   const onAbort=()=>controller.abort();try{if(signal!==undefined){addListener.call(signal,'abort',onAbort,{once:true});if(abortedGetter.call(signal))onAbort();}}catch{signature.fill(0);jobs.delete(controller);return failure('INVALID_INPUT');}
   const timer=setTimeout(()=>{reason='TIMEOUT';controller.abort();},timeout);
   const guard=()=>{if(disposed||controller.signal.aborted)return stop(reason);const now=clock();if(!Number.isFinite(now)||now<started)return stop('UNAVAILABLE');if(now-started>=timeout)return stop('TIMEOUT');if(!isCurrent(scope))return stop('LOCKED');if(disposed||controller.signal.aborted)return stop(reason);};
   const call=async(method:string,params:readonly unknown[]=[])=>{guard();const result=await request({method,params});guard();return result;};
   const work=async():Promise<CoreResult<Readonly<ContractAcceptanceObservation>>>=>{
    try{
     started=clock();if(!Number.isFinite(started)||started<0)return failure('UNAVAILABLE');guard();
     const network=registry.network(terms.networkId),deployment=registry.deployment(terms.networkId,terms.deploymentId);
     if(!network||!deployment||network.chain!=='evm'||deployment.runtime.kind!=='evm-code'||deployment.runtime.upgradeable!==false||deployment.protocolVersion!==1)return failure('UNSUPPORTED_PROVIDER');
     if(network.chainIdentity!==domain.chainId||deployment.address!==domain.verifyingContract)return failure('WRONG_CHAIN');
     if(quantity(await call('eth_chainId')).toString()!==domain.chainId)return failure('WRONG_CHAIN');
     const genesis=header(await call('eth_getBlockByNumber',['0x0',false]));if(genesis.height!=='0'||genesis.hash!==network.genesisHash)return failure('WRONG_CHAIN');
     const anchor=header(await call('eth_getBlockByNumber',['latest',false])),tag='0x'+BigInt(anchor.height).toString(16);
     if(codeHash(code(await call('eth_getCode',[deployment.address,tag])))!==deployment.runtime.keccak256)return failure('INTEGRITY_FAILURE');
     const walletCode=code(await call('eth_getCode',[scope.account,tag]));
     const data='0x1626ba7e'+digest+'40'.padStart(64,'0')+signature.length.toString(16).padStart(64,'0')+hex(signature).padEnd(Math.ceil(signature.length/32)*64,'0');
     const returned=await call('eth_call',[{to:scope.account,data,gas:'0x186a0'},tag]);
     if(typeof returned!=='string'||returned.length!==66||returned!=='0x1626ba7e'+'0'.repeat(56))return failure('UNAUTHORIZED');
     if(code(await call('eth_getCode',[scope.account,tag]))!==walletCode)return failure('INTEGRITY_FAILURE');
     const repeated=header(await call('eth_getBlockByNumber',[tag,false]));if(JSON.stringify(repeated)!==JSON.stringify(anchor))return failure('INTEGRITY_FAILURE');
     if(quantity(await call('eth_chainId')).toString()!==domain.chainId)return failure('WRONG_CHAIN');
     const finalGenesis=header(await call('eth_getBlockByNumber',['0x0',false]));if(JSON.stringify(genesis)!==JSON.stringify(finalGenesis))return failure('WRONG_CHAIN');
     if(registry.network(terms.networkId)!==network||registry.deployment(terms.networkId,terms.deploymentId)!==deployment)return failure('CONFLICT');guard();
     return{ok:true,value:Object.freeze({testOnly:true,economicPreparationAllowed:false,evidence:'native-eip1271',termsHash:digest,role,account:scope.account,sessionGeneration:scope.generation,chainId:domain.chainId,anchor:Object.freeze({height:anchor.height,hash:anchor.hash}),walletCodeKeccak256:codeHash(walletCode)})};
    }catch(error){return failure(typeof error==='object'&&error!==null?errors.get(error)??'UNAVAILABLE':'UNAVAILABLE');}
    finally{signature.fill(0);jobs.delete(controller);clearTimeout(timer);if(signal!==undefined)removeListener.call(signal,'abort',onAbort);}
   };
   let abortListener:()=>void=()=>{};const cancelled=new Promise<CoreResult<never>>(resolve=>{abortListener=()=>{signature.fill(0);resolve(failure(reason));};controller.signal.addEventListener('abort',abortListener,{once:true});if(controller.signal.aborted)abortListener();});
   try{return await Promise.race([work(),cancelled]);}finally{controller.signal.removeEventListener('abort',abortListener);}
  },
  dispose(){disposed=true;for(const controller of jobs)controller.abort();},
 });
}
