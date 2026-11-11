import test from 'node:test';
import assert from 'node:assert/strict';
import {EncryptedVaultService,EncryptedBackupService} from '../../../packages/storage/index.ts';
import {SessionTransportPolicy,MAX_UNSETTLED_TRANSPORT_OPERATIONS} from '../../../packages/transport/index.ts';
import {parseRuntimeCommand,parseRuntimeMessage} from '../../../packages/schemas/index.ts';
import {makeBroker} from '../../../packages/relay/test/support/harness.mjs';
import {createVaultWorkerEndpoint} from '../src/runtime/worker-endpoint.ts';
import {AppRuntime} from '../src/runtime/app-runtime.ts';
import {startAppServices} from '../src/app-services.ts';
import {createJourneyVaultComposition} from '../src/journey/vault-composition.ts';
import {createPrivateTradeJourney} from '../src/journey/private-trade.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve)),good=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const bad=(result,code)=>{assert.equal(result.ok,false);assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/SECRET/);};
const command=(operation,requestId=1,generation=0,fields={})=>({version:1,requestId,generation,operation,...fields});
const config={version:1,ReleaseEnabled:0,connectOrigins:[]};
class Port extends EventTarget{sent=[];received=[];terminated=0;postMessage(input){const value=structuredClone(input);this.sent.push(value);queueMicrotask(()=>void this.endpoint.dispatch(value));}reply(input){const data=structuredClone(input);this.received.push(data);queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data})));}terminate(){this.terminated++;this.endpoint.dispose();}}
function services(){const rows=new Map(),store={listProfileIds:async()=>({profileIds:[...rows.keys()],truncated:false}),get:async id=>rows.get(id),add:async row=>rows.set(row.profileId,structuredClone(row)),compareAndSwap:async()=>{throw Error('No writes expected');},subscribeInvalidation:()=>()=>{}};return{vault:new EncryptedVaultService(store,crypto,{lifecycle:false}),backup:new EncryptedBackupService(store)};}
async function setup(transportPolicy){const privateServices=services(),port=new Port();port.endpoint=createVaultWorkerEndpoint(message=>port.reply(message),{createServices:()=>({...privateServices,...(transportPolicy?{transportPolicy}:{})})});const descriptor=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});try{return{port,...privateServices,runtime:good(await AppRuntime.start(config,{createWorker:()=>port,lifecycle:false}))};}finally{if(descriptor)Object.defineProperty(globalThis,'isSecureContext',descriptor);else delete globalThis.isSecureContext;}}
test('runtime policy IPC is exact, bounded, immutable and never accepts route evidence',()=>{
 const selected={version:1,mode:'strict',brokerGeneration:7,brokeredChannels:['relay']};
 assert.equal(parseRuntimeCommand(command('getTransportSelection')).operation,'getTransportSelection');
 assert.deepEqual(parseRuntimeCommand(command('selectTransportMode',2,0,{mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false})).mode,'strict');
 const parsed=parseRuntimeMessage({...command('getTransportSelection'),kind:'response',result:{ok:true,value:selected}});assert.deepEqual(parsed.result.value,selected);assert.equal(Object.isFrozen(parsed.result.value.brokeredChannels),true);
 assert.deepEqual(parseRuntimeMessage({version:1,kind:'transport-selection-invalidated',generation:0,brokerGeneration:7}),{version:1,kind:'transport-selection-invalidated',generation:0,brokerGeneration:7});
 for(const input of [command('getTransportSelection',1,0,{profileId:'a'.repeat(32)}),command('selectTransportMode',1,0,{mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false,evidence:{coverage:'verified-private'}})])assert.throws(()=>parseRuntimeCommand(input));
 assert.throws(()=>parseRuntimeMessage({version:1,kind:'transport-selection-invalidated',generation:0,brokerGeneration:-0}));
});
test('the default actual endpoint has no broker and policy commands remain unavailable',async()=>{
 const s=await setup();assert.equal(typeof s.runtime.getTransportSelection,'function','missing narrow runtime selection');try{bad(await s.runtime.getTransportSelection(),'LOCKED');bad(await s.runtime.selectTransportMode({mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false}),'LOCKED');assert.equal(s.port.sent.some(row=>'broker'in row||'provider'in row),false);}finally{await s.runtime.dispose();}
});
test('actual EMPTY broker selection crosses the same endpoint with explicit relaxation and no invented authority',async()=>{
 const broker=new SessionTransportPolicy(),s=await setup({broker,brokeredChannels:[]});assert.equal(typeof s.runtime.getTransportSelection,'function','missing narrow runtime selection');try{
 assert.deepEqual(good(await s.runtime.getTransportSelection()),{version:1,mode:'ordinary',brokerGeneration:0,brokeredChannels:[]});
 good(await s.runtime.selectTransportMode({mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false}));assert.equal(broker.mode,'strict');assert.equal(broker.generation,1);
 bad(await s.runtime.selectTransportMode({mode:'ordinary',expectedBrokerGeneration:1,ordinaryConsent:false}),'INVALID_INPUT');assert.equal(broker.mode,'strict');
 bad(await s.runtime.selectTransportMode({mode:'ordinary',expectedBrokerGeneration:0,ordinaryConsent:true}),'CONFLICT');assert.equal(broker.generation,1);
 good(await s.runtime.selectTransportMode({mode:'ordinary',expectedBrokerGeneration:1,ordinaryConsent:true}));assert.equal(broker.generation,2);assert.equal(broker.inspect('relay').coverage,'unknown');assert.equal(broker.authorize({channel:'relay',endpointId:'relay-a',method:'read'}),'INVALID_ENDPOINT');
 await tick();assert.ok(s.port.received.some(message=>message.kind==='transport-selection-invalidated'&&message.brokerGeneration===2));
 }finally{await s.runtime.dispose();}
});
test('policy mode survives lock and actual captured scopes retain ignored-operation capacity',async()=>{
 const broker=makeBroker({coverage:'direct',mode:'ordinary'}).broker,s=await setup({broker,brokeredChannels:['relay']});assert.equal(typeof s.runtime.selectTransportMode,'function','missing narrow runtime selection');let release;const held=new Promise(resolve=>release=resolve),runs=[];try{
 for(let index=0;index<MAX_UNSETTLED_TRANSPORT_OPERATIONS;index++){const permit=broker.authorize({channel:'relay',endpointId:'relay-a',method:'read'});assert.equal(typeof permit,'object');const scope=broker.capture(permit);assert.equal(typeof scope,'object');runs.push(scope.run(()=>held));}
 good(await s.runtime.selectTransportMode({mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false}));assert.ok((await Promise.all(runs)).every(result=>!result.ok&&result.error==='CANCELLED'));
 await s.runtime.lock();assert.equal(broker.mode,'strict');const selected=good(await s.runtime.getTransportSelection());assert.equal(selected.mode,'strict');
 good(await s.runtime.selectTransportMode({mode:'ordinary',expectedBrokerGeneration:selected.brokerGeneration,ordinaryConsent:true}));const permit=broker.authorize({channel:'relay',endpointId:'relay-a',method:'read'}),scope=broker.capture(permit);assert.deepEqual(await scope.run(async()=>1),{ok:false,error:'LIMIT_EXCEEDED'});scope.dispose();
 release();await tick();const next=broker.capture(broker.authorize({channel:'relay',endpointId:'relay-a',method:'read'}));assert.deepEqual(await next.run(async()=>1),{ok:true,value:1});next.dispose();
 }finally{release();await s.runtime.dispose();}
});
test('reentrant selection from the synchronous native invalidation hook is BUSY',async()=>{
 const broker=new SessionTransportPolicy(),messages=[],privateServices=services();let endpoint,hookCalls=0;
 endpoint=createVaultWorkerEndpoint(message=>messages.push(message),{createServices:()=>({...privateServices,transportPolicy:{broker,brokeredChannels:[],onSelectionChanged(){hookCalls++;void endpoint.dispatch(command('selectTransportMode',3,0,{mode:'ordinary',expectedBrokerGeneration:1,ordinaryConsent:true}));}}})});
 try{await endpoint.dispatch(command('init',1,0,{config}));await endpoint.dispatch(command('selectTransportMode',2,0,{mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false}));const original=messages.find(message=>message.kind==='response'&&message.requestId===2),nested=messages.find(message=>message.kind==='response'&&message.requestId===3);assert.ok(original&&nested,'both narrow requests returned fixed results');good(original.result);bad(nested.result,'BUSY');assert.equal(hookCalls,1);assert.equal(broker.mode,'strict');}finally{endpoint.dispose();}
});
test('AppServices exposes scalar commands without exposing the private broker',async()=>{
 const privateServices=services(),broker=new SessionTransportPolicy(),port=new Port();port.endpoint=createVaultWorkerEndpoint(message=>port.reply(message),{createServices:()=>({...privateServices,transportPolicy:{broker,brokeredChannels:[]}})});const descriptor=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});let app;try{app=good(await startAppServices({createWorker:()=>port,lifecycle:false}));assert.equal(typeof app.getTransportSelection,'function','missing AppServices selection');assert.equal('broker'in app,false);good(await app.getTransportSelection());good(await app.selectTransportMode({mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false}));assert.equal(broker.mode,'strict');}finally{await app?.dispose();port.endpoint.dispose();if(descriptor)Object.defineProperty(globalThis,'isSecureContext',descriptor);else delete globalThis.isSecureContext;}
});
test('the private journey vault bridge forwards the same actual broker capability',async()=>{
 const privateServices=services(),broker=new SessionTransportPolicy(),bridge=createJourneyVaultComposition({...privateServices,transportPolicy:{broker,brokeredChannels:['relay']}});
 try{good((await bridge.request({operation:'init',config})).result);const selected=good((await bridge.request({operation:'getTransportSelection'})).result);assert.deepEqual(selected.brokeredChannels,['relay']);good((await bridge.request({operation:'selectTransportMode',mode:'strict',expectedBrokerGeneration:selected.brokerGeneration,ordinaryConsent:false})).result);assert.equal(broker.mode,'strict');}finally{bridge.dispose();broker.dispose();}
});
test('a policy request cannot initialize an unopened private journey or call its native providers',async()=>{
 const privateServices=services(),broker=new SessionTransportPolicy();let nativeCalls=0;
 const journey=createPrivateTradeJourney({services:{...privateServices,transportPolicy:{broker,brokeredChannels:['relay']}},native:{walletProvider(){nativeCalls++;throw Error('NO_NATIVE_AUTHORITY');}},registryBytes:new Uint8Array([0]),registryDigest:'0'.repeat(64),request(){nativeCalls++;throw Error('NO_NATIVE_AUTHORITY');},createRelay(){nativeCalls++;throw Error('NO_NATIVE_AUTHORITY');}});
 try{await assert.rejects(journey.runtime({operation:'getTransportSelection'}),/^Error: LOCKED$/);assert.equal(nativeCalls,0);assert.equal(broker.generation,0);assert.equal(journey.snapshot().tradingEnabled,false);}finally{journey.dispose();broker.dispose();}
});
