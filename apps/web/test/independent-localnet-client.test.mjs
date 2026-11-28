import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalnetClient } from '../src/localnet/client.ts';
import { createLocalnetWalletBridge } from '../src/localnet/wallet-bridge.ts';

const privateSnapshot = () => ({
  version: 1, phase: 'ready', profileIds: ['11'.repeat(16)], profileId: '11'.repeat(16),
  publicKey: '22'.repeat(32), wallet: { account: `0x${'33'.repeat(20)}`, chainId: '31337' },
  relay: 'open', ads: [], sessions: [], review: null, error: null,
  trades: [{ id: '44'.repeat(32), paymentInstructions: 'PRIVATE payment instructions', chat: [] }],
});
function setup() {
  const listeners = new Map(), posted = [];
  const worker = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); },
    postMessage(message) { posted.push(structuredClone(message)); }, terminate() {},
    emit(message) { listeners.get('message')?.({ data: structuredClone(message) }); },
  };
  const provider = { on() {}, removeListener() {}, request: async () => { throw new Error('unexpected wallet call'); } };
  const client = createLocalnetClient({ ReleaseEnabled: 0, network: { chainIdentity: '31337' } }, provider,
    { createWorker: () => worker, lifecycle: false });
  return { client, worker, posted };
}
async function open({ client, worker, posted }) {
  const opening = client.request({ type: 'profile.unlock', profileId: '11'.repeat(16), passphrase: 'synthetic' });
  worker.emit({ kind: 'result', id: posted.at(-1).id, result: { ok: true, snapshot: privateSnapshot() } });
  assert.equal((await opening).ok, true);
  assert.equal(client.snapshot().profileId, '11'.repeat(16));
}

test('independent review: locking redacts the document projection before worker acknowledgement', async () => {
  const env = setup(), { client } = env;
  await open(env);
  const locking = client.request({ type: 'profile.lock' });
  try {
    assert.equal(client.snapshot().profileId, null);
    assert.deepEqual(client.snapshot().trades, []);
  } finally { client.dispose(); await locking; }
});

test('independent review: a pre-lock worker snapshot cannot republish private data while locking', async () => {
  const env = setup(), { client, worker } = env;
  await open(env);
  const locking = client.request({ type: 'profile.lock' });
  try {
    // This message was posted before the Worker received the lock, but delivered afterwards.
    worker.emit({ kind: 'snapshot', snapshot: privateSnapshot() });
    assert.equal(client.snapshot().profileId, null);
    assert.deepEqual(client.snapshot().trades, []);
  } finally { client.dispose(); await locking; }
});

test('independent review: a review cannot grant a signing method outside the bridge protocol', async () => {
  const sent = [];
  const bridge = createLocalnetWalletBridge({ request: async request => { sent.push(request); return 'signature'; } }, () => 0);
  const unexpected = { method: 'personal_sign', params: ['0x01', `0x${'33'.repeat(20)}`] };
  try {
    try { bridge.beginReview({ id: '55'.repeat(16), action: 'offer', expiresAtMs: 30_000, fields: [], walletRequests: [unexpected] }); }
    catch { assert.equal(sent.length, 0); return; }
    await assert.rejects(bridge.request(unexpected));
    assert.equal(sent.length, 0);
  } finally { bridge.dispose(); }
});

test('independent review: invalidation from a provider request getter prevents the physical prompt', async () => {
  let sent = 0, bridge;
  const provider = { get request() { bridge.revoke(); return async () => { sent++; return 'signature'; }; } };
  bridge = createLocalnetWalletBridge(provider, () => 0);
  const expected = { method: 'eth_signTypedData_v4', params: [`0x${'33'.repeat(20)}`, '{}'] };
  bridge.beginReview({ id: '66'.repeat(16), action: 'offer', expiresAtMs: 30_000, fields: [], walletRequests: [expected] });
  try { await assert.rejects(bridge.request(expected)); assert.equal(sent, 0); }
  finally { bridge.dispose(); }
});

test('independent review: only the current explicit opening result can restore a private projection', async () => {
  const { client, worker, posted } = setup();
  try {
    const opening = client.request({ type: 'profile.unlock', profileId: '11'.repeat(16), passphrase: 'synthetic' });
    const openId = posted.at(-1).id;
    worker.emit({ kind: 'snapshot', snapshot: privateSnapshot() });
    assert.equal(client.snapshot().profileId, null);
    worker.emit({ kind: 'result', id: openId, result: { ok: true, snapshot: privateSnapshot() } });
    assert.equal((await opening).ok, true);
    assert.equal(client.snapshot().profileId, '11'.repeat(16));

    const oldStatus = client.request({ type: 'status' }), statusId = posted.at(-1).id;
    const locking = client.request({ type: 'profile.lock' }), lockId = posted.at(-1).id;
    assert.equal((await oldStatus).ok, false, 'lock cancels document jobs from the prior profile epoch');
    worker.emit({ kind: 'result', id: statusId, result: { ok: true, snapshot: privateSnapshot() } });
    assert.equal(client.snapshot().profileId, null);
    worker.emit({ kind: 'result', id: lockId, result: { ok: true, snapshot: client.snapshot() } });
    assert.equal((await locking).ok, true);
    worker.emit({ kind: 'snapshot', snapshot: privateSnapshot() });
    assert.equal(client.snapshot().profileId, null, 'unsolicited snapshots cannot reopen a locked projection');
    assert.equal((await client.request({ type: 'wallet.connect' })).ok, false);
  } finally { client.dispose(); }
});

test('independent review: lock supersedes a queued opening result', async () => {
  const { client, worker, posted } = setup();
  try {
    const opening = client.request({ type: 'profile.unlock', profileId: '11'.repeat(16), passphrase: 'synthetic' });
    const openId = posted.at(-1).id;
    const locking = client.request({ type: 'profile.lock' }), lockId = posted.at(-1).id;
    worker.emit({ kind: 'result', id: openId, result: { ok: true, snapshot: privateSnapshot() } });
    assert.equal((await opening).ok, false);
    assert.equal(client.snapshot().profileId, null);
    worker.emit({ kind: 'result', id: lockId, result: { ok: true, snapshot: client.snapshot() } });
    assert.equal((await locking).ok, true);
  } finally { client.dispose(); }
});

test('independent review: a full document command queue cannot prevent a lock command', async () => {
  const { client, worker, posted } = setup();
  try {
    const reads = Array.from({ length: 8 }, () => client.request({ type: 'status' }));
    assert.equal((await client.request({ type: 'status' })).code, 'BUSY');
    const locking = client.request({ type: 'profile.lock' });
    assert.equal(posted.at(-1).command.type, 'profile.lock');
    worker.emit({ kind: 'result', id: posted.at(-1).id, result: { ok: true, snapshot: client.snapshot() } });
    assert.equal((await locking).ok, true);
    assert.ok((await Promise.all(reads)).every(result => !result.ok && result.code === 'LOCKED'));
  } finally { client.dispose(); }
});
