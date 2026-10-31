/** Secret hygiene of the Sepolia kit that needs no Foundry or chain: Forge child environments and RPC URL transport. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { forgeEnv, isLoopbackUrl, MAX_RPC_REVERT_BYTES, rpcClient } from '../sepolia/lib.mjs';

const KEY = `0x${'11'.repeat(32)}`;
const parent = {
  PATH: '/bin', HOME: '/home/op', FOUNDRY_SOLC: '/opt/solc', SEPOLIA_RPC_URL: 'https://rpc.example/KEY',
  SEPOLIA_DEPLOYER_PRIVATE_KEY: KEY, SEPOLIA_SELLER_PRIVATE_KEY: KEY, SEPOLIA_BUYER_PRIVATE_KEY: KEY,
  SEPOLIA_CROSSCHECK_RPC_URL: 'https://other.example/KEY2', GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y',
};

test('forgeEnv passes OS basics, FOUNDRY_* and the RPC URL, and no private key unless given explicitly', () => {
  assert.deepEqual(forgeEnv(parent), { PATH: '/bin', HOME: '/home/op', FOUNDRY_SOLC: '/opt/solc', SEPOLIA_RPC_URL: 'https://rpc.example/KEY' });
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
 const directory=await mkdtemp(join(tmpdir(),'p2p-record-attempt-')),pendingPath=join(directory,'pending-deploy.json');
 const from='0x'+'12'.repeat(20),txHash='0x'+'34'.repeat(32),blockHash='0x'+'56'.repeat(32);
 const attempt={format:'p2p-offramp/deployment-attempt/v1',state:'broadcast-unknown',chainId:'11155111',from,nonce:'7',tx:null};
 const record={chainId:'11155111',deployer:from,deployBlock:'10',deployBlockHash:blockHash,finalizedAtRecording:true};
 const transaction={hash:txHash,from,to:null,nonce:'0x7',blockNumber:'0xa',blockHash};
 const rpc=async method=>method==='eth_getTransactionByHash'?transaction:{hash:blockHash,number:'0xa'};
 try{
  for(const mutation of [{finalizedAtRecording:false},{deployer:'0x'+'99'.repeat(20)},{chainId:'1'},{deployBlock:'11'}]){
   await writeFile(pendingPath,JSON.stringify(attempt));
   assert.equal(await clearRecordedAttempt({pendingPath,txHash,record:{...record,...mutation},rpc}),false);
   assert.equal(JSON.parse(await readFile(pendingPath,'utf8')).nonce,'7');
  }
  for(const mutation of [{nonce:'0x8'},{to:from},{blockHash:'0x'+'00'.repeat(32)}]){
   await writeFile(pendingPath,JSON.stringify(attempt));
   assert.equal(await clearRecordedAttempt({pendingPath,txHash,record,rpc:async method=>method==='eth_getTransactionByHash'?{...transaction,...mutation}:{hash:blockHash,number:'0xa'}}),false);
  }
  await writeFile(pendingPath,JSON.stringify(attempt));
  assert.equal(await clearRecordedAttempt({pendingPath,txHash,record,rpc}),true);
  await assert.rejects(readFile(pendingPath),error=>error.code==='ENOENT');
 }finally{await rm(directory,{recursive:true,force:true});}
});
