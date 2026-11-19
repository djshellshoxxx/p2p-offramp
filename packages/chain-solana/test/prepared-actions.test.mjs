import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWalletRole } from '../src/wallet.ts';
import { SolanaVaultJournal } from '../src/vaultjournal.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { connected, makeWallet, SELLER, setupClient, splitWire } from './lifecycle-support.mjs';
import { error, key, ok } from './support.mjs';

const recordOf = env => env.journalFake.records(env.binding)[0];
const sends = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; });
  return { promise, resolve }; };
async function prepared(env, action = 'release', options) {
  const session = await connected(env, 'seller');
  return { session, handle: ok(await env.client.prepare(env.trade, session, action, options)) };
}

test('prepare journals an immutable exact-message review without signing or sending', async () => {
  const env = setupClient();
  const { handle } = await prepared(env);
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
  assert.equal(recordOf(env).state, 'prepared');
  assert.equal(recordOf(env).signature, null);
  assert.equal(recordOf(env).sendMarkedAt, null);
  for (const field of ['intentId', 'action', 'role', 'feePayer', 'programId', 'escrow',
    'expectedEscrowState', 'message', 'blockhash', 'lastValidBlockHeight']) {
    assert.equal(handle[field], recordOf(env)[field], field);
  }
  assert.deepEqual(handle.binding, env.binding);
  assert.deepEqual(handle.shape, { action: 'release' });
  assert.equal(typeof handle.message, 'string');
  assert.ok(Object.isFrozen(handle) && Object.isFrozen(handle.binding) && Object.isFrozen(handle.shape));
  assert.throws(() => { handle.message = 'other'; }, TypeError);
  assert.throws(() => { handle.binding.tradeId = key('other-trade'); }, TypeError);
  assert.throws(() => { handle.shape.action = 'refund'; }, TypeError);
});

test('confirm consumes once and signs the reviewed blockhash and bytes after a newer finalized read', async () => {
  const env = setupClient();
  const { session, handle } = await prepared(env);
  env.cluster.advance(7);
  const [first, duplicate] = await Promise.all([
    env.client.confirm(handle, session), env.client.confirm(handle, session),
  ]);
  assert.equal(ok(first).state, 'sent');
  error(duplicate, 'CONFLICT');
  assert.equal(env.walletFake.calls.sign.length, 1);
  assert.equal(sends(env), 1);
  const signedMessage = splitWire(env.walletFake.calls.sign[0][0].transaction).message;
  assert.equal(Buffer.from(signedMessage).toString('base64'), handle.message);
  assert.equal(recordOf(env).blockhash, handle.blockhash);
  assert.equal(env.cluster.calls.filter(call => call.method === 'getLatestBlockhash').length, 1,
    'confirmation must not refresh the blockhash or silently change reviewed bytes');
  assert.deepEqual(env.journalFake.writes, ['prepared', 'signed', 'sendMarked', 'sent']);
  error(await env.client.cancel(handle), 'CONFLICT');
});

test('handles are local capabilities: copies and a second client cannot confirm or cancel them', async () => {
  const env = setupClient();
  const { session, handle } = await prepared(env);
  const second = setupClient('native', { terms: env.terms, cluster: env.cluster,
    journalFake: env.journalFake, seed: 'second' });
  const otherSession = await connected(second, 'seller');
  for (const copy of [{ ...handle }, structuredClone(handle)]) {
    error(await env.client.confirm(copy, session), 'UNAUTHORIZED');
    error(await env.client.cancel(copy), 'UNAUTHORIZED');
  }
  error(await second.client.confirm(handle, otherSession), 'UNAUTHORIZED');
  error(await second.client.cancel(handle), 'UNAUTHORIZED');
  assert.equal(recordOf(env).state, 'prepared');
  assert.equal(sends(env), 0);
  ok(await env.client.cancel(handle));
});

