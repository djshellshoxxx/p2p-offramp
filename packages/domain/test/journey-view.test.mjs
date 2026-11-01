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
