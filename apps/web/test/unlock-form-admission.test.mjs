import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
import { startAppServices, MAX_BACKUP_BYTES, MAX_VAULT_PROFILES } from '../src/app-services.ts';
import { messages as m } from '../src/ui/messages.ts';
import { errorMessage, isProfileId } from '../src/ui/routes.ts';

// Execute the maintained TSX handlers, facade and AppRuntime. The fixture can
// invoke one render's handler twice before a rerender, while retaining real
// runtime admission and cancellation. Hook scheduling and the held Worker port
// are controlled; native browser event reachability is outside this test.
const source = await readFile(new URL('../src/ui/VaultForms.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('type Notice =')).replace(/^export /gm, '');
const emitted = (await transformWithOxc(body, 'VaultForms.tsx', {
  lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' },
})).code;
const PROFILE = 'a'.repeat(32), SECRET = 'ordinary local fixture passphrase';
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
const fail = code => ({ ok: false, error: { code, messageKey: 'runtime.error.' + code.toLowerCase() } });
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';

class Port extends EventTarget {
  sent = []; held = []; delivered = []; state = { state: 'locked', handle: null };
  postMessage(command) {
    const { version, requestId, generation, operation } = command;
    const base = { version, requestId, generation, operation };
    this.sent.push(base);
    if (operation === 'unlock') { this.held.push({ base, profileId: command.profileId }); return; }
    if (operation === 'lock' || operation === 'dispose') this.state = { state: 'locked', handle: null };
    this.reply(base, { ok: true, value: operation === 'listProfiles' ? { profileIds: [PROFILE], truncated: false } : this.state });
  }
  reply(base, result) {
    queueMicrotask(() => {
      const data = { ...base, kind: 'response', result };
      this.delivered.push(data);
      this.dispatchEvent(new MessageEvent('message', { data }));
    });
  }
  release(index, code) {
    const { base, profileId } = this.held[index];
    if (code) this.reply(base, fail(code));
    else {
      this.state = { state: 'unlocked', handle: { id: 'A'.repeat(43), generation: base.generation, profileId, purpose: 'vault' } };
      this.reply(base, { ok: true, value: this.state });
    }
  }
  terminate() {}
}

async function mounted(t) {
  const port = new Port(), services = value(await startAppServices({ createWorker: () => port, lifecycle: false }));
  const states = [], refs = [], effects = [], attempts = [], published = [];
  const unsubscribe = services.subscribe(() => published.push(services.current.state));
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = false, active = true, cancelled = 0;
  const fields = { profile: { value: PROFILE }, passphrase: { value: SECRET } };
  const form = { elements: { namedItem(key) { return fields[key]; } },
    reset() { for (const input of Object.values(fields)) input.value = ''; },
    querySelector() { return { focus() {} }; } };
  const formServices = {
    listProfiles: services.listProfiles,
    unlock(profileId, passphrase, signal) {
      const promise = services.unlock(profileId, passphrase, signal);
      attempts.push({ signal, promise });
      return promise;
    },
  };
  const context = { m, errorMessage, isProfileId, MAX_BACKUP_BYTES, MAX_VAULT_PROFILES, AbortController,
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
  runInNewContext(`${emitted}\nglobalThis.UnlockForm = UnlockForm;`, context);
  const props = { services: formServices, onCancel() { cancelled++; } };
  function render() {
    for (let i = 0; i < 10; i++) {
      dirty = false; stateAt = refAt = effectAt = 0;
      const root = context.UnlockForm(props);
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.stop?.(); effect.stop = effect.callback(); }
      if (!dirty) return root;
    }
    assert.fail('form state did not settle');
  }
  const unmount = () => { if (active) { for (const effect of effects) effect.stop?.(); active = false; } };
  t.after(async () => { unmount(); unsubscribe(); await services.dispose(); });
  render(); await turn(); render();
  return { render, unmount, fields, attempts, services, port, published,
    get cancelled() { return cancelled; },
    submit(root = render()) { return root.props.onSubmit({ preventDefault() {}, currentTarget: form }); },
    cancel(root = render()) { nodes(root, node => node.type === 'button' && words(node) === m.cancel)[0].props.onClick(); },
    busy() { return render().props['aria-busy']; },
    notices() { return nodes(render(), node => node.type === 'p' && /\bnotice\b/.test(node.props.className ?? '')).map(words); },
  };
}

function assertLateReplyIgnored(ui, callbacks) {
  const delivered = ui.port.delivered.filter(message => message.operation === 'unlock');
  assert.equal(delivered.length, 1, 'the held reply reached the real runtime');
  assert.equal(delivered[0].result.ok, true);
  assert.equal(delivered[0].result.value.state, 'unlocked');
  assert.equal(ui.services.current.state, 'locked');
  assert.equal(ui.published.includes('unlocked'), false);
  assert.equal(ui.cancelled, callbacks);
  assert.equal(ui.fields.passphrase.value, '');
}

test('single unlock cancellation aborts the owned request and ignores a late valid reply', async t => {
  const ui = await mounted(t), first = ui.submit();
  assert.equal(ui.fields.passphrase.value, '');
  ui.cancel(); ui.unmount();
  assert.equal(ui.attempts[0].signal.aborted, true);
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
  ui.port.release(0); await first; await turn();
  assertLateReplyIgnored(ui, 1);
});

test('same-render duplicate preserves the original unlock for immediate Cancel and unmount', async t => {
  const ui = await mounted(t), root = ui.render();
  const first = ui.submit(root), second = ui.submit(root);
  assert.equal(ui.fields.passphrase.value, '');
  ui.cancel(root); ui.unmount();
  const originalAborted = ui.attempts[0].signal.aborted;
  await second;
  ui.port.release(0); await first; await turn();
  assert.equal(originalAborted, true, 'Cancel must abort the admitted unlock');
  assert.equal(ui.attempts.length, 1, 'the duplicate must stop at UI admission');
  assert.equal(ui.port.sent.filter(command => command.operation === 'unlock').length, 1);
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
  assertLateReplyIgnored(ui, 1);
});

for (const close of ['cancel', 'unmount']) test(`settled duplicate preserves busy ownership until ${close}`, async t => {
  const ui = await mounted(t), root = ui.render();
  const first = ui.submit(root), second = ui.submit(root);
  await second;
  const busyWhilePending = ui.busy(), noticesWhilePending = ui.notices();
  if (close === 'cancel') ui.cancel();
  ui.unmount();
  const originalAborted = ui.attempts[0].signal.aborted;
  ui.port.release(0); await first; await turn();
  assert.equal(busyWhilePending, true, 'a duplicate must not clear the original busy state');
  assert.deepEqual(noticesWhilePending, []);
  assert.equal(originalAborted, true, 'teardown must still own the admitted unlock');
  assert.equal(ui.attempts.length, 1);
  assert.equal(ui.port.sent.filter(command => command.operation === 'unlock').length, 1);
  assert.equal((await ui.attempts[0].promise).error.code, 'CANCELLED');
  assertLateReplyIgnored(ui, close === 'cancel' ? 1 : 0);
});

test('same-render duplicate preserves the pending UI and the original authentication notice', async t => {
  const ui = await mounted(t), root = ui.render();
  const first = ui.submit(root), second = ui.submit(root);
  await second;
  const busyWhilePending = ui.busy(), noticesWhilePending = ui.notices();
  ui.port.release(0, 'AUTHENTICATION_FAILED'); await first;
  assert.equal(busyWhilePending, true);
  assert.deepEqual(noticesWhilePending, []);
  assert.equal(ui.attempts.length, 1);
  assert.equal(ui.port.sent.filter(command => command.operation === 'unlock').length, 1);
  assert.equal(ui.busy(), false);
  assert.deepEqual(ui.notices(), [errorMessage('AUTHENTICATION_FAILED')]);
  assert.equal(ui.fields.passphrase.value, '');
  assert.equal(ui.cancelled, 0);
});

test('a rerender between unlock submissions retains the first cancellation target', async t => {
  const ui = await mounted(t), first = ui.submit();
  assert.equal(ui.busy(), true);
  await ui.submit();
  assert.equal(ui.attempts.length, 1);
  ui.cancel(); ui.unmount();
  assert.equal(ui.attempts[0].signal.aborted, true);
  ui.port.release(0); await first; await turn();
  assertLateReplyIgnored(ui, 1);
});

test('a successful single unlock clears its passphrase and closes once', async t => {
  const ui = await mounted(t), first = ui.submit();
  assert.equal(ui.fields.passphrase.value, '');
  ui.port.release(0); await first; await turn();
  assert.equal(ui.attempts.length, 1);
  assert.equal(ui.services.current.state, 'unlocked');
  assert.equal(ui.fields.passphrase.value, '');
  assert.equal(ui.busy(), false);
  assert.deepEqual(ui.notices(), []);
  assert.equal(ui.cancelled, 1);
});

test('a completed authentication refusal clears ownership for a fresh explicit retry', async t => {
  const ui = await mounted(t), first = ui.submit();
  ui.port.release(0, 'AUTHENTICATION_FAILED'); await first;
  assert.equal(ui.busy(), false);
  assert.deepEqual(ui.notices(), [errorMessage('AUTHENTICATION_FAILED')]);
  assert.equal(ui.fields.passphrase.value, '');
  ui.fields.passphrase.value = 'a different local fixture passphrase';
  const second = ui.submit();
  assert.equal(ui.busy(), true);
  assert.deepEqual(ui.notices(), []);
  assert.equal(ui.fields.passphrase.value, '');
  assert.equal(ui.attempts.length, 2);
  assert.equal(ui.port.sent.filter(command => command.operation === 'unlock').length, 2);
  ui.port.release(1); await second;
  assert.equal(ui.services.current.state, 'unlocked');
  assert.equal(ui.fields.passphrase.value, '');
  assert.equal(ui.cancelled, 1);
});
