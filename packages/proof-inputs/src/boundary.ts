import {createCoreError,createOperationId} from '../../domain/index.ts';
import {parseStrictJsonBytes} from '../../schemas/index.ts';
import type {CoreErrorCode,CoreResult} from '../../schemas/index.ts';
import type {UnverifiedInput} from './types.ts';
const failures=new WeakMap<object,CoreErrorCode>();
export function reject(code:CoreErrorCode='INVALID_INPUT'):never {const error=new Error('Proof input unavailable.');failures.set(error,code);throw error;}
export function checked<T>(work:()=>T):CoreResult<T>{try{return Object.freeze({ok:true,value:work()});}catch(error){
  const code=typeof error==='object'&&error!==null?failures.get(error)??'INVALID_INPUT':'INVALID_INPUT';
  return Object.freeze({ok:false,error:createCoreError(code,{operationId:createOperationId(),readOnly:true})});}}
export function unverified<T>(data:T):UnverifiedInput<T>{return Object.freeze({kind:'unverified-proof-input',data,compatibilityAvailable:false,sourceAuthenticated:false,semanticCoverage:false,proofVerified:false,receiptAuthority:false,economicPreparationAllowed:false});}
export function record(input:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(typeof input!=='object'||input===null||![Object.prototype,null].includes(Object.getPrototypeOf(input)))return reject();
  const keys=Reflect.ownKeys(input),allowed=[...required,...optional];
  if(keys.length>allowed.length||keys.some(key=>typeof key!=='string'||!allowed.includes(key)))return reject();
  const out:Record<string,unknown>=Object.create(null);
  for(const key of allowed){const d=Object.getOwnPropertyDescriptor(input,key);if(!d){if(required.includes(key))return reject();continue;}
    if(!d.enumerable||!('value'in d))return reject();out[key]=d.value;}
  return out;
}
export function integer(input:unknown,max:number):number{return typeof input==='number'&&Number.isSafeInteger(input)&&input>=0&&input<=max?input:reject();}
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
export function text(input:unknown,max:number,nonempty=true):string{
  if(typeof input!=='string'||input.length>max||nonempty&&!input.length)return reject();
  if(/[\uD800-\uDFFF]/u.test(input))return reject();if(encoder.encode(input).byteLength>max)return reject('LIMIT_EXCEEDED');return input;
}
export const utf8Length=(input:string):number=>encoder.encode(input).byteLength;
export function utf8(bytes:Uint8Array):string{let decoded:string;try{decoded=decoder.decode(bytes);}catch{return reject();}if(decoded.charCodeAt(0)===0xfeff)return reject();return decoded;}
const typed=Object.getPrototypeOf(Uint8Array.prototype) as object;
const length=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!;
const buffer=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!;
const offset=Object.getOwnPropertyDescriptor(typed,'byteOffset')!.get!;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
const set=Uint8Array.prototype.set,fill=Uint8Array.prototype.fill;
/** Borrow only; no shared/detached/proxy/foreign/subclass views. */
export function view(input:unknown,max:number):Uint8Array<ArrayBuffer>{
  if(typeof input!=='object'||input===null||Object.getPrototypeOf(input)!==Uint8Array.prototype)return reject();
  const size=Reflect.apply(length,input,[]) as number;if(size>max)return reject('LIMIT_EXCEEDED');
  const backing=Reflect.apply(buffer,input,[]) as ArrayBuffer;Reflect.apply(bufferLength,backing,[]);
  return new Uint8Array(backing,Reflect.apply(offset,input,[]) as number,size);
}
export function copy(input:Uint8Array<ArrayBuffer>):Uint8Array<ArrayBuffer>{const output=new Uint8Array(input.byteLength);Reflect.apply(set,output,[input]);return output;}
export function wipe(input:Uint8Array|undefined):void{try{if(input)Reflect.apply(fill,input,[0]);}catch{/* Detached buffers are already inaccessible. */}}
export function json(input:unknown):unknown {const bytes=view(input,32768);return parseStrictJsonBytes(bytes,32768);}
export function list(input:unknown,max:number):unknown[]{
  if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)return reject();
  const size=Object.getOwnPropertyDescriptor(input,'length');if(!size||!('value'in size))return reject();
  const count=integer(size.value,max),keys=Reflect.ownKeys(input);if(keys.length!==count+1)return reject();
  const out:unknown[]=[];for(let i=0;i<count;i++){const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d||!d.enumerable||!('value'in d))return reject();out.push(d.value);}return out;
}
