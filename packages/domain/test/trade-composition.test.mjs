import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { createTradeAuthority } from '../src/authority.ts';
import { createIntentJournal } from '../src/intent-journal.ts';
import { encodeIntentPayload } from '../../schemas/index.ts';
const api = await import('../src/trade-composition.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

const binding = Object.freeze({ chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-v1', tradeId: 'fixture-trade-01' });
const account = '0x' + '33'.repeat(20);
const intentId = Buffer.alloc(32, 1).toString('base64url');
const prepared = () => ({ version: 1, intentId, binding, account, action: 'fund', state: 'prepared', walletGeneration: 0,
  expectedEscrowState: 'absent', preparedRequest: '{"fixtureOnly":true,"private":"SECRET"}',
  submission: { chain: 'evm', hash: null, nonce: null }, replacementOf: null, createdAt: 1000, updatedAt: 1000 });
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const failure = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /SECRET|https:\/\//); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

class Store {
  rows = new Map(); listeners = new Set(); writes = 0; beforeGet; afterCommit;
  async get(id) { await this.beforeGet?.(); return structuredClone(this.rows.get(id)); }
  async add(row, options) { options?.assertCurrent?.(); assert.equal(this.rows.has(row.profileId), false); this.rows.set(row.profileId, structuredClone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; this.afterCommit?.();
  }
  subscribeInvalidation(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

async function setup(t, options = {}) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = value(await vault.create('local composition fixture passphrase'));
  // Fixture encoding approval is not native ABI, chain, wallet or deployment verification.
  const journal = createIntentJournal({ vault, session, validateCanonical: () => ({ ok: true, value: undefined }) });
  const authority = createTradeAuthority({ binding, generation: 0, walletGeneration: 0,
    readValidated: options.readValidated ?? (async (_binding, request) => ({ ok: true, value: { binding, generation: request.generation,
      requestSequence: request.requestSequence, anchor: { height: '100', hash: '0x' + '34'.repeat(32) },
      state: 'absent', finality: 'finalized', observedAt: 1000 } })) });
  t.after(() => { authority.dispose(); journal.dispose(); vault.dispose(); });
  const compose = (overrides = {}) => {
    assert.equal(typeof api.createTradeComposition, 'function', 'missing private G08/G12 diagnostic composition');
    const service = api.createTradeComposition({ binding, account, authority, journal, now: () => 1000, ...overrides });
    t.after(() => service.dispose());
    return service;
  };
  return { store, vault, session, journal, authority, compose };
}

// Worker/service restart over the same retained encrypted store; not a browser-crash or IndexedDB fixture.
async function reopen(t, previous) {
  previous.authority.dispose(); previous.journal.dispose(); previous.vault.dispose();
  const vault = new EncryptedVaultService(previous.store, crypto, { lifecycle: false });
  const session = value(await vault.unlock(previous.session.profileId, 'local composition fixture passphrase'));
  const journal = createIntentJournal({ vault, session, validateCanonical: () => ({ ok: true, value: undefined }) });
  const authority = createTradeAuthority({ binding, generation: 0, walletGeneration: 0,
    readValidated: async (_binding, request) => ({ ok: true, value: { binding, generation: request.generation,
      requestSequence: request.requestSequence, anchor: { height: '100', hash: 'restart-fixture-anchor' },
      state: 'absent', finality: 'finalized', observedAt: 1000 } }) });
  t.after(() => { authority.dispose(); journal.dispose(); vault.dispose(); });
  return { vault, session, journal, authority, service: previous.compose({ authority, journal }) };
}

async function peerJournal(t, s) {
  const vault = new EncryptedVaultService(s.store, crypto, { lifecycle: false });
  const session = value(await vault.unlock(s.session.profileId, 'local composition fixture passphrase'));
  const journal = createIntentJournal({ vault, session, validateCanonical: () => ({ ok: true, value: undefined }) });
  t.after(() => { journal.dispose(); vault.dispose(); });
  return journal;
}

function holdDiagnosticRead(t, s, point) {
  const entered = deferred(), gate = deferred(); let journal = s.journal;
  t.after(() => gate.resolve());
  if (point === 'before-preflight') {
    let first = true;
    s.store.beforeGet = async () => { if (first) { first = false; entered.resolve(); await gate.promise; } };
  } else {
    // Delay a real vault list result, leaving final durable revision synchronization intact.
    journal = createIntentJournal({ session: s.session, vault: {
      captureSession: (...args) => s.vault.captureSession(...args),
      read: (...args) => s.vault.read(...args), commit: (...args) => s.vault.commit(...args),
      list: async (...args) => { const result = await s.vault.list(...args); entered.resolve(); await gate.promise; return result; },
    } });
    t.after(() => journal.dispose());
  }
  return { entered: entered.promise, pending: s.compose({ journal }).read(), release() { s.store.beforeGet = undefined; gate.resolve(); } };
}

test('composition joins real encrypted journal intent IDs with loading and fresh authority without economic effects', async t => {
  const s = await setup(t), recordId = value(await s.journal.reserve(prepared(), 0)), service = s.compose();
  const storedBefore = structuredClone(s.store.rows), writesBefore = s.store.writes;
  const loading = value(await service.read());
  assert.equal(loading.chain, null); assert.equal(loading.chainHealth, 'loading');
  assert.deepEqual(loading.pendingIntentIds, [intentId]); assert.notEqual(recordId, intentId);
  assert.equal(loading.economicPreparationAllowed, false);
  value(await s.authority.refresh(binding));
  const fresh = value(await service.read());
  assert.equal(fresh.chainHealth, 'fresh'); assert.equal(fresh.chain.state, 'absent');
  assert.deepEqual(fresh.pendingIntentIds, [intentId]); assert.equal(fresh.economicPreparationAllowed, false);
  assert.deepEqual(s.authority.readView(1000).pendingIntentIds, [], 'composition must not rewrite the authority reducer');
  assert.deepEqual(s.store.rows, storedBefore); assert.equal(s.store.writes, writesBefore);
  assert.doesNotMatch(JSON.stringify(fresh), /SECRET|preparedRequest|recordId|privateAgreement|signature/);
  assert.equal(Object.isFrozen(fresh), true); assert.equal(Object.isFrozen(fresh.pendingIntentIds), true);
});

test('composition isolates exact bindings/accounts and projects intent IDs rather than storage IDs', async t => {
  const s = await setup(t), payer = '0x' + 'ab'.repeat(20);
  value(await s.journal.reserve({ ...prepared(), account: payer }, 0));
  value(await s.journal.reserve({ ...prepared(), intentId: Buffer.alloc(32, 2).toString('base64url'),
    binding: { ...binding, tradeId: 'other-trade' } }, 1));
  assert.deepEqual(value(await s.compose({ account: '0x' + 'AB'.repeat(20) }).read()).pendingIntentIds, [intentId]);
  assert.deepEqual(value(await s.compose().read()).pendingIntentIds, []);
  for (const change of [{ chain: 'solana' }, { networkId: 'other-network' }, { deploymentId: 'other-deployment' }, { tradeId: 'other-trade' }]) {
    const changed = { ...binding, ...change };
    const service = s.compose({ binding: changed, account: changed.chain === 'solana' ? '11111111111111111111111111111111' : account });
    failure(await service.read(), 'WRONG_CHAIN');
  }
});

test('a held journal read cannot publish after wallet invalidation, lock, cancellation or disposal', async t => {
  for (const reason of ['wallet', 'lock', 'cancel', 'dispose']) {
    const s = await setup(t), entered = deferred(), gate = deferred(), controller = new AbortController();
    value(await s.journal.reserve(prepared(), 0));
    const service = s.compose();
    s.store.beforeGet = async () => { entered.resolve(); await gate.promise; };
    const pending = service.read(controller.signal); await entered.promise;
    if (reason === 'wallet') assert.equal(s.authority.dispatchLocal({ version: 1, eventId: Buffer.alloc(32, 9).toString('base64url'), binding,
      generation: 0, sequence: 1, observedAt: 1000, source: 'wallet', kind: 'wallet-invalidated', data: { walletGeneration: 1 } }), 'accepted');
    if (reason === 'lock') s.vault.lockAll();
    if (reason === 'cancel') controller.abort();
    if (reason === 'dispose') service.dispose();
    gate.resolve();
    failure(await pending, reason === 'lock' ? 'LOCKED' : 'CANCELLED');
    assert.equal(s.store.rows.get(s.session.profileId).revision, 1, 'a refused read cannot change a persisted intent');
    if (reason === 'dispose') failure(await service.read(), 'CANCELLED');
  }
});

test('a newer read preserves journal single-job conflict and suppresses the late older result without retry', async t => {
  const s = await setup(t), entered = deferred(), gate = deferred(), service = s.compose();
  value(await s.journal.reserve(prepared(), 0));
  s.store.beforeGet = async () => { entered.resolve(); await gate.promise; };
  const oldRead = service.read(); await entered.promise;
  failure(await service.read(), 'CONFLICT');
  gate.resolve(); failure(await oldRead, 'CANCELLED');
  s.store.beforeGet = undefined;
  assert.deepEqual(value(await service.read()).pendingIntentIds, [intentId]);
  assert.equal(s.store.rows.get(s.session.profileId).revision, 1);
});

test('composition rereads current authority and display time after journal await, without fabricating chain time', async t => {
  let now = 1000;
  const s = await setup(t, { readValidated: async (_binding, request) => ({ ok: true, value: { binding,
    generation: request.generation, requestSequence: request.requestSequence, anchor: { height: '100', hash: 'fixture-anchor' },
    state: 'funded', finality: 'confirmed', observedAt: 1000 } }) });
  value(await s.journal.reserve(prepared(), 0));
  const entered = deferred(), gate = deferred(), service = s.compose({ now: () => now });
  s.store.beforeGet = async () => { entered.resolve(); await gate.promise; };
  const pending = service.read(); await entered.promise;
  value(await s.authority.refresh(binding)); s.authority.setFiatClaim('buyer-claims-paid'); now = 31000;
  gate.resolve(); const result = value(await pending);
  assert.equal(result.chain.state, 'funded'); assert.equal(result.chainHealth, 'stale');
  assert.equal(result.fiatClaim, 'buyer-claims-paid'); assert.deepEqual(result.pendingIntentIds, [intentId]);
  assert.equal(result.economicPreparationAllowed, false); assert.equal('chainTimeSeconds' in result, false);
  assert.equal('fundingWindowValid' in result, false);
});

test('journal errors remain fixed failures rather than an empty successful recovery view', async t => {
  const s = await setup(t), service = s.compose();
  value(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: {
    id: 'ab'.repeat(16), kind: 'journal', schemaVersion: 2, payload: 'bm90LWEtc3VwcG9ydGVkLWpvdXJuYWw' } }]));
  failure(await service.read(), 'UNSUPPORTED_VERSION');
  const hostile = s.compose({ journal: { unresolved() { throw Error('SECRET https://private.invalid provider payload'); } } });
  failure(await hostile.read(), 'UNAVAILABLE');
  s.vault.lockAll(); failure(await service.read(), 'LOCKED');
});

test('superseding an old read cannot miss an external abort before the new signal listener is attached', async t => {
  const s = await setup(t), gate = deferred(), external = new AbortController(); let calls = 0;
  const service = s.compose({ journal: { unresolved(_binding, _account, signal) {
    calls++;
    if (calls === 1) { signal.addEventListener('abort', () => external.abort(), { once: true }); return gate.promise; }
    return Promise.resolve({ ok: true, value: [] });
  } } });
  const oldRead = service.read();
  const newerResult = await service.read(external.signal);
  gate.resolve({ ok: true, value: [] }); failure(await oldRead, 'CANCELLED');
  failure(newerResult, 'CANCELLED'); assert.equal(calls, 1, 'already-aborted work must not start a journal read');
});

test('a reentrant read from predecessor cancellation owns the latest result instead of its interrupted caller', async t => {
  const s = await setup(t), gate = deferred(); let calls = 0, nested;
  const service = s.compose({ journal: { unresolved(_binding, _account, signal) {
    calls++;
    if (calls === 1) { signal.addEventListener('abort', () => { nested = service.read(); }, { once: true }); return gate.promise; }
    return Promise.resolve({ ok: true, value: [] });
  } } });
  const oldest = service.read(), interrupted = service.read();
  gate.resolve({ ok: true, value: [] });
  failure(await oldest, 'CANCELLED'); failure(await interrupted, 'CANCELLED');
  assert.deepEqual(value(await nested).pendingIntentIds, []); assert.equal(calls, 2);
});

test('a restarted service discovers the retained prepared intent while restored chain authority starts loading', async t => {
  const s = await setup(t); value(await s.journal.reserve(prepared(), 0));
  value(await s.authority.refresh(binding));
  const originalEnvelope = structuredClone(s.store.rows), writesBefore = s.store.writes;
  const fresh = await reopen(t, s), restored = value(await fresh.service.read());
  assert.equal(restored.chain, null); assert.equal(restored.chainHealth, 'loading');
  assert.deepEqual(restored.pendingIntentIds, [intentId]); assert.equal(restored.economicPreparationAllowed, false);
  assert.equal(value(await fresh.journal.unresolved(binding, account))[0].state, 'prepared');
  failure(await fresh.journal.reserve({ ...prepared(), intentId: Buffer.alloc(32, 2).toString('base64url'), action: 'approve' }, 1), 'CONFLICT');
  assert.deepEqual(s.store.rows, originalEnvelope); assert.equal(s.store.writes, writesBefore);
});

test('an uncertain committed sending marker stays reserved through lock/cancel or lost reply and service restart', async t => {
  for (const reason of ['lock-cancel', 'lost-reply']) {
    const s = await setup(t), controller = new AbortController(); value(await s.journal.reserve(prepared(), 0));
    s.store.afterCommit = () => {
      if (reason === 'lock-cancel') { s.vault.lockAll(); controller.abort(); }
      else throw Error('SECRET https://private.invalid post-commit reply');
    };
    const result = await s.journal.markSending(intentId, controller.signal);
    failure(result, 'BROADCAST_UNKNOWN'); assert.equal(result.error.retryable, false); assert.equal(result.error.action, 'reconcile');
    s.store.afterCommit = undefined;
    const originalEnvelope = structuredClone(s.store.rows), writesBefore = s.store.writes, fresh = await reopen(t, s);
    const restored = value(await fresh.service.read());
    assert.equal(restored.chainHealth, 'loading'); assert.deepEqual(restored.pendingIntentIds, [intentId]);
    assert.equal(restored.economicPreparationAllowed, false);
    assert.equal(value(await fresh.journal.unresolved(binding, account))[0].state, 'broadcast-unknown');
    failure(await fresh.journal.markSending(intentId), 'CONFLICT');
    failure(await fresh.journal.reserve({ ...prepared(), intentId: Buffer.alloc(32, 2).toString('base64url') }, 2), 'CONFLICT');
    assert.deepEqual(s.store.rows, originalEnvelope); assert.equal(s.store.writes, writesBefore);
  }
});

test('serialized terminal journal labels and old clocks cannot remove unresolved diagnostic reservations', async t => {
  const s = await setup(t), states = ['confirmed', 'finalized', 'failed', 'expired', 'replaced', 'reorged'];
  const ids = states.map((_, index) => Buffer.alloc(32, index + 2).toString('base64url'));
  // Deliberately untrusted imported labels, not native observe/reconcile results or normal reservation writes.
  value(await s.vault.commit(s.session.sessionId, 0, states.map((state, index) => ({ op: 'put', record: {
    id: (index + 1).toString(16).padStart(32, '0'), kind: 'journal', schemaVersion: 1,
    payload: encodeIntentPayload({ ...prepared(), intentId: ids[index], state }) } }))));
  const originalEnvelope = structuredClone(s.store.rows), writesBefore = s.store.writes;
  const result = value(await s.compose({ now: () => Number.MAX_SAFE_INTEGER - 1 }).read());
  assert.deepEqual([...result.pendingIntentIds].sort(), [...ids].sort()); assert.equal(result.economicPreparationAllowed, false);
  failure(await s.journal.reserve(prepared(), 1), 'CONFLICT');
  assert.deepEqual(s.store.rows, originalEnvelope); assert.equal(s.store.writes, writesBefore);
});

test('terminal native observations do not silently clear an unreconciled sending intent or permit a retry', async t => {
  for (const state of ['released', 'refunded']) {
    const s = await setup(t, { readValidated: async (_binding, request) => ({ ok: true, value: { binding,
      generation: request.generation, requestSequence: request.requestSequence, anchor: { height: '101', hash: 'terminal-' + state },
      state, finality: 'finalized', observedAt: 1000 } }) });
    value(await s.journal.reserve(prepared(), 0)); value(await s.journal.markSending(intentId));
    const originalEnvelope = structuredClone(s.store.rows), writesBefore = s.store.writes;
    value(await s.authority.refresh(binding)); const result = value(await s.compose().read());
    assert.equal(result.chain.state, state); assert.equal(result.chainHealth, 'fresh');
    assert.deepEqual(result.pendingIntentIds, [intentId]); assert.equal(result.economicPreparationAllowed, false);
    failure(await s.journal.reserve({ ...prepared(), intentId: Buffer.alloc(32, 2).toString('base64url') }, 2), 'CONFLICT');
    assert.deepEqual(s.store.rows, originalEnvelope); assert.equal(s.store.writes, writesBefore);
  }
});

test('reorg conflict and subsequent agreeing native read preserve the same unresolved intent without mutating storage', async t => {
  let observed = { anchor: { height: '100', hash: 'fixture-original' }, state: 'funded', finality: 'confirmed' };
  const s = await setup(t, { readValidated: async (_binding, request) => ({ ok: true, value: {
    binding, generation: request.generation, requestSequence: request.requestSequence, observedAt: 1000, ...observed } }) });
  value(await s.journal.reserve(prepared(), 0)); value(await s.journal.markSending(intentId));
  const originalEnvelope = structuredClone(s.store.rows), writesBefore = s.store.writes, service = s.compose();
  value(await s.authority.refresh(binding)); assert.equal(value(await service.read()).chainHealth, 'fresh');
  observed = { ...observed, anchor: { height: '100', hash: 'fixture-contradiction' }, state: 'absent' };
  failure(await s.authority.refresh(binding), 'INTEGRITY_FAILURE');
  const conflicted = value(await service.read());
  assert.equal(conflicted.chainHealth, 'reorged'); assert.equal(conflicted.chain.state, 'funded');
  assert.deepEqual(conflicted.pendingIntentIds, [intentId]); assert.equal(conflicted.economicPreparationAllowed, false);
  value(await s.authority.refresh(binding)); const agreed = value(await service.read());
  assert.equal(agreed.chainHealth, 'fresh'); assert.equal(agreed.chain.state, 'absent');
  assert.deepEqual(agreed.pendingIntentIds, [intentId]); assert.equal(agreed.economicPreparationAllowed, false);
  failure(await s.journal.markSending(intentId), 'CONFLICT');
  assert.deepEqual(s.store.rows, originalEnvelope); assert.equal(s.store.writes, writesBefore);
});

test('a peer reservation during held preflight or cached empty snapshot cannot publish an empty diagnostic success', async t => {
  for (const point of ['before-preflight', 'after-snapshot']) {
    const s = await setup(t), peer = await peerJournal(t, s), held = holdDiagnosticRead(t, s, point);
    await held.entered;
    value(await peer.reserve(prepared(), 0));
    const committedEnvelope = structuredClone(s.store.rows), writesBefore = s.store.writes;
    held.release(); failure(await held.pending, 'CONFLICT');
    failure(await s.compose().read(), 'LOCKED');
    assert.deepEqual(s.store.rows, committedEnvelope); assert.equal(s.store.writes, writesBefore);
    const recovered = await reopen(t, s), current = value(await recovered.service.read());
    assert.deepEqual(current.pendingIntentIds, [intentId]); assert.equal(current.economicPreparationAllowed, false);
    failure(await recovered.journal.reserve({ ...prepared(), intentId: Buffer.alloc(32, 2).toString('base64url') }, 1), 'CONFLICT');
    assert.deepEqual(s.store.rows, committedEnvelope); assert.equal(s.store.writes, writesBefore);
  }
});

test('a peer sending marker during held snapshot revokes the stale reader without erasing the reservation', async t => {
  const s = await setup(t); value(await s.journal.reserve(prepared(), 0));
  const peer = await peerJournal(t, s), held = holdDiagnosticRead(t, s, 'after-snapshot');
  await held.entered; value(await peer.markSending(intentId));
  const committedEnvelope = structuredClone(s.store.rows), writesBefore = s.store.writes;
  held.release(); failure(await held.pending, 'CONFLICT');
  failure(await s.journal.unresolved(binding, account), 'LOCKED');
  assert.deepEqual(s.store.rows, committedEnvelope); assert.equal(s.store.writes, writesBefore);
  const recovered = await reopen(t, s), current = value(await recovered.service.read());
  assert.deepEqual(current.pendingIntentIds, [intentId]); assert.equal(current.economicPreparationAllowed, false);
  assert.equal(value(await recovered.journal.unresolved(binding, account))[0].state, 'broadcast-unknown');
  failure(await recovered.journal.markSending(intentId), 'CONFLICT');
  assert.deepEqual(s.store.rows, committedEnvelope); assert.equal(s.store.writes, writesBefore);
});
