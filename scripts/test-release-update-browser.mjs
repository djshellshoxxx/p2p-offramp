/** Finite LOCAL HTTPS/G05/G15/T34/origin-transition proof. No production bootstrap or route claim. */
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {createHash,X509Certificate} from 'node:crypto';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {chromium} from 'playwright-core';
import {resolveChromiumPath} from './lib/chromium-path.mjs';
import {fixture,canonical,encode,sha} from '../packages/security/test/lib/release-fixture.mjs';
import {registryFixture} from '../packages/security/test/lib/release-registry-fixture.mjs';
import {RAW_CID,DAG_PB_CID} from '../packages/security/test/lib/locator-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(resolve(tmpdir(),'p2p-update-')),out=resolve(temporary,'out');
const release=fixture(),wallet=registryFixture(),faults=new Set(),requests=[],modules=new Set(),responses=new Map();let browser,server,unexpected=0;
const pass='T66 owned source synthetic passphrase',nextPass='T66 fresh destination synthetic passphrase';
try{
  const certPath=resolve(temporary,'local.crt'),keyPath=resolve(temporary,'local.key');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=local-only-update-fixture','-addext','subjectAltName=DNS:*.ipfs.localhost,DNS:updates.localhost'],{stdio:'ignore'});
  const cert=await readFile(certPath),spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
  server=createServer({key:await readFile(keyPath),cert},(req,res)=>{
    const url=new URL(req.url??'/',`https://${req.headers.host}`),host=url.hostname;requests.push({host,path:url.pathname,query:url.search});
    const key=host+' '+url.pathname,record=responses.get(key);if(!record){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; worker-src 'self'; connect-src ${origins.join(' ')}; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`);
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.html')||url.pathname==='/'?'text/html':'application/json');
    let bytes=record;if(host===candidateHost&&faults.has('asset')&&url.pathname==='/version.txt'){bytes=new Uint8Array(record);bytes[0]^=1;}
    if(host===candidateHost&&faults.has('signature')&&url.pathname==='/release-signature.json'){const env=JSON.parse(new TextDecoder().decode(record));env.signature=(env.signature[0]==='A'?'B':'A')+env.signature.slice(1);bytes=encode(JSON.stringify(env));}
    if(host===candidateHost&&faults.has('key')&&url.pathname==='/release-signature.json')bytes=encode(JSON.stringify(other.makeEnvelope(candidateBytes)));
    res.setHeader('Content-Length',bytes.length);res.end(bytes);
  });
  await new Promise((done,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',done);});
  const port=server.address().port,sourceHost=RAW_CID+'.ipfs.localhost',candidateHost=DAG_PB_CID+'.ipfs.localhost',updateHost='updates.localhost';
  const sourceOrigin=`https://${sourceHost}:${port}`,candidateOrigin=`https://${candidateHost}:${port}`,updateOrigin=`https://${updateHost}:${port}`,origins=[sourceOrigin,candidateOrigin,updateOrigin];
  const graph=()=>({name:'actual-update-composition',generateBundle(_options,bundle){for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const[id,info]of Object.entries(chunk.modules))if(info.renderedLength)modules.add(id);}});
  await build({configFile:false,logLevel:'warn',plugins:[graph()],define:{__UPDATE_LOCAL_KEY__:JSON.stringify(release.key),__UPDATE_LOCAL_KEY_ID__:JSON.stringify(release.keyId),__UPDATE_LOCAL_GATEWAY__:JSON.stringify(`https://ipfs.localhost:${port}/`),__UPDATE_LOCAL_SOURCE__:JSON.stringify(updateOrigin)},worker:{format:'es',plugins:()=>[graph()]},build:{target:'esnext',outDir:out,emptyOutDir:true,minify:false,lib:{entry:resolve(root,'scripts/fixtures/release-update-browser.ts'),formats:['es'],fileName:()=> 'update-fixture.js'}}});
  for(const suffix of ['packages/security/src/release-update.ts','packages/security/src/release-update-http.ts','packages/security/src/release-update-store.ts','packages/security/src/release-manifest.ts','packages/security/src/release-locator.ts','packages/transport/src/policy.ts','apps/web/src/runtime/worker-endpoint.ts','packages/storage/src/vault-service.ts','packages/wallet/src/evm-adapter.ts'])assert.ok([...modules].some(path=>path.endsWith(suffix)),`actual source missing ${suffix}`);
  const files=new Map();async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,ent.name);if(ent.isDirectory())await walk(path);else files.set(relative(out,path).replaceAll('\\','/'),new Uint8Array(await readFile(path)));}}await walk(out);
  files.set('index.html',encode('<!doctype html><html lang="en"><meta charset="utf-8"><title>LOCAL signed asset update</title><body><script type="module" src="/update-fixture.js"></script></body></html>'));
  files.set('wallet-registry.json',wallet.registryBytes);files.set('version.txt',encode('source version one'));
  const sourceAssets=new Map(files),candidateAssets=new Map(files);candidateAssets.set('version.txt',encode('candidate version two'));
  const now=Math.floor(Date.now()/1000),makeManifest=(assets,sequence)=>({...release.manifest,releaseId:'local-update-'+sequence,sequence,createdAt:now-10,expiresAt:now+3600,assets:[...assets].sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)}))});
  const sourceManifest=makeManifest(sourceAssets,1),candidateManifest=makeManifest(candidateAssets,2),sourceBytes=encode(canonical(sourceManifest)),candidateBytes=encode(canonical(candidateManifest)),other=fixture();
  for(const[host,assets,bytes]of [[sourceHost,sourceAssets,sourceBytes],[candidateHost,candidateAssets,candidateBytes]]){
    for(const[path,content]of assets){responses.set(host+' /'+path,content);if(path==='index.html')responses.set(host+' /',content);}
    responses.set(host+' /installed-release.json',bytes);responses.set(host+' /installed-signature.json',encode(JSON.stringify(release.makeEnvelope(bytes))));responses.set(host+' /release.json',bytes);responses.set(host+' /release-signature.json',encode(JSON.stringify(release.makeEnvelope(bytes))));
  }
  const locator={v:1,channel:candidateManifest.channel,sequence:2,manifestSha256:sha(candidateBytes),cid:DAG_PB_CID,archiveSha256:null,createdAt:candidateManifest.createdAt,expiresAt:candidateManifest.expiresAt},locatorBytes=encode(canonical(locator)),signedLocator=release.makeEnvelope(locatorBytes,'p2p-offramp/release-locator/v1\n'),locatorEnvelope={keyId:signedLocator.keyId,alg:signedLocator.alg,signature:signedLocator.signature};
  responses.set(updateHost+' /locator.json',locatorBytes);responses.set(updateHost+' /locator-signature.json',encode(JSON.stringify(locatorEnvelope)));
  browser=await chromium.launch({executablePath:resolveChromiumPath(),args:['--no-sandbox','--no-proxy-server',`--ignore-certificate-errors-spki-list=${spki}`,'--host-resolver-rules=MAP *.localhost 127.0.0.1']});
  const context=await browser.newContext({serviceWorkers:'block'}),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(origins.includes(u.origin)&&!u.search&&!u.hash&&responses.has(u.hostname+' '+u.pathname))return route.continue();unexpected++;return route.abort();});
  await context.routeWebSocket('**/*',socket=>{unexpected++;socket.close();});
  async function open(){const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));await page.goto(sourceOrigin);await page.waitForFunction(()=>!!window.updateFixture);return page;}
  const page=await open(),snap=p=>p.evaluate(()=>window.updateFixture.snapshot()),click=async()=>{await page.locator('#update-accept').click();await page.waitForFunction(()=>window.updateFixture.snapshot().lastAccept!==undefined);return(await snap(page)).lastAccept;};
  assert.equal((await snap(page)).metrics.defaultFetches,0);assert.equal((await page.evaluate(()=>window.updateFixture.strictCheck())).reason,'POLICY_BLOCKED');assert.equal((await snap(page)).metrics.strictFetches,0);
  assert.equal(await page.evaluate(()=>window.updateFixture.check()),'candidate',JSON.stringify(await snap(page)));assert.equal((await click()).error.code,'BACKUP_REQUIRED');assert.equal(await page.evaluate(()=>window.updateFixture.floor()),null);
  const profileId=await page.evaluate(pass=>window.updateFixture.create(pass),pass),sourceFile=await page.evaluate(()=>window.updateFixture.export());
  const verified=await page.evaluate(({bytes,pass})=>window.updateFixture.verify(bytes,pass),{bytes:sourceFile,pass});assert.equal(verified.profileId,profileId);assert.equal(verified.revision,0);
  const peer=await open();const initial=await page.evaluate(()=>window.updateFixture.casRead());assert.equal(initial,null);
  const race=await Promise.all([page,peer].map((p,i)=>p.evaluate(({expected,sequence})=>window.updateFixture.cas(expected,sequence),{expected:null,sequence:3+i})));assert.equal(race.filter(x=>x==='written').length,1);assert.equal(race.filter(x=>x==='conflict').length,1);
  const casWinner=await page.evaluate(()=>window.updateFixture.casRead());assert.equal(await peer.evaluate(value=>window.updateFixture.cas(value,value.sequence),casWinner),'same');
  await peer.evaluate(()=>window.updateFixture.corruptCas());await assert.rejects(page.evaluate(()=>window.updateFixture.casRead()),/STORAGE_UNAVAILABLE/);await assert.rejects(peer.evaluate(()=>window.updateFixture.cas(null,10)),/STORAGE_UNAVAILABLE/);assert.equal(await page.evaluate(()=>window.updateFixture.floor()),null);
  const encrypted=async(p,id)=>p.evaluate(id=>new Promise((done,bad)=>{const req=indexedDB.open('p2p-offramp-vault',1);req.onerror=()=>bad(Error('DB'));req.onsuccess=()=>{const db=req.result,tx=db.transaction('vaults','readonly'),get=tx.objectStore('vaults').get(id);get.onsuccess=()=>done(get.result??null);tx.oncomplete=()=>db.close();};}),id);
  const originalRow=await encrypted(peer,profileId);
  for(const fault of ['asset','signature','key']){faults.add(fault);assert.equal(await page.evaluate(()=>window.updateFixture.check()),'untrusted');faults.delete(fault);assert.equal(await page.evaluate(()=>window.updateFixture.floor()),null);}
  assert.equal(await page.evaluate(()=>window.updateFixture.check()),'candidate');await page.evaluate(()=>window.updateFixture.startWallet());await page.waitForFunction(()=>window.updateFixture.snapshot().metrics.walletPending===1);
  assert.equal((await click()).error.code,'BUSY');await page.evaluate(()=>window.updateFixture.cancelWallet());assert.equal((await snap(page)).metrics.walletPending,1);assert.equal((await click()).error.code,'BUSY');assert.equal(await page.evaluate(()=>window.updateFixture.floor()),null);
  await page.evaluate(()=>window.updateFixture.finishWallet());assert.equal((await snap(page)).metrics.walletOutcome,'CANCELLED');
  const navigation=page.waitForURL(candidateOrigin+'/');await page.locator('#update-accept').click();await navigation;await page.waitForFunction(()=>!!window.updateFixture);
  const destinationSnapshot=await snap(page);assert.equal(destinationSnapshot.state,'locked');assert.equal(destinationSnapshot.profileId,null);assert.equal(destinationSnapshot.metrics.walletCalls.length,0);assert.equal(destinationSnapshot.installedSequence,2);
  const accepted=await peer.evaluate(()=>window.updateFixture.floor());assert.equal(accepted.sequence,2);assert.equal(accepted.manifestSha256,sha(candidateBytes));
  assert.equal((await page.evaluate(()=>window.updateFixture.profiles())).profileIds.length,0);
  assert.equal(await page.evaluate(({bytes,next})=>window.updateFixture.restore(bytes,'wrong structured passphrase',next),{bytes:sourceFile,next:nextPass}),'AUTHENTICATION_FAILED');
  const restored=await page.evaluate(({bytes,pass,next})=>window.updateFixture.restore(bytes,pass,next),{bytes:sourceFile,pass,next:nextPass});assert.notEqual(restored.newProfileId,profileId);
  assert.equal(await page.evaluate(({id,pass})=>window.updateFixture.unlock(id,pass),{id:restored.newProfileId,pass:nextPass}),'unlocked');
  assert.equal(await page.evaluate(({bytes,pass})=>window.updateFixture.verify(bytes,pass),{bytes:sourceFile,pass}),'CONFLICT');
  const destinationFile=await page.evaluate(()=>window.updateFixture.export()),destinationReceipt=await page.evaluate(({bytes,pass})=>window.updateFixture.verify(bytes,pass),{bytes:destinationFile,pass:nextPass});assert.equal(destinationReceipt.profileId,restored.newProfileId);assert.equal(destinationReceipt.revision,0);
  const destinationRow=await encrypted(page,restored.newProfileId);assert.notEqual(destinationRow.keyId,originalRow.keyId);assert.notEqual(destinationRow.snapshot.ciphertext,originalRow.snapshot.ciphertext);assert.deepEqual(await encrypted(peer,profileId),originalRow);assert.equal(await encrypted(page,profileId),null);
  assert.ok(requests.every(req=>!req.query));assert.equal(unexpected,0);assert.deepEqual(errors,[]);await page.evaluate(()=>window.updateFixture.close());await peer.evaluate(()=>window.updateFixture.close());
  console.log(JSON.stringify({fixture:'local-supported-asset-update',browser:browser.version(),actualHTTPS:true,certificate:'ephemeral-local-SPKI-only',compiledEphemeralReleaseKey:true,actualG05:true,defaultNullNoFetch:true,strictDirectNoFetch:true,completeAssetAndLocatorVerification:true,tamperRefused:true,actualAcceptedIndexedDB:true,atomicTwoDocumentCAS:true,corruptFloorNoReset:true,foreignNamespacePreserved:true,currentBackupRequired:true,actualT34:true,heldActualAdapterProviderRefusedThroughAbort:true,acceptedFloorBeforeNavigation:true,sourceSequence:1,candidateSequence:2,newOriginLockedAndDisconnected:true,freshKeyExplicitRestore:true,sourceCiphertextPreserved:true,sourceFileNotDestinationBackupProof:true,externalRequests:unexpected,productionTrust:false,productionWalletIntegration:false,releaseEnabled:false}));
  await context.close();
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}await rm(temporary,{recursive:true,force:true});}
