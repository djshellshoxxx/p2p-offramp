/** Internal G15 GET reader. The existing generic HTTP driver's 64KiB profile is unchanged. */
import {SessionTransportPolicy,type TransportScope,type HttpFetchPort} from '../../transport/index.ts';
export interface UpdateEndpoint {readonly endpointId:string;readonly url:string;}
export const UPDATE_HTTP_READS=16_384;
const readCodes=new WeakMap<object,UpdateReadError['code']>();
export class UpdateReadError extends Error {
  readonly code:'INVALID_ENDPOINT'|'POLICY_BLOCKED'|'CANCELLED'|'LIMIT_EXCEEDED'|'ROUTE_UNAVAILABLE'|'TIMEOUT';
  constructor(code:UpdateReadError['code']) {super('Update read refused.');this.code=['INVALID_ENDPOINT','POLICY_BLOCKED','CANCELLED','LIMIT_EXCEEDED','ROUTE_UNAVAILABLE','TIMEOUT'].includes(code)?code:'ROUTE_UNAVAILABLE';readCodes.set(this,this.code);}
}
/** Identity lookup never probes a foreign rejection's prototype or properties. */
export const updateReadCode=(error:unknown):UpdateReadError['code']|undefined=>typeof error==='object'&&error!==null?readCodes.get(error):undefined;
const typed=Object.getPrototypeOf(Uint8Array.prototype) as object;
const length=Object.getOwnPropertyDescriptor(typed,'byteLength')!.get!;
const buffer=Object.getOwnPropertyDescriptor(typed,'buffer')!.get!;
const bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength')!.get!;
/** True only when Content-Length positively describes the bytes the body stream yields.
 * Fetch removes content codings before exposing the body, while Content-Length keeps the encoded size.
 * A CORS-filtered response hides Content-Encoding but exposes Content-Length, so absence proves nothing there.
 * A port that omits Response.type promises an unfiltered header list. */
function declaresBodyLength(response:{readonly type?:string;readonly headers:Pick<Headers,'get'>}):boolean{
  const coding=response.headers.get('content-encoding');
  if(coding!==null&&typeof coding!=='string')return false;
  // An empty coding list means no coding was applied, exactly like a missing header.
  const visible=coding===null?'':coding.trim().toLowerCase();
  // A visible coding is authoritative: only an explicit identity coding leaves the length unchanged.
  if(visible!=='')return visible==='identity';
  // A missing coding proves identity only on an unfiltered header list.
  const type=response.type;
  return type===undefined||type==='basic'||type==='default';
}
export class UpdateHttpReader {
  #pending:Promise<void>=Promise.resolve();#busy=false;
  readonly transport:SessionTransportPolicy;readonly fetch:HttpFetchPort;
  constructor(transport:SessionTransportPolicy,fetch:HttpFetchPort){this.transport=transport;this.fetch=fetch;}
  drain():Promise<void>{return this.#pending;}
  async read(endpoint:UpdateEndpoint,maximum:number,signal:AbortSignal,guard:()=>void):Promise<Uint8Array<ArrayBuffer>>{
    if(this.#busy)throw new UpdateReadError('LIMIT_EXCEEDED');
    // Own the drain before endpoint reflection or any guard/registry callback can reenter.
    this.#busy=true;let finish=()=>{},invoked=false,scope:TransportScope|undefined;
    this.#pending=new Promise<void>(done=>finish=done);
    try{
      if(!Number.isSafeInteger(maximum)||maximum<0||maximum>256*1024*1024)throw new UpdateReadError('LIMIT_EXCEEDED');
      let url:URL;
      try{url=new URL(endpoint.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.href!==endpoint.url||endpoint.url.length>2048)throw Error();}
      catch{throw new UpdateReadError('INVALID_ENDPOINT');}
      guard();const permit=this.transport.authorize({channel:'update',endpointId:endpoint.endpointId,method:'read'});
      if(typeof permit==='string')throw new UpdateReadError(permit);
      const captured=this.transport.capture(permit,{expectedURL:url.href,signal});
      if(typeof captured==='string')throw new UpdateReadError(captured);
      scope=captured;const leased=captured;
      guard();const result=await scope.run(async nativeSignal=>{
        invoked=true;let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
        const chunks:Uint8Array<ArrayBuffer>[]=[];
        const current=()=>{guard();if(nativeSignal.aborted||!leased.current())throw new UpdateReadError('CANCELLED');};
        const cancel=()=>{void reader?.cancel().catch(()=>{});};
        try{
          nativeSignal.addEventListener('abort',cancel,{once:true});current();
          const response=await this.fetch(url.href,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:nativeSignal});
          reader=response.body?.getReader();current();
          if(!response.ok||response.redirected||response.url!==url.href||!reader)throw new UpdateReadError('ROUTE_UNAVAILABLE');
          const declared=response.headers.get('content-length');
          const wellFormed=declared===null||(/^(0|[1-9][0-9]*)$/.test(declared)&&declared.length<=9);
          if(!wellFormed)throw new UpdateReadError('LIMIT_EXCEEDED');
          // Invariant: only an identity length may refuse early or be compared with the decoded total.
          // Otherwise the streamed decoded-byte cap is the sole size bound; signed digests alone prove integrity.
          const exact=declared!==null&&declaresBodyLength(response)?Number(declared):null;
          if(exact!==null&&exact>maximum)throw new UpdateReadError('LIMIT_EXCEEDED');
          let total=0,reads=0;
          for(;;){if(++reads>UPDATE_HTTP_READS)throw new UpdateReadError('LIMIT_EXCEEDED');const next=await reader.read();current();if(next.done)break;
            const raw=next.value;if(typeof raw!=='object'||raw===null||Object.getPrototypeOf(raw)!==Uint8Array.prototype)throw new UpdateReadError('ROUTE_UNAVAILABLE');
            let size:number;try{size=Reflect.apply(length,raw,[]) as number;Reflect.apply(bufferLength,Reflect.apply(buffer,raw,[]),[]);}catch{throw new UpdateReadError('ROUTE_UNAVAILABLE');}
            if(size>maximum-total)throw new UpdateReadError('LIMIT_EXCEEDED');total+=size;
            const owned=new Uint8Array(size);Uint8Array.prototype.set.call(owned,raw);chunks.push(owned);
          }
          if(exact!==null&&exact!==total)throw new UpdateReadError('ROUTE_UNAVAILABLE');
          current();
          const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}current();return output;
        }finally{nativeSignal.removeEventListener('abort',cancel);try{await reader?.cancel();}catch{}for(const chunk of chunks)chunk.fill(0);this.#busy=false;finish();}
      });
      guard();if(!result.ok)throw new UpdateReadError(result.error);return result.value;
    }finally{try{scope?.dispose();}finally{if(!invoked){this.#busy=false;finish();}}}
  }
}
