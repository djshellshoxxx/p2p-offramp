/** Inert GOV01/GOV02 records. Validation is neither reviewer authentication nor release authority. */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { intentData, type CoreResult } from '../../schemas/index.ts';
export const GOVERNANCE_LIMITS = Object.freeze({ entries:128, identifierBytes:64, pathBytes:512, documentBytes:131072 });
export interface AuthorityDecisionV1 {
 readonly version:1; readonly decisionId:string; readonly scope:'source'|'release'|'registry'|'incident'; readonly affectedCapability:string;
 readonly previousArtifactHash:string|null; readonly nextArtifactHash:string|null; readonly reviewers:readonly string[]; readonly evidencePaths:readonly string[];
 readonly status:'proposed'|'accepted'|'rejected'|'withdrawn';
}
export interface ProtocolProposalV1 {
 readonly version:1;readonly id:string;readonly kind:'wire'|'storage'|'escrow'|'crypto-profile'|'ui-only';readonly priorVersion:string;readonly proposedVersion:string;
 readonly affectedSpecs:readonly string[];readonly compatibleReaders:readonly string[];readonly compatibleWriters:readonly string[];readonly migrationId:string|null;
 readonly recoveryArtifactHashes:readonly string[];readonly threatImpactPath:string;readonly testEvidencePaths:readonly string[];
 readonly status:'draft'|'review'|'accepted'|'rejected'|'implemented'|'retired';
}
class Invalid extends Error { readonly code:'INVALID_INPUT'|'UNSUPPORTED_VERSION'|'LIMIT_EXCEEDED'; constructor(code:Invalid['code']='INVALID_INPUT'){super('Invalid governance record.');this.code=code;} }
function stop(code?:Invalid['code']):never{throw new Invalid(code);}
function id(input:unknown):string {if(typeof input!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(input)||input.includes('..'))return stop();return input;}
function hash(input:unknown):string{if(typeof input!=='string'||!/^[0-9a-f]{64}$/.test(input))return stop();return input;}
export function governancePath(input:unknown):string {
 if(typeof input!=='string'||input.length>512||!input.length||!/^[A-Za-z0-9_./-]+$/.test(input)||input.startsWith('/')||input.split('/').some(part=>!part||part==='.'||part==='..'))return stop();return input;
}
function choice<T extends string>(input:unknown,values:readonly T[]):T{if(typeof input!=='string'||!values.includes(input as T))return stop();return input as T;}
function list(input:unknown,parse:(value:unknown)=>string):readonly string[]{
 if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)return stop();
 const length=Object.getOwnPropertyDescriptor(input,'length')?.value;
 if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0)return stop();if(length>128)return stop('LIMIT_EXCEEDED');
 if(Reflect.ownKeys(input).length!==length+1)return stop();const result:string[]=[];
 for(let i=0;i<length;i++){const descriptor=Object.getOwnPropertyDescriptor(input,String(i));if(!descriptor||!('value'in descriptor))return stop();result.push(parse(descriptor.value));}
 if(new Set(result).size!==result.length)return stop();return Object.freeze(result);
}
function guard<T>(work:()=>T):CoreResult<T>{try{return Object.freeze({ok:true,value:work()});}catch(error){let code:Invalid['code']='INVALID_INPUT';try{if(error instanceof Invalid)code=error.code;}catch{}return{ok:false,error:createCoreError(code,{operationId:createOperationId(),readOnly:true})};}}
export function validateAuthorityDecision(input:unknown):CoreResult<AuthorityDecisionV1>{return guard(()=>{
 const r=intentData(input,['version','decisionId','scope','affectedCapability','previousArtifactHash','nextArtifactHash','reviewers','evidencePaths','status']);
 if(r.version!==1)return stop('UNSUPPORTED_VERSION');if(typeof r.decisionId!=='string'||!/^[0-9a-f]{32}$/.test(r.decisionId))return stop();
 return Object.freeze({version:1,decisionId:r.decisionId,scope:choice(r.scope,['source','release','registry','incident']),affectedCapability:id(r.affectedCapability),previousArtifactHash:r.previousArtifactHash===null?null:hash(r.previousArtifactHash),nextArtifactHash:r.nextArtifactHash===null?null:hash(r.nextArtifactHash),reviewers:list(r.reviewers,id),evidencePaths:list(r.evidencePaths,governancePath),status:choice(r.status,['proposed','accepted','rejected','withdrawn'])});
});}
export function validateProposal(input:unknown):CoreResult<ProtocolProposalV1>{return guard(()=>{
 const r=intentData(input,['version','id','kind','priorVersion','proposedVersion','affectedSpecs','compatibleReaders','compatibleWriters','migrationId','recoveryArtifactHashes','threatImpactPath','testEvidencePaths','status']);
 if(r.version!==1)return stop('UNSUPPORTED_VERSION');
 return Object.freeze({version:1,id:id(r.id),kind:choice(r.kind,['wire','storage','escrow','crypto-profile','ui-only']),priorVersion:id(r.priorVersion),proposedVersion:id(r.proposedVersion),affectedSpecs:list(r.affectedSpecs,governancePath),compatibleReaders:list(r.compatibleReaders,id),compatibleWriters:list(r.compatibleWriters,id),migrationId:r.migrationId===null?null:id(r.migrationId),recoveryArtifactHashes:list(r.recoveryArtifactHashes,hash),threatImpactPath:governancePath(r.threatImpactPath),testEvidencePaths:list(r.testEvidencePaths,governancePath),status:choice(r.status,['draft','review','accepted','rejected','implemented','retired'])});
});}
export type Compatibility = Readonly<{kind:'compatible'|'read-only'|'unsupported';rationale:'EXACT_MATCH'|'WRITER_UNSUPPORTED'|'READER_UNSUPPORTED'|'PROPOSAL_INACTIVE';economicPreparationAllowed:false;authority:'inert-record-only'}>;
export function evaluateCompatibility(readerVersion:unknown,writerVersion:unknown,proposal:unknown):CoreResult<Compatibility>{
 const checked=validateProposal(proposal);if(!checked.ok)return checked;
 return guard(()=>{const reader=id(readerVersion),writer=id(writerVersion),p=checked.value;
 const rationale=p.status==='rejected'||p.status==='retired'?'PROPOSAL_INACTIVE':!p.compatibleReaders.includes(reader)?'READER_UNSUPPORTED':!p.compatibleWriters.includes(writer)?'WRITER_UNSUPPORTED':'EXACT_MATCH';
 return Object.freeze({kind:rationale==='EXACT_MATCH'?'compatible':rationale==='WRITER_UNSUPPORTED'?'read-only':'unsupported',rationale,economicPreparationAllowed:false,authority:'inert-record-only'});
 });
}
