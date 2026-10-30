// Reviewer-only lifecycle harness. Actual exchange/message/state-machine source;
// deterministic crypto and review providers. NOT cryptographic qualification.
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const self = 'a'.repeat(64), seller = 'b'.repeat(64), order = 'c'.repeat(64);
const addressA = `0x${'1'.repeat(40)}`, addressB = `0x${'2'.repeat(40)}`;
const hash = 'd'.repeat(64);
let sequence = 0, reviewGate = null;
const reviewed = { orderId: order, buyer: addressA, amountBaseUnits: '10', acceptBeforeSeconds: '150', revision: '1' };
globalThis.__p2pReviewFixture = {
  review: async () => { if (reviewGate) await reviewGate; return { ok: true, value: reviewed }; },
  unsigned: (pubkey, fields) => ({ ...fields, pubkey, id: (++sequence).toString(16).padStart(64, '0') }),
};
const cryptoStub = `
export const KIND_PRIVATE_DIRECT_MESSAGE=14, MAX_RUMOR_JSON_BYTES=65536;
export const createUnsignedEvent=(...args)=>globalThis.__p2pReviewFixture.unsigned(...args);
export const createSeal=async rumor=>rumor;
export const createGiftWrap=async rumor=>({id:rumor.id,rumor});
export const unwrapGiftWrap=async wrap=>wrap;
export const parseEventJson=text=>JSON.parse(text);
`;
const domainStub = `export const reviewTermsBytes=(...args)=>globalThis.__p2pReviewFixture.review(...args);`;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '../../nostr-crypto/index.ts') return { url: `data:text/javascript,${encodeURIComponent(cryptoStub)}`, shortCircuit: true };
  if (specifier === '../../domain/index.ts') return { url: `data:text/javascript,${encodeURIComponent(domainStub)}`, shortCircuit: true };
  return next(specifier, context);
} });
const source = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'packages/exchange/src/exchange.ts');
const { createTermsExchange } = await import(pathToFileURL(source).href);
const { adAddress, encodeEnvelope, envelopeTags } = await import(pathToFileURL(resolve(dirname(source), 'messages.ts')).href);
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(adExpiry = 1000, maxSeenMessages = 1024) {
  let now = 100, gate = null, entered = null;
  const ex = createTermsExchange({ selfPublicKey: self,
    provider: { publicKey: async () => { entered?.resolve(); if (gate) await gate; return self; } },
    registry: {}, hashTerms: () => hash, now: () => now, maxSeenMessages,
    ads: { revalidate: () => ({ ok: true, ad: { author: seller,
      ad: { maker: seller, orderId: order, expiresAtSeconds: String(adExpiry), amountMin: '1', amountMax: '100' } } }) },
  });
  return { ex, setNow: value => { now = value; }, pause() { const d = deferred(); entered = deferred(); gate = d.promise; return { entered: entered.promise, resume: () => { gate = null; d.resolve(); } }; } };
}
const secret = new Uint8Array(32);
const termsBytes = new TextEncoder().encode('{}');
function offerWrap() {
  const env = { v: 1, type: 'terms-offer', ad: adAddress(seller, order), orderId: order,
    sender: seller, recipient: self, nonce: 'e'.repeat(64), expiresAtSeconds: '900', termsHash: hash, body: { terms: '{}' } };
  return { rumor: { kind: 14, pubkey: seller, id: (++sequence).toString(16).padStart(64, '0'),
    created_at: 100, tags: envelopeTags(env), content: encodeEnvelope(env) } };
}

async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer=setTimeout(() => reject(new Error('fixture timeout')), 2000); })]); }
  finally { clearTimeout(timer); }
}
const observations=[];
for (const endState of ['cancelled','accepted']) {
  let holdNext=true;
  const gate=deferred(), entered=deferred();
  const ex=createTermsExchange({selfPublicKey:self,
    provider:{publicKey:async()=>{if(holdNext){holdNext=false;entered.resolve();await gate.promise;}return self;}},
    registry:{},hashTerms:()=>hash,now:()=>100,
    ads:{revalidate:()=>({ok:true,ad:{author:seller,ad:{maker:seller,orderId:order,expiresAtSeconds:'1000',amountMin:'1',amountMax:'100'}}})}
  });
  const late=ex.take('fixture',addressA,secret);
  await bounded(entered.promise);
  const newer=await bounded(ex.take('fixture',addressB,secret));assert.equal(newer.ok,true);
  if(endState==='cancelled') assert.equal((await bounded(ex.cancel(newer.value.sessionId,'withdrawn',secret))).ok,true);
  else {
    reviewed.buyer=addressB;
    assert.equal((await bounded(ex.receive(offerWrap(),secret))).ok,true);
    assert.equal((await bounded(ex.accept(newer.value.sessionId,termsBytes,secret))).ok,true);
  }
  const before=ex.session(newer.value.sessionId);
  gate.resolve();
  const result=await bounded(late);
  const after=ex.session(newer.value.sessionId);
  observations.push({before:before.state,beforeBuyer:before.buyerAddress,lateResult:result.ok?'SUCCESS':result.code,after:after.state,afterBuyer:after.buyerAddress});
  ex.close();reviewed.buyer=addressA;
}
console.log(JSON.stringify({qualification:'actual exchange source; mocked crypto/review; no funding operation',observations},null,2));
if (process.argv.includes('--assert-safe')) {
  for (const row of observations) { assert.equal(row.lateResult, 'OUT_OF_ORDER'); assert.equal(row.after, row.before); assert.equal(row.afterBuyer, row.beforeBuyer); }
}
hooks.deregister();
