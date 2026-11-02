/** Actual strict-CSP Chromium: public resource Worker plus the real App/native vault Worker. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright-core';
import {buildOfflineContentPolicy} from '../../security/src/content-policy.ts';
import {G29_BUDGET} from '../index.ts';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const temporary=await mkdtemp(resolve(tmpdir(),'p2p-resource-browser-')),out=resolve(temporary,'out'),modules=new Set(),errors=[];
const policy=buildOfflineContentPolicy({version:1,releaseId:'t58-native-resource-fixture',delivery:'header'}),policyHash=createHash('sha256').update(policy.csp).digest('hex');
let server,browser,unexpected=0,workerAssetBytes=0;
const passphrase='T58_SYNTHETIC_RECOVERY_ONLY_PASSPHRASE';
try{
  await mkdir(out);
  await writeFile(resolve(temporary,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>PUBLIC G29 resource conformance</title><body><div id="root"></div><section id="resource-controls"></section><script type="module" src="/entry.tsx"></script></body></html>');
  await writeFile(resolve(temporary,'entry.tsx'),`import ${JSON.stringify(resolve(root,'packages/proof-jobs/test/fixtures/real-app.tsx'))};`);
  const graph=()=>({name:'actual-resource-sources',generateBundle(_options,bundle){for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const[id,info]of Object.entries(chunk.modules))if(info.renderedLength)modules.add(id);}});
  await build({configFile:false,root:temporary,logLevel:'warn',plugins:[react(),graph()],define:{__RESOURCE_POLICY_HASH__:JSON.stringify(policyHash)},
    resolve:{alias:{react:resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom')}},worker:{format:'es',plugins:()=>[graph()]},
    build:{target:'esnext',outDir:out,emptyOutDir:true,modulePreload:false}});
  for(const suffix of ['packages/proof-jobs/src/supervisor.ts','packages/proof-jobs/src/protocol.ts','packages/proof-jobs/worker/public-resource.worker.ts','apps/web/src/ui/App.tsx','apps/web/src/runtime/worker-endpoint.ts','packages/storage/src/vault-service.ts'])assert.ok([...modules].some(name=>name.endsWith(suffix)),`actual source missing ${suffix}`);
  assert.equal([...modules].some(name=>/packages\/(?:wallet|relay|exchange|nostr-crypto)\//.test(name)),false);
  server=createServer((req,res)=>{
    const pathname=new URL(req.url??'/','http://127.0.0.1').pathname,path=resolve(out,pathname==='/'?'index.html':'.'+pathname);
    for(const[key,value]of Object.entries(policy.headers))res.setHeader(key,value);res.setHeader('Cache-Control','no-store');
    if(!path.startsWith(out+sep)||!/\.(?:html|js|css)$/.test(path)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
    void readFile(path).then(bytes=>{if(path.includes('public-resource.worker'))workerAssetBytes+=bytes.length;res.end(bytes);},()=>{res.writeHead(404);res.end();});
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.P2P_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(unexpected++,route.abort()));
  await context.routeWebSocket('**/*',socket=>{unexpected++;socket.close();});
  const page=await context.newPage(),nativeWorkers=[];
  page.on('worker',worker=>{if(worker.url().includes('public-resource.worker')){const record={url:worker.url(),closed:false};nativeWorkers.push(record);worker.on('close',()=>record.closed=true);}});
  page.on('pageerror',error=>{if(!String(error).includes('Public resource fixture crash.'))errors.push(String(error));});
  const response=await page.goto(origin);assert.equal(response.headers()['content-security-policy'],policy.csp);assert.ok(!policy.csp.includes('unsafe-eval'));
  await page.getByRole('heading',{name:'Your local workspace',exact:true}).waitFor();await page.locator('#public-resource-start').waitFor();
  const snapshot=()=>page.evaluate(()=>window.publicResourceFixture.snapshot());
  const beforeDefault=await snapshot();assert.equal(await page.evaluate(()=>window.publicResourceFixture.defaultRequest()),'UNSUPPORTED_PROVIDER');
  assert.equal((await snapshot()).defaultCollectors,0);assert.equal((await snapshot()).created,beforeDefault.created);
  await page.getByRole('button',{name:'Create new profile',exact:true}).click();await page.locator('#create-passphrase').fill(passphrase);await page.locator('#create-confirm').fill(passphrase);await page.locator('#create-consent').check();
  await page.getByRole('button',{name:'Create encrypted profile',exact:true}).click();await page.getByRole('button',{name:'Lock vault',exact:true}).waitFor();
  const profileId=await page.evaluate(()=>window.publicResourceFixture.profileId());assert.match(profileId,/^[0-9a-f]{32}$/);
  await page.getByRole('link',{name:'Recovery',exact:true}).click();await page.getByRole('heading',{name:'Recovery',exact:true}).waitFor();
  await page.locator('#export-profile').fill(profileId);await page.locator('#export-consent').check();
  await page.locator('#public-resource-mode').selectOption('1');await page.locator('#public-resource-consent').check();await page.locator('#public-resource-start').click();
  await page.waitForFunction(()=>window.publicResourceFixture.snapshot().proveCommands>=1);assert.equal((await snapshot()).outcomes.length,0);
  await page.getByRole('button',{name:'Refresh vault status',exact:true}).click();await page.getByRole('button',{name:'Refresh vault status',exact:true}).waitFor({state:'visible'});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download unchecked encrypted backup',exact:true}).click();const file=await download,backupPath=resolve(temporary,'actual-current-backup.json');await file.saveAs(backupPath);
  await page.locator('#verification-file').setInputFiles(backupPath);await page.locator('#verification-passphrase').fill(passphrase);await page.getByRole('button',{name:'Verify this backup file',exact:true}).click();
  await page.getByText(new RegExp(`Backup file authenticated against profile.*${profileId}.*revision.*0`)).waitFor();
  assert.equal((await snapshot()).outcomes.length,0,'actual vault status/export/verification finish while independent CPU work remains active');
  await page.getByRole('button',{name:'Lock vault',exact:true}).click();await page.waitForFunction(()=>window.publicResourceFixture.snapshot().outcomes.length===1);
  assert.equal((await snapshot()).outcomes[0].code,'LOCKED');
  const untilClosed=async()=>{for(let i=0;i<100;i++){if(nativeWorkers.every(worker=>worker.closed))return;await new Promise(done=>setTimeout(done,20));}assert.fail('Native resource Worker did not close.');};
  await untilClosed();
  const run=async(mode,budget='normal',extras={})=>{
    const before=(await snapshot()).outcomes.length;await page.locator('#public-resource-consent').check();
    await page.evaluate(({mode,budget,extras})=>{void window.publicResourceFixture.begin(mode,budget,extras.reentry??false,extras.cancelOnProgress??false);},{mode,budget,extras});
    await page.waitForFunction(count=>window.publicResourceFixture.snapshot().outcomes.length>count,before);await untilClosed();return(await snapshot()).outcomes.at(-1);
  };
  await page.locator('#public-resource-size').selectOption('1048576');const exact=await run(0);assert.equal(exact.ok,true);assert.deepEqual(exact.firstBytes,[0,15,255,255]);assert.equal(exact.kind,'unverified-resource-output');
  const countBefore=(await snapshot()).created;await page.locator('#public-resource-size').selectOption('1048577');assert.equal((await run(0)).code,'LIMIT_EXCEEDED');assert.equal((await snapshot()).created,countBefore);
  await page.locator('#public-resource-size').selectOption('16');
  for(const[mode,expected]of [[3,'LIMIT_EXCEEDED'],[4,'INTEGRITY_FAILURE'],[5,'LIMIT_EXCEEDED'],[6,'UNAVAILABLE'],[7,'UNSUPPORTED_PROVIDER'],[8,'INTEGRITY_FAILURE']])assert.equal((await run(mode)).code,expected,`native fixture mode${mode}`);
  const heartbeat=await run(2,'heartbeat');assert.equal(heartbeat.code,'CANCELLED');assert.ok(heartbeat.elapsedMs>=500&&heartbeat.elapsedMs<2000);
  const wall=await run(9,'wall');assert.equal(wall.code,'CANCELLED');assert.ok(wall.elapsedMs>=1000&&wall.elapsedMs<2500);
  assert.equal((await run(0,'normal',{reentry:true})).ok,true);assert.equal((await snapshot()).reentrantCode,'LIMIT_EXCEEDED');
  // Real two-facade contention plus ignored cooperative cancellation/actual native closure.
  const beforeBusy=(await snapshot()).outcomes.length,beforeBusyProve=(await snapshot()).proveCommands;await page.locator('#public-resource-consent').check();await page.evaluate(()=>{void window.publicResourceFixture.begin(1);});await page.waitForFunction(count=>window.publicResourceFixture.snapshot().proveCommands>count,beforeBusyProve);
  const createdBusy=(await snapshot()).created;await page.locator('#public-resource-consent').check();await page.evaluate(()=>{void window.publicResourceFixture.begin(0);});await page.waitForFunction(count=>window.publicResourceFixture.snapshot().outcomes.length>count,beforeBusy);
  assert.equal((await snapshot()).outcomes.at(-1).code,'LIMIT_EXCEEDED');assert.equal((await snapshot()).created,createdBusy);
  await page.evaluate(()=>window.publicResourceFixture.cancel());await page.waitForFunction(count=>window.publicResourceFixture.snapshot().outcomes.length>=count+2,beforeBusy);await untilClosed();
  const beforeResume=(await snapshot()).outcomes.length,beforeResumeProve=(await snapshot()).proveCommands;await page.locator('#public-resource-consent').check();await page.evaluate(()=>{void window.publicResourceFixture.begin(2);});await page.waitForFunction(count=>window.publicResourceFixture.snapshot().proveCommands>count,beforeResumeProve);await page.evaluate(()=>window.publicResourceFixture.resume());
  await page.waitForFunction(count=>window.publicResourceFixture.snapshot().outcomes.length>count,beforeResume);assert.equal((await snapshot()).outcomes.at(-1).code,'CANCELLED');await untilClosed();
  const oldCount=(await snapshot()).outcomes.length;await page.evaluate(()=>window.publicResourceFixture.replayRetired());assert.equal((await snapshot()).outcomes.length,oldCount);
  const final=await snapshot();assert.equal(final.created,final.terminated);assert.equal(final.created,final.detached);assert.equal(final.created,nativeWorkers.length);assert.ok(nativeWorkers.every(worker=>worker.closed));assert.equal(final.allInputPublic,true);assert.equal(final.defaultCollectors,0);assert.equal(final.policyHash,policyHash);
  assert.ok(final.cancelCommands>=5);assert.ok(workerAssetBytes>0&&workerAssetBytes<G29_BUDGET.maxNetworkBytes);assert.equal(unexpected,0);assert.deepEqual(errors,[]);
  for(const outcome of final.outcomes)for(const key of ['proofVerified','receiptAuthority','economicPreparationAllowed'])assert.equal(outcome[key],false);
  await page.evaluate(()=>window.publicResourceFixture.dispose());
  console.log(JSON.stringify({fixture:'actual-native-public-resource-and-vault',browser:browser.version(),nativeResourceWorkers:final.created,actualNativeClosures:nativeWorkers.filter(worker=>worker.closed).length,
    emptyProviderBeforeCollector:true,exactInputBoundary:true,oversizedInputBeforeWorker:true,malformedResultIdentityAndMessageCaps:true,actualWorkerCrash:true,heartbeat:true,wallDeadline:true,
    sharedTabAdmission:true,callbackReentry:true,ignoredCancelTerminated:true,lateReplyIgnored:true,resumeCancellation:true,actualVaultBackupAndLockResponsive:true,allInputsPublic:true,
    browserWasm:'unsupported-under-unchanged-CSP',csp:policy.csp,publicWorkerAssetBytes:workerAssetBytes,providerRuntimeNetworkBytes:0,externalRequests:0,providerApproved:false,proofVerified:false,receiptAuthority:false,releaseEnabled:false}));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temporary,{recursive:true,force:true});}
