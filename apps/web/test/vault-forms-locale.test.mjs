import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { build, transformWithOxc } from 'vite';
import { MAX_BACKUP_BYTES, MAX_VAULT_PROFILES } from '../../../packages/schemas/index.ts';

const source = await readFile(new URL('../src/ui/VaultForms.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('type Notice =')).replace(/^export /gm, '');
const emitted = (await transformWithOxc(body, 'VaultForms.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
const localPath = path => fileURLToPath(new URL(path, import.meta.url));
const entry = localPath('./vault-forms-locale-fixture.ts');
// Compile the real locale runtime and message/error views with complete draft
// fixture copy. This does not introduce a production locale or review approval.
const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [{
  name: 'vault-forms-locale-fixture',
  resolveId(id) { if (id === entry) return '\0vault-forms-locale-fixture'; },
  load(id) {
    if (id === '\0vault-forms-locale-fixture') return `
      export { messages as m } from ${JSON.stringify(localPath('../src/ui/messages.ts'))};
      export { errorMessage, isProfileId } from ${JSON.stringify(localPath('../src/ui/routes.ts'))};
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
const PROFILE = 'a'.repeat(32), RESTORED = 'b'.repeat(32);
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, messageKey: 'runtime.error.' + code.toLowerCase() } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

// Execute the maintained form handlers and stateless NoticeText child. The
// parent locale rerender, hooks, facade results and DOM download are controlled;
// native Worker/crypto/browser behavior belongs to the separate existing gates.
function mounted(t, name) {
  localeStore.select('en');
  const states = [], refs = [], effects = [], calls = [], downloads = [], blobs = [], opened = [], done = [], readBuffers = [];
  const results = { listProfiles: ok({ profileIds: [PROFILE], truncated: false }), unlock: fail('AUTHENTICATION_FAILED'),
    create: fail('STORAGE_UNAVAILABLE'), exportEncrypted: ok({ bytes: new Uint8Array([11, 22, 33]), authentication: 'not-checked' }),
    restore: ok({ newProfileId: RESTORED, records: 17 }) };
  const held = new Map();
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = false, active = true, reads = 0, inventoryChanges = 0, cancelled = 0;
  const fields = { profile: { value: PROFILE }, source: { value: 'ordinary source fixture passphrase' },
    passphrase: { value: 'ordinary new fixture passphrase' }, confirm: { value: 'ordinary new fixture passphrase' },
    consent: { checked: true }, file: { value: 'backup.json', files: [{ size: 3, async arrayBuffer() {
      reads++; const bytes = new Uint8Array([44, 55, 66]).buffer; readBuffers.push(bytes); return bytes;
    } }] } };
  const form = { elements: { namedItem(key) { assert.ok(key in fields); return fields[key]; } },
    reset() { for (const input of Object.values(fields)) { if ('value' in input) input.value = ''; if ('checked' in input) input.checked = false; }
      fields.file.files = []; }, querySelector() { return { focus() {} }; } };
  const services = Object.fromEntries(Object.keys(results).map(kind => [kind, async (...args) => {
    calls.push({ kind, args });
    if (held.has(kind)) return held.get(kind).promise;
    if (results[kind] instanceof Error) throw results[kind];
    return results[kind];
  }]));
  function effect(callback, dependencies) {
    const at = effectAt++, previous = effects[at];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index])))
      effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
  }
  const context = { ...copy, MAX_BACKUP_BYTES, MAX_VAULT_PROFILES, AbortController, Blob, Uint8Array, setTimeout,
    document: { body: { append() {} }, createElement(tag) { assert.equal(tag, 'a'); return {
      click() { downloads.push({ name: this.download, url: this.href }); }, remove() {},
    }; } },
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:fixture/' + blobs.length; }, revokeObjectURL() {} },
    ControlHelp: () => null,
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial;
      return [states[at], value => { if (!active) return; const next = typeof value === 'function' ? value(states[at]) : value;
        if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useEffect: effect,
    jsx(type, props, ...children) {
      if (type === 'form' && props.ref) props.ref.current = form;
      if (typeof type === 'function') return type({ ...props, children });
      return { type, props: { ...props, children } };
    },
  };
  runInNewContext(`${emitted}\nglobalThis.forms = { UnlockForm, ExportForm, CreateForm, RestoreForm };`, context);
  const props = { services, onCancel() { cancelled++; }, onDone(id) { done.push(id); },
    onInventoryChanged() { inventoryChanges++; }, onOpenRestored(id) { opened.push(id); } };
  function render() {
    for (let count = 0; count < 10; count++) {
      dirty = false; stateAt = refAt = effectAt = 0; const root = context.forms[name](props);
      for (const item of effects) if (item.pending) { item.pending = false; item.stop?.(); item.stop = item.callback(); }
      if (!dirty) return root;
    }
    assert.fail('form state did not settle');
  }
  const unmount = () => { if (active) { for (const item of effects) item.stop?.(); active = false; } };
  t.after(() => { unmount(); localeStore.select('en'); }); render();
  const notices = () => nodes(render(), node => node.type === 'p' && /\bnotice\b/.test(node.props.className ?? ''));
  const button = label => nodes(render(), node => node.type === 'button' && words(node) === label)[0];
  return { fields, calls, downloads, blobs, opened, done, readBuffers, render, unmount, button,
    get reads() { return reads; }, get inventoryChanges() { return inventoryChanges; }, get cancelled() { return cancelled; },
    notice() { return notices().map(words); }, roles() { return notices().map(node => node.props.role); },
    select(id) { localeStore.select(id); return render(); },
    submit() { return render().props.onSubmit({ preventDefault() {}, currentTarget: form }); },
    click(label) { const target = button(label); assert.ok(target); assert.notEqual(target.props.disabled, true); target.props.onClick(); },
    result(kind, value) { results[kind] = value; }, hold(kind) { const value = deferred(); held.set(kind, value); return value; },
  };
}
function selectBoth(ui, expected, role = 'alert') {
  const calls = ui.calls.length, reads = ui.reads, downloads = ui.downloads.length;
  assert.deepEqual(ui.notice(), [expected()]); assert.deepEqual(ui.roles(), [role]);
  ui.select('fixture-rtl'); assert.deepEqual(ui.notice(), [expected()]); assert.deepEqual(ui.roles(), [role]);
  assert.equal(localeStore.getSnapshot().fundsLocaleEligible, false);
  ui.select('en'); assert.deepEqual(ui.notice(), [expected()]);
  assert.equal(ui.calls.length, calls); assert.equal(ui.reads, reads); assert.equal(ui.downloads.length, downloads);
}

for (const [name, label, prepare, expected] of [
  ['UnlockForm', 'profile validation', ui => { ui.fields.profile.value = 'incomplete'; }, () => m.profileInvalid],
  ['ExportForm', 'profile validation', ui => { ui.fields.profile.value = 'incomplete'; }, () => m.profileInvalid],
  ['ExportForm', 'unchecked-export consent', ui => { ui.fields.consent.checked = false; }, () => m.consentRequired],
  ['CreateForm', 'passphrase confirmation', ui => { ui.fields.confirm.value = 'different'; }, () => m.passphraseMismatch],
  ['CreateForm', 'creation consent', ui => { ui.fields.consent.checked = false; }, () => m.createConsentRequired],
  ['RestoreForm', 'required file', ui => { ui.fields.file.files = []; }, () => m.restoreFileRequired],
  ['RestoreForm', 'file size', ui => { ui.fields.file.files[0].size = MAX_BACKUP_BYTES + 1; }, () => errorMessage('LIMIT_EXCEEDED')],
  ['RestoreForm', 'passphrase confirmation', ui => { ui.fields.confirm.value = 'different'; }, () => m.passphraseMismatch],
  ['RestoreForm', 'fresh-key restore consent', ui => { ui.fields.consent.checked = false; }, () => m.restoreConsentRequired],
]) test(`${name} ${label} notice follows live locale selection without starting an operation`, async t => {
  const ui = mounted(t, name); prepare(ui); await ui.submit();
  selectBoth(ui, expected);
  assert.equal(ui.calls.filter(call => call.kind !== 'listProfiles').length, 0); assert.equal(ui.reads, 0);
  if (name !== 'ExportForm') assert.equal(ui.fields.passphrase.value, '');
  if (name === 'CreateForm' || name === 'RestoreForm') assert.equal(ui.fields.confirm.value, '');
  if (name === 'RestoreForm') assert.equal(ui.fields.source.value, '');
});

for (const [name, operation, code] of [
  ['UnlockForm', 'unlock', 'AUTHENTICATION_FAILED'], ['CreateForm', 'create', 'STORAGE_UNAVAILABLE'],
  ['ExportForm', 'exportEncrypted', 'STORAGE_UNAVAILABLE'], ['RestoreForm', 'restore', 'INVALID_INPUT'],
]) test(`${name} completed service refusal follows the selected catalog without repeating work`, async t => {
  const ui = mounted(t, name); ui.result(operation, fail(code)); await ui.submit();
  selectBoth(ui, () => errorMessage(code));
  assert.equal(ui.calls.filter(call => call.kind === operation).length, 1);
  if (operation === 'restore') assert.ok(new Uint8Array(ui.readBuffers[0]).every(byte => byte === 0));
});

test('an ordinary thrown unlock error keeps its fixed mapping after locale selection', async t => {
  const ui = mounted(t, 'UnlockForm'); ui.result('unlock', Error('ordinary fixture storage interruption')); await ui.submit();
  selectBoth(ui, () => errorMessage('PROTOCOL_ERROR'));
  assert.equal(ui.fields.passphrase.value, ''); assert.equal(ui.calls.filter(call => call.kind === 'unlock').length, 1);
});

test('unchecked export success relocalizes its notice without a second download or consent reuse', async t => {
  const ui = mounted(t, 'ExportForm'); await ui.submit();
  selectBoth(ui, () => m.exported, 'status');
  assert.equal(ui.fields.consent.checked, false); assert.equal(ui.downloads.length, 1);
  assert.equal(ui.downloads[0].name, 'p2p-offramp-unchecked-backup.json');
  assert.deepEqual(Array.from(new Uint8Array(await ui.blobs[0].arrayBuffer())), [11, 22, 33]);
  assert.equal(ui.calls.filter(call => call.kind === 'exportEncrypted').length, 1);
});

for (const records of [1, 17]) test(`confirmed restore notice relocalizes all ${records} records while preserving its exact profile handoff`, async t => {
  const ui = mounted(t, 'RestoreForm'); ui.result('restore', ok({ newProfileId: RESTORED, records })); await ui.submit();
  selectBoth(ui, () => m.restored(RESTORED, records), 'status');
  assert.ok(ui.notice()[0].includes(RESTORED)); assert.equal(ui.inventoryChanges, 1); assert.equal(ui.reads, 1);
  assert.ok(new Uint8Array(ui.readBuffers[0]).every(byte => byte === 0));
  for (const key of ['source', 'passphrase', 'confirm']) assert.equal(ui.fields[key].value, '');
  ui.select('fixture-rtl'); ui.click(m.openRestored); assert.deepEqual(ui.opened, [RESTORED]);
  assert.equal(ui.calls.filter(call => call.kind === 'restore').length, 1);
});

test('a pending unlock keeps its operation and clears input when the parent changes locale', async t => {
  const ui = mounted(t, 'UnlockForm'), held = ui.hold('unlock'), pending = ui.submit();
  assert.equal(ui.fields.passphrase.value, ''); ui.select('fixture-rtl');
  assert.ok(words(ui.render()).includes(m.unlocking)); assert.equal(ui.button(m.submitUnlock).props.disabled, true);
  held.resolve(fail('AUTHENTICATION_FAILED')); await pending;
  assert.deepEqual(ui.notice(), [errorMessage('AUTHENTICATION_FAILED')]); assert.equal(ui.cancelled, 0);
  assert.equal(ui.calls.filter(call => call.kind === 'unlock').length, 1);
});

test('locale selection during a fresh-key restore preserves the single file read and confirmed result', async t => {
  const ui = mounted(t, 'RestoreForm'), held = ui.hold('restore'), pending = ui.submit(); await turn();
  ui.select('fixture-rtl'); assert.equal(ui.button(m.submitRestore).props.disabled, true);
  assert.ok(words(ui.render()).includes(m.restoring)); assert.equal(ui.reads, 1);
  held.resolve(ok({ newProfileId: RESTORED, records: 17 })); await pending;
  assert.deepEqual(ui.notice(), [m.restored(RESTORED, 17)]); assert.equal(ui.inventoryChanges, 1);
  assert.equal(ui.calls.filter(call => call.kind === 'restore').length, 1);
});

test('cancelled restore remains uncertain across locale changes and ignores a late confirmation', async t => {
  const ui = mounted(t, 'RestoreForm'), held = ui.hold('restore'), pending = ui.submit(); await turn();
  ui.select('fixture-rtl'); ui.click(m.cancel); ui.select('en');
  assert.ok(words(ui.render()).includes(m.restoreUncertain)); assert.equal(ui.button(m.submitRestore).props.disabled, true);
  held.resolve(ok({ newProfileId: RESTORED, records: 17 })); await pending;
  assert.deepEqual(ui.notice(), []); assert.equal(ui.button(m.openRestored), undefined); assert.equal(ui.inventoryChanges, 0);
  assert.equal(ui.calls.find(call => call.kind === 'restore').args[3].aborted, true);
  assert.equal(ui.calls.filter(call => call.kind === 'restore').length, 1); assert.equal(ui.reads, 1);
  ui.click(m.reconcile); await turn(); assert.equal(ui.button(m.submitRestore).props.disabled, false);
  assert.equal(ui.inventoryChanges, 1); assert.equal(ui.calls.filter(call => call.kind === 'listProfiles').length, 1);
});

test('explicit restore reconciliation refusal relocalizes without retrying restoration or inventory', async t => {
  const ui = mounted(t, 'RestoreForm'); ui.result('restore', fail('TIMEOUT')); await ui.submit();
  ui.result('listProfiles', fail('STORAGE_UNAVAILABLE')); ui.click(m.reconcile); await turn();
  selectBoth(ui, () => errorMessage('STORAGE_UNAVAILABLE'));
  assert.equal(ui.button(m.submitRestore).props.disabled, true); assert.equal(ui.inventoryChanges, 0);
  assert.equal(ui.calls.filter(call => call.kind === 'restore').length, 1);
  assert.equal(ui.calls.filter(call => call.kind === 'listProfiles').length, 1);
});
