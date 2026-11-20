import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { SignedUpdatePanel, SignedUpdateReview } from '../src/ui/SignedUpdatePanel.tsx';
import { Settings } from '../src/ui/Pages.tsx';
import { message, messageGroup } from '../src/ui/locale/runtime.ts';
import { sourceCatalog } from '../src/ui/locale/en.ts';
import { createAssetUpdateController } from '../../../packages/security/src/release-update.ts';
import * as viewFacade from '../../../packages/security/update-view.ts';

const u = messageGroup('updates'), token = Object.freeze({});
const review = Object.freeze({
  current: { sequence: 4, manifestSha256: 'a'.repeat(64), keyId: 'b'.repeat(64) },
  candidate: { sequence: 5, manifestSha256: 'c'.repeat(64), keyId: 'b'.repeat(64), releaseId: 'synthetic-ui-release',
    sourceCommit: 'd'.repeat(40), predecessorDigest: 'a'.repeat(64) },
  minStorageSchema: 1, maxStorageSchema: 2, destination: 'https://synthetic-cid.example/',
  assets: [{ path: 'index.html', bytes: 321, sha256: 'e'.repeat(64) }, { path: 'assets/client.js', bytes: 123, sha256: 'f'.repeat(64) }],
  changeSummary: 'Manifest and asset identities only; no signed human change summary is supplied.',
  freshOriginAcceptedState: true, backupRequired: true, releaseEnabled: false,
});
const candidate = { kind: 'candidate', candidate: token, review };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' || typeof node === 'number' ?
  String(node) : node?.props ? words(node.props.children) : '';
const source = await readFile(new URL('../src/ui/SignedUpdatePanel.tsx', import.meta.url), 'utf8');
const emitted = (await transformWithOxc(source.slice(source.indexOf('type Notice =')).replace(/^export /gm, ''), 'SignedUpdatePanel.tsx', {
  lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' },
})).code;

// Exercise maintained handlers with dependency-aware hooks and ordinary delayed
// replies. Synthetic controllers are UI fixtures, not trusted update composition
// or native-browser/gesture/backup/wallet/origin-transition qualification.
function mounted(t, provided) {
  const states = [], refs = [], effects = [], calls = [], documentEvents = new Map(), windowEvents = new Map();
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = false, active = true, heldCheck, heldAccept, check = candidate;
  let acceptance = { ok: true, value: { destination: review.destination, acceptedSequence: 5, releaseEnabled: false } };
  const makeController = () => ({
    checkForUpdate(signal) { calls.push({ kind: 'check', signal }); return heldCheck?.promise ?? Promise.resolve(check); },
    acceptUpdate(value, signal) { calls.push({ kind: 'accept', value, signal }); return heldAccept?.promise ?? Promise.resolve(acceptance); },
    cancel() { calls.push({ kind: 'cancel' }); }, dispose() { assert.fail('controller owner retains disposal'); },
  });
  let controller = provided === undefined ? makeController() : provided;
  const context = {
    u, message: (group, name, values) => message(group, name, { ...values }), AbortController,
    document: { visibilityState: 'visible', addEventListener(name, fn) { documentEvents.set(name, fn); }, removeEventListener(name) { documentEvents.delete(name); } },
    window: { addEventListener(name, fn) { windowEvents.set(name, fn); }, removeEventListener(name) { windowEvents.delete(name); } },
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial;
      return [states[at], value => { if (!active) return; const next = typeof value === 'function' ? value(states[at]) : value;
        if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useLayoutEffect(callback, dependencies) { const at = effectAt++, previous = effects[at];
      if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index])))
        effects[at] = { callback, dependencies, pending: true, stop: previous?.stop };
    },
    React: { Fragment: 'fragment' }, jsx(type, props, ...children) {
      const value = { ...props, children }; return typeof type === 'function' ? type(value) : { type, props: value };
    },
  };
  runInNewContext(`${emitted}\nglobalThis.Panel = SignedUpdatePanel;`, context);
  function render() {
    let root;
    for (let count = 0; count < 10; count++) {
      dirty = false; stateAt = refAt = effectAt = 0; root = context.Panel({ controller });
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.stop?.(); effect.stop = effect.callback(); }
      if (!dirty) return root;
    }
    assert.fail('component did not settle after layout effects');
  }
  const unmount = () => { if (active) { for (const effect of effects) effect.stop?.(); active = false; } };
  t.after(unmount); render();
  const button = label => { const found = nodes(render(), node => node.type === 'button' && words(node) === label)[0]; assert.ok(found, label); return found; };
  return {
    calls, render, unmount, button,
    click(label, event = { isTrusted: true }) { const target = button(label); assert.notEqual(target.props.disabled, true); target.props.onClick(event); },
    consent(value = true) { const input = nodes(render(), node => node.type === 'input' && node.props.type === 'checkbox')[0]; assert.ok(input); input.props.onChange({ currentTarget: { checked: value } }); },
    setCheck(value) { check = value; }, setAcceptance(value) { acceptance = value; },
    holdCheck() { heldCheck = deferred(); return heldCheck; }, holdAccept() { heldAccept = deferred(); return heldAccept; },
    replace() { controller = makeController(); render(); },
    hide() { context.document.visibilityState = 'hidden'; documentEvents.get('visibilitychange')?.(); },
    pagehide() { windowEvents.get('pagehide')?.(); },
  };
}

