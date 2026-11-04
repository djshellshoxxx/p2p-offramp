import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionTransportPolicy } from '../../../packages/transport/index.ts';
const api=await import('../src/privacy/policy-controller.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const create=(...args)=>{assert.equal(typeof api.createPrivacyPolicyController,'function','missing controller');return api.createPrivacyPolicyController(...args);};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const failed=code=>({ok:false,error:{code,messageKey:`runtime.error.${code.toLowerCase()}`}});
function fixture(){
 const broker=new SessionTransportPolicy(),listeners=new Set();let scope=1,reads=0,selections=0,readHook,selectHook,scopeHook,failSubscription=false;
 const snapshot=()=>({version:1,mode:broker.mode,brokerGeneration:broker.generation,brokeredChannels:[]});
 const port={selectionScope(){scopeHook?.();return scope;},subscribe(listener){if(failSubscription)throw Error('SECRET');listeners.add(listener);return()=>listeners.delete(listener);},
  async getTransportSelection(){reads++;const result={ok:true,value:snapshot()};return readHook?readHook(result):result;},
  async selectTransportMode(input){selections++;if(input.expectedBrokerGeneration!==broker.generation)return failed('CONFLICT');if(broker.mode==='strict'&&input.mode==='ordinary'&&!input.ordinaryConsent)return failed('INVALID_INPUT');broker.setMode(input.mode);const result={ok:true,value:snapshot()};return selectHook?selectHook(input,result):result;}};
 return{broker,port,snapshot,get reads(){return reads;},get selections(){return selections;},hint(){for(const listener of [...listeners])listener();},
  set scope(value){scope=value;},set readHook(value){readHook=value;},set selectHook(value){selectHook=value;},set scopeHook(value){scopeHook=value;},set failSubscription(value){failSubscription=value;},
  close(){broker.dispose();listeners.clear();}};
}
test('controller observes an actual EMPTY owner only after activation and never manufactures coverage',async()=>{
 const f=fixture(),controller=create(f.port);assert.equal(f.reads,0);assert.equal(controller.getSnapshot().phase,'unavailable');
 const off=controller.activate();await tick();const state=controller.getSnapshot();assert.equal(state.phase,'ready');assert.deepEqual(state.selection,{version:1,mode:'ordinary',brokerGeneration:0,brokeredChannels:[]});assert.equal('coverage'in state.selection,false);assert.equal(Object.isFrozen(state.selection),true);
 assert.equal(f.broker.inspect('relay').coverage,'unknown');assert.equal(f.broker.authorize({channel:'relay',endpointId:'relay-a',method:'read'}),'INVALID_ENDPOINT');off();f.close();
});
test('explicit selection changes the real broker and leaving Strict needs fresh local acknowledgement',async()=>{
 const f=fixture(),controller=create(f.port),off=controller.activate();await tick();controller.choose('strict');assert.equal((await controller.apply()).ok,true);assert.equal(f.broker.mode,'strict');assert.equal(f.broker.generation,1);
 assert.equal((await controller.apply()).ok,true);assert.equal(f.broker.generation,1,'same mode is not a fake transition');
 controller.choose('ordinary');assert.equal((await controller.apply()).error.code,'INVALID_INPUT');assert.equal(f.broker.mode,'strict');assert.equal(f.selections,2,'unacknowledged relaxation never reaches the native owner');
 controller.acknowledgeOrdinary(true);assert.equal((await controller.apply()).ok,true);assert.equal(f.broker.mode,'ordinary');assert.equal(f.broker.generation,2);assert.equal(controller.getSnapshot().ordinaryConsent,false);off();f.close();
});
test('invalidation clears pending consent and refreshes scalars without changing the native mode',async()=>{
 const f=fixture();f.broker.setMode('strict');const controller=create(f.port),off=controller.activate();await tick();controller.choose('ordinary');controller.acknowledgeOrdinary(true);
 const held=gate();f.readHook=async result=>{await held.promise;return result;};f.broker.invalidate();f.hint();assert.equal(controller.getSnapshot().selection,null);assert.equal(controller.getSnapshot().ordinaryConsent,false);assert.equal(controller.getSnapshot().proposedMode,null);
 await tick();assert.equal(f.broker.mode,'strict');assert.equal(f.selections,0);held.resolve();await tick();assert.equal(controller.getSnapshot().selection.mode,'strict');off();f.close();
});
test('cleanup and StrictMode reactivation retain one held physical read and ignore its stale reply',async()=>{
 const f=fixture(),held=gate();f.readHook=async result=>{await held.promise;return result;};const controller=create(f.port);const first=controller.activate();await tick();first();f.broker.setMode('strict');f.readHook=undefined;const second=controller.activate();await tick();assert.equal(f.reads,1);assert.equal(controller.getSnapshot().selection,null);
 held.resolve();await tick();assert.equal(f.reads,2);assert.equal(controller.getSnapshot().selection.mode,'strict');second();f.close();
});
test('a replacement owner and failed A-null-A registration cannot inherit an earlier ready selection',async()=>{
 const f=fixture(),old=create(f.port),off=old.activate();await tick();assert.equal(old.getSnapshot().phase,'ready');off();f.failSubscription=true;
 const detached=create(null),none=detached.activate();assert.equal(detached.getSnapshot().phase,'unavailable');none();const replacement=create(f.port),stop=replacement.activate();await tick();assert.equal(replacement.getSnapshot().phase,'unavailable');assert.equal(replacement.getSnapshot().selection,null);assert.equal(f.reads,1);stop();f.close();
});
test('profile scope replacement during a held select suppresses the old reply and resets consent',async()=>{
 const f=fixture(),held=gate();f.selectHook=async(_input,result)=>{await held.promise;return result;};const controller=create(f.port,1),off=controller.activate();await tick();controller.choose('strict');const applying=controller.apply();f.scope=2;f.hint();held.resolve();assert.equal((await applying).ok,false);await tick();assert.equal(controller.getSnapshot().selection,null);assert.equal(controller.getSnapshot().ordinaryConsent,false);assert.equal(f.broker.mode,'strict');off();f.close();
});
test('further hints cannot revive a controller whose expected profile scope has expired',async()=>{
 const f=fixture(),controller=create(f.port,1),off=controller.activate();await tick();f.scope=2;f.hint();assert.equal(controller.getSnapshot().phase,'unavailable');f.hint();await tick();assert.equal(controller.getSnapshot().phase,'unavailable');assert.equal(f.reads,1);off();f.close();
});
test('reentrant apply cannot start another mode request or change a captured choice',async()=>{
 const f=fixture(),controller=create(f.port),off=controller.activate();await tick();let nested;
 f.selectHook=(_input,result)=>{controller.choose('ordinary');controller.acknowledgeOrdinary(true);nested=controller.apply();return result;};controller.choose('strict');assert.equal((await controller.apply()).ok,true);assert.equal((await nested).error.code,'BUSY');assert.equal(f.broker.mode,'strict');assert.equal(f.selections,1);assert.equal(controller.getSnapshot().ordinaryConsent,false);off();f.close();
});
test('malformed selections and throwing source code expose only fixed errors, never accessor content',async()=>{
 const f=fixture();let accessors=0;f.readHook=()=>({ok:true,value:{version:1,mode:'ordinary',brokerGeneration:0,get brokeredChannels(){accessors++;throw Error('SECRET');}}});const controller=create(f.port),off=controller.activate();await tick();assert.equal(controller.getSnapshot().phase,'error');assert.equal(controller.getSnapshot().error,'PROTOCOL_ERROR');assert.equal(accessors,0);assert.doesNotMatch(JSON.stringify(controller.getSnapshot()),/SECRET/);off();f.close();
});
test('synchronous hints while subscribing are handled after a real subscription lease exists',async()=>{
 const f=fixture(),subscribe=f.port.subscribe;f.port.subscribe=listener=>{listener();return subscribe(listener);};const controller=create(f.port),off=controller.activate();await tick();assert.equal(controller.getSnapshot().phase,'ready');assert.equal(f.reads,1);off();f.close();
});
test('reentrant invalidation while parsing a returned scalar fails closed without an automatic read loop',async()=>{
 const f=fixture();let first=true;f.readHook=result=>({ok:true,value:new Proxy(result.value,{ownKeys(target){if(first){first=false;f.hint();}return Reflect.ownKeys(target);}})});
 const controller=create(f.port),off=controller.activate();await tick();await tick();assert.equal(controller.getSnapshot().phase,'unavailable');assert.equal(f.reads,1);off();f.close();
});
test('an earlier observer catches up after a later observer changes the proposed mode once',async()=>{
 const f=fixture(),controller=create(f.port),stop=controller.activate();await tick();const observed=[];let mutations=0,mutatorCalls=0;
 const first=controller.subscribe(()=>observed.push(controller.getSnapshot()));
 const second=controller.subscribe(()=>{mutatorCalls++;if(mutations++===0)controller.choose('strict');});
 controller.choose('ordinary');await tick();await tick();assert.equal(controller.getSnapshot().proposedMode,'strict');assert.equal(observed.at(-1),controller.getSnapshot());assert.equal(mutatorCalls,1);
 first();second();stop();f.close();
});
test('an earlier observer catches up after a later observer acknowledges Ordinary once',async()=>{
 const f=fixture();f.broker.setMode('strict');const controller=create(f.port),stop=controller.activate();await tick();const observed=[];let mutations=0,mutatorCalls=0;
 const first=controller.subscribe(()=>observed.push(controller.getSnapshot()));
 const second=controller.subscribe(()=>{mutatorCalls++;if(mutations++===0)controller.acknowledgeOrdinary(true);});
 controller.choose('ordinary');await tick();await tick();assert.equal(controller.getSnapshot().ordinaryConsent,true);assert.equal(observed.at(-1),controller.getSnapshot());assert.equal(mutatorCalls,1);
 first();second();stop();f.close();
});
test('a no-op publishing observer runs once and cannot start an asynchronous notification loop',async()=>{
 const f=fixture(),controller=create(f.port),stop=controller.activate();await tick();let stableCalls=0,mutatorCalls=0,last;
 const first=controller.subscribe(()=>{stableCalls++;last=controller.getSnapshot();});
 const second=controller.subscribe(()=>{mutatorCalls++;controller.choose('ordinary');controller.acknowledgeOrdinary(false);});
 controller.choose('ordinary');await tick();await tick();assert.equal(mutatorCalls,1);assert.equal(stableCalls,2);assert.equal(last,controller.getSnapshot());
 first();second();stop();f.close();
});
test('conflicting observer mutations remain bounded at the existing 64-observer limit',async()=>{
 const f=fixture(),controller=create(f.port),stop=controller.activate();await tick();const counts=Array(63).fill(0),offs=[];let stableCalls=0,last;
 offs.push(controller.subscribe(()=>{stableCalls++;last=controller.getSnapshot();}));
 for(let index=0;index<63;index++)offs.push(controller.subscribe(()=>{counts[index]++;controller.choose(index%2===0?'strict':'ordinary');}));
 assert.throws(()=>controller.subscribe(()=>{}),/LIMIT_EXCEEDED/);controller.choose('ordinary');await tick();await tick();
 assert.ok(counts.every(count=>count===1));assert.equal(stableCalls,2);assert.equal(last,controller.getSnapshot());assert.equal(last.proposedMode,'strict');
 for(const off of offs)off();stop();f.close();
});
test('a throwing mutator cannot suppress stable-observer catch-up or other observers',async()=>{
 const f=fixture(),controller=create(f.port),stop=controller.activate();await tick();let firstLast,thirdLast,mutatorCalls=0;
 const first=controller.subscribe(()=>{firstLast=controller.getSnapshot();});
 const second=controller.subscribe(()=>{mutatorCalls++;controller.choose('strict');throw Error('SECRET');});
 const third=controller.subscribe(()=>{thirdLast=controller.getSnapshot();});
 controller.choose('ordinary');await tick();await tick();assert.equal(firstLast,controller.getSnapshot());assert.equal(thirdLast,controller.getSnapshot());assert.equal(mutatorCalls,1);assert.doesNotMatch(JSON.stringify(firstLast),/SECRET/);
 first();second();third();stop();f.close();
});
test('observers added during a batch do not extend its cohort and removed observers are skipped',async()=>{
 const f=fixture(),controller=create(f.port),stop=controller.activate();await tick();let stableLast,lateCalls=0,removedCalls=0,mutatorCalls=0,lateOff;
 const first=controller.subscribe(()=>{stableLast=controller.getSnapshot();});let removedOff;
 const second=controller.subscribe(()=>{mutatorCalls++;removedOff();lateOff=controller.subscribe(()=>{lateCalls++;});controller.choose('strict');});
 removedOff=controller.subscribe(()=>{removedCalls++;});controller.choose('ordinary');await tick();await tick();
 assert.equal(stableLast,controller.getSnapshot());assert.equal(mutatorCalls,1);assert.equal(removedCalls,0);assert.equal(lateCalls,0);
 second();controller.choose('ordinary');await tick();assert.equal(lateCalls,1);first();lateOff();stop();f.close();
});
test('deactivation during a later observer callback publishes the final unavailable state to stable observers',async()=>{
 const f=fixture(),controller=create(f.port),stop=controller.activate();await tick();let last,mutatorCalls=0;
 const first=controller.subscribe(()=>{last=controller.getSnapshot();});
 const second=controller.subscribe(()=>{mutatorCalls++;stop();f.hint();});controller.choose('strict');await tick();await tick();
 assert.equal(controller.getSnapshot().phase,'unavailable');assert.equal(controller.getSnapshot().selection,null);assert.equal(last,controller.getSnapshot());assert.equal(mutatorCalls,1);assert.equal(f.reads,1);first();second();f.close();
});
