import test from 'node:test';
import assert from 'node:assert/strict';
import {createProofInputParsers,LOCAL_DEFAULT_BOUNDS} from '../index.ts';
const enc=new TextEncoder();
const good=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const bad=(r,code)=>{assert.equal(r.ok,false);if(code)assert.equal(r.error.code,code);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|SECRET|stack|bank-response/);};
const parsers=()=>good(createProofInputParsers());
const binding=()=>({chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId:'1'.repeat(64)});
const request=()=>({v:1,binding:binding(),termsHash:'opaque-terms',sourcePolicyId:'source-v1',statementVersion:1,challenge:'opaque-challenge',disclosureHash:'opaque-disclosure'});
const policy=()=>({id:'source-v1',version:1,httpsOrigin:'https://bank.example',pathPatternId:'path-v1',redirects:'reject',notaryKeyId:'notary-v1',verifierProfileId:'verifier-v1',maxResponseBytes:1048576,maxAgeSeconds:300});
const source=()=>({policyId:'source-v1',hostname:'bank.example',responseCommitment:'opaque-response',observedAtSeconds:'0',attestationHash:'opaque-attestation'});
const statement=()=>({v:1,binding:binding(),termsHash:'opaque-terms',sourcePolicyId:'source-v1',parserVersion:'parser-v1',challenge:'opaque-challenge',currency:'USD',minorUnits:'1',currencyScale:2,beneficiaryCommitment:'opaque-beneficiary',referenceCommitment:'opaque-reference',transactionTimeSeconds:'0',observedAtSeconds:'0',status:'posted',responseCommitment:'opaque-response',verifierProfileId:'verifier-v1'});
const advisory=()=>({mode:'advisory',termsHash:'opaque-terms',sourcePolicyIds:['source-v1'],maxAgeSeconds:300,autoRelease:false,retention:'discard-after-session'});
const witness=()=>({v:1,sourcePolicyId:'source-v1',parserVersion:'parser-v1',authenticatedResponse:enc.encode('éabcdef'),fieldSpans:{a:{start:0,end:2},b:{start:2,end:3}},rawAmount:'1',currency:'USD',rawStatus:'posted',rawTimestamp:'2026',beneficiary:'a',reference:'b',beneficiarySalt:new Uint8Array(16).fill(8),referenceSalt:new Uint8Array(16).fill(9)});
const methods=[['parseRequest',request],['parseWitness',witness],['parseSourcePolicy',policy],['parseSourceRecord',source],['parseStatement',statement],['parseAdvisoryPolicy',advisory]];
function flags(result){for(const key of ['compatibilityAvailable','sourceAuthenticated','semanticCoverage','proofVerified','receiptAuthority','economicPreparationAllowed'])assert.equal(result[key],false);assert.equal(result.kind,'unverified-proof-input');assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.data));}

test('exact structural schemas return unverified detached data; catalog cannot enable anything',()=>{
 const p=parsers();assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.catalogs));assert.deepEqual(Object.keys(p.catalogs),['sources','parsers','verifiers','rails']);
 for(const catalog of Object.values(p.catalogs)){assert.deepEqual(catalog,[]);assert.ok(Object.isFrozen(catalog));}
 assert.equal('requestUse'in p,false);assert.equal('register'in p,false);
 for(const[name,make]of methods){const original=make(),out=good(p[name](original));flags(out);if(original.binding){original.binding.tradeId='2'.repeat(64);assert.equal(out.data.binding.tradeId,'1'.repeat(64));assert.ok(Object.isFrozen(out.data.binding));}}
 const raw=advisory(),out=good(p.parseAdvisoryPolicy(raw));raw.sourcePolicyIds[0]='changed';assert.deepEqual(out.data.sourcePolicyIds,['source-v1']);assert.ok(Object.isFrozen(out.data.sourcePolicyIds));
});

test('unknown/accessor/inherited fields and poisoned reflection never escape or execute getters',()=>{
 const p=parsers();let touched=0;
 for(const[name,make]of methods){bad(p[name]({...make(),enabled:true}));const input=make();Object.defineProperty(input,Object.keys(input)[0],{get(){touched++;throw Error('PRIVATE_SECRET');},enumerable:true});bad(p[name](input));bad(p[name](Object.create(make())));bad(p[name](new Proxy({},{getPrototypeOf(){throw Error('PRIVATE_SECRET');}})));}
 assert.equal(touched,0);
 bad(p.parseRequest({...request(),binding:{...binding(),account:'PRIVATE_SECRET'}}));bad(p.parseRequest({...request(),v:2}),'UNSUPPORTED_VERSION');bad(p.parseRequest({...request(),statementVersion:2}),'UNSUPPORTED_VERSION');
 const r=request();Object.defineProperty(r,'hidden',{value:1});bad(p.parseRequest(r));bad(p.parseRequest({...request(),[Symbol('secret')]:true}));
});

