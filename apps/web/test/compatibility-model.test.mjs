import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  CompatibilityError, parseCompatibilityRecord, parseCompatibilityQuery,
  createCompatibilityCatalog, getCompatibility, emptyCompatibilityCatalog,
} from '../src/compatibility/model.ts';

const NOW = 1_800_000_000, COMMIT = 'a'.repeat(40), SOURCE = 'b'.repeat(64);
const capabilities = ['secure-context','webcrypto','bounded-worker','indexeddb','file-import','file-export','evm-injected'];
const target = () => ({browser:'chrome',version:'140.0.1',os:'Android 15',device:'Pixel 8',wallet:'Test Wallet',walletVersion:'3.2.1',connector:'eip1193',chain:'eip155:11155111'});
const record = changes => ({...target(),capabilities:[...capabilities],testedAt:NOW-100,result:'pass',limitations:['Synthetic fixture only; no device qualification.'],...changes});
const query = changes => ({...target(),capabilities:[...capabilities],sourceCommit:COMMIT,sourceSha256:SOURCE,...changes});
const evidence = (changes={},kind='physical-device') => new TextEncoder().encode(JSON.stringify({format:'p2p-offramp/compatibility-evidence/v1',sourceCommit:COMMIT,sourceSha256:SOURCE,kind,record:record(changes)}));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pins = (bytes,status='tested',changes={}) => ({sourceCommit:COMMIT,sourceSha256:SOURCE,expiresAt:NOW+3600,entries:[{evidenceSha256:sha(bytes),status}],...changes});
const refuses = (fn,code='INVALID_INPUT') => assert.throws(fn,e=>e instanceof CompatibilityError && e.code===code && !e.message.includes('PRIVATE'));
const rejects = (fn,code='INVALID_INPUT') => assert.rejects(fn,e=>e instanceof CompatibilityError && e.code===code && !e.message.includes('PRIVATE'));

test('record and query validate exact bounded fields and return detached frozen data', () => {
  const input=record(), parsed=parseCompatibilityRecord(input); input.capabilities.push('camera');input.limitations[0]='changed';
  assert.ok(Object.isFrozen(parsed)&&Object.isFrozen(parsed.capabilities)&&Object.isFrozen(parsed.limitations));
  assert.equal(parsed.capabilities.includes('camera'),false);assert.equal(parsed.limitations[0].startsWith('Synthetic'),true);
  assert.deepEqual(parseCompatibilityQuery(query()).sourceCommit,COMMIT);
  for(const changes of [{version:'140.*'},{version:'>=140.0'},{version:'140.0 || 1'},{walletVersion:'latest'},{version:''},{browser:'chrome\u202e'},{os:'Android\u0000'},{chain:'evm'},{chain:'solana:'},{connector:'eip1193\n'},{capabilities:['webcrypto','webcrypto']},{capabilities:['made-up']},{result:'supported'},{testedAt:-1},{testedAt:1.5},{limitations:['PRIVATE\u202e']},{extra:true}])refuses(()=>parseCompatibilityRecord({...record(),...changes}));
  refuses(()=>parseCompatibilityQuery({...query(),result:'supported'}));
});

test('hostile accessors, prototype records, sparse arrays and thrown proxies never execute or escape diagnostics', () => {
  let touched=0;const raw=record();Object.defineProperty(raw,'browser',{enumerable:true,get(){touched++;return 'PRIVATE';}});
  refuses(()=>parseCompatibilityRecord(raw));assert.equal(touched,0);
  refuses(()=>parseCompatibilityRecord(Object.create(record())));
  const sparse=record();sparse.limitations=new Array(1);refuses(()=>parseCompatibilityRecord(sparse));
  const accessor=record();Object.defineProperty(accessor.capabilities,'0',{enumerable:true,get(){touched++;return 'PRIVATE';}});refuses(()=>parseCompatibilityRecord(accessor));assert.equal(touched,0);
  const hostile=new Proxy({}, {getPrototypeOf(){throw new Proxy({}, {get(){throw Error('PRIVATE');}});}});refuses(()=>parseCompatibilityRecord(hostile));
});

test('imported passing status never certifies an unmeasured wallet; default catalog has no measured records', () => {
  const imported=parseCompatibilityRecord(record());assert.equal(imported.result,'pass');assert.equal(emptyCompatibilityCatalog.size,0);
  const unknown=getCompatibility(query(),undefined,NOW);assert.equal(unknown.status,'untested');assert.equal(unknown.reason,'unmeasured-target');
  assert.equal(unknown.certified,false);assert.equal(unknown.economicActionsAllowed,false);assert.equal(unknown.testedAt,null);
  assert.equal(getCompatibility(query(),{size:1,record:imported,status:'supported'},NOW).status,'untested');
  assert.equal(getCompatibility(query(),JSON.parse(JSON.stringify(emptyCompatibilityCatalog)),NOW).status,'untested');
});

