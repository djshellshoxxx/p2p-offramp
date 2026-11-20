import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
import { MAX_RECOVERY_REFERENCE_EXPORT_BYTES, parseRecoveryReferences, parseRecoveryReferenceExportBytes } from '../../../packages/schemas/index.ts';
import { errorMessage } from '../src/ui/routes.ts';
import { recoveryReferenceMessages as m } from '../src/ui/recovery-reference-messages.ts';

const source = await readFile(new URL('../src/ui/RecoveryReferencesPanel.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const noSubscribe =')).replace(/^export /gm, '');
const emitted = (await transformWithOxc(body, 'RecoveryReferencesPanel.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
const page = parseRecoveryReferences({ authority: 'unverified-offline-reference', revision: 7, offset: 0,
  nextOffset: null, totalJournalRecords: 1, unsupported: 0, items: [{ recordId: '1'.repeat(32),
    intentId: Buffer.alloc(32, 1).toString('base64url'), binding: { chain: 'evm', networkId: 'evm:1', deploymentId: 'escrow-v1', tradeId: 'trade-1' },
    account: `0x${'12'.repeat(20)}`, action: 'fund', storedState: 'finalized', chainReference: null, nonce: '1' }] });
const ok = value => ({ ok: true, value });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' ? node : node?.props ? words(node.props.children) : '';

// Run maintained TSX handlers with dependency-aware render hooks and a held facade reply.
// This checks document continuation ownership, not a browser DOM, native Worker or IndexedDB durability.
function mounted(t) {
  const states = [], refs = [], effects = [], calls = [], downloads = [], encoded = [];
  let stateAt = 0, refAt = 0, effectAt = 0, dirty = false, active = true, scope = 1, held = null;
  let status = { state: 'unlocked' };
  const services = {
    get current() { return status; }, getSnapshot: () => status, selectionScope: () => scope, subscribe: () => () => {},
    async listRecoveryReferences(offset, expectedRevision, signal) {
      calls.push({ offset, expectedRevision, signal });
      return held ? held.promise : ok(structuredClone(page));
    },
  };
  const document = { body: { append() {} }, activeElement: null,
    createElement(tag) { assert.equal(tag, 'a'); return { remove() {}, click() { downloads.push(this.href); } }; } };
  document.activeElement = document.body;
  const blobs = [];
  function effect(callback, dependencies, layout) {
    const at = effectAt++, previous = effects[at];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
      effects[at] = { callback, dependencies, layout, pending: true, stop: previous?.stop };
    }
  }
  const context = {
    m, errorMessage, MAX_RECOVERY_REFERENCE_EXPORT_BYTES, AbortController, Uint8Array, Blob, document,
    TextEncoder: class extends TextEncoder { encode(value) { const bytes = super.encode(value); encoded.push(bytes); return bytes; } },
    URL: { createObjectURL(blob) { blobs.push(blob); return `blob:fixture-${blobs.length}`; }, revokeObjectURL() {} },
    setTimeout(callback) { callback(); },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial;
      return [states[at], value => { if (!active) return; const next = typeof value === 'function' ? value(states[at]) : value;
        if (!Object.is(next, states[at])) { states[at] = next; dirty = true; } }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useLayoutEffect(callback, dependencies) { effect(callback, dependencies, true); },
    useEffect(callback, dependencies) { effect(callback, dependencies, false); },
    React: { Fragment: 'fragment' }, jsx: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  runInNewContext(`${emitted}\nglobalThis.Panel = RecoveryReferencesPanel;`, context);
  function render() {
    let root;
    for (let count = 0; count < 10; count++) {
      dirty = false; stateAt = refAt = effectAt = 0; root = context.Panel({ services });
      for (const layout of [true, false]) for (const item of effects) if (item.pending && item.layout === layout) {
        item.pending = false; item.stop?.(); item.stop = item.callback();
      }
      if (!dirty) return root;
    }
    assert.fail('component did not settle after its layout effects');
  }
  const unmount = () => { if (active) { for (const item of effects) item.stop?.(); active = false; } };
  t.after(unmount);
  function click(label) {
    const button = nodes(render(), node => node.type === 'button' && words(node) === label)[0];
    assert.ok(button, `button exists: ${label}`); assert.notEqual(button.props.disabled, true);
    document.activeElement = button; button.props.onClick({ currentTarget: button });
  }
  return {
    calls, downloads, encoded, blobs, render, unmount, click,
    hold() { held = deferred(); return held; },
    retire(locked = false) { scope++; status = { state: locked ? 'locked' : 'unlocked' }; },
    async preview() {
      click(m.load); await turn();
      for (const index of [0, 1]) {
        const input = nodes(render(), node => node.type === 'input' && node.props.type === 'checkbox')[index];
        assert.ok(input); assert.equal(input.props.disabled, false); input.props.onChange({ currentTarget: { checked: true } });
      }
      click(m.preview); render(); assert.equal(encoded.length, 1); assert.equal(downloads.length, 0);
      return encoded[0];
    },
  };
}

test('current explicit recovery export downloads exactly the preview after a fresh revision-pinned read', async t => {
  const ui = mounted(t), preview = await ui.preview(); ui.click(m.download); await turn();
  assert.deepEqual(ui.calls.map(({ offset, expectedRevision }) => ({ offset, expectedRevision })),
    [{ offset: 0, expectedRevision: null }, { offset: 0, expectedRevision: page.revision }]);
  assert.equal(ui.downloads.length, 1); assert.equal(await ui.blobs[0].text(), new TextDecoder().decode(preview));
  const exported = parseRecoveryReferenceExportBytes(new Uint8Array(await ui.blobs[0].arrayBuffer()));
  assert.equal(exported.localSnapshotRevision, page.revision); assert.deepEqual(exported.items, page.items);
  assert.equal(exported.authority, 'unverified-offline-reference');
});

for (const locked of [false, true]) test(`held recovery export cannot download after ${locked ? 'lock' : 'profile replacement'} before the next render`, async t => {
  const ui = mounted(t), preview = await ui.preview(), reply = ui.hold(); ui.click(m.download);
  ui.retire(locked); reply.resolve(ok(structuredClone(page))); await turn();
  assert.equal(ui.downloads.length, 0, 'even identical restored references cannot reuse retired profile consent');
  const root = ui.render();
  assert.equal(preview.every(byte => byte === 0), true);
  assert.equal(nodes(root, node => node.type === 'textarea').length, 0);
});

test('unmount clears the private recovery preview and aborts its held export recheck', async t => {
  const ui = mounted(t), preview = await ui.preview(), reply = ui.hold(); ui.click(m.download); ui.unmount();
  assert.equal(ui.calls.at(-1).signal.aborted, true); assert.equal(preview.every(byte => byte === 0), true);
  reply.resolve(ok(structuredClone(page))); await turn(); assert.equal(ui.downloads.length, 0);
});

test('a changed durable revision discards the recovery preview without a download or retry', async t => {
  const ui = mounted(t), preview = await ui.preview(), reply = ui.hold(); ui.click(m.download);
  reply.resolve({ ok: false, error: { code: 'CONFLICT', messageKey: 'runtime.error.conflict' } }); await turn();
  const root = ui.render(); assert.equal(ui.downloads.length, 0); assert.equal(ui.calls.length, 2);
  assert.equal(preview.every(byte => byte === 0), true); assert.equal(nodes(root, node => node.type === 'textarea').length, 0);
  assert.equal(nodes(root, node => node.props.role === 'alert').length, 1);
});
