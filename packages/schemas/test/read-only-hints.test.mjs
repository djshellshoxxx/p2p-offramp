import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRelayOrderHint, parseJournalPendingHint, CoreSchemaError, parseBackupVerificationReceipt,
  ValidationError, encodeBase64url, MAX_REVISION } from '../index.ts';

const digest = 'ab'.repeat(32), maker = 'cd'.repeat(32);
const order = () => ({ orderId: digest, maker, advertisement: { eventId: digest, revision: 1, expiresAtSeconds: '1800000000' }, reason: 'observed' });
const receipt = () => ({ profileId: '12'.repeat(16), revision: 0, scope: 'complete-profile-v1', envelopeSha256: digest, backupSha256: maker });
const coreInvalid = work => assert.throws(work, error => error instanceof CoreSchemaError && error.code === 'INVALID_INPUT');
const backupInvalid = work => assert.throws(work, error => error instanceof ValidationError && error.code === 'INVALID_INPUT');

test('relay hints are frozen scalar observations and require an advertisement exactly for observed', () => {
  const raw = order(), parsed = parseRelayOrderHint(raw);
  assert.deepEqual(parsed, raw); assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.advertisement));
  raw.advertisement.revision = 2; assert.equal(parsed.advertisement.revision, 1);
  for (const reason of ['expired', 'conflict', 'deleted', 'unknown', 'clock-unknown']) {
    assert.equal(parseRelayOrderHint({ ...order(), reason, advertisement: null }).reason, reason);
    coreInvalid(() => parseRelayOrderHint({ ...order(), reason }));
  }
  for (const patch of [{ advertisement: null }, { authority: true }, { maker: maker.toUpperCase() },
    { advertisement: { ...order().advertisement, revision: 0 } },
    { advertisement: { ...order().advertisement, expiresAtSeconds: '01800000000' } }]) {
    coreInvalid(() => parseRelayOrderHint({ ...order(), ...patch }));
  }
});

test('journal hints use canonical code-unit order, bounded unique ids, coherent unknown state', () => {
  const low = encodeBase64url(new Uint8Array(32)), high = encodeBase64url(new Uint8Array(32).fill(255));
  const ids = [high, low], parsed = parseJournalPendingHint({ pendingIntentIds: ids, revision: 7 });
  assert.deepEqual(parsed.pendingIntentIds, [...ids].sort()); assert.ok(Object.isFrozen(parsed.pendingIntentIds));
  ids.reverse(); assert.deepEqual(parsed.pendingIntentIds, [high, low].sort());
  assert.deepEqual(parseJournalPendingHint({ pendingIntentIds: null, revision: null }), { pendingIntentIds: null, revision: null });
  assert.deepEqual(parseJournalPendingHint({ pendingIntentIds: [], revision: 0 }), { pendingIntentIds: [], revision: 0 });
  for (const raw of [{ pendingIntentIds: null, revision: 0 }, { pendingIntentIds: [], revision: null },
    { pendingIntentIds: [low, low], revision: 0 }, { pendingIntentIds: ['bad'], revision: 0 }]) coreInvalid(() => parseJournalPendingHint(raw));
  assert.throws(() => parseJournalPendingHint({ pendingIntentIds: new Array(257), revision: 0 }), error => error.code === 'LIMIT_EXCEEDED');
});

test('read-only hint reflection never runs accessors or promotes foreign diagnostics', () => {
  let reads = 0; const source = order(); Object.defineProperty(source, 'maker', { get() { reads++; return maker; } });
  coreInvalid(() => parseRelayOrderHint(source));
  const ids = [encodeBase64url(new Uint8Array(32))]; Object.defineProperty(ids, '0', { get() { reads++; return ''; } });
  coreInvalid(() => parseJournalPendingHint({ pendingIntentIds: ids, revision: 0 })); assert.equal(reads, 0);
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  coreInvalid(() => parseJournalPendingHint({ pendingIntentIds: revoked.proxy, revision: 0 }));
  coreInvalid(() => parseRelayOrderHint(new Proxy(order(), { ownKeys() { throw Error('SECRET'); } })));
});

test('backup receipt parser freezes exact scalars without granting Worker verification authority', () => {
  const source = receipt(), parsed = parseBackupVerificationReceipt(source);
  assert.deepEqual(parsed, source); assert.ok(Object.isFrozen(parsed)); source.revision = 9; assert.equal(parsed.revision, 0);
  assert.equal(parseBackupVerificationReceipt({ ...receipt(), revision: MAX_REVISION }).revision, MAX_REVISION);
  for (const patch of [{ verified: true }, { scope: 'whole-profile' }, { revision: MAX_REVISION + 1 },
    { revision: -1 }, { profileId: 'x' }, { backupSha256: digest.toUpperCase() }]) backupInvalid(() => parseBackupVerificationReceipt({ ...receipt(), ...patch }));
});

test('backup receipt rejects accessors, inherited records, hidden symbols and hostile reflection', () => {
  let reads = 0; const source = receipt(); Object.defineProperty(source, 'backupSha256', { get() { reads++; return maker; } });
  backupInvalid(() => parseBackupVerificationReceipt(source)); assert.equal(reads, 0);
  backupInvalid(() => parseBackupVerificationReceipt(Object.assign(Object.create({ verified: true }), receipt())));
  const hidden = receipt(); hidden[Symbol('hidden')] = true; backupInvalid(() => parseBackupVerificationReceipt(hidden));
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); backupInvalid(() => parseBackupVerificationReceipt(revoked.proxy));
  backupInvalid(() => parseBackupVerificationReceipt(new Proxy(receipt(), { ownKeys() { throw Error('SECRET'); } })));
});
