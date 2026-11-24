import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,copyFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{execFileSync}from'node:child_process';
import{resolveTool}from'../lib/tool-path.mjs';
import{inspectDocs}from'./validate.mjs';
import {preflight} from './preflight.mjs';
import{claimCopyTextsFromSource}from'./copy-source.mjs';
import * as docs from './validate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
// A linked worktree has a .git file, so resolve the real git directory for the fixture's gitdir pointer.
const gitDir=execFileSync(resolveTool('git'),['rev-parse','--absolute-git-dir'],{cwd:root,encoding:'utf8'}).trim();
// Fixture the maintained pages and their immediate local link targets, just as inspectDocs reads them.
// A new documentation link must not require an unrelated hard-coded fixture file list to change.
async function maintainedDocumentPaths(manifest) {
  const paths=new Set(manifest.documents.map(document=>document.sourcePath));
  for(const document of manifest.documents) {
    const text=await readFile(resolve(root,document.sourcePath),'utf8');
    for(const target of docs.docLinkTargets(text)) {
      if(target.startsWith('https://'))continue;
      const path=resolve(root,dirname(document.sourcePath),target.split('#')[0]);
      assert.ok(path.startsWith(resolve(root)+'/'),'maintained link target must stay inside the repository');
      paths.add(path.slice(resolve(root).length+1));
    }
  }
  return [...paths];
}
async function fixture(change ) {
  const temp=await mkdtemp(resolve(tmpdir(),'p2p-docs-'));
  try {
    const register=JSON.parse(await readFile(resolve(root,'docs/wiki-source/claims-register.json'),'utf8'));
    const manifest=JSON.parse(await readFile(resolve(root,'docs/wiki-source/docs-manifest.json'),'utf8'));
    const paths=new Set(['docs/wiki-source/claims-register.json','docs/wiki-source/docs-manifest.json',register.copySource.path,...register.evidence.map(e=>e.path),...await maintainedDocumentPaths(manifest)]);
    for(const path of paths ) {
      await mkdir(dirname(resolve(temp,path)),{recursive:true});
      await copyFile(resolve(root,path),resolve(temp,path));
    }await writeFile(resolve(temp,'.git'),`gitdir: ${gitDir}\n`);
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
  assert.ok(report.links.every(l=>l.status==='local-valid'?/^[a-f0-9]{64}$/.test(l.sha256):l.status==='remote-unverified'&&l.sha256===undefined&&l.target.startsWith('https://')));
  assert.ok(report.links.some(l=>l.status==='local-valid'));
  assert.ok(report.claimsRegister.every(c=>c.reviewer===null&&c.approvedRelease===null));
});
test('unknown keys, duplicate claims/copy keys and unrecognized references fail closed',async()=>{for(const change of [r=>r.extra=true,r=>r.claims.push(r.claims[0]),r=>r.copyKeys.push(r.copyKeys[0]),r=>r.copyKeys[0].claimId='missing',r=>r.claims[0].evidencePaths=['../escape']])await assert.rejects(registerMutation(change));
});
test('self-attested reviewer, future approval and tested status do not pass local check',async()=>{for(const change of [r=>r.reviewers=['self'],r=>r.approvedRelease='future',r=>r.claims[0].status='tested-scoped',r=>r.claims[0].reviewedAt='2026-11-02'])await assert.rejects(registerMutation(change));
});
test('wrong source bytes, hash, baseline and missing evidence fail',async()=>{for(const change of [r=>r.evidence[0].sha256='0'.repeat(64),r=>r.sourceCommit='0'.repeat(40),r=>r.evidence=[],r=>r.evidence[0].path='missing.ts'])await assert.rejects(registerMutation(change));
  // Drifted current bytes are stale, not a failure: the recorded hash still matches the immutable sourceCommit bytes.
  const baseline=await fixture(async()=>{});let victim;
  const drifted=await fixture(async(temp,r)=>{await writeFile(resolve(temp,r.evidence[0].path),'changed source');
    victim=r.evidence[0].path;
  });
  assert.deepEqual(drifted.stale,[...new Set([...baseline.stale,victim])].sort());assert.ok(drifted.staleClaims.length>=1);
});
test('document hashes, capabilities, duplicate pages/topics and link report digest are checked',async()=>{for(const change of [m=>m.documents[0].sha256='0'.repeat(64),m=>m.documents[0].implementedCapabilities=['imaginary'],m=>m.documents[1]=m.documents[0],m=>m.documents[1].topic=m.documents[0].topic,m=>m.linkReportDigest='0'.repeat(64)])await assert.rejects(manifestMutation(change));
});
test('changed linked target, symlink and oversized manifest are rejected',async()=>{await assert.rejects(fixture(async temp=>{await writeFile(resolve(temp,'docs/wiki-source/User-Guide.md'),'changed target');
  }));
  const baseline=await fixture(async()=>{});let victim;
  const linked=await fixture(async(temp,r)=>{
    victim=r.evidence[0].path;
    const path=resolve(temp,r.evidence[0].path);
    await rm(path);
    await symlink(resolve(root,r.evidence[0].path),path);
  });
  assert.deepEqual(linked.stale,[...new Set([...baseline.stale,victim])].sort(),'a symlinked evidence file is never read as current');
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
  const edit=async(updateDeclaredHash)=>fixture(async(temp,r)=>{
    const path=resolve(temp,r.copySource.path);const original=await readFile(path,'utf8');assert.ok(original.includes('Authenticated encryption observed'));
    const changed=original.replace('Authenticated encryption observed','Everything is anonymous');await writeFile(path,changed);
    if(updateDeclaredHash){const{createHash}=await import('node:crypto');r.copySource.sha256=createHash('sha256').update(changed).digest('hex');await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(r));}
  });
  // Edited current bytes with the recorded hash intact: reported stale, and the bound claim is not current.
  const baseline=await fixture(async()=>{});
  const drift=await edit(false);
  assert.deepEqual(drift.stale,[...new Set([...baseline.stale,'apps/web/src/ui/locale/en.ts'])].sort());assert.ok(drift.staleClaims.includes('vault-at-rest'));
  assert.equal(drift.claimsRegister.find(c=>c.claimId==='vault-at-rest').evidenceCurrent,false);
  // Rewriting the recorded hash to match the edit no longer matches the immutable sourceCommit bytes: refused.
  await assert.rejects(edit(true),{message:'DOCS_STALE'});
});

