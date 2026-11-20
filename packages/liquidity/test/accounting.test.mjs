import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectVaultAccounting } from '../index.ts';

const MAKER = '0x' + '11'.repeat(20), MAX = (1n << 256n) - 1n;
const record = changes => ({ version: 1, assetId: 'native', maker: MAKER, deposited: '100', available: '40',
  reserved: '20', inEscrow: '10', withdrawn: '20', releasedToBuyers: '10', ...changes });
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fail = result => { assert.equal(result.ok, false); assert.equal(result.error.retryable, false); assert.match(result.error.messageKey, /^core\.error\./); return result.error.code; };

test('exact accounting conserves integer principal, keeps separate surplus and caps safe withdrawal above protected reserves', () => {
  const report = val(inspectVaultAccounting(record(), '75'));
  assert.equal(report.conservation, true); assert.equal(report.solvent, true);
  assert.equal(report.surplus, '15'); assert.equal(report.safeAvailableWithdrawal, '40');
  assert.equal(report.diagnosticOnly, true); assert.equal(report.economicAuthority, false);
  const short = val(inspectVaultAccounting(record(), '35'));
  assert.equal(short.conservation, true); assert.equal(short.solvent, false); assert.equal(short.safeAvailableWithdrawal, '15');
  assert.equal(val(inspectVaultAccounting(record(), '19')).safeAvailableWithdrawal, '0');
});
test('maximum uint256 and inconsistent component totals are handled without float arithmetic or wrapping', () => {
  const max = val(inspectVaultAccounting(record({ deposited: String(MAX), available: String(MAX), reserved: '0', inEscrow: '0', withdrawn: '0', releasedToBuyers: '0' }), String(MAX)));
  assert.equal(max.conservation, true); assert.equal(max.safeAvailableWithdrawal, String(MAX));
  const inconsistent = val(inspectVaultAccounting(record({ deposited: String(MAX), available: String(MAX), reserved: String(MAX) }), String(MAX)));
  assert.equal(inconsistent.conservation, false); assert.equal(inconsistent.solvent, false); assert.equal(inconsistent.safeAvailableWithdrawal, '0');
});
test('money accepts canonical bounded decimal strings only, including exact zero where permitted', () => {
  for (const invalid of ['', '00', '01', '-1', '+1', '1.0', '1e3', ' 1', '1 ', '١', '９', '9'.repeat(79), String(MAX + 1n), 1, 1n, null]) {
    fail(inspectVaultAccounting(record({ available: invalid }), '100'));
    fail(inspectVaultAccounting(record(), invalid));
  }
  assert.equal(val(inspectVaultAccounting(record({ deposited: '0', available: '0', reserved: '0', inEscrow: '0', withdrawn: '0', releasedToBuyers: '0' }), '0')).conservation, true);
});
test('record versions, exact fields and account shapes are checked; results detach/freeze the source', () => {
  assert.equal(fail(inspectVaultAccounting(record({ version: 2 }), '100')), 'UNSUPPORTED_VERSION');
  for (const extra of [{ future: true }, { maker: '0x' + '00'.repeat(20) }, { assetId: 'private\nurl' }, { maker: MAKER.toUpperCase() }]) fail(inspectVaultAccounting(record(extra), '100'));
  const input = record(), report = val(inspectVaultAccounting(input, '100'));
  input.available = '0'; assert.equal(report.ledger.available, '40');
  assert.ok(Object.isFrozen(report)); assert.ok(Object.isFrozen(report.ledger));
  assert.equal(val(inspectVaultAccounting(Object.assign(Object.create(null), record()), '100')).conservation, true);
});
test('hostile prototypes/descriptors and accessors stay inside fixed diagnostics without invoking getters', () => {
  let getters = 0;
  const access = record(); Object.defineProperty(access, 'available', { enumerable: true, get() { getters++; throw Error('PRIVATE_URL'); } });
  for (const input of [access, new Proxy(record(), { getPrototypeOf() { throw new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE_URL'); } }); } }),
    new Proxy(record(), { ownKeys() { throw Error('PRIVATE_URL'); } }),
    new Proxy(record(), { getOwnPropertyDescriptor() { throw Error('PRIVATE_URL'); } })]) {
    const result = inspectVaultAccounting(input, '100'); fail(result); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|URL/);
  }
  assert.equal(getters, 0);
});
