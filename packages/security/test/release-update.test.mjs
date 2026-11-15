import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetUpdateController} from '../src/release-update.ts';
import {readUntrustedReleaseManifest} from '../src/release-manifest.ts';
import {readUntrustedReleaseLocator} from '../src/release-locator.ts';
import {revalidateRelease} from '../src/release-proof.ts';
import {fixture} from './lib/release-fixture.mjs';
import {locatorFixture} from './lib/locator-fixture.mjs';
import {SessionTransportPolicy} from '../../transport/src/policy.ts';
import {UpdateHttpReader} from '../src/release-update-http.ts';
import {canonical,encode} from './lib/release-fixture.mjs';
import {acceptedRelease} from '../src/release-update-store.ts';
const turn=()=>new Promise(done=>setImmediate(done));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function world(edit=()=>{}){
  const corpus=locatorFixture(),f=corpus.release,target=`https://${corpus.locator.cid}.ipfs.fixture.test/`,endpoints=new Map(),payloads=new Map();
  const metrics={fetches:0,writes:0,opens:0,locks:0,disconnects:0,collects:0},state={coverage:'direct',gesture:true,backup:true,selected:true,pending:false,held:false,owner:true,stored:null,mutate:null,openFails:false,time:0};
  const endpoint=(id,url,bytes)=>{endpoints.set(id,url);payloads.set(url,bytes);return{endpointId:id,url};};
  const locator=endpoint('locator','https://updates.fixture.test/locator',corpus.bytes),locatorEnvelope=endpoint('locator-signature','https://updates.fixture.test/locator-signature',encode(JSON.stringify(corpus.envelope)));
  const manifest=endpoint('manifest',target+'release.json',f.bytes),signature=endpoint('signature',target+'release-signature.json',encode(JSON.stringify(f.envelope)));
  const assets=f.assets.map((a,i)=>endpoint('asset-'+i,target+a.path,a.bytes));
  const registry={inspect:()=>({channel:'update',coverage:state.coverage,adapterId:'fixture',expiresAt:1000000}),subscribeInvalidation:()=>()=>{},capture(request,owner){const url=endpoints.get(request.endpointId);if(!url)return null;return{owner,current:who=>who===owner&&state.owner,snapshot:()=>({version:1,request,endpoint:{id:request.endpointId,channel:'update',url,adapterId:'fixture',methods:['read']},evidence:this.inspect(),directConsent:true}),subscribeInvalidation:()=>()=>{},dispose(){}};}};
  const broker=new SessionTransportPolicy({trustedRegistry:registry,now:()=>state.time});
  const store={async read(){return state.stored;},async advance(expected,next,_signal,current){current();if(JSON.stringify(expected)!==JSON.stringify(state.stored))return'conflict';metrics.writes++;state.stored=next;return'written';},close(){}};
  const options={trust:{keyId:f.keyId,key:f.key,channel:'fixture-beta',storageSchema:1,gateway:'https://ipfs.fixture.test/',current:{sequence:1,manifestSha256:'0'.repeat(64)}},source:{locator,locatorEnvelope,resolve(_cid,kind,path){return kind==='manifest'?manifest:kind==='manifest-envelope'?signature:assets[f.assets.findIndex(a=>a.path===path)];},destination:()=>target},transport:broker,
    fetch:async(url,init)=>{metrics.fetches++;assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');const bytes=state.mutate?.(url,payloads.get(url))??payloads.get(url);return{ok:true,redirected:false,url,headers:new Headers({'content-length':String(bytes.length)}),body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};},
    acceptedStore:store,owner:{current:()=>state.owner,subscribeInvalidation:()=>()=>{},isUserGesture:()=>state.gesture},backup:{capture:()=>state.selected?{current:()=>state.selected,requireVerifiedBackup:async()=>{if(!state.backup)throw Error('PRIVATE');},lock:async()=>{metrics.locks++;},dispose(){}}:null},
    walletQuiescence:{acquire:()=>state.pending||state.held?null:(state.held=true,{current:()=>state.held,disconnect:async()=>{metrics.disconnects++;},release:()=>{state.held=false;}})},navigation:{openVerifiedDestination(url){assert.equal(url,target);metrics.opens++;if(state.openFails)throw Error('PRIVATE');}},monotonicNow:()=>state.time,nowSeconds:()=>1500};
  edit({state,options,corpus,payloads,metrics,broker});const controller=createAssetUpdateController(options);
  return{state,options,corpus,payloads,metrics,broker,controller,async close(){await controller.dispose();broker.dispose();}};
}

test('unset update trust refuses before inspecting source or opening storage/network',async()=>{
  let calls=0;const options={trust:null};for(const field of ['source','transport','fetch','acceptedStore','owner','backup','walletQuiescence','navigation'])Object.defineProperty(options,field,{get(){calls++;throw Error('PRIVATE');}});
  const controller=createAssetUpdateController(options);assert.deepEqual(await controller.checkForUpdate(),{kind:'untrusted',reason:'UNCONFIGURED'});assert.equal(calls,0);assert.equal((await controller.acceptUpdate({})).ok,false);await controller.dispose();
});

test('strict reused untrusted indexes never acquire live release authority',()=>{
  const f=fixture(),m=readUntrustedReleaseManifest(f.bytes);assert.equal(m.ok,true);assert.equal(revalidateRelease(m.value).ok,false);
  const l=locatorFixture(),parsed=readUntrustedReleaseLocator(l.bytes);assert.equal(parsed.ok,true);assert.equal(revalidateRelease(parsed.value).ok,false);
  assert.equal(readUntrustedReleaseManifest(new Uint8Array(1048577)).ok,false);assert.equal(readUntrustedReleaseLocator(new Uint8Array(4097)).ok,false);
});

test('actual G05 and complete manifest+same-key locator produce only an opaque reviewed candidate',async()=>{
  const s=world();try{const checked=await s.controller.checkForUpdate();assert.equal(checked.kind,'candidate',JSON.stringify(checked));assert.equal(s.metrics.writes,0);assert.equal(s.metrics.opens,0);assert.equal(checked.review.releaseEnabled,false);
    assert.equal((await s.controller.acceptUpdate(structuredClone(checked.candidate))).ok,false);const accepted=await s.controller.acceptUpdate(checked.candidate);assert.equal(accepted.ok,true,JSON.stringify(accepted));assert.equal(s.metrics.writes,1);assert.equal(s.metrics.locks,1);assert.equal(s.metrics.disconnects,1);assert.equal(s.metrics.opens,1);assert.equal(s.state.stored.sequence,2);
  }finally{await s.close();}
});

test('strict direct route and missing grant never call fetch; source errors stay fixed',async()=>{
  const s=world();s.broker.setMode('strict');try{const result=await s.controller.checkForUpdate();assert.equal(result.kind,'unreachable');assert.equal(result.reason,'POLICY_BLOCKED');assert.equal(s.metrics.fetches,0);}finally{await s.close();}
  const t=world(({options})=>{options.source.destination=()=>{throw Error('PRIVATE source');};});try{assert.doesNotMatch(JSON.stringify(await t.controller.checkForUpdate()),/PRIVATE/);}finally{await t.close();}
  const empty=new SessionTransportPolicy(),u=world(({options})=>{options.transport=empty;});try{assert.equal((await u.controller.checkForUpdate()).reason,'INVALID_ENDPOINT');assert.equal(u.metrics.fetches,0);}finally{await u.close();empty.dispose();}
});

test('altered asset, signature, locator binding and retained rollback conflict cannot publish candidate',async()=>{
  for(const mode of ['asset','signature','locator','rollback']){
    const s=world(({state,options,payloads,corpus})=>{
      if(mode==='rollback')state.stored={v:1,channel:'fixture-beta',keyId:corpus.release.keyId,sequence:2,manifestSha256:'f'.repeat(64)};
      else state.mutate=(url,bytes)=>{if(url.endsWith(mode==='asset'?'index.html':mode==='signature'?'release-signature.json':'/locator')){const copy=new Uint8Array(bytes);copy[copy.length-2]^=1;return copy;}return bytes;};
    });try{const result=await s.controller.checkForUpdate();assert.notEqual(result.kind,'candidate',mode);assert.equal(s.metrics.writes,0);assert.equal(s.metrics.opens,0);}finally{await s.close();}
  }
});

test('acceptance refuses missing/stale backup, physical wallet work and absent actual gesture without storage/navigation',async()=>{
  for(const field of ['backup','selected','pending','gesture']){
    const s=world();try{const checked=await s.controller.checkForUpdate();assert.equal(checked.kind,'candidate');s.state[field]=field==='pending';const result=await s.controller.acceptUpdate(checked.candidate);assert.equal(result.ok,false,field);assert.equal(s.metrics.writes,0);assert.equal(s.metrics.opens,0);}finally{await s.close();}
  }
});

test('durably accepted floor is retained if navigation fails; no hidden retry or rollback occurs',async()=>{
  const s=world();try{const checked=await s.controller.checkForUpdate();s.state.openFails=true;const result=await s.controller.acceptUpdate(checked.candidate);assert.equal(result.ok,false);assert.equal(s.state.stored.sequence,2);assert.equal(s.metrics.opens,1);await turn();assert.equal(s.metrics.opens,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);}finally{await s.close();}
});

test('cancelled ignored native fetch retains shared admission until actual drain and discards late candidate',async()=>{
  const held=deferred();let started=false;const s=world(({options})=>{options.fetch=async()=>{started=true;return held.promise;};}),other=world();
  const pending=s.controller.checkForUpdate();await turn();assert.equal(started,true);s.controller.cancel();assert.equal((await pending).reason,'CANCELLED');assert.equal((await other.controller.checkForUpdate()).reason,'BUSY');
  held.resolve({ok:false,redirected:false,url:'https://updates.fixture.test/locator',headers:new Headers(),body:null});await s.close();
  assert.equal((await other.controller.checkForUpdate()).kind,'candidate');await other.close();
});

test('aggregate deadline and owner callback reentry fail without new I/O or stale publication',async()=>{
  let nested;const s=world(({options,state})=>{const original=options.owner.current;let once=true;options.owner.current=()=>{if(once){once=false;nested=s.controller.checkForUpdate();state.time=120000;}return original();};});
  try{const result=await s.controller.checkForUpdate();assert.equal(result.reason,'TIMEOUT');assert.equal((await nested).reason,'BUSY');assert.equal(s.metrics.fetches,0);}finally{await s.close();}
});

test('streamed exact cap succeeds; forged length, redirect, fragments and +1 fail through actual scopes',async()=>{
  for(const mode of ['exact','declared','redirect','overflow','fragments']){
    const s=world(),ref=s.options.source.locator,reader=new UpdateHttpReader(s.broker,async(url)=>({ok:true,redirected:mode==='redirect',url,headers:new Headers(mode==='declared'?{'content-length':'9'}:{}),body:new ReadableStream({start(c){if(mode==='fragments')for(let i=0;i<16385;i++)c.enqueue(new Uint8Array());else c.enqueue(new Uint8Array(mode==='overflow'?9:8));c.close();}})}));
    try{const work=reader.read(ref,8,new AbortController().signal,()=>{});if(mode==='exact')assert.equal((await work).length,8);else await assert.rejects(work);await reader.drain();}finally{await s.close();}
  }
});

test('hostile storage rejections are classified without consulting exception properties or prototypes',async()=>{
  let touches=0;const hostile=new Proxy({}, {getPrototypeOf(){touches++;throw Error('PRIVATE');},get(){touches++;throw Error('PRIVATE');}});
  const s=world(({options})=>{options.acceptedStore.read=async()=>{throw hostile;};});try{const result=await s.controller.checkForUpdate();assert.equal(result.reason,'UNAVAILABLE');assert.equal(touches,0);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);}finally{await s.close();}
});

