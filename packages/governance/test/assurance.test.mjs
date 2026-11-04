import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {validateRoleFacts,validateJurisdictionAssessment,validateJurisdictionMatrix,validateAttackCase,validateIncidentRecord,diffRoleFacts,buildAssuranceReviewPacket} from '../index.ts';
const hash='a'.repeat(64),path='docs/execution/assurance/README.md';
const facts=()=>({version:1,id:'synthetic-publisher',role:'publisher',controlsSpendingKeys:false,canRedirectEscrow:false,canChangeExistingTerms:false,handlesFiat:false,holdsPhysicalCash:false,receivesFees:false,setsCounterpartyTerms:false,selectsCounterparties:false,deploymentIds:[],jurisdictionsClaimed:[],evidencePaths:[path],revision:1});
const source=()=>({url:'https://example.invalid/public-synthetic-source',title:'Synthetic public fixture only',retrievedAt:'2026-11-02',effectiveDate:null,sourceDigest:hash});
const assessment=()=>({version:1,jurisdiction:'SYNTHETIC',roleAssessmentId:'synthetic-publisher',activity:'software-publication',operationProfile:'local-only',requirementClass:'privacy',sources:[source()],status:'approved-profile',reviewer:'Synthetic claimed reviewer',rationalePath:path,reviewedAt:'2026-11-01',nextReviewAt:'2026-12-01'});
const attack=()=>({id:'C-01',capability:'local-reference',preconditions:['Public synthetic fixture'],invariant:'No authority is granted.',fixturePaths:[path],evidencePaths:[path],status:'specified',rationale:'A source mapping is not attack coverage or execution evidence.'});
const incident=()=>({incidentId:'a'.repeat(32),severity:'low',reportedAt:'2026-11-02T00:00:00Z',affectedManifestDigests:[],affectedDeploymentIds:[],impact:'Synthetic fixture only; no actual incident.',hypothesis:'No operational claim.',containment:'No action performed.',recovery:'Local checklist only.',reviewer:null,status:'detected',advisoryDigest:null});
const good=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const bad=(r,code='INVALID_INPUT')=>{assert.equal(r.ok,false);assert.equal(r.error.code,code);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|password|stack/);};
test('complete exact role facts detach claims; unknown facts never default false',()=>{
 const raw=facts(),r=good(validateRoleFacts(raw));raw.deploymentIds.push('changed');assert.equal(r.deploymentIds.length,0);assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.evidencePaths));
 for(const patch of [{controlsSpendingKeys:null},{receivesFees:undefined},{role:'licensed-exempt'},{revision:1.5},{revision:Number.MAX_SAFE_INTEGER+1},{evidencePaths:[]},{evidencePaths:['../private']},{jurisdictionsClaimed:Array.from({length:33},(_,i)=>`scope-${i}`)}])bad(validateRoleFacts({...facts(),...patch}),patch.jurisdictionsClaimed?'LIMIT_EXCEEDED':'INVALID_INPUT');
 bad(validateRoleFacts({...facts(),version:2}),'UNSUPPORTED_VERSION');bad(validateRoleFacts({...facts(),license:'approved'}));
});
test('descriptors, duplicate arrays and hostile proxies have fixed errors and never execute getters',()=>{
 let touched=0;const raw=facts();Object.defineProperty(raw,'handlesFiat',{enumerable:true,get(){touched++;throw Error('PRIVATE');}});bad(validateRoleFacts(raw));assert.equal(touched,0);
 bad(validateRoleFacts({...facts(),evidencePaths:[path,path]}));bad(validateRoleFacts(new Proxy(facts(),{getPrototypeOf(){throw new Proxy({},{getPrototypeOf(){throw Error('PRIVATE');}});}})));
 const sparse=[];sparse.length=1;bad(validateRoleFacts({...facts(),deploymentIds:sparse}));
});
test('jurisdiction sources, exact dates, review bounds and matrix identities remain checked claims',()=>{
 good(validateJurisdictionAssessment(assessment()));good(validateJurisdictionMatrix([]));
 for(const patch of [{reviewer:null},{sources:[]},{reviewedAt:'2026-02-30'},{nextReviewAt:'2027-02-01'},{nextReviewAt:'2026-11-01'},{jurisdiction:''}])bad(validateJurisdictionAssessment({...assessment(),...patch}));
 for(const url of ['http://example.invalid/','https://name:password@example.invalid/','file:///tmp/private'])bad(validateJurisdictionAssessment({...assessment(),sources:[{...source(),url}]}));
 bad(validateJurisdictionAssessment({...assessment(),sources:[source(),source()]}));bad(validateJurisdictionMatrix([assessment(),assessment()]));
 bad(validateJurisdictionMatrix(Array(257).fill(assessment())),'LIMIT_EXCEEDED');
 good(validateJurisdictionAssessment({...assessment(),status:'unassessed',sources:[],reviewer:null,rationalePath:null,reviewedAt:null,nextReviewAt:null}));
});
test('role revisions expose operational changes without legal classification',()=>{
 const next={...facts(),revision:2,holdsPhysicalCash:true,receivesFees:true};const diff=good(diffRoleFacts(facts(),next));assert.deepEqual(diff.changedFields,['holdsPhysicalCash','receivesFees']);assert.equal(diff.requiresAssessmentReview,true);assert.equal(diff.legalAuthorization,false);
 assert.equal(good(diffRoleFacts(facts(),{...facts(),revision:2})).invalidatesAssessmentBindings,true);assert.equal(good(diffRoleFacts(facts(),{...facts(),revision:2})).requiresAssessmentReview,true);bad(diffRoleFacts(facts(),facts()));bad(diffRoleFacts(facts(),{...next,id:'other'}));
});
test('attack and incident status/reviewer labels confer no privileges or authenticated provenance',()=>{
 good(validateAttackCase(attack()));good(validateIncidentRecord(incident()));
 bad(validateAttackCase({...attack(),status:'verified',fixturePaths:[]}));bad(validateAttackCase({...attack(),rationale:''}));bad(validateIncidentRecord({...incident(),severity:'approved'}));bad(validateIncidentRecord({...incident(),incidentId:'trade-derived-id'}));bad(validateIncidentRecord({...incident(),reportedAt:'2026-11-02T24:00:00Z'}));bad(validateIncidentRecord({...incident(),affectedManifestDigests:[hash,hash]}));
 const r=good(buildAssuranceReviewPacket({roles:[facts()],assessments:[assessment()],attacks:[attack()],incidents:[{...incident(),status:'closed',reviewer:'Claim only'}],asOf:'2026-11-02'}));
 for(const k of ['legalAuthorization','releaseAuthorization','custodyAuthorization','evidenceIntegrityVerified'])assert.equal(r[k],false);assert.equal(r.assessmentClaims[0].statusClaim,'approved-profile');assert.equal(r.assessmentClaims[0].reviewFreshness,'within-claimed-window');
 assert.equal(good(buildAssuranceReviewPacket({roles:[facts()],assessments:[],attacks:[],incidents:[],asOf:'2026-11-02'})).jurisdictions[0].state,'unassessed');
 assert.equal(good(buildAssuranceReviewPacket({roles:[facts()],assessments:[assessment()],attacks:[],incidents:[],asOf:'2026-12-01'})).assessmentClaims[0].reviewFreshness,'stale');
 bad(buildAssuranceReviewPacket({roles:[],assessments:[assessment()],attacks:[],incidents:[],asOf:'2026-11-02'}));bad(buildAssuranceReviewPacket({roles:[facts(),facts()],assessments:[],attacks:[],incidents:[],asOf:'2026-11-02'}));
});
test('review claims retain the full matrix identity and required descriptions cannot be blank',()=>{
 const first={...assessment(),operationProfile:'profile-a'},second={...assessment(),activity:'fiat-processing',operationProfile:'profile-b',requirementClass:'financial-services',status:'unsupported'};
 const claims=good(buildAssuranceReviewPacket({roles:[facts()],assessments:[first,second],attacks:[],incidents:[],asOf:'2026-11-02'})).assessmentClaims;
 assert.deepEqual(claims.map(c=>[c.roleAssessmentId,c.jurisdiction,c.activity,c.operationProfile,c.requirementClass]),[[first.roleAssessmentId,first.jurisdiction,first.activity,first.operationProfile,first.requirementClass],[second.roleAssessmentId,second.jurisdiction,second.activity,second.operationProfile,second.requirementClass]]);
 bad(validateAttackCase({...attack(),status:'not-applicable',rationale:'   '}));bad(validateJurisdictionAssessment({...assessment(),reviewer:'   '}));bad(validateIncidentRecord({...incident(),impact:'\u00a0'}));
});
test('public source packet has exact current evidence bytes and explicitly unassessed jurisdiction intake',async()=>{
 const root=await realpath(new URL('../../../',import.meta.url)),base=resolve(root,'docs/execution/assurance');
 const manifest=JSON.parse(await readFile(resolve(base,'evidence-manifest.json')));assert.equal(manifest.format,'p2p-offramp/assurance-local-evidence/v1');assert.ok(manifest.files.length>5&&manifest.files.length<=64);
 const seen=new Set();for(const row of manifest.files){assert.match(row.path,/^[A-Za-z0-9_./-]+$/);assert.ok(!row.path.split('/').includes('..'));assert.ok(!seen.has(row.path));seen.add(row.path);const target=await realpath(resolve(root,row.path));assert.ok(target.startsWith(root+sep));assert.equal((await stat(target)).isFile(),true);assert.ok((await stat(target)).size<=2*1024*1024);assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'),row.sha256,row.path);}
 const roles=JSON.parse(await readFile(resolve(base,'role-facts.json'))),assessments=JSON.parse(await readFile(resolve(base,'jurisdiction-matrix.json'))),attacks=JSON.parse(await readFile(resolve(base,'attack-cases.json')));assert.deepEqual(roles,[]);assert.deepEqual(assessments,[]);for(const a of attacks)good(validateAttackCase(a));assert.ok(attacks.every(a=>a.status==='specified'));assert.equal(good(buildAssuranceReviewPacket({roles,assessments,attacks,incidents:[],asOf:'2026-11-02'})).intakeState,'unassessed');
 const contract=await readFile(resolve(root,'contracts/evm/test/BasicEscrow.t.sol'),'utf8');for(const selector of ['test_reentrancy_buyerReentersRefundDuringReleasePush','test_reentrancy_sellerReentersReleaseDuringRefundPush','test_reentrancy_callbackTokenDuringPayoutBlocked','test_fund_rejectsSellerNonceReuseAcrossOrders','test_tradeId_isDeploymentAndChainBound','test_fundToken_rejectsFeeOnTransfer','test_reentrancy_callbackTokenDuringFundingBlocked','test_refund_atDeadlineByStrangerPaysSellerOnly','test_release_rejectsAtDeadline'])assert.ok(contract.includes('function '+selector+'('),selector);
});
