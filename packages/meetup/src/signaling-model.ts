/** MEET05 in-memory diagnostics only. No authenticated carrier, peer object, send or restart operation. */
import {createPolicyOwner,policyResult,policyStop,policyText,type PolicyScope} from './policy-data.ts';
import {sha256} from '@noble/hashes/sha2.js';
import {data,hex,integer} from './shared.ts';
import {inspectRelayCandidate,inspectRelaySdp} from './rtc-policy.ts';
export interface SignalDiagnosticOptions {readonly scope:PolicyScope;readonly consentGeneration:number;readonly sessionId:string;readonly isCurrent:(scope:PolicyScope,consentGeneration:number)=>boolean;readonly clock:{wallMs:()=>number;monotonicMs:()=>number};}
interface Signal {readonly v:1;readonly type:'offer'|'answer'|'candidate'|'close';readonly tradeHash:string;readonly termsHash:string;readonly sessionId:string;readonly generation:number;readonly seq:number;readonly sender:string;readonly recipient:string;readonly issuedAtMs:number;readonly expiresAtMs:number;readonly payload:string;}
const fields=['v','type','tradeHash','termsHash','sessionId','generation','seq','sender','recipient','issuedAtMs','expiresAtMs','payload'];
const MAX_PENDING_BYTES=262144;
const fingerprint=(text:string):string=>{const bytes=new TextEncoder().encode(text),digest=sha256(bytes);try{return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');}finally{bytes.fill(0);digest.fill(0);}};
function parse(input:unknown):{message:Signal;encoded:string;bytes:number}{
 const r=data(input,fields);if(r.v!==1)return policyStop('UNSUPPORTED_VERSION');if(!['offer','answer','candidate','close'].includes(r.type as string))return policyStop();
 if(typeof r.payload!=='string'||r.payload.length>(r.type==='candidate'?2048:73728)||/[\uD800-\uDFFF]/u.test(r.payload))return policyStop();
 const payload=r.payload,message=Object.freeze({v:1 as const,type:r.type as Signal['type'],tradeHash:hex(r.tradeHash,64),termsHash:hex(r.termsHash,64),sessionId:policyText(r.sessionId,128),generation:integer(r.generation),seq:integer(r.seq),sender:hex(r.sender,64),recipient:hex(r.recipient,64),issuedAtMs:integer(r.issuedAtMs),expiresAtMs:integer(r.expiresAtMs),payload});
 const encoded=JSON.stringify(message),bytes=new TextEncoder().encode(encoded).byteLength;if(message.expiresAtMs>Number.MAX_SAFE_INTEGER-300000)return policyStop();
 if(bytes>73728||message.type==='candidate'&&new TextEncoder().encode(payload).byteLength>2048)return policyStop('CAPACITY_EXCEEDED');
 return{message,encoded,bytes};
}
export function createSignalDiagnosticModel(options:SignalDiagnosticOptions){return policyResult(()=>{
 const consentGeneration=integer(options.consentGeneration),sessionId=policyText(options.sessionId,128),wall=options.clock.wallMs.bind(options.clock),mono=options.clock.monotonicMs.bind(options.clock);
 if(typeof options.isCurrent!=='function')return policyStop();
 const current=options.isCurrent.bind(options),owner=createPolicyOwner(options.scope,scope=>current(scope,consentGeneration));
 let closed=false,reason:string|null=null,last=-1,started=0,lastWall=-1,pendingBytes=0,offered=false,answered=false;
 const next=new Map<string,number>(),pending=new Map<string,{message:Signal;bytes:number;arrived:number}>(),replay=new Map<string,{fingerprint:string;until:number}>();
 const scope=owner.scope,initiator=[scope.accountKey,scope.peerKey].sort()[0]!;
 const close=(why:string,revoke=true)=>{if(closed)return;closed=true;reason=why;pending.clear();replay.clear();next.clear();pendingBytes=0;if(revoke)owner.close();};
 owner.onClose(()=>{closed=true;reason??='scope-closed';pending.clear();replay.clear();next.clear();pendingBytes=0;});
 const time=()=>{owner.guard();const m=mono();owner.guard();const w=wall();owner.guard();if(!Number.isSafeInteger(m)||m<0||m<last||!Number.isSafeInteger(w)||w<0||w<lastWall){close('clock-uncertain',false);return policyStop('CLOCK_ROLLBACK');}last=m;lastWall=w;return{m,w};};
 const view=(outcome:'observed'|'buffered'|'duplicate'|'stale-generation'|'idle'|'closed')=>Object.freeze({diagnosticOnly:true as const,economicAuthority:false as const,authenticated:false as const,wireCompatible:false as const,networkExecutionAllowed:false as const,physicalPresence:'unverified' as const,state:closed?'closed' as const:'negotiating' as const,reason,outcome,pendingCount:pending.size,pendingBytes,replayCount:replay.size,deliveredCount:[...next.values()].reduce((a,b)=>a+b,0)});
 const check=()=>{const t=time();if(t.m-started>=30000){close('negotiation-timeout',false);return policyStop('TIMEOUT');}
  for(const item of pending.values())if(t.m-item.arrived>=5000){close('sequence-gap-timeout',false);return policyStop('TIMEOUT');}
  for(const[key,item]of replay)if(t.w>=item.until)replay.delete(key);return t;};
 const fresh=(s:Signal,w:number)=>{if(s.expiresAtMs<=s.issuedAtMs||s.expiresAtMs-s.issuedAtMs>60000||s.issuedAtMs-w>30000||w>=s.expiresAtMs||w-s.issuedAtMs>90000)return policyStop('EXPIRED');};
 const deliver=(s:Signal)=>{
  if(s.type==='offer'){if(s.sender!==initiator||offered)return policyStop('INTEGRITY_FAILURE');offered=true;}
  else if(s.type==='answer'){if(!offered||answered||s.sender===initiator)return policyStop('INTEGRITY_FAILURE');answered=true;}
  else if(s.type==='candidate'){if(!answered)return policyStop('INTEGRITY_FAILURE');}
  else{close('claimed-close',false);return;}
  next.set(s.sender,s.seq+1);
 };
 try{started=time().m;}catch(error){close('constructor-failed');throw error;}
 const run=<T>(work:()=>Promise<T>)=>owner.run(work).finally(()=>{if(closed)owner.close();});
 return Object.freeze({
  observe(input:unknown){return run(async()=>{try{check();const parsed=parse(input),s=parsed.message,t=check();
   if(s.tradeHash!==scope.tradeHash||s.termsHash!==scope.termsHash||s.sessionId!==sessionId||s.sender!==scope.accountKey&&s.sender!==scope.peerKey||s.recipient!==(s.sender===scope.accountKey?scope.peerKey:scope.accountKey))return policyStop('INTEGRITY_FAILURE');
   if(s.generation!==0)return view('stale-generation');fresh(s,t.w);
   if(s.type==='candidate'&&!inspectRelayCandidate(s.payload).ok||s.type==='offer'&&!inspectRelaySdp(s.payload).ok||s.type==='answer'&&!inspectRelaySdp(s.payload).ok)return policyStop('INTEGRITY_FAILURE');
   const key=s.sender+'/'+s.generation+'/'+s.seq,mark=fingerprint(parsed.encoded),previous=replay.get(key);if(previous){if(previous.fingerprint!==mark)return policyStop('INTEGRITY_FAILURE');return view('duplicate');}
   const expected=next.get(s.sender)??0;if(s.seq<expected)return policyStop('INTEGRITY_FAILURE');if(s.seq-expected>32||replay.size>=256)return policyStop('CAPACITY_EXCEEDED');
   if(s.seq>expected&&(pending.size>=32||pendingBytes+parsed.bytes>MAX_PENDING_BYTES))return policyStop('CAPACITY_EXCEEDED');
   check();replay.set(key,{fingerprint:mark,until:s.expiresAtMs+300000});
   if(s.seq>expected){pending.set(key,{message:s,bytes:parsed.bytes,arrived:t.m});pendingBytes+=parsed.bytes;return view('buffered');}
   deliver(s);if(closed)return view('closed');
   while(true){const wanted=s.sender+'/0/'+next.get(s.sender),item=pending.get(wanted);if(!item)break;fresh(item.message,check().w);pending.delete(wanted);pendingBytes-=item.bytes;deliver(item.message);if(closed)break;}
   return view(closed?'closed':'observed');
  }catch(error){close('signal-refused',false);throw error;}});},
  tick(){return run(async()=>{try{check();return view('idle');}catch(error){close('time-refused',false);throw error;}});},
  inspect(){return closed?Promise.resolve(Object.freeze({ok:true as const,value:view('closed')})):run(async()=>{try{check();return view('idle');}catch(error){close('time-refused',false);throw error;}});},
  close(){close('explicit-close');return view('closed');},
 });
});}