test('present malformed or foreign accepted state is never treated as a fresh missing floor',()=>{
  const keyId='1'.repeat(64),valid={v:1,channel:'fixture',keyId,sequence:2,manifestSha256:'2'.repeat(64)};assert.equal(acceptedRelease(null,'fixture',keyId),null);assert.deepEqual(acceptedRelease(valid,'fixture',keyId),valid);
  for(const patch of [{v:2},{channel:'other'},{keyId:'0'.repeat(64)},{sequence:0},{sequence:1.5},{manifestSha256:'PRIVATE'},{extra:true}])assert.throws(()=>acceptedRelease({...valid,...patch},'fixture',keyId));
  let gets=0;const hostile={...valid};Object.defineProperty(hostile,'sequence',{enumerable:true,get(){gets++;return 2;}});assert.throws(()=>acceptedRelease(hostile,'fixture',keyId));assert.equal(gets,0);
});

test('malformed compiled key operations refuse without invoking array accessors',async()=>{
  const f=fixture();let gets=0;const operations=[];Object.defineProperty(operations,'0',{enumerable:true,get(){gets++;return'verify';}});
  const controller=createAssetUpdateController({trust:{keyId:f.keyId,key:{...f.key,key_ops:operations},channel:'fixture-beta',storageSchema:1,gateway:'https://ipfs.fixture.test/',current:{sequence:1,manifestSha256:'0'.repeat(64)}}});
  assert.equal((await controller.checkForUpdate()).kind,'untrusted');assert.equal(gets,0);await controller.dispose();
});

