import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,chmod,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {stageUnsignedDistribution,verifyDistribution} from './stage.mjs';
import {inspectDocs} from '../docs/validate.mjs';
import {createBoundDistributionFixture} from './test-fixture.mjs';
import {FORMAT,APPROVAL,PUBLIC_COPIES,RECIPE_INPUTS,sha256,compare,validateManifest,manifestBytes,parseManifest,allowedAssetPath,allowedSourceInputPath,reviewPacket} from './manifest.mjs';

const clone=value=>structuredClone(value);
function specimen(){
 const paths=['client/index.html','client/_headers','client/content-policy.json','client/third-party-licenses.json','client/core-graph-document.json','client/core-graph-worker.json','client/qr-graph-worker.json','client/local-build-evidence.json',
  'client/assets/index-demo123.js','client/assets/index-demo123.css','client/assets/OfflineRoot-demo123.js','client/assets/vault.worker-demo123.js','client/assets/decode.worker-demo123.js',
  ...['index.html','portal.css','_headers','content-policy.json','portal-build.json','downloads/BasicEscrow.json','downloads/BasicEscrow.sol','downloads/CANONICAL-EVM.md'].map(path=>'portal/'+path),
  ...PUBLIC_COPIES.map(([,path])=>path),'wiki/docs-consistency.json','review-packet.json'];
 const assets=[...paths].sort(compare).map(path=>({path,bytes:1,sha256:sha256('x')}));
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
test('the default distribution requires the exact offline and pinned QR artifact roles',()=>{
 assert.doesNotThrow(()=>validateManifest(specimen()));
 assert.equal(allowedSourceInputPath('node_modules/jsqr/dist/jsQR.js'),true);
 assert.equal(allowedSourceInputPath('node_modules/jsqr/future.js'),false);
 for(const path of ['client/qr-graph-worker.json','client/assets/decode.worker-demo123.js','client/assets/OfflineRoot-demo123.js']){
  const missing=specimen();missing.assets=missing.assets.filter(asset=>asset.path!==path);
  missing.assetSetSha256=sha256(JSON.stringify(missing.assets));assert.throws(()=>validateManifest(missing));
 }
 for(const path of ['client/assets/decode.worker-second.js','client/assets/OfflineRoot-second.js']){
  const duplicate=specimen();duplicate.assets.push({path,bytes:1,sha256:sha256('x')});
  duplicate.assets.sort((a,b)=>compare(a.path,b.path));duplicate.assetSetSha256=sha256(JSON.stringify(duplicate.assets));
  assert.throws(()=>validateManifest(duplicate));
 }
});
test('personalization source inventory admits only the exact reviewed favorites and templates pairs',()=>{
 for(const path of ['packages/personalization/favorites.ts','packages/personalization/src/favorites.ts','packages/personalization/templates.ts','packages/personalization/src/trade-draft-store.ts'])assert.equal(allowedSourceInputPath(path),true,path);
 for(const path of ['packages/personalization/index.ts','packages/personalization/src/other.ts','packages/personalization/test/favorites.test.mjs','packages/personalization/test/trade-draft-store.test.mjs','packages/personalization/src/future-template.ts'])assert.equal(allowedSourceInputPath(path),false,path);
});
test('existing, source-tree, traversal and symlink-parent destinations are preserved without building',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'p2p-stage-path-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const existing=join(parent,'existing');await mkdir(existing);await writeFile(join(existing,'sentinel'),'keep');
 await assert.rejects(stageUnsignedDistribution({outDir:existing}),/OUTPUT_EXISTS/);assert.equal(await readFile(join(existing,'sentinel'),'utf8'),'keep');
 await assert.rejects(stageUnsignedDistribution({outDir:parent+'/child/../new'}),/OUTPUT/);
 await symlink(parent,join(parent,'linked'));await assert.rejects(stageUnsignedDistribution({outDir:join(parent,'linked','new')}),/DIRECTORY/);
 await assert.rejects(stageUnsignedDistribution({outDir:resolve('scripts/distribution/new-output')}),/OUTPUT/);
});
test('current unsigned staging binds matching evidence or refuses stale records without waiving them',async t=>{
 const docs=await inspectDocs();assert.equal(docs.semanticApproval,false);assert.equal(docs.published,false);
 const parent=await mkdtemp(join(tmpdir(),'p2p-stage-stale-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const outDir=join(parent,'current');
 if(docs.stale.length){
  await assert.rejects(stageUnsignedDistribution({outDir}),{message:'DISTRIBUTION_SOURCE_CHANGED'});
  await assert.rejects(lstat(outDir),{code:'ENOENT'});
 }else{
  const staged=await stageUnsignedDistribution({outDir});assert.equal(await verifyDistribution(staged.directory,staged.manifest),true);
 }
});
test('draft record generation takes copy text from the selected immutable catalog, not later source edits',async t=>{
 const fixture=await createBoundDistributionFixture();t.after(()=>fixture.dispose());
 const registerPath=resolve(fixture.root,'docs/wiki-source/claims-register.json'),manifestPath=resolve(fixture.root,'docs/wiki-source/docs-manifest.json');
 const before=await readFile(registerPath),manifest=await readFile(manifestPath),register=JSON.parse(before);
 const path=resolve(fixture.root,register.copySource.path),source=await readFile(path,'utf8');
 const changed=source.replace('Authenticated encryption observed','Later unapproved working-tree copy');assert.notEqual(changed,source);
 await writeFile(path,changed);
 execFileSync('python',['scripts/docs/generate.py','--allow-local',register.sourceCommit],{cwd:fixture.root,stdio:'pipe',timeout:30000});
 assert.deepEqual(await readFile(registerPath),before);assert.deepEqual(await readFile(manifestPath),manifest);
 const report=await inspectDocs(fixture.root);assert.deepEqual(report.stale,[register.copySource.path]);
 assert.ok(report.claimsRegister.every(claim=>claim.evidenceCurrent===false));
 assert.equal(report.semanticApproval,false);assert.equal(report.published,false);
});
test('historical bound client with current tooling stages twice exactly; current-source distribution remains separate',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'p2p-stage-real-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const fixture=await createBoundDistributionFixture();t.after(()=>fixture.dispose());
 const first=await fixture.stage(join(parent,'first')),second=await fixture.stage(join(parent,'second'));
 assert.equal(await verifyDistribution(first.directory,first.manifest),true);assert.deepEqual(first.manifest,second.manifest);
 assert.equal(first.manifest.build.passes,2);assert.equal(first.manifest.build.independentWitnesses,0);assert.ok(Object.values(first.manifest.approval).every(value=>value===false));
 for(const asset of first.manifest.assets){
  const a=await readFile(resolve(first.directory,asset.path)),b=await readFile(resolve(second.directory,asset.path));assert.deepEqual(a,b);
  assert.equal((await lstat(resolve(first.directory,asset.path))).mode&0o111,0);
 }
 for(const[source,path]of PUBLIC_COPIES)assert.deepEqual(await readFile(resolve(first.directory,path)),await readFile(resolve(fixture.root,source)));
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
 console.log(JSON.stringify({fixture:'historical-bound-client-current-tooling',sourceCommit:fixture.sourceCommit,sourceTree:fixture.sourceTree,
  toolingHashes:fixture.toolingHashes,currentSourceDistributionQualified:false,semanticApproval:false,published:false}));
});
