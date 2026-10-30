import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const api=await import('../src/runtime.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const fn=name=>{assert.equal(typeof api[name],'function',`missing ${name}`);return api[name];};
const config=()=>({version:1,ReleaseEnabled:0,connectOrigins:[]});
const command=(operation,extra={})=>({version:1,requestId:1,generation:0,operation,...extra});
const invalid=(work,code='INVALID_INPUT')=>assert.throws(work,error=>error.code===code&&!error.message.includes('SECRET'));
test('runtime config is a strict nonsecret offline allowlist with release permanently disabled',()=>{
 const parse=fn('parseRuntimeConfig'),input=config();assert.deepEqual(parse(input),input);assert.notEqual(parse(input).connectOrigins,input.connectOrigins);
 for(const changed of [{...input,ReleaseEnabled:1},{...input,connectOrigins:['https://SECRET.example']},{...input,privateKey:'SECRET'},{...input,url:'https://SECRET.example'},{...input,version:2}])invalid(()=>parse(changed));
 let calls=0;invalid(()=>parse(Object.defineProperty(config(),'ReleaseEnabled',{get(){calls++;return 0;}})));assert.equal(calls,0);
 const array=[];array.extra='SECRET';invalid(()=>parse({...input,connectOrigins:array}));
});
test('runtime command union exposes only bounded known-profile readonly operations and control commands',()=>{
 const parse=fn('parseRuntimeCommand');
 for(const operation of ['status','lock','dispose'])assert.deepEqual(parse(command(operation)),command(operation));
 assert.deepEqual(parse(command('init',{config:config()})),command('init',{config:config()}));
 assert.deepEqual(parse(command('unlock',{profileId:'a'.repeat(32),passphrase:'local runtime passphrase'})),command('unlock',{profileId:'a'.repeat(32),passphrase:'local runtime passphrase'}));
 assert.deepEqual(parse(command('exportEncrypted',{profileId:'a'.repeat(32)})),command('exportEncrypted',{profileId:'a'.repeat(32)}));
 for(const operation of ['create','restore','read','list','commit','sign','fetch'])invalid(()=>parse(command(operation)));
 assert.deepEqual(parse(command('listProfiles')),command('listProfiles'));invalid(()=>parse(command('listProfiles',{profileId:'a'.repeat(32)})));
 for(const changed of [{requestId:0},{requestId:Infinity},{generation:-1},{generation:Number.MAX_SAFE_INTEGER+1},{version:2},{sessionId:'SECRET'}])invalid(()=>parse({...command('status'),...changed}));
 for(const passphrase of ['short','x'.repeat(1025),'\ud800'+'x'.repeat(12)])invalid(()=>parse(command('unlock',{profileId:'a'.repeat(32),passphrase})));
 invalid(()=>parse(command('unlock',{profileId:'A'.repeat(32),passphrase:'local runtime passphrase'})));
});
test('runtime messages reject hostile reflection without invoking getters or echoing supplied diagnostics',()=>{
 const parse=fn('parseRuntimeCommand');let calls=0;
 invalid(()=>parse(Object.defineProperty(command('unlock',{profileId:'a'.repeat(32),passphrase:'local runtime passphrase'}),'passphrase',{get(){calls++;throw Error('SECRET');}})));assert.equal(calls,0);
 const revoked=Proxy.revocable({},{});revoked.revoke();invalid(()=>parse(revoked.proxy));
 invalid(()=>parse({...command('status'),[Symbol('SECRET')]:1}));
});
test('runtime replies validate opaque purpose handles and fixed errors without exposing vault-session or record fields',()=>{
 const parse=fn('parseRuntimeMessage');const handle={id:'A'.repeat(43),generation:0,purpose:'vault',profileId:'a'.repeat(32)};
 const reply={...command('unlock'),kind:'response',result:{ok:true,value:{state:'unlocked',handle}}};
 assert.deepEqual(parse(reply),reply);assert.notEqual(parse(reply).result.value.handle,handle);
 for(const changed of [{...handle,purpose:'messaging'},{...handle,sessionId:'SECRET'},{...handle,generation:1}])invalid(()=>parse({...reply,result:{ok:true,value:{state:'unlocked',handle:changed}}}));
 invalid(()=>parse({...reply,result:{ok:true,value:{state:'locked',handle}}}));
 invalid(()=>parse({...reply,result:{ok:true,value:{state:'unlocked',handle:null}}}));
 const failure={...command('status'),kind:'response',result:{ok:false,error:{code:'LOCKED',messageKey:'runtime.error.locked'}}};assert.deepEqual(parse(failure),failure);
 invalid(()=>parse({...failure,result:{ok:false,error:{code:'LOCKED',messageKey:'SECRET'}}}));
 invalid(()=>parse({...failure,result:{ok:false,error:{code:'SECRET',messageKey:'runtime.error.secret'}}}));
 assert.deepEqual(parse({version:1,kind:'locked',generation:0}),{version:1,kind:'locked',generation:0});
});
test('runtime encrypted export is bounded G03 ciphertext with an explicit unauthenticated label',async()=>{
 const parse=fn('parseRuntimeMessage');const {encodeBackup,canonicalEnvelopeBytes}=await import('../src/backup.ts');
 const fixture=JSON.parse(await readFile(new URL('../../storage/test/fixtures/vault-python-v1.json',import.meta.url)));
 const checksum=Buffer.from(await crypto.subtle.digest('SHA-256',canonicalEnvelopeBytes(fixture.envelope))).toString('hex');
 const bytes=encodeBackup({format:'p2p-offramp-backup',version:1,envelope:fixture.envelope,checksum});
 const reply={...command('exportEncrypted'),kind:'response',result:{ok:true,value:{bytes,authentication:'not-checked'}}};
 const parsed=parse(reply);assert.deepEqual(parsed,reply);assert.notEqual(parsed.result.value.bytes,bytes);
 invalid(()=>parse({...reply,result:{ok:true,value:{bytes,authentication:'authenticated'}}}));
 invalid(()=>parse({...reply,result:{ok:true,value:{bytes:new Uint8Array(12*1024*1024+1),authentication:'not-checked'}}}),'LIMIT_EXCEEDED');
 invalid(()=>parse({...reply,result:{ok:true,value:{bytes:new TextEncoder().encode('{"secretKey":"SECRET"}'),authentication:'not-checked'}}}));
});

test('runtime create/restore commands require valid passphrases and bounded genuine byte copies',async()=>{
 const parse=fn('parseRuntimeCommand');const p='local runtime passphrase';
 assert.deepEqual(parse(command('create',{passphrase:p})),command('create',{passphrase:p}));
 for(const passphrase of ['short','x'.repeat(1025),'\ud800'+'x'.repeat(12),12])invalid(()=>parse(command('create',{passphrase})));
 invalid(()=>parse(command('create',{passphrase:p,profileId:'a'.repeat(32)})));
 const bytes=new Uint8Array([1,2,3]);const parsed=parse(command('restore',{bytes,sourcePassphrase:p,destinationPassphrase:p}));
 assert.deepEqual([...parsed.bytes],[1,2,3]);assert.notEqual(parsed.bytes,bytes);
 for(const changed of [{bytes:[1,2,3]},{bytes:new Uint16Array(2)},{bytes:'AAAA'},{sourcePassphrase:'short'},{destinationPassphrase:'\ud800'+'x'.repeat(12)}])
  invalid(()=>parse(command('restore',{bytes,sourcePassphrase:p,destinationPassphrase:p,...changed})));
 const {MAX_BACKUP_BYTES}=await import('../src/backup.ts');
 invalid(()=>parse(command('restore',{bytes:new Uint8Array(MAX_BACKUP_BYTES+1),sourcePassphrase:p,destinationPassphrase:p})),'LIMIT_EXCEEDED');
 class Lying extends Uint8Array{get length(){return 0;}get byteLength(){return 0;}}
 assert.equal(parse(command('restore',{bytes:new Lying(4),sourcePassphrase:p,destinationPassphrase:p})).bytes.length,4);
});
test('runtime inventory and restore replies are strict, bounded and contain only opaque public fields',()=>{
 const parse=fn('parseRuntimeMessage');const id=n=>n.toString(16).padStart(32,'0');
 const list=value=>({...command('listProfiles'),kind:'response',result:{ok:true,value}});
 const good=list({profileIds:[id(1),id(2)],truncated:false});assert.deepEqual(parse(good),good);
 assert.deepEqual(parse(list({profileIds:Array.from({length:16},(_,n)=>id(n)),truncated:true})).result.value.truncated,true);
 const sparse=[id(1)];sparse.length=2;
 for(const value of [{profileIds:Array.from({length:17},(_,n)=>id(n)),truncated:true},{profileIds:[id(1),id(1)],truncated:false},{profileIds:['SECRET'],truncated:false},
  {profileIds:[id(1)],truncated:0},{profileIds:[id(1)],truncated:false,envelope:'SECRET'},{profileIds:sparse,truncated:false},{profileIds:Object.assign([id(1)],{x:1}),truncated:false},
  {state:'locked',handle:null}])invalid(()=>parse(list(value)));
 const restore=value=>({...command('restore'),kind:'response',result:{ok:true,value}});
 const ok=restore({newProfileId:id(5),records:3});assert.deepEqual(parse(ok),ok);
 for(const value of [{newProfileId:id(5),records:-1},{newProfileId:id(5),records:10001},{newProfileId:id(5),records:1.5},{newProfileId:'SECRET',records:0},
  {newProfileId:id(5),records:0,sourceProfileId:id(6)},{newProfileId:id(5),records:0,newKeyId:id(7)}])invalid(()=>parse(restore(value)));
 const create={...command('create'),kind:'response',result:{ok:true,value:{state:'unlocked',handle:{id:'A'.repeat(43),generation:0,purpose:'vault',profileId:id(9)}}}};
 assert.deepEqual(parse(create),create);
});

test('runtime response rejects a changing result discriminator in both branches',()=>{
 const parse=fn('parseRuntimeMessage');
 for(const first of [true,false]){
  let reads=0;
  const original=first?{ok:true,value:{state:'locked',handle:null}}:{ok:false,error:{code:'LOCKED',messageKey:'runtime.error.locked'}};
  const result=new Proxy(original,{getOwnPropertyDescriptor(target,key){const descriptor=Reflect.getOwnPropertyDescriptor(target,key);return key==='ok'?{...descriptor,value:++reads===1?first:!first}:descriptor;}});
  invalid(()=>parse({...command('status'),kind:'response',result}));assert.equal(reads,2);
 }
});
