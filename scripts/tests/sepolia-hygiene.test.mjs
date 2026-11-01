/** Secret hygiene of the Sepolia kit that needs no Foundry or chain: Forge child environments and RPC URL transport. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFoundryRecipe, EVM_DIR, forgeEnv, isLoopbackUrl, MAX_RPC_REVERT_BYTES, rpcClient } from '../sepolia/lib.mjs';

const KEY = `0x${'11'.repeat(32)}`;
const parent = {
  PATH: '/bin', HOME: '/home/op', FOUNDRY_SOLC: '/opt/solc', SEPOLIA_RPC_URL: 'https://rpc.example/KEY',
  SEPOLIA_DEPLOYER_PRIVATE_KEY: KEY, SEPOLIA_SELLER_PRIVATE_KEY: KEY, SEPOLIA_BUYER_PRIVATE_KEY: KEY,
  SEPOLIA_CROSSCHECK_RPC_URL: 'https://other.example/KEY2', GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y',
};

test('forgeEnv pins the canonical config/profile, drops ambient build settings and private keys', () => {
  assert.deepEqual(forgeEnv({...parent,FOUNDRY_OPTIMIZER_RUNS:'9999',FOUNDRY_EVM_VERSION:'shanghai',FOUNDRY_PROFILE:'other',FOUNDRY_CONFIG:'/tmp/other.toml',DAPP_OPTIMIZER_RUNS:'9999'}), { PATH: '/bin', HOME: '/home/op', FOUNDRY_SOLC: '/opt/solc', SEPOLIA_RPC_URL: 'https://rpc.example/KEY', FOUNDRY_CONFIG: EVM_DIR + 'foundry.toml', FOUNDRY_PROFILE: 'default' });
  const seller = forgeEnv(parent, { SEPOLIA_SELLER_PRIVATE_KEY: KEY, CALL_TO: '0x01' });
  assert.equal(seller.SEPOLIA_SELLER_PRIVATE_KEY, KEY);
  for (const name of ['SEPOLIA_DEPLOYER_PRIVATE_KEY', 'SEPOLIA_BUYER_PRIVATE_KEY', 'SEPOLIA_CROSSCHECK_RPC_URL', 'GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY']) {
    assert.equal(name in seller, false, name);
  }
  assert.equal(forgeEnv({ PATH: undefined }).PATH, undefined);
});

test('rpcClient refuses plain HTTP except to loopback', () => {
  for (const url of ['http://rpc.example/KEY', 'http://10.0.0.1:8545', 'http://127.0.0.1.example/']) {
    assert.throws(() => rpcClient(url), error => error?.code === 'RPC_URL_INSECURE', url);
  }
  for (const url of ['http://127.0.0.1:8545', 'http://localhost:8545/', 'http://[::1]:8545', 'https://rpc.example/KEY']) {
    assert.equal(typeof rpcClient(url), 'function', url);
  }
  assert.equal(isLoopbackUrl('not a url'), false);
  assert.throws(() => rpcClient('ftp://rpc.example'), error => error?.code === 'RPC_URL_MISSING');
});

test('RPC transport bounds chunked bodies and refuses mismatched/ambiguous protocol replies', async () => {
  const original=globalThis.fetch;
  try{
    for(const body of [{jsonrpc:'2.0',id:2,result:'0x1'},{jsonrpc:'1.0',id:1,result:'0x1'},{jsonrpc:'2.0',id:1,result:1,error:{code:3}},{jsonrpc:'2.0',id:1},{jsonrpc:'2.0',id:1,error:{code:'secret'}}]){
      globalThis.fetch=async()=>Response.json(body);
      await assert.rejects(rpcClient('https://rpc.example/KEY')('eth_chainId'),error=>error.code==='RPC_MALFORMED');
    }
    globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(4*1024*1024));c.enqueue(new Uint8Array([32]));c.close();}}));
    await assert.rejects(rpcClient('https://rpc.example/KEY')('eth_chainId'),error=>error.code==='RPC_RESPONSE_TOO_LARGE');
    globalThis.fetch=async()=>new Response('{}',{headers:{'content-length':String(4*1024*1024+1)}});
    await assert.rejects(rpcClient('https://rpc.example/KEY')('eth_chainId'),error=>error.code==='RPC_RESPONSE_TOO_LARGE');
  }finally{globalThis.fetch=original;}
});

test('RPC requests capture independent ids and prohibit redirects/credentials without exposing diagnostics', async()=>{
 const original=globalThis.fetch, pending=[];
 try{
  globalThis.fetch=async(_url,init)=>{assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');return new Promise(resolve=>pending.push({id:JSON.parse(init.body).id,resolve}));};
  const rpc=rpcClient('https://rpc.example/SECRET'),first=rpc('one'),second=rpc('two');
  pending[1].resolve(Response.json({jsonrpc:'2.0',id:pending[1].id,result:'two'}));
  pending[0].resolve(Response.json({jsonrpc:'2.0',id:pending[0].id,result:'one'}));
  assert.deepEqual(await Promise.all([first,second]),['one','two']);
  globalThis.fetch=async()=>{throw Error('SECRET rpc provider details');};
  await assert.rejects(rpc('x'),error=>error.code==='RPC_UNREACHABLE'&&!/SECRET/.test(error.message));
 }finally{globalThis.fetch=original;}
});

test('control probes expose only explicitly requested bounded hexadecimal eth_call revert bytes', async () => {
  const original = globalThis.fetch;
  let data = '0xAABB';
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.redirect, 'error');
      assert.equal(init.credentials, 'omit');
      return Response.json({ jsonrpc: '2.0', id: JSON.parse(init.body).id,
        error: { code: 3, message: 'SECRET provider detail', data, arbitrary: 'SECRET' } });
    };
    const rpc = rpcClient('https://rpc.example/SECRET');
    await assert.rejects(rpc('eth_call', [], { includeRevertData: true }), error => {
      assert.equal(error.revertData, '0xaabb');
      assert.equal(error.code, 'RPC_ERROR_3');
      assert.equal(Object.hasOwn(error, 'data'), false);
      assert.equal(Object.hasOwn(error, 'arbitrary'), false);
      assert.doesNotMatch(JSON.stringify(error), /SECRET/);
      assert.doesNotMatch(error.message, /SECRET/);
      return true;
    });
    for (const invoke of [() => rpc('eth_call'), () => rpc('eth_chainId', [], { includeRevertData: true })]) {
      await assert.rejects(invoke(), error => !Object.hasOwn(error, 'revertData'));
    }
    for (const invalid of ['0x1', 'SECRET', { data: '0xaabb' }, `0x${'aa'.repeat(MAX_RPC_REVERT_BYTES + 1)}`]) {
      data = invalid;
      await assert.rejects(rpc('eth_call', [], { includeRevertData: true }), error => error.code === 'RPC_ERROR_3' && !Object.hasOwn(error, 'revertData'));
    }
  } finally { globalThis.fetch = original; }
});

test('deployment attempt persists before a failed/unreadable broadcast and prevents an automatic second send', async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {broadcastPreparedDeployment}=await import('../sepolia/deploy.mjs');
 const directory=await mkdtemp(join(tmpdir(),'p2p-deploy-attempt-'));
 let runs=0;
 const from='0x'+'12'.repeat(20),rpc=async(method)=>{assert.equal(method,'eth_getTransactionCount');return'0x7';};
 try{
  const invoke=()=>broadcastPreparedDeployment({env:{},rpc,from,outDir:directory,runForge:async()=>{
   runs++;
   const guard=JSON.parse(await readFile(join(directory,'pending-deploy.json'),'utf8'));
   assert.equal(guard.state,'broadcast-unknown');assert.equal(guard.from,from);assert.equal(guard.nonce,'7');
   throw Error('synthetic forge failure after possible send');
  }});
  await assert.rejects(invoke(),error=>error.code==='BROADCAST_UNCERTAIN');
  const persisted=JSON.parse(await readFile(join(directory,'pending-deploy.json'),'utf8'));
  assert.equal(persisted.tx,null);assert.doesNotMatch(JSON.stringify(persisted),/PRIVATE|RPC_URL/);
  await assert.rejects(invoke(),error=>error.code==='UNRECORDED_DEPLOYMENT_PENDING');assert.equal(runs,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('unknown deployment guard clears only after finalized matching native account/nonce and canonical inclusion', async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {clearRecordedAttempt}=await import('../sepolia/record-deployment.mjs');
 const {SEPOLIA,keccakHex,hexToBytes}=await import('../sepolia/lib.mjs');
 const directory=await mkdtemp(join(tmpdir(),'p2p-record-attempt-')),pendingPath=join(directory,'pending-deploy.json');
 const from='0x'+'12'.repeat(20),txHash='0x'+'34'.repeat(32),blockHash='0x'+'56'.repeat(32),earlierHash='0x'+'78'.repeat(32);
 // CREATE address = last20(keccak(RLP([sender, nonce7]))), not arbitrary fixture metadata.
 const contractAddress='0x'+keccakHex(hexToBytes('0xd694'+from.slice(2)+'07')).slice(-40);
 const attempt={format:'p2p-offramp/deployment-attempt/v1',state:'broadcast-unknown',chainId:'11155111',from,nonce:'7',tx:null};
 const record={initializationTx:txHash,chainId:'11155111',genesisIdentity:SEPOLIA.genesisHash,contractAddress,deployer:from,deployBlock:'10',deployBlockHash:blockHash,
  codeDigest:{runtime:keccakHex(hexToBytes('0x6000'))},finalizedAtRecording:true};
 const transaction={hash:txHash,from,to:null,nonce:'0x7',blockNumber:'0xa',blockHash,input:'0x6000'};
 const receipt={transactionHash:txHash,status:'0x1',contractAddress,from,to:null,blockNumber:'0xa',blockHash};
 const makeRpc=({tx={},finalized=true}={})=>async(method,params=[])=>{
  if(method==='eth_chainId')return'0xaa36a7';
  if(method==='eth_getTransactionByHash')return{...transaction,...tx};
  if(method==='eth_getTransactionReceipt')return receipt;
  if(method==='eth_getCode'){assert.equal(params[0],contractAddress);assert.equal(params[1],'0xa');return'0x6000';}
  if(method==='eth_call'){assert.equal(params[0].to,contractAddress);assert.equal(params[1],'0xa');return'0x'+'20'.padStart(64,'0')+'0'.repeat(64);}
  if(method==='eth_getBlockByNumber'){
   if(params[0]==='0x0')return{number:'0x0',hash:SEPOLIA.genesisHash};
   if(params[0]==='0x9'||params[0]==='finalized'&&!finalized)return{number:'0x9',hash:earlierHash};
   return{number:'0xa',hash:blockHash};
  }
  throw Error('Unexpected native proof request');
 };
 const rpc=makeRpc();
 try{
  for(const mutation of [{deployer:'0x'+'99'.repeat(20)},{chainId:'1'},{deployBlock:'11'}]){
   await writeFile(pendingPath,JSON.stringify(attempt));
   assert.equal(await clearRecordedAttempt({pendingPath,txHash,record:{...record,...mutation},rpc}),false);
   assert.equal(JSON.parse(await readFile(pendingPath,'utf8')).nonce,'7');
  }
  // An imported finalized label cannot replace actual native finality.
  await writeFile(pendingPath,JSON.stringify(attempt));
  assert.equal(await clearRecordedAttempt({pendingPath,txHash,record,rpc:makeRpc({finalized:false})}),false);
  assert.equal(JSON.parse(await readFile(pendingPath,'utf8')).nonce,'7');
  for(const mutation of [{nonce:'0x8'},{to:from},{blockHash:'0x'+'00'.repeat(32)}]){
   await writeFile(pendingPath,JSON.stringify(attempt));
   assert.equal(await clearRecordedAttempt({pendingPath,txHash,record,rpc:makeRpc({tx:mutation})}),false);
   assert.equal(JSON.parse(await readFile(pendingPath,'utf8')).nonce,'7');
  }
  await writeFile(pendingPath,JSON.stringify(attempt));
  assert.equal(await clearRecordedAttempt({pendingPath,txHash,record:{...record,finalizedAtRecording:false},rpc}),true,'fresh native proof, not an imported flag, establishes finality');
  await assert.rejects(readFile(pendingPath),error=>error.code==='ENOENT');
 }finally{await rm(directory,{recursive:true,force:true});}
});

// Compiler settings can also come from a global Foundry config. A pinned binary alone is not a pinned recipe.
test('effective compiler recipe rejects global or profile configuration drift',()=>{
 const recipe={src:'src',test:'test',script:'script',out:'out',libs:['lib'],
 auto_detect_remappings:false,remappings:['forge-std/=lib/forge-std/src/','@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/'],
 libraries:[],evm_version:'cancun',solc:'0.8.30',auto_detect_solc:false,optimizer:true,optimizer_runs:200,optimizer_details:null,via_ir:false,use_literal_content:false,bytecode_hash:'ipfs',cbor_metadata:true,revert_strings:null,additional_compiler_profiles:[],compilation_restrictions:[]};
 assert.doesNotThrow(()=>checkFoundryRecipe(recipe));
 assert.doesNotThrow(()=>checkFoundryRecipe({...recipe,solc:'/opt/solc'},'/opt/solc'));
 for(const [key,value]of Object.entries({auto_detect_remappings:true,optimizer:false,optimizer_runs:9999,evm_version:'shanghai',via_ir:true,solc:'0.8.31',optimizer_details:{yul:false},use_literal_content:true,bytecode_hash:'none',cbor_metadata:false,revert_strings:'strip',libraries:['x:y'],remappings:['@openzeppelin/contracts/=/tmp/x/'],additional_compiler_profiles:[{}],compilation_restrictions:[{}],out:'other',src:'other',libs:['/tmp/lib']}))assert.throws(()=>checkFoundryRecipe({...recipe,[key]:value}),e=>e.code==='TOOLCHAIN_MISMATCH',key);
});

// The guard and committed recipe must both opt out; a checkout's vendor nesting is not compiler input.
test('committed compiler recipe disables inferred vendor remappings',async()=>{
 const {readFile}=await import('node:fs/promises');
 const config=await readFile(EVM_DIR+'foundry.toml','utf8');
 assert.match(config,/^auto_detect_remappings = false$/m);
 const mappings=config.match(/^remappings = \[([\s\S]*?)^\]/m)?.[1];
 assert.ok(mappings);
 assert.deepEqual([...mappings.matchAll(/"([^"\n]+)"/g)].map(match=>match[1]),['forge-std/=lib/forge-std/src/','@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/']);
});
