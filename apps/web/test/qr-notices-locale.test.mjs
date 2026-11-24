import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { build, transformWithOxc } from 'vite';
import { createQrEnvelope, encodeQrText, decodeQrText, GENERATION_TARGET_BYTES, MAX_QR_TEXT_LENGTH } from '../../../packages/qr/index.ts';
import { INPUTS, deps, context as qrContext, encodeDeps } from '../../../packages/qr/test/helpers.mjs';

const source = await readFile(new URL('../src/ui/QrPanel.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('export function QrReviewDetails')).replace(/^export /gm, '');
const emitted = (await transformWithOxc(body, 'QrPanel.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./qr-notice-locale-fixture.ts');
// Actual maintained locale/runtime/error views with explicitly compiled draft copy.
// This fixture does not add a production language or qualify a physical camera.
const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'qr-notice-locale-fixture',
  resolveId(id) { if (id === entry) return '\0qr-notice-locale-fixture'; },
  load(id) {
    if (id === '\0qr-notice-locale-fixture') return [
      'export { qrMessages as q } from ' + JSON.stringify(localPath('../src/ui/qr-messages.ts')) + ';',
      'export { localeStore } from ' + JSON.stringify(localPath('../src/ui/locale/runtime.ts')) + ';',
      'export { fixedFailure } from ' + JSON.stringify(localPath('../src/qr/protocol.ts')) + ';',
    ].join('\n');
    if (id === localPath('../src/ui/locale/bundled.ts')) return [
      'import { sourceCatalog } from ' + JSON.stringify(localPath('../src/ui/locale/en.ts')) + ';',
      'export const bundledLocaleConfiguration = { developmentFixtures: true, fixtures: [{',
      "id: 'fixture-rtl', locale: 'ar', messages: Object.fromEntries(Object.entries(sourceCatalog)",
      ".map(([key, message]) => [key, '[DRAFT ' + message.source + ']'])) }] };",
    ].join('\n');
  },
}], build: { write: false, minify: false, lib: { entry, formats: ['es'] } } });
const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
assert.equal(output.length, 1);
const copy = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
const { q, localeStore } = copy;
const encoded = await createQrEnvelope(INPUTS['payment-request'], deps('locale-notice'));
assert.equal(encoded.ok, true);
const publicCode = await encodeQrText(encoded.envelope, encodeDeps());
assert.equal(publicCode.ok, true);
const decoded = await decodeQrText(publicCode.text, qrContext());
assert.equal(decoded.ok, true);
const PUBLIC_TEXT = publicCode.text, PUBLIC_REVIEW = decoded.review;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

