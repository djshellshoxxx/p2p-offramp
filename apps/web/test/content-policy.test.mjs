import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {CandidateAttemptAdmission, ProfileAttemptAdmission, contentRule, runBoundedImport} from '../src/content-policy/local-policy.ts';
const file=text=>({size:text.length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
const reject=(promise,code)=>assert.rejects(promise,error=>error.code===code&&!/PRIVATE/.test(error.message));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
test('known purpose fixes classification and storage; user supplied public status cannot authorize private persistence',()=>{
 assert.deepEqual(contentRule('terms-review'),{dataClass:'private',storage:'encrypted-vault'});
 assert.deepEqual(contentRule('messaging-key'),{dataClass:'secret',storage:'encrypted-vault'});
 assert.deepEqual(contentRule('advertisement'),{dataClass:'public',storage:'public-discovery'});
 assert.throws(()=>contentRule({purpose:'terms-review',dataClass:'public',status:'accepted'}),e=>e.code==='INVALID_INPUT');
});
test('offer attempts count before work, persist across lock/reselection and expire at exact rolling boundary',()=>{
 let now=0,scope=1,id='1'.repeat(32),state='unlocked';const port={get current(){return{state}},get profileId(){return id},selectionScope:()=>scope};
 const admission=new ProfileAttemptAdmission(port,()=>now);
 for(let i=0;i<5;i++)admission.admitOfferAttempt();assert.throws(()=>admission.admitOfferAttempt(),e=>e.code==='LOCAL_LIMIT_REACHED');
 state='locked';assert.throws(()=>admission.admitOfferAttempt(),e=>e.code==='ENCRYPTION_REQUIRED');state='unlocked';scope++;assert.throws(()=>admission.admitOfferAttempt(),e=>e.code==='LOCAL_LIMIT_REACHED');
 id='2'.repeat(32);admission.admitOfferAttempt();id='1'.repeat(32);now=59999;assert.throws(()=>admission.admitOfferAttempt(),e=>e.code==='LOCAL_LIMIT_REACHED');now=60000;admission.admitOfferAttempt();now=59999;assert.throws(()=>admission.admitOfferAttempt(),e=>e.code==='UNAVAILABLE');
});
test('offer profile tracking is bounded without evicting live cooldowns',()=>{
 let id;const admission=new ProfileAttemptAdmission({current:{state:'unlocked'},get profileId(){return id},selectionScope:()=>1},()=>0);
 for(let n=1;n<=16;n++){id=n.toString(16).padStart(32,'0');admission.admitOfferAttempt()}
 id='f'.repeat(32);assert.throws(()=>admission.admitOfferAttempt(),e=>e.code==='LOCAL_LIMIT_REACHED');id='1'.padStart(32,'0');for(let i=1;i<5;i++)admission.admitOfferAttempt();assert.throws(()=>admission.admitOfferAttempt(),e=>e.code==='LOCAL_LIMIT_REACHED');
});
test('global import reservation precedes file callbacks and rejects overload before reading',async()=>{
 const reading=deferred(),entered=deferred();let readSecond=0,owned;
 const first=runBoundedImport('restore-backup',{size:1,arrayBuffer(){entered.resolve();return reading.promise}},undefined,async bytes=>{owned=bytes;return'first'});await entered.promise;
 await reject(runBoundedImport('verify-backup',{size:1,arrayBuffer:async()=>{readSecond++;return new ArrayBuffer(1)}},undefined,async()=>null),'LOCAL_LIMIT_REACHED');assert.equal(readSecond,0);
 reading.resolve(new Uint8Array([9]).buffer);assert.equal(await first,'first');assert.equal(owned[0],0);
});
test('cancel retains physical import ownership until read and consumer settle and wipes buffers on every exit',async()=>{
 const read=deferred(),controller=new AbortController();let consumed=false,buffer=new Uint8Array([7]);
 const pending=runBoundedImport('restore-backup',{size:1,arrayBuffer:()=>read.promise},controller.signal,async()=>{consumed=true});controller.abort();
 await reject(runBoundedImport('restore-backup',file('x'),undefined,async()=>null),'LOCAL_LIMIT_REACHED');read.resolve(buffer.buffer);await reject(pending,'CANCELLED');assert.equal(consumed,false);assert.equal(buffer[0],0);
 let held;await reject(runBoundedImport('terms-review',file('PRIVATE'),undefined,async bytes=>{held=bytes;throw Error('PRIVATE')}),'UNAVAILABLE');assert.ok(held.every(x=>x===0));
 const gate=deferred(),entered=deferred();const durable=runBoundedImport('restore-backup',file('x'),undefined,async bytes=>{held=bytes;entered.resolve();await gate.promise;return{ok:true}});await entered.promise;await reject(runBoundedImport('terms-review',file('x'),undefined,async()=>null),'LOCAL_LIMIT_REACHED');gate.resolve();assert.deepEqual(await durable,{ok:true});assert.ok(held.every(x=>x===0));
});
test('fixed byte ceilings apply before allocation and again to the actual file result',async()=>{
 let reads=0;await reject(runBoundedImport('terms-review',{size:65537,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0)}},undefined,async()=>null),'LIMIT_EXCEEDED');assert.equal(reads,0);
 const bytes=new Uint8Array(65537).fill(1);await reject(runBoundedImport('terms-review',{size:1,arrayBuffer:async()=>bytes.buffer},undefined,async()=>null),'LIMIT_EXCEEDED');assert.ok(bytes.every(x=>x===0));
 await reject(runBoundedImport('terms-review',{size:-1,arrayBuffer:async()=>new ArrayBuffer(0)},undefined,async()=>null),'INVALID_INPUT');
});
test('reentrant file metadata cannot allocate another import and hostile cleanup cannot strand admission',async()=>{
 let reentrant,owned;
 const result=await runBoundedImport('terms-review',{get size(){reentrant=runBoundedImport('terms-review',file('x'),undefined,async()=>null);return 1},arrayBuffer:async()=>new Uint8Array([1]).buffer},undefined,async bytes=>{owned=bytes;Object.defineProperty(bytes,'fill',{get(){throw Error('PRIVATE')}});return'ok'});
 assert.equal(result,'ok');await reject(reentrant,'LOCAL_LIMIT_REACHED');assert.equal(owned[0],0);
 const controller=new AbortController();assert.deepEqual(await runBoundedImport('restore-backup',file('x'),controller.signal,async bytes=>{structuredClone(bytes.buffer,{transfer:[bytes.buffer]});controller.abort();return{ok:true,durable:true}}),{ok:true,durable:true});
 assert.equal(await runBoundedImport('terms-review',file('x'),undefined,async()=>1),1);
});