test('request expected comparison rejects all full-binding/context substitutions',()=>{
 const p=parsers();flags(good(p.parseRequest(request(),request())));
 for(const key of ['termsHash','sourcePolicyId','challenge','disclosureHash'])bad(p.parseRequest({...request(),[key]:'changed'},request()),'INTEGRITY_FAILURE');
 for(const[key,value]of [['chain','solana'],['networkId','other'],['deploymentId','other'],['tradeId','2'.repeat(64)]])bad(p.parseRequest({...request(),binding:{...binding(),[key]:value}},request()));
 const input=request();Object.defineProperty(input.binding,'tradeId',{get(){throw Error('PRIVATE_SECRET');},enumerable:true});bad(p.parseRequest(input));
});

test('proof hash/challenge/commitment strings stay opaque with no extrapolated wire encoding',()=>{
 const p=parsers();assert.equal(good(p.parseRequest(request())).data.challenge,'opaque-challenge');
 for(const key of ['termsHash','challenge','disclosureHash']){good(p.parseRequest({...request(),[key]:'a'.repeat(512)}));bad(p.parseRequest({...request(),[key]:'a'.repeat(513)}));bad(p.parseRequest({...request(),[key]:' a'}));bad(p.parseRequest({...request(),[key]:'\nSECRET'}));}
 good(p.parseRequest({...request(),sourcePolicyId:'a'.repeat(128)}));bad(p.parseRequest({...request(),sourcePolicyId:'a'.repeat(129)}));
 for(const id of ['__proto__','constructor','prototype','UpperCase','', 'é'])bad(p.parseRequest({...request(),sourcePolicyId:id}));
});

test('strict JSON byte entry reuses duplicate/prototype/UTF8/BOM/depth bounds without binary witness codec',()=>{
 const p=parsers();const cases=[['request',request],['source-policy',policy],['source-record',source],['statement',statement],['advisory-policy',advisory]];
 for(const[kind,make]of cases)flags(good(p.parseJson(kind,enc.encode(JSON.stringify(make())))));
 for(const raw of ['{"v":1,"v":1}','{"__proto__":{}}','{"constructor":1}','{"prototype":1}','{"v":1.1}','{"v":-1}','{"x":9007199254740992}','[ [[[[[[]]]]]]]'])bad(p.parseJson('request',enc.encode(raw)));
 bad(p.parseJson('request',new Uint8Array([0xc0,0xaf])));bad(p.parseJson('request',enc.encode('\ufeff'+JSON.stringify(request()))));bad(p.parseJson('request',new Uint8Array(32769)),'LIMIT_EXCEEDED');bad(p.parseJson('witness',enc.encode('{}')));
});

test('source origin local normalization rejects credentials, redirects, IDN and alternate representations',()=>{
 const p=parsers();for(const httpsOrigin of ['http://bank.example','https://BANK.example','https://bank.example/','https://bank.example:443','https://bank.example.','https://bank.example/path','https://bank.example?x','https://bank.example#x','https://user:secret@bank.example','https://bänk.example','https://xn--bnk-qla.example','https://127.0.0.1','https://[::1]','https://localhost'])bad(p.parseSourcePolicy({...policy(),httpsOrigin}));
 good(p.parseSourcePolicy({...policy(),httpsOrigin:'https://bank.example:8443'}));
 for(const patch of [{redirects:'follow'},{maxResponseBytes:1048575},{maxAgeSeconds:301},{version:2}])bad(p.parseSourcePolicy({...policy(),...patch}));
 flags(good(p.parseSourceRecord(source(),policy())));bad(p.parseSourceRecord({...source(),policyId:'other'},policy()),'INTEGRITY_FAILURE');bad(p.parseSourceRecord({...source(),hostname:'other.example'},policy()),'INTEGRITY_FAILURE');
 for(const hostname of ['BANK.example','bank.example.','xn--bnk-qla.example'])bad(p.parseSourceRecord({...source(),hostname}));
});

