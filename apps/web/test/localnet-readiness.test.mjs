import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transformWithOxc } from 'vite';
import { LocalnetController } from '../src/localnet/controller.ts';
import { createLocalnetWalletBridge } from '../src/localnet/wallet-bridge.ts';
import { world, negotiate, memoryStore, PASS, RESTORED_PASS, until } from './support/localnet-resumption-fixture.mjs';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('restored relay work publishes working before its first held read and respects a reentrant lock', { timeout: 30_000 }, async t => {
  const w = await world(t), tradeId = await negotiate(w);
  const backup = (await w.seller.command({ type: 'backup.export' })).backupBytes;
  w.seller.close();
  // Model a relay that retained no historical messages; the next genuine signed private message is delivered live.
  w.hub.events.length = 0;
  const store = memoryStore(), snapshots = [], entered = deferred(), release = deferred(), locked = deferred();
  const get = store.get.bind(store);
  let holdRead = false, lockOnWorking = false, controller;
  store.get = async (...args) => {
    if (holdRead) { holdRead = false; entered.resolve(); await release.promise; }
    return get(...args);
  };
  const bridge = createLocalnetWalletBridge(w.seller.external, () => w.chain.now * 1000);
  controller = new LocalnetController(w.config, {
    request: request => bridge.request(request), on: w.seller.external.on, removeListener: w.seller.external.removeListener,
  }, { store, now: () => w.chain.now * 1000, connectRelay: w.hub.connect,
    onSnapshot(snapshot) {
      snapshots.push(snapshot);
      if (lockOnWorking && snapshot.phase === 'working') {
        lockOnWorking = false;
        void controller.dispatch({ type: 'profile.lock' }).then(locked.resolve);
      }
    },
  });
  t.after(() => { release.resolve(); bridge.dispose(); controller.dispose(); });
  const beforeRestore = structuredClone(w.chain.counts);
  const restored = await controller.dispatch({ type: 'backup.restore', bytes: backup,
    sourcePassphrase: PASS, destinationPassphrase: RESTORED_PASS });
  assert.equal(restored.ok, true, JSON.stringify(restored));
  await until(() => controller.snapshot().phase === 'ready' && controller.snapshot().relay === 'open');
  assert.deepEqual(w.chain.counts, beforeRestore, 'restore never connects, signs, or sends');
  assert.equal(snapshots.at(-1).phase, 'ready');

  holdRead = true;
  const sent = w.buyer.command({ type: 'chat.send', tradeId, text: 'held relay readiness fixture' });
  await entered.promise;
  try {
    assert.equal(controller.snapshot().phase, 'working');
    assert.equal(snapshots.at(-1).phase, 'working', 'the document must not offer Connect while the relay owner is busy');
    const refused = await controller.dispatch({ type: 'wallet.connect' });
    assert.equal(refused.ok, false); assert.equal(refused.code, 'BUSY');
    assert.deepEqual(w.chain.counts, beforeRestore, 'busy refusal never reaches the wallet');
  } finally { release.resolve(); await sent; }
  await until(() => controller.snapshot().phase === 'ready' && controller.snapshot().trades[0]?.chat.length === 1);
  assert.equal(snapshots.at(-1).phase, 'ready');
  const end = bridge.beginConnect();
  try { assert.equal((await controller.dispatch({ type: 'wallet.connect' })).ok, true); }
  finally { end(); }
  assert.deepEqual(w.chain.counts, { ...beforeRestore, connects: beforeRestore.connects + 1 }, 'only the later explicit connection opens the wallet');

  lockOnWorking = true;
  await w.buyer.command({ type: 'chat.send', tradeId, text: 'lock from the working observer' });
  const lockResult = await locked.promise;
  assert.equal(lockResult.ok, true);
  await until(() => controller.snapshot().phase === 'locked');
  assert.equal(snapshots.at(-1).phase, 'locked');
  assert.equal(snapshots.at(-1).profileId, null);
  assert.deepEqual(snapshots.at(-1).trades, []);
  assert.deepEqual(w.chain.counts, { ...beforeRestore, connects: beforeRestore.connects + 1 });
});

const opened = (profileId = '11'.repeat(16)) => ({ version: 1, phase: 'ready', profileIds: [profileId], profileId,
  publicKey: '22'.repeat(32), wallet: null, relay: 'open', ads: [], sessions: [], trades: [], review: null, error: null });

// Run the actual Worker endpoint with deterministic controller completion. Only its imports are supplied by the fixture.
async function workerCompletion(currentSnapshot) {
  const source = await readFile(new URL('../src/localnet/localnet.worker.ts', import.meta.url), 'utf8');
  const body = source.replace(/^import[^\n]*\n/gm, '');
  const emitted = (await transformWithOxc(body, 'localnet.worker.ts', { lang: 'ts' })).code;
  const listeners = new Map(), messages = [], ready = deferred(), completed = deferred();
  let current = opened();
  class Controller {
    constructor(_config, _provider, options) { this.options = options; ready.resolve(); }
    dispatch(command) {
      const result = { ok: true, snapshot: structuredClone(current) };
      if (command.type !== 'status') {
        current = currentSnapshot();
        this.options.onSnapshot(current);
      }
      return Promise.resolve(result);
    }
    snapshot() { return current; }
    dispose() {}
  }
  const context = { LocalnetController: Controller, loadInjectedLocalnetConfig: async () => ({}), setTimeout, clearTimeout,
    postMessage(message) { const copy = structuredClone(message); messages.push(copy); if (copy.kind === 'result') completed.resolve(copy); },
    addEventListener(type, listener) { listeners.set(type, listener); }, close() {},
  };
  runInNewContext(emitted, context);
  await ready.promise;
  listeners.get('message')({ data: { kind: 'command', id: 1, command: { type: 'backup.restore' } } });
  return { result: (await completed.promise).result, messages };
}

for (const [name, current] of [
  ['relay work began', () => ({ ...opened(), phase: 'working' })],
  ['profile locked', () => ({ ...opened(), phase: 'locked', profileId: null, publicKey: null, relay: 'closed' })],
  ['profile selection changed', () => opened('33'.repeat(16))],
]) test(`Worker result projects current state when ${name} after the command captured its result`, async () => {
  const { result, messages } = await workerCompletion(current);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot, current(), 'an older command result must not overwrite the current projection');
  assert.deepEqual(messages.filter(message => message.kind === 'wallet.request'), []);
});
