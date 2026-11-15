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

const endpointSnapshot = (overrides = {}) => ({ version: 1, generation: 3, observedAt: 100, expiresAt: 200, endpoints: [
  { channel: 'rpc', id: 'node-a', configuredUrl: 'https://NODE.example:443/private/API-secret?token=SECRET', connectionUrl: 'https://app.example/rpc?key=SECRET' },
  { channel: 'relay', id: 'relay-a', configuredUrl: 'wss://relay.example/socket/private', connectionUrl: 'ws://127.0.0.1:1234/private' },
], ...overrides });
const endpointPort = read => ({ generation: 3, read: read ?? (() => endpointSnapshot()) });

test('trusted configured endpoints publish only detached normalized origins, never route authority', () => {
  const raw = endpointSnapshot(), port = endpointPort(() => raw);
  const view = value(createPrivacyViewReader({ endpoints: port, monotonicNow: () => 100 }).buildPrivacyView(null));
  assert.deepEqual(view.endpointDetails.endpoints, [
    { channel: 'rpc', id: 'node-a', configuredOrigin: 'https://node.example', connectionOrigin: 'https://app.example' },
    { channel: 'relay', id: 'relay-a', configuredOrigin: 'wss://relay.example', connectionOrigin: 'ws://127.0.0.1:1234' },
  ]);
  assert.equal(view.endpointDetails.reason, 'observed');assert.equal(view.endpointDetails.generation, 3);
  assert.ok(view.routes.every(row => row.state === 'unknown'));assert.equal(view.economicPreparationAllowed, false);
  raw.endpoints[0].configuredUrl = 'https://changed.example/';
  assert.equal(view.endpointDetails.endpoints[0].configuredOrigin, 'https://node.example');
  for (const item of [view.endpointDetails, view.endpointDetails.endpoints, ...view.endpointDetails.endpoints]) assert.ok(Object.isFrozen(item));
  assert.doesNotMatch(JSON.stringify(view), /SECRET|API-secret|\/private|\/socket|\?token/);
});

test('endpoint metadata cannot publish credentials, ambiguous URLs, unknown fields or unsupported channels', () => {
  let getterCalls = 0;
  const valid = endpointSnapshot().endpoints[0];
  const hostile = [
    { ...valid, configuredUrl: 'https://user:SECRET@node.example/' }, { ...valid, configuredUrl: 'https://@node.example/' },
    { ...valid, configuredUrl: 'https://node.example\\@SECRET.example/' }, { ...valid, configuredUrl: 'http://public.example/' },
    { ...valid, configuredUrl: 'ws://public.example/' }, { ...valid, configuredUrl: 'https://node.example/#SECRET' },
    { ...valid, configuredUrl: 'https://node.example/\nSECRET' }, { ...valid, configuredUrl: 'https://node.example/' + 'x'.repeat(2048) },
    { ...valid, channel: 'wallet' }, { ...valid, SECRET: 'SECRET' }, { ...valid, get configuredUrl() { getterCalls++; return 'https://SECRET.example/'; } },
  ];
  for (const entry of hostile) {
    const view = value(createPrivacyViewReader({ endpoints: endpointPort(() => endpointSnapshot({ endpoints: [entry] })), monotonicNow: () => 100 }).buildPrivacyView(null));
    assert.equal(view.endpointDetails.reason, 'invalid-observation');assert.deepEqual(view.endpointDetails.endpoints, []);
    assert.doesNotMatch(JSON.stringify(view), /SECRET/);
  }
  assert.equal(getterCalls, 0);
});

test('endpoint snapshots enforce exact shape, bounded rows and identities, monotonic TTL and generation', () => {
  const one = endpointSnapshot().endpoints[0];
  const invalid = [endpointSnapshot({ version: 2 }), endpointSnapshot({ SECRET: 'SECRET' }), endpointSnapshot({ generation: 4 }),
    endpointSnapshot({ expiresAt: 30_101 }), endpointSnapshot({ expiresAt: 100 }), endpointSnapshot({ observedAt: 101 }),
    endpointSnapshot({ endpoints: [one, { ...one }] }), endpointSnapshot({ endpoints: Array.from({ length: 33 }, (_, i) => ({ ...one, id: 'node-' + i })) }),
  ];
  for (const raw of invalid) {
    const view = value(createPrivacyViewReader({ endpoints: endpointPort(() => raw), monotonicNow: () => 100 }).buildPrivacyView(null));
    assert.equal(view.endpointDetails.reason, 'invalid-observation');assert.deepEqual(view.endpointDetails.endpoints, []);
  }
  assert.equal(value(createPrivacyViewReader({ monotonicNow: () => 100 }).buildPrivacyView(null)).endpointDetails.reason, 'not-observed');
  assert.equal(value(createPrivacyViewReader({ endpoints: endpointPort(), monotonicNow: () => 200 }).buildPrivacyView(null)).endpointDetails.reason, 'expired');
});

test('endpoint callbacks cannot publish across port, vault-scope or clock invalidation', () => {
  const f = fixtures(), port = endpointPort();
  port.read = () => { f.observations.generation++; return endpointSnapshot(); };
  let view = value(createPrivacyViewReader({ observations: f.observations, endpoints: port, monotonicNow: () => 100 }).buildPrivacyView(null));
  assert.equal(view.endpointDetails.reason, 'scope-changed');assert.deepEqual(view.endpointDetails.endpoints, []);
  const other = endpointPort();other.read = () => { other.generation++; return endpointSnapshot(); };
  view = value(createPrivacyViewReader({ endpoints: other, monotonicNow: () => 100 }).buildPrivacyView(null));
  assert.equal(view.endpointDetails.reason, 'scope-changed');
  let now = 100;const reversed = endpointPort(() => { now = 99;return endpointSnapshot(); });
  view = value(createPrivacyViewReader({ endpoints: reversed, monotonicNow: () => now }).buildPrivacyView(null));
  assert.equal(view.endpointDetails.reason, 'clock-reversed');
});

test('endpoint snapshots expire or revoke during later callbacks and never survive disposal', () => {
  let now = 100, reads = 0;const port = endpointPort();
  const reader = createPrivacyViewReader({ endpoints: port, monotonicNow() { if (++reads === 2) now = 200;return now; } });
  assert.equal(value(reader.buildPrivacyView(null)).endpointDetails.reason, 'expired');
  let revoked, calls = 0;revoked = createPrivacyViewReader({ endpoints: port, monotonicNow() { if (++calls === 2) port.generation++;return 100; } });
  assert.equal(value(revoked.buildPrivacyView(null)).endpointDetails.reason, 'scope-changed');
  let closed;closed = createPrivacyViewReader({ endpoints: endpointPort(() => { closed.dispose();return endpointSnapshot(); }), monotonicNow: () => 100 });
  assert.equal(closed.buildPrivacyView(null).error.code, 'CANCELLED');
});
