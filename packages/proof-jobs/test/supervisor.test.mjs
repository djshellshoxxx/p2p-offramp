import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicResourceRunner} from '../src/supervisor.ts';

const scope=()=>({binding:{chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:'1'.repeat(64)},termsHash:'1'.repeat(64),policyHash:'2'.repeat(64),generation:1});
const good=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const code=async(promise,expected)=>{const result=await promise;assert.equal(result.ok,false);assert.equal(result.error.code,expected);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|stack/);};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

class WorkerPort {
  sent=[];handlers;retained;terminated=0;off=0;termination=Promise.resolve();
  postMessage(command,transfer){this.sent.push(structuredClone(command,{transfer:[...transfer]}));}
  subscribe(handlers){this.handlers=handlers;this.retained=handlers;return()=>{this.handlers=undefined;this.off++;};}
  terminate(){this.terminated++;return this.termination;}
  reply(kind,extra={}){const init=this.sent[0];this.handlers?.message({v:1,jobId:init.jobId,generation:init.generation,kind,...extra});}
}
function setup(overrides={}){
  let time=0,current=true,nextTimer=0;const timers=new Map(),revocations=new Set(),port=new WorkerPort();
  const options={createWorker:()=>port,owner:{current:()=>current,subscribeRevocation:listener=>{revocations.add(listener);return()=>revocations.delete(listener);}},
    clock:()=>time,timers:{set:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:time+delay});return id;},clear:id=>timers.delete(id)},
    limits:{wallTimeMs:100,heartbeatMs:20,maxMessages:8},...overrides};
  const runner=good(createPublicResourceRunner(options));
  return{runner,port,timers,revocations,consent:()=>good(runner.consent(scope())),revoke(){current=false;for(const listener of [...revocations])listener();},
    advance(ms){time+=ms;for(const[id,timer]of [...timers])if(timer.at<=time){timers.delete(id);timer.callback();}},setTime(value){time=value;}};
}

test('resource output is unverified; input ownership, timers and listeners clean after native-port retirement',async()=>{
  const s=setup(),input=new Uint8Array([1,2,3]);const result=s.runner.run(s.consent(),async()=>input);await turn();
  assert.deepEqual([...input],[0,0,0]);assert.equal(s.port.sent[0].kind,'init');s.port.reply('ready');assert.equal(s.port.sent[1].kind,'prove');assert.deepEqual([...s.port.sent[1].input],[1,2,3]);
  s.port.reply('progress',{progress:50});s.port.reply('result',{result:new Uint8Array([7,8])});const output=good(await result);
  assert.deepEqual([...output.bytes],[7,8]);for(const key of ['proofVerified','receiptAuthority','economicPreparationAllowed'])assert.equal(output[key],false);
  await s.runner.dispose();assert.equal(s.port.terminated,1);assert.equal(s.timers.size,0);assert.equal(s.revocations.size,0);assert.equal(s.port.off,1);
});

test('all runners share admission and cancellation cannot release an ignored collector before it drains',async()=>{
  const a=setup(),b=setup(),held=deferred(),returned=new Uint8Array([6,7]);let bCollections=0;
  const result=a.runner.run(a.consent(),()=>held.promise);a.runner.cancel();await code(result,'CANCELLED');
  await code(b.runner.run(b.consent(),async()=>{bCollections++;return new Uint8Array();}),'LIMIT_EXCEEDED');assert.equal(bCollections,0);
  held.resolve(returned);await a.runner.dispose();assert.deepEqual([...returned],[0,0]);assert.equal(a.port.terminated,0);
  const next=b.runner.run(b.consent(),async()=>new Uint8Array([3]));await turn();b.runner.cancel();await code(next,'CANCELLED');await b.runner.dispose();
});

