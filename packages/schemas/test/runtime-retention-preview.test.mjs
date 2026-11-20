import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECORDS, parseRuntimeCommand, parseRuntimeMessage } from '../index.ts';

const profileId = 'a'.repeat(32);
const command = fields => ({ version: 1, requestId: 1, generation: 0, operation: 'planRetention', profileId, nowMs: 30 * 24 * 60 * 60 * 1000, ...fields });
const preview = changes => ({ version: 1, revision: 7, archiveReviewCount: 2, reviewedDeleteCount: 0, protectedCount: 5,
  logicalOnly: true, backupAndRemoteCopiesUnaffected: true, ...changes });
const response = value => ({ version: 1, requestId: 1, generation: 0, operation: 'planRetention', kind: 'response', result: { ok: true, value } });
const invalid = run => assert.throws(run, error => error.code === 'INVALID_INPUT' && !error.message.includes('PRIVATE'));

test('offline retention preview admits an explicit bounded timestamp and current profile command', () => {
  for (const nowMs of [0, 30 * 24 * 60 * 60 * 1000, Number.MAX_SAFE_INTEGER]) {
    const input = command({ nowMs }), parsed = parseRuntimeCommand(input);
    assert.deepEqual(parsed, input);
    assert.notEqual(parsed, input);
    assert.equal(Object.isFrozen(parsed), true);
  }
});

test('offline retention preview returns only a frozen revision and bounded conservative counts', () => {
  for (const value of [preview(), preview({ revision: 0, archiveReviewCount: 0, protectedCount: 0 }),
    preview({ revision: Number.MAX_SAFE_INTEGER, archiveReviewCount: MAX_RECORDS, protectedCount: MAX_RECORDS })]) {
    const parsed = parseRuntimeMessage(response(value));
    assert.deepEqual(parsed.result.value, value);
    assert.notEqual(parsed.result.value, value);
    assert.equal(Object.isFrozen(parsed.result.value), true);
  }
});

test('retention command rejects missing, malformed or extra fields without invoking accessors', () => {
  for (const nowMs of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, undefined, '1', 1n]) invalid(() => parseRuntimeCommand(command({ nowMs })));
  for (const fields of [{ profileId: 'BAD' }, { recordIds: [] }, { consent: true }, { expectedRevision: 7 }, { native: true }, { payload: 'PRIVATE' }]) invalid(() => parseRuntimeCommand(command(fields)));
  let reads = 0;
  invalid(() => parseRuntimeCommand(Object.defineProperty(command(), 'nowMs', { get() { reads++; return 0; } })));
  invalid(() => parseRuntimeCommand({ ...command(), [Symbol('PRIVATE')]: 0 }));
  assert.equal(reads, 0);
});

test('retention replies reject deletion authority, private fields and impossible counts', () => {
  for (const changes of [{ version: 2 }, { revision: -1 }, { revision: 0.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { archiveReviewCount: -1 }, { archiveReviewCount: 0.5 }, { archiveReviewCount: 6 }, { archiveReviewCount: NaN },
    { protectedCount: MAX_RECORDS + 1 }, { protectedCount: -1 }, { protectedCount: 0.5 }, { protectedCount: Infinity },
    { reviewedDeleteCount: 1 }, { reviewedDeleteCount: '0' }, { logicalOnly: false }, { backupAndRemoteCopiesUnaffected: false },
    { planId: 'PRIVATE' }, { recordIds: [] }, { records: [] }, { payload: 'PRIVATE' }, { profileId }]) {
    invalid(() => parseRuntimeMessage(response(preview(changes))));
  }
  let reads = 0;
  invalid(() => parseRuntimeMessage(response(Object.defineProperty(preview(), 'archiveReviewCount', { get() { reads++; return 0; } }))));
  invalid(() => parseRuntimeMessage(response({ ...preview(), [Symbol('PRIVATE')]: 1 })));
  const incomplete = preview(); delete incomplete.protectedCount;
  invalid(() => parseRuntimeMessage(response(incomplete)));
  assert.equal(reads, 0);
});

test('offline preview does not admit native retention review, consent or deletion operations', () => {
  for (const operation of ['reviewRetention', 'deleteReviewedRecords', 'deleteRetention', 'commitRetention']) invalid(() => parseRuntimeCommand(command({ operation })));
});
