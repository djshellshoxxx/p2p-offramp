/** Private browser qualification of the actual adapter. Synthetic fixture controls are not app APIs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { fixture, privateVectors } from '../packages/wallet/test/lib/g16-bundle-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)), temp=await mkdtemp(resolve(tmpdir(),'p2p-adapter-'));
const sha=b=>createHash('sha256').update(b).digest('hex');
let server,browser;
try {
  const bundle=await fixture(structuredClone(privateVectors.privateAgreements[1].input));
  const wireBundle={...bundle,acceptances:bundle.acceptances.map(a=>({...a,signature:Array.from(a.signature)}))};
  const modules=new Set();
  await build({configFile:false,logLevel:'warn',plugins:[{name:'adapter-graph',generateBundle(_o,output){for(const c of Object.values(output))if(c.type==='chunk')for(const name of Object.keys(c.modules))modules.add(name);}}],build:{outDir:temp,emptyOutDir:true,target:'es2023',minify:false,sourcemap:false,lib:{entry:resolve(root,'scripts/fixtures/g16-adapter-worker.mjs'),formats:['es'],fileName:()=> 'worker.js'}}});
  assert.ok([...modules].some(x=>x.endsWith('/packages/wallet/test/lib/evm-agreement-port-adapter.ts')),'ACTUAL_ADAPTER');
  assert.ok([...modules].some(x=>x.endsWith('/packages/schemas/src/evm-agreement-control.ts')),'ACTUAL_CONTROL_SCHEMA');
  assert.equal([...modules].some(x=>/g16-bundle-fixture|packages\/identity|apps\/web/.test(x)),false,'NO_APP_OR_SIGNER');
  const asset=await readFile(resolve(temp,'worker.js'));
  server=createServer((req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'");res.setHeader('Cache-Control','no-store');
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Private adapter fixture</title>');}
    else if(req.url==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(asset);}else{res.writeHead(404);res.end();}});
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});const a=server.address();assert.ok(a&&typeof a==='object');const origin=`http://127.0.0.1:${a.port}`;
  browser=await chromium.launch({executablePath:resolveChromiumPath(),args:['--no-sandbox']});const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0,consoleCount=0,pageErrors=0;
  await context.route('**/*',async route=>{if([origin+'/',origin+'/worker.js'].includes(route.request().url()))await route.continue();else{unexpected++;await route.abort();}});
  const page=await context.newPage();page.on('console',()=>consoleCount++);page.on('pageerror',()=>pageErrors++);await page.goto(origin+'/',{waitUntil:'load'});
  const result=await page.evaluate(async input=>{
    for(const a of input.acceptances)a.signature=Uint8Array.from(a.signature);
    const before=JSON.stringify(input);
    let assertions=0;const check=(x,code)=>{assertions++;if(!x)throw Error('ADAPTER_BROWSER_'+code);};
    const privatePattern=/PRIVATE-FIXTURE|paymentInstructions|agreementSalt|signature|https:\/\//;
    async function session(holdAt,failSend=false){
      const worker=new Worker('/worker.js',{type:'module'}),fixture=new MessageChannel(),wire=new MessageChannel(),f=[],w=[],waiters=[];let sequence=0,failed=false;
      function onmessage(bucket,event){const m=event.data;if(m.type==='fixtureError'||m.type==='fixtureUnhandled'||(bucket===w&&privatePattern.test(JSON.stringify(m)))){fail();return;}bucket.push(m);for(let i=waiters.length-1;i>=0;i--)if(waiters[i].bucket===bucket&&waiters[i].match(m)){const [x]=waiters.splice(i,1);clearTimeout(x.timer);x.resolve(m);}}
      function fail(){failed=true;for(const x of waiters.splice(0)){clearTimeout(x.timer);x.reject(Error('ADAPTER_BROWSER_WORKER'));}}
      fixture.port1.onmessage=e=>onmessage(f,e);wire.port1.onmessage=e=>onmessage(w,e);fixture.port1.onmessageerror=fail;wire.port1.onmessageerror=fail;worker.onerror=fail;
      function wait(bucket,match){const found=bucket.find(match);if(found)return Promise.resolve(found);if(failed)return Promise.reject(Error('ADAPTER_BROWSER_FAILED'));return new Promise((resolve,reject)=>{const x={bucket,match,resolve,reject,timer:undefined};x.timer=setTimeout(()=>{const i=waiters.indexOf(x);if(i>=0)waiters.splice(i,1);reject(Error('ADAPTER_BROWSER_TIMEOUT'));},45000);waiters.push(x);});}
      function command(command,extra={}){const id=++sequence;fixture.port1.postMessage({id,command,...extra});return id;}
      async function state(){const id=command('state');return wait(f,x=>x.type==='state'&&x.id===id);}
      worker.postMessage({fixturePort:fixture.port2,wirePort:wire.port2,holdAt,failSend},[fixture.port2,wire.port2]);await wait(f,x=>x.type==='ready');
      return {f,w,wait,command,state,send:x=>wire.port1.postMessage(x),close(){for(const x of waiters.splice(0)){clearTimeout(x.timer);x.reject(Error('ADAPTER_BROWSER_CLOSED'));}fixture.port1.close();wire.port1.close();worker.terminate();}};
    }
    const req=(id,g=0)=>({version:1,requestId:id,generation:g,operation:'checkEvmAgreement',input});
    const ctl=(op,id,g=0)=>({version:1,requestId:id,generation:g,operation:op,kind:'control'});
    const records=[];
    let s=await session(0);try{s.send(req(1));const reply=await s.wait(s.w,x=>x.kind==='response'&&x.requestId===1);check(reply.result.ok&&reply.result.value.termsHash===input.acceptances[0].termsHash,'COHERENT');const id=s.command('drain');await s.wait(s.f,x=>x.type==='drained'&&x.id===id);records.push('normal');}finally{s.close();}
    for(const at of [1,2])for(const mode of ['invalidate','dispose-resolve','dispose-reject']){
      s=await session(at);try{s.send(req(1));const held=await s.wait(s.f,x=>x.type==='held'&&x.at===at);check(held.active===1&&!held.wiped&&held.capturedNonzero,'HELD_POSITIVE');
        const invalid=mode==='invalidate',op=invalid?'invalidateEvmAgreement':'disposeEvmAgreementHost';s.send(ctl(op,2));const ack=await s.wait(s.w,x=>x.kind==='ack'&&x.requestId===2);check(ack.result.ok&&ack.result.value.held&&ack.generation===(invalid?1:0),'HELD_ACK');
        const snap=await s.state();check(snap.state.held&&snap.wiped&&snap.active===1,'LOGICAL_VS_PHYSICAL');
        if(invalid){s.send(req(3,1));const busy=await s.wait(s.w,x=>x.kind==='response'&&x.requestId===3);check(!busy.result.ok&&busy.result.error.code==='BUSY','BUSY');}
        else {const closed=await s.wait(s.w,x=>x.kind==='closed');check(closed.reason==='DISPOSED','CLOSED');}
        if(!invalid){const id=s.command('drain');await s.wait(s.f,x=>x.type==='draining'&&x.id===id);const barrier=await s.state();check(barrier.state.held&&!s.f.some(x=>x.type==='drained'&&x.id===id),'DRAIN_PENDING');
          const release=s.command('release',{mode:mode.endsWith('reject')?'reject':'resolve'});await s.wait(s.f,x=>x.type==='released'&&x.id===release);const done=await s.wait(s.f,x=>x.type==='drained'&&x.id===id);check(!done.state.held&&done.active===0&&done.maximumActive===1,'ACTUAL_DRAIN');}
        else {const id=s.command('release',{mode:'resolve'});await s.wait(s.f,x=>x.type==='released'&&x.id===id);const limit=performance.now()+45000;let state;do{state=await s.state();if(performance.now()>limit)throw Error('ADAPTER_BROWSER_IDLE_TIMEOUT');}while(state.state.held);check(state.active===0&&state.maximumActive===1,'OBSERVED_IDLE');
          s.send(req(4,1));const reply=await s.wait(s.w,x=>x.kind==='response'&&x.requestId===4);check(reply.result.ok,'AFTER_SETTLEMENT');const drain=s.command('drain');await s.wait(s.f,x=>x.type==='drained'&&x.id===drain);}
        check(!s.w.some(x=>x.kind==='response'&&x.requestId===1),'STALE_SUPPRESSED');records.push(`${at}:${mode}`);
      }finally{s.close();}
    }
    for(const mode of ['failSend','messageerror']){s=await session(1,mode==='failSend');try{s.send(req(1));await s.wait(s.f,x=>x.type==='held');
      if(mode==='failSend'){s.send(ctl('invalidateEvmAgreement',2));await s.wait(s.f,x=>x.type==='processed'&&x.requestId===2);}else {const id=s.command('messageerror');await s.wait(s.f,x=>x.type==='messageerror'&&x.id===id);}
      const state=await s.state();check(state.state.terminal&&state.state.held,'TERMINAL_HELD');if(mode==='failSend')check(state.sendAttempts===1&&s.w.length===0,'NO_RECURSIVE_SEND');else check((await s.wait(s.w,x=>x.kind==='closed')).reason==='DISPOSED','SYNTHETIC_MESSAGEERROR_CLOSE');
      const id=s.command('drain');await s.wait(s.f,x=>x.type==='draining'&&x.id===id);const release=s.command('release',{mode:'reject'});await s.wait(s.f,x=>x.type==='released'&&x.id===release);const done=await s.wait(s.f,x=>x.type==='drained'&&x.id===id);check(!done.state.held&&done.active===0,'TERMINAL_DRAIN');records.push(mode);
    }finally{s.close();}}
    check(JSON.stringify(input)===before,'CALLER_SOURCE_UNCHANGED');
    const surfaces={local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length,caches:(await caches.keys()).length,serviceWorkers:(await navigator.serviceWorker.getRegistrations()).length};check(Object.values(surfaces).every(n=>n===0),'NO_STORAGE');
    return {assertions,records,surfaces,actualAdapter:true,realDedicatedWorkerAndMessagePort:true,messageerror:'synthetic event, not native clone-failure qualification',appIncluded:false,spendingEnabled:false};
  },wireBundle);
  assert.equal(result.records.length,9);assert.equal(unexpected,0);assert.equal(consoleCount,0);assert.equal(pageErrors,0);
  console.log(JSON.stringify({fixture:'private-adapter-worker',browser:await browser.version(),...result,unexpectedRequests:unexpected,consoleMessages:consoleCount,pageErrors,artifactSha256:sha(asset),auditAcceptance:false,providerApproval:false}));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});}