// Execute maintained handlers and dependency-aware hooks. Controller/camera ports
// are controlled ordinary outcomes; rendering after selection mirrors the parent
// App locale subscription. This is Node UI qualification, not native browser proof.
function mounted(t) {
  localeStore.select('en');
  const states = [], refs = [], effects = [], subscribers = new Set(), timers = new Map();
  const events = new Map(), held = { review: deferred(), camera: deferred(), copy: deferred() };
  const calls = { controller: 0, decoder: 0, camera: 0, read: [], copy: [], download: [],
    cancel: 0, cameraCancel: 0, decoderCancel: 0, start: 0, capture: 0, ready: 0, dispose: 0 };
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = true, active = true, root, scope = 1, clock = 0, timerId = 0;
  let snapshot = { phase: 'idle', busy: false, error: null, review: null, confirmed: false, matrix: null, comparison: null };
  let cameraState = { state: 'idle', error: null }, readyCode = null, downloadFailure = false, focus = 0, writes = 0;
  const notify = () => { for (const subscriber of subscribers) subscriber(); };
  const publish = changes => { snapshot = { ...snapshot, ...changes }; notify(); };
  const subscribe = listener => { subscribers.add(listener); return () => subscribers.delete(listener); };
  const controller = { subscribe, getSnapshot: () => snapshot,
    reviewText: async text => { calls.read.push(text); return held.review.promise; },
    confirmedText() { calls.ready++; return readyCode ? { ok: false, code: readyCode } : { ok: true, value: PUBLIC_TEXT }; },
    cancel() { calls.cancel++; publish({ phase: 'idle', busy: false, error: null, review: null, confirmed: false }); },
    dispose() { calls.dispose++; },
  };
  const camera = { subscribe, getSnapshot: () => cameraState,
    async start() { calls.start++; return held.camera.promise; },
    cancel() { calls.cameraCancel++; cameraState = { state: 'idle', error: null }; notify(); },
    dispose() { calls.dispose++; },
  };
  function effect(callback, dependencies) {
    const at = effectAt++, previous = effects[at];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index])))
      effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
  }
  const environment = {
    ...copy, GENERATION_TARGET_BYTES, MAX_QR_TEXT_LENGTH,
    document: { visibilityState: 'visible', addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) },
    window: { addEventListener: (name, callback) => events.set(name, callback), removeEventListener: name => events.delete(name) },
    Date: { now: () => clock },
    setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
    trustedQrContext: () => null,
    createQrReviewController() { calls.controller++; return controller; },
    createCameraCapture() { calls.camera++; return camera; },
    createBrowserQrDecoder() { calls.decoder++; return { cancel() { calls.decoderCancel++; }, dispose() { calls.dispose++; } }; },
    captureQrFrame() { calls.capture++; throw Error('Ordinary frame unavailable'); },
    async copyPublicQrText(text) { calls.copy.push(text); return held.copy.promise; },
    downloadPublicQrText(text) { calls.download.push(text); if (downloadFailure) throw Error('Ordinary download unavailable'); },
    QrSymbol: props => ({ type: 'svg', props }),
    React: { Fragment: 'fragment' },
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial;
      return [states[at], value => { if (!active) return; writes++; const next = typeof value === 'function' ? value(states[at]) : value;
        if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useLayoutEffect: effect,
    useSyncExternalStore(subscribe, getSnapshot) { effect(() => subscribe(() => { dirty = true; }), [subscribe]); return getSnapshot(); },
    jsx(type, props, ...children) {
      if (props?.ref) props.ref.current = { focus() { focus++; }, pause() {}, srcObject: null };
      const full = { ...props, children };
      return typeof type === 'function' ? type(full) : { type, props: full };
    },
  };
  runInNewContext(emitted + '\nglobalThis.Panel = QrPanel;', environment);
  function view() {
    for (let attempt = 0; dirty && attempt < 10; attempt++) {
      dirty = false; stateAt = refAt = effectAt = 0; root = environment.Panel({ services: null, trade: null, scope });
      for (const item of effects) if (item.pending) { item.pending = false; item.stop?.(); item.stop = item.callback(); }
    }
    assert.equal(dirty, false, 'panel settles after the controlled event');
    return root;
  }
  const unmount = () => { if (active) { for (const item of effects) item.stop?.(); active = false; } };
  t.after(() => { unmount(); localeStore.select('en'); });
  const button = key => nodes(view(), node => node.type === 'button' && words(node) === q[key])[0];
  view();
  return { calls, held, view, unmount,
    get focus() { return focus; }, get writes() { return writes; },
    select(id) { localeStore.select(id); dirty = true; return view(); },
    alerts() { return nodes(view(), node => node.props.role === 'alert').map(words); },
    click(key) { const target = button(key); assert.ok(target, 'visible control ' + key); assert.equal(target.props.disabled, undefined === target.props.disabled ? undefined : false);
      target.props.onClick(); return view(); },
    read() { nodes(view(), node => node.props.id === 'qr-public-text')[0].props.onChange({ currentTarget: { value: PUBLIC_TEXT } });
      nodes(view(), node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} }); return view(); },
    review(review = PUBLIC_REVIEW) { publish({ phase: 'review', review, confirmed: true, matrix: { size: 1, modules: [true] } }); return view(); },
    decline(code) { readyCode = code; },
    failDownload() { downloadFailure = true; },
    liveCamera() { cameraState = { state: 'live', error: null }; notify(); return view(); },
    error(code) { publish({ error: code }); return view(); },
    expire() { clock = (PUBLIC_REVIEW.expiresAt - 60) * 1000; for (const callback of [...timers.values()]) callback(); return view(); },
    nextScope() { scope++; dirty = true; return view(); },
  };
}

