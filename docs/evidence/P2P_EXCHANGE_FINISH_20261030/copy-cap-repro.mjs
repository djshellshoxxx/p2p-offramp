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

const ex = createTermsExchange({ selfPublicKey: self, provider: {publicKey: async()=>self},
 registry:{}, hashTerms:()=>hash, now:()=>100,
 ads:{revalidate:()=>({ok:true,ad:{author:self,ad:{maker:self,orderId:order,expiresAtSeconds:'1000',amountMin:'1',amountMax:'100'}}})}
});
const env={v:1,type:'take-request',ad:adAddress(self,order),orderId:order,sender:seller,recipient:self,
 nonce:'e'.repeat(64),expiresAtSeconds:'900',termsHash:null,body:{buyerAddress:addressA,buyerMessagingKey:seller}};
const incoming={rumor:{kind:14,pubkey:seller,id:(++sequence).toString(16).padStart(64,'0'),created_at:100,tags:envelopeTags(env),content:encodeEnvelope(env)}};
const taken=await ex.receive(incoming,secret);assert.equal(taken.ok,true);
const Native=Uint8Array,input=new Native(1024*1024);let copies=0,copiedBytes=0;
globalThis.Uint8Array=new Proxy(Native,{construct(target,args){if(args[0] instanceof Native && args[0].byteLength>16384){copies++;copiedBytes+=args[0].byteLength;}return Reflect.construct(target,args,target);}});
try {
 const result=await ex.offer(taken.value.sessionId,input,secret);
 console.log(JSON.stringify({qualification:'actual exchange source; mocked crypto/review; no network',result,inputBytes:input.byteLength,copies,copiedBytes,state:ex.session(taken.value.sessionId).state},null,2));
 assert.equal(result.ok,false);assert.equal(result.code,'LIMIT_EXCEEDED');assert.equal(copies, process.argv.includes('--assert-safe') ? 0 : 1);
} finally {globalThis.Uint8Array=Native;ex.close();hooks.deregister();}
