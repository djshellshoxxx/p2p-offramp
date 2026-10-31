import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { schnorr } from '@noble/curves/secp256k1.js';
const api=await import('../src/identity-service.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const adapter=await import('../src/noble-provider.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const clone=value=>structuredClone(value),pass='identity local test passphrase';
class Store{
 rows=new Map();listeners=new Set();afterCommit;writes=0;
 async get(id){return clone(this.rows.get(id));}
 async add(value,options){options?.assertCurrent?.();if(this.rows.has(value.profileId))throw Error('collision');this.rows.set(value.profileId,clone(value));this.writes++;}
 async compareAndSwap(expected,next,options){options?.assertCurrent?.();if(options?.signal?.aborted)throw Error('cancelled');assert.deepEqual(this.rows.get(expected.profileId),expected);this.rows.set(next.profileId,clone(next));this.writes++;this.afterCommit?.();}
 subscribeInvalidation(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
}
const val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const err=(result,code)=>{assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result.error),/SECRET|https:\/\//);return result;};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
async function setup(provider){
 assert.equal(typeof api.MessagingIdentityService,'function','missing identity service');assert.equal(typeof adapter.createLocalNobleIdentityProvider,'function','missing local Noble adapter');
 const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),session=val(await vault.create(pass));
 const signer=provider??adapter.createLocalNobleIdentityProvider();const identity=new api.MessagingIdentityService(vault,{provider:signer,lifecycle:false});return{store,vault,session,identity,provider:signer};
}
test('identity creation persists encrypted independent key material before returning only a purpose handle',async()=>{
 const s=await setup();const created=val(await s.identity.create(s.session));assert.equal(created.state,'unlocked');assert.match(created.identityRecordId,/^[a-f0-9]{32}$/);assert.equal(created.profileId,s.session.profileId);
 const handle=created.handle;assert.deepEqual(Object.keys(handle).sort(),['generation','id','purpose']);assert.match(handle.id,/^[A-Za-z0-9_-]{43}$/);assert.equal(handle.purpose,'messaging');
 const publicKey=val(await s.identity.publicIdentity(handle));assert.match(publicKey,/^[a-f0-9]{64}$/);assert.equal(s.store.writes,2);assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]),/secretKey|publicKey|messaging-identity/);
 assert.equal('sign'in s.identity,false);assert.equal('decrypt'in s.identity,false);assert.deepEqual(Reflect.ownKeys(s.identity),[]);s.identity.dispose();s.vault.dispose();
});
test('default unsupported provider never generates or persists an identity',async()=>{
 const s=await setup();const unsupported=new api.MessagingIdentityService(s.vault,{lifecycle:false});err(await unsupported.create(s.session),'UNSUPPORTED_PROVIDER');assert.equal(s.store.writes,1);unsupported.dispose();s.identity.dispose();s.vault.dispose();
});
test('two live profiles cannot swap vault sessions, record IDs or forged purpose handles',async()=>{
 const s=await setup(),other=val(await s.vault.create(pass));const a=val(await s.identity.create(s.session)),b=val(await s.identity.create(other));
 assert.notEqual(val(await s.identity.publicIdentity(a.handle)),val(await s.identity.publicIdentity(b.handle)));
 err(await s.identity.unlock({...s.session,profileId:other.profileId},a.identityRecordId),'LOCKED');err(await s.identity.unlock(other,a.identityRecordId),'INVALID_IDENTITY');
 err(await s.identity.publicIdentity({...a.handle}),'LOCKED');err(await s.identity.publicIdentity({...a.handle,purpose:'spending'}),'INVALID_IDENTITY');s.identity.dispose();s.vault.dispose();
});
test('lockAll and live G02 revocation synchronously invalidate handles; unlock makes fresh handle/generation',async()=>{
 const s=await setup();const a=val(await s.identity.create(s.session));s.identity.lockAll();err(await s.identity.publicIdentity(a.handle),'LOCKED');
 const b=val(await s.identity.unlock(s.session,a.identityRecordId));assert.notEqual(b.id,a.handle.id);assert.ok(b.generation>a.handle.generation);
 s.vault.lock(s.session.sessionId);err(await s.identity.publicIdentity(b),'LOCKED');err(await s.identity.unlock(s.session,a.identityRecordId),'LOCKED');s.identity.dispose();s.vault.dispose();
});
test('active identity uniqueness and explicit retirement survive lock/reopen',async()=>{
 const s=await setup(),a=val(await s.identity.create(s.session));err(await s.identity.create(s.session),'CONFLICT');val(await s.identity.retire(a.handle));
 err(await s.identity.publicIdentity(a.handle),'LOCKED');err(await s.identity.unlock(s.session,a.identityRecordId),'INVALID_IDENTITY');
 const b=val(await s.identity.create(s.session));assert.notEqual(b.identityRecordId,a.identityRecordId);s.identity.lockAll();
 const restored=val(await s.identity.unlock(s.session,b.identityRecordId));assert.match(val(await s.identity.publicIdentity(restored)),/^[a-f0-9]{64}$/);s.identity.dispose();s.vault.dispose();
});
test('lock during async generation suppresses output and wipes late key material without storage',async()=>{
 const gate=deferred(),entered=deferred();const pair=schnorr.keygen();const s=await setup({id:'noble-curves-bip340-2.4.0',generate:()=>{entered.resolve();return gate.promise;},publicKey:async secret=>Buffer.from(schnorr.getPublicKey(secret)).toString('hex')});
 const task=s.identity.create(s.session);await entered.promise;s.identity.lockAll();gate.resolve({secretKey:pair.secretKey,publicKey:Buffer.from(pair.publicKey).toString('hex')});
 err(await task,'LOCKED');assert.equal(pair.secretKey.every(byte=>byte===0),true);assert.equal(s.store.writes,1);s.identity.dispose();s.vault.dispose();
});
test('a completed create winning cancellation returns a discoverable locked reference, never revives a handle',async()=>{
 const s=await setup();const controller=new AbortController();s.store.afterCommit=()=>{s.identity.lockAll();controller.abort();};
 const result=val(await s.identity.create(s.session,controller.signal));assert.equal(result.state,'locked');assert.equal(result.handle,null);assert.equal(s.store.writes,2);
 s.store.afterCommit=undefined;const unlocked=val(await s.identity.unlock(s.session,result.identityRecordId));assert.match(val(await s.identity.publicIdentity(unlocked)),/^[a-f0-9]{64}$/);s.identity.dispose();s.vault.dispose();
});
test('pending public identity output is suppressed by immediate identity or vault lock',async()=>{
 const s=await setup();const a=val(await s.identity.create(s.session));const pending=s.identity.publicIdentity(a.handle);s.identity.lockAll();err(await pending,'LOCKED');
 const b=val(await s.identity.unlock(s.session,a.identityRecordId));const pendingVault=s.identity.publicIdentity(b);s.vault.lockAll();err(await pendingVault,'LOCKED');s.identity.dispose();s.vault.dispose();
});
test('tampered decrypted identity metadata and invalid scalars are rejected without raw diagnostics',async()=>{
 const s=await setup(),a=val(await s.identity.create(s.session));s.identity.lockAll();const record=val(await s.vault.read(s.session.sessionId,a.identityRecordId));
 const original=JSON.parse(Buffer.from(record.payload,'base64url').toString('utf8'));
 for(const changed of [{...original,publicKey:'00'.repeat(32)},{...original,secretKey:Buffer.alloc(32).toString('base64url')},{...original,profileId:'aa'.repeat(16)},{...original,purpose:'spending'},{...original,extra:'SECRET'}]){
  const revision=s.vault.captureSession(s.session,()=>{});assert.equal(revision.ok,true);const lease=revision.value;const current=lease.current();lease.dispose();
  val(await s.vault.commit(s.session.sessionId,current.revision,[{op:'put',record:{...record,payload:Buffer.from(JSON.stringify(changed)).toString('base64url')}}]));
  err(await s.identity.unlock(s.session,a.identityRecordId),'INVALID_IDENTITY');
 }
 s.identity.dispose();s.vault.dispose();
});
test('identity disposal is terminal, idempotent and cannot create or publish more keys',async()=>{
 const s=await setup(),a=val(await s.identity.create(s.session));s.identity.dispose();s.identity.dispose();err(await s.identity.create(s.session),'LOCKED');err(await s.identity.unlock(s.session,a.identityRecordId),'LOCKED');err(await s.identity.publicIdentity(a.handle),'LOCKED');assert.equal(s.store.writes,2);s.vault.dispose();
});
test('a random identity record ID collision cannot overwrite a different G02 record kind',async()=>{
 const s=await setup();const recordId='aa'.repeat(16);const existing={id:recordId,kind:'trade',schemaVersion:1,payload:'cHJlc2VydmU'};
 val(await s.vault.commit(s.session.sessionId,0,[{op:'put',record:existing}]));
 const original=crypto.getRandomValues.bind(crypto);const method=crypto.getRandomValues;
 try{crypto.getRandomValues=function(bytes){if(bytes.length===16){bytes.fill(0xaa);return bytes;}return original(bytes);};err(await s.identity.create(s.session),'CONFLICT');}
 finally{crypto.getRandomValues=method;}
 assert.deepEqual(val(await s.vault.read(s.session.sessionId,recordId)),existing);s.identity.dispose();s.vault.dispose();
});
test('lock during pending scalar derivation wipes reachable scalar bytes immediately and suppresses its result',async()=>{
 const base=adapter.createLocalNobleIdentityProvider(),entered=deferred(),gate=deferred();let hold=false,seen;
 const s=await setup({...base,publicKey:async secret=>{if(hold){seen=secret;entered.resolve();await gate.promise;}return base.publicKey(secret);}});
 const a=val(await s.identity.create(s.session));s.identity.lockAll();hold=true;const pending=s.identity.unlock(s.session,a.identityRecordId);
 await entered.promise;assert.equal(seen.some(byte=>byte!==0),true);s.vault.lockAll();assert.equal(seen.every(byte=>byte===0),true);gate.resolve();err(await pending,'LOCKED');s.identity.dispose();s.vault.dispose();
});
test('a different service retiring an identity invalidates an unlock still deriving its public key',async()=>{
 const base=adapter.createLocalNobleIdentityProvider(),entered=deferred(),gate=deferred();let hold=false,seen;
 const s=await setup({...base,publicKey:async secret=>{if(hold){seen=secret;entered.resolve();await gate.promise;}return base.publicKey(secret);}});
 const created=val(await s.identity.create(s.session));s.identity.lockAll();
 const other=new api.MessagingIdentityService(s.vault,{provider:base,lifecycle:false});
 try{const handle=val(await other.unlock(s.session,created.identityRecordId));hold=true;
  const pending=s.identity.unlock(s.session,created.identityRecordId);await entered.promise;
  val(await other.retire(handle));gate.resolve();err(await pending,'CONFLICT');
  assert.equal(seen.every(byte=>byte===0),true);err(await s.identity.unlock(s.session,created.identityRecordId),'INVALID_IDENTITY');
 }finally{gate.resolve();other.dispose();s.identity.dispose();s.vault.dispose();}
});
test('Node lifecycle unit: synthetic activity and polling do not extend the exact five-minute idle lock',async t=>{
 const s=await setup(),a=val(await s.identity.create(s.session));s.identity.dispose();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();t.mock.timers.enable({apis:['setTimeout']});
 let service;
 try{service=new api.MessagingIdentityService(s.vault,{provider:s.provider});const handle=val(await service.unlock(s.session,a.identityRecordId));
  t.mock.timers.tick(299999);globalThis.document.dispatchEvent(new Event('pointerdown'));assert.match(val(await service.publicIdentity(handle)),/^[a-f0-9]{64}$/);
  t.mock.timers.tick(1);err(await service.publicIdentity(handle),'LOCKED');
 }finally{service?.dispose();s.vault.dispose();t.mock.timers.reset();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
test('Node lifecycle unit: trusted activity resets idle and pagehide locks immediately',async t=>{
 const s=await setup(),a=val(await s.identity.create(s.session));s.identity.dispose();const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();t.mock.timers.enable({apis:['setTimeout']});let service;
 try{service=new api.MessagingIdentityService(s.vault,{provider:s.provider});const handle=val(await service.unlock(s.session,a.identityRecordId));
  t.mock.timers.tick(299999);const input=new Event('keydown');Object.defineProperty(input,'isTrusted',{value:true});globalThis.document.dispatchEvent(input);
  t.mock.timers.tick(1);assert.match(val(await service.publicIdentity(handle)),/^[a-f0-9]{64}$/);globalThis.window.dispatchEvent(new Event('pagehide'));err(await service.publicIdentity(handle),'LOCKED');
 }finally{service?.dispose();s.vault.dispose();t.mock.timers.reset();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
test('Node lifecycle unit: revoking another profile cannot refresh idle authority of a remaining handle',async t=>{
 const s=await setup(),a=val(await s.identity.create(s.session)),other=val(await s.vault.create(pass)),b=val(await s.identity.create(other));s.identity.dispose();
 const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget();globalThis.document=new EventTarget();t.mock.timers.enable({apis:['setTimeout']});let service;
 try{service=new api.MessagingIdentityService(s.vault,{provider:s.provider});val(await service.unlock(s.session,a.identityRecordId));const handle=val(await service.unlock(other,b.identityRecordId));
  t.mock.timers.tick(299999);s.vault.lock(s.session.sessionId);t.mock.timers.tick(1);err(await service.publicIdentity(handle),'LOCKED');
 }finally{service?.dispose();s.vault.dispose();t.mock.timers.reset();if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
test('suspended lifecycle deadlines expire before access or trusted input can revive vault or identity',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 try {
  for(const reason of ['expired','backward','invalid'])for(const service of ['vault','identity']){
   let clock=10;const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:service==='vault',now:()=>clock});
   const session=val(await vault.create(pass)),identity=new api.MessagingIdentityService(vault,{provider:adapter.createLocalNobleIdentityProvider(),now:()=>clock});
   try{
    const created=val(await identity.create(session));clock=reason==='expired'?300011:reason==='backward'?9:NaN;
    const event=new Event('keydown');Object.defineProperty(event,'isTrusted',{value:true});document.dispatchEvent(event);
    err(await identity.publicIdentity(created.handle),'LOCKED');
    if(service==='vault')err(await vault.list(session.sessionId),'LOCKED');
   }finally{identity.dispose();vault.dispose();}
  }
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
