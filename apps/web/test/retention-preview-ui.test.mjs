import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import { startAppServices } from '../src/app-services.ts';
import { Settings } from '../src/ui/Pages.tsx';
import { messages as sourceMessages } from '../src/ui/messages.ts';

const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./retention-preview-ui-fixture.ts');
// Compile the maintained panel, live catalog and error mapping. Hooks and the
// complete draft catalog are controlled; marker English is not a translation.
const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'retention-preview-ui-fixture', enforce: 'pre',
  resolveId(id) {
    if (id === entry) return '\0retention-preview-ui-fixture';
    if (id === 'react' || id === 'react/jsx-runtime') return '\0retention-preview-ui-' + id;
  },
  load(id) {
    if (id === '\0retention-preview-ui-fixture') return `
      export { RetentionPreviewPanel } from ${JSON.stringify(localPath('../src/ui/RetentionPreviewPanel.tsx'))};
      export { localeStore, messageGroup } from ${JSON.stringify(localPath('../src/ui/locale/runtime.ts'))};
      export { messages } from ${JSON.stringify(localPath('../src/ui/messages.ts'))};
      export { errorMessage } from ${JSON.stringify(localPath('../src/ui/routes.ts'))};`;
    if (id === '\0retention-preview-ui-react') return ['useLayoutEffect', 'useRef', 'useState', 'useSyncExternalStore']
      .map(name => `export const ${name} = (...args) => globalThis.hooks.${name}(...args);`).join('\n');
    if (id === '\0retention-preview-ui-react/jsx-runtime') return `
      export const Fragment = 'fragment';
      export const jsx = (type, props) => ({ type, props });
      export const jsxs = jsx;`;
    if (id === localPath('../src/ui/locale/bundled.ts')) return `
      import { sourceCatalog } from ${JSON.stringify(localPath('../src/ui/locale/en.ts'))};
      export const bundledLocaleConfiguration = { developmentFixtures: true, fixtures: [{
        id: 'fixture-rtl', locale: 'ar', messages: Object.fromEntries(Object.entries(sourceCatalog)
          .map(([key, message]) => [key, '[DRAFT ' + message.source + ']'])) }] };`;
  },
}], build: { write: false, minify: false, lib: { entry, formats: ['iife'], name: 'retentionPreviewFixture' } } });
const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
assert.equal(output.length, 1);
const compiled = output[0].code;
const PROFILE = 'a'.repeat(32), OTHER_PROFILE = 'b'.repeat(32), NOW = 1_800_000_000_000;
const PREVIEW = Object.freeze({ version: 1, revision: 17, archiveReviewCount: 3, reviewedDeleteCount: 0,
  protectedCount: 9, logicalOnly: true, backupAndRemoteCopiesUnaffected: true });
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, messageKey: 'runtime.error.' + code.toLowerCase() } });
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';
let priorSecure;
beforeEach(() => {
  priorSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
});
afterEach(() => {
  if (priorSecure) Object.defineProperty(globalThis, 'isSecureContext', priorSecure);
  else delete globalThis.isSecureContext;
});

function controlled(initial = 'unlocked') {
  let status = { state: initial }, scope = 1, profileId = PROFILE;
  const listeners = new Set(), calls = [];
  const services = {
    get current() { return status; }, get profileId() { return status.state === 'unlocked' ? profileId : null; },
    getSnapshot: () => status, selectionScope: () => scope,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    planRetention(nowMs, signal) { const gate = deferred(); calls.push({ nowMs, signal, ...gate }); return gate.promise; },
  };
  return { services, calls,
    transition(state, selectedProfile = profileId, notify = true) {
      status = { state }; scope++; profileId = selectedProfile;
      if (notify) for (const listener of [...listeners]) listener();
    },
    resolve(index, result = ok(PREVIEW)) { calls[index].resolve(result); },
  };
}

