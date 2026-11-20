import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSolanaLocalRpc } from '../src/solana-localnet/rpc.ts';
import { rejectWithheldSolanaSend } from '../../../scripts/lib/solana-localnet-withheld-send.mjs';
import { assertSolanaSendMarked } from '../../../scripts/lib/solana-localnet-send-evidence.mjs';
import { connected, makeJournal, setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { ok } from '../../../packages/chain-solana/test/support.mjs';

async function listen(t, handle) {
  const errors = [];
  const server = createServer((request, response) => {
    Promise.resolve(handle(request, response)).catch(error => {
      errors.push(error); response.writeHead(500).end('Unexpected fixture failure.');
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  t.after(() => assert.deepEqual(errors, []));
  return `http://127.0.0.1:${server.address().port}/`;
}
async function requestBody(request) {
  let body = '';
  for await (const bytes of request) { body += bytes; assert.ok(body.length <= 16384); }
  return JSON.parse(body);
}

test('withheld send completes a failed HTTP acknowledgment instead of an empty connection reset', async t => {
  const posts = [];
  const url = await listen(t, async (request, response) => {
    assert.equal(request.method, 'POST'); posts.push(await requestBody(request));
    rejectWithheldSolanaSend(response, { 'Access-Control-Allow-Origin': '*' });
  });
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: ['public-fixture'] });
  const reply = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(reply.status, 503); assert.equal(reply.ok, false);
  assert.equal(reply.headers.get('access-control-allow-origin'), '*');
  assert.equal(reply.headers.get('cache-control'), 'no-store');
  assert.equal(await reply.text(), 'Acknowledgment unavailable.');
  assert.equal(posts.length, 1); assert.deepEqual(posts[0], JSON.parse(body));
});

test('actual RPC failure retains a durable unknown intent and never sends until explicit expired replacement', async t => {
  // The wallet, journal and cluster are existing scripted unit fixtures. HTTP, native RPC,
  // composed client transitions, Ed25519 signing and the independent send oracle are real.
  const initial = setupClient(); initial.client.dispose();
  const cluster = initial.cluster, clusterRequest = cluster.rpc.request.bind(cluster.rpc);
  const physical = [], seen = new Set(), statuses = [], fetchCalls = [];
  let env, withhold = true, forwarded = 0;
  const url = await listen(t, async (request, response) => {
    const input = await requestBody(request);
    if (input.method === 'sendTransaction') {
      const records = env.journalFake.records(env.binding), current = records.find(r => r.state === 'sendMarked');
      assert.ok(current); assert.deepEqual(input.params[1], { encoding: 'base64', skipPreflight: true, maxRetries: 0 });
      const proof = assertSolanaSendMarked(records, input.params[0], env.journalFake.journal.profileId(), {
        genesisHash: env.terms.genesisHash, programId: current.programId, programDataSha256: current.programDataSha256,
      }, seen);
      physical.push(proof);
      if (withhold) { withhold = false; rejectWithheldSolanaSend(response, {}); return; }
      forwarded++;
    }
    const result = await clusterRequest(input);
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result }));
  });
  const realFetch = globalThis.fetch;
  // Observe the actual native response; no response, rejection or retry is synthesized.
  globalThis.fetch = async (input, options) => {
    const send = JSON.parse(options.body).method === 'sendTransaction';
    if (send) fetchCalls.push(options.body);
    const response = await realFetch(input, options);
    if (send) statuses.push(response.status);
    return response;
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const rpc = createSolanaLocalRpc(url); t.after(() => rpc.dispose());
  cluster.rpc = rpc;
  env = setupClient('native', { terms: initial.terms, cluster, journalFake: initial.journalFake });
  t.after(() => env.client.dispose());
  const submitted = ok(await env.client.release(env.trade, await connected(env, 'seller')));
  assert.equal(submitted.state, 'unknown'); assert.deepEqual(statuses, [503]);
  assert.deepEqual(env.journalFake.writes, ['prepared', 'signed', 'sendMarked', 'unknown']);
  const original = structuredClone(env.journalFake.records(env.binding)[0]);
  assert.notEqual(original.sendMarkedAt, null); assert.equal(physical.length, 1); assert.equal(forwarded, 0);
  assert.equal(fetchCalls.length, 1); assert.equal(cluster.sent.length, 0);
  const restoredJournal = makeJournal({ store: env.journalFake.backup(), profileId: 'b'.repeat(32) });
  env.client.dispose();
  env = setupClient('native', { terms: initial.terms, cluster, journalFake: restoredJournal, seed: 'restored' });
  const recovered = ok(await env.client.recover(env.trade))[0];
  assert.equal(recovered.state, 'unknown'); assert.equal(recovered.signature, original.signature);
  assert.equal(recovered.sendMarkedAt, original.sendMarkedAt); assert.equal(recovered.originProfileId, original.originProfileId);
  for (let n = 0; n < 3; n++) ok(await env.client.reconcile(env.trade));
  assert.equal(physical.length, 1); assert.equal(forwarded, 0); assert.equal(fetchCalls.length, 1);
  cluster.advance(Number(original.lastValidBlockHeight) + 1 - cluster.height);
  assert.equal(ok(await env.client.reconcile(env.trade))[0].state, 'dropped');
  assert.equal(physical.length, 1); assert.equal(fetchCalls.length, 1);
  const replacement = ok(await env.client.release(env.trade, await connected(env, 'seller'), { rebuildOf: original.intentId }));
  assert.equal(replacement.state, 'sent'); assert.equal(physical.length, 2); assert.equal(forwarded, 1);
  assert.equal(fetchCalls.length, 2); assert.deepEqual(statuses, [503, 200]);
  assert.notEqual(replacement.signature, original.signature);
  const current = restoredJournal.records(env.binding).find(r => r.intentId === replacement.intentId);
  assert.equal(current.replacementOf, original.intentId); assert.equal(current.originProfileId, 'b'.repeat(32));
  assert.notEqual(current.message, original.message); assert.notEqual(current.sendMarkedAt, null);
  const retained = restoredJournal.records(env.binding).find(r => r.intentId === original.intentId);
  assert.equal(retained.signature, original.signature); assert.equal(retained.sendMarkedAt, original.sendMarkedAt);
  assert.equal(retained.originProfileId, original.originProfileId);
});
