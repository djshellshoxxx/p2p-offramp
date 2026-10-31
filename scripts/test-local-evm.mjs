/** Complete synthetic two-party local EVM proof. Loopback-only Anvil chain; never app wiring or a release approval. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { fixture } from '../packages/escrow-evm/test/helpers.mjs';
import { RegistryService, reviewTermsBytes, encodePrivateAgreement } from '../packages/domain/index.ts';
import { EvmWalletAdapter } from '../packages/wallet/src/evm-adapter.ts';
import { createEvmExecution, parsePreparedEvmRequest } from '../packages/wallet/src/evm-execution.ts';
import { createIntentJournal } from '../packages/domain/src/intent-journal.ts';
import { EvmChainReader } from '../packages/chain-evm/src/reader.ts';
import { advertisementEventId, validateAdvertisement, AdvertisementBook } from '../packages/relay/src/advertisement.ts';
import { EncryptedVaultService, EncryptedBackupService } from '../packages/storage/index.ts';
import { VaultStorageError } from '../packages/storage/src/idb-vault-store.ts';
import { encodeBase64url } from '../packages/schemas/index.ts';
import { schnorr } from '@noble/curves/secp256k1.js';
const { keccak256 } = createRequire(new URL('../packages/escrow-evm/package.json', import.meta.url))('ethers');
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const rows = new Map();
const store = {
  get: async id => structuredClone(rows.get(id)),
  add: async (row, options) => { options?.assertCurrent?.(); if(rows.has(row.profileId))throw new VaultStorageError('CONFLICT'); rows.set(row.profileId, structuredClone(row)); },
  compareAndSwap: async (expected, next, options) => { options?.assertCurrent?.(); if(JSON.stringify(rows.get(expected.profileId)) !== JSON.stringify(expected))throw new VaultStorageError('CONFLICT'); rows.set(next.profileId, structuredClone(next)); },
  listProfileIds: async()=>({profileIds:[...rows.keys()],truncated:false}),
  subscribeInvalidation:()=>()=>{},
};
const s = await fixture();
let vault, journal, lease;
try {
  const address=(await s.escrow.getAddress()).toLowerCase(), token=(await s.token.getAddress()).toLowerCase();
  const registryInput=JSON.parse(await readFile(new URL('../packages/domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url)));
  const network=registryInput.networks[0];
  network.genesisHash=(await s.rpc.request({method:'eth_getBlockByNumber',params:['0x0',false]})).hash;
  network.assets[1].address=token;
  network.deployments[0].address=address;
  const code=await s.rpc.request({method:'eth_getCode',params:[address,'latest']});
  network.deployments[0].runtime.keccak256=keccak256(code).slice(2);
  network.deployments[0].artifactSha256=sha(JSON.stringify(s.compiled.BasicEscrow.abi));
  const registry=new RegistryService(), registryBytes=new TextEncoder().encode(JSON.stringify(registryInput));
  val(await registry.load(registryBytes,sha(registryBytes)));
  const reader=new EvmChainReader({rpc:s.rpc,registry});
  await s.finalize();
  val(await reader.validateLive('local-evm','escrow-local-v1'));
  let unknownSend=false;
  const ports=s.secrets.slice(0,2).map(key=>{const events=new EventEmitter();return{on:events.on.bind(events),removeListener:events.removeListener.bind(events),request:async({method,params=[]})=>{
    if(method==='eth_requestAccounts'||method==='eth_accounts')return[key.address.toLowerCase()];
    if(method==='eth_signTypedData_v4'){
      const typed=JSON.parse(params[1]),types={...typed.types};delete types.EIP712Domain;
      return key.signTypedData(typed.domain,types,typed.message);
    }
    if(method==='eth_sendTransaction'){
      const tx={...params[0]};tx.gas=await s.rpc.request({method:'eth_estimateGas',params:[tx]});
      const hash=await s.rpc.request({method,params:[tx]});
      if(unknownSend){unknownSend=false;throw new Error('Synthetic lost response after native send');}
      return hash;
    }
    return s.rpc.request({method,params});
  }};});
  const adapters=ports.map((port,index)=>new EvmWalletAdapter(port,`local-fixture-${index}`,registry));
  const sessions=await Promise.all(adapters.map(adapter=>adapter.connect('local-evm').then(val)));
  const intents=new Map(), termSets=new Map();
  const validateCanonical=async intent=>{
    const expected=intents.get(intent.intentId);
    return expected && expected.preparedRequest===intent.preparedRequest && JSON.stringify(expected.binding)===JSON.stringify(intent.binding) && expected.action===intent.action && expected.account===intent.account
      ? {ok:true,value:undefined} : {ok:false,error:{code:'INTEGRITY_FAILURE'}};
  };
  const readNative=async(intent,signal)=>{
    const request=parsePreparedEvmRequest(intent.preparedRequest), terms=termSets.get(intent.binding.tradeId);
    assert.ok(terms);
    let hash=intent.submission.hash;
    if(!hash){
      // Bounded native history scan for the test's lost response. No cached hash or imported terminal label.
      const latest=BigInt(await s.rpc.request({method:'eth_blockNumber'}));
      for(let height=latest,scanned=0;height>=0n&&scanned<128;height--,scanned++){
        const block=await s.rpc.request({method:'eth_getBlockByNumber',params:[`0x${height.toString(16)}`,true]});
        const transaction=block.transactions.find(tx=>tx.from.toLowerCase()===request.from&&BigInt(tx.nonce).toString()===request.nonce&&tx.to?.toLowerCase()===request.to&&tx.input.toLowerCase()===request.data&&BigInt(tx.value).toString()===request.value);
        if(transaction){hash=transaction.hash;break;}
      }
    }
    const live=val(await reader.validateLive('local-evm','escrow-local-v1',signal));
    if(!hash)return{ok:true,value:{binding:intent.binding,account:intent.account,action:intent.action,state:'broadcast-unknown',hash:null,nonce:request.nonce,replacementHash:null,anchor:{height:live.height,hash:live.hash},canonical:true,finalized:false}};
    const receipt=val(await reader.receipt(intent.binding,{hash,from:request.from,to:request.to,data:request.data,value:request.value,nonce:request.nonce},signal));
    const snapshot=val(await reader.read(intent.binding,{generation:0,requestSequence:1,signal},terms));
    if(receipt.kind==='finalized'&&receipt.succeeded){
      assert.notEqual(snapshot.escrow.state,'absent');
      if(intent.action==='release')assert.equal(snapshot.escrow.state,'released');
      if(intent.action==='refund')assert.equal(snapshot.escrow.state,'refunded');
    }
    const finalized=receipt.kind==='finalized';
    return{ok:true,value:{binding:intent.binding,account:intent.account,action:intent.action,state:receipt.kind==='reorged'?'reorged':finalized?(receipt.succeeded?'finalized':'failed'):receipt.kind==='pending'?'pending':'broadcast-unknown',hash,nonce:request.nonce,replacementHash:null,anchor:receipt.anchor??{height:live.height,hash:live.hash},canonical:receipt.kind!=='reorged',finalized}};
  };
  const pass='public synthetic local journey passphrase';
  vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
  let session=val(await vault.create(pass));
  const attach=()=>{
    lease=val(vault.captureSession(session,()=>{}));
    journal=createIntentJournal({vault,session,validateCanonical,readNative});
  };
  attach();
  let offers=0,acceptances=0,submissions=0,reconciliations=0;
  const scenarios=[];
  for(const [assetKind,terminal] of [[0,'release'],[1,'refund']]){
    const t=await s.terms({assetKind,asset:assetKind?token:'0x'+'0'.repeat(40)});
    const agreement={v:1,orderId:t.orderId.slice(2),revision:'1',fiatCurrency:'USD',fiatMinorUnits:'100',fiatScale:2,paymentInstructions:'SYNTHETIC local manual payment; no fiat was sent.',capabilities:[],agreementSalt:'45'.repeat(32)};
    t.privateAgreementHash='0x'+sha(encodePrivateAgreement(agreement));
    const publicTerms={orderId:t.orderId.slice(2),revision:String(t.revision),networkId:t.networkId,deploymentId:t.deploymentId,seller:t.seller.toLowerCase(),buyer:t.buyer.toLowerCase(),assetKind:assetKind?'erc20':'native',asset:t.asset.toLowerCase(),amountBaseUnits:t.amountBaseUnits.toString(),privateAgreementHash:t.privateAgreementHash.slice(2),capabilitiesHash:t.capabilitiesHash.slice(2),sellerNonce:t.sellerNonce.slice(2),acceptBeforeSeconds:t.acceptBeforeSeconds.toString(),escrowExpirySeconds:t.escrowExpirySeconds.toString()};
    const document=new TextEncoder().encode(JSON.stringify({format:'p2p-offramp/local-terms-review/v1',terms:publicTerms,privateAgreement:agreement}));
    val(await reviewTermsBytes(registry,document));
    const digest=await s.hash(t),tradeId=digest.slice(2),binding={chain:'evm',networkId:t.networkId,deploymentId:t.deploymentId,tradeId};
    const now=await s.now(),key=new Uint8Array(32).fill(7),pubkey=hex(schnorr.getPublicKey(key));
    const ad={app:'p2p-offramp',v:1,orderId:publicTerms.orderId,revision:1,networkId:t.networkId,assetId:assetKind?'test-usd':'native',amount:publicTerms.amountBaseUnits,currency:'USD',railClass:'manual',maker:pubkey,expiresAtSeconds:(now+600n).toString(),termsDigest:tradeId};
    const event={pubkey,created_at:Number(now),kind:30078,tags:[['d',`p2p-offramp:v1:${ad.orderId}`],['expiration',ad.expiresAtSeconds]],content:JSON.stringify(ad)};
    event.id=advertisementEventId(event);event.sig=hex(schnorr.sign(Buffer.from(event.id,'hex'),key));key.fill(0);
    const checked=val(await validateAdvertisement(new TextEncoder().encode(JSON.stringify(event)),now));
    assert.equal(checked.ad.termsDigest,tradeId);offers++;
    // A fresh book separately establishes bounded local ingestion; no ad ever authorizes funding.
    const book=new AdvertisementBook();book.ingest(new TextEncoder().encode(JSON.stringify(event)),now);
    const domain={chainId:'31337',verifyingContract:address};
    const signatures=await Promise.all(adapters.map((adapter,index)=>adapter.signTerms(sessions[index],domain,publicTerms,index===0?'seller':'buyer').then(val)));
    acceptances+=2;
    const sigHex=signatures.map(sig=>'0x'+hex(sig));
    termSets.set(tradeId,{seller:publicTerms.seller,buyer:publicTerms.buyer,asset:publicTerms.asset,amountBaseUnits:publicTerms.amountBaseUnits,expirySeconds:publicTerms.escrowExpirySeconds});
    if(assetKind){await(await s.token.mint(t.seller,10000n)).wait();await(await s.token.approve(address,t.amountBaseUnits)).wait();}
    const execute=async(action,loseResponse=false)=>{
      const nonce=BigInt(await s.rpc.request({method:'eth_getTransactionCount',params:[publicTerms.seller,'latest']})).toString();
      const data=s.escrow.interface.encodeFunctionData(action==='fund'?'fund':action,action==='fund'?[t,...sigHex]:[digest]).toLowerCase();
      const preparedRequest=JSON.stringify({version:1,chainId:'31337',from:publicTerms.seller,to:address,value:action==='fund'&&!assetKind?publicTerms.amountBaseUnits:'0',data,nonce});
      const intent={version:1,intentId:encodeBase64url(randomBytes(32)),binding,account:publicTerms.seller,action,state:'prepared',walletGeneration:sessions[0].generation,expectedEscrowState:action==='fund'?'absent':'funded',preparedRequest,submission:{chain:'evm',hash:null,nonce},replacementOf:null,createdAt:Date.now(),updatedAt:Date.now()};
      intents.set(intent.intentId,intent);
      const execution=createEvmExecution({provider:ports[0],session:{account:publicTerms.seller,chainId:'31337',generation:sessions[0].generation},isCurrent:()=>adapters[0].inspect()===sessions[0],journal,validateCanonical});
      unknownSend=loseResponse;
      const result=await execution.submit(intent,lease.current().revision);submissions++;
      if(loseResponse){
        assert.equal(result.ok,false);assert.equal(result.error.code,'BROADCAST_UNKNOWN');
        assert.equal(val(await journal.unresolved(binding,publicTerms.seller)).length,1);
        // Reopen the encrypted source and reconcile from native history, without resubmitting.
        const profileId=session.profileId;journal.dispose();lease.dispose();vault.dispose();
        vault=new EncryptedVaultService(store,crypto,{lifecycle:false});session=val(await vault.unlock(profileId,pass));attach();
      }else val(result);
      await s.finalize();
      const reconciled=val(await journal.reconcileNative(intent.intentId));reconciliations++;
      assert.equal(reconciled.state,'finalized');assert.equal(val(await journal.unresolved(binding,publicTerms.seller)).length,0);
      execution.dispose();
    };
    await execute('fund',assetKind===0);
    assert.equal(val(await reader.read(binding,{generation:0,requestSequence:1,signal:new AbortController().signal},termSets.get(tradeId))).escrow.state,'funded');
    if(terminal==='refund')await s.at(t.escrowExpirySeconds);
    await execute(terminal);
    assert.equal(val(await reader.read(binding,{generation:0,requestSequence:2,signal:new AbortController().signal},termSets.get(tradeId))).escrow.state,terminal==='release'?'released':'refunded');
    scenarios.push({asset:assetKind?'erc20':'native',terminal,tradeId});
  }
  // Portable encrypted journal recovery: restored terminal labels still require fresh native observations.
  const backup=new EncryptedBackupService(store),exported=await backup.exportWithStatus(session.profileId);
  const restored=await backup.restore(exported.bytes,pass,'public synthetic fresh-key recovery passphrase');
  assert.notEqual(restored.newProfileId,session.profileId);
  const recovered=val(await vault.unlock(restored.newProfileId,'public synthetic fresh-key recovery passphrase'));
  const restoredJournal=createIntentJournal({vault,session:recovered,validateCanonical,readNative});
  for(const item of scenarios){
    const binding={chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:item.tradeId};
    assert.equal(val(await restoredJournal.unresolved(binding,sessions[0].account)).length,0);
    const conservative=createIntentJournal({vault,session:recovered,validateCanonical});
    assert.equal(val(await conservative.unresolved(binding,sessions[0].account)).length,2,'restored terminal labels alone never release reservations');
    conservative.dispose();
  }
  restoredJournal.dispose();backup.dispose();adapters.forEach(adapter=>adapter.dispose());
  console.log(JSON.stringify({fixture:'two-party-loopback-local-evm',offers,acceptances,submissions,reconciliations,scenarios,unknownResponseNativeRecovery:true,encryptedFreshKeyJournalRestore:true,externalNetwork:false,tradingEnabled:false,releaseAcceptance:false}));
}finally{journal?.dispose();lease?.dispose();vault?.dispose();await s.cleanup();}
