import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
import { DEFAULT_FIELD_NAMES, DRAFT_FIELD_NAMES } from '../src/trade/draft-controller.ts';
import { message, messageGroup } from '../src/ui/locale/runtime.ts';
import { tradePageMessages as p } from '../src/ui/trade/trade-messages.ts';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// Execute the maintained form's event handler with render-only hooks and a controlled review reply.
// This isolates navigation ownership; it is not DOM, browser, or native persistence qualification.
async function mounted(t, entry = 'draft') {
  const filename = entry === 'draft' ? 'TradeDraftPanel.tsx' : 'TradePages.tsx';
  const source = await readFile(new URL(`../src/ui/trade/${filename}`, import.meta.url), 'utf8');
  const body = source.slice(source.indexOf(entry === 'draft' ? 'const text =' : 'const noSubscription =')).replace(/^export /gm, '');
  const emitted = (await transformWithOxc(body, filename, { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
  const states = [], refs = [], effects = [], held = deferred(), calls = [];
  let stateAt = 0, refAt = 0, effectAt = 0, active = true;
  let snapshot = { unlocked: true, generation: 1, fields: Object.fromEntries(DRAFT_FIELD_NAMES.map(field => [field, ''])),
    library: null, preview: null, busy: null, status: 'idle', code: null,
    registry: { kind: 'ready', samples: [{ id: 'public-sample', label: 'Use sample' }] }, job: { kind: 'idle' },
    saved: { kind: 'idle' }, favorites: { kind: 'ready', revision: 0, recordIds: ['f'.repeat(32)] } };
  const drafts = {
    getSnapshot: () => snapshot,
    currentIdentity: () => ({ chainId: '31337', deploymentAddress: '0x' + '11'.repeat(20), assetAddress: null, assetDecimals: 18 }),
    async review(consent) { calls.push(consent); return held.promise; },
  };
  const window = { location: { hash: '#/offers' } };
  const trade = {
    async importFile(file) { calls.push(file); return held.promise; },
    async importSample(id) { calls.push(id); return held.promise; },
    async openFavorite(id) { calls.push(id); return held.promise; },
    find: () => ({ savedId: 'f'.repeat(32) }),
  };
  const context = {
    message: (group, key, variables) => message(group, key, structuredClone(variables)), messageGroup, p, DEFAULT_FIELD_NAMES, DRAFT_FIELD_NAMES, window,
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial; return [states[at], value => { if (active) states[at] = typeof value === 'function' ? value(states[at]) : value; }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useEffect(callback) { const at = effectAt++; effects[at] ??= { callback }; },
    React: { Fragment: 'fragment' }, jsx: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const component = entry === 'draft' ? 'FreshDraftForm' : entry === 'favorite' ? 'FavoritesPanel' : 'ReviewForm';
  runInNewContext(`${emitted}\nglobalThis.Form = ${component};`, context);
  const render = () => {
    stateAt = refAt = effectAt = 0;
    const root = context.Form({ drafts, snapshot, trade, store: {} });
    for (const effect of effects) if (!effect.ran) { effect.ran = true; effect.stop = effect.callback(); }
    return root;
  };
  const unmount = () => { if (active) { for (const effect of effects) effect.stop?.(); active = false; } };
  const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
    !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
  const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' ? node : node?.props ? words(node.props.children) : '';
  t.after(unmount);
  return {
    window, calls, unmount,
    submit() {
      if (entry === 'file') {
        nodes(render(), node => node.type === 'form')[0].props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: () => ({ files: [{ size: 16 }] }) } } });
        return;
      }
      if (entry === 'sample' || entry === 'favorite') {
        nodes(render(), node => node.type === 'button' && words(node) === (entry === 'sample' ? 'Use sample' : p.openFavorite))[0].props.onClick();
        return;
      }
      for (let index = 0; index < 3; index++) nodes(render(), node => node.type === 'input' && node.props.type === 'checkbox')[index].props.onChange({ currentTarget: { checked: true } });
      const form = render(), submit = nodes(form, node => node.type === 'button' && node.props.type === 'submit')[0];
      assert.equal(submit.props.disabled, false, 'all visible required consent controls were explicitly checked');
      form.props.onSubmit({ preventDefault() {} });
    },
    retire(patch) { snapshot = { ...snapshot, ...patch }; },
    async complete(id = 'A'.repeat(22)) {
      held.resolve(entry === 'file' || entry === 'sample' ? id ? { kind: 'accepted', localId: id } : { kind: 'cancelled' } : id);
      await turn();
    },
  };
}

test('fresh draft review opens its own result while the form and draft generation remain current', async t => {
  const ui = await mounted(t); ui.submit(); await ui.complete();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.window.location.hash, `#/trade/${'A'.repeat(22)}`);
});

test('leaving the fresh draft form prevents a late review from overriding the new route', async t => {
  const ui = await mounted(t); ui.submit();
  ui.unmount(); ui.window.location.hash = '#/settings'; await ui.complete();
  assert.equal(ui.window.location.hash, '#/settings');
});

test('a route change is respected before the form unmount cleanup runs', async t => {
  const ui = await mounted(t); ui.submit();
  ui.window.location.hash = '#/recovery'; await ui.complete();
  assert.equal(ui.window.location.hash, '#/recovery');
});

for (const [reason, patch] of [
  ['a new draft generation', { generation: 2 }],
  ['profile lock', { unlocked: false }],
]) test(`a review reply cannot navigate after ${reason}`, async t => {
  const ui = await mounted(t); ui.submit();
  ui.retire(patch); await ui.complete();
  assert.equal(ui.window.location.hash, '#/offers');
});

test('cancelled or rejected fresh review does not navigate', async t => {
  const ui = await mounted(t); ui.submit(); await ui.complete(null);
  assert.equal(ui.window.location.hash, '#/offers');
});

for (const entry of ['file', 'sample', 'favorite']) {
  test(`${entry} review opens its own current result`, async t => {
    const ui = await mounted(t, entry); ui.submit(); await ui.complete();
    assert.equal(ui.calls.length, 1); assert.equal(ui.window.location.hash, `#/trade/${'A'.repeat(22)}`);
  });
  test(`${entry} review respects a new route before unmount cleanup`, async t => {
    const ui = await mounted(t, entry); ui.submit();
    ui.window.location.hash = '#/settings'; await ui.complete();
    assert.equal(ui.window.location.hash, '#/settings');
  });
  test(`${entry} review cannot navigate after unmount`, async t => {
    const ui = await mounted(t, entry); ui.submit();
    ui.unmount(); ui.window.location.hash = '#/recovery'; await ui.complete();
    assert.equal(ui.window.location.hash, '#/recovery');
  });
}
