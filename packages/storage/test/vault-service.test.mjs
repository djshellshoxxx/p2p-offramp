import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const api = await import('../src/vault-service.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const clone = value => structuredClone(value);
const pass = 'portable test passphrase';
const id = n => n.toString(16).padStart(32, '0');
const record = (n, kind = 'trade') => ({ id: id(n), kind, schemaVersion: 1, payload: Buffer.from(`private-${n}`).toString('base64url') });
class Store {
  rows = new Map(); writes = 0; beforeGet; beforeWrite; failure; listeners = new Set();
  async get(profileId) { await this.beforeGet?.(); return clone(this.rows.get(profileId)); }
  async add(envelope, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new api.VaultStorageError('CANCELLED');
    if (this.rows.has(envelope.profileId)) throw new api.VaultStorageError('ALREADY_EXISTS');
    if (this.failure) throw new api.VaultStorageError(this.failure);
    this.rows.set(envelope.profileId, clone(envelope)); this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new api.VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new api.VaultStorageError('CONFLICT');
    if (this.failure) throw new api.VaultStorageError(this.failure);
    this.rows.set(next.profileId, clone(next)); this.writes++; this.afterCommit?.();
  }
  subscribeInvalidation(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
function service(store = new Store(), provider = webcrypto) {
  assert.equal(typeof api.EncryptedVaultService, 'function', 'missing G02 service');
  return { store, vault: new api.EncryptedVaultService(store, provider, { lifecycle: false }) };
}
const value = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const error = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.equal(typeof result.error.message, 'string'); return result.error; };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('G02 creates only ciphertext, commits all kinds, returns defensive copies and unlocks after lock', async () => {
  const { store, vault } = service();
  const session = value(await vault.create(pass));
  assert.match(session.profileId, /^[a-f0-9]{32}$/); assert.match(session.sessionId, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(value(await vault.list(session.sessionId)), []);
  const mutations = ['identity', 'preference', 'trade', 'chat', 'journal'].map((kind, n) => ({ op: 'put', record: record(n, kind) }));
  assert.equal(value(await vault.commit(session.sessionId, 0, mutations)), 1);
  assert.equal(store.writes, 2);
  const result = value(await vault.read(session.sessionId, id(0))); result.payload = '';
  assert.notEqual(value(await vault.read(session.sessionId, id(0))).payload, '');
  assert.equal(value(await vault.list(session.sessionId, 'trade')).length, 1);
  const listed = value(await vault.list(session.sessionId)); listed[0].kind = 'trade'; listed.pop();
  assert.equal(value(await vault.list(session.sessionId)).length, 5);
  assert.equal(JSON.stringify([...store.rows.values()]).includes('private-'), false);
  assert.equal(JSON.stringify([...store.rows.values()]).includes('payload'), false);
  vault.lock(session.sessionId);
  error(await vault.read(session.sessionId, id(0)), 'LOCKED');
  const reopened = value(await vault.unlock(session.profileId, pass));
  assert.equal(reopened.revision, 1); assert.notEqual(reopened.sessionId, session.sessionId);
  assert.equal(value(await vault.list(reopened.sessionId)).length, 5);
});
test('G02 rejects malformed and duplicate mutations without writes, preserves absent-delete idempotence', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  for (const mutations of [Array.from({ length: 257 }, (_, n) => ({ op: 'delete', id: id(n) })),
    [{ op: 'put', record: record(1) }, { op: 'delete', id: id(1) }], [{ op: 'put', record: { ...record(1), extra: 1 } }],
    [{ op: 'delete', id: id(1), extra: 1 }], [{ op: 'put', record: { ...record(1), kind: 'unknown' } }]]) {
    const result = await vault.commit(session.sessionId, 0, mutations); assert.equal(result.ok, false);
    assert.ok(['INVALID_INPUT', 'LIMIT_EXCEEDED'].includes(result.error.code));
  }
  assert.equal(store.writes, 1); assert.equal(value(await vault.commit(session.sessionId, 0, [])), 0); assert.equal(store.writes, 1);
  assert.equal(value(await vault.commit(session.sessionId, 0, [{ op: 'delete', id: id(99) }])), 1);
  error(await vault.commit(session.sessionId, 0, []), 'CONFLICT');
});
test('G02 catches same-revision ciphertext replacement before commit and requires fresh unlock', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  const row = store.rows.get(session.profileId); row.snapshot.ciphertext = row.snapshot.ciphertext.replace(/^./, row.snapshot.ciphertext[0] === 'A' ? 'B' : 'A');
  error(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]), 'CONFLICT');
  assert.equal(store.writes, 1); error(await vault.list(session.sessionId), 'LOCKED');
});
test('G02 two services racing one revision produce one commit and one conflict', async () => {
  const { store, vault } = service(); const first = value(await vault.create(pass));
  const secondVault = service(store).vault; const second = value(await secondVault.unlock(first.profileId, pass));
  const results = await Promise.all([vault.commit(first.sessionId, 0, [{ op: 'put', record: record(1) }]), secondVault.commit(second.sessionId, 0, [{ op: 'put', record: record(2) }])]);
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(results.filter(result => !result.ok && result.error.code === 'CONFLICT').length, 1);
  assert.equal(store.rows.get(first.profileId).revision, 1);
});
test('G02 serializes same-session calls and validates expected revision after its predecessor', async () => {
  const { vault } = service(); const session = value(await vault.create(pass));
  const results = await Promise.all([vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]), vault.commit(session.sessionId, 1, [{ op: 'put', record: record(2) }])]);
  assert.deepEqual(results.map(value), [1, 2]); assert.equal(value(await vault.list(session.sessionId)).length, 2);
});
test('G02 snapshots caller mutations before an await and never invokes hostile accessors', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  const held = deferred(); store.beforeGet = () => held.promise;
  const mutable = record(1); const pending = vault.commit(session.sessionId, 0, [{ op: 'put', record: mutable }]); mutable.payload = '';
  held.resolve(); value(await pending); assert.notEqual(value(await vault.read(session.sessionId, id(1))).payload, '');
  let calls = 0; const hostile = { get op() { calls++; throw new Error('private data'); }, id: id(2) };
  error(await vault.commit(session.sessionId, 1, [hostile]), 'INVALID_INPUT'); assert.equal(calls, 0);
});
test('G02 lock while reading or encrypting suppresses commit and revokes outputs', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  const held = deferred(); store.beforeGet = () => held.promise;
  const pending = vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]); vault.lock(session.sessionId); held.resolve();
  error(await pending, 'LOCKED'); assert.equal(store.writes, 1);
});
test('G02 cancellation before commit leaves old revision, quota preserves usable cached state', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  const controller = new AbortController(); controller.abort();
  error(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }], controller.signal), 'CANCELLED');
  store.failure = 'QUOTA_EXCEEDED'; error(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]), 'QUOTA_EXCEEDED');
  assert.deepEqual(value(await vault.list(session.sessionId)), []); assert.equal(store.rows.get(session.profileId).revision, 0);
});
test('G02 lockAll during unlock discards key material and does not publish a session', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass)); vault.lockAll();
  const held = deferred(); store.beforeGet = () => held.promise;
  const pending = vault.unlock(session.profileId, pass); vault.lockAll(); held.resolve();
  error(await pending, 'LOCKED');
});
test('G02 export is frozen ciphertext only and authentication failures are fixed', async () => {
  const { vault } = service(); const session = value(await vault.create(pass)); vault.lockAll();
  const exported = value(await vault.exportEncrypted(session.profileId)); assert.ok(Object.isFrozen(exported)); assert.ok(Object.isFrozen(exported.snapshot));
  const failure = error(await vault.unlock(session.profileId, 'wrong test passphrase'), 'AUTHENTICATION_FAILED');
  assert.equal(failure.message, 'Vault authentication failed.'); assert.equal(failure.retryable, false);
  error(await vault.unlock(id(999), pass), 'NOT_FOUND'); error(await vault.read('not-a-token', id(1)), 'INVALID_INPUT');
});
test('G02 database invalidation immediately locks all sessions', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  for (const listener of store.listeners) listener();
  error(await vault.list(session.sessionId), 'LOCKED');
});

