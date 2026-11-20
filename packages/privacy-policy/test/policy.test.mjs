// Local policy fixtures only: no production provider, privacy coverage approval or G14→G16 commitment.
import test from 'node:test';import assert from 'node:assert/strict';
import {parsePolicy,diffPolicy,createPolicyRuntime,evaluatePolicy,createModeController} from '../index.ts';
import {createExtensionRegistry} from '../../extensions/index.ts';
import {makeBroker} from '../../relay/test/support/harness.mjs';
const hash='a'.repeat(64),ref={name:'local:display',protocolVersion:1,schemaHash:hash};
const policy=(extra={})=>({format:'p2p-offramp-feature-policy',version:1,policyId:'local-test',revision:0,required:[],optional:[],disabled:[],mode:'ordinary',profileIds:[],...extra});
const node=(extra={})=>({...ref,moduleId:'local-display',profileId:null,mandatory:false,dependencies:[],conflicts:[],channels:[],unbrokeredPaths:[],dataClasses:['private'],...extra});
const bytes=p=>new TextEncoder().encode(JSON.stringify(p)),val=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value},bad=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.error.code,code);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|https:/)};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}},tick=()=>new Promise(r=>setImmediate(r));
const manifest={format:'p2p-offramp-extension',version:1,id:'local-display',protocolVersion:1,coreApiVersion:1,capabilities:[ref.name],schemaHashes:[hash]};
const instance=(extra={})=>({manifest,initialize:async()=>({ok:true,value:undefined}),dispose:async()=>{},...extra});
const registry=(entries=[],extra={})=>val(createExtensionRegistry({entries:entries.map(instance=>({instance})),registeredCapabilities:[ref.name],...extra}));
test('strict bounded policy parser snapshots exact inert input and enforces 32 TOTAL entries',()=>{
 const parsed=val(parsePolicy(bytes(policy({required:[ref]}))));assert.ok(Object.isFrozen(parsed.required[0]));assert.equal(parsed.required[0].name,ref.name);
 const refs=Array.from({length:32},(_,i)=>({...ref,name:`feature:${i}`}));val(parsePolicy(bytes(policy({required:refs.slice(0,16),optional:refs.slice(16)}))));bad(parsePolicy(bytes(policy({required:refs,optional:[{...ref,name:'overflow'}]}))),'LIMIT_EXCEEDED');
 for(const change of [{required:[ref],disabled:[ref]},{optional:[ref,ref]}])bad(parsePolicy(bytes(policy(change))),'CONFLICT');
 for(const change of [{revision:-1},{revision:1.5},{profileIds:['https://PRIVATE']},{unknown:true},{required:[{...ref,schemaHash:'A'.repeat(64)}]}])bad(parsePolicy(bytes(policy(change))),'INVALID_INPUT');
 bad(parsePolicy(bytes(policy({version:2}))),'UNSUPPORTED_VERSION');bad(parsePolicy(new Uint8Array(32769)),'LIMIT_EXCEEDED');
 const original=bytes(policy());const exact=new Uint8Array(32768).fill(32);exact.set(original);val(parsePolicy(exact));
 bad(parsePolicy(new TextEncoder().encode('{"format":"p2p-offramp-feature-policy","format":"PRIVATE"}')),'INVALID_INPUT');
});
test('policy diff identifies role/hash/mode changes without granting imported status authority',()=>{
 const change=val(diffPolicy(policy({required:[ref]}),policy({optional:[ref],mode:'strict-private'})));assert.deepEqual(change.changedCapabilities,[ref.name]);assert.equal(change.modeChanged,true);
 const fake={kind:'native-policy-runtime',available:true,coverage:'verified-private'};bad(evaluatePolicy(policy(),fake),'INVALID_INPUT');let touched=0;bad(diffPolicy(Object.defineProperty(policy(),'required',{get(){touched++;throw Error('PRIVATE')}}),policy()),'INVALID_INPUT');assert.equal(touched,0);
});
test('native G14 availability, exact identity, mandatory invariants and dependency cycles are independent predicates',async()=>{
 const {broker}=makeBroker({mode:'ordinary',coverage:'direct'}),native=registry();try{
  const runtime=val(createPolicyRuntime({broker,registry:native,catalog:[node()],unbrokeredPaths:[]}));assert.equal(val(evaluatePolicy(policy({required:[ref]}),runtime)).canPrepare,false);assert.equal(val(evaluatePolicy(policy({optional:[ref]}),runtime)).canPrepare,true);
  bad(evaluatePolicy(policy({required:[{...ref,schemaHash:'b'.repeat(64)}]}),runtime),'UNSUPPORTED_PROVIDER');bad(evaluatePolicy(policy(),structuredClone(runtime)),'INVALID_INPUT');
  const mandatory=val(createPolicyRuntime({broker,registry:native,catalog:[node({mandatory:true})]}));bad(evaluatePolicy(policy({disabled:[ref]}),mandatory),'UNAUTHORIZED');
  bad(createPolicyRuntime({broker,registry:native,catalog:[node({dependencies:[ref.name]})]}),'CONFLICT');bad(createPolicyRuntime({broker,registry:native,catalog:Array.from({length:65},(_,i)=>node({name:`f:${i}`}))}),'LIMIT_EXCEEDED');
 }finally{await native.disposeAll();broker.dispose()}
});
test('strict conjunction rejects unknown wallet and unbrokered static paths without activating an optional provider',async()=>{
 const {broker,registry:issuer}=makeBroker(),native=registry([instance()]);try{
  const n=node({channels:['relay','wallet'],profileId:'local-fixture'}),p=policy({required:[ref],profileIds:['local-fixture'],mode:'strict-private'});
  const runtime=val(createPolicyRuntime({broker,registry:native,catalog:[n]}));assert.equal(val(evaluatePolicy(p,runtime)).canPrepare,false,'actual browser static loading is unbrokered');
  const scoped=val(createPolicyRuntime({broker,registry:native,catalog:[n],unbrokeredPaths:[]}));assert.equal(val(evaluatePolicy(p,scoped)).canPrepare,true,'fixture-only source coverage is not a production privacy claim');
  const read=issuer.inspect.bind(issuer);issuer.inspect=channel=>channel==='wallet'?{channel,coverage:'unknown',adapterId:'fixture-adapter',expiresAt:null}:read(channel);const rejected=val(evaluatePolicy(p,scoped));assert.equal(rejected.canPrepare,false);assert.equal(rejected.nodes[0].routes.find(route=>route.channel==='wallet').coverage,'unknown');
  assert.equal(val(evaluatePolicy(policy({optional:[ref],profileIds:['local-fixture'],mode:'strict-private'}),scoped)).nodes[0].state,'blocked');
 }finally{await native.disposeAll();broker.dispose()}
});
test('same-mode replacement freezes and revokes native permits BEFORE old G14 disposal, then initializes a fresh registry',async()=>{
 const {broker}=makeBroker({mode:'ordinary',coverage:'direct'});const held=deferred(),entered=deferred();let factories=0,starts=0,stops=0,controller;
 controller=createModeController({broker,catalog:[node()],unbrokeredPaths:[],createRegistry:(generation,isCurrent)=>{factories++;const number=factories;return createExtensionRegistry({generation,isCurrent,registeredCapabilities:[ref.name],entries:[{instance:instance({initialize:async()=>{starts++;return{ok:true,value:undefined}},dispose:async()=>{stops++;if(number===1){entered.resolve();await held.promise}}})}]})}});
 try{
  val(await controller.requestMode(policy({required:[ref]})));assert.equal(starts,1);
  const permit=broker.authorize({channel:'relay',endpointId:'relay-a',method:'read'});assert.equal(typeof permit,'object');let frozenAtReentry=false;const live=broker.capture(permit,{onRevoked:()=>{frozenAtReentry=controller.inspectMode().preparationFrozen}});
  const replacement=controller.requestMode(policy({required:[ref],revision:1}));assert.equal(live.current(),false);assert.equal(live.signal.aborted,true);assert.equal(frozenAtReentry,true);await entered.promise;assert.equal(factories,1);assert.equal(starts,1);bad(await controller.requestMode(policy()),'LIMIT_EXCEEDED');held.resolve();val(await replacement);assert.equal(factories,2);assert.equal(starts,2);assert.equal(controller.inspectMode().state,'active');
 }finally{held.resolve();await controller.dispose();broker.dispose()}
});
test('cancel/dispose retain physical transition admission until an abort-ignoring actual G14 initializer drains',async()=>{
 const {broker}=makeBroker({mode:'ordinary'}),held=deferred(),entered=deferred();let starts=0;
 const controller=createModeController({broker,catalog:[node()],unbrokeredPaths:[],createRegistry:(generation,isCurrent)=>createExtensionRegistry({generation,isCurrent,registeredCapabilities:[ref.name],entries:[{instance:instance({initialize:async()=>{starts++;entered.resolve();await held.promise;return{ok:true,value:undefined}}})}]})});
 const pending=controller.requestMode(policy({required:[ref]}));await entered.promise;controller.cancelTransition(controller.inspectMode().policyGeneration);bad(await controller.requestMode(policy()),'LIMIT_EXCEEDED');let disposed=false;const disposal=controller.dispose().then(()=>disposed=true);await tick();assert.equal(disposed,false);assert.equal(starts,1);held.resolve();bad(await pending,'CANCELLED');await disposal;assert.equal(disposed,true);assert.equal(controller.inspectMode().state,'inactive');bad(await controller.requestMode(policy()),'LOCKED');broker.dispose();
});
test('strict cannot silently downgrade, expiry/revocation blocks stale activation, empty ordinary preserves core-only behavior',async()=>{
 const {broker,registry:issuer}=makeBroker();const controller=createModeController({broker,unbrokeredPaths:[]});
 try{bad(await controller.requestMode(policy()),'UNAUTHORIZED');assert.equal(broker.mode,'strict');val(await controller.requestMode(policy(),{ordinaryConsent:true}));assert.equal(controller.inspectMode().state,'active');assert.equal(controller.inspectMode().evaluation.economicAuthority,false);
  const strict=await controller.requestMode(policy({mode:'strict-private'}));val(strict);broker.invalidate();assert.equal(controller.inspectMode().state,'blocked');assert.equal(broker.mode,'strict');bad(await controller.requestMode(policy()),'LIMIT_EXCEEDED');await tick();bad(await controller.requestMode(policy()),'UNAUTHORIZED');
 }finally{await controller.dispose();broker.dispose()}
 const empty=makeBroker({mode:'ordinary',empty:true});const noAdvanced=createModeController({broker:empty.broker});try{val(await noAdvanced.requestMode(policy()));assert.equal(noAdvanced.inspectMode().preparationFrozen,false);bad(await noAdvanced.requestMode(policy({mode:'strict-private'})),'UNSUPPORTED_PROVIDER');assert.equal(empty.broker.mode,'strict')}finally{await noAdvanced.dispose();empty.broker.dispose()}
});
test('an absent optional root never initializes an available dependency or blocks core-only preparation',async()=>{
 const {broker}=makeBroker({mode:'ordinary'});let starts=0;const dependency=node({name:'local:dependency',moduleId:'dependency'});
 const controller=createModeController({broker,catalog:[node({dependencies:[dependency.name]}),dependency],unbrokeredPaths:[],createRegistry:(generation,isCurrent)=>createExtensionRegistry({generation,isCurrent,registeredCapabilities:[ref.name,dependency.name],entries:[{instance:instance({manifest:{...manifest,id:'dependency',capabilities:[dependency.name]},initialize:async()=>{starts++;return{ok:true,value:undefined}}})}]})});
 try{const state=val(await controller.requestMode(policy({optional:[ref]})));assert.equal(state.preparationFrozen,false);assert.equal(starts,0);assert.equal(state.evaluation.nodes.find(n=>n.name===dependency.name).state,'disabled');controller.onEvidenceChanged();assert.equal(controller.inspectMode().state,'active')}finally{await controller.dispose();broker.dispose()}
});
test('native G14 atomic manifests cannot initialize a disabled companion capability or an unmapped schema',async()=>{
 const {broker}=makeBroker({mode:'ordinary'});let starts=0;const companion={...ref,name:'local:companion'};
 const controller=createModeController({broker,catalog:[node(),node({name:companion.name})],unbrokeredPaths:[],createRegistry:(generation,isCurrent)=>createExtensionRegistry({generation,isCurrent,registeredCapabilities:[ref.name,companion.name],entries:[{instance:instance({manifest:{...manifest,capabilities:[ref.name,companion.name]},initialize:async()=>{starts++;return{ok:true,value:undefined}}})}]})});
 try{bad(await controller.requestMode(policy({required:[ref],disabled:[companion]})),'UNSUPPORTED_PROVIDER');assert.equal(starts,0);assert.equal(controller.inspectMode().preparationFrozen,true)}finally{await controller.dispose();broker.dispose()}
 const next=makeBroker({mode:'ordinary'}),native=registry([instance({manifest:{...manifest,schemaHashes:[hash,'b'.repeat(64)]}})]);try{const source=val(createPolicyRuntime({broker:next.broker,registry:native,catalog:[node()],unbrokeredPaths:[]}));assert.equal(val(evaluatePolicy(policy({required:[ref]}),source)).canPrepare,false)}finally{await native.disposeAll();next.broker.dispose()}
});
test('policy and consent reflection cannot overlap native G14 physical mode transitions',async()=>{
 for(const boundary of ['policy','consent']){
  const {broker}=makeBroker({mode:'ordinary'}),held=deferred(),entered=deferred();let starts=0,nested,once=false,controller;
  controller=createModeController({broker,catalog:[node()],unbrokeredPaths:[],createRegistry:(generation,isCurrent)=>createExtensionRegistry({generation,isCurrent,registeredCapabilities:[ref.name],entries:[{instance:instance({initialize:async()=>{starts++;entered.resolve();await held.promise;return{ok:true,value:undefined}}})}]})});
  const p=policy({required:[ref]}),reenter=()=>{if(!once){once=true;nested=controller.requestMode(p)}};
  const input=boundary==='policy'?new Proxy(p,{ownKeys(target){reenter();return Reflect.ownKeys(target)}}):p;
  const consent=boundary==='consent'?new Proxy({ordinaryConsent:true},{getOwnPropertyDescriptor(target,key){reenter();return Reflect.getOwnPropertyDescriptor(target,key)}}):undefined;
  try{
   const outer=controller.requestMode(input,consent);await entered.promise;
   for(let i=0;i<5;i++)await tick();
   const third=controller.requestMode(p);for(let i=0;i<5;i++)await tick();
   assert.equal(starts,1,boundary+' reflection must retain one physical initializer');
   held.resolve();val(await outer);bad(await nested,'LIMIT_EXCEEDED');bad(await third,'LIMIT_EXCEEDED');
  }finally{held.resolve();await controller.dispose();broker.dispose()}
 }
});
test('disposal during policy reflection refuses activation and drains its admission',async()=>{
 const {broker}=makeBroker({mode:'ordinary'});let starts=0,disposal,controller;
 controller=createModeController({broker,createRegistry:(generation,isCurrent)=>{starts++;return createExtensionRegistry({generation,isCurrent})}});
 const input=new Proxy(policy(),{ownKeys(target){disposal=controller.dispose();return Reflect.ownKeys(target)}});
 try{bad(await controller.requestMode(input),'CANCELLED');await disposal;assert.equal(starts,0);bad(await controller.requestMode(policy()),'LOCKED')}finally{await controller.dispose();broker.dispose()}
});
