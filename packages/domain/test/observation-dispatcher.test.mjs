import test from 'node:test';import assert from 'node:assert/strict';
import {createObservationDispatcher} from '../src/observation-dispatcher.ts';
import {parseRelayOrderHint,parseJournalPendingHint,parseObservationEnvelope} from '../../schemas/index.ts';
const binding={chain:'evm',networkId:'local-evm',deploymentId:'escrow-v1',tradeId:'pinned-trade'},orderId='a'.repeat(64),maker='b'.repeat(64);
const hint=()=>({orderId,maker,advertisement:{eventId:'c'.repeat(64),revision:1,expiresAtSeconds:'1800001800'},reason:'observed'});
test('hint parsers reject authority promotion, hostile fields and false empty/unknown combinations',()=>{
 assert.equal(parseRelayOrderHint(hint()).advertisement.revision,1);
 assert.deepEqual(parseJournalPendingHint({pendingIntentIds:null,revision:null}),{pendingIntentIds:null,revision:null});
 for(const raw of [{pendingIntentIds:[],revision:null},{pendingIntentIds:null,revision:0},{pendingIntentIds:Array(257).fill('x'),revision:1}])assert.throws(()=>parseJournalPendingHint(raw));
 const id=Buffer.alloc(32,1).toString('base64url');assert.throws(()=>parseJournalPendingHint({pendingIntentIds:[id,id],revision:1}));
 assert.throws(()=>parseRelayOrderHint({...hint(),custody:'funded'}));assert.throws(()=>parseRelayOrderHint({...hint(),get reason(){throw Error('PRIVATE')}}),e=>e.message==='Invalid core data.');
 assert.throws(()=>parseObservationEnvelope({version:1,eventId:id,binding,source:'relay',kind:'order-observed',generation:0,sequence:1,observedAt:0,data:hint()}));
});
test('only constructor-held publishers update pinned readonly hints, TTL clears and disposal revokes publishers',async()=>{
 let now=1800000000000,publisher,closed=0;const observer=createObservationDispatcher({binding,orderId,maker,now:()=>now,connect:cap=>{publisher=cap;return()=>closed++}});
 try{assert.equal('dispatchLocal'in observer,false);assert.equal(publisher.relay({...hint(),maker:'d'.repeat(64)}),false);assert.equal(publisher.relay(hint()),true);assert.equal(publisher.journal({pendingIntentIds:[],revision:0}),true);
  const snapshot=observer.inspect();assert.equal(snapshot.binding.tradeId,'pinned-trade');assert.equal(Object.isFrozen(snapshot.relay.value),true);now+=30000;assert.equal(observer.inspect().relay,null);assert.equal(observer.inspect().journal,null);
  observer.dispose();assert.equal(closed,1);assert.equal(publisher.current(),false);assert.equal(publisher.relay(hint()),false);assert.equal(observer.inspect().retired,true);
 }finally{observer.dispose()}
});
test('reentrant subscribers converge on terminal state and cannot create an unbounded delivery loop',async()=>{
 let publisher;const observer=createObservationDispatcher({binding,orderId,maker,now:()=>1800000000000,connect:cap=>{publisher=cap;return()=>{}}});let first,mutations=0;
 observer.subscribe(()=>{first=observer.inspect().retired});for(let i=0;i<63;i++)observer.subscribe(()=>{mutations++;if(i===62)observer.dispose();else publisher.journal({pendingIntentIds:[],revision:i})});publisher.relay(hint());await new Promise(r=>setImmediate(r));assert.equal(first,true);assert.equal(mutations,63);assert.equal(observer.inspect().retired,true);
});
test('a reentrant native clock retirement cannot return a live publisher or invoke later clocks',()=>{
 let publisher,armed=false,reads=0;const observer=createObservationDispatcher({binding,orderId,maker,connect:cap=>{publisher=cap;return()=>{}},now:()=>{reads++;if(armed)publisher.retire();return 1800000000000}});armed=true;assert.equal(publisher.current(),false);const before=reads;assert.equal(publisher.current(),false);assert.equal(observer.inspect().retired,true);assert.equal(reads,before);
});
test('retirement from the scheduling clock refuses publication without starting a new timer',()=>{
 let publisher,armed=false,reads=0,scheduled=0;
 const observer=createObservationDispatcher({binding,orderId,maker,connect:cap=>{publisher=cap;return()=>{}},now:()=>{if(armed&&++reads===3)publisher.retire();return 1800000000000}});
 const original=setTimeout,handles=[];globalThis.setTimeout=(...args)=>{scheduled++;const h=original(...args);handles.push(h);return h};
 try{armed=true;assert.equal(publisher.journal({pendingIntentIds:[],revision:0}),false);assert.equal(observer.inspect().retired,true);assert.equal(scheduled,0)}
 finally{observer.dispose();globalThis.setTimeout=original;for(const h of handles)clearTimeout(h)}
});
test('a retired subscriber cannot recursively reacquire closed notifications',()=>{
 const observer=createObservationDispatcher({binding,orderId,maker,connect:()=>()=>{}});observer.dispose();let calls=0;
 const reacquire=()=>{if(++calls<1000)observer.subscribe(reacquire)};
 observer.subscribe(reacquire);assert.equal(calls,1);
});
