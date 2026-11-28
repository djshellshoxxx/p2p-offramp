import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { encodeCapabilities } from '../../domain/index.ts';
import { buildFundNative, buildFundSpl } from '../src/instructions.ts';
import { parseSolanaIntent, verifyIntentForTrade } from '../src/intent.ts';
import { compileLegacyMessage, encodeBase64 } from '../src/message.ts';
import { planFund, planPayout, planRefund, planRelease, readTrustedSnapshot } from '../src/plan.ts';
import { SolanaChainReader } from '../src/reader.ts';
import { connected, MARGINS, setupClient } from './lifecycle-support.mjs';
import { ata, error, makeRegistry, ok, request, shaHex } from './support.mjs';

const vectors = JSON.parse(readFileSync(new URL('../../domain/test/fixtures/g16-vectors.json', import.meta.url)));
const core = vectors.privateAgreements[0].capabilitiesHash;
const nonCore = vectors.privateAgreements[1].capabilitiesHash;
const changed = Uint8Array.from(Buffer.from(core, 'hex'));
changed[0] ^= 1;
const refusals = [
  ['nonempty maintained capability vector', nonCore],
  ['all-zero hash', '00'.repeat(32)],
  ['one-byte altered core hash', Buffer.from(changed).toString('hex')],
];
const envFor = (kind, capabilitiesHash = core, absent = true) => setupClient(kind, {
  termsChanges: { capabilitiesHash }, clusterOptions: { absent },
});
async function snapshot(env) {
  const reader = new SolanaChainReader({ rpc: env.cluster.rpc, registry: makeRegistry(), now: () => 1 });
  try { return ok(await readTrustedSnapshot(reader, env.trade, request())); } finally { reader.dispose(); }
}
const sends = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;
function untouched(env) {
  assert.deepEqual(env.journalFake.records(env.binding), []);
  assert.deepEqual(env.journalFake.writes, []);
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
  assert.equal(env.cluster.calls.filter(call => call.method === 'getLatestBlockhash').length, 0);
}

test('D4 core commitment matches the maintained Python vector and independent Node and Noble SHA-256', () => {
  const bytes = encodeCapabilities([]);
  assert.deepEqual([...bytes], [0]);
  assert.equal(vectors.generator, 'scripts/vectors/g16_vectors.py');
  assert.equal(shaHex(bytes), core);
  assert.equal(Buffer.from(sha256(bytes)).toString('hex'), core);
  assert.equal(shaHex(encodeCapabilities(vectors.privateAgreements[1].input.capabilities)), nonCore);
  assert.notEqual(core, '00'.repeat(32));
});

