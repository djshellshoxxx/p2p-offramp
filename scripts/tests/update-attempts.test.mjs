import test from 'node:test';
import assert from 'node:assert/strict';
import { AttemptLedger, MAX_UPDATE_ATTEMPTS } from '../fixtures/update-attempts.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const turn = () => new Promise(resolve => setImmediate(resolve));

test('admission owns a frozen pending state before the callback runs', async () => {
  const ledger = new AttemptLedger();
  let calls = 0;
  const id = ledger.start(async () => { calls++; return 'first'; });
  const pending = ledger.read(id);
  assert.equal(id, 1); assert.equal(calls, 0);
  assert.deepEqual(pending, { id, state: 'pending' });
  assert.equal(Object.isFrozen(pending), true);
  assert.throws(() => { pending.state = 'completed'; }, TypeError);
  assert.equal(await ledger.wait(id), 'first');
  assert.equal(calls, 1);
  assert.deepEqual(ledger.read(id), { id, state: 'completed', result: 'first' });
  assert.equal(Object.isFrozen(ledger.read(id)), true);
  assert.deepEqual(pending, { id, state: 'pending' }, 'a retained pending snapshot is not rewritten');
});

test('a previous completed result cannot satisfy a fresh pending attempt', async () => {
  const ledger = new AttemptLedger();
  const first = ledger.start(async () => ({ accepted: true }));
  await ledger.wait(first);
  const held = deferred(), second = ledger.start(() => held.promise);
  assert.notEqual(first, second);
  assert.deepEqual(ledger.read(second), { id: second, state: 'pending' });
  await turn();
  assert.equal(ledger.read(second).state, 'pending');
  assert.equal(ledger.read(first).state, 'completed');
  held.resolve({ accepted: false });
  assert.deepEqual(await ledger.wait(second), { accepted: false });
  assert.deepEqual(ledger.read(first), { id: first, state: 'completed', result: { accepted: true } });
  assert.deepEqual(ledger.read(second), { id: second, state: 'completed', result: { accepted: false } });
});

test('out-of-order and late completions retain their exact admitted identities', async () => {
  const ledger = new AttemptLedger(), held = [deferred(), deferred(), deferred()];
  const ids = held.map(item => ledger.start(() => item.promise));
  assert.deepEqual(ids, [1, 2, 3]);
  held[1].resolve('second'); await ledger.wait(ids[1]);
  assert.equal(ledger.read(ids[0]).state, 'pending');
  assert.equal(ledger.read(ids[2]).state, 'pending');
  held[0].resolve('late first'); await ledger.wait(ids[0]);
  assert.deepEqual(ledger.read(ids[1]), { id: ids[1], state: 'completed', result: 'second' });
  assert.deepEqual(ledger.read(ids[2]), { id: ids[2], state: 'pending' });
  held[2].resolve('third'); await ledger.wait(ids[2]);
  assert.deepEqual(ids.map(id => ledger.read(id).result), ['late first', 'second', 'third']);
});

test('synchronous throws and polled-only rejections are attributed without unhandled rejection', async () => {
  const ledger = new AttemptLedger(), failure = Error('controlled rejection'), held = deferred();
  const thrown = ledger.start(() => { throw failure; });
  const rejected = ledger.start(() => held.promise);
  const succeeding = ledger.start(async () => 'unrelated success');
  held.reject('controlled delayed rejection');
  // No wait/rejection handler is installed by the caller until after a complete event-loop turn.
  await turn();
  for (const id of [thrown, rejected]) {
    assert.deepEqual(ledger.read(id), { id, state: 'failed', error: 'UPDATE_ATTEMPT_FAILED' });
    assert.equal(Object.isFrozen(ledger.read(id)), true);
  }
  assert.deepEqual(ledger.read(succeeding), { id: succeeding, state: 'completed', result: 'unrelated success' });
  await assert.rejects(ledger.wait(thrown), error => error === failure);
  await assert.rejects(ledger.wait(rejected), error => error === 'controlled delayed rejection');
});

test('unknown IDs fail and known IDs have one stable owned promise', async () => {
  const ledger = new AttemptLedger();
  for (const id of [0, -1, 1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, '1', null]) {
    assert.throws(() => ledger.read(id), /UNKNOWN_UPDATE_ATTEMPT/);
    assert.throws(() => ledger.wait(id), /UNKNOWN_UPDATE_ATTEMPT/);
  }
  assert.throws(() => ledger.start(null), /INVALID_UPDATE_ATTEMPT/);
  const first = ledger.start(async () => 1);
  assert.equal(first, 1, 'invalid admission cannot consume or reuse an ID');
  assert.equal(ledger.wait(first), ledger.wait(first));
  await ledger.wait(first);
  assert.equal(ledger.start(async () => 2), 2, 'completed IDs are never reused');
  await ledger.wait(2);
});

test('completed attempts retain their IDs and total admission remains bounded', async () => {
  const ledger = new AttemptLedger();
  const ids = Array.from({ length: MAX_UPDATE_ATTEMPTS }, (_, index) => ledger.start(async () => index));
  assert.equal(new Set(ids).size, MAX_UPDATE_ATTEMPTS);
  assert.equal(ids.at(-1), MAX_UPDATE_ATTEMPTS);
  await Promise.all(ids.map(id => ledger.wait(id)));
  let called = false;
  assert.throws(() => ledger.start(async () => { called = true; }), /UPDATE_ATTEMPT_LIMIT/);
  await turn(); assert.equal(called, false);
  assert.deepEqual(ledger.read(1), { id: 1, state: 'completed', result: 0 });
  assert.throws(() => ledger.read(MAX_UPDATE_ATTEMPTS + 1), /UNKNOWN_UPDATE_ATTEMPT/);
});
