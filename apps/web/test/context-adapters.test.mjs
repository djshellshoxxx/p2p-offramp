import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeContextObservers} from '../src/context-adapters/observations.ts';
import {EncryptedVaultService} from '../../../packages/storage/src/vault-service.ts';
import {createLifecycleJournal} from '../../../packages/domain/src/intent-journal.ts';
import {createTradeAuthority} from '../../../packages/domain/src/authority.ts';
import {createRelayPool,createAdEvent} from '../../../packages/relay/index.ts';
import {createRelayEventCrypto,createLocalNobleNostrProvider} from '../../../packages/nostr-crypto/index.ts';
import {makeBroker,memoryNetwork,seller,adFor,NOW,ORDER,until} from '../../../packages/relay/test/support/harness.mjs';
const binding={chain:'evm',networkId:'local-evm',deploymentId:'escrow-v1',tradeId:'pinned-trade'},account='0x'+'ab'.repeat(20),pass='native observation fixture passphrase';
const val=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value};
class Store{rows=new Map();beforeGet;subscribeInvalidation(){return()=>{}}async get(id){await this.beforeGet?.();return structuredClone(this.rows.get(id))}async add(row,o){o.assertCurrent();this.rows.set(row.profileId,structuredClone(row))}async compareAndSwap(old,row,o){o.assertCurrent();assert.deepEqual(this.rows.get(row.profileId),old);this.rows.set(row.profileId,structuredClone(row))}}
async function setup(){let now=NOW*1000,clockHook=()=>{};const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),session=val(await vault.create(pass));const journal=createLifecycleJournal({vault,session,validateCanonical:()=>({ok:true,value:undefined}),now:()=>0});const authority=createTradeAuthority({binding,generation:0,walletGeneration:0,readValidated:async()=>{throw Error('native chain deliberately absent')}});const eventCrypto=await createRelayEventCrypto(createLocalNobleNostrProvider(),seller.sk);const {broker}=makeBroker(),net=memoryNetwork(),pool=createRelayPool({broker,relays:[{endpointId:'relay-a',url:'wss://fixture.example/'}],verifier:eventCrypto,connect:net.connector,nowSeconds:()=>Math.floor(now/1000)});
 const observer=createNativeContextObservers({binding,relayNetworkId:'eip155:8453',orderId:ORDER,maker:seller.pubkey,account,pool,verifier:eventCrypto,journal,vault,session,authority,broker,now:()=>{clockHook();return now}});
 const cleanup=()=>{observer.dispose();pool.close();broker.dispose();authority.dispose();journal.dispose();vault.dispose();eventCrypto.dispose()};return{store,vault,session,journal,authority,broker,net,pool,observer,cleanup,signedAd:over=>createAdEvent(eventCrypto,adFor(over),NOW),setNow:t=>now=t,setClockHook:hook=>clockHook=hook};}
