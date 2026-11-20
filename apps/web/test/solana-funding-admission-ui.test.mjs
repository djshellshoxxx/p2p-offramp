import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
import { createSolanaRecoveryClient } from '../src/solana-localnet/client.ts';
import { makeTerms } from '../../../packages/chain-solana/test/support.mjs';

const source = await readFile(new URL('../src/solana-localnet/SolanaLocalnetRoot.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function download')).replace('export function SolanaLocalnetRoot', 'function SolanaLocalnetRoot');
const emitted = (await transformWithOxc(body, 'SolanaLocalnetRoot.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
const PROFILE = 'a'.repeat(32), TRADE = 'b'.repeat(64), PUBLIC_JSON = '{"format":"ordinary-public-recovery-fixture"}\n';
const terms = makeTerms(), proposalText = JSON.stringify({ format: 'p2p-offramp/solana-local-funding-proposal/v1', terms });
const proposalView = { id: 'd'.repeat(32), binding: { chain: 'solana', networkId: 'local', deploymentId: 'original', tradeId: TRADE }, terms, escrow: 'original-escrow', restored: true, bindingStatus: 'configuration-mismatch', recoveryRetained: true, escrowConflict: true, state: 'unverified', chainTimeSeconds: null, walletConnected: false, intents: [] };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' ? node : node?.props ? words(node.props.children) : '';

// Maintained TSX handlers with controlled client results; real controller/schema coverage is separate.
// This does not claim native browser, Worker, chain or download-manager execution.
async function mounted(t) {
  const states = [], refs = [], effects = [], calls = [], downloads = [], blobs = [];
  let stateAt = 0, refAt = 0, effectAt = 0, live = true, listener, held;
  let snapshot = { version: 1, phase: 'ready', profileIds: [PROFILE], profileId: PROFILE, wallet: null, review: null, error: null, proposals: [proposalView], tradeCapacity: { used: 1, limit: 8 },
    trades: [{ id: TRADE, role: 'seller', seller: 'public-seller', buyer: 'public-buyer', amountBaseUnits: '100',
      deadlineSeconds: '2000', escrow: 'public-escrow', state: 'funded', paidOut: false, chainTimeSeconds: '1000',
      restored: false, intents: [], payoutBlockedBy: [], rentTopUpLamports: null, canRelease: false, canRefund: false, canPayout: false }] };
  const client = { snapshot: () => snapshot, subscribe(fn) { listener = fn; fn(snapshot); return () => {}; }, dispose() {},
    async request(command) {
      calls.push(command);
      if (command.type === 'funding.proposal.import') return held.promise;
      if (command.type === 'profile.lock') { snapshot = { ...snapshot, phase: 'locked', profileId: null, trades: [], proposals: [], tradeCapacity: { used: 0, limit: 8 } }; listener(snapshot); }
      return { ok: true, snapshot };
    } };
  const document = Object.assign(new EventTarget(), { hidden: false, createElement() { return { click() {
    downloads.push({ filename: this.download, href: this.href, blob: blobs.at(-1) });
  } }; } });
  const context = {
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial; return [states[at], value => {
      if (live) states[at] = typeof value === 'function' ? value(states[at]) : value;
    }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useEffect(callback) { const at = effectAt++; effects[at] ??= { callback }; },
    MAX_BACKUP_BYTES: 64 * 1024 * 1024, Uint8Array, TextEncoder, Blob, document,
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:ordinary-recovery-test'; }, revokeObjectURL() {} }, setTimeout() {},
    SOLANA_LOCALNET_BANNER: 'Local test', __P2P_SOLANA_LOCALNET_CONFIG__: {}, parseSolanaLocalnetConfig: async () => ({}),
    createSolanaRecoveryClient: () => client,
    discoverSolanaWallets(fn) { fn([{ id: 1, name: 'Ordinary fixture wallet', wallet: {} }]); return () => {}; },
    React: { Fragment: 'fragment' }, jsx: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  runInNewContext(`${emitted}\nglobalThis.Root = SolanaLocalnetRoot;`, context);
  const render = () => {
    stateAt = refAt = effectAt = 0; const root = context.Root();
    for (const effect of effects) if (!effect.ran) { effect.ran = true; effect.stop = effect.callback(); }
    return root;
  };
  const button = label => { const node = nodes(render(), n => n.type === 'button' && words(n) === label)[0]; assert.ok(node); return node; };
  const unmount = () => { if (live) { for (const effect of effects) effect.stop?.(); live = false; } };
  t.after(unmount); render();
  nodes(render(), n => n.type === 'select' && n.props.id === 'solana-wallet-choice')[0].props.onChange({ target: { value: '1' } });
  button('Use selected wallet').props.onClick(); await turn();
  const input = () => { const node = nodes(render(), n => n.type === 'textarea' && n.props.id === 'solana-funding-proposal-json')[0]; assert.ok(node); return node; };
  const fill = () => input().props.onChange({ target: { value: proposalText } });
  return { render, button, input, fill, calls, downloads, unmount,
    start() { held = deferred(); const original = snapshot; fill(); const handler = button('Save seller funding proposal').props.onClick; handler();
      return { repeat: handler, finish() { held.resolve({ ok: true, snapshot: original,  }); },
        fail() { held.resolve({ ok: false, snapshot: original, code: 'STALE_PROPOSAL_FIXTURE' }); } };
    },
    replaceProfile() { snapshot = { ...snapshot, profileId: 'c'.repeat(32), proposals: [], tradeCapacity: { used: 0, limit: 8 } }; listener(snapshot); },
    hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('proposal UI shows fixed terms and truthful saved-only status without importing or requesting economic work on render', async t => {
  const ui = await mounted(t); assert.deepEqual(ui.calls.map(c => c.type), ['status']);
  const card = nodes(ui.render(), n => n.props['data-proposal-id'] === proposalView.id)[0]; assert.ok(card);
  const text = words(card); assert.match(text, /Saved proposal/); assert.match(text, /Peer acceptance has not been established/);
  assert.match(text, /Original provenance preserved after restore/); assert.match(text, /Saved with a different local configuration/);
  assert.match(text, /Another retained binding uses this escrow/); assert.match(text, /A recovery document is retained/);
  for (const value of Object.values(terms).filter(value => value !== null && value !== 'native')) assert.ok(text.includes(value));
  assert.equal(ui.input().props.maxLength, 4096); assert.equal(ui.button('Save seller funding proposal').props.disabled, true);
  assert.equal(nodes(card, n => n.type === 'button').length, 0);
});
test('proposal UI reserves one request and clears the submitted text before its result', async t => {
  const ui = await mounted(t), pending = ui.start(); pending.repeat();
  assert.equal(ui.calls.filter(c => c.type === 'funding.proposal.import').length, 1);
  assert.equal(ui.calls.at(-1).text, proposalText); assert.equal(ui.input().props.value, '');
  assert.equal(ui.input().props.disabled, true); assert.equal(ui.render().props['aria-busy'], true);
  pending.finish(); await turn(); assert.equal(ui.render().props['aria-busy'], false);
  assert.equal(ui.calls.some(c => /wallet.connect|review|refresh/.test(c.type)), false);
});
for (const retire of ['lock', 'replaceProfile', 'hide', 'unmount']) test(`late proposal result is ignored after ${retire}`, async t => {
  const ui = await mounted(t), pending = ui.start();
  if (retire === 'lock') ui.button('Lock profile').props.onClick(); else ui[retire]();
  pending.fail(); await turn();
  assert.equal(nodes(ui.render(), n => n.props.role === 'alert').some(node => words(node).includes('STALE_PROPOSAL_FIXTURE')), false);
  if (retire === 'replaceProfile') assert.equal(ui.input().props.value, '');
  if (retire !== 'unmount') assert.equal(nodes(ui.render(), n => n.props['data-proposal-id'] === proposalView.id).length, 0);
});
test('unsent proposal input is cleared on profile replacement without an import', async t => {
  const ui = await mounted(t); ui.fill(); assert.equal(ui.input().props.value, proposalText);
  ui.replaceProfile(); assert.equal(ui.input().props.value, ''); assert.equal(ui.calls.some(c => c.type === 'funding.proposal.import'), false);
});

// Actual document client with controlled Worker delivery; no browser or native-wallet claim.
function browserClient(t) {
  let worker, changed, walletCalls = 0;
  class Worker {
    callbacks = new Map(); posted = [];
    constructor() { worker = this; }
    addEventListener(name, callback) { this.callbacks.set(name, callback); }
    removeEventListener(name) { this.callbacks.delete(name); }
    postMessage(message) { this.posted.push(structuredClone(message)); }
    terminate() {}
    emit(message) { this.callbacks.get('message')?.({ data: structuredClone(message) }); }
  }
  const saved = new Map(['Worker', 'addEventListener', 'removeEventListener'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { Worker, addEventListener() {}, removeEventListener() {} });
  const wallet = { accounts: [], features: {
    'standard:connect': { version: '1.0.0', async connect() { walletCalls++; throw Error(); } },
    'standard:events': { version: '1.0.0', on(_type, callback) { changed = callback; return () => {}; } },
    'solana:signTransaction': { version: '1.0.0', async signTransaction() { walletCalls++; throw Error(); } },
  } };
  const client = createSolanaRecoveryClient({ ReleaseEnabled: 0 }, wallet);
  t.after(() => { client.dispose(); for (const [key, d] of saved) { if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key]; }
    assert.equal(walletCalls, 0); });
  const snapshot = () => ({ version: 1, phase: 'ready', profileIds: [PROFILE], profileId: PROFILE, wallet: null, review: null,
    error: null, trades: [], proposals: [proposalView], tradeCapacity: { used: 1, limit: 8 } });
  const answer = (value, id = worker.posted.at(-1).id) => worker.emit({ kind: 'result', id, result: { ok: true, snapshot: value } });
  return { client, worker, snapshot, answer, changed: () => changed({ accounts: [] }) };
}
test('document client redacts proposals and capacity on lock before acknowledgment and suppresses late results', async t => {
  const f = browserClient(t), opened = f.client.request({ type: 'profile.unlock', profileId: PROFILE, passphrase: 'fixture' });
  f.answer(f.snapshot()); await opened; assert.equal(f.client.snapshot().proposals.length, 1);
  const pending = f.client.request({ type: 'funding.proposal.import', text: proposalText }), id = f.worker.posted.at(-1).id;
  const locked = f.client.request({ type: 'profile.lock' });
  assert.deepEqual(f.client.snapshot().proposals, []); assert.deepEqual(f.client.snapshot().tradeCapacity, { used: 0, limit: 8 });
  assert.equal((await pending).code, 'CANCELLED'); f.answer(f.snapshot(), id); f.worker.emit({ kind: 'snapshot', snapshot: f.snapshot() });
  assert.deepEqual(f.client.snapshot().proposals, []);
  f.answer({ ...f.snapshot(), phase: 'locked', profileId: null, proposals: [], tradeCapacity: { used: 0, limit: 8 } }); await locked;
});
test('wallet-only change retains proposal data without wallet or review authority', async t => {
  const f = browserClient(t), opened = f.client.request({ type: 'profile.unlock', profileId: PROFILE, passphrase: 'fixture' });
  f.answer(f.snapshot()); await opened; f.changed();
  assert.equal(f.client.snapshot().proposals.length, 1); assert.equal(f.client.snapshot().tradeCapacity.used, 1);
  assert.equal(f.client.snapshot().wallet, null); assert.equal(f.client.snapshot().review, null);
});
