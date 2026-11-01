import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivacyViewReader } from '../src/privacy-view.ts';
import { SessionTransportPolicy } from '../../transport/src/policy.ts';

const value = result => { assert.equal(result.ok, true); return result.value; };
const observation = state => ({ state, observedAt: 100, expiresAt: 200 });
const snapshot = () => ({ version: 1, generation: 7, vault: observation('unlocked'), messaging: null, proof: observation('unavailable') });
const fixtures = () => {
  let time = 100;
  const observations = { generation: 7, read: snapshot };
  const transport = { generation: 0, mode: 'ordinary', inspect: channel => ({ channel, coverage: channel === 'relay' ? 'verified-private' : 'direct', generation: 0, adapterId: 'fixture-only' }) };
  return { observations, transport, clock: () => time, setTime: next => { time = next; } };
};

test('missing services stay unknown, independent disclosures and immutable result never authorize', () => {
  const result = createPrivacyViewReader({ monotonicNow: () => 100 }).buildPrivacyView(null);
  const view = value(result);
  assert.equal(view.routes.length, 6);
  assert.equal(view.selectedPolicy, null);
  assert.ok(view.routes.every(route => route.selectedPolicy === null));
  assert.ok(view.routes.every(route => route.state === 'unknown'));
  assert.equal(view.vault.state, 'unknown');
  assert.equal(view.messaging.state, 'unknown');
  assert.equal(view.proof.state, 'unknown');
  assert.equal(view.publicChain, 'public-metadata-visible');
  assert.equal(view.manualFiat, 'seller-attestation-not-payment-proof');
  assert.equal(view.economicPreparationAllowed, false);
  for (const item of [result, view, view.routes, ...view.routes, view.vault, view.messaging, view.proof]) assert.ok(Object.isFrozen(item));
});

test('selected strict policy blocks observed direct paths without changing independent capabilities', () => {
  const fixture = fixtures();
  const reader = createPrivacyViewReader({ ...fixture, monotonicNow: fixture.clock });
  const strict = value(reader.buildPrivacyView('strict', 7));
  assert.equal(strict.routes.find(route => route.channel === 'relay').state, 'verified-private');
  assert.equal(strict.routes.find(route => route.channel === 'wallet').state, 'blocked');
  assert.equal(strict.routes[0].selectedPolicy, 'strict');
  assert.equal(strict.routes[0].observedPolicy, 'ordinary');
  assert.equal(strict.routes[0].observedAt, 100);
  assert.equal(strict.routes[0].expiresAt, null);
  assert.equal(strict.vault.state, 'unlocked');
  assert.equal(strict.messaging.state, 'unknown');
  assert.equal(strict.proof.state, 'unavailable');
  assert.equal(value(reader.buildPrivacyView('ordinary')).routes[0].state, 'direct');
});

test('broker is reread each time; actual unconfigured G05 never becomes configured coverage', () => {
  const broker = new SessionTransportPolicy();
  const reader = createPrivacyViewReader({ transport: broker, monotonicNow: () => 100 });
  assert.ok(value(reader.buildPrivacyView('ordinary')).routes.every(route => route.state === 'unknown'));
  const fixture = fixtures();
  let reads = 0;
  fixture.transport.inspect = channel => { reads++; return { channel, coverage: reads <= 6 ? 'verified-private' : 'unknown', generation: 0, adapterId: 'fixture-only' }; };
  const tracked = createPrivacyViewReader({ transport: fixture.transport, monotonicNow: fixture.clock });
  assert.ok(value(tracked.buildPrivacyView('ordinary')).routes.every(route => route.state === 'verified-private'));
  assert.ok(value(tracked.buildPrivacyView('ordinary')).routes.every(route => route.state === 'unknown'));
  assert.equal(reads, 12);
  broker.dispose();
});

test('TTL expiry, oversized lifetime and clock reversal cannot retain positive capabilities', () => {
  const fixture = fixtures();
  const reader = createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock });
  assert.equal(value(reader.buildPrivacyView('ordinary')).vault.state, 'unlocked');
  fixture.setTime(200);
  assert.equal(value(reader.buildPrivacyView('ordinary')).vault.reason, 'expired');
  fixture.setTime(199);
  assert.equal(value(reader.buildPrivacyView('ordinary')).vault.reason, 'clock-reversed');
  fixture.setTime(300);
  assert.equal(value(reader.buildPrivacyView('ordinary')).vault.reason, 'clock-reversed');
  fixture.observations.read = () => ({ ...snapshot(), vault: { state: 'unlocked', observedAt: 100, expiresAt: 30_101 } });
  assert.equal(value(createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock }).buildPrivacyView('ordinary')).vault.reason, 'invalid-observation');
});

test('scope and torn transport generations invalidate observations, including cross-port invalidation', () => {
  const fixture = fixtures();
  const reader = createPrivacyViewReader({ ...fixture, monotonicNow: fixture.clock });
  assert.equal(value(reader.buildPrivacyView('ordinary', 8)).vault.reason, 'scope-changed');
  fixture.transport.inspect = channel => { fixture.observations.generation++; return { channel, coverage: 'verified-private', generation: 0, adapterId: 'fixture-only' }; };
  const torn = value(reader.buildPrivacyView('ordinary'));
  assert.equal(torn.vault.reason, 'scope-changed');
  assert.ok(torn.routes.every(route => route.state === 'unknown'));
  const other = fixtures();
  other.transport.inspect = channel => { other.transport.generation++; return { channel, coverage: 'verified-private', generation: 0, adapterId: 'fixture-only' }; };
  assert.ok(value(createPrivacyViewReader({ transport: other.transport, monotonicNow: other.clock }).buildPrivacyView('ordinary')).routes.every(route => route.state === 'unknown'));
});

