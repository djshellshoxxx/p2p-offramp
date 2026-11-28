import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { createSolanaEscrowClient } from '../src/compose.ts';
import { migrateIntents } from '../src/journal.ts';
import { SolanaVaultJournal } from '../src/vaultjournal.ts';
import { BUYER, CHAIN, connected, makeCluster, makeWallet, MARGINS, SELLER } from './lifecycle-support.mjs';
import { bindingOf, enc, error, makeRegistry, makeTerms, ok, sha } from './support.mjs';

const PASS = 'synthetic v2 lifecycle passphrase';
const RESTORED_PASS = 'synthetic v2 restored passphrase';
class Store {
  rows = new Map(); beforeWrite; afterCommit;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row, options) {
    options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row));
  }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(expected, next); options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) {
      throw new VaultStorageError('CONFLICT');
    }
    this.rows.set(next.profileId, structuredClone(next)); this.afterCommit?.(expected, next);
  }
}
async function setup(t) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = ok(await vault.create(PASS));
  const open = current => {
    const journal = new SolanaVaultJournal(vault, current);
    t.after(() => journal.dispose()); return journal;
  };
  t.after(() => vault.dispose());
  return { store, vault, session, open, journal: open(session) };
}
function client(t, s, options = {}) {
  const terms = options.terms ?? makeTerms('native', { seller: SELLER.address, buyer: BUYER.address });
  const cluster = options.cluster ?? makeCluster(terms, options.clusterOptions);
  const walletFake = options.walletFake ?? makeWallet([SELLER, BUYER], options.wallet);
  let now = 1_000, sequence = 0;
  const api = createSolanaEscrowClient({ rpc: cluster.rpc, wallet: walletFake.wallet,
    journal: options.journal ?? s.journal, registry: makeRegistry(),
    clock: options.clock ?? { now: () => now++ }, margins: MARGINS, walletChain: CHAIN,
    random: options.random ?? (n => sha(enc.encode(`v2-${options.seed ?? 'default'}-${sequence++}`)).slice(0, n)),
    timeoutMs: 2_000,
  });
  t.after(() => api.dispose());
  const binding = bindingOf(terms), trade = ok(api.bind(binding, terms));
  return { terms, cluster, walletFake, client: api, trade, binding };
}
const state = async env => ok(await env.client.journalState(env.trade));
const sends = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;
async function migrate(env) {
  const review = ok(await env.client.prepareJournalMigration(env.trade));
  return ok(await env.client.confirmJournalMigration(review));
}
async function cancelled(env, session) {
  const review = ok(await env.client.prepare(env.trade, session, 'release'));
  ok(await env.client.cancel(review)); return review;
}
async function restore(s) {
  const backups = new EncryptedBackupService(s.store, crypto);
  const bytes = await backups.export(s.session.profileId);
  const receipt = await backups.restore(bytes, PASS, RESTORED_PASS);
  const session = ok(await s.vault.unlock(receipt.newProfileId, RESTORED_PASS));
  return { ...s, session, journal: s.open(session) };
}
function land(env, signature, state = 1, paid = 0) {
  env.cluster.advance(2); env.cluster.land(signature); env.cluster.setEscrow({ state, paid });
  env.cluster.advance(1);
}
function deferred() {
  let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve };
}

