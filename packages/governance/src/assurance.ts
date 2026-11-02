/** LEGAL01/02, ATTACK01 and G26 local record validation. Imported labels confer no authority. */
import {createCoreError,createOperationId} from '../../domain/index.ts';
import {intentData,type CoreResult} from '../../schemas/index.ts';
import {governancePath} from './records.ts';
export const ASSURANCE_LIMITS=Object.freeze({roles:128,matrix:256,sources:32,roleReferences:32,evidencePaths:64,records:128,textBytes:2048});
export type OperationalRole='publisher'|'host'|'relay-operator'|'matcher'|'liquidity-provider'|'payment-processor'|'courier'|'arbiter';
export interface RoleFactsV1 {
 readonly version:1;readonly id:string;readonly role:OperationalRole;
 readonly controlsSpendingKeys:boolean;readonly canRedirectEscrow:boolean;readonly canChangeExistingTerms:boolean;
 readonly handlesFiat:boolean;readonly holdsPhysicalCash:boolean;readonly receivesFees:boolean;readonly setsCounterpartyTerms:boolean;readonly selectsCounterparties:boolean;
 readonly deploymentIds:readonly string[];readonly jurisdictionsClaimed:readonly string[];readonly evidencePaths:readonly string[];readonly revision:number;
}
export interface JurisdictionAssessmentV1 {
 readonly version:1;readonly jurisdiction:string;readonly roleAssessmentId:string;
 readonly activity:'software-publication'|'matching'|'liquidity'|'fiat-processing'|'custody'|'courier'|'arbitration';readonly operationProfile:string;
 readonly requirementClass:'financial-services'|'sanctions'|'consumer'|'privacy'|'cash-handling'|'tax-records';
 readonly sources:readonly Readonly<{url:string;title:string;retrievedAt:string;effectiveDate:string|null;sourceDigest:string}>[];
 readonly status:'unassessed'|'needs-review'|'approved-profile'|'unsupported';readonly reviewer:string|null;readonly rationalePath:string|null;readonly reviewedAt:string|null;readonly nextReviewAt:string|null;
}
export interface AttackCase {
 readonly id:string;readonly capability:string;readonly preconditions:readonly string[];readonly invariant:string;
 readonly fixturePaths:readonly string[];readonly evidencePaths:readonly string[];
 readonly status:'specified'|'reproduced'|'mitigated'|'verified'|'not-applicable';readonly rationale:string;
}
export interface IncidentRecord {
 readonly incidentId:string;readonly severity:'critical'|'high'|'medium'|'low';readonly reportedAt:string;
 readonly affectedManifestDigests:readonly string[];readonly affectedDeploymentIds:readonly string[];
 readonly impact:string;readonly hypothesis:string;readonly containment:string;readonly recovery:string;
 readonly reviewer:string|null;readonly status:'detected'|'triaged'|'contained'|'recovering'|'reviewed'|'closed';readonly advisoryDigest:string|null;
}
const codes=new WeakMap<object,'INVALID_INPUT'|'UNSUPPORTED_VERSION'|'LIMIT_EXCEEDED'>();
const stop=(code:'INVALID_INPUT'|'UNSUPPORTED_VERSION'|'LIMIT_EXCEEDED'='INVALID_INPUT'):never=>{const error=new Error('Invalid assurance record.');codes.set(error,code);throw error;};
function result<T>(work:()=>T):CoreResult<T>{try{return Object.freeze({ok:true,value:work()});}catch(error){const code=typeof error==='object'&&error!==null?codes.get(error)??'INVALID_INPUT':'INVALID_INPUT';return Object.freeze({ok:false,error:createCoreError(code,{operationId:createOperationId(),readOnly:true})});}}
function text(value:unknown,max=2048):string {if(typeof value!=='string'||!value.length||value.length>max||!value.trim().length||/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value)||new TextEncoder().encode(value).length>max)return stop();return value;}
function id(value:unknown):string{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)||value.includes('..'))return stop();return value;}
function hash(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value))return stop();return value;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')return stop();return value;}
function integer(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return stop();return value;}
function choice<T extends string>(value:unknown,choices:readonly T[]):T{if(typeof value!=='string'||!choices.includes(value as T))return stop();return value as T;}
const nullable=<T>(value:unknown,parse:(value:unknown)=>T):T|null=>value===null?null:parse(value);
function list<T>(value:unknown,max:number,parse:(value:unknown)=>T,key:(v:T)=>string=v=>JSON.stringify(v)):readonly T[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return stop();const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
 if(!Number.isSafeInteger(length)||length<0)return stop();if(length>max)return stop('LIMIT_EXCEEDED');if(Reflect.ownKeys(value).length!==length+1)return stop();
 const out:T[]=[];for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!d.enumerable||!('value'in d))return stop();out.push(parse(d.value));}
 if(new Set(out.map(key)).size!==out.length)return stop();return Object.freeze(out);
}
/** Exact calendar date or UTC ISO timestamp, never locale-dependent parsing. */
function date(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value))return stop();
 const millis=Date.parse(value);if(!Number.isFinite(millis))return stop();const iso=new Date(millis).toISOString();
 if(value.length===10?iso.slice(0,10)!==value:value.includes('.')?iso!==value:iso.replace('.000Z','Z')!==value)return stop();return value;
}
function source(input:unknown):JurisdictionAssessmentV1['sources'][number]{const r=intentData(input,['url','title','retrievedAt','effectiveDate','sourceDigest']);const url=text(r.url,2048),u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.hash)return stop();return Object.freeze({url,title:text(r.title,512),retrievedAt:date(r.retrievedAt),effectiveDate:nullable(r.effectiveDate,date),sourceDigest:hash(r.sourceDigest)});}
const factFields=['controlsSpendingKeys','canRedirectEscrow','canChangeExistingTerms','handlesFiat','holdsPhysicalCash','receivesFees','setsCounterpartyTerms','selectsCounterparties'] as const;
function roleFacts(input:unknown):RoleFactsV1 {
 const r=intentData(input,['version','id','role',...factFields,'deploymentIds','jurisdictionsClaimed','evidencePaths','revision']);if(r.version!==1)return stop('UNSUPPORTED_VERSION');
 const facts=Object.fromEntries(factFields.map(k=>[k,bool(r[k])])) as Pick<RoleFactsV1,typeof factFields[number]>;
 const evidencePaths=list(r.evidencePaths,64,governancePath);if(!evidencePaths.length)return stop();
 return Object.freeze({version:1,id:id(r.id),role:choice(r.role,['publisher','host','relay-operator','matcher','liquidity-provider','payment-processor','courier','arbiter']),...facts,deploymentIds:list(r.deploymentIds,32,id),jurisdictionsClaimed:list(r.jurisdictionsClaimed,32,id),evidencePaths,revision:integer(r.revision)});
}
export const validateRoleFacts=(input:unknown):CoreResult<RoleFactsV1>=>result(()=>roleFacts(input));
function assessment(input:unknown):JurisdictionAssessmentV1 {
 const r=intentData(input,['version','jurisdiction','roleAssessmentId','activity','operationProfile','requirementClass','sources','status','reviewer','rationalePath','reviewedAt','nextReviewAt']);if(r.version!==1)return stop('UNSUPPORTED_VERSION');
 const status=choice(r.status,['unassessed','needs-review','approved-profile','unsupported']),sources=list(r.sources,32,source,v=>v.url),reviewer=nullable(r.reviewer,v=>text(v,128)),rationalePath=nullable(r.rationalePath,governancePath),reviewedAt=nullable(r.reviewedAt,date),nextReviewAt=nullable(r.nextReviewAt,date);
 if(nextReviewAt!==null&&(reviewedAt===null||Date.parse(nextReviewAt)<=Date.parse(reviewedAt)||Date.parse(nextReviewAt)-Date.parse(reviewedAt)>90*86400000))return stop();
 if(status==='approved-profile'&&(!sources.length||reviewer===null||rationalePath===null||reviewedAt===null||nextReviewAt===null))return stop();
 return Object.freeze({version:1,jurisdiction:id(r.jurisdiction),roleAssessmentId:id(r.roleAssessmentId),activity:choice(r.activity,['software-publication','matching','liquidity','fiat-processing','custody','courier','arbitration']),operationProfile:id(r.operationProfile),requirementClass:choice(r.requirementClass,['financial-services','sanctions','consumer','privacy','cash-handling','tax-records']),sources,status,reviewer,rationalePath,reviewedAt,nextReviewAt});
}
export const validateJurisdictionAssessment=(input:unknown):CoreResult<JurisdictionAssessmentV1>=>result(()=>assessment(input));
const assessmentKey=(v:JurisdictionAssessmentV1)=>JSON.stringify([v.roleAssessmentId,v.jurisdiction,v.activity,v.operationProfile,v.requirementClass]);
export const validateJurisdictionMatrix=(input:unknown):CoreResult<readonly JurisdictionAssessmentV1[]>=>result(()=>list(input,256,assessment,assessmentKey));
function attack(input:unknown):AttackCase {const r=intentData(input,['id','capability','preconditions','invariant','fixturePaths','evidencePaths','status','rationale']);const status=choice(r.status,['specified','reproduced','mitigated','verified','not-applicable']),fixturePaths=list(r.fixturePaths,64,governancePath),evidencePaths=list(r.evidencePaths,64,governancePath);if((status==='mitigated'||status==='verified')&&(!fixturePaths.length||!evidencePaths.length))return stop();return Object.freeze({id:id(r.id),capability:id(r.capability),preconditions:list(r.preconditions,32,v=>text(v,512)),invariant:text(r.invariant),fixturePaths,evidencePaths,status,rationale:text(r.rationale)});}
export const validateAttackCase=(input:unknown):CoreResult<AttackCase>=>result(()=>attack(input));
function incident(input:unknown):IncidentRecord {const r=intentData(input,['incidentId','severity','reportedAt','affectedManifestDigests','affectedDeploymentIds','impact','hypothesis','containment','recovery','reviewer','status','advisoryDigest']);if(typeof r.incidentId!=='string'||!/^[0-9a-f]{32}$/.test(r.incidentId))return stop();return Object.freeze({incidentId:r.incidentId,severity:choice(r.severity,['critical','high','medium','low']),reportedAt:date(r.reportedAt),affectedManifestDigests:list(r.affectedManifestDigests,128,hash),affectedDeploymentIds:list(r.affectedDeploymentIds,32,id),impact:text(r.impact),hypothesis:text(r.hypothesis),containment:text(r.containment),recovery:text(r.recovery),reviewer:nullable(r.reviewer,v=>text(v,128)),status:choice(r.status,['detected','triaged','contained','recovering','reviewed','closed']),advisoryDigest:nullable(r.advisoryDigest,hash)});}
export const validateIncidentRecord=(input:unknown):CoreResult<IncidentRecord>=>result(()=>incident(input));
/** Revision comparison is advisory; no jurisdiction conclusion or assessed revision hash is invented. */
export function diffRoleFacts(previous:unknown,next:unknown){return result(()=>{const a=roleFacts(previous),b=roleFacts(next);if(a.id!==b.id||b.revision<=a.revision)return stop();const fields=['role',...factFields,'deploymentIds','jurisdictionsClaimed','evidencePaths'] as const;return Object.freeze({id:a.id,previousRevision:a.revision,nextRevision:b.revision,changedFields:Object.freeze(fields.filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]))),requiresAssessmentReview:true as const,invalidatesAssessmentBindings:true as const,legalAuthorization:false as const});});}
/** Structure and freshness projection only. Claims, source digests and reviewer names are never authenticated here. */
export function buildAssuranceReviewPacket(input:unknown){return result(()=>{
 const r=intentData(input,['roles','assessments','attacks','incidents','asOf']),roles=list(r.roles,128,roleFacts,v=>v.id),assessments=list(r.assessments,256,assessment,assessmentKey),attacks=list(r.attacks,128,attack,v=>v.id),incidents=list(r.incidents,128,incident,v=>v.incidentId),asOf=date(r.asOf);
 if(assessments.some(a=>!roles.some(role=>role.id===a.roleAssessmentId)))return stop();
 return Object.freeze({recordOnly:true as const,legalAuthorization:false as const,releaseAuthorization:false as const,custodyAuthorization:false as const,evidenceIntegrityVerified:false as const,intakeState:roles.length===0?'unassessed' as const:'facts-recorded' as const,asOf,roleCount:roles.length,attackCount:attacks.length,incidentCount:incidents.length,
  jurisdictions:Object.freeze(roles.map(role=>Object.freeze({roleAssessmentId:role.id,roleRevision:role.revision,state:assessments.some(a=>a.roleAssessmentId===role.id)?'claims-only' as const:'unassessed' as const}))),
  assessmentClaims:Object.freeze(assessments.map(a=>Object.freeze({roleAssessmentId:a.roleAssessmentId,jurisdiction:a.jurisdiction,activity:a.activity,operationProfile:a.operationProfile,requirementClass:a.requirementClass,statusClaim:a.status,reviewFreshness:a.reviewedAt===null||a.nextReviewAt===null?'missing' as const:Date.parse(asOf)<Date.parse(a.reviewedAt)||Date.parse(asOf)>=Date.parse(a.nextReviewAt)?'stale' as const:'within-claimed-window' as const}))) });
 });}
