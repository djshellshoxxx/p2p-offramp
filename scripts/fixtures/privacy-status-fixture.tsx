/** Synthetic ordinary/direct issuer only. Never included in an application build. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrivacyStatusPanel, type PrivacyStatusTransport, type PrivacyStatusEndpoints } from '../../apps/web/src/ui/PrivacyStatusPanel.tsx';
import { SessionTransportPolicy, MAX_TRANSPORT_OBSERVERS } from '../../packages/transport/src/policy.ts';
import { App } from '../../apps/web/src/ui/App.tsx';
import type { SettingsEndpointSource } from '../../apps/web/src/ui/PrivacyStatusPanel.tsx';
import type { AppServices } from '../../apps/web/src/app-services.ts';

const root = createRoot(document.getElementById('root')!);
let captures = 0, authorizations = 0;
function fixture(exhausted = false) {
  let expiresAt = performance.now() + 1000, registryListener = () => {};
  const metrics = { subscribed: 0, unsubscribed: 0, inspected: 0, delivered: 0 };
  const retained: (() => void)[] = [];
  const broker = new SessionTransportPolicy({ trustedRegistry: {
    inspect: channel => ({ channel, coverage: 'direct', adapterId: 'browser-fixture-direct', expiresAt }),
    capture: () => { captures++; return null; },
    subscribeInvalidation: listener => { registryListener = listener; return () => {}; },
  } });
  broker.authorize = () => { authorizations++; throw new Error('Fixture forbids authorization'); };
  const held: (() => void)[] = [];
  const exhaust = () => { for (let index = held.length; index < MAX_TRANSPORT_OBSERVERS; index++) held.push(broker.subscribeInvalidation(() => {})); };
  if (exhausted) exhaust();
  const transport: PrivacyStatusTransport = {
    get mode() { return broker.mode; }, get generation() { return broker.generation; },
    inspect(channel) { metrics.inspected++; return broker.inspect(channel); },
    subscribeInvalidation(listener) {
      const callback = () => { metrics.delivered++; listener(); };
      const off = broker.subscribeInvalidation(callback);
      retained.push(callback); metrics.subscribed++;
      return () => { metrics.unsubscribed++; off(); };
    },
  };
  return { broker, transport, metrics, exhaust, renew() { expiresAt = performance.now() + 1000; registryListener(); }, late() { retained.forEach(listener => listener()); }, cleanup() { held.forEach(off => off()); broker.dispose(); } };
}
const fixtures = [fixture(), fixture(), fixture(true), fixture()];
/** Explicit test-only connection configuration. The unconfigured broker supplies
 * observer lifecycle semantics only; these URLs establish no route evidence. */
