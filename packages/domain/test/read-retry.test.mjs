import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/read-retry.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const id='ab'.repeat(16);
const failure=code=>({ok:false,error:{code,message:'SECRET',retryable:true}});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function clock(random=0.5){
 let now=0,counter=0;const events=new Map(),delays=[];
 return{runtime:{now:()=>now,random:()=>random,schedule:(callback,delay)=>{const key=++counter;events.set(key,{at:now+delay,callback});delays.push(delay);return()=>events.delete(key);}},delays,
 async advance(ms){const end=now+ms;for(;;){const due=[...events].filter(([,event])=>event.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;events.delete(due[0]);due[1].callback();await flush();}now=end;await flush();},get pending(){return events.size;},get now(){return now;}};
}
function setup(random=0.5){assert.equal(typeof api.createReadRetrier,'function','missing createReadRetrier');const time=clock(random);return{time,retry:api.createReadRetrier(time.runtime)};}
test('authorized reads use at most3attempts with exact fulljitter ceilings and no overlapping attempts',async()=>{
 const{time,retry}=setup();let count=0,active=0,max=0;const called=[];
 const task=retry(async()=>{active++;max=Math.max(max,active);called.push(time.now);count++;active--;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id});
 await flush();assert.equal(count,1);await time.advance(250);assert.equal(count,2);await time.advance(500);const result=await task;
 assert.equal(count,3);assert.equal(max,1);assert.deepEqual(called,[0,250,750]);assert.equal(result.error.code,'UNAVAILABLE');assert.equal(result.error.correlationId,id);assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.equal(time.pending,0);
});
test('all nonretryable errors refuse resubmission even when a foreign retryable flag says true',async()=>{
 for(const code of ['INVALID_INPUT','UNSUPPORTED_VERSION','UNSUPPORTED_PROVIDER','WRONG_CHAIN','UNAUTHORIZED','USER_REJECTED','LOCKED','CONFLICT','INTEGRITY_FAILURE','EXPIRED','CANCELLED','BROADCAST_UNKNOWN','LIMIT_EXCEEDED']){
  const{retry,time}=setup();let calls=0;const result=await retry(async()=>{calls++;return failure(code);},{signal:new AbortController().signal,operationId:id});
  assert.equal(calls,1);assert.equal(result.error.code,code);assert.equal(result.error.retryable,false);assert.equal(time.pending,0);
 }
});
test('each10second timeout aborts a responsive adapter before retry; whole operation stays under35seconds',async()=>{
 const{retry,time}=setup(0.999999);let calls=0,active=0,max=0;const aborted=[];
 const task=retry(signal=>new Promise((_resolve,reject)=>{calls++;active++;max=Math.max(max,active);signal.addEventListener('abort',()=>{active--;aborted.push(time.now);reject(Error('SECRET'));},{once:true});}),{signal:new AbortController().signal,operationId:id});
 await flush();await time.advance(35_000);const result=await task;assert.equal(calls,3);assert.equal(max,1);assert.deepEqual(aborted,[10000,20500,31500]);assert.equal(result.error.code,'TIMEOUT');assert.equal(time.pending,0);
});
test('a never-resolving adapter times out once, never overlaps or retries, and late completion is discarded',async()=>{
 const{retry,time}=setup();let calls=0,resolve;
 const task=retry(()=>{calls++;return new Promise(r=>{resolve=r;});},{signal:new AbortController().signal,operationId:id});
 await time.advance(10_000);const result=await task;assert.equal(result.error.code,'TIMEOUT');assert.equal(calls,1);assert.equal(time.pending,0);
 resolve({ok:true,value:'late'});await flush();await time.advance(50_000);assert.equal(calls,1);assert.equal(result.error.code,'TIMEOUT');
});
test('cancellation before, during and during backoff stops all new attempts with no leftover timers',async()=>{
 for(const phase of ['before','during','backoff']){
  const{retry,time}=setup();const controller=new AbortController();let calls=0;let attemptSignal;
  if(phase==='before')controller.abort();
  const task=retry(signal=>{calls++;attemptSignal=signal;return phase==='during'?new Promise(()=>{}):Promise.resolve(failure('UNAVAILABLE'));},{signal:controller.signal,operationId:id});
  await flush();controller.abort();const result=await task;assert.equal(result.error.code,'CANCELLED');assert.equal(calls,phase==='before'?0:1);if(attemptSignal)assert.equal(attemptSignal.aborted,phase==='during');
  await time.advance(50_000);assert.equal(calls,phase==='before'?0:1);assert.equal(time.pending,0);
 }
});
test('generation changes discard successful stale responses and forbid retries after backoff',async()=>{
 const{retry,time}=setup();let current=true,resolve,calls=0;
 const task=retry(()=>{calls++;return new Promise(r=>{resolve=r;});},{signal:new AbortController().signal,operationId:id,isCurrent:()=>current});
 current=false;resolve({ok:true,value:'stale'});assert.equal((await task).error.code,'CANCELLED');assert.equal(calls,1);
 current=true;const backoff=retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id,isCurrent:()=>current});await flush();current=false;await time.advance(500);assert.equal((await backoff).error.code,'CANCELLED');assert.equal(calls,2);
});
test('invalid operation IDs never invoke a read and all foreign exceptions are normalized',async()=>{
 const{retry,time}=setup();let calls=0;
 const invalid=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:new AbortController().signal,operationId:'SECRET'});assert.equal(invalid.error.code,'INVALID_INPUT');assert.equal(calls,0);
 const task=retry(()=>{calls++;throw Error('SECRET https://rpc.test');},{signal:new AbortController().signal,operationId:id});await flush();await time.advance(1000);const result=await task;assert.equal(calls,3);assert.doesNotMatch(JSON.stringify(result),/SECRET|rpc.test/);
});
test('a delayed runtime cannot restart attempts beyond the35second overall budget',async()=>{
 const{retry,time}=setup();let calls=0;
 const task=retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id});
 await flush();time.runtime.now=()=>40_000;await time.advance(250);const result=await task;assert.equal(result.error.code,'TIMEOUT');assert.equal(calls,1);assert.equal(time.pending,0);
});
test('untrusted429/503RetryAfter values cannot enlarge fixed backoff or leak nested content',async()=>{
 for(const retryAfter of ['-1','999999999999999999999','garbage SECRET',{},null]){
  const{retry,time}=setup(0);let calls=0;
  const resultPromise=retry(async()=>{calls++;return{ok:false,error:{code:'UNAVAILABLE',status:429,headers:{'Retry-After':retryAfter},message:'SECRET'}};},{signal:new AbortController().signal,operationId:id});
  await flush();await time.advance(0);const result=await resultPromise;assert.equal(calls,3);assert.equal(time.now,0);assert.doesNotMatch(JSON.stringify(result),/SECRET|Retry-After/);assert.equal(time.pending,0);
 }
});
test('hostile result getters are rejected without invocation or automatic retry',async()=>{
 const{retry,time}=setup();let touched=0,calls=0;
 const result=await retry(async()=>{calls++;return{get ok(){touched++;throw Error('SECRET');}};},{signal:new AbortController().signal,operationId:id});
 assert.equal(result.error.code,'INTEGRITY_FAILURE');assert.equal(touched,0);assert.equal(calls,1);assert.equal(time.pending,0);
});
test('a throwing initial now() resolves a fixed UNAVAILABLE result with zero operation calls',async()=>{
 const{retry,time}=setup();let calls=0;
 time.runtime.now=()=>{throw Error('SECRET https://rpc.test');};
 const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:new AbortController().signal,operationId:id});
 assert.equal(result.ok,false);assert.equal(result.error.code,'UNAVAILABLE');assert.equal(result.error.correlationId,id);
 assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(result),/SECRET|rpc.test/);assert.equal(time.pending,0);
});
test('a later throwing now() after a settled failed attempt stops with UNAVAILABLE, no further reads or timers',async()=>{
 const{retry,time}=setup();let calls=0,armed=false;
 time.runtime.now=()=>{if(armed)throw Error('SECRET later');return 0;};
 const task=retry(async()=>{calls++;armed=true;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id});
 await flush();const result=await task;
 assert.equal(result.ok,false);assert.equal(result.error.code,'UNAVAILABLE');assert.equal(result.error.correlationId,id);
 assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
 await time.advance(50_000);assert.equal(calls,1);assert.equal(time.pending,0);
});
test('a throwing random() after a settled retryable read stops with UNAVAILABLE, no backoff or retry',async()=>{
 const{retry,time}=setup();let calls=0;
 time.runtime.random=()=>{throw Error('SECRET rng');};
 const task=retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id});
 await flush();const result=await task;
 assert.equal(result.ok,false);assert.equal(result.error.code,'UNAVAILABLE');assert.equal(result.error.correlationId,id);
 assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
 await time.advance(50_000);assert.equal(calls,1);assert.equal(time.pending,0);
});
test('initial now() that aborts then throws resolves CANCELLED with zero calls',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0;
 time.runtime.now=()=>{controller.abort();throw Error('SECRET');};
 const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:controller.signal,operationId:id});
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.equal(time.pending,0);
});
test('initial now() that aborts then returns a valid number resolves CANCELLED with zero calls',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0;
 time.runtime.now=()=>{controller.abort();return 0;};
 const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:controller.signal,operationId:id});
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,0);assert.equal(time.pending,0);
});
test('initial now() that makes isCurrent false then throws resolves CANCELLED',async()=>{
 const{retry,time}=setup();let live=true,calls=0;
 time.runtime.now=()=>{live=false;throw Error('SECRET');};
 const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:new AbortController().signal,operationId:id,isCurrent:()=>live});
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.equal(time.pending,0);
});
test('now() that aborts while returning a valid number at the budget read before an attempt resolves CANCELLED',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0,reads=0;
 time.runtime.now=()=>{reads++;if(reads===2)controller.abort();return 0;};
 const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:controller.signal,operationId:id});
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,0);assert.equal(time.pending,0);
});
test('now() that aborts then returns a non-finite value at the budget-zero path resolves CANCELLED, not TIMEOUT',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0,reads=0;
 time.runtime.now=()=>{reads++;if(reads===2){controller.abort();return Number.NaN;}return 0;};
 const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:controller.signal,operationId:id});
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,0);assert.equal(time.pending,0);
});
test('now() that aborts then returns 40000 (budget exhausted) at the first budget read resolves CANCELLED, not TIMEOUT',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0,reads=0;
 time.runtime.now=()=>{reads++;if(reads===2){controller.abort();return 40_000;}return 0;};
 const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:controller.signal,operationId:id});
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,0);assert.equal(time.pending,0);
});
test('post-attempt now() that aborts then throws resolves CANCELLED with no retry or timers',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0,armed=false;
 time.runtime.now=()=>{if(armed){controller.abort();throw Error('SECRET');}return 0;};
 const task=retry(async()=>{calls++;armed=true;return failure('UNAVAILABLE');},{signal:controller.signal,operationId:id});
 await flush();const result=await task;
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
 await time.advance(50_000);assert.equal(calls,1);assert.equal(time.pending,0);
});
test('post-attempt now() that makes isCurrent false and returns 40000 resolves CANCELLED, not TIMEOUT',async()=>{
 const{retry,time}=setup();let live=true,calls=0,armed=false;
 time.runtime.now=()=>{if(armed){live=false;return 40_000;}return 0;};
 const task=retry(async()=>{calls++;armed=true;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id,isCurrent:()=>live});
 await flush();const result=await task;
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,1);assert.equal(time.pending,0);
});
test('random() that aborts then returns a valid number resolves CANCELLED with no backoff scheduled',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0;
 time.runtime.random=()=>{controller.abort();return 0.5;};
 const task=retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:controller.signal,operationId:id});
 await flush();const result=await task;
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,1);assert.equal(time.delays.length,1);assert.equal(time.pending,0);
 await time.advance(50_000);assert.equal(calls,1);
});
test('random() that aborts then throws resolves CANCELLED, not UNAVAILABLE',async()=>{
 const{retry,time}=setup();const controller=new AbortController();let calls=0;
 time.runtime.random=()=>{controller.abort();throw Error('SECRET rng');};
 const task=retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:controller.signal,operationId:id});
 await flush();const result=await task;
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.equal(time.pending,0);
});
test('random() that makes isCurrent false and returns an invalid value resolves CANCELLED, not UNAVAILABLE',async()=>{
 const{retry,time}=setup();let live=true,calls=0;
 time.runtime.random=()=>{live=false;return 2;};
 const task=retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id,isCurrent:()=>live});
 await flush();const result=await task;
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,1);assert.equal(time.pending,0);
});
test('now() that goes stale at the delay-vs-budget read after a valid random resolves CANCELLED, not TIMEOUT',async()=>{
 const{retry,time}=setup(0.5);let live=true,calls=0,armed=false;
 time.runtime.random=()=>{armed=true;return 0.5;};
 time.runtime.now=()=>{if(armed){live=false;return 40_000;}return 0;};
 const task=retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id,isCurrent:()=>live});
 await flush();const result=await task;
 assert.equal(result.error.code,'CANCELLED');assert.equal(calls,1);assert.equal(time.delays.length,1);assert.equal(time.pending,0);
});
test('live non-finite initial clock samples retain UNAVAILABLE before any read',async()=>{
 for(const sample of [Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY]){
  const{retry,time}=setup();let calls=0;time.runtime.now=()=>sample;
  const result=await retry(async()=>{calls++;return{ok:true,value:1};},{signal:new AbortController().signal,operationId:id});
  assert.equal(result.error.code,'UNAVAILABLE');assert.equal(calls,0);assert.equal(time.pending,0);assert.equal(time.delays.length,0);
 }
});
test('live non-finite later clock samples retain TIMEOUT at every remaining-budget site',async()=>{
 for(const failureAt of [2,3,4])for(const sample of [Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY]){
  const{retry,time}=setup();let reads=0,calls=0;time.runtime.now=()=>++reads===failureAt?sample:0;
  const result=await retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id});
  assert.equal(result.error.code,'TIMEOUT');assert.equal(calls,failureAt===2?0:1);assert.equal(time.delays.length,failureAt===2?0:1);
  await time.advance(50_000);assert.equal(calls,failureAt===2?0:1);assert.equal(time.pending,0);
 }
});
test('live thrown later clock samples resolve UNAVAILABLE at every remaining-budget site',async()=>{
 for(const failureAt of [2,3,4]){
  const{retry,time}=setup();let reads=0,calls=0;time.runtime.now=()=>{if(++reads===failureAt)throw Error('SECRET https://rpc.test');return 0;};
  const result=await retry(async()=>{calls++;return failure('UNAVAILABLE');},{signal:new AbortController().signal,operationId:id});
  assert.equal(result.error.code,'UNAVAILABLE');assert.equal(calls,failureAt===2?0:1);assert.equal(time.delays.length,failureAt===2?0:1);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|rpc.test/);await time.advance(50_000);assert.equal(calls,failureAt===2?0:1);assert.equal(time.pending,0);
 }
});
