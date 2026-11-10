import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RegistryService} from '../../domain/index.ts';
import {keccak256,evmTermsHash} from '../src/evm-terms.ts';
import {createContractAcceptanceVerifier} from '../src/evm-contract-acceptance.ts';
const scenario=JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json',import.meta.url)));
const registryJSON=JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url)));
const H='0x'+'12'.repeat(32),W='0x'+'88'.repeat(20),MAGIC='0x1626ba7e'+'0'.repeat(56),CODE='0x6000';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(patch={}){
 const raw=structuredClone(registryJSON);raw.networks[0].deployments[0].runtime.keccak256=Buffer.from(keccak256(Buffer.from('6000','hex'))).toString('hex');
 const registry=new RegistryService(),bytes=new TextEncoder().encode(JSON.stringify(raw));assert.equal((await registry.load(bytes,sha(bytes))).ok,true);
 const calls=[],state={current:true,reply:MAGIC,code:CODE,anchor:H,...patch};
 const input={domain:{...scenario.domain},terms:{...scenario.sets.native.terms,seller:W},role:'seller',walletAccount:W,signature:new Uint8Array([7,8,9]),sessionGeneration:1};
 const request=async({method,params=[]})=>{
  calls.push({method,params});const overridden=await state.intercept?.(method,params,state);if(overridden!==undefined)return overridden;
  if(method==='eth_chainId')return'0x7a69';
  if(method==='eth_getBlockByNumber')return params[0]==='0x0'?{number:'0x0',hash:raw.networks[0].genesisHash,timestamp:'0x0'}:{number:'0x10',hash:state.anchor,timestamp:'0x1000'};
  if(method==='eth_getCode')return params[0]===W?state.code:CODE;
  if(method==='eth_call')return state.reply;
  throw Error('PRIVATE method');
 };
 const verifier=createContractAcceptanceVerifier({registry:patch.protocolVersion===undefined?registry:{network:id=>registry.network(id),deployment:(n,d)=>({...registry.deployment(n,d),protocolVersion:patch.protocolVersion})},request,isCurrent:()=>state.current,timeoutMs:patch.timeoutMs??10000,monotonicNow:patch.monotonicNow});
 return{input,calls,state,verifier};
}
test('explicit1271 acceptance binds exact digest/account/domain and arbitrary bounded signature withoutEOAfallback',async()=>{
 const f=await fixture(),result=await f.verifier.verify(f.input);assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.value.termsHash,evmTermsHash(f.input.domain,f.input.terms));assert.equal(result.value.account,W);assert.equal(result.value.economicPreparationAllowed,false);
 const call=f.calls.find(c=>c.method==='eth_call');assert.equal(call.params[0].gas,'0x186a0');assert.equal(call.params[0].to,W);assert.equal(call.params[1],'0x10');assert.ok(call.params[0].data.startsWith('0x1626ba7e'+result.value.termsHash));
 assert.deepEqual(f.input.signature,new Uint8Array([7,8,9]));assert.ok(f.calls.every(c=>!/(send|signTyped|personal_sign)/.test(c.method)));f.verifier.dispose();
});
test('wrongmagic,short/oversized return,revert,nocode,currentchain/code and canonical reorg failures reject',async()=>{
 for(const patch of [{reply:'0xffffffff'+'0'.repeat(56)},{reply:'0x1626ba7e'},{reply:MAGIC+'00'},{reply:'0x'+'00'.repeat(65536)},{code:'0x'},
  {intercept:(m)=>{if(m==='eth_call')throw new Proxy({},{getPrototypeOf(){throw Error('PRIVATE');}});}},
  {intercept:m=>m==='eth_chainId'?'0x1':undefined},
  {intercept:(m,p,s)=>{if(m==='eth_call')s.anchor='0x'+'34'.repeat(32);}},
 ]){const f=await fixture(patch),result=await f.verifier.verify(f.input);assert.equal(result.ok,false,JSON.stringify(patch));assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);f.verifier.dispose();}
});
test('everyverification rereads mutable wallet validity; inputs snapshot beforeawait and generation changes suppress results',async()=>{
 const f=await fixture();const first=await f.verifier.verify(f.input);assert.equal(first.ok,true);f.state.reply='0xffffffff'+'0'.repeat(56);assert.equal((await f.verifier.verify(f.input)).ok,false);
 const g=await fixture({intercept:(m,p,s)=>{if(m==='eth_call')s.current=false;}});assert.equal((await g.verifier.verify(g.input)).error.code,'LOCKED');
 const held=deferred(),h=await fixture({intercept:async(m)=>m==='eth_call'?held.promise:undefined});const expected=evmTermsHash(h.input.domain,h.input.terms),pending=h.verifier.verify(h.input);
 while(!h.calls.some(c=>c.method==='eth_call'))await new Promise(r=>setImmediate(r));h.input.terms.amountBaseUnits='2';h.input.walletAccount='0x'+'99'.repeat(20);h.input.signature.fill(0);held.resolve(MAGIC);
 const result=await pending;assert.equal(result.ok,true);assert.equal(result.value.account,W);assert.equal(result.value.termsHash,expected);[f,g,h].forEach(v=>v.verifier.dispose());
});
test('signature and role bounds refuse beforeRPC; missingcontract code never invokesEOArecovery',async()=>{
 const f=await fixture();for(const override of [{signature:new Uint8Array(4097)},{signature:new Uint8Array()},{role:'buyer'},{sessionGeneration:-1}])assert.equal((await f.verifier.verify({...f.input,...override})).ok,false);assert.equal(f.calls.length,0);
 f.state.code='0x';assert.equal((await f.verifier.verify(f.input)).error.code,'UNSUPPORTED_PROVIDER');assert.equal(f.calls.some(c=>c.method==='eth_call'),false);f.verifier.dispose();
});
test('cancel/timeout/dispose returnpromptly while ignoredphysicalRPC retains boundedslots and issuesnolaterreads',async()=>{
 const held=deferred(),f=await fixture({intercept:async m=>m==='eth_call'?held.promise:undefined,timeoutMs:10});
 const result=await f.verifier.verify(f.input);assert.equal(result.ok,false);assert.equal(result.error.code,'TIMEOUT');
 const result2=await f.verifier.verify(f.input);assert.equal(result2.ok,false);assert.equal((await f.verifier.verify(f.input)).error.code,'LIMIT_EXCEEDED');
 const count=f.calls.length;held.resolve(MAGIC);await new Promise(r=>setImmediate(r));assert.equal(f.calls.length,count);f.verifier.dispose();
 const hold=deferred(),g=await fixture({intercept:async m=>m==='eth_call'?hold.promise:undefined});const pending=g.verifier.verify(g.input);while(!g.calls.some(c=>c.method==='eth_call'))await new Promise(r=>setImmediate(r));g.verifier.dispose();assert.equal((await pending).error.code,'CANCELLED');hold.resolve(MAGIC);
});

