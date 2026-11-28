import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { IndexedDbAcceptedReleaseStore } from '../src/release-update-store.ts';

const secure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
process.on('exit', () => secure ? Object.defineProperty(globalThis, 'isSecureContext', secure) : Reflect.deleteProperty(globalThis, 'isSecureContext'));
const channel = 'independent-open-fixture', keyId = 'a'.repeat(64);
const row = sequence => ({ v: 1, channel, keyId, sequence, manifestSha256: 'b'.repeat(64) });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const clean = (...controllers) => controllers.forEach(controller => assert.equal(getEventListeners(controller.signal, 'abort').length, 0));

function observe(promise) {
  const result = { status: 'pending', value: undefined };
  result.done = promise.then(value => { result.status = 'resolved'; result.value = value; }, error => {
    result.status = 'rejected'; result.value = error.message;
  });
  return result;
}

function fixture() {
  const requests = [];
  const factory = { open() { const request = {}; requests.push(request); return request; } };
  const store = new IndexedDbAcceptedReleaseStore(channel, keyId, factory);
  return { store, requests };
}

// Explicitly driven events make each native-open/transaction ordering visible in the test.
function connection(initial) {
  const db = {
    stored: structuredClone(initial), closes: 0, transactions: [], writes: [],
    close() { this.closes++; },
    transaction(name, mode, options) {
      let request, staged, aborted = false;
      const tx = {
        name, mode, options,
        abort() { if (!aborted) { aborted = true; queueMicrotask(() => tx.onabort?.()); } },
        objectStore() { return {
          get() { request = { result: structuredClone(db.stored), transaction: tx }; return request; },
          put(value) { assert.equal(aborted, false); staged = structuredClone(value); },
        }; },
        complete() {
          assert.equal(aborted, false); assert.ok(request, 'a get must precede transaction completion');
          request.onsuccess();
          if (aborted) return;
          if (staged !== undefined) { db.stored = staged; db.writes.push(structuredClone(staged)); }
          tx.oncomplete();
        },
      };
      db.transactions.push(tx); return tx;
    },
  };
  return db;
}

function succeed(request, db) { request.result = db; request.onsuccess(); }

test('an abort after open resolution but before its continuation starts no transaction', async () => {
  const { store, requests } = fixture(), cancelled = new AbortController(), later = new AbortController();
  const db = connection(row(5)); let authorityChecks = 0, listenersAtAbort;
  const advance = observe(store.advance(row(5), row(6), cancelled.signal, () => { authorityChecks++; }));
  try {
    succeed(requests[0], db);
    // The open success reaction removes its listener before the awaiting operation resumes.
    queueMicrotask(() => { listenersAtAbort = getEventListeners(cancelled.signal, 'abort').length; cancelled.abort(); });
    await flush();
    assert.equal(listenersAtAbort, 0);
    assert.equal(advance.status, 'rejected'); assert.equal(advance.value, 'CANCELLED');
    assert.equal(db.transactions.length, 0); assert.equal(authorityChecks, 0); assert.equal(db.writes.length, 0);
    const read = observe(store.read(later.signal)); await flush();
    assert.equal(db.transactions.length, 1); db.transactions[0].complete(); await read.done;
    assert.deepEqual(read.value, row(5)); assert.equal(requests.length, 1); clean(cancelled, later);
  } finally { store.close(); await advance.done; }
});

test('a cancelled read cannot retire a live advance sharing the same pending connection', async () => {
  const { store, requests } = fixture(), cancelled = new AbortController(), live = new AbortController();
  const db = connection(row(5)); let authorityChecks = 0;
  const read = observe(store.read(cancelled.signal));
  const advance = observe(store.advance(row(5), row(6), live.signal, () => { authorityChecks++; }));
  try {
    cancelled.abort(); await flush();
    assert.equal(read.status, 'rejected'); assert.equal(read.value, 'CANCELLED');
    assert.equal(advance.status, 'pending'); assert.equal(requests.length, 1);
    succeed(requests[0], db); await flush();
    assert.equal(db.transactions.length, 1); assert.equal(db.transactions[0].mode, 'readwrite');
    assert.deepEqual(db.transactions[0].options, { durability: 'strict' });
    db.transactions[0].complete(); await advance.done;
    assert.equal(advance.value, 'written'); assert.equal(authorityChecks, 2);
    assert.deepEqual(db.stored, row(6)); assert.deepEqual(db.writes, [row(6)]); clean(cancelled, live);
    const later = observe(store.read(live.signal)); await flush(); db.transactions[1].complete(); await later.done;
    assert.deepEqual(later.value, row(6)); assert.equal(requests.length, 1); clean(live);
  } finally { store.close(); await Promise.all([read.done, advance.done]); }
});

test('a cancelled old waiter and late failed-open success cannot displace the current connection', async () => {
  const { store, requests } = fixture(), cancelled = new AbortController(), oldLive = new AbortController(), current = new AbortController();
  let authorityChecks = 0;
  const retired = observe(store.advance(row(2), row(3), cancelled.signal, () => { authorityChecks++; }));
  const failed = observe(store.read(oldLive.signal));
  try {
    cancelled.abort(); await flush(); assert.equal(retired.value, 'CANCELLED');
    requests[0].onblocked(); await flush();
    assert.equal(failed.status, 'rejected'); assert.equal(failed.value, 'STORAGE_UNAVAILABLE'); clean(cancelled, oldLive);
    const read = observe(store.read(current.signal)); assert.equal(requests.length, 2);
    const active = connection(row(7)), late = connection(row(2));
    succeed(requests[1], active); await flush();
    assert.equal(active.transactions.length, 1);
    succeed(requests[0], late); await flush();
    assert.equal(late.closes, 1); assert.equal(late.transactions.length, 0); assert.equal(active.closes, 0);
    active.transactions[0].complete(); await read.done; assert.deepEqual(read.value, row(7));
    const again = observe(store.read(current.signal)); await flush(); active.transactions[1].complete(); await again.done;
    assert.deepEqual(again.value, row(7)); assert.equal(requests.length, 2);
    assert.equal(authorityChecks, 0); assert.equal(active.writes.length, 0); assert.equal(late.writes.length, 0); clean(current);
  } finally { store.close(); await Promise.all([retired.done, failed.done]); }
});

test('terminal close settles surviving waiters after a peer cancellation and closes late native success', async () => {
  const { store, requests } = fixture(), cancelled = new AbortController(), live = new AbortController();
  let authorityChecks = 0;
  const read = observe(store.read(cancelled.signal));
  const advance = observe(store.advance(row(5), row(6), live.signal, () => { authorityChecks++; }));
  try {
    cancelled.abort(); await flush(); assert.equal(read.value, 'CANCELLED');
    store.close(); await flush();
    assert.equal(advance.status, 'rejected'); assert.equal(advance.value, 'STORAGE_UNAVAILABLE'); clean(cancelled, live);
    const late = connection(row(5)); succeed(requests[0], late); await flush();
    assert.equal(late.closes, 1); assert.equal(late.transactions.length, 0); assert.equal(late.writes.length, 0);
    assert.equal(authorityChecks, 0); assert.deepEqual(late.stored, row(5));
    await assert.rejects(store.read(live.signal), error => error.message === 'CANCELLED');
    assert.equal(requests.length, 1); store.close(); assert.equal(late.closes, 1);
  } finally { store.close(); await Promise.all([read.done, advance.done]); }
});
