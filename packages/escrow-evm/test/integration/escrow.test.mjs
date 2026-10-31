import test from 'node:test';
import assert from 'node:assert/strict';
import { ZeroAddress } from 'ethers';
import { fixture, types } from '../helpers.mjs';
import { evmTermsHash } from '../../../wallet/src/evm-terms.ts';
const mined=async p=>await(await p).wait();
const revert=async p=>assert.rejects(async()=>{const result=await p; if(result?.wait)await result.wait();});
const asWalletTerms=t=>{const {v,mode,...rest}=t;return {...rest,revision:String(rest.revision),assetKind:rest.assetKind===0?'native':'erc20',amountBaseUnits:String(rest.amountBaseUnits),acceptBeforeSeconds:String(rest.acceptBeforeSeconds),escrowExpirySeconds:String(rest.escrowExpirySeconds),orderId:rest.orderId.slice(2),privateAgreementHash:rest.privateAgreementHash.slice(2),capabilitiesHash:rest.capabilitiesHash.slice(2),sellerNonce:rest.sellerNonce.slice(2),seller:rest.seller.toLowerCase(),buyer:rest.buyer.toLowerCase(),asset:rest.asset.toLowerCase()};};

test('two-party native acceptance matches independent/client/on-chain digest, releases exactly once, refunds permissionlessly',async()=>{
 const f=await fixture();try{
  const t=await f.terms(),id=await f.hash(t);
  assert.equal(await f.escrow.termsHash(t),id);
  assert.equal('0x'+evmTermsHash({chainId:'31337',verifyingContract:(await f.escrow.getAddress()).toLowerCase()},asWalletTerms(t)),id);
  const buyer=await f.buyer.getAddress(),before=await f.balance(buyer);
  const receipt=await mined(f.fund(t));const event=f.escrow.interface.parseLog(receipt.logs[0]);assert.equal(event.name,'Funded');assert.equal(event.args.id,id);
  assert.equal((await f.escrow.escrows(id)).state,1n);assert.equal(await f.escrow.outstandingPrincipal(ZeroAddress),1000n);
  await revert(f.escrow.connect(f.buyer).release(id));await revert(f.escrow.connect(f.outsider).refund(id));
  await mined(f.escrow.release(id));assert.equal(await f.balance(buyer)-before,1000n);assert.equal((await f.escrow.escrows(id)).state,2n);
  await revert(f.escrow.release(id));await revert(f.escrow.refund(id));assert.equal(await f.escrow.outstandingPrincipal(ZeroAddress),0n);
  const r=await f.terms(),rid=await f.hash(r);await mined(f.fund(r));await f.at(r.escrowExpirySeconds);
  const sellerBefore=await f.balance(await f.seller.getAddress());await mined(f.escrow.connect(f.outsider).refund(rid));
  assert.equal(await f.balance(await f.seller.getAddress())-sellerBefore,r.amountBaseUnits);assert.equal((await f.escrow.escrows(rid)).state,3n);
 }finally{await f.cleanup();}
});

test('all term/signature/domain/deployment and replay failures preserve absent state and nonce',async()=>{
 const f=await fixture();try{
  const good=await f.terms(),sigs=await f.signatures(good);
  for(const changes of [{amountBaseUnits:0n},{buyer:good.seller},{buyer:ZeroAddress},{v:2},{mode:1},{revision:0},{networkId:'other'},{deploymentId:'other'},{assetKind:2},{asset:await f.token.getAddress()},{capabilitiesHash:'0x'+'00'.repeat(32)}]){
   const t={...good,...changes};await revert(f.fund(t,sigs));assert.equal((await f.escrow.escrows(await f.hash(t))).state,0n);
  }
  await revert(f.escrow.connect(f.buyer).fund(good,...sigs,{value:good.amountBaseUnits}));
  await revert(f.fund({...good,amountBaseUnits:1001n},sigs));await revert(f.fund(good,[sigs[1],sigs[0]]));
  for(const domainOverride of [{...await f.domain(),chainId:1},{...await f.domain(),verifyingContract:await f.token.getAddress()}])await revert(f.fund(good,await f.signatures(good,{domainOverride})));
  await revert(f.fund(good,['0x'+'01'.repeat(4097),sigs[1]]));
  await revert(f.fund(good,['0x',sigs[1]]));
  const n=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const highS=sigs[0].slice(0,66)+(n-BigInt('0x'+sigs[0].slice(66,130))).toString(16).padStart(64,'0')+(sigs[0].slice(130)==='1b'?'1c':'1b');
  await revert(f.fund(good,[highS,sigs[1]]));
  await revert(f.fund(good,sigs,{value:999n}));await revert(f.fund(good,sigs,{value:1001n}));
  assert.equal(await f.escrow.usedSellerNonces(good.seller,good.sellerNonce),false);
  await mined(f.fund(good,sigs));await revert(f.fund(good,sigs));
  const reused=await f.terms({sellerNonce:good.sellerNonce});await revert(f.fund(reused));
  assert.equal((await f.escrow.escrows(await f.hash(reused))).state,0n);
 }finally{await f.cleanup();}
});

