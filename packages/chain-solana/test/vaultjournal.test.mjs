import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { encodeBase64url } from '../../schemas/index.ts';
import { SolanaVaultJournal, solanaJournalRecordId, SOLANA_VAULT_JOURNAL_FORMAT } from '../src/vaultjournal.ts';
import { connected, setupClient } from './lifecycle-support.mjs';
import { error, ok } from './support.mjs';

const PASS = 'synthetic vault journal test passphrase';
const RESTORED_PASS = 'synthetic fresh-key recovery passphrase';
class Store {
  rows = new Map(); writes = 0; beforeWrite; afterCommit;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row, options) {
    options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row)); this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(expected, next); options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) {
      throw new VaultStorageError('CONFLICT');
    }
    this.rows.set(next.profileId, structuredClone(next)); this.writes++;
    this.afterCommit?.(expected, next);
  }
}
async function setup(t) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = ok(await vault.create(PASS));
  const open = current => {
    const journal = new SolanaVaultJournal(vault, current);
    t.after(() => journal.dispose());
    return journal;
  };
  t.after(() => vault.dispose());
  return { store, vault, session, open, journal: open(session) };
}
function client(t, s, options = {}) {
  const env = setupClient('native', { journalFake: { journal: s.journal }, ...options });
  t.after(() => env.client.dispose());
  return env;
}
const records = async (s, env) => ok(await s.journal.read(env.binding)).records;
const sendCount = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;
function land(env, signature, state = 1, paid = 0, err = null) {
  env.cluster.advance(2); env.cluster.land(signature, { err });
  if (err === null) env.cluster.setEscrow({ state, paid });
  env.cluster.advance(1);
}
async function restore(t, s) {
  const backup = new EncryptedBackupService(s.store, crypto);
  const exported = await backup.export(s.session.profileId);
  const receipt = await backup.restore(exported, PASS, RESTORED_PASS);
  const session = ok(await s.vault.unlock(receipt.newProfileId, RESTORED_PASS));
  assert.notEqual(session.profileId, s.session.profileId);
  return { ...s, session, journal: s.open(session) };
}
function intercept(journal, hook) {
  return { profileId: () => journal.profileId(), read: (...args) => journal.read(...args),
    write: (...args) => hook(args, () => journal.write(...args)) };
}
async function templates() {
  const rows = [], env = setupClient('native', {
    journal: { hooks: { after: record => { rows.push(structuredClone(record)); } } },
  });
  try { ok(await env.client.release(env.trade, await connected(env, 'seller'))); }
  finally { env.client.dispose(); }
  return { binding: env.binding, rows };
}
const forProfile = (record, s) => ({ ...structuredClone(record), originProfileId: s.session.profileId });

test('vault journal preserves full release/payout records through real encrypted fresh-key restore', async t => {
  const s = await setup(t), env = client(t, s);
  assert.deepEqual(ok(await s.journal.read(env.binding)), { revision: 0, records: [] });
  assert.equal(s.store.writes, 1, 'empty freshness reads do not encrypt another revision');
  env.cluster.handle = async input => {
    if (input.method === 'sendTransaction') {
      assert.equal((await records(s, env)).at(-1).state, 'sendMarked', 'durable marker precedes physical send');
    }
  };
  const release = ok(await env.client.release(env.trade, await connected(env, 'seller')));
  land(env, release.signature);
  assert.equal(ok(await env.client.reconcile(env.trade))[0].state, 'finalized');
  env.cluster.handle = undefined;
  const payout = ok(await env.client.payout(env.trade, await connected(env, 'buyer')));
  land(env, payout.signature, 1, 1);
  const before = ok(await env.client.reconcile(env.trade));
  assert.deepEqual(before.map(record => record.action).sort(), ['payout', 'release']);
  assert.ok(before.every(record => record.state === 'finalized' && record.outcome.err === null));
  const persisted = JSON.stringify(s.store.rows.get(s.session.profileId));
  for (const record of before) {
    for (const plaintext of [record.message, record.signature, record.intentId, record.binding.tradeId]) {
      assert.ok(!persisted.includes(plaintext), 'only ciphertext is stored by the backing store');
    }
  }
  const restored = await restore(t, s), resumed = client(t, restored, { terms: env.terms, cluster: env.cluster });
  assert.deepEqual(ok(await resumed.client.recover(resumed.trade)), before);
  assert.equal(sendCount(env), 2, 'restoring terminal records sends nothing');
});

