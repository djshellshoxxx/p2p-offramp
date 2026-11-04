/** Opt-in supported G15 asset transition. Absent from the public facade/default application. */
import {parseStrictJsonBytes,decodeBase64url} from '../../schemas/index.ts';
import {SessionTransportPolicy,type HttpFetchPort} from '../../transport/index.ts';
import {verifyRelease,readUntrustedReleaseManifest,RELEASE_LIMITS,type ReleaseResult,type ReleaseErrorCode} from './release-manifest.ts';
import {verifyReleaseLocator,readUntrustedReleaseLocator,type ReleaseLocator} from './release-locator.ts';
import {revalidateRelease} from './release-proof.ts';
import {UpdateHttpReader,updateReadCode,type UpdateEndpoint} from './release-update-http.ts';
import {acceptedRelease,type AcceptedRelease,type AcceptedReleaseStore} from './release-update-store.ts';

export const UPDATE_CHECK_MS=120_000; // Stricter aggregate local policy, in addition to each G05 30s operation.
export const UPDATE_ENVELOPE_BYTES=4096;
export type UpdateError=ReleaseErrorCode|'UNCONFIGURED'|'ORIGIN_UNSUPPORTED'|'UPDATE_UNTRUSTED'|'SCHEMA_INCOMPATIBLE'|'BACKUP_REQUIRED'|'BUSY'|'CONFLICT'|'STORAGE_UNAVAILABLE'|'POLICY_BLOCKED'|'INVALID_ENDPOINT'|'LIMIT_EXCEEDED'|'ROUTE_UNAVAILABLE'|'TIMEOUT';
export type UpdateResult<T>=Readonly<{ok:true;value:T}>|Readonly<{ok:false;error:Readonly<{code:UpdateError}>}>;
export interface CompiledUpdateTrust {
  readonly keyId:string;readonly key:JsonWebKey;readonly channel:string;readonly storageSchema:number;
  readonly gateway:string;readonly current:Readonly<{sequence:number;manifestSha256:string}>;
}
export interface UpdateSource {
  readonly locator:UpdateEndpoint;readonly locatorEnvelope:UpdateEndpoint;
  resolve(cid:string,kind:'manifest'|'manifest-envelope'|'asset',path?:string):UpdateEndpoint;
  destination(cid:string):string;
}
export interface UpdateOwner {current():boolean;subscribeInvalidation(listener:()=>void):()=>void;isUserGesture():boolean;}
/** current() also authenticates the exact locked state after this lease's own lock(), never another selection. */
export interface UpdateBackupSelection {current():boolean;requireVerifiedBackup(signal:AbortSignal):Promise<void>;lock(signal:AbortSignal):Promise<void>;dispose():void;}
export interface UpdateWalletLease {current():boolean;disconnect(signal:AbortSignal):Promise<void>;release():void;}
export interface UpdateOptions {
  readonly trust?:CompiledUpdateTrust|null;readonly source?:UpdateSource;readonly transport?:SessionTransportPolicy;
  readonly fetch?:HttpFetchPort;readonly acceptedStore?:AcceptedReleaseStore;readonly owner?:UpdateOwner;
  readonly backup?:Readonly<{capture():UpdateBackupSelection|null}>;
  readonly walletQuiescence?:Readonly<{acquire():UpdateWalletLease|null}>;
  readonly navigation?:Readonly<{openVerifiedDestination(url:string):void}>;
  readonly monotonicNow?:()=>number;readonly nowSeconds?:()=>number;
}
export interface UpdateReview {
  readonly current:Readonly<{sequence:number;manifestSha256:string;keyId:string}>;
  readonly candidate:Readonly<{sequence:number;manifestSha256:string;keyId:string;releaseId:string;sourceCommit:string;predecessorDigest:string|null}>;
  readonly minStorageSchema:number;readonly maxStorageSchema:number;readonly destination:string;
  readonly assets:readonly Readonly<{path:string;bytes:number;sha256:string}>[];
  readonly changeSummary:'Manifest and asset identities only; no signed human change summary is supplied.';
  readonly freshOriginAcceptedState:boolean;readonly backupRequired:true;readonly releaseEnabled:false;
}
export type UpdateCheck=Readonly<{kind:'none'}>|Readonly<{kind:'candidate';candidate:object;review:UpdateReview}>|
  Readonly<{kind:'untrusted'|'stale'|'unreachable';reason:UpdateError}>;
