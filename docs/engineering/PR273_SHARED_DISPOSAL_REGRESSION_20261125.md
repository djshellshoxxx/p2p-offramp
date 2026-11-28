# PR273 shared disposal completion — controlled regression, 2026-11-25 UTC

Exact original controller: `60cd22de4e5296df595e8dbb7e24a4a19f34b467`, blob `b46c0331eea2bf29d71b22a53d1c19347b6b460d` (git hash-object verified). Existing #273 drain repair retained. The active registry drain in first dispose() was a local promise, absent from the closed-path cleanup/physical fields; a second caller could return prematurely, including reentry from synchronous broker invalidation. No production exposure or financial effect established.

## Execution

Node v22.16.0 --experimental-strip-types --test probe.mjs, isolated actual controller and the same controlled dependency modules documented in PR227_CONTROLLED_DRAIN_REGRESSION_20261125.md. Test first on exact source: 0 pass / 2 fail / 0 skip, exit 1, both failed at secondDone expected false actual true while firstDone false and drained false. Corrected exact blob `b96c51bdc4b0a675fda32bec7d945f46e198c4a3`: 2 pass / 0 fail / 0 skip, exit 0. Combined with the earlier byte-identical probe (SHA256 6cf9ef10fb4fb0e7651a5d5473ff701f76fdb051c080c7ae18d58320f08225e6): 4 pass / 0 fail / 0 skip, exit 0. Raw log SHA256 RED 262f584542bd107c1061abdbcee014d3ee56c1110968be210048621a6ec19634; GREEN f32c0abddafc6b6bf4a1bc33c93013c8137b01aabb55ebc091915a522ecb4950; combined b2b3547d4cd20dbb084117ea2064f4ca55e026a0861a899bfa7d076c02b6620d. Raw local logs not uploaded. No full local repo, typecheck or actual G05/G14 execution; actual-dependency tests are newly authored and unqualified.

## Reproduce controlled tests

Copy the exact mode.ts and the three doubles in the prior report. Run this probe before and after the new source commit. Probe SHA256 ea6128ad500932732ab76c26ef7682e18587cd24dcdfce35be9f986076333400.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeController} from './packages/privacy-policy/src/mode.ts';
const tick=()=>new Promise(r=>setImmediate(r));
const policy={mode:'ordinary'};
function fixture(){
 let release;const held=new Promise(r=>release=r);let callback,starts=0,stops=0,drained=false,disposals=0;
 const broker={mode:'ordinary',generation:0,subscribeInvalidation(){return ()=>{}},invalidate(){this.generation++;const cb=callback;callback=undefined;cb?.()},setMode(mode){this.mode=mode;this.generation++}};
 const controller=createModeController({broker,catalog:[{name:'display',moduleId:'display',protocolVersion:1}],createRegistry(generation){
  let pending;
  const disposeAll=()=>{disposals++;return pending??=(async()=>{stops++;await held;drained=true})()};
  return {ok:true,value:{generation,disposeAll,resolve(){return {async initialize(_context,signal){starts++;signal.addEventListener('abort',()=>{void disposeAll()},{once:true});return {ok:true,value:undefined}}}}}};
 }});
 return {controller,release,arm(cb){callback=cb},stats(){return {starts,stops,drained,disposals}}};
}
for(const reentrant of [false,true])test(reentrant?'reentrant disposal joins active registry drain':'concurrent disposal joins active registry drain',async()=>{
 const f=fixture();let first,second,firstDone=false,secondDone=false;
 try{
  assert.equal((await f.controller.requestMode(policy)).ok,true);
  const join=()=>{second=f.controller.dispose().then(()=>{secondDone=true})};
  if(reentrant)f.arm(join);
  first=f.controller.dispose().then(()=>{firstDone=true});
  if(!reentrant)join();
  await tick();
  assert.equal(f.stats().stops,1);assert.equal(f.stats().drained,false);assert.equal(firstDone,false);
  assert.equal(secondDone,false,'every caller must await physical completion');
  assert.equal(f.controller.inspectMode().state,'inactive');assert.equal((await f.controller.requestMode(policy)).error.code,'LOCKED');
 }finally{f.release();await Promise.all([first,second]);await f.controller.dispose()}
 assert.equal(firstDone,true);assert.equal(secondDone,true);assert.equal(f.stats().drained,true);assert.equal(f.stats().stops,1);
});
```

## Published source and limits

Test-first `849da6feba7ffc6a67ef19e2c24df21b325a758f`, final `d3829da7d885f9c6c4a5bdf784fddc5ee4ce33c3`. The shared promise is installed before any synchronous callbacks, and the original async disposal body runs immediately; no deferral of revocation or change to failure propagation. The added maintained tests use actual G05/G14 with local fixtures and check two concurrent/reentrant callers, synchronous revocation, locked state, exactly one extension cleanup and repeated disposal after completion. Actual runtime red and green must still be executed. Preserve the earlier successful hosted evidence at the previous head; no transfer. [Source diff](https://github.com/djshellshoxxx/p2p-offramp/compare/60cd22de4e5296df595e8dbb7e24a4a19f34b467...d3829da7d885f9c6c4a5bdf784fddc5ee4ce33c3). No owner-branch change, main merge, production activation or funds. Independent review and D8 named service review remain required. Do not treat this report as independent approval or count the two variants as two causes.
