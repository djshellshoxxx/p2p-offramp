import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transformWithOxc } from 'vite';

// Execute the actual component's handlers; DOM/Worker/IndexedDB qualification is the browser gate.
test('saved-trade UI requires an explicit resume action followed by a separate transaction review', async () => {
  const source = await readFile(new URL('../src/localnet/LocalnetRoot.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function Trade('), source.indexOf('export function LocalnetRoot'));
  const emitted = (await transformWithOxc(body, 'LocalnetRoot.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
  const context = { useState: initial => [initial, () => {}], React: { Fragment: 'fragment' },
    jsx: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  runInNewContext(`${emitted}\nglobalThis.render = Trade;`, context);
  const find = (node, predicate) => {
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  const button = (tree, label) => find(tree, node => node.type === 'button' && node.props.children.includes(label));
  const trade = { id: 'ab'.repeat(32), role: 'seller', restored: true, chainState: 'absent', resumption: 'required',
    canResume: true, canFund: false, canApprove: false, canRelease: false, canRefund: false, intents: [], chat: [], approval: null };
  const calls = [], send = async command => { calls.push(structuredClone(command)); };
  const render = (patch = {}, busy = false) => context.render({ trade: { ...trade, ...patch }, busy, send });
  const initial = render(); assert.deepEqual(calls, [], 'display never requests resumption or a wallet action');
  assert.equal(button(initial, 'Review funding').props.disabled, true);
  assert.equal(button(render({ canResume: false }), 'Recheck and resume saved trade').props.disabled, true);
  assert.equal(button(render({}, true), 'Recheck and resume saved trade').props.disabled, true);
  button(initial, 'Recheck and resume saved trade').props.onClick();
  assert.deepEqual(calls, [{ type: 'trade.resume', tradeId: trade.id }]);
  const ready = render({ resumption: 'ready', canResume: false, canFund: true });
  assert.equal(button(ready, 'Recheck and resume saved trade'), undefined);
  assert.equal(button(ready, 'Review funding').props.disabled, false);
  assert.equal(calls.length, 1, 'a ready snapshot still does not prepare a transaction');
  button(ready, 'Review funding').props.onClick();
  assert.deepEqual(calls, [{ type: 'trade.resume', tradeId: trade.id }, { type: 'review.prepare', action: 'fund', tradeId: trade.id }]);
  assert.match(JSON.stringify(render({ resumption: 'unavailable' })), /Start a new negotiation from Local offers/);
  assert.match(JSON.stringify(render({ resumption: 'blocked' })), /Check the wallet and network/);
  assert.equal(find(render({ chainState: 'funded' }), node => node.props?.['aria-label'] === 'Resume saved trade'), undefined);
});
