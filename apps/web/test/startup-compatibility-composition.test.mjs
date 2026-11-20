import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { build } from 'vite';

const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./startup-compatibility-composition-fixture.ts');
const required = ['secure-context', 'webcrypto', 'bounded-worker', 'indexeddb', 'file-import', 'file-export'];
const inert = names => names.map(name => `export function ${name}() { return null; }`).join('\n');
const replacements = new Map([
  [localPath('../src/app-services.ts'), 'export const startAppServices = () => globalThis.ports.initialize();'],
  [localPath('../src/diagnostics.ts'), 'export const createLocalDiagnostics = () => null;'],
  [localPath('../src/trade/review-controller.ts'), 'export const noApprovedRegistry = () => null; export const createTradeReviewController = () => globalThis.ports.trade;'],
  [localPath('../src/trade/draft-controller.ts'), 'export const createTradeDraftController = () => ({ dispose() {}, syncSelection() {} });'],
  [localPath('../src/ui/trade/TradePages.tsx'), inert(['OffersPage', 'TradePage']) + '\nexport const useTradeReview = () => ({ registry: { kind: "unavailable" } });'],
  [localPath('../src/ui/Pages.tsx'), inert(['Home', 'Recovery', 'Settings', 'UnavailablePage']) + '\nexport const pageTitle = { home: "Home", offers: "Offers", recovery: "Recovery", settings: "Settings" };'],
  [localPath('../src/ui/QrPanel.tsx'), inert(['QrPanel'])],
]);

// Execute maintained OfflineRoot, App, probe, initialization guard, notice and
// locale code. Only unrelated child screens, actual service startup and React
// scheduling are controlled. The presence probes read real fixture globals;
// there is no replacement probe or fabricated capability snapshot in this test.
// This qualifies composition and owned-service cleanup, not a native browser.
const bundled = await build({ configFile: false, logLevel: 'silent', define: {
  __P2P_SYNTHETIC_DEMO__: 'false', __P2P_TESTNET__: 'false',
}, plugins: [{
  name: 'startup-compatibility-composition-fixture', enforce: 'pre',
  resolveId(id, importer) {
    if (id === entry) return '\0startup-composition-entry';
    if (['react', 'react/jsx-runtime'].includes(id)) return '\0startup-composition-' + id;
    const path = id.startsWith('.') && importer ? resolve(dirname(importer), id) : id;
    if (replacements.has(path)) return '\0startup-composition-replacement:' + path;
  },
  load(id) {
    if (id === '\0startup-composition-entry') return `
      export { OfflineRoot } from ${JSON.stringify(localPath('../src/OfflineRoot.tsx'))};
      export { App } from ${JSON.stringify(localPath('../src/ui/App.tsx'))};
      export { localeStore } from ${JSON.stringify(localPath('../src/ui/locale/runtime.ts'))};`;
    if (id.startsWith('\0startup-composition-replacement:')) return replacements.get(id.slice('\0startup-composition-replacement:'.length));
    if (id === '\0startup-composition-react') return `
      export const useState = initial => globalThis.ports.hooks.useState(initial);
      export const useRef = initial => globalThis.ports.hooks.useRef(initial);
      export const useEffect = (read, dependencies) => globalThis.ports.hooks.effect(read, dependencies);
      export const useLayoutEffect = useEffect;
      export const useSyncExternalStore = (subscribe, read) => globalThis.ports.hooks.external(subscribe, read);`;
    if (id === '\0startup-composition-react/jsx-runtime') return `
      export const Fragment = 'fragment';
      export const jsx = (type, props) => ({ type, props });
      export const jsxs = jsx;`;
    if (id === localPath('../src/ui/locale/bundled.ts')) return `
      import { sourceCatalog } from ${JSON.stringify(localPath('../src/ui/locale/en.ts'))};
      export const bundledLocaleConfiguration = { developmentFixtures: true, fixtures: [{
        id: 'fixture-rtl', locale: 'ar', messages: Object.fromEntries(Object.entries(sourceCatalog)
          .map(([key, message]) => [key, '[DRAFT ' + message.source + ']'])) }] };`;
  },
}], build: { write: false, minify: false, lib: { entry, formats: ['iife'], name: 'startupCompositionFixture' } } });
const emitted = Array.isArray(bundled) ? bundled[0].output : bundled.output;
assert.equal(emitted.length, 1);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