test('funding and settlement deadlines have exact disjoint boundaries',async()=>{
 const f=await fixture();try{
  for(const duration of [1799n,604801n]){const t=await f.terms({escrowExpirySeconds:(await f.now())+duration});await revert(f.fund(t));}
  for(const duration of [1800n,604800n]){const t=await f.terms({escrowExpirySeconds:(await f.now())+duration});await mined(f.fund(t));}
  const t=await f.terms({acceptBeforeSeconds:await f.now()});await revert(f.fund(t));
  const t2=await f.terms(),id=await f.hash(t2);await mined(f.fund(t2));await f.at(t2.escrowExpirySeconds-1n);await revert(f.escrow.refund(id));await mined(f.escrow.release(id));
  const t3=await f.terms(),id3=await f.hash(t3);await mined(f.fund(t3));await f.at(t3.escrowExpirySeconds);await revert(f.escrow.release(id3));await mined(f.escrow.connect(f.buyer).refund(id3));
 }finally{await f.cleanup();}
});

test('ERC20 exact principal, no-return compatibility, dishonest deposits and payouts revert atomically',async()=>{
 const f=await fixture();try{
  const token=await f.token.getAddress(),seller=await f.seller.getAddress(),buyer=await f.buyer.getAddress(),escrow=await f.escrow.getAddress();
  await mined(f.token.mint(seller,100000n));await mined(f.token.approve(escrow,100000n));
  for(const mode of [1,3,4,6,7]){await mined(f.token.setMode(mode));const t=await f.terms({assetKind:1,asset:token});await revert(f.fund(t));assert.equal((await f.escrow.escrows(await f.hash(t))).state,0n);assert.equal(await f.escrow.usedSellerNonces(seller,t.sellerNonce),false);assert.equal(await f.token.balanceOf(escrow),0n);}
  for(const mode of [0,2]){await mined(f.token.setMode(mode));const t=await f.terms({assetKind:1,asset:token});const id=await f.hash(t);await mined(f.fund(t));const before=await f.token.balanceOf(buyer);await mined(f.escrow.release(id));assert.equal(await f.token.balanceOf(buyer)-before,1000n);}
  await mined(f.token.setMode(0));const t=await f.terms({assetKind:1,asset:token}),id=await f.hash(t);await mined(f.fund(t));
  for(const mode of [1,3,4,6,7]){await mined(f.token.setMode(mode));await revert(f.escrow.release(id));assert.equal((await f.escrow.escrows(id)).state,1n);assert.equal(await f.token.balanceOf(escrow),1000n);assert.equal(await f.escrow.outstandingPrincipal(token),1000n);}
  await mined(f.token.setMode(0));await f.at(t.escrowExpirySeconds);const before=await f.token.balanceOf(seller);await mined(f.escrow.connect(f.outsider).refund(id));assert.equal(await f.token.balanceOf(seller)-before,1000n);
  const unknown=await f.terms({assetKind:1,asset:await f.outsider.getAddress()});await revert(f.fund(unknown));
  await mined(f.token.setMode(5));const callback=await f.terms({assetKind:1,asset:token});await mined(f.token.setCallback(escrow,f.escrow.interface.encodeFunctionData('release',[await f.hash(callback)])));await mined(f.fund(callback));assert.equal(await f.token.callbackSucceeded(),false);await mined(f.escrow.release(await f.hash(callback)));
  await f.rpc.request({method:'evm_setAccountCode',params:[token,'0x00']});await revert(f.fund(await f.terms({assetKind:1,asset:token})));
 }finally{await f.cleanup();}
});

