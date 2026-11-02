/** Real nested local staging smoke. No distribution/host/release/device approval. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {stageUnsignedDistribution} from './stage.mjs';
import {PORTAL_HEADERS} from '../portal/policy.mjs';
import {offlinePolicy} from '../../apps/web/scripts/static-build-plugin.mjs';
import {resolveChromiumPath} from '../lib/chromium-path.mjs';

const temporary=await mkdtemp(join(tmpdir(),'p2p-stage-browser-')),unexpected=[],checks=[];
let browser,server;
const pass=name=>{checks.push(name);console.log('ok - '+name);};
try{
 const stage=await stageUnsignedDistribution({outDir:resolve(temporary,'stage')}),base='/nested/review/',allowed=new Set(stage.manifest.assets.map(asset=>asset.path));
 allowed.add('distribution-manifest.json');
 server=createServer((request,response)=>{
  const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
  if(!pathname.startsWith(base)||!allowed.has(pathname.slice(base.length))){response.writeHead(404);response.end();return;}
  const path=pathname.slice(base.length),headers=path.startsWith('portal/')?PORTAL_HEADERS:path.startsWith('client/')?offlinePolicy('header').headers:{};
  const type=path.endsWith('.html')?'text/html':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.json')?'application/json':'application/octet-stream';
  void readFile(resolve(stage.directory,path)).then(bytes=>{response.writeHead(200,{'Content-Type':type,...headers});response.end(bytes);},()=>{response.writeHead(404);response.end();});
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:resolveChromiumPath(),args:['--no-sandbox']});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(unexpected.push('EXTERNAL_REQUEST'),route.abort()));
 const page=await context.newPage();page.on('pageerror',()=>unexpected.push('CLIENT_ERROR'));
 const initial=await page.goto(origin+base+'client/index.html#/home');
 assert.ok(initial.headers()['content-security-policy'].includes("connect-src 'none'"));
 await page.getByRole('heading',{name:'Your local workspace',exact:true}).waitFor();
 await page.getByRole('button',{name:'Unlock existing profile',exact:true}).waitFor();
 await page.getByRole('link',{name:'Recovery',exact:true}).click();await page.getByRole('heading',{name:'Recovery',exact:true,level:1}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Recovery',exact:true,level:1}).waitFor();
 assert.ok((await page.locator('body').innerText()).includes('Funds disabled'));assert.equal(await page.locator('script[src]').count(),1);
 pass('actual default client and native Worker load and reload a nested recovery route with local CSP');
 await context.close();
 const scriptless=await browser.newContext({javaScriptEnabled:false,acceptDownloads:true,serviceWorkers:'block'});
 await scriptless.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(unexpected.push('EXTERNAL_REQUEST'),route.abort()));
 const portal=await scriptless.newPage(),response=await portal.goto(origin+base+'portal/index.html');
 assert.equal(response.headers()['content-security-policy'],PORTAL_HEADERS['Content-Security-Policy']);
 await portal.getByRole('heading',{name:'Security and recovery references',exact:true}).waitFor();assert.equal(await portal.locator('script,form,iframe,input,button').count(),0);
 await portal.reload();await portal.getByRole('heading',{name:'Security and recovery references',exact:true}).waitFor();
 for(const name of ['BasicEscrow.json','BasicEscrow.sol','CANONICAL-EVM.md']){
  const download=portal.waitForEvent('download');await portal.locator(`a[href="./downloads/${name}"]`).click();const result=await download;
  assert.equal(await result.failure(),null);assert.deepEqual(await readFile(await result.path()),await readFile(resolve(stage.directory,'portal/downloads',name)));
 }
 pass('actual scriptless portal reloads and downloads exact original source references from nested paths');
 for(const path of ['wiki/docs/wiki-source/Home.md','wiki/docs/OPERATOR.md','wiki/scripts/docs/README.md','wiki/docs/wiki-source/docs-manifest.json','public/package-lock.json']){
  const response=await scriptless.request.get(origin+base+path);assert.equal(response.status(),200);assert.deepEqual(await response.body(),await readFile(resolve(stage.directory,path)));
 }
 await scriptless.close();assert.deepEqual(unexpected,[]);
 pass('unpublished wiki and public dependency records remain byte-exact downloadable review material');
 console.log(JSON.stringify({fixture:'unsigned-distribution-nested-smoke',checks:checks.length,browser:browser.version(),assets:stage.manifest.assets.length,
  buildPasses:2,localHeaderFixture:true,hostHeadersVerified:false,independentDistributionWitness:false,signedRelease:false,releaseEnabled:false,published:false,unexpectedRequests:unexpected.length}));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temporary,{recursive:true,force:true});}
