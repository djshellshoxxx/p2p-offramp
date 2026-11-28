import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/solana-localnet/SolanaLocalnetRoot.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function download')).replace('export function SolanaLocalnetRoot', 'function SolanaLocalnetRoot');
const emitted = (await transformWithOxc(body, 'SolanaLocalnetRoot.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
const PROFILE = 'a'.repeat(32), TRADE = 'b'.repeat(64), PUBLIC_JSON = '{"format":"ordinary-public-recovery-fixture"}\n';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(child => nodes(child, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' ? node : node?.props ? words(node.props.children) : '';

// Maintained TSX handlers with controlled client results; real controller/schema coverage is separate.
// This does not claim native browser, Worker, chain or download-manager execution.
async function mounted(t) {
  const states = [], refs = [], effects = [], calls = [], downloads = [], blobs = [];
  let stateAt = 0, refAt = 0, effectAt = 0, live = true, listener, held;
  let snapshot = { version: 1, phase: 'ready', profileIds: [PROFILE], profileId: PROFILE, wallet: null, review: null, error: null, proposals: [], tradeCapacity: { used: 1, limit: 8 },
    trades: [{ id: TRADE, role: 'seller', seller: 'public-seller', buyer: 'public-buyer', amountBaseUnits: '100',
      deadlineSeconds: '2000', escrow: 'public-escrow', state: 'funded', paidOut: false, chainTimeSeconds: '1000',
      restored: false, intents: [], payoutBlockedBy: [], rentTopUpLamports: null, canRelease: false, canRefund: false, canPayout: false }] };
  const client = { snapshot: () => snapshot, subscribe(fn) { listener = fn; fn(snapshot); return () => {}; }, dispose() {},
    async request(command) {
      calls.push(command);
      if (command.type === 'recovery.export') return held.promise;
      if (command.type === 'profile.lock') { snapshot = { ...snapshot, phase: 'locked', profileId: null, trades: [] }; listener(snapshot); }
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
  return { render, button, calls, downloads, unmount,
    start() { held = deferred(); const original = snapshot; button('Export public recovery JSON').props.onClick();
      return { finish() { held.resolve({ ok: true, snapshot: original, recoveryJson: PUBLIC_JSON }); },
        fail() { held.resolve({ ok: false, snapshot: original, code: 'STORAGE_UNAVAILABLE' }); } };
    },
    replaceProfile() { snapshot = { ...snapshot, profileId: 'c'.repeat(32) }; listener(snapshot); },
    hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('explicit selected-trade export downloads the exact returned public JSON once with its identity and MIME type', async t => {
  const ui = await mounted(t); assert.equal(ui.downloads.length, 0); assert.deepEqual(ui.calls.map(c => c.type), ['status']);
  assert.match(words(ui.render()), /Public file: original trade terms, wallet addresses and deployment identity/);
  const pending = ui.start(); ui.button('Export public recovery JSON').props.onClick();
  assert.equal(ui.calls.filter(c => c.type === 'recovery.export').length, 1);
  assert.equal(ui.calls.at(-1).tradeId, TRADE); pending.finish(); await turn();
  assert.equal(ui.downloads.length, 1); assert.equal(ui.downloads[0].filename, `solana-escrow-${TRADE}.recovery.json`);
  assert.equal(ui.downloads[0].blob.type, 'application/json'); assert.equal(await ui.downloads[0].blob.text(), PUBLIC_JSON);
  assert.equal(ui.calls.some(c => /wallet|review|refresh/.test(c.type)), false);
});
for (const retire of ['lock', 'replaceProfile', 'hide', 'unmount']) {
  test(`a pending public recovery download is retired on ${retire}`, async t => {
    const ui = await mounted(t), pending = ui.start();
    if (retire === 'lock') ui.button('Lock profile').props.onClick(); else ui[retire]();
    pending.finish(); await turn(); assert.equal(ui.downloads.length, 0);
  });
}
test('a failed public recovery request shows its error and creates no file', async t => {
  const ui = await mounted(t), pending = ui.start(); pending.fail(); await turn();
  assert.equal(ui.downloads.length, 0); assert.equal(nodes(ui.render(), n => n.props.role === 'alert').length, 1);
});
