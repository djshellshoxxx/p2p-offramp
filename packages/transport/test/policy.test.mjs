import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/policy.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const CHANNELS=['rpc','relay','map','proof','update','wallet'],APP=CHANNELS.slice(0,5);
const request=(channel='rpc',method='read')=>({channel,endpointId:`${channel}-endpoint`,method});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const permit=value=>{assert.equal(typeof value,'object',`expected permit, got ${value}`);return value;};
const scope=value=>{assert.equal(typeof value,'object',`expected scope, got ${value}`);return value;};
class FixtureRegistry{
 coverage='direct';consent=true;expiresAt=1000;epoch=0;listeners=new Set();issued=new Set();mutate;grantHook;inspectHook;
 inspect(channel){if(this.inspectHook)return this.inspectHook(channel);return{channel,coverage:this.coverage,adapterId:'fixture-adapter',expiresAt:this.coverage==='unknown'||this.coverage==='unsupported'?null:this.expiresAt};}
 capture(binding,owner){if(binding.endpointId!==`${binding.channel}-endpoint`)return null;const epoch=this.epoch,listeners=new Set();let live=true;
  const data={version:1,request:{...binding},endpoint:{id:binding.endpointId,channel:binding.channel,url:'https://fixture.example/api',adapterId:'fixture-adapter',methods:['read','publish']},evidence:this.inspect(binding.channel),directConsent:this.consent};this.mutate?.(data);
  const grant={owner,snapshot:()=>data,current:context=>live&&context===owner&&epoch===this.epoch,subscribeInvalidation:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},dispose:()=>{live=false;this.issued.delete(grant);},invalidate:()=>{for(const listener of [...listeners])listener();}};
  this.issued.add(grant);return this.grantHook?.(grant)??grant;
 }
 subscribeInvalidation(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 change(){this.epoch++;for(const listener of [...this.listeners])listener();for(const grant of [...this.issued])grant.invalidate();}
}
function setup(registry=new FixtureRegistry()){assert.equal(typeof api.SessionTransportPolicy,'function','missing policy broker');let clock=0;const broker=new api.SessionTransportPolicy({trustedRegistry:registry,now:()=>clock});return{broker,registry,setTime:value=>{clock=value;}};}
test('production default has empty authority and all channels unknown; wallet never becomes an app request',()=>{
 assert.equal(typeof api.SessionTransportPolicy,'function','missing policy broker');const broker=new api.SessionTransportPolicy();try{assert.equal(broker.mode,'ordinary');for(const channel of CHANNELS)assert.equal(broker.inspect(channel).coverage,'unknown');assert.equal(broker.authorize(request()),'INVALID_ENDPOINT');assert.equal(broker.authorize(request('wallet')),'INVALID_ENDPOINT');assert.equal('setEvidence'in broker,false);assert.equal('setConsent'in broker,false);}finally{broker.dispose();}
});
test('fixture-only full mode/coverage/channel matrix refuses every unverified strict path before callback',async()=>{
 for(const mode of ['ordinary','strict'])for(const coverage of ['direct','verified-private','unknown','unsupported'])for(const channel of APP){
  const s=setup();s.registry.coverage=coverage;s.broker.setMode(mode);let invoked=0;
  try{const issued=s.broker.authorize(request(channel));const allowed=coverage==='verified-private'||mode==='ordinary'&&coverage==='direct';
   if(allowed){const leased=scope(s.broker.capture(permit(issued)));assert.deepEqual(await leased.run(async()=>++invoked),{ok:true,value:1});leased.dispose();}
   else assert.equal(issued,coverage==='unsupported'?'ROUTE_UNAVAILABLE':'POLICY_BLOCKED');assert.equal(invoked,allowed?1:0);
  }finally{s.broker.dispose();}
 }
});
test('ordinary direct requires independently issued consent and cannot inherit private relay coverage for wallet',()=>{
 const s=setup();try{s.registry.consent=false;assert.equal(s.broker.authorize(request()),'POLICY_BLOCKED');s.registry.coverage='verified-private';s.broker.setMode('strict');permit(s.broker.authorize(request('relay')));assert.equal(s.broker.authorize(request('wallet')),'INVALID_ENDPOINT');}finally{s.broker.dispose();}
});
test('permits bind broker identity and exact frozen request; malformed or rebound grant projections cannot authorize',()=>{
 const a=setup(),b=setup();try{const p=permit(a.broker.authorize(request()));assert.equal(a.broker.isCurrent(p),true);assert.equal(a.broker.isCurrent({...p}),false);assert.equal(b.broker.isCurrent(p),false);assert.equal(Object.isFrozen(p),true);assert.equal(a.broker.capture({...p}),'CANCELLED');
  for(const mutate of [d=>d.request.method='publish',d=>d.endpoint.id='other',d=>d.evidence.adapterId='other',d=>d.request.channel='relay']){a.registry.mutate=mutate;assert.equal(a.broker.authorize(request()),'INVALID_ENDPOINT');}
 }finally{a.broker.dispose();b.broker.dispose();}
});
test('trusted owner capability, currentness and reflection faults fail with fixed codes and no secret diagnostics',()=>{
 for(const hook of [grant=>({...grant,owner:{}}),grant=>({...grant,current:()=>false}),grant=>Object.defineProperty(grant,'snapshot',{get(){throw Error('SECRET https://private.invalid');}})]){
  const s=setup();try{s.registry.grantHook=hook;assert.equal(s.broker.authorize(request()),'ROUTE_UNAVAILABLE');}finally{s.broker.dispose();}
 }
});
test('hostile thrown capability values cannot escape fixed refusal handling',()=>{
 const s=setup(),revoked=Proxy.revocable({},{});revoked.revoke();try{s.registry.grantHook=grant=>({...grant,snapshot:()=>{throw revoked.proxy;}});assert.equal(s.broker.authorize(request()),'ROUTE_UNAVAILABLE');}finally{s.broker.dispose();}
});
test('inspection cannot relabel a stale registry callback result under a newer generation',()=>{
 const s=setup();try{s.registry.inspectHook=channel=>{s.registry.change();return{channel,coverage:'verified-private',adapterId:'fixture-adapter',expiresAt:1000};};assert.equal(s.broker.inspect('rpc').coverage,'unknown');}finally{s.broker.dispose();}
});
test('projection metadata is copied before issuing permits and registry changes synchronously revoke all scopes',()=>{
 const s=setup();let original;try{s.registry.mutate=data=>{original=data;};const p=permit(s.broker.authorize(request()));const leased=scope(s.broker.capture(p));original.request.method='publish';original.evidence.expiresAt=0;assert.equal(leased.current(),true);
  s.registry.change();assert.equal(leased.current(),false);assert.equal(leased.signal.aborted,true);assert.equal(s.broker.isCurrent(p),false);assert.equal(s.broker.generation,1);
 }finally{s.broker.dispose();}
});
test('expiry revokes before invocation and after awaits; queued late callbacks cannot publish',async()=>{
 const s=setup();let invoked=0;try{const leased=scope(s.broker.capture(permit(s.broker.authorize(request()))));s.setTime(1000);assert.deepEqual(await leased.run(async()=>++invoked),{ok:false,error:'CANCELLED'});assert.equal(invoked,0);
  s.setTime(1001);s.registry.expiresAt=3000;s.registry.change();const next=scope(s.broker.capture(permit(s.broker.authorize(request())))),gate=deferred();const running=next.run(async()=>{invoked++;return gate.promise;});s.setTime(3000);gate.resolve('SECRET late result');assert.deepEqual(await running,{ok:false,error:'CANCELLED'});assert.equal(invoked,1);
 }finally{s.broker.dispose();}
});
test('mode/revoke/dispose close resources despite throwing observers and prevent reentrant authorization',async()=>{
 const s=setup();let closed=0,reentrant;try{
  scope(s.broker.capture(permit(s.broker.authorize(request('rpc'))),{onRevoked:()=>{closed++;reentrant=s.broker.authorize(request());throw Error('SECRET observer');}}));
  const other=scope(s.broker.capture(permit(s.broker.authorize(request('relay'))),{onRevoked:()=>{closed++;}}));s.broker.setMode('strict');assert.equal(closed,2);assert.equal(other.signal.aborted,true);assert.equal(reentrant,'POLICY_BLOCKED');
  s.registry.coverage='verified-private';s.registry.change();const p=permit(s.broker.authorize(request()));s.broker.revoke('fixture-adapter');assert.equal(s.broker.isCurrent(p),false);assert.equal(s.broker.authorize(request()),'ROUTE_UNAVAILABLE');s.broker.setMode('ordinary');assert.equal(s.broker.authorize(request()),'ROUTE_UNAVAILABLE');
  s.broker.dispose();s.broker.dispose();assert.equal(s.broker.isCurrent(p),false);assert.equal(s.broker.authorize(request()),'POLICY_BLOCKED');
 }finally{s.broker.dispose();}
});
test('already-aborted and in-flight cancellation suppress outputs without freeing unsettled capacity',async()=>{
 const s=setup(),controller=new AbortController();try{controller.abort();assert.equal(s.broker.capture(permit(s.broker.authorize(request())),{signal:controller.signal}),'CANCELLED');
  const gates=[],tasks=[];for(let index=0;index<64;index++){const gate=deferred();gates.push(gate);const leased=scope(s.broker.capture(permit(s.broker.authorize(request()))));tasks.push(leased.run(async()=>gate.promise));leased.dispose();}
  assert.ok((await Promise.all(tasks)).every(result=>!result.ok&&result.error==='CANCELLED'));const fresh=scope(s.broker.capture(permit(s.broker.authorize(request()))));let invoked=0;assert.deepEqual(await fresh.run(async()=>++invoked),{ok:false,error:'LIMIT_EXCEEDED'});assert.equal(invoked,0);fresh.dispose();
  for(const gate of gates)gate.resolve('discard');await Promise.resolve();await Promise.resolve();const recovered=scope(s.broker.capture(permit(s.broker.authorize(request()))));assert.deepEqual(await recovered.run(async()=>1),{ok:true,value:1});recovered.dispose();
 }finally{s.broker.dispose();}
});
test('outstanding permit count is bounded and scoped use is single-shot',async()=>{
 const s=setup();try{const permits=Array.from({length:64},()=>permit(s.broker.authorize(request())));assert.equal(s.broker.authorize(request()),'LIMIT_EXCEEDED');const leased=scope(s.broker.capture(permits[0]));assert.deepEqual(await leased.run(async()=>1),{ok:true,value:1});assert.deepEqual(await leased.run(async()=>2),{ok:false,error:'CANCELLED'});leased.dispose();permit(s.broker.authorize(request()));}finally{s.broker.dispose();}
});
test('native callback failure is sanitized, revokes private evidence and never falls back to direct',async()=>{
 const s=setup();let invoked=0;try{s.registry.coverage='verified-private';s.broker.setMode('strict');const leased=scope(s.broker.capture(permit(s.broker.authorize(request()))));assert.deepEqual(await leased.run(async()=>{invoked++;throw Error('SECRET signed payload https://private.invalid');}),{ok:false,error:'ROUTE_UNAVAILABLE'});assert.equal(invoked,1);assert.equal(s.broker.authorize(request()),'ROUTE_UNAVAILABLE');}finally{s.broker.dispose();}
});
test('a policy change after native settlement but before scope continuation suppresses success',async()=>{
 const s=setup(),gate=deferred();try{const leased=scope(s.broker.capture(permit(s.broker.authorize(request()))));const pending=leased.run(()=>gate.promise);gate.resolve('SECRET old generation');queueMicrotask(()=>s.broker.setMode('strict'));assert.deepEqual(await pending,{ok:false,error:'CANCELLED'});}finally{s.broker.dispose();}
});
test('owned expiry timer closes resources without polling; a failed monotonic clock fails closed',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const s=setup();let closed=0;try{const leased=scope(s.broker.capture(permit(s.broker.authorize(request())),{onRevoked:()=>{closed++;}}));s.setTime(1000);t.mock.timers.tick(1000);assert.equal(closed,1);assert.equal(leased.signal.aborted,true);}finally{s.broker.dispose();t.mock.timers.reset();}
 const other=setup();try{const leased=scope(other.broker.capture(permit(other.broker.authorize(request()))));other.setTime(-1);assert.equal(leased.current(),false);assert.equal(leased.signal.aborted,true);assert.equal(other.broker.authorize(request()),'POLICY_BLOCKED');}finally{other.broker.dispose();}
});
test('operation timeout aborts owned scope without retry or accepting a late callback',async t=>{
 const s=setup(),gate=deferred();s.registry.expiresAt=60000;t.mock.timers.enable({apis:['setTimeout']});let invoked=0;
 try{const leased=scope(s.broker.capture(permit(s.broker.authorize(request()))));const pending=leased.run(()=>{invoked++;return gate.promise;});s.setTime(30000);t.mock.timers.tick(30000);assert.deepEqual(await pending,{ok:false,error:'TIMEOUT'});assert.equal(leased.signal.aborted,true);assert.equal(invoked,1);gate.resolve('SECRET late');await Promise.resolve();assert.equal(s.broker.authorize(request()),'ROUTE_UNAVAILABLE');}
 finally{s.broker.dispose();t.mock.timers.reset();}
});
test('external abort during a scoped operation closes its resource immediately and discards late output',async()=>{
 const s=setup(),gate=deferred(),controller=new AbortController();let closed=0;
 try{const leased=scope(s.broker.capture(permit(s.broker.authorize(request())),{signal:controller.signal,onRevoked:()=>{closed++;}}));const pending=leased.run(()=>gate.promise);controller.abort();assert.equal(closed,1);assert.equal(leased.signal.aborted,true);assert.deepEqual(await pending,{ok:false,error:'CANCELLED'});gate.resolve('SECRET late');await Promise.resolve();leased.dispose();assert.equal(closed,1);}
 finally{s.broker.dispose();}
});
