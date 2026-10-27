import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
const api=await import('../src/runtime/app-runtime.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const config={version:1,ReleaseEnabled:0,connectOrigins:[]};const pass='local runtime page passphrase';const clone=v=>structuredClone(v);
const val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const err=(result,code)=>{assert.equal(result.ok,false,'expected fixed runtime failure');assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result.error),/SECRET|https:\/\//);};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let oldSecure;
beforeEach(()=>{oldSecure=Object.getOwnPropertyDescriptor(globalThis,'isSecureContext');Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});});
afterEach(()=>{if(oldSecure)Object.defineProperty(globalThis,'isSecureContext',oldSecure);else delete globalThis.isSecureContext;});
class Port extends EventTarget{
 sent=[];received=[];terminated=0;handler;
 postMessage(value){const command=clone(value);this.sent.push(command);queueMicrotask(()=>this.handler?.(command));}
 reply(value){const data=clone(value);this.received.push(data);queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data})));}
 terminate(){this.terminated++;this.cleanup?.();}
}
const response=(command,value={state:'locked',handle:null})=>({...command,kind:'response',result:{ok:true,value}});
function simplePort(){const port=new Port();port.handler=command=>{const {config:ignored,...base}=command;port.reply(response(base));};return port;}
async function start(port,options={}){assert.equal(typeof api.AppRuntime?.start,'function','missing AppRuntime');return api.AppRuntime.start(config,{...options,createWorker:()=>port,lifecycle:false});}
async function setup(options={}){
 const rows=new Map(),listeners=new Set();let writes=0;
 const store={listProfileIds:async()=>Object.freeze({profileIds:Object.freeze([...rows.keys()]),truncated:false}),get:async id=>clone(rows.get(id)),add:async(e,o)=>{o?.assertCurrent?.();rows.set(e.profileId,clone(e));writes++;},compareAndSwap:async()=>{throw Error('runtime cannot write');},subscribeInvalidation:l=>{listeners.add(l);return()=>listeners.delete(l);}};
 const creator=new EncryptedVaultService(store,crypto,{lifecycle:false});const session=val(await creator.create(pass));creator.dispose();
 const vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store),port=new Port();
 const endpoint=createVaultWorkerEndpoint(message=>port.reply(message),{...options,createServices:()=>({vault,backup})});port.handler=command=>{void endpoint.dispatch(command);};port.cleanup=()=>endpoint.dispose();
 const runtime=val(await start(port,options));return{runtime,port,session,writes:()=>writes,vault,rows};
}
test('runtime validates config before Worker construction and refuses unsupported secure context',async()=>{
 assert.equal(typeof api.AppRuntime?.start,'function','missing AppRuntime');let calls=0;
 for(const input of [{...config,ReleaseEnabled:1},{...config,connectOrigins:['https://SECRET.invalid']},{...config,key:'SECRET'}])err(await api.AppRuntime.start(input,{createWorker:()=>{calls++;return simplePort();},lifecycle:false}),'INVALID_INPUT');
 assert.equal(calls,0);Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:false});err(await api.AppRuntime.start(config,{createWorker:()=>{calls++;return simplePort();},lifecycle:false}),'UNSUPPORTED_ENVIRONMENT');assert.equal(calls,0);
});
test('runtime boots locked and returns only purpose-bound opaque handles and labelled encrypted export',async()=>{
 const s=await setup();assert.deepEqual(s.runtime.current,{state:'locked',handle:null});
 for(const forbidden of ['read','list','commit','sign','fetch','activity','records','passphrase'])assert.equal(forbidden in s.runtime,false);
 const handle=val(await s.runtime.unlock(s.session.profileId,pass));assert.equal(handle.purpose,'vault');assert.equal(s.runtime.isCurrent(handle),true);assert.equal(s.runtime.isCurrent({...handle}),false);assert.equal('sessionId'in handle,false);
 assert.equal(val(await s.runtime.status()).handle,handle);assert.equal(s.runtime.isCurrent(handle),true);
 const exported=val(await s.runtime.exportEncrypted(s.session.profileId));assert.equal(exported.authentication,'not-checked');assert.ok(exported.bytes instanceof Uint8Array);assert.equal(s.writes(),1);assert.doesNotMatch(JSON.stringify(s.port.received),/passphrase|secretKey|sessionId|private-records/);
 const locking=s.runtime.lock();assert.equal(s.runtime.isCurrent(handle),false);assert.equal(s.runtime.current.state,'locked');val(await locking);
 await s.runtime.dispose();await s.runtime.dispose();assert.equal(s.port.terminated,1);err(await s.runtime.status(),'LOCKED');
});
test('runtime abort synchronously invalidates pending output and ignores a late old-generation unlock',async()=>{
 const port=simplePort();let held;port.handler=command=>{if(command.operation==='unlock'){held=command;return;}const {config:ignored,...base}=command;port.reply(response(base));};
 const runtime=val(await start(port));const controller=new AbortController();const pending=runtime.unlock('a'.repeat(32),pass,controller.signal);await flush();controller.abort();assert.equal(runtime.current.state,'locked');err(await pending,'CANCELLED');
 const {profileId,passphrase:ignored,...base}=held;port.reply(response(base,{state:'unlocked',handle:{id:'A'.repeat(43),generation:0,purpose:'vault',profileId}}));await flush();assert.equal(runtime.current.state,'locked');assert.ok(port.sent.some(command=>command.operation==='lock'&&command.generation===1));await runtime.dispose();
});
test('runtime rechecks authority after reply settlement before an async public method publishes its result',async()=>{
 const s=await setup();let locking;
 const revoke=event=>{if(event.data.operation==='unlock'&&event.data.result?.ok)locking=s.runtime.lock();};s.port.addEventListener('message',revoke);
 try{err(await s.runtime.unlock(s.session.profileId,pass),'LOCKED');assert.equal(s.runtime.current.state,'locked');await locking;}
 finally{s.port.removeEventListener('message',revoke);await s.runtime.dispose();}
});
test('a replacement unlock before async publication invalidates prior unlock and status even within one generation',async()=>{
 for(const operation of ['unlock','status']){
  const s=await setup();let replacement;
  try{
   if(operation==='status')val(await s.runtime.unlock(s.session.profileId,pass));
   const replace=event=>{if(event.data.operation===operation&&event.data.result?.ok){s.port.removeEventListener('message',replace);replacement=s.runtime.unlock(s.session.profileId,pass);}};
   s.port.addEventListener('message',replace);
   const pending=operation==='unlock'?s.runtime.unlock(s.session.profileId,pass):s.runtime.status();
   err(await pending,'LOCKED');val(await replacement);
  }finally{await s.runtime.dispose();}
 }
});
test('runtime independently binds encrypted backup profile to the export request',async()=>{
 const s=await setup();let exported;
 try{exported=val(await s.runtime.exportEncrypted(s.session.profileId));}finally{await s.runtime.dispose();}
 const port=simplePort(),runtime=val(await start(port));port.handler=command=>{const {profileId:ignored,...base}=command;port.reply(response(base,exported));};
 try{err(await runtime.exportEncrypted('b'.repeat(32)),'PROTOCOL_ERROR');assert.equal(port.terminated,1);}finally{await runtime.dispose();}
});
test('runtime rejects wrong-profile or malformed Worker output without publishing a handle or raw diagnostics',async()=>{
 const port=simplePort();const runtime=val(await start(port));port.handler=command=>{const {profileId,passphrase:ignored,...base}=command;port.reply(response(base,{state:'unlocked',handle:{id:'A'.repeat(43),generation:command.generation,purpose:'vault',profileId:'b'.repeat(32)}}));};
 err(await runtime.unlock('a'.repeat(32),pass),'PROTOCOL_ERROR');assert.equal(runtime.current.state,'locked');assert.equal(port.terminated,1);await runtime.dispose();
});
test('runtime prevalidates passphrase and cancellation before sending secret input; concurrent requests are bounded',async()=>{
 const port=simplePort(),runtime=val(await start(port));const before=port.sent.length;err(await runtime.unlock('a'.repeat(32),'short'),'INVALID_INPUT');
 const controller=new AbortController();controller.abort();err(await runtime.unlock('a'.repeat(32),pass,controller.signal),'CANCELLED');assert.equal(port.sent.length,before);
 port.handler=()=>{};const pending=runtime.status();err(await runtime.status(),'BUSY');const disposing=runtime.dispose();err(await pending,'LOCKED');await disposing;assert.equal(port.terminated,1);
});
test('runtime request timeout terminally closes owned Worker and ignores output after disposal',async t=>{
 const port=simplePort(),runtime=val(await start(port));t.mock.timers.enable({apis:['setTimeout']});
 try{port.handler=()=>{};const pending=runtime.status();t.mock.timers.tick(30000);err(await pending,'TIMEOUT');assert.equal(port.terminated,1);assert.equal(runtime.current.state,'locked');await runtime.dispose();}
 finally{t.mock.timers.reset();}
});
test('Node document lifecycle: synthetic events and polling never extend idle, while trusted handler and pagehide revoke correctly',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget();globalThis.document=new EventTarget();let clock=0;let s;
 try{
  s=await setup({now:()=>clock});await s.runtime.dispose();const endpoint=createVaultWorkerEndpoint(message=>s.port.reply(message),{now:()=>clock,createServices:()=>({vault:new EncryptedVaultService(undefined,crypto,{lifecycle:false}),backup:new EncryptedBackupService()})});endpoint.dispose();
  // Use a real authenticated Worker endpoint with an independently owned document runtime.
  const rows=new Map(),listeners=new Set();const store={get:async id=>clone(rows.get(id)),add:async(e,o)=>{o?.assertCurrent?.();rows.set(e.profileId,clone(e));},compareAndSwap:async()=>{throw Error('no writes');},subscribeInvalidation:l=>{listeners.add(l);return()=>listeners.delete(l);}};
  const creator=new EncryptedVaultService(store,crypto,{lifecycle:false}),session=val(await creator.create(pass));creator.dispose();const port=new Port();const worker=createVaultWorkerEndpoint(message=>port.reply(message),{now:()=>clock,createServices:()=>({vault:new EncryptedVaultService(store,crypto,{lifecycle:false}),backup:new EncryptedBackupService(store)})});port.handler=command=>{void worker.dispatch(command);};port.cleanup=()=>worker.dispose();
  const runtime=val(await api.AppRuntime.start(config,{createWorker:()=>port,now:()=>clock}));try{
   let handle=val(await runtime.unlock(session.profileId,pass));clock=299999;globalThis.document.dispatchEvent(new Event('pointerdown'));val(await runtime.status());clock=300000;assert.equal(runtime.isCurrent(handle),false);await flush();assert.equal(runtime.current.state,'locked');
   handle=val(await runtime.unlock(session.profileId,pass));clock=599999;const event=new Event('keydown');Object.defineProperty(event,'isTrusted',{value:true});globalThis.document.dispatchEvent(event);await flush();clock=600000;assert.equal(runtime.isCurrent(handle),true);assert.ok(port.sent.some(command=>command.operation==='activity'));
   globalThis.window.dispatchEvent(new Event('pagehide'));assert.equal(runtime.isCurrent(handle),false);await flush();assert.equal(runtime.current.state,'locked');
  }finally{await runtime.dispose();}
 }finally{await s?.runtime.dispose();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});

