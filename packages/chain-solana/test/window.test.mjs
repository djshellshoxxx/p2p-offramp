import test from 'node:test';
import assert from 'node:assert/strict';
import { fundingWindow, settlementWindow } from '../src/window.ts';
import { error, ok } from './support.mjs';

const NOW = 1_793_782_800;
const fw = (acceptDelta, expiryDelta, margin = '0', now = NOW) =>
  fundingWindow(String(now + acceptDelta), String(now + expiryDelta), String(now), margin);

test('accept-1-open/at-expired', () => {
  assert.equal(ok(fw(1, 3600)), 'open');
  assert.equal(ok(fw(0, 3600)), 'acceptance-expired');
  assert.equal(ok(fw(-5, 3600)), 'acceptance-expired');
});

test('expiry-1799/1800/604800/604801', () => {
  assert.equal(ok(fw(10, 1799)), 'deadline-out-of-range');
  assert.equal(ok(fw(10, 1800)), 'open');
  assert.equal(ok(fw(10, 604_800)), 'open');
  assert.equal(ok(fw(10, 604_801)), 'deadline-out-of-range');
});

test('margin-tightens-lower-only', () => {
  assert.equal(ok(fw(100, 1800, '1')), 'deadline-out-of-range');
  assert.equal(ok(fw(100, 1860, '60')), 'open');
  assert.equal(ok(fw(100, 1859, '60')), 'deadline-out-of-range');
  assert.equal(ok(fw(100, 604_800, '60')), 'open', 'the upper bound is checked at chain time only');
  assert.equal(ok(fw(60, 3600, '60')), 'acceptance-expired');
  assert.equal(ok(fw(61, 3600, '60')), 'open');
  assert.equal(ok(fw(3700, 7200, '3600')), 'open');
  for (const margin of ['3601', '-1', '01', '1.5', '', undefined, 60]) {
    error(fundingWindow(String(NOW + 100), String(NOW + 3600), String(NOW), margin), 'INVALID_INPUT');
  }
  for (const bad of [
    ['x', '1', '1'],
    ['1', '18446744073709551616', '1'],
    ['1', '1', '1e3'],
  ]) {
    error(fundingWindow(bad[0], bad[1], bad[2], '0'), 'INVALID_INPUT');
  }
  const max = (1n << 64n) - 1n;
  assert.equal(ok(fundingWindow(String(max), String(max), String(max - 2000n), '3600')), 'acceptance-expired');
});

test('settlement-{refund-at-deadline,margin-gap,missing}', () => {
  const at = (deadline, now, margin) => settlementWindow(String(deadline), String(now), margin);
  assert.deepEqual(ok(at(NOW, NOW, '0')), { releaseOpen: false, refundOpen: true });
  assert.deepEqual(ok(at(NOW, NOW - 1, '0')), { releaseOpen: true, refundOpen: false });
  assert.deepEqual(
    ok(at(NOW, NOW - 60, '60')),
    { releaseOpen: false, refundOpen: false },
    'margin gap: neither action is safe',
  );
  assert.deepEqual(ok(at(NOW, NOW - 61, '60')), { releaseOpen: true, refundOpen: false });
  error(at(NOW, NOW, undefined), 'INVALID_INPUT');
  error(at(NOW, NOW, '604801'), 'INVALID_INPUT');
  assert.ok(ok(at(NOW, NOW, '604800')));
  error(settlementWindow('x', String(NOW), '0'), 'INVALID_INPUT');
});

test('Date.now-throws', () => {
  const original = Date.now;
  Date.now = () => {
    throw Error('SECRET wall clock');
  };
  try {
    assert.equal(ok(fw(1, 3600, '0')), 'open');
    assert.ok(ok(settlementWindow(String(NOW), String(NOW), '0')).refundOpen);
  } finally {
    Date.now = original;
  }
});
