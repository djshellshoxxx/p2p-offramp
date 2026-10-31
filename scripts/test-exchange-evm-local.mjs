#!/usr/bin/env node
/** Canonical cross-layer LOCAL evidence: real Nostr crypto/relay/exchange -> reviewed exact bytes -> G12 -> canonical escrow.
 * Loopback Anvil and relay only; published development wallets, temporary messaging keys and encrypted in-memory storage.
 * No default app wiring, live trust root, external relay/privacy claim or production funds. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { RegistryService, TERMS_REVIEW_FORMAT, checkFundingWindow, encodePrivateAgreement, encodeCapabilities, reviewTermsBytes } from '../packages/domain/index.ts';
import { evmTermsHash, keccak256, verifyEoaAcceptance } from '../packages/wallet/src/evm-terms.ts';
import { buildGetTrade, buildTradeIdOf, decodeTrade, tradeMatchesTerms } from '../packages/wallet/src/evm-escrow.ts';
import { createEip1193ChainReader, escrowCallFor } from '../packages/wallet/src/evm-submit.ts';
import { createLifecycleJournal } from '../packages/domain/src/intent-journal.ts';
import { createEvmTxLifecycle, evmFinalityPolicy } from '../packages/domain/src/tx-lifecycle.ts';
import { createLocalNobleNostrProvider } from '../packages/nostr-crypto/index.ts';
import { createRelayPool, createAdEvent, createOrderBook, AD_KIND } from '../packages/relay/index.ts';
import { matchesFilters } from '../packages/relay/src/nip01.ts';
import { createRelayEventCrypto, createTermsExchange, adBookKey } from '../packages/exchange/index.ts';
import { EncryptedVaultService, EncryptedBackupService } from '../packages/storage/index.ts';
import { VaultStorageError } from '../packages/storage/src/idb-vault-store.ts';
import { decodeIntentPayload } from '../packages/schemas/index.ts';
import { rpcClient, checkToolchain, forgeEnv, TOOLCHAIN } from './sepolia/lib.mjs';
import { startFakeRelay } from '../packages/relay/test/support/fake-relay.mjs';
import { makeBroker, FAST, until } from '../packages/relay/test/support/harness.mjs';

const EVM_DIR = fileURLToPath(new URL('../contracts/evm/', import.meta.url));
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const ENV = { ...process.env, PATH: `${FOUNDRY}:${process.env.PATH ?? ''}`, FOUNDRY_OFFLINE: 'true' };
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const run = promisify(execFile), utf8 = new TextEncoder();
const ZERO = `0x${'0'.repeat(40)}`, PASS = 'public synthetic canonical exchange journey passphrase';
const KEYS = [ // Anvil's documented public development keys, never credentials or real funds.
  'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
];
const hex = bytes => Buffer.from(bytes).toString('hex'), bytes = text => Uint8Array.from(Buffer.from(text, 'hex'));
const sha = value => createHash('sha256').update(value).digest('hex');
const val = (result, label='operation') => { assert.equal(result.ok, true, `${label}: ${JSON.stringify(result)}`); return result.value; };
const fail = (result, code) => { assert.equal(result.ok, false); assert.equal(result.code ?? result.error?.code, code); };
const addresses = KEYS.map(key => `0x${hex(keccak256(secp256k1.getPublicKey(bytes(key), false).subarray(1)).subarray(12))}`);
const sign = (key, digest) => { const sig = secp256k1.sign(bytes(digest), bytes(key), {prehash:false,format:'recovered',lowS:true}); return Uint8Array.from([...sig.subarray(1),sig[0]+27]); };
const policy = evmFinalityPolicy({chain:'evm',finality:{kind:'evm-finalized-tag'}}, 2, 3);
const bindingOf = tradeId => ({chain:'evm',networkId:'local-evm',deploymentId:'escrow-local-v1',tradeId});
const rows = new Map();
const store = {
  get: async id => structuredClone(rows.get(id)),
  add: async (row, opts) => { opts?.assertCurrent?.(); if(rows.has(row.profileId))throw new VaultStorageError('ALREADY_EXISTS'); rows.set(row.profileId,structuredClone(row)); },
  compareAndSwap: async (expected,next,opts) => { opts?.assertCurrent?.(); if(opts?.signal?.aborted)throw new VaultStorageError('CANCELLED'); if(JSON.stringify(rows.get(expected.profileId))!==JSON.stringify(expected))throw new VaultStorageError('CONFLICT'); rows.set(next.profileId,structuredClone(next)); },
  listProfileIds: async()=>({profileIds:[...rows.keys()],truncated:false}), subscribeInvalidation:()=>()=>{},
};
const allowed = new Map(), parties = [], pools = [], brokers = [], clients = new Set(), results=[];
let anvil, relay, rpc, escrow, clock=0, sends=0, markers=0;
const pass = name => { results.push(name); console.log(`ok - ${name}`); };
const freePort = () => new Promise((done,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):done(port));});});
const mine = (count=1) => rpc('anvil_mine',[`0x${count.toString(16)}`]);
const now = async()=>Number(BigInt((await rpc('eth_getBlockByNumber',['latest',false])).timestamp));
const trade = async id => decodeTrade(await rpc('eth_call',[{to:escrow,data:buildGetTrade(escrow,id).data},'latest']));
const callKey = (binding,action) => `${binding.tradeId}:${action}`;
const good = () => ({ok:true,value:undefined});
async function validateCanonical(intent) {
  try {
    const expected=allowed.get(callKey(intent.binding,intent.action)), request=JSON.parse(intent.preparedRequest);
    assert.ok(expected,'communication acceptance must precede canonical preparation');
    assert.equal(intent.binding.chain,'evm');assert.equal(intent.binding.networkId,'local-evm');assert.equal(intent.binding.deploymentId,'escrow-local-v1');
    assert.equal(intent.account,expected.account);assert.equal(intent.expectedEscrowState,expected.state);
    assert.equal(request.chainId,'31337');assert.equal(request.from,expected.account);
    for(const field of ['to','data','value'])assert.equal(request[field],expected.call[field],`exact accepted ${field}`);
    // Fresh chain time is spending preflight, independent of static byte review. The journal invokes this
    // on both reservation and the durable send marker. A later expired acceptance cannot revoke funded state.
    if(intent.action==='fund'&&intent.state==='prepared'){
      try { checkFundingWindow(expected.terms.acceptBeforeSeconds,expected.terms.escrowExpirySeconds,String(await now())); }
      catch(error){ return {ok:false,error:{code:error.code}}; }
    }
    return good();
  } catch { return {ok:false,error:{code:'INTEGRITY_FAILURE'}}; }
}
async function client(profileId, {loseNextResponse=false}={}) {
  const vault=new EncryptedVaultService(store,crypto,{lifecycle:false});
  const session=profileId?val(await vault.unlock(profileId,PASS),'unlock journal'):val(await vault.create(PASS),'create journal');
  const journal=createLifecycleJournal({vault,session,validateCanonical});
  const request=({method,params})=>rpc(method,params??[]);
  const reader=createEip1193ChainReader({request,escrow});
  const self={vault,session,journal,life:null,loseNextResponse,close(){self.life.dispose();journal.dispose();vault.dispose();clients.delete(self);}};
  const wallet=async args=>{
    if(args.method==='eth_sendTransaction'){
      // Inspect the actual encrypted-vault consumer before touching the native wallet boundary.
      const records=val(await vault.list(session.sessionId,'journal'),'pre-send records').map(record=>decodeIntentPayload(record.payload));
      const unknown=records.filter(intent=>intent.state==='broadcast-unknown' && JSON.parse(intent.preparedRequest).data===args.params[0].data);
      assert.equal(unknown.length,1,'durable send marker exists before exactly one wallet call');markers++;sends++;
      const hash=await request(args);
      if(self.loseNextResponse){self.loseNextResponse=false;throw new Error('Synthetic lost wallet response after broadcast');}
      return hash;
    }
    return request(args);
  };
  self.life=createEvmTxLifecycle({journal,reader,wallet,policy});
  await self.life.walletChanged({account:addresses[0],chainId:'31337',generation:1});
  clients.add(self);return self;
}
async function reconcileFinal(self,intentId){
  for(let blocks=0;blocks<=12;blocks++){
    const found=val(await self.life.reconcile(intentId),'native reconcile');
    if(found.outcome==='finalized')return found;
    assert.ok(['pending','confirmed'].includes(found.outcome),`unexpected ${found.outcome}`);await mine();
  }
  assert.fail('local finality did not arrive within bounded mining');
}
function asTerms(r){return{orderId:r.orderId,revision:r.revision,networkId:r.network.id,deploymentId:r.deployment.id,seller:r.seller,buyer:r.buyer,assetKind:r.asset.kind,asset:r.asset.address??ZERO,amountBaseUnits:r.amountBaseUnits,privateAgreementHash:r.privateAgreementSha256,capabilitiesHash:r.capabilitiesSha256,sellerNonce:r.sellerNonce,acceptBeforeSeconds:r.acceptBeforeSeconds,escrowExpirySeconds:r.escrowExpirySeconds};}
async function pull(pool,who,kind=1059){
  const got=[];let eose=false;
  const filters=kind===1059?[{kinds:[1059],'#p':[who.pub],since:clock-250000,limit:50}]:[{kinds:[AD_KIND],'#t':['p2p-offramp-ad-v1'],since:clock-3600,limit:50}];
  const sub=val(pool.subscribe(filters,{onEvent:event=>got.push(event),onEose:()=>{eose=true;}}),'relay subscription');
  try{await until(()=>eose,5000);return got;}finally{sub.close();}
}
async function deliver(message,pool,recipient,recipientPool){
  val(await pool.publish(message.recipientWrap),'publish encrypted message');
  const wraps=await pull(recipientPool,recipient);
  const exact=wraps.find(wrap=>wrap.id===message.recipientWrap.id);assert.ok(exact,'recipient receives exact published wrap');
  return val(await recipient.exchange.receive(exact,recipient.secret),'receive encrypted message');
}

try{
  await checkToolchain(ENV);
  const anvilVersion=(await run(ANVIL,['--version'],{env:forgeEnv(ENV),timeout:5000,maxBuffer:16384})).stdout;
  assert.equal(/anvil Version: (\S+)/.exec(anvilVersion)?.[1],TOOLCHAIN.forgeVersion);
  assert.equal(/Commit SHA: ([0-9a-f]{40})/.exec(anvilVersion)?.[1],TOOLCHAIN.forgeCommit);
  const port=await freePort(),url=`http://127.0.0.1:${port}`;rpc=rpcClient(url,{timeoutMs:5000});
  anvil=spawn(ANVIL,['--host','127.0.0.1','--port',String(port),'--silent','--chain-id','31337','--slots-in-an-epoch','1'],{env:forgeEnv(ENV),stdio:'ignore'});
  let spawnError;anvil.once('error',error=>{spawnError=error;});
  for(let attempt=0;;attempt++){try{await rpc('eth_chainId');break;}catch{if(spawnError||anvil.exitCode!==null||attempt>=100)throw new Error('Local Anvil startup failed');await new Promise(done=>setTimeout(done,50));}}
  assert.equal(BigInt(await rpc('eth_chainId')),31337n);
  const {stdout}=await run('forge',['create','src/BasicEscrow.sol:BasicEscrow','--rpc-url',url,'--private-key',`0x${KEYS[0]}`,'--broadcast','--json','--constructor-args','[]'],{cwd:EVM_DIR,env:forgeEnv(ENV),maxBuffer:1<<20,timeout:30000});
  escrow=JSON.parse(stdout.slice(stdout.indexOf('{'))).deployedTo.toLowerCase();clock=await now();
  const registryInput=JSON.parse(await readFile(new URL('../packages/domain/test/fixtures/local-evm-scenario/registry.json',import.meta.url)));
  const network=registryInput.networks[0];network.genesisHash=(await rpc('eth_getBlockByNumber',['0x0',false])).hash;network.assets=network.assets.filter(asset=>asset.kind==='native');
  network.endpoints=[{id:'local-node',url:url+'/'}];
  const artifact=JSON.parse(await readFile(new URL('../contracts/evm/out/BasicEscrow.sol/BasicEscrow.json',import.meta.url)));
  network.deployments=[{...network.deployments[0],address:escrow,artifactSha256:sha(Buffer.from(artifact.bytecode.object.replace(/^0x/,''),'hex')),runtime:{kind:'evm-code',keccak256:hex(keccak256(bytes((await rpc('eth_getCode',[escrow,'latest'])).slice(2)))),upgradeable:false},supportedAssetIds:['native']}];
  const registry=new RegistryService(),registryBytes=utf8.encode(JSON.stringify(registryInput));val(await registry.load(registryBytes,sha(registryBytes)),'local registry');
  relay=await startFakeRelay({onMessage(conn,message,fixture){
    if(message[0]!=='REQ')return false;
    // The generic adversarial fixture broadcasts every stored event. This acceptance relay obeys NIP-01 filters.
    conn.subs.set(message[1],message.slice(2));
    for(const event of fixture.events)if(matchesFilters(event,message.slice(2)))conn.send(JSON.stringify(['EVENT',message[1],event]));
    conn.send(JSON.stringify(['EOSE',message[1]]));return true;
  }});const provider=createLocalNobleNostrProvider(),domain={chainId:'31337',verifyingContract:escrow};
  for(let i=0;i<2;i++){
    const key=await provider.generate(),eventCrypto=await createRelayEventCrypto(provider,key.secretKey);
    const book=createOrderBook({nowSeconds:()=>clock,verifier:eventCrypto});
    const exchange=createTermsExchange({provider,selfPublicKey:key.publicKey,ads:book,registry,hashTerms:reviewed=>evmTermsHash(domain,asTerms(reviewed)),now:()=>clock});
    const broker=makeBroker({coverage:'direct',mode:'ordinary'}).broker;brokers.push(broker);
    const pool=createRelayPool({broker,relays:[{endpointId:'relay-a',url:relay.wsUrl}],verifier:eventCrypto,timing:FAST,nowSeconds:()=>clock});pools.push(pool);
    parties.push({secret:key.secretKey,pub:key.publicKey,eventCrypto,book,exchange,pool});
  }
  pass('canonical escrow and both real-crypto exchange parties use loopback-only chain/relay fixtures');
  const [seller,buyer]=parties,amount=10n**15n;
  let self=await client();
  const cases=[
    {terminal:'release',duration:7200,acceptFor:600},
    {terminal:'refund',duration:7200,acceptFor:600},
    {terminal:'expired',duration:7200,acceptFor:600,deny:'EXPIRED'},
    {terminal:'too-short',duration:1801,acceptFor:600,deny:'INVALID_INPUT'},
    {terminal:'too-long',duration:604801,acceptFor:600,deny:'INVALID_INPUT'},
  ];
  for(const [index,scenario] of cases.entries()){
    const {terminal}=scenario;
    clock=await now();
    const orderId=sha(`canonical-exchange-order-${index}`),agreement={v:1,orderId,revision:'1',fiatCurrency:'USD',fiatMinorUnits:'100',fiatScale:2,paymentInstructions:'SYNTHETIC private manual payment note. No fiat is sent.',capabilities:[],agreementSalt:sha(`salt-${index}`)};
    const terms={orderId,revision:'1',networkId:'local-evm',deploymentId:'escrow-local-v1',seller:addresses[0],buyer:addresses[1],assetKind:'native',asset:ZERO,amountBaseUnits:String(amount),privateAgreementHash:sha(encodePrivateAgreement(agreement)),capabilitiesHash:sha(encodeCapabilities([])),sellerNonce:sha(`canonical-exchange-nonce-${index}`),acceptBeforeSeconds:String(clock+scenario.acceptFor),escrowExpirySeconds:String(clock+scenario.duration)};
    const document=utf8.encode(JSON.stringify({format:TERMS_REVIEW_FORMAT,terms,privateAgreement:agreement}));
    const reviewed=val(await reviewTermsBytes(registry,document),'independent local review'),tradeId=evmTermsHash(domain,asTerms(reviewed)),binding=bindingOf(tradeId);
    const initialFund=escrowCallFor({action:'fund',domain,terms});
    const initialInput={binding,action:'fund',expectedEscrowState:initialFund.expectedEscrowState,call:initialFund.call};
    // The strict composition gate has not been populated by a mutual, exact-byte acceptance yet.
    assert.equal((await self.life.prepare(initialInput)).ok,false);assert.equal((await trade(tradeId)).state,'absent');
    const ad=await createAdEvent(seller.eventCrypto,{app:'p2p-offramp',v:1,orderId,revision:1,networkId:'eip155:31337',assetId:'native',amountMin:String(amount),amountMax:String(amount),currency:'USD',railClass:'bank-transfer',expiresAtSeconds:String(clock+1800),maker:seller.pub},clock);
    assert.equal(seller.book.ingest(ad),'accepted');val(await seller.pool.publish(ad),'publish advertisement');
    const ads=await pull(buyer.pool,buyer,AD_KIND);assert.equal(buyer.book.ingest(ads.find(event=>event.id===ad.id)),'accepted');
    const take=val(await buyer.exchange.take(adBookKey(seller.pub,orderId),addresses[1],buyer.secret),'take');
    assert.equal((await deliver(take,buyer.pool,seller,seller.pool)).state,'taken');
    const offered=val(await seller.exchange.offer(take.sessionId,document,seller.secret),'offer');
    const got=await deliver(offered,seller.pool,buyer,buyer.pool);assert.equal(got.state,'offered');assert.equal(got.termsHash,tradeId);
    const changed=utf8.encode(new TextDecoder().decode(document)+' '); // Same semantic JSON, different reviewed bytes.
    fail(await buyer.exchange.accept(take.sessionId,changed,buyer.secret),'TERMS_MISMATCH');
    const acceptedBytes=buyer.exchange.session(take.sessionId).terms.bytes;
    assert.deepEqual(acceptedBytes,document);
    const acceptance=val(await buyer.exchange.accept(take.sessionId,acceptedBytes,buyer.secret),'accept');
    const received=await deliver(acceptance,buyer.pool,seller,seller.pool);assert.equal(received.state,'accepted');assert.equal(received.termsHash,tradeId);
    assert.deepEqual(seller.exchange.session(take.sessionId).terms.bytes,acceptedBytes);
    fail(await seller.exchange.receive(acceptance.recipientWrap,seller.secret),'DUPLICATE');
    assert.equal((await trade(tradeId)).state,'absent','negotiation alone never funds escrow');
    // This gate is populated only from the exact bytes both exchange peers stored after review/acceptance.
    const detached=val(await reviewTermsBytes(registry,acceptedBytes),'accepted bytes re-review');
    const acceptedTerms=asTerms(detached),acceptedDomain={chainId:detached.network.chainId,verifyingContract:detached.deployment.address};
    const acceptedId=evmTermsHash(acceptedDomain,acceptedTerms);assert.equal(acceptedId,tradeId);
    const fund=escrowCallFor({action:'fund',domain:acceptedDomain,terms:acceptedTerms});assert.deepEqual(fund,initialFund);
    const input={binding:bindingOf(acceptedId),action:'fund',expectedEscrowState:fund.expectedEscrowState,call:fund.call};
    const onchainHash=await rpc('eth_call',[{to:escrow,data:buildTradeIdOf(acceptedDomain,acceptedTerms).data},'latest']);assert.equal(onchainHash,`0x${acceptedId}`);
    for(const [i,key] of KEYS.entries())assert.equal(verifyEoaAcceptance(acceptedDomain,acceptedTerms,i===0?'seller':'buyer',sign(key,acceptedId)),true);
    allowed.set(callKey(binding,'fund'),{call:fund.call,state:'absent',account:addresses[0],terms:acceptedTerms});
    const alteredCall={...input,call:{...fund.call,value:String(amount+1n)}};assert.equal((await self.life.prepare(alteredCall)).ok,false);
    if(scenario.deny){
      const before=sends,negative=await client();
      try {
        if(terminal!=='too-long'){
          const prepared=val(await negative.life.prepare(input),'prepare while chain window is valid');
          const nextTime=terminal==='expired'?Number(acceptedTerms.acceptBeforeSeconds):Number(acceptedTerms.escrowExpirySeconds)-1799;
          await rpc('evm_setNextBlockTimestamp',[nextTime]);await mine();clock=await now();
          fail(await negative.life.submit(prepared),scenario.deny); // The marker preflight reads time again.
        }
        fail(await negative.life.prepare(input),scenario.deny); // Reservation also reads current chain time.
        assert.equal(sends,before,'unfundable reviewed terms never call the wallet send method');
        assert.equal((await trade(tradeId)).state,'absent');
        assert.equal(BigInt(await rpc('eth_getBalance',[escrow,'latest'])),0n);
      } finally { negative.close(); }
      acceptedBytes.fill(0);document.fill(0);changed.fill(0);
      pass(`accepted reviewed terms refuse ${terminal} chain-time funding without a wallet send`);
      continue;
    }
    const nonceBefore=BigInt(await rpc('eth_getTransactionCount',[addresses[0],'latest'])),before=sends;
    const prepared=val(await self.life.prepare(input),'prepare accepted fund');self.loseNextResponse=index===0;
    const sent=await self.life.submit(prepared);
    if(index===0){fail(sent,'BROADCAST_UNKNOWN');assert.equal(sends,before+1);assert.equal((await self.life.submit(prepared)).ok,false);assert.equal(sends,before+1);
      const backup=new EncryptedBackupService(store);try{
        const exported=await backup.exportWithStatus(self.session.profileId),restored=await backup.restore(exported.bytes,PASS,PASS);assert.notEqual(restored.newProfileId,self.session.profileId);
        assert.notEqual(restored.newKeyId,rows.get(self.session.profileId).keyId,'restore creates a fresh encryption key identity');
        const sourceId=self.session.profileId;self.close();self=await client(restored.newProfileId);
        assert.ok(rows.has(sourceId),'fresh-key recovery retains source');
        const recovered=val(await self.life.recover(),'restored journal');assert.ok(recovered.some(intent=>intent.intentId===prepared.intentId));
      }finally{backup.dispose();}
    }else val(sent,'send accepted fund');
    const funded=await reconcileFinal(self,prepared.intentId);assert.equal(funded.escrowState,'funded');
    assert.equal(BigInt(await rpc('eth_getTransactionCount',[addresses[0],'latest'])),nonceBefore+1n,'unknown recovery never resends');
    assert.equal(tradeMatchesTerms(await trade(tradeId),acceptedTerms),true);
    fail(await buyer.exchange.cancel(take.sessionId,'withdrawn',buyer.secret),'OUT_OF_ORDER');
    const buyerBefore=BigInt(await rpc('eth_getBalance',[addresses[1],'latest']));
    const sellerBefore=BigInt(await rpc('eth_getBalance',[addresses[0],'latest']));
    assert.equal(BigInt(await rpc('eth_getBalance',[escrow,'latest'])),amount,'escrow holds exactly the funded principal');
    if(terminal==='refund'){await rpc('evm_setNextBlockTimestamp',[Number(terms.escrowExpirySeconds)]);await mine();clock=await now();}
    const action=escrowCallFor({action:terminal,escrow,tradeId});allowed.set(callKey(binding,terminal),{call:action.call,state:'funded',account:addresses[0]});
    const terminalPrepared=val(await self.life.prepare({binding,action:terminal,expectedEscrowState:'funded',call:action.call}),'prepare terminal');
    const terminalSent=val(await self.life.submit(terminalPrepared),'send terminal');
    const done=await reconcileFinal(self,terminalPrepared.intentId);assert.equal(done.escrowState,terminal==='release'?'released':'refunded');
    assert.equal(BigInt(await rpc('eth_getBalance',[addresses[1],'latest'])),buyerBefore+(terminal==='release'?amount:0n));
    const receipt=await rpc('eth_getTransactionReceipt',[terminalSent.hash]);
    const fee=BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice);
    assert.equal(BigInt(await rpc('eth_getBalance',[addresses[0],'latest'])),sellerBefore-fee+(terminal==='refund'?amount:0n),'refund principal reaches the bound seller after its actual gas fee');
    assert.equal(BigInt(await rpc('eth_getBalance',[escrow,'latest'])),0n,'settlement leaves no principal in escrow');
    assert.equal((await self.life.prepare(input)).ok,false,'settled trade cannot fund twice');
    acceptedBytes.fill(0);document.fill(0);changed.fill(0);
    pass(`encrypted canonical exchange -> exact reviewed acceptance -> G12 fund -> native ${terminal}${index===0?' with lost-response/fresh-key native recovery':''}`);
  }
  const wire=JSON.stringify(relay.events);
  for(const privateText of ['SYNTHETIC private manual payment note',addresses[0],addresses[1],'terms-accept','sellerNonce'])assert.equal(wire.includes(privateText),false,'relay sees ciphertext/public advertisement only');
  assert.equal(sends,4);assert.equal(markers,sends);
  pass('altered bytes, replay, pre-accept preparation, changed call value and repeat funding are refused; every send had a durable marker');
  console.log(JSON.stringify({fixture:'canonical-exchange-native-escrow-loopback',checks:results.length,negotiatedOrders:cases.length,settledOrders:2,submissions:sends,durableMarkers:markers,realNostrCrypto:true,canonicalRelay:true,canonicalLifecycle:true,canonicalEscrow:true,exactReviewedBytes:true,unknownFreshKeyRecovery:true,freshFundingWindow:true,externalNetwork:false,tradingEnabled:false,releaseAcceptance:false}));
} finally {
  for(const self of [...clients])self.close();
  for(const party of parties){party.exchange.close();party.eventCrypto.dispose();party.secret.fill(0);}
  pools.forEach(pool=>pool.close());brokers.forEach(broker=>broker.dispose());
  try { await relay?.stop(); }
  finally {
    if(anvil?.pid&&anvil.exitCode===null&&anvil.signalCode===null){const stopped=new Promise(done=>anvil.once('exit',done));anvil.kill('SIGTERM');const timer=setTimeout(()=>anvil.kill('SIGKILL'),1000);timer.unref();await stopped;clearTimeout(timer);}
  }
}
