import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,copyFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{inspectDocs}from'./validate.mjs';
import * as docs from './validate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function fixture(change ) {
  const temp=await mkdtemp(resolve(tmpdir(),'p2p-docs-'));
  try {
    const register=JSON.parse(await readFile(resolve(root,'docs/wiki-source/claims-register.json'),'utf8'));
    const manifest=JSON.parse(await readFile(resolve(root,'docs/wiki-source/docs-manifest.json'),'utf8'));
    const paths=new Set(['docs/wiki-source/claims-register.json','docs/wiki-source/docs-manifest.json','docs/OPERATOR.md','docs/DEVELOPMENT_STATUS.md','docs/lab/README.md',register.copySource.path,...register.evidence.map(e=>e.path),...manifest.documents.map(d=>d.sourcePath)]);
    for(const path of paths ) {
      await mkdir(dirname(resolve(temp,path)),{recursive:true});
      await copyFile(resolve(root,path),resolve(temp,path));
    }await writeFile(resolve(temp,'.git'),`gitdir: ${resolve(root,'.git')}\n`);
    await change(temp,register,manifest);
    return await inspectDocs(temp);
  }finally{await rm(temp,{recursive:true,force:true});
  }}
async function registerMutation(fn ) {
  return fixture(async(temp,register)=>{fn(register);
    await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(register));
  });
}
async function manifestMutation(fn ) {
  return fixture(async(temp,_r,manifest)=>{fn(manifest);
    await writeFile(resolve(temp,'docs/wiki-source/docs-manifest.json'),JSON.stringify(manifest));
  });
}
test('actual draft has exact immutable evidence and links but no review, approval or publication',async()=>{
  const report=await fixture(async()=>{});
  assert.equal(report.engineeringConsistency,true);
  assert.equal(report.semanticApproval,false);
  assert.equal(report.published,false);
  assert.equal(report.claims,6);
  assert.equal(report.documents,7);
  assert.ok(report.links.every(l=>l.status==='local-valid'&&/^[a-f0-9]{64}$/.test(l.sha256)));
  assert.ok(report.claimsRegister.every(c=>c.reviewer===null&&c.approvedRelease===null));
});
test('unknown keys, duplicate claims/copy keys and unrecognized references fail closed',async()=>{for(const change of [r=>r.extra=true,r=>r.claims.push(r.claims[0]),r=>r.copyKeys.push(r.copyKeys[0]),r=>r.copyKeys[0].claimId='missing',r=>r.claims[0].evidencePaths=['../escape']])await assert.rejects(registerMutation(change));
});
test('self-attested reviewer, future approval and tested status do not pass local check',async()=>{for(const change of [r=>r.reviewers=['self'],r=>r.approvedRelease='future',r=>r.claims[0].status='tested-scoped',r=>r.claims[0].reviewedAt='2026-11-02'])await assert.rejects(registerMutation(change));
});
test('wrong source bytes, hash, baseline and missing evidence fail',async()=>{for(const change of [r=>r.evidence[0].sha256='0'.repeat(64),r=>r.sourceCommit='0'.repeat(40),r=>r.evidence=[],r=>r.evidence[0].path='missing.ts'])await assert.rejects(registerMutation(change));
  await assert.rejects(fixture(async(temp,r)=>{await writeFile(resolve(temp,r.evidence[0].path),'changed source');
  }));
});
test('document hashes, capabilities, duplicate pages/topics and link report digest are checked',async()=>{for(const change of [m=>m.documents[0].sha256='0'.repeat(64),m=>m.documents[0].implementedCapabilities=['imaginary'],m=>m.documents[1]=m.documents[0],m=>m.documents[1].topic=m.documents[0].topic,m=>m.linkReportDigest='0'.repeat(64)])await assert.rejects(manifestMutation(change));
});
test('changed linked target, symlink and oversized manifest are rejected',async()=>{await assert.rejects(fixture(async temp=>{await writeFile(resolve(temp,'docs/OPERATOR.md'),'changed target');
  }));
  await assert.rejects(fixture(async(temp,r)=>{
    const path=resolve(temp,r.evidence[0].path);
    await rm(path);
    await symlink(resolve(root,r.evidence[0].path),path);
  }));
  await assert.rejects(fixture(async temp=>{await writeFile(resolve(temp,'docs/wiki-source/docs-manifest.json'),' '.repeat(65537));
  }));
});
test('authored link grammar rejects broken anchors, traversal, nonchecked HTML and executable examples',async()=>{
  const {createHash}=await import('node:crypto');
  for(const addition of ['\n[bad](Home.md#missing)','\n[bad](../../../../outside)','\n<a href="secret.md">hidden</a>','\n```sh\nunchecked example\n```'])await assert.rejects(fixture(async(temp,_r,m)=>{
    const d=m.documents[0],path=resolve(temp,d.sourcePath),bytes=Buffer.from((await readFile(path,'utf8'))+addition);
    await writeFile(path,bytes);
    d.sha256=createHash('sha256').update(bytes).digest('hex');
    await writeFile(resolve(temp,'docs/wiki-source/docs-manifest.json'),JSON.stringify(m));
  }));
});
test('real UI copy key, canonical mapping, value hash and immutable catalog bytes are bound',async()=>{
  for(const change of [r=>r.copyKeys[0].key='privacy.invented',r=>r.copyKeys[0].claimId='message-content',r=>r.copyKeys[0].sourceTextSha256='0'.repeat(64),r=>r.copySource.path='apps/web/src/ui/locale/catalog.ts'])await assert.rejects(registerMutation(change));
  for(const updateDeclaredHash of [false,true])await assert.rejects(fixture(async(temp,r)=>{
    const path=resolve(temp,r.copySource.path);const original=await readFile(path,'utf8');assert.ok(original.includes('Authenticated encryption observed'));
    const changed=original.replace('Authenticated encryption observed','Everything is anonymous');await writeFile(path,changed);
    if(updateDeclaredHash){const{createHash}=await import('node:crypto');r.copySource.sha256=createHash('sha256').update(changed).digest('hex');await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(r));}
  }));
});

