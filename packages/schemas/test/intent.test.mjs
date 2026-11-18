import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/intent.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const binding={chain:'evm',networkId:'evm:1',deploymentId:'escrow-v1',tradeId:'trade-1'};
const intent=()=>({version:1,intentId:Buffer.alloc(32,7).toString('base64url'),binding,account:'0x'+'12'.repeat(20),action:'fund',state:'prepared',walletGeneration:0,expectedEscrowState:'absent',preparedRequest:'{"to":"escrow","value":"1"}',submission:{chain:'evm',hash:null,nonce:null},replacementOf:null,createdAt:0,updatedAt:0});
function parse(input){assert.equal(typeof api.parseIntent,'function','missing G12 strict schema');return api.parseIntent(input);}
const bad=(input,code='INVALID_INPUT')=>assert.throws(()=>parse(input),error=>error.code===code&&!error.message.includes('SECRET'));
test('G12 exact v1 round trip keeps intent ID distinct from the outer G02 record ID',()=>{
 const input=intent(),parsed=parse(input);assert.deepEqual(parsed,input);assert.notEqual(parsed,input);assert.notEqual(parsed.binding,input.binding);assert.equal(Object.isFrozen(parsed.submission),true);
 assert.equal(typeof api.encodeIntentPayload,'function');assert.deepEqual(api.decodeIntentPayload(api.encodeIntentPayload(parsed)),parsed);
});
test('G12 schema rejects unknown fields, accessors, hostile prototypes, duplicate decoded keys and malformed UTF8',()=>{
 bad({...intent(),secretKey:'SECRET'});bad({...intent(),binding:{...binding,extra:true}});bad({...intent(),submission:{chain:'evm',hash:null,nonce:null,extra:true}});
 let calls=0;const value=intent();Object.defineProperty(value,'preparedRequest',{get(){calls++;throw Error('SECRET');}});bad(value);assert.equal(calls,0);
 bad(Object.setPrototypeOf(intent(),{extra:true}));bad(new Proxy({},{ownKeys(){throw Error('SECRET');}}));
 const json=JSON.stringify(intent()).replace('"version":1','"version":99,"ver\\u0073ion":1');assert.throws(()=>api.decodeIntentPayload(Buffer.from(json).toString('base64url')),error=>error.code==='INVALID_INPUT');
 assert.throws(()=>api.decodeIntentPayload(Buffer.from([0xff]).toString('base64url')),error=>error.code==='INVALID_INPUT');
});
test('G12 retains all specified states and rejects unknown versions and states',()=>{
 for(const state of ['prepared','broadcast-unknown','pending','confirmed','finalized','failed','reorged','expired','replaced'])assert.equal(parse({...intent(),state}).state,state);
 bad({...intent(),version:3},'UNSUPPORTED_VERSION');bad({...intent(),state:'dropped'});bad({...intent(),action:'delete'});bad({...intent(),expectedEscrowState:'released'});
});
test('G12 request UTF8 bound is 64 KiB and containing G02 payload cap still applies',()=>{
 assert.equal(parse({...intent(),preparedRequest:'x'.repeat(65536)}).preparedRequest.length,65536);
 bad({...intent(),preparedRequest:'x'.repeat(65537)},'LIMIT_EXCEEDED');bad({...intent(),preparedRequest:'é'.repeat(32769)},'LIMIT_EXCEEDED');bad({...intent(),preparedRequest:'\ud800'});
 assert.throws(()=>api.encodeIntentPayload({...intent(),preparedRequest:'\u0001'.repeat(65536)}),error=>error.code==='LIMIT_EXCEEDED');
});
test('G12 validates canonical identifiers, generations, timestamps and family-specific bounded submission shapes',()=>{
 for(const change of [{intentId:intent().intentId+'='},{intentId:'a'},{account:'SECRET https://invalid'},{walletGeneration:-1},{walletGeneration:Number.MAX_SAFE_INTEGER+1},{createdAt:Infinity},{updatedAt:-1},{replacementOf:'bad'},{submission:{chain:'evm',hash:'not-a-hash',nonce:null}},{submission:{chain:'evm',hash:null,nonce:'01'}},{submission:{chain:'solana',signature:null,blockhash:'1'.repeat(32),lastValidBlockHeight:'1'}}])bad({...intent(),...change});
 const solana={...intent(),binding:{...binding,chain:'solana',networkId:'solana:devnet'},account:'1'.repeat(32),submission:{chain:'solana',signature:null,blockhash:'1'.repeat(32),lastValidBlockHeight:'123'}};
 assert.deepEqual(parse(solana),solana);bad({...solana,submission:{...solana.submission,lastValidBlockHeight:'001'}});bad({...solana,submission:{...solana.submission,durableNonce:'SECRET'}});
});
test('G12 hostile submission reflection never leaks foreign exception messages',()=>{
 for(const submission of [null,undefined,new Proxy({},{getOwnPropertyDescriptor(){throw Error('SECRET scalar');}})])bad({...intent(),submission});
});
test('G12 encoded payload length is bounded before allocation with the fixed limit error',()=>{
 assert.throws(()=>api.decodeIntentPayload('A'.repeat(349527)),error=>error.code==='LIMIT_EXCEEDED');
});
test('G12 decoding sanitizes a hostile thrown value while classifying errors',()=>{
 const payload=api.encodeIntentPayload(intent()),original=TextDecoder.prototype.decode,revoked=Proxy.revocable({},{});revoked.revoke();
 try{TextDecoder.prototype.decode=function(){throw revoked.proxy;};assert.throws(()=>api.decodeIntentPayload(payload),error=>error.code==='INVALID_INPUT'&&error.message==='Invalid private intent data.');}
 finally{TextDecoder.prototype.decode=original;}
});

