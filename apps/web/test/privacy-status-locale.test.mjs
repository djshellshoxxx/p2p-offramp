import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { build } from 'vite';

const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./privacy-status-locale-fixture.ts');
// Compile the actual panel, its actual locale imports and the maintained privacy
// reader. Only React hooks/browser ports and the complete draft catalog are
// controlled. No production translation, native browser or routing claim follows.
const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'privacy-status-locale-fixture',
  enforce: 'pre',
  resolveId(id) {
    if (id === entry) return '\0privacy-status-locale-fixture';
    if (id === 'react' || id === 'react/jsx-runtime') return '\0privacy-status-locale-' + id;
  },
  load(id) {
    if (id === '\0privacy-status-locale-fixture') return `
      export { PrivacyStatusPanel } from ${JSON.stringify(localPath('../src/ui/PrivacyStatusPanel.tsx'))};
      export { localeStore, message, messageGroup } from ${JSON.stringify(localPath('../src/ui/locale/runtime.ts'))};`;
    if (id === '\0privacy-status-locale-react') return ['useEffect', 'useMemo', 'useRef', 'useState', 'useSyncExternalStore']
      .map(name => `export const ${name} = (...args) => globalThis.hooks.${name}(...args);`).join('\n');
    if (id === '\0privacy-status-locale-react/jsx-runtime') return `
      export const Fragment = 'fragment';
      export const jsx = (type, props) => ({ type, props });
      export const jsxs = jsx;`;
    if (id === localPath('../src/ui/locale/bundled.ts')) return `
      import { sourceCatalog } from ${JSON.stringify(localPath('../src/ui/locale/en.ts'))};
      export const bundledLocaleConfiguration = { developmentFixtures: true, fixtures: [{
        id: 'fixture-rtl', locale: 'ar', messages: Object.fromEntries(Object.entries(sourceCatalog)
          .map(([key, message]) => [key, '[DRAFT ' + message.source + ']'])) }] };`;
  },
}], build: { write: false, minify: false, lib: { entry, formats: ['iife'], name: 'privacyStatusLocaleFixture' } } });
const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
assert.equal(output.length, 1);
const compiled = output[0].code;
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