test('inline link extraction preserves nested labels, delimiters and authored order',()=>{
  const cases=[
    ['plain text',[]],
    ['[outer [inner](first) [next](second)', ['first','second']],
    ['[not a link] [valid](target)', ['target']],
    ['[empty]() [open](unfinished', []],
    ['[label](a(b)c) [label](last)', ['a(b','last']],
    ['[label]([nested](target))', ['[nested](target']],
    ['[label](line\nbreak)', ['line\nbreak']],
    ['[unfinished [still unfinished', []],
  ];
  for(const [text,expected] of cases)assert.deepEqual(docs.docLinkTargets(text),expected);
});

test('link extraction enforces completed target, link count and UTF-8 document boundaries',()=>{
  assert.deepEqual(docs.docLinkTargets(`[x](${'a'.repeat(240)})`),['a'.repeat(240)]);
  assert.throws(()=>docs.docLinkTargets(`[x](${'a'.repeat(241)})`),{message:'DOCS_STALE'});
  assert.deepEqual(docs.docLinkTargets(`[unclosed](${'a'.repeat(241)}`),[]);
  assert.equal(docs.docLinkTargets('[x](a)'.repeat(128)).length,128);
  assert.throws(()=>docs.docLinkTargets('[x](a)'.repeat(129)),{message:'DOCS_STALE'});
  const exact='é'.repeat(32768);
  assert.equal(Buffer.byteLength(exact),65536);
  assert.deepEqual(docs.docLinkTargets(exact),[]);
  assert.throws(()=>docs.docLinkTargets(exact+'a'),{message:'DOCS_STALE'});
});

async function changedDocument(baseline,text,targets){
  const {createHash}=await import('node:crypto'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  return fixture(async(temp,_register,manifest)=>{
    const document=manifest.documents[0],bytes=Buffer.from(text);
    await writeFile(resolve(temp,document.sourcePath),bytes);
    document.sha256=sha(bytes);
    const reports=[...baseline.links.filter(link=>link.source!==document.sourcePath),...targets.map(target=>({source:document.sourcePath,target,status:'remote-unverified'}))];
    reports.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);
    manifest.linkReportDigest=sha(JSON.stringify(reports));
    await writeFile(resolve(temp,'docs/wiki-source/docs-manifest.json'),JSON.stringify(manifest));
  });
}

test('actual inspection keeps 240-character targets and the global 128-link limit across pages',async()=>{
  const baseline=await fixture(async()=>{}),target='https://example.invalid/'+ 'a'.repeat(216);
  assert.equal(target.length,240);
  const accepted=await changedDocument(baseline,`[remote](${target})`,[target]);
  assert.ok(accepted.links.some(link=>link.target===target&&link.status==='remote-unverified'));
  await assert.rejects(changedDocument(baseline,`[remote](${target}a)`,[target+'a']),{message:'DOCS_STALE'});
  const otherCount=baseline.links.filter(link=>link.source!=='docs/wiki-source/Home.md').length;
  assert.ok(otherCount>0&&otherCount<128);
  const targets=Array.from({length:128-otherCount},(_,i)=>`https://example.invalid/${i}`);
  assert.equal((await changedDocument(baseline,targets.map(value=>`[remote](${value})`).join('\n'),targets)).links.length,128);
  targets.push('https://example.invalid/overflow');
  await assert.rejects(changedDocument(baseline,targets.map(value=>`[remote](${value})`).join('\n'),targets),{message:'DOCS_STALE'});
});

test('actual document reads retain the 64 KiB UTF-8 byte limit',async()=>{
  const baseline=await fixture(async()=>{}),text='é'.repeat(32768);
  assert.equal((await changedDocument(baseline,text,[])).engineeringConsistency,true);
  await assert.rejects(changedDocument(baseline,text+'a',[]),{message:'DOCS_STALE'});
});
