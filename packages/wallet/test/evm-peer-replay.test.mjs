import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { encodeBase64url } from '../../schemas/index.ts';
import { RegistryService } from '../../domain/index.ts';
import { peerAcceptanceHash } from '../src/evm-peer-acceptance.ts';
import { CandidatePeerReplayLedger, PEER_REPLAY_RECORD_ID, PEER_REPLAY_FORMAT, MAX_PEER_REPLAY_TERMS } from '../src/evm-peer-replay.ts';
const scenario=JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json',import.meta.url),'utf8'));
const registry=new RegistryService();
assert.equal((await registry.load(new Uint8Array(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url))),scenario.registrySha256)).ok,true);
const vectors=JSON.parse(await readFile(new URL('./fixtures/peer-acceptance-v1.json',import.meta.url),'utf8'));
const pass='synthetic peer replay fixture passphrase',clone=value=>structuredClone(value);
const bytes=value=>new Uint8Array(Buffer.from(value.slice(2),'hex'));
const val=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const err=(result,code)=>{assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/SECRET|signature|privateKey/);};
class Store {
  rows=new Map();writes=0;beforeWrite;afterCommit;
  subscribeInvalidation(){return ()=>{};}
  async get(id){return clone(this.rows.get(id));}
  async add(row,options){options?.assertCurrent?.();this.rows.set(row.profileId,clone(row));this.writes++;}
  async compareAndSwap(expected,next,options){
    await this.beforeWrite?.();options?.assertCurrent?.();
    if(JSON.stringify(this.rows.get(expected.profileId))!==JSON.stringify(expected))throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId,clone(next));this.writes++;this.afterCommit?.();
  }
}
function fixture(role='seller'){
  const row=vectors.vectors.find(row=>row.role===role&&row.assetKind==='native');
  return {domain:scenario.domain,terms:scenario.sets.native.terms,
    context:{role,ownMessagingKey:row.binding.ownMessagingKey,counterpartyMessagingKey:row.binding.counterpartyMessagingKey,
      nowSeconds:'1699990000',envelopeExpiresAtSeconds:'1699996000'},
    proof:{binding:clone(row.binding),termsSignature:bytes(row.termsSignature),bindingSignature:bytes(row.bindingSignature)}};
}
async function setup(t){
  const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),session=val(await vault.create(pass));
  const ledger=new CandidatePeerReplayLedger(vault,session);t.after(()=>{ledger.dispose();vault.dispose();});
  return {store,vault,session,ledger};
}
const admit=(ledger,f)=>ledger.admitEoa(registry,f.domain,f.terms,f.context,f.proof);
async function changedBinding(f,changes){
  const binding={...f.proof.binding,...changes},account=privateKeyToAccount('0x'+scenario.testOnlyKeys[binding.role].privateKeyHex);
  return {...f,context:{...f.context,ownMessagingKey:binding.ownMessagingKey,counterpartyMessagingKey:binding.counterpartyMessagingKey},
    proof:{...f.proof,binding,bindingSignature:bytes(await account.sign({hash:'0x'+peerAcceptanceHash(f.domain,binding)}))}};
}
test('encrypted replay identity survives reopen; exact duplicate is a synchronized no-write operation',async t=>{
  const s=await setup(t),f=fixture();assert.equal(val(await admit(s.ledger,f)).status,'recorded');
  const writes=s.store.writes;assert.equal(val(await admit(s.ledger,f)).status,'duplicate');assert.equal(s.store.writes,writes);
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]),/termsHash|ownMessagingKey|PeerAcceptance/);
  s.ledger.dispose();s.vault.lockAll();const reopened=val(await s.vault.unlock(s.session.profileId,pass));
  const ledger=new CandidatePeerReplayLedger(s.vault,reopened);t.after(()=>ledger.dispose());
  assert.equal(val(await admit(ledger,f)).status,'duplicate');
});
test('cancel/reject tombstone survives fresh-key backup restore and blocks new sessions',async t=>{
  const s=await setup(t),f=fixture();val(await s.ledger.tombstone(f.proof.binding.termsHash));err(await admit(s.ledger,f),'CONFLICT');
  const writes=s.store.writes;val(await s.ledger.tombstone(f.proof.binding.termsHash));assert.equal(s.store.writes,writes);
  const backup=new EncryptedBackupService(s.store,crypto),exported=await backup.export(s.session.profileId);
  const receipt=await backup.restore(exported,pass,'fresh peer replay recovery passphrase');
  const restored=val(await s.vault.unlock(receipt.newProfileId,'fresh peer replay recovery passphrase'));
  const ledger=new CandidatePeerReplayLedger(s.vault,restored);t.after(()=>ledger.dispose());
  err(await admit(ledger,f),'CONFLICT');assert.notEqual(restored.profileId,s.session.profileId);
});
test('a second valid signature over the same binding deduplicates by identity, not signature bytes',async t=>{
  const s=await setup(t),f=fixture();val(await admit(s.ledger,f));const writes=s.store.writes;
  const digest=Buffer.from(peerAcceptanceHash(f.domain,f.proof.binding),'hex');
  const recovered=secp256k1.sign(digest,Buffer.from(scenario.testOnlyKeys.seller.privateKeyHex,'hex'),
    {prehash:false,format:'recovered',lowS:true,extraEntropy:new Uint8Array(32).fill(7)});
  const bindingSignature=Uint8Array.from([...recovered.subarray(1),recovered[0]+27]);
  assert.notDeepEqual(bindingSignature,f.proof.bindingSignature);
  assert.equal(val(await admit(s.ledger,{...f,proof:{...f.proof,bindingSignature}})).status,'duplicate');assert.equal(s.store.writes,writes);
});
test('conflicting keys or expiry require new terms, even with freshly valid signatures',async t=>{
  const s=await setup(t),f=fixture();val(await admit(s.ledger,f));const writes=s.store.writes;
  const other=Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(3))).toString('hex');
  for(const change of [{ownMessagingKey:other},{counterpartyMessagingKey:other},{notAfterSeconds:'1699995001'}])
    err(await admit(s.ledger,await changedBinding(f,change)),'CONFLICT');
  assert.equal(s.store.writes,writes);
});
test('both roles must agree on reciprocal messaging keys before recording the second role',async t=>{
  const s=await setup(t),seller=fixture(),buyer=fixture('buyer');val(await admit(s.ledger,seller));
  err(await admit(s.ledger,buyer),'CONFLICT'); // fixture keys are signer-relative, deliberately not reciprocal
  const reciprocal=await changedBinding(buyer,{ownMessagingKey:seller.context.counterpartyMessagingKey,counterpartyMessagingKey:seller.context.ownMessagingKey});
  assert.equal(val(await admit(s.ledger,reciprocal)).status,'recorded');
});
test('a stale duplicate cannot bypass a tombstone committed by another vault session',async t=>{
  const s=await setup(t),f=fixture();val(await admit(s.ledger,f));
  const secondSession=val(await s.vault.unlock(s.session.profileId,pass)),second=new CandidatePeerReplayLedger(s.vault,secondSession);t.after(()=>second.dispose());
  val(await s.ledger.tombstone(f.proof.binding.termsHash));const writes=s.store.writes;
  err(await admit(second,f),'CONFLICT');assert.equal(s.store.writes,writes);
});
test('concurrent first bindings have exactly one CAS winner without automatic retry',async t=>{
  const s=await setup(t),f=fixture(),secondSession=val(await s.vault.unlock(s.session.profileId,pass));
  const second=new CandidatePeerReplayLedger(s.vault,secondSession);t.after(()=>second.dispose());
  const other=Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(3))).toString('hex');
  const conflicting=await changedBinding(f,{ownMessagingKey:other});
  const results=await Promise.all([admit(s.ledger,f),admit(second,conflicting)]);
  assert.equal(results.filter(r=>r.ok).length,1);err(results.find(r=>!r.ok),'CONFLICT');assert.equal(s.store.writes,2);
});
test('invalid proof, hostile accessors and expiry cannot create replay records',async t=>{
  const s=await setup(t),f=fixture();let calls=0;
  const proof={...f.proof};Object.defineProperty(proof,'binding',{enumerable:true,get(){calls++;throw Error('SECRET');}});
  err(await admit(s.ledger,{...f,proof}),'INVALID_INPUT');assert.equal(calls,0);
  err(await admit(s.ledger,{...f,context:{...f.context,nowSeconds:f.proof.binding.notAfterSeconds}}),'UNAUTHORIZED');
  const bindingSignature=new Uint8Array(f.proof.bindingSignature);bindingSignature[0]^=1;
  err(await admit(s.ledger,{...f,proof:{...f.proof,bindingSignature}}),'UNAUTHORIZED');assert.equal(s.store.writes,1);
});
test('durable record is always the exact binding verified, even with a proxy property trap',async t=>{
  const s=await setup(t),f=fixture();let gets=0;
  const proof=new Proxy(f.proof,{get(target,key){if(key==='binding'){gets++;return {...target.binding,notAfterSeconds:'1'};}return Reflect.get(target,key);}});
  assert.equal(val(await admit(s.ledger,{...f,proof})).status,'recorded');assert.equal(gets,0);
  assert.equal(val(await admit(s.ledger,f)).status,'duplicate');
});
test('lock before CAS prevents writes; lock after CAS retains durable replay history',async t=>{
  const s=await setup(t),f=fixture();s.store.beforeWrite=()=>s.vault.lock(s.session.sessionId);
  err(await admit(s.ledger,f),'LOCKED');assert.equal(s.store.writes,1);
  s.store.beforeWrite=undefined;
  const session=val(await s.vault.unlock(s.session.profileId,pass)),ledger=new CandidatePeerReplayLedger(s.vault,session);t.after(()=>ledger.dispose());
  s.store.afterCommit=()=>s.vault.lock(session.sessionId);err(await admit(ledger,f),'LOCKED');assert.equal(s.store.writes,2);
  s.store.afterCommit=undefined;
  const reopened=val(await s.vault.unlock(s.session.profileId,pass)),again=new CandidatePeerReplayLedger(s.vault,reopened);t.after(()=>again.dispose());
  assert.equal(val(await admit(again,f)).status,'duplicate');
});
test('capacity retains tombstones without pruning; malformed/foreign records cannot be overwritten',async t=>{
  const s=await setup(t),f=fixture();
  const entries=Array.from({length:MAX_PEER_REPLAY_TERMS},(_,i)=>({termsHash:(i+1).toString(16).padStart(64,'0'),tombstoned:true,seller:null,buyer:null}));
  const record=payload=>({id:PEER_REPLAY_RECORD_ID,kind:'preference',schemaVersion:1,payload:encodeBase64url(new TextEncoder().encode(JSON.stringify(payload)))});
  const seed=record({format:PEER_REPLAY_FORMAT,entries});val(await s.vault.commit(s.session.sessionId,0,[{op:'put',record:seed}]));
  err(await admit(s.ledger,f),'LIMIT_EXCEEDED');err(await s.ledger.tombstone('ff'.repeat(32)),'LIMIT_EXCEEDED');
  assert.equal(val(await s.vault.read(s.session.sessionId,PEER_REPLAY_RECORD_ID)).payload,seed.payload);
  let revision=1;
  for(const bad of [{...seed,kind:'trade'},{...seed,schemaVersion:2},record({format:PEER_REPLAY_FORMAT,entries:[entries[0],entries[0]]}),record({format:'future',entries:[]})]){
    val(await s.vault.commit(s.session.sessionId,revision++,[{op:'put',record:bad}]));
    const before=s.store.writes,result=await admit(s.ledger,f);assert.equal(result.ok,false);assert.equal(s.store.writes,before);
  }
});
