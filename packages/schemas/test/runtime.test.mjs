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
