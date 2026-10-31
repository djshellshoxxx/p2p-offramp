/** Explicit local-only Anvil fixture; no process or server is started merely by importing. */
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BrowserProvider, ContractFactory, HDNodeWallet, TypedDataEncoder, ZeroAddress, sha256 } from 'ethers';
import { compileContracts } from '../scripts/compile.mjs';
let compiled;
const ANVIL = fileURLToPath(new URL('../node_modules/@foundry-rs/anvil-linux-amd64/bin/anvil',import.meta.url));
const MNEMONIC = 'test test test test test test test test test test test junk'; // Published Anvil development keys, never funds.
export const fields = [['v','uint8'],['orderId','bytes32'],['revision','uint64'],['networkId','string'],['deploymentId','string'],['seller','address'],['buyer','address'],['assetKind','uint8'],['asset','address'],['amountBaseUnits','uint256'],['privateAgreementHash','bytes32'],['capabilitiesHash','bytes32'],['sellerNonce','bytes32'],['acceptBeforeSeconds','uint64'],['escrowExpirySeconds','uint64'],['mode','uint8']];
export const types = { TradeTerms: fields.map(([name,type]) => ({name,type})) };
export async function fixture() {
  compiled ??= compileContracts();
  const version=execFileSync(ANVIL,['--version'],{encoding:'utf8',timeout:5000,maxBuffer:4096});
  if (!version.includes('Version: 1.7.1') || !version.includes('4072e48705af9d93e3c0f6e29e93b5e9a40caed8')) throw Error('Unexpected Anvil build');
  const child=spawn(ANVIL,['--host','127.0.0.1','--port','0','--chain-id','31337','--hardfork','shanghai','--slots-in-an-epoch','1',
    '--timestamp','1767225600','--accounts','5','--balance','1000','--mnemonic',MNEMONIC],{stdio:['ignore','pipe','pipe']});
  let provider,closed=false;
  const cleanup=async()=>{
    if(closed)return;closed=true;provider?.destroy();
    if(child.pid&&child.exitCode===null&&child.signalCode===null){
      const stopped=new Promise(resolve=>child.once('exit',resolve));
      child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),1000);timer.unref();
      await stopped;clearTimeout(timer);
    }
  };
  try {
    const url=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(Error('Local Anvil startup timed out')),10000);
      const failed=()=>{clearTimeout(timer);reject(Error('Local Anvil startup failed'));};
      child.once('error',failed);child.once('exit',failed);
      child.stderr.on('data',()=>{}); // Never print the startup account/key listing or raw subprocess diagnostics.
      child.stdout.on('data',data=>{
        if(output.length>16384)return;output+=data.toString();
        const match=/Listening on (127\.0\.0\.1:\d+)/.exec(output);
        if(match){clearTimeout(timer);resolve('http://'+match[1]);output='';}
      });
    });
    let sequence=0;
    const rpc={
      async request({method,params=[]}){
        // Compatibility alias for the earlier local test API, never a connection fallback.
        if(method==='evm_setAccountCode')method='anvil_setCode';
        const id=++sequence;
        const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('Local RPC unavailable');
        const chunks=[];let size=0;
        for await(const chunk of response.body){size+=chunk.length;if(size>4*1024*1024)throw Error('Local RPC response exceeds fixture bound');chunks.push(chunk);}
        const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(raw.id!==id||raw.jsonrpc!=='2.0')throw Error('Local RPC reply mismatch');
        if(raw.error){const error=Error('Local EVM rejected request');error.code=raw.error.code;error.data=raw.error.data;throw error;}
        return raw.result;
      },
      disconnect:cleanup,
    };
    await rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});
    provider=new BrowserProvider(rpc,31337,{cacheTimeout:-1});provider.pollingInterval=10;
    const signers=await Promise.all([0,1,2,3,4].map(i=>provider.getSigner(i)));
    const secrets=[0,1,2,3,4].map(i=>HDNodeWallet.fromPhrase(MNEMONIC,undefined,`m/44'/60'/0'/0/${i}`));
    for(let i=0;i<signers.length;i++)if((await signers[i].getAddress())!==secrets[i].address)throw Error('Local development key mismatch');
    const [seller,buyer,outsider]=signers;
    const deploy=async(name,args=[],options={})=>{const art=compiled[name];const instance=await new ContractFactory(art.abi,art.bytecode,seller).deploy(...args,options);await instance.waitForDeployment();return instance;};
    const token=await deploy('TestToken');
    const escrow=await deploy('BasicEscrow',['local-evm','escrow-local-v1',[await token.getAddress()]]);
    let serial=0n;
    const now=async()=>BigInt((await rpc.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
    const at=async timestamp=>{await rpc.request({method:'evm_setTime',params:[Number(timestamp)*1000]});await rpc.request({method:'evm_mine',params:[]});};
    const finalize=async()=>{await rpc.request({method:'anvil_mine',params:[2]});};
    const terms=async overrides=>({v:1,orderId:'0x'+(++serial).toString(16).padStart(64,'0'),revision:1,networkId:'local-evm',deploymentId:'escrow-local-v1',seller:await seller.getAddress(),buyer:await buyer.getAddress(),assetKind:0,asset:ZeroAddress,amountBaseUnits:1000n,privateAgreementHash:'0x'+'12'.repeat(32),capabilitiesHash:sha256('0x00'),sellerNonce:'0x'+serial.toString(16).padStart(64,'0'),acceptBeforeSeconds:(await now())+600n,escrowExpirySeconds:(await now())+3600n,mode:0,...overrides});
    const domain=async address=>({name:'P2POfframp',version:'1',chainId:31337,verifyingContract:address??await escrow.getAddress()});
    const signatures=async(t,{sellerKey=secrets[0],buyerKey=secrets[1],domainOverride}={})=>{const d=domainOverride??await domain();return[await sellerKey.signTypedData(d,types,t),await buyerKey.signTypedData(d,types,t)];};
    const fund=async(t,sigs,options={})=>escrow.connect(seller).fund(t,...(sigs??await signatures(t)),{value:t.assetKind===0?t.amountBaseUnits:0n,...options});
    const hash=async t=>TypedDataEncoder.hash(await domain(),types,t);
    const balance=async address=>BigInt(await rpc.request({method:'eth_getBalance',params:[address,'latest']}));
    return{rpc,provider,signers,secrets,seller,buyer,outsider,token,escrow,deploy,now,at,finalize,terms,domain,signatures,fund,hash,balance,cleanup,compiled};
  }catch(error){await cleanup();throw error;}
}
