import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { createSolanaRecoveryClient } from '../src/solana-localnet/client.ts';
import { mounted, nodes, words, proposalView, PROFILE, TRADE } from './solana-funding-flow-ui-support.mjs';

test('funding UI sends explicit proposal selectors and duplicate handler calls retain one request', async t => {
  const ui = await mounted(t), held = ui.hold(), handler = ui.button('Review funding').props.onClick;
  handler(); handler(); assert.equal(ui.calls.filter(c => c.type === 'funding.prepare').length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls.at(-1))), { type: 'funding.prepare', proposalId: proposalView.id });
  assert.equal(ui.button('Connect seller wallet').props.disabled, true);
  held.finish(); await turn(); assert.equal(ui.button('Review funding').props.disabled, false);
});
test('funding wallet connect uses the saved private proposal ID and no supplied terms or role', async t => {
  const ui = await mounted(t, { walletConnected: false });
  assert.equal(ui.button('Review funding').props.disabled, true); ui.button('Connect seller wallet').props.onClick(); await turn();
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls.at(-1))), { type: 'funding.wallet.connect', proposalId: proposalView.id });
});
test('funding UI requires an explicit unsucceeded dropped predecessor and never silently chooses one', async t => {
  const old = { id: 'dropped_funding_1', action: 'fund', state: 'dropped', signature: 'synthetic', replacementOf: null };
  const ui = await mounted(t, { intents: [old] }); assert.equal(ui.button('Review funding').props.disabled, true);
  ui.button('Review new funding after this definitive drop').props.onClick(); await turn();
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls.at(-1))), { type: 'funding.prepare', proposalId: proposalView.id, rebuildOf: old.id });
  ui.changeProposal({ intents: [old, { ...old, id: 'replacement_1', state: 'cancelled', replacementOf: old.id }] });
  assert.equal(nodes(ui.render(), n => n.type === 'button' && words(n) === 'Review new funding after this definitive drop').length, 0);
  assert.equal(ui.button('Review funding').props.disabled, false);
});
for (const state of ['unverified', 'funded', 'released', 'refunded']) test('funding UI refuses review for observation ' + state, async t => {
  const ui = await mounted(t, { state }); assert.equal(ui.button('Review funding').props.disabled, true);
  const card = nodes(ui.render(), n => n.props['data-proposal-id'] === proposalView.id)[0]; assert.equal(card.props['data-proposal-state'], state);
});
test('pending intent blocks funding review without hiding saved terms', async t => {
  const ui = await mounted(t, { intents: [{ id: 'pending', action: 'fund', state: 'unknown', signature: null, replacementOf: null }] });
  assert.equal(ui.button('Review funding').props.disabled, true); assert.match(words(ui.render()), /fund: unknown/);
});
for (const field of ['recoveryRetained', 'escrowConflict']) test('funding UI hides actions when ' + field, async t => {
  const ui = await mounted(t, { [field]: true }); const card = nodes(ui.render(), n => n.props['data-proposal-id'] === proposalView.id)[0];
  assert.equal(nodes(card, n => n.type === 'button').length, 0);
});
test('lock retires a held funding UI result and the original handler cannot duplicate it', async t => {
  const ui = await mounted(t), held = ui.hold(), handler = ui.button('Review funding').props.onClick;
  handler(); handler(); ui.button('Lock profile').props.onClick(); held.fail(); await turn();
  assert.equal(ui.calls.filter(c => c.type === 'funding.prepare').length, 1);
  assert.equal(nodes(ui.render(), n => n.props.role === 'alert').some(n => words(n).includes('RETIRED_FUNDING_RESULT')), false);
});

