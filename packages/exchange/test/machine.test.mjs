import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminal, TERMINAL_STATES, transition } from '../index.ts';

test('isTerminal is true exactly for accepted/rejected/cancelled; terminal states accept no further message', () => {
  for (const state of ['accepted', 'rejected', 'cancelled']) assert.equal(isTerminal(state), true);
  for (const state of ['taken', 'offered']) assert.equal(isTerminal(state), false);
  assert.deepEqual([...TERMINAL_STATES].sort(), ['accepted', 'cancelled', 'rejected']);
  for (const state of TERMINAL_STATES) {
    for (const type of ['take-request', 'terms-offer', 'terms-accept', 'terms-reject', 'cancel']) {
      for (const sender of ['seller', 'buyer']) assert.equal(transition(state, type, sender), null);
    }
  }
});
