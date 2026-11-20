import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaLocalRpc } from '../src/solana-localnet/rpc.ts';
import { observeIntent } from '../../../packages/chain-solana/src/submit.ts';
import { connected, setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { ok } from '../../../packages/chain-solana/test/support.mjs';

test('native local RPC serializes finalized expiry context checks without a send or network connection', async t => {
  const env = setupClient('native', {
    clusterOptions: { absent: true, sendBehavior: () => { throw Error('unacknowledged send'); } },
  });
  t.after(() => env.client.dispose());
  ok(await env.client.fund(env.trade, await connected(env, 'seller')));
  const record = env.journalFake.records(env.binding)[0];
  env.cluster.advance(Number(record.lastValidBlockHeight) + 1 - env.cluster.height);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8899/');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    const request = JSON.parse(options.body);
    assert.notEqual(request.method, 'sendTransaction');
    requests.push(request);
    const result = await env.cluster.rpc.request({ method: request.method, params: request.params, signal: options.signal });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { status: 200 });
  });
  const rpc = createSolanaLocalRpc('http://127.0.0.1:8899/');
  t.after(() => rpc.dispose());
  const context = {
    rpc, journal: env.journalFake.journal, clock: { now: () => 1000 },
    random: length => new Uint8Array(length), timeoutMs: 2000, floors: new Map(),
  };
  assert.deepEqual(await observeIntent(context, env.trade, record), { kind: 'dropped' });
  assert.equal(requests.filter(request => request.method === 'getSignatureStatuses').length, 2);
  assert.deepEqual(requests.filter(request => request.method === 'isBlockhashValid').map(request => request.params[1]), [
    { commitment: 'finalized', minContextSlot: Number(record.blockhashSlot) },
    { commitment: 'processed', minContextSlot: env.cluster.slot },
  ]);
  assert.deepEqual(requests.find(request => request.method === 'getBlock').params, [
    env.cluster.slot, { commitment: 'finalized', transactionDetails: 'none', rewards: false },
  ]);
  assert.equal(env.cluster.sent.length, 1);
  assert.equal(env.journalFake.records(env.binding)[0].state, 'unknown', 'read-only observation does not persist');
});
