import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { SolanaVaultJournal, solanaJournalRecordId } from '../../../packages/chain-solana/src/vaultjournal.ts';
import { connected, setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { error, ok } from '../../../packages/chain-solana/test/support.mjs';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';

const PASS = 'synthetic native journal projection passphrase';
const RESTORED_PASS = 'fresh-key native journal projection passphrase';
const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row, options) {
    options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row)); this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) {
      throw new VaultStorageError('CONFLICT');
    }
    this.rows.set(next.profileId, structuredClone(next)); this.writes++;
  }
}

for (const state of ['signed', 'unknown']) {
  test(`fresh-key native ${state} projection preserves the uncertain signature without network or writes`, async t => {
    const store = new Store(), seed = new EncryptedVaultService(store, crypto, { lifecycle: false });
    t.after(() => seed.dispose());
    const session = ok(await seed.create(PASS)), native = new SolanaVaultJournal(seed, session);
    t.after(() => native.dispose());
    const journal = state === 'signed' ? {
      profileId: () => native.profileId(), read: (...args) => native.read(...args),
      write: (...args) => args[2].state === 'sendMarked' ? { ok: false, error: { code: 'UNAVAILABLE' } }
        : native.write(...args),
    } : native;
    const env = setupClient('native', { journalFake: { journal } });
    t.after(() => env.client.dispose());
    if (state === 'signed') {
      error(await env.client.release(env.trade, await connected(env, 'seller')), 'UNAVAILABLE');
    } else {
      const release = ok(await env.client.release(env.trade, await connected(env, 'seller')));
      env.cluster.advance(2); env.cluster.land(release.signature); env.cluster.setEscrow({ state: 1 });
      env.cluster.advance(1); ok(await env.client.reconcile(env.trade));
      env.cluster.sendBehavior = () => { throw Error('synthetic uncertain transport'); };
      assert.equal(ok(await env.client.payout(env.trade, await connected(env, 'buyer'))).state, 'unknown');
    }
    const original = ok(await native.read(env.binding));
    const active = original.records.find(record => record.state === state);
    assert.ok(active?.signature);
    const recordId = solanaJournalRecordId(env.binding), fullRecord = ok(await seed.read(session.sessionId, recordId));
    const backup = new EncryptedBackupService(store, crypto); t.after(() => backup.dispose());
    const encrypted = await backup.export(session.profileId);
    const receipt = await backup.restore(encrypted, PASS, RESTORED_PASS);
    assert.notEqual(receipt.newProfileId, session.profileId);
    seed.lockAll(); env.client.dispose();
    const vault = new EncryptedVaultService(store, crypto, { lifecycle: false }); t.after(() => vault.dispose());
    const messages = [], endpoint = createVaultWorkerEndpoint(message => messages.push(structuredClone(message)), {
      createServices: () => ({ vault, backup }),
    });
    t.after(() => endpoint.dispose());
    let requestId = 0;
    const send = (operation, fields = {}) => endpoint.dispatch({ version: 1, requestId: ++requestId,
      generation: 0, operation, ...fields });
    await send('init', { config });
    const rpcCalls = env.cluster.calls.length, writes = store.writes;
    await send('listRecoveryReferences', { profileId: receipt.newProfileId, offset: 0, expectedRevision: null });
    error(messages.at(-1).result, 'LOCKED');
    await send('unlock', { profileId: receipt.newProfileId, passphrase: RESTORED_PASS });
    ok(messages.at(-1).result);
    await send('listRecoveryReferences', { profileId: receipt.newProfileId, offset: 0, expectedRevision: null });
    const page = ok(messages.at(-1).result);
    assert.equal(page.authority, 'unverified-offline-reference'); assert.equal(page.revision, 0);
    assert.equal(page.totalJournalRecords, 1); assert.equal(page.unsupported, 0); assert.equal(page.items.length, 1);
    assert.deepEqual(page.items[0], { recordId, intentId: active.intentId, binding: active.binding,
      account: active.feePayer, action: active.action, storedState: state, chainReference: active.signature, nonce: null });
    assert.equal(env.cluster.calls.length, rpcCalls, 'projection does not invoke any native RPC');
    assert.equal(store.writes, writes, 'unlock and inspection do not rewrite the encrypted journal');
    assert.doesNotMatch(JSON.stringify(messages), /sendMarkedAt|originProfileId|programDataSha256|lastValidBlockHeight/);
    assert.ok(!JSON.stringify(messages).includes(active.message));
    assert.ok(!JSON.stringify(messages).includes(fullRecord.payload));
    const restoredSession = ok(await seed.unlock(receipt.newProfileId, RESTORED_PASS));
    assert.deepEqual(ok(await seed.read(restoredSession.sessionId, recordId)), fullRecord,
      'every native intent, outcome and signature survives in the full encrypted backup');
  });
}
