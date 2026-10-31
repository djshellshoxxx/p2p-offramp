import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak_256} from '@noble/hashes/sha3.js';
import {EvmChainReader,MAX_RPC_READS,MAX_RUNTIME_CODE_BYTES} from '../src/reader.ts';
const hx = n => '0x'+n.repeat(64);
const seller='0x'+'11'.repeat(20),buyer='0x'+'22'.repeat(20),contract='0x'+'33'.repeat(20),token='0x'+'44'.repeat(20),zero='0x'+'00'.repeat(20);
const binding={chain:'evm',networkId:'local',deploymentId:'escrow',tradeId:'55'.repeat(32)};
const code='0x60006000', codehash=Buffer.from(keccak_256(Buffer.from(code.slice(2),'hex'))).toString('hex');
const genesis={number:'0x0',hash:hx('a'),timestamp:'0x1'},finalized={number:'0xa',hash:hx('b'),timestamp:'0x64'};
const wanted={seller,buyer,asset:zero,amountBaseUnits:'1000',expirySeconds:'2000'};
const network={id:'local',chain:'evm',chainIdentity:'31337',genesisHash:genesis.hash,finality:{kind:'evm-finalized-tag'},assets:[{id:'native',kind:'native',address:null},{id:'token',kind:'erc20',address:token}]};
const deployment={id:'escrow',address:contract,runtime:{kind:'evm-code',keccak256:codehash,upgradeable:false},supportedAssetIds:['native','token']};
const word=v=>BigInt(v).toString(16).padStart(64,'0');
const state=(status=1,changes={})=>{const x={...wanted,...changes};return '0x'+[word(x.seller),word(x.buyer),word(x.asset),word(x.amountBaseUnits),word(x.expirySeconds),word(status)].join('');};
const ok=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const error=(result,code)=>{assert.equal(result.ok,false);assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/SECRET|rpc\.invalid/);};
function setup(changes={}) {
 const calls=[];let escrow=state();
 const rpc={async request(input){calls.push(input);if(changes.handle){const value=await changes.handle(input);if(value!==undefined)return value;}
  switch(input.method){
   case'eth_chainId':return'0x7a69';
   case'eth_getBlockByNumber':return input.params[0]==='0x0'?genesis:finalized;
   case'eth_getCode':return code;
   case'eth_call':return escrow;
   case'eth_getTransactionReceipt':return null;
   default:throw Error('SECRET provider diagnostics https://rpc.invalid');
  }
 }};
 const registry={network:id=>id==='local'?{...network,...changes.network}:null,deployment:(_n,id)=>id==='escrow'?{...deployment,...changes.deployment}:null};
 const reader=new EvmChainReader({rpc,registry,now:()=>123,...changes.options});
 return{reader,calls,setEscrow:value=>escrow=value};
}
const request=()=>({generation:2,requestSequence:4,signal:new AbortController().signal});

test('finalized escrow snapshot validates chain/genesis/code and all immutable fields at one anchor',async()=>{
 const s=setup();try{
  const live=ok(await s.reader.validateLive('local','escrow'));assert.equal(live.codeKeccak256,codehash);assert.equal(live.height,'10');
  const result=ok(await s.reader.read(binding,request(),wanted));assert.equal(result.escrow.state,'funded');assert.deepEqual(result.observation,{binding,generation:2,requestSequence:4,anchor:{height:'10',hash:finalized.hash},state:'funded',finality:'finalized',observedAt:123});
  assert.deepEqual(s.calls.find(x=>x.method==='eth_call').params.slice(1),['0xa']);assert.equal(s.calls.find(x=>x.method==='eth_getCode').params[1],'0xa');
  for(const [n,name]of [[2,'released'],[3,'refunded']]){s.setEscrow(state(n));assert.equal(ok(await s.reader.readValidated(binding,request(),wanted)).state,name);}
  s.setEscrow('0x'+'0'.repeat(384));assert.equal(ok(await s.reader.read(binding,request(),wanted)).escrow.state,'absent');
 }finally{s.reader.dispose();}
});

test('wrong chain/genesis/runtime/asset and changed anchors fail closed',async()=>{
 const cases=[
  [{handle:i=>i.method==='eth_chainId'?'0x1':undefined},'WRONG_CHAIN'],
  [{network:{genesisHash:hx('c')}},'WRONG_CHAIN'],
  [{deployment:{runtime:{kind:'evm-code',keccak256:'0'.repeat(64),upgradeable:false}}},'INTEGRITY_FAILURE'],
  [{deployment:{runtime:{kind:'evm-code',keccak256:codehash,upgradeable:true}}},'UNSUPPORTED_PROVIDER'],
  [{handle:i=>i.method==='eth_getBlockByNumber'&&i.params[0]==='0xa'?{...finalized,hash:hx('c')}:undefined},'INTEGRITY_FAILURE'],
  [{handle:i=>i.method==='eth_getBlockByNumber'&&i.params[0]==='finalized'?null:undefined},'INTEGRITY_FAILURE'],
  [{deployment:{supportedAssetIds:[]}},'UNSUPPORTED_PROVIDER'],
 ];
 for(const [options,expected]of cases){const s=setup(options);try{error(await s.reader.read(binding,request(),wanted),expected);}finally{s.reader.dispose();}}
 const s=setup();try{error(await s.reader.read({...binding,tradeId:'not-a-digest'},request(),wanted),'INVALID_INPUT');error(await s.reader.validateLive('unknown','escrow'),'UNSUPPORTED_PROVIDER');}finally{s.reader.dispose();}
});