test('untrusted shapes/accessors and errors never escape or grant privacy coverage', () => {
  const fixture = fixtures();
  let getterCalls = 0;
  fixture.observations.read = () => ({ ...snapshot(), vault: { get state() { getterCalls++; return 'unlocked'; }, observedAt: 100, expiresAt: 200 } });
  let view = value(createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock }).buildPrivacyView('ordinary'));
  assert.equal(view.vault.reason, 'invalid-observation');
  assert.equal(view.proof.state, 'unavailable');
  assert.equal(getterCalls, 0);
  fixture.observations.read = () => ({ ...snapshot(), version: 2 });
  assert.equal(createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock }).buildPrivacyView('ordinary').error.code, 'UNSUPPORTED_VERSION');
  for (const raw of [{ ...snapshot(), SECRET: 'https://private' }, { ...snapshot(), generation: Number.MAX_SAFE_INTEGER + 1 }]) {
    fixture.observations.read = () => raw;
    view = value(createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock }).buildPrivacyView('ordinary'));
    assert.equal(view.vault.state, 'unknown');
    assert.doesNotMatch(JSON.stringify(view), /SECRET|https:/);
  }
  fixture.observations.read = () => { throw new Error('SECRET https://private'); };
  view = value(createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock }).buildPrivacyView('ordinary'));
  assert.equal(view.vault.reason, 'unavailable');
  assert.doesNotMatch(JSON.stringify(view), /SECRET|https:/);
});

test('expiry and clock reversal during a trusted callback invalidate before publication', () => {
  const fixture = fixtures();
  fixture.observations.read = () => { fixture.setTime(200); return snapshot(); };
  assert.equal(value(createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock }).buildPrivacyView('ordinary')).vault.reason, 'expired');
  fixture.setTime(100);
  fixture.observations.read = () => { fixture.setTime(99); return snapshot(); };
  assert.equal(value(createPrivacyViewReader({ observations: fixture.observations, monotonicNow: fixture.clock }).buildPrivacyView('ordinary')).vault.reason, 'clock-reversed');
});

test('invalid policy/scope/clock and dispose return fixed core errors', () => {
  const reader = createPrivacyViewReader({ monotonicNow: () => 100 });
  assert.equal(reader.buildPrivacyView('anonymous').error.code, 'INVALID_INPUT');
  assert.equal(reader.buildPrivacyView('ordinary', -1).error.code, 'INVALID_INPUT');
  assert.equal(createPrivacyViewReader({ monotonicNow: () => NaN }).buildPrivacyView('ordinary').error.code, 'INVALID_INPUT');
  reader.dispose();
  assert.equal(reader.buildPrivacyView('ordinary').error.code, 'CANCELLED');
});

test('final clock callbacks cannot publish after disposal or scope invalidation', () => {
  let reader, calls = 0;
  reader = createPrivacyViewReader({ monotonicNow() { if (++calls === 2) reader.dispose(); return 100; } });
  assert.equal(reader.buildPrivacyView(null).error.code, 'CANCELLED');
  const fixture = fixtures();
  calls = 0;
  reader = createPrivacyViewReader({ ...fixture, monotonicNow() { if (++calls === 2) { fixture.observations.generation++; fixture.transport.generation++; } return 100; } });
  const view = value(reader.buildPrivacyView('ordinary'));
  assert.equal(view.vault.state, 'unknown');
  assert.ok(view.routes.every(route => route.state === 'unknown'));
});

test('actual G05 owns positive coverage TTL, revocation and policy changes', () => {
  let time = 100;
  const registry = { inspect: channel => ({ channel, coverage: 'verified-private', adapterId: 'fixture-adapter', expiresAt: 200 }), capture: () => null, subscribeInvalidation: () => () => {} };
  const broker = new SessionTransportPolicy({ trustedRegistry: registry, now: () => time });
  const reader = createPrivacyViewReader({ transport: broker, monotonicNow: () => time });
  assert.ok(value(reader.buildPrivacyView('ordinary')).routes.every(route => route.state === 'verified-private'));
  broker.setMode('strict');
  const strict = value(reader.buildPrivacyView('strict'));
  assert.ok(strict.routes.every(route => route.state === 'verified-private' && route.observedPolicy === 'strict'));
  time = 200;
  assert.ok(value(reader.buildPrivacyView('strict')).routes.every(route => route.state === 'unknown'));
  time = 201;
  registry.inspect = channel => ({ channel, coverage: 'verified-private', adapterId: 'fixture-adapter', expiresAt: 300 });
  assert.ok(value(reader.buildPrivacyView('strict')).routes.every(route => route.state === 'verified-private'));
  broker.revoke('fixture-adapter');
  assert.ok(value(reader.buildPrivacyView('strict')).routes.every(route => route.state === 'unknown'));
  broker.dispose();
});

test('provider inspections can occur after initial clock tick, but never after completion', () => {
  let time = 100;
  const observations = { generation: 7, read() { time = 101; return { ...snapshot(), vault: { state: 'unlocked', observedAt: time, expiresAt: time + 100 } }; } };
  assert.equal(value(createPrivacyViewReader({ observations, monotonicNow: () => time }).buildPrivacyView(null)).vault.state, 'unlocked');
  observations.read = () => ({ ...snapshot(), vault: { state: 'unlocked', observedAt: 102, expiresAt: 202 } });
  assert.equal(value(createPrivacyViewReader({ observations, monotonicNow: () => time }).buildPrivacyView(null)).vault.reason, 'invalid-observation');
});
