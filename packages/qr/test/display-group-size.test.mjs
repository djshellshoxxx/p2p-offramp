import test from 'node:test';
import assert from 'node:assert/strict';
import { groupForDisplay } from '../index.ts';

// The non-finite/fractional cases failed safely on the baseline (PR #171 RED CI).
test('D6 QR grouping refuses non-finite and fractional chunk sizes', () => {
  assert.throws(() => groupForDisplay('12345678', Number.NaN), RangeError);
  assert.throws(() => groupForDisplay('12345678', Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => groupForDisplay('12345678', Number.NEGATIVE_INFINITY), RangeError);
  assert.throws(() => groupForDisplay('12345678', 1.5), RangeError);
  assert.throws(() => groupForDisplay('12345678', Number.MAX_SAFE_INTEGER + 1), RangeError);
});

// Only execute these cases *after* the production guard is in the same commit:
// zero and negative sizes never advance the pre-fix nonempty-string loop.
test('D6 QR grouping rejects nonpositive sizes without looping', () => {
  for (const size of [0, -0, -1, -4]) {
    assert.throws(() => groupForDisplay('12345678', size), RangeError);
    assert.throws(() => groupForDisplay('', size), RangeError);
  }
});

test('D6 QR grouping preserves default, valid chunk and 0x prefix semantics', () => {
  assert.equal(groupForDisplay('12345678'), '1234 5678');
  assert.equal(groupForDisplay('12345678', 1), '1 2 3 4 5 6 7 8');
  assert.equal(groupForDisplay('12345678', 2), '12 34 56 78');
  assert.equal(groupForDisplay('12345678', 3), '123 456 78');
  assert.equal(groupForDisplay('0xabcdef0123'), '0x abcd ef01 23');
  assert.equal(groupForDisplay('0xabcdef0123', 3), '0x abc def 012 3');
  assert.equal(groupForDisplay('0x'), '0x');
  assert.equal(groupForDisplay(''), '');
});
