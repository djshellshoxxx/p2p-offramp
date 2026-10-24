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
 bad({...intent(),version:2},'UNSUPPORTED_VERSION');bad({...intent(),state:'dropped'});bad({...intent(),action:'delete'});bad({...intent(),expectedEscrowState:'released'});
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