test('the type-only update-view facade exports no executable capability', () => {
  assert.deepEqual(Object.keys(viewFacade), []);
});

test('Settings exposes an inert default panel without creating or calling an updater', () => {
  const html = renderToStaticMarkup(createElement(Settings));
  assert.ok(html.includes(u.title)); assert.ok(html.includes(u.unconfigured));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Check for a signed update<\/button>/);
  assert.equal(html.includes(u.accept), false);
  assert.ok(html.includes('href="#/recovery"'));
});

test('rendering a supplied controller starts no check, acceptance or cancellation', () => {
  const unavailable = () => assert.fail('render cannot call updater');
  const html = renderToStaticMarkup(createElement(SignedUpdatePanel, { controller: {
    checkForUpdate: unavailable, acceptUpdate: unavailable, cancel: unavailable, dispose: unavailable,
  } }));
  assert.ok(html.includes(u.configuredScope)); assert.equal(html.includes(u.accept), false);
});

test('a release review displays full identities, assets, destination and recovery limits as text', () => {
  const html = renderToStaticMarkup(createElement(SignedUpdateReview, { review }));
  for (const value of [review.current.manifestSha256, review.current.keyId, review.candidate.manifestSha256,
    review.candidate.releaseId, review.candidate.sourceCommit, review.destination, ...review.assets.flatMap(asset => [asset.path, asset.sha256])]) assert.ok(html.includes(value), value);
  for (const copy of [u.changesAbsent, u.freshOrigin, u.recoveryRequired, u.disabled]) assert.ok(html.includes(copy));
  assert.match(html, /dir="ltr"/); assert.doesNotMatch(html, /href=|src=/);
});

test('explicit check and consent pass the exact opaque candidate to acceptance in the click task', async t => {
  const ui = mounted(t); assert.equal(ui.calls.length, 0);
  ui.click(u.check); assert.equal(ui.calls[0].kind, 'check'); await turn();
  assert.ok(words(ui.render()).includes(review.destination)); assert.equal(ui.button(u.accept).props.disabled, true);
  ui.consent(); ui.click(u.accept); assert.equal(ui.calls.filter(call => call.kind === 'accept').length, 1);
  const accepted = ui.calls.find(call => call.kind === 'accept'); assert.equal(accepted.value, token); assert.equal(accepted.signal.aborted, false);
  await turn(); assert.ok(words(ui.render()).includes(u.accepted)); assert.equal(words(ui.render()).includes(review.destination), false);
});

test('consent alone grants no acceptance and non-user click events are ignored', async t => {
  const ui = mounted(t); ui.click(u.check); await turn(); ui.consent();
  assert.equal(ui.calls.some(call => call.kind === 'accept'), false);
  ui.click(u.accept, { isTrusted: false }); assert.equal(ui.calls.some(call => call.kind === 'accept'), false);
});

test('a fresh check clears the old review and requires new consent', async t => {
  const ui = mounted(t); ui.click(u.check); await turn(); ui.consent(); ui.click(u.check);
  assert.equal(words(ui.render()).includes(review.destination), false); await turn(); assert.equal(ui.button(u.accept).props.disabled, true);
});

test('duplicate check and accept events before rendering dispatch one request each', async t => {
  const ui = mounted(t), waiting = ui.holdCheck(), check = ui.button(u.check).props.onClick;
  check(); check(); assert.equal(ui.calls.filter(call => call.kind === 'check').length, 1); waiting.resolve(candidate); await turn();
  ui.consent(); const accepting = ui.holdAccept(), accept = ui.button(u.accept).props.onClick;
  accept({ isTrusted: true }); accept({ isTrusted: true }); assert.equal(ui.calls.filter(call => call.kind === 'accept').length, 1);
  accepting.resolve({ ok: false, error: { code: 'BACKUP_REQUIRED' } }); await turn();
  assert.ok(words(ui.render()).includes(u.backupRequired)); assert.ok(words(ui.render()).includes(u.acceptFailed));
  assert.equal(words(ui.render()).includes(review.destination), false);
});

for (const action of ['cancel', 'hide', 'pagehide', 'replace', 'unmount']) test(`${action} retires a pending check and ignores its late candidate`, async t => {
  const ui = mounted(t), waiting = ui.holdCheck(); ui.click(u.check);
  if (action === 'cancel') ui.click(u.cancel); else ui[action]();
  assert.equal(ui.calls.find(call => call.kind === 'check').signal.aborted, true);
  assert.ok(ui.calls.some(call => call.kind === 'cancel'));
  waiting.resolve(candidate); await turn(); assert.equal(words(ui.render()).includes(review.destination), false);
});