function mounted(t, options = {}) {
  const instances = new Map(), listeners = new Map(), operations = [], initializations = [], persistence = [], disposals = [];
  let current, dirty = true, active = true, writes = 0, probeReads = 0, tree, appProps;
  const forbid = name => () => { operations.push(name); throw Error('PRIVATE_PLATFORM_DETAIL'); };
  function Worker() { forbid('worker-construction')(); }
  Worker.prototype.postMessage = forbid('worker-message'); Worker.prototype.terminate = forbid('worker-termination');
  function Blob() { forbid('blob-construction')(); }
  Blob.prototype.arrayBuffer = forbid('file-read');
  function File() { forbid('file-construction')(); }
  function Anchor() { forbid('anchor-construction')(); }
  Object.defineProperty(Anchor.prototype, 'download', { value: '' });
  class BrowserURL extends URL {}
  BrowserURL.createObjectURL = forbid('file-export'); BrowserURL.revokeObjectURL = forbid('file-export-revoke');
  const environment = {
    TextEncoder, TextDecoder, URL: BrowserURL, Worker, Blob, File, HTMLAnchorElement: Anchor,
    crypto: { getRandomValues: forbid('crypto-random'), subtle: Object.fromEntries(
      ['digest', 'importKey', 'deriveKey', 'encrypt', 'decrypt'].map(name => [name, forbid('crypto-' + name)])) },
    indexedDB: { open: forbid('storage-open') }, fetch: forbid('fetch'), WebSocket: forbid('websocket'),
    navigator: { onLine: true, mediaDevices: { getUserMedia: forbid('camera') }, share: forbid('native-share'),
      clipboard: { writeText: forbid('clipboard-write') }, permissions: { query: forbid('permission-query') } },
    window: { location: { hash: '#/settings' }, localStorage: {
      getItem(key) { assert.equal(key, 'p2p-offramp.locale.v1'); return null; },
      setItem(key) { assert.equal(key, 'p2p-offramp.locale.v1'); },
    },
      addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
      removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    },
    document: { documentElement: { lang: '', dir: '' }, title: '' },
  };
  const property = { 'secure-context': 'isSecureContext', webcrypto: 'crypto', 'bounded-worker': 'Worker', indexeddb: 'indexedDB',
    'file-import': 'File', 'file-export': 'HTMLAnchorElement' };
  Object.defineProperty(environment, 'isSecureContext', { configurable: true, get() {
    probeReads++;
    if (options.required === 'secure-context' && options.state === 'unavailable') throw Error('PRIVATE_PLATFORM_DETAIL');
    return options.required !== 'secure-context';
  } });
  if (options.required && options.required !== 'secure-context') Object.defineProperty(environment, property[options.required], {
    configurable: true, get() { if (options.state === 'unavailable') throw Error('PRIVATE_PLATFORM_DETAIL'); return undefined; },
  });
  if (options.optional) for (const key of ['mediaDevices', 'share', 'clipboard']) Object.defineProperty(environment.navigator, key, {
    configurable: true, get() { if (options.optional === 'unavailable') throw Error('PRIVATE_PLATFORM_DETAIL'); return undefined; },
  });
  function effect(read, dependencies) {
    const at = current.effectAt++, previous = current.effects[at];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index])))
      current.effects[at] = { read, dependencies, pending: true, stop: previous?.stop };
  }
  const hooks = {
    useState(initial) {
      const instance = current, at = instance.stateAt++;
      if (!(at in instance.states)) instance.states[at] = typeof initial === 'function' ? initial() : initial;
      return [instance.states[at], value => { if (!active) return; writes++;
        const next = typeof value === 'function' ? value(instance.states[at]) : value;
        if (!Object.is(next, instance.states[at])) { instance.states[at] = next; dirty = true; }
      }];
    },
    useRef(initial) { return current.refs[current.refAt++] ??= { current: initial }; },
    effect,
    external(subscribe, read) { effect(() => subscribe(() => { dirty = true; }), [subscribe]); return read(); },
  };
  const trade = { loadRegistry: async () => {}, dispose() {}, setPersistence(value) { persistence.push(value); }, forgetSaved() {} };
  function service(label = 'owned-service') {
    const snapshot = Object.freeze({ state: 'locked' });
    return { label, subscribe: () => () => {}, getSnapshot: () => snapshot, selectionScope: () => 0,
      async dispose() { disposals.push(label); }, status: forbid('status'), lock: forbid('lock') };
  }
  const owned = service();
  environment.ports = { hooks, trade, initialize() {
    initializations.push('initialize');
    return options.initialize ? options.initialize(initializations.length) : Promise.resolve({ ok: true, value: owned });
  } };
  // Keep the browser property reads on the explicit fixture object. Node's
  // contextified global proxy can turn a throwing host global getter into an
  // undefined property; that would mislabel "unavailable" as "missing".
  environment.globalThis = Object.defineProperties({}, Object.getOwnPropertyDescriptors(environment));
  runInNewContext(emitted[0].code, environment);
  const exports = environment.startupCompositionFixture;
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const prior = current;
      current = instances.get(node.type);
      if (!current) { current = { states: [], refs: [], effects: [] }; instances.set(node.type, current); }
      current.stateAt = current.refAt = current.effectAt = 0;
      if (node.type === exports.App) appProps = node.props;
      const result = node.type(node.props); current = prior;
      return expand(result);
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  function effects() {
    for (const instance of instances.values()) for (const item of instance.effects) if (item.pending) {
      item.pending = false; item.stop?.(); item.stop = item.read();
    }
  }
  function view() {
    for (let attempt = 0; dirty && attempt < 12; attempt++) {
      dirty = false;
      tree = expand({ type: exports.OfflineRoot, props: { entryModuleUrl: 'https://app.example/nested/assets/index-Abc12345.js' } });
      effects();
    }
    assert.equal(dirty, false, 'controlled startup composition settles'); return tree;
  }
  function unmount() {
    if (!active) return;
    for (const instance of instances.values()) for (const item of instance.effects) item.stop?.();
    active = false;
  }
  t.after(unmount);
  return { view, unmount, operations, initializations, persistence, disposals, owned, service,
    get appProps() { view(); return appProps; }, get writes() { return writes; }, get probeReads() { return probeReads; },
    notices() { return nodes(view(), node => node.props?.['aria-labelledby'] === 'startup-compatibility-title'); },
    rerender() { dirty = true; return view(); },
    select(id) { exports.localeStore.select(id); return view(); },
    pagehide(persisted) { for (const read of [...(listeners.get('pagehide') ?? [])]) read({ persisted }); },
    replayEffects() {
      for (const instance of instances.values()) for (const item of instance.effects) { item.stop?.(); item.stop = undefined; item.pending = true; }
      effects();
    },
    snapshot() { return appProps?.startupCapabilities; },
  };
}

