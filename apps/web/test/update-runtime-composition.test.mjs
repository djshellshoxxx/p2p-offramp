import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startAppServices } from '../src/app-services.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { SessionTransportPolicy } from '../../../packages/transport/src/policy.ts';
import { createAssetUpdateController } from '../../../packages/security/src/release-update.ts';
import { locatorFixture } from '../../../packages/security/test/lib/locator-fixture.mjs';
import { encode } from '../../../packages/security/test/lib/release-fixture.mjs';

// Ordinary local composition qualification. The vault, Worker endpoint, runtime,
// update controller, transport broker and signature checks are maintained code.
// Wallet ownership, accepted state, HTTP bytes and destination observation are
// explicit fixture ports. This is not a native Worker/IndexedDB/browser journey.
const vaultFixture = JSON.parse(await readFile(new URL('../../../packages/storage/test/fixtures/vault-python-v1.json', import.meta.url)));
const clone = value => structuredClone(value);
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let priorSecure, priorFetch, externalFetchCalls;
beforeEach(() => {
  priorSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  priorFetch = globalThis.fetch; externalFetchCalls = 0;
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  globalThis.fetch = async () => { externalFetchCalls++; throw new Error('No external fetch belongs to this fixture.'); };
});
afterEach(() => {
  globalThis.fetch = priorFetch;
  if (priorSecure) Object.defineProperty(globalThis, 'isSecureContext', priorSecure);
  else delete globalThis.isSecureContext;
  assert.equal(externalFetchCalls, 0);
});

