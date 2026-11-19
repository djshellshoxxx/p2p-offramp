import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { transformWithOxc } from 'vite';
import { LocalnetController } from '../src/localnet/controller.ts';
import { localnetConfigDocument, parseLocalnetConfig } from '../src/localnet/config.ts';
import { runLocalnetUiCommand } from '../src/localnet/ui-command.ts';
import { MAX_BACKUP_BYTES } from '../../../packages/schemas/index.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';

const PASS = 'public synthetic restore cancellation source';
const DEST = 'public synthetic restore cancellation destination';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function memoryStore() {
  const rows = new Map();
  return { rows,
    async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); if (rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) {
      options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
      if (JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
      rows.set(after.profileId, structuredClone(after));
    },
    async listProfileIds() { return { profileIds: [...rows.keys()], truncated: false }; },
    subscribeInvalidation: () => () => {},
  };
}
async function fixture() {
  const registryJson = await readFile(new URL('../../../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url), 'utf8');
  const raw = JSON.parse(registryJson), runtime = raw.networks[0].deployments[0].runtime.keccak256;
  const config = await parseLocalnetConfig(localnetConfigDocument({ registryJson,
    registrySha256: createHash('sha256').update(registryJson).digest('hex'),
    escrowLayouts: { [runtime]: 'canonical-get-trade-v1' }, relayUrl: 'ws://127.0.0.1:18501/' }));
  const store = memoryStore(), controller = new LocalnetController(config, {
    async request() { assert.fail('A backup operation must not access the wallet.'); }, on() {}, removeListener() {},
  }, { store, connectRelay() { throw new Error('Offline restore fixture'); } });
  const created = await controller.dispatch({ type: 'profile.create', passphrase: PASS }); assert.equal(created.ok, true);
  const exported = await controller.dispatch({ type: 'backup.export' }); assert.equal(exported.ok, true);
  return { config, store, controller, created, bytes: exported.backupBytes };
}
// Execute the actual two UI handlers with render-only hook stubs. This proves their command ordering,
// using the real encrypted controller below; DOM/IndexedDB/browser qualification remains separate.
async function mountedUi(env, file) {
  const source = await readFile(new URL('../src/localnet/LocalnetRoot.tsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('type Send =')).replace('export function LocalnetRoot', 'function LocalnetRoot');
  const emitted = (await transformWithOxc(body, 'LocalnetRoot.tsx', { lang: 'tsx', jsx: { runtime: 'classic', pragma: 'jsx' } })).code;
  let latest = env.created.snapshot;
  const calls = [], client = {
    snapshot: () => latest,
    request(command) {
      calls.push(command.type);
      client.lastRequest = env.controller.dispatch(structuredClone(command)).then(result => { latest = result.snapshot; return result; });
      return client.lastRequest;
    },
  };
  let states = [env.config, latest, '', null, false, Date.now()], stateAt = 0, refAt = 0;
  const refs = [{ current: client }, { current: false }, { current: 0 }];
  const context = {
    useState: () => [states[stateAt++], () => {}], useRef: () => refs[refAt++] ?? { current: null }, useEffect() {},
    MAX_BACKUP_BYTES, Uint8Array, Date, runLocalnetUiCommand, LOCALNET_BANNER: 'Local test fixture', React: { Fragment: 'fragment' },
    jsx: (type, props, ...children) => ({ type, props: { ...props, children } }), setTimeout,
  };
  runInNewContext(`${emitted}\nglobalThis.Root = LocalnetRoot;`, context);
  const find = (node, predicate) => {
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  const root = context.Root(), panel = find(root, node => node.type?.name === 'BackupPanel');
  states = [PASS, DEST, file, '', false]; stateAt = 0;
  const rendered = panel.type(panel.props), form = find(rendered, node => node.type === 'form');
  return { client, calls, submit: () => form.props.onSubmit({ preventDefault() {} }), send: panel.props.send,
    workerSnapshot: snapshot => { latest = snapshot; } };
}

for (const interruption of ['lock', 'worker idle lock']) test(`pending backup file read cannot restore after ${interruption}`, async () => {
  const env = await fixture(), read = deferred(), started = deferred(), raw = env.bytes.slice();
  try {
    const ui = await mountedUi(env, { size: raw.length, arrayBuffer() { started.resolve(); return read.promise; } });
    ui.submit(); await started.promise; assert.deepEqual(ui.calls, []);
    const locked = interruption === 'lock' ? await ui.send({ type: 'profile.lock' }) : await env.controller.dispatch({ type: 'profile.lock' });
    assert.equal(locked.snapshot.phase, 'locked'); ui.workerSnapshot(locked.snapshot);
    read.resolve(raw.buffer); await turn(); await turn(); await ui.client.lastRequest;
    assert.equal(ui.calls.includes('backup.restore'), false, 'the stale file continuation must never dispatch restore');
    assert.equal(env.controller.snapshot().phase, 'locked'); assert.equal(env.store.rows.size, 1);
    assert.equal(raw.every(byte => byte === 0), true, 'discard the file bytes after cancellation');
  } finally { read.resolve(raw.buffer); env.controller.dispose(); }
});

test('current backup file read restores through the real encrypted controller into a fresh profile', async () => {
  const env = await fixture(), read = deferred(), started = deferred(), raw = env.bytes.slice();
  try {
    const ui = await mountedUi(env, { size: raw.length, arrayBuffer() { started.resolve(); return read.promise; } });
    ui.submit(); await started.promise; assert.deepEqual(ui.calls, []);
    read.resolve(raw.buffer); await turn(); await turn(); const restored = await ui.client.lastRequest; await turn();
    assert.deepEqual(ui.calls, ['backup.restore']); assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.notEqual(restored.snapshot.profileId, env.created.snapshot.profileId);
    assert.equal(restored.snapshot.publicKey, env.created.snapshot.publicKey); assert.equal(env.store.rows.size, 2);
    assert.equal(raw.every(byte => byte === 0), true);
  } finally { read.resolve(raw.buffer); env.controller.dispose(); }
});
