import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { MAX_BACKUP_BYTES } from '../../../packages/schemas/index.ts';
import { LocalPolicyError, localPolicyCode, runBoundedImport } from '../src/content-policy/local-policy.ts';
import { Recovery } from '../src/ui/Pages.tsx';
import { messages as m } from '../src/ui/messages.ts';
import { errorMessage } from '../src/ui/routes.ts';

const source = await readFile(new URL('../src/ui/BackupVerificationForm.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('type Notice =')).replace(/^export /gm, '');
const emitted = (await transformWithOxc(body, 'BackupVerificationForm.tsx', {
  lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' },
})).code;
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, messageKey: 'runtime.error.' + code.toLowerCase() } });
const receipt = Object.freeze({ profileId: 'a'.repeat(32), revision: 4, scope: 'complete-profile-v1',
  envelopeSha256: 'b'.repeat(64), backupSha256: 'c'.repeat(64) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

// Execute maintained TSX handlers with dependency-aware hooks and actual bounded file-import logic.
// Facade responses are controlled here; native crypto/Worker/browser acceptance has separate suites.
function mounted(t, initialState = 'unlocked') {
  const states = [], refs = [], effects = [], calls = [], readBuffers = [];
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = false, active = true, scope = 1, held = null;
  let status = { state: initialState }, check = ok({ verification: receipt }), verification = ok(receipt), reads = 0;
  const makeServices = () => ({
    get current() { return status; }, get profileId() { return status.state === 'unlocked' ? receipt.profileId : null; },
    getSnapshot: () => status, selectionScope: () => scope, subscribe: () => () => {},
    async verifyBackup(bytes, passphrase, signal) {
      calls.push({ kind: 'verify', bytes, passphrase, signal, copy: Array.from(bytes) });
      return held ? held.promise : verification;
    },
    async checkBackupVerification(signal) {
      calls.push({ kind: 'check', signal }); return held ? held.promise : check;
    },
  });
  let services = makeServices();
  const input = { value: 'ordinary fixture passphrase' }, fileInput = { value: 'selected-backup.json', files: [] };
  const form = { elements: { namedItem(name) { return name === 'verification-file' ? fileInput : input; } },
    reset() { input.value = ''; fileInput.value = ''; fileInput.files = []; } };
  const context = {
    m, errorMessage, MAX_BACKUP_BYTES, AbortController, LocalPolicyError, localPolicyCode, runBoundedImport,
    ControlHelp: () => null,
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial;
      return [states[at], value => { if (!active) return; const next = typeof value === 'function' ? value(states[at]) : value;
        if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useLayoutEffect(callback, dependencies) {
      const at = effectAt++, previous = effects[at];
      if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
        effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
      }
    },
    React: { Fragment: 'fragment' }, jsx(type, props, ...children) {
      if (type === 'form' && props.ref) props.ref.current = form;
      return { type, props: { ...props, children } };
    },
  };
  runInNewContext(`${emitted}\nglobalThis.Form = BackupVerificationForm;`, context);
  function render() {
    let root;
    for (let count = 0; count < 10; count++) {
      dirty = false; stateAt = refAt = effectAt = 0; root = context.Form({ services });
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.stop?.(); effect.stop = effect.callback(); }
      if (!dirty) return root;
    }
    assert.fail('component did not settle after layout effects');
  }
  const unmount = () => { if (active) { for (const effect of effects) effect.stop?.(); active = false; } };
  t.after(unmount); render();
  function selectFile({ size = 3, reader } = {}) {
    fileInput.value = 'selected-backup.json'; input.value = 'ordinary fixture passphrase';
    fileInput.files = [{ size, async arrayBuffer() {
      reads++; const value = reader ? await reader() : new Uint8Array([11, 22, 33]).buffer; readBuffers.push(value); return value;
    } }];
  }
  function click(label) {
    const button = nodes(render(), node => node.type === 'button' && words(node) === label)[0];
    assert.ok(button, `button exists: ${label}`); assert.notEqual(button.props.disabled, true); button.props.onClick();
  }
  return {
    calls, input, fileInput, readBuffers, render, unmount, click, selectFile,
    get reads() { return reads; }, get services() { return services; },
    submit() { const root = render(); root.props.onSubmit({ preventDefault() {}, currentTarget: form }); },
    duplicateSubmit() { const handler = render().props.onSubmit;
      handler({ preventDefault() {}, currentTarget: form }); handler({ preventDefault() {}, currentTarget: form }); },
    hold() { held = deferred(); return held; },
    retire(state = 'unlocked') { scope++; status = { state }; },
    replaceFacade() { services = makeServices(); },
    setCheck(value) { check = value; }, setVerification(value) { verification = value; },
  };
}

test('Recovery exposes explicit backup authentication and its limits without starting service calls', () => {
  const status = { state: 'locked' }, services = {
    current: status, getSnapshot: () => status, selectionScope: () => 1, subscribe: () => () => {},
    verifyBackup() { assert.fail('render must not verify'); }, checkBackupVerification() { assert.fail('render must not recheck'); },
  };
  const html = renderToStaticMarkup(createElement(Recovery, { services, onOpenRestored() {} }));
  assert.ok(html.includes(m.backupVerifyTitle)); assert.ok(html.includes(m.backupVerifyScope));
  assert.ok(html.includes(m.backupVerifyLocked)); assert.ok(html.includes(m.export));
  assert.match(html, /id="verification-file"[^>]+disabled=""/);
  assert.match(html, /id="verification-passphrase"[^>]+disabled=""/);
});

test('explicit file verification clears input and byte storage and displays only returned scalar receipt', async t => {
  const ui = mounted(t); ui.selectFile(); ui.submit();
  assert.equal(ui.input.value, ''); assert.equal(ui.fileInput.value, ''); await turn();
  assert.equal(ui.reads, 1); assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].passphrase, 'ordinary fixture passphrase'); assert.deepEqual(ui.calls[0].copy, [11, 22, 33]);
  assert.ok(ui.calls[0].bytes.every(byte => byte === 0));
  const text = words(ui.render()); assert.ok(text.includes(m.backupVerified(receipt.profileId, receipt.revision)));
  assert.ok(text.includes(receipt.backupSha256)); assert.ok(text.includes(receipt.envelopeSha256));
  assert.equal(text.includes('ordinary fixture passphrase'), false);
});

