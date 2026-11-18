import test from 'node:test';
import assert from 'node:assert/strict';
import { CompatibilityError } from '../src/compatibility/model.ts';
import { probeStartupCapabilities } from '../src/compatibility/probe.ts';

const required=['secure-context','webcrypto','bounded-worker','indexeddb','file-import','file-export'];
const optional=['camera','share','clipboard'];
const ports=()=>Object.fromEntries([...required,...optional].map(key=>[key,()=>true]));

test('pure local startup snapshot distinguishes API eligibility from measured wallet/device support',()=>{
  const snapshot=probeStartupCapabilities(ports());
  assert.equal(snapshot.mode,'runtime-candidate');assert.equal(snapshot.evidence,'local-api-presence');
  assert.equal(snapshot.compatibilityStatus,'untested');assert.equal(snapshot.certified,false);assert.equal(snapshot.economicActionsAllowed,false);
  for(const key of required)assert.equal(snapshot.required[key],'present');
  for(const key of optional)assert.equal(snapshot.optional[key],'present');
  assert.equal(snapshot.storageAccess,'unverified');
  for(const warning of ['storage-access-not-tested','storage-may-be-evicted','private-browsing-may-limit-storage','worker-execution-not-tested','file-import-export-not-tested','optional-permissions-not-requested'])assert.ok(snapshot.limitations.includes(warning));
  assert.ok(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.required)&&Object.isFrozen(snapshot.optional)&&Object.isFrozen(snapshot.limitations));
});

test('each missing required API forces read-only while optional denials retain manual/file possibilities',()=>{
  for(const key of required){const snapshot=probeStartupCapabilities({...ports(),[key]:()=>false});assert.equal(snapshot.mode,'read-only',key);assert.equal(snapshot.required[key],'missing');}
  for(const key of optional){const snapshot=probeStartupCapabilities({...ports(),[key]:()=>false});assert.equal(snapshot.mode,'runtime-candidate',key);assert.equal(snapshot.optional[key],'missing');}
});

test('blocked IndexedDB/private-browsing observations remain explicit without detecting or fingerprinting private mode',()=>{
  const blocked=probeStartupCapabilities(ports(),'unavailable');assert.equal(blocked.required.indexeddb,'unavailable');assert.equal(blocked.mode,'read-only');
  assert.equal(blocked.storageAccess,'unavailable');assert.ok(blocked.limitations.includes('storage-may-be-evicted'));
  const available=probeStartupCapabilities(ports(),'available');assert.equal(available.mode,'runtime-candidate');
  assert.equal(available.limitations.includes('storage-access-not-tested'),false);
  assert.equal(available.limitations.includes('private-browsing-may-limit-storage'),true,'one successful access is not durable-storage qualification');
});

test('a throwing or nonboolean local probe fails only that observation without copying hostile errors',()=>{
  const thrown=new Proxy({}, {get(){throw Error('PRIVATE');}});
  const unavailable=probeStartupCapabilities({...ports(),camera:()=>{throw thrown;}});assert.equal(unavailable.optional.camera,'unavailable');assert.equal(unavailable.mode,'runtime-candidate');
  const invalid=probeStartupCapabilities({...ports(),webcrypto:()=>({supported:true})});assert.equal(invalid.required.webcrypto,'unavailable');assert.equal(invalid.mode,'read-only');
  assert.equal(JSON.stringify(invalid).includes('PRIVATE'),false);
});

test('malformed injected ports/accessors are rejected before any observation executes',()=>{
  let called=0;const p=ports();p.camera=()=>{called++;return true;};Object.defineProperty(p,'share',{enumerable:true,get(){called++;return ()=>true;}});
  assert.throws(()=>probeStartupCapabilities(p),e=>e instanceof CompatibilityError&&e.code==='INVALID_INPUT');assert.equal(called,0);
  for(const input of [{}, {...ports(),unknown:()=>true},Object.create(ports())])assert.throws(()=>probeStartupCapabilities(input),CompatibilityError);
  assert.throws(()=>probeStartupCapabilities(ports(),'private'),CompatibilityError);
});

test('default browser probes inspect API presence without constructing workers, opening storage, permissions or files',()=>{
  const names=['isSecureContext','crypto','Worker','indexedDB','File','Blob','URL','HTMLAnchorElement','navigator'];
  const descriptors=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));let calls=0;
  const forbidden=()=>{calls++;throw Error('No action is authorized by a capability probe');};
  function Worker() {forbidden();}Worker.prototype.postMessage=forbidden;Worker.prototype.terminate=forbidden;
  function File(){forbidden();}function Blob(){forbidden();}Blob.prototype.arrayBuffer=forbidden;
  function URL(){forbidden();}URL.createObjectURL=forbidden;URL.revokeObjectURL=forbidden;
  function Anchor(){forbidden();}Object.defineProperty(Anchor.prototype,'download',{value:''});
  const values={isSecureContext:true,crypto:{subtle:{digest:forbidden,importKey:forbidden,deriveKey:forbidden,encrypt:forbidden,decrypt:forbidden},getRandomValues:forbidden},Worker,indexedDB:{open:forbidden},File,Blob,URL,HTMLAnchorElement:Anchor,navigator:{mediaDevices:{getUserMedia:forbidden},share:forbidden,clipboard:{writeText:forbidden},permissions:{query:forbidden}}};
  try{
    for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,value:values[name]});
    const snapshot=probeStartupCapabilities();assert.equal(snapshot.mode,'runtime-candidate');assert.equal(calls,0);
    assert.equal(snapshot.storageAccess,'unverified');assert.equal(snapshot.compatibilityStatus,'untested');
  }finally{for(const name of names){const descriptor=descriptors.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