test('EIP1271 revocation, failed receivers, reentrancy and forced surplus do not lose other principal',async()=>{
 const f=await fixture();try{
  const sellerWallet=await f.deploy('TestWallet',[await f.seller.getAddress()]);const buyerWallet=await f.deploy('TestWallet',[await f.buyer.getAddress()]);
  const escrow=await f.escrow.getAddress();
  const invokeFund=async t=>sellerWallet.execute(escrow,f.escrow.interface.encodeFunctionData('fund',[t,...await f.signatures(t)]),{value:t.amountBaseUnits});
  const t=await f.terms({seller:await sellerWallet.getAddress(),buyer:await buyerWallet.getAddress()}),id=await f.hash(t);
  await mined(buyerWallet.connect(f.buyer).configure(true,false,ZeroAddress,'0x'));await revert(invokeFund(t));assert.equal(await f.escrow.usedSellerNonces(t.seller,t.sellerNonce),false);
  await mined(buyerWallet.connect(f.buyer).configure(false,false,ZeroAddress,'0x'));await mined(invokeFund(t));
  await mined(buyerWallet.connect(f.buyer).configure(false,true,ZeroAddress,'0x'));await revert(sellerWallet.execute(escrow,f.escrow.interface.encodeFunctionData('release',[id])));assert.equal((await f.escrow.escrows(id)).state,1n);
  await mined(buyerWallet.connect(f.buyer).configure(false,false,escrow,f.escrow.interface.encodeFunctionData('refund',[id])));
  await mined(sellerWallet.execute(escrow,f.escrow.interface.encodeFunctionData('release',[id])));assert.equal(await buyerWallet.callbackSucceeded(),false);
  const refundTerms=await f.terms({seller:await sellerWallet.getAddress()}),refundId=await f.hash(refundTerms);await mined(invokeFund(refundTerms));await f.at(refundTerms.escrowExpirySeconds);
  await mined(sellerWallet.configure(false,true,ZeroAddress,'0x'));await revert(f.escrow.connect(f.outsider).refund(refundId));assert.equal((await f.escrow.escrows(refundId)).state,1n);await mined(sellerWallet.configure(false,false,escrow,f.escrow.interface.encodeFunctionData('refund',[refundId])));await mined(f.escrow.connect(f.outsider).refund(refundId));assert.equal(await sellerWallet.callbackSucceeded(),false);
  const a=await f.terms(),b=await f.terms();await mined(f.fund(a));await mined(f.fund(b));
  const force=await f.deploy('ForceEther',[],{value:777n});await mined(force.force(escrow));assert.equal(await f.balance(escrow),2777n);assert.equal(await f.escrow.outstandingPrincipal(ZeroAddress),2000n);
  await mined(f.escrow.release(await f.hash(a)));assert.equal(await f.balance(escrow),1777n);
  await f.at(b.escrowExpirySeconds);await mined(f.escrow.connect(f.outsider).refund(await f.hash(b)));assert.equal(await f.balance(escrow),777n);assert.equal(await f.escrow.outstandingPrincipal(ZeroAddress),0n);
 }finally{await f.cleanup();}
});

test('bounded randomized action sequences preserve per-asset liabilities and one terminal payout',async()=>{
 const f=await fixture();try{
  await mined(f.token.mint(await f.seller.getAddress(),100000n));await mined(f.token.approve(await f.escrow.getAddress(),100000n));
  const entries=[];let seed=0x7351;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<8;i++){const t=await f.terms({assetKind:i%2,asset:i%2?await f.token.getAddress():ZeroAddress,amountBaseUnits:BigInt(1+rnd()%10000)});await mined(f.fund(t));entries.push({t,id:await f.hash(t),terminal:false});}
  for(let i=0;i<30;i++){const e=entries[rnd()%entries.length];if(e.terminal){await revert(f.escrow.release(e.id));continue;}if(rnd()%3===0)await revert(f.escrow.connect(f.outsider).release(e.id));else{await mined(f.escrow.release(e.id));e.terminal=true;}
   for(const asset of [ZeroAddress,await f.token.getAddress()]){const expected=entries.filter(x=>!x.terminal&&x.t.asset===asset).reduce((sum,x)=>sum+x.t.amountBaseUnits,0n);assert.equal(await f.escrow.outstandingPrincipal(asset),expected);assert.equal(asset===ZeroAddress?await f.balance(await f.escrow.getAddress()):await f.token.balanceOf(await f.escrow.getAddress()),expected);}
  }
  await f.at((await f.now())+3601n);for(const e of entries)if(!e.terminal){await mined(f.escrow.connect(f.outsider).refund(e.id));e.terminal=true;}
  assert.equal(await f.escrow.outstandingPrincipal(ZeroAddress),0n);assert.equal(await f.escrow.outstandingPrincipal(await f.token.getAddress()),0n);
 }finally{await f.cleanup();}
});

test('uint256 principal boundary and constructor/unsolicited deposit refusals are checked',async()=>{
 const f=await fixture();try{
  const escrow=await f.escrow.getAddress(),token=await f.token.getAddress(),seller=await f.seller.getAddress(),buyer=await f.buyer.getAddress();
  await revert(f.seller.sendTransaction({to:escrow,value:1n}));
  await revert(f.deploy('BasicEscrow',['local-evm','escrow-local-v1',[token,token]]));
  await revert(f.deploy('BasicEscrow',['local-evm','escrow-local-v1',[await f.outsider.getAddress()]]));
  await revert(f.deploy('BasicEscrow',['a'.repeat(65),'escrow-local-v1',[]]));
  const max=(1n<<256n)-1n;await mined(f.token.mint(seller,max));await mined(f.token.approve(escrow,max));
  const t=await f.terms({assetKind:1,asset:token,amountBaseUnits:max}),id=await f.hash(t);
  await mined(f.fund(t));assert.equal(await f.escrow.outstandingPrincipal(token),max);await mined(f.escrow.release(id));
  assert.equal(await f.token.balanceOf(buyer),max);assert.equal(await f.escrow.outstandingPrincipal(token),0n);
 }finally{await f.cleanup();}
});
