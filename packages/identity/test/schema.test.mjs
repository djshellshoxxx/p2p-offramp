import test from'node:test';import assert from'node:assert/strict';
const api=await import('../../schemas/src/identity.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const record=()=>({format:'p2p-offramp-messaging-identity',version:1,profileId:'a'.repeat(32),identityRecordId:'b'.repeat(32),purpose:'messaging',providerId:'noble-curves-bip340-2.4.0',publicKey:'c'.repeat(64),secretKey:Buffer.alloc(32,3).toString('base64url'),state:'active'});
test('identity private schema bounds and validates metadata without invoking user accessors',()=>{
 assert.equal(typeof api.parseIdentityRecord,'function','missing identity schema');const value=record();assert.deepEqual(api.parseIdentityRecord(value),value);
 for(const input of [{...value,extra:'SECRET'},{...value,purpose:'spending'},{...value,state:'approved'},{...value,secretKey:value.secretKey+'='},{...value,publicKey:'zz'.repeat(32)},{...value,profileId:'../../'},{...value,providerId:'other'}])assert.throws(()=>api.parseIdentityRecord(input),error=>error.code==='INVALID_IDENTITY');
 let touched=0;Object.defineProperty(value,'secretKey',{get(){touched++;throw Error('SECRET');}});assert.throws(()=>api.parseIdentityRecord(value));assert.equal(touched,0);
 assert.throws(()=>api.parseIdentityRecord(new Proxy({},{ownKeys(){throw Error('SECRET');}})),error=>!error.message.includes('SECRET'));
});
test('private generated identity payload rejects duplicate decoded keys and ambiguous serializations',()=>{
 const json=JSON.stringify(record()),payload=value=>Buffer.from(value).toString('base64url');
 assert.deepEqual(api.decodeIdentityPayload(payload(json)),record());
 for(const input of [json.replace('"version":1','"version":99,"version":1'),json.replace('"version":1','"ver\\u0073ion":99,"version":1'),' '+json,'\ufeff'+json]){
  assert.throws(()=>api.decodeIdentityPayload(payload(input)),error=>error.code==='INVALID_IDENTITY');
 }
});
