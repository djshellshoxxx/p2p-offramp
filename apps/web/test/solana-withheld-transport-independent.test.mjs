import test from 'node:test';
import assert from 'node:assert/strict';
import { WARM_READS, qualifyWarmedSolanaTransport }
  from '../../../scripts/lib/solana-withheld-transport-qualification.mjs';

// Only the preliminary reads establish warmth. The follow-up uses the cold send socket.
function trialRecord(cold = true) {
  const sendSocket = cold ? 8 : 7;
  return {
    observed: { applicationCalls: 1, fetchCalls: 1, fetchFailures: 0, statuses: [503], refusal: 'RPC_UNAVAILABLE' },
    warm: [...Array.from({ length: WARM_READS }, (_, i) => ({ socket: 7, id: i + 1 })),
      { socket: sendSocket, id: WARM_READS + 2 }],
    sends: [{ socket: sendSocket }], completed: [503], errors: [], pageErrors: [], unexpected: [],
  };
}

const violations = [
  ['fixture error', record => record.errors.push('fixture refused the request')],
  ['page error', record => record.pageErrors.push('page execution failed')],
  ['unexpected request', record => record.unexpected.push('http://127.0.0.1/unexpected')],
  ['incomplete 503 response', record => { record.completed.length = 0; }],
  ['duplicate physical send', record => record.sends.push({ socket: 8 })],
];

for (const [label, violate] of violations) {
  test(`a cold first trial with ${label} aborts before a later warmed trial can qualify`, async () => {
    let calls = 0;
    await assert.rejects(qualifyWarmedSolanaTransport(async () => {
      calls++;
      const record = trialRecord(calls === 1);
      if (calls === 1) violate(record);
      return record;
    }), { code: 'ERR_ASSERTION' });
    assert.equal(calls, 1, 'invalid cold evidence must never permit another trial');
  });
}

test('an asynchronous teardown rejection overrides a cold return and aborts without sampling again', async () => {
  const failure = new Error('trial teardown rejected');
  let calls = 0, teardownStarted = false;
  await assert.rejects(qualifyWarmedSolanaTransport(async () => {
    calls++;
    if (calls > 1) return trialRecord(false);
    try {
      return trialRecord();
    } finally {
      teardownStarted = true;
      await Promise.resolve();
      throw failure;
    }
  }), error => error === failure);
  assert.equal(teardownStarted, true);
  assert.equal(calls, 1, 'a rejected trial teardown must never permit another trial');
});
