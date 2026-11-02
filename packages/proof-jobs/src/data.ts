import {createCoreError,createOperationId} from '../../domain/index.ts';
import {decodeBase64url,encodeBase64url,type CoreErrorCode,type CoreResult} from '../../schemas/index.ts';

const failures=new WeakMap<object,CoreErrorCode>();
export function stop(code:CoreErrorCode='INVALID_INPUT'):never {
  const error=new Error('Resource work unavailable.');failures.set(error,code);throw error;
}
export const errorCode=(error:unknown,fallback:CoreErrorCode='INVALID_INPUT'):CoreErrorCode=>
  typeof error==='object'&&error!==null?failures.get(error)??fallback:fallback;
export const failed=(code:CoreErrorCode):CoreResult<never>=>Object.freeze({ok:false,error:createCoreError(code,{operationId:createOperationId(),readOnly:true})});
export const succeeded=<T>(value:T):CoreResult<T>=>Object.freeze({ok:true,value});
export function checked<T>(work:()=>T):CoreResult<T>{try{return succeeded(work());}catch(error){return failed(errorCode(error));}}
export function value<T>(result:CoreResult<T>):T{if(!result.ok)return stop(result.error.code);return result.value;}

export function record(input:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(typeof input!=='object'||input===null||![Object.prototype,null].includes(Object.getPrototypeOf(input)))return stop();
  const keys=Reflect.ownKeys(input),allowed=[...required,...optional];
  if(keys.length>allowed.length||keys.some(key=>typeof key!=='string'||!allowed.includes(key)))return stop();
  const out:Record<string,unknown>=Object.create(null);
  for(const key of allowed){const d=Object.getOwnPropertyDescriptor(input,key);if(!d){if(required.includes(key))return stop();continue;}if(!d.enumerable||!('value'in d))return stop();out[key]=d.value;}
  return out;
}
export function ownField(input:unknown,key:string):unknown{
  if(typeof input!=='object'||input===null)return stop();const d=Object.getOwnPropertyDescriptor(input,key);
  return d&&d.enumerable&&'value'in d?d.value:stop();
}
export function counter(input:unknown,max=Number.MAX_SAFE_INTEGER):number{
  return typeof input==='number'&&Number.isSafeInteger(input)&&input>=0&&input<=max?input:stop();
}
export function opaqueId(input:unknown):string{
  if(typeof input!=='string'||input.length!==43)return stop();
  let decoded:Uint8Array|undefined;
  try{decoded=decodeBase64url(input,32,32);if(encodeBase64url(decoded)!==input)return stop();return input;}
  finally{decoded?.fill(0);}
}
export function digest(input:unknown):string{return typeof input==='string'&&/^[0-9a-f]{64}$/.test(input)?input:stop();}
