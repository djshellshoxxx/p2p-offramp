import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeCommand } from '../../../packages/schemas/index.ts';
// Static expectation (UNEXECUTED): module is absent at base, so the missing-entry oracle fails before implementation.
const HELPER_URL=new URL('../src/runtime/pending-metadata.ts',import.meta.url).href;
const helper=await import('../src/runtime/pending-metadata.ts').catch(error=>{
 if(error?.code==='ERR_MODULE_NOT_FOUND'&&error.url===HELPER_URL)return{};
 throw error;
});
const capture=command=>{assert.equal(typeof helper.capturePendingMetadata,'function','missing capturePendingMetadata');return helper.capturePendingMetadata(command);};
const PROFILE='a'.repeat(32);
const SECRET='SECRET runtime page passphrase';
const SOURCE='SECRET source page passphrase';
const DEST='SECRET destination page passphrase';
const config={version:1,ReleaseEnabled:0,connectOrigins:[]};
const build=(operation,fields={})=>parseRuntimeCommand({version:1,requestId:7,generation:3,operation,...fields});
const valid=()=>({
 init:build('init',{config}),
 unlock:build('unlock',{profileId:PROFILE,passphrase:SECRET}),
 create:build('create',{passphrase:SECRET}),
 restore:build('restore',{bytes:new Uint8Array(4096).fill(7),sourcePassphrase:SOURCE,destinationPassphrase:DEST}),
 exportEncrypted:build('exportEncrypted',{profileId:PROFILE}),
 status:build('status'),listProfiles:build('listProfiles'),lock:build('lock'),dispose:build('dispose'),activity:build('activity'),
});
test('capturePendingMetadata returns exactly operation/generation(/profileId) for every current operation',()=>{
 for(const [operation,command] of Object.entries(valid())){
  const meta=capture(command);
  const withProfile=operation==='unlock'||operation==='exportEncrypted';
  assert.deepEqual(Reflect.ownKeys(meta),withProfile?['operation','generation','profileId']:['operation','generation'],operation);
  assert.equal(meta.operation,operation);assert.equal(meta.generation,3);
  if(withProfile)assert.equal(meta.profileId,PROFILE);else assert.equal('profileId' in meta,false);
  assert.equal(Object.isFrozen(meta),true,operation);
  for(const key of Reflect.ownKeys(meta))assert.equal(Object.getOwnPropertyDescriptor(meta,key).enumerable,true);
  assert.notEqual(capture(command),meta,'fresh record per projection');
 }
});
test('metadata never holds secret values, buffers, config or full command; inputs unchanged',()=>{
 const all=valid();
 for(const [operation,command] of Object.entries(all)){
  const snapshot=operation==='restore'?new Uint8Array(command.bytes):undefined;
  const meta=capture(command);
  assert.notEqual(meta,command);
  for(const key of Reflect.ownKeys(meta)){
   const value=meta[key];
   assert.equal(typeof value==='string'||typeof value==='number',true,`${operation}.${String(key)} primitive`);
   assert.notEqual(value,SECRET);assert.notEqual(value,SOURCE);assert.notEqual(value,DEST);
   assert.equal(['passphrase','sourcePassphrase','destinationPassphrase','bytes','config','requestId','version'].includes(key),false);
  }
  assert.equal(Object.values(meta).some(v=>typeof v==='object'),false);
  if(snapshot){assert.deepEqual(command.bytes,snapshot);assert.equal(command.bytes.length,4096);}
 }
 assert.equal(all.unlock.passphrase,SECRET);assert.equal(all.restore.sourcePassphrase,SOURCE);assert.equal(all.restore.destinationPassphrase,DEST);
});
// Integration with the real AppRuntime through the existing public contract only. Fixed synthetic inputs.
let oldSecure;
beforeEach(()=>{oldSecure=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});});
afterEach(()=>{if(oldSecure)Object.defineProperty(globalThis,'isSecureContext',oldSecure);else delete globalThis.isSecureContext;});
const api=await import('../src/runtime/app-runtime.ts');
const clone=v=>structuredClone(v);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Port extends EventTarget{
 sent=[];terminated=0;handler;
 postMessage(value){const command=clone(value);this.sent.push(command);queueMicrotask(()=>this.handler?.(command));}
 reply(value){const data=clone(value);queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data})));}
 terminate(){this.terminated++;}
}
const response=(command,value={state:'locked',handle:null})=>({...command,kind:'response',result:{ok:true,value}});
const stripped=command=>{const {config:c,profileId:p,passphrase:s,bytes:b,sourcePassphrase:a,destinationPassphrase:d,...base}=command;return base;};
const startRuntime=async port=>{
 port.handler=command=>port.reply(response(stripped(command)));
 const started=await api.AppRuntime.start(config,{createWorker:()=>port,lifecycle:false});
 assert.equal(started.ok,true);return started.value;
};
test('held fake-Port unlock posts the full command once, stays BUSY, and a late old-generation reply never publishes',async()=>{
 const port=new Port();const runtime=await startRuntime(port);let held;
 port.handler=command=>{if(command.operation==='unlock'){held=command;return;}port.reply(response(stripped(command)));};
 const controller=new AbortController();
 const pending=runtime.unlock(PROFILE,SECRET,controller.signal);await flush();
 const unlocks=port.sent.filter(c=>c.operation==='unlock');
 assert.equal(unlocks.length,1);assert.equal(unlocks[0].profileId,PROFILE);assert.equal(unlocks[0].passphrase,SECRET);
 const busy=await runtime.status();assert.equal(busy.ok,false);assert.equal(busy.error.code,'BUSY');
 controller.abort();assert.equal(runtime.current.state,'locked');
 const result=await pending;assert.equal(result.ok,false);assert.equal(result.error.code,'CANCELLED');
 port.reply(response(stripped(held),{state:'unlocked',handle:{id:'A'.repeat(43),generation:held.generation,purpose:'vault',profileId:PROFILE}}));
 await flush();assert.equal(runtime.current.state,'locked');
 await runtime.dispose();
});
test('wrong-profile unlock reply is still a protocol failure after the metadata change',async()=>{
 const port=new Port();const runtime=await startRuntime(port);
 port.handler=command=>port.reply(response(stripped(command),command.operation==='unlock'?{state:'unlocked',handle:{id:'A'.repeat(43),generation:command.generation,purpose:'vault',profileId:'b'.repeat(32)}}:{state:'locked',handle:null}));
 const result=await runtime.unlock(PROFILE,SECRET);
 assert.equal(result.ok,false);assert.equal(result.error.code,'PROTOCOL_ERROR');assert.equal(runtime.current.state,'locked');assert.equal(port.terminated,1);
 await runtime.dispose();
});
test('wrong operation in a reply is rejected as protocol error after the metadata change',async()=>{
 const port=new Port();const runtime=await startRuntime(port);
 port.handler=command=>port.reply({...response(stripped(command)),operation:'status'});
 const result=await runtime.create('fresh runtime page passphrase');
 assert.equal(result.ok,false);assert.equal(result.error.code,'PROTOCOL_ERROR');assert.equal(port.terminated,1);
 await runtime.dispose();
});
