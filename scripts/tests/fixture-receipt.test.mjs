import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForFixtureReceipt } from '../test-support/fixture-receipt.mjs';
const hash = '0x' + 'ab'.repeat(32), success = () => ({ transactionHash: hash, status: '0x1', blockHash: 'fixture-block' });
const unavailable = { message: 'Fixture receipt unavailable.' };
const timing = () => {let time=0;const delays=[];return {now:()=>time,wait:async ms=>{delays.push(ms);time+=ms;},delays,set:value=>{time=value;}};};
test('null-first receipts poll only the exact same transaction hash and never send again',async()=>{
  const calls=[], replies=[null,null,success()], clock=timing();
  const receipt=await waitForFixtureReceipt(async(method,params)=>{calls.push([method,params]);return replies.shift();},hash,clock);
  assert.deepEqual(receipt,success());assert.deepEqual(clock.delays,[50,50]);
  assert.deepEqual(calls,Array.from({length:3},()=>['eth_getTransactionReceipt',[hash]]));
});
test('malformed, reverted and foreign receipts fail immediately without waiting or further RPC',async()=>{
  for(const receipt of [undefined,false,[],{}, {status:'0x1'}, {...success(),status:'0x0'}, {...success(),status:'0x01'}, {...success(),transactionHash:'0x'+'cd'.repeat(32)}]) {
    let calls=0;const clock=timing();
    await assert.rejects(waitForFixtureReceipt(async()=>{calls++;return receipt;},hash,clock),unavailable);
    assert.equal(calls,1);assert.deepEqual(clock.delays,[]);
  }
});
test('read failure and malformed hash produce fixed errors with no retries or private diagnostics',async()=>{
  let calls=0;const clock=timing();
  await assert.rejects(waitForFixtureReceipt(async()=>{calls++;throw Error('PRIVATE_RPC_URL');},hash,clock),unavailable);
  assert.equal(calls,1);assert.deepEqual(clock.delays,[]);
  await assert.rejects(waitForFixtureReceipt(async()=>{calls++;},'invalid',clock),unavailable);assert.equal(calls,1);
});
test('null receipt attempt exhaustion is bounded independently of a stalled test clock',async()=>{
  let calls=0, waits=0;
  await assert.rejects(waitForFixtureReceipt(async()=>{calls++;return null;},hash,{now:()=>0,wait:async()=>{waits++;}}),unavailable);
  assert.equal(calls,40);assert.equal(waits,39);
});
test('monotonic deadline bounds reads and waits; late success or clock reversal cannot pass',async()=>{
  for(const jump of [5000,-1,NaN]) {
    let calls=0;const clock=timing();
    await assert.rejects(waitForFixtureReceipt(async()=>{calls++;clock.set(jump);return success();},hash,clock),unavailable);
    assert.equal(calls,1);assert.deepEqual(clock.delays,[]);
  }
  let calls=0;const clock=timing();clock.wait=async()=>clock.set(5000);
  await assert.rejects(waitForFixtureReceipt(async()=>{calls++;return null;},hash,clock),unavailable);assert.equal(calls,1);
});
test('a never-settling RPC is bounded by the receipt deadline without sleeping',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0;
  const pending=waitForFixtureReceipt(()=>{calls++;return new Promise(()=>{});},hash,{now:()=>0,wait:async()=>assert.fail('a hung read is never retried')});
  const rejected=assert.rejects(pending,unavailable);
  await Promise.resolve();assert.equal(calls,1);
  t.mock.timers.tick(5000);
  await rejected;assert.equal(calls,1);
});
