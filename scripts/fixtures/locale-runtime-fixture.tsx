/** Explicit development build only: real App/Worker/controller with compiled draft locale fixtures.
 * This file is excluded from every production artifact and grants no locale, wallet or release approval.
 */
import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../apps/web/src/ui/App.tsx';
import { localeStore, message } from '../../apps/web/src/ui/locale/runtime.ts';
import { startAppServices } from '../../apps/web/src/app-services.ts';
import { createTradeReviewController } from '../../apps/web/src/trade/review-controller.ts';
import { syntheticDemoSource } from '../../apps/web/src/demo/synthetic-local.ts';
import '../../apps/web/src/ui/app.css';

const result = await startAppServices();
if (!result.ok) throw new Error('Development locale fixture startup failed.');
const services = result.value, trade = createTradeReviewController({ source: syntheticDemoSource });
trade.setPersistence(services); await trade.loadRegistry();
function FixtureExamples() {
  useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getSnapshot);
  return <section data-locale-examples="draft-fixture-only">
    <output id="locale-number">{localeStore.integer(123456)}</output>
    <output id="locale-date">{message('tradePage', 'testnetLocalProofBanner', { key: 'fixture-key', sequence: 2, expires: 1700000000000 })}</output>
  </section>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<><App services={services} trade={trade} /><FixtureExamples /></>);
Object.assign(window, { localeRuntimeFixture: {
  select(id: unknown) { return localeStore.select(id); },
  snapshot: localeStore.getSnapshot,
  reviewBytes() { return trade.getSnapshot().reviews.map(item => Array.from(item.bytes)); },
  async dispose() { root.unmount(); trade.dispose(); await services.dispose(); },
} });
