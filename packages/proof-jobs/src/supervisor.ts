/** Internal public-data conformance runner. This is not a FiatProofProvider or verifier. */
import {parseTradeBinding,type CoreErrorCode,type CoreResult,type TradeBinding} from '../../schemas/index.ts';
import {parseBudget,type ResourceBudget} from './budget.ts';
import {checked,counter,digest,errorCode,failed,record,stop,succeeded,value} from './data.ts';
import {copyJobBytes,parseWorkerReply,PUBLIC_RESOURCE_PROFILE,type ProofWorkerCommand,type ProofWorkerReply} from './protocol.ts';
import {encodeBase64url} from '../../schemas/index.ts';

export interface ResourceScope {
  readonly binding:TradeBinding;readonly termsHash:string;readonly policyHash:string;readonly generation:number;
}
export interface ResourceOwner {
  current(scope:Readonly<ResourceScope>):boolean;
  subscribeRevocation(listener:()=>void):()=>void;
}
export interface ResourceWorkerPort {
  postMessage(command:ProofWorkerCommand,transfer:readonly ArrayBuffer[]):void;
  subscribe(handlers:{message(input:unknown):void;error():void;messageError():void}):()=>void;
  /** Resolves only after physical exit. A termination request or imported receipt is not completion. */
  terminate():Promise<void>;
}
export interface ResourceTimers {
  set(callback:()=>void,delay:number):ReturnType<typeof setTimeout>;
  clear(handle:ReturnType<typeof setTimeout>):void;
}
export interface ResourceOptions {
  readonly createWorker:()=>ResourceWorkerPort;readonly owner:ResourceOwner;
  readonly clock?:()=>number;readonly timers?:ResourceTimers;readonly entropy?:(length:number)=>Uint8Array;
  readonly limits?:Partial<ResourceBudget>;
}
export interface ResourceOutput {
  readonly kind:'unverified-resource-output';readonly jobId:string;readonly generation:number;
  readonly bytes:Uint8Array<ArrayBuffer>;readonly proofVerified:false;readonly receiptAuthority:false;
  readonly economicPreparationAllowed:false;
}
export interface ResourceRunner {
  consent(scope:unknown):CoreResult<object>;
  run(consent:unknown,collectPublicInput:(signal:AbortSignal)=>Promise<Uint8Array>,signal?:AbortSignal):Promise<CoreResult<ResourceOutput>>;
  cancel():void;resume():void;dispose():Promise<void>;
}
interface Consent {readonly token:object;readonly scope:Readonly<ResourceScope>;readonly jobId:string;readonly challenge:string;}
type TimerHandle=ReturnType<typeof setTimeout>;
interface Job {
  readonly consent:Consent;readonly controller:AbortController;
  readonly result:Promise<CoreResult<ResourceOutput>>;readonly resolve:(result:CoreResult<ResourceOutput>)=>void;
  readonly drain:Promise<void>;readonly finishDrain:()=>void;
  retired:boolean;resolved:boolean;executionDone:boolean;terminationStarted:boolean;terminationDone:boolean;drained:boolean;
  worker:ResourceWorkerPort|undefined;input:Uint8Array<ArrayBuffer>|undefined;phase:'collecting'|'initializing'|'running';
  started:number|undefined;lastTime:number|undefined;heartbeat:number|undefined;messages:number;
  wallTimer:TimerHandle|undefined;heartbeatTimer:TimerHandle|undefined;
  offOwner:(()=>void)|undefined;offWorker:(()=>void)|undefined;offExternal:(()=>void)|undefined;
}
// The package is optional and document-local. Separate facades cannot create another active job.
let tabLease:Job|undefined;
const nativeFill=Uint8Array.prototype.fill;
const typed=Object.getPrototypeOf(Uint8Array.prototype) as object;
const nativeLength=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!;
const nativeAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const nativeAdd=EventTarget.prototype.addEventListener,nativeRemove=EventTarget.prototype.removeEventListener;
const nativeThen=Promise.prototype.then;

