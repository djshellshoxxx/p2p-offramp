import test from 'node:test';
import assert from 'node:assert/strict';
import { connected, setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { ok } from '../../../packages/chain-solana/test/support.mjs';
import { assertSolanaSendMarked } from '../../../scripts/lib/solana-localnet-send-evidence.mjs';

async function fixture() {
  const env = setupClient(); let record, wire;
  env.cluster.handle = input => {
    if (input.method === 'sendTransaction') {
      wire = input.params[0]; record = structuredClone(env.journalFake.records(env.binding)[0]);
    }
  };
  ok(await env.client.release(env.trade, await connected(env, 'seller')));
  assert.equal(record.state, 'sendMarked');
  return { record, wire, pins: { genesisHash: env.terms.genesisHash, programId: record.programId, programDataSha256: record.programDataSha256 } };
}
test('independent physical-send evidence requires exact signed bytes, marker, current profile and pins', async () => {
  const f = await fixture(), seen = new Set();
  const proof = assertSolanaSendMarked([f.record], f.wire, f.record.originProfileId, f.pins, seen);
  assert.equal(proof.signature, f.record.signature); assert.equal(proof.intentId, f.record.intentId);
  assert.equal(proof.durableState, 'sendMarked');
  assert.throws(() => assertSolanaSendMarked([f.record], f.wire, f.record.originProfileId, f.pins, seen), /physical/);
  for (const change of [{ state: 'signed', sendMarkedAt: null }, { sendMarkedAt: null }, { originProfileId: 'b'.repeat(32) },
    { message: Buffer.from('other').toString('base64') }, { signature: f.record.signature.slice(1) }, { programDataSha256: '0'.repeat(64) }]) {
    assert.throws(() => assertSolanaSendMarked([{ ...f.record, ...change }], f.wire, f.record.originProfileId, f.pins, new Set()));
  }
  assert.throws(() => assertSolanaSendMarked([f.record, f.record], f.wire, f.record.originProfileId, f.pins, new Set()));
  const damaged = Buffer.from(f.wire, 'base64'); damaged[1] ^= 1;
  assert.throws(() => assertSolanaSendMarked([f.record], damaged.toString('base64'), f.record.originProfileId, f.pins, new Set()));
});
