import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/core.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const fn=name=>{assert.equal(typeof api[name],'function',`missing ${name}`);return api[name];};
const binding={chain:'evm',networkId:'eip155:11155111',deploymentId:'escrow-v1',tradeId:'0x'+'12'.repeat(32)};
const observation=()=>({binding:{...binding},generation:0,requestSequence:1,anchor:{height:'18446744073709551615',hash:'0x'+'34'.repeat(32)},state:'funded',finality:'finalized',observedAt:1000});
const event=()=>({version:1,eventId:Buffer.alloc(32,1).toString('base64url'),binding:{...binding},source:'chain',kind:'chain-snapshot',generation:0,sequence:1,observedAt:1000,data:observation()});
const invalid=(call,code='INVALID_INPUT')=>assert.throws(call,error=>error.code===code&&!error.message.includes('SECRET'));
test('core binding/chain observation parsers enforce exact bounded structure and detached copies',()=>{
 const parse=fn('parseChainObservation'),input=observation(),out=parse(input); assert.deepEqual(out,input); assert.notEqual(out.binding,input.binding); assert.notEqual(out.anchor,input.anchor);
 for(const value of [{...input,extra:'SECRET'},{...input,generation:-1},{...input,requestSequence:Number.MAX_SAFE_INTEGER+1},{...input,anchor:{height:'01',hash:'h'}},{...input,state:'paid'},{...input,finality:'guaranteed'},{...input,binding:{...binding,chain:'bitcoin'}}])invalid(()=>parse(value));
 invalid(()=>parse({...input,binding:{...binding,networkId:'a'.repeat(257)}}),'LIMIT_EXCEEDED');
 invalid(()=>parse({...input,anchor:{height:'1'.repeat(79),hash:'h'}}),'LIMIT_EXCEEDED');
});
test('observation envelopes reject wrong source/kind, unknown fields, invalid IDs and stale integer encodings',()=>{
 const parse=fn('parseObservationEnvelope'),input=event();assert.deepEqual(parse(input),input);
 for(const value of [{...input,source:'relay'},{...input,eventId:input.eventId+'='},{...input,eventId:'A'.repeat(42)+'B'},{...input,sequence:-1},{...input,generation:1.5},{...input,extra:'SECRET'}])invalid(()=>parse(value));
 invalid(()=>parse({...input,version:2}),'UNSUPPORTED_VERSION');
 assert.equal(parse({...input,source:'wallet',kind:'wallet-invalidated',data:{walletGeneration:1}}).data.walletGeneration,1);
});
test('schema boundaries never invoke getters/toJSON or expose hostile reflection failures',()=>{
 const parse=fn('parseObservationEnvelope');let touched=0;
 const input=event();Object.defineProperty(input,'data',{enumerable:true,get(){touched++;throw Error('SECRET');}});invalid(()=>parse(input));assert.equal(touched,0);
 invalid(()=>parse(new Proxy({}, {ownKeys(){throw Error('SECRET');}})));
 const withToJSON={...event(),toJSON(){touched++;throw Error('SECRET');}};invalid(()=>parse(withToJSON));assert.equal(touched,0);
});
test('JSON envelope parsing bounds UTF8 before parsing and rejects malformed or future data',()=>{
 const parse=fn('parseObservationJson');assert.deepEqual(parse(JSON.stringify(event())),event());
 invalid(()=>parse('a'.repeat(65537)),'LIMIT_EXCEEDED');invalid(()=>parse('é'.repeat(32769)),'LIMIT_EXCEEDED');invalid(()=>parse('{bad SECRET'));
});
test('ten thousand deterministic bounded envelopes reject invalid changes without throwing raw diagnostics',()=>{
 const parse=fn('parseObservationEnvelope');let state=0x50425031;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
 for(let index=0;index<10000;index++){
  const input=event(),which=random()%8;
  if(which===0)input.generation=-1;
  if(which===1)input.sequence=Number.MAX_SAFE_INTEGER+1;
  if(which===2)input.source='relay';
  if(which===3)input.data.anchor.height='0'+String(random());
  if(which===4)input.version=999;
  if(which===5)input.extra='SECRET';
  if(which===6)input.eventId='=';
  if(which===7)input.data.finality='bank-paid';
  assert.throws(()=>parse(input),error=>['INVALID_INPUT','UNSUPPORTED_VERSION'].includes(error.code)&&!error.message.includes('SECRET'));
 }
});