class VaultStore {
  rows = new Map([[vaultFixture.envelope.profileId, clone(vaultFixture.envelope)]]);
  writes = 0;
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(envelope, options) {
    options?.assertCurrent?.();
    if (this.rows.has(envelope.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(envelope.profileId, clone(envelope)); this.writes++;
  }
  async compareAndSwap(before, after, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
    this.rows.set(after.profileId, clone(after)); this.writes++;
  }
  subscribeInvalidation() { return () => {}; }
}

class EndpointPort extends EventTarget {
  endpoint; sent = []; responses = []; gates = []; terminated = 0;
  constructor(events) { super(); this.events = events; }
  postMessage(input) {
    const command = clone(input); this.sent.push(command);
    this.events.push('request:' + command.operation);
    queueMicrotask(() => void this.endpoint.dispatch(command));
  }
  receive(input) {
    const message = clone(input); this.responses.push(message);
    const gate = message.kind === 'response' && this.gates.find(item => !item.message && item.operation === message.operation);
    if (gate) { gate.message = message; gate.seen.resolve(message); }
    else this.deliver(message);
  }
  deliver(message, afterDelivery = () => {}) {
    queueMicrotask(() => {
      if (message.kind === 'response') this.events.push('ack:' + message.operation);
      this.dispatchEvent(new MessageEvent('message', { data: clone(message) })); afterDelivery();
    });
  }
  holdNextResponse(operation) {
    const gate = { operation, seen: deferred(), message: null };
    this.gates.push(gate);
    return {
      seen: gate.seen.promise,
      release: (afterDelivery = () => {}) => {
        const index = this.gates.indexOf(gate);
        if (index === -1) return;
        this.gates.splice(index, 1);
        if (gate.message) this.deliver(gate.message, afterDelivery);
      },
    };
  }
  releaseAll() {
    const gates = this.gates.splice(0);
    for (const gate of gates) if (gate.message) this.deliver(gate.message);
  }
  terminate() { this.terminated++; this.endpoint.dispose(); }
}

async function world() {
  const events = [], vaultStore = new VaultStore();
  const vault = new EncryptedVaultService(vaultStore, crypto, { lifecycle: false });
  const backup = new EncryptedBackupService(vaultStore), port = new EndpointPort(events);
  port.endpoint = createVaultWorkerEndpoint(message => port.receive(message), { createServices: () => ({ vault, backup }) });
  const services = value(await startAppServices({ createWorker: () => port, lifecycle: false }));
  const corpus = locatorFixture(), release = corpus.release;
  const destination = `https://${corpus.locator.cid}.ipfs.fixture.test/`;
  const endpoints = new Map(), payloads = new Map();
  const state = { stored: null, floorWrites: 0, walletHeld: false, walletConnected: true,
    disconnects: 0, releases: 0, destinations: [], localFetches: 0, afterAdvance: async () => {} };
  const endpoint = (id, url, bytes) => { endpoints.set(id, url); payloads.set(url, bytes); return { endpointId: id, url }; };
  const locator = endpoint('locator', 'https://updates.fixture.test/locator', corpus.bytes);
  const locatorEnvelope = endpoint('locator-envelope', 'https://updates.fixture.test/locator-envelope', encode(JSON.stringify(corpus.envelope)));
  const manifest = endpoint('manifest', destination + 'release.json', release.bytes);
  const manifestEnvelope = endpoint('manifest-envelope', destination + 'release-envelope.json', encode(JSON.stringify(release.envelope)));
  const assets = release.assets.map((asset, index) => endpoint('asset-' + index, destination + asset.path, asset.bytes));
  const registry = {
    inspect: () => ({ channel: 'update', coverage: 'direct', adapterId: 'fixture', expiresAt: 1_000_000 }),
    subscribeInvalidation: () => () => {},
    capture(request, owner) {
      const url = endpoints.get(request.endpointId); if (!url) return null;
      return { owner, current: candidate => candidate === owner,
        snapshot: () => ({ version: 1, request, endpoint: { id: request.endpointId, channel: 'update', url,
          adapterId: 'fixture', methods: ['read'] }, evidence: this.inspect(), directConsent: true }),
        subscribeInvalidation: () => () => {}, dispose() {} };
    },
  };
  const transport = new SessionTransportPolicy({ trustedRegistry: registry, now: () => 0 });
  const controller = createAssetUpdateController({
    trust: { keyId: release.keyId, key: release.key, channel: 'fixture-beta', storageSchema: 1,
      gateway: 'https://ipfs.fixture.test/', current: { sequence: 1, manifestSha256: '0'.repeat(64) } },
    source: { locator, locatorEnvelope,
      resolve(_cid, kind, path) { return kind === 'manifest' ? manifest : kind === 'manifest-envelope' ? manifestEnvelope : assets[release.assets.findIndex(asset => asset.path === path)]; },
      destination: () => destination },
    transport,
    fetch: async (url, init) => {
      state.localFetches++;
      assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit'); assert.equal(init.referrerPolicy, 'no-referrer');
      const bytes = payloads.get(url); assert.ok(bytes, 'only an exact fixture endpoint is readable');
      return { ok: true, redirected: false, url, headers: new Headers({ 'content-length': String(bytes.length) }),
        body: new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array(bytes)); stream.close(); } }) };
    },
    acceptedStore: {
      async read() { return state.stored; },
      async advance(expected, next, _signal, current) {
        current();
        if (JSON.stringify(expected) !== JSON.stringify(state.stored)) return 'conflict';
        state.stored = clone(next); state.floorWrites++; events.push('floor:write');
        await state.afterAdvance(); return 'written';
      },
      close() {},
    },
    owner: { current: () => true, subscribeInvalidation: () => () => {}, isUserGesture: () => true },
    // The facade already implements the maintained UpdateBackupSelection shape.
    // No selection-scope approximation or imported backup receipt is involved.
    backup: { capture: services.captureBackupSelection },
    walletQuiescence: {
      acquire() {
        if (state.walletHeld) return null;
        state.walletHeld = true; events.push('wallet:acquire');
        return { current: () => state.walletHeld,
          async disconnect() { state.walletConnected = false; state.disconnects++; events.push('wallet:disconnect'); },
          release() { state.walletHeld = false; state.releases++; events.push('wallet:release'); } };
      },
    },
    navigation: {
      openVerifiedDestination(url) {
        assert.equal(url, destination); assert.deepEqual(services.current, { state: 'locked' });
        assert.equal(state.walletConnected, false); assert.equal(state.walletHeld, true);
        assert.equal(state.stored?.sequence, release.manifest.sequence);
        state.destinations.push(url); events.push('destination:observe');
      },
    },
    monotonicNow: () => 0, nowSeconds: () => 1500,
  });
  const open = async () => value(await services.unlock(vaultFixture.envelope.profileId, vaultFixture.passphrase));
  const exported = async () => value(await services.exportEncrypted(vaultFixture.envelope.profileId)).bytes;
  const verified = async () => { await open(); return value(await services.verifyBackup(await exported(), vaultFixture.passphrase)); };
  const candidate = async () => {
    const result = await controller.checkForUpdate(); assert.equal(result.kind, 'candidate', JSON.stringify(result));
    assert.equal(result.review.releaseEnabled, false); assert.equal(result.review.destination, destination);
    return result.candidate;
  };
  return { events, vaultStore, port, services, state, controller, open, exported, verified, candidate,
    checks: () => port.sent.filter(command => command.operation === 'checkBackupVerification').length,
    locks: () => port.sent.filter(command => command.operation === 'lock').length,
    async close() {
      controller.cancel(); port.releaseAll(); await controller.dispose(); await services.dispose(); transport.dispose();
    } };
}

const noTransition = s => {
  assert.equal(s.state.floorWrites, 0); assert.equal(s.state.stored, null);
  assert.equal(s.state.disconnects, 0); assert.equal(s.locks(), 0); assert.deepEqual(s.state.destinations, []);
};
const retainedFloor = s => {
  assert.equal(s.state.floorWrites, 1); assert.equal(s.state.stored.sequence, 2);
  assert.deepEqual(s.state.destinations, []);
};

