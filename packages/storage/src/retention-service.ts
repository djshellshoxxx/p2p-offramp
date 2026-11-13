/** DATA01 Worker-private retention. No network or native proof provider is installed by default. */
import {
  decodeBase64url, decodeIntentPayload, intentData, MAX_PAYLOAD_BYTES, MAX_RECORDS,
  MAX_SNAPSHOT_JSON_BYTES, parseSavedReviewPayload, parseStrictJsonBytes,
  type PrivateRecordV1, type Result, type VaultService, type VaultSession, type IntentV1, type CoreResult,
  type VaultSessionAuthority, type VaultSessionLease,
} from '../../schemas/index.ts';
import type { EncryptedVaultService } from './vault-service.ts';

export const RETENTION_REVIEW_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_RETENTION_DELETES = 256;
export type RetentionPurpose = 'terminal-intent' | 'saved-terms-review' | 'chat-history';
export type RetentionErrorCode = 'INVALID_INPUT' | 'LOCKED' | 'CANCELLED' | 'CONFLICT' |
  'LIMIT_EXCEEDED' | 'NOT_FOUND' | 'NATIVE_PROOF_REQUIRED' | 'UNAVAILABLE';
export type RetentionResult<T> = { readonly ok:true; readonly value:T } |
  { readonly ok:false; readonly error:Readonly<{code:RetentionErrorCode; message:string}> };
export interface RetentionCandidate {
  readonly record:Readonly<PrivateRecordV1>; readonly purpose:RetentionPurpose;
  /** Local timestamp for a review suggestion only. Never native finality or deletion authority. */
  readonly reviewTimestamp:number|null;
  readonly conversationId:string|null;
  /** Durable chat-history sequence (1..N per conversation); null for non-chat purposes. */
  readonly receivedSequence:number|null;
}
export interface RetentionScope {
  readonly profileId:string; readonly revision:number;
  readonly records:readonly Readonly<PrivateRecordV1>[];
  readonly candidates:readonly RetentionCandidate[];
}
/** A maintained local capability, never imported JSON or a persisted state label.
 * reviewNative must authenticate exact candidate bytes and establish closed local dependency scope
 * using fresh trusted native observations. safeRecordIds is ONE closed deletion set, not independent
 * permissions whose arbitrary subsets remain safe. current must invalidate on native/scope changes.
 * Saved terms need trusted canonical trade/party resolution; chat needs native conversation authentication.
 * No implementation of this cross-domain native adapter is silently supplied here.
 */