for (const kind of ['native', 'spl']) {
  test(`count-zero ${kind} funding still produces a genuine seller plan`, async () => {
    const env = envFor(kind);
    const plan = ok(planFund(env.trade, await snapshot(env), 'seller', MARGINS));
    assert.equal(plan.action, 'fund');
    assert.equal(plan.expectedEscrowState, 'absent');
    assert.equal(plan.feePayer, env.terms.seller);
    assert.equal(plan.instructions.length, 1);
    untouched(env);
  });

  for (const [label, hash] of refusals) {
    test(`${kind} funding planner refuses ${label}`, async () => {
      const env = envFor(kind, hash);
      error(planFund(env.trade, await snapshot(env), 'seller', MARGINS), 'UNSUPPORTED_PROVIDER');
      untouched(env);
    });
    for (const entry of ['fund', 'prepareFunding']) {
      test(`${kind} ${entry} refuses ${label} before preparing, signing or sending`, async () => {
        const env = envFor(kind, hash), seller = await connected(env, 'seller');
        error(await env.client[entry](env.trade, seller), 'UNSUPPORTED_PROVIDER');
        untouched(env);
      });
    }
  }

  for (const entry of ['fund', 'prepareFunding']) {
    test(`count-zero ${kind} ${entry} retains one explicit signature and send`, async () => {
      const env = envFor(kind), seller = await connected(env, 'seller');
      let result;
      if (entry === 'fund') result = ok(await env.client.fund(env.trade, seller));
      else {
        const review = ok(await env.client.prepareFunding(env.trade, seller));
        assert.equal(env.walletFake.calls.sign.length, 0);
        assert.equal(sends(env), 0);
        assert.deepEqual(env.journalFake.writes, ['prepared']);
        result = ok(await env.client.confirm(review, seller));
        error(await env.client.confirm(review, seller), 'CONFLICT');
      }
      assert.equal(result.state, 'sent');
      assert.deepEqual(env.journalFake.writes, ['prepared', 'signed', 'sendMarked', 'sent']);
      assert.equal(env.walletFake.calls.sign.length, 1);
      assert.equal(sends(env), 1);
    });
  }

  test(`non-core historical ${kind} terms retain existing role and occupied-escrow refusals`, async () => {
    const env = envFor(kind, nonCore);
    const absent = await snapshot(env);
    error(planFund(env.trade, absent, 'buyer', MARGINS), 'UNAUTHORIZED');
    error(planFund({ ...env.trade }, absent, 'seller', MARGINS), 'INVALID_INPUT');
    const funded = envFor(kind, nonCore, false);
    error(planFund(funded.trade, await snapshot(funded), 'seller', MARGINS), 'CONFLICT');
  });

  test(`non-core historical ${kind} escrows retain release, refund and payout planning`, async () => {
    const env = envFor(kind, nonCore, false);
    assert.equal(ok(planRelease(env.trade, await snapshot(env), 'seller', MARGINS)).action, 'release');
    env.cluster.time = Number(env.terms.escrowExpirySeconds);
    env.cluster.sync();
    assert.equal(ok(planRefund(env.trade, await snapshot(env), 'seller', MARGINS)).action, 'refund');
    env.cluster.setEscrow({ state: 2 });
    assert.equal(ok(planPayout(env.trade, await snapshot(env), 'seller')).action, 'payout');
    assert.equal(env.walletFake.calls.sign.length, 0);
    assert.equal(sends(env), 0);
  });

  test(`non-core historical ${kind} release still reconciles without retransmission`, async () => {
    const env = envFor(kind, nonCore, false), seller = await connected(env, 'seller');
    const submitted = ok(await env.client.release(env.trade, seller));
    env.cluster.advance(2);
    env.cluster.setEscrow({ state: 1 });
    env.cluster.land(submitted.signature);
    const records = ok(await env.client.recover(env.trade));
    assert.equal(records.length, 1);
    assert.equal(records[0].state, 'finalized');
    assert.equal(records[0].signature, submitted.signature);
    assert.equal(env.walletFake.calls.sign.length, 1);
    assert.equal(sends(env), 1);
  });

  test(`non-core historical ${kind} prepared funding decodes and restores without renewed authority`, async () => {
    const original = envFor(kind), seller = await connected(original, 'seller');
    ok(await original.client.prepareFunding(original.trade, seller));
    const template = original.journalFake.records(original.binding)[0];
    const env = envFor(kind, nonCore);
    const instruction = ok(kind === 'native' ? buildFundNative(env.trade)
      : buildFundSpl(env.trade, ata(env.terms.seller, env.terms.mint)));
    // Historical unsigned record fixture: codecs retain opaque commitments; no new funding plan is made here.
    const message = encodeBase64(compileLegacyMessage(env.terms.seller, [instruction], template.blockhash));
    const record = parseSolanaIntent({ ...template, binding: env.binding, message });
    verifyIntentForTrade(record, env.trade);
    ok(await env.journalFake.journal.write(env.binding, 0, record));
    const restored = ok(await env.client.recover(env.trade));
    assert.equal(restored.length, 1);
    assert.equal(restored[0].state, 'cancelled');
    assert.equal(restored[0].message, message);
    assert.equal(restored[0].sendMarkedAt, null);
    const currentSeller = await connected(env, 'seller');
    // A decoded historical record is data, not a restored private preparation capability.
    error(await env.client.confirm(record, currentSeller), 'UNAUTHORIZED');
    assert.deepEqual(env.journalFake.writes, ['prepared', 'cancelled']);
    assert.equal(env.walletFake.calls.sign.length, 0);
    assert.equal(sends(env), 0);
  });
}
