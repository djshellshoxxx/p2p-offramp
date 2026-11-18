import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/transport-selection.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const fn=name=>{assert.equal(typeof api[name],'function',`missing ${name}`);return api[name];};
const selection=()=>({version:1,mode:'ordinary',brokerGeneration:0,brokeredChannels:['relay']});
const command=()=>({mode:'strict',expectedBrokerGeneration:0,ordinaryConsent:false});
const invalid=work=>assert.throws(work,error=>error.code==='INVALID_INPUT'&&!error.message.includes('SECRET'));

test('selected policy is a detached scalar snapshot, including an unconfigured channel list',()=>{
 const parse=fn('parseRuntimeTransportSelection'),input=selection(),result=parse(input);
 assert.deepEqual(result,input);assert.notEqual(result.brokeredChannels,input.brokeredChannels);
 assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.brokeredChannels),true);
 input.brokeredChannels.push('rpc');assert.deepEqual(result.brokeredChannels,['relay']);
 assert.deepEqual(parse({...selection(),mode:'strict',brokeredChannels:[]}).brokeredChannels,[]);
 assert.equal(parse({...selection(),brokerGeneration:Number.MAX_SAFE_INTEGER-1}).brokerGeneration,Number.MAX_SAFE_INTEGER-1);
});

test('selection rejects invented coverage, hidden fields, unsupported channels and unsafe generations',()=>{
 const parse=fn('parseRuntimeTransportSelection');
 for(const input of [null,[],{...selection(),version:2},{...selection(),mode:'private'},{...selection(),coverage:'verified-private'},
  {...selection(),brokeredChannels:['wallet']},{...selection(),brokeredChannels:['relay','relay']},{...selection(),brokeredChannels:['static']},
  {...selection(),brokeredChannels:['rpc','relay','map','proof','update','wallet']},
  ...[-1,-0,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER].map(brokerGeneration=>({...selection(),brokerGeneration}))])invalid(()=>parse(input));
 const symbol=selection();symbol[Symbol('SECRET')]=true;invalid(()=>parse(symbol));
 const sparse=selection();sparse.brokeredChannels=new Array(1);invalid(()=>parse(sparse));
 const extra=selection();extra.brokeredChannels.extra='SECRET';invalid(()=>parse(extra));
});

test('mode commands are exact and require an own boolean consent marker',()=>{
 const parse=fn('parseRuntimeSelectTransportMode');assert.deepEqual(parse(command()),command());
 assert.equal(Object.isFrozen(parse(command())),true);
 assert.equal(parse({...command(),mode:'ordinary',ordinaryConsent:true}).ordinaryConsent,true);
 for(const input of [{...command(),mode:'strict-private'},{...command(),ordinaryConsent:'true'},
  {mode:'ordinary',expectedBrokerGeneration:0},{...command(),directConsent:true},
  ...[-1,-0,NaN,Infinity,1.1,Number.MAX_SAFE_INTEGER].map(expectedBrokerGeneration=>({...command(),expectedBrokerGeneration}))])invalid(()=>parse(input));
});

test('policy records refuse accessors and hostile reflection without exposing private diagnostics',()=>{
 const parse=fn('parseRuntimeTransportSelection'),select=fn('parseRuntimeSelectTransportMode');let calls=0;
 const input=selection();Object.defineProperty(input,'mode',{get(){calls++;return'strict';}});invalid(()=>parse(input));
 const channels=selection();Object.defineProperty(channels.brokeredChannels,0,{get(){calls++;return'relay';}});invalid(()=>parse(channels));
 const request=command();Object.defineProperty(request,'ordinaryConsent',{get(){calls++;return true;}});invalid(()=>select(request));
 assert.equal(calls,0);
 const inherited=Object.create(selection());invalid(()=>parse(inherited));
 const revoked=Proxy.revocable({},{});revoked.revoke();invalid(()=>parse(revoked.proxy));
 invalid(()=>select(new Proxy(command(),{ownKeys(){throw Error('SECRET');}})));
});
