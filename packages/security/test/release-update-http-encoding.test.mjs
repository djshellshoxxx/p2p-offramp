import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createAssetUpdateController} from '../src/release-update.ts';
import {locatorFixture} from './lib/locator-fixture.mjs';
import {encode} from './lib/release-fixture.mjs';
import {SessionTransportPolicy} from '../../transport/src/policy.ts';
import {UpdateHttpReader,updateReadCode} from '../src/release-update-http.ts';

// Fetch exposes decoded bytes while Content-Length keeps the encoded size. Under CORS the
// Content-Encoding header is hidden but Content-Length is visible. These fakes model both.
const gzipStyle=(bytes,options={})=>({
  headers:new Headers({'content-encoding':'gzip','content-length':String(gzipSync(bytes).length)}),...options,
});
const corsHidden=bytes=>({type:'cors',headers:new Headers({'content-length':String(gzipSync(bytes).length)})});
function stream(bytes){
  return new ReadableStream({start(c){c.enqueue(bytes.slice(0,1));c.enqueue(bytes.slice(1));c.close();}});
}
function world(respond){
  const corpus=locatorFixture(),f=corpus.release,target=`https://${corpus.locator.cid}.ipfs.fixture.test/`;
  const endpoints=new Map(),payloads=new Map(),state={owner:true,stored:null,mutate:null,held:false,fetches:0};
  const endpoint=(id,url,bytes)=>{endpoints.set(id,url);payloads.set(url,bytes);return{endpointId:id,url};};
  const locator=endpoint('locator','https://updates.fixture.test/locator',corpus.bytes);
  const locatorEnvelope=endpoint('locator-signature','https://updates.fixture.test/locator-signature',
    encode(JSON.stringify(corpus.envelope)));
  const manifest=endpoint('manifest',target+'release.json',f.bytes);
  const signature=endpoint('signature',target+'release-signature.json',encode(JSON.stringify(f.envelope)));
  const assets=f.assets.map((a,i)=>endpoint('asset-'+i,target+a.path,a.bytes));
  const registry={
    inspect:()=>({channel:'update',coverage:'direct',adapterId:'fixture',expiresAt:1000000}),
    subscribeInvalidation:()=>()=>{},
    capture(request,owner){
      const url=endpoints.get(request.endpointId);
      if(!url)return null;
      const snapshot=()=>({version:1,request,endpoint:{id:request.endpointId,channel:'update',url,adapterId:'fixture',
        methods:['read']},evidence:this.inspect(),directConsent:true});
      return{owner,current:who=>who===owner&&state.owner,snapshot,subscribeInvalidation:()=>()=>{},dispose(){}};
    },
  };
  const broker=new SessionTransportPolicy({trustedRegistry:registry,now:()=>0});
  const fetch=async url=>{
    state.fetches++;
    const original=payloads.get(url);
    const bytes=state.mutate?.(url,original)??original;
    // Integrity headers describe the original encoded body; only signed digests may judge the decoded bytes.
    return{ok:true,redirected:false,url,...respond(original),body:stream(bytes)};
  };
  const store={
    async read(){return state.stored;},
    async advance(expected,next,_signal,current){current();state.stored=next;return'written';},
    close(){},
  };
  const resolve=(_cid,kind,path)=>kind==='manifest'?manifest:kind==='manifest-envelope'?signature
    :assets[f.assets.findIndex(a=>a.path===path)];
  const trust={keyId:f.keyId,key:f.key,channel:'fixture-beta',storageSchema:1,gateway:'https://ipfs.fixture.test/',
    current:{sequence:1,manifestSha256:'0'.repeat(64)}};
  const controller=createAssetUpdateController({
    trust,source:{locator,locatorEnvelope,resolve,destination:()=>target},transport:broker,fetch,acceptedStore:store,
    owner:{current:()=>state.owner,subscribeInvalidation:()=>()=>{},isUserGesture:()=>true},
    backup:{capture:()=>({current:()=>true,requireVerifiedBackup:async()=>{},lock:async()=>{},dispose(){}})},
    walletQuiescence:{acquire:()=>state.held?null:(state.held=true,{current:()=>state.held,disconnect:async()=>{},
      release:()=>{state.held=false;}})},
    navigation:{openVerifiedDestination(){}},monotonicNow:()=>0,nowSeconds:()=>1500,
  });
  return{state,corpus,broker,controller,locator,async close(){await controller.dispose();broker.dispose();}};
}
// Every refusal raised inside the transport scope surfaces as a typed ROUTE_UNAVAILABLE (policy.ts maps it),
// so tests also count body reads to show where the reader stopped.
async function readOnce(response,maximum){
  const s=world(()=>({}));
  const reader=new UpdateHttpReader(s.broker,async url=>({ok:true,redirected:false,url,...response}));
  try{return await reader.read(s.locator,maximum,new AbortController().signal,()=>{});}
  catch(error){return updateReadCode(error)??'UNTYPED';}
  finally{await reader.drain();await s.close();}
}
function counted(chunks,tail){
  const body={reads:0,getReader(){
    let index=0;
    return{
      async read(){body.reads++;return index<chunks.length?{done:false,value:chunks[index++]}:tail();},
      async cancel(){},
    };
  }};
  return body;
}
const done=async()=>({done:true,value:undefined});

