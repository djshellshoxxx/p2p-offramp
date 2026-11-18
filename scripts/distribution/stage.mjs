/** Deterministic local unsigned staging only. No signer, archive, deployment or publication action exists. */
import {constants} from 'node:fs';
import {lstat,open,opendir,realpath,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname,relative,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {scanBuild} from '../../apps/web/scripts/build.mjs';
import {inspectArtifactFiles,safeArtifactPath} from '../../apps/web/scripts/artifact-policy.mjs';
import {verifyPortalDirectory} from '../portal/build.mjs';
import {parseStrictJsonBytes} from '../../packages/schemas/index.ts';
import {SEPOLIA_RELEASE_KEY_ID} from '../../apps/web/src/testnet/sepolia-network.ts';
import {isMain} from '../lib/is-main.mjs';
import {FORMAT,APPROVAL,MAX_FILES,MAX_FILE_BYTES,MAX_TOTAL_BYTES,PUBLIC_COPIES,RECIPE_INPUTS,sha256,compare,allowedAssetPath,allowedSourceInputPath,validateManifest,manifestBytes,reviewPacket} from './manifest.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url)),run=promisify(execFile);
const fail=code=>{throw Error(code);};
const cleanEnv=work=>Object.fromEntries(Object.entries({PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,
 NODE_ENV:'production',TZ:'UTC',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TMPDIR:work,
 GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',NPM_CONFIG_USERCONFIG:'/dev/null',NPM_CONFIG_GLOBALCONFIG:resolve(work,'npm-global.conf'),NPM_CONFIG_IGNORE_SCRIPTS:'true',NPM_CONFIG_OFFLINE:'true'}).filter(([,value])=>typeof value==='string'));
const git=async(args,env)=> (await run('git',args,{cwd:ROOT,env,maxBuffer:1024*1024})).stdout.trim();
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function realDirectory(path){if(await realpath(path)!==path||(await lstat(path)).isSymbolicLink()||!(await lstat(path)).isDirectory())fail('DISTRIBUTION_DIRECTORY');}
/** Nonblocking/no-follow bounded native read; never open an unlisted input to discover its contents. */
async function readRegular(path,{executable=false,max=MAX_FILE_BYTES}={}){
 const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.size<1n||before.size>BigInt(max)||!executable&&(before.mode&0o111n)!==0n)fail('DISTRIBUTION_FILE');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let buffer;
 try{
  if(!same(before,await handle.stat({bigint:true})))fail('DISTRIBUTION_CHANGED');
  buffer=Buffer.alloc(Number(before.size)+1);let length=0;
  while(length<buffer.length){const{bytesRead}=await handle.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead;}
  if(BigInt(length)!==before.size||!same(before,await handle.stat({bigint:true})))fail('DISTRIBUTION_CHANGED');
  return Buffer.from(buffer.subarray(0,length));
 }finally{buffer?.fill(0);await handle.close();}
}
async function publicSource(path){
 if(!allowedSourceInputPath(path))fail('DISTRIBUTION_SOURCE_PATH');let target=ROOT;
 for(const part of path.split('/')){target=resolve(target,part);if((await lstat(target)).isSymbolicLink())fail('DISTRIBUTION_SOURCE_SYMLINK');}
 return readRegular(target,{executable:true});
}
function text(bytes){try{const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(value.includes('\0')||/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|[a-z][a-z0-9+.-]*:\/\/[^\s/"'<>]+@/i.test(value))fail('DISTRIBUTION_NON_PUBLIC_CONTENT');return value;}catch{fail('DISTRIBUTION_NON_TEXT');}}
function identity(path,bytes){return{path,bytes:bytes.length,sha256:sha256(bytes)};}
async function inventory(directory,prefix='',allowed=()=>true){
 await realDirectory(directory);const files=new Map();let total=0;
 const directories=new Set(['client','client/assets','portal','portal/downloads','public','wiki','wiki/docs','wiki/docs/wiki-source','wiki/docs/lab','wiki/scripts','wiki/scripts/docs']);
 async function walk(path,base){
  const names=[];
  for await(const entry of await opendir(path)){if(names.length>=MAX_FILES+directories.size)fail('DISTRIBUTION_LIMIT');names.push(entry.name);}
  names.sort(compare);
  for(const name of names){
   const relativePath=safeArtifactPath(base+name),target=resolve(path,name),stat=await lstat(target);
   if(stat.isSymbolicLink())fail('DISTRIBUTION_ARTIFACT_SYMLINK');
   if(stat.isDirectory()){if(!directories.has(prefix+relativePath))fail('DISTRIBUTION_ASSET_SET');await walk(target,relativePath+'/');}
   else{
    if(!allowed(relativePath)||files.size>=MAX_FILES||!stat.isFile())fail('DISTRIBUTION_ASSET_SET');
    const bytes=await readRegular(target);text(bytes);total+=bytes.length;if(total>MAX_TOTAL_BYTES)fail('DISTRIBUTION_LIMIT');files.set(prefix+relativePath,bytes);
   }
  }
 }
 await walk(directory,'');return files;
}
async function nodeDigest(){
 const path=await realpath(process.execPath),handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK),buffer=Buffer.alloc(65536),hash=createHash('sha256');
 try{const before=await handle.stat({bigint:true});if(!before.isFile()||before.size<1n||before.size>256n*1024n*1024n)fail('DISTRIBUTION_NODE_BINARY');
  let length=0;for(;;){const{bytesRead}=await handle.read(buffer,0,buffer.length,length);if(!bytesRead)break;length+=bytesRead;if(BigInt(length)>before.size)fail('DISTRIBUTION_CHANGED');hash.update(buffer.subarray(0,bytesRead));}
  if(BigInt(length)!==before.size||!same(before,await handle.stat({bigint:true})))fail('DISTRIBUTION_CHANGED');return hash.digest('hex');
 }finally{buffer.fill(0);await handle.close();}
}
const CHILD=`import{writeFile,readFile}from'node:fs/promises';import{resolve}from'node:path';import{execFileSync}from'node:child_process';
import{buildWeb}from'./apps/web/scripts/build.mjs';import{buildPortal}from'./scripts/portal/build.mjs';import{inspectDocs}from'./scripts/docs/validate.mjs';
const work=process.argv[1];let phase='DOCS_STALE';try{
const docs=await inspectDocs();phase='CLIENT_BUILD_REFUSED';const client=await buildWeb({delivery:'meta',outDir:resolve(work,'client')});
phase='PORTAL_BUILD_REFUSED';const portal=await buildPortal({outDir:resolve(work,'portal')});phase='TOOLS_UNAVAILABLE';
const version=async name=>JSON.parse(await readFile(resolve('node_modules',name,'package.json'),'utf8')).version;
const tools={node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8',timeout:10000}).trim(),vite:await version('vite'),typescript:await version('typescript'),react:await version('react'),reactDom:await version('react-dom'),platform:process.platform,arch:process.arch};
phase='BUILD_RESULT_INVALID';await writeFile(resolve(work,'builder.json'),JSON.stringify({client,portal:portal.report,docs,tools},null,2)+'\\n',{flag:'wx'});
}catch{await writeFile(resolve(work,'builder-error.json'),JSON.stringify({code:phase}),{flag:'wx'});process.exitCode=1;}`;
async function buildPass(path,env){
 await mkdir(path,{mode:0o700});
 try{await run(process.execPath,['--input-type=module','--eval',CHILD,path],{cwd:ROOT,env,maxBuffer:8*1024*1024,timeout:120000});}
 catch{
  let code='BUILD_OR_DOCS_REFUSED';
  try{const result=parseStrictJsonBytes(new Uint8Array(await readRegular(resolve(path,'builder-error.json'),{max:1024})),1024);
   if(Object.keys(result).length===1&&['DOCS_STALE','CLIENT_BUILD_REFUSED','PORTAL_BUILD_REFUSED','TOOLS_UNAVAILABLE','BUILD_RESULT_INVALID'].includes(result.code))code=result.code;
  }catch{/* Never surface child stderr, environment, credentials or raw provider details. */}
  fail('DISTRIBUTION_'+code);
 }
 const evidence=parseStrictJsonBytes(new Uint8Array(await readRegular(resolve(path,'builder.json'))),MAX_FILE_BYTES);
 if(evidence.client?.ReleaseEnabled!==0||evidence.client.syntheticDemo!==false||evidence.client.testnet!==false||evidence.client.signedRelease!==false||
    evidence.docs?.engineeringConsistency!==true||evidence.docs.semanticApproval!==false||evidence.docs.published!==false)fail('DISTRIBUTION_BUILD_PROOF');
 const files=await inventory(resolve(path,'client'),'client/',path=>allowedAssetPath('client/'+path));
 for(const[assetPath,bytes]of await inventory(resolve(path,'portal'),'portal/',path=>allowedAssetPath('portal/'+path)))files.set(assetPath,bytes);
 await verifyPortalDirectory(resolve(path,'portal'),evidence.portal);await scanBuild(resolve(path,'client'));
 return{files,evidence};
}
async function outputPath(outDir){
 if(typeof outDir!=='string'||!outDir||outDir.length>4096||outDir.includes('\0')||outDir.split(/[\\/]/).includes('..'))fail('DISTRIBUTION_OUTPUT');
 const directory=resolve(outDir);await realDirectory(dirname(directory));
 try{await lstat(directory);fail('DISTRIBUTION_OUTPUT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 const path=relative(ROOT,directory);
 if(!path.startsWith('..'+sep)&&path!=='..'&&!path.startsWith(sep)){
  if(!path.startsWith('artifacts'+sep))fail('DISTRIBUTION_OUTPUT');
  try{await run('git',['check-ignore','--quiet','--',path],{cwd:ROOT,env:cleanEnv(tmpdir())});}catch{fail('DISTRIBUTION_OUTPUT_NOT_IGNORED');}
 }
 return directory;
}
async function ownedRemove(path,owned){try{const current=await lstat(path,{bigint:true});if(!current.isSymbolicLink()&&current.dev===owned.dev&&current.ino===owned.ino)await rm(path,{recursive:true,force:true});}catch(error){if(error.code!=='ENOENT')throw error;}}

/** Exact local consistency against retained bytes; never signature/bootstrap or distribution authentication. */
export async function verifyDistribution(directory,retained){
 const manifest=validateManifest(retained),files=await inventory(resolve(directory),'',path=>path==='distribution-manifest.json'||allowedAssetPath(path));
 const actualManifest=files.get('distribution-manifest.json');files.delete('distribution-manifest.json');
 if(!actualManifest||!actualManifest.equals(manifestBytes(manifest))||files.size!==manifest.assets.length)fail('DISTRIBUTION_MANIFEST_MISMATCH');
 for(const asset of manifest.assets){const bytes=files.get(asset.path);if(!bytes||bytes.length!==asset.bytes||sha256(bytes)!==asset.sha256)fail('DISTRIBUTION_ASSET_MISMATCH');}
 await scanBuild(resolve(directory,'client'));
 const portal=parseStrictJsonBytes(new Uint8Array(files.get('portal/portal-build.json')),MAX_FILE_BYTES);await verifyPortalDirectory(resolve(directory,'portal'),portal);
 const docs=parseStrictJsonBytes(new Uint8Array(files.get('wiki/docs-consistency.json')),MAX_FILE_BYTES);
 if(!files.get('review-packet.json').equals(Buffer.from(JSON.stringify(reviewPacket(docs),null,2)+'\n')))fail('DISTRIBUTION_REVIEW_PACKET');
 return true;
}

export async function stageUnsignedDistribution({outDir}={}){
 const directory=await outputPath(outDir);
 if(SEPOLIA_RELEASE_KEY_ID!==null)fail('DISTRIBUTION_PROFILE_CHANGED');
 for(const name of ['.env','.env.local','.env.meta','.env.meta.local']){
  try{await lstat(resolve(ROOT,'apps/web',name));fail('DISTRIBUTION_PRIVATE_BUILD_INPUT');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 const temporaryRoot=await realpath(tmpdir());await realDirectory(temporaryRoot);
 const work=await mkdtemp(join(temporaryRoot,'p2p-unsigned-stage-')),workOwned=await lstat(work,{bigint:true}),env=cleanEnv(work);
 let created;
 try{
  await writeFile(resolve(work,'npm-global.conf'),'',{flag:'wx',mode:0o600});
  const commit=await git(['rev-parse','HEAD'],env),status=await git(['status','--porcelain=v1','--untracked-files=all'],env);
  const sourceInputs=new Map();
  const bindInput=record=>{const previous=sourceInputs.get(record.path);if(previous&&(previous.bytes!==record.bytes||previous.sha256!==record.sha256))fail('DISTRIBUTION_SOURCE_CHANGED');sourceInputs.set(record.path,record);};
  for(const path of new Set([...RECIPE_INPUTS,...PUBLIC_COPIES.map(([path])=>path)]))bindInput(identity(path,await publicSource(path)));
  const binary=await nodeDigest(),first=await buildPass(resolve(work,'first'),env),second=await buildPass(resolve(work,'second'),env);
  if(first.evidence.portal.sourceCommit!==commit||first.evidence.portal.sourceStatusSha256!==sha256(status))fail('DISTRIBUTION_SOURCE_CHANGED');
  if(JSON.stringify(first.evidence)!==JSON.stringify(second.evidence)||first.files.size!==second.files.size||
    [...first.files].some(([path,bytes])=>!bytes.equals(second.files.get(path)??Buffer.alloc(0))))fail('DISTRIBUTION_BUILDS_DIFFER');
  const files=first.files;
  for(const[source,path]of PUBLIC_COPIES){const bytes=await publicSource(source);bindInput(identity(source,bytes));files.set(path,bytes);}
  for(const record of first.evidence.portal.sourceAssets)bindInput(record);
  const docs=first.evidence.docs;files.set('wiki/docs-consistency.json',Buffer.from(JSON.stringify(docs,null,2)+'\n'));
  files.set('review-packet.json',Buffer.from(JSON.stringify(reviewPacket(docs),null,2)+'\n'));
  for(const name of ['client/core-graph-document.json','client/core-graph-worker.json']){
   const graph=parseStrictJsonBytes(new Uint8Array(files.get(name)),MAX_FILE_BYTES);
   if(!Array.isArray(graph.modules)||graph.modules.length>MAX_FILES)fail('DISTRIBUTION_SOURCE_GRAPH');
   for(const module of graph.modules){
    safeArtifactPath(module.path);
    if(!/^(?:apps\/web\/|packages\/|node_modules\/(?:react|react-dom|scheduler)\/)/.test(module.path)||!/(?<!\.test)\.(?:[cm]?[jt]sx?|css|html)$/.test(module.path))fail('DISTRIBUTION_SOURCE_GRAPH');
    const record=identity(module.path,await publicSource(module.path));if(record.sha256!==module.sha256)fail('DISTRIBUTION_SOURCE_CHANGED');bindInput(record);
   }
  }
  for(const record of [docs.copySource,...docs.sourceEvidence]){
   const actual=identity(record.path,await publicSource(record.path));if(actual.sha256!==record.sha256)fail('DISTRIBUTION_SOURCE_CHANGED');bindInput(actual);
  }
  for(const[path,record]of sourceInputs)if(record.sha256!==sha256(await publicSource(path)))fail('DISTRIBUTION_SOURCE_CHANGED');
  if(commit!==await git(['rev-parse','HEAD'],env)||status!==await git(['status','--porcelain=v1','--untracked-files=all'],env)||binary!==await nodeDigest())fail('DISTRIBUTION_SOURCE_CHANGED');
  const assets=[...files].sort(([a],[b])=>compare(a,b)).map(([path,bytes])=>identity(path,bytes));
  const manifest=validateManifest({format:FORMAT,source:{commit,dirty:status!=='',statusSha256:sha256(status),inputs:[...sourceInputs.values()].sort((a,b)=>compare(a.path,b.path))},
   build:{profile:'default-meta-client+scriptless-source-portal+unpublished-wiki',...first.evidence.tools,nodeExecutableSha256:binary,passes:2,localBytesEqual:true,independentWitnesses:0},
   approval:APPROVAL,assets,assetSetSha256:sha256(JSON.stringify(assets)),selfHashIncluded:false});
  // The strict allowlist is checked before any destination write; source references remain text, not executables.
  for(const[path,bytes]of files){if(!allowedAssetPath(path))fail('DISTRIBUTION_ASSET_SET');text(bytes);}
  inspectArtifactFiles(Object.fromEntries([...files].filter(([path])=>path.startsWith('public/')||path.startsWith('wiki/')).map(([path,bytes])=>[path,text(bytes)])));
  await mkdir(directory,{mode:0o700});created=await lstat(directory,{bigint:true});
  for(const[path,bytes]of [...files,['distribution-manifest.json',manifestBytes(manifest)]]){await mkdir(dirname(resolve(directory,path)),{recursive:true,mode:0o700});await writeFile(resolve(directory,path),bytes,{flag:'wx',mode:0o644});}
  await verifyDistribution(directory,manifest);
  return Object.freeze({directory,manifest});
 }catch(error){if(created)await ownedRemove(directory,created);throw error;}
 finally{await ownedRemove(work,workOwned);}
}
if(isMain(import.meta.url)){
 try{const{values,positionals}=parseArgs({options:{out:{type:'string'}},strict:true,allowPositionals:true});if(positionals.length||!values.out)fail('DISTRIBUTION_ARGUMENTS');
  const result=await stageUnsignedDistribution({outDir:values.out});console.log(JSON.stringify({ok:true,sourceCommit:result.manifest.source.commit,sourceDirty:result.manifest.source.dirty,assets:result.manifest.assets.length,releaseEnabled:false,signedRelease:false,published:false}));
 }catch{console.log(JSON.stringify({ok:false,error:{code:'DISTRIBUTION_STAGE_REFUSED'},releaseEnabled:false,published:false}));process.exitCode=1;}
}