const v2 = (changes={}) => ({...intent(),version:2,sendMarkedAt:null,originProfileId:'ab'.repeat(16),...changes});
test('D9 v1 bytes round-trip unchanged while v2 retains exact permanent marker and profile origin',()=>{
 const old=intent(),oldBytes=Buffer.from(JSON.stringify(old)).toString('base64url');
 assert.equal(api.encodeIntentPayload(api.decodeIntentPayload(oldBytes)),oldBytes);
 assert.equal(Object.hasOwn(parse(old),'sendMarkedAt'),false,'missing legacy marker is not fabricated as null');
 for(const source of [v2(),v2({state:'failed'}),v2({state:'expired'}),v2({state:'confirmed',submission:{chain:'evm',hash:'0x'+'11'.repeat(32),nonce:'1'}}),v2({state:'broadcast-unknown',sendMarkedAt:5,updatedAt:5}),v2({state:'failed',sendMarkedAt:5,updatedAt:7})]) {
  const parsed=parse(source);assert.deepEqual(parsed,source);assert.ok(Object.isFrozen(parsed));
  assert.deepEqual(api.decodeIntentPayload(api.encodeIntentPayload(parsed)),parsed);
 }
});
test('D9 v2 refuses missing, contradictory, mutable or noncanonical provenance',()=>{
 for(const changes of [{sendMarkedAt:undefined},{originProfileId:undefined},{originProfileId:'AB'.repeat(16)},
  {sendMarkedAt:-1},{sendMarkedAt:1},{createdAt:2,updatedAt:1},{state:'broadcast-unknown'},
  {state:'prepared',submission:{chain:'evm',hash:'0x'+'11'.repeat(32),nonce:'1'}},
  {state:'failed',createdAt:2,sendMarkedAt:1,updatedAt:3}])bad(v2(changes));
 let calls=0;const hostile=v2();Object.defineProperty(hostile,'sendMarkedAt',{get(){calls++;return null;}});bad(hostile);assert.equal(calls,0);
 bad({...intent(),sendMarkedAt:null,originProfileId:'ab'.repeat(16)});
 const raw=JSON.stringify(v2()).replace('"version":2','"version":1,"version":2');
 assert.throws(()=>api.decodeIntentPayload(Buffer.from(raw).toString('base64url')),error=>error.code==='INVALID_INPUT');
});
test('D9 older-build rule: the frozen pre-D9 reader refuses every v2 payload and never misreads it',async()=>{
 const old=await import('./fixtures/intent-v1-reader.ts');
 const v2record={...intent(),version:2,sendMarkedAt:null,originProfileId:'a'.repeat(32)};
 for(const record of [v2record,{...v2record,state:'broadcast-unknown',sendMarkedAt:0}]){
  const payload=api.encodeIntentPayload(record);
  // The older reader checks the exact v1 key set before the version, so it reports INVALID_INPUT
  // (its journal then fails closed with INTEGRITY_FAILURE), not UNSUPPORTED_VERSION.
  assert.throws(()=>old.decodeIntentPayload(payload),error=>error.code==='INVALID_INPUT');
 }
 const legacy=api.encodeIntentPayload(intent());
 assert.deepEqual(old.decodeIntentPayload(legacy),api.decodeIntentPayload(legacy),'v1 stays readable by both builds');
});