test('pre-marker signature and original profile survive backup and reconcile after fresh-key restore', async t => {
  const s = await setup(t), journal = intercept(s.journal, (args, write) => args[2].state === 'sendMarked'
    ? { ok: false, error: { code: 'UNAVAILABLE' } } : write());
  const env = client(t, s, { journalFake: { journal } });
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'UNAVAILABLE');
  const [signed] = await records(s, env);
  assert.equal(signed.state, 'signed'); assert.equal(signed.sendMarkedAt, null); assert.ok(signed.signature);
  const restored = await restore(t, s), resumed = client(t, restored, { terms: env.terms, cluster: env.cluster });
  assert.deepEqual(ok(await resumed.client.recover(resumed.trade)), [signed]);
  const revision = ok(await restored.journal.read(env.binding)).revision;
  error(await restored.journal.write(env.binding, revision, { ...signed, state: 'cancelled',
    updatedAt: signed.updatedAt + 1 }), 'CONFLICT');
  error(await resumed.client.release(resumed.trade, await connected(resumed, 'seller')), 'CONFLICT');
  assert.equal(sendCount(env), 0);
  land(env, signed.signature);
  const [settled] = ok(await resumed.client.reconcile(resumed.trade));
  assert.equal(settled.state, 'finalized'); assert.equal(settled.originProfileId, s.session.profileId);
  assert.equal(settled.signature, signed.signature); assert.equal(settled.sendMarkedAt, null);
  assert.deepEqual(settled.outcome, { slot: String(env.cluster.slot - 1), err: null });
});

test('uncertain send remains blocked across restore until finalized expiry and an explicit rebuild', async t => {
  const s = await setup(t), env = client(t, s, {
    clusterOptions: { sendBehavior: () => { throw Error('synthetic unknown transport'); } },
  });
  const sent = ok(await env.client.release(env.trade, await connected(env, 'seller')));
  assert.equal(sent.state, 'unknown');
  const [unknown] = await records(s, env), restored = await restore(t, s);
  const resumed = client(t, restored, { terms: env.terms, cluster: env.cluster, seed: 'restored' });
  assert.deepEqual(ok(await resumed.client.recover(resumed.trade)), [unknown]);
  error(await resumed.client.release(resumed.trade, await connected(resumed, 'seller')), 'CONFLICT');
  assert.equal(sendCount(env), 1);
  env.cluster.advance(Number(unknown.lastValidBlockHeight) + 1 - env.cluster.height);
  const [dropped] = ok(await resumed.client.reconcile(resumed.trade));
  assert.equal(dropped.state, 'dropped'); assert.equal(dropped.sendMarkedAt, unknown.sendMarkedAt);
  error(await resumed.client.release(resumed.trade, await connected(resumed, 'seller')), 'CONFLICT');
  env.cluster.sendBehavior = undefined;
  const rebuilt = ok(await resumed.client.release(resumed.trade, await connected(resumed, 'seller'),
    { rebuildOf: unknown.intentId }));
  assert.notEqual(rebuilt.intentId, unknown.intentId); assert.equal(sendCount(env), 2);
});

test('vault lock before the marker CAS prevents both the write and physical broadcast', async t => {
  const s = await setup(t), env = client(t, s);
  s.store.beforeWrite = (_previous, next) => { if (next.revision === 3) s.vault.lock(s.session.sessionId); };
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'LOCKED');
  assert.equal(sendCount(env), 0); assert.equal(s.store.writes, 3);
  const reopened = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  const [record] = ok(await reopened.read(env.binding)).records;
  assert.equal(record.state, 'signed'); assert.equal(record.sendMarkedAt, null);
});

test('uncertain marker commit retains durable recovery state and never broadcasts', async t => {
  const s = await setup(t), env = client(t, s);
  s.store.afterCommit = (_previous, next) => {
    if (next.revision === 3) throw new VaultStorageError('STORAGE_UNAVAILABLE');
  };
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'UNAVAILABLE');
  assert.equal(sendCount(env), 0);
  s.store.afterCommit = undefined;
  const reopened = { ...s, journal: s.open(ok(await s.vault.unlock(s.session.profileId, PASS))) };
  const resumed = client(t, reopened, { terms: env.terms, cluster: env.cluster });
  const [marked] = ok(await resumed.client.recover(resumed.trade));
  assert.equal(marked.state, 'sendMarked'); assert.ok(marked.sendMarkedAt !== null);
  error(await resumed.client.release(resumed.trade, await connected(resumed, 'seller')), 'CONFLICT');
  assert.equal(sendCount(env), 0);
});

