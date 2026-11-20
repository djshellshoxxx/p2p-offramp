import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { build, transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const locked =')).replace(/^export /gm, '');
const emitted = (await transformWithOxc(body, 'App.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./app-shell-locale-fixture.ts');
// Exercise the actual locale runtime, live message views and fixed error mapping.
// The explicitly compiled marker catalog is draft layout data, not a translation.
const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'app-shell-locale-fixture',
  resolveId(id) { if (id === entry) return '\0app-shell-locale-fixture'; },
  load(id) {
    if (id === '\0app-shell-locale-fixture') return `
      export { messages as m } from ${JSON.stringify(localPath('../src/ui/messages.ts'))};
      export { errorMessage, isProfileId, parseRoute } from ${JSON.stringify(localPath('../src/ui/routes.ts'))};
      export { localeStore } from ${JSON.stringify(localPath('../src/ui/locale/runtime.ts'))};`;
    if (id === localPath('../src/ui/locale/bundled.ts')) return `
      import { sourceCatalog } from ${JSON.stringify(localPath('../src/ui/locale/en.ts'))};
      export const bundledLocaleConfiguration = { developmentFixtures: true, fixtures: [{
        id: 'fixture-rtl', locale: 'ar', messages: Object.fromEntries(Object.entries(sourceCatalog)
          .map(([key, message]) => [key, '[DRAFT ' + message.source + ']'])) }] };`;
  },
}], build: { write: false, minify: false, lib: { entry, formats: ['es'] } } });
const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
assert.equal(output.length, 1);
const copy = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
const { m, errorMessage, localeStore } = copy;
const ok = () => ({ ok: true, value: {} });
const fail = code => ({ ok: false, error: { code, messageKey: 'runtime.error.' + code.toLowerCase() } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

// Execute maintained App handlers and dependency-aware hooks. Child screens are
// inert render nodes; this tests shell state, not DOM or native persistence.
function mounted(t) {
  localeStore.select('en');
  const states = [], refs = [], effects = [], calls = [], listeners = new Map();
  const held = { status: deferred(), lock: deferred() }, snapshot = { state: 'unlocked' };
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = true, active = true, root, writes = 0, headingFocus = 0;
  const window = { location: { hash: '#/home' },
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); } };
  const document = { documentElement: { lang: '', dir: '' }, title: '' };
  const services = { subscribe: () => () => {}, getSnapshot: () => snapshot, selectionScope: () => 1,
    async status() { calls.push('status'); return held.status.promise; },
    async lock() { calls.push('lock'); return held.lock.promise; } };
  function effect(callback, dependencies) {
    const at = effectAt++, previous = effects[at];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index])))
      effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
  }
  const context = {
    ...copy, window, document, navigator: { onLine: true },
    Home: () => null, Recovery: () => null, Settings: () => null, UnavailablePage: () => null,
    OffersPage: () => null, TradePage: () => null, QrPanel: () => null,
    pageTitle: { home: 'Home fixture', offers: 'Offers fixture', recovery: 'Recovery fixture', settings: 'Settings fixture' },
    useTradeReview: () => ({ registry: { kind: 'unavailable' } }),
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
      return [states[at], value => { if (!active) return; writes++; const next = typeof value === 'function' ? value(states[at]) : value;
        if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useEffect: effect, useLayoutEffect: effect,
    useSyncExternalStore(subscribe, getSnapshot) { effect(() => subscribe(() => { dirty = true; }), [subscribe]); return getSnapshot(); },
    React: { Fragment: 'fragment' }, jsx(type, props, ...children) {
      if (props?.ref) props.ref.current = { focus() { if (type === 'h1') headingFocus++; } };
      return { type, props: { ...props, children } };
    },
  };
  runInNewContext(`${emitted}\nglobalThis.Shell = App;`, context);
  function view() {
    for (let attempt = 0; dirty && attempt < 10; attempt++) {
      dirty = false; stateAt = refAt = effectAt = 0; root = context.Shell({ services });
      for (const item of effects) if (item.pending) { item.pending = false; item.stop?.(); item.stop = item.callback(); }
    }
    assert.equal(dirty, false, 'shell state settles after the controlled event');
    return root;
  }
  const unmount = () => { if (active) { for (const item of effects) item.stop?.(); active = false; } };
  t.after(() => { unmount(); localeStore.select('en'); });
  const button = kind => nodes(view(), node => node.type === 'button' && words(node) === (kind === 'lock' ? m.lock : m.refresh))[0];
  return { calls, held, document, window, view, button, unmount,
    get writes() { return writes; }, get headingFocus() { return headingFocus; },
    click(kind) { const target = button(kind); assert.ok(target); assert.equal(target.props.disabled, false); target.props.onClick(); view(); },
    select(id) { localeStore.select(id); return view(); },
    navigate(hash) { window.location.hash = hash; listeners.get('hashchange')(); return view(); },
    alerts() { return nodes(view(), node => node.props.role === 'alert').map(words); },
    pending() { return nodes(view(), node => node.type === 'p' && node.props.role === 'status').map(words); },
    navigation() { return nodes(nodes(view(), node => node.type === 'nav')[0], node => node.type === 'a')
      .map(node => ({ href: node.props.href, label: words(node), current: node.props['aria-current'] })); },
  };
}

test('live locale selection updates navigation labels without changing routes or issuing commands', t => {
  const ui = mounted(t), pages = ['home', 'offers', 'recovery', 'settings'];
  const expected = () => pages.map(page => ({ href: '#/' + page, label: m[page], current: page === 'home' ? 'page' : undefined }));
  assert.deepEqual(ui.navigation(), expected());
  ui.select('fixture-rtl'); assert.deepEqual(ui.navigation(), expected());
  assert.equal(ui.view().props.lang, 'ar'); assert.equal(ui.view().props.dir, 'rtl');
  assert.equal(ui.document.documentElement.lang, 'ar'); assert.equal(ui.document.documentElement.dir, 'rtl');
  assert.equal(ui.window.location.hash, '#/home'); assert.equal(ui.headingFocus, 0); assert.deepEqual(ui.calls, []);
  assert.equal(localeStore.getSnapshot().fundsLocaleEligible, false);
  ui.select('en'); assert.deepEqual(ui.navigation(), expected());
});

for (const kind of ['status', 'lock']) test(`live locale selection updates pending ${kind} text and preserves button admission`, async t => {
  const ui = mounted(t), pendingText = () => kind === 'lock' ? m.locking : m.refreshing;
  ui.click(kind); assert.deepEqual(ui.pending(), [pendingText()]);
  ui.select('fixture-rtl');
  assert.equal(ui.button('status').props.disabled, true);
  assert.equal(ui.button('lock').props.disabled, kind === 'lock');
  assert.deepEqual(ui.pending(), [pendingText()]);
  assert.deepEqual(ui.calls, [kind]);
  ui.held[kind].resolve(ok()); await turn(); assert.deepEqual(ui.pending(), []);
  assert.equal(ui.button('status').props.disabled, false); assert.equal(ui.button('lock').props.disabled, false);
});

for (const kind of ['status', 'lock']) test(`completed ${kind} refusal follows later locale selection without repeating the command`, async t => {
  const ui = mounted(t); ui.click(kind); ui.held[kind].resolve(fail('STORAGE_UNAVAILABLE')); await turn();
  assert.deepEqual(ui.alerts(), [errorMessage('STORAGE_UNAVAILABLE')]);
  ui.select('fixture-rtl'); assert.deepEqual(ui.alerts(), [errorMessage('STORAGE_UNAVAILABLE')]);
  ui.select('en'); assert.deepEqual(ui.alerts(), [errorMessage('STORAGE_UNAVAILABLE')]); assert.deepEqual(ui.calls, [kind]);
});

test('an ordinary thrown command error retains its fixed mapping after locale selection', async t => {
  const ui = mounted(t); ui.click('status'); ui.held.status.reject(Error('ordinary fixture I/O failure')); await turn();
  assert.deepEqual(ui.alerts(), [errorMessage('PROTOCOL_ERROR')]);
  ui.select('fixture-rtl'); assert.deepEqual(ui.alerts(), [errorMessage('PROTOCOL_ERROR')]); assert.deepEqual(ui.calls, ['status']);
});

test('a command completing after locale selection displays the selected catalog without another request', async t => {
  const ui = mounted(t); ui.click('status'); ui.select('fixture-rtl'); ui.held.status.resolve(fail('STORAGE_UNAVAILABLE')); await turn();
  assert.deepEqual(ui.alerts(), [errorMessage('STORAGE_UNAVAILABLE')]); assert.deepEqual(ui.pending(), []);
  assert.deepEqual(ui.calls, ['status']);
});

test('lock still preempts a status refresh and ignores the older completion across locale changes', async t => {
  const ui = mounted(t); ui.click('status'); ui.select('fixture-rtl'); ui.click('lock');
  assert.deepEqual(ui.pending(), [m.locking]); assert.equal(ui.button('lock').props.disabled, true);
  ui.held.status.resolve(fail('STORAGE_UNAVAILABLE')); await turn();
  assert.deepEqual(ui.alerts(), []); assert.deepEqual(ui.pending(), [m.locking]);
  ui.select('en'); assert.deepEqual(ui.pending(), [m.locking]); assert.equal(ui.button('lock').props.disabled, true);
  ui.held.lock.resolve(ok()); await turn(); assert.deepEqual(ui.alerts(), []); assert.deepEqual(ui.pending(), []);
  assert.deepEqual(ui.calls, ['status', 'lock']);
});

test('route navigation clears a prior notice and focuses the heading while locale selection leaves focus alone', async t => {
  const ui = mounted(t); ui.click('status'); ui.held.status.resolve(fail('STORAGE_UNAVAILABLE')); await turn();
  assert.equal(ui.alerts().length, 1); ui.navigate('#/settings'); assert.deepEqual(ui.alerts(), []);
  assert.equal(ui.headingFocus, 1); ui.select('fixture-rtl'); assert.equal(ui.headingFocus, 1);
  assert.equal(ui.window.location.hash, '#/settings'); assert.deepEqual(ui.calls, ['status']);
});

test('unmount ignores a delayed command result and duplicate lock events keep one service call', async t => {
  const ui = mounted(t), click = ui.button('lock').props.onClick;
  click(); click(); ui.select('fixture-rtl'); assert.deepEqual(ui.calls, ['lock']);
  ui.unmount(); const before = ui.writes; ui.held.lock.resolve(fail('STORAGE_UNAVAILABLE')); await turn();
  assert.equal(ui.writes, before); assert.deepEqual(ui.calls, ['lock']);
});
