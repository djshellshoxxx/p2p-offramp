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
const observations = [];
{
  const f = setup(150), pause = f.pause();
  const pending = f.ex.take('fixture', addressA, secret);
  await pause.entered; f.setNow(200); pause.resume();
  const result = await pending;
  observations.push({ case: 'take-crosses-ad-expiry', result: result.ok ? 'SUCCESS_AFTER_EXPIRY' : result.code, sessionCount: f.ex.sessionCount });
  f.ex.close();
}
{
  const f = setup();
  const take = await f.ex.take('fixture', addressA, secret); assert.equal(take.ok, true);
  assert.equal((await f.ex.receive(offerWrap(), secret)).ok, true);
  const pause = f.pause();
  const pending = f.ex.accept(take.value.sessionId, termsBytes, secret);
  await pause.entered; f.setNow(200); pause.resume();
  const result = await pending;
  observations.push({ case: 'accept-crosses-terms-deadline', result: result.ok ? 'ACCEPTED_AFTER_DEADLINE' : result.code, state: f.ex.session(take.value.sessionId)?.state });
  f.ex.close();
}
{
  const f = setup();
  const take = await f.ex.take('fixture', addressA, secret); assert.equal(take.ok, true);
  const review = deferred(); reviewGate = review.promise;
  const pending = f.ex.receive(offerWrap(), secret);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.ex.cancel(take.value.sessionId, 'withdrawn', secret)).ok, true);
  const replacement = await f.ex.take('fixture', addressB, secret); assert.equal(replacement.ok, true);
  reviewGate = null; review.resolve();
  const result = await pending, current = f.ex.session(take.value.sessionId);
  observations.push({ case: 'review-crosses-session-replacement', result: result.ok ? 'OFFER_APPLIED_TO_REPLACEMENT' : result.code,
    buyerAddress: current?.buyerAddress, reviewedBuyer: current?.terms?.reviewed.buyer, state: current?.state });
  f.ex.close();
}
{
  const f = setup(1000, 1); let sent = 0;
  for (let i = 0; i < 10; i++) {
    const take = await f.ex.take('fixture', addressA, secret); if (!take.ok) break; sent++;
    const cancel = await f.ex.cancel(take.value.sessionId, 'withdrawn', secret); if (!cancel.ok) break; sent++;
  }
  observations.push({ case: 'outgoing-replay-budget', configuredMaxSeenMessages: 1, successfulDistinctMessages: sent });
  f.ex.close();
}
console.log(JSON.stringify({ source, qualification: 'isolated lifecycle only; mocked crypto/review', observations }, null, 2));
hooks.deregister();
if (process.argv.includes('--assert-safe')) {
  const contracts = [
    observations[0].result === 'AD_EXPIRED',
    observations[1].result === 'EXPIRED' && observations[1].state === 'offered',
    observations[2].result === 'OUT_OF_ORDER' && observations[2].reviewedBuyer === undefined && observations[2].state === 'taken',
    observations[3].successfulDistinctMessages <= observations[3].configuredMaxSeenMessages,
  ];
  assert.deepEqual(contracts, [true, true, true, true], 'expiry, generation, and replay capacity contracts');
}