test('lock after a successful marker CAS is uncertain and preserves the marker without sending', async t => {
  const s = await setup(t), env = client(t, s);
  s.store.afterCommit = (_previous, next) => { if (next.revision === 3) s.vault.lock(s.session.sessionId); };
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'UNAVAILABLE');
  assert.equal(sendCount(env), 0);
  const reopened = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  const [marked] = ok(await reopened.read(env.binding)).records;
  assert.equal(marked.state, 'sendMarked'); assert.ok(marked.signature); assert.ok(marked.sendMarkedAt !== null);
});

test('lock in the final physical-dispatch microtask prevents broadcast after a durable marker', async t => {
  const s = await setup(t);
  let locked = false, sentAfterLock = false;
  const journal = intercept(s.journal, async (args, write) => {
    const result = await write();
    if (args[2].state === 'sendMarked') {
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => {
        locked = true; s.vault.lock(s.session.sessionId);
      })));
    }
    return result;
  });
  const env = client(t, s, { journalFake: { journal } });
  env.cluster.handle = input => { if (input.method === 'sendTransaction') sentAfterLock = locked; };
  await env.client.release(env.trade, await connected(env, 'seller'));
  assert.equal(locked, true); assert.equal(sentAfterLock, false);
  assert.equal(sendCount(env), 0);
  const reopened = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  assert.equal(ok(await reopened.read(env.binding)).records[0].state, 'sendMarked');
});

test('failed payout error and signature survive encrypted restore with the release still finalized', async t => {
  const s = await setup(t), env = client(t, s);
  const release = ok(await env.client.release(env.trade, await connected(env, 'seller')));
  land(env, release.signature); ok(await env.client.reconcile(env.trade));
  const payout = ok(await env.client.payout(env.trade, await connected(env, 'buyer')));
  land(env, payout.signature, 1, 0, { InstructionError: [0, { Custom: 6016 }] });
  const before = ok(await env.client.reconcile(env.trade));
  const failed = before.find(record => record.intentId === payout.intentId);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.outcome.err, 'InstructionError:0:Custom:6016');
  assert.equal(before.find(record => record.intentId === release.intentId).state, 'finalized');
  const restored = await restore(t, s), resumed = client(t, restored, { terms: env.terms, cluster: env.cluster });
  assert.deepEqual(ok(await resumed.client.recover(resumed.trade)), before);
  assert.equal(sendCount(env), 2);
});

test('32 terminal native intents fill the bound without discarding earlier recovery records', async t => {
  const s = await setup(t), { binding, rows } = await templates(), prepared = forProfile(rows[0], s);
  const list = Array.from({ length: 32 }, (_, index) => ({ ...prepared, state: 'cancelled',
    intentId: encodeBase64url(new Uint8Array(32).fill(index)), createdAt: index, updatedAt: index }));
  list.sort((a, b) => a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0);
  const payload = { format: SOLANA_VAULT_JOURNAL_FORMAT, binding, revision: 32, records: list };
  const record = { id: solanaJournalRecordId(binding), kind: 'journal', schemaVersion: 1,
    payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(payload))) };
  ok(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record }]));
  assert.equal(ok(await s.journal.read(binding)).records.length, 32);
  error(await s.journal.write(binding, 32, prepared), 'LIMIT_EXCEEDED');
  assert.equal(s.store.writes, 2);
  assert.deepEqual(ok(await s.vault.read(s.session.sessionId, record.id)), record);
});