test('runtime create opens a fresh profile, inventory lists opaque IDs, and restore yields a separate locked profile',async()=>{
 const s=await setup();
 assert.deepEqual([...val(await s.runtime.listProfiles()).profileIds],[s.session.profileId]);
 const handle=val(await s.runtime.create('fresh runtime page passphrase'));assert.equal(s.runtime.isCurrent(handle),true);assert.notEqual(handle.profileId,s.session.profileId);
 const listed=val(await s.runtime.listProfiles());assert.deepEqual([...listed.profileIds].sort(),[s.session.profileId,handle.profileId].sort());assert.equal(listed.truncated,false);
 const exported=val(await s.runtime.exportEncrypted(s.session.profileId));
 const receipt=val(await s.runtime.restore(exported.bytes,pass,'restored runtime page passphrase'));
 assert.equal(receipt.records,0);assert.equal(s.rows.has(receipt.newProfileId),true);assert.notEqual(receipt.newProfileId,s.session.profileId);
 assert.equal(s.runtime.isCurrent(handle),true,'restore does not replace or unlock the current session');
 err(await s.runtime.restore(exported.bytes,'wrong runtime page passphrase','restored runtime page passphrase'),'AUTHENTICATION_FAILED');
 const tampered=new Uint8Array(exported.bytes);tampered[tampered.length-3]^=1;
 const bad=await s.runtime.restore(tampered,pass,'restored runtime page passphrase');assert.equal(bad.ok,false);assert.match(bad.error.code,/^(INVALID_INPUT|UNSUPPORTED_VERSION)$/);
 err(await s.runtime.restore(new Uint8Array(0),pass,'short'),'INVALID_INPUT');err(await s.runtime.create('short'),'INVALID_INPUT');
 assert.equal(s.rows.size,3,'failed restores and invalid creates leave no rows');
 assert.doesNotMatch(JSON.stringify(s.port.received),/passphrase|secretKey|sessionId|private-records/);
 await s.runtime.dispose();
});
test('runtime create failure leaves the runtime locked and rejects a create reply bound to another operation',async()=>{
 const port=simplePort();let mode='limit';port.handler=command=>{const {config:ignored,passphrase:hidden,...base}=command;
  if(command.operation==='create'&&mode==='limit'){port.reply({...base,kind:'response',result:{ok:false,error:{code:'LIMIT_EXCEEDED',messageKey:'runtime.error.limit_exceeded'}}});return;}
  if(command.operation==='create'){port.reply(response(base,{state:'locked',handle:null}));return;}
  port.reply(response(base));};
 const runtime=val(await start(port));err(await runtime.create('fresh runtime page passphrase'),'LIMIT_EXCEEDED');assert.equal(runtime.current.state,'locked');
 mode='locked';err(await runtime.create('fresh runtime page passphrase'),'PROTOCOL_ERROR');assert.equal(port.terminated,1);
});
test('quota survives Worker → strict reply → runtime → facade-visible result and maps to the fixed UI remediation',async()=>{
 const {startAppServices}=await import('../src/app-services.ts');const {errorMessage}=await import('../src/ui/routes.ts');const {messages}=await import('../src/ui/messages.ts');
 const {BackupError}=await import('../../../packages/storage/index.ts');
 const port=new Port();const endpoint=createVaultWorkerEndpoint(message=>port.reply(message),{createServices:()=>({
  vault:{create:async()=>({ok:false,error:{code:'QUOTA_EXCEEDED',retryable:true,message:'SECRET'}}),listProfiles:async()=>({ok:true,value:{profileIds:[],truncated:false}}),
   captureSession:()=>{throw Error('unused');},unlock:async()=>{throw Error('unused');},lock:()=>{},lockAll:()=>{},dispose:()=>{}},
  backup:{exportWithStatus:async()=>{throw Error('unused');},restore:async()=>{throw new BackupError('QUOTA_EXCEEDED');},dispose:()=>{}}})});
 port.handler=command=>{void endpoint.dispatch(command);};port.cleanup=()=>endpoint.dispose();
 const services=val(await startAppServices({createWorker:()=>port,lifecycle:false}));
 const restored=await services.restore(new Uint8Array([1,2,3]),pass,'quota restore passphrase');err(restored,'QUOTA_EXCEEDED');
 const created=await services.create('quota create passphrase');err(created,'QUOTA_EXCEEDED');assert.deepEqual(services.current,{state:'locked'});
 assert.equal(errorMessage(restored.error.code),messages.errors.QUOTA_EXCEEDED);assert.notEqual(errorMessage(restored.error.code),messages.errors.STORAGE_UNAVAILABLE);
 assert.doesNotMatch(JSON.stringify(port.received),/SECRET/);val(await services.listProfiles());await services.dispose();
});