for (const key of required) for (const state of ['missing', 'unavailable'])
  test(`maintained offline startup refuses ${state} ${key} before service initialization`, async t => {
    const ui = mounted(t, { required: key, state });
    ui.view(); assert.equal(ui.initializations.length, 0);
    assert.equal(ui.notices().length, 0, 'starting state does not yet render a compatibility notice');
    await turn();
    assert.equal(ui.appProps.starting, false); assert.equal(ui.appProps.services, null);
    assert.equal(ui.appProps.startupError, 'UNSUPPORTED_ENVIRONMENT');
    assert.equal(ui.snapshot()?.required[key], state); assert.equal(ui.snapshot()?.mode, 'read-only');
    const notice = ui.notices(); assert.equal(notice.length, 1); assert.match(words(notice), /Read-only browser mode/);
    assert.match(words(notice), /Missing or unavailable/); assert.match(words(notice), /Read recovery guidance/);
    assert.doesNotMatch(words(ui.view()), /PRIVATE_PLATFORM_DETAIL/); assert.deepEqual(ui.operations, []);
  });

for (const optional of ['missing', 'unavailable'])
  test(`optional APIs ${optional} do not prevent actual offline startup`, async t => {
    const ui = mounted(t, { optional }); ui.view(); await turn();
    assert.equal(ui.initializations.length, 1); assert.equal(ui.appProps.services, ui.owned);
    assert.equal(ui.appProps.startupError, undefined); assert.equal(ui.snapshot()?.mode, 'runtime-candidate');
    for (const key of ['camera', 'share', 'clipboard']) assert.equal(ui.snapshot()?.optional[key], optional);
    assert.equal(ui.snapshot()?.storageAccess, 'unverified'); assert.equal(ui.snapshot()?.compatibilityStatus, 'untested');
    assert.equal(ui.snapshot()?.certified, false); assert.equal(ui.snapshot()?.economicActionsAllowed, false);
    assert.equal(ui.notices().length, 0); assert.deepEqual(ui.operations, []);
  });

test('successful startup captures one presence snapshot and preserves app sharing on rerender', async t => {
  const ui = mounted(t); ui.view(); await turn();
  const snapshot = ui.snapshot(); assert.ok(snapshot); assert.equal(ui.probeReads, 1);
  assert.equal(ui.appProps.appLink, 'https://app.example/nested/'); assert.equal(ui.appProps.services, ui.owned);
  ui.rerender(); ui.select('fixture-rtl'); ui.rerender(); ui.select('en');
  assert.equal(ui.snapshot(), snapshot); assert.equal(ui.probeReads, 1); assert.equal(ui.initializations.length, 1);
  assert.equal(ui.notices().length, 0); assert.deepEqual(ui.operations, []);
});