test('malformed signals cannot leak slots or expose private diagnostics',async()=>{
 const f=await fixture();for(const signal of [{},{get aborted(){throw Error('PRIVATE')}}]){const r=await f.verifier.verify(f.input,signal);assert.equal(r.ok,false);assert.equal(r.error.code,'INVALID_INPUT');assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);}
 const controller=new AbortController();controller.signal.addEventListener=()=>{throw Error('PRIVATE')};assert.equal((await f.verifier.verify(f.input,controller.signal)).ok,true);f.verifier.dispose();
});
test('clock callbacks cannot revoke the final scope and still publish acceptance',async()=>{
 let f,ticks=0,ending=0;f=await fixture({monotonicNow:()=>{if(f?.calls.length===10&&++ending===2)f.state.current=false;return++ticks;}});
 const r=await f.verifier.verify(f.input);assert.equal(f.state.current,false);assert.equal(r.ok,false);assert.equal(r.error.code,'LOCKED');f.verifier.dispose();
});
test('input reentry cannot exceed the physical verification budget',async()=>{
 const held=deferred(),f=await fixture({intercept:async m=>m==='eth_chainId'?held.promise:undefined}),nested=[];let once=false;
 const input=new Proxy(f.input,{ownKeys(t){if(!once){once=true;nested.push(f.verifier.verify(f.input),f.verifier.verify(f.input));}return Reflect.ownKeys(t);}});
 const outer=await f.verifier.verify(input);assert.equal(outer.error.code,'LIMIT_EXCEEDED');assert.equal(f.calls.length,2);f.verifier.dispose();await Promise.all(nested);held.resolve('0x7a69');
});