// Maintained TSX handlers run with dependency-aware hook scheduling. Facade
// responses are controlled except for the explicitly labeled real-runtime
// cases below. Retained-handler calls do not prove browser event reachability.
function mounted(t, initialServices = controlled().services) {
  const states = [], refs = [], effects = [];
  let services = initialServices, stateAt = 0, refAt = 0, effectAt = 0, dirty = true, active = true, root;
  let clockReads = 0, writesAfterUnmount = 0;
  const same = (previous, next) => previous && previous.length === next.length && next.every((item, index) => Object.is(item, previous[index]));
  function effect(callback, dependencies) {
    const at = effectAt++, previous = effects[at];
    if (!previous || !same(previous.dependencies, dependencies))
      effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
  }
  const environment = { TextEncoder, TextDecoder, AbortController,
    Date: class extends Date { static now() { clockReads++; return NOW; } },
    hooks: {
      useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
        return [states[at], value => {
          if (!active) { writesAfterUnmount++; return; }
          const next = typeof value === 'function' ? value(states[at]) : value;
          if (!Object.is(next, states[at])) { states[at] = next; dirty = true; }
        }]; },
      useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
      useLayoutEffect: effect,
      useSyncExternalStore(subscribe, getSnapshot) { effect(() => subscribe(() => { dirty = true; }), [subscribe]); return getSnapshot(); },
    },
  };
  runInNewContext(compiled, environment);
  const api = environment.retentionPreviewFixture, m = api.messageGroup('shell');
  function frame() {
    dirty = false; stateAt = refAt = effectAt = 0;
    root = api.RetentionPreviewPanel({ services }); return root;
  }
  function view() {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (dirty) frame();
      for (const item of effects) if (item.pending) { item.pending = false; item.stop?.(); item.stop = item.callback(); }
      if (!dirty) return root;
    }
    assert.fail('panel did not settle after the controlled event');
  }
  function unmount() { if (active) { for (const item of effects) item.stop?.(); active = false; } }
  t.after(unmount); view();
  const button = (key, node = view()) => nodes(node, node => node.type === 'button' && words(node) === m[key])[0];
  return { api, m, view, unmount, frame, button,
    get clockReads() { return clockReads; }, get writesAfterUnmount() { return writesAfterUnmount; },
    render() { dirty = true; return view(); },
    replaceServices(next) { services = next; dirty = true; },
    select(id) { api.localeStore.select(id); dirty = true; return view(); }, // The App owns locale rerendering.
    click(key = 'retentionPlan', node = view()) {
      const target = button(key, node); assert.ok(target, 'expected action: ' + key);
      assert.notEqual(target.props.disabled, true); target.props.onClick();
    },
    summary(preview = PREVIEW) { return api.messages.retentionCounts(preview.archiveReviewCount, preview.reviewedDeleteCount,
      preview.protectedCount, preview.revision); },
    notices() { return nodes(view(), node => /\bnotice\b/.test(node.props.className ?? '')).map(words); },
    alerts() { return nodes(view(), node => node.props.role === 'alert').map(words); },
  };
}

test('Settings exposes the offline preview and limits without inspecting records during render', () => {
  const fixture = controlled(), html = renderToStaticMarkup(createElement(Settings, { services: fixture.services }));
  for (const key of ['retentionTitle', 'retentionHelp', 'retentionLimits', 'retentionUnavailable', 'retentionProtected', 'retentionRestoreWarning', 'retentionPlan'])
    assert.ok(html.includes(sourceMessages[key]), key);
  assert.equal(fixture.calls.length, 0);
  assert.equal(html.includes(sourceMessages.retentionDelete), false);
  assert.equal(html.includes(sourceMessages.retentionReview), false);
  assert.equal(html.includes(sourceMessages.retentionConsent), false);
});

for (const state of ['locked', 'unlocked', 'unavailable']) test(`${state} rendering and locale changes start no preview or clock read`, t => {
  const fixture = controlled(state === 'unavailable' ? 'locked' : state), ui = mounted(t, state === 'unavailable' ? null : fixture.services);
  ui.render(); ui.select('fixture-rtl'); ui.select('en');
  assert.equal(fixture.calls.length, 0); assert.equal(ui.clockReads, 0);
  assert.equal(ui.button('retentionPlan').props.disabled, state !== 'unlocked');
  if (state !== 'unlocked') assert.ok(words(ui.view()).includes(state === 'unavailable' ? ui.m.unavailable : ui.m.retentionLocked));
});

for (const preview of [PREVIEW, { ...PREVIEW, revision: 0, archiveReviewCount: 0, protectedCount: 0 }])
  test(`explicit preview displays the returned counts at revision ${preview.revision} and starts only one offline request`, async t => {
    const fixture = controlled(), ui = mounted(t, fixture.services);
    ui.click(); assert.equal(fixture.calls.length, 1); assert.equal(fixture.calls[0].nowMs, NOW);
    assert.equal(ui.clockReads, 1); assert.equal(ui.view().props['aria-busy'], true);
    assert.equal(ui.button('retentionPlan').props.disabled, true); assert.ok(ui.button('retentionCancel'));
    fixture.resolve(0, ok(preview)); await turn();
    assert.ok(words(ui.view()).includes(ui.summary(preview))); assert.ok(words(ui.view()).includes(ui.m.retentionSnapshot));
    assert.equal(ui.view().props['aria-busy'], false); assert.equal(fixture.calls[0].signal.aborted, false);
    assert.equal(nodes(ui.view(), node => node.type === 'button').length, 1);
    assert.equal(words(ui.view()).includes(PROFILE), false); assert.equal(fixture.calls.length, 1);
  });

