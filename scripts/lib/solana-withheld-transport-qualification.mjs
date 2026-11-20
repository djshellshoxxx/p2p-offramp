import assert from 'node:assert/strict';

export const WARM_READS = 8;
export const MAX_TRANSPORT_TRIALS = 8;

/** Only an invariant-clean cold connection permits another independent public-string trial. */
export async function qualifyWarmedSolanaTransport(runTrial) {
  const trials = [];
  for (let number = 1; number <= MAX_TRANSPORT_TRIALS; number++) {
    // Execution, assertions and teardown errors propagate immediately; they are never retried.
    const { observed, warm, sends, completed, errors, pageErrors, unexpected } = await runTrial(number);
    assert.deepEqual(observed, {
      applicationCalls: 1, fetchCalls: 1, fetchFailures: 0, statuses: [503], refusal: 'RPC_UNAVAILABLE',
    });
    assert.equal(warm.length, WARM_READS + 1);
    assert.equal(sends.length, 1, 'one physical POST for the one application send call in each trial');
    assert.deepEqual(completed, [503]); assert.deepEqual(errors, []);
    assert.deepEqual(pageErrors, []); assert.deepEqual(unexpected, []);
    for (const record of [...warm, ...sends]) assert.ok(Number.isSafeInteger(record.socket) && record.socket > 0);
    const warmSockets = warm.slice(0, WARM_READS).map(read => read.socket), sendSocket = sends[0].socket;
    const warmedConnection = warmSockets.includes(sendSocket);
    trials.push({ number, ...observed, statuses: [...observed.statuses], warmedConnection,
      warmSockets, sendSocket, physicalSendPosts: sends.length, completedStatuses: [...completed],
      unexpectedRequests: unexpected.length, fixtureErrors: errors.length });
    if (warmedConnection) {
      const sum = key => trials.reduce((count, trial) => count + trial[key], 0);
      return { trials, qualifiedTrial: number, totals: {
        applicationCalls: sum('applicationCalls'), fetchCalls: sum('fetchCalls'), fetchFailures: sum('fetchFailures'),
        statuses: trials.flatMap(trial => trial.statuses), physicalSendPosts: sum('physicalSendPosts'),
        unexpectedRequests: sum('unexpectedRequests'), fixtureErrors: sum('fixtureErrors'),
      } };
    }
  }
  const error = new Error(`No actual warmed connection in ${MAX_TRANSPORT_TRIALS} invariant-clean transport trials.`);
  error.trials = trials;
  throw error;
}