test('route generation changes cannot carry an old candidate or held acceptance into direct browser navigation',async()=>{
  for(const when of ['before','during']){
    const held=deferred(),s=world(({options})=>{if(when==='during')options.backup.capture=()=>({current:()=>true,requireVerifiedBackup:()=>held.promise,lock:async()=>{},dispose(){}});});
    try{const checked=await s.controller.checkForUpdate();assert.equal(checked.kind,'candidate');
      let pending;if(when==='during'){pending=s.controller.acceptUpdate(checked.candidate);await turn();}
      s.broker.setMode('strict');if(when==='before')pending=s.controller.acceptUpdate(checked.candidate);else held.resolve();
      const result=await pending;assert.equal(result.ok,false,when);assert.equal(s.metrics.opens,0);assert.equal(s.metrics.writes,0);
    }finally{held.resolve();await s.close();}
  }
});

test('final clock callback cannot navigate after route, owner or cancellation retirement; durable floor is retained',async()=>{
  for(const retirement of ['route','owner','cancel']){
    let armed=false,clocks=0;const s=world(({options,state,broker})=>{
      const capture=options.backup.capture;options.backup.capture=()=>{const lease=capture(),lock=lease.lock;lease.lock=async(...args)=>{await lock(...args);armed=true;};return lease;};
      options.monotonicNow=()=>{if(armed&&++clocks===2){if(retirement==='route')broker.setMode('strict');else if(retirement==='owner')state.owner=false;else s.controller.cancel();}return 0;};
    });
    try{const checked=await s.controller.checkForUpdate();assert.equal(checked.kind,'candidate');const result=await s.controller.acceptUpdate(checked.candidate);
      assert.equal(result.ok,false,retirement);assert.equal(result.error.code,'CANCELLED');assert.equal(s.metrics.opens,0,retirement);assert.equal(s.metrics.writes,1);assert.equal(s.state.stored.sequence,2);assert.equal(s.metrics.locks,1);assert.equal(s.metrics.disconnects,1);
    }finally{await s.close();}
  }
});

