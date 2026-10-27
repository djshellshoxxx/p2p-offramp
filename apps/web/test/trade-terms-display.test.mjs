import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFiatMinor, formatUnits, describeDeadline, fullAddress } from '../src/ui/trade/trade-terms-display.ts';

const U128 = ((1n << 128n) - 1n).toString();
const val = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };

test('formatUnits: zero, trimming and u128 at decimals 0, 18 and 38', () => {
  assert.equal(val(formatUnits('0', 18)), '0');
  assert.equal(val(formatUnits('1500000000000000000', 18)), '1.5');
  assert.equal(val(formatUnits('123', 0)), '123');
  assert.equal(val(formatUnits(U128, 18)), '340282366920938463463.374607431768211455');
  assert.equal(val(formatUnits(U128, 38)), '3.40282366920938463463374607431768211455');
  assert.equal(val(formatUnits('1', 38)), `0.${'0'.repeat(37)}1`);
  for (const d of [-1, 39, 1.5, NaN, Infinity, '18', undefined])
    assert.deepEqual(formatUnits('1', d), { ok: false, code: 'INVALID_DECIMALS' }, String(d));
});
test('fiat minor units', () => {
  assert.equal(val(formatFiatMinor('12345', 2, 'USD')), '123.45 USD');
  assert.equal(val(formatFiatMinor('5', 2, 'EUR')), '0.05 EUR');
  assert.equal(val(formatFiatMinor('0', 2, 'EUR')), '0.00 EUR');
  assert.equal(val(formatFiatMinor('700', 0, 'JPY')), '700 JPY');
  assert.equal(val(formatFiatMinor(U128, 6, 'USD')), '340282366920938463463374607431768.211455 USD');
  assert.equal(formatFiatMinor('1', 7, 'USD').code, 'INVALID_DECIMALS');
  assert.equal(formatFiatMinor('1', 2, 'usd').code, 'INVALID_CURRENCY');
  assert.equal(formatFiatMinor('1', 2, 'USDT').code, 'INVALID_CURRENCY');
  assert.equal(formatFiatMinor('01', 2, 'USD').code, 'INVALID_AMOUNT');
  assert.equal(formatFiatMinor('1.0', 2, 'USD').code, 'INVALID_AMOUNT');
});
test('deadline boundary: now == target is expired', () => {
  assert.deepEqual(val(describeDeadline('100', '100')).state, { kind: 'expired' });
  assert.deepEqual(val(describeDeadline('100', '101')).state, { kind: 'expired' });
  const one = val(describeDeadline('100', '99'));
  assert.deepEqual(one.state, { kind: 'remaining', seconds: '1' });
  assert.equal(one.text, '1 s remaining');
  assert.equal(val(describeDeadline('90061', '0')).text, '1 d 1 h 1 min 1 s remaining');
  assert.equal(val(describeDeadline('3600', '0')).text, '1 h remaining');
  assert.equal(val(describeDeadline('0', '0')).text, 'Expired');
});
test('deadline: u64 exact and bad input rejected', () => {
  const max = ((1n << 64n) - 1n).toString();
  assert.deepEqual(val(describeDeadline(max, '0')).state, { kind: 'remaining', seconds: max });
  for (const bad of ['', '01', '-1', '1.5', (1n << 64n).toString(), 7, null])
    assert.equal(describeDeadline(bad, '0').code, 'INVALID_TIME');
  assert.equal(describeDeadline('1', 'x').code, 'INVALID_TIME');
});
test('address is never truncated or altered', () => {
  const a = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
  const r = val(fullAddress(a));
  assert.equal(r.full, a);
  assert.equal(r.groups.length, 10);
  assert.ok(r.groups.every(g => /^[0-9a-f]{4}$/.test(g)));
  assert.equal(`0x${r.groups.join('')}`, a.toLowerCase());
  assert.equal(r.grouped.replaceAll(' ', ''), a.toLowerCase());
  assert.ok(!r.grouped.includes('…') && !r.grouped.includes('...'));
  for (const bad of ['', '0x', '0x123', a + '0', a.slice(2), '0xZZcdEf0123456789aBcDeF0123456789AbCdEf01', ' ' + a, 5])
    assert.equal(fullAddress(bad).code, 'INVALID_ADDRESS');
});
test('formatUnits: exact uint256 range without a unit label', () => {
  const max = ((1n << 256n) - 1n).toString();
  assert.equal(val(formatUnits(max, 0)), max);
  assert.equal(val(formatUnits(max, 18)), '115792089237316195423570985008687907853269984665640564039457.584007913129639935');
  assert.equal(val(formatUnits('25000000', 6)), '25');
  assert.equal(val(formatUnits('1', 18)), '0.000000000000000001');
  assert.equal(val(formatUnits('0', 6)), '0');
  for (const bad of [(1n << 256n).toString(), '9'.repeat(79), '01', '-1', '1.0', '1e3', ' 1', 7, null])
    assert.deepEqual(formatUnits(bad, 18), { ok: false, code: 'INVALID_AMOUNT' }, String(bad));
  assert.deepEqual(formatUnits('1', 39), { ok: false, code: 'INVALID_DECIMALS' });
});
