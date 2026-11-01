import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyProjection } from '../src/journey-view.ts';
import { createTradeAuthority } from '../src/authority.ts';
import { createTradeComposition } from '../src/trade-composition.ts';
const binding = Object.freeze({ chain:'evm', networkId:'local', deploymentId:'escrow-original', tradeId:'trade-original' });
const chain = (overrides={}) => ({ binding, generation:0, requestSequence:1, anchor:{height:'10',hash:'canonical-fixture'},state:'released',finality:'finalized',observedAt:1000,...overrides });
const snapshot = (overrides={}) => ({binding,chain:chain(),chainHealth:'fresh',pendingIntentIds:[],fiatClaim:'none',walletGeneration:0,economicPreparationAllowed:false,...overrides});
const ok = value => ({ok:true,value});
const value = result => {assert.equal(result.ok,true,JSON.stringify(result));return result.value;};
const fixture = source => createJourneyProjection({composition:{read:async()=>ok(source)}});
const deferred = () => {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function assertClosed(projection) {
  const view=projection.kind==='resolved'?projection.view:projection;
  assert.deepEqual(view.actions,[]);assert.equal(view.economicPreparationAllowed,false);assert.equal(view.recoveryAvailable,true);
  assert.deepEqual(view.binding,binding);assert.ok(Object.isFrozen(view));assert.ok(Object.isFrozen(view.binding));assert.ok(Object.isFrozen(view.actions));
}
test('only fresh finalized released/refunded observations produce a receipt, with detached original binding',async()=>{
  for(const state of ['released','refunded']) {
    const source=snapshot({chain:chain({state})}), service=fixture(source), output=value(await service.read());
    assert.equal(output.kind,'resolved');assert.equal(output.view.step,'receipt');assert.equal(output.view.authority,'chain-finalized');assertClosed(output);
    assert.notEqual(output.view.binding,source.binding);service.dispose();
  }
});
test('unknown prerequisites, provisional terminal state and every stale/reorg/loading condition stay blocked',async()=>{
  for(const state of ['absent','funded']) {
    const output=value(await fixture(snapshot({chain:chain({state})})).read());assert.equal(output.kind,'blocked');assert.equal(output.step,null);assert.equal(output.blockingReason,'journey-prerequisites-unavailable');assertClosed(output);
  }
  for(const finality of ['pending','confirmed']) {
    const output=value(await fixture(snapshot({chain:chain({finality})})).read());assert.equal(output.kind,'blocked');assert.equal(output.blockingReason,'finality-required');assert.equal(output.authority,'chain-provisional');assertClosed(output);
  }
  for(const chainHealth of ['loading','stale','unavailable','reorged']) {
    const output=value(await fixture(snapshot({chainHealth})).read());assert.equal(output.kind,'blocked');assert.equal(output.blockingReason,`chain-${chainHealth}`);assert.equal(output.authority,'local');assertClosed(output);
  }
  assert.equal(value(await fixture(snapshot({chain:null})).read()).kind,'blocked');
});
test('journal IDs and chat/fiat assertions never become payment, funding uncertainty or spending authority',async()=>{
  for(const fiatClaim of ['none','buyer-claims-paid','seller-attests-received']) {
    for(const state of ['absent','funded','released','refunded']) {
      const output=value(await fixture(snapshot({chain:chain({state}),fiatClaim,pendingIntentIds:['PRIVATE_JOURNAL_ID']})).read());
      assert.equal(output.kind,'blocked');assert.equal(output.step,null);assert.equal(output.blockingReason,'reconcile-required');assertClosed(output);
      assert.doesNotMatch(JSON.stringify(output),/PRIVATE_JOURNAL_ID|claims-paid|attests-received/);
    }
  }
});
test('real composition owns freshness, wallet generations and unresolved journal veto',async t=>{
  let ids=[];
  const authority=createTradeAuthority({binding,generation:0,walletGeneration:0,readValidated:async(_binding,request)=>ok(chain({generation:request.generation,requestSequence:request.requestSequence}))});
  const composition=createTradeComposition({binding,account:'0x'+'33'.repeat(20),authority,journal:{unresolved:async()=>ok(ids.map(intentId=>({intentId})))},now:()=>1000});
  const service=createJourneyProjection({composition});t.after(()=>{service.dispose();composition.dispose();authority.dispose();});
  assert.equal(value(await service.read()).blockingReason,'chain-loading');
  value(await authority.refresh(binding));assert.equal(value(await service.read()).kind,'resolved');
  ids=['unresolved'];assert.equal(value(await service.read()).blockingReason,'reconcile-required');ids=[];
  value(authority.invalidate(binding));assert.equal(value(await service.read()).blockingReason,'chain-stale');
  assert.equal(authority.economicPreparationAllowed(),false);
});
test('binding mismatches and malformed source cannot produce receipt; errors contain no raw payload',async()=>{
  for(const source of [snapshot({chain:chain({binding:{...binding,deploymentId:'other'}})}),snapshot({economicPreparationAllowed:true}),snapshot({chainHealth:'PRIVATE_RAW_ERROR'})]) {
    const result=await fixture(source).read();assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_RAW_ERROR|other/);
  }
  const service=createJourneyProjection({composition:{read:async()=>{throw Error('PRIVATE_PROVIDER_SECRET');}}});
  const result=await service.read();assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_SECRET/);
});
test('pre-abort, superseding read and dispose reject late success without disposing underlying service',async()=>{
  let calls=0, underlyingDisposed=0;const pending=[];
  const service=createJourneyProjection({composition:{read:signal=>{calls++;const work=deferred();pending.push({...work,signal});return work.promise;},dispose(){underlyingDisposed++;}}});
  const aborted=new AbortController();aborted.abort();assert.equal((await service.read(aborted.signal)).error.code,'CANCELLED');assert.equal(calls,0);
  const first=service.read(), second=service.read();assert.equal(pending[0].signal.aborted,true);
  pending[0].resolve(ok(snapshot()));assert.equal((await first).error.code,'CANCELLED');pending[1].resolve(ok(snapshot()));assert.equal(value(await second).kind,'resolved');
  const controller=new AbortController(), third=service.read(controller.signal);controller.abort();assert.equal(pending[2].signal.aborted,true);pending[2].resolve(ok(snapshot()));assert.equal((await third).error.code,'CANCELLED');
  const last=service.read();service.dispose();assert.equal(pending[3].signal.aborted,true);pending[3].resolve(ok(snapshot()));assert.equal((await last).error.code,'CANCELLED');
  assert.equal((await service.read()).error.code,'CANCELLED');assert.equal(underlyingDisposed,0);
});

