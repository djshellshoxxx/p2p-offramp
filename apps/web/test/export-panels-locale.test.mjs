import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { build, transformWithOxc } from 'vite';
import { MAX_RECOVERY_REFERENCE_EXPORT_BYTES, parseRecoveryReferences, parseRecoveryReferenceExportBytes } from '../../../packages/schemas/index.ts';

const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./export-panels-locale-fixture.ts');
// Compile the maintained locale runtime and message views with explicit draft copy.
// Marker text qualifies live selection behavior, not a translation or browser.
const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'export-panels-locale-fixture',
  resolveId(id) { if (id === entry) return '\0export-panels-locale-fixture'; },
  load(id) {
    if (id === '\0export-panels-locale-fixture') return `
      export { diagnosticsMessages as d } from ${JSON.stringify(localPath('../src/ui/diagnostics-messages.ts'))};
      export { recoveryReferenceMessages as r } from ${JSON.stringify(localPath('../src/ui/recovery-reference-messages.ts'))};
      export { errorMessage } from ${JSON.stringify(localPath('../src/ui/routes.ts'))};
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
const { d, r, errorMessage, localeStore } = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
const emitted = {};
for (const [name, start] of [['DiagnosticsPanel', 'function download('], ['RecoveryReferencesPanel', 'const noSubscribe =']]) {
  const source = await readFile(new URL(`../src/ui/${name}.tsx`, import.meta.url), 'utf8');
  const body = source.slice(source.indexOf(start)).replace(/^export /gm, '');
  emitted[name] = (await transformWithOxc(body, `${name}.tsx`, { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
}
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, messageKey: 'runtime.error.' + code.toLowerCase() } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

// Execute maintained handlers with dependency-aware hooks and controlled facades.
// Native Worker, browser download and durable storage qualification remain separate.
function mounted(t, name, props) {
  localeStore.select('en');
  const states = [], refs = [], effects = [], blobs = [], downloads = [];
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = false, active = true, focus = 0;
  const document = { body: { append() {} }, activeElement: null,
    createElement(tag) { assert.equal(tag, 'a'); return { remove() {}, click() { downloads.push({ href: this.href, name: this.download }); } }; } };
  document.activeElement = document.body;
  function effect(callback, dependencies, layout) {
    const at = effectAt++, previous = effects[at];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index])))
      effects[at] = { callback, dependencies, layout, pending: true, stop: previous?.stop };
  }
  const context = {
    m: name === 'DiagnosticsPanel' ? d : r, errorMessage, MAX_RECOVERY_REFERENCE_EXPORT_BYTES,
    AbortController, Uint8Array, Blob, TextEncoder, TextDecoder, document, Fragment: 'fragment', React: { Fragment: 'fragment' },
    URL: { createObjectURL(blob) { blobs.push(blob); return `blob:fixture-${blobs.length}`; }, revokeObjectURL() {} },
    setTimeout(callback) { callback(); },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial;
      return [states[at], value => { if (!active) return; const next = typeof value === 'function' ? value(states[at]) : value;
        if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useLayoutEffect(callback, dependencies) { effect(callback, dependencies, true); },
    useEffect(callback, dependencies) { effect(callback, dependencies, false); },
    jsx(type, props, ...children) {
      if (props?.ref) props.ref.current = { focus() { focus++; } };
      return { type, props: { ...props, children } };
    },
  };
  runInNewContext(`${emitted[name]}\nglobalThis.Panel = ${name};`, context);
  function render() {
    for (let attempt = 0; attempt < 10; attempt++) {
      dirty = false; stateAt = refAt = effectAt = 0; const root = context.Panel(props);
      for (const layout of [true, false]) for (const item of effects) if (item.pending && item.layout === layout) {
        item.pending = false; item.stop?.(); item.stop = item.callback();
      }
      if (!dirty) return root;
    }
    assert.fail('panel did not settle after controlled hooks');
  }
  const unmount = () => { if (active) { for (const item of effects) item.stop?.(); active = false; } };
  t.after(() => { unmount(); localeStore.select('en'); });
  const ui = {
    blobs, downloads, render, unmount, get focus() { return focus; },
    select(id) { localeStore.select(id); return render(); },
    click(label) {
      const button = nodes(render(), node => node.type === 'button' && words(node) === label)[0];
      assert.ok(button, `button exists: ${label}`); assert.notEqual(button.props.disabled, true);
      document.activeElement = button; button.props.onClick({ currentTarget: button });
    },
    check(index) {
      const input = nodes(render(), node => node.type === 'input' && node.props.type === 'checkbox')[index];
      assert.ok(input); assert.notEqual(input.props.disabled, true); input.props.onChange({ currentTarget: { checked: true } });
    },
    notices() { return nodes(render(), node => node.props.className === 'notice' && node.props.role === 'status').map(words); },
    alerts() { return nodes(render(), node => node.props.role === 'alert').map(words); },
    previewText() { return nodes(render(), node => node.type === 'textarea')[0]?.props.value; },
  };
  render(); return ui;
}

function diagnostics(t) {
  const calls = [], copies = [], text = '{"version":1,"events":[{"module":"vault","operation":"read","timeBucket":"2026-01-01T00"}]}';
  const preview = { bytes: new TextEncoder().encode(text), rows: [] };
  let collectionError = null;
  const service = {
    collectDiagnostics() { calls.push('collect'); return collectionError ? fail(collectionError) : ok({ configured: true, warnings: [],
      events: [{ module: 'vault', operation: 'read', errorCode: 'STORAGE_UNAVAILABLE', timeBucket: '2026-01-01T00' }] }); },
    previewExport(_collection, selected) { calls.push('preview'); assert.deepEqual(Array.from(selected), [0]); return ok(preview); },
    confirmExport(value) { calls.push('confirm'); assert.equal(value, preview); const bytes = new Uint8Array(preview.bytes); copies.push(bytes); return ok(bytes); },
    clearDiagnostics() { calls.push('clear'); return ok({}); },
  };
  const ui = mounted(t, 'DiagnosticsPanel', { service });
  return Object.assign(ui, { calls, copies, text, preview, failCollection(code) { collectionError = code; },
    showPreview() { ui.check(0); ui.click(d.preview); ui.render(); } });
}
const referencePage = parseRecoveryReferences({ authority: 'unverified-offline-reference', revision: 7, offset: 0,
  nextOffset: null, totalJournalRecords: 1, unsupported: 0, items: [{ recordId: '1'.repeat(32),
    intentId: Buffer.alloc(32, 1).toString('base64url'), binding: { chain: 'evm', networkId: 'evm:1', deploymentId: 'escrow-v1', tradeId: 'trade-1' },
    account: `0x${'12'.repeat(20)}`, action: 'fund', storedState: 'finalized', chainReference: null, nonce: '1' }] });
function recovery(t) {
  const calls = []; let result = ok(structuredClone(referencePage)), held = null, scope = 1, status = { state: 'unlocked' };
  const services = { get current() { return status; }, getSnapshot: () => status, selectionScope: () => scope, subscribe: () => () => {},
    async listRecoveryReferences(offset, expectedRevision, signal) { calls.push({ offset, expectedRevision, signal }); return held ? held.promise : result; } };
  const ui = mounted(t, 'RecoveryReferencesPanel', { services });
  return Object.assign(ui, { calls, setResult(value) { result = value; }, hold() { held = deferred(); return held; },
    retire() { scope++; status = { state: 'locked' }; },
    async showPreview() { ui.click(r.load); await turn(); ui.check(0); ui.check(1); ui.click(r.preview); return ui.previewText(); } });
}

test('completed diagnostic clear notice follows both locale selections without repeating collection or clear', t => {
  const ui = diagnostics(t); ui.click(d.clear); assert.deepEqual(ui.notices(), [d.cleared]);
  const calls = [...ui.calls]; ui.select('fixture-rtl'); assert.deepEqual(ui.notices(), [d.cleared]);
  ui.select('en'); assert.deepEqual(ui.notices(), [d.cleared]); assert.deepEqual(ui.calls, calls);
});

test('diagnostic download notice changes language without another confirmation or download', async t => {
  const ui = diagnostics(t); ui.showPreview(); ui.click(d.download); assert.deepEqual(ui.notices(), [d.downloaded]);
  assert.equal(await ui.blobs[0].text(), ui.text); assert.ok(ui.copies[0].every(byte => byte === 0));
  const calls = [...ui.calls]; ui.select('fixture-rtl'); assert.deepEqual(ui.notices(), [d.downloaded]);
  ui.select('en'); assert.deepEqual(ui.notices(), [d.downloaded]); assert.deepEqual(ui.calls, calls);
  assert.equal(ui.downloads.length, 1); assert.equal(ui.downloads[0].name, 'p2p-diagnostics.json');
});

test('diagnostic preview bytes and selection survive locale selection until an explicit download', async t => {
  const ui = diagnostics(t); ui.showPreview(); const calls = [...ui.calls];
  ui.select('fixture-rtl'); assert.equal(ui.previewText(), ui.text);
  assert.equal(nodes(ui.render(), node => node.type === 'input')[0].props.checked, true);
  assert.deepEqual(ui.calls, calls); assert.equal(ui.downloads.length, 0);
  assert.equal(localeStore.getSnapshot().fundsLocaleEligible, false);
  ui.click(d.download); assert.equal(await ui.blobs[0].text(), ui.text); assert.equal(ui.downloads.length, 1);
});

test('existing diagnostic error codes continue to resolve at render without another collection', t => {
  const ui = diagnostics(t); ui.failCollection('STORAGE_UNAVAILABLE'); ui.click(d.refresh);
  assert.deepEqual(ui.alerts(), [d.errors.STORAGE_UNAVAILABLE]); const calls = [...ui.calls];
  ui.select('fixture-rtl'); assert.deepEqual(ui.alerts(), [d.errors.STORAGE_UNAVAILABLE]); assert.deepEqual(ui.calls, calls);
});

test('completed recovery listing refusal follows live locale selection without another read', async t => {
  const ui = recovery(t); ui.setResult(fail('STORAGE_UNAVAILABLE')); ui.click(r.load); await turn();
  assert.deepEqual(ui.alerts(), [errorMessage('STORAGE_UNAVAILABLE')]);
  ui.select('fixture-rtl'); assert.deepEqual(ui.alerts(), [errorMessage('STORAGE_UNAVAILABLE')]);
  ui.select('en'); assert.deepEqual(ui.alerts(), [errorMessage('STORAGE_UNAVAILABLE')]); assert.equal(ui.calls.length, 1);
});

test('ordinary thrown recovery listing error retains its fixed mapping after language changes', async t => {
  const ui = recovery(t), reply = ui.hold(); ui.click(r.load); reply.reject(Error('ordinary fixture read failure')); await turn();
  assert.deepEqual(ui.alerts(), [errorMessage('PROTOCOL_ERROR')]);
  ui.select('fixture-rtl'); assert.deepEqual(ui.alerts(), [errorMessage('PROTOCOL_ERROR')]); assert.equal(ui.calls.length, 1);
});

test('recovery download notice changes language while the revision-pinned export remains byte exact', async t => {
  const ui = recovery(t), preview = await ui.showPreview(); ui.click(r.download); await turn();
  assert.deepEqual(ui.notices(), [r.downloaded]); assert.equal(await ui.blobs[0].text(), preview);
  const exported = parseRecoveryReferenceExportBytes(new Uint8Array(await ui.blobs[0].arrayBuffer()));
  assert.deepEqual(exported.items, referencePage.items); assert.equal(exported.localSnapshotRevision, 7);
  ui.select('fixture-rtl'); assert.deepEqual(ui.notices(), [r.downloaded]);
  ui.select('en'); assert.deepEqual(ui.notices(), [r.downloaded]);
  assert.deepEqual(ui.calls.map(({ offset, expectedRevision }) => ({ offset, expectedRevision })), [{ offset: 0, expectedRevision: null }, { offset: 0, expectedRevision: 7 }]);
  assert.equal(ui.downloads.length, 1); assert.equal(ui.downloads[0].name, 'p2p-private-recovery-references.json');
});

test('recovery preview and consent survive a language change without a read, focus move or download', async t => {
  const ui = recovery(t), preview = await ui.showPreview(), focus = ui.focus;
  ui.select('fixture-rtl'); assert.equal(ui.previewText(), preview); assert.equal(ui.focus, focus);
  assert.deepEqual(nodes(ui.render(), node => node.type === 'input').map(node => node.props.checked), [true, true]);
  assert.equal(ui.calls.length, 1); assert.equal(ui.downloads.length, 0);
  ui.click(r.download); await turn(); assert.equal(await ui.blobs[0].text(), preview); assert.equal(ui.calls.length, 2);
});

test('locale changes during a held revision recheck preserve refusal and do not retry the export', async t => {
  const ui = recovery(t); await ui.showPreview(); const reply = ui.hold(); ui.click(r.download); ui.select('fixture-rtl');
  assert.equal(ui.calls.length, 2); assert.equal(ui.downloads.length, 0);
  assert.ok(nodes(ui.render(), node => node.type === 'p' && node.props.role === 'status').some(node => words(node) === r.loading));
  reply.resolve(fail('CONFLICT')); await turn(); assert.deepEqual(ui.alerts(), [errorMessage('CONFLICT')]);
  ui.select('en'); assert.deepEqual(ui.alerts(), [errorMessage('CONFLICT')]);
  assert.equal(ui.previewText(), undefined); assert.equal(ui.downloads.length, 0); assert.equal(ui.calls.length, 2);
});

test('locale selection does not revive an export recheck retired by lock or unmount', async t => {
  for (const retirement of ['lock', 'unmount']) {
    const ui = recovery(t); await ui.showPreview(); const reply = ui.hold(); ui.click(r.download); ui.select('fixture-rtl');
    if (retirement === 'lock') { ui.retire(); ui.render(); } else ui.unmount();
    assert.equal(ui.calls.at(-1).signal.aborted, true); reply.resolve(ok(structuredClone(referencePage))); await turn();
    assert.equal(ui.downloads.length, 0); assert.equal(ui.calls.length, 2);
  }
});