test('per-trade CAS snapshots inputs and refuses stale writes or changes to immutable intent fields', async t => {
  const s = await setup(t), { binding, rows } = await templates();
  const prepared = forProfile(rows[0], s), pending = s.journal.write(binding, 0, prepared);
  prepared.programDataSha256 = 'ff'.repeat(32);
  assert.equal(ok(await pending), 1);
  const [stored] = ok(await s.journal.read(binding)).records;
  assert.equal(stored.programDataSha256, rows[0].programDataSha256);
  error(await s.journal.write(binding, 0, forProfile(rows[1], s)), 'CONFLICT');
  error(await s.journal.write(binding, 1, { ...forProfile(rows[1], s), programDataSha256: 'ff'.repeat(32) }),
    'CONFLICT');
  assert.equal(ok(await s.journal.write(binding, 1, forProfile(rows[1], s))), 2);
  error(await s.journal.write(binding, 2, forProfile(rows[0], s)), 'CONFLICT');
  error(await s.journal.write(binding, 2, forProfile(rows[3], s)), 'CONFLICT');
  assert.equal(ok(await s.journal.write(binding, 2, forProfile(rows[2], s))), 3);
  assert.equal(ok(await s.journal.write(binding, 3, forProfile(rows[3], s))), 4);
  assert.deepEqual(ok(await s.journal.read(binding)).records, [forProfile(rows[3], s)]);
});

test('concurrent vault sessions cannot both reserve one trade and stale reads fail freshness checks', async t => {
  const s = await setup(t), { binding, rows } = await templates();
  const second = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  const third = s.open(ok(await s.vault.unlock(s.session.profileId, PASS)));
  assert.equal(ok(await third.read(binding)).revision, 0);
  const prepared = forProfile(rows[0], s);
  const results = await Promise.all([s.journal.write(binding, 0, prepared), second.write(binding, 0, prepared)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  error(results.find(result => !result.ok), 'CONFLICT');
  error(await third.read(binding), 'CONFLICT');
  assert.equal(s.store.writes, 2);
});

test('foreign, future, duplicate and oversized records fail closed without overwriting stored data', async t => {
  const s = await setup(t), { binding, rows } = await templates(), id = solanaJournalRecordId(binding);
  const prepared = forProfile(rows[0], s);
  const payload = { format: SOLANA_VAULT_JOURNAL_FORMAT, binding, revision: 1, records: [prepared] };
  const wrap = data => ({ id, kind: 'journal', schemaVersion: 1,
    payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(data))) });
  const cases = [
    [{ ...wrap(payload), kind: 'preference' }, 'INTEGRITY_FAILURE'],
    [{ ...wrap(payload), schemaVersion: 2 }, 'UNSUPPORTED_VERSION'],
    [wrap({ ...payload, format: 'future' }), 'UNSUPPORTED_VERSION'],
    [wrap({ ...payload, binding: { ...binding, networkId: 'different' } }), 'INTEGRITY_FAILURE'],
    [wrap({ ...payload, records: [prepared, prepared] }), 'INTEGRITY_FAILURE'],
    [wrap({ ...payload, records: Array(33).fill(null) }), 'INTEGRITY_FAILURE'],
  ];
  let revision = 0;
  for (const [record, code] of cases) {
    ok(await s.vault.commit(s.session.sessionId, revision++, [{ op: 'put', record }]));
    const writes = s.store.writes;
    error(await s.journal.read(binding), code);
    error(await s.journal.write(binding, 1, forProfile(rows[1], s)), code);
    assert.equal(s.store.writes, writes);
    assert.deepEqual(ok(await s.vault.read(s.session.sessionId, id)), record);
  }
});

test('invalid signals, accessor inputs, cancellation and disposed sessions have fixed errors', async t => {
  const s = await setup(t), { binding, rows } = await templates();
  let getterCalls = 0;
  const hostile = { ...binding };
  Object.defineProperty(hostile, 'networkId', { get() { getterCalls++; return binding.networkId; } });
  error(await s.journal.read(hostile), 'INVALID_INPUT');
  error(await s.journal.read(binding, { aborted: false }), 'INVALID_INPUT');
  const controller = new AbortController(); controller.abort();
  error(await s.journal.write(binding, 0, forProfile(rows[0], s), controller.signal), 'CANCELLED');
  assert.equal(getterCalls, 0); assert.equal(s.store.writes, 1);
  s.journal.dispose();
  assert.throws(() => s.journal.profileId(), thrown => thrown?.code === 'LOCKED');
  error(await s.journal.read(binding), 'LOCKED');
  error(await s.journal.write(binding, 0, forProfile(rows[0], s)), 'LOCKED');
});
