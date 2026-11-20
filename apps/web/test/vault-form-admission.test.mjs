import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
import { startAppServices, MAX_BACKUP_BYTES, MAX_VAULT_PROFILES } from '../src/app-services.ts';
import { canonicalEnvelopeBytes, encodeBackup } from '../../../packages/schemas/index.ts';
import { messages as m } from '../src/ui/messages.ts';
import { errorMessage, isProfileId } from '../src/ui/routes.ts';

// Execute the maintained TSX handlers, facade and AppRuntime. Hook scheduling,
// file reads, the download DOM and held Worker replies are controlled. Invoking
// a retained render's handler does not establish native browser reachability.
const source = await readFile(new URL('../src/ui/VaultForms.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('type Notice =')).replace(/^export /gm, '');
const emitted = (await transformWithOxc(body, 'VaultForms.tsx', {
  lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' },
})).code;
const fixture = JSON.parse(await readFile(new URL('../../../packages/storage/test/fixtures/vault-python-v1.json', import.meta.url)));
const BACKUP = encodeBackup({ format: 'p2p-offramp-backup', version: 1, envelope: fixture.envelope,
  checksum: createHash('sha256').update(canonicalEnvelopeBytes(fixture.envelope)).digest('hex') });
const PROFILE = fixture.envelope.profileId, CREATED = 'c'.repeat(32), RESTORED = 'd'.repeat(32);
const SECRET = 'ordinary local fixture passphrase', SOURCE = 'ordinary source fixture passphrase';
const operations = { ExportForm: 'exportEncrypted', CreateForm: 'create', RestoreForm: 'restore' };
let priorSecure;
beforeEach(() => {
  priorSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
});
afterEach(() => {
  if (priorSecure) Object.defineProperty(globalThis, 'isSecureContext', priorSecure);
  else delete globalThis.isSecureContext;
});
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const ok = value => ({ ok: true, value });
const fail = code => ({ ok: false, error: { code, messageKey: 'runtime.error.' + code.toLowerCase() } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

class Port extends EventTarget {
  sent = []; held = []; delivered = []; state = { state: 'locked', handle: null };
  inventory = { profileIds: [PROFILE], truncated: false };
  postMessage(command) {
    const { version, requestId, generation, operation } = command;
    const base = { version, requestId, generation, operation };
    this.sent.push(base);
    if (Object.values(operations).includes(operation)) { this.held.push(base); return; }
    if (operation === 'lock' || operation === 'dispose') this.state = { state: 'locked', handle: null };
    this.reply(base, ok(operation === 'listProfiles' ? this.inventory : this.state));
  }
  reply(base, result) {
    queueMicrotask(() => {
      const data = { ...base, kind: 'response', result };
      this.delivered.push(data);
      this.dispatchEvent(new MessageEvent('message', { data }));
    });
  }
  release(index, code) {
    const base = this.held[index]; assert.ok(base, 'expected an admitted Worker command');
    if (code) { this.reply(base, fail(code)); return; }
    if (base.operation === 'create') {
      this.state = { state: 'unlocked', handle: { id: 'A'.repeat(43), generation: base.generation, profileId: CREATED, purpose: 'vault' } };
      this.reply(base, ok(this.state));
    } else if (base.operation === 'restore') this.reply(base, ok({ newProfileId: RESTORED, records: 2 }));
    else this.reply(base, ok({ bytes: new Uint8Array(BACKUP), authentication: 'not-checked' }));
  }
  terminate() {}
}

async function mounted(t, name, { holdReads = false } = {}) {
  const port = new Port(), services = value(await startAppServices({ createWorker: () => port, lifecycle: false }));
  const states = [], refs = [], effects = [], attempts = [], published = [], downloads = [], blobs = [], done = [], opened = [], reads = [];
  const unsubscribe = services.subscribe(() => published.push(services.current.state));
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = false, active = true, inventoryChanges = 0;
  const file = { size: BACKUP.length, arrayBuffer() {
    const buffer = new Uint8Array(BACKUP).buffer, gate = deferred();
    reads.push({ buffer, release() { gate.resolve(buffer); } });
    if (!holdReads) gate.resolve(buffer);
    return gate.promise;
  } };
  const fields = { profile: { value: PROFILE }, source: { value: SOURCE }, passphrase: { value: SECRET }, confirm: { value: SECRET },
    consent: { checked: true }, file: { value: 'backup.json', files: [file] } };
  const refill = () => {
    fields.source.value = SOURCE; fields.passphrase.value = fields.confirm.value = SECRET;
    fields.consent.checked = true; fields.file.value = 'backup.json'; fields.file.files = [file];
  };
  const form = { elements: { namedItem(key) { assert.ok(key in fields); return fields[key]; } },
    reset() {
      for (const input of Object.values(fields)) { if ('value' in input) input.value = ''; if ('checked' in input) input.checked = false; }
      fields.file.files = [];
    }, querySelector() { return { focus() {} }; } };
  const formServices = { listProfiles: services.listProfiles };
  for (const operation of Object.values(operations)) formServices[operation] = (...args) => {
    const promise = services[operation](...args);
    attempts.push({ operation, signal: args.at(-1), promise });
    return promise;
  };
  const context = { m, errorMessage, isProfileId, MAX_BACKUP_BYTES, MAX_VAULT_PROFILES, AbortController, Blob, Uint8Array, setTimeout,
    document: { body: { append() {} }, createElement(tag) { assert.equal(tag, 'a'); return {
      click() { downloads.push({ name: this.download, url: this.href }); }, remove() {},
    }; } },
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:fixture/' + blobs.length; }, revokeObjectURL() {} },
    ControlHelp: () => null,
    useState(initial) {
      const at = stateAt++; if (!(at in states)) states[at] = initial;
      return [states[at], next => { if (!active) return; if (!Object.is(states[at], next)) { states[at] = next; dirty = true; } }];
    },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useEffect(callback, dependencies) {
      const at = effectAt++, previous = effects[at];
      if (!previous || dependencies.some((item, index) => !Object.is(item, previous.dependencies[index])))
        effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
    },
    jsx(type, props, ...children) {
      if (type === 'form' && props.ref) props.ref.current = form;
      if (typeof type === 'function') return type({ ...props, children });
      return { type, props: { ...props, children } };
    },
  };
  runInNewContext(`${emitted}\nglobalThis.forms = { ExportForm, CreateForm, RestoreForm };`, context);
  const props = { services: formServices, onDone(id) { done.push(id); }, onInventoryChanged() { inventoryChanges++; },
    onOpenRestored(id) { opened.push(id); } };
  function render() {
    for (let count = 0; count < 10; count++) {
      dirty = false; stateAt = refAt = effectAt = 0;
      const root = context.forms[name](props);
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.stop?.(); effect.stop = effect.callback(); }
      if (!dirty) return root;
    }
    assert.fail('form state did not settle');
  }
  const unmount = () => { if (active) { for (const effect of effects) effect.stop?.(); active = false; } };
  t.after(async () => { unmount(); unsubscribe(); await services.dispose(); });
  render(); await turn(); render();
  const button = (label, root = render()) => nodes(root, node => node.type === 'button' && words(node) === label)[0];
  return { render, unmount, refill, fields, attempts, services, port, published, downloads, blobs, done, opened, reads, button,
    get inventoryChanges() { return inventoryChanges; },
    submit(root = render()) { return root.props.onSubmit({ preventDefault() {}, currentTarget: form }); },
    click(label, root = render()) { const target = button(label, root); assert.ok(target, 'expected action: ' + label);
      assert.notEqual(target.props.disabled, true); target.props.onClick(); },
    busy() { return render().props['aria-busy']; },
    notices() { return nodes(render(), node => node.type === 'p' && /\bnotice\b/.test(node.props.className ?? '')).map(words); },
  };
}

function secretsCleared(ui, name) {
  const names = name === 'CreateForm' ? ['passphrase', 'confirm'] : name === 'RestoreForm' ? ['source', 'passphrase', 'confirm'] : [];
  for (const key of names) assert.equal(ui.fields[key].value, '');
}
function assertLateReplyDelivered(ui, operation) {
  const delivered = ui.port.delivered.filter(message => message.operation === operation);
  assert.equal(delivered.length, 1, 'the held reply reached the real runtime');
  assert.equal(delivered[0].result.ok, true);
}
function afterLateReply(ui) {
  return { attempts: ui.attempts.length, workerCommands: ui.port.held.length, originalAborted: ui.attempts[0].signal.aborted,
    downloads: ui.downloads.length, done: ui.done, inventoryChanges: ui.inventoryChanges,
    state: ui.services.current.state, publishedUnlocked: ui.published.includes('unlocked') };
}
const cancelled = done => ({ attempts: 1, workerCommands: 1, originalAborted: true, downloads: 0, done,
  inventoryChanges: 0, state: 'locked', publishedUnlocked: false });

for (const name of Object.keys(operations)) test(`${name} single teardown owns cancellation and suppresses its late success`, async t => {
  const ui = await mounted(t, name), first = ui.submit(); await turn();
  secretsCleared(ui, name);
  if (name !== 'ExportForm') ui.click(m.cancel);
  ui.unmount(); ui.port.release(0); await first; await turn();
  assertLateReplyDelivered(ui, operations[name]);
  assert.deepEqual(afterLateReply(ui), cancelled(name === 'CreateForm' ? [null] : []));
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
});

for (const name of ['ExportForm', 'CreateForm']) test(`${name} same-render duplicate preserves immediate teardown ownership`, async t => {
  const ui = await mounted(t, name), root = ui.render();
  const first = ui.submit(root), second = ui.submit(root);
  if (name === 'CreateForm') ui.click(m.cancel, root);
  ui.unmount(); await second;
  ui.port.release(0); await first; await turn();
  assertLateReplyDelivered(ui, operations[name]);
  const observed = afterLateReply(ui); t.diagnostic(JSON.stringify(observed));
  assert.deepEqual(observed, cancelled(name === 'CreateForm' ? [null] : []));
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
  secretsCleared(ui, name);
});

for (const name of Object.keys(operations)) test(`${name} a settled duplicate cannot clear pending ownership or publish after unmount`, async t => {
  const ui = await mounted(t, name), root = ui.render();
  const first = ui.submit(root), second = ui.submit(root); await second;
  const busy = ui.busy(), notices = ui.notices();
  ui.unmount(); ui.port.release(0); await first; await turn();
  assertLateReplyDelivered(ui, operations[name]);
  const observed = { busy, notices, ...afterLateReply(ui) }; t.diagnostic(JSON.stringify(observed));
  assert.deepEqual(observed, { busy: true, notices: [], ...cancelled([]) });
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
  if (name === 'RestoreForm') assert.equal(ui.reads.length, 1);
});

for (const order of ['forward', 'reverse']) test(`RestoreForm duplicate during a held file read cannot continue after Cancel (${order} release)`, async t => {
  const ui = await mounted(t, 'RestoreForm', { holdReads: true }), root = ui.render();
  const first = ui.submit(root), second = ui.submit(root);
  secretsCleared(ui, 'RestoreForm');
  ui.click(m.cancel); const retryDisabled = ui.button(m.submitRestore).props.disabled; ui.unmount();
  for (const read of order === 'forward' ? ui.reads : [...ui.reads].reverse()) read.release(); await turn();
  for (let index = 0; index < ui.port.held.length; index++) ui.port.release(index);
  await Promise.all([first, second]); await turn();
  const observed = { reads: ui.reads.length, attempts: ui.attempts.length, workerCommands: ui.port.held.length,
    inventoryChanges: ui.inventoryChanges, opened: ui.opened, retryDisabled };
  t.diagnostic(JSON.stringify(observed));
  assert.deepEqual(observed, { reads: 1, attempts: 0, workerCommands: 0, inventoryChanges: 0, opened: [], retryDisabled: true });
});

// A later file read may finish first. Its now-empty secrets produce a real
// runtime refusal; that refusal must not release ownership of the first read.
test('RestoreForm a duplicate file read settling first cannot orphan the still-pending original read', async t => {
  const ui = await mounted(t, 'RestoreForm', { holdReads: true }), root = ui.render();
  const first = ui.submit(root), second = ui.submit(root);
  ui.reads[1]?.release(); await second;
  const busy = ui.busy(), notices = ui.notices(); ui.unmount();
  ui.reads[0].release(); await turn();
  for (let index = 0; index < ui.port.held.length; index++) ui.port.release(index);
  await first; await turn();
  const observed = { busy, notices, reads: ui.reads.length, attempts: ui.attempts.length,
    workerCommands: ui.port.held.length, inventoryChanges: ui.inventoryChanges };
  t.diagnostic(JSON.stringify(observed));
  assert.deepEqual(observed, { busy: true, notices: [], reads: 1, attempts: 0, workerCommands: 0, inventoryChanges: 0 });
});

test('RestoreForm duplicate after runtime admission leaves Cancel attached to the first request', async t => {
  const ui = await mounted(t, 'RestoreForm'), root = ui.render(), first = ui.submit(root); await turn();
  const second = ui.submit(root); ui.click(m.cancel); ui.unmount(); await second;
  ui.port.release(0); await first; await turn();
  assertLateReplyDelivered(ui, 'restore');
  const observed = { reads: ui.reads.length, ...afterLateReply(ui) }; t.diagnostic(JSON.stringify(observed));
  assert.deepEqual(observed, { reads: 1, ...cancelled([]) });
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
});

for (const [name, code] of [['ExportForm', 'STORAGE_UNAVAILABLE'], ['CreateForm', 'STORAGE_UNAVAILABLE'], ['RestoreForm', 'AUTHENTICATION_FAILED']])
  test(`${name} duplicate preserves the original refusal and permits a fresh explicit retry`, async t => {
    const ui = await mounted(t, name), root = ui.render(), first = ui.submit(root), second = ui.submit(root); await second;
    const pending = { busy: ui.busy(), notices: ui.notices(), attempts: ui.attempts.length };
    ui.port.release(0, code); await first;
    assert.deepEqual(pending, { busy: true, notices: [], attempts: 1 });
    assert.equal(ui.busy(), false); assert.deepEqual(ui.notices(), [errorMessage(code)]); secretsCleared(ui, name);
    ui.refill(); const retry = ui.submit(); await turn();
    assert.equal(ui.busy(), true); assert.deepEqual(ui.notices(), []); secretsCleared(ui, name);
    assert.equal(ui.attempts.length, 2); assert.equal(ui.port.held.length, 2);
    ui.port.release(1); await retry;
    assert.equal(ui.busy(), false);
    if (name === 'ExportForm') { assert.equal(ui.downloads.length, 1); assert.equal(ui.fields.consent.checked, false); }
    else if (name === 'CreateForm') assert.deepEqual(ui.done, [CREATED]);
    else { assert.equal(ui.inventoryChanges, 1); assert.deepEqual(ui.notices(), [m.restored(RESTORED, 2)]); }
  });

test('ExportForm success downloads the exact unchecked backup once and requires fresh consent for another export', async t => {
  const ui = await mounted(t, 'ExportForm'), first = ui.submit();
  ui.port.release(0); await first;
  assert.equal(ui.busy(), false); assert.deepEqual(ui.notices(), [m.exported]);
  assert.equal(ui.downloads.length, 1); assert.equal(ui.downloads[0].name, 'p2p-offramp-unchecked-backup.json');
  assert.deepEqual(new Uint8Array(await ui.blobs[0].arrayBuffer()), BACKUP);
  assert.equal(ui.fields.consent.checked, false);
  await ui.submit(); assert.deepEqual(ui.notices(), [m.consentRequired]); assert.equal(ui.attempts.length, 1);
  ui.fields.consent.checked = true; const retry = ui.submit(); ui.port.release(1); await retry;
  assert.equal(ui.downloads.length, 2); assert.equal(ui.fields.consent.checked, false);
});

test('CreateForm reports a committed profile exactly once when the unlocked notification unmounts it before completion', async t => {
  const ui = await mounted(t, 'CreateForm'); let callbacksAtUnmount;
  const stop = ui.services.subscribe(() => {
    if (ui.services.current.state === 'unlocked') { callbacksAtUnmount = ui.done.length; ui.unmount(); }
  });
  t.after(stop);
  const first = ui.submit(); secretsCleared(ui, 'CreateForm'); ui.port.release(0); await first; await turn();
  assert.equal(callbacksAtUnmount, 0); assert.equal(ui.attempts[0].signal.aborted, true);
  assert.equal((await ui.attempts[0].promise).ok, true); assert.deepEqual(ui.done, [CREATED]);
  assert.equal(ui.services.current.state, 'unlocked'); secretsCleared(ui, 'CreateForm');
});

test('RestoreForm cancelled file read settles without dispatch and leaves retry disarmed for reconciliation', async t => {
  const ui = await mounted(t, 'RestoreForm', { holdReads: true }), first = ui.submit();
  secretsCleared(ui, 'RestoreForm'); ui.click(m.cancel); ui.reads[0].release(); await first;
  assert.equal(ui.attempts.length, 0); assert.equal(ui.port.held.length, 0); assert.equal(ui.reads.length, 1);
  assert.equal(ui.busy(), false); assert.equal(ui.button(m.submitRestore).props.disabled, true);
  assert.ok(words(ui.render()).includes(m.restoreUncertain)); assert.equal(ui.inventoryChanges, 0);
});

test('RestoreForm cancellation requires complete inventory and an explicit retry before reporting a confirmed profile', async t => {
  const ui = await mounted(t, 'RestoreForm'), first = ui.submit(); await turn();
  ui.click(m.cancel); await first;
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
  ui.port.release(0); await turn(); assertLateReplyDelivered(ui, 'restore');
  assert.equal(ui.button(m.submitRestore).props.disabled, true); assert.equal(ui.inventoryChanges, 0);
  assert.deepEqual(ui.opened, []); assert.equal(ui.button(m.openRestored), undefined);
  ui.port.inventory = { profileIds: [PROFILE], truncated: true }; ui.click(m.reconcile); await turn();
  assert.equal(ui.button(m.submitRestore).props.disabled, true); assert.equal(ui.inventoryChanges, 1);
  ui.port.inventory = { profileIds: [PROFILE], truncated: false }; ui.click(m.reconcile); await turn();
  assert.equal(ui.button(m.submitRestore).props.disabled, false); assert.equal(ui.inventoryChanges, 2);
  assert.equal(ui.attempts.length, 1); assert.equal(ui.reads.length, 1); assert.equal(ui.button(m.openRestored), undefined);
  ui.refill(); const retry = ui.submit(); await turn();
  assert.equal(ui.attempts.length, 2); assert.equal(ui.port.held.length, 2); assert.equal(ui.reads.length, 2);
  ui.port.release(1); await retry;
  assert.deepEqual(ui.notices(), [m.restored(RESTORED, 2)]); assert.equal(ui.inventoryChanges, 3);
  assert.equal(ui.fields.consent.checked, false); assert.equal(ui.fields.file.files.length, 0); secretsCleared(ui, 'RestoreForm');
  for (const read of ui.reads) assert.ok(new Uint8Array(read.buffer).every(byte => byte === 0));
  ui.click(m.openRestored); assert.deepEqual(ui.opened, [RESTORED]);
});