test('stale catalog bytes never permit a forged recorded copy-text hash',async()=>{
  await assert.rejects(fixture(async(temp,r)=>{
    const path=resolve(temp,r.copySource.path);
    await writeFile(path,(await readFile(path,'utf8'))+'\n// unrelated later source edit\n');
    r.copyKeys[0].sourceTextSha256='0'.repeat(64);
    await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(r));
  }),{message:'DOCS_STALE'});
});

test('immutable copy extraction reads literal text without executing source and rejects executable definitions',async()=>{
  const bytes=await readFile(resolve(root,'apps/web/src/ui/locale/en.ts')),source=bytes.toString('utf8');
  const texts=claimCopyTextsFromSource(bytes);
  const {sourceCatalog}=await import('../../apps/web/src/ui/locale/en.ts');
  const {claimCopyText}=await import('../../packages/claims/index.ts');
  for(const[key,value]of Object.entries(texts))assert.equal(value,claimCopyText(sourceCatalog,key));
  globalThis.__docsSourceExecuted=false;
  try{
    assert.deepEqual(claimCopyTextsFromSource(Buffer.from(source+'\nglobalThis.__docsSourceExecuted=true;\n')),texts);
    const marker="authenticated: 'Authenticated encryption observed'";assert.ok(source.includes(marker));
    for(const replacement of [
      '"authenticated": (()=>{globalThis.__docsSourceExecuted=true;return "text";})()',
      'get authenticated(){globalThis.__docsSourceExecuted=true;return "text";}',
      marker+', "authenticated": "duplicate"',
      '...globalThis.__docsSourceExecuted, '+marker,
    ])assert.throws(()=>claimCopyTextsFromSource(Buffer.from(source.replace(marker,replacement))),{message:'DOCS_STALE'});
    assert.equal(globalThis.__docsSourceExecuted,false);
    for(const invalid of [Buffer.alloc(1048577),new Uint8Array([255]),Buffer.from('const definitions = {};')])assert.throws(()=>claimCopyTextsFromSource(invalid),{message:'DOCS_STALE'});
  }finally{delete globalThis.__docsSourceExecuted;}
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
    const name=document.sourcePath.split('/').pop();
    // Other pages that link to the replaced page bind its new bytes.
    const reports=[...baseline.links.filter(link=>link.source!==document.sourcePath).map(link=>link.status==='local-valid'&&link.target.split('#')[0]===name?{...link,sha256:sha(bytes)}:link),...targets.map(target=>({source:document.sourcePath,target,status:'remote-unverified'}))];
    reports.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);
    manifest.linkReportDigest=sha(JSON.stringify(reports));
    await writeFile(resolve(temp,'docs/wiki-source/docs-manifest.json'),JSON.stringify(manifest));
  });
}