test('gzip-style and CORS-hidden encodings yield the signed candidate from decoded bytes',async()=>{
  for(const respond of [gzipStyle,corsHidden,bytes=>gzipStyle(bytes,{type:'cors'})]){
    const s=world(respond);
    try{
      const checked=await s.controller.checkForUpdate();
      assert.equal(checked.kind,'candidate',JSON.stringify(checked));
      assert.equal(checked.review.releaseEnabled,false);
    }finally{await s.close();}
  }
});

test('tampered decoded bytes under gzip are refused by signed digests, not transport headers',async()=>{
  for(const suffix of ['index.html','release-signature.json','/locator']){
    const s=world(gzipStyle);
    s.state.mutate=(url,bytes)=>{
      if(!url.endsWith(suffix))return bytes;
      const copy=new Uint8Array(bytes);
      copy[copy.length-2]^=1;
      return copy;
    };
    try{
      const result=await s.controller.checkForUpdate();
      assert.notEqual(result.kind,'candidate',suffix);
      assert.equal(s.state.stored,null);
    }finally{await s.close();}
  }
});

test('encoded length above an exact asset maximum is not a decoded-size refusal',async()=>{
  // Incompressible bytes: gzip framing makes the encoded length exceed the decoded length.
  const bytes=Uint8Array.from([7,1,9,4,2,8,6,3]);
  assert.ok(gzipSync(bytes).length>bytes.length);
  const result=await readOnce({...gzipStyle(bytes),body:stream(bytes)},bytes.length);
  assert.deepEqual(result,bytes);
});

test('decoded cap, fragments and errored streams still fail with typed codes under gzip',async()=>{
  const headers=new Headers({'content-encoding':'gzip','content-length':'4'});
  const over=counted([new Uint8Array(5),new Uint8Array(4)],done);
  assert.equal(await readOnce({headers,body:over},8),'ROUTE_UNAVAILABLE');
  assert.equal(over.reads,2);
  // An unbounded decoded source stops at the first chunk beyond the cap.
  const endless=counted([],async()=>({done:false,value:new Uint8Array(1024)}));
  assert.equal(await readOnce({headers,body:endless},64*1024),'ROUTE_UNAVAILABLE');
  assert.equal(endless.reads,65);
  const fragments=counted([],async()=>({done:false,value:new Uint8Array()}));
  assert.equal(await readOnce({headers,body:fragments},8),'ROUTE_UNAVAILABLE');
  assert.equal(fragments.reads,16384);
  const errored=counted([new Uint8Array([1])],async()=>{throw new TypeError('network error');});
  assert.equal(await readOnce({headers,body:errored},8),'ROUTE_UNAVAILABLE');
  assert.equal(errored.reads,2);
});

test('identity responses keep the Content-Length truncation and early-cap refusals',async()=>{
  for(const response of [
    {headers:new Headers({'content-length':'3'})},
    {type:'basic',headers:new Headers({'content-length':'3'})},
    {type:'cors',headers:new Headers({'content-length':'3','content-encoding':'identity'})},
    // An empty coding list means no coding: the length still describes the body.
    {type:'basic',headers:new Headers({'content-length':'3','content-encoding':''})},
  ]){
    const body=counted([Uint8Array.from([1,2])],done);
    assert.equal(await readOnce({...response,body},8),'ROUTE_UNAVAILABLE',String(response.type));
    // The whole body was read, so the refusal is the post-stream length comparison.
    assert.equal(body.reads,2,String(response.type));
  }
  // Declared identity length above the maximum refuses before any body read.
  const early=counted([Uint8Array.from([1,2])],done);
  const oversized=new Headers({'content-length':'9'});
  assert.equal(await readOnce({type:'basic',headers:oversized,body:early},8),'ROUTE_UNAVAILABLE');
  assert.equal(early.reads,0);
  const malformed=counted([Uint8Array.from([1,2])],done);
  const bad=new Headers({'content-encoding':'gzip','content-length':'+2'});
  assert.equal(await readOnce({headers:bad,body:malformed},8),'ROUTE_UNAVAILABLE');
  assert.equal(malformed.reads,0);
});