test('statement amounts/time canonical uint128/uint64 boundaries and currency scales',()=>{
 const p=parsers();const max128=((1n<<128n)-1n).toString(),max64=((1n<<64n)-1n).toString();
 good(p.parseStatement({...statement(),minorUnits:max128,transactionTimeSeconds:max64,observedAtSeconds:max64,currencyScale:6},request()));
 for(const minorUnits of ['0','01','-1','1.0','1e2','+1',' 1',(1n<<128n).toString(),1])bad(p.parseStatement({...statement(),minorUnits}));
 for(const time of ['01','-1','1.0','1e2',(1n<<64n).toString(),1])for(const key of ['transactionTimeSeconds','observedAtSeconds'])bad(p.parseStatement({...statement(),[key]:time}));
 for(const currency of ['usd','US','USDD','€UR'])bad(p.parseStatement({...statement(),currency}));for(const currencyScale of [-1,1.1,7,NaN])bad(p.parseStatement({...statement(),currencyScale}));
});

test('statement expected request bindings and statuses are preserved, never upgraded to posted',()=>{
 const p=parsers();for(const status of ['initiated','pending','posted','reversed','unknown'])assert.equal(good(p.parseStatement({...statement(),status},request())).data.status,status);
 bad(p.parseStatement({...statement(),status:'paid'}));for(const key of ['termsHash','sourcePolicyId','challenge'])bad(p.parseStatement({...statement(),[key]:'changed'},request()),'INTEGRITY_FAILURE');
 bad(p.parseStatement({...statement(),binding:{...binding(),tradeId:'2'.repeat(64)}},request()),'INTEGRITY_FAILURE');
 // Structural parsing does not assert chronological freshness or rail membership.
 flags(good(p.parseStatement({...statement(),currency:'ZZZ',transactionTimeSeconds:'9',observedAtSeconds:'0'})));
});

test('advisory policy constants/retention/list shape and local sixteen-ID bound',()=>{
 const p=parsers();good(p.parseAdvisoryPolicy({...advisory(),retention:'encrypted-user-retained'}));good(p.parseAdvisoryPolicy({...advisory(),sourcePolicyIds:[]}));good(p.parseAdvisoryPolicy({...advisory(),sourcePolicyIds:Array.from({length:16},(_,i)=>'source-'+i)}));
 for(const patch of [{mode:'automatic'},{autoRelease:true},{maxAgeSeconds:301},{retention:'plaintext'},{sourcePolicyIds:['source-v1','source-v1']},{sourcePolicyIds:Array.from({length:17},(_,i)=>'source-'+i)},{sourcePolicyIds:new Array(1)}])bad(p.parseAdvisoryPolicy({...advisory(),...patch}));
 let touched=0;const ids=['source-v1'];Object.defineProperty(ids,'0',{enumerable:true,get(){touched++;throw Error('PRIVATE_SECRET');}});bad(p.parseAdvisoryPolicy({...advisory(),sourcePolicyIds:ids}));assert.equal(touched,0);
});

test('witness owns detached private byte copies, fixed metadata, and does not wipe caller input',()=>{
 const p=parsers(),input=witness(),out=good(p.parseWitness(input));flags(out);assert.equal(input.beneficiarySalt[0],8);
 input.authenticatedResponse.fill(0);input.beneficiarySalt.fill(0);input.referenceSalt.fill(0);input.fieldSpans.a.start=99;
 assert.equal(out.data.authenticatedResponse[0],0xc3);assert.equal(out.data.beneficiarySalt[0],8);assert.equal(out.data.referenceSalt[0],9);assert.deepEqual(out.data.fieldSpans.a,{start:0,end:2});assert.ok(Object.isFrozen(out.data.fieldSpans)&&Object.isFrozen(out.data.fieldSpans.a));
 out.data.authenticatedResponse.fill(0);out.data.beneficiarySalt.fill(0);out.data.referenceSalt.fill(0);
});

test('witness response/salt exact byte bounds and native backing validation',()=>{
 const p=parsers();const max={...witness(),authenticatedResponse:new Uint8Array(1048576).fill(65),fieldSpans:{a:{start:0,end:1048576}},beneficiarySalt:new Uint8Array(64),referenceSalt:new Uint8Array(64)};good(p.parseWitness(max));
 bad(p.parseWitness({...max,authenticatedResponse:new Uint8Array(1048577)}),'LIMIT_EXCEEDED');for(const size of [0,15,65])bad(p.parseWitness({...witness(),beneficiarySalt:new Uint8Array(size)}));
 for(const field of ['authenticatedResponse','beneficiarySalt','referenceSalt']){bad(p.parseWitness({...witness(),[field]:new Uint8Array(new SharedArrayBuffer(32))}));const bytes=new Uint8Array(32);structuredClone(bytes,{transfer:[bytes.buffer]});bad(p.parseWitness({...witness(),[field]:bytes}));bad(p.parseWitness({...witness(),[field]:new Proxy(new Uint8Array(32),{})}));}
 const bytes=new Uint8Array(40).fill(65),logical=bytes.subarray(2,10);Object.defineProperty(logical,'byteLength',{get(){throw Error('PRIVATE_SECRET');}});assert.equal(good(p.parseWitness({...witness(),authenticatedResponse:logical})).data.authenticatedResponse.byteLength,8);
});