function wipe(bytes:Uint8Array|undefined):void{try{if(bytes)Reflect.apply(nativeFill,bytes,[0]);}catch{/* A transferred buffer is already detached. */}}
/** Only bounded accepted collector/event buffers are owned by this runner. */
function discard(input:unknown,maximum:number):void{
  try{if(typeof input==='object'&&input!==null&&Object.getPrototypeOf(input)===Uint8Array.prototype&&
    Reflect.apply(nativeLength,input,[])<=maximum)Reflect.apply(nativeFill,input,[0]);}catch{/* No foreign accessor or detached buffer escapes cleanup. */}
}
function parsedScope(input:unknown):Readonly<ResourceScope>{
  const raw=record(input,['binding','termsHash','policyHash','generation']);
  return Object.freeze({binding:parseTradeBinding(raw.binding),termsHash:digest(raw.termsHash),policyHash:digest(raw.policyHash),generation:counter(raw.generation)});
}
const safe=(callback:(()=>void)|undefined):void=>{try{callback?.();}catch{/* Continue every remaining cleanup. */}};
/** Calls work and reports a synchronous throw as failure; any returned promise is left to the caller. */
const capture=<T>(work:()=>T):{readonly ok:true;readonly value:T}|{readonly ok:false}=>{try{return{ok:true,value:work()};}catch{return{ok:false};}};