test('G02 immediate lock suppresses pending read and list plaintext results', async () => {
  const { vault } = service(); const session = value(await vault.create(pass));
  value(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]));
  const read = vault.read(session.sessionId, id(1)); const list = vault.list(session.sessionId); vault.lock(session.sessionId);
  error(await read, 'LOCKED'); error(await list, 'LOCKED');
});

test('G02 service exposes no plaintext session map or key-handle helpers on its JavaScript surface', async () => {
  const { vault } = service(); const session = value(await vault.create(pass));
  value(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]));
  assert.equal('sessions' in vault, false); assert.equal('session' in vault, false); assert.equal('register' in vault, false);
  assert.deepEqual(Reflect.ownKeys(vault), []);
});
test('G02 refuses a repeated random session token instead of replacing an existing holder', async () => {
  let token; let replay = false;
  const provider = { subtle: webcrypto.subtle, getRandomValues(bytes) {
    if (replay && bytes.length === 32 && token) { bytes.set(token); return bytes; }
    webcrypto.getRandomValues(bytes); if (!token && bytes.length === 32) token = bytes.slice(); return bytes;
  } };
  const { vault, store } = service(new Store(), provider); const first = value(await vault.create(pass));
  replay = true;
  error(await vault.unlock(first.profileId, pass), 'ALREADY_EXISTS');
  assert.deepEqual(value(await vault.list(first.sessionId)), []); assert.equal(store.writes, 1);
});