test('physical worker termination must drain before another facade acquires the tab lease',async()=>{
  const a=setup(),b=setup(),end=deferred();a.port.termination=end.promise;const result=a.runner.run(a.consent(),async()=>new Uint8Array([1]));await turn();a.runner.cancel();await code(result,'CANCELLED');
  await code(b.runner.run(b.consent(),async()=>new Uint8Array()),'LIMIT_EXCEEDED');end.resolve();await a.runner.dispose();
  const next=b.runner.run(b.consent(),async()=>new Uint8Array([2]));await turn();b.runner.cancel();await code(next,'CANCELLED');await b.runner.dispose();
});

test('void, rejected and malformed termination cannot admit another collector or Worker',async t=>{
  const cases=[['void',()=>undefined],['object',()=>({})],['thenable',()=>({then(resolve){resolve();}})],
    ['nonvoid',()=>Promise.resolve(1)],['rejected',()=>Promise.reject(Error('PRIVATE termination'))],['throws',()=>{throw Error('PRIVATE termination');}]];
  for(const[name,ending]of cases)await t.test(name,async()=>{
    // Unknown physical fate intentionally holds admission until document teardown. Each module is a fresh document.
    const{createPublicResourceRunner:create}=await import(new URL(`../src/supervisor.ts?termination=${name}`,import.meta.url));
    const first=new WorkerPort();first.terminate=()=>{first.terminated++;return ending();};
    let collections=0,factories=0;
    const options={owner:{current:()=>true,subscribeRevocation:()=>()=>{}}};
    const a=good(create({...options,createWorker:()=>first}));
    const b=good(create({...options,createWorker:()=>{factories++;const port=new WorkerPort();port.termination=Promise.resolve();return port;}}));
    const pending=a.run(good(a.consent(scope())),async()=>new Uint8Array([1]));await turn();a.cancel();await code(pending,'CANCELLED');await turn();
    let observed;
    const competing=b.run(good(b.consent(scope())),async()=>{collections++;return new Uint8Array([2]);});
    void competing.then(result=>{observed=result;});await turn();
    try{assert.equal(observed?.error?.code,'LIMIT_EXCEEDED',name);assert.equal(collections,0,name);assert.equal(factories,0,name);}
    finally{b.cancel();await competing;await b.dispose();}
  });
});

test('opaque consent is single use and invalidated scope cannot collect or spawn',async()=>{
  const s=setup();let collected=0;
  await code(s.runner.run({},async()=>{collected++;return new Uint8Array();}),'INVALID_INPUT');
  const old=s.consent(),fresh=s.consent();await code(s.runner.run(old,async()=>new Uint8Array()),'INVALID_INPUT');s.revoke();
  await code(s.runner.run(fresh,async()=>{collected++;return new Uint8Array();}),'LOCKED');assert.equal(collected,0);assert.equal(s.port.sent.length,0);await s.runner.dispose();
});

test('malformed, wrong identity, premature and excessive replies retire without success',async()=>{
  const cases=[p=>p.handlers.message({v:1,kind:'ready',jobId:'PRIVATE',generation:1}),p=>p.reply('result',{result:new Uint8Array()}),p=>p.reply('progress',{progress:1}),p=>{p.reply('ready');p.reply('progress',{progress:101});},p=>{p.reply('ready');for(let i=0;i<8;i++)p.reply('progress',{progress:1});}];
  for(const exercise of cases){const s=setup();const result=s.runner.run(s.consent(),async()=>new Uint8Array([1]));await turn();exercise(s.port);const out=await result;assert.equal(out.ok,false);assert.ok(['INTEGRITY_FAILURE','LIMIT_EXCEEDED'].includes(out.error.code));await s.runner.dispose();assert.equal(s.port.terminated,1);}
});

test('heartbeat, wall deadline, backwards clocks and resume cancel instead of retrying',async()=>{
  for(const exercise of [s=>s.advance(20),s=>{s.port.reply('ready');for(let i=0;i<4;i++){s.advance(19);s.port.reply('progress',{progress:1});}s.advance(24);},s=>{s.setTime(-1);s.port.reply('ready');},s=>s.runner.resume()]){
    const s=setup();const result=s.runner.run(s.consent(),async()=>new Uint8Array([1]));await turn();exercise(s);await code(result,'CANCELLED');await s.runner.dispose();assert.equal(s.port.terminated,1);assert.equal(s.timers.size,0);
  }
});