export function createPublicResourceRunner(options:ResourceOptions):CoreResult<ResourceRunner>{
  return checked(()=>{
    const raw=record(options,['createWorker','owner'],['clock','timers','entropy','limits']);
    const ownerRaw=record(raw.owner,['current','subscribeRevocation']);
    if(typeof raw.createWorker!=='function'||typeof ownerRaw.current!=='function'||typeof ownerRaw.subscribeRevocation!=='function')return stop();
    if(raw.clock!==undefined&&typeof raw.clock!=='function'||raw.entropy!==undefined&&typeof raw.entropy!=='function')return stop();
    const ownerObject=raw.owner,currentPort=ownerRaw.current as ResourceOwner['current'],revocationPort=ownerRaw.subscribeRevocation as ResourceOwner['subscribeRevocation'];
    const owner:ResourceOwner={current:scope=>Reflect.apply(currentPort,ownerObject,[scope]),subscribeRevocation:listener=>Reflect.apply(revocationPort,ownerObject,[listener])};
    const createWorker=raw.createWorker as ResourceOptions['createWorker'];
    const clock=(raw.clock as ResourceOptions['clock'])??(()=>performance.now());
    const entropy=(raw.entropy as ResourceOptions['entropy'])??((length:number)=>crypto.getRandomValues(new Uint8Array(length)));
    let timers:ResourceTimers={set:(callback,delay)=>setTimeout(callback,delay),clear:handle=>clearTimeout(handle)};
    if(raw.timers!==undefined){const port=record(raw.timers,['set','clear']);if(typeof port.set!=='function'||typeof port.clear!=='function')return stop();
      const target=raw.timers,set=port.set as ResourceTimers['set'],clear=port.clear as ResourceTimers['clear'];
      timers={set:(callback,delay)=>Reflect.apply(set,target,[callback,delay]),clear:handle=>Reflect.apply(clear,target,[handle])};}
    const budget=value(parseBudget(raw.limits));
    let closed=false,consenting=false,consentAttempt:object|undefined,consent:Consent|undefined,active:Job|undefined;
    let lastDrain=Promise.resolve(),previousId:string|undefined,previousChallenge:string|undefined;

    const ownerCurrent=(scope:Readonly<ResourceScope>):boolean=>{try{return !closed&&owner.current(scope)===true;}catch{return false;}};
    const randomId=():string=>{
      const generated=entropy(32),copy=value(copyJobBytes(generated,32));
      try{if(copy.length!==32)return stop('UNAVAILABLE');return encodeBase64url(copy);}finally{wipe(copy);discard(generated,32);}
    };
    const release=(job:Job):void=>{
      if(job.drained||!job.retired||!job.executionDone||!job.terminationDone)return;
      job.drained=true;if(tabLease===job)tabLease=undefined;if(active===job)active=undefined;job.finishDrain();
    };
    const terminate=(job:Job,cooperative:boolean):void=>{
      if(!job.worker||job.terminationStarted)return;
      job.terminationStarted=true;job.terminationDone=false;
      if(cooperative){try{job.worker.postMessage({v:1,kind:'cancel',jobId:job.consent.jobId,generation:job.consent.scope.generation},[]);}catch{/* Native termination still follows. */}}
      const worker=job.worker;
      // Unknown physical fate cannot release this tab's admission. Native terminate is parameterless.
      const started=capture(():unknown=>worker.terminate());
      if(!started.ok)return;
      const ending=started.value;
      // Require a real completion Promise, not void or a thenable claiming the request succeeded.
      // Unknown or malformed completion (the native then throws) cannot release physical admission.
      safe(()=>{
        Reflect.apply(nativeThen,ending,[(completion:unknown)=>{
          if(completion!==undefined)return;
          job.terminationDone=true;release(job);
        },()=>{/* Rejected termination stays unavailable until document teardown. */}]);
      });
    };
    const clearTimers=(job:Job):void=>{
      const wall=job.wallTimer,heartbeat=job.heartbeatTimer;job.wallTimer=job.heartbeatTimer=undefined;
      if(wall!==undefined)safe(()=>timers.clear(wall));if(heartbeat!==undefined)safe(()=>timers.clear(heartbeat));
    };
    const retire=(job:Job,result:CoreResult<ResourceOutput>):void=>{
      if(job.retired)return;job.retired=true;wipe(job.input);job.input=undefined;clearTimers(job);
      const offOwner=job.offOwner,offWorker=job.offWorker,offExternal=job.offExternal;job.offOwner=job.offWorker=job.offExternal=undefined;
      safe(offOwner);safe(offWorker);safe(offExternal);job.controller.abort();terminate(job,!result.ok);
      if(!job.resolved){job.resolved=true;job.resolve(result);}release(job);
    };
    const cancel=(job:Job,code:CoreErrorCode='CANCELLED'):void=>retire(job,failed(code));
    const now=(job:Job):number=>{
      if(job.retired)return stop('CANCELLED');
      let time:unknown;try{time=clock();}catch{return stop('CANCELLED');}
      if(job.retired||typeof time!=='number'||!Number.isFinite(time)||time<0||time>Number.MAX_SAFE_INTEGER||job.lastTime!==undefined&&time<job.lastTime)return stop('CANCELLED');
      job.lastTime=time;return time;
    };
    const guard=(job:Job):number=>{
      if(job.retired)return stop('CANCELLED');
      if(!ownerCurrent(job.consent.scope)||job.retired)return stop('LOCKED');
      const time=now(job);
      if(job.started!==undefined&&time-job.started>=budget.wallTimeMs||job.heartbeat!==undefined&&time-job.heartbeat>=budget.heartbeatMs)return stop('CANCELLED');
      return time;
    };
    const arm=(job:Job,kind:'wall'|'heartbeat',delay:number):void=>{
      const field=kind==='wall'?'wallTimer':'heartbeatTimer',previous=job[field];
      if(previous!==undefined)safe(()=>timers.clear(previous));job[field]=undefined;
      const handle=timers.set(()=>{
        job[field]=undefined;if(job.retired)return;
        try{const time=guard(job),base=kind==='wall'?job.started:job.heartbeat,limit=kind==='wall'?budget.wallTimeMs:budget.heartbeatMs;
          if(base===undefined||time-base>=limit){cancel(job);return;}arm(job,kind,Math.max(1,limit-(time-base)));
        }catch(error){cancel(job,errorCode(error,'CANCELLED'));}
      },Math.max(1,delay));
      if(job.retired)safe(()=>timers.clear(handle));else job[field]=handle;
    };
    const heartbeat=(job:Job,time:number):void=>{job.heartbeat=time;arm(job,'heartbeat',budget.heartbeatMs);};
    const send=(job:Job,command:ProofWorkerCommand,transfer:readonly ArrayBuffer[]=[]):void=>{
      guard(job);if(!job.worker)return stop('UNAVAILABLE');job.worker.postMessage(command,transfer);guard(job);
    };
    const receive=(job:Job,input:unknown):void=>{
      let parsed:ProofWorkerReply|undefined,handedOff=false;
      try{
        if(job.retired)return;
        if(++job.messages>budget.maxMessages)return cancel(job,'LIMIT_EXCEEDED');
        guard(job);const result=parseWorkerReply(input,budget.maxProofBytes);
        if(!result.ok)return cancel(job,result.error.code==='LIMIT_EXCEEDED'?'LIMIT_EXCEEDED':'INTEGRITY_FAILURE');
        parsed=result.value;
        if(parsed.jobId!==job.consent.jobId||parsed.generation!==job.consent.scope.generation)return cancel(job,'INTEGRITY_FAILURE');
        if(parsed.kind==='ready'){
          if(job.phase!=='initializing'||!job.input)return cancel(job,'INTEGRITY_FAILURE');
          const time=guard(job);job.phase='running';heartbeat(job,time);const bytes=job.input;
          send(job,{v:1,kind:'prove',jobId:parsed.jobId,generation:parsed.generation,input:bytes},[bytes.buffer]);
          wipe(bytes);job.input=undefined;
        }else if(parsed.kind==='progress'){
          if(job.phase!=='running')return cancel(job,'INTEGRITY_FAILURE');heartbeat(job,guard(job));
        }else if(parsed.kind==='result'){
          if(job.phase!=='running')return cancel(job,'INTEGRITY_FAILURE');guard(job);handedOff=true;
          retire(job,succeeded(Object.freeze({kind:'unverified-resource-output',jobId:parsed.jobId,generation:parsed.generation,bytes:parsed.result,
            proofVerified:false,receiptAuthority:false,economicPreparationAllowed:false})));
        }else cancel(job,parsed.code);
      }catch(error){cancel(job,errorCode(error,'UNAVAILABLE'));}
      finally{
        if(parsed?.kind==='result'&&!handedOff)wipe(parsed.result);
        try{const field=typeof input==='object'&&input!==null?Object.getOwnPropertyDescriptor(input,'result'):undefined;
          if(field&&'value'in field)discard(field.value,budget.maxProofBytes);}catch{/* Late foreign payloads confer no authority. */}
      }
    };
    const execute=async(job:Job,collect:(signal:AbortSignal)=>Promise<Uint8Array>,external:AbortSignal|undefined):Promise<void>=>{
      try{
        if(external!==undefined){let aborted:unknown;try{aborted=Reflect.apply(nativeAborted,external,[]);}catch{return cancel(job,'INVALID_INPUT');}
          if(aborted===true)return cancel(job);
          const abort=():void=>cancel(job);Reflect.apply(nativeAdd,external,['abort',abort,{once:true}]);
          job.offExternal=()=>{Reflect.apply(nativeRemove,external,['abort',abort]);};
          if(Reflect.apply(nativeAborted,external,[])===true)return cancel(job);
        }
        const off=owner.subscribeRevocation(()=>cancel(job,'LOCKED'));if(typeof off!=='function')return stop('UNAVAILABLE');
        if(job.retired){safe(off);return;}job.offOwner=off;
        const started=guard(job);job.started=started;job.heartbeat=started;arm(job,'wall',budget.wallTimeMs);arm(job,'heartbeat',budget.heartbeatMs);guard(job);
        const rawInput=await collect(job.controller.signal);
        if(job.retired){discard(rawInput,budget.maxWitnessBytes);return;}
        try{job.input=value(copyJobBytes(rawInput,budget.maxWitnessBytes));}finally{discard(rawInput,budget.maxWitnessBytes);}
        guard(job);const worker=createWorker();job.worker=worker;job.terminationDone=false;
        if(job.retired){terminate(job,true);return;}guard(job);
        const offWorker=worker.subscribe({message:input=>receive(job,input),error:()=>cancel(job,'UNAVAILABLE'),messageError:()=>cancel(job,'INTEGRITY_FAILURE')});
        if(typeof offWorker!=='function')return stop('UNAVAILABLE');
        if(job.retired){safe(offWorker);terminate(job,true);return;}job.offWorker=offWorker;job.phase='initializing';
        send(job,{v:1,kind:'init',jobId:job.consent.jobId,generation:job.consent.scope.generation,profileId:PUBLIC_RESOURCE_PROFILE});
      }catch(error){cancel(job,errorCode(error,'UNAVAILABLE'));}
      finally{job.executionDone=true;if(job.retired)terminate(job,true);release(job);}
    };
    const runner:ResourceRunner=Object.freeze({
      consent(input:unknown):CoreResult<object>{
        if(closed)return failed('LOCKED');if(consenting)return failed('CONFLICT');
        const attempt=Object.freeze({});consenting=true;consentAttempt=attempt;consent=undefined;
        const currentAttempt=():void=>{if(closed||consentAttempt!==attempt)return stop(closed?'LOCKED':'CANCELLED');};
        try{const scope=parsedScope(input);currentAttempt();
          const firstOwner=ownerCurrent(scope);currentAttempt();if(!firstOwner)return failed('LOCKED');
          const jobId=randomId();currentAttempt();const challenge=randomId();currentAttempt();
          const lastOwner=ownerCurrent(scope);currentAttempt();if(!lastOwner)return failed('LOCKED');
          if(jobId===previousId||challenge===previousChallenge)return failed('UNAVAILABLE');
          const token=Object.freeze({});consent={token,scope,jobId,challenge};previousId=jobId;previousChallenge=challenge;return succeeded(token);
        }catch(error){return failed(closed?'LOCKED':consentAttempt!==attempt?'CANCELLED':errorCode(error,'UNAVAILABLE'));}
        finally{if(consentAttempt===attempt)consentAttempt=undefined;consenting=false;}
      },
      run(token:unknown,collect:(signal:AbortSignal)=>Promise<Uint8Array>,signal?:AbortSignal):Promise<CoreResult<ResourceOutput>>{
        if(closed)return Promise.resolve(failed('LOCKED'));if(tabLease)return Promise.resolve(failed('LIMIT_EXCEEDED'));
        if(!consent||token!==consent.token||typeof collect!=='function')return Promise.resolve(failed('INVALID_INPUT'));
        const accepted=consent;consent=undefined;let resolve:(result:CoreResult<ResourceOutput>)=>void=()=>{},finishDrain:()=>void=()=>{};
        const result=new Promise<CoreResult<ResourceOutput>>(done=>resolve=done),drain=new Promise<void>(done=>finishDrain=done);
        const job:Job={consent:accepted,controller:new AbortController(),result,resolve,drain,finishDrain,retired:false,resolved:false,executionDone:false,
          terminationStarted:false,terminationDone:true,drained:false,worker:undefined,input:undefined,phase:'collecting',started:undefined,lastTime:undefined,
          heartbeat:undefined,messages:0,wallTimer:undefined,heartbeatTimer:undefined,offOwner:undefined,offWorker:undefined,offExternal:undefined};
        tabLease=active=job;lastDrain=drain;void execute(job,collect,signal);return result;
      },
      cancel(){consentAttempt=undefined;consent=undefined;if(active)cancel(active);},
      resume(){consentAttempt=undefined;consent=undefined;if(active)cancel(active);},
      dispose(){closed=true;consentAttempt=undefined;consent=undefined;if(active)cancel(active,'LOCKED');return lastDrain;},
    });
    return runner;
  });
}
