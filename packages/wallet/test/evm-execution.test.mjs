import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvmExecution,parsePreparedEvmRequest} from '../src/evm-execution.ts';
const account='0x'+'12'.repeat(20),to='0x'+'34'.repeat(20),hash='0x'+'56'.repeat(32);
const success=value=>({ok:true,value});
const val=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const err=(r,code)=>{assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.error.code,code);assert.doesNotMatch(JSON.stringify(r),/SECRET|https:\/\//);};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function setup(change={}){
 const request={version:1,chainId:'31337',from:account,to,value:'7',data:'0x1234',nonce:'1'};
 const intent={version:1,intentId:Buffer.alloc(32,1).toString('base64url'),binding:{chain:'evm',networkId:'local-evm',deploymentId:'escrow-v1',tradeId:'trade-1'},account,action:'fund',state:'prepared',walletGeneration:3,expectedEscrowState:'absent',preparedRequest:JSON.stringify(request),submission:{chain:'evm',hash:null,nonce:'1'},replacementOf:null,createdAt:0,updatedAt:0};
 const events=[];let current=true,state='absent';const session={account,chainId:'31337',generation:3};
 const journal={reserve:async()=>{events.push('reserve');if(state!=='absent')return{ok:false,error:{code:'CONFLICT'}};state='prepared';return success('record');},markSending:async()=>{events.push('marker');assert.equal(state,'prepared');state='broadcast-unknown';return success(undefined);},recordBroadcast:async(_id,result)=>{events.push('known-hash');assert.equal(result,hash);state='pending';return success(undefined);}};
 const provider={request:async({method,params})=>{events.push(method);if(method==='eth_accounts')return[account];if(method==='eth_chainId')return'0x7a69';if(method==='eth_sendTransaction'){assert.equal(state,'broadcast-unknown');assert.deepEqual(params,[{from:account,to,value:'0x7',data:'0x1234',nonce:'0x1',chainId:'0x7a69'}]);return hash;}throw Error('unexpected');}};
 const options={provider,session,isCurrent:()=>current,journal,validateCanonical:async(_intent,tx)=>{assert.deepEqual(tx,request);return success(undefined);},...change};
 return{execution:createEvmExecution(options),intent,request,events,provider,journal,options,setCurrent:v=>current=v,state:()=>state};
}
test('explicit send is preceded by reservation and durable marker, persisted hash, no duplicate attempt',async()=>{
 const s=setup();assert.deepEqual(val(await s.execution.submit(s.intent,0)),{hash});assert.deepEqual(s.events,['eth_accounts','eth_chainId','reserve','marker','eth_accounts','eth_chainId','eth_sendTransaction','known-hash']);err(await s.execution.submit(s.intent,0),'CONFLICT');assert.equal(s.events.filter(x=>x==='eth_sendTransaction').length,1);s.execution.dispose();err(await s.execution.submit(s.intent,0),'LOCKED');
});
test('strict prepared transactions reject unknown fields, noncanonical JSON, malformed quantities and binding mismatch',async()=>{
 for(const change of [{extra:true},{to:'0x'+'00'.repeat(20)},{from:account.toUpperCase()},{nonce:'01'},{nonce:String(1n<<64n)},{value:'-1'},{data:'0x1'},{chainId:'0'}]){
  const s=setup(),intent={...s.intent,preparedRequest:JSON.stringify({...s.request,...change})};err(await s.execution.submit(intent,0),'INVALID_INPUT');assert.deepEqual(s.events,[]);
 }
 const s=setup();assert.throws(()=>parsePreparedEvmRequest(JSON.stringify(s.request,null,2)));assert.throws(()=>parsePreparedEvmRequest(JSON.stringify(s.request).replace('"version":1','"version":1,"version":1')));
 for(const change of [{walletGeneration:4},{account:to},{submission:{chain:'evm',hash:null,nonce:'2'}}])err(await s.execution.submit({...s.intent,...change},0),'INVALID_INPUT');
});
test('unavailable canonical approval, wrong active account or chain never reaches marker/send',async()=>{
 const no=setup({validateCanonical:()=>success('not-void')});err(await no.execution.submit(no.intent,0),'INTEGRITY_FAILURE');assert.deepEqual(no.events,[]);
 for(const [method,result,code] of [['eth_accounts',[to],'UNAUTHORIZED'],['eth_chainId','0x1','WRONG_CHAIN']]){
  const s=setup();const original=s.provider.request;s.provider.request=async args=>args.method===method?result:original(args);err(await s.execution.submit(s.intent,0),code);assert.equal(s.events.includes('reserve'),false);
 }
});
test('a durable marker winning lock/cancel never calls a wallet and remains unknown',async()=>{
 for(const reason of ['lock','cancel','marker-unknown']){
  const s=setup(),controller=new AbortController();s.journal.markSending=async()=>{if(reason==='lock')s.setCurrent(false);if(reason==='cancel')controller.abort();return reason==='marker-unknown'?{ok:false,error:{code:'BROADCAST_UNKNOWN'}}:success(undefined);};
  err(await s.execution.submit(s.intent,0,controller.signal),'BROADCAST_UNKNOWN');assert.equal(s.events.includes('eth_sendTransaction'),false);
 }
});
test('unknown or rejected broadcasts and failed hash persistence never trigger retry or false rollback',async()=>{
 for(const result of ['malformed','reject','persist']){
  const s=setup(),original=s.provider.request;s.provider.request=async args=>{if(args.method!=='eth_sendTransaction')return original(args);s.events.push('eth_sendTransaction');if(result==='reject')throw{code:4001,message:'SECRET https://wallet.invalid'};return result==='malformed'?'0x12':hash;};
  if(result==='persist')s.journal.recordBroadcast=async()=>({ok:false,error:{code:'LOCKED'}});
  err(await s.execution.submit(s.intent,0),'BROADCAST_UNKNOWN');err(await s.execution.submit(s.intent,0),'CONFLICT');assert.equal(s.events.filter(x=>x==='eth_sendTransaction').length,1);
 }
});
test('uncancellable physical sends hold one slot and late account change suppresses output',async()=>{
 const gate=deferred(),entered=deferred(),s=setup(),original=s.provider.request;s.provider.request=async args=>{if(args.method!=='eth_sendTransaction')return original(args);entered.resolve();return gate.promise;};
 const pending=s.execution.submit(s.intent,0);await entered.promise;err(await s.execution.submit(s.intent,0),'CONFLICT');s.setCurrent(false);gate.resolve(hash);err(await pending,'BROADCAST_UNKNOWN');assert.equal(s.state(),'broadcast-unknown');
});
test('pre-aborted/cancelled validation and hostile provider failures return fixed errors without sends',async()=>{
 const s=setup(),controller=new AbortController();controller.abort();err(await s.execution.submit(s.intent,0,controller.signal),'CANCELLED');assert.deepEqual(s.events,[]);
 const entered=deferred(),gate=deferred(),s2=setup({validateCanonical:async()=>{entered.resolve();await gate.promise;return success(undefined);}}),c=new AbortController();const pending=s2.execution.submit(s2.intent,0,c.signal);await entered.promise;c.abort();gate.resolve();err(await pending,'CANCELLED');assert.deepEqual(s2.events,[]);
 const revoked=Proxy.revocable({},{});revoked.revoke();const s3=setup();s3.provider.request=async()=>{throw revoked.proxy;};err(await s3.execution.submit(s3.intent,0),'UNAVAILABLE');
});
test('silent account or chain changes during durable preparation are rechecked before sending',async()=>{
 for(const changed of ['account','chain']){
  const s=setup(),original=s.provider.request;let marked=false;
  s.journal.markSending=async()=>{marked=true;return success(undefined);};
  s.provider.request=async args=>marked&&args.method===(changed==='account'?'eth_accounts':'eth_chainId')?(changed==='account'?[to]:'0x1'):original(args);
  err(await s.execution.submit(s.intent,0),'BROADCAST_UNKNOWN');assert.equal(s.events.includes('eth_sendTransaction'),false);
 }
});
test('abort returns an unknown result promptly but does not free an unsettled provider slot',async()=>{
 const s=setup(),controller=new AbortController(),entered=deferred(),gate=deferred(),original=s.provider.request;
 s.provider.request=async args=>{if(args.method!=='eth_sendTransaction')return original(args);entered.resolve();return gate.promise;};
 const pending=s.execution.submit(s.intent,0,controller.signal);await entered.promise;controller.abort();
 err(await pending,'BROADCAST_UNKNOWN');err(await s.execution.submit(s.intent,0),'CONFLICT');gate.resolve(hash);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(s.state(),'broadcast-unknown');err(await s.execution.submit(s.intent,0),'CONFLICT');
});
test('disposal promptly settles held validator and provider work without caller abort signal',async()=>{
 for(const stage of ['validator','provider']){
  const entered=deferred(),gate=deferred();
  const s=setup(stage==='validator'?{validateCanonical:async()=>{entered.resolve();await gate.promise;return success(undefined);}}:{});
  if(stage==='provider'){const original=s.provider.request;s.provider.request=async args=>{if(args.method!=='eth_sendTransaction')return original(args);entered.resolve();return gate.promise;};}
  const pending=s.execution.submit(s.intent,0);await entered.promise;s.execution.dispose();
  err(await pending,stage==='validator'?'LOCKED':'BROADCAST_UNKNOWN');err(await s.execution.submit(s.intent,0),'LOCKED');
  gate.resolve(stage==='validator'?undefined:hash);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.events.includes('known-hash'),false);if(stage==='validator')assert.equal(s.events.includes('eth_sendTransaction'),false);
 }
});
test('exceptions during or after a durable marker preserve an unknown attempt without sending',async()=>{
 for(const phase of ['marker','final-accounts','final-chain']){
  const s=setup(),mark=s.journal.markSending,request=s.provider.request;
  s.journal.markSending=async(...args)=>{await mark(...args);if(phase==='marker')throw Error('SECRET marker readback');return success(undefined);};
  s.provider.request=async args=>{if(s.state()==='broadcast-unknown'&&args.method===(phase==='final-accounts'?'eth_accounts':phase==='final-chain'?'eth_chainId':'never'))throw Error('SECRET provider detail');return request(args);};
  err(await s.execution.submit(s.intent,0),'BROADCAST_UNKNOWN');assert.equal(s.events.includes('eth_sendTransaction'),false);assert.equal(s.state(),'broadcast-unknown');
  err(await s.execution.submit(s.intent,0),'CONFLICT');
 }
});