test('witness strings enforce UTF8 byte rather than UTF16 bounds, reject lone surrogates and malformed responses',()=>{
 const p=parsers();good(p.parseWitness({...witness(),rawStatus:'é'.repeat(256),beneficiary:'é'.repeat(128)}));bad(p.parseWitness({...witness(),rawStatus:'é'.repeat(257)}));bad(p.parseWitness({...witness(),beneficiary:'é'.repeat(129)}));bad(p.parseWitness({...witness(),reference:'\ud800'}));
 for(const authenticatedResponse of [new Uint8Array([0xc0,0xaf]),new Uint8Array([0xed,0xa0,0x80]),enc.encode('\ufeffabc'),new Uint8Array()])bad(p.parseWitness({...witness(),authenticatedResponse}));
});

test('local half-open disjoint span convention enforces UTF8 boundaries, containment and sixteen spans',()=>{
 const p=parsers();for(const fieldSpans of [{a:{start:0,end:1}},{a:{start:1,end:2}},{a:{start:0,end:3},b:{start:2,end:4}},{a:{start:3,end:2}},{a:{start:2,end:2}},{a:{start:-1,end:2}},{a:{start:0.5,end:2}},{a:{start:0,end:9}},{a:{start:0,end:Number.MAX_SAFE_INTEGER}},{a:{start:0,end:2,verified:true}}])bad(p.parseWitness({...witness(),fieldSpans}));
 const spans=Object.fromEntries(Array.from({length:16},(_,i)=>['field-'+i,{start:i,end:i+1}]));good(p.parseWitness({...witness(),authenticatedResponse:enc.encode('a'.repeat(17)),fieldSpans:spans}));bad(p.parseWitness({...witness(),authenticatedResponse:enc.encode('a'.repeat(17)),fieldSpans:{...spans,extra:{start:16,end:17}}}),'LIMIT_EXCEEDED');
 // No invented span-name to semantic-path mapping: coverage stays explicitly false.
 flags(good(p.parseWitness({...witness(),fieldSpans:{},rawAmount:'PRIVATE_UNAUTHENTICATED_LABEL'})));
});

test('constructor local bounds only tighten, total witness budget includes all owned bytes/strings before copy',()=>{
 assert.ok(Object.isFrozen(LOCAL_DEFAULT_BOUNDS));for(const options of [{maxSaltBytes:15},{maxSaltBytes:65},{maxIdBytes:129},{maxOpaqueBytes:513},{maxOwnedWitnessBytes:LOCAL_DEFAULT_BOUNDS.maxOwnedWitnessBytes+1},{maxIdBytes:0},{enabled:true}])bad(createProofInputParsers(options));
 const input=witness();const total=input.authenticatedResponse.length+32+2+['sourcePolicyId','parserVersion','rawAmount','currency','rawStatus','rawTimestamp','beneficiary','reference'].reduce((n,key)=>n+enc.encode(input[key]).length,0);
 good(good(createProofInputParsers({maxOwnedWitnessBytes:total})).parseWitness(input));bad(good(createProofInputParsers({maxOwnedWitnessBytes:total-1})).parseWitness(input),'LIMIT_EXCEEDED');
 const bounds={maxSaltBytes:16};const p=good(createProofInputParsers(bounds));bounds.maxSaltBytes=64;bad(p.parseWitness({...witness(),referenceSalt:new Uint8Array(17)}));
});

 test('full expected statement comparison rejects all predicate substitutions without asserting verification',()=>{
 const p=parsers();flags(good(p.parseStatement(statement(),request(),statement())));
 for(const [key,value]of [['currency','EUR'],['minorUnits','2'],['currencyScale',3],['beneficiaryCommitment','other'],['referenceCommitment','other'],['transactionTimeSeconds','1'],['observedAtSeconds','1'],['status','reversed'],['responseCommitment','other'],['parserVersion','parser-other'],['verifierProfileId','verifier-other']])bad(p.parseStatement({...statement(),[key]:value},request(),statement()),'INTEGRITY_FAILURE');
});