test('migration requires reserve and update support when inspecting and confirming the review', async t => {
  for (const missing of ['reserve', 'update']) await t.test(`missing ${missing}`, async t => {
    const s = await setup(t); let migrationCalls = 0, removeDuringRead = false;
    const journal = {
      profileId: () => s.journal.profileId(),
      read: async (...args) => {
        const result = await s.journal.read(...args);
        if (removeDuringRead) { delete journal[missing]; removeDuringRead = false; }
        return result;
      },
      write: (...args) => s.journal.write(...args),
      reserve: (...args) => s.journal.reserve(...args),
      update: (...args) => s.journal.update(...args),
      migrate: (...args) => { migrationCalls++; return s.journal.migrate(...args); },
    };
    const supported = journal[missing]; delete journal[missing];
    const env = client(t, s, { journal }), original = ok(await s.journal.read(env.binding));
    assert.equal((await state(env)).migrationSupported, false);
    error(await env.client.prepareJournalMigration(env.trade), 'UNSUPPORTED_VERSION');
    await assert.rejects(migrateIntents(journal, env.trade, original.revision),
      error => error.code === 'UNSUPPORTED_VERSION');
    journal[missing] = supported;
    const review = ok(await env.client.prepareJournalMigration(env.trade));
    delete journal[missing];
    error(await env.client.confirmJournalMigration(review), 'UNSUPPORTED_VERSION');
    journal[missing] = supported;
    error(await env.client.confirmJournalMigration(review), 'CONFLICT');
    const currentReview = ok(await env.client.prepareJournalMigration(env.trade));
    removeDuringRead = true;
    error(await env.client.confirmJournalMigration(currentReview), 'UNSUPPORTED_VERSION');
    assert.equal((await state(env)).migrationSupported, false);
    assert.equal(migrationCalls, 0);
    assert.deepEqual(ok(await s.journal.read(env.binding)), original);
    assert.equal(env.cluster.calls.length, 0); assert.equal(env.walletFake.calls.connect, 0);
    assert.equal(env.walletFake.calls.sign.length, 0);
  });
});

test('a v2 port without update cannot create a reservation that it cannot advance or cancel', async t => {
  const s = await setup(t), complete = client(t, s); await migrate(complete);
  let reserveCalls = 0;
  const journal = { profileId: () => s.journal.profileId(), read: (...args) => s.journal.read(...args),
    write: (...args) => s.journal.write(...args), migrate: (...args) => s.journal.migrate(...args),
    reserve: (...args) => { reserveCalls++; return s.journal.reserve(...args); } };
  const env = client(t, s, { journal, terms: complete.terms, cluster: complete.cluster });
  const before = ok(await s.journal.read(env.binding)), seller = await connected(env, 'seller');
  error(await env.client.prepare(env.trade, seller, 'release'), 'UNSUPPORTED_VERSION');
  assert.equal(reserveCalls, 0); assert.deepEqual(ok(await s.journal.read(env.binding)), before);
  assert.equal(env.walletFake.calls.sign.length, 0); assert.equal(sends(env), 0);
});

test('migration is an explicit one-shot local capability and preserves every existing v1 intent field', async t => {
  const s = await setup(t), env = client(t, s), session = await connected(env, 'seller');
  await cancelled(env, session);
  const prepared = ok(await env.client.prepare(env.trade, session, 'release'));
  const before = await state(env);
  assert.equal(before.version, 1); assert.equal(before.migrationSupported, true);
  assert.ok(before.entries.every(entry => entry.identity === null));
  const counts = [env.cluster.calls.length, env.walletFake.calls.connect, env.walletFake.calls.sign.length];
  const review = ok(await env.client.prepareJournalMigration(env.trade));
  assert.equal(review.revision, before.revision); assert.equal(review.recordCount, 2);
  assert.equal(review.requiresUpgradedReader, true);
  assert.ok(Object.isFrozen(review)); assert.ok(Object.isFrozen(review.binding));
  const other = client(t, s, { terms: env.terms, cluster: env.cluster, seed: 'other' });
  error(await other.client.confirmJournalMigration(review), 'UNAUTHORIZED');
  error(await env.client.confirmJournalMigration({ ...review }), 'UNAUTHORIZED');
  const [result, repeat] = await Promise.all([
    env.client.confirmJournalMigration(review), env.client.confirmJournalMigration(review),
  ]);
  const after = ok(result); error(repeat, 'CONFLICT');
  assert.equal(after.version, 2); assert.equal(after.migrationSupported, false);
  assert.equal(after.revision, before.revision + before.entries.length + 1);
  assert.deepEqual(after.entries.map(entry => entry.record), before.entries.map(entry => entry.record));
  assert.deepEqual(after.entries.map(entry => entry.identity.generation),
    before.entries.map((_, index) => before.revision + index + 1));
  assert.deepEqual([env.cluster.calls.length, env.walletFake.calls.connect, env.walletFake.calls.sign.length], counts,
    'migration and its inspection never enter the wallet or RPC');
  error(await env.client.confirm(prepared, session), 'CANCELLED');
  error(await env.client.prepareJournalMigration(env.trade), 'CONFLICT');
  const recovered = ok(await env.client.recover(env.trade));
  assert.ok(recovered.every(record => record.state === 'cancelled'));
  assert.equal(sends(env), 0); assert.equal(env.walletFake.calls.sign.length, 0);
  assert.deepEqual((await state(env)).entries.map(entry => entry.identity), after.entries.map(entry => entry.identity));
});