test('ABI corruption, swapped immutable fields, overflow and nonzero absent slots are rejected',async()=>{
 const invalid=[state(4),state(1,{seller:buyer}),state(1,{amountBaseUnits:'1001'}),state(1,{asset:token}),state(1,{expirySeconds:(1n<<64n).toString()}),state(0),state().slice(0,-1),state()+'00','0x'+'f'.repeat(384)];
 const s=setup();try{for(const raw of invalid){s.setEscrow(raw);error(await s.reader.read(binding,request(),wanted),'INTEGRITY_FAILURE');}}
 finally{s.reader.dispose();}
});

test('RPC inputs are bounded and hostile result accessors/provider errors are fixed diagnostics',async()=>{
 let touched=0;const hostile={...finalized};Object.defineProperty(hostile,'hash',{get(){touched++;throw Error('SECRET');}});
 const cases=[
  [i=>i.method==='eth_getBlockByNumber'&&i.params[0]==='finalized'?hostile:undefined,'INTEGRITY_FAILURE'],
  [i=>i.method==='eth_getCode'?'0x'+'00'.repeat(MAX_RUNTIME_CODE_BYTES+1):undefined,'INTEGRITY_FAILURE'],
  [i=>i.method==='eth_chainId'?'0x07a69':undefined,'INTEGRITY_FAILURE'],
  [i=>{if(i.method==='eth_getCode')throw Error('SECRET');},'UNAVAILABLE'],
 ];
 for(const [handle,expected]of cases){const s=setup({handle});try{error(await s.reader.read(binding,request(),wanted),expected);}finally{s.reader.dispose();}}
 assert.equal(touched,0);
});

const txhash=hx('d'),data='0x12345678'+binding.tradeId;
const expectedTx={hash:txhash,from:seller,to:contract,data,value:'0',nonce:'9'};
const nativeReceipt={transactionHash:txhash,blockHash:finalized.hash,blockNumber:'0xa',from:seller,to:contract,status:'0x1'};
const nativeTx={hash:txhash,from:seller,to:contract,blockHash:finalized.hash,blockNumber:'0xa',nonce:'0x9',input:data,value:'0x0'};
function receiptSetup(changes={}){return setup({handle:i=>i.method==='eth_getTransactionReceipt'?{...nativeReceipt,...changes.receipt}:i.method==='eth_getTransactionByHash'?{...nativeTx,...changes.tx}:i.method==='eth_getBlockByNumber'&&i.params[0]==='0xb'?{...finalized,number:'0xb',hash:hx('c')}:changes.handle?.(i)});}

test('receipts bind hash/from/to/nonce/calldata/value and canonical finalized block',async()=>{
 const s=receiptSetup();try{const result=ok(await s.reader.receipt(binding,expectedTx));assert.equal(result.kind,'finalized');assert.equal(result.succeeded,true);assert.equal(result.nonce,'9');}finally{s.reader.dispose();}
 for(const changes of [{receipt:{transactionHash:hx('e')}},{receipt:{from:buyer}},{tx:{to:buyer}},{tx:{nonce:'0xa'}},{tx:{input:'0xdeadbeef'}},{tx:{value:'0x1'}},{tx:{blockHash:hx('c')}},{receipt:{status:'0x2'}}]){
  const s=receiptSetup(changes);try{error(await s.reader.receipt(binding,expectedTx),'INTEGRITY_FAILURE');}finally{s.reader.dispose();}
 }
 const failed=receiptSetup({receipt:{status:'0x0'}});try{assert.equal(ok(await failed.reader.receipt(binding,expectedTx)).succeeded,false);}finally{failed.reader.dispose();}
});

test('unknown, pending and reorged receipts do not become false finality',async()=>{
 const unknown=setup();try{assert.deepEqual(ok(await unknown.reader.receipt(binding,expectedTx)),{kind:'unknown',transactionHash:txhash,anchor:null,succeeded:null,nonce:null});}finally{unknown.reader.dispose();}
 const pending=receiptSetup({receipt:{blockNumber:'0xb',blockHash:hx('c')},tx:{blockNumber:'0xb',blockHash:hx('c')}});try{assert.equal(ok(await pending.reader.receipt(binding,expectedTx)).kind,'pending');}finally{pending.reader.dispose();}
 const reorg=receiptSetup({receipt:{blockHash:hx('c')},tx:{blockHash:hx('c')}});try{const result=ok(await reorg.reader.receipt(binding,expectedTx));assert.equal(result.kind,'reorged');assert.equal(result.succeeded,null);}finally{reorg.reader.dispose();}
});

test('cancel/dispose return promptly, discard late reads and retain physical slots until drain',async()=>{
 const held=[];const s=setup({handle:i=>i.method==='eth_chainId'?new Promise(resolve=>held.push(resolve)):undefined});
 const controllers=Array.from({length:MAX_RPC_READS},()=>new AbortController());
 const jobs=controllers.map(c=>s.reader.validateLive('local','escrow',c.signal));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(held.length,MAX_RPC_READS);
 controllers.forEach(c=>c.abort());for(const job of jobs)error(await job,'CANCELLED');
 error(await s.reader.validateLive('local','escrow'),'LIMIT_EXCEEDED');
 for(const resolve of held)resolve('0x7a69');await new Promise(resolve=>setImmediate(resolve));
 s.reader.dispose();error(await s.reader.validateLive('local','escrow'),'CANCELLED');
 assert.equal(s.calls.filter(x=>x.method!=='eth_chainId').length,0,'late responses cannot issue follow-up reads');
});

test('read timeout rejects with fixed code and does not free an ignored physical request early',async()=>{
 const s=setup({options:{timeoutMs:10},handle:i=>i.method==='eth_chainId'?new Promise(()=>{}):undefined});
 try{error(await s.reader.validateLive('local','escrow'),'TIMEOUT');}finally{s.reader.dispose();}
});