test('discard during pending acceptance ignores a late success and never retries', async t => {
  const ui = mounted(t); ui.click(u.check); await turn(); ui.consent(); const waiting = ui.holdAccept(); ui.click(u.accept); ui.click(u.cancel);
  assert.equal(ui.calls.find(call => call.kind === 'accept').signal.aborted, true);
  waiting.resolve({ ok: true, value: { destination: review.destination, acceptedSequence: 5, releaseEnabled: false } }); await turn();
  assert.ok(words(ui.render()).includes(u.cancelled)); assert.equal(words(ui.render()).includes(u.accepted), false);
  assert.equal(ui.calls.filter(call => call.kind === 'accept').length, 1);
});

test('replacing a controller after review removes the candidate and requires fresh consent', async t => {
  const ui = mounted(t); ui.click(u.check); await turn(); ui.consent();
  assert.equal(ui.button(u.accept).props.disabled, false);
  ui.replace();
  assert.equal(words(ui.render()).includes(review.destination), false);
  assert.equal(ui.calls.some(call => call.kind === 'accept'), false);
  assert.equal(ui.calls.filter(call => call.kind === 'cancel').length, 1);
  ui.click(u.check); await turn();
  assert.ok(words(ui.render()).includes(review.destination));
  assert.equal(ui.button(u.accept).props.disabled, true);
});

test('ordinary controller failures settle the UI, use fixed copy and permit a new explicit check', async t => {
  let checks = 0;
  const controller = {
    checkForUpdate() { if (++checks === 1) throw new Error('synthetic check detail'); return Promise.resolve(candidate); },
    acceptUpdate() { return Promise.reject(new Error('synthetic acceptance detail')); },
    cancel() {}, dispose() { assert.fail('controller owner retains disposal'); },
  };
  const ui = mounted(t, controller); ui.click(u.check); await turn();
  assert.ok(words(ui.render()).includes(u.failed));
  assert.equal(words(ui.render()).includes('synthetic check detail'), false);
  assert.equal(ui.button(u.check).props.disabled, false);
  ui.click(u.check); await turn(); ui.consent(); ui.click(u.accept); await turn();
  assert.ok(words(ui.render()).includes(u.acceptFailed));
  assert.equal(words(ui.render()).includes('synthetic acceptance detail'), false);
  assert.equal(words(ui.render()).includes(review.destination), false);
  assert.equal(ui.button(u.check).props.disabled, false);
  ui.click(u.check); await turn();
  assert.equal(checks, 3); assert.equal(ui.button(u.accept).props.disabled, true);
});

test('pagehide during pending acceptance retires its UI result without another acceptance', async t => {
  const ui = mounted(t); ui.click(u.check); await turn(); ui.consent();
  const waiting = ui.holdAccept(); ui.click(u.accept); ui.pagehide();
  assert.equal(ui.calls.find(call => call.kind === 'accept').signal.aborted, true);
  waiting.resolve({ ok: true, value: { destination: review.destination, acceptedSequence: 5, releaseEnabled: false } });
  await turn();
  assert.ok(words(ui.render()).includes(u.cancelled));
  assert.equal(words(ui.render()).includes(u.accepted), false);
  assert.equal(ui.calls.filter(call => call.kind === 'accept').length, 1);
});

test('the maintained controller with unset trust reports unconfigured through the optional view', async t => {
  const controller = createAssetUpdateController({ trust: null }); t.after(() => controller.dispose());
  const ui = mounted(t, controller); ui.click(u.check); await turn();
  assert.ok(words(ui.render()).includes(u.unconfigured)); assert.equal(words(ui.render()).includes(u.accept), false);
});

for (const result of [{ kind: 'none' }, { kind: 'untrusted', reason: 'KEY_UNTRUSTED' },
  { kind: 'stale', reason: 'RELEASE_ROLLBACK' }, { kind: 'unreachable', reason: 'POLICY_BLOCKED' }]) {
  test(`${result.kind} discovery leaves no confirmable candidate`, async t => {
    const ui = mounted(t); ui.setCheck(result); ui.click(u.check); await turn();
    assert.ok(words(ui.render()).includes(u[result.kind])); assert.equal(words(ui.render()).includes(u.accept), false);
  });
}

test('update recovery and consent copy belongs to the critical reviewed locale boundary', () => {
  for (const name of ['consent', 'recoveryRequired', 'freshOrigin', 'disabled', 'acceptFailed']) {
    const entry = sourceCatalog[`updates.${name}`]; assert.equal(entry.severity, 'critical'); assert.equal(entry.reviewRequired, true);
  }
});
