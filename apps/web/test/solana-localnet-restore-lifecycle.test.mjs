import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
import { createSolanaRecoveryClient } from '../src/solana-localnet/client.ts';
import { SolanaRecoveryController } from '../src/solana-localnet/controller.ts';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument } from '../src/solana-localnet/config.ts';
import { configOption } from './solana-localnet-support.mjs';
import { MAX_BACKUP_BYTES } from '../../../packages/schemas/index.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';

const PASS = 'public synthetic Solana restore source passphrase';
const DEST = 'public synthetic Solana restore destination passphrase';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result; };
function memoryStore() {
  const rows = new Map();
  return { rows, async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); assert.equal(rows.has(row.profileId), false); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) {
      options?.assertCurrent?.();
      if (JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
      rows.set(after.profileId, structuredClone(after));
    },
    async addWithSource(source, next, options) { assert.deepEqual(rows.get(source.profileId), source); await this.add(next, options); },
    async listProfileIds() { return { profileIds: [...rows.keys()].sort(), truncated: false }; },
    subscribeInvalidation: () => () => {},
  };
}

// Execute the maintained component and client, with render-only hooks and controlled message delivery.
// The controller and encrypted backup operations are real; this is not DOM, IndexedDB or browser proof.
async function mounted(t) {
  const documentConfig = solanaLocalnetConfigDocument(configOption()), config = await parseSolanaLocalnetConfig(documentConfig);
  const data = memoryStore(), outputs = [], createdClient = deferred(), lifecycle = new EventTarget();
  let worker, client, walletCalls = 0, rpcCalls = 0;
  const wallet = { name: 'Synthetic sign-only fixture', accounts: [], features: {
    'standard:connect': { version: '1.0.0', async connect() { walletCalls++; throw Error('Unexpected wallet call'); } },
    'standard:events': { version: '1.0.0', on() { return () => {}; } },
    'solana:signTransaction': { version: '1.0.0', async signTransaction() { walletCalls++; throw Error('Unexpected wallet call'); } },
  } };
  const controller = new SolanaRecoveryController(config, wallet, { async request() { rpcCalls++; throw Error('Unexpected RPC'); } },
    { store: data, onSnapshot: snapshot => outputs.push({ kind: 'snapshot', snapshot: structuredClone(snapshot) }) });
  const originalId = success(await controller.dispatch({ type: 'profile.create', passphrase: PASS })).snapshot.profileId;
  const backup = success(await controller.dispatch({ type: 'backup.export' })).backupBytes;
  outputs.length = 0;
  class ControlledWorker {
    listeners = new Map(); posted = []; at = 0;
    constructor(url, options) { assert.ok(url.pathname.endsWith('/solana-localnet.worker.ts')); assert.equal(options.type, 'module'); worker = this; }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    removeEventListener(type, callback) { if (this.listeners.get(type) === callback) this.listeners.delete(type); }
    postMessage(value) { this.posted.push(structuredClone(value)); }
    terminate() { this.terminated = true; }
    emit(value) { this.listeners.get('message')?.({ data: structuredClone(value) }); }
    async execute() {
      const input = this.posted[this.at++]; assert.equal(input.kind, 'command');
      const result = await controller.dispatch(input.command); outputs.push({ kind: 'result', id: input.id, result }); return result;
    }
    deliver() { for (const value of outputs.splice(0)) this.emit(value); }
  }
  const globals = new Map(['Worker', 'addEventListener', 'removeEventListener'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { Worker: ControlledWorker, addEventListener: lifecycle.addEventListener.bind(lifecycle), removeEventListener: lifecycle.removeEventListener.bind(lifecycle) });
  const source = await readFile(new URL('../src/solana-localnet/SolanaLocalnetRoot.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function download')).replace('export function SolanaLocalnetRoot', 'function SolanaLocalnetRoot');
  const emitted = (await transformWithOxc(body, 'SolanaLocalnetRoot.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
  const states = [], refs = [], effects = [];
  let stateAt = 0, refAt = 0, effectAt = 0, live = true;
  const document = Object.assign(new EventTarget(), { hidden: false, createElement: () => ({ click() {} }) });
  const context = {
    useState(initial) { const at = stateAt++; if (!(at in states)) states[at] = initial; return [states[at], value => { if (live) states[at] = typeof value === 'function' ? value(states[at]) : value; }]; },
    useRef(initial) { const at = refAt++; return refs[at] ??= { current: initial }; },
    useEffect(callback) { const at = effectAt++; effects[at] ??= { callback }; },
    MAX_BACKUP_BYTES, Uint8Array, Blob, URL: { createObjectURL: () => 'blob:unit-fixture', revokeObjectURL() {} }, document, setTimeout,
    SOLANA_LOCALNET_BANNER: 'Local fixture', __P2P_SOLANA_LOCALNET_CONFIG__: documentConfig,
    parseSolanaLocalnetConfig, createSolanaRecoveryClient(...args) { client = createSolanaRecoveryClient(...args); createdClient.resolve(); return client; },
    discoverSolanaWallets(onChange) { onChange([{ id: 1, name: wallet.name, wallet }]); return () => {}; },
    React: { Fragment: 'fragment' }, jsx: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  runInNewContext(`${emitted}\nglobalThis.Root = SolanaLocalnetRoot;`, context);
  const find = (node, predicate) => {
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  const words = node => Array.isArray(node) ? node.map(words).join('') : typeof node === 'string' ? node : node?.props ? words(node.props.children) : '';
  const render = () => {
    stateAt = refAt = effectAt = 0; const root = context.Root();
    for (const effect of effects) if (!effect.ran) { effect.ran = true; effect.stop = effect.callback(); }
    return root;
  };
  const node = predicate => { const found = find(render(), predicate); assert.ok(found, 'expected maintained UI control'); return found; };
  const input = label => find(node(n => n.type === 'label' && words(n).startsWith(label)), n => n.type === 'input');
  const button = label => node(n => n.type === 'button' && words(n) === label);
  const fill = (label, value) => input(label).props.onChange({ target: { value } });
  const select = (id, value) => node(n => n.type === 'select' && n.props.id === id).props.onChange({ target: { value } });
  const chooseFile = file => { const target = { files: [file], value: file.name ?? 'public-fixture.backup' }; return input('Encrypted backup').props.onChange({ target, currentTarget: target }); };
  const flush = async () => { const result = await worker.execute(); worker.deliver(); await turn(); return result; };
  const unmount = () => { if (live) { for (const effect of effects) effect.stop?.(); live = false; } };
  t.after(() => {
    unmount(); client?.dispose(); controller.dispose();
    for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    assert.equal(walletCalls, 0); assert.equal(rpcCalls, 0);
  });
  render(); select('solana-wallet-choice', '1'); button('Use selected wallet').props.onClick();
  await createdClient.promise; await flush();
  select('solana-profile-choice', originalId); fill('Profile passphrase', PASS); button('Unlock recovery profile').props.onClick();
  success(await flush()); assert.equal(client.snapshot().profileId, originalId);
  return { render, input, button, fill, select, chooseFile, flush, unmount, worker, controller, data, client, backup, originalId,
    hide() { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
    async lock() { button('Lock profile').props.onClick(); return success(await flush()); },
  };
}

test('immediate profile redaction does not admit restore input before the lock acknowledgment', async t => {
  const ui = await mounted(t);
  ui.button('Lock profile').props.onClick();
  const beforeAck = { profileId: ui.render().props['data-profile-id'], busy: ui.render().props['aria-busy'],
    inputDisabled: !!ui.input('Encrypted backup').props.disabled };
  assert.equal(beforeAck.profileId, '', 'private projection disappears synchronously');
  if (!beforeAck.inputDisabled) {
    await ui.chooseFile({ size: ui.backup.length, arrayBuffer: async () => ui.backup.slice().buffer });
    ui.fill('Backup passphrase', PASS); ui.fill('New profile passphrase', DEST);
    assert.equal(ui.button('Restore with a fresh key').props.disabled, false, 'RED witness: restore was admitted before acknowledgment');
  }
  await ui.flush();
  const witness = { ...beforeAck, sourceAfterAcknowledgment: ui.input('Backup passphrase').props.value,
    destinationAfterAcknowledgment: ui.input('New profile passphrase').props.value,
    restoreDisabledAfterAcknowledgment: ui.button('Restore with a fresh key').props.disabled };
  assert.equal(beforeAck.busy, true, JSON.stringify(witness));
  assert.equal(beforeAck.inputDisabled, true);
  assert.equal(ui.render().props['aria-busy'], false);
  await ui.chooseFile({ size: ui.backup.length, arrayBuffer: async () => ui.backup.slice().buffer });
  ui.fill('Backup passphrase', PASS); ui.fill('New profile passphrase', DEST);
  assert.equal(ui.button('Restore with a fresh key').props.disabled, false);
  ui.button('Restore with a fresh key').props.onClick(); const restored = success(await ui.flush());
  assert.notEqual(restored.snapshot.profileId, ui.originalId); assert.equal(ui.data.rows.size, 2);
  assert.equal(ui.client.snapshot().profileId, restored.snapshot.profileId);
});

test('restore clears the selected UI buffer after cloning intact bytes into the Worker command', async t => {
  const ui = await mounted(t); await ui.lock();
  const selected = ui.backup.slice(), expected = selected.slice();
  await ui.chooseFile({ size: selected.length, arrayBuffer: async () => selected.buffer });
  ui.fill('Backup passphrase', PASS); ui.fill('New profile passphrase', DEST);
  ui.button('Restore with a fresh key').props.onClick();
  const sent = ui.worker.posted.at(-1).command;
  assert.equal(sent.type, 'backup.restore'); assert.deepEqual(sent.bytes, expected);
  assert.equal(selected.every(byte => byte === 0), true, 'document copy is discarded immediately after synchronous postMessage cloning');
  const restored = success(await ui.flush());
  assert.notEqual(restored.snapshot.profileId, ui.originalId); assert.equal(ui.data.rows.size, 2);
  assert.equal(ui.client.snapshot().profileId, restored.snapshot.profileId);
  assert.equal(ui.render().props['aria-busy'], false);
});

for (const interruption of ['visibility lock', 'unmount', 'profile opening']) test(`a late backup file read is disposed after ${interruption}`, async t => {
  const ui = await mounted(t); await ui.lock();
  const read = deferred(), raw = ui.backup.slice();
  const loading = ui.chooseFile({ size: raw.length, arrayBuffer: () => read.promise });
  if (interruption === 'visibility lock') { ui.hide(); await ui.flush(); }
  else if (interruption === 'unmount') ui.unmount();
  else {
    ui.select('solana-profile-choice', ui.originalId); ui.fill('Profile passphrase', PASS);
    ui.button('Unlock recovery profile').props.onClick(); success(await ui.flush());
  }
  read.resolve(raw.buffer); await loading; await turn();
  assert.equal(raw.every(byte => byte === 0), true, 'a private file continuation cannot retain bytes across a revoked input scope');
  assert.equal(ui.worker.posted.some(item => item.command?.type === 'backup.restore'), false);
  assert.equal(ui.data.rows.size, 1);
});
