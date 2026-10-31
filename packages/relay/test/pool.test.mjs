import test from 'node:test';
import assert from 'node:assert/strict';
import { schnorr } from '@noble/curves/secp256k1.js';
import { advertisementEventId } from '../src/advertisement.ts';
import { RelayPool } from '../src/pool.ts';
const encode=value=>new TextEncoder().encode(JSON.stringify(value)),flush=()=>new Promise(resolve=>setImmediate(resolve));
const key=new Uint8Array(32);key[31]=2;const hex=bytes=>Buffer.from(bytes).toString('hex');
function event(){const pubkey=hex(schnorr.getPublicKey(key));const ad={app:'p2p-offramp',v:1,orderId:'a'.repeat(64),revision:1,networkId:'local-evm',assetId:'native',amount:'1',currency:'USD',railClass:'manual',maker:pubkey,expiresAtSeconds:'2000',termsDigest:'b'.repeat(64)};const raw={pubkey,created_at:1000,kind:30078,tags:[['d',`p2p-offramp:v1:${ad.orderId}`],['expiration','2000']],content:JSON.stringify(ad)};const id=advertisementEventId(raw);return {...raw,id,sig:hex(schnorr.sign(Buffer.from(id,'hex'),key,new Uint8Array(32)))};}
function setup(ids=['one']){const connections=[];let now=0;const connector={connect:async(id,handlers,signal)=>{const connection={id,handlers,signal,sent:[],closed:0,send(frame){this.sent.push(JSON.parse(frame));},close(){this.closed++;}};connections.push(connection);return connection;}};const pool=new RelayPool({relayIds:ids,connector,nowSeconds:()=>1000n,nowMs:()=>now,random:()=>.5,ackTimeoutMs:100});return {pool,connections,time:value=>{now=value;}};}
test('no implicit connections, exact subscription bounds, native events, per-relay ACK and no republish',async()=>{
 const s=setup(['one','two']);assert.equal(s.connections.length,0);let observed=0;
 const subscribed=s.pool.subscribe({since:1000,limit:100},()=>observed++);assert.equal(subscribed.ok,true);await flush();assert.equal(s.connections.length,2);
 const signed=event(),subscription=s.connections[0].sent[0][1];s.connections[0].handlers.message(encode(['EVENT',subscription,signed]));assert.equal(observed,1);
 s.connections[1].handlers.message(encode(['EVENT',subscription,signed]));assert.equal(observed,1,'duplicate relays do not duplicate orders');
 const pending=s.pool.publish(encode(signed));for(const c of s.connections)c.handlers.message(encode(['OK',signed.id,c.id==='one','relay message never forwarded']));
 assert.deepEqual((await pending).value.map(value=>value.status),['accepted','rejected']);for(const c of s.connections)assert.equal(c.sent.filter(frame=>frame[0]==='EVENT').length,1);
 for(let i=0;i<3;i++)assert.equal(s.pool.subscribe({since:1000,limit:1},()=>{}).ok,true);
 assert.equal(s.pool.subscribe({since:1000,limit:1},()=>{}).code,'LIMIT_EXCEEDED');await s.pool.dispose();assert.equal(s.connections.every(c=>c.signal.aborted&&c.closed===1),true);
});
test('ACK loss/cancel stays unknown; 32 outstanding publications bounded; dispose suppresses late frames',async()=>{
 const s=setup();s.pool.subscribe({since:1000,limit:1},()=>{});await flush();const signed=event();const abort=new AbortController();
 const pending=s.pool.publish(encode(signed),abort.signal);abort.abort();assert.equal((await pending).value[0].status,'unknown');
 const jobs=[];for(let i=0;i<32;i++)jobs.push(s.pool.publish(encode({...signed,id:signed.id}))); // concurrent identical IDs are not resent
 assert.equal((await s.pool.publish(encode(signed))).code,'LIMIT_EXCEEDED');
 await Promise.all(jobs); // only first has an ACK timer; the rest resolve unknown
 let notifications=0;s.pool.subscribe({since:1000,limit:1},()=>notifications++);await s.pool.dispose();
 s.connections[0].handlers.message(encode(['EVENT','orders-1',signed]));assert.equal(notifications,0);assert.equal(s.pool.snapshot().length,0);
 assert.equal((await s.pool.publish(encode(signed))).code,'CANCELLED');
});
test('unsubscribe/resubscribe waits for physical close; rejected close permanently blocks that slot',async()=>{
 let release;let connects=0;const handlers=[];
 const pool=new RelayPool({relayIds:['only'],nowSeconds:()=>1000n,connector:{connect:async(_id,h)=>{handlers.push(h);connects++;return{send(){},close(){return new Promise(resolve=>release=resolve);}};}}});
 const first=pool.subscribe({since:1000,limit:1},()=>{});await flush();first.value();pool.subscribe({since:1000,limit:1},()=>{});await flush();assert.equal(connects,1);release();await flush();assert.equal(connects,2);
 const closing=pool.dispose();release();await closing;
 let failedCount=0,brokenHandlers;const broken=new RelayPool({relayIds:['only'],nowSeconds:()=>1000n,connector:{connect:async(_id,h)=>{brokenHandlers=h;failedCount++;return{send(){},close(){throw Error('physical close failed');}};}}});
 broken.subscribe({since:1000,limit:1},()=>{});await flush();brokenHandlers.message(new Uint8Array(65537));await flush();broken.retry();assert.equal(failedCount,1);await broken.dispose();
});
test('rate burst and oversized frames are bounded before signature work; no fallback relay is selected',async()=>{
 const s=setup();s.pool.subscribe({since:1000,limit:1},()=>{});await flush();const c=s.connections[0];
 for(let i=0;i<21;i++)c.handlers.message(encode(['NOTICE','ignored']));
 s.time(10000);for(let i=0;i<21;i++)c.handlers.message(encode(['NOTICE','ignored']));
 s.time(20000);for(let i=0;i<21;i++)c.handlers.message(encode(['NOTICE','ignored']));await flush();assert.equal(c.closed,1);assert.equal(s.connections.length,1);
 await s.pool.dispose();
 const t=setup();t.pool.subscribe({since:1000,limit:1},()=>{});await flush();t.connections[0].handlers.message(new Uint8Array(65537));await flush();assert.equal(t.connections[0].closed,1);await t.pool.dispose();
});
test('cancelled late connector stays owned and drains physically before disposal resolves',async()=>{
 let resolveConnect;let closed=0;let callback;const connector={connect:(_id,handlers)=>{callback=handlers;return new Promise(resolve=>resolveConnect=resolve);}};
 const pool=new RelayPool({relayIds:['only'],connector,nowSeconds:()=>1000n});const subscription=pool.subscribe({since:1000,limit:1},()=>{throw Error('late notification');});
 subscription.value();let disposed=false;const disposal=pool.dispose();assert.equal(pool.dispose(),disposal);const done=disposal.then(()=>{disposed=true;});await flush();assert.equal(disposed,false);assert.equal(pool.unsettledSlots,1);
 resolveConnect({send(){throw Error('late send');},close(){closed++;}});await done;assert.equal(closed,1);assert.equal(pool.unsettledSlots,0);callback.message(encode(['NOTICE','late']));assert.equal(pool.snapshot().length,0);
});
test('filters reject unbounded history/limits and retry stops after six reconnect attempts',async t=>{
 let connects=0;const pool=new RelayPool({relayIds:['only'],connector:{connect:async()=>{connects++;throw Error('offline');}},nowSeconds:()=>100000n,random:()=>0});
 assert.equal(pool.subscribe({since:0,limit:1},()=>{}).ok,false);assert.equal(pool.subscribe({since:100000,limit:101},()=>{}).ok,false);
 assert.equal(pool.subscribe(null,()=>{}).code,'INVALID_INPUT');assert.equal(pool.subscribe({get since(){throw Error('hostile');},limit:1},()=>{}).code,'INVALID_INPUT');assert.equal(pool.subscribe(new Proxy({},{ownKeys(){throw Error('hostile');}}),()=>{}).code,'INVALID_INPUT');
 t.mock.timers.enable({apis:['setTimeout']});try{pool.subscribe({since:100000,limit:1},()=>{});for(let i=0;i<12;i++){await flush();t.mock.timers.tick(1);}await flush();assert.equal(connects,7);await pool.dispose();}finally{t.mock.timers.reset();}
});
test('connect timeout aborts but retains the physical slot until a late socket drains',async t=>{
 let resolveConnect,signal,connects=0,closes=0;
 const pool=new RelayPool({relayIds:['only'],nowSeconds:()=>1000n,random:()=>.5,connector:{connect:(_id,_handlers,s)=>{signal=s;connects++;return new Promise(resolve=>resolveConnect=resolve);}}});
 t.mock.timers.enable({apis:['setTimeout']});try{
  pool.subscribe({since:1000,limit:1},()=>{});t.mock.timers.tick(30000);assert.equal(signal.aborted,true);
  t.mock.timers.tick(30000);assert.equal(connects,1,'no replacement while old connector remains physically unsettled');
  resolveConnect({send(){throw Error('late send');},close(){closes++;}});await flush();assert.equal(closes,1);
  const done=pool.dispose();await done;
 }finally{t.mock.timers.reset();}
});
test('connect timeouts never count as stable uptime or reset the six-retry budget',async t=>{
 let connects=0,now=120000;
 const pool=new RelayPool({relayIds:['only'],nowSeconds:()=>1000n,nowMs:()=>now,random:()=>0,connector:{connect:(_id,_handlers,signal)=>{
  connects++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted timeout')),{once:true}));
 }}});
 t.mock.timers.enable({apis:['setTimeout']});try{
  pool.subscribe({since:1000,limit:1},()=>{});
  for(let i=0;i<10;i++){now+=30000;t.mock.timers.tick(30000);await flush();t.mock.timers.tick(1);await flush();}
  assert.equal(connects,7,'initial attempt plus six retries, despite clock already exceeding 60 seconds');
  assert.equal(pool.unsettledSlots,0);await pool.dispose();
 }finally{t.mock.timers.reset();}
});
test('sixty seconds of an actual established socket replenishes reconnect attempts',async t=>{
 let connects=0,now=0,handlers;
 const pool=new RelayPool({relayIds:['only'],nowSeconds:()=>1000n,nowMs:()=>now,random:()=>0,connector:{connect:async(_id,h)=>{
  connects++;if(connects!==3)throw Error('offline');handlers=h;return{send(){},close(){}};
 }}});
 t.mock.timers.enable({apis:['setTimeout']});try{
  pool.subscribe({since:1000,limit:1},()=>{});for(let i=0;i<5;i++){await flush();t.mock.timers.tick(1);}await flush();assert.equal(connects,3);
  now=60000;handlers.closed();for(let i=0;i<15;i++){await flush();t.mock.timers.tick(1);}await flush();
  assert.equal(connects,9,'stable established connection allows six new reconnect attempts');await pool.dispose();
 }finally{t.mock.timers.reset();}
});