test('locale changes rerender existing missing-API guidance without probing or initializing again', async t => {
  const ui = mounted(t, { required: 'file-export', state: 'missing' }); ui.view(); await turn();
  const snapshot = ui.snapshot(), original = words(ui.notices());
  assert.match(original, /encrypted file download/); assert.doesNotMatch(original, /\[DRAFT /);
  ui.select('fixture-rtl'); assert.match(words(ui.notices()), /\[DRAFT /);
  assert.equal(ui.view().props.lang, 'ar'); assert.equal(ui.view().props.dir, 'rtl');
  ui.select('en'); assert.equal(words(ui.notices()), original);
  assert.equal(ui.snapshot(), snapshot); assert.equal(ui.probeReads, 1); assert.equal(ui.initializations.length, 0);
  assert.deepEqual(ui.operations, []);
});

test('actual service refusal remains authoritative and distinct from missing API guidance', async t => {
  const ui = mounted(t, { initialize: async () => ({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } }) });
  ui.view(); await turn();
  assert.equal(ui.appProps.startupError, 'STORAGE_UNAVAILABLE'); assert.equal(ui.snapshot()?.mode, 'runtime-candidate');
  assert.equal(ui.appProps.services, null); const notice = words(ui.notices());
  assert.match(notice, /Recovery remains available/); assert.match(notice, /local services could not start/);
  assert.doesNotMatch(notice, /Missing or unavailable|Read-only browser mode/);
  ui.select('fixture-rtl'); assert.match(words(ui.notices()), /\[DRAFT /);
  assert.equal(ui.initializations.length, 1); assert.equal(ui.probeReads, 1); assert.deepEqual(ui.operations, []);
});

test('a thrown startup failure keeps the existing fixed error without platform details', async t => {
  const ui = mounted(t, { initialize: async () => { throw Error('PRIVATE_PLATFORM_DETAIL'); } }); ui.view(); await turn();
  assert.equal(ui.appProps.startupError, 'PROTOCOL_ERROR'); assert.match(words(ui.notices()), /Recovery remains available/);
  assert.doesNotMatch(words(ui.view()), /PRIVATE_PLATFORM_DETAIL/); assert.equal(ui.initializations.length, 1);
  assert.deepEqual(ui.operations, []);
});

for (const retirement of ['unmount', 'pagehide'])
  test(`late service success after ${retirement} is disposed without stale publication`, async t => {
    const held = deferred(), ui = mounted(t, { initialize: () => held.promise }); ui.view();
    if (retirement === 'unmount') ui.unmount(); else ui.pagehide(false);
    const before = ui.writes; held.resolve({ ok: true, value: ui.owned }); await turn();
    assert.equal(ui.writes, before); assert.deepEqual(ui.disposals, ['owned-service']);
    assert.equal(ui.appProps.services, null); assert.equal(ui.initializations.length, 1); assert.deepEqual(ui.operations, []);
  });

test('persisted pagehide keeps the admitted startup and normal ownership cleanup', async t => {
  const held = deferred(), ui = mounted(t, { initialize: () => held.promise }); ui.view(); ui.pagehide(true);
  held.resolve({ ok: true, value: ui.owned }); await turn();
  assert.equal(ui.appProps.services, ui.owned); assert.deepEqual(ui.disposals, []);
  ui.unmount(); assert.deepEqual(ui.disposals, ['owned-service']); assert.deepEqual(ui.operations, []);
});

test('unpersisted pagehide disposes the service owned by the completed startup', async t => {
  const ui = mounted(t); ui.view(); await turn(); assert.equal(ui.appProps.services, ui.owned);
  ui.pagehide(false); assert.deepEqual(ui.disposals, ['owned-service']); assert.deepEqual(ui.operations, []);
});

test('controlled effect replay preserves one probe and retires only the earlier startup result', async t => {
  const first = deferred(), second = deferred();
  const ui = mounted(t, { initialize: count => count === 1 ? first.promise : second.promise });
  ui.view(); const snapshot = ui.snapshot(); ui.replayEffects();
  assert.equal(ui.initializations.length, 2); assert.equal(ui.probeReads, 1);
  const priorService = ui.service('earlier-service'), nextService = ui.service('current-service');
  first.resolve({ ok: true, value: priorService }); await turn();
  assert.equal(ui.appProps.services, null); assert.deepEqual(ui.disposals, ['earlier-service']);
  second.resolve({ ok: true, value: nextService }); await turn();
  assert.equal(ui.appProps.services, nextService); assert.equal(ui.snapshot(), snapshot);
  assert.deepEqual(ui.disposals, ['earlier-service']); ui.unmount();
  assert.deepEqual(ui.disposals, ['earlier-service', 'current-service']); assert.deepEqual(ui.operations, []);
});