test('explicit recheck needs no file and clears old display when the Worker has no current fact', async t => {
  const ui = mounted(t); ui.click(m.backupVerifyCheck); await turn();
  assert.equal(ui.reads, 0); assert.ok(words(ui.render()).includes(receipt.backupSha256));
  ui.setCheck(ok({ verification: null })); ui.click(m.backupVerifyCheck); await turn();
  const text = words(ui.render()); assert.ok(text.includes(m.backupVerifyNone)); assert.equal(text.includes(receipt.backupSha256), false);
});

test('missing or oversized backup selection does not read or authenticate a file', async t => {
  const ui = mounted(t); ui.submit(); await turn(); assert.ok(words(ui.render()).includes(m.backupVerifyFileRequired));
  ui.selectFile({ size: MAX_BACKUP_BYTES + 1 }); ui.submit(); await turn();
  assert.equal(ui.reads, 0); assert.equal(ui.calls.length, 0); assert.equal(ui.input.value, '');
  assert.ok(words(ui.render()).includes(errorMessage('LIMIT_EXCEEDED')));
});

test('a wrong backup passphrase leaves no verification receipt', async t => {
  const ui = mounted(t); ui.setVerification(fail('AUTHENTICATION_FAILED')); ui.selectFile(); ui.submit(); await turn();
  const text = words(ui.render()); assert.ok(text.includes(errorMessage('AUTHENTICATION_FAILED')));
  assert.equal(text.includes(receipt.backupSha256), false); assert.ok(ui.calls[0].bytes.every(byte => byte === 0));
});

test('cancelling a file read prevents authentication and clears bytes when the read settles', async t => {
  const ui = mounted(t), read = deferred(); ui.selectFile({ reader: () => read.promise }); ui.submit(); ui.click(m.backupVerifyCancel);
  const bytes = new Uint8Array([11, 22, 33]); read.resolve(bytes.buffer); await turn();
  assert.equal(ui.calls.length, 0); assert.ok(bytes.every(byte => byte === 0));
  assert.equal(words(ui.render()).includes(receipt.backupSha256), false);
});

test('cancelling pending authentication aborts its service request and ignores its late receipt', async t => {
  const ui = mounted(t), reply = ui.hold(); ui.selectFile(); ui.submit(); await turn(); ui.click(m.backupVerifyCancel);
  assert.equal(ui.calls[0].signal.aborted, true); assert.ok(ui.calls[0].bytes.every(byte => byte === 0));
  reply.resolve(ok(receipt)); await turn(); assert.equal(words(ui.render()).includes(receipt.backupSha256), false);
});

