#!/usr/bin/env node
/** Local EIP1271 stateful acceptance proof. Only the separate fixture account sends; verifier reads only. */
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {RegistryService} from '../packages/domain/index.ts';
import {evmTermsHash,keccak256} from '../packages/wallet/src/evm-terms.ts';
import {createContractAcceptanceVerifier} from '../packages/wallet/src/evm-contract-acceptance.ts';
import {checkToolchain,forgeEnv,rpcClient,TOOLCHAIN,RpcError} from './sepolia/lib.mjs';
import {waitForFixtureReceipt} from './test-support/fixture-receipt.mjs';
const run=promisify(execFile),FOUNDRY=process.env.FOUNDRY_BIN??`${homedir()}/.foundry/bin`,ENV={...process.env,PATH:`${FOUNDRY}:${process.env.PATH??''}`};
const ANVIL=existsSync(`${FOUNDRY}/anvil`)?`${FOUNDRY}/anvil`:'anvil',EVM=fileURLToPath(new URL('../contracts/evm/',import.meta.url));
const KEY='ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Published worthless local dev key.
const hex=bytes=>Buffer.from(bytes).toString('hex'),word=n=>BigInt(n).toString(16).padStart(64,'0'),sha=b=>createHash('sha256').update(b).digest('hex');
const selector=s=>hex(keccak256(new TextEncoder().encode(s))).slice(0,8),val=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const port=await new Promise((done,fail)=>{const server=createServer();server.once('error',fail);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):done(p));});});
let child,rpc;const verifiers=[],methods=[],checks=[];let current=true;
const pass=s=>{checks.push(s);console.log('ok - '+s);};
try{
 await checkToolchain(ENV);
 const version=(await run(ANVIL,['--version'],{env:forgeEnv(ENV),timeout:5000})).stdout;assert.ok(version.includes(TOOLCHAIN.forgeVersion));assert.ok(version.includes(TOOLCHAIN.forgeCommit));
 const url=`http://127.0.0.1:${port}`;rpc=rpcClient(url,{timeoutMs:2000});
 child=spawn(ANVIL,['--host','127.0.0.1','--port',String(port),'--silent','--chain-id','31337'],{env:forgeEnv(ENV),stdio:'ignore'});let spawnError;child.once('error',e=>{spawnError=e;});
 for(let i=0;;i++){try{await rpc('eth_chainId');break;}catch{if(spawnError||child.exitCode!==null||i>=100)throw Error('Local native startup failed');await new Promise(r=>setTimeout(r,50));}}
 const deploy=async(target,args=[])=>{const out=(await run('forge',['create',target,'--rpc-url',url,'--private-key','0x'+KEY,'--broadcast','--json',...args],{cwd:EVM,env:forgeEnv(ENV,{FOUNDRY_OFFLINE:'true'}),timeout:30000,maxBuffer:1<<20})).stdout;return JSON.parse(out.slice(out.indexOf('{'))).deployedTo.toLowerCase();};
 const escrow=await deploy('src/BasicEscrow.sol:BasicEscrow',['--constructor-args','[]']),wallet=await deploy('test/mocks/Eip1271RecoveryFixture.sol:Eip1271RecoveryFixture'),accounts=await rpc('eth_accounts');
 const raw=JSON.parse(await readFile(new URL('../packages/domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url))),network=raw.networks[0];
 network.genesisHash=(await rpc('eth_getBlockByNumber',['0x0',false])).hash;network.deployments[0].address=escrow;network.deployments[0].runtime.keccak256=hex(keccak256(Buffer.from((await rpc('eth_getCode',[escrow,'latest'])).slice(2),'hex')));
 const registry=new RegistryService(),bytes=new TextEncoder().encode(JSON.stringify(raw));val(await registry.load(bytes,sha(bytes)));
 const scenario=JSON.parse(await readFile(new URL('../packages/domain/test/fixtures/local-evm-scenario/scenario.json',import.meta.url)));
 const input={domain:{chainId:'31337',verifyingContract:escrow},terms:{...scenario.sets.native.terms,seller:wallet,buyer:accounts[1].toLowerCase()},role:'seller',walletAccount:wallet,signature:new Uint8Array([1,2,3,4,5]),sessionGeneration:1};
 const digest=evmTermsHash(input.domain,input.terms),sighex=hex(input.signature),approval=enabled=>'0x'+selector('setApproval(bytes32,bytes,bool)')+digest+word(96)+word(enabled?1:0)+word(input.signature.length)+sighex.padEnd(64,'0');
 const send=async data=>waitForFixtureReceipt(rpc,await rpc('eth_sendTransaction',[{from:accounts[0],to:wallet,data,gas:'0x40000'}]));
 const mode=async n=>send('0x'+selector('setMode(uint8)')+word(n));
 // Track actual RPC execution errors, not merely attempts to invoke eth_call.
 // A synthetic transport fault below must be rejected by the native-failure oracle.
 const nativeFaults=[];
 const track=(backend=rpc)=>async({method,params=[]})=>{
  methods.push(method);
  try{return await backend(method,params,{includeRevertData:method==='eth_call'});}
  catch(error){
   if(method==='eth_call')nativeFaults.push({
    code:error instanceof RpcError?error.code:'NON_RPC_ERROR',
    to:params[0]?.to,data:params[0]?.data,gas:params[0]?.gas,anchor:params[1],
    revertData:error instanceof RpcError?error.revertData??null:null
   });
   throw error;
  }
 };
 const create=(request=track())=>{const verifier=createContractAcceptanceVerifier({registry,request,isCurrent:()=>current});verifiers.push(verifier);return verifier;};
 const verifier=create();await send(approval(true));const good=val(await verifier.verify(input));assert.equal(good.termsHash,digest);assert.equal(good.account,wallet);assert.equal(good.economicPreparationAllowed,false);
 pass('actual contract-wallet arbitrary signature verifies the exact native ABI magic at a pinned block');
 // A false result alone can hide an unrelated RPC or setup failure. Prove each negative
 // exercise reached the actual contract-wallet eth_call, and check its reason.
 const refusedAtWalletCall=async(candidate,expectedCode,label,subject=verifier,requireNativeFailure=false)=>{
  const from=methods.length,faultStart=nativeFaults.length,outcome=await subject.verify(candidate),used=methods.slice(from);
  assert.equal(outcome.ok,false,`${label}: unexpected contract-wallet acceptance`);
  assert.equal(outcome.error.code,expectedCode,`${label}: wrong failure reason`);
  assert.ok(used.includes('eth_call'),`${label}: rejection never exercised native isValidSignature`);
  if(requireNativeFailure){
   const failures=nativeFaults.slice(faultStart);
   assert.equal(failures.length,1,`${label}: missing native execution error`);
   const failure=failures[0];
   assert.match(failure.code,/^RPC_ERROR_-?\d+$/,`${label}: not a native JSON-RPC execution error`);
   assert.equal(failure.to,wallet,`${label}: wrong wallet target`);
   assert.equal(failure.gas,'0x186a0',`${label}: wrong gas bound`);
   assert.ok(failure.data?.startsWith('0x1626ba7e'+digest),`${label}: wrong EIP-1271 calldata`);
   assert.equal(failure.anchor?.requireCanonical,true,`${label}: not canonically pinned`);
   assert.match(failure.anchor?.blockHash??'',/^0x[0-9a-f]{64}$/,`${label}: missing block hash`);
  }
 };
 await send(approval(false));await refusedAtWalletCall(input,'UNAUTHORIZED','revoked approval');await send(approval(true));val(await verifier.verify(input));
 await refusedAtWalletCall({...input,terms:{...input.terms,amountBaseUnits:'2'}},'UNAUTHORIZED','changed terms');pass('revoked state and changed terms invalidate acceptance; no cached receipt grants authority');
 for(const [n,code] of [[1,'UNAUTHORIZED'],[2,'UNAVAILABLE'],[3,'UNAVAILABLE'],[4,'UNAUTHORIZED'],[5,'UNAUTHORIZED']]){
  await mode(n);
  // Independently confirm this deployed fixture entered the requested native mode.
  const observed=await rpc('eth_call',[{to:wallet,data:'0x'+selector('mode()')},'latest']);
  assert.equal(BigInt(observed),BigInt(n),`native mode ${n}: fixture state mismatch`);
  if(n===2){
   const outage=create(track(async(method,params,options)=>{
    if(method==='eth_call')throw new RpcError('RPC_UNREACHABLE');
    return rpc(method,params,options);
   }));
   await assert.rejects(
    refusedAtWalletCall(input,'UNAVAILABLE','synthetic RPC transport outage',outage,true),
    /not a native JSON-RPC execution error/
   );
   outage.dispose();
  }
  await refusedAtWalletCall(input,code,`native mode ${n}`,verifier,n===2||n===3);
 }
 await mode(0);val(await verifier.verify(input));
 pass('native wrong magic, revert, gas exhaustion, short and oversized returns are refused');
 const snapshot=await rpc('evm_snapshot',[]);await rpc('anvil_mine',['0x1']);let reorged=false;
 const reorg=create(async({method,params=[]})=>{methods.push(method);const result=await rpc(method,params);if(method==='eth_call'&&!reorged){reorged=true;assert.equal(await rpc('evm_revert',[snapshot]),true);}return result;});
 assert.equal((await reorg.verify(input)).ok,false);pass('native reorg during validity read cannot publish acceptance');
 const stale=create(async({method,params=[]})=>{methods.push(method);const result=await rpc(method,params);if(method==='eth_call')current=false;return result;});
 assert.equal((await stale.verify(input)).error.code,'LOCKED');current=true;
 assert.equal((await verifier.verify({...input,walletAccount:accounts[0].toLowerCase(),terms:{...input.terms,seller:accounts[0].toLowerCase()}})).error.code,'UNSUPPORTED_PROVIDER');
 pass('lost session and code-less EOA refuse without silent EOA fallback');
 assert.ok(methods.every(m=>['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(m)));
 console.log(JSON.stringify({fixture:'local-native-eip1271',checks:checks.length,adapterReads:methods.length,adapterSendsOrSigns:0,externalNetwork:false,tradingEnabled:false,releaseAcceptance:false}));
}finally{
 verifiers.forEach(v=>v.dispose());if(child?.pid&&child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const force=setTimeout(()=>child.kill('SIGKILL'),1000);force.unref();await stopped;clearTimeout(force);}
}