test('actual inspection keeps 240-character targets and the global 256-link limit across pages',async()=>{
  const baseline=await fixture(async()=>{}),target='https://example.invalid/'+ 'a'.repeat(216);
  assert.equal(target.length,240);
  const accepted=await changedDocument(baseline,`[remote](${target})`,[target]);
  assert.ok(accepted.links.some(link=>link.target===target&&link.status==='remote-unverified'));
  await assert.rejects(changedDocument(baseline,`[remote](${target}a)`,[target+'a']),{message:'DOCS_STALE'});
  const otherCount=baseline.links.filter(link=>link.source!=='docs/wiki-source/Home.md').length;
  assert.ok(otherCount>0&&otherCount<256);
  const targets=Array.from({length:256-otherCount},(_,i)=>`https://example.invalid/${i}`);
  assert.equal((await changedDocument(baseline,targets.map(value=>`[remote](${value})`).join('\n'),targets)).links.length,256);
  targets.push('https://example.invalid/overflow');
  await assert.rejects(changedDocument(baseline,targets.map(value=>`[remote](${value})`).join('\n'),targets),{message:'DOCS_STALE'});
});

test('actual document reads retain the 64 KiB UTF-8 byte limit',async()=>{
  const baseline=await fixture(async()=>{}),text='é'.repeat(32768);
  assert.equal((await changedDocument(baseline,text,[])).engineeringConsistency,true);
  await assert.rejects(changedDocument(baseline,text+'a',[]),{message:'DOCS_STALE'});
});

const git=(cwd,...args)=>execFileSync(resolveTool('git'),['-c','user.name=fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false',...args],{cwd,encoding:'utf8'}).trim();
/** Own temp git repository: bound sources are committed first, then the register and manifest bind that commit. */
async function gitFixture() {
  const {createHash}=await import('node:crypto'),sha=b=>createHash('sha256').update(b).digest('hex');
  const temp=await mkdtemp(resolve(tmpdir(),'p2p-docs-git-'));
  const register=JSON.parse(await readFile(resolve(root,'docs/wiki-source/claims-register.json'),'utf8'));
  const manifest=JSON.parse(await readFile(resolve(root,'docs/wiki-source/docs-manifest.json'),'utf8'));
  const sources=[register.copySource.path,...register.evidence.map(e=>e.path)];
  git(temp,'init','-q');
  const copyBytes=await readFile(resolve(root,register.copySource.path));
  for(const path of sources){await mkdir(dirname(resolve(temp,path)),{recursive:true});await writeFile(resolve(temp,path),path===register.copySource.path?copyBytes:`bound source ${path}\n`);}
  git(temp,'add','-A');git(temp,'commit','-q','-m','sources');
  const commit=git(temp,'rev-parse','HEAD');
  register.sourceCommit=commit;manifest.sourceCommit=commit;
  for(const row of register.evidence)row.sha256=sha(Buffer.from(`bound source ${row.path}\n`));
  register.copySource.sha256=sha(copyBytes);
  const texts=claimCopyTextsFromSource(copyBytes);for(const row of register.copyKeys)row.sourceTextSha256=sha(Buffer.from(texts[row.key]));
  await mkdir(resolve(temp,'docs/wiki-source'),{recursive:true});
  for(const path of await maintainedDocumentPaths(manifest)) {
    await mkdir(dirname(resolve(temp,path)),{recursive:true});
    await copyFile(resolve(root,path),resolve(temp,path));
  }
  await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(register));
  await writeFile(resolve(temp,'docs/wiki-source/docs-manifest.json'),JSON.stringify(manifest));
  return {temp,register,commit};
}
test('a later edit to a bound non-owned file is stale and not current, but tampered recorded bytes at sourceCommit fail',async()=>{
  const {temp,register}=await gitFixture();
  try {
    const clean=await inspectDocs(temp);
    assert.deepEqual(clean.stale,[]);assert.deepEqual(clean.staleClaims,[]);assert.ok(clean.claimsRegister.every(c=>c.evidenceCurrent));
    const victim=register.evidence[0].path;
    await writeFile(resolve(temp,victim),'edited later by another owner\n');git(temp,'add','-A');git(temp,'commit','-q','-m','later edit');
    const drifted=await inspectDocs(temp);
    assert.equal(drifted.engineeringConsistency,true);assert.deepEqual(drifted.stale,[victim]);
    const stale=register.claims.filter(c=>c.evidencePaths.includes(victim)).map(c=>c.id);
    assert.deepEqual(drifted.staleClaims,stale);
    assert.ok(drifted.claimsRegister.filter(c=>stale.includes(c.claimId)).every(c=>c.evidenceCurrent===false));
    assert.ok(drifted.claimsRegister.filter(c=>!stale.includes(c.claimId)).every(c=>c.evidenceCurrent===true));
    // The recorded hash must match the bytes at sourceCommit: a wrong record fails even though the working tree is unchanged.
    register.evidence[0].sha256='0'.repeat(64);
    await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(register));
    await assert.rejects(inspectDocs(temp),{message:'DOCS_STALE'});
    // Owned wiki bytes are still strict against the working tree.
    register.evidence[0].sha256=(await import('node:crypto')).createHash('sha256').update(Buffer.from(`bound source ${victim}\n`)).digest('hex');
    await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(register));
    await writeFile(resolve(temp,'docs/wiki-source/Home.md'),'changed owned page\n');
    await assert.rejects(inspectDocs(temp),{message:'DOCS_STALE'});
  } finally {await rm(temp,{recursive:true,force:true});}
});