test('QR controls reference their visible instructions in the selected locale', async t => {
  const ui = mounted(t);
  const created = await createQrEnvelope(INPUTS['recovery-fingerprint'], deps('described-fingerprint'));
  const encoded = await encodeQrText(created.envelope, encodeDeps());
  const fingerprint = await decodeQrText(encoded.text, qrContext());
  assert.equal(fingerprint.ok, true);
  ui.review(fingerprint.review);

  for (const locale of ['en', 'fixture-rtl']) {
    const root = ui.select(locale);
    const instructions = [
      ['qr-image-file', q.imageLimits],
      ['qr-public-file', q.fileLimits],
      ['qr-public-text', q.textHelp],
      ['qr-fingerprint-format', q.fingerprintHelp],
      ['qr-fingerprint-file', q.fingerprintHelp],
      ['qr-compare-file', q.compareHelp],
    ];
    const assertDescription = (controls, expected) => {
      assert.equal(controls.length, 1, 'the control is rendered once');
      const id = controls[0].props['aria-describedby'];
      assert.ok(id, 'the control references its instructions');
      const descriptions = nodes(root, node => node.props.id === id);
      assert.equal(descriptions.length, 1, 'the description has a unique target');
      assert.equal(words(descriptions[0]), expected);
    };
    for (const [id, expected] of instructions) {
      assertDescription(nodes(root, node => node.props.id === id), expected);
    }
    assertDescription(nodes(root, node => node.type === 'button' && words(node) === q.cameraStart), q.cameraHelp);
  }
});

function followsLocale(ui, expected) {
  assert.deepEqual(ui.alerts(), [expected()]);
  const before = structuredClone(ui.calls);
  ui.select('fixture-rtl'); assert.deepEqual(ui.alerts(), [expected()]);
  ui.select('en'); assert.deepEqual(ui.alerts(), [expected()]);
  assert.deepEqual(ui.calls, before, 'language selection performs no QR, camera, clipboard or download operation');
}

test('completed QR read notice follows later locale selection without reading again', async t => {
  const ui = mounted(t); ui.read(); ui.held.review.resolve({ ok: false, code: 'NO_CODE' }); await turn();
  followsLocale(ui, () => q.errors.NO_CODE); assert.deepEqual(ui.calls.read, [PUBLIC_TEXT]);
});

test('ordinary thrown read failure keeps its fixed mapping through locale selection', async t => {
  const ui = mounted(t); ui.read(); ui.held.review.reject(Error('Ordinary read unavailable')); await turn();
  followsLocale(ui, () => q.errors.UNAVAILABLE);
});

test('camera-unavailable notice follows selected copy without another camera request', async t => {
  const ui = mounted(t); ui.click('cameraStart'); ui.held.camera.resolve({ ok: false, code: 'CAMERA_UNAVAILABLE' }); await turn();
  followsLocale(ui, () => q.errors.CAMERA_UNAVAILABLE); assert.equal(ui.calls.start, 1);
});

test('ordinary capture failure follows selected copy without capturing again', t => {
  const ui = mounted(t); ui.liveCamera(); ui.click('cameraCapture');
  followsLocale(ui, () => q.errors.UNAVAILABLE); assert.equal(ui.calls.capture, 1);
});

for (const ok of [true, false]) test('clipboard ' + (ok ? 'completion' : 'unavailability') + ' notice follows locale while copied bytes stay exact', async t => {
  const ui = mounted(t); ui.review(); ui.click('copy'); ui.held.copy.resolve({ ok }); await turn();
  followsLocale(ui, () => ok ? q.copied : q.copyUnavailable); assert.deepEqual(ui.calls.copy, [PUBLIC_TEXT]);
});

