import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRANSPORT_TRIALS, WARM_READS, qualifyWarmedSolanaTransport }
  from '../../../scripts/lib/solana-withheld-transport-qualification.mjs';

function evidence(socket = 1) {
  return {
    observed: { applicationCalls: 1, fetchCalls: 1, fetchFailures: 0, statuses: [503], refusal: 'RPC_UNAVAILABLE' },
    warm: Array.from({ length: WARM_READS + 1 }, (_, i) => ({ socket: 1, id: i + 1 })),
    sends: [{ socket }], completed: [503], errors: [], pageErrors: [], unexpected: [],
  };
}

test('a measured warmed first trial qualifies with its exact public transport counts', async () => {
  let calls = 0;
  const result = await qualifyWarmedSolanaTransport(async () => { calls++; return evidence(); });
  assert.equal(calls, 1); assert.equal(result.qualifiedTrial, 1); assert.equal(result.trials.length, 1);
  assert.equal(result.trials[0].warmedConnection, true);
  assert.deepEqual(result.totals, { applicationCalls: 1, fetchCalls: 1, fetchFailures: 0,
    statuses: [503], physicalSendPosts: 1, unexpectedRequests: 0, fixtureErrors: 0 });
});

test('an invariant-clean cold trial remains in the receipt before a separate warmed trial', async () => {
  const calls = [];
  const result = await qualifyWarmedSolanaTransport(async number => {
    calls.push(number); return evidence(number === 1 ? 2 : 1);
  });
  assert.deepEqual(calls, [1, 2]); assert.equal(result.qualifiedTrial, 2);
  assert.deepEqual(result.trials.map(x => x.warmedConnection), [false, true]);
  assert.deepEqual(result.trials.map(x => x.sendSocket), [2, 1]);
  assert.deepEqual(result.totals, { applicationCalls: 2, fetchCalls: 2, fetchFailures: 0,
    statuses: [503, 503], physicalSendPosts: 2, unexpectedRequests: 0, fixtureErrors: 0 });
});

test('a connection used only by the follow-up read cannot qualify a send as warmed', async () => {
  let calls = 0;
  const result = await qualifyWarmedSolanaTransport(async () => {
    calls++;
    const record = evidence(calls === 1 ? 2 : 1);
    record.warm.at(-1).socket = 2;
    return record;
  });
  assert.equal(calls, 2); assert.equal(result.trials[0].warmedConnection, false);
  assert.equal(result.qualifiedTrial, 2);
});

test('cold-only trials fail at the fixed bound with every observed trial retained', async () => {
  let calls = 0;
  await assert.rejects(qualifyWarmedSolanaTransport(async () => { calls++; return evidence(2); }), error => {
    assert.match(error.message, /No actual warmed connection/);
    assert.equal(error.trials.length, MAX_TRANSPORT_TRIALS);
    assert.equal(error.trials.every(x => x.warmedConnection === false), true);
    return true;
  });
  assert.equal(calls, MAX_TRANSPORT_TRIALS);
});

test('a measured warmed trial at the fixed bound qualifies without an extra trial', async () => {
  let calls = 0;
  const result = await qualifyWarmedSolanaTransport(async number => {
    calls++; return evidence(number === MAX_TRANSPORT_TRIALS ? 1 : 2);
  });
  assert.equal(calls, MAX_TRANSPORT_TRIALS); assert.equal(result.qualifiedTrial, MAX_TRANSPORT_TRIALS);
  assert.equal(result.totals.physicalSendPosts, MAX_TRANSPORT_TRIALS);
});

const invalid = [
  ['a second physical POST', record => record.sends.push({ socket: 1 })],
  ['a second application call', record => { record.observed.applicationCalls = 2; }],
  ['a second fetch', record => { record.observed.fetchCalls = 2; }],
  ['a fetch rejection', record => { record.observed.fetchFailures = 1; }],
  ['a successful response', record => { record.observed.statuses = [200]; }],
  ['a missing completed response', record => { record.completed.length = 0; }],
  ['a missing warm read', record => { record.warm.pop(); }],
  ['a fixture error', record => record.errors.push('fixture failure')],
  ['a page error', record => record.pageErrors.push('page failure')],
  ['an unexpected request', record => record.unexpected.push('https://example.invalid/')],
];
for (const [label, change] of invalid) {
  test(`${label} after a cold trial aborts immediately and is never retried`, async () => {
    let calls = 0;
    await assert.rejects(qualifyWarmedSolanaTransport(async () => {
      calls++;
      const record = evidence(calls === 1 ? 2 : 1);
      if (calls === 2) change(record);
      return record;
    }), { code: 'ERR_ASSERTION' });
    assert.equal(calls, 2);
  });
}

test('a thrown trial failure is preserved and never causes another browser trial', async () => {
  const failure = new Error('actual trial failed'); let calls = 0;
  await assert.rejects(qualifyWarmedSolanaTransport(async () => { calls++; throw failure; }), error => error === failure);
  assert.equal(calls, 1);
});
