import type {CoreErrorCode,CoreResult} from '../../schemas/index.ts';
import {G29_BUDGET} from './budget.ts';
import {checked,counter,opaqueId,ownField,record,stop} from './data.ts';

export const PUBLIC_RESOURCE_PROFILE='local-public-resource-v1';
export interface JobIdentity {readonly v:1;readonly jobId:string;readonly generation:number;}
export type ProofWorkerCommand=
  |(JobIdentity&{readonly kind:'init';readonly profileId:string})
  |(JobIdentity&{readonly kind:'prove';readonly input:Uint8Array<ArrayBuffer>})
  |(JobIdentity&{readonly kind:'cancel'});
export type ProofWorkerReply=
  |(JobIdentity&{readonly kind:'ready'})
  |(JobIdentity&{readonly kind:'progress';readonly progress:number})
  |(JobIdentity&{readonly kind:'result';readonly result:Uint8Array<ArrayBuffer>})
  |(JobIdentity&{readonly kind:'failed';readonly code:CoreErrorCode});
const codes:readonly CoreErrorCode[]=['INVALID_INPUT','UNSUPPORTED_VERSION','UNSUPPORTED_PROVIDER','WRONG_CHAIN','UNAUTHORIZED','USER_REJECTED','LOCKED','CONFLICT','UNAVAILABLE','TIMEOUT','CANCELLED','LIMIT_EXCEEDED','INTEGRITY_FAILURE','BROADCAST_UNKNOWN','EXPIRED'];
const typed=Object.getPrototypeOf(Uint8Array.prototype) as object;
const lengthGetter=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!;
const bufferGetter=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!;
const offsetGetter=Object.getOwnPropertyDescriptor(typed,'byteOffset')!.get!;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
const setBytes=Uint8Array.prototype.set;
function bytes(input:unknown,maximum:number):Uint8Array<ArrayBuffer>{
  counter(maximum,G29_BUDGET.maxProofBytes);
  if(typeof input!=='object'||input===null||Object.getPrototypeOf(input)!==Uint8Array.prototype)return stop();
  const size=Reflect.apply(lengthGetter,input,[]) as number;if(size>maximum)return stop('LIMIT_EXCEEDED');
  const backing=Reflect.apply(bufferGetter,input,[]) as ArrayBuffer;Reflect.apply(bufferLength,backing,[]);
  // Native view construction rejects detached buffers and shared backing stores before copying.
  const view=new Uint8Array(backing,Reflect.apply(offsetGetter,input,[]) as number,size),copy=new Uint8Array(size);
  Reflect.apply(setBytes,copy,[view]);return copy;
}
export const copyJobBytes=(input:unknown,maximum:number):CoreResult<Uint8Array<ArrayBuffer>>=>checked(()=>bytes(input,maximum));
function identity(raw:Record<string,unknown>):JobIdentity{
  if(raw.v!==1)return stop('UNSUPPORTED_VERSION');return{v:1,jobId:opaqueId(raw.jobId),generation:counter(raw.generation)};
}
export function parseWorkerCommand(input:unknown,maximum:number=G29_BUDGET.maxWitnessBytes):CoreResult<ProofWorkerCommand>{
  return checked(()=>{
    counter(maximum,G29_BUDGET.maxWitnessBytes);const kind=ownField(input,'kind');
    if(kind==='init'){const raw=record(input,['v','kind','jobId','generation','profileId']);if(typeof raw.profileId!=='string'||!/^[a-z0-9-]{1,64}$/.test(raw.profileId))return stop();return Object.freeze({...identity(raw),kind,profileId:raw.profileId});}
    if(kind==='prove'){const raw=record(input,['v','kind','jobId','generation','input']);return Object.freeze({...identity(raw),kind,input:bytes(raw.input,maximum)});}
    if(kind==='cancel'){const raw=record(input,['v','kind','jobId','generation']);return Object.freeze({...identity(raw),kind});}
    return stop();
  });
}
export function parseWorkerReply(input:unknown,maximum:number=G29_BUDGET.maxProofBytes):CoreResult<ProofWorkerReply>{
  return checked(()=>{
    counter(maximum,G29_BUDGET.maxProofBytes);const kind=ownField(input,'kind');
    if(kind==='ready'){const raw=record(input,['v','kind','jobId','generation']);return Object.freeze({...identity(raw),kind});}
    if(kind==='progress'){const raw=record(input,['v','kind','jobId','generation','progress']);return Object.freeze({...identity(raw),kind,progress:counter(raw.progress,100)});}
    if(kind==='result'){const raw=record(input,['v','kind','jobId','generation','result']);return Object.freeze({...identity(raw),kind,result:bytes(raw.result,maximum)});}
    if(kind==='failed'){const raw=record(input,['v','kind','jobId','generation','code']);if(typeof raw.code!=='string'||!codes.includes(raw.code as CoreErrorCode))return stop();return Object.freeze({...identity(raw),kind,code:raw.code as CoreErrorCode});}
    return stop();
  });
}