test('G02 lock during actual snapshot encryption discards the result without storage publication', async () => {
  const entered = deferred(); const proceed = deferred(); let hold = false;
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, key) {
      if (key === 'encrypt') return async (...args) => { if (hold) { entered.resolve(); await proceed.promise; } return target.encrypt(...args); };
      const member = Reflect.get(target, key); return typeof member === 'function' ? member.bind(target) : member;
    }
  }) };
  const { store, vault } = service(new Store(), provider); const session = value(await vault.create(pass)); hold = true;
  const pending = vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]);
  await entered.promise; vault.lock(session.sessionId); proceed.resolve();
  error(await pending, 'LOCKED'); assert.equal(store.writes, 1);
});
test('G02 returns a completed durable revision when lock and cancellation arrive after commit', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass)); const controller = new AbortController();
  store.afterCommit = () => { vault.lock(session.sessionId); controller.abort(); };
  assert.equal(value(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }], controller.signal)), 1);
  error(await vault.list(session.sessionId), 'LOCKED'); assert.equal(store.rows.get(session.profileId).revision, 1);
});
test('G02 CAS catches same-revision replacement between preflight and the write transaction', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  store.beforeWrite = () => { store.rows.get(session.profileId).snapshot.nonce = Buffer.alloc(12, 1).toString('base64url'); };
  error(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]), 'CONFLICT'); assert.equal(store.writes, 1);
});
test('G02 accepts exactly 256 mutations and a maximum payload, refuses larger payloads without storage', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  assert.equal(value(await vault.commit(session.sessionId, 0, Array.from({ length: 256 }, (_, n) => ({ op: 'put', record: record(n) })))), 1);
  const maximum = { ...record(999), payload: Buffer.alloc(262144, 7).toString('base64url') };
  assert.equal(value(await vault.commit(session.sessionId, 1, [{ op: 'put', record: maximum }])), 2);
  assert.equal(value(await vault.read(session.sessionId, id(999))).payload, maximum.payload);
  error(await vault.commit(session.sessionId, 2, [{ op: 'put', record: { ...maximum, payload: Buffer.alloc(262145).toString('base64url') } }]), 'LIMIT_EXCEEDED');
  assert.equal(store.writes, 3);
});
test('G02 uncertain storage errors revoke the cached session and never echo supplied diagnostics', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  store.beforeWrite = () => { throw new Error('secret payload passphrase'); };
  const failure = error(await vault.commit(session.sessionId, 0, [{ op: 'put', record: record(1) }]), 'STORAGE_UNAVAILABLE');
  assert.equal(JSON.stringify(failure).includes('secret'), false);
  error(await vault.list(session.sessionId), 'LOCKED');
});

test('G02 dispose is terminal and idempotent and refuses new plaintext or storage work', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass));
  vault.dispose(); vault.dispose();
  assert.equal(store.listeners.size, 0);
  for (const result of [await vault.create(pass), await vault.unlock(session.profileId, pass),
    await vault.commit(session.sessionId, 0, []), await vault.read(session.sessionId, id(1)),
    await vault.list(session.sessionId), await vault.exportEncrypted(session.profileId)]) error(result, 'LOCKED');
  assert.equal(store.writes, 1);
  const fresh = service(store).vault;
  assert.equal(value(await fresh.unlock(session.profileId, pass)).profileId, session.profileId);
  fresh.dispose();
});

test('G02 disposal invalidates queued unlock jobs and cannot revive their sessions', async () => {
  const { store, vault } = service(); const session = value(await vault.create(pass)); vault.lockAll();
  const held = deferred(); store.beforeGet = () => held.promise;
  const first = vault.unlock(session.profileId, pass), second = vault.unlock(session.profileId, pass);
  vault.dispose(); held.resolve();
  error(await first, 'LOCKED'); error(await second, 'LOCKED');
  error(await vault.create(pass), 'LOCKED'); assert.equal(store.writes, 1);
});