test('a full v1 history stays bounded until explicit migration, then only one eligible cancellation retires', async t => {
  const s = await setup(t), env = client(t, s), session = await connected(env, 'seller');
  for (let index = 0; index < 32; index++) await cancelled(env, session);
  const original = await state(env);
  error(await env.client.prepare(env.trade, session, 'release'), 'LIMIT_EXCEEDED');
  assert.deepEqual(await state(env), original);
  const migrated = await migrate(env);
  assert.deepEqual(migrated.entries.map(entry => entry.record), original.entries.map(entry => entry.record));
  const oldest = migrated.entries.reduce((first, next) =>
    next.record.createdAt < first.record.createdAt ? next : first);
  const head = migrated.entries.reduce((first, next) =>
    next.record.createdAt > first.record.createdAt ? next : first);
  const review = ok(await env.client.prepare(env.trade, session, 'release'));
  const after = await state(env);
  assert.equal(after.entries.length, 32); assert.equal(after.revision, migrated.revision + 1);
  assert.ok(!after.entries.some(entry => entry.record.intentId === oldest.record.intentId));
  assert.deepEqual(after.entries.find(entry => entry.record.intentId === head.record.intentId), head);
  for (const entry of migrated.entries.filter(entry => entry !== oldest)) {
    assert.deepEqual(after.entries.find(item => item.record.intentId === entry.record.intentId), entry);
  }
  assert.equal(after.entries.find(entry => entry.record.intentId === review.intentId).identity.generation, after.revision);
  ok(await env.client.cancel(review));
  assert.equal(sends(env), 0); assert.equal(env.walletFake.calls.sign.length, 0);
});

test('a later reuse of a retired random id has a different identity and cannot receive an older review', async t => {
  const s = await setup(t), fixedClock = { now: () => 1_000 };
  let firstId = 1;
  const first = client(t, s, { clock: fixedClock, random: n => new Uint8Array(n).fill(firstId++) });
  await migrate(first);
  const firstSession = await connected(first, 'seller');
  const originalReview = ok(await first.client.prepare(first.trade, firstSession, 'release'));
  const original = (await state(first)).entries[0];
  let nextId = 3;
  const current = client(t, s, { terms: first.terms, cluster: first.cluster, clock: fixedClock,
    random: n => new Uint8Array(n).fill(nextId++) });
  const currentSession = await connected(current, 'seller');
  ok(await current.client.recover(current.trade));
  const originalCancellation = ok(await first.client.prepare(first.trade, firstSession, 'release'));
  ok(await current.client.recover(current.trade));
  for (let index = 3; index <= 33; index++) await cancelled(current, currentSession);
  assert.ok(!(await state(current)).entries.some(entry => entry.record.intentId === original.record.intentId));
  nextId = 1;
  const laterReview = ok(await current.client.prepare(current.trade, currentSession, 'release'));
  const later = (await state(current)).entries.find(entry => entry.record.intentId === laterReview.intentId);
  assert.equal(laterReview.intentId, originalReview.intentId);
  assert.deepEqual(later.record, original.record, 'every v1 field can repeat without repeating reservation identity');
  assert.ok(later.identity.generation > original.identity.generation);
  error(await first.client.confirm(originalReview, firstSession), 'INTEGRITY_FAILURE');
  assert.deepEqual((await state(current)).entries.find(entry => entry.record.intentId === laterReview.intentId), later);
  assert.equal(first.walletFake.calls.sign.length, 0); assert.equal(sends(first), 0);
  ok(await current.client.cancel(laterReview));
  const newCancellation = ok(await current.client.prepare(current.trade, currentSession, 'release'));
  assert.equal(newCancellation.intentId, originalCancellation.intentId);
  const beforeCancel = await state(current);
  error(await first.client.cancel(originalCancellation), 'INTEGRITY_FAILURE');
  assert.deepEqual(await state(current), beforeCancel, 'an old cancellation cannot cancel a new allocation');
  ok(await current.client.cancel(newCancellation));
});

