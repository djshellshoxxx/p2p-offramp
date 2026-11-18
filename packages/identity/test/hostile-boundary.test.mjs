import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {MessagingIdentityService} from '../src/identity-service.ts';
import {IdentityError, IDENTITY_PROVIDER_ID} from '../../schemas/index.ts';
const secret='PRIVATE_PROVIDER_DETAIL';
const poison=()=>new Proxy({},{getPrototypeOf(){throw Error(secret)}});
const session={sessionId:'x',profileId:'1'.repeat(32),revision:0};
function vault(){let disposals=0;return {get disposals(){return disposals},captureSession:()=>({ok:true,value:{current:()=>session,dispose(){disposals++}}}),commit:async()=>({ok:true,value:0}),list:async()=>({ok:true,value:[]})};}
const fixed=(result,code='STORAGE_UNAVAILABLE')=>{assert.equal(result.ok,false);assert.deepEqual(result.error,{code,messageKey:`identity.error.${code.toLowerCase()}`});};
test('identity catches hostile prototype, descriptor and code accessor failures with fixed Result diagnostics',async()=>{
 const accessor=new IdentityError('CONFLICT');Object.defineProperty(accessor,'code',{get(){throw Error(secret)}});
 const invalid=new IdentityError('CONFLICT');Object.defineProperty(invalid,'code',{value:secret});
 const descriptor=new Proxy(new IdentityError('CONFLICT'),{getOwnPropertyDescriptor(){throw Error(secret)}});
 const known=new IdentityError('CONFLICT');known.message=secret;
 for(const error of [poison(),accessor,invalid,descriptor,known]){
  const service=new MessagingIdentityService({captureSession(){throw error}},{lifecycle:false});
  try{fixed(await service.create(session),error===known?'CONFLICT':'STORAGE_UNAVAILABLE');}finally{service.dispose();}
 }
});
test('identity provider throws drain leases and ignore shadowed native signal properties',async()=>{
 for(const stage of ['id','generate','publicKey']){
  const backing=vault(),controller=new AbortController();
  for(const key of ['aborted','addEventListener','removeEventListener'])Object.defineProperty(controller.signal,key,{get(){throw Error(secret)}});
  const provider={get id(){if(stage==='id')throw poison();return IDENTITY_PROVIDER_ID},generate:async()=>{if(stage==='generate')throw poison();return{secretKey:new Uint8Array(32).fill(1),publicKey:'1'.repeat(64)}},publicKey:async()=>{throw poison()}};
  const service=new MessagingIdentityService(backing,{provider,lifecycle:false});
  try{fixed(await service.create(session,controller.signal));assert.equal(backing.disposals,1);assert.equal(getEventListeners(controller.signal,'abort').length,0);
   controller.abort();fixed(await service.create(session,controller.signal),'CANCELLED');assert.equal(backing.disposals,2);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  }finally{service.dispose();}
 }
});
test('identity rejects invalid proxy signals before acquiring a lease',async()=>{
 const backing=vault(),service=new MessagingIdentityService(backing,{lifecycle:false});
 try{for(const signal of [poison(),{get aborted(){throw Error(secret)}}])fixed(await service.create(session,signal),'INVALID_IDENTITY');assert.equal(backing.disposals,0);}finally{service.dispose();}
});

test('throwing lease disposal preserves fixed errors, detaches signals and releases the profile queue',async()=>{
 const backing=vault();let disposals=0;
 backing.captureSession=()=>({ok:true,value:{current:()=>session,dispose(){disposals++;throw Error('PRIVATE_DISPOSE')}}});
 const service=new MessagingIdentityService(backing,{lifecycle:false}),controller=new AbortController();
 let timer;
 try{
  const first=service.create(session,controller.signal),second=service.create(session,controller.signal);
  const results=await Promise.race([Promise.all([first,second]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('profile queue did not drain')),500)})]);
  for(const result of results)fixed(result,'UNSUPPORTED_PROVIDER');
  assert.equal(disposals,2);assert.equal(getEventListeners(controller.signal,'abort').length,0);
 }finally{clearTimeout(timer);service.dispose();}
});

test('throwing lease cleanup cannot mask a durable identity reference or prevent other handle revocations',async()=>{
 const {EncryptedVaultService}=await import('../../storage/src/vault-service.ts');
 const {createLocalNobleIdentityProvider}=await import('../src/noble-provider.ts');
 class Store{
  rows=new Map();afterCommit;
  subscribeInvalidation(){return()=>{}}
  async get(id){return structuredClone(this.rows.get(id))}
  async add(row,options){options.assertCurrent();this.rows.set(row.profileId,structuredClone(row))}
  async compareAndSwap(expected,next,options){options.assertCurrent();assert.deepEqual(this.rows.get(expected.profileId),expected);this.rows.set(next.profileId,structuredClone(next));this.afterCommit?.()}
 }
 const store=new Store(),backing=new EncryptedVaultService(store,crypto,{lifecycle:false}),opened=await backing.create('hostile cleanup local test passphrase');assert.equal(opened.ok,true);
 const realCapture=backing.captureSession.bind(backing);let disposals=0;
 backing.captureSession=(...args)=>{const result=realCapture(...args);if(!result.ok)return result;const real=result.value;return{ok:true,value:{current:()=>real.current(),dispose(){disposals++;real.dispose();throw Error('PRIVATE_DISPOSE')}}}};
 const controller=new AbortController(),service=new MessagingIdentityService(backing,{provider:createLocalNobleIdentityProvider(),lifecycle:false});
 try{
  store.afterCommit=()=>{controller.abort();service.lockAll()};
  const created=await service.create(opened.value,controller.signal);assert.equal(created.ok,true);assert.equal(created.value.state,'locked');assert.equal(created.value.handle,null);assert.match(created.value.identityRecordId,/^[0-9a-f]{32}$/);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  store.afterCommit=undefined;
  const current={...opened.value,revision:store.rows.get(opened.value.profileId).revision};
  const unlocked=await service.unlock(current,created.value.identityRecordId);assert.equal(unlocked.ok,true);
  const other=await service.unlock(current,created.value.identityRecordId);assert.equal(other.ok,true);
  assert.doesNotThrow(()=>service.lockAll());fixed(await service.publicIdentity(unlocked.value),'LOCKED');fixed(await service.publicIdentity(other.value),'LOCKED');assert.ok(disposals>=3);
  assert.doesNotThrow(()=>service.dispose());
 }finally{service.dispose();backing.dispose()}
});
