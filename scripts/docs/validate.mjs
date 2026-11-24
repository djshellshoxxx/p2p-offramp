/** Offline engineering consistency only. Never semantic review or wiki publication. */
import {lstat,open}from'node:fs/promises';
import{constants}from'node:fs';
import{execFileSync}from'node:child_process';
import{createHash}from'node:crypto';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{parseClaimsBytes,safeClaimPath,projectClaimsRegister,CLAIM_CATALOG,CLAIM_COPY_BINDINGS}from'../../packages/claims/index.ts';
import{parseStrictJsonBytes}from'../../packages/schemas/index.ts';
import{claimCopyTextsFromSource}from'./copy-source.mjs';
import{isMain}from'../lib/is-main.mjs';
import{resolveTool}from'../lib/tool-path.mjs';
/** Global link bound across all pages; per-page extraction stays at 128. */
const MAX_LINKS_TOTAL=256;
const ROOT=fileURLToPath(new URL('../../',import.meta.url)), sha=b=>createHash('sha256').update(b).digest('hex');
const refuse=()=>{throw Error('DOCS_STALE');
};
function exact(v,keys ) {
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort((left, right) => left < right ? -1 : left > right ? 1 : 0).join()!==[...keys].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).join())refuse();
  return v;
}
/** Closed inline-link extraction; every delimiter search advances the cursor. */
export function docLinkTargets(text) {
  if(typeof text!=='string'||Buffer.byteLength(text)>65536)refuse();
  const targets=[];
  let cursor=0;
  while(cursor<text.length) {
    const label=text.indexOf('[',cursor);
    if(label<0)break;
    const close=text.indexOf(']',label+1);
    if(close<0)break;
    cursor=close+1;
    if(text[cursor]!=='(')continue;
    const start=cursor+1,end=text.indexOf(')',start);
    if(end<0)break;
    cursor=end+1;
    if(end===start)continue;
    if(targets.length>=128||end-start>240)refuse();
    targets.push(text.slice(start,end));
  }
  return targets;
}
async function file(root,path,max=1048576 ) {
  safeClaimPath(path);
  const parts=path.split('/');
  let before;
  for (let i=1; i<=parts.length; i++) {
    const stat=await lstat(resolve(root,...parts.slice(0,i)),{bigint:true});
    if(stat.isSymbolicLink())refuse();
    if(i===parts.length ) {
      if(!stat.isFile()||stat.size>BigInt(max))refuse();
      before=stat;
    }
  }
  const handle=await open(resolve(root,path),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const stat=await handle.stat({bigint:true});
    if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino||stat.size!==before.size)refuse();
    const buffer=Buffer.alloc(max+1);
    let length=0;
    while(length<buffer.length ) {
      const {bytesRead}=await handle.read(buffer,length,buffer.length-length,null);
      if(!bytesRead)break;
      length+=bytesRead;
    }
    const after=await handle.stat({bigint:true});
    if(length>max||BigInt(length)!==stat.size||after.size!==stat.size||after.mtimeNs!==stat.mtimeNs||after.ctimeNs!==stat.ctimeNs)refuse();
    return buffer.subarray(0,length);
  } finally {
    await handle.close();
  }
}
export async function inspectDocs(root=ROOT ) {
  const register=exact(parseStrictJsonBytes(new Uint8Array(await file(root,'docs/wiki-source/claims-register.json',65536)),65536),['version','sourceCommit','reviewers','approvedRelease','claims','evidence','copySource','copyKeys']);
  if(register.version!==1||! /^[0-9a-f]{40}$/.test(register.sourceCommit)||!Array.isArray(register.reviewers)||register.reviewers.length||register.approvedRelease!==null)refuse();
  const claims=parseClaimsBytes(new TextEncoder().encode(JSON.stringify({version:1,claims:register.claims}))),ids=new Set(claims.map(c=>c.id));
  if(claims.length!==CLAIM_CATALOG.length||claims.some(c=>{
    const known=CLAIM_CATALOG.find(k=>k.id===c.id&&k.capability===c.capability);
    return !known||JSON.stringify(known.evidencePaths)!==JSON.stringify(c.evidencePaths)||(known.availability==='unsupported'&&c.status!=='unsupported');
  }))refuse();
  if(claims.some(c=>c.reviewedAt!==null||!['proposed','unsupported'].includes(c.status)))refuse();
  if(!Array.isArray(register.evidence)||register.evidence.length>128||!Array.isArray(register.copyKeys)||register.copyKeys.length>128)refuse();
  if(register.evidence.length!==CLAIM_CATALOG.reduce((n,c)=>n+c.evidencePaths.length,0)||register.copyKeys.length!==claims.length)refuse();
  const paths=new Set(),stale=new Set();
  // Evidence rows bind the bytes at the immutable sourceCommit (strict). Current bytes that drifted since
  // then, for example a later edit by another owner, are reported stale and never presented as current.
  const committedBytes=(path)=>execFileSync(resolveTool('git'),['show',`${register.sourceCommit}:${path}`],{cwd:root,maxBuffer:1048576,stdio:['ignore','pipe','pipe']});
  const committedHash=(path)=>sha(committedBytes(path));
  const unreadable=[];
  const currentBytes=async path=>{
    try { return await file(root,path); }
    catch { unreadable.push(path); return null; }
  };
  for(const item of register.evidence ) {
    exact(item,['path','sha256']);
    if(paths.has(item.path)||! /^[0-9a-f]{64}$/.test(item.sha256))refuse();
    paths.add(item.path);
    safeClaimPath(item.path);
    if(committedHash(item.path)!==item.sha256)refuse();
    const bytes=await currentBytes(item.path);
    if(!bytes||sha(bytes)!==item.sha256)stale.add(item.path);
  }
  for(const claim of claims)if(claim.evidencePaths.some(p=>!paths.has(p)))refuse();
  exact(register.copySource,['path','sha256']);
  if(register.copySource.path!=='apps/web/src/ui/locale/en.ts'||typeof register.copySource.sha256!=='string'||! /^[0-9a-f]{64}$/.test(register.copySource.sha256))refuse();
  const copyBytes=committedBytes(register.copySource.path);
  if(sha(copyBytes)!==register.copySource.sha256)refuse();
  const copyTexts=claimCopyTextsFromSource(copyBytes);
  const workingCopy=await currentBytes(register.copySource.path);
  const copyStale=!workingCopy||sha(workingCopy)!==register.copySource.sha256;
  let changedCopyKeys=[];
  if(copyStale){
    stale.add(register.copySource.path);
    // Diagnose the same bytes we hashed. Text equality never clears whole-file staleness.
    try {
      const currentTexts=claimCopyTextsFromSource(workingCopy);
      changedCopyKeys=Object.keys(copyTexts).filter(key=>currentTexts[key]!==copyTexts[key]).sort();
    } catch { changedCopyKeys=null; }
  }

  const keys=new Set(),staleClaimIds=new Set();
  for(const item of register.copyKeys ) {
    exact(item,['key','claimId','sourceTextSha256']);
    if(typeof item.key!=='string'||! /^[A-Za-z0-9._-]{1,64}$/.test(item.key)||keys.has(item.key)||!ids.has(item.claimId)||CLAIM_COPY_BINDINGS[item.key]!==item.claimId||typeof item.sourceTextSha256!=='string'||! /^[0-9a-f]{64}$/.test(item.sourceTextSha256))refuse();
    keys.add(item.key);
    // Recorded text always binds the immutable catalog, even when current source has legitimately drifted.
    if(sha(copyTexts[item.key])!==item.sourceTextSha256)refuse();
    // Every claim bound to a copy source that drifted from its recorded bytes is not current.
    if(copyStale)staleClaimIds.add(item.claimId);
  }
  for(const claim of claims)if(claim.evidencePaths.some(p=>stale.has(p)))staleClaimIds.add(claim.id);
  const manifest=exact(parseStrictJsonBytes(new Uint8Array(await file(root,'docs/wiki-source/docs-manifest.json',65536)),65536),['version','releaseId','sourceCommit','dirtyDraft','reviewers','approvedRelease','documents','linkReportDigest']);
  if(manifest.version!==1||manifest.releaseId!=='local-unapproved-draft'||manifest.sourceCommit!==register.sourceCommit||manifest.dirtyDraft!==true||!Array.isArray(manifest.reviewers)||manifest.reviewers.length||manifest.approvedRelease!==null||!Array.isArray(manifest.documents)||manifest.documents.length!==7)refuse();
  const reports=[],seen=new Set(),topics=new Set();
  const expectedTopics=['Home','Getting-Started','Privacy-and-Recovery','Wallet-and-QR-Safety','Architecture-and-Development','Codespaces-Test-Lab','Security-and-Release'];
  for(const doc of manifest.documents ) {
    exact(doc,['locale','topic','sourcePath','sha256','implementedCapabilities','lastVerifiedRelease']);
    if(doc.locale!=='en'||!expectedTopics.includes(doc.topic)||doc.sourcePath!==`docs/wiki-source/${doc.topic}.md`||typeof doc.topic!=='string'||! /^[A-Za-z0-9-]{1,64}$/.test(doc.topic)||seen.has(doc.sourcePath)||topics.has(doc.topic)||doc.lastVerifiedRelease!==null||!Array.isArray(doc.implementedCapabilities)||doc.implementedCapabilities.length>32||new Set(doc.implementedCapabilities).size!==doc.implementedCapabilities.length||doc.implementedCapabilities.some(id=>!claims.some(c=>c.capability===id)))refuse();
    seen.add(doc.sourcePath);
    topics.add(doc.topic);
    if(!/^docs\/wiki-source\/[A-Za-z0-9-]+\.md$/.test(doc.sourcePath))refuse();
    const text=(await file(root,doc.sourcePath,65536)).toString('utf8');
    if(sha(text)!==doc.sha256)refuse();
    // Closed authored grammar: unverified examples, HTML and reference links are refused.
    if (/```|~~~|<[^>]+>|^\s*\[[^\]]+\]:|\[[^\]]*\]\s*\[[^\]]*\]/m.test(text)) refuse();
    if (/^\s*(?:This app is|We provide|Guaranteed)\s+(?:anonymous|trustless fiat|audited|guaranteed recovery)/im.test(text)) refuse();
    for (const target of docLinkTargets(text)) {
      if (reports.length >= MAX_LINKS_TOTAL) refuse();
      if (/^https:\/\//.test(target)) {
        reports.push({source:doc.sourcePath,target,status:'remote-unverified'});
        continue;
      }
      if (target.split('#').length > 2 || target.includes('%') || target.startsWith('/') || target.includes('\\') || /^[a-z]+:/i.test(target)) refuse();
      const [relative,anchor] = target.split('#');
      const absolute = resolve(root,dirname(doc.sourcePath),relative||'');
      if (!absolute.startsWith(resolve(root)+'/')) refuse();
      const path = absolute.slice(resolve(root).length+1);
      const content = (await file(root,path)).toString('utf8');
      if (anchor && !content.split('\n').some(line => /^#+ /.test(line) && line.replace(/^#+ /,'').toLowerCase().replace(/[^a-z0-9 -]/g,'').replace(/ /g,'-') === anchor)) refuse();
      reports.push({source:doc.sourcePath,target,status:'local-valid',sha256:sha(content)});
    }
  }
  reports.sort((a,b) => JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);
  const digest = sha(JSON.stringify(reports));
  if (manifest.linkReportDigest !== digest) refuse();
  return {
    engineeringConsistency:true, semanticApproval:false, published:false, approvedRelease:null,
    claims:claims.length, copySource:register.copySource, copyKeys:register.copyKeys, sourceEvidence:register.evidence,
    claimsRegister:claims.map(c => ({...projectClaimsRegister(c,sha(JSON.stringify(register.evidence.filter(e => c.evidencePaths.includes(e.path))))),evidenceCurrent:!staleClaimIds.has(c.id)})),
    stale:[...stale].sort(), staleClaims:[...staleClaimIds].sort(),
    ...(stale.size ? {bindingDrift:{changedCopyKeys,unreadable:unreadable.sort()}} : {}),
    sourceCommit:register.sourceCommit, dirtyDraft:true,
    excludedAuthority:['semantic-review','professional-crypto-review','wiki-publication','release-approval'],
    documents:seen.size, linkReportDigest:digest, links:reports,
  };
}
if (isMain(import.meta.url)) {
  try { console.log(JSON.stringify(await inspectDocs())); }
  catch {
    console.log(JSON.stringify({engineeringConsistency:false,code:'DOCS_STALE',semanticApproval:false,published:false}));
    process.exitCode=1;
  }
}