test('prepare and confirm require the original client, trade, account, and wallet chain', async () => {
  const env = setupClient();
  const seller = await connected(env, 'seller'), buyer = await connected(env, 'buyer');
  error(await env.client.prepare(env.trade, buyer, 'release'), 'UNAUTHORIZED');
  error(await env.client.prepare(env.trade, { ...seller }, 'release'), 'UNAUTHORIZED');
  error(await env.client.prepare(env.trade, seller, 'fund'), 'INVALID_INPUT');
  const other = setupClient('native', { terms: env.terms });
  error(await env.client.prepare(env.trade, await connected(other, 'seller'), 'release'), 'UNAUTHORIZED');
  const foreignWallet = makeWallet([SELLER], { chains: ['solana:devnet'] });
  const foreign = ok(await connectWalletRole(foreignWallet.wallet, env.trade, 'seller', 'solana:devnet'));
  error(await env.client.prepare(env.trade, foreign, 'release'), 'WRONG_CHAIN');
  assert.equal(env.journalFake.records(env.binding).length, 0);
  const handle = ok(await env.client.prepare(env.trade, seller, 'release'));
  error(await env.client.confirm(handle, buyer), 'UNAUTHORIZED');
  error(await env.client.confirm(handle, seller), 'CONFLICT');
  assert.equal(recordOf(env).state, 'cancelled');
  assert.equal(env.walletFake.calls.sign.length, 0);
});

test('a changed profile cannot inherit or cancel a prepared capability', async () => {
  const env = setupClient();
  const { session, handle } = await prepared(env);
  env.journalFake.setProfile('b'.repeat(32));
  error(await env.client.confirm(handle, session), 'LOCKED');
  assert.equal(recordOf(env).state, 'prepared');
  assert.equal(recordOf(env).originProfileId, 'a'.repeat(32));
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
  env.journalFake.setProfile('a'.repeat(32));
  error(await env.client.confirm(handle, session), 'CONFLICT');
});

test('wallet account, network, or disconnect revocation disposes the client and all its reviews', async t => {
  for (const event of ['account', 'network', 'disconnect']) await t.test(event, async () => {
    const env = setupClient();
    const { session, handle } = await prepared(env);
    // The browser's Wallet Standard event adapter synchronously invokes this revocation boundary.
    env.client.dispose();
    error(await env.client.confirm(handle, session), 'CANCELLED');
    assert.equal(env.walletFake.calls.sign.length, 0);
    assert.equal(sends(env), 0);
    assert.equal(recordOf(env).sendMarkedAt, null);
  });
});

test('confirmation refuses changed finalized state, genesis, and release deadline before prompting', async t => {
  for (const [name, mutate, code] of [
    ['escrow state', env => env.cluster.setEscrow({ state: 2 }), 'CONFLICT'],
    ['genesis', env => { env.cluster.world.genesis = key('foreign-genesis'); }, 'WRONG_CHAIN'],
    ['deadline', env => env.cluster.advance(1, 3_300), 'EXPIRED'],
  ]) await t.test(name, async () => {
    const env = setupClient(), { session, handle } = await prepared(env);
    mutate(env);
    error(await env.client.confirm(handle, session), code);
    assert.equal(env.walletFake.calls.sign.length, 0);
    assert.equal(sends(env), 0);
    assert.equal(recordOf(env).state, 'cancelled');
  });
});

test('original blockhash is valid at the last height and refused beyond it', async t => {
  for (const [slots, code] of [[150, null], [151, 'EXPIRED']]) await t.test(String(slots), async () => {
    const env = setupClient(), { session, handle } = await prepared(env);
    env.cluster.advance(slots);
    const outcome = await env.client.confirm(handle, session);
    if (code === null) assert.equal(ok(outcome).state, 'sent'); else error(outcome, code);
    assert.equal(env.walletFake.calls.sign.length, code === null ? 1 : 0);
    assert.equal(sends(env), code === null ? 1 : 0);
    assert.equal(recordOf(env).blockhash, handle.blockhash);
  });
});

test('blockhash validity must be true and from a context no older than the finalized review', async t => {
  for (const [name, answer, code] of [
    ['invalid', env => ({ context: { slot: env.cluster.slot }, value: false }), 'EXPIRED'],
    ['stale context', env => ({ context: { slot: env.cluster.slot - 1 }, value: true }), 'INTEGRITY_FAILURE'],
    ['non-boolean', env => ({ context: { slot: env.cluster.slot }, value: 1 }), 'INTEGRITY_FAILURE'],
  ]) await t.test(name, async () => {
    const env = setupClient(), { session, handle } = await prepared(env);
    env.cluster.advance(2);
    env.cluster.handle = input => input.method === 'isBlockhashValid' ? answer(env) : undefined;
    error(await env.client.confirm(handle, session), code);
    assert.equal(env.walletFake.calls.sign.length, 0);
    assert.equal(sends(env), 0);
  });
});

