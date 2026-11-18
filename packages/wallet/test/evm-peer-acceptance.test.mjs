import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { schnorr } from '@noble/curves/secp256k1.js';
import { evmTermsHash } from '../src/evm-terms.ts';
import { PEER_ACCEPTANCE_TYPE, peerAcceptanceHash, snapshotPeerAcceptance, verifyEoaPeerAcceptance } from '../src/evm-peer-acceptance.ts';

// Public synthetic scenario keys only; these vectors confer no production approval.
const scenario=JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json',import.meta.url),'utf8'));
const vectors=JSON.parse(await readFile(new URL('./fixtures/peer-acceptance-v1.json',import.meta.url),'utf8'));
const ownKey=Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(1))).toString('hex');
const peerKey=Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(2))).toString('hex');
const otherKey=Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(3))).toString('hex');
const types={PeerAcceptance:[
  {name:'v',type:'uint8'},{name:'termsHash',type:'bytes32'},{name:'role',type:'uint8'},
  {name:'account',type:'address'},{name:'ownMessagingKey',type:'bytes32'},
  {name:'counterpartyMessagingKey',type:'bytes32'},{name:'notAfterSeconds',type:'uint64'},
]};
function typed(domain,binding){return {domain:{name:'P2POfframp',version:'1',chainId:BigInt(domain.chainId),verifyingContract:domain.verifyingContract},
  types,primaryType:'PeerAcceptance',message:{...binding,role:binding.role==='seller'?0:1,termsHash:'0x'+binding.termsHash,
    ownMessagingKey:'0x'+binding.ownMessagingKey,counterpartyMessagingKey:'0x'+binding.counterpartyMessagingKey,notAfterSeconds:BigInt(binding.notAfterSeconds)}};}
