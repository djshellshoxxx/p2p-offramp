import test from 'node:test';
import assert from 'node:assert/strict';
import {MessagingIdentityService} from '../src/identity-service.ts';
import {createLocalNobleIdentityProvider,createIdentityHistoryRetention} from '../index.ts';
import {createLocalNobleNostrProvider} from '../../nostr-crypto/index.ts';
import {createDurableTradeChat,encodeMessage} from '../../messaging/index.ts';
import {EncryptedVaultService} from '../../storage/index.ts';
import {Store} from '../../messaging/test/support.mjs';
import {decodeBase64url,encodeBase64url} from '../../schemas/index.ts';
const pass='native identity history fixture passphrase',binding={chain:'evm',networkId:'local-evm',deploymentId:'basic-v1',tradeId:'ab'.repeat(32)};
function good(r){assert.equal(r.ok,true,JSON.stringify(r));return r.value;}
async function setup(t){
 const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),session=good(await vault.create(pass));
 const native=createLocalNobleIdentityProvider();let secret;
 const identity=new MessagingIdentityService(vault,{provider:{...native,async generate(){const pair=await native.generate();secret=new Uint8Array(pair.secretKey);return pair;}},lifecycle:false});
 const reference=good(await identity.create(session)),selfPublicKey=good(await identity.publicIdentity(reference.handle));
 const provider=createLocalNobleNostrProvider(),peer=await provider.generate(),participants=[selfPublicKey,peer.publicKey];
 const chat=good(createDurableTradeChat({vault,session,provider,binding,participants,selfPublicKey,nowMs:()=>100}));
 const bytes=good(encodeMessage({format:'p2p-offramp-message',version:1,binding,termsHash:binding.tradeId,messageId:'12'.repeat(16),sender:selfPublicKey,recipient:peer.publicKey,kind:'text',createdAt:100,body:'PRIVATE ORIGINAL LOCAL HISTORY'}));
 const sent=good(await chat.send(bytes,secret));bytes.fill(0);chat.close();const history=createIdentityHistoryRetention(vault);
 t.after(()=>{history.dispose();identity.dispose();vault.dispose();secret.fill(0);peer.secretKey.fill(0);});
 return{store,vault,session,identity,reference,selfPublicKey,participants,sent,history};
}
test('purpose-specific native G01 history capability reauthenticates actual NIP17 and returns only bounded dependency metadata',async t=>{
 const s=await setup(t),writes=s.store.writes;const view=good(await s.history.authenticate(s.session,s.reference.identityRecordId,{binding,participants:s.participants}));
 assert.equal(view.profileId,s.session.profileId);assert.equal(view.selfPublicKey,s.selfPublicKey);assert.equal(view.revision,2);assert.deepEqual(view.binding,binding);
 assert.deepEqual(view.records,[{recordId:s.sent.recordId,receivedSequence:1,receivedAt:100}]);assert.equal(s.store.writes,writes);
 assert.deepEqual(Object.keys(view).sort(),['profileId','revision','conversationId','binding','selfPublicKey','records'].sort());
 assert.doesNotMatch(JSON.stringify(view),/PRIVATE ORIGINAL|secret|wrap|content|signature|rumorId/);assert.deepEqual(Object.keys(s.history).sort(),['authenticate','dispose']);
});
test('wrong participants, modified native wrap and lock never mint authenticated history metadata',async t=>{
 const s=await setup(t),provider=createLocalNobleNostrProvider(),other=await provider.generate();t.after(()=>other.secretKey.fill(0));
 assert.equal((await s.history.authenticate(s.session,s.reference.identityRecordId,{binding,participants:[other.publicKey,s.participants[1]]})).ok,false);
 const record=good(await s.vault.read(s.session.sessionId,s.sent.recordId)),bytes=decodeBase64url(record.payload,1,262144);let raw;
 try{raw=JSON.parse(new TextDecoder().decode(bytes));}finally{bytes.fill(0);}
 raw.wrap.content=raw.wrap.content.slice(0,-1)+(raw.wrap.content.endsWith('A')?'B':'A');const changed=new TextEncoder().encode(JSON.stringify(raw));
 const lease=good(s.vault.captureSession(s.session,()=>{}));good(await s.vault.commit(s.session.sessionId,lease.current().revision,[{op:'put',record:{...record,payload:encodeBase64url(changed)}}]));lease.dispose();changed.fill(0);
 const writes=s.store.writes,result=await s.history.authenticate(s.session,s.reference.identityRecordId,{binding,participants:s.participants});assert.equal(result.ok,false);assert.equal(s.store.writes,writes);assert.doesNotMatch(JSON.stringify(result),/PRIVATE ORIGINAL|content|secret/);
 s.vault.lockAll();assert.equal((await s.history.authenticate(s.session,s.reference.identityRecordId,{binding,participants:s.participants})).error.code,'LOCKED');
});
test('purpose-specific identity history preserves current revision and cancellation boundaries',async t=>{
 const s=await setup(t);let release,started;const ready=new Promise(r=>started=r),read=s.vault.read.bind(s.vault);
 const wrapped=new Proxy(s.vault,{get(target,key){if(key==='read')return async(...args)=>{started();await new Promise(r=>release=r);return read(...args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const history=createIdentityHistoryRetention(wrapped);t.after(()=>history.dispose());const controller=new AbortController();
 const pending=history.authenticate(s.session,s.reference.identityRecordId,{binding,participants:s.participants},controller.signal);await ready;controller.abort();release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.error.code,'CANCELLED');
 const before=s.store.writes;const other=new EncryptedVaultService(s.store,crypto,{lifecycle:false});t.after(()=>other.dispose());const session=good(await other.unlock(s.session.profileId,pass));
 good(await other.commit(session.sessionId,session.revision,[{op:'put',record:{id:'ff'.repeat(16),kind:'preference',schemaVersion:1,payload:'e30'}}]));
 assert.equal((await s.history.authenticate(s.session,s.reference.identityRecordId,{binding,participants:s.participants})).ok,false);assert.equal(s.store.writes,before+1);
});
