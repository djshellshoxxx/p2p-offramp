import test, { afterEach } from 'node:test';
const liveEndpoints = new Set();
afterEach(() => { for (const service of liveEndpoints) service.dispose(); liveEndpoints.clear(); });
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
 async listProfileIds(){return Object.freeze({profileIds:Object.freeze([...this.rows.keys()]),truncated:false});}
 async add(row,options){options?.assertCurrent?.();this.rows.set(row.profileId,clone(row));this.writes++;}
 async compareAndSwap(){throw Error('runtime must not write');}
 subscribeInvalidation(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
}
function endpoint(options={}){assert.equal(typeof api.createVaultWorkerEndpoint,'function','missing Worker endpoint');const messages=[];const service=api.createVaultWorkerEndpoint(message=>messages.push(clone(message)),options);liveEndpoints.add(service);let sequence=0;return{service,messages,send:(operation,extra={},generation=0)=>service.dispatch({version:1,requestId:++sequence,generation,operation,...extra})};}
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

test('Worker create opens only a fresh profile, inventory lists opaque IDs and restore stays locked with a public receipt',async()=>{
 const s=await setup();await s.send('listProfiles');assert.deepEqual(s.messages.at(-1).result.value,{profileIds:[s.session.profileId],truncated:false});
 await s.send('create',{passphrase:'fresh worker passphrase'});const created=s.messages.at(-1).result.value;
 assert.equal(created.state,'unlocked');assert.notEqual(created.handle.profileId,s.session.profileId);assert.equal(s.store.rows.has(created.handle.profileId),true);
 await s.send('exportEncrypted',{profileId:s.session.profileId});const bytes=s.messages.at(-1).result.value.bytes;
 await s.send('restore',{bytes,sourcePassphrase:pass,destinationPassphrase:'restored worker passphrase'});const receipt=s.messages.at(-1).result.value;
 assert.deepEqual(Object.keys(receipt).sort(),['newProfileId','records']);assert.equal(s.store.rows.has(receipt.newProfileId),true);
 await s.send('status');assert.deepEqual(s.messages.at(-1).result.value,created,'restore leaves the current selection untouched');
 const tampered=new Uint8Array(bytes);const text=new TextDecoder().decode(tampered);const at=text.indexOf('"checksum":"')+12;tampered[at]=tampered[at]===65?66:65;
 await s.send('restore',{bytes:tampered,sourcePassphrase:pass,destinationPassphrase:'restored worker passphrase'});assert.equal(s.messages.at(-1).result.error.code,'INVALID_INPUT');
 await s.send('restore',{bytes,sourcePassphrase:'wrong worker passphrase',destinationPassphrase:'restored worker passphrase'});assert.equal(s.messages.at(-1).result.error.code,'AUTHENTICATION_FAILED');
 assert.equal(s.store.rows.size,3);assert.doesNotMatch(JSON.stringify(s.messages.filter(m=>m.operation!=='exportEncrypted')),/passphrase|secretKey|sessionId|private-records|wrappedKey/);s.service.dispose();
});
test('Worker lock during create suppresses the stale session while the committed encrypted profile remains listable',async()=>{
 const gate=deferred(),entered=deferred();let captured=0;const session={sessionId:'A'.repeat(43),profileId:'c'.repeat(32),revision:0};const rows=[];
 const e=endpoint({createServices:()=>({vault:{create:async()=>{entered.resolve();await gate.promise;rows.push(session.profileId);return{ok:true,value:session};},
  listProfiles:async()=>({ok:true,value:{profileIds:[...rows],truncated:false}}),captureSession:()=>{captured++;throw Error('stale create must not attach');},
  unlock:async()=>{throw Error('unused');},lock:()=>{},lockAll:()=>{},dispose:()=>{}},backup:{exportWithStatus:async()=>{throw Error('unused');},restore:async()=>{throw Error('unused');},dispose:()=>{}}})});
 await e.send('init',{config});const pending=e.send('create',{passphrase:pass});await entered.promise;await e.send('lock',{},1);
 gate.resolve();await pending;assert.equal(captured,0);assert.equal(e.messages.filter(m=>m.operation==='create'&&m.result?.ok).length,0);
 await e.send('listProfiles',{},1);assert.deepEqual(e.messages.at(-1).result.value.profileIds,[session.profileId]);e.service.dispose();
});
test('Worker maps the profile bound to a fixed limit and keeps one job at a time',async()=>{
 const gate=deferred();const e=endpoint({createServices:()=>({vault:{create:async()=>({ok:false,error:{code:'LIMIT_EXCEEDED',retryable:false,message:'SECRET'}}),
  listProfiles:async()=>{await gate.promise;return{ok:true,value:{profileIds:[],truncated:false}};},captureSession:()=>{throw Error('unused');},unlock:async()=>{throw Error('unused');},lock:()=>{},lockAll:()=>{},dispose:()=>{}},
  backup:{exportWithStatus:async()=>{throw Error('unused');},restore:async()=>{throw Error('unused');},dispose:()=>{}}})});
 await e.send('init',{config});await e.send('create',{passphrase:pass});assert.equal(e.messages.at(-1).result.error.code,'LIMIT_EXCEEDED');
 const pending=e.send('listProfiles');await e.send('create',{passphrase:pass});assert.equal(e.messages.at(-1).result.error.code,'BUSY');gate.resolve();await pending;
 assert.doesNotMatch(JSON.stringify(e.messages),/SECRET/);e.service.dispose();
});
test('Worker reports storage quota as a typed QUOTA_EXCEEDED for create and restore, never a generic outage',async()=>{
 const {BackupError}=await import('../../../packages/storage/index.ts');
 const e=endpoint({createServices:()=>({vault:{create:async()=>({ok:false,error:{code:'QUOTA_EXCEEDED',retryable:true,message:'SECRET'}}),listProfiles:async()=>({ok:false,error:{code:'QUOTA_EXCEEDED',retryable:true,message:'SECRET'}}),
  captureSession:()=>{throw Error('unused');},unlock:async()=>{throw Error('unused');},lock:()=>{},lockAll:()=>{},dispose:()=>{}},
  backup:{exportWithStatus:async()=>{throw Error('unused');},restore:async()=>{throw new BackupError('QUOTA_EXCEEDED');},dispose:()=>{}}})});
 await e.send('init',{config});await e.send('create',{passphrase:pass});assert.equal(e.messages.at(-1).result.error.code,'QUOTA_EXCEEDED');
 assert.equal(e.messages.at(-1).result.error.messageKey,'runtime.error.quota_exceeded');
 await e.send('restore',{bytes:new Uint8Array([1]),sourcePassphrase:pass,destinationPassphrase:pass});assert.equal(e.messages.at(-1).result.error.code,'QUOTA_EXCEEDED');
 assert.doesNotMatch(JSON.stringify(e.messages),/SECRET/);e.service.dispose();
});

