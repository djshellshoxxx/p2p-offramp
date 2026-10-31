import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { openEnvelope, disposeMaterial } from '../src/vault-crypto.ts';
import { VaultStorageError } from '../src/idb-vault-store.ts';
const fixture = JSON.parse(await readFile(new URL('./fixtures/vault-python-v1.json', import.meta.url)));
const api = await import('../src/backup-service.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const clone = value => structuredClone(value);
const checksum = envelope => createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
const backup = (envelope = fixture.envelope) => new TextEncoder().encode(JSON.stringify({ format: 'p2p-offramp-backup', version: 1, envelope, checksum: checksum(envelope) }));
const destinationPass = 'fresh destination passphrase';
class Store {
  rows = new Map([[fixture.envelope.profileId, clone(fixture.envelope)]]); writes = 0; listeners = new Set(); beforeAdd; afterAdd; failure;
  get(profileId) { return Promise.resolve(clone(this.rows.get(profileId))); }
  async add(envelope, options) {
    await this.beforeAdd?.(); options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (this.failure) throw new VaultStorageError(this.failure);
    if (this.rows.has(envelope.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(envelope.profileId, clone(envelope)); this.writes++; this.afterAdd?.();
  }
  subscribeInvalidation(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
const service = (store = new Store(), provider = webcrypto) => {
  assert.equal(typeof api.EncryptedBackupService, 'function', 'missing G03 backup service');
  return { service: new api.EncryptedBackupService(store, provider), store };
};
const failure = (operation, code) => assert.rejects(operation, error => error.code === code && !/SECRET|PRIVATE|https:/.test(error.message));
function providerSpy() {
  let derivations = 0; const encryptAAD = []; const keys = [];
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
    get(target, name) {
      if (name === 'deriveKey') return (...args) => { derivations++; return target.deriveKey(...args); };
      if (name === 'encrypt') return (algorithm, key, input) => { encryptAAD.push(new TextDecoder().decode(algorithm.additionalData)); return target.encrypt(algorithm, key, input); };
      if (name === 'importKey') return async (...args) => { const result = await target.importKey(...args); if (result.algorithm.name === 'AES-GCM') keys.push({ key: result, bytes: args[1] }); return result; };
      const member = Reflect.get(target, name); return typeof member === 'function' ? member.bind(target) : member;
    }
  }) };
  return { provider, encryptAAD, keys, get derivations() { return derivations; } };
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('G03 trusted restore guard refuses a late atomic add without exposing caller exceptions or holding recovery capacity', async () => {
  const { service: vault, store } = service();
  let current = true;
  const original = clone(store.rows.get(fixture.envelope.profileId));
  store.beforeAdd = () => { current = false; };
  await failure(vault.restore(backup(), fixture.passphrase, destinationPass, undefined, () => { if (!current) throw new Error('SECRET authority detail'); }), 'CANCELLED');
  assert.equal(store.writes, 0); assert.equal(store.rows.size, 1); assert.deepEqual(store.rows.get(fixture.envelope.profileId), original);
  await failure(vault.restore(backup(), fixture.passphrase, destinationPass, undefined, {}), 'INVALID_INPUT');
  store.beforeAdd = undefined;
  const restored = await vault.restore(backup(), fixture.passphrase, destinationPass); assert.ok(store.rows.has(restored.newProfileId));
  vault.dispose();
});

test('G03 export returns the exact backup format/checksum and explicitly marks authentication not checked', async () => {
  const { service: vault } = service();
  const exported = await vault.exportWithStatus(fixture.envelope.profileId);
  assert.equal(exported.authentication, 'not-checked');
  const decoded = JSON.parse(new TextDecoder().decode(exported.bytes));
  assert.deepEqual(Object.keys(decoded), ['format', 'version', 'envelope', 'checksum']);
  assert.equal(decoded.checksum, checksum(fixture.envelope)); assert.deepEqual(decoded.envelope, fixture.envelope);
  assert.deepEqual(await vault.export(fixture.envelope.profileId), exported.bytes);
});
test('G03 restores byte-preserved records under fresh identifiers and keys after round-trip authentication', async () => {
  const spy = providerSpy(); const { service: vault, store } = service(new Store(), spy.provider);
  const old = JSON.stringify(store.rows.get(fixture.envelope.profileId)); let derivationsAtAdd;
  store.beforeAdd = () => { derivationsAtAdd = spy.derivations; };
  const receipt = await vault.restore(backup(), fixture.passphrase, destinationPass);
  assert.equal(receipt.sourceProfileId, fixture.envelope.profileId); assert.notEqual(receipt.newProfileId, fixture.envelope.profileId);
  assert.notEqual(receipt.newKeyId, fixture.envelope.keyId); assert.equal(receipt.revision, 0); assert.equal(receipt.records, fixture.snapshot.records.length);
  assert.equal(derivationsAtAdd, 3); assert.equal(store.writes, 1); assert.equal(JSON.stringify(store.rows.get(fixture.envelope.profileId)), old);
  const destination = store.rows.get(receipt.newProfileId);
  assert.notEqual(destination.wrappedKey.salt, fixture.envelope.wrappedKey.salt); assert.notEqual(destination.snapshot.nonce, fixture.envelope.snapshot.nonce);
  assert.notEqual(destination.wrappedKey.nonce, fixture.envelope.wrappedKey.nonce);
  const opened = await openEnvelope(destination, destinationPass, webcrypto);
  assert.deepEqual(opened.snapshot.records, fixture.snapshot.records); disposeMaterial(opened.material);
  assert.equal(spy.encryptAAD.length, 2); assert.ok(spy.encryptAAD.every(aad => aad.includes(receipt.newProfileId) && !aad.includes(fixture.envelope.profileId)));
  assert.ok(spy.keys.every(({ key, bytes }) => !key.extractable && bytes.every(byte => byte === 0)));
});
test('G03 restoring the same backup twice creates unrelated destination vaults without overwriting the source', async () => {
  const { service: vault, store } = service();
  const first = await vault.restore(backup(), fixture.passphrase, fixture.passphrase);
  const second = await vault.restore(backup(), fixture.passphrase, fixture.passphrase);
  assert.notEqual(first.newProfileId, second.newProfileId); assert.notEqual(first.newKeyId, second.newKeyId);
  assert.notEqual(store.rows.get(first.newProfileId).wrappedKey.salt, store.rows.get(second.newProfileId).wrappedKey.salt);
  assert.equal(store.rows.size, 3);
});
test('G03 validates outer size/schema/checksum before any expensive KDF or storage write', async () => {
  const spy = providerSpy(); const { service: vault, store } = service(new Store(), spy.provider);
  await failure(vault.restore(new Uint8Array(12 * 1024 * 1024 + 1), fixture.passphrase, destinationPass), 'LIMIT_EXCEEDED');
  const wrongChecksum = JSON.parse(new TextDecoder().decode(backup())); wrongChecksum.checksum = '0'.repeat(64);
  await failure(vault.restore(new TextEncoder().encode(JSON.stringify(wrongChecksum)), fixture.passphrase, destinationPass), 'CHECKSUM_MISMATCH');
  const badKdf = clone(fixture.envelope); badKdf.wrappedKey.iterations = 1;
  await failure(vault.restore(backup(badKdf), fixture.passphrase, destinationPass), 'INVALID_INPUT');
  await failure(vault.restore(new TextEncoder().encode(new TextDecoder().decode(backup()).replace('"version":1', '"version":1,"version":1')), fixture.passphrase, destinationPass), 'INVALID_INPUT');
  assert.equal(spy.derivations, 0); assert.equal(store.writes, 0);
});
test('G03 recomputed checksum never authenticates tampered ciphertext and wrong passwords share one fixed error', async () => {
  const { service: vault, store } = service();
  await failure(vault.restore(backup(), 'wrong source password', destinationPass), 'AUTHENTICATION_FAILED');
  const tampered = clone(fixture.envelope); const bytes = Buffer.from(tampered.snapshot.ciphertext, 'base64url'); bytes[0] ^= 1; tampered.snapshot.ciphertext = bytes.toString('base64url');
  await failure(vault.restore(backup(tampered), fixture.passphrase, destinationPass), 'AUTHENTICATION_FAILED'); assert.equal(store.writes, 0);
});
test('G03 permits only one recovery job across service instances until the actual crypto work settles', async () => {
  const held = deferred(), entered = deferred();
  const spy = providerSpy(); const subtle = new Proxy(spy.provider.subtle, { get(target, key) {
    if (key === 'deriveKey') return async (...args) => { entered.resolve(); await held.promise; return target.deriveKey(...args); };
    return Reflect.get(target, key);
  } });
  const { service: a } = service(new Store(), { ...spy.provider, subtle }); const { service: b } = service();
  const pending = a.restore(backup(), fixture.passphrase, destinationPass); await entered.promise;
  await failure(b.restore(backup(), fixture.passphrase, destinationPass), 'BUSY');
  a.dispose(); await failure(b.restore(backup(), fixture.passphrase, destinationPass), 'BUSY');
  held.resolve(); await failure(pending, 'LOCKED');
  assert.equal((await b.restore(backup(), fixture.passphrase, destinationPass)).revision, 0);
});
test('G03 cancellation before storage and disposal preserve the old profile and suppress late plaintext', async () => {
  const { service: vault, store } = service(); const controller = new AbortController(); controller.abort();
  await failure(vault.restore(backup(), fixture.passphrase, destinationPass, controller.signal), 'CANCELLED');
  store.beforeAdd = () => { controller.abort(); };
  const second = new AbortController(); store.beforeAdd = () => { second.abort(); };
  await failure(vault.restore(backup(), fixture.passphrase, destinationPass, second.signal), 'CANCELLED');
  assert.equal(store.rows.size, 1); assert.equal(store.writes, 0);
  vault.dispose(); await failure(vault.restore(backup(), fixture.passphrase, destinationPass), 'LOCKED');
});
test('G03 completed add wins concurrent cancellation/disposal and returns only the restore receipt', async () => {
  const { service: vault, store } = service(); const controller = new AbortController();
  store.afterAdd = () => { controller.abort(); vault.dispose(); };
  const result = await vault.restore(backup(), fixture.passphrase, destinationPass, controller.signal);
  assert.deepEqual(Object.keys(result).sort(), ['newKeyId', 'newProfileId', 'records', 'revision', 'sourceProfileId']);
  assert.equal(store.rows.size, 2); assert.equal(store.writes, 1);
});
test('G03 quota and random profile collisions fail without deleting or replacing the old row', async () => {
  const { service: vault, store } = service(); store.failure = 'QUOTA_EXCEEDED';
  await failure(vault.restore(backup(), fixture.passphrase, destinationPass), 'QUOTA_EXCEEDED'); assert.equal(store.rows.size, 1);
  const provider = { subtle: webcrypto.subtle, getRandomValues(bytes) {
    webcrypto.getRandomValues(bytes); if (bytes.length === 16) bytes.set(Buffer.from(fixture.envelope.profileId, 'hex')); return bytes;
  } };
  const other = service(new Store(), provider);
  await failure(other.service.restore(backup(), fixture.passphrase, destinationPass), 'ALREADY_EXISTS'); assert.equal(other.store.writes, 0);
});

test('G03 rejects failed final destination authentication before making any destination row', async () => {
  let decryptions = 0;
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, { get(target, name) {
    if (name === 'decrypt') return (...args) => { if (++decryptions === 3) return Promise.reject(new Error('SECRET final auth failure')); return target.decrypt(...args); };
    const member = Reflect.get(target, name); return typeof member === 'function' ? member.bind(target) : member;
  } }) };
  const { service: vault, store } = service(new Store(), provider);
  await failure(vault.restore(backup(), fixture.passphrase, destinationPass), 'AUTHENTICATION_FAILED');
  assert.equal(decryptions, 3); assert.equal(store.rows.size, 1); assert.equal(store.writes, 0);
});
test('G03 restore snapshots caller ciphertext before awaits and retains pending trade payload bindings verbatim', async () => {
  const { createEnvelope, encryptRevision } = await import('../src/vault-crypto.ts');
  const record = { id: 'ff'.repeat(16), kind: 'trade', schemaVersion: 1, payload: Buffer.from(JSON.stringify({ chain: 'evm', network: 'eip155:1', deployment: 'escrow-v1', oldProfileId: fixture.envelope.profileId, pendingIntent: 'unknown-broadcast' })).toString('base64url') };
  const original = { ...clone(fixture.snapshot), records: [...clone(fixture.snapshot.records), record].sort((a, b) => a.id.localeCompare(b.id)) };
  const sealed = await createEnvelope(original, fixture.passphrase, webcrypto);
  let historical;
  try { historical = await encryptRevision(sealed.material, { ...original, revision: 1 }, 0); } finally { disposeMaterial(sealed.material); }
  const bytes = backup(historical); const { service: vault, store } = service(); const pending = vault.restore(bytes, fixture.passphrase, destinationPass);
  bytes.fill(0);
  const receipt = await pending; const opened = await openEnvelope(store.rows.get(receipt.newProfileId), destinationPass, webcrypto);
  try { assert.equal(opened.snapshot.revision, 0); assert.deepEqual(opened.snapshot.records, original.records); } finally { disposeMaterial(opened.material); }
});
test('G03 actual destination collision uses add failure and leaves every existing encrypted row intact', async () => {
  const destinationId = 'f0'.repeat(16); let ids = 0;
  const provider = { subtle: webcrypto.subtle, getRandomValues(bytes) {
    webcrypto.getRandomValues(bytes); if (bytes.length === 16 && ++ids === 1) bytes.set(Buffer.from(destinationId, 'hex')); return bytes;
  } };
  const store = new Store(); store.rows.set(destinationId, { opaque: 'existing ciphertext sentinel' }); const before = clone([...store.rows]);
  const { service: vault } = service(store, provider);
  await failure(vault.restore(backup(), fixture.passphrase, destinationPass), 'ALREADY_EXISTS');
  assert.deepEqual([...store.rows], before); assert.equal(store.writes, 0);
});
test('G03 abort during native final verification suppresses persistence and eventually releases the job slot', async () => {
  const entered = deferred(), held = deferred(); let decryptions = 0;
  const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, { get(target, name) {
    if (name === 'decrypt') return async (...args) => { if (++decryptions === 3) { entered.resolve(); await held.promise; } return target.decrypt(...args); };
    const member = Reflect.get(target, name); return typeof member === 'function' ? member.bind(target) : member;
  } }) };
  const { service: vault, store } = service(new Store(), provider); const controller = new AbortController();
  const pending = vault.restore(backup(), fixture.passphrase, destinationPass, controller.signal); await entered.promise; controller.abort(); held.resolve();
  await failure(pending, 'CANCELLED'); assert.equal(store.writes, 0);
  assert.equal((await vault.restore(backup(), fixture.passphrase, destinationPass)).revision, 0);
});
test('G03 rejects a signal that is not an AbortSignal before claiming the recovery slot', async () => {
  const { service: vault, store } = service();
  for (const signal of [new AbortController(), {}, { aborted: false, addEventListener() { throw new Error('SECRET'); } }]) {
    await failure(vault.exportWithStatus(fixture.envelope.profileId, signal), 'INVALID_INPUT');
    await failure(vault.restore(backup(), fixture.passphrase, destinationPass, signal), 'INVALID_INPUT');
  }
  assert.equal(store.writes, 0);
  // The slot was never claimed, so a well-formed job in any instance still runs.
  assert.equal((await service().service.exportWithStatus(fixture.envelope.profileId)).authentication, 'not-checked');
});
