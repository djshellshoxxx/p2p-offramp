import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLiquidityReference } from '../index.ts';

const MAKER = '0x' + '11'.repeat(20), TAKER = '0x' + '22'.repeat(20), OTHER = '0x' + '33'.repeat(20);
const HASH = '0x' + 'ab'.repeat(32), MAX = (1n << 256n) - 1n;
const options = { domainId: 'local-model', maker: MAKER, assetId: 'native', networkId: 'local-evm', deploymentId: 'local-basic' };
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fail = (result, code) => { assert.equal(result.ok, false, 'expected failure'); if (code) assert.equal(result.error.code, code); assert.equal(result.error.retryable, false); return result.error.code; };
function setup(port) {
  let time = 100n, active = true;
  const model = val(createLiquidityReference(options, { readContext: port ?? (() => ({ active, chainTimeSeconds: String(time) })) }));
  return { model, time(value) { time = BigInt(value); }, retire() { active = false; } };
}
const quote = (changes = {}) => ({ quoteId: 'q1', maker: MAKER, taker: TAKER, binding: { chain: 'evm', networkId: options.networkId, deploymentId: options.deploymentId, tradeId: HASH },
  termsHash: HASH, assetId: 'native', principal: '30', fee: '0', nonce: 'n1', expiresAtSeconds: '220', ...changes });
const deposit = (model, amount = '100') => val(model.apply({ kind: 'deposit', actor: MAKER, amount, received: amount }));
const reserve = (model, q = quote(), outcome = 'applied') => model.apply({ kind: 'reserve', actor: q.taker, quote: q, outcome });
const consume = (model, q = quote(), outcome = 'applied', changes = {}) => model.apply({ kind: 'consume', actor: q.taker, quoteId: q.quoteId, termsHash: q.termsHash, amount: q.principal, outcome, ...changes });
const unchanged = (model, before) => assert.deepEqual(model.view(), before);