test('ordinary download failure follows selected copy without repeating the export', t => {
  const ui = mounted(t); ui.review(); ui.failDownload(); ui.click('download');
  followsLocale(ui, () => q.errors.UNAVAILABLE); assert.deepEqual(ui.calls.download, [PUBLIC_TEXT]);
});

for (const action of ['display', 'copy', 'download']) test(action + ' review-required notice follows locale without repeating the readiness check', t => {
  const ui = mounted(t); ui.review(); ui.decline('REVIEW_REQUIRED'); ui.click(action);
  followsLocale(ui, () => q.errors.REVIEW_REQUIRED); assert.equal(ui.calls.ready, 1);
  assert.equal(ui.calls.copy.length, 0); assert.equal(ui.calls.download.length, 0);
});

test('existing expiry notice follows locale and keeps the reviewed content discarded', t => {
  const ui = mounted(t); ui.review(); ui.expire();
  followsLocale(ui, () => q.errors.EXPIRED);
  assert.equal(nodes(ui.view(), node => node.props.className === 'qr-review').length, 0);
});

test('a pending read completes in the selected catalog and remains localizable afterward', async t => {
  const ui = mounted(t); ui.read(); ui.select('fixture-rtl'); ui.held.review.resolve({ ok: false, code: 'NO_CODE' }); await turn();
  assert.deepEqual(ui.alerts(), [q.errors.NO_CODE]);
  ui.select('en'); assert.deepEqual(ui.alerts(), [q.errors.NO_CODE]); assert.deepEqual(ui.calls.read, [PUBLIC_TEXT]);
});

test('cancel retires a late read result across language selection', async t => {
  const ui = mounted(t); ui.read(); ui.select('fixture-rtl'); ui.click('cancel');
  ui.held.review.resolve({ ok: false, code: 'NO_CODE' }); await turn();
  assert.deepEqual(ui.alerts(), []); ui.select('en'); assert.deepEqual(ui.alerts(), []); assert.equal(ui.calls.read.length, 1);
});

test('scope change retires a pending clipboard notice across language selection', async t => {
  const ui = mounted(t); ui.review(); ui.click('copy'); ui.select('fixture-rtl'); ui.nextScope();
  ui.held.copy.resolve({ ok: true }); await turn();
  assert.deepEqual(ui.alerts(), []); assert.deepEqual(ui.calls.copy, [PUBLIC_TEXT]);
});

test('canonical public review values and control state remain unchanged across locale selection', t => {
  const ui = mounted(t); ui.review(); ui.click('display');
  const before = structuredClone(ui.calls), focus = ui.focus;
  for (const id of ['fixture-rtl', 'en']) {
    ui.select(id);
    const visible = words(ui.view());
    for (const value of [PUBLIC_REVIEW.requestId, PUBLIC_REVIEW.payloadSha256, ...PUBLIC_REVIEW.display.map(field => field.value)])
      assert.ok(visible.includes(value), 'complete public identity remains present');
    assert.equal(ui.view().props['data-qr-confirmed'], 'true');
    assert.equal(nodes(ui.view(), node => node.type === 'svg').length, 1);
    assert.equal(ui.focus, focus);
    assert.deepEqual(ui.calls, before);
  }
  ui.select('fixture-rtl'); assert.equal(localeStore.getSnapshot().fundsLocaleEligible, false);
});

test('controller fallback errors continue using the selected catalog without a stored notice', t => {
  const ui = mounted(t); ui.error('NO_CODE');
  followsLocale(ui, () => q.errors.NO_CODE);
});

test('unmount retires a delayed camera result without publishing notice state', async t => {
  const ui = mounted(t); ui.click('cameraStart'); ui.unmount(); const writes = ui.writes;
  ui.held.camera.resolve({ ok: false, code: 'CAMERA_UNAVAILABLE' }); await turn();
  assert.equal(ui.writes, writes); assert.equal(ui.calls.start, 1);
});
