# PR227 controlled physical-drain reproduction — 2026-11-25 UTC

Source: PR227 frozen head `7740f4d67a0c77896d40e3bead58cf6a7e5c1cb0`, mode.ts blob `13763f9d0147bfb55f4dce3e50b3744dd688b2ba`. Copied the complete source into an isolated temporary directory and verified its Git blob identity using git hash-object before execution. Node v22.16.0, native --experimental-strip-types --test. No external network, providers, funds, native G05/G14 execution, independent reviewer or full repository checkout. The policy evaluator, extension registry and transport broker are explicit controlled doubles; the mode controller is the actual byte-identical source. This is a controller-level reproduction, not a native integration qualification or evidence of production exposure.

## Actual results

| Source | Test | Result |
|---|---|---|
| Original | Synchronous cancellation during replacement; next admission before old cleanup completes | FAIL: expected LIMIT_EXCEEDED, actual error code undefined (request succeeded) |
| Original | Controller disposal while detached registry cleanup held | FAIL: expected disposal pending, actual completed |
| Local proposed correction | Both above, same test file and assertions | 2 pass, 0 fail, 0 skip |

RED exit 1: 0 pass / 2 fail. GREEN exit 0: 2 pass / 0 fail. Original failure causes both concern one transition ownership gap, not two product defects. Local corrected mode.ts blob `b46c0331eea2bf29d71b22a53d1c19347b6b460d` is **not published** to PR227. Existing owner branch unchanged. No typecheck, full suite or actual G05/G14 acceptance claimed.

Raw local RED log SHA256 `96b25695f883ffdcbe906b501fc507ec6def7646eac5750a6d21b26b36237256`; GREEN `944777b6fd6bc28c4d5956f66d0b9569afe5701cdc960430dee4967031fdd9f1`; probe.mjs `6cf9ef10fb4fb0e7651a5d5473ff701f76fdb051c080c7ae18d58320f08225e6`. Raw temporary logs not uploaded; failure assertions and test fixture preserved below.

## Local correction diff

```diff
@@
       let candidate: ExtensionRegistry | undefined, retained = false, brokerGeneration = -1;
+      let previousDrain: Promise<void> | undefined;
+      const drainPrevious = (): Promise<void> => previousDrain ??= closeRegistry(previous);
@@
-        await closeRegistry(previous);
+        await drainPrevious();
@@
       } finally {
+        await drainPrevious();
         if (!retained) { control.abort(); await closeRegistry(candidate); }
       }
```

Keep the previous registry's drain under transition admission ownership even when synchronous revocation cancels before normal await. Memoize the drain so the success and cleanup paths do not repeatedly invoke disposal. Preserve pre-await revocation, candidate cleanup and the outer physical-job guard. Owner must reproduce with the existing actual G05/G14 fixture, review other early refusals, run full applicable current-target gates and obtain D8 Tier B named review before any integration. Do not count this as native reproduction or completed fix.

## Reproducible isolated probe

Copy exact mode.ts from the cited head at packages/privacy-policy/src/mode.ts and verify its blob. In the isolated temporary tree only, supply these three doubles. Type-only imports are stripped. No repository code outside the subject is represented as executed.

packages/extensions/index.ts:
```ts
export const EXTENSION_LIMITS = { modules: 32 };
export const createExtensionRegistry = () => ({ok:true,value:{disposeAll:async()=>{}}});
```
packages/privacy-policy/src/plan.ts:
```ts
export const createPolicyRuntime = options => ({ok:true,value:options});
export const runtimeState = runtime => ({catalog:runtime.catalog??[],paths:runtime.unbrokeredPaths??[]});
export const evaluatePolicy = (policy,runtime) => ({ok:true,value:{canPrepare:true,nodes:(runtime.catalog??[]).map(n=>({name:n.name,state:'enabled'}))}});
```
packages/privacy-policy/src/policy.ts:
```ts
export const failure = code => ({ok:false,error:{code}});
export const errorCode = error => error.code??'UNAVAILABLE';
export const invalid = code => {throw Object.assign(new Error(code),{code})};
export const snapshotPolicy = input => Object.freeze({...input});
export const attempt = fn => {try{return {ok:true,value:fn()}}catch(e){return failure(errorCode(e))}};
```
probe.mjs:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeController} from './packages/privacy-policy/src/mode.ts';
const tick=()=>new Promise(r=>setImmediate(r));
const policy={mode:'ordinary'};
const fixture=()=>{
  let release;const held=new Promise(r=>release=r);let callback, factories=0,starts=0,stops=0,drained=false;
  const broker={mode:'ordinary',generation:0,subscribeInvalidation(){return ()=>{}},invalidate(){this.generation++;const cb=callback;callback=undefined;cb?.()},setMode(mode){this.mode=mode;this.generation++}};
  const controller=createModeController({broker,catalog:[{name:'display',moduleId:'display',protocolVersion:1}],createRegistry(generation){
    const number=++factories;let pending;
    const disposeAll=()=>pending??=(async()=>{if(number===1){stops++;await held;drained=true}})();
    return {ok:true,value:{generation,disposeAll,resolve(){return {async initialize(_context,signal){starts++;signal.addEventListener('abort',()=>{void disposeAll()},{once:true});return {ok:true,value:undefined}}}}}};
  }});
  return {controller,broker,release,arm(){callback=()=>controller.cancelTransition(controller.inspectMode().policyGeneration)},stats(){return {factories,starts,stops,drained}}};
};
test('cancelled replacement retains admission until previous asynchronous cleanup drains',async()=>{
 const f=fixture();let replacement,other;
 try {
  assert.equal((await f.controller.requestMode(policy)).ok,true);f.arm();replacement=f.controller.requestMode(policy);await tick();
  assert.equal(f.stats().stops,1);assert.equal(f.stats().drained,false);
  other=f.controller.requestMode(policy);const result=await other;
  assert.equal(result.error?.code,'LIMIT_EXCEEDED');assert.equal(f.stats().factories,1);assert.equal(f.stats().starts,1);
 }finally{f.release();await replacement;await other;await f.controller.dispose()}
 assert.equal((await replacement).error.code,'CANCELLED');assert.equal(f.stats().stops,1);
});
test('controller disposal waits for detached registry cleanup after synchronous cancellation',async()=>{
 const f=fixture();let replacement,disposal,done=false;
 try {
  assert.equal((await f.controller.requestMode(policy)).ok,true);f.arm();replacement=f.controller.requestMode(policy);await tick();
  disposal=f.controller.dispose().then(()=>done=true);await tick();assert.equal(f.stats().drained,false);assert.equal(done,false);
 }finally{f.release();await replacement;await disposal;await f.controller.dispose()}
 assert.equal(done,true);assert.equal((await replacement).error.code,'CANCELLED');assert.equal(f.stats().stops,1);
});
```

Run `node --experimental-strip-types --test probe.mjs` before and after the local diff. The double calls a synchronous revocation callback and models idempotent abort-triggered asynchronous disposal; actual broker and registry equivalence remains an explicit acceptance requirement.

Current main `8cff44909752f5e8b99eecec44ebaa44360c7b5d`, PR251 merged. Exhausted live branch-name pagination: 284; PR partitions 86 open, 125 merged, 58 closed unmerged. No new exact-tip census: 152 ancestor-proven / 132 not ancestor-proven remain dated. Direct Git DNS failed, historical workspace absent. Submitted reviews still empty on PR227, PR237, PR260, PR267–272 and PR225/226/230/232. No deployment, funds, optional activation, production change or main merge. ReleaseEnabled=0 required.
