import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { build } from 'vite';

const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./generic-app-share-lifecycle-fixture.ts');
const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'generic-app-share-lifecycle-fixture', enforce: 'pre',
  resolveId(id) {
    if (id === entry) return '\0generic-share-lifecycle';
    if (id === 'react' || id === 'react/jsx-runtime') return '\0generic-share-lifecycle-' + id;
  },
  load(id) {
    if (id === '\0generic-share-lifecycle') return `
      export { GenericAppShare } from ${JSON.stringify(localPath('../src/ui/GenericAppShare.tsx'))};
      export { localeStore, messageGroup } from ${JSON.stringify(localPath('../src/ui/locale/runtime.ts'))};`;
    if (id === '\0generic-share-lifecycle-react') return ['useEffect', 'useMemo', 'useRef', 'useState', 'useSyncExternalStore']
      .map(name => `export const ${name} = (...args) => globalThis.hooks.${name}(...args);`).join('\n');
    if (id === '\0generic-share-lifecycle-react/jsx-runtime') return `
      export const Fragment = 'fragment'; export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;`;
    if (id === localPath('../src/ui/locale/bundled.ts')) return `
      import { sourceCatalog } from ${JSON.stringify(localPath('../src/ui/locale/en.ts'))};
      export const bundledLocaleConfiguration = { developmentFixtures: true, fixtures: [{
        id: 'fixture-rtl', locale: 'ar', messages: Object.fromEntries(Object.entries(sourceCatalog)
          .map(([key, message]) => [key, '[DRAFT ' + message.source + ']'])) }] };`;
  },
}], build: { write: false, minify: false, lib: { entry, formats: ['iife'], name: 'genericShareLifecycle' } } });
const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
assert.equal(output.length, 1);
const compiled = output[0].code;
const ADDRESS = 'https://app.example/nested/project/', OTHER = 'https://app.example/another/project/';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';
const same = (previous, next) => previous && previous.length === next.length && next.every((value, index) => Object.is(value, previous[index]));

