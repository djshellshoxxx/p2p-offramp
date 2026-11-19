import test from 'node:test';
import assert from 'node:assert/strict';
import { groupForDisplay } from '../index.ts';

// Regression-first: these invalid values terminate quickly on the unfixed source.
// Do NOT probe zero/negative chunk sizes until the guard lands: the existing
// `index += size` loop can otherwise run indefinitely on a nonempty string.
test('D6 QR grouping refuses non-finite and fractional chunk sizes', () => {
  assert.throws(() => groupForDisplay('12345678', Number.NaN), RangeError);
  assert.throws(() => groupForDisplay('12345678', Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => groupForDisplay('12345678', 1.5), RangeError);
});
