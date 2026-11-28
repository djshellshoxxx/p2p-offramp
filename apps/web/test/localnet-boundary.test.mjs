import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLocalnetWalletBridge } from '../src/localnet/wallet-bridge.ts';
import { parseLocalnetCommand } from '../src/localnet/validation.ts';
import { createLocalnetRelayRoute, LOCALNET_RELAY_ENDPOINT } from '../src/localnet/relay-route.ts';
import { LocalnetController } from '../src/localnet/controller.ts';
import { localnetConfigDocument, parseLocalnetConfig } from '../src/localnet/config.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';

const PASS = 'public synthetic localnet boundary test passphrase';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const request = { method: 'eth_signTypedData_v4', params: [`0x${'11'.repeat(20)}`, '{"primaryType":"TradeTerms"}'] };
const review = (requests = [request], expiresAtMs = 30_000) => ({ id: '11'.repeat(16), action: 'offer', expiresAtMs, fields: [], walletRequests: requests });
function memoryStore() {
  const rows = new Map();
  return { rows,
    async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); if (rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) { options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
      if (JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT'); rows.set(after.profileId, structuredClone(after)); },
    async listProfileIds() { return { profileIds: [...rows.keys()], truncated: false }; }, subscribeInvalidation: () => () => {},
  };
}
async function config() {
  const registryJson = await readFile(new URL('../../../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url), 'utf8');
  const raw = JSON.parse(registryJson), runtime = raw.networks[0].deployments[0].runtime.keccak256;
  return parseLocalnetConfig(localnetConfigDocument({ registryJson, registrySha256: createHash('sha256').update(registryJson).digest('hex'),
    escrowLayouts: { [runtime]: 'canonical-get-trade-v1' }, relayUrl: 'ws://127.0.0.1:18501/' }));
}
const provider = () => ({ request: async () => { throw new Error('Unexpected wallet access.'); }, on() {}, removeListener() {} });

test('localnet bridge refuses signatures, sends and account prompts without the corresponding explicit grant', async () => {
  let calls = 0; const bridge = createLocalnetWalletBridge({ request: async () => { calls++; } }, () => 0);
  for (const candidate of [request, { method: 'eth_sendTransaction', params: [{}] }, { method: 'eth_requestAccounts' }, { method: 'personal_sign' }]) await assert.rejects(bridge.request(candidate));
  assert.equal(calls, 0); bridge.dispose();
});
test('localnet review snapshots exact payloads, consumes a finite queue, and cannot authorize a changed transaction', async () => {
  const sent = [], bridge = createLocalnetWalletBridge({ request: async candidate => { sent.push(candidate); return 'signature'; } }, () => 0);
  const mutable = structuredClone(request), end = bridge.beginReview(review([mutable, request])); mutable.params[1] = 'changed';
  await assert.rejects(bridge.request(mutable)); assert.equal(sent.length, 0);
  assert.equal(await bridge.request(request), 'signature'); assert.equal(await bridge.request(request), 'signature');
  await assert.rejects(bridge.request(request)); assert.equal(sent.length, 2); end(); bridge.dispose();
});
test('physical wallet prompt remains exclusive after revocation until the provider settles', async () => {
  const wait = deferred(); let calls = 0; const bridge = createLocalnetWalletBridge({ request: async () => { calls++; return wait.promise; } }, () => 0);
  bridge.beginReview(review()); const signing = bridge.request(request); bridge.revoke();
  assert.throws(() => bridge.beginConnect()); assert.throws(() => bridge.beginReview(review()));
  wait.resolve('late-signature'); await assert.rejects(signing); assert.equal(calls, 1);
  const finish = bridge.beginConnect(); await bridge.request({ method: 'eth_requestAccounts' }); finish(); assert.equal(calls, 2); bridge.dispose();
});
test('review expiry and cancellation cannot be refreshed by read-only calls', async () => {
  let now = 1; const calls = [], bridge = createLocalnetWalletBridge({ request: async candidate => { calls.push(candidate.method); return '0x7a69'; } }, () => now);
  bridge.beginReview(review([request], 10)); await bridge.request({ method: 'eth_chainId' }); now = 10;
  await assert.rejects(bridge.request(request)); assert.deepEqual(calls, ['eth_chainId']); bridge.revoke();
  assert.throws(() => bridge.beginReview(review([request], 10))); bridge.dispose();
});
test('localnet command schema refuses raw vault/wallet operations, accessor payloads and unbounded input', () => {
  for (const command of [{ type: 'vault.read', recordId: '11'.repeat(16) }, { type: 'wallet.request', method: 'eth_sendTransaction' },
    { type: 'status', secret: true }, { type: 'profile.create', passphrase: 'x'.repeat(1025) },
    { type: 'review.prepare', action: 'offer', sessionId: 'session', fiatMinorUnits: '1', fiatScale: 2, paymentInstructions: 'x', acceptForSeconds: 60 }]) assert.throws(() => parseLocalnetCommand(command));
  let accessed = false;
  assert.throws(() => parseLocalnetCommand({ type: 'profile.create', get passphrase() { accessed = true; return PASS; } })); assert.equal(accessed, false);
  assert.deepEqual(parseLocalnetCommand({ type: 'review.prepare', action: 'release', tradeId: 'aa'.repeat(32), fiatReceiptConfirmed: true }),
    { type: 'review.prepare', action: 'release', tradeId: 'aa'.repeat(32), fiatReceiptConfirmed: true });
});
test('single localnet relay route binds the exact logical URL and only the validated build destination', async () => {
  const calls = [], route = createLocalnetRelayRoute('ws://127.0.0.1:18501/', () => true, (url, signal) => { calls.push(url); return { close() {}, send() {}, signal }; });
  const permit = route.broker.authorize({ channel: 'relay', endpointId: LOCALNET_RELAY_ENDPOINT.endpointId, method: 'read' });
  assert.equal(route.broker.capture(permit, { expectedURL: 'wss://attacker.example/' }), 'INVALID_ENDPOINT');
  assert.throws(() => route.connect('wss://attacker.example/', new AbortController().signal));
  const allowed = route.broker.authorize({ channel: 'relay', endpointId: LOCALNET_RELAY_ENDPOINT.endpointId, method: 'publish' });
  const scope = route.broker.capture(allowed, { expectedURL: LOCALNET_RELAY_ENDPOINT.url });
  assert.equal((await scope.run(signal => route.connect(LOCALNET_RELAY_ENDPOINT.url, signal))).ok, true);
  assert.deepEqual(calls, ['ws://127.0.0.1:18501/']); assert.equal((await scope.run(() => null)).ok, false);
  route.dispose(); assert.equal(scope.current(), false); assert.equal(route.broker.authorize({ channel: 'relay', endpointId: LOCALNET_RELAY_ENDPOINT.endpointId, method: 'read' }), 'CANCELLED');
});
test('worker-private canonical profile stores only encrypted rows, reopens the same messaging identity, and clears every projection on lock', async () => {
  const store = memoryStore(), controller = new LocalnetController(await config(), provider(), { store, connectRelay() { throw new Error('offline fixture'); } });
  try {
    const created = await controller.dispatch({ type: 'profile.create', passphrase: PASS }); assert.equal(created.ok, true, JSON.stringify(created));
    const { profileId, publicKey } = created.snapshot; assert.match(publicKey, /^[0-9a-f]{64}$/);
    const stored = JSON.stringify([...store.rows.values()]); assert.equal(stored.includes(PASS), false); assert.equal(stored.includes(publicKey), false);
    const locked = await controller.dispatch({ type: 'profile.lock' });
    assert.equal(locked.snapshot.profileId, null); assert.equal(locked.snapshot.publicKey, null); assert.deepEqual(locked.snapshot.trades, []);
    const unlocked = await controller.dispatch({ type: 'profile.unlock', profileId, passphrase: PASS }); assert.equal(unlocked.ok, true, JSON.stringify(unlocked));
    assert.equal(unlocked.snapshot.publicKey, publicKey); assert.equal(unlocked.snapshot.wallet, null);
  } finally { controller.dispose(); }
});
test('fresh-key restore authenticates and rebinds one messaging identity while retaining the original encrypted profile', async () => {
  const store = memoryStore(), controller = new LocalnetController(await config(), provider(), { store, connectRelay() { throw new Error('offline fixture'); } });
  try {
    const created = await controller.dispatch({ type: 'profile.create', passphrase: PASS }); assert.equal(created.ok, true);
    const exported = await controller.dispatch({ type: 'backup.export' }); assert.equal(exported.ok, true);
    const restored = await controller.dispatch({ type: 'backup.restore', bytes: exported.backupBytes, sourcePassphrase: PASS, destinationPassphrase: PASS + ' restored' });
    assert.equal(restored.ok, true, JSON.stringify(restored)); assert.notEqual(restored.restoredProfileId, created.snapshot.profileId);
    assert.equal(restored.snapshot.publicKey, created.snapshot.publicKey); assert.equal(store.rows.size, 2);
    await controller.dispatch({ type: 'profile.lock' });
    const unlocked = await controller.dispatch({ type: 'profile.unlock', profileId: restored.restoredProfileId, passphrase: PASS + ' restored' });
    assert.equal(unlocked.ok, true); assert.equal(unlocked.snapshot.publicKey, created.snapshot.publicKey);
  } finally { controller.dispose(); }
});
test('Worker idle expiry invalidates profile, secret projections and review without relying on a document timer', async () => {
  let time = 0;
  const controller = new LocalnetController(await config(), provider(), { store: memoryStore(), monotonicNow: () => time, connectRelay() { throw new Error('offline fixture'); } });
  try {
    assert.equal((await controller.dispatch({ type: 'profile.create', passphrase: PASS })).ok, true); time = 300_000;
    const result = await controller.dispatch({ type: 'status' }); assert.equal(result.snapshot.phase, 'locked'); assert.equal(result.snapshot.publicKey, null); assert.equal(result.snapshot.review, null);
  } finally { controller.dispose(); }
});
test('lock during pending vault creation prevents a late private session or encrypted profile from being installed', async () => {
  const gate = deferred(), started = deferred(), store = memoryStore(), originalAdd = store.add.bind(store);
  store.add = async (...args) => { started.resolve(); await gate.promise; return originalAdd(...args); };
  const controller = new LocalnetController(await config(), provider(), { store, connectRelay() { throw new Error('offline fixture'); } });
  try {
    const create = controller.dispatch({ type: 'profile.create', passphrase: PASS }); await started.promise;
    await controller.dispatch({ type: 'profile.lock' }); gate.resolve(); const result = await create;
    assert.equal(result.ok, false); assert.equal(result.snapshot.phase, 'locked'); assert.equal(result.snapshot.publicKey, null); assert.equal(store.rows.size, 0);
  } finally { gate.resolve(); controller.dispose(); }
});
