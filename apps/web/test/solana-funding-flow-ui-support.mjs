import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
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
async function mounted(t, initialProposal = {}) {
  const states = [], refs = [], effects = [], calls = [], downloads = [], blobs = [];
  let stateAt = 0, refAt = 0, effectAt = 0, live = true, listener, held;
  let snapshot = { version: 1, phase: 'ready', profileIds: [PROFILE], profileId: PROFILE, wallet: null, review: null, error: null, proposals: [{ ...proposalView, bindingStatus: 'available', recoveryRetained: false, escrowConflict: false, state: 'absent', walletConnected: true, ...initialProposal }], tradeCapacity: { used: 1, limit: 8 },
    trades: [{ id: TRADE, role: 'seller', seller: 'public-seller', buyer: 'public-buyer', amountBaseUnits: '100',
      deadlineSeconds: '2000', escrow: 'public-escrow', state: 'funded', paidOut: false, chainTimeSeconds: '1000',
      restored: false, intents: [], payoutBlockedBy: [], rentTopUpLamports: null, canRelease: false, canRefund: false, canPayout: false }] };
  const client = { snapshot: () => snapshot, subscribe(fn) { listener = fn; fn(snapshot); return () => {}; }, dispose() {},
    async request(command) {
      calls.push(command);
      if (['funding.proposal.import', 'funding.prepare', 'funding.wallet.connect'].includes(command.type) && held) return held.promise;
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
    changeProposal(fields) { snapshot = { ...snapshot, proposals: [{ ...snapshot.proposals[0], ...fields }] }; listener(snapshot); },
    hold() { held = deferred(); return { finish() { held.resolve({ ok: true, snapshot }); }, fail() { held.resolve({ ok: false, snapshot, code: 'RETIRED_FUNDING_RESULT' }); } }; },
    start() { held = deferred(); const original = snapshot; fill(); const handler = button('Save seller funding proposal').props.onClick; handler();
      return { repeat: handler, finish() { held.resolve({ ok: true, snapshot: original,  }); },
        fail() { held.resolve({ ok: false, snapshot: original, code: 'STALE_PROPOSAL_FIXTURE' }); } };
    },
    replaceProfile() { snapshot = { ...snapshot, profileId: 'c'.repeat(32), proposals: [], tradeCapacity: { used: 0, limit: 8 } }; listener(snapshot); },
    hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
  };
}


export { mounted, nodes, words, proposalView, PROFILE, TRADE };
