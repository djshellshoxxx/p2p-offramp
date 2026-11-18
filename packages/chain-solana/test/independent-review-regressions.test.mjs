import test from 'node:test';
import assert from 'node:assert/strict';
import { setupClient, connected } from './lifecycle-support.mjs';
import { key } from './support.mjs';

test('independent review: disposal before physical RPC dispatch prevents broadcast', async t => {
  let disposed = false, sawDisposedSend = false;
  const env = setupClient('native', {
    clusterOptions: { absent: true },
    journal: { hooks: { after: record => {
      if (record.state === 'sendMarked') {
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => {
          disposed = true;
          env.client.dispose();
        })));
      }
    } } },
  });
  t.after(() => env.client.dispose());
  env.cluster.handle = input => {
    if (input.method === 'sendTransaction') sawDisposedSend = disposed;
  };
  const seller = await connected(env, 'seller');
  await env.client.fund(env.trade, seller);
  assert.equal(disposed, true, 'the scheduled disposal must have executed');
  assert.equal(sawDisposedSend, false, 'no physical send may start after disposal');
  assert.equal(env.cluster.sent.length, 0);
  assert.notEqual(env.journalFake.records(env.binding)[0].sendMarkedAt, null,
    'preserve durable uncertainty after writing the marker');
});

for (const switchPoint of ['before', 'during']) {
  const name = `independent review: ${switchPoint}-observation switch cannot mark an unknown transaction dropped`;
  test(name, async t => {
    const env = setupClient('native', {
      clusterOptions: { absent: true, sendBehavior: () => { throw Error('unknown transport outcome'); } },
    });
    t.after(() => env.client.dispose());
    const seller = await connected(env, 'seller');
    const sent = await env.client.fund(env.trade, seller);
    assert.equal(sent.ok, true);
    assert.equal(sent.value.state, 'unknown');
    env.cluster.advance(151);
    if (switchPoint === 'before') env.cluster.world.genesis = key('different-genesis');
    else env.cluster.handle = input => {
      if (input.method === 'getBlockHeight') env.cluster.world.genesis = key('different-genesis');
    };
    const writes = env.journalFake.writes.length;
    const result = await env.client.reconcile(env.trade);
    assert.equal(result.ok, false, 'a wrong-network observation is not terminal evidence');
    assert.equal(result.error.code, 'WRONG_CHAIN');
    assert.equal(env.journalFake.records(env.binding)[0].state, 'unknown');
    assert.equal(env.journalFake.writes.length, writes);
  });
}


test('independent review: rejected network switch cannot poison the finalized height floor', async t => {
  const env = setupClient('native', {
    clusterOptions: { absent: true, sendBehavior: () => { throw Error('unknown'); } },
  });
  t.after(() => env.client.dispose());
  const sent = await env.client.fund(env.trade, await connected(env, 'seller'));
  assert.equal(sent.ok, true);
  const genesis = env.cluster.world.genesis;
  const slot = env.cluster.slot;
  env.cluster.handle = ({ method }) => {
    if (method === 'getBlockHeight') {
      env.cluster.world.genesis = key('wrong-network');
      return env.cluster.height + 10000;
    }
    if (method === 'isBlockhashValid') return { context: { slot: env.cluster.slot }, value: false };
  };
  const refused = await env.client.reconcile(env.trade);
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'WRONG_CHAIN');
  env.cluster.world.genesis = genesis;
  env.cluster.handle = undefined;
  assert.equal(env.cluster.slot, slot);
  const correct = await env.client.reconcile(env.trade);
  assert.equal(correct.ok, true, 'the wrong-network height must not become this network floor');
  assert.equal(correct.value[0].state, 'unknown');
});

test('independent review: wrong-network failed status cannot settle a marked intent', async t => {
  const env = setupClient('native');
  t.after(() => env.client.dispose());
  const sent = await env.client.release(env.trade, await connected(env, 'seller'));
  assert.equal(sent.ok, true);
  env.cluster.advance(2);
  env.cluster.land(sent.value.signature, { err: 'AccountNotFound' });
  env.cluster.handle = ({ method }) => {
    if (method === 'getSignatureStatuses') env.cluster.world.genesis = key('wrong-network');
  };
  const writes = env.journalFake.writes.length;
  const refused = await env.client.reconcile(env.trade);
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'WRONG_CHAIN');
  assert.equal(env.journalFake.records(env.binding)[0].state, 'sent');
  assert.equal(env.journalFake.writes.length, writes);
});
