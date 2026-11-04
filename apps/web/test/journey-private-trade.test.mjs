import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPrivateTradeJourney} from '../src/journey/private-trade.ts';
import {EncryptedVaultService,EncryptedBackupService} from '../../../packages/storage/index.ts';
import {MessagingIdentityService} from '../../../packages/identity/src/identity-service.ts';
import {createLocalNobleIdentityProvider} from '../../../packages/identity/index.ts';
const registryBytes=new Uint8Array(await readFile(new URL('../../../packages/domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url))),registryDigest=createHash('sha256').update(registryBytes).digest('hex');
const pass='Native localproof unit profile passphrase';
class Store{rows=new Map();async get(id){return structuredClone(this.rows.get(id));}async add(row,o){o?.assertCurrent?.();this.rows.set(row.profileId,structuredClone(row));}async compareAndSwap(old,row,o){o?.assertCurrent?.();assert.equal(JSON.stringify(this.rows.get(old.profileId)),JSON.stringify(old));this.rows.set(row.profileId,structuredClone(row));}subscribeInvalidation(){return()=>{};}async listProfileIds(){return{profileIds:[...this.rows.keys()],truncated:false};}}
const value=response=>{assert.equal(response.result.ok,true,JSON.stringify(response));return response.result.value;};
function setup(localPeerAcceptance){const store=new Store(),vault=new EncryptedVaultService(store,crypto,{lifecycle:false}),backup=new EncryptedBackupService(store);let calls=0;const journey=createPrivateTradeJourney({services:{vault,backup},native:{MessagingIdentityService,createIdentityProvider:createLocalNobleIdentityProvider,walletProvider(){calls++;throw Error('NO_NATIVE_AUTHORITY');}},registryBytes,registryDigest,request(){calls++;throw Error('NO_NATIVE_AUTHORITY');},createRelay(){calls++;throw Error('NO_NATIVE_AUTHORITY');},localPeerAcceptance});return{store,vault,journey,get calls(){return calls;}};}
async function onboard(s){const status=value(await s.journey.runtime({operation:'create',passphrase:pass})),profileId=status.handle.profileId;const backup=value(await s.journey.runtime({operation:'exportEncrypted',profileId}));const receipt=value(await s.journey.runtime({operation:'verifyBackup',profileId,bytes:backup.bytes,passphrase:pass}));assert.equal(receipt.revision,1,'real messaging identity is committed before the verified backup');return profileId;}
test('actual private factory never enables trading or touches native wallet/network without the missing peer carrier capability',async()=>{const s=setup();try{const profileId=await onboard(s);await assert.rejects(s.journey.act('connect'),/PEER_ACCEPTANCE_CARRIER_UNDEFINED/);assert.equal(s.calls,0);assert.equal(s.journey.snapshot().tradingEnabled,false);assert.equal(s.journey.snapshot().profileId,null);assert.equal(s.journey.snapshot().backupRevision,null);}finally{s.journey.dispose();}});
test('a selected mutation attempt invalidates real backup authority before even a constructor-provided peer callback can run',async()=>{let accepts=0;const s=setup(()=>{accepts++;throw Error('UNEXPECTED');});try{const profileId=await onboard(s);value(await s.journey.runtime({operation:'saveTermsReview',profileId,source:'file',bytes:new Uint8Array([1])}));await assert.rejects(s.journey.act('connect'),/BACKUP_REQUIRED/);assert.equal(s.calls,0);assert.equal(accepts,0);}finally{s.journey.dispose();}});
test('public runtime payload cannot set journey phase, imported acceptance, receipt or backup authority',async()=>{const s=setup();try{await onboard(s);for(const input of[{operation:'status',phase:'accepted'},{operation:'status',receipt:{state:'finalized'}},{operation:'checkBackupVerification',profileId:s.journey.snapshot().profileId,verification:{revision:1}}])await assert.rejects(s.journey.runtime(input));assert.equal(s.journey.snapshot().phase,'setup');await assert.rejects(s.journey.act('fund'),/OUT_OF_ORDER/);assert.equal(s.calls,0);}finally{s.journey.dispose();}});

test('private native transition boundary uses the same exact canonical prepared-request codec as lifecycle',async()=>{
 const{parseCanonicalPreparedRequest}=await import('../src/journey/private-trade.ts');
 const request={v:1,chainId:'31337',from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x1234',value:'0',nonce:'1',preparedAtBlock:'9'};
 assert.deepEqual(parseCanonicalPreparedRequest(JSON.stringify(request)),request);
 for(const raw of[JSON.stringify({...request,extension:true}),JSON.stringify(request,null,2),JSON.stringify({chainId:request.chainId,v:request.v,from:request.from,to:request.to,data:request.data,value:request.value,nonce:request.nonce,preparedAtBlock:request.preparedAtBlock}),JSON.stringify({...request,nonce:'01'}),JSON.stringify({...request,data:'0x1'}),JSON.stringify(request).replace('"nonce":"1"','"nonce":"1","nonce":"1"')])assert.throws(()=>parseCanonicalPreparedRequest(raw));
});

test('token response words and principal are exact bounded uint256, never loose hex or display amounts',async()=>{
 const {decodeUintWord,canonicalPrincipal}=await import('../src/journey/private-trade.ts');assert.equal(decodeUintWord('0x'+'f'.repeat(64)),String((1n<<256n)-1n));assert.equal(canonicalPrincipal('1'),'1');assert.equal(canonicalPrincipal(String((1n<<256n)-1n)),String((1n<<256n)-1n));
 for(const raw of['0x','0x01','0x'+'0'.repeat(128),'0x'+'g'.repeat(64),null,{},1])assert.throws(()=>decodeUintWord(raw));for(const raw of['0','01','-1','1.0','1e18',String(1n<<256n),null,1])assert.throws(()=>canonicalPrincipal(raw));
});
test('unlisted token selection and malformed principal fail before any native wallet prompt or request',async()=>{
 for(const options of[{assetId:'unlisted',amountBaseUnits:'1'},{assetId:'test-usd',amountBaseUnits:'0'},{assetId:'test-usd',amountBaseUnits:String(1n<<256n)}]){const s=setup(async()=>{throw Error('UNEXPECTED_PEER');});try{await onboard(s);await assert.rejects(s.journey.act('connect',options),/UNSUPPORTED_ASSET|INVALID_INPUT/);assert.equal(s.calls,0);assert.equal(s.journey.snapshot().tradingEnabled,false);}finally{s.journey.dispose();}}
});
test('restored status and direct approval/reset requests cannot fabricate accepted capability',async()=>{
 const s=setup();try{await onboard(s);for(const action of['approve','reset-approval','accept-recovered','token-check'])await assert.rejects(s.journey.act(action),/OUT_OF_ORDER|RISK_CONFIRMATION_REQUIRED/);assert.equal(s.calls,0);assert.equal(s.journey.snapshot().tokenCheck,null);assert.deepEqual(s.journey.snapshot().fees,[]);}finally{s.journey.dispose();}
});

test('native receipt fee arithmetic rejects oversized words/product instead of emitting an unbounded or rounded fee',async()=>{const{feeProduct}=await import('../src/journey/private-trade.ts');assert.equal(feeProduct('21000','1000000000'),'21000000000000');assert.equal(feeProduct('0','0'),'0');for(const pair of[['01','2'],['-1','2'],[String(1n<<256n),'0'],[String((1n<<256n)-1n),'2'],['1e9','2']])assert.throws(()=>feeProduct(...pair));});

test('public signing-review requests cannot import a confirmation, provider or native capability',async()=>{
 const s=setup();try{await onboard(s);for(const options of[{}, {signingAction:'fund',reviewId:'imported',reviewRiskAccepted:true}, {signingAction:'accept',signingReview:{action:'accept',expiresAt:Number.MAX_SAFE_INTEGER,wallets:[{providerId:'forged'}]}}])await assert.rejects(s.journey.act('confirm-signing',options),/SIGNING_REVIEW_REQUIRED/);
  for(const signingAction of['accept','accept-recovered','approve','reset-approval','fund','release','refund'])await assert.rejects(s.journey.act('review-signing',{signingAction}),/OUT_OF_ORDER/);
  await assert.rejects(s.journey.act('review-signing',{signingAction:'imported-action'}),/INVALID_INPUT/);assert.equal(s.calls,0);assert.equal(s.journey.snapshot().signingReview,null);assert.equal(s.journey.snapshot().tradingEnabled,false);
 }finally{s.journey.dispose();}
});
