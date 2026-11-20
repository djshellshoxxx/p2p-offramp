/** Actual local header enforcement plus JS-disabled portal. Not deployed-host or release acceptance. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { buildPortal, PORTAL_DOWNLOADS, readPortalSource } from './portal/build.mjs';
import { PORTAL_HEADERS } from './portal/policy.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const temp = await mkdtemp(resolve(tmpdir(),'p2p-scriptless-browser-'));
let browser, server;
const checks = [], unexpected = [], requested = [];
const pass = name => { checks.push(name); console.log(`ok - ${name}`); };
try {
  const out = resolve(temp,'portal'), { report } = await buildPortal({outDir:out});
  const allowed = new Set([...report.assets.map(asset=>asset.path),'portal-build.json']);
  let scriptRequests=0, connectionRequests=0, frameRequests=0;
  server = createServer((request,response)=>{
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    requested.push(path);
    const send = (status,type,body,headers=true) => {
      response.writeHead(status,{'Content-Type':type,...(headers?PORTAL_HEADERS:{})}); response.end(body);
    };
    if(path==='/wrapper.html')return send(200,'text/html','<!doctype html><title>Framing probe</title><iframe src="/portal/index.html" title="Blocked portal"></iframe>',false);
    if(path==='/policy-probe.html')return send(200,'text/html',`<!doctype html><title>Hostile policy probe</title>
      <base href="https://outside.invalid/"><script>window.inlinePortalExecuted=true</script>
      <script src="/attack.js"></script><iframe src="/forbidden-frame.html"></iframe><h1>Policy probe</h1>`);
    if(path==='/attack.js'){scriptRequests++;return send(200,'text/javascript','window.externalPortalExecuted=true');}
    if(path==='/forbidden-connect'){connectionRequests++;return send(200,'text/plain','forbidden');}
    if(path==='/forbidden-frame.html'){frameRequests++;return send(200,'text/html','<h1>Forbidden frame</h1>');}
    if(!path.startsWith('/portal/') || !allowed.has(path.slice('/portal/'.length)))return send(404,'text/plain','Not found');
    const relative=path.slice('/portal/'.length);
    const type=relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':relative.endsWith('.json')?'application/json':'application/octet-stream';
    void readFile(resolve(out,relative)).then(bytes=>send(200,type,bytes),()=>send(404,'text/plain','Not found'));
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:resolveChromiumPath(),args:['--no-sandbox']});
  const context=await browser.newContext({javaScriptEnabled:false,acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(unexpected.push('NETWORK'),route.abort()));
  const page=await context.newPage(), response=await page.goto(origin+'/portal/index.html');
  assert.equal(response.headers()['content-security-policy'],PORTAL_HEADERS['Content-Security-Policy']);
  await page.getByRole('heading',{name:'Security and recovery references',exact:true}).waitFor();
  for(const text of ['Trading disabled','No approved deployment','No approved release key','A deferred payout','uncertain broadcast','cannot sign or send'])assert.ok((await page.locator('body').innerText()).includes(text));
  assert.equal(await page.locator('script,iframe,form,input,button').count(),0);
  await page.getByRole('link',{name:'Skip to recovery information'}).click();
  assert.ok(page.url().endsWith('#content'));
  for(const width of [320,768,1280]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'hashes/instructions reflow');
  }
  pass('JavaScript-disabled portal remains readable, navigable and responsive under actual served CSP');
  for(const item of PORTAL_DOWNLOADS){
    const pending=page.waitForEvent('download');
    await page.getByRole('link',{name:item.label,exact:true}).click();
    const download=await pending;
    assert.equal(await download.failure(),null);
    assert.deepEqual(await readFile(await download.path()),await readPortalSource(item.source));
  }
  assert.ok(requested.every(path=>path.startsWith('/portal/')&&allowed.has(path.slice('/portal/'.length))));
  pass('all source-reference downloads retain exact checkout bytes without JavaScript or external requests');
  await page.emulateMedia({media:'print'});
  assert.equal(await page.getByRole('heading',{name:'Printable recovery checklist',exact:true}).isVisible(),true);
  assert.equal(await page.locator('.skip').isVisible(),false);
  const pdf=await page.pdf({format:'A4',printBackground:true}); assert.ok(pdf.length>5000);
  pass('print styling preserves the recovery checklist and generates a real printable PDF');
  await context.close();

  // JavaScript is enabled here: disabled scripting alone cannot qualify script-src enforcement.
  const hostile=await browser.newContext({serviceWorkers:'block'});
  await hostile.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(unexpected.push('NETWORK'),route.abort()));
  const probe=await hostile.newPage(), blocked=[];
  probe.on('console',message=>{if(message.type()==='error')blocked.push(message.text());});
  const probeResponse=await probe.goto(origin+'/policy-probe.html');
  assert.equal(probeResponse.headers()['content-security-policy'],PORTAL_HEADERS['Content-Security-Policy']);
  assert.deepEqual(await probe.evaluate(()=>({inline:typeof window.inlinePortalExecuted,external:typeof window.externalPortalExecuted})),{inline:'undefined',external:'undefined'});
  assert.equal(await probe.evaluate(()=>document.baseURI),origin+'/policy-probe.html','base-uri none is enforced');
  assert.equal(await probe.evaluate(async()=>{try{await fetch('/forbidden-connect');return 'allowed';}catch{return 'blocked';}}),'blocked');
  assert.equal(scriptRequests,0);assert.equal(connectionRequests,0);assert.equal(frameRequests,0);
  assert.ok(blocked.some(text=>text.includes('script-src')));
  assert.ok(blocked.some(text=>text.includes('connect-src')));
  assert.ok(blocked.some(text=>text.includes('frame-src')));
  pass('JS-enabled hostile probes cannot execute inline/external scripts, connect, frame or replace the base URL');
  await probe.goto(origin+'/wrapper.html');
  await probe.waitForFunction(()=>document.querySelector('iframe')?.contentDocument===null);
  assert.ok(blocked.some(text=>text.includes('frame-ancestors')),'actual response header prevents framing');
  pass('actual frame-ancestors response header prevents a separate page from framing the portal');
  assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({fixture:'scriptless-local-portal',browser:browser.version(),checks:checks.length,javaScriptDisabledReadability:true,
    localHeaderEnforcement:true,deployedHostHeadersVerified:false,externalRequests:unexpected.length,signedRelease:false,approvedDeployment:false,releaseEnabled:false,
    bootstrapAuthenticated:false,accessibilityAcceptance:false}));
} finally {
  await browser?.close();
  if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}
  await rm(temp,{recursive:true,force:true});
}