for (const state of ['locked', 'unlocked']) test(`selection ${state === 'locked' ? 'lock' : 'replacement'} discards an old reply before a new render`, async t => {
  const ui = mounted(t), reply = ui.hold(); ui.selectFile(); ui.submit(); await turn();
  ui.retire(state); reply.resolve(ok(receipt)); await turn();
  assert.equal(words(ui.render()).includes(receipt.backupSha256), false); assert.equal(ui.input.value, '');
});

test('a replacement facade with the same scope cannot show the prior facade result', async t => {
  const ui = mounted(t), reply = ui.hold(); ui.selectFile(); ui.submit(); await turn();
  ui.replaceFacade(); ui.render(); assert.equal(ui.calls[0].signal.aborted, true);
  reply.resolve(ok(receipt)); await turn(); assert.equal(words(ui.render()).includes(receipt.backupSha256), false);
});

test('unmount clears local inputs, aborts authentication, and does not publish its late result', async t => {
  const ui = mounted(t), reply = ui.hold(); ui.selectFile(); ui.submit(); await turn(); ui.unmount();
  assert.equal(ui.calls[0].signal.aborted, true); assert.equal(ui.input.value, ''); assert.equal(ui.fileInput.value, '');
  assert.ok(ui.calls[0].bytes.every(byte => byte === 0)); reply.resolve(ok(receipt)); await turn();
});

test('two submit events before rendering make only one physical file read and service request', async t => {
  const ui = mounted(t), reply = ui.hold(); ui.selectFile(); ui.duplicateSubmit(); await turn();
  assert.equal(ui.reads, 1); assert.equal(ui.calls.length, 1); reply.resolve(ok(receipt)); await turn();
});

test('fresh recheck refusal clears the previously displayed receipt without retrying', async t => {
  const ui = mounted(t); ui.selectFile(); ui.submit(); await turn();
  assert.ok(words(ui.render()).includes(receipt.backupSha256)); ui.setCheck(fail('CONFLICT'));
  ui.click(m.backupVerifyCheck); await turn(); assert.equal(words(ui.render()).includes(receipt.backupSha256), false);
  assert.equal(ui.calls.length, 2); assert.equal(nodes(ui.render(), node => node.props.role === 'alert').length, 1);
});

test('editing either input clears the displayed check without another service operation', async t => {
  const ui = mounted(t);
  for (const id of ['verification-file', 'verification-passphrase']) {
    ui.click(m.backupVerifyCheck); await turn(); const root = ui.render(); assert.ok(words(root).includes(receipt.backupSha256));
    const before = ui.calls.length; nodes(root, node => node.props.id === id)[0].props.onChange();
    assert.equal(words(ui.render()).includes(receipt.backupSha256), false); assert.equal(ui.calls.length, before);
  }
});

test('independent: profile selection changes during an ordinary delayed file read never dispatch authentication', async t => {
  const ui = mounted(t), read = deferred(); ui.selectFile({ reader: () => read.promise }); ui.submit();
  ui.retire('unlocked'); const bytes = new Uint8Array([11, 22, 33]); read.resolve(bytes.buffer); await turn();
  assert.equal(ui.calls.length, 0); assert.ok(bytes.every(byte => byte === 0));
  assert.equal(words(ui.render()).includes(receipt.backupSha256), false);
});

test('independent: two explicit recheck events before rendering dispatch one request and no file read', async t => {
  const ui = mounted(t), reply = ui.hold();
  const handler = nodes(ui.render(), node => node.type === 'button' && words(node) === m.backupVerifyCheck)[0].props.onClick;
  handler(); handler(); await turn(); assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].kind, 'check');
  assert.equal(ui.reads, 0); reply.resolve(ok({ verification: receipt })); await turn();
  assert.ok(words(ui.render()).includes(receipt.backupSha256));
});

test('independent: cancelled physical authentication retains file admission until its pending service drains', async t => {
  const ui = mounted(t), reply = ui.hold(); ui.selectFile(); ui.submit(); await turn();
  ui.click(m.backupVerifyCancel); ui.selectFile(); ui.submit(); await turn();
  assert.equal(ui.reads, 1); assert.equal(ui.calls.length, 1);
  assert.ok(words(ui.render()).includes(errorMessage('BUSY')));
  reply.resolve(ok(receipt)); await turn(); ui.selectFile(); ui.submit(); await turn();
  assert.equal(ui.reads, 2); assert.equal(ui.calls.length, 2);
  assert.ok(words(ui.render()).includes(receipt.backupSha256));
});
