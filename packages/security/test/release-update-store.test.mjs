import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDbAcceptedReleaseStore } from '../src/release-update-store.ts';

const secure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
process.on('exit', () => secure ? Object.defineProperty(globalThis, 'isSecureContext', secure) : Reflect.deleteProperty(globalThis, 'isSecureContext'));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const key = '1'.repeat(64), channel = 'fixture-beta';
const signal = () => new AbortController().signal;
const row = (sequence = 2, manifestSha256 = '2'.repeat(64)) => ({ v: 1, channel, keyId: key, sequence, manifestSha256 });
function factory() {
  const requests = [];
  return { requests, open() { const request = {}; requests.push(request); return request; } };
}
function database(initial) {
  let stored = initial, closes = 0;
  const writes = [], transactions = [];
  const db = {
    get closes() { return closes; }, get stored() { return stored; }, writes, transactions,
    close() { closes++; },
    transaction(name, mode, options) {
      transactions.push({ name, mode, options });
      let aborted = false, pending;
      const tx = {
        abort() { if (aborted) return; aborted = true; queueMicrotask(() => tx.onabort?.()); },
        objectStore() { return {
          get() {
            const request = { result: structuredClone(stored), transaction: tx };
            queueMicrotask(() => {
              if (aborted) return;
              request.onsuccess?.();
              queueMicrotask(() => {
                if (aborted) return;
                if (pending !== undefined) { stored = structuredClone(pending); writes.push(stored); }
                tx.oncomplete?.();
              });
            });
            return request;
          },
          put(value) { pending = structuredClone(value); },
        }; },
      };
      return tx;
    },
  };
  return db;
}
async function open(fake, store, db) {
  const pending = store.read(signal());
  fake.requests.at(-1).result = db; fake.requests.at(-1).onsuccess();
  return pending;
}

test('accepted-release storage retries a failed open without resetting the stored rollback floor', async () => {
  const fake = factory(), store = new IndexedDbAcceptedReleaseStore(channel, key, fake);
  const first = store.read(signal()); fake.requests[0].onerror();
  await assert.rejects(first, /STORAGE_UNAVAILABLE/);
  const next = store.read(signal()); void next.catch(() => {}); await flush();
  assert.equal(fake.requests.length, 2, 'a later explicit read opens again after remediation');
  const db = database(row(7)); fake.requests[1].result = db; fake.requests[1].onsuccess();
  assert.deepEqual(await next, row(7)); assert.equal(db.writes.length, 0);
  store.close();
});

test('a late blocked-open success closes itself without evicting the newer connection', async () => {
  const fake = factory(), store = new IndexedDbAcceptedReleaseStore(channel, key, fake);
  const first = store.read(signal()); fake.requests[0].onblocked(); await assert.rejects(first, /STORAGE_UNAVAILABLE/);
  const next = store.read(signal()); void next.catch(() => {}); await flush();
  assert.equal(fake.requests.length, 2);
  const late = database(row(2)), active = database(row(5));
  fake.requests[1].result = active; fake.requests[1].onsuccess(); assert.deepEqual(await next, row(5));
  fake.requests[0].result = late; fake.requests[0].onsuccess(); await flush();
  assert.equal(late.closes, 1); assert.equal(active.closes, 0);
  assert.deepEqual(await store.read(signal()), row(5)); assert.equal(fake.requests.length, 2);
  store.close();
});

test('synchronous open errors remain fixed and can be retried explicitly', async () => {
  const fake = factory(), ordinaryOpen = fake.open; let first = true;
  fake.open = () => { if (first) { first = false; throw Error('PRIVATE driver detail'); } return ordinaryOpen(); };
  const store = new IndexedDbAcceptedReleaseStore(channel, key, fake);
  await assert.rejects(store.read(signal()), error => error.message === 'STORAGE_UNAVAILABLE');
  const next = store.read(signal()); void next.catch(() => {}); await flush(); assert.equal(fake.requests.length, 1);
  fake.requests[0].result = database(row()); fake.requests[0].onsuccess(); assert.deepEqual(await next, row());
  store.close();
});

test('closing accepted-release storage settles its pending open and closes late native success', async () => {
  const fake = factory(), store = new IndexedDbAcceptedReleaseStore(channel, key, fake); let outcome = 'pending';
  const pending = store.read(signal()).then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
  store.close(); await flush();
  assert.equal(outcome, 'rejected', 'terminal disposal cannot strand an update job on its open promise');
  const late = database(row()); fake.requests[0].result = late; fake.requests[0].onsuccess(); await pending;
  assert.equal(late.closes, 1); await assert.rejects(store.read(signal()), /CANCELLED/);
  assert.equal(fake.requests.length, 1);
});

test('rollback-floor CAS preserves idempotence, conflicts, monotonicity and strict durability', async () => {
  const fake = factory(), store = new IndexedDbAcceptedReleaseStore(channel, key, fake), db = database(row(5));
  assert.deepEqual(await open(fake, store, db), row(5));
  assert.equal(await store.advance(null, row(5), signal(), () => {}), 'same');
  assert.equal(await store.advance(row(5), row(5, '3'.repeat(64)), signal(), () => {}), 'conflict');
  assert.equal(await store.advance(row(5), row(4), signal(), () => {}), 'conflict');
  assert.equal(await store.advance(row(4), row(6), signal(), () => {}), 'conflict');
  assert.equal(db.writes.length, 0);
  assert.equal(await store.advance(row(5), row(6), signal(), () => {}), 'written');
  assert.deepEqual(db.stored, row(6)); assert.equal(db.writes.length, 1);
  for (const tx of db.transactions) assert.deepEqual(tx.options, { durability: 'strict' });
  store.close();
});

test('foreign floor or cancelled authority cannot write or erase accepted state', async () => {
  for (const stored of [{ ...row(5), channel: 'foreign' }, { ...row(5), extra: true }]) {
    const fake = factory(), store = new IndexedDbAcceptedReleaseStore(channel, key, fake), db = database(stored);
    await assert.rejects(open(fake, store, db), /STORAGE_UNAVAILABLE/);
    assert.equal(db.writes.length, 0); assert.deepEqual(db.stored, stored); store.close();
  }
  const fake = factory(), store = new IndexedDbAcceptedReleaseStore(channel, key, fake), db = database(row(5));
  await open(fake, store, db);
  await assert.rejects(store.advance(row(5), row(6), signal(), () => { throw Error('stale authority'); }), /STORAGE_UNAVAILABLE/);
  assert.deepEqual(db.stored, row(5)); assert.equal(db.writes.length, 0); store.close();
});
