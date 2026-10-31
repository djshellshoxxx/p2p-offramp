import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evmTermsHash } from '../../wallet/src/evm-terms.ts';
const api = await import('../src/payment-preflight.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const vectors = JSON.parse(await readFile(new URL('../../wallet/test/fixtures/g16-evm-independent.json', import.meta.url), 'utf8'));
const native = vectors.vectors.find(vector => vector.id === 'native');
const binding = { chain: 'evm', networkId: native.terms.networkId, deploymentId: native.terms.deploymentId, tradeId: 'fixture-trade-01' };
const hash = '0x' + 'ab'.repeat(32);
function fixture() {
  const expected = { binding: { ...binding }, chainId: native.domain.chainId, verifyingContract: native.domain.verifyingContract,
    termsHash: native.termsHash, seller: native.terms.seller, buyer: native.terms.buyer, asset: native.terms.asset,
    amountBaseUnits: native.terms.amountBaseUnits, expiry: native.terms.escrowExpirySeconds };
  return { expected, observation: { binding: { ...binding }, chainId: expected.chainId, verifyingContract: expected.verifyingContract,
    anchor: { hash, height: '123' }, chainTime: { anchorHash: hash, anchorHeight: '123', seconds: (BigInt(expected.expiry) - 901n).toString() },
    finality: 'finalized', chainHealth: 'fresh', state: 'funded', trade: { termsHash: expected.termsHash, seller: expected.seller,
      buyer: expected.buyer, asset: expected.asset, amountBaseUnits: expected.amountBaseUnits, expiry: expected.expiry } },
    timing: { readStartedMonotonicMs: 1000, nowMonotonicMs: 1000, readGeneration: 0, currentGeneration: 0 } };
}
function evaluate(input) {
  assert.equal(typeof api.evaluatePaymentPreflightFixture, 'function', 'missing private funded-trade payment preflight');
  return api.evaluatePaymentPreflightFixture(input);
}
function value(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
function error(result, code) { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /SECRET|https:\/\//); }

test('funded G16 fixture permits only fixture guidance with 901 seconds left even after acceptance expiry', () => {
  assert.equal(evmTermsHash(native.domain, native.terms), native.termsHash, 'reuse the unchanged existing digest vector');
  const input = fixture(), before = structuredClone(input), result = value(evaluate(input));
  assert.ok(BigInt(input.observation.chainTime.seconds) > BigInt(native.terms.acceptBeforeSeconds));
  assert.equal(result.decision, 'allow-guidance'); assert.equal(result.reason, 'ok'); assert.equal(result.remainingSeconds, '901');
  assert.equal(result.checkedChainTime, input.observation.chainTime.seconds); assert.equal(result.finalizedAnchor, hash);
  assert.equal(result.evidence, 'fixture-only'); assert.equal(result.economicPreparationAllowed, false);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.binding), true); assert.deepEqual(input, before);
});

test('the fixed payment buffer blocks at 900 seconds, at expiry and after expiry', () => {
  for (const remaining of [901n, 900n, 899n, 0n, -1n]) {
    const input = fixture(); input.observation.chainTime.seconds = (BigInt(input.expected.expiry) - remaining).toString();
    const result = value(evaluate(input));
    assert.equal(result.remainingSeconds, remaining.toString()); assert.equal(result.reason, remaining > 900n ? 'ok' : 'near-expiry');
    assert.equal(result.decision, remaining > 900n ? 'allow-guidance' : 'block'); assert.equal(result.economicPreparationAllowed, false);
  }
});

test('strict 30-second monotonic freshness, clock reversal and resume generation block stale guidance', () => {
  for (const [age, reason] of [[29999.5, 'ok'], [30000, 'stale'], [30001, 'stale'], [-1, 'stale']]) {
    const input = fixture(); input.timing.nowMonotonicMs += age;
    const result = value(evaluate(input)); assert.equal(result.reason, reason); assert.equal(result.remainingSeconds, '901');
  }
  for (const change of ['resume', 'stale']) {
    const input = fixture(); if (change === 'resume') input.timing.currentGeneration++; else input.observation.chainHealth = 'stale';
    const result = value(evaluate(input)); assert.equal(result.reason, 'stale'); assert.equal(result.decision, 'block');
  }
  const input = fixture(); input.timing.nowMonotonicMs = Number.MAX_SAFE_INTEGER;
  const result = value(evaluate(input)); assert.equal(result.reason, 'stale'); assert.equal(result.checkedChainTime, input.observation.chainTime.seconds);
});

test('every expected trade binding, native identity and immutable term must match', () => {
  for (const field of ['chain', 'networkId', 'deploymentId', 'tradeId']) {
    const input = fixture(); input.observation.binding[field] = field === 'chain' ? 'solana' : 'other';
    assert.equal(value(evaluate(input)).reason, 'mismatch', field);
  }
  for (const [field, replacement] of [['chainId', '1'], ['verifyingContract', '0x' + '55'.repeat(20)]]) {
    const input = fixture(); input.observation[field] = replacement; assert.equal(value(evaluate(input)).reason, 'mismatch', field);
  }
  for (const [field, replacement] of [['termsHash', 'f'.repeat(64)], ['seller', native.terms.buyer], ['buyer', native.terms.seller],
    ['asset', '0x' + '55'.repeat(20)], ['amountBaseUnits', '1'], ['expiry', '1700086401']]) {
    const input = fixture(); input.observation.trade[field] = replacement;
    const result = value(evaluate(input)); assert.equal(result.reason, 'mismatch', field); assert.equal(result.decision, 'block');
  }
});

test('missing, unavailable and unfinalized fixture evidence cannot manufacture a canonical preflight', () => {
  for (const kind of ['observation', 'time', 'trade', 'loading', 'unavailable', 'pending', 'confirmed']) {
    const input = fixture();
    if (kind === 'observation') input.observation = null;
    else if (kind === 'time') input.observation.chainTime = null;
    else if (kind === 'trade') input.observation.trade = null;
    else if (kind === 'loading' || kind === 'unavailable') input.observation.chainHealth = kind;
    else input.observation.finality = kind;
    error(evaluate(input), 'UNAVAILABLE');
  }
});

test('reorg or timestamp from another anchor refuses without exposing a misleading preflight', () => {
  for (const kind of ['reorg', 'hash', 'height']) {
    const input = fixture();
    if (kind === 'reorg') input.observation.chainHealth = 'reorged';
    if (kind === 'hash') input.observation.chainTime.anchorHash = '0x' + 'cd'.repeat(32);
    if (kind === 'height') input.observation.chainTime.anchorHeight = '124';
    error(evaluate(input), 'INTEGRITY_FAILURE');
  }
});

test('absent and terminal trades never receive actionable payment guidance', () => {
  for (const state of ['absent', 'released', 'refunded']) {
    const input = fixture(); input.observation.state = state; if (state === 'absent') input.observation.trade = null;
    const result = value(evaluate(input)); assert.equal(result.reason, 'unfunded'); assert.equal(result.decision, 'block');
  }
});

test('bounded canonical integers reject money floats, ambiguous encodings, overflow and oversized data', () => {
  for (const amount of [1, '0', '01', '-1', '1.0', '1e18', ((1n << 256n)).toString()]) {
    const input = fixture(); input.expected.amountBaseUnits = amount; error(evaluate(input), 'INVALID_INPUT');
  }
  const huge = fixture(); huge.expected.amountBaseUnits = '9'.repeat(1000000); error(evaluate(huge), 'LIMIT_EXCEEDED');
  for (const field of ['expiry', 'seconds']) {
    const input = fixture(); if (field === 'expiry') input.expected.expiry = (1n << 64n).toString(); else input.observation.chainTime.seconds = (1n << 64n).toString();
    error(evaluate(input), 'INVALID_INPUT');
  }
  for (const number of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, '1000']) {
    const input = fixture(); input.timing.nowMonotonicMs = number; error(evaluate(input), 'INVALID_INPUT');
  }
  const generation = fixture(); generation.timing.currentGeneration = 0.5; error(evaluate(generation), 'INVALID_INPUT');
  for (const kind of ['contract', 'seller', 'participants', 'expiry']) {
    const input = fixture();
    if (kind === 'contract') input.expected.verifyingContract = '0x' + '00'.repeat(20);
    if (kind === 'seller') input.expected.seller = '0x' + '00'.repeat(20);
    if (kind === 'participants') input.expected.buyer = input.expected.seller;
    if (kind === 'expiry') input.expected.expiry = '0';
    error(evaluate(input), 'INVALID_INPUT');
  }
});

