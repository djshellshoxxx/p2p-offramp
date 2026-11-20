import test from 'node:test';
import assert from 'node:assert/strict';
import { observeIntent } from '../src/submit.ts';
import { connected, setupClient } from './lifecycle-support.mjs';
import { key, ok } from './support.mjs';

async function expiredUnknown(t) {
  const env = setupClient('native', {
    clusterOptions: { absent: true, sendBehavior: () => { throw Error('unacknowledged send'); } },
  });
  t.after(() => env.client.dispose());
  const sent = ok(await env.client.fund(env.trade, await connected(env, 'seller')));
  assert.equal(sent.state, 'unknown');
  const record = env.journalFake.records(env.binding)[0];
  env.cluster.advance(Number(record.lastValidBlockHeight) + 1 - env.cluster.height);
  return { env, record, writes: env.journalFake.writes.length };
}

test('independent expiry review: current first absence cannot qualify a stale second absence', async t => {
  const { env, record, writes } = await expiredUnknown(t);
  let reads = 0;
  env.cluster.handle = ({ method }) => {
    if (method !== 'getSignatureStatuses') return;
    return { context: { slot: ++reads === 1 ? env.cluster.slot : Number(record.blockhashSlot) + 25 }, value: [null] };
  };
  const result = await env.client.reconcile(env.trade);
  assert.equal(reads, 2);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INTEGRITY_FAILURE');
  assert.equal(env.journalFake.records(env.binding)[0].state, 'unknown');
  assert.equal(env.journalFake.writes.length, writes);
  assert.equal(env.cluster.sent.length, 1);
});

for (const level of ['processed', 'finalized']) {
  test(`independent expiry review: a ${level} status appearing in the final query is retained`, async t => {
    const { env, record, writes } = await expiredUnknown(t);
    let reads = 0;
    env.cluster.handle = ({ method }) => {
      if (method !== 'getSignatureStatuses' || ++reads === 1) return;
      return { context: { slot: env.cluster.slot }, value: [{
        slot: Number(record.blockhashSlot) + 1,
        confirmations: level === 'finalized' ? null : 1,
        confirmationStatus: level, err: level === 'finalized' ? 'AccountNotFound' : null,
      }] };
    };
    const observed = ok(await env.client.reconcile(env.trade));
    assert.equal(reads, 2);
    assert.equal(observed[0].state, level === 'finalized' ? 'failed' : 'unknown');
    assert.equal(observed[0].sendMarkedAt, record.sendMarkedAt);
    assert.equal(env.journalFake.writes.length, writes + (level === 'finalized' ? 1 : 0));
    assert.equal(env.cluster.sent.length, 1);
  });
}

test('independent expiry review: a rejected finalized-anchor network switch cannot raise the height floor', async t => {
  const { env, record } = await expiredUnknown(t);
  const floors = new Map();
  const context = {
    rpc: env.cluster.rpc, journal: env.journalFake.journal, clock: { now: () => 1000 },
    random: length => new Uint8Array(length), timeoutMs: 2000, floors,
  };
  const genesis = env.cluster.world.genesis;
  env.cluster.handle = ({ method }) => {
    if (method !== 'getBlock') return;
    env.cluster.world.genesis = key('different-finalized-anchor-genesis');
    return { blockHeight: env.cluster.height + 10000 };
  };
  await assert.rejects(observeIntent(context, env.trade, record), { code: 'WRONG_CHAIN' });
  assert.equal(floors.size, 0);
  env.cluster.world.genesis = genesis;
  env.cluster.handle = undefined;
  assert.deepEqual(await observeIntent(context, env.trade, record), { kind: 'dropped' });
  assert.equal(floors.get(record.binding.networkId), env.cluster.height);
  assert.equal(env.journalFake.records(env.binding)[0].state, 'unknown', 'observation itself does not persist');
  assert.equal(env.cluster.sent.length, 1);
});