test('later current copy edits stay stale while the recorded text remains bound to the committed catalog',async()=>{
 const {temp,register}=await gitFixture();
 try{
  const path=resolve(temp,register.copySource.path),before=await readFile(path,'utf8');
  const after=before.replace('Authenticated encryption observed','Changed current draft label');assert.notEqual(after,before);
  await writeFile(path,after);
  const report=await inspectDocs(temp);assert.deepEqual(report.stale,[register.copySource.path]);
  assert.ok(report.claimsRegister.every(claim=>claim.evidenceCurrent===false));
  assert.equal(report.semanticApproval,false);assert.equal(report.published,false);
  register.copyKeys[0].sourceTextSha256='0'.repeat(64);
  await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(register));
  await assert.rejects(inspectDocs(temp),{message:'DOCS_STALE'});
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('preflight distinguishes an ordinary catalog edit from changed claim wording while both block staging',async t=>{
  const {temp,register}=await gitFixture();
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const path=resolve(temp,register.copySource.path);
  const before=await readFile(path,'utf8');
  assert.equal((await preflight(temp)).exitCode,0);
  // Add an unmonitored label in the literal catalog, as a localization PR would.
  const ordinary=before.replace('const definitions = {',"const definitions = { testLabels: { apply: 'Apply changes' },");
  assert.notEqual(ordinary,before);
  await writeFile(path,ordinary);
  const drift=await inspectDocs(temp);
  assert.deepEqual(drift.bindingDrift,{changedCopyKeys:[],unreadable:[]});
  assert.deepEqual(drift.staleClaims,register.claims.map(claim=>claim.id).sort());
  const local=await preflight(temp);
  assert.equal(local.exitCode,1);
  assert.match(local.message,/All monitored strings match/);
  assert.match(local.message,/generate\.py <reviewed-main-commit>/);
  const pr=await preflight(temp,{pullRequest:true});
  assert.equal(pr.exitCode,0);
  assert.match(pr.message,/^::warning::Unsigned staging blocked/);

  const edited=ordinary.replace('Authenticated encryption observed','Changed draft wording');
  assert.notEqual(edited,ordinary);
  await writeFile(path,edited);
  const changed=await inspectDocs(temp);
  assert.deepEqual(changed.bindingDrift.changedCopyKeys,['privacy.authenticated']);
  assert.deepEqual(changed.staleClaims,drift.staleClaims);
  assert.ok(changed.claimsRegister.every(claim=>!claim.evidenceCurrent));
  assert.equal(changed.semanticApproval,false);
  assert.equal(changed.approvedRelease,null);
  const wording=await preflight(temp);
  assert.equal(wording.exitCode,1);
  assert.match(wording.message,/Review changed wording and evidence: privacy\.authenticated \(vault-at-rest\)\./);
  await writeFile(path,before);
  assert.equal((await preflight(temp)).exitCode,0);
});

test('preflight differentiates evidence drift and fails unreadable, unparseable or forged inputs even in PR mode',async t=>{
  const {temp,register}=await gitFixture();
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const evidence=register.evidence[0].path;
  await writeFile(resolve(temp,evidence),'later evidence');
  const result=await preflight(temp);
  assert.equal(result.exitCode,1);
  assert.ok(result.message.includes(evidence));
  assert.doesNotMatch(result.message,/English catalog changed/);
  await rm(resolve(temp,evidence));
  let invalid=await preflight(temp,{pullRequest:true});
  assert.equal(invalid.exitCode,1);
  assert.match(invalid.message,/Restore readable, regular bound files/);
  await writeFile(resolve(temp,register.copySource.path),'const definitions = {};');
  invalid=await preflight(temp,{pullRequest:true});
  assert.equal(invalid.exitCode,1);
  assert.match(invalid.message,/Cannot compare monitored wording/);
  assert.doesNotMatch(invalid.message,/All monitored strings match|generate\.py/);
  register.copyKeys[0].sourceTextSha256='0'.repeat(64);
  await writeFile(resolve(temp,'docs/wiki-source/claims-register.json'),JSON.stringify(register));
  await assert.rejects(preflight(temp,{pullRequest:true}),{message:'DOCS_STALE'});
});