test('owned admission precedes clock/factory callbacks and old callbacks cannot attach to new work',async()=>{
  let nested,activeRunner,reenter=true;
  const s=setup({clock:()=>{if(reenter&&activeRunner){reenter=false;nested=activeRunner.run({},async()=>new Uint8Array());}return 0;}});activeRunner=s.runner;
  const result=s.runner.run(s.consent(),async()=>new Uint8Array([1]));await turn();await code(nested,'LIMIT_EXCEEDED');const old=s.port.retained,identity=s.port.sent[0];s.runner.cancel();await code(result,'CANCELLED');await s.runner.dispose();
  const next=setup();const pending=next.runner.run(next.consent(),async()=>new Uint8Array([2]));await turn();old.message({v:1,kind:'result',jobId:identity.jobId,generation:identity.generation,result:new Uint8Array([9])});assert.equal(next.port.terminated,0);next.port.reply('ready');next.port.reply('result',{result:new Uint8Array([4])});assert.deepEqual([...good(await pending).bytes],[4]);await next.runner.dispose();
});

test('oversized collection refuses before Worker creation; foreign errors never escape',async()=>{
  let factories=0;const s=setup({createWorker:()=>{factories++;throw Error('PRIVATE');}});
  await code(s.runner.run(s.consent(),async()=>new Uint8Array(1048577)),'LIMIT_EXCEEDED');assert.equal(factories,0);
  await code(s.runner.run(s.consent(),async()=>new Uint8Array([1])),'UNAVAILABLE');assert.equal(factories,1);await s.runner.dispose();
});

test('revocation and factory/listener/post callbacks cannot orphan an acquired Worker or its cleanup',async()=>{
  for(const stage of ['owner','factory','subscribe','post']){
    let runner,collections=0,ownerOff=0;const port=new WorkerPort();
    const realPost=port.postMessage.bind(port),realSubscribe=port.subscribe.bind(port);
    port.postMessage=(command,transfer)=>{realPost(command,transfer);if(stage==='post'&&command.kind==='init')runner.cancel();};
    port.subscribe=handlers=>{const off=realSubscribe(handlers);if(stage==='subscribe')runner.cancel();return off;};
    runner=good(createPublicResourceRunner({createWorker(){if(stage==='factory')runner.cancel();return port;},
      owner:{current:()=>true,subscribeRevocation(){if(stage==='owner')runner.cancel();return()=>ownerOff++;}},limits:{wallTimeMs:100,heartbeatMs:20}}));
    const bytes=new Uint8Array([8]),result=runner.run(good(runner.consent(scope())),async()=>{collections++;return bytes;});
    await code(result,'CANCELLED');await runner.dispose();assert.equal(ownerOff,1);
    assert.equal(collections,stage==='owner'?0:1);assert.equal(port.terminated,stage==='owner'?0:1);
    if(stage!=='owner')assert.deepEqual([...bytes],[0]);
    if(stage==='subscribe'||stage==='post')assert.equal(port.off,1);
  }
});

test('captured scope is detached and external abort retains admission through collector drain',async()=>{
  const captured=[],s=setup({owner:{current:selected=>{captured.push(selected);return selected.generation===1&&selected.binding.tradeId==='1'.repeat(64);},subscribeRevocation:()=>()=>{}}});
  const original=scope(),token=good(s.runner.consent(original));original.binding.tradeId='9'.repeat(64);original.generation=8;
  const abort=new AbortController(),held=deferred(),input=new Uint8Array([5]);const result=s.runner.run(token,()=>held.promise,abort.signal);
  abort.abort();await code(result,'CANCELLED');assert.ok(captured.every(selected=>Object.isFrozen(selected)&&Object.isFrozen(selected.binding)&&selected.generation===1));
  const other=setup();await code(other.runner.run(other.consent(),async()=>new Uint8Array()),'LIMIT_EXCEEDED');held.resolve(input);await s.runner.dispose();assert.deepEqual([...input],[0]);await other.runner.dispose();
});