export interface NativeRetentionLease {
  readonly scope:RetentionScope; readonly safeRecordIds:readonly string[];
  current():boolean; dispose():void;
}
export interface NativeRetentionAuthority {
  reviewNative(scope:RetentionScope, signal:AbortSignal):Promise<NativeRetentionLease>;
}
/** Opaque identity-bound capability. Serializing these counts cannot transfer deletion permission. */
export interface RetentionPlan {
  readonly version:1; readonly revision:number; readonly archiveReviewCount:number;
  readonly reviewedDeleteCount:number; readonly protectedCount:number;
  readonly logicalOnly:true; readonly backupAndRemoteCopiesUnaffected:true;
}
export interface RetentionConsent {
  readonly version:1; readonly expectedRevision:number; readonly consentRevision:number;
  readonly reviewed:true; readonly logicalOnly:true; readonly backupAndRemoteLimitsAcknowledged:true;
}
export interface RetentionDeleteReceipt {
  readonly revision:number; readonly deletedCount:number;
  readonly logicalOnly:true; readonly backupAndRemoteCopiesUnaffected:true;
}
type RetentionVault = Pick<VaultService,'list'|'commit'> & VaultSessionAuthority & Pick<EncryptedVaultService,'assertFresh'>;
interface PlanState { readonly revision:number; readonly selected:readonly string[]; }
interface Job { readonly revision:number; readonly controller:AbortController; }
class Failure extends Error { readonly code:RetentionErrorCode; constructor(code:RetentionErrorCode){super('Local retention operation unavailable.');this.code=code;} }
const isAborted=(signal:AbortSignal):boolean=>Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!.call(signal) as boolean;
const listen=(signal:AbortSignal,callback:()=>void):void=>EventTarget.prototype.addEventListener.call(signal,'abort',callback,{once:true});
const unlisten=(signal:AbortSignal,callback:()=>void):void=>EventTarget.prototype.removeEventListener.call(signal,'abort',callback);
const fail = (code:RetentionErrorCode):never => {throw new Failure(code);};
function error<T>(code:RetentionErrorCode):RetentionResult<T>{return {ok:false,error:Object.freeze({code,message:'Local retention operation unavailable.'})};}
function unwrap<T>(result:Result<T>):T {
  if(result.ok)return result.value;
  const code=result.error.code;
  if(code==='LOCKED'||code==='CANCELLED'||code==='CONFLICT'||code==='INVALID_INPUT'||code==='LIMIT_EXCEEDED'||code==='NOT_FOUND')return fail(code);
  return fail('UNAVAILABLE');
}
function integer(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
function array(input:unknown,max:number):unknown[]{
  if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)return fail('INVALID_INPUT');
  const descriptor=Object.getOwnPropertyDescriptor(input,'length');
  const length:unknown=descriptor&&'value'in descriptor?descriptor.value:undefined;
  if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||length>max||Reflect.ownKeys(input).length!==length+1)return fail('INVALID_INPUT');
  const values:unknown[]=[];
  for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d||!('value'in d))return fail('INVALID_INPUT');values.push(d.value);}
  return values;
}
function snapshot(input:unknown):readonly Readonly<PrivateRecordV1>[] {
  const ids=new Set<string>();let size=2;
  const result=array(input,MAX_RECORDS).map(value=>{
    const r=intentData(value,['id','kind','schemaVersion','payload']);
    if(typeof r.id!=='string'||!/^[0-9a-f]{32}$/.test(r.id)||ids.has(r.id)||typeof r.kind!=='string'||
      !['identity','preference','trade','chat','journal'].includes(r.kind)||!integer(r.schemaVersion)||r.schemaVersion<1||
      typeof r.payload!=='string'||r.payload.length>Math.ceil(MAX_PAYLOAD_BYTES*4/3))return fail('INVALID_INPUT');
    ids.add(r.id);size+=JSON.stringify(r).length+1;if(size>MAX_SNAPSHOT_JSON_BYTES)return fail('LIMIT_EXCEEDED');
    return Object.freeze(r) as unknown as Readonly<PrivateRecordV1>;
  });
  return Object.freeze(result);
}
function classify(record:Readonly<PrivateRecordV1>):RetentionCandidate|null {
  if(record.schemaVersion!==1)return null;
  try {
    if(record.kind==='trade'){
      const saved=parseSavedReviewPayload(record.payload,record.schemaVersion);
      if(!saved)return null;
      saved.terms.fill(0);
      // Saved review v1 contains no collection timestamp. Never invent an age from its file or terms.
      return Object.freeze({record,purpose:'saved-terms-review',reviewTimestamp:null,conversationId:null,receivedSequence:null});
    }
    if(record.kind==='journal'){
      const intent=decodeIntentPayload(record.payload);
      if(intent.state!=='finalized'&&intent.state!=='failed')return null;
      return Object.freeze({record,purpose:'terminal-intent',reviewTimestamp:intent.updatedAt,conversationId:null,receivedSequence:null});
    }
    if(record.kind==='chat'){
      const bytes=decodeBase64url(record.payload,1,MAX_PAYLOAD_BYTES);
      try {
        const r=intentData(parseStrictJsonBytes(bytes,MAX_PAYLOAD_BYTES),['format','version','conversationId','receivedSequence','receivedAt','wrap']);
        if(r.format!=='p2p-offramp-chat-history'||r.version!==1||typeof r.conversationId!=='string'||!/^[a-f0-9]{64}$/.test(r.conversationId)||
          !integer(r.receivedSequence)||r.receivedSequence<1||!integer(r.receivedAt)||!r.wrap||typeof r.wrap!=='object')return null;
        return Object.freeze({record,purpose:'chat-history',reviewTimestamp:r.receivedAt,conversationId:r.conversationId,receivedSequence:r.receivedSequence});
      } finally {bytes.fill(0);}
    }
  } catch {/* Unknown, damaged, future or opaque namespaces are retained. */}
  return null;
}