test('cancellation triggered while projecting a source cannot publish late success',async()=>{
  const controller=new AbortController(), source=snapshot();
  Object.defineProperty(source,'chain',{get(){controller.abort();return chain();}});
  const result=await fixture(source).read(controller.signal);assert.equal(result.ok,false);assert.equal(result.error.code,'CANCELLED');
});

const fundedBinding = Object.freeze({ ...binding, tradeId: 'ab'.repeat(32) });
const fundedAnchor = '0x' + 'cd'.repeat(32);
const fundedSource = (overrides = {}) => snapshot({ binding: fundedBinding, chain: chain({ binding: fundedBinding, state: 'funded', anchor: { height: '20', hash: fundedAnchor } }), ...overrides });
const gateObservation = (overrides = {}) => ({ evidence: 'native-rpc', economicPreparationAllowed: false, binding: fundedBinding, termsHash: fundedBinding.tradeId, finalizedAnchor: fundedAnchor, decision: 'allow-guidance', reason: 'ok', ...overrides });
const fixedFailure = () => ({ ok: false, error: { code: 'UNAVAILABLE' } });
function guidedFixture({ before = fundedSource(), after = before, read = async () => ok(gateObservation()), view = () => ok(gateObservation()) } = {}) {
  let reads = 0;
  return createJourneyProjection({ composition: { read: async () => ok(reads++ === 0 ? before : after) }, paymentGuidance: { read, view } });
}
test('funded coordination requires matching trusted native read and a final live view; output stays read-only', async () => {
  const output = value(await guidedFixture().read());
  assert.equal(output.kind, 'resolved'); assert.equal(output.view.step, 'payment-coordination');
  assert.deepEqual(output.view.binding, fundedBinding); assert.deepEqual(output.view.actions, []);
  assert.equal(output.view.economicPreparationAllowed, false); assert.equal(output.view.recoveryAvailable, true);
  assert.ok(Object.isFrozen(output.view)); assert.ok(Object.isFrozen(output.view.binding));
  // A newer validated request at the same canonical anchor is coherent.
  const after = fundedSource({ chain: { ...fundedSource().chain, requestSequence: 2 } });
  assert.equal(value(await guidedFixture({ after }).read()).view.step, 'payment-coordination');
});
test('missing gate stays unchanged, receipt bypasses unavailable payment, newly finalized receipt wins', async () => {
  const missing = createJourneyProjection({ composition: { read: async () => ok(fundedSource()) } });
  assert.equal(value(await missing.read()).blockingReason, 'journey-prerequisites-unavailable');
  let calls = 0;
  const terminal = fundedSource({ chain: { ...fundedSource().chain, state: 'released' } });
  const beforeTerminal = guidedFixture({ before: terminal, read: async () => { calls++; throw Error('PRIVATE'); } });
  assert.equal(value(await beforeTerminal.read()).view.step, 'receipt'); assert.equal(calls, 0);
  assert.equal(value(await guidedFixture({ after: terminal, read: async () => fixedFailure() }).read()).view.step, 'receipt');
});
test('native failures and gate refusal remain fixed blockers without raw diagnostics', async () => {
  for (const read of [async () => fixedFailure(), async () => { throw Error('PRIVATE_NATIVE_SECRET'); }]) {
    const output = value(await guidedFixture({ read }).read()); assert.equal(output.blockingReason, 'payment-guidance-unavailable');
    assert.doesNotMatch(JSON.stringify(output), /PRIVATE/);
  }
  for (const reason of ['near-expiry', 'unfunded', 'stale', 'mismatch']) {
    const output = value(await guidedFixture({ read: async () => ok(gateObservation({ decision: 'block', reason })) }).read());
    assert.equal(output.blockingReason, 'payment-guidance-blocked');
  }
  assert.equal(value(await guidedFixture({ view: fixedFailure }).read()).blockingReason, 'payment-guidance-unavailable');
  assert.equal(value(await guidedFixture({ view: () => ok(gateObservation({ decision: 'block', reason: 'stale' })) }).read()).blockingReason, 'payment-guidance-blocked');
});
test('gate network/deployment/trade/anchor/evidence contradictions cannot produce coordination', async () => {
  const bad = [
    { evidence: 'fixture-only' }, { economicPreparationAllowed: true }, { termsHash: 'ef'.repeat(32) }, { finalizedAnchor: '0x' + 'ef'.repeat(32) },
    { binding: { ...fundedBinding, networkId: 'other' } }, { binding: { ...fundedBinding, deploymentId: 'other' } },
    { binding: { ...fundedBinding, tradeId: 'ef'.repeat(32) } }, { decision: 'allow-guidance', reason: 'near-expiry' }, { termsHash: 'f'.repeat(1_000_000) },
  ];
  for (const overrides of bad) for (const phase of ['read', 'view']) {
    const options = phase === 'read' ? { read: async () => ok(gateObservation(overrides)) } : { view: () => ok(gateObservation(overrides)) };
    const output = value(await guidedFixture(options).read()); assert.equal(output.kind, 'blocked'); assert.equal(output.blockingReason, 'payment-guidance-mismatch');
  }
});
test('final source health, unresolved journal, finality, binding and generations veto late guidance', async () => {
  const scenarios = [
    [{ chainHealth: 'stale' }, 'chain-stale'], [{ chainHealth: 'reorged' }, 'chain-reorged'], [{ pendingIntentIds: ['PRIVATE_ID'] }, 'reconcile-required'],
    [{ chain: { ...fundedSource().chain, finality: 'confirmed' } }, 'finality-required'],
    [{ walletGeneration: 1 }, 'scope-changed'], [{ chain: { ...fundedSource().chain, generation: 1 } }, 'scope-changed'],
    [{ chain: { ...fundedSource().chain, anchor: { height: '21', hash: fundedAnchor } } }, 'scope-changed'],
    [{ chain: { ...fundedSource().chain, anchor: { height: '20', hash: '0x' + 'ef'.repeat(32) } } }, 'scope-changed'],
    [{ chain: { ...fundedSource().chain, state: 'absent' } }, 'scope-changed'],
  ];
  for (const [overrides, reason] of scenarios) {
    const output = value(await guidedFixture({ after: fundedSource(overrides) }).read()); assert.equal(output.blockingReason, reason); assert.doesNotMatch(JSON.stringify(output), /PRIVATE_ID/);
  }
  const rebound = { ...fundedBinding, tradeId: 'ef'.repeat(32) };
  assert.equal(value(await guidedFixture({ after: fundedSource({ binding: rebound, chain: { ...fundedSource().chain, binding: rebound } }) }).read()).blockingReason, 'scope-changed');
});
test('gate accessors cannot execute, and final view callback cancellation/disposal cannot publish', async () => {
  let getterCalls = 0;
  const hostile = gateObservation(); Object.defineProperty(hostile, 'decision', { get() { getterCalls++; return 'allow-guidance'; } });
  assert.equal(value(await guidedFixture({ view: () => ok(hostile) }).read()).blockingReason, 'payment-guidance-mismatch'); assert.equal(getterCalls, 0);
  const external = new AbortController();
  const cancelled = guidedFixture({ view: () => { external.abort(); return ok(gateObservation()); } });
  assert.equal((await cancelled.read(external.signal)).error.code, 'CANCELLED');
  let disposed;
  disposed = guidedFixture({ view: () => { disposed.dispose(); return ok(gateObservation()); } });
  assert.equal((await disposed.read()).error.code, 'CANCELLED');
});
test('superseding or disposing an asynchronous G18 read suppresses late native guidance', async () => {
  const pending = [], signals = [];
  const service = createJourneyProjection({ composition: { read: async () => ok(fundedSource()) }, paymentGuidance: {
    read(signal) { const work = deferred(); pending.push(work); signals.push(signal); return work.promise; }, view: () => ok(gateObservation()),
  } });
  const first = service.read(); await Promise.resolve(); const second = service.read(); await Promise.resolve();
  assert.equal(signals[0].aborted, true);
  pending[0].resolve(ok(gateObservation())); assert.equal((await first).error.code, 'CANCELLED');
  pending[1].resolve(ok(gateObservation())); assert.equal(value(await second).view.step, 'payment-coordination');
  const last = service.read(); await Promise.resolve(); service.dispose(); assert.equal(signals[2].aborted, true);
  pending[2].resolve(ok(gateObservation())); assert.equal((await last).error.code, 'CANCELLED');
});
test('actual G08/G12 composition is reread after G18 and blocks a newly unresolved intent', async t => {
  let ids = [];
  const authority = createTradeAuthority({ binding: fundedBinding, generation: 0, walletGeneration: 0, readValidated: async (_binding, request) => ok({ ...fundedSource().chain, generation: request.generation, requestSequence: request.requestSequence }) });
  const composition = createTradeComposition({ binding: fundedBinding, account: '0x' + '33'.repeat(20), authority, journal: { unresolved: async () => ok(ids.map(intentId => ({ intentId }))) }, now: () => 1000 });
  const service = createJourneyProjection({ composition, paymentGuidance: { read: async () => { ids = ['PRIVATE_NEW_ID']; return ok(gateObservation()); }, view: () => ok(gateObservation()) } });
  t.after(() => { service.dispose(); composition.dispose(); authority.dispose(); });
  value(await authority.refresh(fundedBinding));
  const output = value(await service.read()); assert.equal(output.blockingReason, 'reconcile-required'); assert.doesNotMatch(JSON.stringify(output), /PRIVATE_NEW_ID/);
});