test('observing or copying a quote never reserves native or simulated capacity; returned data is detached and immutable', () => {
  const { model } = setup(); deposit(model); const before = model.view(), q = quote();
  const seen = val(model.observeQuote(q)); assert.equal(seen.simulatedState, 'unreserved'); assert.equal(seen.nativeReservationStatus, 'unavailable'); unchanged(model, before);
  val(reserve(model, q)); q.principal = '1'; q.binding.tradeId = 'forged';
  const current = model.view(); assert.equal(current.ledger.reserved, '30'); assert.equal(current.reservations[0].quote.principal, '30');
  for (const value of [current, current.options, current.ledger, current.reservations, current.reservations[0], current.reservations[0].quote, current.reservations[0].quote.binding]) assert.ok(Object.isFrozen(value));
  assert.equal(current.diagnosticOnly, true); assert.equal(current.economicAuthority, false); assert.equal(current.nativeReservationStatus, 'unavailable');
});
test('independent Python integer oracle covers 160 mixed conservation transitions with separate custody/donations', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/conservation-python-v1.json', import.meta.url), 'utf8'));
  assert.equal(fixture.authority, false); let checked = 0;
  for (const scenario of fixture.scenarios) {
    const s = setup(); let revision = 0;
    for (const row of scenario.rows) {
      s.time(row.at); const current = val(s.model.apply(row.command));
      for (const [field, expected] of Object.entries(row.expected.ledger)) assert.equal(current.ledger[field], expected, `seed${scenario.seed}/${checked}/${field}`);
      assert.equal(current.accounting.custodyBalance, row.expected.custody); assert.equal(current.accounting.surplus, row.expected.surplus);
      assert.equal(current.accounting.conservation, true); assert.equal(current.accounting.solvent, true); assert.equal(current.revision, ++revision); checked++;
    }
  }
  assert.equal(checked, 160);
});
test('maker/taker, complete binding, asset, fee, terms and exact amount substitutions refuse atomically', () => {
  const { model } = setup(); deposit(model); const before = model.view();
  for (const q of [quote({ maker: OTHER }), quote({ taker: MAKER }), quote({ assetId: 'token' }), quote({ fee: '1' }), quote({ fee: 0 }),
    quote({ binding: { ...quote().binding, chain: 'solana' } }), quote({ binding: { ...quote().binding, networkId: 'foreign' } }),
    quote({ binding: { ...quote().binding, deploymentId: 'foreign' } }), quote({ principal: '0' }), quote({ principal: '01' }), quote({ expiresAtSeconds: '221' })]) {
    fail(reserve(model, q)); unchanged(model, before);
  }
  fail(model.apply({ kind: 'deposit', actor: OTHER, amount: '10', received: '10' }), 'UNAUTHORIZED'); unchanged(model, before);
  val(reserve(model)); const reserved = model.view();
  for (const changes of [{ actor: OTHER }, { termsHash: '0x' + 'ef'.repeat(32) }, { amount: '29' }, { amount: '31' }]) { fail(consume(model, quote(), 'applied', changes)); unchanged(model, reserved); }
});
test('duplicate nonce/quote, changed payload, simultaneous capacity and consumed trade identity cannot be reused', () => {
  const { model } = setup(); deposit(model); val(reserve(model)); const before = model.view();
  for (const q of [quote(), quote({ principal: '31' }), quote({ quoteId: 'q2' }), quote({ quoteId: 'q2', nonce: 'n2', principal: '71' })]) { fail(reserve(model, q), 'CONFLICT'); unchanged(model, before); }
  const q2 = quote({ quoteId: 'q2', nonce: 'n2' }); val(reserve(model, q2)); val(consume(model));
  const consumed = model.view(); fail(consume(model, q2), 'CONFLICT'); unchanged(model, consumed);
  val(model.apply({ kind: 'cancel', actor: MAKER, quoteId: q2.quoteId }));
  fail(reserve(model, q2), 'CONFLICT'); fail(model.apply({ kind: 'expire', quoteId: q2.quoteId }), 'CONFLICT');
});
test('expiry -1/exact/+1 and explicit cancel/consume inclusion order preserve exact single-fill rights', () => {
  const a = setup(); deposit(a.model); val(reserve(a.model)); a.time(219); val(consume(a.model));
  fail(a.model.apply({ kind: 'cancel', actor: MAKER, quoteId: 'q1' }), 'CONFLICT'); fail(a.model.apply({ kind: 'expire', quoteId: 'q1' }), 'CONFLICT');
  for (const time of [220, 221]) {
    const s = setup(); deposit(s.model); val(reserve(s.model)); s.time(time); const before = s.model.view();
    fail(consume(s.model), 'EXPIRED'); unchanged(s.model, before); val(s.model.apply({ kind: 'expire', quoteId: 'q1' })); assert.equal(s.model.view().ledger.available, '100');
  }
  const b = setup(); deposit(b.model); val(reserve(b.model)); fail(b.model.apply({ kind: 'expire', quoteId: 'q1' }), 'CONFLICT');
  fail(b.model.apply({ kind: 'cancel', actor: TAKER, quoteId: 'q1' }), 'UNAUTHORIZED'); val(b.model.apply({ kind: 'cancel', actor: MAKER, quoteId: 'q1' })); fail(consume(b.model), 'CONFLICT');
});
test('failed exact transfer, funding and withdrawal leave the whole prior ledger/reservation/nonce state unchanged', () => {
  const { model } = setup(); deposit(model); let before = model.view();
  fail(model.apply({ kind: 'deposit', actor: MAKER, amount: '10', received: '9' }), 'INTEGRITY_FAILURE'); unchanged(model, before);
  fail(reserve(model, quote(), 'reverted'), 'UNAVAILABLE'); unchanged(model, before); val(reserve(model)); before = model.view();
  fail(consume(model, quote(), 'reverted'), 'UNAVAILABLE'); unchanged(model, before);
  fail(model.apply({ kind: 'withdraw', actor: MAKER, amount: '1', outcome: 'reverted' }), 'UNAVAILABLE'); unchanged(model, before);
  val(consume(model)); before = model.view(); fail(model.apply({ kind: 'refund', quoteId: 'q1', returned: '29' }), 'INTEGRITY_FAILURE'); unchanged(model, before);
  val(model.apply({ kind: 'refund', quoteId: 'q1', returned: '30' })); assert.equal(model.view().ledger.available, '100'); assert.equal(model.view().accounting.custodyBalance, '100');
  fail(model.apply({ kind: 'refund', quoteId: 'q1', returned: '30' }), 'CONFLICT'); fail(model.apply({ kind: 'release', quoteId: 'q1' }), 'CONFLICT');
});
test('undercollateralization stops new allocations and protects reserves while preserving mathematically safe available withdrawal', () => {
  const { model } = setup(); deposit(model); val(reserve(model)); val(model.apply({ kind: 'observe-custody', balance: '50' }));
  const before = model.view(); assert.equal(before.health, 'insolvent'); assert.equal(before.accounting.safeAvailableWithdrawal, '20');
  fail(model.apply({ kind: 'deposit', actor: MAKER, amount: '1', received: '1' }), 'INTEGRITY_FAILURE');
  fail(reserve(model, quote({ quoteId: 'q2', nonce: 'n2', principal: '1' })), 'INTEGRITY_FAILURE'); fail(consume(model), 'INTEGRITY_FAILURE');
  fail(model.apply({ kind: 'withdraw', actor: MAKER, amount: '21', outcome: 'applied' }), 'CONFLICT'); unchanged(model, before);
  val(model.apply({ kind: 'withdraw', actor: MAKER, amount: '20', outcome: 'applied' })); assert.equal(model.view().accounting.custodyBalance, '30'); assert.equal(model.view().ledger.reserved, '30');
  val(model.apply({ kind: 'donation', amount: '50' })); assert.equal(model.view().health, 'consistent'); assert.equal(model.view().ledger.deposited, '100'); assert.equal(model.view().ledger.available, '50');
});
test('unknown reserve/consume/withdraw and reorg retain uncertainty across expiry, balances and explicit resubmission attempts', () => {
  for (const action of ['reserve', 'consume', 'withdraw', 'reorg']) {
    const s = setup(); deposit(s.model); if (action !== 'reserve' && action !== 'withdraw') val(reserve(s.model));
    const before = s.model.view();
    if (action === 'reserve') fail(reserve(s.model, quote(), 'unknown'), 'BROADCAST_UNKNOWN');
    else if (action === 'consume') fail(consume(s.model, quote(), 'unknown'), 'BROADCAST_UNKNOWN');
    else if (action === 'withdraw') fail(s.model.apply({ kind: 'withdraw', actor: MAKER, amount: '10', outcome: 'unknown' }), 'BROADCAST_UNKNOWN');
    else fail(s.model.apply({ kind: 'reorg' }), 'BROADCAST_UNKNOWN');
    const unresolved = s.model.view(); assert.equal(unresolved.health, 'reconciliation-required'); assert.deepEqual(unresolved.ledger, before.ledger);
    s.time(10000); for (const command of [{ kind: 'expire', quoteId: 'q1' }, { kind: 'cancel', actor: MAKER, quoteId: 'q1' },
      { kind: 'observe-custody', balance: '100' }, { kind: 'withdraw', actor: MAKER, amount: '1', outcome: 'applied' }]) {
      fail(s.model.apply(command), 'BROADCAST_UNKNOWN'); unchanged(s.model, unresolved);
    }
    assert.equal(unresolved.pendingSimulationAction, action);
  }
});
test('uint256 maximum can reserve/consume/refund/withdraw exactly and overflows never partially commit', () => {
  const { model } = setup(); deposit(model, String(MAX)); const before = model.view();
  fail(model.apply({ kind: 'deposit', actor: MAKER, amount: '1', received: '1' }), 'LIMIT_EXCEEDED'); unchanged(model, before);
  fail(model.apply({ kind: 'donation', amount: '1' }), 'LIMIT_EXCEEDED'); unchanged(model, before);
  const q = quote({ principal: String(MAX) }); val(reserve(model, q)); val(consume(model, q)); val(model.apply({ kind: 'refund', quoteId: 'q1', returned: String(MAX) }));
  val(model.apply({ kind: 'withdraw', actor: MAKER, amount: String(MAX), outcome: 'applied' }));
  assert.equal(model.view().ledger.withdrawn, String(MAX)); assert.equal(model.view().accounting.custodyBalance, '0'); assert.equal(model.view().accounting.conservation, true);
});
test('lifetime identifier storage is capped at256 identifiers and never evicts terminal replay protection', () => {
  const { model } = setup(); deposit(model);
  for (let n = 0; n < 128; n++) { const q = quote({ quoteId: 'q' + n, nonce: 'n' + n, principal: '1' }); val(reserve(model, q)); val(model.apply({ kind: 'cancel', actor: MAKER, quoteId: q.quoteId })); }
  const before = model.view(); assert.equal(before.reservations.length, 128);
  fail(reserve(model, quote({ quoteId: 'q129', nonce: 'n129' })), 'LIMIT_EXCEEDED'); unchanged(model, before);
  fail(reserve(model, quote({ quoteId: 'q0', nonce: 'n0' })), 'CONFLICT'); unchanged(model, before);
});
test('admission precedes hostile parsing and clock callbacks; reentry is denied and scope retirement never publishes a mutation', () => {
  let model, nested, closeOnClock = false;
  const s = setup(() => { if (model) { nested = model.apply({ kind: 'donation', amount: '1' }); if (closeOnClock) model.close(); } return { active: true, chainTimeSeconds: '100' }; }); model = s.model;
  deposit(model); fail(nested, 'CONFLICT'); const before = model.view();
  const hostile = new Proxy({ kind: 'donation', amount: '1' }, { getPrototypeOf(target) { nested = model.apply({ kind: 'donation', amount: '1' }); model.close(); return Object.getPrototypeOf(target); } });
  fail(model.apply(hostile), 'LOCKED'); fail(nested, 'CONFLICT'); assert.deepEqual(model.view().ledger, before.ledger); assert.equal(model.view().revision, before.revision);
  const other = setup(() => { if (closeOnClock) other.model.close(); return { active: true, chainTimeSeconds: '100' }; });
  deposit(other.model); closeOnClock = true; fail(other.model.apply({ kind: 'donation', amount: '1' }), 'LOCKED'); assert.equal(other.model.view().revision, 1);
});
test('final context time suppresses expiry-crossing consumes; rollback/inactive contexts retire rather than reset', () => {
  let reads = 0, time = '100', flip = false;
  const s = setup(() => { reads++; return { active: true, chainTimeSeconds: flip && reads % 2 === 0 ? '220' : time }; });
  deposit(s.model); val(reserve(s.model)); const before = s.model.view(); flip = true;
  fail(consume(s.model), 'EXPIRED'); unchanged(s.model, before); flip = false; time = '99'; fail(s.model.apply({ kind: 'donation', amount: '1' }), 'INTEGRITY_FAILURE');
  assert.equal(s.model.view().health, 'closed'); time = '10000'; fail(s.model.apply({ kind: 'donation', amount: '1' }), 'LOCKED');
  const inactive = setup(); deposit(inactive.model); inactive.retire(); fail(inactive.model.apply({ kind: 'donation', amount: '1' }), 'LOCKED'); assert.equal(inactive.model.view().revision, 1);
});
test('unknown keys, accessor fields and hostile thrown values never expose provider diagnostics or invoke getters', () => {
  const s = setup(); deposit(s.model); const before = s.model.view(); let getters = 0;
  const accessor = { kind: 'donation' }; Object.defineProperty(accessor, 'amount', { enumerable: true, get() { getters++; throw Error('PRIVATE'); } });
  for (const command of [accessor, { kind: 'donation', amount: '1', extra: true }, new Proxy({ kind: 'donation', amount: '1' }, { getOwnPropertyDescriptor() { throw new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE'); } }); } })]) {
    const result = s.model.apply(command); fail(result); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/); unchanged(s.model, before);
  }
  assert.equal(getters, 0);
});