test('a late wallet result cannot cross an independently confirmed v1-to-v2 migration', async t => {
  const s = await setup(t), held = deferred(), entered = deferred();
  const env = client(t, s, { wallet: { output: async wire => {
    entered.resolve(); await held.promise; return [{ signedTransaction: wire }];
  } } });
  const session = await connected(env, 'seller');
  const review = ok(await env.client.prepare(env.trade, session, 'release'));
  const other = client(t, s, { terms: env.terms, cluster: env.cluster, seed: 'migration' });
  const migration = ok(await other.client.prepareJournalMigration(other.trade));
  const submitted = env.client.confirm(review, session);
  await entered.promise;
  const migrated = ok(await other.client.confirmJournalMigration(migration));
  held.resolve();
  const result = await submitted;
  assert.equal(result.ok, false); assert.ok(['CONFLICT', 'UNSUPPORTED_VERSION'].includes(result.error.code));
  assert.deepEqual(await state(other), migrated, 'the late v1 continuation cannot write into the migrated record');
  assert.equal(sends(env), 0); assert.equal(migrated.entries[0].record.signature, null);
  assert.equal(migrated.entries[0].record.sendMarkedAt, null);
});

test('migration observed after marker commit preserves uncertainty and prevents the old continuation from sending', async t => {
  const s = await setup(t); let afterMarker;
  const journal = { profileId: () => s.journal.profileId(), read: (...args) => s.journal.read(...args),
    write: async (...args) => {
      const result = await s.journal.write(...args);
      if (result.ok && args[2].state === 'sendMarked') await afterMarker();
      return result;
    } };
  const env = client(t, s, { journal });
  const other = client(t, s, { terms: env.terms, cluster: env.cluster });
  afterMarker = () => migrate(other);
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'CONFLICT');
  const migrated = await state(other);
  assert.equal(migrated.version, 2); assert.equal(migrated.entries[0].record.state, 'sendMarked');
  assert.ok(migrated.entries[0].record.signature); assert.notEqual(migrated.entries[0].record.sendMarkedAt, null);
  assert.deepEqual(ok(await other.client.recover(other.trade)), migrated.entries.map(entry => entry.record));
  assert.deepEqual(await state(other), migrated); assert.equal(sends(env), 0);
});

test('an uncertain v2 marker commit keeps the original identity and cannot broadcast or retry', async t => {
  const s = await setup(t), env = client(t, s); await migrate(env);
  s.store.afterCommit = (_previous, next) => {
    if (next.revision === 4) throw new VaultStorageError('STORAGE_UNAVAILABLE');
  };
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'UNAVAILABLE');
  assert.equal(sends(env), 0);
  s.store.afterCommit = undefined;
  const reopened = { ...s, journal: s.open(ok(await s.vault.unlock(s.session.profileId, PASS))) };
  const resumed = client(t, reopened, { terms: env.terms, cluster: env.cluster });
  const before = await state(resumed);
  assert.equal(before.entries[0].identity.generation, 2);
  assert.equal(before.entries[0].record.state, 'sendMarked');
  assert.deepEqual(ok(await resumed.client.recover(resumed.trade)), before.entries.map(entry => entry.record));
  assert.deepEqual(await state(resumed), before); assert.equal(sends(env), 0);
});

