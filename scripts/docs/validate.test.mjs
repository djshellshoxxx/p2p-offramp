import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,copyFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{inspectDocs}from'./validate.mjs';
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
