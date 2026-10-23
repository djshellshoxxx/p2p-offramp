import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IndexedDbVaultStore } from '../src/idb-vault-store.ts';
import { EncryptedVaultService } from '../src/vault-service.ts';
import { webcrypto } from 'node:crypto';
const envelope = JSON.parse(await readFile(new URL('./fixtures/vault-python-v1.json', import.meta.url))).envelope;
const profileId = envelope.profileId;
const copy = value => structuredClone(value);
const originalSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
process.on('exit', () => { if (originalSecure) Object.defineProperty(globalThis, 'isSecureContext', originalSecure); else Reflect.deleteProperty(globalThis, 'isSecureContext'); });
const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
function factory() {
  const requests = [];
  return { requests, open() { const request = {}; requests.push(request); return request; } };
}
function database({ syncError, existing = envelope } = {}) {
  let closes = 0;
  const db = { get closes() { return closes; }, close() { closes++; }, transaction(_name, mode) {
    let aborted = false;
    const tx = { error: null, abort() { if (aborted) throw new DOMException('done', 'InvalidStateError'); aborted = true; queueMicrotask(() => tx.onabort?.()); }, objectStore() {
      return { keyPath: 'profileId', get() {
        const request = { result: copy(existing) };
        queueMicrotask(() => { if (!aborted) { request.onsuccess?.(); queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); }); } });
        return request;
      }, add() { if (syncError) throw syncError; const request = {}; queueMicrotask(() => { if (!aborted) { request.onsuccess?.(); tx.oncomplete?.(); } }); return request; },
      put() { if (syncError) throw syncError; const request = {}; queueMicrotask(() => { if (!aborted) { request.onsuccess?.(); tx.oncomplete?.(); } }); return request; } };
    } };
    return tx;
  } };
  return db;
}
const failed = (call, code) => assert.rejects(call, error => error.code === code && !error.message.includes('SECRET'));

test('IDB failed opens retry after remediation without a cached rejection', async () => {
  const fake = factory(); const store = new IndexedDbVaultStore(fake);
  const first = store.get(profileId); fake.requests[0].error = new DOMException('SECRET', 'UnknownError'); fake.requests[0].onerror();
  await failed(first, 'STORAGE_UNAVAILABLE');
  const next = store.get(profileId); void next.catch(() => undefined); await flush();
  assert.equal(fake.requests.length, 2);
  fake.requests[1].result = database(); fake.requests[1].onsuccess();
  assert.deepEqual(await next, envelope);
});
test('IDB late blocked-open success closes only itself and preserves the newer cached connection', async () => {
  const fake = factory(); const store = new IndexedDbVaultStore(fake);
  const first = store.get(profileId); fake.requests[0].onblocked(); await failed(first, 'STORAGE_UNAVAILABLE');
  const second = store.get(profileId); void second.catch(() => undefined); await flush(); assert.equal(fake.requests.length, 2);
  const late = database(), active = database(); fake.requests[0].result = late; fake.requests[0].onsuccess();
  fake.requests[1].result = active; fake.requests[1].onsuccess(); await second;
  assert.equal(late.closes, 1); assert.equal(active.closes, 0);
  await store.get(profileId); assert.equal(fake.requests.length, 2);
});
test('IDB synchronous add/put quota and unknown storage exceptions preserve their typed failure', async () => {
  for (const [exception, code] of [[new DOMException('SECRET', 'QuotaExceededError'), 'QUOTA_EXCEEDED'], [new Error('SECRET'), 'STORAGE_UNAVAILABLE']]) {
    for (const operation of ['add', 'compareAndSwap']) {
      const fake = factory(); const store = new IndexedDbVaultStore(fake);
      const replacement = { ...copy(envelope), revision: envelope.revision + 1 };
      const pending = operation === 'add' ? store.add(envelope) : store.compareAndSwap(envelope, replacement);
      await flush(); fake.requests[0].result = database({ syncError: exception }); fake.requests[0].onsuccess();
      await failed(pending, code);
    }
  }
});
test('IDB close is terminal, closes its connection and invalidates subscribers once', async () => {
  const fake = factory(); const store = new IndexedDbVaultStore(fake); let invalidations = 0;
  store.subscribeInvalidation(() => { invalidations++; });
  const first = store.get(profileId); const db = database(); fake.requests[0].result = db; fake.requests[0].onsuccess(); await first;
  store.close(); store.close(); assert.equal(db.closes, 1); assert.equal(invalidations, 1);
  await failed(store.get(profileId), 'STORAGE_UNAVAILABLE'); assert.equal(fake.requests.length, 1);
});
test('IDB close rejects pending opens and closes any connection which arrives later', async () => {
  const fake = factory(); const store = new IndexedDbVaultStore(fake);
  const pending = store.get(profileId); store.close(); await failed(pending, 'STORAGE_UNAVAILABLE');
  const late = database(); fake.requests[0].result = late; fake.requests[0].onsuccess(); assert.equal(late.closes, 1);
});
test('service disposal closes only owned stores; injected shared storage remains usable', async () => {
  const listeners = new Set(); let closes = 0;
  const shared = { get: async () => copy(envelope), add: async () => {}, compareAndSwap: async () => {}, subscribeInvalidation(listener) { listeners.add(listener); return () => listeners.delete(listener); }, close() { closes++; for (const listener of listeners) listener(); } };
  const a = new EncryptedVaultService(shared, webcrypto, { lifecycle: false });
  const b = new EncryptedVaultService(shared, webcrypto, { lifecycle: false });
  a.dispose(); assert.equal(closes, 0); assert.equal(listeners.size, 1);
  assert.equal((await b.exportEncrypted(profileId)).ok, true);
  const owned = new EncryptedVaultService(shared, webcrypto, { lifecycle: false, ownsStore: true }); owned.dispose(); assert.equal(closes, 1);
  b.dispose();
});

test('default service disposal closes its privately created IndexedDB store', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'); const fake = factory();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fake });
  try {
    const service = new EncryptedVaultService(undefined, webcrypto, { lifecycle: false });
    const pending = service.exportEncrypted(profileId); const db = database(); fake.requests[0].result = db; fake.requests[0].onsuccess();
    assert.equal((await pending).ok, true); service.dispose(); assert.equal(db.closes, 1);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor); else Reflect.deleteProperty(globalThis, 'indexedDB'); }
});
test('synchronous IDB read failures are normalized and transactions are aborted', async () => {
  const fake = factory(); const store = new IndexedDbVaultStore(fake); const db = database();
  const original = db.transaction;
  let aborted = 0;
  db.transaction = (...args) => {
    const tx = original(...args); const objectStore = tx.objectStore; const abort = tx.abort;
    tx.abort = () => { aborted++; abort(); };
    tx.objectStore = () => ({ ...objectStore(), get() { throw new Error('SECRET diagnostic'); } });
    return tx;
  };
  const pending = store.get(profileId); fake.requests[0].result = db; fake.requests[0].onsuccess();
  await failed(pending, 'STORAGE_UNAVAILABLE'); assert.equal(aborted, 1);
});

test('IDB stale guards and abort signals return fixed cancellation before opening storage', async () => {
  const fake = factory(); const store = new IndexedDbVaultStore(fake);
  const cancelled = new AbortController(); cancelled.abort();
  await failed(store.add(envelope, { signal: cancelled.signal }), 'CANCELLED');
  await failed(store.add(envelope, { assertCurrent() { throw new Error('SECRET stale scope'); } }), 'CANCELLED');
  assert.equal(fake.requests.length, 0);
});
