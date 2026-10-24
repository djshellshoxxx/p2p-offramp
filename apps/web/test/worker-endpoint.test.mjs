import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
const api=await import('../src/runtime/worker-endpoint.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const config={version:1,ReleaseEnabled:0,connectOrigins:[]};
const pass='local runtime fixture passphrase';const clone=v=>structuredClone(v);
class Store{
 rows=new Map();listeners=new Set();writes=0;
 async get(id){return clone(this.rows.get(id));}
 async add(row,options){options?.assertCurrent?.();this.rows.set(row.profileId,clone(row));this.writes++;}
 async compareAndSwap(){throw Error('runtime must not write');}
 subscribeInvalidation(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
}
function endpoint(options={}){assert.equal(typeof api.createVaultWorkerEndpoint,'function','missing Worker endpoint');const messages=[];const service=api.createVaultWorkerEndpoint(message=>messages.push(clone(message)),options);let sequence=0;return{service,messages,send:(operation,extra={},generation=0)=>service.dispatch({version:1,requestId:++sequence,generation,operation,...extra})};}
async function setup(options={}){const store=new Store(),creator=new EncryptedVaultService(store,crypto,{lifecycle:false});const session=val(await creator.create(pass));creator.dispose();const workerVault=new EncryptedVaultService(store,crypto,{lifecycle:false});const backup=new EncryptedBackupService(store);const e=endpoint({...options,createServices:()=>({vault:workerVault,backup})});await e.send('init',{config});return{...e,store,session,workerVault,backup};}
test('Worker validates strict offline init before constructing private services and closes invalid protocol without echo',async()=>{
 let calls=0;const e=endpoint({createServices:()=>{calls++;throw Error('SECRET https://private.invalid');}});
 await e.send('init',{config:{...config,ReleaseEnabled:1}});assert.equal(calls,0);assert.deepEqual(e.messages,[{version:1,kind:'closed',generation:0,code:'PROTOCOL_ERROR'}]);
 await e.send('init',{config});assert.equal(calls,0);e.service.dispose();
});
test('default Worker startup refuses missing secure IndexedDB/WebCrypto capability without plaintext fallback',async()=>{
 const e=endpoint();try{await e.send('init',{config});assert.equal(e.messages.at(-1).kind,'closed');assert.equal(e.messages.at(-1).code,'UNSUPPORTED_ENVIRONMENT');}finally{e.service.dispose();}
});
test('Worker starts locked, unlocks only known encrypted profile, and exposes opaque status plus labelled ciphertext',async()=>{
 const s=await setup();assert.deepEqual(s.messages[0].result.value,{state:'locked',handle:null});
 await s.send('unlock',{profileId:s.session.profileId,passphrase:pass});const unlocked=s.messages.at(-1).result.value;assert.equal(unlocked.state,'unlocked');assert.equal(unlocked.handle.purpose,'vault');assert.equal(unlocked.handle.profileId,s.session.profileId);assert.equal('sessionId'in unlocked.handle,false);
 await s.send('status');assert.deepEqual(s.messages.at(-1).result.value,unlocked);
 await s.send('exportEncrypted',{profileId:s.session.profileId});const exported=s.messages.at(-1).result.value;assert.equal(exported.authentication,'not-checked');assert.ok(exported.bytes instanceof Uint8Array);assert.doesNotMatch(JSON.stringify(s.messages),/passphrase|secretKey|sessionId|private-records/);assert.equal(s.store.writes,1);
 await s.send('lock',{},1);assert.deepEqual(s.messages.at(-1).result.value,{state:'locked',handle:null});
 await s.send('exportEncrypted',{profileId:s.session.profileId},1);assert.equal(s.messages.at(-1).result.value.authentication,'not-checked');assert.equal(s.store.writes,1);s.service.dispose();
});
test('Worker lock suppresses late uncancellable unlock and bounds replacement jobs until old crypto settles',async()=>{
 const gate=deferred(),entered=deferred();let locked=0,disposed=0,calls=0;const session={sessionId:'A'.repeat(43),profileId:'a'.repeat(32),revision:0};
 const e=endpoint({createServices:()=>({vault:{unlock:async()=>{calls++;entered.resolve();await gate.promise;return{ok:true,value:session};},captureSession:()=>{throw Error('stale unlock must not attach');},lock:()=>{locked++;},lockAll:()=>{locked++;},dispose:()=>{disposed++;}},backup:{exportWithStatus:async()=>{throw Error('unused');},dispose:()=>{disposed++;}}})});
 await e.send('init',{config});const old=e.send('unlock',{profileId:session.profileId,passphrase:pass});await entered.promise;
 await e.send('lock',{},1);await e.send('unlock',{profileId:session.profileId,passphrase:pass},1);assert.equal(e.messages.at(-1).result.error.code,'BUSY');assert.equal(calls,1);
 gate.resolve();await old;assert.equal(e.messages.filter(m=>m.operation==='unlock'&&m.result.ok).length,0);assert.ok(locked>=2);e.service.dispose();assert.equal(disposed,2);
});
test('Worker native errors and wrong passphrase use fixed diagnostics; no unsupported command reaches storage',async()=>{
 const s=await setup();await s.send('unlock',{profileId:s.session.profileId,passphrase:'wrong local passphrase'});assert.equal(s.messages.at(-1).result.error.code,'AUTHENTICATION_FAILED');
 await s.send('unlock',{profileId:'b'.repeat(32),passphrase:pass});assert.equal(s.messages.at(-1).result.error.code,'NOT_FOUND');
 await s.send('commit',{mutations:[]});assert.equal(s.messages.at(-1).kind,'closed');assert.equal(s.messages.at(-1).code,'PROTOCOL_ERROR');assert.equal(s.store.writes,1);s.service.dispose();
});
test('Worker replay, future generation and invalid init never revive or expose a session',async()=>{
 const s=await setup();await s.send('unlock',{profileId:s.session.profileId,passphrase:pass});const before=s.messages.length;
 await s.service.dispatch({version:1,requestId:2,generation:0,operation:'status'});assert.equal(s.messages.at(-1).kind,'closed');assert.equal(s.messages.length,before+1);
 await s.send('status');assert.equal(s.messages.length,before+1);s.service.dispose();
 const next=await setup();await next.send('status',{},1);assert.equal(next.messages.at(-1).kind,'closed');next.service.dispose();
});
test('Worker authenticated vault revocation emits only a fixed lock event and disposal is terminal/idempotent',async()=>{
 const s=await setup();await s.send('unlock',{profileId:s.session.profileId,passphrase:pass});s.workerVault.lockAll();assert.deepEqual(s.messages.at(-1),{version:1,kind:'locked',generation:0});
 await s.send('status');assert.deepEqual(s.messages.at(-1).result.value,{state:'locked',handle:null});
 await s.send('dispose',{},1);const count=s.messages.length;assert.deepEqual(s.messages.at(-1).result.value,{state:'locked',handle:null});await s.send('status',{},1);assert.equal(s.messages.length,count);s.service.dispose();s.service.dispose();
});
test('Worker owns monotonic idle deadline even when main timer stalls; late queued activity cannot revive expiry',async()=>{
 let clock=0;const s=await setup({now:()=>clock});await s.send('unlock',{profileId:s.session.profileId,passphrase:pass});
 clock=299999;await s.send('activity');assert.equal(s.messages.at(-1).result.value.state,'unlocked');
 clock=300000;await s.send('status');assert.equal(s.messages.at(-1).result.value.state,'unlocked');
 clock=599999;await s.send('activity');assert.equal(s.messages.at(-1).result.value.state,'locked');assert.ok(s.messages.some(m=>m.kind==='locked'));s.service.dispose();
});
test('Worker polling does not extend idle deadline and backward/unknown elapsed time fails closed',async()=>{
 let clock=100;const s=await setup({now:()=>clock});await s.send('unlock',{profileId:s.session.profileId,passphrase:pass});
 clock=300099;await s.send('status');assert.equal(s.messages.at(-1).result.value.state,'unlocked');clock=300100;await s.send('status');assert.equal(s.messages.at(-1).result.value.state,'locked');s.service.dispose();
 let otherClock=100;const other=await setup({now:()=>otherClock});await other.send('unlock',{profileId:other.session.profileId,passphrase:pass});otherClock=99;await other.send('status');assert.equal(other.messages.at(-1).kind,'closed');assert.equal(other.messages.at(-1).code,'UNSUPPORTED_ENVIRONMENT');other.service.dispose();
});
test('Worker clock failure revokes keys and closes instead of keeping an unreadable expiry deadline',async()=>{
 let broken=false;const s=await setup({now:()=>{if(broken)throw Error('SECRET clock');return 100;}});
 try{await s.send('unlock',{profileId:s.session.profileId,passphrase:pass});broken=true;await s.send('status');assert.equal(s.messages.at(-1).kind,'closed');assert.equal(s.messages.at(-1).code,'UNSUPPORTED_ENVIRONMENT');}
 finally{s.service.dispose();}
});