for (const close of ['cancel', 'unmount']) test(`same-render duplicate preserves the original request for ${close}`, async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services), initial = ui.view();
  ui.click('retentionPlan', initial); ui.click('retentionPlan', initial); await turn();
  assert.equal(fixture.calls.length, 1); assert.equal(ui.clockReads, 1); assert.equal(ui.view().props['aria-busy'], true);
  if (close === 'cancel') ui.click('retentionCancel');
  ui.unmount(); assert.equal(fixture.calls[0].signal.aborted, true);
  fixture.resolve(0); await turn(); assert.equal(ui.writesAfterUnmount, 0);
});

test('cancellation clears counts and a late first reply cannot clear a newer pending preview', async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); ui.click('retentionCancel');
  assert.equal(fixture.calls[0].signal.aborted, true); assert.deepEqual(ui.notices(), [ui.m.retentionCancelled]);
  ui.click(); assert.equal(fixture.calls.length, 2); fixture.resolve(0); await turn();
  assert.equal(ui.view().props['aria-busy'], true); assert.equal(fixture.calls[1].signal.aborted, false);
  assert.equal(words(ui.view()).includes(ui.summary()), false);
  fixture.resolve(1); await turn(); assert.ok(words(ui.view()).includes(ui.summary()));
});

for (const code of ['CONFLICT', 'STORAGE_UNAVAILABLE']) test(`fresh preview clears earlier counts before a ${code} refusal`, async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.resolve(0); await turn(); assert.ok(words(ui.view()).includes(ui.summary()));
  ui.click(); assert.equal(words(ui.view()).includes(ui.summary()), false);
  fixture.resolve(1, fail(code)); await turn();
  assert.deepEqual(ui.alerts(), [ui.api.errorMessage(code)]); assert.equal(words(ui.view()).includes(ui.summary()), false);
  ui.render(); assert.equal(fixture.calls.length, 2);
});

test('an ordinary thrown service failure maps to a fixed error without displaying its details', async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.calls[0].reject(Error('private fixture failure details')); await turn();
  assert.deepEqual(ui.alerts(), [ui.api.errorMessage('PROTOCOL_ERROR')]);
  assert.equal(words(ui.view()).includes('private fixture failure details'), false);
});

test('a service cancellation is a semantic status and never a deletion result', async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.resolve(0, fail('CANCELLED')); await turn();
  assert.deepEqual(ui.notices(), [ui.m.retentionCancelled]); assert.deepEqual(ui.alerts(), []);
  assert.equal(words(ui.view()).includes(ui.summary()), false);
});

for (const selectedProfile of [PROFILE, OTHER_PROFILE]) test(`${selectedProfile === PROFILE ? 'same-profile' : 'other-profile'} replacement aborts pending work before another render`, async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.transition('unlocked', selectedProfile);
  assert.equal(fixture.calls[0].signal.aborted, true);
  fixture.resolve(0); await turn(); assert.equal(words(ui.view()).includes(ui.summary()), false);
  assert.equal(ui.view().props['aria-busy'], false); assert.equal(fixture.calls.length, 1);
});

test('lock clears a displayed preview and reopening the same profile does not restore it', async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.resolve(0); await turn(); assert.ok(words(ui.view()).includes(ui.summary()));
  fixture.transition('locked'); assert.equal(words(ui.frame()).includes(ui.summary()), false);
  fixture.transition('unlocked'); assert.equal(words(ui.render()).includes(ui.summary()), false);
  assert.equal(fixture.calls.length, 1); assert.deepEqual(ui.notices(), []);
});

test('an unobserved intermediate lock still suppresses a reply after same-profile replacement', async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.transition('locked', PROFILE, false); fixture.transition('unlocked', PROFILE, false);
  fixture.resolve(0); await turn();
  assert.equal(words(ui.frame()).includes(ui.summary()), false); ui.view();
  assert.equal(ui.view().props['aria-busy'], false); assert.equal(fixture.calls.length, 1);
});

test('a pending hidden selection change is aborted on the first following layout', t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.transition('locked', PROFILE, false); fixture.transition('unlocked', PROFILE, false);
  ui.render(); assert.equal(fixture.calls[0].signal.aborted, true);
  assert.equal(ui.view().props['aria-busy'], false); assert.equal(fixture.calls.length, 1);
});

