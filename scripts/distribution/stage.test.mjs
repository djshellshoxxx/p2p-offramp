import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,chmod,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {stageUnsignedDistribution,verifyDistribution} from './stage.mjs';
import {FORMAT,APPROVAL,PUBLIC_COPIES,RECIPE_INPUTS,sha256,compare,validateManifest,manifestBytes,parseManifest,allowedAssetPath,allowedSourceInputPath,reviewPacket} from './manifest.mjs';

const clone=value=>structuredClone(value);
function specimen(){
 const paths=['client/index.html','client/_headers','client/content-policy.json','client/third-party-licenses.json','client/core-graph-document.json','client/core-graph-worker.json','client/local-build-evidence.json',
  'client/assets/index-demo123.js','client/assets/index-demo123.css','client/assets/vault.worker-demo123.js',
  ...['index.html','portal.css','_headers','content-policy.json','portal-build.json','downloads/BasicEscrow.json','downloads/BasicEscrow.sol','downloads/CANONICAL-EVM.md'].map(path=>'portal/'+path),
  ...PUBLIC_COPIES.map(([,path])=>path),'wiki/docs-consistency.json','review-packet.json'];
 const assets=paths.sort(compare).map(path=>({path,bytes:1,sha256:sha256('x')}));
 const inputs=[...new Set([...RECIPE_INPUTS,...PUBLIC_COPIES.map(([path])=>path)])].sort(compare).map(path=>({path,bytes:1,sha256:sha256('x')}));
 return{format:FORMAT,source:{commit:'a'.repeat(40),dirty:true,statusSha256:sha256('dirty'),inputs},
  build:{profile:'default-meta-client+scriptless-source-portal+unpublished-wiki',node:'v24.19.0',npm:'11.9.0',vite:'8.3.5',typescript:'7.0.2',react:'19.3.1',reactDom:'19.3.1',
   platform:'linux',arch:'x64',nodeExecutableSha256:sha256('node'),passes:2,localBytesEqual:true,independentWitnesses:0},
  approval:APPROVAL,assets,assetSetSha256:sha256(JSON.stringify(assets)),selfHashIncluded:false};
}
test('unsigned inventory is exact, detached and incapable of granting approval from metadata',()=>{
 const input=specimen(),checked=validateManifest(input);input.source.dirty=false;input.assets[0].sha256='0'.repeat(64);
 assert.equal(checked.source.dirty,true);assert.notEqual(checked.assets[0].sha256,input.assets[0].sha256);assert.ok(Object.isFrozen(checked.assets[0]));
 assert.deepEqual(parseManifest(new Uint8Array(manifestBytes(checked))),checked);
 for(const field of Object.keys(APPROVAL)){const bad=clone(checked);bad.approval[field]=true;assert.throws(()=>validateManifest(bad));}
 assert.throws(()=>validateManifest({...checked,reviewer:'self',status:'approved'}));
 const packet=reviewPacket({engineeringConsistency:true,semanticApproval:false,published:false,approvedRelease:null,sourceCommit:'a'.repeat(40),linkReportDigest:sha256('links')});
 assert.equal(packet.recovery.executableIncluded,false);assert.equal(packet.maintainedTrustKey,null);assert.ok(Object.values(packet.approval).every(value=>value===false));
 assert.throws(()=>reviewPacket({engineeringConsistency:true,semanticApproval:false,published:false,approvedRelease:null,sourceCommit:'PRIVATE',linkReportDigest:sha256('links')}));
 let accessed=false;assert.throws(()=>reviewPacket({get engineeringConsistency(){accessed=true;throw Error('PRIVATE');}}));assert.equal(accessed,false);
});
test('unknown files, traversal, credential paths, duplicate keys and accessor metadata fail closed',()=>{
 const original=specimen();
 for(const change of [m=>m.assets.push(m.assets[0]),m=>m.assets[0].path='../escape',m=>m.assets[0].path='client/assets/attack.js',m=>m.assets[0].bytes=-1,
  m=>m.assets[0].sha256='PRIVATE',m=>m.source.inputs[0].path='.env',m=>m.source.inputs[0].path='security/key.private.jwk',m=>m.selfHashIncluded=true,
  m=>m.build.independentWitnesses=2,m=>m.assets.splice(0,1)]){const bad=clone(original);change(bad);assert.throws(()=>validateManifest(bad));}
 let touched=false;const hostile=specimen();Object.defineProperty(hostile.source,'commit',{enumerable:true,get(){touched=true;throw Error('PRIVATE');}});
 assert.throws(()=>validateManifest(hostile));assert.equal(touched,false);
 const duplicate=JSON.stringify(original).replace('"format":','"format":"bad","format":');assert.throws(()=>parseManifest(new TextEncoder().encode(duplicate)));
 for(const path of ['../x','/x','client/assets/payload.mjs','public/key.private.jwk','archive.tar'])assert.throws(()=>{if(!allowedAssetPath(path))throw Error('refused');});
 for(const path of ['.env','apps/web/.env','docs/private-vault.json','node_modules/unknown/.credentials'])assert.equal(allowedSourceInputPath(path),false);
});
test('a public source copy cannot disagree with the retained scoped input identity',()=>{
 const bad=specimen();bad.assets.find(asset=>asset.path==='public/BasicEscrow.json').sha256=sha256('different source');
 bad.assetSetSha256=sha256(JSON.stringify(bad.assets));assert.throws(()=>validateManifest(bad));
 const missing=specimen();missing.source.inputs=missing.source.inputs.filter(record=>record.path!=='scripts/distribution/stage.mjs');assert.throws(()=>validateManifest(missing));
});
test('existing, source-tree, traversal and symlink-parent destinations are preserved without building',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'p2p-stage-path-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const existing=join(parent,'existing');await mkdir(existing);await writeFile(join(existing,'sentinel'),'keep');
 await assert.rejects(stageUnsignedDistribution({outDir:existing}),/OUTPUT_EXISTS/);assert.equal(await readFile(join(existing,'sentinel'),'utf8'),'keep');
 await assert.rejects(stageUnsignedDistribution({outDir:parent+'/child/../new'}),/OUTPUT/);
 await symlink(parent,join(parent,'linked'));await assert.rejects(stageUnsignedDistribution({outDir:join(parent,'linked','new')}),/DIRECTORY/);
 await assert.rejects(stageUnsignedDistribution({outDir:resolve('scripts/distribution/new-output')}),/OUTPUT/);
});
test('actual two-pass stage contains only validated public artifacts and equal repeat output; tampering is refused',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'p2p-stage-real-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const first=await stageUnsignedDistribution({outDir:join(parent,'first')}),second=await stageUnsignedDistribution({outDir:join(parent,'second')});
 assert.equal(await verifyDistribution(first.directory,first.manifest),true);assert.deepEqual(first.manifest,second.manifest);
 assert.equal(first.manifest.build.passes,2);assert.equal(first.manifest.build.independentWitnesses,0);assert.ok(Object.values(first.manifest.approval).every(value=>value===false));
 for(const asset of first.manifest.assets){
  const a=await readFile(resolve(first.directory,asset.path)),b=await readFile(resolve(second.directory,asset.path));assert.deepEqual(a,b);
  assert.equal((await lstat(resolve(first.directory,asset.path))).mode&0o111,0);
 }
 for(const[source,path]of PUBLIC_COPIES)assert.deepEqual(await readFile(resolve(first.directory,path)),await readFile(resolve(source)));
 const packet=JSON.parse(await readFile(resolve(first.directory,'review-packet.json'),'utf8'));assert.equal(packet.recovery.reason,'KEY_UNPINNED');
 assert.equal(first.manifest.assets.some(asset=>/recover\.mjs|\.jwk$|\.env|\.wasm$|\.node$/.test(asset.path)),false);
 const asset=first.manifest.assets.find(asset=>asset.path==='public/BasicEscrow.json'),path=resolve(first.directory,asset.path),saved=await readFile(path);
 await writeFile(path,'[]');await assert.rejects(verifyDistribution(first.directory,first.manifest));await writeFile(path,saved);
 await chmod(path,0o755);await assert.rejects(verifyDistribution(first.directory,first.manifest),/FILE/);await chmod(path,0o644);
 await rm(path);await symlink(resolve(second.directory,asset.path),path);await assert.rejects(verifyDistribution(first.directory,first.manifest),/SYMLINK/);await rm(path);await writeFile(path,saved);
 await rm(path);execFileSync('mkfifo',[path]);const start=Date.now();await assert.rejects(verifyDistribution(first.directory,first.manifest));assert.ok(Date.now()-start<1000,'nonregular inputs fail before a blocking read');await rm(path);await writeFile(path,saved);
 await mkdir(resolve(first.directory,'unexpected'));await assert.rejects(verifyDistribution(first.directory,first.manifest),/ASSET_SET/);await rm(resolve(first.directory,'unexpected'),{recursive:true});
 await writeFile(resolve(first.directory,'public/key.private.jwk'),'PRIVATE');await assert.rejects(verifyDistribution(first.directory,first.manifest),/ASSET_SET/);await rm(resolve(first.directory,'public/key.private.jwk'));
 assert.equal(await verifyDistribution(first.directory,first.manifest),true);
});
