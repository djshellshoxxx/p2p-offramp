import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedHttpDriver, MAX_HTTP_BYTES, MAX_HTTP_OPERATIONS } from '../src/http-driver.ts';
function scope() { const abort = new AbortController(); return { signal:abort.signal,current:()=>!abort.signal.aborted,dispose:()=>abort.abort(),run:async work=>({ok:true,value:await work(abort.signal)}) }; }
function reply(chunks, options={}) { return {ok:true,redirected:false,url:'https://example.test/data',headers:new Headers(),body:new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(chunk);c.close();}}),...options}; }
test('HTTP driver bounds streamed bytes, pins destination, omits credentials and does not retry',async()=>{
 let calls=0,init;
 const driver=new BoundedHttpDriver(async(url,args)=>{calls++;init=args;assert.equal(url,'https://example.test/data');return reply([new Uint8Array([1,2]),new Uint8Array([3])]);});
 const body=new Uint8Array([4]);const result=await driver.request(scope(),'https://example.test/data',body);
 assert.deepEqual(result,{ok:true,value:new Uint8Array([1,2,3])});assert.equal(calls,1);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.method,'POST');assert.deepEqual(body,new Uint8Array([4]));assert.equal(driver.pending,0);
 for(const bad of ['http://example.test/data','https://u:p@example.test/data','https://example.test/data#x','https://example.test:443/data'])assert.equal((await driver.request(scope(),bad)).ok,false);
 assert.equal(calls,1);
});
test('HTTP driver rejects oversized, redirected, changed URL and broken streams with no fallback',async()=>{
 for(const response of [reply([new Uint8Array(MAX_HTTP_BYTES+1)]),reply([],{headers:new Headers({'content-length':String(MAX_HTTP_BYTES+1)})}),reply([],{redirected:true}),reply([],{url:'https://other.test/data'}),reply([],{body:null})]){
  let calls=0;const driver=new BoundedHttpDriver(async()=>{calls++;return response;});assert.equal((await driver.request(scope(),'https://example.test/data')).ok,false);assert.equal(calls,1);assert.equal(driver.pending,0);
 }
});
test('HTTP native slots stay occupied until uncancellable work drains; disposal suppresses late results',async()=>{
 const releases=[];const driver=new BoundedHttpDriver(()=>new Promise(resolve=>releases.push(resolve)));const scopes=Array.from({length:MAX_HTTP_OPERATIONS},scope);
 const jobs=scopes.map(s=>driver.request(s,'https://example.test/data'));assert.equal(driver.pending,MAX_HTTP_OPERATIONS);
 assert.deepEqual(await driver.request(scope(),'https://example.test/data'),{ok:false,error:'LIMIT_EXCEEDED'});
 scopes.forEach(s=>s.dispose());assert.equal(driver.pending,MAX_HTTP_OPERATIONS);
 releases.forEach(release=>release(reply([new Uint8Array([9])])));const results=await Promise.all(jobs);assert.ok(results.every(r=>!r.ok&&r.error==='CANCELLED'));assert.equal(driver.pending,0);
});
test('HTTP driver caps empty-fragment work and rejects truncated content length',async()=>{
 const fragments=new BoundedHttpDriver(async()=>reply(Array.from({length:1025},()=>new Uint8Array())));
 assert.deepEqual(await fragments.request(scope(),'https://example.test/data'),{ok:false,error:'LIMIT_EXCEEDED'});
 const truncated=new BoundedHttpDriver(async()=>reply([new Uint8Array([1])],{headers:new Headers({'content-length':'2'})}));
 assert.deepEqual(await truncated.request(scope(),'https://example.test/data'),{ok:false,error:'ROUTE_UNAVAILABLE'});
});