for (const completed of [false, true]) test(`replacement facade with the same scope ${completed ? 'hides completed counts' : 'aborts pending work'}`, async t => {
  const first = controlled(), second = controlled(), ui = mounted(t, first.services);
  ui.click(); if (completed) { first.resolve(0); await turn(); assert.ok(words(ui.view()).includes(ui.summary())); }
  ui.replaceServices(second.services); assert.equal(words(ui.frame()).includes(ui.summary()), false); ui.view();
  if (!completed) { assert.equal(first.calls[0].signal.aborted, true); first.resolve(0); await turn(); }
  assert.equal(words(ui.view()).includes(ui.summary()), false); assert.equal(second.calls.length, 0);
});

test('removing services clears counts, aborts work and disables preview', async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); ui.replaceServices(null); ui.render();
  assert.equal(fixture.calls[0].signal.aborted, true); assert.equal(ui.button('retentionPlan').props.disabled, true);
  fixture.resolve(0); await turn(); assert.equal(words(ui.view()).includes(ui.summary()), false);
});

test('retained handlers cannot inspect a new selection or an unmounted panel', t => {
  const fixture = controlled(), ui = mounted(t, fixture.services), initial = ui.view();
  fixture.transition('unlocked', OTHER_PROFILE); ui.click('retentionPlan', initial);
  assert.equal(fixture.calls.length, 0); assert.equal(ui.clockReads, 0);
  const current = ui.render(); ui.unmount(); ui.click('retentionPlan', current);
  assert.equal(fixture.calls.length, 0); assert.equal(ui.clockReads, 0);
});

test('locale changes relocalize pending and completed counts while preserving the same request', async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); const signal = fixture.calls[0].signal;
  ui.select('fixture-rtl'); assert.ok(words(ui.view()).includes(ui.m.retentionBusy));
  assert.ok(words(ui.view()).includes('[DRAFT ')); assert.equal(ui.button('retentionPlan').props.disabled, true);
  assert.equal(signal.aborted, false); assert.equal(fixture.calls.length, 1); assert.equal(ui.clockReads, 1);
  fixture.resolve(0); await turn(); const translated = ui.summary();
  assert.ok(words(ui.view()).includes(translated));
  ui.select('en'); assert.ok(words(ui.view()).includes(ui.summary())); assert.notEqual(ui.summary(), translated);
  ui.select('fixture-rtl'); assert.ok(words(ui.view()).includes(translated));
  assert.equal(ui.api.localeStore.getSnapshot().fundsLocaleEligible, false);
  assert.equal(fixture.calls.length, 1); assert.equal(ui.clockReads, 1); assert.equal(signal.aborted, false);
});

for (const code of ['CONFLICT', 'CANCELLED']) test(`${code} notice follows live catalog selection without repeating work`, async t => {
  const fixture = controlled(), ui = mounted(t, fixture.services);
  ui.click(); fixture.resolve(0, fail(code)); await turn();
  const expected = () => code === 'CANCELLED' ? ui.m.retentionCancelled : ui.api.errorMessage(code);
  assert.deepEqual(ui.notices(), [expected()]);
  ui.select('fixture-rtl'); assert.deepEqual(ui.notices(), [expected()]);
  ui.select('en'); assert.deepEqual(ui.notices(), [expected()]);
  assert.equal(fixture.calls.length, 1); assert.equal(ui.clockReads, 1);
});

test('saved-review guidance names the existing deletion control and interrupted-operation check', t => {
  const ui = mounted(t, null), p = ui.api.messageGroup('tradePage'), errors = ui.api.messageGroup('tradePageSavedFailed');
  for (const text of [p.persistenceHelp, errors.LIMIT_EXCEEDED]) {
    assert.ok(text.includes(p.deleteFromProfile)); assert.match(text, /8 saved reviews/);
    assert.match(text, /unlock and load saved reviews/i); assert.doesNotMatch(text, /Settings|dependency review|deletion consent/);
  }
  assert.ok(p.persistenceHelp.includes(p.remove)); assert.match(p.persistenceHelp, /save or deletion is interrupted/);
});

