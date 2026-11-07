/** DATA02 claim records are descriptions, never evidence authority. No default tested claim exists. */
import { parseStrictJsonBytes } from '../../schemas/index.ts';
export interface PrivacyClaimV1 {
  readonly version:1;
  readonly id:string;
  readonly capability:string;
  readonly exactCopy:string;
  readonly preconditions:readonly string[];
  readonly exclusions:readonly string[];
  readonly evidencePaths:readonly string[];
  readonly status:'proposed'|'tested-scoped'|'unsupported'|'withdrawn';
  readonly reviewedAt:string|null;
}
export interface ClaimScope {
  readonly sourceCommit:string;
  readonly evidenceDigest:string;
  readonly runtimeProfile:string;
  readonly coverage:'matched'|'unknown';
}
/** Maintained composition must compare the entire canonical claim, immutable evidence digest, source revision and live profile. A serialized object cannot supply this authority. */
export interface MaintainedClaimTrust {verify(claim:PrivacyClaimV1,scope:ClaimScope):boolean;
  current():boolean;
}
const id=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const invalid=():never=>{throw new Error('CLAIM_UNSUPPORTED');
};
export function safeClaimPath(value:unknown):string {
  if (typeof value!=='string'||value.length>240||!value.split('/').every(p=>id.test(p)&&p!=='.'&&p!=='..')||value.includes('\\'))return invalid();
  return value;
}
function exact(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if (typeof value!=='object'||value===null||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return invalid();
  const own=Reflect.ownKeys(value);
  if (own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return invalid();
  const out:Record<string,unknown>=Object.create(null);
  for (const k of keys ) {
    const d=Object.getOwnPropertyDescriptor(value,k);
    if (!d||!('value'in d))return invalid();
    out[k]=d.value;
  }
  return out;
}
function text(v:unknown,max=512):string{
  if (typeof v!=='string'||!v.length||v.length>max||new TextEncoder().encode(v).length>max||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))return invalid();
  return v;
}
function list(v:unknown,paths=false):readonly string[]{
  if (!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>32||Reflect.ownKeys(v).length!==v.length+1)return invalid();
  const out:string[]=[];
  for (let i=0;
  i<v.length;
  i++ ) {
    const d=Object.getOwnPropertyDescriptor(v,String(i));
    if (!d||!('value'in d))return invalid();
    out.push(paths?safeClaimPath(d.value):text(d.value));
  }
  if (new Set(out).size!==out.length)return invalid();
  return Object.freeze(out);
}
export function parsePrivacyClaim(input:unknown):PrivacyClaimV1 {try {
    const r=exact(input,['version','id','capability','exactCopy','preconditions','exclusions','evidencePaths','status','reviewedAt']);
    if (r.version!==1||typeof r.id!=='string'||!id.test(r.id)||typeof r.capability!=='string'||!id.test(r.capability)||!['proposed','tested-scoped','unsupported','withdrawn'].includes(r.status as string)||r.reviewedAt!==null&&(typeof r.reviewedAt!=='string'||(!/^\d{4}-\d\d-\d\d$/.test(r.reviewedAt)||!Number.isFinite(Date.parse(r.reviewedAt+'T00:00:00Z'))||new Date(r.reviewedAt+'T00:00:00Z').toISOString().slice(0,10)!==r.reviewedAt)))return invalid();
    return Object.freeze({version:1,id:r.id,capability:r.capability,exactCopy:text(r.exactCopy),preconditions:list(r.preconditions),exclusions:list(r.exclusions),evidencePaths:list(r.evidencePaths,true),status:r.status as PrivacyClaimV1['status'],reviewedAt:r.reviewedAt as string|null});
  } catch {
    return invalid();
  }
}
export function parseClaimsBytes(bytes:Uint8Array):readonly PrivacyClaimV1[]{try {
    const r=exact(parseStrictJsonBytes(bytes,65536),['version','claims']);
    if (r.version!==1||!Array.isArray(r.claims)||r.claims.length>64)return invalid();
    const claims=r.claims.map(parsePrivacyClaim);
    if (new Set(claims.map(c=>c.id)).size!==claims.length||new Set(claims.map(c=>c.capability)).size!==claims.length)return invalid();
    return Object.freeze(claims);
  } catch {
    return invalid();
  }
}
/** Scope and callback are supplied by maintained composition, never deserialized from documentation. */
export function canDisplayTestedClaim(input:unknown,scope:ClaimScope,trust?:MaintainedClaimTrust):boolean {try {
    const claim=parsePrivacyClaim(input);
    const s=exact(scope,['sourceCommit','evidenceDigest','runtimeProfile','coverage']);
    if (claim.status!=='tested-scoped'||claim.reviewedAt===null||!claim.evidencePaths.length||s.coverage!=='matched'||typeof s.sourceCommit!=='string'||! /^[0-9a-f]{40}$/.test(s.sourceCommit)||typeof s.evidenceDigest!=='string'||! /^[0-9a-f]{64}$/.test(s.evidenceDigest)||typeof s.runtimeProfile!=='string'||!id.test(s.runtimeProfile)||!trust||trust.current()!==true)return false;
    const detached=Object.freeze({...s}) as unknown as ClaimScope;
    return trust.verify(claim,detached)===true&&trust.current()===true;
  } catch {
    return false;
  }}
export function claimFor(claims:readonly PrivacyClaimV1[],capability:string,scope:ClaimScope,trust?:MaintainedClaimTrust):PrivacyClaimV1|null{try {
    if(typeof capability!=='string'||!id.test(capability)||!Array.isArray(claims)||Object.getPrototypeOf(claims)!==Array.prototype||claims.length>64||Reflect.ownKeys(claims).length!==claims.length+1)return null;
    const parsed:PrivacyClaimV1[]=[];
    for (let i=0;
    i<claims.length;
    i++ ) {
      const d=Object.getOwnPropertyDescriptor(claims,String(i));
      if (!d||!('value'in d))return null;
      parsed.push(parsePrivacyClaim(d.value));
    }
    if (new Set(parsed.map(c=>c.id)).size!==parsed.length||new Set(parsed.map(c=>c.capability)).size!==parsed.length)return null;
    const claim=parsed.find(c=>c.capability===capability);
    if (!claim)return null;
    return claim.status==='tested-scoped'&&!canDisplayTestedClaim(claim,scope,trust)?Object.freeze({...claim,status:'proposed',reviewedAt:null}):claim;
  } catch {
    return null;
  }}
/** Generated editorial view of the canonical DATA02 record;
never a second editable claim. */
export function projectClaimsRegister(claim:PrivacyClaimV1,evidenceDigest:string ) {
  const c=parsePrivacyClaim(claim);
  if (typeof evidenceDigest!=='string'||!/^[0-9a-f]{64}$/.test(evidenceDigest))return invalid();
  return Object.freeze({claimId:c.id,text:c.exactCopy,scope:c.preconditions,evidenceDigest,limitations:c.exclusions,reviewer:null,approvedRelease:null});
}
/** Maintained implementation inventory. References identify local evidence, not professional approval. */
export const CLAIM_CATALOG = Object.freeze([
{id:'vault-at-rest',capability:'vault',availability:'local-implemented',evidencePaths:Object.freeze(['packages/storage/src/vault-crypto.ts','packages/storage/test/vault-crypto.test.mjs'])},
{id:'message-content',capability:'messaging',availability:'local-test-only',evidencePaths:Object.freeze(['packages/nostr-crypto/src/nip44.ts','packages/nostr-crypto/test/nip44.test.mjs'])},
{id:'selected-route',capability:'routing',availability:'local-test-only',evidencePaths:Object.freeze(['packages/transport/src/policy.ts','packages/transport/test/policy.test.mjs'])},
{id:'stealth-local',capability:'stealth',availability:'unsupported',evidencePaths:Object.freeze([])},
{id:'location-scope',capability:'location',availability:'unsupported',evidencePaths:Object.freeze([])},
{id:'logical-removal',capability:'deletion',availability:'unsupported',evidencePaths:Object.freeze([])},
].map(item=>Object.freeze(item)));
/** Read a real source-catalog message without evaluating imported accessors. This is copy consistency, never review authority. */
export function claimCopyText(catalog:unknown,key:string):string {
  try {
    if (typeof key!=='string'||key.length>160||! /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(key)) return invalid();
    if (!catalog||typeof catalog!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(catalog))) return invalid();
    const descriptor=Object.getOwnPropertyDescriptor(catalog,key);
    if (!descriptor||!('value' in descriptor)) return invalid();
    const entry=exact(descriptor.value,['key','source','context','severity','variables','reviewRequired','docsAnchor']);
    if (entry.key!==key) return invalid();
    return text(entry.source,8192);
  } catch { return invalid(); }
}
/** Canonical mappings to existing UI source-catalog keys. Unsupported descriptions stay unsupported. */
export const CLAIM_COPY_BINDINGS = Object.freeze({
  'privacy.authenticated':'vault-at-rest',
  'privacy.messaging':'message-content',
  'privacy.privateRoute':'selected-route',
  'privacy.unsupported':'stealth-local',
  'shell.privacyHelp':'location-scope',
  'tradePage.deleteFromProfile':'logical-removal',
});