const bytes=value=>new Uint8Array(Buffer.from(value.slice(2),'hex'));
async function fixture(role='seller',kind='native'){
  const domain=scenario.domain,terms=scenario.sets[kind].terms;
  const account=privateKeyToAccount('0x'+scenario.testOnlyKeys[role].privateKeyHex);
  const binding={v:1,termsHash:evmTermsHash(domain,terms),role,account:terms[role],ownMessagingKey:ownKey,
    counterpartyMessagingKey:peerKey,notAfterSeconds:'1699995000'};
  const termsSignature=bytes(await account.sign({hash:'0x'+binding.termsHash}));
  const bindingSignature=bytes(await account.signTypedData(typed(domain,binding)));
  const expected={role,ownMessagingKey:ownKey,counterpartyMessagingKey:peerKey,nowSeconds:'1699990000',envelopeExpiresAtSeconds:'1699996000'};
  return {domain,terms,binding,expected,proof:{binding,termsSignature,bindingSignature},account};
}
test('candidate EIP-712 binding agrees with viem for both roles and asset kinds',async()=>{
  assert.equal(PEER_ACCEPTANCE_TYPE,'PeerAcceptance(uint8 v,bytes32 termsHash,uint8 role,address account,bytes32 ownMessagingKey,bytes32 counterpartyMessagingKey,uint64 notAfterSeconds)');
  for(const role of ['seller','buyer'])for(const kind of ['native','erc20']){
    const f=await fixture(role,kind);
    const vector=vectors.vectors.find(row=>row.role===role&&row.assetKind===kind);
    assert.deepEqual(f.binding,vector.binding);assert.deepEqual(f.domain,vectors.domain);
    assert.equal(peerAcceptanceHash(f.domain,f.binding),vector.digest);
    assert.deepEqual(f.proof.termsSignature,bytes(vector.termsSignature));
    assert.deepEqual(f.proof.bindingSignature,bytes(vector.bindingSignature));
    assert.equal(peerAcceptanceHash(f.domain,f.binding),hashTypedData(typed(f.domain,f.binding)).slice(2));
    const verified=verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,f.proof);
    assert.deepEqual(verified,{candidateOnly:true,economicPreparationAllowed:false,termsHash:f.binding.termsHash,
      bindingHash:peerAcceptanceHash(f.domain,f.binding),effectiveNotAfterSeconds:f.binding.notAfterSeconds});
    assert.equal(Object.isFrozen(verified),true);
  }
});
test('both signatures and the trusted role/account/key context are mandatory',async()=>{
  const f=await fixture();
  for(const [field,value]of Object.entries({termsHash:'ab'.repeat(32),role:'buyer',account:f.terms.buyer,
    ownMessagingKey:otherKey,counterpartyMessagingKey:otherKey,notAfterSeconds:'1699995001'})){
    assert.equal(verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,{...f.proof,binding:{...f.binding,[field]:value}}),null,field);
  }
  for(const field of ['termsSignature','bindingSignature']){
    const signature=new Uint8Array(f.proof[field]);signature[0]^=1;
    assert.equal(verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,{...f.proof,[field]:signature}),null,field);
    assert.throws(()=>verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,{...f.proof,[field]:new Uint8Array(64)}),e=>e.code==='INVALID_INPUT');
  }
  assert.throws(()=>verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,{binding:f.binding,termsSignature:f.proof.termsSignature}),e=>e.code==='INVALID_INPUT');
  for(const change of [{role:'buyer'},{ownMessagingKey:peerKey,counterpartyMessagingKey:ownKey},{ownMessagingKey:otherKey}])
    assert.equal(verifyEoaPeerAcceptance(f.domain,f.terms,{...f.expected,...change},f.proof),null);
});
test('domain, terms, revision and deployment replay fail against the original proof',async()=>{
  const f=await fixture();
  for(const change of [{chainId:'1'},{verifyingContract:'0x'+'55'.repeat(20)}])
    assert.equal(verifyEoaPeerAcceptance({...f.domain,...change},f.terms,f.expected,f.proof),null);
  for(const [field,value]of Object.entries({revision:'2',networkId:'other',deploymentId:'other',orderId:'ab'.repeat(32),
    sellerNonce:'cd'.repeat(32),amountBaseUnits:'1',acceptBeforeSeconds:'1699999000',privateAgreementHash:'ef'.repeat(32)}))
    assert.equal(verifyEoaPeerAcceptance(f.domain,{...f.terms,[field]:value},f.expected,f.proof),null,field);
  // Re-signing only the binding cannot replace the exact TradeTerms signature.
  const terms={...f.terms,amountBaseUnits:'1'},binding={...f.binding,termsHash:evmTermsHash(f.domain,terms)};
  const bindingSignature=bytes(await f.account.signTypedData(typed(f.domain,binding)));
  assert.equal(verifyEoaPeerAcceptance(f.domain,terms,f.expected,{...f.proof,binding,bindingSignature}),null);
});
test('expiry is the strict earliest of terms, binding and authenticated envelope deadlines',async()=>{
  const f=await fixture();
  for(const [bindingUntil,envelopeUntil,now,accepted]of [
    ['1699995000','1699996000','1699994999',true],['1699995000','1699996000','1699995000',false],
    ['1699995000','1699991000','1699991000',false],['1700000001','1700000002','1700000000',false],
  ]){
    const binding={...f.binding,notAfterSeconds:bindingUntil};
    const bindingSignature=bytes(await f.account.signTypedData(typed(f.domain,binding)));
    assert.equal(verifyEoaPeerAcceptance(f.domain,f.terms,{...f.expected,nowSeconds:now,envelopeExpiresAtSeconds:envelopeUntil},
      {...f.proof,binding,bindingSignature})!==null,accepted);
  }
});
test('exact data-only inputs reject hostile reflection, invalid key points and integer ambiguity',async()=>{
  const f=await fixture();let invoked=0;
  const accessor={...f.binding};Object.defineProperty(accessor,'account',{get(){invoked++;throw Error('SECRET');},enumerable:true});
  const revoked=Proxy.revocable({},{});revoked.revoke();
  for(const input of [null,[],Object.create(f.binding),revoked.proxy,accessor,{...f.binding,extra:true},
    {...f.binding,v:2},{...f.binding,role:0},{...f.binding,account:'0x'+'00'.repeat(20)},
    {...f.binding,ownMessagingKey:'ff'.repeat(32)},{...f.binding,ownMessagingKey:peerKey},
    ...['01','0','-1','1e9','18446744073709551616','9'.repeat(5000)].map(notAfterSeconds=>({...f.binding,notAfterSeconds}))]){
    assert.throws(()=>snapshotPeerAcceptance(input),e=>e.code==='INVALID_INPUT'&&!e.message.includes('SECRET'));
  }
  assert.equal(invoked,0);
  const copy=snapshotPeerAcceptance(f.binding);f.binding.notAfterSeconds='1';assert.notEqual(copy.notAfterSeconds,'1');assert.ok(Object.isFrozen(copy));
});
test('malformed signatures cannot downgrade to terms-only acceptance and caller buffers are retained',async()=>{
  const f=await fixture();const original=new Uint8Array(f.proof.bindingSignature);
  assert.ok(verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,f.proof));assert.deepEqual(f.proof.bindingSignature,original);
  const n=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  for(const field of ['termsSignature','bindingSignature']){
    const high=new Uint8Array(f.proof[field]);const s=BigInt('0x'+Buffer.from(high.subarray(32,64)).toString('hex'));
    high.set(Buffer.from((n-s).toString(16).padStart(64,'0'),'hex'),32);high[64]=high[64]===27?28:27;
    assert.throws(()=>verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,{...f.proof,[field]:high}),e=>e.code==='INVALID_INPUT');
  }
});
test('proof and trusted-context accessors or revoked proxies never escape the fixed error boundary',async()=>{
  const f=await fixture();let touched=0;
  for(const [target,field]of [['proof','bindingSignature'],['expected','nowSeconds'],['domain','chainId'],['terms','seller']]){
    const input={...f[target]};Object.defineProperty(input,field,{enumerable:true,get(){touched++;throw Error('SECRET');}});
    const args={...f,[target]:input};
    assert.throws(()=>verifyEoaPeerAcceptance(args.domain,args.terms,args.expected,args.proof),error=>error.code==='INVALID_INPUT'&&!error.message.includes('SECRET'));
  }
  const revoked=Proxy.revocable({},{});revoked.revoke();
  assert.throws(()=>verifyEoaPeerAcceptance(f.domain,f.terms,f.expected,revoked.proxy),error=>error.code==='INVALID_INPUT');
  for(const nowSeconds of ['01','-1','1.0','18446744073709551616'])
    assert.throws(()=>verifyEoaPeerAcceptance(f.domain,f.terms,{...f.expected,nowSeconds},f.proof),error=>error.code==='INVALID_INPUT');
  assert.equal(touched,0);
});
test('frozen D1 PeerAcceptance v1 vectors match the README sha256 and the standalone viem generator byte-for-byte',async()=>{
  const { createHash } = await import('node:crypto');
  const raw=await readFile(new URL('./fixtures/peer-acceptance-v1.json',import.meta.url));
  const readme=await readFile(new URL('./fixtures/peer-acceptance-v1-README.md',import.meta.url),'utf8');
  const recorded=/Frozen JSON SHA-256: `([0-9a-f]{64})`/.exec(readme)?.[1];
  assert.equal(createHash('sha256').update(raw).digest('hex'),recorded);
  const { generatePeerAcceptanceV1 }=await import('./fixtures/peer-acceptance-v1-generate.mjs');
  assert.equal(await generatePeerAcceptanceV1(),raw.toString('utf8'));
});