function mounted(t, initial = {}) {
  const states = [], refs = [], memos = [], effects = [], events = new Map(), timers = new Map();
  let stateAt = 0, refAt = 0, memoAt = 0, effectAt = 0, dirty = true, active = true, root, now = 1234, timerId = 0;
  let props = initial;
  const calls = { timerStarts: 0, timerStops: 0, eventAdds: 0, eventRemoves: 0 };
  const same = (previous, next) => previous && previous.length === next.length && next.every((value, index) => Object.is(value, previous[index]));
  function effect(callback, dependencies) {
    const at = effectAt++, previous = effects[at];
    if (!previous || !same(previous.dependencies, dependencies))
      effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
  }
  const listenerPort = prefix => ({
    addEventListener(name, callback) { calls.eventAdds++; events.set(prefix + name, callback); },
    removeEventListener(name, callback) { calls.eventRemoves++; if (events.get(prefix + name) === callback) events.delete(prefix + name); },
  });
  const environment = {
    TextEncoder, TextDecoder, crypto: webcrypto, performance: { now: () => now },
    document: { visibilityState: 'visible', ...listenerPort('document:') },
    window: { ...listenerPort('window:'),
      setTimeout(callback, delay) { calls.timerStarts++; const id = ++timerId; timers.set(id, { callback, delay }); return id; },
      clearTimeout(id) { calls.timerStops++; timers.delete(id); },
    },
    hooks: {
      useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
        return [states[at], value => { if (!active) return; const next = typeof value === 'function' ? value(states[at]) : value;
          if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
      useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
      useMemo(callback, dependencies) { const at = memoAt++; if (!memos[at] || !same(memos[at].dependencies, dependencies))
        memos[at] = { dependencies, value: callback() }; return memos[at].value; },
      useEffect: effect,
      useSyncExternalStore(subscribe, getSnapshot) { effect(() => subscribe(() => { dirty = true; }), [subscribe]); return getSnapshot(); },
    },
  };
  runInNewContext(compiled, environment);
  const api = environment.privacyStatusLocaleFixture, p = api.messageGroup('privacy');
  function view() {
    for (let attempt = 0; dirty && attempt < 10; attempt++) {
      dirty = false; stateAt = refAt = memoAt = effectAt = 0; root = api.PrivacyStatusPanel(props);
      for (const item of effects) if (item.pending) { item.pending = false; item.stop?.(); item.stop = item.callback(); }
    }
    assert.equal(dirty, false, 'panel settles after the controlled event');
    return root;
  }
  function unmount() { if (active) { active = false; for (const item of effects) item.stop?.(); } }
  t.after(unmount);
  view();
  return { api, p, calls, events, timers, view, unmount,
    select(id) { api.localeStore.select(id); dirty = true; return view(); }, // Parent App owns this locale rerender.
    render() { dirty = true; return view(); },
    setProps(next) { props = next; dirty = true; return view(); },
    setTime(value) { now = value; dirty = true; return view(); },
    row(key) { const result = nodes(view(), node => node.type === 'li' && nodes(node, child => child.type === 'h3').some(heading => words(heading) === p[key]))[0];
      assert.ok(result, 'visible current-catalog indicator: ' + key); return result; },
    values(key) { return nodes(this.row(key), node => node.type === 'dd').map(words); },
    status() { return nodes(view(), node => node.props.role === 'status').map(words); },
  };
}

function localVault(state = 'unlocked', generation = 7) {
  return { selectionScope: () => generation, getSnapshot: () => ({ state }) };
}
function broker() {
  const listeners = new Set(), allListeners = [];
  const state = { mode: 'strict', generation: 3, refused: false,
    coverage: { rpc: 'direct', relay: 'verified-private', map: 'unsupported', proof: 'unknown', update: 'unknown', wallet: 'unknown' } };
  const calls = { subscribe: 0, unsubscribe: 0, inspect: 0 };
  const port = {
    get mode() { return state.mode; }, get generation() { return state.generation; },
    inspect(channel) { calls.inspect++; return Object.assign(Object.create(null), {
      channel, coverage: state.coverage[channel], adapterId: 'locale-fixture', generation: state.generation,
    }); },
    subscribeInvalidation(listener) { calls.subscribe++; if (state.refused) throw Error('PRIVATE_SUBSCRIPTION');
      listeners.add(listener); allListeners.push(listener); return () => { calls.unsubscribe++; listeners.delete(listener); }; },
  };
  return { port, state, calls, listeners, allListeners,
    invalidate() { state.generation++; for (const listener of listeners) listener(); },
  };
}

function eachLocale(ui, verify) {
  for (const id of ['en', 'fixture-rtl', 'en']) {
    ui.select(id); verify();
    assert.equal(ui.api.localeStore.getSnapshot().fundsLocaleEligible, false);
  }
}

test('privacy headings, disclosures and all unknown indicators use the selected compiled catalog', t => {
  const ui = mounted(t);
  eachLocale(ui, () => {
    const text = words(ui.view());
    for (const key of ['title', 'intro', 'refresh', 'chainTitle', 'chainWarning', 'fiatTitle', 'fiatWarning', 'authorityWarning'])
      assert.ok(text.includes(ui.p[key]), 'current-catalog ' + key);
    for (const key of ['rpc', 'relay', 'map', 'proofChannel', 'update', 'wallet'])
      assert.deepEqual(ui.values(key), [ui.p.noPolicy, ui.p.unknown, ui.p.none, ui.p.notObserved]);
    for (const key of ['vault', 'messaging', 'proof']) assert.deepEqual(ui.values(key), [ui.p.unknown, ui.p.none, ui.p.notObserved]);
    assert.equal(nodes(ui.view(), node => node.type === 'li').length, 9);
    assert.equal(nodes(ui.view(), node => ['button', 'input', 'form', 'a'].includes(node.type)).length, 0);
  });
  assert.equal(ui.calls.eventAdds, 0); assert.equal(ui.timers.size, 0);
});

for (const state of ['locked', 'unlocked']) test('observed ' + state + ' vault and time copy translate without renewing lifecycle resources', t => {
  const ui = mounted(t, { services: localVault(state), scope: 7 });
  const lifecycle = { ...ui.calls }, deadline = [...ui.timers.values()][0];
  eachLocale(ui, () => {
    assert.deepEqual(ui.values('vault'), [ui.p[state], ui.p.localVault, ui.p.observedReason]);
    const time = ui.api.message('privacy', 'time', Object.assign(Object.create(null), { milliseconds: '1234' }));
    assert.ok(words(ui.row('vault')).includes(time));
    assert.deepEqual(ui.values('messaging'), [ui.p.unknown, ui.p.none, ui.p.notObserved]);
    assert.deepEqual(ui.values('proof'), [ui.p.unknown, ui.p.none, ui.p.notObserved]);
    assert.deepEqual(ui.calls, lifecycle); assert.equal([...ui.timers.values()][0], deadline);
  });
  ui.unmount(); assert.equal(ui.timers.size, 0); assert.equal(ui.events.size, 0);
});

test('route coverage, selected policy and blocked reasons translate while the original broker subscription stays active', t => {
  const transport = broker(), ui = mounted(t, { services: localVault(), scope: 7, transport: transport.port });
  const lifecycle = { ...ui.calls };
  eachLocale(ui, () => {
    assert.deepEqual(ui.values('rpc'), [ui.p.strict, ui.p.blocked, ui.p.transport, ui.p.policyBlocked]);
    assert.deepEqual(ui.values('relay'), [ui.p.strict, ui.p.privateRoute, ui.p.transport, ui.p.observedReason]);
    assert.deepEqual(ui.values('map'), [ui.p.strict, ui.p.unsupported, ui.p.transport, ui.p.observedReason]);
    assert.deepEqual(ui.values('wallet'), [ui.p.strict, ui.p.unknown, ui.p.transport, ui.p.observedReason]);
    assert.equal(transport.calls.subscribe, 1); assert.equal(transport.calls.unsubscribe, 0);
    assert.equal(transport.listeners.size, 1); assert.deepEqual(ui.calls, lifecycle);
  });
  transport.state.mode = 'ordinary'; transport.invalidate();
  eachLocale(ui, () => assert.deepEqual(ui.values('rpc'), [ui.p.ordinary, ui.p.direct, ui.p.transport, ui.p.observedReason]));
  ui.unmount(); assert.equal(transport.calls.unsubscribe, 1); assert.equal(transport.listeners.size, 0);
});

test('scope mismatch remains unknown in every catalog and cannot inspect a positive route', t => {
  const transport = broker(), ui = mounted(t, { services: localVault(), scope: 8, transport: transport.port });
  eachLocale(ui, () => {
    assert.deepEqual(ui.values('vault'), [ui.p.unknown, ui.p.none, ui.p.scopeChanged]);
    assert.deepEqual(ui.values('rpc'), [ui.p.strict, ui.p.unknown, ui.p.none, ui.p.scopeChanged]);
    assert.equal(transport.calls.inspect, 0);
  });
});

test('unavailable local observations show localized fixed reasons and never render private exception text', t => {
  const services = { selectionScope: () => 7, getSnapshot() { throw Error('PRIVATE_VAULT_CONTENT'); } };
  const ui = mounted(t, { services, scope: 7 });
  eachLocale(ui, () => {
    assert.deepEqual(ui.values('vault'), [ui.p.unknown, ui.p.none, ui.p.unavailable]);
    assert.equal(words(ui.view()).includes('PRIVATE_'), false);
  });
});

test('subscription refusal and broker replacement stay refused across locale changes and retired callbacks', t => {
  const transport = broker(), services = localVault(), ui = mounted(t, { services, scope: 7, transport: transport.port });
  const retired = transport.allListeners[0];
  ui.setProps({ services, scope: 7, transport: null });
  transport.state.refused = true;
  ui.setProps({ services, scope: 7, transport: transport.port });
  const inspections = transport.calls.inspect;
  retired();
  eachLocale(ui, () => {
    assert.deepEqual(ui.status(), [ui.p.error]);
    assert.deepEqual(ui.values('rpc'), [ui.p.noPolicy, ui.p.unknown, ui.p.none, ui.p.notObserved]);
    assert.deepEqual(ui.values('vault'), [ui.p.unlocked, ui.p.localVault, ui.p.observedReason]);
    assert.equal(transport.calls.inspect, inspections); assert.equal(transport.calls.subscribe, 2);
    assert.equal(transport.listeners.size, 0); assert.equal(words(ui.view()).includes('PRIVATE_'), false);
  });
});

test('clock reversal stays unknown after a catalog change without recreating privacy readers', t => {
  const transport = broker(), ui = mounted(t, { services: localVault(), scope: 7, transport: transport.port });
  ui.setTime(1233);
  eachLocale(ui, () => {
    assert.deepEqual(ui.values('vault'), [ui.p.unknown, ui.p.none, ui.p.clockReversed]);
    assert.deepEqual(ui.values('relay'), [ui.p.strict, ui.p.unknown, ui.p.none, ui.p.clockReversed]);
  });
  ui.setTime(1235);
  assert.deepEqual(ui.values('vault'), [ui.p.unknown, ui.p.none, ui.p.clockReversed]);
  assert.equal(transport.calls.subscribe, 1);
});
