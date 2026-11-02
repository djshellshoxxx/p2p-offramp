/** Explicit local test composition; the default App has no proof/resource import. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from '../../../../apps/web/src/ui/App.tsx';
import {startAppServices} from '../../../../apps/web/src/app-services.ts';
import {createProofJobs} from '../../index.ts';
import {createPublicResourceRunner,type ResourceRunner,type ResourceWorkerPort} from '../../src/supervisor.ts';
import type {ResourceBudget} from '../../src/budget.ts';
import type {ProofWorkerCommand} from '../../src/protocol.ts';
import '../../../../apps/web/src/ui/app.css';

const opened=await startAppServices();if(!opened.ok)throw Error('Local native vault unavailable.');
const services=opened.value,root=createRoot(document.getElementById('root')!);root.render(<App services={services}/>);
declare const __RESOURCE_POLICY_HASH__:string;
// The local build root supplies the digest of the exact unchanged response header.
const policyHash=__RESOURCE_POLICY_HASH__;
const metrics={created:0,terminated:0,detached:0,cancelCommands:0,proveCommands:0,received:0,
  collectors:0,defaultCollectors:0,scopeLosses:0,allInputPublic:true,reentrantCode:null as string|null,policyHash,
  outcomes:[] as {sequence:number;ok:boolean;code:string|null;kind:string|null;byteLength:number;firstBytes:number[];elapsedMs:number;proofVerified:false;receiptAuthority:false;economicPreparationAllowed:false}[]};
let generation=0,observedScope=services.selectionScope(),sequence=0,current:ResourceRunner|undefined;
const revocations=new Set<()=>void>(),runners=new Set<ResourceRunner>();
let retained:((input:unknown)=>void)|undefined,retainedIdentity:{jobId:string;generation:number}|undefined;
function revoke():void{generation++;metrics.scopeLosses++;for(const listener of [...revocations])listener();}
function refreshScope():void{const actual=services.selectionScope();if(actual!==observedScope){observedScope=actual;revoke();}}
const offServices=services.subscribe(refreshScope);
const owner={current(scope:{generation:number}){refreshScope();return scope.generation===generation;},subscribeRevocation(listener:()=>void){revocations.add(listener);return()=>revocations.delete(listener);}};
const section=document.getElementById('resource-controls')!;
const title=document.createElement('h2');title.textContent='PUBLIC resource conformance — no proof provider';
const warning=document.createElement('p');warning.textContent='Only public fixture bytes enter this separate Worker. Outputs are unverified. Real providers are unavailable and browser WASM stays unsupported under the unchanged policy.';
const mode=document.createElement('select');mode.id='public-resource-mode';mode.setAttribute('aria-label','Public resource fixture case');
for(const[value,label]of [[0,'Finite checksum'],[1,'Finite CPU work ignoring cooperative cancel'],[2,'Missing heartbeat'],[3,'Oversized result'],[4,'Wrong generation'],[5,'Excess messages'],[6,'Native Worker crash'],[7,'Unsupported browser WASM'],[8,'Unrecognized verified field'],[9,'Heartbeat until wall deadline']] as const){const option=document.createElement('option');option.value=String(value);option.textContent=label;mode.append(option);}
const size=document.createElement('select');size.id='public-resource-size';size.setAttribute('aria-label','Public resource input bytes');
for(const count of [16,1048576,1048577]){const option=document.createElement('option');option.value=String(count);option.textContent=String(count);size.append(option);}
const consent=document.createElement('input');consent.type='checkbox';consent.id='public-resource-consent';
const label=document.createElement('label');label.htmlFor=consent.id;label.textContent='I choose this public resource fixture; no bank data, credentials or payment proof are involved.';
const start=document.createElement('button');start.id='public-resource-start';start.textContent='Start public resource fixture';
const cancel=document.createElement('button');cancel.id='public-resource-cancel';cancel.textContent='Cancel public resource fixture';
const status=document.createElement('p');status.id='public-resource-status';status.setAttribute('role','status');status.textContent='Idle; providers unavailable.';
section.append(title,warning,mode,size,consent,label,start,cancel,status);

async function begin(selected:number,kind:'normal'|'heartbeat'|'wall'='normal',reenter=false,cancelOnProgress=false):Promise<void>{
  if(!consent.checked){status.textContent='PUBLIC_CONSENT_REQUIRED';return;}consent.checked=false;
  if(!Number.isInteger(selected)||selected<0||selected>9)throw Error('INVALID_INPUT');
  const length=Number(size.value);if(![16,1048576,1048577].includes(length))throw Error('INVALID_INPUT');
  refreshScope();const mine=++sequence,started=performance.now();
  const limits:Partial<ResourceBudget>=kind==='heartbeat'?{wallTimeMs:2000,heartbeatMs:500}:kind==='wall'?{wallTimeMs:1000,heartbeatMs:500}:{wallTimeMs:10000,heartbeatMs:6000};
  let runner:ResourceRunner;let reentry=reenter,shouldCancel=cancelOnProgress;
  const createWorker=():ResourceWorkerPort=>{
    if(reentry){reentry=false;void runner.run({},async()=>new Uint8Array()).then(result=>{metrics.reentrantCode=result.ok?'UNEXPECTED':result.error.code;});}
    const worker=new Worker(new URL('../../worker/public-resource.worker.ts',import.meta.url),{type:'module'});metrics.created++;
    return Object.freeze({
      postMessage(command:ProofWorkerCommand,transfer:readonly ArrayBuffer[]){
        if(command.kind==='cancel')metrics.cancelCommands++;
        if(command.kind==='prove'){metrics.proveCommands++;metrics.allInputPublic&&=command.input.every((byte,index)=>index===0?byte<=9:byte===1);}
        retainedIdentity={jobId:command.jobId,generation:command.generation};worker.postMessage(command,[...transfer]);
      },
      subscribe(handlers:Parameters<ResourceWorkerPort['subscribe']>[0]){
        retained=handlers.message;
        const message=(event:MessageEvent<unknown>)=>{metrics.received++;handlers.message(event.data);
          if(shouldCancel&&typeof event.data==='object'&&event.data!==null&&Object.getOwnPropertyDescriptor(event.data,'kind')?.value==='progress'){shouldCancel=false;runner.cancel();}};
        const error=(event:ErrorEvent)=>{event.preventDefault();handlers.error();};
        const messageError=()=>handlers.messageError();
        worker.addEventListener('message',message);worker.addEventListener('error',error);worker.addEventListener('messageerror',messageError);
        return()=>{metrics.detached++;worker.removeEventListener('message',message);worker.removeEventListener('error',error);worker.removeEventListener('messageerror',messageError);};
      },
      terminate(){metrics.terminated++;worker.terminate();},
    });
  };
  const created=createPublicResourceRunner({createWorker,owner,limits});if(!created.ok)throw Error(created.error.code);runner=created.value;runners.add(runner);
  const selectedConsent=runner.consent({binding:{chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:'1'.repeat(64)},termsHash:'1'.repeat(64),policyHash,generation});
  if(!selectedConsent.ok){await runner.dispose();runners.delete(runner);status.textContent=selectedConsent.error.code;return;}
  if(!current)current=runner;status.textContent='Public resource work pending.';
  const result=await runner.run(selectedConsent.value,async()=>{metrics.collectors++;const bytes=new Uint8Array(length).fill(1);bytes[0]=selected;return bytes;});
  metrics.outcomes.push({sequence:mine,ok:result.ok,code:result.ok?null:result.error.code,kind:result.ok?result.value.kind:null,
    byteLength:result.ok?result.value.bytes.length:0,firstBytes:result.ok?Array.from(result.value.bytes.slice(0,8)):[],elapsedMs:performance.now()-started,
    proofVerified:false,receiptAuthority:false,economicPreparationAllowed:false});
  if(metrics.outcomes.length>32)metrics.outcomes.shift();
  if(result.ok)result.value.bytes.fill(0);
  status.textContent=result.ok?'Unverified public resource output.':result.error.code;
  await runner.dispose();runners.delete(runner);if(current===runner)current=undefined;
}
start.onclick=()=>{void begin(Number(mode.value));};cancel.onclick=()=>current?.cancel();
const uncertainResume=()=>current?.resume();document.addEventListener('visibilitychange',uncertainResume);window.addEventListener('pageshow',uncertainResume);window.addEventListener('hashchange',uncertainResume);
Object.assign(window,{publicResourceFixture:{
  snapshot:()=>structuredClone(metrics),begin,
  cancel:()=>current?.cancel(),resume:()=>current?.resume(),scopeLoss:revoke,
  replayRetired(){if(retained&&retainedIdentity)retained({v:1,kind:'result',...retainedIdentity,result:new Uint8Array([99])});},
  async defaultRequest(){const result=await createProofJobs().request({profileId:'unapproved',enabled:true},{consented:true},()=>{metrics.defaultCollectors++;return new Uint8Array([1]);});return result.ok?'UNEXPECTED':result.error.code;},
  profileId:()=>services.profileId,
  async dispose(){for(const runner of runners)void runner.dispose();await Promise.all([...runners].map(runner=>runner.dispose()));offServices();document.removeEventListener('visibilitychange',uncertainResume);window.removeEventListener('pageshow',uncertainResume);window.removeEventListener('hashchange',uncertainResume);root.unmount();await services.dispose();},
}});
