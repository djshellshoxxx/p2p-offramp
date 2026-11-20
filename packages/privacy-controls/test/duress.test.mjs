import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createDecoyProfile, createDuressController } from '../index.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { REAL_PASS, DECOY_PASS, val, fail, deferred, FOREIGN, setup, consent, MemoryRows } from './support/native-vault.mjs';
const options = s => ({ vault: s.vault, normalSession: s.session, isCurrent: () => true, now: () => 1000 });
const controller = (t, s, over = {}) => { const c = val(createDuressController({ ...options(s), ...over })); t.after(() => c.dispose()); return c; };
const decoy = async s => { const made = val(await createDecoyProfile(s.vault, DECOY_PASS)); assert.equal(made.initialized, true); return made.decoy; };

test('actual G02 creates independently keyed ciphertext-only decoy without copying real records', async t => {
  const s = await setup(t); val(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: FOREIGN }]));
  const before = structuredClone(s.storage.rows.get(s.session.profileId)), d = await decoy(s), row = s.storage.rows.get(d.profileId);
  assert.notEqual(row.profileId, before.profileId); assert.notEqual(row.keyId, before.keyId); assert.notEqual(row.wrappedKey.salt, before.wrappedKey.salt);
  assert.deepEqual(s.storage.rows.get(s.session.profileId), before); assert.doesNotMatch(JSON.stringify(row), /local-decoy|passphrase|fixture password|foreign future/);
  const opened = val(await s.vault.unlock(d.profileId, DECOY_PASS)), rows = val(await s.vault.list(opened.sessionId));
  assert.equal(rows.length, 1); assert.equal(rows[0].kind, 'preference');
  assert.doesNotMatch(JSON.stringify(d), /sessionId|passphrase|keyId/); assert.equal(Object.isFrozen(d), true);
});
test('enrollment uses actual normal lease, opaque created descriptor and explicit consent; foreign preferences survive', async t => {
  const s = await setup(t), d = await decoy(s), c = controller(t, s);
  val(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: FOREIGN }]));
  fail(await c.enrollDuress({ ...d }, consent), 'UNAUTHORIZED'); fail(await c.enrollDuress(d, { explainedLimits: true, explicit: false }), 'UNAUTHORIZED');
  const receipt = val(await c.enrollDuress(d, consent)); assert.equal(receipt.policyRevision, 1); assert.equal(receipt.persisted, true);
  assert.deepEqual(val(await s.vault.list(s.session.sessionId)).find(r => r.id === FOREIGN.id), FOREIGN);
  fail(createDuressController({ ...options(s), normalSession: { ...s.session, profileId: d.profileId } }), 'LOCKED');
});
test('actual reload stays gated by normal G02 authentication; disabling is revisioned and never deletes data', async t => {
  const s = await setup(t), d = await decoy(s), c = controller(t, s); val(await c.enrollDuress(d, consent)); c.dispose();
  s.vault.lockAll(); fail(createDuressController(options(s)), 'LOCKED');
  const fresh = val(await s.vault.unlock(s.session.profileId, REAL_PASS)), next = controller(t, s, { normalSession: fresh });
  assert.deepEqual(val(await next.load()), { enabled: true, policyRevision: 1 });
  const disabled = val(await next.disableDuress(consent)); assert.equal(disabled.policyRevision, 2); assert.equal(val(await next.load()).enabled, false);
  fail(await next.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1), 'CONFLICT');
  assert.equal(s.storage.rows.size, 2); assert.equal(val(await s.vault.list(fresh.sessionId)).length, 1);
});
test('duress locks real sessions before native decoy unlock and exposes only readonly demo metadata', async t => {
  const s = await setup(t), d = await decoy(s), c = controller(t, s); val(await c.enrollDuress(d, consent));
  const before = structuredClone(s.storage.rows.get(s.session.profileId)), unlock = s.vault.unlock.bind(s.vault); let calls = 0;
  s.vault.unlock = async (...args) => { calls++; fail(s.vault.captureSession(s.session, () => {}), 'LOCKED'); return unlock(...args); };
  const view = val(await c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1));
  assert.deepEqual(view, { mode: 'decoy-session', profileId: d.profileId, readOnly: true, demo: true, walletAuthority: false, notificationsHidden: true });
  assert.equal(calls, 1); assert.deepEqual(s.storage.rows.get(s.session.profileId), before); assert.doesNotMatch(JSON.stringify(view), /sessionId|private|keyId/);
  c.lockAll(); assert.equal(c.inspect().phase, 'closed'); assert.equal(c.inspect().notificationsHidden, false);
});
test('wrong decoy credential leaves real data locked, retains source and never creates a normal session', async t => {
  const s = await setup(t), d = await decoy(s), c = controller(t, s); val(await c.enrollDuress(d, consent));
  const before = structuredClone(s.storage.rows.get(s.session.profileId));
  fail(await c.enterCredential({ purpose: 'decoy', passphrase: 'wrong independent decoy passphrase' }, 1), 'UNAUTHORIZED');
  fail(await s.vault.list(s.session.sessionId), 'LOCKED'); assert.deepEqual(s.storage.rows.get(s.session.profileId), before); assert.equal(c.inspect().phase, 'locked-error');
});
test('native decoy with imported real/future records refuses demo exposure instead of silently filtering', async t => {
  const s = await setup(t), d = await decoy(s), c = controller(t, s);
  const opened = val(await s.vault.unlock(d.profileId, DECOY_PASS)); val(await s.vault.commit(opened.sessionId, opened.revision, [{ op: 'put', record: { ...FOREIGN, kind: 'chat' } }]));
  val(await c.enrollDuress(d, consent)); fail(await c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1), 'INTEGRITY_FAILURE');
  assert.equal(c.inspect().phase, 'locked-error'); fail(await s.vault.list(s.session.sessionId), 'LOCKED');
});
test('cancelled ignored native decrypt retains admission through physical drain and cannot revive a session', async t => {
  let wait, entered; const provider = { getRandomValues: b => crypto.getRandomValues(b), subtle: new Proxy(crypto.subtle, { get(target, key) {
    if (key === 'decrypt') return async (...args) => { const result = await target.decrypt(...args); if (wait) { entered.resolve(); await wait.promise; } return result; };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } }) };
  const s = await setup(t, provider), d = await decoy(s), c = controller(t, s); val(await c.enrollDuress(d, consent));
  wait = deferred(); entered = deferred(); const pending = c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1);
  await entered.promise; c.cancel(); fail(await c.load(), 'CONFLICT'); fail(await c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1), 'CONFLICT');
  wait.resolve(); const error = fail(await pending); assert.ok(['LOCKED', 'CANCELLED'].includes(error)); assert.notEqual(c.inspect().phase, 'decoy-session');
  fail(await s.vault.list(s.session.sessionId), 'LOCKED');
});
test('another native service commit is detected by explicit freshness CAS; no instant broadcast is claimed', async t => {
  const s = await setup(t), d = await decoy(s), c = controller(t, s); val(await c.enrollDuress(d, consent));
  const other = new EncryptedVaultService(s.storage, crypto, { lifecycle: false }); t.after(() => other.dispose());
  const opened = val(await other.unlock(s.session.profileId, REAL_PASS)); val(await other.commit(opened.sessionId, opened.revision, [{ op: 'put', record: FOREIGN }]));
  assert.equal(c.inspect().enrolled, true, 'cached state is explicitly point-in-time');
  assert.ok(['CONFLICT', 'LOCKED'].includes(fail(await c.load()))); assert.equal(c.inspect().phase, 'closed');
});
test('hostile metadata/getters, owner retirement and clock failures return fixed errors with no accessor execution', async t => {
  const s = await setup(t), d = await decoy(s); let getters = 0;
  const c = controller(t, s), bad = { explainedLimits: true, get explicit() { getters++; throw Error('PRIVATE_ERROR'); } };
  fail(await c.enrollDuress(d, bad), 'INVALID_INPUT'); assert.equal(getters, 0);
  const owner = { live: true }, retiring = controller(t, s, { isCurrent: () => owner.live }); owner.live = false;
  fail(await retiring.load(), 'LOCKED'); assert.equal(retiring.inspect().phase, 'closed');
  const broken = controller(t, s, { now() { throw new Proxy({}, { getOwnPropertyDescriptor() { throw Error('PRIVATE_ERROR'); } }); } });
  fail(await broken.enrollDuress(d, consent), 'UNAVAILABLE');
});
test('native durable decoy creation remains discoverable when marker initialization is cancelled', async t => {
  const s = await setup(t), abort = new AbortController(); let count = 0;
  s.storage.afterWrite = () => { if (++count === 1) abort.abort(); };
  const made = val(await createDecoyProfile(s.vault, DECOY_PASS, abort.signal));
  assert.equal(made.persisted, true); assert.equal(made.initialized, false); assert.equal(made.decoy, null); assert.equal(s.storage.rows.has(made.profileId), true);
});
test('five decoy credential attempts survive controller replacement; denial still locks real data and never limits normal recovery', async t => {
  const s = await setup(t), d = await decoy(s); let c = controller(t, s); val(await c.enrollDuress(d, consent)); let current = s.session;
  for (let i = 0; i < 5; i++) {
    if (i) { current = val(await s.vault.unlock(s.session.profileId, REAL_PASS)); c = controller(t, s, { normalSession: current }); val(await c.load()); }
    fail(await c.enterCredential({ purpose: 'decoy', passphrase: 'wrong decoy credential fixture' }, 1), 'UNAUTHORIZED'); c.dispose();
  }
  current = val(await s.vault.unlock(s.session.profileId, REAL_PASS)); c = controller(t, s, { normalSession: current }); val(await c.load());
  let unlocks = 0; const unlock = s.vault.unlock.bind(s.vault); s.vault.unlock = (...args) => { unlocks++; return unlock(...args); };
  fail(await c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1), 'LIMIT_EXCEEDED'); assert.equal(unlocks, 0);
  fail(await s.vault.list(current.sessionId), 'LOCKED'); val(await s.vault.unlock(s.session.profileId, REAL_PASS)); assert.equal(unlocks, 1);
});
test('throwing native lease cleanup cannot leak creation diagnostics, retain an unlocked decoy or strand admission', async t => {
  const s = await setup(t), capture = s.vault.captureSession.bind(s.vault), create = s.vault.create.bind(s.vault); let opened, disposals = 0;
  s.vault.create = async (...args) => { const result = await create(...args); if (result.ok) opened = result.value; return result; };
  s.vault.captureSession = (...args) => { const result = capture(...args); if (!result.ok) return result; const lease = result.value;
    return { ok: true, value: { current: () => lease.current(), dispose() { disposals++; lease.dispose(); throw Error('PRIVATE_ERROR_DISPOSE'); } } }; };
  const made = val(await createDecoyProfile(s.vault, DECOY_PASS)); assert.equal(made.initialized, true);
  fail(await s.vault.list(opened.sessionId), 'LOCKED');
  const second = val(await createDecoyProfile(s.vault, DECOY_PASS)); assert.equal(second.initialized, true); assert.notEqual(second.profileId, made.profileId);
  assert.equal(disposals, 2); fail(await s.vault.list(opened.sessionId), 'LOCKED');
});
test('throwing native lease cleanup cannot bypass real lock or remaining owned-decoy cleanup', async t => {
  const s = await setup(t), d = await decoy(s), capture = s.vault.captureSession.bind(s.vault), unlock = s.vault.unlock.bind(s.vault); let opened, disposals = 0;
  s.vault.unlock = async (...args) => { const result = await unlock(...args); if (result.ok) opened = result.value; return result; };
  s.vault.captureSession = (...args) => { const result = capture(...args); if (!result.ok) return result; const lease = result.value;
    return { ok: true, value: { current: () => lease.current(), dispose() { disposals++; lease.dispose(); throw Error('PRIVATE_ERROR_DISPOSE'); } } }; };
  const c = controller(t, s); val(await c.enrollDuress(d, consent));
  val(await c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1)); fail(await s.vault.list(s.session.sessionId), 'LOCKED');
  assert.doesNotThrow(() => c.dispose()); assert.doesNotThrow(() => c.dispose()); assert.equal(disposals, 2);
  fail(await s.vault.list(opened.sessionId), 'LOCKED');
});
test('idle decoy inspection rechecks actual native G02 lifetime even when the browser idle timer is delayed', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document'); let vault, c, nativeTime = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() }); Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() });
  try {
    vault = new EncryptedVaultService(new MemoryRows(), webcrypto, { now: () => nativeTime }); const session = val(await vault.create(REAL_PASS));
    const made = val(await createDecoyProfile(vault, DECOY_PASS)); c = val(createDuressController({ vault, normalSession: session, isCurrent: () => true, now: () => 1000 }));
    val(await c.enrollDuress(made.decoy, consent)); val(await c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1));
    assert.equal(c.inspect().phase, 'decoy-session'); nativeTime = 300_000;
    assert.equal(c.inspect().phase, 'closed'); assert.equal(c.inspect().notificationsHidden, false);
  } finally {
    c?.dispose(); vault?.dispose();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
  }
});
test('a different native service changing decoy data during decrypt is detected before any demo view', async t => {
  let entered, held; const provider = { getRandomValues: b => webcrypto.getRandomValues(b), subtle: new Proxy(webcrypto.subtle, { get(target, key) {
    if (key === 'decrypt') return async (...args) => { const result = await target.decrypt(...args); if (held) { entered.resolve(); await held.promise; } return result; };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } }) };
  const s = await setup(t, provider), d = await decoy(s), c = controller(t, s); val(await c.enrollDuress(d, consent));
  const other = new EncryptedVaultService(s.storage, webcrypto, { lifecycle: false }); t.after(() => other.dispose());
  const opened = val(await other.unlock(d.profileId, DECOY_PASS)); held = deferred(); entered = deferred();
  const pending = c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1); await entered.promise;
  val(await other.commit(opened.sessionId, opened.revision, [{ op: 'put', record: { ...FOREIGN, kind: 'chat' } }])); held.resolve();
  assert.ok(['LOCKED', 'CONFLICT'].includes(fail(await pending))); assert.notEqual(c.inspect().phase, 'decoy-session');
});
test('late decrypt failure cannot restore notification or phase state after explicit controller retirement', async t => {
  let entered, held; const provider = { getRandomValues: b => webcrypto.getRandomValues(b), subtle: new Proxy(webcrypto.subtle, { get(target, key) {
    if (key === 'decrypt') return async (...args) => { const result = await target.decrypt(...args); if (held) { entered.resolve(); await held.promise; } return result; };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } }) };
  const s = await setup(t, provider), d = await decoy(s), c = controller(t, s); val(await c.enrollDuress(d, consent)); held = deferred(); entered = deferred();
  const pending = c.enterCredential({ purpose: 'decoy', passphrase: DECOY_PASS }, 1); await entered.promise;
  c.lockAll(); assert.equal(c.inspect().phase, 'closed'); assert.equal(c.inspect().notificationsHidden, false); held.resolve(); fail(await pending, 'LOCKED');
  assert.equal(c.inspect().phase, 'closed'); assert.equal(c.inspect().notificationsHidden, false);
});