test('unknown deployment protocol versions never reach native verification',async()=>{const f=await fixture({protocolVersion:2});assert.equal((await f.verifier.verify(f.input)).error.code,'UNSUPPORTED_PROVIDER');assert.equal(f.calls.length,0);f.verifier.dispose();});

test('calldata encodes the exact dynamic signature bytes and zero padding at the anchored block', async () => {
 const f=await fixture();
 try {
  const signature=Uint8Array.from({length:33},(_,i)=>i+1);
  Object.defineProperties(signature,{byteLength:{get(){throw Error('PRIVATE length');}},length:{get(){throw Error('PRIVATE length');}}});
  const result=await f.verifier.verify({...f.input,signature});assert.equal(result.ok,true,JSON.stringify(result));
  const call=f.calls.find(item=>item.method==='eth_call'),digest=evmTermsHash(f.input.domain,f.input.terms);
  const raw=Buffer.from(Array.from({length:33},(_,i)=>i+1)).toString('hex');
  assert.equal(call.params[0].data,'0x1626ba7e'+digest+'40'.padStart(64,'0')+'21'.padStart(64,'0')+raw+'0'.repeat(62));
  assert.equal(call.params[1],'0x10');
 }finally{f.verifier.dispose();}
});

test('wrong domain, role account and native deployment identity never establish acceptance', async () => {
 for(const change of [
  f=>{f.input.domain.chainId='1';},
  f=>{f.input.domain.verifyingContract='0x'+'99'.repeat(20);},
  f=>{f.input.walletAccount='0x'+'99'.repeat(20);},
  f=>{f.state.intercept=(method,params)=>method==='eth_getBlockByNumber'&&params[0]==='0x0'?{number:'0x0',hash:'0x'+'00'.repeat(32),timestamp:'0x0'}:undefined;},
  f=>{f.state.intercept=(method,params)=>method==='eth_getCode'&&params[0]!==W?'0x6001':undefined;},
 ]){
  const f=await fixture();try{change(f);const result=await f.verifier.verify(f.input);assert.equal(result.ok,false);assert.equal(f.calls.some(call=>call.method==='eth_call'),false);}finally{f.verifier.dispose();}
 }
});

test('malformed header fields and wallet-code changes refuse with fixed errors', async () => {
 let accessorCalls=0;
 for(const intercept of [
  (method,params)=>method==='eth_getBlockByNumber'&&params[0]==='latest'?{number:'0x00',hash:H,timestamp:'0x1000'}:undefined,
  (method,params)=>method==='eth_getBlockByNumber'&&params[0]==='latest'?{number:'0x10',get hash(){accessorCalls++;throw Error('PRIVATE header');},timestamp:'0x1000'}:undefined,
  (method,params,state)=>{if(method==='eth_call')state.code='0x6001';},
 ]){
  const f=await fixture({intercept});try{const result=await f.verifier.verify(f.input);assert.equal(result.ok,false);assert.equal(result.error.code,'INTEGRITY_FAILURE');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);}finally{f.verifier.dispose();}
 }
 assert.equal(accessorCalls,0);
});
