import test from 'node:test';
import assert from 'node:assert/strict';
import { connected, setupClient } from './lifecycle-support.mjs';

for (const offset of [0, 25]) {
  test(`stale absent context ${offset} slots after preparation cannot settle an uncertain intent`, async t => {
    const env = setupClient('native', {
      clusterOptions: { absent: true, sendBehavior: () => { throw Error('unacknowledged send'); } },
    });
    t.after(() => env.client.dispose());
    const submitted = await env.client.fund(env.trade, await connected(env, 'seller'));
    assert.equal(submitted.ok, true);
    assert.equal(submitted.value.state, 'unknown');
    const original = env.journalFake.records(env.binding)[0];
    env.cluster.advance(Number(original.lastValidBlockHeight) + 1 - env.cluster.height);
    const staleSlot = Number(original.blockhashSlot) + offset;
    env.cluster.handle = ({ method }) => method === 'getSignatureStatuses'
      ? { context: { slot: staleSlot }, value: [null] } : undefined;
    const writes = env.journalFake.writes.length;
    const observed = await env.client.reconcile(env.trade);
    assert.equal(observed.ok, false, 'stale absence is not terminal evidence');
    assert.equal(observed.error.code, 'INTEGRITY_FAILURE');
    const retained = env.journalFake.records(env.binding)[0];
    assert.equal(retained.state, 'unknown');
    assert.equal(retained.sendMarkedAt, original.sendMarkedAt);
    assert.equal(env.journalFake.writes.length, writes);
    assert.equal(env.cluster.sent.length, 1, 'reconciliation never sends a replacement');
  });
}

const scenarios = ['old finalized context', 'old processed context', 'missing finalized block',
  'context before preparation'];
for (const scenario of scenarios) {
  test(`${scenario} cannot establish expiry for an uncertain intent`, async t => {
    const env = setupClient('native', {
      clusterOptions: { absent: true, sendBehavior: () => { throw Error('unacknowledged send'); } },
    });
    t.after(() => env.client.dispose());
    const submitted = await env.client.fund(env.trade, await connected(env, 'seller'));
    assert.equal(submitted.ok, true);
    const original = env.journalFake.records(env.binding)[0];
    env.cluster.advance(Number(original.lastValidBlockHeight) + 1 - env.cluster.height);
    env.cluster.handle = ({ method, params }) => {
      if (scenario === 'context before preparation' && method === 'getSignatureStatuses') {
        return { context: { slot: Number(original.blockhashSlot) - 1 }, value: [null] };
      }
      if (method === 'isBlockhashValid') {
        if (scenario === 'old finalized context' && params[1].commitment === 'finalized') {
          return { context: { slot: Number(original.blockhashSlot) + 25 }, value: false };
        }
        if (scenario === 'old processed context' && params[1].commitment === 'processed') {
          return { context: { slot: env.cluster.slot - 1 }, value: false };
        }
      }
      if (scenario === 'missing finalized block' && method === 'getBlock') return null;
    };
    const writes = env.journalFake.writes.length;
    const observed = await env.client.reconcile(env.trade);
    assert.equal(observed.ok, false);
    assert.equal(observed.error.code, 'INTEGRITY_FAILURE');
    assert.equal(env.journalFake.records(env.binding)[0].state, 'unknown');
    assert.equal(env.journalFake.records(env.binding)[0].sendMarkedAt, original.sendMarkedAt);
    assert.equal(env.journalFake.writes.length, writes);
    assert.equal(env.cluster.sent.length, 1);
  });
}

test('fresh finalized expiry and covering absence settle without resending or clearing the marker', async t => {
  const env = setupClient('native', {
    clusterOptions: { absent: true, sendBehavior: () => { throw Error('unacknowledged send'); } },
  });
  t.after(() => env.client.dispose());
  const submitted = await env.client.fund(env.trade, await connected(env, 'seller'));
  assert.equal(submitted.ok, true);
  const original = env.journalFake.records(env.binding)[0];
  env.cluster.advance(Number(original.lastValidBlockHeight) + 1 - env.cluster.height);
  const callStart = env.cluster.calls.length;
  const observed = await env.client.reconcile(env.trade);
  assert.equal(observed.ok, true);
  assert.equal(observed.value[0].state, 'dropped');
  assert.equal(observed.value[0].sendMarkedAt, original.sendMarkedAt);
  assert.equal(env.cluster.sent.length, 1);
  const calls = env.cluster.calls.slice(callStart);
  const expiry = calls.find(call => call.method === 'isBlockhashValid' && call.params[1].commitment === 'finalized');
  assert.equal(expiry.params[1].minContextSlot, Number(original.blockhashSlot));
  const block = calls.find(call => call.method === 'getBlock');
  assert.equal(block.params[0], env.cluster.slot);
  assert.equal(block.params[1].commitment, 'finalized');
  assert.equal(calls.at(-1).method, 'getGenesisHash');
});