function documentFixture(t) {
  let worker, changed, signRelease, signs = 0, connects = 0;
  class Worker {
    callbacks = new Map(); posted = [];
    constructor() { worker = this; }
    addEventListener(type, fn) { this.callbacks.set(type, fn); } removeEventListener(type) { this.callbacks.delete(type); }
    postMessage(message) { this.posted.push(structuredClone(message)); } terminate() {}
    emit(message) { this.callbacks.get('message')?.({ data: structuredClone(message) }); }
  }
  const globals = new Map(['Worker', 'addEventListener', 'removeEventListener'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.assign(globalThis, { Worker, addEventListener() {}, removeEventListener() {} });
  const account = { address: 'controlled-wallet', publicKey: new Uint8Array(32).fill(4), chains: ['solana:localnet'], features: ['solana:signTransaction'] };
  const wallet = { accounts: [account], features: {
    'standard:connect': { version: '1.0.0', async connect() { connects++; return { accounts: wallet.accounts }; } },
    'standard:events': { version: '1.0.0', on(_type, callback) { changed = callback; return () => {}; } },
    'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], async signTransaction(input) {
      signs++; await new Promise(resolve => { signRelease = resolve; }); return [{ signedTransaction: input.transaction }];
    } },
  } };
  const client = createSolanaRecoveryClient({ ReleaseEnabled: 0 }, wallet);
  t.after(() => { signRelease?.(); client.dispose(); for (const [k, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; } });
  const walletRequest = { method: 'signTransaction', account: account.address, chain: 'solana:localnet', transaction: Buffer.from(new Uint8Array(100).fill(7)).toString('base64') };
  const review = { id: 'e'.repeat(32), action: 'fund', proposalId: proposalView.id, fields: [], expiresAtMs: Date.now() + 30000, walletRequest };
  let snapshot = { version: 1, phase: 'ready', profileIds: [PROFILE], profileId: PROFILE, wallet: { address: account.address, tradeId: TRADE },
    trades: [], proposals: [{ ...proposalView, bindingStatus: 'available', state: 'absent', recoveryRetained: false, escrowConflict: false, walletConnected: true }],
    tradeCapacity: { used: 1, limit: 8 }, review: null, error: null };
  const answer = (id, changes = {}) => { snapshot = { ...snapshot, ...changes }; worker.emit({ kind: 'result', id, result: { ok: true, snapshot } }); };
  return { client, worker, review, walletRequest, get signs() { return signs; }, get connects() { return connects; }, answer,
    change() { changed({ accounts: [] }); }, settle() { signRelease(); },
    async open() { const pending = client.request({ type: 'profile.unlock', profileId: PROFILE, passphrase: 'controlled' }); answer(worker.posted.at(-1).id); await pending; },
    async connect() {
      const pending = client.request({ type: 'funding.wallet.connect', proposalId: proposalView.id }), id = worker.posted.at(-1).id;
      worker.emit({ kind: 'wallet.request', id: 101, request: { method: 'connect' } }); await turn();
      assert.equal(worker.posted.at(-1).kind, 'wallet.result'); assert.equal(worker.posted.at(-1).ok, true);
      answer(id); assert.equal((await pending).ok, true);
    },
    async prepare() { const pending = client.request({ type: 'funding.prepare', proposalId: proposalView.id }), id = worker.posted.at(-1).id; answer(id, { review }); await pending; },
    publish() { worker.emit({ kind: 'snapshot', snapshot: { ...snapshot, review } }); },
  };
}
test('document client grants proposal-specific connect and review while initially redacting wallet authority', async t => {
  const f = documentFixture(t); await f.open(); assert.equal(f.client.snapshot().wallet, null); assert.equal(f.client.snapshot().proposals[0].walletConnected, false);
  await f.connect(); assert.equal(f.connects, 1); assert.equal(f.client.snapshot().proposals[0].walletConnected, true);
  await f.prepare(); assert.equal(f.client.snapshot().review.action, 'fund');
  const confirmed = f.client.request({ type: 'review.confirm', reviewId: f.review.id }), id = f.worker.posted.at(-1).id;
  f.worker.emit({ kind: 'wallet.request', id: 201, request: f.walletRequest }); await turn(); assert.equal(f.signs, 1);
  assert.equal((await f.client.request({ type: 'review.confirm', reviewId: f.review.id })).code, 'UNAUTHORIZED');
  f.settle(); await turn(); assert.equal(f.worker.posted.at(-1).ok, true); f.answer(id, { review: null }); await confirmed;
});
for (const interruption of ['cancel', 'lock', 'wallet']) test('document funding grants retain the physical prompt slot after ' + interruption, async t => {
  const f = documentFixture(t); await f.open(); await f.connect(); await f.prepare();
  const confirming = f.client.request({ type: 'review.confirm', reviewId: f.review.id }), id = f.worker.posted.at(-1).id;
  f.worker.emit({ kind: 'wallet.request', id: 201, request: f.walletRequest }); await turn(); assert.equal(f.signs, 1);
  let interrupted;
  if (interruption === 'wallet') f.change();
  else interrupted = f.client.request({ type: interruption === 'lock' ? 'profile.lock' : 'review.cancel' });
  assert.equal((await confirming).code, 'CANCELLED');
  assert.equal((await f.client.request({ type: 'funding.wallet.connect', proposalId: proposalView.id })).ok, false);
  f.settle(); await turn(); assert.equal(f.worker.posted.at(-1).ok, false); f.publish(); f.answer(id, { review: f.review });
  assert.equal(f.client.snapshot().review, null); assert.equal(f.signs, 1);
  if (interrupted) { const command = f.worker.posted.findLast(m => m.kind === 'command'); f.answer(command.id, interruption === 'lock' ? { profileId: null, phase: 'locked' } : { review: null }); await interrupted; }
  if (interruption !== 'cancel') assert.ok(f.client.snapshot().proposals.every(p => p.walletConnected === false));
});