export class RetentionService {
  readonly #vault:RetentionVault; readonly #lease:VaultSessionLease;
  readonly #authority:NativeRetentionAuthority|undefined;
  #closed=false; #active:Job|undefined; #plans=new WeakMap<object,PlanState>();
  constructor(vault:RetentionVault, session:VaultSession, authority?:NativeRetentionAuthority){
    this.#vault=vault;this.#authority=authority;
    this.#lease=unwrap(vault.captureSession(session,()=>this.dispose()));
  }
  dispose():void {if(this.#closed)return;this.#closed=true;this.#active?.controller.abort();this.#plans=new WeakMap();this.#lease?.dispose();}
  #guard(job:Job):Readonly<VaultSession>{
    const session=this.#lease.current();
    if(this.#closed||!session)return fail('LOCKED');
    if(job.controller.signal.aborted)return fail('CANCELLED');
    if(session.revision!==job.revision)return fail('CONFLICT');
    return session;
  }
  async #run<T>(signal:AbortSignal|undefined,operation:(job:Job)=>Promise<T>):Promise<RetentionResult<T>>{
    let job:Job|undefined;const abort=()=>job?.controller.abort();
    try {
      if(signal!==undefined&&!(signal instanceof AbortSignal))return error('INVALID_INPUT');
      if(signal&&isAborted(signal))return error('CANCELLED');
      if(this.#active)return error('CONFLICT');
      const session=this.#lease.current();if(this.#closed||!session)return error('LOCKED');
      job={revision:session.revision,controller:new AbortController()};this.#active=job;
      if(signal){listen(signal,abort);if(isAborted(signal))abort();}
      return {ok:true,value:await operation(job)};
    } catch(thrown){
      try {if(thrown instanceof Failure)return error(thrown.code);}catch{/* hostile thrown values have no authority */}
      return error('UNAVAILABLE');
    } finally {if(signal){try{unlisten(signal,abort);}catch{/* invalid foreign signal has no authority */}}if(this.#active===job)this.#active=undefined;}
  }
  async #scan(job:Job):Promise<RetentionScope>{
    const session=this.#guard(job);
    const fresh=unwrap(await this.#vault.assertFresh(session.sessionId,job.controller.signal));this.#guard(job);
    if(fresh!==job.revision)return fail('CONFLICT');
    const records=snapshot(unwrap(await this.#vault.list(session.sessionId)));this.#guard(job);
    const candidates=Object.freeze(records.map(classify).filter((v):v is RetentionCandidate=>v!==null));
    return Object.freeze({profileId:session.profileId,revision:job.revision,records,candidates});
  }
  async #review(scope:RetentionScope,job:Job):Promise<NativeRetentionLease|undefined>{
    if(!this.#authority)return undefined;
    const received=await this.#authority.reviewNative(scope,job.controller.signal);
    let dispose:(()=>void)|undefined;
    try {
      const raw=intentData(received,['scope','safeRecordIds','current','dispose']);
      if(typeof raw.dispose!=='function'||typeof raw.current!=='function')return fail('NATIVE_PROOF_REQUIRED');
      const disposeMethod=raw.dispose,currentMethod=raw.current;
      let disposed=false;
      dispose=()=>{if(disposed)return;disposed=true;disposeMethod.call(received);};
      this.#guard(job);
      if(raw.scope!==scope||currentMethod.call(received)!==true)return fail('NATIVE_PROOF_REQUIRED');
      const ids=array(raw.safeRecordIds,MAX_RECORDS);
      const allowed=new Map(scope.candidates.map(c=>[c.record.id,c]));const selected=new Set<string>();
      for(const id of ids){if(typeof id!=='string'||selected.has(id)||!allowed.has(id))return fail('NATIVE_PROOF_REQUIRED');selected.add(id);}
      // Existing durable history requires sequences 1..N. No partial-conversation deletion is allowed.
      const conversations=new Map<string,{total:number;selected:number;sequences:number[]}>();let classifiedChat=0;
      for(const c of scope.candidates)if(c.conversationId!==null){classifiedChat++;const group=conversations.get(c.conversationId)??{total:0,selected:0,sequences:[]};group.total++;group.sequences.push(c.receivedSequence??0);if(selected.has(c.record.id))group.selected++;conversations.set(c.conversationId,group);}
      const chosen=[...conversations.values()].filter(group=>group.selected>0);
      // Fail closed: an unclassifiable (malformed/future/opaque) chat record cannot be excluded from any selected conversation.
      if(chosen.length>0&&scope.records.filter(r=>r.kind==='chat').length!==classifiedChat)return fail('NATIVE_PROOF_REQUIRED');
      for(const group of chosen){
        if(group.selected!==group.total)return fail('NATIVE_PROOF_REQUIRED');
        const sequences=group.sequences.sort((left,right)=>left-right);
        if(sequences.some((sequence,index)=>sequence!==index+1))return fail('NATIVE_PROOF_REQUIRED');
      }
      this.#guard(job);if(currentMethod.call(received)!==true)return fail('NATIVE_PROOF_REQUIRED');
      this.#guard(job);
      const current=()=>{if(disposed)return false;const value=currentMethod.call(received);this.#guard(job);return value===true&&!disposed;};
      return Object.freeze({scope,safeRecordIds:Object.freeze([...selected]),current,dispose});
    } catch(thrown){try{dispose?.();}catch{/* do not expose callback failures */}throw thrown;}
  }

  /** Local classification only. This never invokes the native authority or performs network work. */
  planRetention(nowMs:number,signal?:AbortSignal):Promise<RetentionResult<RetentionPlan>>{
    return this.#plan(nowMs,false,signal);
  }
  /** Explicit native dependency review, separate from the offline age/count preview. */
  reviewRetention(nowMs:number,signal?:AbortSignal):Promise<RetentionResult<RetentionPlan>>{
    return this.#plan(nowMs,true,signal);
  }
  #plan(nowMs:number,nativeReview:boolean,signal?:AbortSignal):Promise<RetentionResult<RetentionPlan>>{
    return this.#run(signal,async job=>{
      if(!integer(nowMs))return fail('INVALID_INPUT');
      const scope=await this.#scan(job);const proof=nativeReview?await this.#review(scope,job):undefined;
      let plan:RetentionPlan;
      let selected:readonly string[];
      try {
        this.#guard(job);
        selected=proof?Object.freeze([...proof.safeRecordIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)):Object.freeze([] as string[]);
        if(proof&&proof.current()!==true)return fail('NATIVE_PROOF_REQUIRED');
        const archiveReviewCount=scope.candidates.filter(c=>c.reviewTimestamp!==null&&c.reviewTimestamp<=nowMs&&nowMs-c.reviewTimestamp>=RETENTION_REVIEW_AGE_MS).length;
        plan=Object.freeze({version:1,revision:job.revision,archiveReviewCount,reviewedDeleteCount:selected.length,
          protectedCount:scope.records.length-selected.length,logicalOnly:true,backupAndRemoteCopiesUnaffected:true});
      } finally {proof?.dispose();}
      // Cleanup is an external callback too: it must finish before the final owned session check.
      this.#guard(job);
      this.#plans.set(plan,{revision:job.revision,selected});
      return plan;
    });
  }
  /** The caller's explicit consent revision is the reviewed plan's revision, not persisted approval metadata. */
  deleteReviewedRecords(plan:RetentionPlan,consent:RetentionConsent,signal?:AbortSignal):Promise<RetentionResult<RetentionDeleteReceipt>>{
    return this.#run(signal,async job=>{
      const stored=this.#plans.get(plan);
      if(!stored)return fail('INVALID_INPUT');
      const c=intentData(consent,['version','expectedRevision','consentRevision','reviewed','logicalOnly','backupAndRemoteLimitsAcknowledged']);
      if(c.version!==1||c.expectedRevision!==stored.revision||c.consentRevision!==stored.revision||c.reviewed!==true||c.logicalOnly!==true||c.backupAndRemoteLimitsAcknowledged!==true)return fail('INVALID_INPUT');
      if(stored.revision!==job.revision)return fail('CONFLICT');
      if(stored.selected.length===0)return fail('NATIVE_PROOF_REQUIRED');
      if(stored.selected.length>MAX_RETENTION_DELETES)return fail('LIMIT_EXCEEDED');
      const scope=await this.#scan(job);const proof=await this.#review(scope,job);
      try {
        if(!proof)return fail('NATIVE_PROOF_REQUIRED');
        const selected=[...proof.safeRecordIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
        if(selected.length!==stored.selected.length||selected.some((id,index)=>id!==stored.selected[index]))return fail('CONFLICT');
        const guard=()=>{this.#guard(job);if(proof.current()!==true)return fail('NATIVE_PROOF_REQUIRED');this.#guard(job);};
        guard();
        const revision=unwrap(await this.#vault.commit(this.#guard(job).sessionId,job.revision,selected.map(id=>({op:'delete' as const,id})),job.controller.signal,guard));
        // G02 success is durable. A subsequent lock/cancel cannot turn it into a false failure.
        this.#plans.delete(plan);
        return Object.freeze({revision,deletedCount:selected.length,logicalOnly:true,backupAndRemoteCopiesUnaffected:true});
      } finally {try{proof?.dispose();}catch{/* cleanup cannot reverse a durable commit */}}
    });
  }
}

/** Structural ports of the EXISTING G12 lifecycle journal/coordinator; this module owns no chain decoder. */
export interface RetentionJournalPort {
  list(signal?:AbortSignal):Promise<CoreResult<readonly IntentV1[]>>;
  currentRevision():number|null;
  isTerminalVerified(intentId:string):boolean;
}
export interface RetentionReconcilerPort {
  reconcile(intentId:string,signal?:AbortSignal):Promise<CoreResult<{
    readonly outcome:string; readonly intent:IntentV1; readonly evidence:string; readonly escrowState:string|null;
  }>>;
}
/** Worker-private live capability minted only after actual finalized native payout/credit checks.
 * Imported receipts or a terminal status are not a payout closure. The producer must read the
 * correct asset/recipient at coherent canonical anchors and revoke on scope/source/freshness changes.
 */
export interface NativePayoutClosureLease {
  readonly scope:RetentionScope; readonly intents:readonly IntentV1[];
  current():boolean; dispose():void;
}
export interface NativePayoutClosureAuthority {
  reviewPayoutClosure(scope:RetentionScope,intents:readonly IntentV1[],signal:AbortSignal):Promise<NativePayoutClosureLease>;
}
export interface JournalRetentionOptions {
  readonly vault:RetentionVault; readonly session:VaultSession;
  /** Reconciliation must use a read-only vault; needed transitions require ordinary reconciliation first. */
  readonly journal:RetentionJournalPort; readonly reconciler:RetentionReconcilerPort;
  readonly payoutClosure?:NativePayoutClosureAuthority;
  /** Maintained source/lifecycle capability, never imported freshness metadata. Invalidate on native source changes. */
  readonly currentScope:()=>boolean;
  readonly now?:()=>number; readonly maxAgeMs?:number;
}
/** Narrow real adapter: journal-only profiles, EVM finalized/failed records AND released/refunded escrow, current native reconciliation and a live exact-scope native payout-closure lease.
 * Saved terms, chat, identities, opaque payloads and nonterminal profiles remain unsupported by THIS adapter.
 * An actual reconciliation that changes the G02 revision requires a new explicit review; no hidden retry/write.
 */
export class JournalNativeRetentionAuthority implements NativeRetentionAuthority {
  readonly #lease:VaultSessionLease; readonly #journal:RetentionJournalPort;
  readonly #reconciler:RetentionReconcilerPort; readonly #payoutClosure:NativePayoutClosureAuthority|undefined; readonly #currentScope:()=>boolean;
  readonly #now:()=>number; readonly #maxAge:number;
  #disposed=false; #epoch=0; #active:AbortController|undefined;
  constructor(options:JournalRetentionOptions){
    const maxAge=options.maxAgeMs??5000;
    if(typeof options.currentScope!=='function'||typeof (options.now??performance.now)!=='function'||
      !integer(maxAge)||maxAge<1||maxAge>30_000)throw new Failure('INVALID_INPUT');
    this.#journal=options.journal;this.#reconciler=options.reconciler;this.#payoutClosure=options.payoutClosure;this.#currentScope=options.currentScope;
    this.#now=options.now??(()=>performance.now());this.#maxAge=maxAge;
    this.#lease=unwrap(options.vault.captureSession(options.session,()=>this.dispose()));
  }
  dispose():void {if(this.#disposed)return;this.#disposed=true;this.#epoch++;this.#active?.abort();this.#lease?.dispose();}
  async reviewNative(scope:RetentionScope,external:AbortSignal):Promise<NativeRetentionLease>{
    const controller=new AbortController(),epoch=++this.#epoch;
    this.#active?.abort();this.#active=controller;
    const abort=()=>controller.abort();listen(external,abort);if(isAborted(external))abort();
    let payoutDispose:(()=>void)|undefined,payoutCurrent:(()=>boolean)|undefined;
    let proofDisposed=false,handedOff=false,last=Number.NaN,started=Number.NaN;
    // No injected callback may run after this final owned lifecycle predicate.
    const ownedCurrent=():boolean=>!this.#disposed&&!proofDisposed&&this.#epoch===epoch&&!controller.signal.aborted;
    const current=():boolean=>{
      try {
        if(!ownedCurrent())return false;
        const time=this.#now();
        const sourceCurrent=this.#currentScope();
        const revision=this.#journal.currentRevision();
        const session=this.#lease.current();
        if(sourceCurrent!==true||!session||session.profileId!==scope.profileId||session.revision!==scope.revision||revision!==scope.revision||
          !Number.isFinite(time)||time<last||time<started||time-started>=this.#maxAge)return false;
        last=time;
        return ownedCurrent();
      }catch{return false;}
    };
    const guard=()=>{if(!current())return fail('NATIVE_PROOF_REQUIRED');};
    const dispose=()=>{if(proofDisposed)return;proofDisposed=true;try{unlisten(external,abort);}finally{controller.abort();try{payoutDispose?.();}catch{/* Cleanup cannot alter a durable outcome. */}if(this.#active===controller)this.#active=undefined;}};
    try {
      const reviewPayout=this.#payoutClosure?.reviewPayoutClosure;if(typeof reviewPayout!=='function')return fail('NATIVE_PROOF_REQUIRED');
      started=last=this.#now();
      if(!Number.isFinite(started)||started<0)return fail('NATIVE_PROOF_REQUIRED');
      guard();
      if(scope.records.length<1||scope.records.length>MAX_RETENTION_DELETES||scope.records.some(r=>r.kind!=='journal'||r.schemaVersion!==1)||
        scope.candidates.length!==scope.records.length||scope.candidates.some(c=>c.purpose!=='terminal-intent'))return fail('NATIVE_PROOF_REQUIRED');
      const expected=Object.freeze(scope.records.map(record=>decodeIntentPayload(record.payload)));
      if(expected.some(intent=>intent.binding.chain!=='evm'||!['finalized','failed'].includes(intent.state))||
        new Set(expected.map(intent=>intent.intentId)).size!==expected.length)return fail('NATIVE_PROOF_REQUIRED');
      const listed=await this.#journal.list(controller.signal);guard();
      if(!listed.ok)return fail('NATIVE_PROOF_REQUIRED');
      const actual=array(listed.value,MAX_RETENTION_DELETES);
      if(actual.length!==expected.length||actual.some((intent,index)=>JSON.stringify(intent)!==JSON.stringify(expected[index])))return fail('NATIVE_PROOF_REQUIRED');
      const verified:string[]=[];
      for(const intent of expected){
        guard();const result=await this.#reconciler.reconcile(intent.intentId,controller.signal);guard();
        if(!result.ok||JSON.stringify(result.value.intent)!==JSON.stringify(intent)||
          !(result.value.outcome==='finalized'||result.value.outcome==='reverted')||
          !['released','refunded'].includes(result.value.escrowState??'')||result.value.evidence==='none'||!this.#journal.isTerminalVerified(intent.intentId))return fail('NATIVE_PROOF_REQUIRED');
        verified.push(intent.intentId);
      }
      let received:NativePayoutClosureLease;
      try{received=await reviewPayout.call(this.#payoutClosure,scope,expected,controller.signal);}catch{return fail('NATIVE_PROOF_REQUIRED');}
      let payout:Record<string,unknown>;try{payout=intentData(received,['scope','intents','current','dispose']);}catch{return fail('NATIVE_PROOF_REQUIRED');}
      if(typeof payout.current!=='function'||typeof payout.dispose!=='function')return fail('NATIVE_PROOF_REQUIRED');
      const payoutCurrentMethod=payout.current,payoutDisposeMethod=payout.dispose;let payoutDisposed=false;
      payoutDispose=()=>{if(payoutDisposed)return;payoutDisposed=true;payoutDisposeMethod.call(received);};
      payoutCurrent=()=>{if(payoutDisposed)return false;const result=payoutCurrentMethod.call(received);return result===true&&!payoutDisposed;};
      guard();
      // These are live original object identities, not a cloneable receipt or imported paid flag.
      if(payout.scope!==scope||payout.intents!==expected||!payoutCurrent())return fail('NATIVE_PROOF_REQUIRED');
      guard();
      const proofCurrent=():boolean=>{
        if(!current()||!payoutCurrent?.())return false;
        for(const id of verified)if(!this.#journal.isTerminalVerified(id))return false;
        // Source/terminal callbacks may retire the payout lease while returning true. End with both payout and owned lifecycle checks.
        return current()&&payoutCurrent?.()===true&&ownedCurrent();
      };
      if(!proofCurrent())return fail('NATIVE_PROOF_REQUIRED');
      const proof=Object.freeze({scope,safeRecordIds:Object.freeze(scope.records.map(r=>r.id)),current:proofCurrent,dispose});
      handedOff=true;return proof;
    } finally {if(!handedOff)dispose();}
  }
}
