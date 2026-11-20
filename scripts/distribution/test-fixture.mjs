/** Test-only historical client + current tooling. Never changes maintained source or evidence records. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,cp,readFile,rm,lstat,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {resolveTool} from '../lib/tool-path.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url)),run=promisify(execFile);
export const BOUND_CLIENT_COMMIT='2b23ee614ff2dd05bd3a6e79f1278658c30a3909';
export const BOUND_CLIENT_TREE='a3701267756596e833247f50614c5ddc32f2cce0';
const TOOLING=['scripts/distribution/stage.mjs','scripts/distribution/manifest.mjs',
 'scripts/docs/validate.mjs','scripts/docs/copy-source.mjs','scripts/docs/generate.py'];

export async function createBoundDistributionFixture(){
 const parent=await mkdtemp(join(await realpath(tmpdir()),'p2p-bound-stage-')),root=resolve(parent,'source');
 let added=false;
 const git=(...args)=>run(resolveTool('git'),args,{cwd:ROOT,maxBuffer:1024*1024});
 const dispose=async()=>{try{if(added)await git('worktree','remove','--force',root);}finally{await rm(parent,{recursive:true,force:true});}};
 try{
  assert.equal((await git('rev-parse',`${BOUND_CLIENT_COMMIT}^{tree}`)).stdout.trim(),BOUND_CLIENT_TREE);
  await git('worktree','add','--detach',root,BOUND_CLIENT_COMMIT);added=true;
  assert.equal((await lstat(resolve(ROOT,'node_modules'))).isSymbolicLink(),false);
  await cp(resolve(ROOT,'node_modules'),resolve(root,'node_modules'),{recursive:true,verbatimSymlinks:true});
  assert.equal((await lstat(resolve(root,'node_modules'))).isSymbolicLink(),false);
  const toolingHashes={};
  for(const path of TOOLING){
   await mkdir(dirname(resolve(root,path)),{recursive:true});await copyFile(resolve(ROOT,path),resolve(root,path));
   toolingHashes[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
  }
  const stage=async outDir=>{
   const script="import{stageUnsignedDistribution}from'./scripts/distribution/stage.mjs';console.log(JSON.stringify(await stageUnsignedDistribution({outDir:process.argv[1]})))";
   const result=await run(process.execPath,['--import','./scripts/test-support/register-tsx.mjs','--input-type=module','-e',script,outDir],{cwd:root,maxBuffer:8*1024*1024,timeout:120000});
   const answer=JSON.parse(result.stdout);
   assert.equal(answer.manifest.source.commit,BOUND_CLIENT_COMMIT);
   assert.equal(answer.manifest.source.dirty,true,'the copied current tooling is explicitly a dirty historical fixture');
   return answer;
  };
  return {root,sourceCommit:BOUND_CLIENT_COMMIT,sourceTree:BOUND_CLIENT_TREE,toolingHashes,stage,dispose};
 }catch(error){await dispose();throw error;}
}
