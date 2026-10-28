import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const api=await import('../src/crypto-inventory.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const bytes=text=>new TextEncoder().encode(text), hash=value=>createHash('sha256').update(value).digest('hex');
const sri='sha512-'+Buffer.alloc(64,7).toString('base64');
const clone=value=>structuredClone(value);
function fixture(state='test-enabled'){
 const vector=bytes('independent known answer\n'),review=bytes('named review of pinned configuration');
 return {inventory:[{id:'curve',capability:'identity',primitive:'secp256k1',sourceUrl:'https://example.org/source/0123456789abcdef0123456789abcdef01234567',version:'2.4.0',integrity:sri,license:'MIT',runtime:'npm',review:{status:'pending',reviewer:'',evidencePath:''},vectors:[{path:'fixtures/curve.txt',sha256:hash(vector),provenanceUrl:'https://example.org/independent'}]}],
 lock:{name:'example',version:'1.0.0',lockfileVersion:3,requires:true,packages:{'':{name:'example',version:'1.0.0',dependencies:{'@test/curve':'2.4.0'}},'node_modules/@test/curve':{version:'2.4.0',resolved:'https://example.org/curve.tgz',integrity:sri,license:'MIT'}}},
 enabled:[{capability:'identity',state,implementations:[{inventoryId:'curve',packageName:'@test/curve'}]}],files:[{path:'fixtures/curve.txt',bytes:vector},{path:'reviews/curve.md',bytes:review}]};
}
async function run(f){assert.equal(typeof api.verifyCryptoInventory,'function','missing pure inventory verifier');return api.verifyCryptoInventory(f.inventory,f.lock,f.enabled,f.files);}
const codes=report=>report.findings.map(finding=>finding.code);
test('test-enabled pending review is labeled pending and never grants a production badge',async()=>{
 const f=fixture(),report=await run(f);assert.deepEqual(codes(report),['MISSING_REVIEW']);assert.equal(report.findings[0].disposition,'pending');assert.equal(report.releaseEligible,false);
 assert.deepEqual(await run(f),report);assert.equal(Object.isFrozen(report),true);
});
test('release-enabled requires named existing accepted review; test-only acceptance does not enable release',async()=>{
 const f=fixture('release-enabled');assert.equal((await run(f)).findings[0].disposition,'blocking');
 f.inventory[0].review={status:'accepted',reviewer:'Independent Reviewer',evidencePath:'reviews/curve.md'};const accepted=await run(f);assert.deepEqual(accepted.findings,[]);assert.equal(accepted.releaseEligible,true);
 f.files.pop();assert.ok(codes(await run(f)).includes('MISSING_REVIEW'));
 f.inventory[0].review.evidencePath='https://example.org/review';assert.ok(codes(await run(f)).includes('MISSING_REVIEW'));
});
test('missing test-enabled accepted-review evidence remains explicitly pending',async()=>{
 const f=fixture();f.inventory[0].review={status:'accepted',reviewer:'Named Reviewer',evidencePath:'reviews/missing.md'};
 const report=await run(f);assert.ok(report.findings.some(entry=>entry.code==='MISSING_REVIEW'&&entry.disposition==='pending'));assert.equal(report.releaseEligible,false);
});
test('changing one vector byte fails its hash before any vector execution',async()=>{
 const f=fixture();f.files[0].bytes[0]^=1;assert.ok(codes(await run(f)).includes('FIXTURE_HASH_MISMATCH'));
});
test('all required fixed findings are observable and cannot leak arbitrary input text',async()=>{
 const cases=[['UNPINNED_VERSION',f=>f.inventory[0].version='^2.4.0'],['INTEGRITY_MISMATCH',f=>f.inventory[0].integrity='sha512-'+Buffer.alloc(64,8).toString('base64')],['MISSING_LICENSE',f=>f.inventory[0].license=''],['MISSING_REVIEW',f=>f.inventory[0].review.status='rejected'],['MISSING_VECTOR',f=>f.inventory[0].vectors=[]],['FIXTURE_HASH_MISMATCH',f=>f.inventory[0].vectors[0].sha256='a'.repeat(64)],['UNDECLARED_CRYPTO',f=>f.enabled[0].implementations.push({inventoryId:'missing',packageName:'@test/missing'})],['UNSUPPORTED_RUNTIME',f=>f.inventory[0].runtime='SECRET-runtime']];
 for(const [code,mutate]of cases){const f=fixture();mutate(f);const report=await run(f);assert.ok(codes(report).includes(code),code);assert.doesNotMatch(JSON.stringify(report),/SECRET|https:\/\//);}
});
test('unknown fields, duplicate IDs, path escapes, malformed hashes and accessor input fail closed',async()=>{
 const mutations=[f=>f.inventory[0].unknown='SECRET',f=>f.inventory.push(clone(f.inventory[0])),f=>f.inventory[0].vectors[0].path='../escape',f=>f.inventory[0].vectors[0].path='/absolute',f=>f.inventory[0].vectors[0].path='fixtures\\escape',f=>f.inventory[0].vectors[0].sha256='not-a-hash',f=>f.inventory[0].integrity='sha512-not-a-hash',f=>f.enabled[0].extra=true,f=>f.files.push(clone(f.files[0]))];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.ok((await run(f)).findings.length>0);}
 const f=fixture();let touched=0;Object.defineProperty(f.inventory[0],'license',{get(){touched++;throw Error('SECRET');}});assert.ok((await run(f)).findings.length>0);assert.equal(touched,0);
});
test('transitive runtime implementations must be declared with exact locked edges',async()=>{
 const f=fixture();f.lock.packages['node_modules/@test/curve'].dependencies={'@test/hash':'1.2.3'};f.lock.packages['node_modules/@test/hash']={version:'1.2.3',integrity:sri,license:'MIT'};
 assert.ok(codes(await run(f)).includes('UNDECLARED_CRYPTO'));
 const dependency={...clone(f.inventory[0]),id:'hash',version:'1.2.3',primitive:'SHA256'};f.inventory.push(dependency);f.enabled[0].implementations.push({inventoryId:'hash',packageName:'@test/hash'});
 assert.deepEqual(codes(await run(f)),['MISSING_REVIEW','MISSING_REVIEW']);
 f.lock.packages['node_modules/@test/curve'].dependencies['@test/hash']='^1.2.3';assert.ok(codes(await run(f)).includes('UNPINNED_VERSION'));
});
test('candidate findings cannot be inherited as approval by another capability',async()=>{
 const f=fixture('candidate');assert.equal((await run(f)).findings[0].disposition,'candidate');
 f.enabled.push({capability:'unrelated',state:'release-enabled',implementations:[{inventoryId:'curve',packageName:'@test/curve'}]});assert.ok(codes(await run(f)).includes('UNDECLARED_CRYPTO'));assert.equal((await run(f)).releaseEligible,false);
});
test('native inventory requires matching bounded browser-profile observations rather than npm hashes',async()=>{
 const f=fixture();f.inventory[0]={...f.inventory[0],runtime:'browser-built-in',version:'WebCrypto-G02-v1',integrity:'browser-profile:security/browser-support.json'};delete f.enabled[0].implementations[0].packageName;
 assert.ok(codes(await run(f)).includes('UNSUPPORTED_RUNTIME'));
 const profile={profile:'WebCrypto-G02-v1',observed:[{engine:'Chromium',version:'154.0.8037.57',platform:'Linux',qualification:'local automation only',checks:['executed vectors']}],unassessed:['Firefox']};
 f.files.push({path:'security/browser-support.json',bytes:bytes(JSON.stringify(profile))});assert.deepEqual(codes(await run(f)),['MISSING_REVIEW']);
 profile.observed=[];f.files.at(-1).bytes=bytes(JSON.stringify(profile));assert.ok(codes(await run(f)).includes('UNSUPPORTED_RUNTIME'));
});
test('current inventory has scoped G16 review evidence while other test-only providers remain pending',async()=>{
 const inventory=JSON.parse(readFileSync(new URL('../../../security/crypto-inventory.json',import.meta.url))),lock=JSON.parse(readFileSync(new URL('../../../package-lock.json',import.meta.url)));
 const independentPath='packages/wallet/test/fixtures/g16-evm-independent.json';
 const termsEntries=inventory.filter(item=>item.capability==='trade-terms-evm-test-only');assert.equal(termsEntries.length,2);
 for(const item of termsEntries){assert.ok(item.vectors.some(vector=>vector.path===independentPath),'independent G16 fixture must enter both provider hash gates');assert.equal(item.review.status,'accepted');assert.match(item.review.reviewer,/fresh-context/);assert.equal(item.review.evidencePath,'docs/reviews/G06_UPSTREAM_REVIEW_2026-10-26.md');}
 const enabled=[{capability:'local-encrypted-vault',state:'test-enabled',implementations:[{inventoryId:'native-pbkdf2'},{inventoryId:'native-aes-gcm'}]},{capability:'local-messaging-identity-test-only',state:'test-enabled',implementations:[{inventoryId:'noble-curves-2.4.0',packageName:'@noble/curves'},{inventoryId:'noble-hashes-2.4.0',packageName:'@noble/hashes'}]},{capability:'trade-terms-evm-test-only',state:'test-enabled',implementations:[{inventoryId:'noble-curves-2.4.0-secp256k1-recover',packageName:'@noble/curves'},{inventoryId:'noble-hashes-2.4.0-keccak',packageName:'@noble/hashes'}]},{capability:'nostr-messaging-test-only',state:'test-enabled',implementations:[{inventoryId:'noble-curves-2.4.0-nostr',packageName:'@noble/curves'},{inventoryId:'noble-hashes-2.4.0-nostr',packageName:'@noble/hashes'}]},{capability:'nostr-chacha20-project-owned-candidate',state:'candidate',implementations:[{inventoryId:'project-chacha20-rfc8439'}]}];
 const paths=new Set(['security/browser-support.json',...inventory.flatMap(item=>item.vectors.map(vector=>vector.path)),...inventory.map(item=>item.review.evidencePath).filter(Boolean)]),files=[...paths].map(path=>({path,bytes:new Uint8Array(readFileSync(new URL('../../../'+path,import.meta.url)))}));
 const report=await run({inventory,lock,enabled,files});
 // 6 test-enabled pending reviews (G16 providers carry scoped review evidence); the project-owned ChaCha20 (G20) stays a candidate: no review and no vendored-runtime approval path.
 assert.deepEqual(report.findings.filter(f=>f.disposition!=='candidate').map(f=>`${f.code}:${f.disposition}`),Array(6).fill('MISSING_REVIEW:pending'));
 const chacha=`inventory/${inventory.findIndex(item=>item.id==='project-chacha20-rfc8439')}`;
 assert.deepEqual(report.findings.filter(f=>f.disposition==='candidate').map(f=>`${f.code}:${f.path}`),[`MISSING_REVIEW:${chacha}`,`UNSUPPORTED_RUNTIME:${chacha}`]);
 assert.equal(report.releaseEligible,false);
 const withoutReview=files.filter(file=>!termsEntries.some(item=>item.review.evidencePath===file.path));
 assert.equal(codes(await run({inventory,lock,enabled,files:withoutReview})).filter(code=>code==='MISSING_REVIEW').length,9,'review acceptance requires its actual retained evidence file');
 const independent=files.find(file=>file.path===independentPath);independent.bytes[0]^=1;
 const tampered=await run({inventory,lock,enabled,files});assert.equal(codes(tampered).filter(code=>code==='FIXTURE_HASH_MISMATCH').length,2,'actual fixture tamper fails both provider gates');assert.equal(tampered.releaseEligible,false);
});
test('input objects and fixture bytes are snapshotted before asynchronous hashes',async()=>{
 const f=fixture(),pending=run(f);f.files[0].bytes.fill(0);f.inventory[0].vectors[0].sha256='f'.repeat(64);f.inventory[0].review={status:'accepted',reviewer:'Late Reviewer',evidencePath:'reviews/curve.md'};f.enabled[0].state='release-enabled';
 const report=await pending;assert.deepEqual(codes(report),['MISSING_REVIEW']);assert.equal(report.findings[0].disposition,'pending');assert.equal(report.releaseEligible,false);
});
test('bounded metadata rejects oversized files, aggregate bytes, graph and hostile prototypes',async()=>{
 for(const change of [f=>f.files[0].bytes=new Uint8Array(1024*1024+1),f=>f.files=Array.from({length:17},(_,i)=>({path:`fixtures/${i}`,bytes:new Uint8Array(1024*1024)})),f=>f.inventory=Array.from({length:65},()=>clone(f.inventory[0])),f=>Object.setPrototypeOf(f.inventory[0],{inherited:'SECRET'})]){const f=fixture();change(f);assert.ok((await run(f)).findings.length>0);}
});
test('declared npm implementations must connect to exact root and transitive lock edges',async()=>{
 const f=fixture();delete f.lock.packages[''].dependencies['@test/curve'];assert.ok(codes(await run(f)).includes('UNDECLARED_CRYPTO'));
});
test('unused candidate inventory still rejects malformed fixture and review schema',async()=>{
 for(const mutate of [f=>f.inventory[0].vectors[0].sha256='malformed',f=>f.inventory[0].vectors[0].path='../escape',f=>f.inventory[0].review.evidencePath='../escape',f=>f.inventory[0].review.status='invented',f=>f.inventory[0].integrity='malformed',f=>f.inventory[0].version='^2.4.0',f=>f.inventory[0].license='',f=>f.inventory[0].review={status:'accepted',reviewer:'Named',evidencePath:'reviews/missing.md'}]){const f=fixture();f.enabled=[];mutate(f);assert.ok((await run(f)).findings.length>0);}
});
test('duplicate decoded browser profile keys cannot manufacture an observed runtime',async()=>{
 const f=fixture();f.inventory[0]={...f.inventory[0],runtime:'browser-built-in',version:'WebCrypto-G02-v1',integrity:'browser-profile:security/browser-support.json'};delete f.enabled[0].implementations[0].packageName;
 const json='{"profile":"wrong","pro\\u0066ile":"WebCrypto-G02-v1","observed":[{"engine":"Chromium","version":"1","platform":"Linux","qualification":"automation","checks":["vectors"]}],"unassessed":[]}';f.files.push({path:'security/browser-support.json',bytes:bytes(json)});assert.ok(codes(await run(f)).includes('UNSUPPORTED_RUNTIME'));
});
test('absent required provenance fields use the corresponding fixed finding',async()=>{
 for(const [field,code]of [['version','UNPINNED_VERSION'],['integrity','INTEGRITY_MISMATCH'],['license','MISSING_LICENSE'],['review','MISSING_REVIEW'],['vectors','MISSING_VECTOR']]){const f=fixture();delete f.inventory[0][field];assert.ok(codes(await run(f)).includes(code),field);}
});
test('browser built-ins require a versioned support profile and concrete observed browser version',async()=>{
 const f=fixture();f.inventory[0]={...f.inventory[0],runtime:'browser-built-in',version:'latest',integrity:'browser-profile:security/browser-support.json'};delete f.enabled[0].implementations[0].packageName;
 const profile={profile:'latest',observed:[{engine:'Chromium',version:'latest',platform:'Linux',qualification:'automation',checks:['vectors']}],unassessed:[]};f.files.push({path:'security/browser-support.json',bytes:bytes(JSON.stringify(profile))});assert.ok(codes(await run(f)).includes('UNSUPPORTED_RUNTIME'));
});
test('unavailable native SHA256 is UNSUPPORTED_RUNTIME rather than a false fixture mismatch',async()=>{
 const f=fixture(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 try{for(const unavailable of [undefined,{subtle:{digest:async()=>{throw Error('SECRET unavailable native digest');}}}]){Object.defineProperty(globalThis,'crypto',{configurable:true,value:unavailable});const report=await run(f);assert.ok(codes(report).includes('UNSUPPORTED_RUNTIME'));assert.ok(!codes(report).includes('FIXTURE_HASH_MISMATCH'));assert.doesNotMatch(JSON.stringify(report),/SECRET/);}}
 finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});
test('npm pins reject leading-zero numeric prerelease identifiers while accepting exact valid prereleases',async()=>{
 for(const version of ['1.0.0-01','1.0.0-alpha.00']){const f=fixture();f.inventory[0].version=version;f.lock.packages[''].dependencies['@test/curve']=version;f.lock.packages['node_modules/@test/curve'].version=version;assert.ok(codes(await run(f)).includes('UNPINNED_VERSION'));}
 const f=fixture(),version='1.0.0-alpha-beta.0+build.01';f.inventory[0].version=version;f.lock.packages[''].dependencies['@test/curve']=version;f.lock.packages['node_modules/@test/curve'].version=version;assert.deepEqual(codes(await run(f)),['MISSING_REVIEW']);
});
test('duplicate inventory IDs always block the metadata gate despite a candidate capability claim',async()=>{
 const f=fixture('release-enabled');f.inventory[0].review={status:'accepted',reviewer:'Named Reviewer',evidencePath:'reviews/curve.md'};
 f.inventory.push({...clone(f.inventory[0]),capability:'unused-candidate'});
 const report=await run(f);assert.equal(report.releaseEligible,false);assert.ok(report.findings.some(entry=>entry.code==='UNSUPPORTED_RUNTIME'&&entry.disposition==='blocking'));
 const reversed=fixture('release-enabled');reversed.inventory[0].review={status:'accepted',reviewer:'Named Reviewer',evidencePath:'reviews/curve.md'};
 reversed.inventory.unshift({...clone(reversed.inventory[0]),capability:'unused-candidate',runtime:'unknown-runtime'});
 assert.equal((await run(reversed)).releaseEligible,false);
});
test('unused entries still validate the closed runtime enum without inheriting approval',async()=>{
 const f=fixture('release-enabled');f.inventory[0].review={status:'accepted',reviewer:'Named Reviewer',evidencePath:'reviews/curve.md'};
 f.inventory.push({...clone(f.inventory[0]),id:'unused',capability:'unused-candidate',runtime:'unknown-runtime'});
 const report=await run(f);assert.ok(report.findings.some(entry=>entry.code==='UNSUPPORTED_RUNTIME'&&entry.disposition==='candidate'));
});