test('HTTP reader reserves one physical admission before endpoint, guard, authorize and capture callbacks',async()=>{
  for(const stage of ['endpoint','guard','authorize','capture']){
    const s=world();let calls=0,once=true,nested;const reader=new UpdateHttpReader(s.broker,async url=>{calls++;return{ok:true,redirected:false,url,headers:new Headers({'content-length':'1'}),body:new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.close();}})};});
    const reenter=()=>{if(once){once=false;nested=reader.read(s.options.source.locator,1,new AbortController().signal,()=>{}).then(()=> 'UNEXPECTED',error=>error.code);}};
    let ref=s.options.source.locator,guard=()=>{};
    if(stage==='endpoint')ref={endpointId:ref.endpointId,get url(){reenter();return s.options.source.locator.url;}};
    if(stage==='guard')guard=reenter;
    if(stage==='authorize'){const real=s.broker.authorize.bind(s.broker);s.broker.authorize=(...args)=>{reenter();return real(...args);};}
    if(stage==='capture'){const real=s.broker.capture.bind(s.broker);s.broker.capture=(...args)=>{reenter();return real(...args);};}
    try{assert.equal((await reader.read(ref,1,new AbortController().signal,guard)).length,1);assert.equal(await nested,'LIMIT_EXCEEDED',stage);await reader.drain();assert.equal(calls,1,stage);}finally{await s.close();}
  }
});

test('HTTP reader releases preflight failures and retains ignored fetch ownership through physical drain',async()=>{
  const s=world(),held=deferred();let calls=0;
  const response=url=>({ok:true,redirected:false,url,headers:new Headers({'content-length':'1'}),body:new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.close();}})});
  const reader=new UpdateHttpReader(s.broker,async url=>{calls++;return calls===1?held.promise:response(url);});
  try{
    for(const [ref,guard]of [[{endpointId:'bad',url:'http://bad.test/'},()=>{}],[s.options.source.locator,()=>{throw Error('controlled guard');}]]){await assert.rejects(reader.read(ref,1,new AbortController().signal,guard));await reader.drain();}
    const abort=new AbortController(),pending=reader.read(s.options.source.locator,1,abort.signal,()=>{});await turn();abort.abort();await assert.rejects(pending);let drained=false;void reader.drain().then(()=>drained=true);await turn();assert.equal(drained,false);
    await assert.rejects(reader.read(s.options.source.locator,1,new AbortController().signal,()=>{}),error=>error.code==='LIMIT_EXCEEDED');assert.equal(calls,1);
    held.resolve(response(s.options.source.locator.url));await reader.drain();assert.equal((await reader.read(s.options.source.locator,1,new AbortController().signal,()=>{})).length,1);assert.equal(calls,2);
  }finally{held.resolve(response(s.options.source.locator.url));await reader.drain();await s.close();}
});
