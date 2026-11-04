import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runtimeFailure } from '../../../packages/schemas/index.ts';
import { probeStartupCapabilities } from '../src/compatibility/probe.ts';
import { startWithRequiredApis } from '../src/compatibility/startup.ts';
import { StartupCompatibilityNotice } from '../src/ui/StartupCompatibilityNotice.tsx';

const required=['secure-context','webcrypto','bounded-worker','indexeddb','file-import','file-export'];
const optional=['camera','share','clipboard'];
const ports=()=>Object.fromEntries([...required,...optional].map(key=>[key,()=>true]));

test('missing or unavailable required API never invokes local runtime initialization',async()=>{
  for(const key of required){
    for(const read of [()=>false,()=>{throw Error('private platform detail');}]){
      let calls=0;
      const result=await startWithRequiredApis(probeStartupCapabilities({...ports(),[key]:read}),async()=>{calls++;return {ok:true,value:'unexpected'};});
      assert.equal(result.ok,false);assert.equal(result.error.code,'UNSUPPORTED_ENVIRONMENT');assert.equal(calls,0);
      assert.equal(JSON.stringify(result).includes('private platform detail'),false);
    }
  }
});

test('optional API absence does not block or replace actual runtime success and failure',async()=>{
  const snapshot=probeStartupCapabilities({...ports(),camera:()=>false,share:()=>false,clipboard:()=>false});
  let calls=0;const success={ok:true,value:{state:'locked'}};
  assert.equal(await startWithRequiredApis(snapshot,async()=>{calls++;return success;}),success);assert.equal(calls,1);
  const failure=runtimeFailure('STORAGE_UNAVAILABLE');
  assert.equal(await startWithRequiredApis(snapshot,async()=>failure),failure,'actual runtime refusal remains authoritative');
  assert.equal(snapshot.storageAccess,'unverified','API presence and initialization do not measure storage durability');
});

test('normal and optional-only startup renders no distracting compatibility table or support claim',()=>{
  const snapshot=probeStartupCapabilities({...ports(),camera:()=>false});
  assert.equal(renderToStaticMarkup(createElement(StartupCompatibilityNotice,{snapshot,runtimeUnavailable:false})), '');
});

test('read-only notice names the missing feature and offers recovery without certification or permission controls',()=>{
  const snapshot=probeStartupCapabilities({...ports(),'file-export':()=>false});
  const html=renderToStaticMarkup(createElement(StartupCompatibilityNotice,{snapshot,runtimeUnavailable:true}));
  assert.match(html,/Read-only browser mode/);assert.match(html,/encrypted file download/);assert.match(html,/Read recovery guidance/);
  assert.match(html,/does not verify wallet or device support/);assert.match(html,/storage can still be blocked or lost/);
  assert.equal(html.includes('<table'),false);assert.equal(html.includes('<button'),false);assert.equal(html.includes('private platform detail'),false);
});

test('actual startup failure remains distinct from missing APIs and keeps recovery guidance visible',()=>{
  const html=renderToStaticMarkup(createElement(StartupCompatibilityNotice,{snapshot:probeStartupCapabilities(ports()),runtimeUnavailable:true}));
  assert.match(html,/Recovery remains available/);assert.match(html,/local services could not start/);assert.equal(html.includes('Missing or unavailable'),false);
});
