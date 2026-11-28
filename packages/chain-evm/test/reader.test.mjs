import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak_256} from '@noble/hashes/sha3.js';
import {EvmChainReader,MAX_RPC_READS,MAX_RUNTIME_CODE_BYTES} from '../src/reader.ts';
import {decodeTrade} from '../../wallet/src/evm-escrow.ts';
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
/** EIP-1898 block parameter every state read must carry: the anchored finalized hash, canonical required. */
const anchored={blockHash:finalized.hash,requireCanonical:true};
const exactAnchor=(value,hash=finalized.hash)=>Object.isFrozen(value)&&JSON.stringify(value)===JSON.stringify({blockHash:hash,requireCanonical:true});
const rpcError=(code,message)=>Object.assign(new Error(message),{code});
/** The default fake node refuses any state read not pinned exactly to the anchored hash (no number, tag or loose object). */
const strictBlock=value=>{if(!exactAnchor(value))throw rpcError(-32602,'invalid argument 1: block parameter');};
const ok=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const error=(result,code)=>{assert.equal(result.ok,false);assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/SECRET|rpc\.invalid/);};
function setup(changes={}) {
 const calls=[];let escrow=state();
 const rpc={async request(input){calls.push(input);if(changes.handle){const value=await changes.handle(input);if(value!==undefined)return value;}
  switch(input.method){
   case'eth_chainId':return'0x7a69';
   case'eth_getBlockByNumber':return input.params[0]==='0x0'?genesis:finalized;
   case'eth_getCode':strictBlock(input.params[1]);return code;
   case'eth_call':strictBlock(input.params[1]);return escrow;
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
  assert.deepEqual(result.anchor,{height:'10',hash:finalized.hash,timestampSeconds:'100',codeKeccak256:codehash});assert.equal(Object.isFrozen(result.anchor),true);
  assert.deepEqual(s.calls.find(x=>x.method==='eth_call').params.slice(1),[anchored]);assert.deepEqual(s.calls.find(x=>x.method==='eth_getCode').params,[contract,anchored]);
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

test('a receipt at the anchored height cannot be finalized by another backend\'s header for that height',async()=>{
 // A forked backend answers the receipt, the transaction and the header at 0xa from its own block 0xa (hash e..e);
 // the anchor and the recheck come from the majority (hash b..b). The header at N must equal the anchor H.
 // The anchor comes from the 'finalized' tag, so the first request for '0xa' is the receipt's header lookup.
 let forkedHeaderServed=false;
 const fork={receipt:{blockHash:hx('e')},tx:{blockHash:hx('e')},handle:i=>{
  if(i.method==='eth_getBlockByNumber'&&i.params[0]==='0xa'&&!forkedHeaderServed){forkedHeaderServed=true;return{...finalized,hash:hx('e')};}
 }};
 const s=receiptSetup(fork);
 try{error(await s.reader.receipt(binding,expectedTx),'INTEGRITY_FAILURE');assert.equal(forkedHeaderServed,true);}finally{s.reader.dispose();}
});
test('G18 receipt evidence refuses inherited fields, accessors and descriptor-trap objects without invoking foreign code', async () => {
 let getterCalls = 0;
 const receiptGetter = Object.defineProperty({...nativeReceipt}, 'transactionHash', {get() { getterCalls++; throw Error('SECRET receipt getter'); }});
 const transactionGetter = Object.defineProperty({...nativeTx}, 'input', {get() { getterCalls++; throw Error('SECRET transaction getter'); }});
 const receiptProxy = new Proxy({...nativeReceipt}, {getOwnPropertyDescriptor() { throw Error('SECRET receipt proxy'); }});
 const transactionProxy = new Proxy({...nativeTx}, {getOwnPropertyDescriptor() { throw Error('SECRET transaction proxy'); }});
 const scenarios = [
  ['eth_getTransactionReceipt', Object.create(nativeReceipt)],
  ['eth_getTransactionReceipt', receiptGetter],
  ['eth_getTransactionReceipt', receiptProxy],
  ['eth_getTransactionByHash', Object.create(nativeTx)],
  ['eth_getTransactionByHash', transactionGetter],
  ['eth_getTransactionByHash', transactionProxy],
 ];
 const readOnly = new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getTransactionReceipt','eth_getTransactionByHash']);
 for (const [method, hostile] of scenarios) {
  const s = setup({handle: input => input.method === method ? hostile :
   input.method === 'eth_getTransactionReceipt' ? nativeReceipt :
   input.method === 'eth_getTransactionByHash' ? nativeTx : undefined});
  try {
   error(await s.reader.receipt(binding,expectedTx),'INTEGRITY_FAILURE');
   assert.ok(s.calls.some(call => call.method === method));
   assert.ok(s.calls.every(call => readOnly.has(call.method)),'invalid RPC evidence cannot trigger privileged operations');
  } finally { s.reader.dispose(); }
 }
 assert.equal(getterCalls,0,'receipt evidence must not execute untrusted accessors');
});

test('canonical getTrade layout is selected only by an explicit runtime-hash policy and matches viem ABI encoding', async () => {
 const {encodeFunctionResult,toFunctionSelector}=await import('viem');
 const {readFileSync}=await import('node:fs');
 const abi=JSON.parse(readFileSync(new URL('../../../contracts/evm/abi/BasicEscrow.json',import.meta.url),'utf8'));
 const policy={[codehash]:'canonical-get-trade-v1'};
 const s=setup({options:{escrowLayouts:policy}});
 // A caller cannot switch layouts after reader construction.
 policy[codehash]='legacy-escrows-v1';
 try {
  for(const [status,name] of [[1,'funded'],[2,'released'],[3,'refunded'],[0,'absent']]) {
   for(const asset of [zero,token]) {
    const expected={...wanted,asset};
    const value=status===0?{seller:zero,deadline:0n,state:0,buyer:zero,token:zero,amount:0n}:
     {seller,deadline:BigInt(wanted.expirySeconds),state:status,buyer,token:asset,amount:BigInt(wanted.amountBaseUnits)};
    s.setEscrow(encodeFunctionResult({abi,functionName:'getTrade',result:value}));
    const snapshot=ok(await s.reader.read(binding,request(),expected));
    assert.equal(snapshot.escrow.state,name);
    if(status!==0) assert.deepEqual(snapshot.escrow,{...expected,state:name});
   }
  }
  const reads=s.calls.filter(call=>call.method==='eth_call');
  assert.ok(reads.every(call=>call.params[0].data===toFunctionSelector('getTrade(bytes32)')+binding.tradeId));
  assert.ok(reads.every(call=>exactAnchor(call.params[1])));
 } finally {s.reader.dispose();}
});

test('explicit layout policy rejects unknown runtime identities before any escrow call',async()=>{
 const s=setup({options:{escrowLayouts:{['a'.repeat(64)]:'canonical-get-trade-v1'}}});
 try{error(await s.reader.read(binding,request(),wanted),'UNSUPPORTED_PROVIDER');assert.equal(s.calls.some(call=>call.method==='eth_call'),false);}
 finally{s.reader.dispose();}
});

test('layout policy rejects accessors, invalid hashes and unsupported layouts without calling foreign accessors',()=>{
 let touched=0;
 const accessor=Object.defineProperty({},codehash,{enumerable:true,get(){touched++;return'canonical-get-trade-v1';}});
 for(const escrowLayouts of [accessor,{bad:'canonical-get-trade-v1'},{[codehash]:'unknown'},Object.create({[codehash]:'canonical-get-trade-v1'}),null,[]]) {
  assert.throws(()=>setup({options:{escrowLayouts}}));
 }
 assert.equal(touched,0);
});

test('canonical layout refuses malformed words and never falls back to a legacy selector',async()=>{
 const canonical=(status=1,changes={})=>{const x={...wanted,...changes};return'0x'+[word(x.seller),word(x.expirySeconds),word(status),word(x.buyer),word(x.asset),word(x.amountBaseUnits)].join('');};
 const s=setup({options:{escrowLayouts:{[codehash]:'canonical-get-trade-v1'}}});
 try{
  for(const raw of [canonical(4),canonical(0),canonical(1,{seller:buyer}),canonical(1,{amountBaseUnits:'0'}),canonical(1,{expirySeconds:(1n<<64n).toString()}),canonical(1,{buyer:'0x'+'f'.repeat(64)}),canonical().slice(0,-1),canonical()+'00',state()]) {
   const before=s.calls.filter(call=>call.method==='eth_call').length;
   s.setEscrow(raw);error(await s.reader.read(binding,request(),wanted),'INTEGRITY_FAILURE');
   assert.equal(s.calls.filter(call=>call.method==='eth_call').length-before,1);
  }
 }finally{s.reader.dispose();}
});

// ---------- G3 / BT-01 independent review (team-c): canonical getTrade path ----------
const sel=sig=>Buffer.from(keccak_256(Buffer.from(sig))).toString('hex').slice(0,8);
const GET_TRADE_SELECTOR=sel('getTrade(bytes32)');
/** contracts/evm BasicEscrow.getTrade -> Escrow(seller, uint64 deadline, State state, buyer, token, amount). */
const canonicalWords=(status=1,changes={})=>{const x={...wanted,...changes};return '0x'+[word(x.seller),word(x.expirySeconds),word(status),word(x.buyer),word(x.asset),word(x.amountBaseUnits)].join('');};
const dirty=(raw,index,nibble='1')=>{const words=raw.slice(2).match(/.{64}/g);words[index]=nibble+words[index].slice(1);return '0x'+words.join('');};
function canonicalSetup(changes={}){const s=setup({...changes,options:{escrowLayouts:{[codehash]:'canonical-get-trade-v1'},...changes.options}});s.setEscrow('escrow' in changes?changes.escrow:canonicalWords());return s;}
const methodsOf=calls=>calls.map(x=>x.method);

test('canonical-get-trade-v1 reads getTrade(bytes32) at the anchored finalized tag and decodes (seller,deadline,state,buyer,token,amount)',async()=>{
 const s=canonicalSetup();try{
  const result=ok(await s.reader.read(binding,request(),wanted));
  assert.deepEqual(result.escrow,{...wanted,state:'funded'});
  assert.deepEqual(result.observation,{binding,generation:2,requestSequence:4,anchor:{height:'10',hash:finalized.hash},state:'funded',finality:'finalized',observedAt:123});
  assert.deepEqual(s.calls.find(x=>x.method==='eth_call').params,[{to:contract,data:`0x${GET_TRADE_SELECTOR}${binding.tradeId}`},anchored]);
  for(const [n,name]of [[2,'released'],[3,'refunded']]){s.setEscrow(canonicalWords(n));assert.equal(ok(await s.reader.readValidated(binding,request(),wanted)).state,name);}
  s.setEscrow('0x'+'0'.repeat(384));assert.equal(ok(await s.reader.read(binding,request(),wanted)).escrow.state,'absent');
  const tokenWanted={...wanted,asset:token};s.setEscrow(canonicalWords(1,{asset:token}));assert.equal(ok(await s.reader.read(binding,request(),tokenWanted)).escrow.asset,token);
  const max={...wanted,amountBaseUnits:((1n<<256n)-1n).toString(),expirySeconds:((1n<<64n)-1n).toString()};s.setEscrow(canonicalWords(1,max));assert.deepEqual(ok(await s.reader.read(binding,request(),max)).escrow,{...max,state:'funded'});
 }finally{s.reader.dispose();}
});

test('canonical decode is strict: wrong layout, short/long, dirty address bits, out-of-range state/deadline, non-zero absent, mismatched terms',async()=>{
 const nonAbsent=f=>canonicalWords(1,f);
 const invalid=[
  ['legacy layout to canonical reader',state()],['short by one word',canonicalWords().slice(0,-64)],['short by one nibble',canonicalWords().slice(0,-1)],['long by one byte',canonicalWords()+'00'],['long by one word',canonicalWords()+'0'.repeat(64)],
  ['empty','0x'],['no prefix',canonicalWords().slice(2)],['uppercase',canonicalWords().toUpperCase().replace('0X','0x')],['all ones','0x'+'f'.repeat(384)],
  ['dirty seller',dirty(canonicalWords(),0)],['dirty buyer',dirty(canonicalWords(),3)],['dirty token',dirty(canonicalWords(),4)],['dirty token high bit',dirty(canonicalWords(),4,'8')],
  ['state 4',canonicalWords(4)],['state 255',canonicalWords(255)],['state 2^8',canonicalWords(256)],['state high bit',canonicalWords((1n<<255n).toString())],
  ['deadline 2^64',nonAbsent({expirySeconds:(1n<<64n).toString()})],['deadline zero',nonAbsent({expirySeconds:'0'})],
  ['absent with fields',canonicalWords(0)],['absent with only amount','0x'+'0'.repeat(320)+word(1)],['absent with only deadline','0x'+word(0)+word(1)+'0'.repeat(256)],
  ['funded zero seller',nonAbsent({seller:zero})],['funded zero buyer',nonAbsent({buyer:zero})],['funded zero amount',nonAbsent({amountBaseUnits:'0'})],['seller == buyer',nonAbsent({buyer:seller})],
  ['swapped seller/buyer',nonAbsent({seller:buyer,buyer:seller})],['amount mismatch',nonAbsent({amountBaseUnits:'1001'})],['token mismatch',nonAbsent({asset:token})],['deadline mismatch',nonAbsent({expirySeconds:'2001'})],
  ['numeric',1],['null',null],['object',{data:canonicalWords()}],
 ];
 const s=canonicalSetup();try{for(const [label,raw]of invalid){s.setEscrow(raw);const result=await s.reader.read(binding,request(),wanted);assert.equal(result.ok,false,label);assert.equal(result.error.code,'INTEGRITY_FAILURE',label);}}finally{s.reader.dispose();}
 // The reverse mismatch: canonical return data to a legacy-layout reader.
 const legacy=setup();try{legacy.setEscrow(canonicalWords());error(await legacy.reader.read(binding,request(),wanted),'INTEGRITY_FAILURE');}finally{legacy.reader.dispose();}
});

test('canonical reads keep chain/genesis/runtime/anchor defenses: wrong code, reorg between header and state, finalized race',async()=>{
 const wrongCode=canonicalSetup({handle:i=>i.method==='eth_getCode'?'0x60016001':undefined});
 try{error(await wrongCode.reader.read(binding,request(),wanted),'INTEGRITY_FAILURE');assert.equal(methodsOf(wrongCode.calls).includes('eth_call'),false,'no state read on wrong runtime');}finally{wrongCode.reader.dispose();}
 const upgradeable=canonicalSetup({deployment:{runtime:{kind:'evm-code',keccak256:codehash,upgradeable:true}}});
 try{error(await upgradeable.reader.read(binding,request(),wanted),'UNSUPPORTED_PROVIDER');assert.equal(upgradeable.calls.length,0);}finally{upgradeable.reader.dispose();}
 for(const changes of [{handle:i=>i.method==='eth_chainId'?'0x1':undefined},{network:{genesisHash:hx('c')}}]){const s=canonicalSetup(changes);try{error(await s.reader.read(binding,request(),wanted),'WRONG_CHAIN');assert.equal(methodsOf(s.calls).includes('eth_call'),false);}finally{s.reader.dispose();}}
 // Reorg between header and state: the block at the anchored height changes after eth_call.
 for(const changed of [{hash:hx('c')},{timestamp:'0x65'},{number:'0xb'}]){
  let read=false;const s=canonicalSetup({handle:i=>{if(i.method==='eth_call')read=true;if(i.method==='eth_getBlockByNumber'&&i.params[0]==='0xa'&&read)return{...finalized,...changed};}});
  try{error(await s.reader.read(binding,request(),wanted),'INTEGRITY_FAILURE');assert.deepEqual(methodsOf(s.calls).slice(-2),['eth_call','eth_getBlockByNumber']);}finally{s.reader.dispose();}
 }
 // Finalized race: the tag advances (and the trade settles) after the anchor; every read stays pinned to the first anchor.
 let finalizedCalls=0;const race=canonicalSetup({handle:i=>{
  if(i.method==='eth_getBlockByNumber'&&i.params[0]==='finalized'){finalizedCalls++;return finalizedCalls===1?finalized:{number:'0xb',hash:hx('c'),timestamp:'0x65'};}
  if(i.method==='eth_call')return exactAnchor(i.params[1])?canonicalWords(1):canonicalWords(2);
 }});
 try{
  const result=ok(await race.reader.read(binding,request(),wanted));assert.equal(result.escrow.state,'funded');assert.deepEqual(result.observation.anchor,{height:'10',hash:finalized.hash});
  assert.equal(finalizedCalls,1,'finalized tag is resolved exactly once per read');
  for(const call of race.calls.filter(x=>x.method==='eth_getCode'||x.method==='eth_call'))assert.ok(exactAnchor(call.params[1]),JSON.stringify(call.params[1]));
  assert.deepEqual(race.calls.filter(x=>x.method==='eth_getBlockByNumber').map(x=>x.params[0]),['0x0','finalized','0xa']);
  assert.deepEqual(methodsOf(race.calls),['eth_chainId','eth_getBlockByNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBlockByNumber']);
 }finally{race.reader.dispose();}
 for(const header of [null,{...finalized,number:'0x0a'},{...finalized,hash:'0x'+'B'.repeat(64)}]){
  const s=canonicalSetup({handle:i=>i.method==='eth_getBlockByNumber'&&i.params[0]==='finalized'?header:undefined});
  try{error(await s.reader.read(binding,request(),wanted),'INTEGRITY_FAILURE');assert.equal(methodsOf(s.calls).includes('eth_call'),false);}finally{s.reader.dispose();}
 }
});

test('canonical reads keep cancellation and fixed diagnostics; a late state result publishes nothing',async()=>{
 let release;const s=canonicalSetup({handle:i=>i.method==='eth_call'?new Promise(resolve=>{release=resolve;}):undefined});
 try{
  const controller=new AbortController(),pending=s.reader.read(binding,{generation:1,requestSequence:1,signal:controller.signal},wanted);
  for(let spins=0;!release&&spins<1000;spins++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(release,'eth_call reached the RPC');
  controller.abort();error(await pending,'CANCELLED');
  const before=s.calls.length;release(canonicalWords());await new Promise(resolve=>setImmediate(resolve));assert.equal(s.calls.length,before,'late state cannot trigger the anchor recheck');
 }finally{s.reader.dispose();}
 const leak=canonicalSetup({handle:i=>{if(i.method==='eth_call')throw Error('SECRET https://rpc.invalid');}});try{error(await leak.reader.read(binding,request(),wanted),'UNAVAILABLE');}finally{leak.reader.dispose();}
});

test('canonical decoder is at least as strict as wallet decodeTrade and agrees on every vector both accept',async()=>{
 const vectors=[canonicalWords(1),canonicalWords(2),canonicalWords(3),canonicalWords(1,{asset:token}),'0x'+'0'.repeat(384),canonicalWords(0),canonicalWords(4),dirty(canonicalWords(),0),dirty(canonicalWords(),3),dirty(canonicalWords(),4),
  canonicalWords(1,{expirySeconds:(1n<<64n).toString()}),canonicalWords(1,{amountBaseUnits:'0'}),canonicalWords(1,{seller:zero}),canonicalWords(1,{buyer:zero}),canonicalWords(1,{buyer:seller}),canonicalWords(1,{expirySeconds:'0'}),
  canonicalWords().slice(0,-2),canonicalWords()+'00',canonicalWords().toUpperCase().replace('0X','0x')];
 let agreed=0;
 for(const raw of vectors){
  let walletTrade=null;try{walletTrade=decodeTrade(raw);}catch{/* rejected by wallet */}
  const expectation=walletTrade&&walletTrade.state!=='absent'&&walletTrade.seller!==walletTrade.buyer?{seller:walletTrade.seller,buyer:walletTrade.buyer,asset:walletTrade.token,amountBaseUnits:walletTrade.amount,expirySeconds:walletTrade.deadline==='0'?'1':walletTrade.deadline}:wanted;
  const s=canonicalSetup({escrow:raw});try{
   const result=await s.reader.read(binding,request(),expectation);
   if(!walletTrade)assert.equal(result.ok,false,`reader must reject what wallet rejects: ${raw}`);
   else if(result.ok){agreed++;assert.deepEqual(result.value.escrow,{seller:walletTrade.seller,buyer:walletTrade.buyer,asset:walletTrade.token,amountBaseUnits:walletTrade.amount,expirySeconds:walletTrade.deadline,state:walletTrade.state});}
   else assert.equal(result.error.code,'INTEGRITY_FAILURE');
  }finally{s.reader.dispose();}
 }
 assert.equal(agreed,5,'funded/released/refunded/token/absent vectors decode identically');
});

test('layout policy snapshot: hostile keys/shapes refused; legacy default unchanged; deployment hash change is unsupported',async()=>{
 const rpc={request:async()=>{throw Error('no rpc');}},registry={network:()=>null,deployment:()=>null};
 const sym=Symbol('x'),many=Object.fromEntries(Array.from({length:129},(_,i)=>[i.toString(16).padStart(64,'0'),'canonical-get-trade-v1']));
 const proxy=new Proxy({[codehash]:'canonical-get-trade-v1'},{getOwnPropertyDescriptor(){throw Error('SECRET');}});
 for(const escrowLayouts of [{[codehash.toUpperCase()]:'canonical-get-trade-v1'},{['0x'+codehash]:'canonical-get-trade-v1'},{[sym]:'canonical-get-trade-v1'},many,proxy,new Map([[codehash,'canonical-get-trade-v1']]),
  JSON.parse(`{"__proto__":"canonical-get-trade-v1"}`),{[codehash]:'canonical-basic-v1'},{[codehash]:new String('canonical-get-trade-v1')},'canonical-get-trade-v1',1])
  assert.throws(()=>new EvmChainReader({rpc,registry,escrowLayouts}),/Invalid EVM escrow layout policy/);
 const empty=setup({options:{escrowLayouts:{}}});try{error(await empty.reader.read(binding,request(),wanted),'UNSUPPORTED_PROVIDER');assert.equal(empty.calls.some(x=>x.method==='eth_call'),false);}finally{empty.reader.dispose();}
 const nullProto=Object.assign(Object.create(null),{[codehash]:'canonical-get-trade-v1'});const s=canonicalSetup({options:{escrowLayouts:nullProto}});try{ok(await s.reader.read(binding,request(),wanted));}finally{s.reader.dispose();}
 const legacy=setup();try{ok(await legacy.reader.read(binding,request(),wanted));assert.equal(legacy.calls.find(x=>x.method==='eth_call').params[0].data,`0x${sel('escrows(bytes32)')}${binding.tradeId}`);}finally{legacy.reader.dispose();}
 const mapped=setup({options:{escrowLayouts:{[codehash]:'legacy-escrows-v1'}}});try{ok(await mapped.reader.read(binding,request(),wanted));}finally{mapped.reader.dispose();}
});

// ---------- C-L1: state reads are bound to the anchored block hash (EIP-1898 { blockHash, requireCanonical: true }) ----------
// Honest-but-inconsistent backends: one RPC URL fronts several honest nodes that disagree on block 0xa (a short fork)
// or on height. The finalized header comes from one backend and a state read can land on another.
const parent={number:'0x9',hash:hx('9'),timestamp:'0x63'};   // shared ancestor at 0x9: escrow funded
const forkA=finalized;                                        // block 0xa on the majority chain: escrow funded
const forkB={number:'0xa',hash:hx('f'),timestamp:'0x64'};     // a competing block 0xa on a short fork: escrow released
const child={number:'0xb',hash:hx('c'),timestamp:'0x65'};     // 0xb built on forkA: escrow released after the anchor
const STATE_AT=new Map([[parent.hash,state(1)],[forkA.hash,state(1)],[forkB.hash,state(2)],[child.hash,state(2)]]);
const TRUTH=new Map([[parent.hash,'funded'],[forkA.hash,'funded'],[forkB.hash,'released'],[child.hash,'released']]);
const plainRegistry={network:id=>id==='local'?network:null,deployment:(_n,id)=>id==='escrow'?deployment:null};
/** Honest EIP-1898 node over its own view. `canonical` lists its chain (genesis first, finalized head last);
 * `known` also holds side blocks it has seen. Number params resolve on its own canonical chain. */
function honestNode({canonical,known=[]}) {
 const view={canonical,known};
 const byNumber=number=>view.canonical.find(b=>b.number===number)??(()=>{throw rpcError(-32000,'header not found');})();
 const resolve=param=>{
  if(typeof param==='string')return byNumber(param);
  if(typeof param!=='object'||param===null||Array.isArray(param))throw rpcError(-32602,'invalid block parameter');
  const keys=Object.keys(param);
  if('blockHash' in param){
   if(keys.some(k=>k!=='blockHash'&&k!=='requireCanonical')||typeof param.blockHash!=='string'||'requireCanonical' in param&&typeof param.requireCanonical!=='boolean')throw rpcError(-32602,'invalid block parameter');
   const block=[...view.canonical,...view.known].find(b=>b.hash===param.blockHash);
   if(!block)throw rpcError(-32001,'resource not found');
   if(param.requireCanonical===true&&!view.canonical.includes(block))throw rpcError(-32000,'block not canonical');
   return block;
  }
  if(keys.length===1&&typeof param.blockNumber==='string')return byNumber(param.blockNumber);
  throw rpcError(-32602,'invalid block parameter');
 };
 return {view,async request({method,params=[]}){
  switch(method){
   case'eth_chainId':return'0x7a69';
   // Real nodes answer an unknown block number with a null result, not an error.
   case'eth_getBlockByNumber':return params[0]==='finalized'?view.canonical.at(-1):view.canonical.find(b=>b.number===params[0])??null;
   case'eth_getCode':resolve(params[1]);return code;
   case'eth_call':return STATE_AT.get(resolve(params[1]).hash);
   default:throw rpcError(-32601,'method not found');
  }
 }};
}
/** Round-robin load balancer: request i goes to backend (offset + i) mod n. */
function roundRobin(backends,offset=0){
 const calls=[];let next=offset;
 return {calls,async request(input){const backend=next++%backends.length;calls.push({...input,backend});return backends[backend].request(input);}};
}
const majority=()=>honestNode({canonical:[genesis,parent,forkA]});
const STATE_METHODS=new Set(['eth_getCode','eth_call']);
const stateReads=calls=>calls.filter(call=>STATE_METHODS.has(call.method));
/** No snapshot may pair the anchored hash with state from another block. A refused state read is UNAVAILABLE; a
 * header recheck that lands on a disagreeing backend is INTEGRITY_FAILURE. Both are fixed-code fail-closed results. */
function consistent(result,label){
 if(!result.ok){assert.ok(['UNAVAILABLE','INTEGRITY_FAILURE'].includes(result.error.code),`${label}: ${result.error.code}`);assert.doesNotMatch(JSON.stringify(result),/SECRET|rpc\.invalid|not found|canonical/);return 'failed-closed';}
 if('escrow' in result.value)assert.equal(result.value.escrow.state,TRUTH.get(result.value.observation.anchor.hash),`${label}: state must be the state at the anchored hash`);
 return 'bound';
}

test('C-L1 regression: a round-robin RPC over a forked backend cannot mix block-0xa state from two forks',async()=>{
 // Requests: chainId->A, genesis->B, finalized->C (forkA), getCode->A, eth_call->B (forked), recheck->C (forkA).
 // Number pinning sends eth_call "0xa" to B, which answers from forkB (released) while the recheck on C still matches
 // forkA, so the old reader returned "released" anchored to forkA, whose actual state is "funded".
 const rpc=roundRobin([majority(),honestNode({canonical:[genesis,parent,forkB]}),majority()]);
 const reader=new EvmChainReader({rpc,registry:plainRegistry,now:()=>123});
 try{
  const result=await reader.read(binding,request(),wanted);
  consistent(result,'forked backend');
  error(result,'UNAVAILABLE');
  const call=rpc.calls.find(x=>x.method==='eth_call');
  assert.equal(call.backend,1,'the state read reached the forked backend');
  assert.deepEqual(call.params[1],anchored);
  assert.equal(rpc.calls.at(-1).method,'eth_call','a refused state read issues no recheck, retry or number-pinned fallback');
 }finally{reader.dispose();}
});

test('C-L1: inconsistent honest backends either bind every state read to the anchored hash or fail closed',async()=>{
 const topologies=[
  ['forked node, never saw forkA',()=>honestNode({canonical:[genesis,parent,forkB]})],
  ['forked node that also saw forkA as a side block',()=>honestNode({canonical:[genesis,parent,forkB],known:[forkA]})],
  ['node one block ahead on the same chain',()=>honestNode({canonical:[genesis,parent,forkA,child]})],
  ['node one block behind',()=>honestNode({canonical:[genesis,parent]})],
 ];
 const outcomes={};
 for(const [label,other] of topologies)for(let offset=0;offset<3;offset++)for(const op of ['read','validateLive']){
  const rpc=roundRobin([majority(),other(),majority()],offset);
  const reader=new EvmChainReader({rpc,registry:plainRegistry,now:()=>123});
  try{
   const result=op==='read'?await reader.read(binding,request(),wanted):await reader.validateLive('local','escrow');
   const tag=`${label} offset ${offset} ${op}`;
   const outcome=consistent(result,tag);
   outcomes[label]=[...(outcomes[label]??[]),outcome];
   const anchor=result.ok?(op==='read'?result.value.observation.anchor.hash:result.value.hash):null;
   const reads=stateReads(rpc.calls);
   assert.ok(reads.length>0,tag);
   assert.equal(new Set(reads.map(call=>call.params[1].blockHash)).size,1,`${tag}: one anchor per read`);
   for(const call of reads){
    assert.equal(Object.keys(call.params[1]).join(),'blockHash,requireCanonical',tag);
    assert.equal(call.params[1].requireCanonical,true,tag);
    if(anchor)assert.equal(call.params[1].blockHash,anchor,tag);
   }
  }finally{reader.dispose();}
 }
 // Per topology: [offset0 read, offset0 validateLive, offset1 read, offset1 validateLive, offset2 read, offset2 validateLive].
 // Forked nodes cannot serve forkA (or the majority cannot serve forkB): always fail closed. The ahead node holds forkA
 // canonically, so reads through it bind; when it answers "finalized" itself (offset 2) the anchor is 0xb, which the other
 // backends do not hold yet, so the read fails closed. When the behind node answers "finalized" (offset 2) the anchor is
 // the older shared block 0x9, which every backend can serve.
 const closed='failed-closed',bound='bound';
 assert.deepEqual(outcomes,{
  'forked node, never saw forkA':[closed,closed,closed,closed,closed,closed],
  'forked node that also saw forkA as a side block':[closed,closed,closed,closed,closed,closed],
  'node one block ahead on the same chain':[bound,bound,bound,bound,closed,closed],
  'node one block behind':[closed,closed,closed,closed,bound,bound],
 });
});

test('C-L1: a node or proxy that rejects the EIP-1898 object form fails closed with no block-number fallback',async()=>{
 const legacyOnly=method=>i=>{if(i.method===method&&typeof i.params[1]!=='string')throw rpcError(-32602,'invalid argument 1: json: cannot unmarshal object into Go value of type string');};
 for(const [method,op] of [['eth_getCode','read'],['eth_getCode','validateLive'],['eth_getCode','receipt'],['eth_call','read']]){
  const s=setup({handle:legacyOnly(method)});
  try{
   const result=op==='read'?await s.reader.read(binding,request(),wanted):op==='validateLive'?await s.reader.validateLive('local','escrow'):await s.reader.receipt(binding,expectedTx);
   error(result,'UNAVAILABLE');
   assert.equal(s.calls.filter(x=>x.method===method).length,1,`${method} is attempted once`);
   assert.equal(s.calls.at(-1).method,method,'nothing runs after the refused state read');
   assert.ok(stateReads(s.calls).every(x=>typeof x.params[1]!=='string'),'never re-sent with a block number or tag');
  }finally{s.reader.dispose();}
 }
 // A node that "answers" the object form with a non-hex value is malformed evidence, also fail-closed (fixed code).
 for(const [method,value] of [['eth_getCode',null],['eth_getCode',{}],['eth_getCode','0x'],['eth_getCode','latest'],['eth_call',null],['eth_call','0x'],['eth_call',{result:'0x'}]]){
  const s=setup({handle:i=>i.method===method?value:undefined});
  try{
   error(await s.reader.read(binding,request(),wanted),'INTEGRITY_FAILURE');
   assert.equal(s.calls.filter(x=>x.method===method).length,1);
   assert.ok(stateReads(s.calls).every(x=>exactAnchor(x.params[1])));
  }finally{s.reader.dispose();}
 }
});

test('C-L1: an anchor reorged out before a state read fails closed instead of reading the replacement block',async()=>{
 for(const [when,keepSide] of [['eth_getCode',true],['eth_getCode',false],['eth_call',true],['eth_call',false]]){
  const node=honestNode({canonical:[genesis,parent,forkA]});
  const calls=[];
  const rpc={async request(input){
   calls.push(input);
   // The finalized anchor is replaced by forkB just before this state read; forkA stays known (side block) or is dropped.
   if(input.method===when){node.view.canonical=[genesis,parent,forkB];node.view.known=keepSide?[forkA]:[];}
   return node.request(input);
  }};
  const reader=new EvmChainReader({rpc,registry:plainRegistry,now:()=>123});
  try{
   error(await reader.read(binding,request(),wanted),'UNAVAILABLE');
   assert.equal(calls.at(-1).method,when,'no recheck, retry or fallback after the refusal');
   assert.ok(stateReads(calls).every(x=>exactAnchor(x.params[1],forkA.hash)));
  }finally{reader.dispose();}
 }
});

test('C-L1: every state read sends exactly {blockHash: anchor, requireCanonical: true}; the parameter cannot be rewritten by the RPC',async()=>{
 const s=setup();
 try{
  ok(await s.reader.read(binding,request(),wanted));ok(await s.reader.readValidated(binding,request(),wanted));ok(await s.reader.validateLive('local','escrow'));ok(await s.reader.receipt(binding,expectedTx));
  const reads=stateReads(s.calls);
  assert.deepEqual(reads.map(x=>x.method),['eth_getCode','eth_call','eth_getCode','eth_call','eth_getCode','eth_getCode']);
  for(const call of reads){
   assert.equal(call.params.length,2);
   assert.equal(JSON.stringify(call.params[1]),`{"blockHash":"${finalized.hash}","requireCanonical":true}`);
   assert.equal(call.params[1].requireCanonical,true);
   assert.ok(Object.isFrozen(call.params[1]));
  }
  assert.deepEqual(reads.find(x=>x.method==='eth_getCode').params,[contract,{blockHash:finalized.hash,requireCanonical:true}]);
  assert.deepEqual(reads.find(x=>x.method==='eth_call').params,[{to:contract,data:`0x${sel('escrows(bytes32)')}${binding.tradeId}`},{blockHash:finalized.hash,requireCanonical:true}]);
 }finally{s.reader.dispose();}
 // An RPC that tries to retarget the shared parameter during eth_getCode cannot move the later eth_call.
 const hostile=setup({handle:i=>{if(i.method==='eth_getCode'){Reflect.set(i.params[1],'blockHash',hx('f'));Reflect.set(i.params[1],'requireCanonical',false);}}});
 try{ok(await hostile.reader.read(binding,request(),wanted));assert.ok(stateReads(hostile.calls).every(x=>exactAnchor(x.params[1])));}finally{hostile.reader.dispose();}
});
