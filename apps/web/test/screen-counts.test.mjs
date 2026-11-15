import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../src/analytics/screen-counts.ts').catch(() => null);
const session = () => { assert.equal(typeof api?.createScreenCounts, 'function', 'local screen-count consumer must exist'); return api.createScreenCounts(); };
const zero = { home: 0, offers: 0, trade: 0, recovery: 0, settings: 0 };

test('screen counts start off and contain only the five fixed counters', () => {
  const { controller, observer } = session();
  assert.deepEqual(controller.getSnapshot(), { enabled: false, retired: false, counts: zero, preview: null });
  assert.ok(Object.isFrozen(controller.getSnapshot()));
  assert.ok(Object.isFrozen(controller.getSnapshot().counts));
  observer.commit('home', true); observer.commit('offers', true);
  assert.deepEqual(controller.getSnapshot().counts, zero);
  assert.equal(controller.reviewExport(), null);
  assert.equal(controller.confirmExport({ text: 'PRIVATE' }), null);
});

test('opt-in counts the current foreground category once and only real category entries follow', () => {
  const { controller, observer } = session();
  observer.commit('settings', true); controller.optIn(); controller.optIn();
  observer.commit('settings', true); observer.commit('settings', true);
  observer.commit('offers', true); observer.commit('offers', true);
  observer.commit('trade', true); observer.commit('trade', true);
  observer.commit('recovery', true); observer.commit('home', true);
  assert.deepEqual(controller.getSnapshot().counts, { home: 1, offers: 1, trade: 1, recovery: 1, settings: 1 });
  observer.commit(null, true); observer.commit('home', true);
  assert.equal(controller.getSnapshot().counts.home, 2, 'return from an unclassified screen is a new committed entry');
});

test('hidden commits never count and foreground resume counts the current category exactly once', () => {
  const { controller, observer } = session();
  observer.commit('home', false); controller.optIn();
  observer.commit('offers', false); observer.commit('trade', false);
  assert.deepEqual(controller.getSnapshot().counts, zero);
  observer.commit('trade', true); observer.commit('trade', true);
  observer.commit('trade', false); observer.commit('trade', false); observer.commit('trade', true);
  assert.deepEqual(controller.getSnapshot().counts, { ...zero, trade: 2 });
  const preview = controller.reviewExport(); observer.commit('trade', false);
  assert.equal(controller.confirmExport(preview), null, 'a hidden document cannot download a prior preview');
});

test('all five counters saturate and the explicit export is exact bounded category-only JSON', () => {
  const { controller, observer } = session();
  controller.optIn();
  for (const category of ['home', 'offers', 'trade', 'recovery', 'settings']) for (let i = 0; i < 65540; i++) {
    observer.commit(category, false); observer.commit(category, true);
  }
  const preview = controller.reviewExport();
  assert.ok(preview && Object.isFrozen(preview));
  const text = controller.confirmExport(preview);
  assert.equal(text, preview.text);
  assert.ok(new TextEncoder().encode(text).length <= 1024);
  assert.deepEqual(JSON.parse(text), { format: 'p2p-offramp/local-screen-counts/v1', counts: { home: 65535, offers: 65535, trade: 65535, recovery: 65535, settings: 65535 } });
  assert.equal(controller.confirmExport(JSON.parse(JSON.stringify(preview))), null, 'serialized previews have no current snapshot identity');
});

test('new entries, clear and opt-out invalidate export; clear requires fresh consent', () => {
  const { controller, observer } = session();
  observer.commit('settings', true); controller.optIn();
  const first = controller.reviewExport(); observer.commit('offers', true);
  assert.equal(controller.confirmExport(first), null);
  const second = controller.reviewExport(); controller.clear();
  assert.deepEqual(controller.getSnapshot(), { enabled: false, retired: false, counts: zero, preview: null });
  assert.equal(controller.confirmExport(second), null);
  observer.commit('home', true); assert.deepEqual(controller.getSnapshot().counts, zero);
  controller.optIn(); assert.equal(controller.getSnapshot().counts.home, 1);
  const third = controller.reviewExport(); controller.optOut();
  assert.equal(controller.confirmExport(third), null);
  assert.deepEqual(controller.getSnapshot().counts, zero);
});

test('retirement erases consent, counts and preview before late effects or old controls can run', () => {
  const { controller, observer } = session();
  observer.commit('home', true); controller.optIn();
  const preview = controller.reviewExport(); observer.retire();
  observer.commit('offers', true); controller.optIn(); controller.clear(); observer.retire();
  assert.deepEqual(controller.getSnapshot(), { enabled: false, retired: true, counts: zero, preview: null });
  assert.equal(controller.confirmExport(preview), null);
  assert.equal(controller.reviewExport(), null);
  const next = session(); next.observer.commit('settings', true);
  assert.equal(next.controller.getSnapshot().enabled, false, 'a replacement owner needs independent consent');
});