test('exact maximum output is a single unverified result and retired duplicates are wiped',async()=>{
  const s=setup(),pending=s.runner.run(s.consent(),async()=>new Uint8Array([1]));await turn();s.port.reply('ready');
  const raw=new Uint8Array(2097152).fill(7),retained=s.port.retained,identity=s.port.sent[0];s.port.reply('result',{result:raw});
  const output=good(await pending);assert.equal(output.bytes.length,2097152);assert.equal(output.bytes[0],7);assert.ok(raw.every(byte=>byte===0));await s.runner.dispose();
  const late=new Uint8Array([9]);retained.message({v:1,kind:'result',jobId:identity.jobId,generation:identity.generation,result:late});assert.deepEqual([...late],[0]);assert.equal(output.bytes[0],7);output.bytes.fill(0);
});

test('expired heartbeat cannot be revived by ready, progress, result or late collection before watchdog dispatch',async()=>{
  for(const stage of ['ready','progress','result','collection']){
    const held=deferred(),s=setup();let factories=0;const original=s.port.subscribe.bind(s.port);
    s.port.subscribe=handlers=>{factories++;return original(handlers);};
    const pending=s.runner.run(s.consent(),stage==='collection'?()=>held.promise:async()=>new Uint8Array([1]));await turn();
    if(stage==='progress'||stage==='result')s.port.reply('ready');
    s.setTime(20); // Deliberately leave scheduled watchdog callbacks undispatched.
    if(stage==='collection')held.resolve(new Uint8Array([1]));
    else if(stage==='ready')s.port.reply('ready');
    else if(stage==='progress'){s.port.reply('progress',{progress:1});s.port.reply('result',{result:new Uint8Array([7])});}
    else s.port.reply('result',{result:new Uint8Array([7])});
    await turn();
    if(s.port.handlers){if(stage==='collection')s.port.reply('ready');s.port.reply('result',{result:new Uint8Array([7])});}
    const result=await pending;
    try{assert.equal(result.ok,false,stage);assert.equal(result.error.code,'CANCELLED',stage);}
    finally{await s.runner.dispose();}
    assert.equal(factories,stage==='collection'?0:1);assert.equal(s.timers.size,0);
  }
});

test('cancel, resume and dispose invalidate consent issuance across owner, entropy and reflection callbacks',async()=>{
  for(const action of ['cancel','resume','dispose'])for(const stage of ['reflection','owner-first','entropy-first','entropy-second','owner-last']){
    let runner,interrupted=false,ownerCalls=0,entropyCalls=0,collections=0,factories=0;
    const interrupt=()=>{if(!interrupted){interrupted=true;void runner[action]();}};
    runner=good(createPublicResourceRunner({createWorker:()=>{factories++;return new WorkerPort();},
      owner:{current(){ownerCalls++;if(stage===(ownerCalls===1?'owner-first':'owner-last'))interrupt();return true;},subscribeRevocation:()=>()=>{}},
      entropy(length){entropyCalls++;if(stage===(entropyCalls===1?'entropy-first':'entropy-second'))interrupt();return new Uint8Array(length).fill(entropyCalls);}}));
    const input=stage==='reflection'?new Proxy(scope(),{ownKeys(target){interrupt();return Reflect.ownKeys(target);}}):scope();
    const issued=runner.consent(input);
    try{
      assert.equal(interrupted,true,`${action}/${stage}`);assert.equal(issued.ok,false,`${action}/${stage}`);
      assert.equal(issued.error.code,action==='dispose'?'LOCKED':'CANCELLED');
      await code(runner.run(issued.value,async()=>{collections++;return new Uint8Array();}),action==='dispose'?'LOCKED':'INVALID_INPUT');
      assert.equal(collections,0);assert.equal(factories,0);
    }finally{await runner.dispose();}
  }
});