test('full-width principal equality stays exact and native address case does not change byte identity', () => {
  for (const amount of ['9007199254740993', ((1n << 256n) - 1n).toString()]) {
    const input = fixture(), termsHash = evmTermsHash(native.domain, { ...native.terms, amountBaseUnits: amount });
    Object.assign(input.expected, { amountBaseUnits: amount, termsHash }); Object.assign(input.observation.trade, { amountBaseUnits: amount, termsHash });
    assert.equal(value(evaluate(input)).reason, 'ok');
    input.observation.trade.amountBaseUnits = (BigInt(amount) - 1n).toString(); assert.equal(value(evaluate(input)).reason, 'mismatch');
  }
  const input = fixture(); input.expected.seller = '0x' + 'ab'.repeat(20); input.observation.trade.seller = '0x' + 'AB'.repeat(20);
  const termsHash = evmTermsHash(native.domain, { ...native.terms, seller: input.expected.seller });
  input.expected.termsHash = termsHash; input.observation.trade.termsHash = termsHash;
  assert.equal(value(evaluate(input)).reason, 'ok');
});

test('unknown fields, accessors, prototypes and revoked proxies fail with fixed errors and no getter execution', () => {
  const extra = fixture(); extra.observation.privateInstructions = 'SECRET https://private.invalid'; error(evaluate(extra), 'INVALID_INPUT');
  const symbol = fixture(); symbol[Symbol('unknown')] = true; error(evaluate(symbol), 'INVALID_INPUT');
  let calls = 0;
  for (const target of ['expected', 'timing', 'observation', 'trade', 'time']) {
    const input = fixture(), object = target === 'trade' ? input.observation.trade : target === 'time' ? input.observation.chainTime : input[target];
    const key = Object.keys(object)[0]; Object.defineProperty(object, key, { get() { calls++; throw Error('SECRET accessor'); } });
    error(evaluate(input), 'INVALID_INPUT');
  }
  assert.equal(calls, 0);
  error(evaluate(Object.create(fixture())), 'INVALID_INPUT');
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); error(evaluate(revoked.proxy), 'INVALID_INPUT');
});

test('fixture output is detached, never authenticated and absent from the application facade', async () => {
  const input = fixture(), result = value(evaluate(input)); input.expected.binding.tradeId = 'changed';
  assert.equal(result.binding.tradeId, 'fixture-trade-01'); assert.equal(result.evidence, 'fixture-only'); assert.equal(result.economicPreparationAllowed, false);
  assert.doesNotMatch(JSON.stringify(result), /signature|privateAgreement|paymentInstructions|provider|authenticated/);
  const facade = await import('../index.ts'); assert.equal('evaluatePaymentPreflightFixture' in facade, false);
  const unsupported = fixture(); unsupported.expected.binding.chain = 'solana'; error(evaluate(unsupported), 'UNSUPPORTED_PROVIDER');
});
