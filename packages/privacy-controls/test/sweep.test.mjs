import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createSweepReminders, validateLocalSweepPlan } from '../index.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { REAL_PASS, val, fail, deferred, FOREIGN, setup, consent, scope, policy, clock, MemoryRows } from './support/native-vault.mjs';
const fullPlan = over => ({ format: 'p2p-offramp-local-sweep-plan', version: 1, ...policy(), nonce: 'ab'.repeat(32), ...over });
function reminders(t, s, over = {}) {
  const time = clock(), owner = { live: true }, manager = val(createSweepReminders({ vault: s.vault, session: s.session, scope, isCurrent: () => owner.live, clock: time.port, ...over }));
  t.after(() => manager.dispose()); return { manager, time, owner };
}
test('strict local plan binds exact account/network/generation/caps/fee/expiry/nonce and freezes detached fields', () => {
  const input = fullPlan(), checked = val(validateLocalSweepPlan(input)); input.assets[0].amountCap = '1';
  assert.notEqual(checked.assets[0].amountCap, '1'); assert.ok(Object.isFrozen(checked.assets[0]));
  for (const change of [p => p.version = 2, p => p.chain = 'solana', p => p.accountGeneration = -1, p => p.destination = '0x' + '00'.repeat(20),
    p => p.assets = [], p => p.assets = Array(17).fill({ id: 'ETH', amountCap: '1' }), p => p.assets.push({ ...p.assets[0] }),
    p => p.assets[0].amountCap = '01', p => p.assets[0].amountCap = (1n << 256n).toString(), p => p.feeCap = '-1', p => p.nonce = 'a',
    p => p.expiresAt = NaN, p => p.escrowTradeId = 'forbidden', p => p.policyRevision = 0]) {
    const bad = fullPlan(); change(bad); fail(validateLocalSweepPlan(bad));
  }
  let calls = 0; const bad = fullPlan(); Object.defineProperty(bad, 'destination', { get() { calls++; throw Error('PRIVATE_ERROR'); } });
  fail(validateLocalSweepPlan(bad)); assert.equal(calls, 0);
});
test('actual encrypted G02 plan preserves foreign rows and never exports transaction or spending material', async t => {
  const s = await setup(t); val(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: FOREIGN }]));
  const { manager } = reminders(t, s), made = val(await manager.createPlan(policy(), consent));
  assert.equal(made.persisted, true); assert.equal(made.sessionCurrent, true); assert.deepEqual(Object.keys(made.handle), ['kind']);
  const rows = val(await s.vault.list(s.session.sessionId)); assert.deepEqual(rows.find(r => r.id === FOREIGN.id), FOREIGN);
  assert.doesNotMatch(JSON.stringify([...s.storage.rows.values()]), /local-sweep|0x1111111111111111111111111111111111111111|12345678901234567890|feeCap/);
  assert.equal(val(await manager.inspect(made.handle)).state, 'draft');
  assert.doesNotMatch(JSON.stringify(made), /destination|amountCap|sessionId|privateKey/);
});
test('persisted schedule matures to readonly reminder and explicit review never sends or creates an intent', async t => {
  const s = await setup(t), { manager, time } = reminders(t, s), made = val(await manager.createPlan(policy(), consent));
  const scheduled = val(await manager.schedule(made.handle, 2000, 50_000)); fail(await manager.inspect(made.handle), 'CONFLICT');
  assert.equal(val(await manager.inspect(scheduled.handle)).state, 'scheduled');
  time.advance(1000); const view = val(await manager.inspect(scheduled.handle)); assert.equal(view.state, 'ready'); assert.equal(view.requiresFreshReview, true); assert.equal(view.executionSupported, false);
  const reviewed = val(await manager.prepareReady(scheduled.handle)); assert.equal(reviewed.requiresFreshWalletConsent, true); assert.equal(reviewed.executionSupported, false); assert.deepEqual(reviewed.plan.assets, policy().assets);
  assert.equal(Object.hasOwn(manager, 'executeNext'), false); assert.equal(Object.hasOwn(manager, 'authorizeSweep'), false);
  assert.equal(s.storage.writes, 3, 'readiness and review write/send nothing');
});
test('cancellation is atomic, revisioned and idempotent; stale or copied handles cannot resurrect readiness', async t => {
  const s = await setup(t), { manager, time } = reminders(t, s), made = val(await manager.createPlan(policy(), consent));
  const scheduled = val(await manager.schedule(made.handle, 2000, 50_000)), cancelled = val(await manager.cancel(scheduled.handle)), writes = s.storage.writes;
  assert.equal(val(await manager.inspect(cancelled.handle)).state, 'cancelled');
  val(await manager.cancel(cancelled.handle)); assert.equal(s.storage.writes, writes);
  fail(await manager.inspect(scheduled.handle), 'CONFLICT'); fail(await manager.inspect({ ...cancelled.handle }), 'CONFLICT');
  time.advance(10_000); fail(await manager.prepareReady(cancelled.handle), 'EXPIRED');
});
test('changing destination creates a fresh nonce and invalidates every previous pending handle in one replacement CAS', async t => {
  const s = await setup(t), { manager } = reminders(t, s), first = val(await manager.createPlan(policy(), consent));
  const before = val(await s.vault.list(s.session.sessionId))[0].payload;
  const next = val(await manager.createPlan(policy({ destination: '0x' + '33'.repeat(20) }), consent));
  fail(await manager.inspect(first.handle), 'CONFLICT'); assert.equal(val(await manager.inspect(next.handle)).state, 'draft');
  const after = val(await s.vault.list(s.session.sessionId))[0].payload; assert.notEqual(after, before);
  const a = JSON.parse(atob(before)), b = JSON.parse(atob(after)); assert.notEqual(a.plan.nonce, b.plan.nonce); assert.notEqual(a.planHash, b.planHash); assert.equal(b.generation, a.generation + 1);
});
test('clock rollback and forward jumps require fresh review; expiry never becomes execution authority', async t => {
  for (const direction of ['rollback', 'forward']) {
    const s = await setup(t), { manager, time } = reminders(t, s), made = val(await manager.createPlan(policy(), consent));
    const scheduled = val(await manager.schedule(made.handle, 2000, 50_000));
    if (direction === 'rollback') time.state.wall--; else time.state.wall += 10_000;
    const view = val(await manager.inspect(scheduled.handle)); assert.equal(view.clockUncertain, true); assert.notEqual(view.state, 'ready');
    fail(await manager.prepareReady(scheduled.handle), 'EXPIRED');
  }
});
test('reload authenticates encrypted plan but always requires new review and current exact wallet scope', async t => {
  const s = await setup(t), first = reminders(t, s), made = val(await first.manager.createPlan(policy(), consent)), scheduled = val(await first.manager.schedule(made.handle, 2000, 50_000));
  first.manager.dispose(); const next = reminders(t, s); const handle = val(await next.manager.load());
  fail(await next.manager.inspect(scheduled.handle), 'CONFLICT'); const view = val(await next.manager.inspect(handle)); assert.equal(view.requiresFreshReview, true);
  const wrong = reminders(t, s, { scope: { ...scope, accountGeneration: 8 } }); fail(await wrong.manager.load(), 'CONFLICT');
  s.vault.lockAll(); fail(await next.manager.load(), 'LOCKED');
});
test('other native service update is caught at freshness CAS and never overwritten', async t => {
  const s = await setup(t), { manager } = reminders(t, s), made = val(await manager.createPlan(policy(), consent));
  const other = new EncryptedVaultService(s.storage, crypto, { lifecycle: false }); t.after(() => other.dispose());
  const opened = val(await other.unlock(s.session.profileId, REAL_PASS)); val(await other.commit(opened.sessionId, opened.revision, [{ op: 'put', record: FOREIGN }]));
  const writes = s.storage.writes; assert.ok(['CONFLICT', 'LOCKED'].includes(fail(await manager.cancel(made.handle)))); assert.equal(s.storage.writes, writes);
  assert.deepEqual(val(await other.list(opened.sessionId)).find(r => r.id === FOREIGN.id), FOREIGN);
});
test('native durable write receipt survives late lock without publishing plaintext or a current session', async t => {
  const s = await setup(t), { manager } = reminders(t, s); s.storage.afterWrite = () => s.vault.lockAll();
  const made = val(await manager.createPlan(policy(), consent)); assert.equal(made.persisted, true); assert.equal(made.sessionCurrent, false);
  assert.doesNotMatch(JSON.stringify(made), /destination|amountCap|111111111|nonce|sessionId/); fail(await manager.inspect(made.handle), 'LOCKED');
  assert.equal(s.storage.rows.get(s.session.profileId).revision, 1);
});
test('post-commit owner change preserves durable receipt but retires its current scope and plaintext access', async t => {
  const s = await setup(t), { manager, owner } = reminders(t, s); s.storage.afterWrite = () => { owner.live = false; };
  const made = val(await manager.createPlan(policy(), consent)); assert.equal(made.persisted, true); assert.equal(made.sessionCurrent, false);
  fail(await manager.load(), 'LOCKED'); assert.equal(s.storage.rows.get(s.session.profileId).revision, 1);
});
test('ambiguous post-write response remains recoverable from actual encrypted state without retry or rollback', async t => {
  const s = await setup(t), { manager } = reminders(t, s); s.storage.afterWrite = () => { throw new VaultStorageError('STORAGE_UNAVAILABLE'); };
  fail(await manager.createPlan(policy(), consent), 'UNAVAILABLE'); assert.equal(s.storage.rows.get(s.session.profileId).revision, 1);
  s.storage.afterWrite = undefined;
  const other = new EncryptedVaultService(s.storage, crypto, { lifecycle: false }); t.after(() => other.dispose());
  const session = val(await other.unlock(s.session.profileId, REAL_PASS)), recovered = reminders(t, s, { vault: other, session });
  const handle = val(await recovered.manager.load()); assert.equal(val(await recovered.manager.inspect(handle)).state, 'draft'); assert.equal(s.storage.writes, 2);
});
test('cancelled held native CAS retains physical admission until drain and starts no overlapping plan', async t => {
  const s = await setup(t), { manager } = reminders(t, s), wait = deferred(), entered = deferred(), abort = new AbortController();
  s.storage.beforeWrite = async () => { entered.resolve(); await wait.promise; };
  const pending = manager.createPlan(policy(), consent, abort.signal); await entered.promise; abort.abort();
  fail(await manager.createPlan(policy(), consent), 'CONFLICT'); wait.resolve(); fail(await pending, 'CANCELLED'); assert.equal(s.storage.writes, 1);
  s.storage.beforeWrite = undefined; val(await manager.createPlan(policy(), consent));
});
test('invalid native-local record binding and hostile callbacks fail closed without retained leases or diagnostics', async t => {
  const s = await setup(t), { manager } = reminders(t, s); val(await manager.createPlan(policy(), consent));
  const row = val(await s.vault.list(s.session.sessionId))[0], value = JSON.parse(atob(row.payload)); value.planHash = 'ab'.repeat(32);
  val(await s.vault.commit(s.session.sessionId, s.storage.rows.get(s.session.profileId).revision, [{ op: 'put', record: { ...row, payload: Buffer.from(JSON.stringify(value)).toString('base64url') } }]));
  fail(await manager.load(), 'INTEGRITY_FAILURE');
  let captures = 0; const capture = s.vault.captureSession.bind(s.vault); s.vault.captureSession = (...args) => { captures++; return capture(...args); };
  fail(createSweepReminders({ vault: s.vault, session: s.session, scope, isCurrent: () => true, clock: { wall: null, monotonic: () => 0 } }), 'INVALID_INPUT'); assert.equal(captures, 0);
});
test('expiry is checked at actual native CAS after storage waits, so stale plans/schedules are not written', async t => {
  const s = await setup(t), { manager, time } = reminders(t, s);
  s.storage.beforeWrite = () => time.advance(500);
  // G02 intentionally maps a rejected trusted native write guard to CANCELLED.
  fail(await manager.createPlan(policy({ expiresAt: 1500 }), consent), 'CANCELLED'); assert.equal(s.storage.writes, 1);
  s.storage.beforeWrite = undefined; const made = val(await manager.createPlan(policy(), consent)), writes = s.storage.writes;
  s.storage.beforeWrite = () => time.advance(500);
  fail(await manager.schedule(made.handle, 1800, 2000), 'CANCELLED'); assert.equal(s.storage.writes, writes);
  assert.equal(val(await manager.inspect(made.handle)).state, 'draft');
});
test('native G02 idle expiry during awaited SHA256 suppresses private plan publication before delayed timer fires', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document'), oldCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let nativeTime = 0, vault, manager;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() });
  try {
    vault = new EncryptedVaultService(new MemoryRows(), webcrypto, { now: () => nativeTime }); const session = val(await vault.create(REAL_PASS));
    manager = val(createSweepReminders({ vault, session, scope, isCurrent: () => true, clock: { wall: () => 1000, monotonic: () => 0 } }));
    const made = val(await manager.createPlan(policy(), consent)), scheduled = val(await manager.schedule(made.handle, 1000, 50_000));
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: { async digest(...args) {
      const result = await webcrypto.subtle.digest(...args); nativeTime = 300_000; return result;
    } } } });
    const result = await manager.prepareReady(scheduled.handle); fail(result, 'LOCKED'); assert.equal(Object.hasOwn(result, 'value'), false);
    fail(vault.captureSession(session, () => {}), 'LOCKED');
  } finally {
    if (oldCrypto) Object.defineProperty(globalThis, 'crypto', oldCrypto); else delete globalThis.crypto;
    manager?.dispose(); vault?.dispose();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
  }
});
test('a native destination replacement during awaited hashing invalidates an already pending old review', async t => {
  for (const separateNativeService of [false, true]) {
    const s = await setup(t), a = reminders(t, s), other = separateNativeService ? new EncryptedVaultService(s.storage, webcrypto, { lifecycle: false }) : s.vault;
    if (separateNativeService) t.after(() => other.dispose());
    const secondSession = separateNativeService ? val(await other.unlock(s.session.profileId, REAL_PASS)) : s.session;
    const b = reminders(t, s, { vault: other, session: secondSession });
    const made = val(await a.manager.createPlan(policy(), consent)), scheduled = val(await a.manager.schedule(made.handle, 1000, 50_000));
    // A separate native service authenticates the latest encrypted revision before its replacement.
    if (separateNativeService) { other.lockAll(); const latest = val(await other.unlock(s.session.profileId, REAL_PASS)); b.manager.dispose(); b.manager = reminders(t, s, { vault: other, session: latest }).manager; }
    const oldCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), entered = deferred(), held = deferred(); let first = true;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: { async digest(...args) {
      const result = await webcrypto.subtle.digest(...args); if (first) { first = false; entered.resolve(); await held.promise; } return result;
    } } } });
    try {
      const pending = a.manager.prepareReady(scheduled.handle); await entered.promise;
      val(await b.manager.createPlan(policy({ destination: '0x' + '33'.repeat(20) }), consent)); held.resolve();
      const result = await pending; assert.ok(['CONFLICT', 'LOCKED'].includes(fail(result))); assert.equal(Object.hasOwn(result, 'value'), false);
    } finally { held.resolve(); if (oldCrypto) Object.defineProperty(globalThis, 'crypto', oldCrypto); else delete globalThis.crypto; }
  }
});