for (const selection of ['locked', 'export-only', 'failed-verification']) {
  test(`runtime-backed acceptance refuses ${selection} before floor or transition effects`, async () => {
    const s = await world();
    try {
      if (selection !== 'locked') {
        await s.open(); const bytes = await s.exported();
        if (selection === 'failed-verification') {
          const failed = await s.services.verifyBackup(bytes, 'different fixture passphrase');
          assert.equal(failed.ok, false); assert.equal(failed.error.code, 'AUTHENTICATION_FAILED');
        }
      }
      const result = await s.controller.acceptUpdate(await s.candidate());
      assert.deepEqual(result, { ok: false, error: { code: 'BACKUP_REQUIRED' } });
      assert.equal(s.checks(), selection === 'locked' ? 0 : 1); noTransition(s);
      assert.equal(s.state.walletHeld, false); assert.equal(s.state.releases, 1); assert.equal(s.vaultStore.writes, 0);
    } finally { await s.close(); }
  });
}

test('verified runtime acceptance performs two fresh Worker checks and its acknowledged lock before destination observation', async () => {
  const s = await world();
  try {
    const receipt = await s.verified(), before = clone(s.vaultStore.rows.get(vaultFixture.envelope.profileId));
    assert.equal(receipt.revision, before.revision);
    const selected = await s.candidate(), start = s.events.length;
    const result = await s.controller.acceptUpdate(selected);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.value.releaseEnabled, false);
    assert.equal(s.checks(), 2); assert.equal(s.state.floorWrites, 1); assert.equal(s.locks(), 1);
    assert.equal(s.state.disconnects, 1); assert.equal(s.state.destinations.length, 1); assert.equal(s.state.walletHeld, false);
    assert.deepEqual(s.events.slice(start), ['wallet:acquire', 'request:checkBackupVerification', 'ack:checkBackupVerification',
      'floor:write', 'request:checkBackupVerification', 'ack:checkBackupVerification', 'wallet:disconnect',
      'request:lock', 'ack:lock', 'destination:observe', 'wallet:release']);
    assert.deepEqual(s.vaultStore.rows.get(vaultFixture.envelope.profileId), before, 'accepted-state writing and locking do not rewrite vault ciphertext');
    assert.equal(s.vaultStore.writes, 0);
    const replay = await s.controller.acceptUpdate(selected);
    assert.deepEqual(replay, { ok: false, error: { code: 'UPDATE_UNTRUSTED' } }); assert.equal(s.state.destinations.length, 1);
  } finally { await s.close(); }
});

test('a normal vault mutation between fresh checks refuses continuation while retaining the recorded floor', async () => {
  const s = await world();
  try {
    const receipt = await s.verified();
    s.state.afterAdvance = async () => { value(await s.services.saveTermsReview('file', new Uint8Array([1]))); };
    const result = await s.controller.acceptUpdate(await s.candidate());
    assert.deepEqual(result, { ok: false, error: { code: 'BACKUP_REQUIRED' } });
    assert.equal(s.checks(), 2); assert.equal(s.vaultStore.writes, 1);
    assert.equal(s.vaultStore.rows.get(vaultFixture.envelope.profileId).revision, receipt.revision + 1);
    retainedFloor(s); assert.equal(s.state.disconnects, 0); assert.equal(s.locks(), 0);
    assert.deepEqual(s.services.current, { state: 'unlocked' }); assert.equal(s.state.walletHeld, false);
  } finally { await s.close(); }
});

for (const operation of ['unlock', 'create']) {
  test(`an admitted ${operation} after the first check retires acceptance before its late opening reply`, async () => {
    const s = await world(), written = deferred(), resume = deferred(); let opening;
    try {
      await s.verified(); const gate = s.port.holdNextResponse(operation);
      s.state.afterAdvance = async () => { written.resolve(); await resume.promise; };
      const pending = s.controller.acceptUpdate(await s.candidate()); await written.promise;
      opening = operation === 'unlock'
        ? s.services.unlock(vaultFixture.envelope.profileId, vaultFixture.passphrase)
        : s.services.create('new composed fixture passphrase');
      await gate.seen; assert.deepEqual(s.services.current, { state: 'locked' });
      resume.resolve();
      assert.deepEqual(await pending, { ok: false, error: { code: 'BACKUP_REQUIRED' } });
      retainedFloor(s); assert.equal(s.checks(), 1); assert.equal(s.state.disconnects, 0); assert.equal(s.locks(), 0);
      gate.release(); value(await opening); await turn();
      retainedFloor(s); assert.deepEqual(s.services.current, { state: 'unlocked' }); assert.equal(s.state.walletHeld, false);
    } finally { resume.resolve(); s.port.releaseAll(); await opening; await s.close(); }
  });
}