test('payout review fixes the exact rent top-up and never changes it under the same maximum', async () => {
  const env = setupClient(), amount = Number(env.terms.amountBaseUnits);
  env.cluster.setEscrow({ state: 1 }, amount + 2_436_000 - 1_234);
  const options = { maxRentTopUpLamports: '5000' };
  const { session, handle } = await prepared(env, 'payout', options);
  assert.equal(handle.shape.rentTopUpLamports, '1234');
  options.maxRentTopUpLamports = '10000';
  env.cluster.setEscrow({ state: 1 }, amount + 2_436_000 - 2_345);
  error(await env.client.confirm(handle, session), 'CONFLICT');
  assert.equal(recordOf(env).message, handle.message);
  assert.equal(recordOf(env).state, 'cancelled');
  assert.equal(env.walletFake.calls.sign.length, 0);
});

test('refund and native/SPL payout use the same explicit prepare and confirm path', async t => {
  for (const [kind, action] of [['native', 'refund'], ['native', 'payout'], ['spl', 'payout']]) {
    await t.test(`${kind} ${action}`, async () => {
      const env = setupClient(kind);
      if (action === 'refund') env.cluster.advance(1, 3_600); else env.cluster.setEscrow({ state: 1 });
      const { session, handle } = await prepared(env, action);
      assert.equal(env.walletFake.calls.sign.length, 0);
      assert.equal(ok(await env.client.confirm(handle, session)).state, 'sent');
      assert.equal(sends(env), 1);
      assert.equal(recordOf(env).message, handle.message);
    });
  }
});

test('cancel consumes only this local never-marked preparation and permits a new review', async () => {
  const env = setupClient(), { session, handle } = await prepared(env);
  ok(await env.client.cancel(handle));
  error(await env.client.cancel(handle), 'CONFLICT');
  error(await env.client.confirm(handle, session), 'CONFLICT');
  assert.equal(recordOf(env).state, 'cancelled');
  assert.equal(recordOf(env).sendMarkedAt, null);
  const next = ok(await env.client.prepare(env.trade, session, 'release'));
  assert.notEqual(next.intentId, handle.intentId);
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
});