export interface AssetUpdateController {
  checkForUpdate(signal?:AbortSignal):Promise<UpdateCheck>;
  acceptUpdate(candidate:unknown,signal?:AbortSignal):Promise<UpdateResult<Readonly<{destination:string;acceptedSequence:number;releaseEnabled:false}>>>;
  cancel():void;dispose():Promise<void>;
}
type Verified=Extract<ReleaseResult,{ok:true}>['value'];
interface Candidate {readonly token:object;readonly verified:Verified;readonly locator:ReleaseLocator;readonly review:UpdateReview;readonly controller:AbortController;}
interface Job {readonly controller:AbortController;readonly epoch:number;readonly routeGeneration:number;readonly started:number;readonly cancel:Promise<never>;reject(error:unknown):void;lastTime:number;retired:boolean;}
let physical:Job|undefined;
const codes=new WeakMap<object,UpdateError>();
class Refused extends Error {constructor(code:UpdateError){super('Update refused.');codes.set(this,code);}}
const stop=(code:UpdateError):never=>{throw new Refused(code);};
const codeOf=(error:unknown):UpdateError=>{
  if(typeof error==='object'&&error!==null){const known=codes.get(error)??updateReadCode(error);if(known)return known;}
  return 'UNAVAILABLE';
};
/** Hostile envelope bytes are untrusted content, never a transport outage; parsing runs no foreign callbacks. */
const envelope=(bytes:Uint8Array):unknown=>{
  try{return parseStrictJsonBytes(bytes,UPDATE_ENVELOPE_BYTES);}catch{return stop('MANIFEST_UNSUPPORTED');}};
const refused=(code:UpdateError):UpdateResult<never>=>Object.freeze({ok:false,error:Object.freeze({code})});
const good=<T>(value:T):UpdateResult<T>=>Object.freeze({ok:true,value});
const data=(input:unknown,keys:readonly string[]):Record<string,unknown>=>{
  if(typeof input!=='object'||input===null||![Object.prototype,null].includes(Object.getPrototypeOf(input)))return stop('UPDATE_UNTRUSTED');
  const own=Reflect.ownKeys(input);if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return stop('UPDATE_UNTRUSTED');
  const out:Record<string,unknown>=Object.create(null);for(const key of keys){const d=Object.getOwnPropertyDescriptor(input,key);if(!d||!d.enumerable||!('value'in d))return stop('UPDATE_UNTRUSTED');out[key]=d.value;}return out;
};
const hex=(input:unknown):string=>typeof input==='string'&&/^[0-9a-f]{64}$/.test(input)?input:stop('UPDATE_UNTRUSTED');
const count=(input:unknown,min=0):number=>typeof input==='number'&&Number.isSafeInteger(input)&&input>=min?input:stop('UPDATE_UNTRUSTED');
const text=(input:unknown,max:number):string=>typeof input==='string'&&input.length>0&&input.length<=max?input:stop('UPDATE_UNTRUSTED');
function endpoint(input:unknown):UpdateEndpoint {const raw=data(input,['endpointId','url']);return Object.freeze({endpointId:text(raw.endpointId,64),url:text(raw.url,2048)});}
function trustSnapshot(input:CompiledUpdateTrust):CompiledUpdateTrust {
  const raw=data(input,['keyId','key','channel','storageSchema','gateway','current']),current=data(raw.current,['sequence','manifestSha256']);
  const key=data(raw.key,['kty','crv','x','y','key_ops','ext']);
  if(key.kty!=='EC'||key.crv!=='P-256'||key.ext!==true||!Array.isArray(key.key_ops)||Object.getPrototypeOf(key.key_ops)!==Array.prototype||Reflect.ownKeys(key.key_ops).length!==2||Object.getOwnPropertyDescriptor(key.key_ops,'length')?.value!==1)return stop('UPDATE_UNTRUSTED');
  const operation=Object.getOwnPropertyDescriptor(key.key_ops,'0');if(!operation||!operation.enumerable||!('value'in operation)||operation.value!=='verify')return stop('UPDATE_UNTRUSTED');
  for(const coordinate of [key.x,key.y]){const bytes=decodeBase64url(coordinate,32,32);bytes.fill(0);}
  const gateway=new URL(text(raw.gateway,2048));if(gateway.protocol!=='https:'||gateway.username||gateway.password||gateway.pathname!=='/'||gateway.search||gateway.hash||gateway.href!==raw.gateway)return stop('ORIGIN_UNSUPPORTED');
  return Object.freeze({keyId:hex(raw.keyId),key:Object.freeze({kty:'EC',crv:'P-256',x:text(key.x,43),y:text(key.y,43),key_ops:Object.freeze(['verify']) as unknown as string[],ext:true}),
    channel:text(raw.channel,64),storageSchema:count(raw.storageSchema),gateway:gateway.href,current:Object.freeze({sequence:count(current.sequence,1),manifestSha256:hex(current.manifestSha256)})});
}
function destination(trust:CompiledUpdateTrust,cid:string,input:string):string {
  const base=new URL(trust.gateway),url=new URL(text(input,2048));
  if(url.protocol!=='https:'||url.hostname!==cid+'.'+base.hostname||url.port!==base.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.href!==input)return stop('ORIGIN_UNSUPPORTED');return url.href;
}
function floor(trust:CompiledUpdateTrust,saved:AcceptedRelease|null):Readonly<{sequence:number;manifestSha256:string}> {
  if(!saved||saved.sequence<trust.current.sequence)return trust.current;
  if(saved.sequence===trust.current.sequence&&saved.manifestSha256!==trust.current.manifestSha256)return stop('CONFLICT');return saved;
}

