// Reproduce superseded takes against actual source using the labelled lifecycle fixtures.
import assert from 'node:assert/strict';
import { keys, secret, termsBytes, deferred, bounded, options, loadExchange } from './lifecycle-harness.mjs';
const harness = await loadExchange(), observations = [];
try {
  for (const endState of ['cancelled', 'accepted']) {
    let holdNext = true;
    const gate = deferred(), entered = deferred();
    const ex = harness.createTermsExchange(options({ publicKey: async () => {
      if (holdNext) { holdNext = false; entered.resolve(); await gate.promise; } return keys.self;
    } }));
    const late = ex.take('fixture', keys.addressA, secret);
    await bounded(entered.promise);
    const newer = await bounded(ex.take('fixture', keys.addressB, secret)); assert.equal(newer.ok, true);
    if (endState === 'cancelled') assert.equal((await bounded(ex.cancel(newer.value.sessionId, 'withdrawn', secret))).ok, true);
    else {
      harness.reviewed.buyer = keys.addressB;
      const offer = harness.incoming('terms-offer', keys.seller, keys.self, { terms: '{}' }, keys.hash);
      assert.equal((await bounded(ex.receive(offer, secret))).ok, true);
      assert.equal((await bounded(ex.accept(newer.value.sessionId, termsBytes, secret))).ok, true);
    }
    const before = ex.session(newer.value.sessionId); gate.resolve();
    const result = await bounded(late), after = ex.session(newer.value.sessionId);
    observations.push({ before: before.state, beforeBuyer: before.buyerAddress, lateResult: result.ok ? 'SUCCESS' : result.code,
      after: after.state, afterBuyer: after.buyerAddress });
    ex.close(); harness.reviewed.buyer = keys.addressA;
  }
  console.log(JSON.stringify({ qualification: 'actual exchange source; mocked crypto/review; no funding operation', observations }, null, 2));
  if (process.argv.includes('--assert-safe')) for (const row of observations) {
    assert.equal(row.lateResult, 'OUT_OF_ORDER'); assert.equal(row.after, row.before); assert.equal(row.afterBuyer, row.beforeBuyer);
  }
} finally { harness.close(); }