test('unactivated candidate counter enforces ten per minute with bounded rolling arithmetic',()=>{
 let now=0;const candidates=new CandidateAttemptAdmission(()=>now);
 for(let n=0;n<10;n++)candidates.admitCandidate();assert.throws(()=>candidates.admitCandidate(),e=>e.code==='LOCAL_LIMIT_REACHED');
 now=59999;assert.throws(()=>candidates.admitCandidate(),e=>e.code==='LOCAL_LIMIT_REACHED');now=60000;candidates.admitCandidate();now=59999;assert.throws(()=>candidates.admitCandidate(),e=>e.code==='UNAVAILABLE');
});
test('native abort wipes owned bytes immediately while retaining admission and preserving a durable consumer result',async()=>{
 const controller=new AbortController(),entered=deferred(),drain=deferred();let owned;
 for(const key of ['aborted','addEventListener','removeEventListener'])Object.defineProperty(controller.signal,key,{get(){throw Error('PRIVATE')}});
 const pending=runBoundedImport('terms-review',file('PRIVATE'),controller.signal,async bytes=>{owned=bytes;entered.resolve();await drain.promise;return{ok:true,durable:true}});
 await entered.promise;assert.equal(getEventListeners(controller.signal,'abort').length,1);controller.abort();assert.equal(getEventListeners(controller.signal,'abort').length,0);const wipedImmediately=owned.every(x=>x===0);
 await reject(runBoundedImport('terms-review',file('new'),undefined,async()=>null),'LOCAL_LIMIT_REACHED');
 drain.resolve();assert.deepEqual(await pending,{ok:true,durable:true});assert.equal(getEventListeners(controller.signal,'abort').length,0);assert.equal(wipedImmediately,true,'abort clears the owned view before the consumer settles');
 assert.equal(await runBoundedImport('terms-review',file('next'),undefined,async()=>1),1);
});
test('cancellation during file metadata or reader lookup prevents all new file reads',async()=>{
 for(const stage of ['size','reader']){
  const controller=new AbortController();let reads=0,readerLookups=0;
  const selected={get size(){if(stage==='size')controller.abort();return 1},get arrayBuffer(){readerLookups++;if(stage==='reader')controller.abort();return async()=>{reads++;return new ArrayBuffer(1)}}};
  await reject(runBoundedImport('terms-review',selected,controller.signal,async()=>null),'CANCELLED');assert.equal(reads,0);assert.equal(readerLookups,stage==='size'?0:1);
 }
});

test('successful imports detach the intrinsic cancellation listener without changing caller-owned file data',async()=>{
 const controller=new AbortController(),original=new TextEncoder().encode('PRIVATE');let owned;
 const selected={size:original.length,arrayBuffer:async()=>original.slice().buffer};
 assert.equal(await runBoundedImport('terms-review',selected,controller.signal,async bytes=>{owned=bytes;assert.equal(getEventListeners(controller.signal,'abort').length,1);return'complete'}),'complete');
 assert.equal(getEventListeners(controller.signal,'abort').length,0);assert.ok(owned.every(x=>x===0));assert.equal(new TextDecoder().decode(original),'PRIVATE');
});