test('catalog authenticates exact evidence bytes/source and separates tested, supported and unsupported', async () => {
  const automated=evidence({},'automated'), tested=await createCompatibilityCatalog(pins(automated),[automated]);
  const found=getCompatibility(query(),tested,NOW);assert.equal(found.status,'tested');assert.equal(found.evidenceKind,'automated');assert.equal(found.testedAt,NOW-100);
  assert.equal(found.evidenceSha256,sha(automated));assert.equal(found.certified,false);assert.equal(found.economicActionsAllowed,false);
  const physical=evidence(), supported=await createCompatibilityCatalog(pins(physical,'supported'),[physical]);
  assert.equal(getCompatibility(query(),supported,NOW).status,'supported');
  const failure=evidence({result:'fail'}), failed=await createCompatibilityCatalog(pins(failure),[failure]);assert.equal(getCompatibility(query(),failed,NOW).status,'tested');
  const unsupportedBytes=evidence({result:'unsupported'}), unsupported=await createCompatibilityCatalog(pins(unsupportedBytes,'unsupported'),[unsupportedBytes]);assert.equal(getCompatibility(query(),unsupported,NOW).status,'unsupported');
  await rejects(()=>createCompatibilityCatalog(pins(automated,'supported'),[automated]),'EVIDENCE_MISMATCH');
  await rejects(()=>createCompatibilityCatalog(pins(failure,'supported'),[failure]),'EVIDENCE_MISMATCH');
  await rejects(()=>createCompatibilityCatalog(pins(evidence({result:'not-run'})),[evidence({result:'not-run'})]),'EVIDENCE_MISMATCH');
});

test('every browser/version/OS/device/wallet/connector/chain/capability/source dimension scopes a measured result', async () => {
  const bytes=evidence(), catalog=await createCompatibilityCatalog(pins(bytes,'supported'),[bytes]);
  for(const changes of [{browser:'firefox'},{version:'140.0.2'},{os:'Android 16'},{device:'Pixel 9'},{wallet:'Other Wallet'},{walletVersion:'3.2.2'},{connector:'eip6963'},{chain:'eip155:1'},{capabilities:capabilities.filter(c=>c!=='evm-injected')},{capabilities:[...capabilities,'camera']},{sourceCommit:'c'.repeat(40)},{sourceSha256:'c'.repeat(64)}])assert.equal(getCompatibility(query(changes),catalog,NOW).status,'untested',JSON.stringify(changes));
  assert.equal(getCompatibility(query({capabilities:[...capabilities].reverse()}),catalog,NOW).status,'supported','set order alone does not change scope');
  assert.equal(getCompatibility(query(),catalog,NOW+3600).reason,'evidence-expired');
  assert.equal(getCompatibility(query(),catalog,NOW-101).reason,'evidence-not-current');
});

test('source/evidence mismatch, incomplete/ambiguous catalogs and malformed strict JSON fail closed', async () => {
  const bytes=evidence();await rejects(()=>createCompatibilityCatalog(pins(bytes,{bad:true}),[bytes]));
  await rejects(()=>createCompatibilityCatalog({...pins(bytes),sourceCommit:'c'.repeat(40)},[bytes]),'EVIDENCE_MISMATCH');
  await rejects(()=>createCompatibilityCatalog({...pins(bytes),sourceSha256:'c'.repeat(64)},[bytes]),'EVIDENCE_MISMATCH');
  const changed=bytes.slice();changed[changed.length-2]^=1;await rejects(()=>createCompatibilityCatalog(pins(bytes),[changed]),'EVIDENCE_MISMATCH');
  await rejects(()=>createCompatibilityCatalog(pins(bytes),[]),'EVIDENCE_MISMATCH');
  const second=evidence({limitations:['different report']});await rejects(()=>createCompatibilityCatalog({...pins(bytes),entries:[...pins(bytes).entries,{evidenceSha256:sha(second),status:'tested'}]},[bytes,second]),'EVIDENCE_MISMATCH');
  const duplicate=new TextEncoder().encode(new TextDecoder().decode(bytes).replace('"result":"pass"','"result":"pass","result":"fail"'));
  await rejects(()=>createCompatibilityCatalog(pins(duplicate),[duplicate]));
  const wrongFormat=new TextEncoder().encode(new TextDecoder().decode(bytes).replace('compatibility-evidence/v1','compatibility-evidence/v2'));await rejects(()=>createCompatibilityCatalog(pins(wrongFormat),[wrongFormat]));
  await rejects(()=>createCompatibilityCatalog(pins(bytes),[new Uint8Array(64*1024+1)]),'LIMIT_EXCEEDED');
  await rejects(()=>createCompatibilityCatalog(pins(bytes),[new Uint16Array(bytes)]));
  let touched=0;const fakeBytes={get byteLength(){touched++;return bytes.length;},[Symbol.iterator](){touched++;return bytes.values();}};
  await rejects(()=>createCompatibilityCatalog(pins(bytes),[fakeBytes]));assert.equal(touched,0);
});

test('catalog owns input before hashing and returned results cannot mutate later answers', async () => {
  const bytes=evidence(), pin=pins(bytes), pending=createCompatibilityCatalog(pin,[bytes]);
  pin.entries[0].status='unsupported';bytes.fill(0);const catalog=await pending;
  const found=getCompatibility(query(),catalog,NOW);assert.equal(found.status,'tested');assert.ok(Object.isFrozen(found)&&Object.isFrozen(found.limitations));
  assert.throws(()=>{found.limitations.push('PRIVATE');});assert.equal(getCompatibility(query(),catalog,NOW).status,'tested');
});