const prepared=()=>({version:1,intentId:Buffer.alloc(32,9).toString('base64url'),binding,account,action:'fund',state:'prepared',walletGeneration:0,expectedEscrowState:'absent',preparedRequest:'{"to":"escrow","value":"1"}',submission:{chain:'evm',hash:null,nonce:null},replacementOf:null,createdAt:0,updatedAt:0});
test('actual native relay pool verifies signed discovery, dedupes/conflicts and cannot promote pinned chain authority',async()=>{
 const s=await setup();try{await until(()=>s.net.sockets[0]?.sent.some(x=>x[0]==='REQ'));const socket=s.net.sockets[0],sub=socket.sent.find(x=>x[0]==='REQ')[1],ad=await s.signedAd();socket.deliver(JSON.stringify(['EVENT',sub,ad]));await until(()=>s.observer.inspect().relay!==null);assert.equal(s.observer.inspect().relay.value.advertisement.eventId,ad.id);assert.equal(s.observer.inspect().binding.tradeId,'pinned-trade');assert.equal(s.authority.readView(NOW*1000).chain,null);assert.equal(s.authority.economicPreparationAllowed(),false);
  const sequence=s.observer.inspect().relay.sequence;socket.deliver(JSON.stringify(['EVENT',sub,ad]));assert.equal(s.observer.inspect().relay.sequence,sequence);
  const conflicting=await s.signedAd({amountMin:'10000001'});socket.deliver(JSON.stringify(['EVENT',sub,conflicting]));await until(()=>s.observer.inspect().relay?.value.reason==='conflict');assert.equal(s.observer.inspect().relay.value.advertisement,null);
  s.broker.invalidate();assert.equal(s.observer.inspect().retired,true);assert.equal(s.observer.inspect().relay,null);assert.equal((await s.observer.refreshJournal()).error.code,'CANCELLED');
 }finally{s.cleanup()}
});
test('actual native G12/G02 snapshot gives pending references; unknown revision remains unknown and lock retires source',async()=>{
 const s=await setup();try{const intent={...prepared(),account:'0x'+account.slice(2).toUpperCase()};val(await s.journal.reserve(intent,0));const data=val(await s.observer.refreshJournal());assert.deepEqual(data.pendingIntentIds,[intent.intentId]);assert.equal(data.revision,1);assert.equal(s.authority.readView(NOW*1000).chain,null);
  s.journal.dispose();const unknown=val(await s.observer.refreshJournal());assert.equal(unknown.pendingIntentIds,null);assert.equal(unknown.revision,null);s.vault.lock(s.session.sessionId);assert.equal(s.observer.inspect().retired,true);assert.equal(s.observer.inspect().journal,null);
 }finally{s.cleanup()}
});
test('journal refresh retains one physical native job through cancellation and suppresses every stale result',async()=>{
 const s=await setup();try{let finish,entered;const gate=new Promise(r=>finish=r),ready=new Promise(r=>entered=r);s.store.beforeGet=()=>{entered();return gate};const control=new AbortController();const pending=s.observer.refreshJournal(control.signal);await ready;control.abort();assert.equal((await s.observer.refreshJournal()).error.code,'LIMIT_EXCEEDED');s.store.beforeGet=undefined;finish();assert.equal((await pending).error.code,'CANCELLED');assert.equal(s.observer.inspect().journal,null);assert.deepEqual(val(await s.observer.refreshJournal()).pendingIntentIds,[]);s.setNow(NOW*1000+30000);assert.equal(s.observer.inspect().journal,null);
 }finally{s.cleanup()}
});
test('native restored terminal labels never turn pending references into empty observations without fresh chain proof',async()=>{
 const {encodeIntentPayload}=await import('../../../packages/schemas/index.ts');const s=await setup();try{
  const intent=prepared();val(await s.journal.reserve(intent,0));const record=val(await s.vault.list(s.session.sessionId,'journal'))[0];
  const restored={...intent,state:'finalized',submission:{chain:'evm',hash:'0x'+'11'.repeat(32),nonce:'1'}};
  val(await s.vault.commit(s.session.sessionId,1,[{op:'put',record:{...record,payload:encodeIntentPayload(restored)}}]));
  const observed=val(await s.observer.refreshJournal());assert.deepEqual(observed.pendingIntentIds,[intent.intentId]);assert.equal(observed.revision,2);assert.equal(s.journal.isTerminalVerified(intent.intentId),false);
 }finally{s.cleanup()}
});
test('generation retirement and signed-ad expiry clear hints and start zero further native source jobs',async()=>{
 const s=await setup();try{await until(()=>s.net.sockets[0]?.sent.some(x=>x[0]==='REQ'));const socket=s.net.sockets[0],sub=socket.sent.find(x=>x[0]==='REQ')[1];const ad=await s.signedAd({expiresAtSeconds:String(NOW+5)});socket.deliver(JSON.stringify(['EVENT',sub,ad]));await until(()=>s.observer.inspect().relay!==null);s.setNow((NOW+5)*1000);assert.equal(s.observer.inspect().relay,null);
  val(s.authority.invalidate(binding));const attempts=s.net.attempts;assert.equal(s.observer.inspect().retired,true);assert.equal((await s.observer.refreshJournal()).error.code,'CANCELLED');socket.deliver(JSON.stringify(['EVENT',sub,ad]));assert.equal(s.observer.inspect().relay,null);assert.equal(s.net.attempts,attempts);
 }finally{s.cleanup()}
});
test('native broker subscription exhaustion retires a newly captured context instead of leaking a live source',async()=>{
 const s=await setup();s.observer.dispose();const stops=[];try{
  for(let i=0;i<64;i++)stops.push(s.broker.subscribeInvalidation(()=>{}));
  const observer=createNativeContextObservers({binding,relayNetworkId:'eip155:8453',orderId:ORDER,maker:seller.pubkey,account,pool:s.pool,verifier:{verifyEvent:()=>false},journal:s.journal,vault:s.vault,session:s.session,authority:s.authority,broker:s.broker,now:()=>NOW*1000});
  assert.equal(observer.inspect().retired,true);assert.equal((await observer.refreshJournal()).error.code,'CANCELLED');observer.dispose();
 }finally{for(const stop of stops)stop();s.cleanup()}
});

test('final native publication callbacks cannot return known or unknown hints after scope retirement',async()=>{
 for(const variant of ['broker-during-success','dispose-during-unknown']){
  const s=await setup();let calls=0;
  try{
   if(variant==='dispose-during-unknown')s.journal.dispose();
   s.setClockHook(()=>{calls++;if(variant==='broker-during-success'&&calls===4)s.broker.invalidate();if(variant==='dispose-during-unknown'&&calls===3)s.observer.dispose()});
   const result=await s.observer.refreshJournal();s.setClockHook(()=>{});
   assert.equal(result.ok,false,variant);assert.equal(result.error.code,'CANCELLED');assert.equal(s.observer.inspect().retired,true);
  }finally{s.setClockHook(()=>{});s.cleanup()}
 }
});