test('destination observation waits for the actual own-lock acknowledgment', async () => {
  const s = await world();
  try {
    await s.verified(); const gate = s.port.holdNextResponse('lock');
    const pending = s.controller.acceptUpdate(await s.candidate());
    const message = await gate.seen;
    assert.equal(message.result.ok, true); assert.equal(message.result.value.state, 'locked');
    assert.deepEqual(s.services.current, { state: 'locked' }); assert.equal(s.checks(), 2);
    retainedFloor(s); assert.equal(s.state.disconnects, 1); assert.equal(s.state.walletHeld, true);
    let completed = false; void pending.then(() => { completed = true; }); await turn(); assert.equal(completed, false);
    gate.release(); const result = await pending; assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(s.state.destinations.length, 1); assert.equal(s.state.walletHeld, false);
  } finally { await s.close(); }
});

test('a competing lock retires a held own-lock transition and its late acknowledgment cannot resume acceptance', async () => {
  const s = await world();
  try {
    await s.verified(); const gate = s.port.holdNextResponse('lock');
    const pending = s.controller.acceptUpdate(await s.candidate()); await gate.seen;
    value(await s.services.lock());
    assert.deepEqual(await pending, { ok: false, error: { code: 'UNAVAILABLE' } });
    retainedFloor(s); assert.equal(s.locks(), 2); assert.equal(s.state.disconnects, 1);
    gate.release(); await turn(); retainedFloor(s);
    assert.deepEqual(s.services.current, { state: 'locked' }); assert.equal(s.state.walletHeld, false);
  } finally { await s.close(); }
});

test('a new selection admitted immediately after acknowledgment retires the old own-lock continuation', async () => {
  const s = await world(); let opening;
  try {
    await s.verified(); const lockGate = s.port.holdNextResponse('lock');
    const pending = s.controller.acceptUpdate(await s.candidate()); await lockGate.seen;
    const openGate = s.port.holdNextResponse('unlock');
    // Deliver the real acknowledgment first: an opening sent while the lock
    // request remains pending would be BUSY and would not be an admitted change.
    lockGate.release(() => { opening = s.services.unlock(vaultFixture.envelope.profileId, vaultFixture.passphrase); });
    assert.deepEqual(await pending, { ok: false, error: { code: 'UNAVAILABLE' } });
    await openGate.seen;
    retainedFloor(s); assert.equal(s.checks(), 2); assert.equal(s.locks(), 1); assert.equal(s.state.disconnects, 1);
    openGate.release(); value(await opening); await turn();
    retainedFloor(s); assert.deepEqual(s.services.current, { state: 'unlocked' }); assert.equal(s.state.walletHeld, false);
  } finally { s.port.releaseAll(); await opening; await s.close(); }
});

test('cancelling a held own-lock attempt keeps its recorded floor and cannot publish a late successful transition', async () => {
  const s = await world();
  try {
    await s.verified(); const gate = s.port.holdNextResponse('lock');
    const pending = s.controller.acceptUpdate(await s.candidate()); await gate.seen;
    s.controller.cancel(); assert.deepEqual(await pending, { ok: false, error: { code: 'CANCELLED' } });
    retainedFloor(s); assert.equal(s.state.walletHeld, true, 'the controlled wallet port is released only after the outstanding lock call settles');
    assert.deepEqual(await s.controller.checkForUpdate(), { kind: 'unreachable', reason: 'BUSY' });
    gate.release(); await s.controller.dispose();
    retainedFloor(s); assert.equal(s.state.walletHeld, false); assert.equal(s.state.releases, 1);
    assert.deepEqual(s.services.current, { state: 'locked' });
  } finally { await s.close(); }
});

test('cancelling the first fresh Worker check rejects its later valid response before any floor or destination effect', async () => {
  const s = await world();
  try {
    await s.verified(); const gate = s.port.holdNextResponse('checkBackupVerification');
    const pending = s.controller.acceptUpdate(await s.candidate());
    const message = await gate.seen; assert.ok(message.result.value.verification);
    s.controller.cancel(); assert.deepEqual(await pending, { ok: false, error: { code: 'CANCELLED' } });
    gate.release(); await s.controller.dispose(); await turn();
    assert.equal(s.checks(), 1); assert.equal(s.state.floorWrites, 0); assert.equal(s.state.stored, null);
    assert.equal(s.state.disconnects, 0); assert.deepEqual(s.state.destinations, []);
    assert.deepEqual(s.services.current, { state: 'locked' }); assert.equal(s.state.walletHeld, false);
    assert.equal(s.locks(), 1, 'the existing runtime cancellation sends its protective lock');
  } finally { await s.close(); }
});