test('cancellation during a physical prompt retains the serial slot until that prompt settles', async () => {
  const entered = deferred(), held = deferred();
  const env = setupClient('native', { wallet: {
    output: async wire => { entered.resolve(); await held.promise; return [{ signedTransaction: wire }]; },
  } });
  const { session, handle } = await prepared(env);
  let confirmed = false, cancelled = false, nextPrepared = false;
  const first = env.client.confirm(handle, session).then(result => { confirmed = true; return result; });
  await entered.promise;
  const cancel = env.client.cancel(handle).then(result => { cancelled = true; return result; });
  const next = env.client.prepare(env.trade, session, 'release').then(result => {
    nextPrepared = true; return result;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([confirmed, cancelled, nextPrepared], [false, false, false]);
  assert.equal(env.walletFake.calls.sign.length, 1);
  held.resolve();
  error(await first, 'CANCELLED');
  ok(await cancel); ok(await next);
  assert.equal(recordOf(env).state, 'cancelled');
  assert.equal(recordOf(env).signature, null);
  assert.equal(sends(env), 0);
});

test('a late wallet approval is rechecked for expiry, finalized state, and profile before marking', async t => {
  for (const [name, mutate, code] of [
    ['blockhash expiry', env => env.cluster.advance(151), 'EXPIRED'],
    ['release deadline', env => env.cluster.advance(1, 3_300), 'EXPIRED'],
    ['finalized state', env => env.cluster.setEscrow({ state: 2 }), 'CONFLICT'],
    ['profile', env => env.journalFake.setProfile('b'.repeat(32)), 'LOCKED'],
  ]) await t.test(name, async () => {
    let env;
    env = setupClient('native', { wallet: { output: wire => {
      mutate(env); return [{ signedTransaction: wire }];
    } } });
    const { session, handle } = await prepared(env);
    error(await env.client.confirm(handle, session), code);
    assert.equal(env.walletFake.calls.sign.length, 1);
    assert.equal(sends(env), 0);
    assert.equal(recordOf(env).sendMarkedAt, null);
    if (name === 'profile') assert.equal(recordOf(env).signature, null);
    else assert.equal(recordOf(env).state, 'cancelled');
  });
});

test('a cross-tab CAS winner invalidates the reviewed intent before any broadcast', async () => {
  const entered = deferred(), held = deferred();
  const env = setupClient('native', { wallet: {
    output: async wire => { entered.resolve(); await held.promise; return [{ signedTransaction: wire }]; },
  } });
  const { session, handle } = await prepared(env);
  const first = env.client.confirm(handle, session);
  await entered.promise;
  const other = setupClient('native', { terms: env.terms, cluster: env.cluster,
    journalFake: env.journalFake, seed: 'other-tab' });
  assert.equal(ok(await other.client.recover(other.trade))[0].state, 'cancelled');
  held.resolve();
  error(await first, 'CONFLICT');
  assert.equal(recordOf(env).state, 'cancelled');
  assert.equal(recordOf(env).signature, null);
  assert.equal(sends(env), 0);
});

test('a changed journal record cannot substitute for the privately retained preparation', async () => {
  const env = setupClient(), { session, handle } = await prepared(env);
  recordOf(env).createdAt++; recordOf(env).updatedAt++;
  error(await env.client.confirm(handle, session), 'INTEGRITY_FAILURE');
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(recordOf(env).state, 'prepared', 'do not cancel a different record on cleanup');
});

test('an uncertain marker write cannot be cancelled or retried through the review handle', async () => {
  const env = setupClient('native', { journal: {
    hooks: { after: record => record.state === 'sendMarked' ? 'throw' : undefined },
  } });
  const { session, handle } = await prepared(env);
  error(await env.client.confirm(handle, session), 'UNAVAILABLE');
  error(await env.client.cancel(handle), 'CONFLICT');
  error(await env.client.confirm(handle, session), 'CONFLICT');
  assert.equal(recordOf(env).state, 'sendMarked');
  assert.notEqual(recordOf(env).sendMarkedAt, null);
  assert.equal(sends(env), 0);
});

test('cancellation racing with marker persistence preserves the marker and prevents dispatch', async () => {
  let env, handle, cancellation;
  env = setupClient('native', { journal: { hooks: { after: record => {
    if (record.state === 'sendMarked') cancellation = env.client.cancel(handle);
  } } } });
  const prep = await prepared(env); handle = prep.handle;
  error(await env.client.confirm(handle, prep.session), 'CANCELLED');
  error(await cancellation, 'CONFLICT');
  assert.equal(recordOf(env).state, 'sendMarked');
  assert.notEqual(recordOf(env).sendMarkedAt, null);
  assert.equal(sends(env), 0);
});

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

test('real encrypted vault lock during prepared signing keeps the physical slot and grants no authority', async t => {
  const pass = 'synthetic prepared Solana action passphrase';
  const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
  t.after(() => vault.dispose());
  const vaultSession = ok(await vault.create(pass)), journal = new SolanaVaultJournal(vault, vaultSession);
  t.after(() => journal.dispose());
  const entered = deferred(), held = deferred();
  const env = setupClient('native', { journalFake: { journal }, wallet: {
    output: async wire => { entered.resolve(); await held.promise; return [{ signedTransaction: wire }]; },
  } });
  t.after(() => { held.resolve(); env.client.dispose(); });
  const { session, handle } = await prepared(env);
  let settled = false, nextSettled = false;
  const confirming = env.client.confirm(handle, session).then(result => { settled = true; return result; });
  await entered.promise;
  vault.lock(vaultSession.sessionId);
  const next = env.client.prepare(env.trade, session, 'release').then(result => { nextSettled = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([settled, nextSettled], [false, false]);
  held.resolve();
  error(await confirming, 'LOCKED'); error(await next, 'LOCKED');
  assert.equal(env.walletFake.calls.sign.length, 1);
  assert.equal(sends(env), 0);
  const reopened = new SolanaVaultJournal(vault, ok(await vault.unlock(vaultSession.profileId, pass)));
  t.after(() => reopened.dispose());
  const [record] = ok(await reopened.read(env.binding)).records;
  assert.equal(record.state, 'prepared');
  assert.equal(record.signature, null);
  assert.equal(record.sendMarkedAt, null);
  error(await env.client.confirm(handle, session), 'CONFLICT');
});