function endpointFixture(name: string, exhausted = false) {
  let generation = 0, observedAt = Math.floor(performance.now()), expiresAt = observedAt + 1000, available = true;
  const metrics = { subscribed: 0, unsubscribed: 0, inspected: 0, generationReads: 0, delivered: 0 };
  const retained: (() => void)[] = [], held: (() => void)[] = [];
  const broker = new SessionTransportPolicy();
  broker.authorize = () => { authorizations++; throw new Error('Fixture forbids authorization'); };
  const exhaust = () => { for (let index = held.length; index < MAX_TRANSPORT_OBSERVERS; index++) held.push(broker.subscribeInvalidation(() => {})); };
  if (exhausted) exhaust();
  const endpoints: PrivacyStatusEndpoints = {
    get generation() { metrics.generationReads++; return generation; },
    read() {
      metrics.inspected++;
      return { version: 1, generation, observedAt, expiresAt, endpoints: available ? [
        { channel: 'rpc', id: 'node-' + name, configuredUrl: `https://NODE-${name}.fixture.invalid:443/PRIVATE_ENDPOINT_SENTINEL?key=PRIVATE_ENDPOINT_SENTINEL`, connectionUrl: 'https://app.fixture.invalid/rpc?key=PRIVATE_ENDPOINT_SENTINEL' },
        { channel: 'relay', id: 'relay-' + name, configuredUrl: `wss://relay-${name}.fixture.invalid/socket/PRIVATE_ENDPOINT_SENTINEL`, connectionUrl: 'ws://127.0.0.1:4321/PRIVATE_ENDPOINT_SENTINEL' },
      ] : [] };
    },
    subscribeInvalidation(listener) {
      const callback = () => { metrics.delivered++; listener(); };
      const off = broker.subscribeInvalidation(callback);
      retained.push(callback); metrics.subscribed++;
      return () => { metrics.unsubscribed++; off(); };
    },
  };
  return { endpoints, metrics, exhaust,
    renew() { generation++; available = true; observedAt = Math.floor(performance.now()); expiresAt = observedAt + 1000; broker.invalidate(); },
    revoke() { generation++; available = false; broker.invalidate(); },
    dispose() { generation++; available = false; broker.dispose(); },
    late() { retained.forEach(listener => listener()); },
    cleanup() { held.forEach(off => off()); broker.dispose(); },
  };
}
const endpointFixtures = [endpointFixture('a'), endpointFixture('b'), endpointFixture('c', true), endpointFixture('d')];
// This test composition exposes only a local selection and synthetic endpoint snapshots.
let scope = 1;
const unlocked = { state: 'unlocked' } as const, locked = { state: 'locked' } as const;
let status: typeof unlocked | typeof locked = unlocked;
const listeners = new Set<() => void>();
const selection = {
  selectionScope: () => scope,
  getSnapshot: () => status,
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
} as AppServices;
const sourceFor = (index: number): SettingsEndpointSource => ({ services: selection, scope, port: endpointFixtures[index].endpoints });
let source = sourceFor(0);
let selected = 0;
let attached = true;
let endpointMode = false, selectedEndpoint = 0, endpointAttached = true;
// Only the panel's read-only local observation projection is synthetic; no vault commands exist.
const syntheticLocalService = { selectionScope: () => 1, getSnapshot: () => ({ state: 'locked' as const }) } as AppServices;
const render = () => root.render(<><h1>{endpointMode ? 'Test-only endpoint configuration; no route evidence' : 'Test-only direct broker and synthetic locked-service observation'}</h1>{endpointMode ?
  <App services={selection} privacyEndpoints={endpointAttached ? source : null} /> :
  <PrivacyStatusPanel services={syntheticLocalService} scope={1} transport={attached ? fixtures[selected].transport : null} />}</>);
Object.assign(window, { privacyFixture: {
  select(index: number) { selected = index; render(); },
  detach() { attached = false; render(); },
  reattachSameExhausted() { fixtures[selected].exhaust(); attached = true; render(); },
  strict() { fixtures[selected].broker.setMode('strict'); },
  revoke() { fixtures[selected].broker.revoke('browser-fixture-direct'); },
  renew() { fixtures[selected].renew(); },
  dispose() { fixtures[selected].broker.dispose(); },
  late(index: number) { fixtures[index].late(); },
  unmount() { root.unmount(); },
  snapshot() { return { metrics: fixtures.map(item => ({ ...item.metrics })), captures, authorizations }; },
  cleanup() { fixtures.forEach(item => item.cleanup()); },
} });
Object.assign(window, { privacyEndpointFixture: {
  mount() { endpointMode = true; render(); },
  changeSelection(open: boolean) { scope++; status = open ? unlocked : locked; for (const fn of listeners) fn(); },
  bindSelection() { source = sourceFor(selectedEndpoint); render(); },
  select(index: number) { if (!Number.isInteger(index) || index < 0 || index >= endpointFixtures.length) throw new Error('Invalid fixture index'); selectedEndpoint = index; source = sourceFor(index); render(); },
  detach() { endpointAttached = false; render(); },
  reattachSameExhausted() { endpointFixtures[selectedEndpoint].exhaust(); endpointAttached = true; render(); },
  renew() { endpointFixtures[selectedEndpoint].renew(); },
  revoke() { endpointFixtures[selectedEndpoint].revoke(); },
  dispose() { endpointFixtures[selectedEndpoint].dispose(); },
  late(index: number) { endpointFixtures[index].late(); },
  unmount() { root.unmount(); },
  snapshot() { return { metrics: endpointFixtures.map(item => ({ ...item.metrics })), captures, authorizations }; },
  cleanup() { endpointFixtures.forEach(item => item.cleanup()); fixtures.forEach(item => item.cleanup()); },
} });
render();
