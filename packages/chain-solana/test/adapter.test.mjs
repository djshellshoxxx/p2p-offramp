import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeIntentPayload, decodeIntentPayload, parseIntent } from '../../schemas/index.ts';
import { fromLaneAIntent, toLaneAIntent } from '../src/adapter.ts';
import { parseSolanaIntent, transitionIntent, UNKNOWN_ORIGIN } from '../src/intent.ts';
import { connected, setupClient } from './lifecycle-support.mjs';
import { error, ok } from './support.mjs';

async function records() {
  const env = setupClient('native');
  const sent = ok(await env.client.release(env.trade, await connected(env, 'seller')));
  const [record] = env.journalFake.records(env.binding);
  return { env, sent: parseSolanaIntent(record), signature: sent.signature };
}

test('maps-onto-lane-a-intent-v2', async () => {
  const { env, sent } = await records();
  const mapped = ok(toLaneAIntent(sent));
  assert.equal(mapped.intent.version, 2);
  assert.equal(mapped.intent.state, 'pending');
  assert.deepEqual(mapped.intent.submission, {
    chain: 'solana',
    signature: sent.signature,
    blockhash: sent.blockhash,
    lastValidBlockHeight: sent.lastValidBlockHeight,
  });
  assert.equal(mapped.intent.sendMarkedAt, sent.sendMarkedAt);
  assert.deepEqual(mapped.lossy, ['walletGeneration']);
  // Lane A's own codec accepts it byte for byte.
  assert.deepEqual(decodeIntentPayload(encodeIntentPayload(mapped.intent)), mapped.intent);
  const request = JSON.parse(mapped.intent.preparedRequest);
  assert.deepEqual(Object.keys(request), [
    'format',
    'genesisHash',
    'programId',
    'programDataSha256',
    'escrow',
    'role',
    'message',
    'blockhashSlot',
  ]);
  assert.equal(request.genesisHash, env.trade.network.genesisHash);
  const states = {
    sendMarked: 'broadcast-unknown',
    unknown: 'broadcast-unknown',
    finalized: 'finalized',
    failed: 'failed',
    dropped: 'expired',
  };
  const marked = parseSolanaIntent({ ...structuredClone(sent), binding: { ...sent.binding }, state: 'sendMarked' });
  for (const [state, expected] of Object.entries(states)) {
    const base = state === 'unknown' || state === 'sendMarked' ? marked : sent;
    const next =
      state === 'sendMarked'
        ? marked
        : state === 'unknown'
          ? parseSolanaIntent({ ...structuredClone(marked), binding: { ...marked.binding }, state: 'unknown' })
          : transitionIntent(
              base,
              state,
              1,
              state === 'dropped'
                ? {}
                : { outcome: { slot: '900', err: state === 'failed' ? 'InstructionError:0:Custom:6012' : null } },
            );
    const laneA = ok(toLaneAIntent(next)).intent;
    assert.equal(laneA.state, expected, state);
    assert.deepEqual(parseIntent(laneA), laneA);
  }
});

test('signed-before-marker-is-lossy-and-payout-unrepresentable', async () => {
  const { sent } = await records();
  const signed = parseSolanaIntent({
    ...structuredClone(sent),
    binding: { ...sent.binding },
    state: 'signed',
    sendMarkedAt: null,
  });
  const mapped = ok(toLaneAIntent(signed));
  assert.equal(mapped.intent.state, 'prepared');
  assert.equal(mapped.intent.submission.signature, null);
  assert.ok(mapped.lossy.includes('signature-before-marker'));

  const env = setupClient('native');
  env.cluster.setEscrow({ state: 1 });
  ok(await env.client.payout(env.trade, await connected(env, 'buyer')));
  const payout = parseSolanaIntent(env.journalFake.records(env.binding)[0]);
  error(toLaneAIntent(payout), 'UNSUPPORTED_PROVIDER');
});

test('import-never-trusts-terminal-labels', async () => {
  const { env, sent } = await records();
  const finalized = transitionIntent(sent, 'finalized', 1, { outcome: { slot: '900', err: null } });
  const laneA = ok(toLaneAIntent(finalized)).intent;
  const imported = ok(fromLaneAIntent(laneA, env.trade));
  assert.equal(imported.state, 'unknown', 'a stored "finalized" is re-observed from chain state');
  assert.equal(imported.outcome, null);
  assert.equal(imported.signature, sent.signature);
  // V1 has no provenance: origin is UNKNOWN_ORIGIN and the record is possibly sent.
  const { sendMarkedAt, originProfileId, ...v1 } = laneA;
  assert.ok(sendMarkedAt !== null && originProfileId);
  const legacy = ok(
    fromLaneAIntent({ ...v1, version: 1, submission: { ...v1.submission }, binding: { ...v1.binding } }, env.trade),
  );
  assert.equal(legacy.originProfileId, UNKNOWN_ORIGIN);
  assert.equal(legacy.state, 'signed');
  // A marked shared-schema intent without its signature cannot be reconciled by signature: refused.
  const unsigned = {
    ...laneA,
    binding: { ...laneA.binding },
    state: 'broadcast-unknown',
    submission: { ...laneA.submission, signature: null },
  };
  error(fromLaneAIntent(unsigned, env.trade), 'UNSUPPORTED_PROVIDER');
  // Tampered or foreign prepared requests are refused.
  const request = JSON.parse(laneA.preparedRequest);
  const tamper = changes => ({
    ...laneA,
    binding: { ...laneA.binding },
    submission: { ...laneA.submission },
    preparedRequest: JSON.stringify({ ...request, ...changes }),
  });
  error(fromLaneAIntent(tamper({ programId: '11111111111111111111111111111111' }), env.trade), 'WRONG_CHAIN');
  error(fromLaneAIntent(tamper({ format: 'other' }), env.trade), 'UNSUPPORTED_VERSION');
  error(
    fromLaneAIntent(
      {
        ...laneA,
        binding: { ...laneA.binding },
        submission: { ...laneA.submission },
        preparedRequest: `${laneA.preparedRequest} `,
      },
      env.trade,
    ),
    'INVALID_INPUT',
  );
  error(fromLaneAIntent({ ...laneA, extra: 1 }, env.trade), 'INVALID_INPUT');
});
