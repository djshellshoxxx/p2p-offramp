/** Synthetic ordinary/direct issuer only. Never included in an application build. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrivacyStatusPanel, type PrivacyStatusTransport } from '../../apps/web/src/ui/PrivacyStatusPanel.tsx';
import { SessionTransportPolicy, MAX_TRANSPORT_OBSERVERS } from '../../packages/transport/src/policy.ts';
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
let selected = 0;
let attached = true;
// Only the panel's read-only local observation projection is synthetic; no vault commands exist.
const syntheticLocalService = { selectionScope: () => 1, getSnapshot: () => ({ state: 'locked' as const }) } as AppServices;
const render = () => root.render(<><h1>Test-only direct broker and synthetic locked-service observation</h1><PrivacyStatusPanel services={syntheticLocalService} scope={1} transport={attached ? fixtures[selected].transport : null} /></>);
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
render();
