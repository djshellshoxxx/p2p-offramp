import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectDeployment,clearRecordedAttempt} from '../sepolia/record-deployment.mjs';
import {SEPOLIA} from '../sepolia/lib.mjs';
const tx='0x'+'11'.repeat(32),blockHash='0x'+'22'.repeat(32),finalHash='0x'+'33'.repeat(32),from='0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',address='0x5fbdb2315678afecb367f032d93f642f64180aa3';
function fixture(mutate=()=>{}){
 const receipt={transactionHash:tx,status:'0x1',contractAddress:address,from,to:null,blockNumber:'0x5',blockHash};
 const transaction={hash:tx,from,to:null,nonce:'0x0',blockNumber:'0x5',blockHash,input:'0x6000'};
 const calls=[];let numbered=0;
 const rpc=async(method,params=[])=>{
  calls.push([method,params]);let value;
  if(method==='eth_chainId')value='0xaa36a7';
  else if(method==='eth_getTransactionReceipt')value=structuredClone(receipt);
  else if(method==='eth_getTransactionByHash')value=structuredClone(transaction);
  else if(method==='eth_getCode'){assert.equal(params[1],'0x5');value='0x6000';}
  else if(method==='eth_call'){assert.equal(params[1],'0x5');value='0x'+'20'.padStart(64,'0')+'0'.repeat(64);}
  else if(method==='eth_getBlockByNumber')value=params[0]==='0x0'?{number:'0x0',hash:SEPOLIA.genesisHash}:params[0]==='0x5'?{number:'0x5',hash:blockHash,read:++numbered}:{number:'0xa',hash:finalHash};
  else throw Error('unexpected');
  return mutate(method,params,value)??value;
 };
 return{rpc,calls,receipt,transaction};
}
test('deployment proof binds receipt/CREATE/address/canonical inclusion and pins code/allowlist reads',async()=>{
 const f=fixture(),proof=await inspectDeployment(f.rpc,tx,SEPOLIA.genesisHash,'0x6000');
 assert.equal(proof.address,address);assert.equal(proof.finalizedBlock,10n);assert.equal(proof.transaction.nonce,'0x0');
 assert.equal(f.calls.filter(([m,p])=>m==='eth_getBlockByNumber'&&p[0]==='0x5').length,2);
});
test('wrong receipt, transaction, derived address, orphan and changed anchors never record finality',async()=>{
 const cases=[
  (m,p,v)=>m==='eth_getTransactionReceipt'?{...v,transactionHash:finalHash}:v,
  (m,p,v)=>m==='eth_getTransactionByHash'?{...v,to:address}:v,
  (m,p,v)=>m==='eth_getTransactionByHash'?{...v,nonce:'0x1'}:v,
  (m,p,v)=>m==='eth_getTransactionByHash'?{...v,blockHash:finalHash}:v,
  (m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='0x5'?{...v,hash:finalHash}:v,
  (m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='0x5'&&v.read===2?{...v,hash:finalHash}:v,
 ];
 for(const mutate of cases)await assert.rejects(inspectDeployment(fixture(mutate).rpc,tx,SEPOLIA.genesisHash),error=>error.code==='DEPLOYMENT_PROOF_INVALID');
 await assert.rejects(inspectDeployment(fixture().rpc,tx,SEPOLIA.genesisHash,'0x9999'),error=>error.code==='DEPLOYMENT_CREATION_MISMATCH');
});
test('both pending branches require fresh proof; uncertainty and substituted owner preserve guard',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'deployment-proof-')),pendingPath=join(dir,'pending.json');
 try{
  const proof=await inspectDeployment(fixture().rpc,tx,SEPOLIA.genesisHash);
  const record={initializationTx:tx,chainId:'11155111',genesisIdentity:SEPOLIA.genesisHash,contractAddress:address,deployer:from,deployBlockHash:blockHash,deployBlock:'5',codeDigest:{runtime:proof.runtimeKeccak},finalizedAtRecording:false};
  for(const pending of [{tx,address},{format:'p2p-offramp/deployment-attempt/v1',state:'broadcast-unknown',tx:null,chainId:'11155111',from,nonce:'0'}]){
   await writeFile(pendingPath,JSON.stringify(pending));
   const broken=fixture((m,p,v)=>m==='eth_getTransactionReceipt'?{...v,transactionHash:finalHash}:v);
   assert.equal(await clearRecordedAttempt({pendingPath,txHash:tx,record,rpc:broken.rpc}),false);assert.deepEqual(JSON.parse(await readFile(pendingPath)),pending);
   assert.equal(await clearRecordedAttempt({pendingPath,txHash:tx,record,rpc:fixture().rpc}),true);
  }
  await writeFile(pendingPath,JSON.stringify({tx,address,from:'0x'+'77'.repeat(20)}));
  assert.equal(await clearRecordedAttempt({pendingPath,txHash:tx,record,rpc:fixture().rpc}),false);
  await readFile(pendingPath);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('canonical early known attempts may clear; hashless attempts wait for native finality',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'deployment-early-')),pendingPath=join(dir,'pending.json');
 try{
  const early=()=>fixture((m,p,v)=>m==='eth_getBlockByNumber'&&(p[0]==='finalized'||p[0]==='0x4')?{number:'0x4',hash:finalHash}:v).rpc;
  const proof=await inspectDeployment(early(),tx,SEPOLIA.genesisHash);
  const record={initializationTx:tx,chainId:'11155111',genesisIdentity:SEPOLIA.genesisHash,contractAddress:address,deployer:from,deployBlockHash:blockHash,deployBlock:'5',codeDigest:{runtime:proof.runtimeKeccak},finalizedAtRecording:true};
  await writeFile(pendingPath,JSON.stringify({tx,address}));
  assert.equal(await clearRecordedAttempt({pendingPath,txHash:tx,record,rpc:early()}),true);
  const unknown={format:'p2p-offramp/deployment-attempt/v1',state:'broadcast-unknown',tx:null,chainId:'11155111',from,nonce:'0'};
  await writeFile(pendingPath,JSON.stringify(unknown));
  assert.equal(await clearRecordedAttempt({pendingPath,txHash:tx,record,rpc:early()}),false);
  assert.deepEqual(JSON.parse(await readFile(pendingPath)),unknown,'imported finalized flag does not authorize guard removal');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('reverted status is actionable only after native CREATE inclusion and empty-code proof',async()=>{
 for(const status of ['0x0',undefined])for(const bad of ['hash','orphan']){
  const rpc=fixture((m,p,v)=>{
   if(m==='eth_getTransactionReceipt')return{...v,status,contractAddress:null,...(bad==='hash'?{transactionHash:finalHash}:{blockHash:finalHash})};
   return v;
  }).rpc;
  await assert.rejects(inspectDeployment(rpc,tx,SEPOLIA.genesisHash),error=>error.code==='DEPLOYMENT_PROOF_INVALID');
 }
 const reverted=(m,p,v)=>m==='eth_getTransactionReceipt'?{...v,status:'0x0',contractAddress:null}:m==='eth_getCode'?'0x':v;
 await assert.rejects(inspectDeployment(fixture(reverted).rpc,tx,SEPOLIA.genesisHash),error=>error.code==='DEPLOY_REVERTED');
 await assert.rejects(inspectDeployment(fixture((m,p,v)=>m==='eth_getTransactionReceipt'?{...v,status:'0x0',contractAddress:null}:v).rpc,tx,SEPOLIA.genesisHash),error=>error.code==='DEPLOYMENT_PROOF_INVALID','a substituted reverted receipt cannot hide existing code');
 await assert.rejects(inspectDeployment(fixture((m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='0x5'&&v.read===2?{...v,hash:finalHash}:reverted(m,p,v)).rpc,tx,SEPOLIA.genesisHash),error=>error.code==='DEPLOYMENT_PROOF_INVALID');
});
test('geth-style reverted CREATE address must equal the authenticated sender/nonce derivation',async()=>{
 const reverted=(contractAddress)=>(m,p,v)=>m==='eth_getTransactionReceipt'?{...v,status:'0x0',contractAddress}:m==='eth_getCode'?'0x':v;
 for(const contractAddress of [null,address])await assert.rejects(inspectDeployment(fixture(reverted(contractAddress)).rpc,tx,SEPOLIA.genesisHash),error=>error.code==='DEPLOY_REVERTED');
 for(const contractAddress of [undefined,finalHash,'0x'+'77'.repeat(20)])await assert.rejects(inspectDeployment(fixture(reverted(contractAddress)).rpc,tx,SEPOLIA.genesisHash),error=>error.code==='DEPLOYMENT_PROOF_INVALID');
 const dir=await mkdtemp(join(tmpdir(),'geth-reverted-')),pendingPath=join(dir,'pending.json');
 try{
  for(const pending of [{tx,address},{format:'p2p-offramp/deployment-attempt/v1',state:'broadcast-unknown',tx:null,chainId:'11155111',from,nonce:'0'}]){
   await writeFile(pendingPath,JSON.stringify(pending));
   assert.equal(await clearRecordedAttempt({pendingPath,txHash:tx,record:{initializationTx:tx,chainId:'11155111',genesisIdentity:SEPOLIA.genesisHash},rpc:fixture(reverted('0x'+'77'.repeat(20))).rpc}),false);
   assert.deepEqual(JSON.parse(await readFile(pendingPath)),pending);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
