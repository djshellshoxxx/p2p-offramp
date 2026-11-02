import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import{createHash}from'node:crypto';
import {validateAuthorityDecision,validateProposal,evaluateCompatibility}from'../index.ts';
import {checkGovernanceRecord}from'../../../scripts/governance/check.mjs';
const decision={version:1,decisionId:'a'.repeat(32),scope:'source',affectedCapability:'local-core',previousArtifactHash:null,nextArtifactHash:null,reviewers:[],evidencePaths:['evidence.txt'],status:'proposed'};
const proposal={version:1,id:'change-1',kind:'storage',priorVersion:'v1',proposedVersion:'v2',affectedSpecs:['spec.txt'],compatibleReaders:['v1','v2'],compatibleWriters:['v2'],migrationId:null,recoveryArtifactHashes:[],threatImpactPath:'threat.txt',testEvidencePaths:['evidence.txt'],status:'draft'};
test('exact inert schemas copy/freeze records; imported status or reviewer names confer no authority',()=>{
 const d=structuredClone(decision);const checked=validateAuthorityDecision(d);assert.equal(checked.ok,true);d.evidencePaths[0]='changed';assert.equal(checked.value.evidencePaths[0],'evidence.txt');assert.equal(Object.isFrozen(checked.value.reviewers),true);
 for(const status of ['draft','review','accepted','implemented']){const result=evaluateCompatibility('v2','v2',{...proposal,status});assert.equal(result.value.kind,'compatible');assert.equal(result.value.economicPreparationAllowed,false);assert.equal(result.value.authority,'inert-record-only');}
});
test('negative schema boundaries reject unknown properties, duplicates, versions, paths and hostile input',()=>{
 for(const change of [{extra:true},{decisionId:'A'.repeat(32)},{reviewers:['same','same']},{evidencePaths:['../secret']},{evidencePaths:['https://site/path']},{evidencePaths:['a%2fb']},{evidencePaths:['a\\b']},{evidencePaths:['/etc/passwd']},{evidencePaths:['a//b']},{scope:'admin'},{status:'implemented'},{nextArtifactHash:'0x'+'a'.repeat(64)}])assert.equal(validateAuthorityDecision({...decision,...change}).ok,false);
 assert.equal(validateAuthorityDecision({...decision,version:2}).error.code,'UNSUPPORTED_VERSION');assert.equal(validateProposal({...proposal,testEvidencePaths:Array.from({length:129},(_,i)=>`file-${i}`)}).error.code,'LIMIT_EXCEEDED');
 for(const change of [{kind:'governance'},{status:'proposed'},{compatibleReaders:['v1','v1']},{compatibleWriters:['*']},{proposedVersion:'v2 || execute'},{affectedSpecs:['spec.txt','spec.txt']},{recoveryArtifactHashes:['deadbeef']}])assert.equal(validateProposal({...proposal,...change}).ok,false);
 const hostile=Proxy.revocable({},{});hostile.revoke();assert.equal(validateProposal(hostile.proxy).ok,false);let reads=0;assert.equal(validateAuthorityDecision({...decision,get reviewers(){reads++;throw Error();}}).ok,false);assert.equal(reads,0);
});
test('exact compatibility table never infers semver support or allows inactive proposals',()=>{
 for(const [reader,writer,kind,rationale]of[['v1','v2','compatible','EXACT_MATCH'],['v1','v1','read-only','WRITER_UNSUPPORTED'],['v3','v2','unsupported','READER_UNSUPPORTED']])assert.deepEqual(evaluateCompatibility(reader,writer,proposal).value,{kind,rationale,economicPreparationAllowed:false,authority:'inert-record-only'});
 for(const status of ['rejected','retired'])assert.equal(evaluateCompatibility('v2','v2',{...proposal,status}).value.rationale,'PROPOSAL_INACTIVE');
});
test('local evidence checks missing/dead files, digest linkage and symlink escape without executing files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'governance-')),outside=await mkdtemp(join(tmpdir(),'gov-outside-'));
 try{
  const write=async record=>writeFile(join(root,'record.json'),JSON.stringify(record));await writeFile(join(root,'evidence.txt'),'inert code: never execute');await write(decision);assert.equal((await checkGovernanceRecord(root,'record.json')).ok,true);
  await write({...decision,evidencePaths:['missing']});assert.equal((await checkGovernanceRecord(root,'record.json')).ok,false);
  await writeFile(join(outside,'secret'),'outside');await symlink(join(outside,'secret'),join(root,'escape'));await write({...decision,evidencePaths:['escape']});assert.equal((await checkGovernanceRecord(root,'record.json')).ok,false);
  await mkdir(join(root,'directory'));await write({...decision,evidencePaths:['directory']});assert.equal((await checkGovernanceRecord(root,'record.json')).ok,false);
  await write({...decision,nextArtifactHash:'a'.repeat(64)});assert.equal((await checkGovernanceRecord(root,'record.json')).code,'ARTIFACT_HASH_UNMATCHED');
  const digest=createHash('sha256').update('inert code: never execute').digest('hex');await write({...proposal,affectedSpecs:[],threatImpactPath:'evidence.txt',recoveryArtifactHashes:[digest]});assert.equal((await checkGovernanceRecord(root,'record.json')).ok,true);
  await writeFile(join(root,'evidence.txt'),'altered');assert.equal((await checkGovernanceRecord(root,'record.json')).code,'ARTIFACT_HASH_UNMATCHED');
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
test('descriptor reads reject native final-component swaps and growth for both records and evidence',async()=>{
 const fs=(await import('node:fs/promises')).default,originalOpen=fs.open;
 const root=await mkdtemp(join(tmpdir(),'gov-race-')),outside=await mkdtemp(join(tmpdir(),'gov-race-outside-'));
 try{
  for(const [name,mode]of[['evidence.txt','symlink'],['evidence.txt','grow'],['record.json','grow']]){
   await fs.rm(join(root,'evidence.txt'),{force:true});await writeFile(join(root,'evidence.txt'),'safe');await writeFile(join(outside,'outside'),'untrusted outside');await writeFile(join(root,'record.json'),JSON.stringify(decision));
   let injected=false;
   fs.open=async(path,...args)=>{
    const handle=await originalOpen(path,...args);
    if(path===join(root,name)){
     const stat=handle.stat.bind(handle);
     handle.stat=async(...options)=>{const result=await stat(...options);if(!injected){injected=true;if(mode==='symlink'){await fs.unlink(path);await symlink(join(outside,'outside'),path);}else await fs.truncate(path,name==='record.json'?131073:16*1024*1024+1);}return result;};
    }
    return handle;
   };
   const result=await checkGovernanceRecord(root,'record.json');fs.open=originalOpen;
   assert.equal(injected,true);assert.equal(result.ok,false,`${name} ${mode} must not accept stale stat/path evidence`);
  }
 }finally{fs.open=originalOpen;await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
test('actual descriptor bytes enforce aggregate evidence cap and reject changed same-length content',async()=>{
 const fs=(await import('node:fs/promises')).default,originalOpen=fs.open;const root=await mkdtemp(join(tmpdir(),'gov-bytecap-'));
 try{
  const paths=Array.from({length:5},(_,i)=>`evidence-${i}`);for(const path of paths){await writeFile(join(root,path),'');await fs.truncate(join(root,path),16*1024*1024);}
  await writeFile(join(root,'record.json'),JSON.stringify({...decision,evidencePaths:paths}));assert.equal((await checkGovernanceRecord(root,'record.json')).code,'LIMIT_EXCEEDED');
  await writeFile(join(root,'small'),'a'.repeat(70000));await writeFile(join(root,'record.json'),JSON.stringify({...decision,evidencePaths:['small']}));let changed=false;
  fs.open=async(path,...args)=>{const handle=await originalOpen(path,...args);if(path===join(root,'small')){const read=handle.read.bind(handle);handle.read=async(...options)=>{const result=await read(...options);if(!changed){changed=true;await writeFile(path,'b'.repeat(70000));}return result;};}return handle;};
  assert.equal((await checkGovernanceRecord(root,'record.json')).ok,false);assert.equal(changed,true);
 }finally{fs.open=originalOpen;await rm(root,{recursive:true,force:true});}
});
