// Actual G05/G14 lifecycle with synthetic local operations; no network or privacy approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeController} from '../index.ts';
import {createExtensionRegistry} from '../../extensions/index.ts';
import {makeBroker} from '../../relay/test/support/harness.mjs';

const ref={name:'local:display',protocolVersion:1,schemaHash:'a'.repeat(64)};
const manifest={format:'p2p-offramp-extension',version:1,id:'local-display',protocolVersion:1,coreApiVersion:1,capabilities:[ref.name],schemaHashes:[ref.schemaHash]};
const node={...ref,moduleId:manifest.id,profileId:null,mandatory:false,dependencies:[],conflicts:[],channels:[],unbrokeredPaths:[],dataClasses:['private']};
const policy=(mode='ordinary')=>({format:'p2p-offramp-feature-policy',version:1,policyId:'local-test',revision:0,required:[ref],optional:[],disabled:[],mode,profileIds:[]});
const ok=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function scope(broker,endpointId,options={}) {
  const permit=broker.authorize({channel:'relay',endpointId,method:'read'});
  assert.equal(typeof permit,'object');
  const captured=broker.capture(permit,options);assert.equal(typeof captured,'object');return captured;
}
function fixture({holdInitialize=false,reenterDispose=false,mode='ordinary'}={}) {
  const {broker}=makeBroker({mode:mode==='ordinary'?'ordinary':'strict',coverage:mode==='ordinary'?'direct':'verified-private'});
  const entered=deferred(),initialized=deferred(),stopped=deferred();
  let native,optional,stops=0,joined,joinedDone=false,controller;
  controller=createModeController({broker,catalog:[node],unbrokeredPaths:[],createRegistry:(generation,isCurrent)=>{
    const result=createExtensionRegistry({generation,isCurrent,registeredCapabilities:[ref.name],entries:[{instance:{
      manifest,
      async initialize(_context,signal) {
        optional=scope(broker,'relay-b',{signal});entered.resolve();
        if(holdInitialize)await initialized.promise;
        return{ok:true,value:undefined};
      },
      async dispose() {
        stops++;
        if(reenterDispose)joined=controller.dispose().then(()=>{joinedDone=true;});
        await stopped.promise;
      },
    }}]});
    native=ok(result);return result;
  }});
  return{broker,controller,entered,initialized,stopped,native:()=>native,optional:()=>optional,stats:()=>({stops,joined,joinedDone}),mode};
}

for(const mode of ['ordinary','strict-private'])for(const event of ['evidence','dispose','cancel','evidence-reentrant']) {
  test(`${mode}: optional ${event} cancels owned scopes without revoking an unrelated core operation`,{timeout:10000},async()=>{
    const f=fixture({holdInitialize:event==='cancel',reenterDispose:event==='evidence-reentrant',mode});
    const held=deferred();let request,disposal,read,revocations=0,core;
    try {
      request=f.controller.requestMode(policy(mode));await f.entered.promise;
      if(event!=='cancel')ok(await request);
      assert.equal(f.optional().current(),true);
      core=scope(f.broker,'relay-a',{onRevoked:()=>{revocations++;}});
      read=core.run(async signal=>{await held.promise;assert.equal(signal.aborted,false);return'core-completed';});
      const generation=f.broker.generation;
      if(event.startsWith('evidence')) {
        void f.native().disposeAll();
        assert.equal(f.optional().signal.aborted,true);
        assert.equal(core.current(),true);
        f.controller.onEvidenceChanged();
      } else if(event==='dispose')disposal=f.controller.dispose();
      else f.controller.cancelTransition(f.controller.inspectMode().policyGeneration);
      assert.equal(f.optional().signal.aborted,true);
      assert.equal(f.optional().current(),false);
      assert.equal(f.controller.inspectMode().preparationFrozen,true);
      assert.equal(f.broker.generation,generation,'optional cleanup must not advance the shared broker');
      assert.equal(core.current(),true);
      assert.equal(core.signal.aborted,false);
      assert.equal(revocations,0);
      held.resolve();assert.deepEqual(await read,{ok:true,value:'core-completed'});
      await tick();assert.equal(f.stats().stops,1);
      if(event==='evidence-reentrant') {
        assert.ok(f.stats().joined,'optional cleanup reentered controller disposal');
        assert.equal(f.stats().joinedDone,false,'reentrant caller still awaits owned cleanup');
      }
      if(event==='cancel') {
        const overlapping=await f.controller.requestMode(policy(mode));
        assert.equal(overlapping.ok,false);assert.equal(overlapping.error.code,'LIMIT_EXCEEDED');
      }
      f.initialized.resolve();f.stopped.resolve();
      const result=await request;
      if(event==='cancel'){assert.equal(result.ok,false);assert.equal(result.error.code,'CANCELLED');}
      await Promise.all([disposal,f.stats().joined].filter(Boolean));
      assert.equal(f.stats().stops,1);
      assert.equal(f.broker.mode,mode==='ordinary'?'ordinary':'strict');
    } finally {
      held.resolve();f.initialized.resolve();f.stopped.resolve();
      await Promise.allSettled([request,read,disposal,f.stats().joined].filter(Boolean));
      await f.controller.dispose();core?.dispose();f.broker.dispose();
    }
  });
}

test('genuine shared-broker revocation still cancels core and optional scopes and freezes preparation',{timeout:10000},async()=>{
  const f=fixture({mode:'strict-private'});let core;
  try {
    ok(await f.controller.requestMode(policy('strict-private')));
    core=scope(f.broker,'relay-a');
    assert.equal(core.current(),true);assert.equal(f.optional().current(),true);
    const generation=f.broker.generation;
    assert.equal(f.broker.invalidate(),undefined);
    assert.equal(f.broker.generation,generation+1);
    assert.equal(core.current(),false);assert.equal(core.signal.aborted,true);
    assert.equal(f.optional().current(),false);assert.equal(f.optional().signal.aborted,true);
    const snapshot=f.controller.inspectMode();
    assert.equal(snapshot.state,'blocked');assert.equal(snapshot.preparationFrozen,true);
    assert.equal(f.broker.mode,'strict');
    let calls=0;
    assert.deepEqual(await core.run(async()=>{calls++;return'forbidden';}),{ok:false,error:'CANCELLED'});
    assert.equal(calls,0);
  } finally {f.initialized.resolve();f.stopped.resolve();await f.controller.dispose();core?.dispose();f.broker.dispose();}
});