class Port extends EventTarget {
  sent = []; held = []; delivered = []; state = { state: 'locked', handle: null }; unlocks = 0;
  postMessage(command) {
    const { version, requestId, generation, operation } = command, base = { version, requestId, generation, operation };
    this.sent.push(base);
    if (operation === 'planRetention') { this.held.push({ base, profileId: command.profileId, nowMs: command.nowMs }); return; }
    if (operation === 'unlock') this.state = { state: 'unlocked', handle: {
      id: Buffer.alloc(32, ++this.unlocks).toString('base64url'), generation, profileId: command.profileId, purpose: 'vault',
    } };
    if (operation === 'lock' || operation === 'dispose') this.state = { state: 'locked', handle: null };
    this.reply(base, ok(this.state));
  }
  reply(base, result) { queueMicrotask(() => {
    const data = { ...base, kind: 'response', result }; this.delivered.push(data);
    this.dispatchEvent(new MessageEvent('message', { data }));
  }); }
  release(index, result = ok(PREVIEW)) { this.reply(this.held[index].base, result); }
  terminate() {}
}

async function realMounted(t) {
  const port = new Port(), services = value(await startAppServices({ createWorker: () => port, lifecycle: false })), attempts = [];
  value(await services.unlock(PROFILE, 'ordinary local fixture passphrase')); await turn();
  const observed = { get current() { return services.current; }, get profileId() { return services.profileId; },
    getSnapshot: services.getSnapshot, selectionScope: services.selectionScope, subscribe: services.subscribe,
    planRetention(nowMs, signal) { const promise = services.planRetention(nowMs, signal); attempts.push({ nowMs, signal, promise }); return promise; },
  };
  const ui = mounted(t, observed);
  t.after(async () => { ui.unmount(); await services.dispose(); });
  return { ui, port, services, attempts };
}

test('real facade/runtime receives one explicit selected-profile command and publishes validated scalar counts', async t => {
  const { ui, port, attempts } = await realMounted(t);
  assert.equal(port.held.length, 0); ui.click();
  assert.equal(attempts.length, 1); assert.equal(port.held.length, 1);
  assert.equal(port.held[0].profileId, PROFILE); assert.equal(port.held[0].nowMs, NOW);
  port.release(0); await turn(); assert.ok(words(ui.view()).includes(ui.summary()));
  assert.deepEqual(Object.keys(value(await attempts[0].promise)).sort(), Object.keys(PREVIEW).sort());
  assert.deepEqual(port.sent.map(item => item.operation), ['init', 'unlock', 'planRetention']);
});

for (const close of ['cancel', 'unmount']) test(`real runtime same-render duplicate retains abort ownership on ${close} and ignores a delivered late result`, async t => {
  const { ui, port, services, attempts } = await realMounted(t), initial = ui.view();
  ui.click('retentionPlan', initial); ui.click('retentionPlan', initial);
  assert.equal(attempts.length, 1); assert.equal(port.held.length, 1);
  if (close === 'cancel') ui.click('retentionCancel'); else ui.unmount();
  assert.equal(attempts[0].signal.aborted, true); assert.equal((await attempts[0].promise).error.code, 'CANCELLED');
  port.release(0); await turn();
  assert.equal(services.current.state, 'locked');
  assert.equal(port.delivered.filter(item => item.operation === 'planRetention' && item.result.ok).length, 1);
  if (close === 'cancel') { assert.equal(words(ui.view()).includes(ui.summary()), false); assert.ok(words(ui.view()).includes(ui.m.retentionLocked)); }
  assert.equal(ui.writesAfterUnmount, 0);
});

test('real stable unlocked snapshot cannot preserve counts across a hidden same-profile reopen', async t => {
  const { ui, port, services, attempts } = await realMounted(t);
  ui.click(); port.release(0); await turn(); assert.ok(words(ui.view()).includes(ui.summary()));
  const snapshot = services.getSnapshot(), scope = services.selectionScope();
  value(await services.lock()); value(await services.unlock(PROFILE, 'ordinary local fixture passphrase')); await turn();
  assert.equal(services.getSnapshot(), snapshot); assert.notEqual(services.selectionScope(), scope);
  assert.equal(words(ui.view()).includes(ui.summary()), false); assert.equal(attempts.length, 1);
});

test('real lock and profile replacement abort pending UI ownership and suppress late counts', async t => {
  const { ui, port, services, attempts } = await realMounted(t);
  ui.click(); value(await services.lock()); await turn();
  assert.equal(attempts[0].signal.aborted, true);
  value(await services.unlock(OTHER_PROFILE, 'ordinary local fixture passphrase')); port.release(0); await turn();
  assert.equal(words(ui.view()).includes(ui.summary()), false); assert.equal(attempts.length, 1);
  ui.click(); assert.equal(port.held[1].profileId, OTHER_PROFILE);
  port.release(1, ok({ ...PREVIEW, revision: 23 })); await turn();
  assert.ok(words(ui.view()).includes(ui.summary({ ...PREVIEW, revision: 23 })));
});