test('fresh-key recovery retains v2 identities and an explicit rebuild uses the complete original reference', async t => {
  const s = await setup(t), env = client(t, s, {
    clusterOptions: { sendBehavior: () => { throw Error('synthetic transport uncertainty'); } },
  });
  await migrate(env);
  const sent = ok(await env.client.release(env.trade, await connected(env, 'seller')));
  assert.equal(sent.state, 'unknown');
  const before = await state(env), restored = await restore(s);
  const resumed = client(t, restored, { terms: env.terms, cluster: env.cluster, seed: 'restored' });
  assert.deepEqual(await state(resumed), before);
  assert.deepEqual(ok(await resumed.client.recover(resumed.trade)), before.entries.map(entry => entry.record));
  assert.equal(sends(env), 1);
  const original = before.entries[0];
  env.cluster.advance(Number(original.record.lastValidBlockHeight) + 1 - env.cluster.height);
  const [dropped] = ok(await resumed.client.reconcile(resumed.trade));
  assert.equal(dropped.state, 'dropped');
  const fresh = (await state(resumed)).entries[0];
  assert.deepEqual(fresh.identity, original.identity);
  assert.notEqual(fresh.identity.originProfileId, restored.session.profileId);
  const seller = await connected(resumed, 'seller');
  error(await resumed.client.release(resumed.trade, seller, { rebuildOf: original.record.intentId }), 'INVALID_INPUT');
  env.cluster.sendBehavior = undefined;
  const copied = structuredClone(fresh.identity), options = { rebuildOf: copied };
  const sending = resumed.client.release(resumed.trade, seller, options);
  copied.generation++; options.rebuildOf = original.record.intentId;
  const rebuilt = ok(await sending);
  const raw = ok(await restored.journal.read(resumed.binding));
  const successor = raw.entries.find(entry => entry.intent.intentId === rebuilt.intentId);
  assert.deepEqual(successor.replaces, { originProfileId: fresh.identity.originProfileId,
    intentId: fresh.identity.intentId, generation: fresh.identity.generation });
  assert.equal(successor.intent.originProfileId, restored.session.profileId);
  assert.equal(sends(env), 2);
});

test('v2 funded release/refund and payout keep identities and recover after encrypted restore', async t => {
  for (const exit of ['release', 'refund']) await t.test(exit, async t => {
    const s = await setup(t), env = client(t, s, { clusterOptions: { absent: true } }); await migrate(env);
    const seller = await connected(env, 'seller');
    const funded = ok(await env.client.fund(env.trade, seller));
    land(env, funded.signature, 0); ok(await env.client.reconcile(env.trade));
    if (exit === 'refund') env.cluster.advance(1, 3_600);
    const exited = ok(await env.client[exit](env.trade, seller));
    const exitIdentity = (await state(env)).entries.find(entry => entry.record.intentId === exited.intentId).identity;
    const escrowState = exit === 'release' ? 1 : 2;
    land(env, exited.signature, escrowState); ok(await env.client.reconcile(env.trade));
    const paid = ok(await env.client.payout(env.trade, await connected(env, 'buyer')));
    land(env, paid.signature, escrowState, 1); ok(await env.client.reconcile(env.trade));
    const before = await state(env);
    assert.equal(before.entries.length, 3);
    assert.ok(before.entries.every(entry => entry.record.state === 'finalized'));
    assert.deepEqual(before.entries.find(entry => entry.record.intentId === exited.intentId).identity, exitIdentity);
    const restored = await restore(s), resumed = client(t, restored, { terms: env.terms, cluster: env.cluster });
    assert.deepEqual(ok(await resumed.client.recover(resumed.trade)), before.entries.map(entry => entry.record));
    assert.deepEqual(await state(resumed), before); assert.equal(sends(env), 3);
  });
});

test('an uncertain migration commit consumes its review and reopening discovers committed v2 without retry', async t => {
  const s = await setup(t), env = client(t, s), seller = await connected(env, 'seller');
  const prepared = ok(await env.client.prepare(env.trade, seller, 'release'));
  const before = await state(env), review = ok(await env.client.prepareJournalMigration(env.trade));
  s.store.afterCommit = () => { throw new VaultStorageError('STORAGE_UNAVAILABLE'); };
  error(await env.client.confirmJournalMigration(review), 'UNAVAILABLE');
  error(await env.client.confirmJournalMigration(review), 'CONFLICT');
  assert.equal(env.walletFake.calls.sign.length, 0); assert.equal(sends(env), 0);
  s.store.afterCommit = undefined;
  const reopened = { ...s, journal: s.open(ok(await s.vault.unlock(s.session.profileId, PASS))) };
  const resumed = client(t, reopened, { terms: env.terms, cluster: env.cluster });
  const after = await state(resumed);
  assert.equal(after.version, 2);
  assert.deepEqual(after.entries.map(entry => entry.record), before.entries.map(entry => entry.record));
  error(await resumed.client.prepareJournalMigration(resumed.trade), 'CONFLICT');
  error(await resumed.client.confirm(prepared, seller), 'UNAUTHORIZED');
  ok(await resumed.client.recover(resumed.trade));
  assert.equal((await state(resumed)).entries[0].record.state, 'cancelled');
  assert.equal(sends(env), 0);
});
