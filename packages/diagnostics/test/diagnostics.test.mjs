import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRelease } from '../../security/index.ts';
import { fixture } from '../../security/test/lib/release-fixture.mjs';
import * as api from '../index.ts';
const input = { module:'runtime', errorCode:'TIMEOUT', operation:'unlock', routeState:'unsupported', chainNamespace:'none' };
async function setup(options={}) {
  let time=1_000_000, raw=null;
  const f=fixture(m=>{m.createdAt=0;m.expiresAt=2_592_000;});
  const proof=await verifyRelease(f.bytes,f.envelope,[f.key],0,{...f.options,nowSeconds:()=>time});assert.equal(proof.ok,true);
  const storage={read:()=>raw,write:value=>{raw=value;},clear:()=>{raw=null;}};
  const service=api.createDiagnostics({storage,release:proof.value,storageSchema:1,nowSeconds:()=>time,...options});
  return {service,proof,f,storage,setTime:value=>{time=value;},get raw(){return raw;},setRaw:value=>{raw=value;}};
}
test('collection is unavailable without a live branded release; clear needs neither a proof nor vault',async()=>{
  assert.equal(typeof api.createDiagnostics,'function');
  for(const release of [undefined,{}, {manifest:{releaseId:'SECRET',minStorageSchema:1,maxStorageSchema:1}}]){
    let cleared=false,read=false;
    const service=api.createDiagnostics({release,storageSchema:1,storage:{read:()=>{read=true;return 'SECRET';},write:()=>assert.fail(),clear:()=>{cleared=true;}}});
    assert.equal(service.record(input).error.code,'RELEASE_UNAVAILABLE');
    assert.deepEqual(service.collectDiagnostics().value.events,[]);assert.equal(read,false);
    assert.equal(service.clearDiagnostics().ok,true);assert.equal(cleared,true);
  }
});
test('only exact fixed event fields are recorded; fields derive from proof and time is UTC-hour coarse',async()=>{
  const s=await setup();assert.equal(s.service.record(input).ok,true);
  const collected=s.service.collectDiagnostics();assert.equal(collected.ok,true);
  assert.deepEqual(collected.value.events,[{v:1,timeBucket:'1970-01-12T13:00:00.000Z',releaseId:s.f.manifest.releaseId,...input,storageSchema:1}]);
  assert.deepEqual(Object.keys(JSON.parse(s.raw).events[0]).sort(),['chainNamespace','errorCode','module','operation','releaseId','routeState','storageSchema','timeBucket','v'].sort());
  let getter=false;
  const hostile={...input,get message(){getter=true;throw new Error('SECRET');}};
  for(const bad of [hostile,{...input,errorCode:'SECRET'}, {...input,operation:'https://SECRET.invalid/?key=SECRET'}, {...input,profileId:'SECRET'},Object.create(input)])assert.equal(s.service.record(bad).ok,false);
  assert.equal(getter,false);assert.equal(s.raw.includes('SECRET'),false);
});
test('ring limits count and retention, rejects future time, and does not extend ages after clock rollback',async()=>{
  const s=await setup();for(let i=0;i<501;i++)assert.equal(s.service.record(input).ok,true);
  assert.equal(s.service.collectDiagnostics().value.events.length,500);assert.ok(new TextEncoder().encode(s.raw).length<=api.DIAGNOSTIC_LIMITS.bytes);
  s.setTime(1_000_000+7*86400);assert.equal(s.service.collectDiagnostics().value.events.length,0);
  s.setTime(1_000_000);assert.equal(s.service.collectDiagnostics().value.events.length,0);
});
test('corrupt, oversized or extra-field stored data is discarded; valid rows survive invalid neighbors',async()=>{
  const s=await setup();s.service.record(input);const good=JSON.parse(s.raw).events[0];
  for(const raw of ['not json','x'.repeat(api.DIAGNOSTIC_LIMITS.bytes+1),JSON.stringify({v:1,events:[{...good,message:'SECRET'},{...good,timeBucket:'2099-01-01T00:00:00.000Z'}]})]){
    s.setRaw(raw);assert.deepEqual(s.service.collectDiagnostics().value.events,[]);
  }
  s.setRaw(JSON.stringify({v:1,events:[good,{...good,releaseId:'SECRET'}]}));assert.equal(s.service.collectDiagnostics().value.events.length,1);
  assert.equal(s.service.collectDiagnostics().value.warnings.includes('DISCARDED_INVALID'),false,'invalid rows have already been discarded durably');
});
test('selection and exact final bytes are snapshot-bound; clear/revocation/stale collection blocks export',async()=>{
  const s=await setup();s.service.record(input);s.service.record({...input,errorCode:'LOCKED'});
  const snapshot=s.service.collectDiagnostics().value;
  const preview=s.service.previewExport(snapshot,[1]);assert.equal(preview.ok,true);
  const selected=JSON.parse(new TextDecoder().decode(preview.value.bytes));assert.deepEqual(selected,[snapshot.events[1]]);
  assert.equal(preview.value.rows.length,9);assert.equal(s.service.confirmExport(preview.value).ok,true);
  assert.equal(s.service.previewExport({...snapshot},[0]).error.code,'REDACTION_FAILED');
  for(const indexes of [[],[0,0],[-1],[2],['0']])assert.equal(s.service.previewExport(snapshot,indexes).ok,false);
  s.service.record(input);assert.equal(s.service.confirmExport(preview.value).ok,false);
  const fresh=s.service.collectDiagnostics().value, next=s.service.previewExport(fresh,[0]).value;
  s.service.clearDiagnostics();assert.equal(s.service.confirmExport(next).ok,false);
});
test('proof revocation, expiry, unsupported schema and storage faults are fixed refusals without payloads',async()=>{
  let current=true;const f=fixture();const proof=await verifyRelease(f.bytes,f.envelope,[f.key],0,{...f.options,isCurrent:()=>current});assert.equal(proof.ok,true);
  const s=await setup({release:proof.value,nowSeconds:()=>1500});assert.equal(s.service.record(input).ok,true);const snap=s.service.collectDiagnostics().value;
  current=false;assert.equal(s.service.previewExport(snap,[0]).error.code,'RELEASE_UNAVAILABLE');assert.equal(s.service.record(input).error.code,'RELEASE_UNAVAILABLE');
  const wrong=await setup({storageSchema:2});assert.equal(wrong.service.record(input).error.code,'RELEASE_UNAVAILABLE');
  const broken=await setup({storage:{read:()=>{throw new Error('SECRET');},write:()=>{},clear:()=>{throw new Error('SECRET');}}});
  assert.equal(broken.service.collectDiagnostics().error.code,'STORAGE_UNAVAILABLE');assert.equal(broken.service.clearDiagnostics().error.code,'STORAGE_UNAVAILABLE');
});
test('preview mutation and foreign selections cannot change the bytes authorized for download',async()=>{
  const s=await setup();s.service.record(input);const snap=s.service.collectDiagnostics().value,preview=s.service.previewExport(snap,[0]).value;
  preview.bytes[0]^=1;assert.equal(s.service.confirmExport(preview).error.code,'REDACTION_FAILED');
  assert.equal(s.service.confirmExport({...preview}).error.code,'REDACTION_FAILED');
  const other=await setup();assert.equal(other.service.previewExport(snap,[0]).error.code,'REDACTION_FAILED');
  assert.equal(other.service.confirmExport(preview).error.code,'REDACTION_FAILED');
});
test('known secret strings in every candidate field are refused and getters and foreign errors stay opaque',async()=>{
  const s=await setup();const secret='SECRET seed wallet bank key https://user:token@private.invalid/?seed=SECRET';
  for(const field of Object.keys(input))assert.equal(s.service.record({...input,[field]:secret}).error.code,'REDACTION_FAILED');
  let reads=0;const accessor={...input};Object.defineProperty(accessor,'module',{get(){reads++;return 'runtime';},enumerable:true});
  assert.equal(s.service.record(accessor).error.code,'REDACTION_FAILED');assert.equal(reads,0);assert.equal(s.raw,null);
  const proxy=Proxy.revocable({},{});proxy.revoke();
  const broken=await setup({storage:{read(){throw proxy.proxy;},write(){throw proxy.proxy;},clear(){throw proxy.proxy;}}});
  assert.deepEqual(broken.service.collectDiagnostics(),{ok:false,error:{code:'STORAGE_UNAVAILABLE'}});
  assert.deepEqual(broken.service.clearDiagnostics(),{ok:false,error:{code:'STORAGE_UNAVAILABLE'}});
});
test('clear remains available with a broken clock; configured collection rejects invalid time and context expiry',async()=>{
  const s=await setup({nowSeconds:()=>{throw new Error('SECRET');}});assert.equal(s.service.record(input).error.code,'REDACTION_FAILED');assert.equal(s.service.clearDiagnostics().ok,true);
  const expired=await setup();expired.service.record(input);const snap=expired.service.collectDiagnostics().value;expired.setTime(2_592_000);
  assert.equal(expired.service.previewExport(snap,[0]).error.code,'RELEASE_UNAVAILABLE');assert.equal(expired.service.record(input).error.code,'RELEASE_UNAVAILABLE');
});
test('public enum arrays cannot be enlarged to admit private/free-text diagnostic fields',async()=>{
  const s=await setup();
  for(const [field,choices] of Object.entries({module:api.DIAGNOSTIC_MODULES,operation:api.DIAGNOSTIC_OPERATIONS,errorCode:api.DIAGNOSTIC_ERRORS,routeState:api.DIAGNOSTIC_ROUTES,chainNamespace:api.DIAGNOSTIC_CHAINS})){
    assert.equal(Object.isFrozen(choices),true);assert.throws(()=>choices.push('SECRET'));assert.throws(()=>choices[0]='SECRET');
    assert.equal(s.service.record({...input,[field]:'SECRET'}).ok,false);
  }
  assert.equal(s.raw,null);
});