test('review storage is session-bound, bounded, idempotent and preserves foreign records', async()=>{
 const rows = new Map(); let revision=0, code, commits=0, live=true, randomId=1;
 const profileId='a'.repeat(32),success=value=>({ok:true,value});
 const fake={create:async()=>success({sessionId:'session',profileId,revision}),captureSession:()=>success({current:()=>live?{sessionId:'session',profileId,revision}:null,dispose(){}}),lockAll(){live=false;},dispose(){},assertFresh:async()=>success(revision),list:async()=>success([...rows.values()]),commit:async(_session,expected,mutations)=>{if(code)return{ok:false,error:{code}};assert.equal(expected,revision);for(const m of mutations)if(m.op==='put')rows.set(m.record.id,m.record);else rows.delete(m.id);commits++;return success(++revision);}};
 const s=endpoint({random:bytes=>bytes.fill(randomId++),createServices:()=>({vault:fake,backup:{dispose(){}}})});
 await s.send('init',{config});
 await s.send('listTermsReviews',{profileId});assert.equal(s.messages.at(-1).result.error.code,'LOCKED');
 fake.create=async()=>{live=true;return success({sessionId:'session',profileId,revision});};
 await s.send('create',{passphrase:pass});
 const bytes=new Uint8Array([1,2,3]);
 await s.send('saveTermsReview',{profileId,source:'file',bytes});assert.equal(s.messages.at(-1).result.ok,true);
 await s.send('saveTermsReview',{profileId,source:'file',bytes});assert.equal(commits,1);
 rows.set('f'.repeat(32),{id:'f'.repeat(32),kind:'trade',schemaVersion:1,payload:'e30'});
 randomId=255;await s.send('saveTermsReview',{profileId,source:'file',bytes:new Uint8Array([4])});assert.equal(s.messages.at(-1).result.error.code,'CONFLICT');randomId=3;
 code='QUOTA_EXCEEDED';await s.send('saveTermsReview',{profileId,source:'file',bytes:new Uint8Array([5])});assert.equal(s.messages.at(-1).result.error.code,code);code='CONFLICT';await s.send('saveTermsReview',{profileId,source:'file',bytes:new Uint8Array([5])});assert.equal(s.messages.at(-1).result.error.code,code);code=undefined;
 for(let i=2;i<=8;i++)await s.send('saveTermsReview',{profileId,source:'file',bytes:new Uint8Array([i])});
 await s.send('saveTermsReview',{profileId,source:'file',bytes:new Uint8Array([9])});assert.equal(s.messages.at(-1).result.error.code,'LIMIT_EXCEEDED');
 await s.send('listTermsReviews',{profileId});assert.equal(s.messages.at(-1).result.value.items.length,8);assert.equal(s.messages.at(-1).result.value.skipped,1);assert.equal(rows.size,9);
 rows.set('c'.repeat(32),{id:'c'.repeat(32),kind:'trade',schemaVersion:1,payload:Buffer.from(JSON.stringify({format:'p2p-offramp/saved-review/v1',bytes:''})).toString('base64url')});
 await s.send('listTermsReviews',{profileId});assert.equal(s.messages.at(-1).result.error.code,'INVALID_INPUT');
 await s.send('lock',{},1);await s.send('listTermsReviews',{profileId},1);assert.equal(s.messages.at(-1).result.error.code,'LOCKED');s.service.dispose();
});

test('review list suppresses private results after lock while an uncancellable read drains',async()=>{
 const pending=deferred();let live=true;
 const success=value=>({ok:true,value});
 const fake={create:async()=>{live=true;return success({sessionId:'s',profileId:'a'.repeat(32),revision:0});},captureSession:()=>success({current:()=>live?{sessionId:'s',profileId:'a'.repeat(32),revision:0}:null,dispose(){}}),lockAll(){live=false;},dispose(){},assertFresh:async()=>success(0),list:()=>pending.promise};
 const s=endpoint({createServices:()=>({vault:fake,backup:{dispose(){}}})});await s.send('init',{config});await s.send('create',{passphrase:pass});
 const job=s.send('listTermsReviews',{profileId:'a'.repeat(32)});await Promise.resolve();await Promise.resolve();await s.send('lock',{},1);pending.resolve(success([]));await job;
 assert.equal(s.messages.some(m=>m.operation==='listTermsReviews'&&m.result.ok),false);s.service.dispose();
});
