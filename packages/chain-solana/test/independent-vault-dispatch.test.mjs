import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { SolanaVaultJournal } from '../src/vaultjournal.ts';
import { connected, setupClient } from './lifecycle-support.mjs';
import { ok } from './support.mjs';

const PASS = 'synthetic independent native dispatch passphrase';
class Store {
  rows = new Map();
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, structuredClone(row)); }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) {
      throw new VaultStorageError('CONFLICT');
    }
    this.rows.set(next.profileId, structuredClone(next));
  }
}

test('independent review: an RPC accessor cannot dispatch after revoking the vault lease', async t => {
  const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
  t.after(() => vault.dispose());
  const session = ok(await vault.create(PASS)), native = new SolanaVaultJournal(vault, session);
  t.after(() => native.dispose());
  let env, getterCalls = 0;
  const journal = { profileId: () => native.profileId(), read: (...args) => native.read(...args),
    async write(...args) {
      const result = await native.write(...args);
      if (result.ok && args[2].state === 'sendMarked') {
        const request = env.cluster.rpc.request;
        Object.defineProperty(env.cluster.rpc, 'request', { configurable: true,
          get() { getterCalls++; vault.lock(session.sessionId); return request; } });
      }
      return result;
    } };
  env = setupClient('native', { journalFake: { journal } });
  t.after(() => env.client.dispose());
  const outcome = await env.client.release(env.trade, await connected(env, 'seller'));
  assert.equal(getterCalls, 1);
  assert.equal(env.cluster.calls.filter(call => call.method === 'sendTransaction').length, 0,
    'final provider accessor revocation must precede and prevent physical submission');
  assert.equal(ok(outcome).state, 'sendMarked');
  const reopened = new SolanaVaultJournal(vault, ok(await vault.unlock(session.profileId, PASS)));
  t.after(() => reopened.dispose());
  const [record] = ok(await reopened.read(env.binding)).records;
  assert.equal(record.state, 'sendMarked');
  assert.ok(record.signature);
  assert.notEqual(record.sendMarkedAt, null);
  assert.equal(record.originProfileId, session.profileId);
});

test('independent review: a wallet feature descriptor cannot prompt after revoking the vault lease', async t => {
  const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
  t.after(() => vault.dispose());
  const session = ok(await vault.create(PASS)), native = new SolanaVaultJournal(vault, session);
  t.after(() => native.dispose());
  let env, descriptorCalls = 0;
  const journal = { profileId: () => native.profileId(), read: (...args) => native.read(...args),
    async write(...args) {
      const result = await native.write(...args);
      if (result.ok && args[2].state === 'prepared') {
        const features = env.walletFake.wallet.features;
        features['solana:signTransaction'] = new Proxy(features['solana:signTransaction'], {
          getOwnPropertyDescriptor(target, property) {
            if (property === 'signTransaction') { descriptorCalls++; vault.lock(session.sessionId); }
            return Reflect.getOwnPropertyDescriptor(target, property);
          },
        });
      }
      return result;
    } };
  env = setupClient('native', { journalFake: { journal } });
  t.after(() => env.client.dispose());
  const outcome = await env.client.release(env.trade, await connected(env, 'seller'));
  assert.equal(descriptorCalls, 1);
  assert.equal(env.walletFake.calls.sign.length, 0, 'lease revocation during lookup prevents the wallet prompt');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, 'LOCKED');
  assert.equal(env.cluster.sent.length, 0);
  const reopened = new SolanaVaultJournal(vault, ok(await vault.unlock(session.profileId, PASS)));
  t.after(() => reopened.dispose());
  const [record] = ok(await reopened.read(env.binding)).records;
  assert.equal(record.state, 'prepared');
  assert.equal(record.signature, null);
  assert.equal(record.sendMarkedAt, null);
});

test('independent review: vault revocation does not release a pending physical signing operation early', async t => {
  const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
  t.after(() => vault.dispose());
  const session = ok(await vault.create(PASS)), journal = new SolanaVaultJournal(vault, session);
  t.after(() => journal.dispose());
  let entered, settle;
  const started = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { settle = resolve; });
  const env = setupClient('native', { journalFake: { journal }, wallet: {
    output: async wire => { entered(); await held; return [{ signedTransaction: wire }]; },
  } });
  t.after(() => { settle(); env.client.dispose(); });
  const signer = await connected(env, 'seller');
  let firstDone = false, secondDone = false;
  const first = env.client.release(env.trade, signer).then(result => { firstDone = true; return result; });
  await started;
  vault.lock(session.sessionId);
  const second = env.client.release(env.trade, signer).then(result => { secondDone = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(firstDone, false);
  assert.equal(secondDone, false);
  assert.equal(env.walletFake.calls.sign.length, 1);
  settle();
  assert.equal((await first).ok, false);
  assert.equal((await second).ok, false);
  assert.equal(env.walletFake.calls.sign.length, 1);
  assert.equal(env.cluster.sent.length, 0);
});