/** Constructor capabilities are trusted compiled composition. No imported configuration can register keys/routes. */
export function createAssetUpdateController(options:UpdateOptions={}):AssetUpdateController {
  // Deliberately read no other option if no compiled trust exists.
  const configured=options.trust??null;
  if(configured===null)return Object.freeze({checkForUpdate:async()=>Object.freeze({kind:'untrusted' as const,reason:'UNCONFIGURED' as const}),acceptUpdate:async()=>refused('UNCONFIGURED'),cancel(){},dispose:async()=>{}});
  let trust:CompiledUpdateTrust|undefined;try{trust=trustSnapshot(configured);}catch{}
  if(!trust)return Object.freeze({checkForUpdate:async()=>Object.freeze({kind:'untrusted' as const,reason:'UPDATE_UNTRUSTED' as const}),acceptUpdate:async()=>refused('UPDATE_UNTRUSTED'),cancel(){},dispose:async()=>{}});
  const pinned=trust,source=options.source,transport=options.transport,fetch=options.fetch,store=options.acceptedStore,owner=options.owner,
    backup=options.backup,wallet=options.walletQuiescence,navigation=options.navigation;
  if(!source||!transport||!fetch||!store||!owner||!backup||!wallet||!navigation)return Object.freeze({checkForUpdate:async()=>Object.freeze({kind:'untrusted' as const,reason:'UNCONFIGURED' as const}),acceptUpdate:async()=>refused('UNCONFIGURED'),cancel(){},dispose:async()=>{}});
  const routeBroker:SessionTransportPolicy=transport;
  const http=new UpdateHttpReader(routeBroker,fetch),clock=options.monotonicNow??(()=>performance.now()),utc=options.nowSeconds??(()=>Math.floor(Date.now()/1000));
  let closed=false,epoch=0,candidate:Candidate|undefined,active:Job|undefined,lastDrain=Promise.resolve();
  const invalidate=()=>{epoch++;candidate?.controller.abort();candidate=undefined;if(active&&!active.retired){active.retired=true;active.controller.abort();active.reject(new Refused('CANCELLED'));}};
  let off=()=>{};try{off=owner.subscribeInvalidation(invalidate);if(typeof off!=='function')closed=true;}catch{closed=true;}
  const ownerCurrent=()=>{try{return !closed&&owner.current()===true;}catch{return false;}};
  // No injected callbacks: this must be the final check after every foreign source/clock callback.
  const ownedCurrent=(job:Job)=>!closed&&!job.retired&&!job.controller.signal.aborted&&job.epoch===epoch&&job.routeGeneration===routeBroker.generation;
  const navigationModeAllowed=()=>routeBroker.mode==='ordinary';
  function guard(job:Job):void {
    if(!ownedCurrent(job)||!ownerCurrent()||!ownedCurrent(job))return stop('CANCELLED');
    let time:unknown;try{time=clock();}catch{return stop('CANCELLED');}
    if(!ownedCurrent(job))return stop('CANCELLED');
    if(typeof time!=='number'||!Number.isFinite(time)||time<job.lastTime||time-job.started>=UPDATE_CHECK_MS)return stop('TIMEOUT');job.lastTime=time;
    if(!ownerCurrent()||!ownedCurrent(job))return stop('CANCELLED');
  }
  async function run<T>(work:(job:Job)=>Promise<T>,external:AbortSignal|undefined):Promise<UpdateResult<T>>{
    if(closed)return refused('CANCELLED');if(physical)return refused('BUSY');
    let reject:(error:unknown)=>void=()=>{};const cancel=new Promise<never>((_,bad)=>reject=bad);let started=0;
    // Admission precedes clocks, owner, external listeners, source and storage callbacks.
    const job:Job={controller:new AbortController(),epoch,routeGeneration:routeBroker.generation,started:0,lastTime:0,cancel,reject,retired:false};physical=active=job;
    const onAbort=()=>{if(!job.retired){job.retired=true;job.controller.abort();job.reject(new Refused('CANCELLED'));}};
    let timer:ReturnType<typeof setTimeout>|undefined;
    const actual=Promise.resolve().then(async()=>{
      started=clock();if(!Number.isFinite(started)||started<0)return stop('CANCELLED');Object.assign(job,{started,lastTime:started});
      if(external!==undefined){const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;try{if(Reflect.apply(aborted,external,[]))onAbort();EventTarget.prototype.addEventListener.call(external,'abort',onAbort,{once:true});}catch{return stop('CANCELLED');}}
      timer=setTimeout(()=>{if(!job.retired){job.retired=true;job.controller.abort();job.reject(new Refused('TIMEOUT'));}},UPDATE_CHECK_MS);
      guard(job);const value=await work(job);guard(job);return good(value);
    }).catch(error=>refused(codeOf(error)));
    lastDrain=actual.then(async()=>{await http.drain();if(timer!==undefined)clearTimeout(timer);if(external)try{EventTarget.prototype.removeEventListener.call(external,'abort',onAbort);}catch{}
      if(active===job)active=undefined;if(physical===job)physical=undefined;});
    try{return await Promise.race([actual,cancel.then(()=>refused('CANCELLED'),error=>refused(codeOf(error)))]);}finally{/* Logical retirement cannot release physical admission. */}
  }
  const proofCurrent=(captured:number,routeGeneration:number)=>()=>!closed&&captured===epoch&&routeGeneration===transport.generation&&ownerCurrent()&&captured===epoch&&routeGeneration===transport.generation;
  const controller:AssetUpdateController=Object.freeze({
    async checkForUpdate(external?:AbortSignal):Promise<UpdateCheck>{
      if(physical)return Object.freeze({kind:'unreachable',reason:'BUSY'});invalidate();
      const result=await run(async job=>{
        const buffers:Uint8Array[]=[];const read=async(ref:UpdateEndpoint,max:number)=>{guard(job);const bytes=await http.read(endpoint(ref),max,job.controller.signal,()=>guard(job));guard(job);buffers.push(bytes);return bytes;};
        try{
          const saved=acceptedRelease(await store.read(job.controller.signal),pinned.channel,pinned.keyId);guard(job);const highest=floor(pinned,saved);
          const locatorBytes=await read(source.locator,4096),index=readUntrustedReleaseLocator(locatorBytes);if(!index.ok)return stop(index.error.code);
          const target=destination(pinned,index.value.cid,source.destination(index.value.cid));guard(job);
          const resolve=(kind:'manifest'|'manifest-envelope'|'asset',path?:string)=>{guard(job);const ref=endpoint(source.resolve(index.value.cid,kind,path));guard(job);if(new URL(ref.url).origin!==new URL(target).origin)return stop('ORIGIN_UNSUPPORTED');return ref;};
          const locatorEnvelope=envelope(await read(source.locatorEnvelope,UPDATE_ENVELOPE_BYTES));
          const manifestBytes=await read(resolve('manifest'),RELEASE_LIMITS.manifestBytes);
          const manifestEnvelope=envelope(await read(resolve('manifest-envelope'),UPDATE_ENVELOPE_BYTES));
          const parsed=readUntrustedReleaseManifest(manifestBytes);if(!parsed.ok)return stop(parsed.error.code);const manifest=parsed.value;
          if(manifest.assets.length===0)return stop('MANIFEST_UNSUPPORTED');
          if(pinned.storageSchema<manifest.minStorageSchema||pinned.storageSchema>manifest.maxStorageSchema)return stop('SCHEMA_INCOMPATIBLE');
          const assets=[];for(const asset of manifest.assets)assets.push({path:asset.path,bytes:await read(resolve('asset',asset.path),asset.bytes)});
          const verified=await verifyRelease(manifestBytes,manifestEnvelope,[pinned.key],highest.sequence,{channel:pinned.channel,assets,installedManifestSha256:highest.manifestSha256,nowSeconds:utc,signal:job.controller.signal,isCurrent:proofCurrent(job.epoch,job.routeGeneration)});
          guard(job);if(!verified.ok)return stop(verified.error.code);if(verified.value.keyId!==pinned.keyId)return stop('KEY_UNTRUSTED');
          const locator=await verifyReleaseLocator(locatorBytes,locatorEnvelope,verified.value,[pinned.key],{signal:job.controller.signal,isCurrent:proofCurrent(job.epoch,job.routeGeneration)});guard(job);if(!locator.ok)return stop(locator.error.code);
          if(verified.value.manifestSha256===pinned.current.manifestSha256&&manifest.sequence===pinned.current.sequence)return Object.freeze({kind:'none' as const});
          const review:UpdateReview=Object.freeze({current:Object.freeze({...pinned.current,keyId:pinned.keyId}),candidate:Object.freeze({sequence:manifest.sequence,manifestSha256:verified.value.manifestSha256,keyId:pinned.keyId,releaseId:manifest.releaseId,sourceCommit:manifest.sourceCommit,predecessorDigest:manifest.predecessorDigest}),
            minStorageSchema:manifest.minStorageSchema,maxStorageSchema:manifest.maxStorageSchema,destination:target,assets:manifest.assets,
            changeSummary:'Manifest and asset identities only; no signed human change summary is supplied.',freshOriginAcceptedState:saved===null,backupRequired:true,releaseEnabled:false});
          guard(job);const token=Object.freeze({});candidate={token,verified:verified.value,locator:locator.value.locator,review,controller:job.controller};
          return Object.freeze({kind:'candidate' as const,candidate:token,review});
        }finally{for(const bytes of buffers)bytes.fill(0);}
      },external);
      if(result.ok)return result.value;const code=result.error.code;
      return Object.freeze({kind:code==='MANIFEST_EXPIRED'||code==='RELEASE_ROLLBACK'?'stale':code==='UNAVAILABLE'||code==='ROUTE_UNAVAILABLE'||code==='TIMEOUT'||code==='CANCELLED'||code==='BUSY'||code==='POLICY_BLOCKED'?'unreachable':'untrusted',reason:code});
    },
    async acceptUpdate(input:unknown,external?:AbortSignal){
      const selected=candidate;if(!selected||input!==selected.token)return refused('UPDATE_UNTRUSTED');
      return run(async job=>{
        let selection:UpdateBackupSelection|undefined,lease:UpdateWalletLease|undefined;
        const live=()=>{guard(job);if(!navigationModeAllowed())return stop('POLICY_BLOCKED');const valid=revalidateRelease(selected.verified);if(!valid.ok)return stop(valid.error.code);if(candidate!==selected)return stop('CANCELLED');if(selection&&!selection.current())return stop('BACKUP_REQUIRED');if(lease&&!lease.current())return stop('BUSY');guard(job);if(!navigationModeAllowed()||!ownedCurrent(job))return stop('CANCELLED');};
        try{
          live();if(!owner.isUserGesture())return stop('UPDATE_UNTRUSTED');live();
          lease=wallet.acquire()??undefined;live();if(!lease)return stop('BUSY');selection=backup.capture()??undefined;live();if(!selection)return stop('BACKUP_REQUIRED');
          try{await selection.requireVerifiedBackup(job.controller.signal);}catch{return stop('BACKUP_REQUIRED');}live();
          const saved=acceptedRelease(await store.read(job.controller.signal),pinned.channel,pinned.keyId);live();const highest=floor(pinned,saved),m=selected.verified.manifest;
          if(m.sequence<highest.sequence||m.sequence===highest.sequence&&selected.verified.manifestSha256!==highest.manifestSha256)return stop('RELEASE_ROLLBACK');
          const next:AcceptedRelease=Object.freeze({v:1,channel:pinned.channel,keyId:pinned.keyId,sequence:m.sequence,manifestSha256:selected.verified.manifestSha256});
          const committed=await store.advance(saved,next,job.controller.signal,live);live();if(committed==='conflict')return stop('CONFLICT');
          try{await selection.requireVerifiedBackup(job.controller.signal);}catch{return stop('BACKUP_REQUIRED');}live();
          await lease.disconnect(job.controller.signal);live();
          // Only this final operation may intentionally retire the captured profile. Owner cancellation remains fatal.
          await selection.lock(job.controller.signal);live();
          navigation.openVerifiedDestination(selected.review.destination);live();candidate=undefined;
          return Object.freeze({destination:selected.review.destination,acceptedSequence:m.sequence,releaseEnabled:false as const});
        }finally{try{selection?.dispose();}catch{}try{lease?.release();}catch{}}
      },external);
    },
    cancel:invalidate,
    dispose(){if(!closed){closed=true;invalidate();try{off();}catch{}store.close();}return lastDrain;},
  });return controller;
}