test('hostile inputs cannot supply categories, payloads, getters or a mutable preview', () => {
  const { controller, observer } = session(); let reads = 0;
  const hostile = { toString() { reads++; throw Error('PRIVATE'); }, get category() { reads++; throw Error('PRIVATE'); } };
  observer.commit('settings', true); controller.optIn();
  for (const category of [hostile, new Proxy({}, { get() { reads++; throw Error('PRIVATE'); } }), 'PRIVATE', '#/trade/PRIVATE', 'home?PRIVATE', '', undefined, 1]) observer.commit(category, true);
  for (const foreground of [hostile, 'visible', 1, null]) observer.commit('home', foreground);
  const preview = controller.reviewExport();
  assert.equal(controller.confirmExport(hostile), null);
  assert.equal(reads, 0);
  assert.deepEqual(controller.getSnapshot().counts, { ...zero, settings: 1 });
  assert.throws(() => { preview.text = 'PRIVATE'; }, TypeError);
  assert.doesNotMatch(controller.confirmExport(preview), /PRIVATE|category|owner|time|duration|session|release|label|value/i);
});

test('memory-only operations read no clock, timer, storage, browser URL, Worker or network capability', () => {
  const names = ['location', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'fetch', 'Worker'];
  const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const originalNow = Date.now, originalTimeout = globalThis.setTimeout;
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, get() { throw Error('Forbidden ambient read: ' + name); } });
  Date.now = () => { throw Error('No analytics clock'); }; globalThis.setTimeout = () => { throw Error('No analytics timer'); };
  try {
    const { controller, observer } = session(); observer.commit('settings', true); controller.optIn();
    observer.commit('home', true); assert.ok(controller.confirmExport(controller.reviewExport()));
    controller.clear(); observer.retire();
  } finally {
    Date.now = originalNow; globalThis.setTimeout = originalTimeout;
    for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
});

test('snapshot subscriptions remain stable, isolate failures and cannot revive a retired owner reentrantly', () => {
  const { controller, observer } = session(); const initial = controller.getSnapshot();
  assert.equal(controller.getSnapshot(), initial);
  let notifications = 0;
  const off = controller.subscribe(() => { notifications++; });
  controller.subscribe(() => { throw Error('PRIVATE listener'); });
  observer.commit('home', true); assert.equal(controller.getSnapshot(), initial);
  controller.optIn(); assert.equal(notifications, 1);
  off(); off(); observer.commit('offers', true); assert.equal(notifications, 1);
  controller.subscribe(() => { observer.retire(); controller.optIn(); });
  observer.commit('recovery', true);
  assert.equal(controller.getSnapshot().retired, true);
  assert.deepEqual(controller.getSnapshot().counts, zero);
});

test('a consent-mutating subscriber runs once per fixed cohort and stable readers see the final state', () => {
  const { controller, observer } = session(); observer.commit('home', true);
  const observed = []; let mutations = 0;
  controller.subscribe(() => { observed.push(controller.getSnapshot()); });
  controller.subscribe(() => {
    // Finite negative control: the old implementation recurses33 times, never to stack exhaustion.
    if (++mutations <= 32) controller.getSnapshot().enabled ? controller.optOut() : controller.optIn();
  });
  controller.optIn();
  assert.equal(mutations, 1, 'an observer that changes state cannot re-enter its own publication batch');
  assert.ok(observed.length <= 16);
  assert.equal(observed.at(-1), controller.getSnapshot());
  assert.equal(observed.at(-1).enabled, false);
  assert.deepEqual(observed.at(-1).counts, zero);
});

test('review mutation catches up stable readers without admitting new cohort members or recursive publication', () => {
  const { controller, observer } = session(); observer.commit('settings', true); controller.optIn();
  let mutations = 0, newcomer = 0; const observed = [];
  controller.subscribe(() => { observed.push(controller.getSnapshot()); });
  controller.subscribe(() => {
    if (++mutations <= 32) { controller.subscribe(() => { newcomer++; }); controller.reviewExport(); }
  });
  controller.reviewExport();
  assert.equal(mutations, 1);
  assert.equal(newcomer, 0, 'a growing subscription set cannot enlarge the active cohort');
  assert.ok(observed.length <= 16);
  assert.equal(observed.at(-1), controller.getSnapshot());
  assert.ok(controller.confirmExport(observed.at(-1).preview));
});

test('retirement reaches stable readers before the cohort clears and no more than16 subscribers are retained', () => {
  const { controller, observer } = session(); observer.commit('home', true);
  const observed = []; let retireCalls = 0, excess = 0;
  controller.subscribe(() => { observed.push(controller.getSnapshot()); });
  controller.subscribe(() => { retireCalls++; observer.retire(); controller.optIn(); controller.reviewExport(); });
  for (let i = 0; i < 14; i++) controller.subscribe(() => {});
  controller.subscribe(() => { excess++; });
  controller.optIn();
  assert.equal(retireCalls, 1); assert.equal(excess, 0);
  assert.equal(observed.at(-1), controller.getSnapshot());
  assert.deepEqual(observed.at(-1), { enabled: false, retired: true, counts: zero, preview: null });
  const notifications = observed.length;
  controller.clear(); controller.optIn(); observer.commit('offers', true);
  assert.equal(observed.length, notifications);
});