// Every mount in this fixture executes the SAME maintained compiled module, so
// the page-wide physical clipboard gate is shared. Each mount has independent
// dependency-aware hook state. Controlled handlers/ports qualify component
// lifecycle only, not physical clipboard permission or browser event delivery.
function page(t, clipboard) {
  const mounts = [], forbidden = []; let active, clipboardReads = 0;
  const refuse = name => { forbidden.push(name); throw Error('PRIVATE_BROWSER_DETAIL'); };
  const environment = { hooks: Object.fromEntries(['useEffect', 'useMemo', 'useRef', 'useState', 'useSyncExternalStore']
    .map(name => [name, (...args) => active.hooks[name](...args)])),
    navigator: { get clipboard() { clipboardReads++; return typeof clipboard === 'function' ? clipboard() : clipboard; },
      get share() { return refuse('share'); }, get permissions() { return refuse('permissions'); } },
  };
  for (const name of ['fetch', 'WebSocket', 'ethereum', 'solana', 'localStorage', 'location'])
    Object.defineProperty(environment, name, { get() { return refuse(name); } });
  runInNewContext(compiled, environment);
  const api = environment.genericShareLifecycle, m = api.messageGroup('shell');
  function mount(initial = ADDRESS) {
    const states = [], refs = [], memos = [], effects = [];
    let stateAt = 0, refAt = 0, memoAt = 0, effectAt = 0, dirty = true, alive = true, root, appLink = initial, lateWrites = 0;
    function effect(callback, dependencies) {
      const at = effectAt++, previous = effects[at];
      if (!previous || !same(previous.dependencies, dependencies)) effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
    }
    const hooks = {
      useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
        return [states[at], value => { if (!alive) { lateWrites++; return; } const next = typeof value === 'function' ? value(states[at]) : value;
          if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
      useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
      useMemo(read, dependencies) { const at = memoAt++; if (!memos[at] || !same(memos[at].dependencies, dependencies)) memos[at] = { dependencies, value: read() }; return memos[at].value; },
      useEffect: effect,
      useSyncExternalStore(subscribe, read) { effect(() => subscribe(() => { dirty = true; }), [subscribe]); return read(); },
    };
    const view = () => {
      assert.ok(alive, 'only mounted views render');
      for (let attempt = 0; dirty && attempt < 10; attempt++) {
        dirty = false; stateAt = refAt = memoAt = effectAt = 0; active = { hooks };
        root = api.GenericAppShare({ appLink });
        for (const item of effects) if (item.pending) { item.pending = false; item.stop?.(); item.stop = item.callback(); }
      }
      assert.equal(dirty, false, 'share view settles after controlled scheduling'); return root;
    };
    const ui = { view,
      button() { return nodes(view(), node => node.type === 'button')[0]; },
      input() { return nodes(view(), node => node.type === 'input')[0]; },
      status() { return nodes(view(), node => node.props.role === 'status').map(words); },
      click() { const button = this.button(); assert.ok(button); assert.equal(button.props.disabled, false); button.props.onClick(); },
      render() { dirty = true; return view(); },
      setLink(next) { appLink = next; dirty = true; return view(); },
      unmount() { if (alive) { alive = false; for (const item of effects) item.stop?.(); } },
      get alive() { return alive; }, get lateWrites() { return lateWrites; },
    };
    mounts.push(ui); view(); return ui;
  }
  t.after(() => { for (const ui of mounts) ui.unmount(); assert.deepEqual(forbidden, []); });
  return { mount, m, api, forbidden,
    get clipboardReads() { return clipboardReads; },
    select(id) { api.localeStore.select(id); for (const ui of mounts) if (ui.alive) ui.render(); }, // App owns locale rerendering.
  };
}

test('render, locale selection and manual text selection never inspect clipboard or other external capabilities', t => {
  const p = page(t, () => { throw Error('clipboard must wait for a click'); }), ui = p.mount();
  ui.render(); p.select('fixture-rtl'); p.select('en');
  const input = ui.input(); let selections = 0;
  assert.equal(input.props.value, ADDRESS); assert.equal(input.props.readOnly, true);
  input.props.onFocus({ currentTarget: { select() { selections++; } } });
  assert.equal(selections, 1); assert.equal(p.clipboardReads, 0); assert.deepEqual(ui.status(), ['']);
});

test('an explicit copy passes only the exact app address and its completion uses the current locale', async t => {
  const pending = deferred(), calls = [], clipboard = { writeText(value) { assert.equal(this, clipboard); calls.push(value); return pending.promise; } };
  const p = page(t, clipboard), ui = p.mount(); ui.click();
  assert.deepEqual(calls, [ADDRESS]); assert.equal(p.clipboardReads, 1); assert.equal(ui.button().props.disabled, true);
  assert.equal(ui.button().props['aria-busy'], true); p.select('fixture-rtl');
  pending.resolve(); await turn(); assert.deepEqual(ui.status(), [p.m.shareAppCopied]);
  p.select('en'); assert.deepEqual(ui.status(), [p.m.shareAppCopied]); assert.deepEqual(calls, [ADDRESS]);
  assert.equal(ui.button().props.disabled, false); assert.equal(p.api.localeStore.getSnapshot().fundsLocaleEligible, false);
});

for (const [name, clipboard] of [
  ['missing clipboard', undefined], ['missing writeText', {}], ['nonfunction writeText', { writeText: true }],
  ['throwing clipboard getter', () => { throw Error('PRIVATE_BROWSER_DETAIL'); }],
  ['throwing writeText getter', { get writeText() { throw Error('PRIVATE_BROWSER_DETAIL'); } }],
  ['throwing writeText', { writeText() { throw Error('PRIVATE_BROWSER_DETAIL'); } }],
  ['rejected writeText', { writeText() { return Promise.reject(Error('PRIVATE_BROWSER_DETAIL')); } }],
]) test('fixed manual fallback and selection remain available after ' + name, async t => {
  const p = page(t, clipboard), ui = p.mount(); ui.click(); await turn();
  assert.deepEqual(ui.status(), [p.m.shareAppCopyUnavailable]); assert.equal(ui.button().props.disabled, false);
  assert.equal(ui.input().props.value, ADDRESS); assert.equal(p.clipboardReads, 1);
  p.select('fixture-rtl'); assert.deepEqual(ui.status(), [p.m.shareAppCopyUnavailable]);
  assert.doesNotMatch(words(ui.view()), /PRIVATE_BROWSER_DETAIL/); assert.equal(p.clipboardReads, 1);
});

test('same-render duplicate handlers and simultaneous mounts admit one physical clipboard promise', async t => {
  const pending = deferred(), calls = [], p = page(t, { writeText(value) { calls.push(value); return pending.promise; } });
  const first = p.mount(), second = p.mount(OTHER), click = first.button().props.onClick, otherClick = second.button().props.onClick;
  click(); click(); otherClick(); assert.deepEqual(calls, [ADDRESS]);
  assert.equal(first.button().props.disabled, true); assert.equal(second.button().props.disabled, true);
  pending.resolve(); await turn();
  assert.deepEqual(first.status(), [p.m.shareAppCopied]); assert.deepEqual(second.status(), ['']);
  assert.equal(first.button().props.disabled, false); assert.equal(second.button().props.disabled, false);
});

for (const outcome of ['resolve', 'reject']) test('unmount and remount retain physical admission until a held write ' + outcome + 's', async t => {
  const firstGate = deferred(), nextGate = deferred(), calls = [];
  const p = page(t, { writeText(value) { calls.push(value); return calls.length === 1 ? firstGate.promise : nextGate.promise; } });
  const first = p.mount(); first.click(); first.unmount();
  const next = p.mount(OTHER); assert.equal(next.button().props.disabled, true);
  next.button().props.onClick(); assert.deepEqual(calls, [ADDRESS]);
  if (outcome === 'resolve') firstGate.resolve(); else firstGate.reject(Error('PRIVATE_BROWSER_DETAIL'));
  await turn(); assert.equal(first.lateWrites, 0); assert.deepEqual(next.status(), ['']); assert.equal(next.button().props.disabled, false);
  next.click(); assert.deepEqual(calls, [ADDRESS, OTHER]); nextGate.resolve(); await turn();
  assert.deepEqual(next.status(), [p.m.shareAppCopied]); assert.equal(first.lateWrites, 0);
});

for (const next of [OTHER, null]) test('owner replacement suppresses a late completion for ' + String(next), async t => {
  const pending = deferred(), calls = [], p = page(t, { writeText(value) { calls.push(value); return pending.promise; } }), ui = p.mount();
  ui.click(); ui.setLink(next); pending.resolve(); await turn();
  assert.deepEqual(ui.status(), [next === null ? p.m.shareAppUnavailable : '']); assert.deepEqual(calls, [ADDRESS]);
  assert.equal(ui.button()?.props.disabled, next === null ? undefined : false);
});

test('changing an address away and back does not revive a copied notice', async t => {
  const p = page(t, { writeText() { return Promise.resolve(); } }), ui = p.mount(); ui.click(); await turn();
  assert.deepEqual(ui.status(), [p.m.shareAppCopied]); ui.setLink(OTHER); ui.setLink(ADDRESS); assert.deepEqual(ui.status(), ['']);
});

test('changing an address away and back while pending still retires its old completion', async t => {
  const pending = deferred(), p = page(t, { writeText() { return pending.promise; } }), ui = p.mount();
  ui.click(); ui.setLink(OTHER); ui.setLink(ADDRESS); pending.resolve(); await turn();
  assert.deepEqual(ui.status(), ['']); assert.equal(ui.button().props.disabled, false);
});

test('an unavailable link exposes no selection or copy action in either compiled catalog', t => {
  const p = page(t), ui = p.mount(null);
  for (const locale of ['en', 'fixture-rtl']) {
    p.select(locale); assert.deepEqual(ui.status(), [p.m.shareAppUnavailable]);
    assert.equal(ui.input(), undefined); assert.equal(ui.button(), undefined); assert.equal(p.clipboardReads, 0);
  }
});
