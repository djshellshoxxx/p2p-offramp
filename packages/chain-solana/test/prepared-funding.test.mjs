import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWalletRole } from '../src/wallet.ts';
import { SolanaVaultJournal } from '../src/vaultjournal.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { connected, makeJournal, makeWallet, SELLER, setupClient, splitWire } from './lifecycle-support.mjs';
import { account, ata, enc, error, key, LOADER, makeRegistry, MINT, mintBytes, ok,
  PROGRAM_DATA, programDataBytes, SPL_PROGRAM } from './support.mjs';

const sends = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;
const records = env => env.journalFake.records(env.binding);
const onlyRecord = env => { assert.equal(records(env).length, 1); return records(env)[0]; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; });
  return { promise, resolve }; };
const fundingEnv = (kind = 'native', options = {}) => setupClient(kind, {
  ...options, clusterOptions: { absent: true, ...options.clusterOptions },
});
function requestFunding(env, session, options) {
  assert.equal(typeof env.client.prepareFunding, 'function', 'dedicated native funding preparation is available');
  return env.client.prepareFunding(env.trade, session, options);
}
async function prepared(env, options) {
  const session = await connected(env, 'seller');
  return { session, handle: ok(await requestFunding(env, session, options)) };
}

test('the existing exit-only entry still refuses funding without creating an intent', async () => {
  const env = fundingEnv(), seller = await connected(env, 'seller');
  error(await env.client.prepare(env.trade, seller, 'fund'), 'INVALID_INPUT');
  assert.deepEqual(records(env), []);
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
});

for (const [name, kind, options] of [
  ['native SOL', 'native', undefined],
  ['original SPL with default source', 'spl', undefined],
  ['original SPL with explicit source', 'spl', { sellerTokenAccount: key('prepared-funding-source') }],
]) test(`dedicated preparation journals immutable ${name} review without signing or sending`, async () => {
  const env = fundingEnv(kind), { handle } = await prepared(env, options);
  const record = onlyRecord(env);
  assert.deepEqual(env.journalFake.writes, ['prepared']);
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
  assert.equal(record.state, 'prepared');
  assert.equal(record.signature, null);
  assert.equal(record.sendMarkedAt, null);
  for (const field of ['intentId', 'action', 'role', 'feePayer', 'programId', 'escrow',
    'expectedEscrowState', 'message', 'blockhash', 'lastValidBlockHeight']) {
    assert.equal(handle[field], record[field], field);
  }
  assert.equal(handle.action, 'fund');
  assert.equal(handle.role, 'seller');
  assert.equal(handle.expectedEscrowState, 'absent');
  assert.deepEqual(handle.binding, env.binding);
  assert.deepEqual(handle.shape, { action: 'fund', sellerTokenAccount: kind === 'native' ? null
    : options?.sellerTokenAccount ?? ata(env.terms.seller, env.terms.mint) });
  assert.ok(Object.isFrozen(handle) && Object.isFrozen(handle.binding) && Object.isFrozen(handle.shape));
  assert.throws(() => { handle.action = 'release'; }, TypeError);
  assert.throws(() => { handle.binding.tradeId = key('replacement-trade'); }, TypeError);
  assert.throws(() => { handle.shape.sellerTokenAccount = key('replacement-source'); }, TypeError);
  ok(await env.client.cancel(handle));
  assert.equal(onlyRecord(env).state, 'cancelled');
});

test('funding options are captured before queued or pending reads and remain fixed through confirmation', async () => {
  const entered = deferred(), held = deferred();
  let firstRead = true;
  const env = fundingEnv('spl', { clusterOptions: { handle: async input => {
    if (input.method === 'getGenesisHash' && firstRead) {
      firstRead = false; entered.resolve(); await held.promise;
    }
  } } });
  const session = await connected(env, 'seller'), source = key('captured-funding-source');
  const options = { sellerTokenAccount: source };
  const pending = requestFunding(env, session, options);
  options.sellerTokenAccount = key('mutated-before-read');
  options.rebuildOf = 'invalid caller mutation';
  await entered.promise;
  options.sellerTokenAccount = key('mutated-during-read');
  held.resolve();
  const handle = ok(await pending);
  assert.deepEqual(handle.shape, { action: 'fund', sellerTokenAccount: source });
  assert.equal(onlyRecord(env).replacementOf, null);
  options.sellerTokenAccount = key('mutated-after-review');
  env.cluster.advance(3);
  assert.equal(ok(await env.client.confirm(handle, session)).state, 'sent');
  const signed = splitWire(env.walletFake.calls.sign[0][0].transaction).message;
  assert.equal(Buffer.from(signed).toString('base64'), handle.message);
  assert.equal(onlyRecord(env).message, handle.message);
  assert.equal(sends(env), 1);
});

test('funding option descriptors, bounds and replacement IDs are validated before asynchronous work', async t => {
  let getters = 0;
  const sourceAccessor = Object.defineProperty({}, 'sellerTokenAccount', {
    enumerable: true, get() { getters++; return key('unused-source'); },
  });
  const replacementAccessor = Object.defineProperty({}, 'rebuildOf', {
    enumerable: true, get() { getters++; return 'A'.repeat(43); },
  });
  for (const [name, options] of [
    ['null', null], ['array', []], ['primitive', 'source'],
    ['unknown field', { createAta: true }], ['symbol field', { [Symbol('unknown')]: true }],
    ['source accessor', sourceAccessor], ['replacement accessor', replacementAccessor],
    ['inherited fields', Object.create({ sellerTokenAccount: key('inherited-source') })],
    ['long source', { sellerTokenAccount: '1'.repeat(45) }],
    ['wrong source type', { sellerTokenAccount: 7 }],
    ['noncanonical source', { sellerTokenAccount: '0'.repeat(44) }],
    ['short replacement', { rebuildOf: 'A'.repeat(42) }],
    ['long replacement', { rebuildOf: 'A'.repeat(44) }],
    ['wrong replacement type', { rebuildOf: 7 }],
    ['noncanonical replacement', { rebuildOf: 'A'.repeat(42) + 'B' }],
  ]) await t.test(name, async () => {
    const env = fundingEnv(), session = await connected(env, 'seller');
    const pending = requestFunding(env, session, options);
    assert.equal(env.cluster.calls.length, 0);
    assert.deepEqual(env.journalFake.writes, []);
    error(await pending, 'INVALID_INPUT');
    assert.equal(env.cluster.calls.length, 0);
    assert.deepEqual(records(env), []);
    assert.equal(env.walletFake.calls.sign.length, 0);
    assert.equal(sends(env), 0);
  });
  assert.equal(getters, 0);
});

test('a null-prototype funding options object with own data fields is accepted', async () => {
  const env = fundingEnv('spl'), options = Object.create(null);
  options.sellerTokenAccount = key('plain-null-prototype-source');
  const { handle } = await prepared(env, options);
  assert.equal(handle.shape.sellerTokenAccount, options.sellerTokenAccount);
  ok(await env.client.cancel(handle));
});

test('funding requires this client seller session and its original profile and deployment binding', async () => {
  const registry = makeRegistry();
  const env = fundingEnv('native', { registry: {
    network: id => registry.network(id),
    deployment: (network, id) => ['escrow-v1', 'escrow-alias'].includes(id)
      ? { ...registry.deployment(network, 'escrow-v1'), id } : null,
  } });
  const seller = await connected(env, 'seller'), buyer = await connected(env, 'buyer');
  error(await requestFunding(env, buyer), 'UNAUTHORIZED');
  error(await requestFunding(env, { ...seller }), 'UNAUTHORIZED');
  const other = fundingEnv('native', { terms: env.terms });
  error(await requestFunding(env, await connected(other, 'seller')), 'UNAUTHORIZED');
  const foreignWallet = makeWallet([SELLER], { chains: ['solana:devnet'] });
  const foreign = ok(await connectWalletRole(foreignWallet.wallet, env.trade, 'seller', 'solana:devnet'));
  error(await requestFunding(env, foreign), 'WRONG_CHAIN');
  const alias = ok(env.client.bind({ ...env.binding, deploymentId: 'escrow-alias' }, env.terms));
  error(await env.client.prepareFunding(alias, seller), 'UNAUTHORIZED');
  env.journalFake.setProfile('b'.repeat(32));
  error(await requestFunding(env, seller), 'LOCKED');
  assert.deepEqual(records(env), []);
  assert.equal(env.walletFake.calls.sign.length, 0);
});

test('funding views are private capabilities, and a wrong confirmation session consumes only its original review', async () => {
  const env = fundingEnv(), { session, handle } = await prepared(env);
  const other = fundingEnv('native', { terms: env.terms, cluster: env.cluster, journalFake: env.journalFake });
  const second = await connected(other, 'seller');
  for (const copy of [{ ...handle }, structuredClone(handle)]) {
    error(await env.client.confirm(copy, session), 'UNAUTHORIZED');
    error(await env.client.cancel(copy), 'UNAUTHORIZED');
  }
  error(await other.client.confirm(handle, second), 'UNAUTHORIZED');
  error(await other.client.cancel(handle), 'UNAUTHORIZED');
  assert.equal(onlyRecord(env).state, 'prepared');
  error(await env.client.confirm(handle, await connected(env, 'buyer')), 'UNAUTHORIZED');
  error(await env.client.confirm(handle, session), 'CONFLICT');
  assert.equal(onlyRecord(env).state, 'cancelled');
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
});

for (const kind of ['native', 'spl']) test(`${kind} confirmation consumes once and preserves exact reviewed bytes and blockhash`, async () => {
  const env = fundingEnv(kind), { session, handle } = await prepared(env);
  env.cluster.advance(5);
  const [first, duplicate] = await Promise.all([
    env.client.confirm(handle, session), env.client.confirm(handle, session),
  ]);
  assert.equal(ok(first).state, 'sent');
  error(duplicate, 'CONFLICT');
  assert.equal(env.walletFake.calls.sign.length, 1);
  assert.equal(sends(env), 1);
  const message = splitWire(env.walletFake.calls.sign[0][0].transaction).message;
  assert.equal(Buffer.from(message).toString('base64'), handle.message);
  assert.equal(onlyRecord(env).blockhash, handle.blockhash);
  assert.equal(env.cluster.calls.filter(call => call.method === 'getLatestBlockhash').length, 1);
  assert.deepEqual(env.journalFake.writes, ['prepared', 'signed', 'sendMarked', 'sent']);
  error(await env.client.cancel(handle), 'CONFLICT');
});

const staleCases = [
  ['funded escrow', env => env.cluster.setEscrow(), 'CONFLICT'],
  ['funding deadline', env => env.cluster.advance(1, 541), 'EXPIRED'],
  ['original blockhash expiry', env => env.cluster.advance(151), 'EXPIRED'],
  ['genesis', env => { env.cluster.world.genesis = key('foreign-genesis'); }, 'WRONG_CHAIN'],
  ['program identity', env => env.cluster.world.accounts.set(PROGRAM_DATA,
    account(programDataBytes({ elf: enc.encode('changed synthetic program') }), LOADER)), 'INTEGRITY_FAILURE'],
  ['profile', env => env.journalFake.setProfile('b'.repeat(32)), 'LOCKED'],
  ['wallet event disposal', env => env.client.dispose(), 'CANCELLED'],
];
for (const stage of ['before prompt', 'after delayed wallet']) test(`funding rechecks freshness ${stage}`, async t => {
  for (const [name, mutate, code] of staleCases) await t.test(name, async () => {
    let env;
    env = fundingEnv('native', { wallet: { output: wire => {
      if (stage === 'after delayed wallet') mutate(env);
      return [{ signedTransaction: wire }];
    } } });
    const { session, handle } = await prepared(env);
    if (stage === 'before prompt') mutate(env);
    error(await env.client.confirm(handle, session), code);
    assert.equal(env.walletFake.calls.sign.length, stage === 'before prompt' ? 0 : 1);
    assert.equal(sends(env), 0);
    assert.equal(onlyRecord(env).sendMarkedAt, null);
    error(await env.client.confirm(handle, session), 'CONFLICT');
  });
});

test('original-SPL freeze-authority admission is unchanged and rechecked before confirmation', async () => {
  const authority = key('synthetic-funding-freeze-authority');
  const denied = fundingEnv('spl', { clusterOptions: { world: { mint: { freeze: authority } } } });
  error(await requestFunding(denied, await connected(denied, 'seller')), 'UNSUPPORTED_PROVIDER');
  assert.deepEqual(records(denied), []);
  assert.equal(denied.walletFake.calls.sign.length, 0);
  const permitted = fundingEnv('spl', { clusterOptions: { world: { mint: { freeze: authority } } },
    freezeAuthorityPermits: [{ mint: MINT, freezeAuthority: authority }],
  });
  const { session, handle } = await prepared(permitted);
  permitted.cluster.world.accounts.set(MINT,
    account(mintBytes({ freeze: key('changed-freeze-authority') }), SPL_PROGRAM));
  error(await permitted.client.confirm(handle, session), 'UNSUPPORTED_PROVIDER');
  assert.equal(permitted.walletFake.calls.sign.length, 0);
  assert.equal(sends(permitted), 0);
});

test('cancellation during funding signing holds the physical serial slot until the wallet settles', async t => {
  const entered = deferred(), held = deferred();
  const env = fundingEnv('native', { wallet: {
    output: async wire => { entered.resolve(); await held.promise; return [{ signedTransaction: wire }]; },
  } });
  t.after(() => { held.resolve(); env.client.dispose(); });
  const { session, handle } = await prepared(env);
  let confirmed = false, cancelled = false, nextPrepared = false;
  const first = env.client.confirm(handle, session).then(value => { confirmed = true; return value; });
  await entered.promise;
  const cancel = env.client.cancel(handle).then(value => { cancelled = true; return value; });
  const next = requestFunding(env, session).then(value => { nextPrepared = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([confirmed, cancelled, nextPrepared], [false, false, false]);
  assert.equal(env.walletFake.calls.sign.length, 1);
  held.resolve();
  error(await first, 'CANCELLED');
  ok(await cancel);
  const newHandle = ok(await next);
  assert.equal(records(env)[0].state, 'cancelled');
  assert.equal(records(env)[0].signature, null);
  assert.equal(sends(env), 0);
  ok(await env.client.cancel(newHandle));
});

test('cross-tab recovery invalidates a prepared funding intent while its original wallet is pending', async t => {
  const entered = deferred(), held = deferred();
  const env = fundingEnv('native', { wallet: {
    output: async wire => { entered.resolve(); await held.promise; return [{ signedTransaction: wire }]; },
  } });
  t.after(() => { held.resolve(); env.client.dispose(); });
  const { session, handle } = await prepared(env), confirming = env.client.confirm(handle, session);
  await entered.promise;
  const other = fundingEnv('native', { terms: env.terms, cluster: env.cluster,
    journalFake: env.journalFake, seed: 'recovery-client' });
  assert.equal(ok(await other.client.recover(other.trade))[0].state, 'cancelled');
  held.resolve();
  error(await confirming, 'CONFLICT');
  assert.equal(onlyRecord(env).signature, null);
  assert.equal(onlyRecord(env).sendMarkedAt, null);
  assert.equal(sends(env), 0);
});

test('a modified persisted funding record cannot replace the privately retained original', async () => {
  const env = fundingEnv(), { session, handle } = await prepared(env);
  onlyRecord(env).createdAt++; onlyRecord(env).updatedAt++;
  error(await env.client.confirm(handle, session), 'INTEGRITY_FAILURE');
  assert.equal(onlyRecord(env).state, 'prepared', 'cleanup cannot cancel a different persisted record');
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(sends(env), 0);
});

test('an uncertain funding marker remains durable and only explicit definitive-drop replacement permits a new review', async () => {
  const hooks = { after: record => record.state === 'sendMarked' ? 'throw' : undefined };
  const env = fundingEnv('native', { journal: { hooks } }), { session, handle } = await prepared(env);
  error(await env.client.confirm(handle, session), 'UNAVAILABLE');
  error(await env.client.cancel(handle), 'CONFLICT');
  error(await env.client.confirm(handle, session), 'CONFLICT');
  assert.equal(onlyRecord(env).state, 'sendMarked');
  assert.notEqual(onlyRecord(env).sendMarkedAt, null);
  assert.equal(sends(env), 0);
  error(await requestFunding(env, session), 'CONFLICT');
  hooks.after = undefined;
  env.cluster.advance(151);
  const [dropped] = ok(await env.client.reconcile(env.trade));
  assert.equal(dropped.state, 'dropped');
  error(await requestFunding(env, session), 'CONFLICT');
  const next = ok(await requestFunding(env, session, { rebuildOf: dropped.intentId }));
  assert.notEqual(next.blockhash, dropped.blockhash);
  assert.equal(records(env).at(-1).replacementOf, dropped.intentId);
  error(await requestFunding(env, session, { rebuildOf: dropped.intentId }), 'CONFLICT');
  assert.equal(ok(await env.client.confirm(next, session)).state, 'sent');
  assert.equal(sends(env), 1);
});

test('an uncertain funding broadcast reconciles without a second send or a cancellation claim', async () => {
  const env = fundingEnv('native', { clusterOptions: { sendBehavior: () => { throw new Error('SECRET synthetic provider'); } } });
  const { session, handle } = await prepared(env), sent = ok(await env.client.confirm(handle, session));
  assert.equal(sent.state, 'unknown');
  error(await env.client.confirm(handle, session), 'CONFLICT');
  error(await env.client.cancel(handle), 'CONFLICT');
  for (let i = 0; i < 2; i++) assert.equal(ok(await env.client.reconcile(env.trade))[0].state, 'unknown');
  assert.equal(sends(env), 1);
  env.cluster.advance(1); env.cluster.setEscrow(); env.cluster.land(sent.signature);
  assert.equal(ok(await env.client.reconcile(env.trade))[0].state, 'finalized');
  assert.notEqual(onlyRecord(env).sendMarkedAt, null);
  assert.equal(sends(env), 1);
});

test('restored funding preparations remain possibly sent under a different profile until proved dropped', async () => {
  const env = fundingEnv(), { handle } = await prepared(env);
  const journalFake = makeJournal({ store: env.journalFake.backup(), profileId: 'b'.repeat(32) });
  const restored = fundingEnv('native', { terms: env.terms, cluster: env.cluster, journalFake, seed: 'restored' });
  assert.equal(ok(await restored.client.recover(restored.trade))[0].state, 'prepared');
  error(await restored.client.cancel(handle), 'UNAUTHORIZED');
  const seller = await connected(restored, 'seller');
  error(await requestFunding(restored, seller), 'CONFLICT');
  restored.cluster.advance(151);
  assert.equal(ok(await restored.client.reconcile(restored.trade))[0].state, 'dropped');
  assert.equal(sends(restored), 0);
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

test('real encrypted journal funding preparation loses authority on lock without releasing pending wallet work', async t => {
  const pass = 'synthetic prepared funding passphrase';
  const vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
  t.after(() => vault.dispose());
  const vaultSession = ok(await vault.create(pass)), journal = new SolanaVaultJournal(vault, vaultSession);
  t.after(() => journal.dispose());
  const entered = deferred(), held = deferred();
  const env = fundingEnv('native', { journalFake: { journal }, wallet: {
    output: async wire => { entered.resolve(); await held.promise; return [{ signedTransaction: wire }]; },
  } });
  t.after(() => { held.resolve(); env.client.dispose(); });
  const { session, handle } = await prepared(env);
  let settled = false, nextSettled = false;
  const confirming = env.client.confirm(handle, session).then(value => { settled = true; return value; });
  await entered.promise;
  vault.lock(vaultSession.sessionId);
  const next = requestFunding(env, session).then(value => { nextSettled = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([settled, nextSettled], [false, false]);
  held.resolve();
  error(await confirming, 'LOCKED'); error(await next, 'LOCKED');
  assert.equal(env.walletFake.calls.sign.length, 1);
  assert.equal(sends(env), 0);
  const reopened = new SolanaVaultJournal(vault, ok(await vault.unlock(vaultSession.profileId, pass)));
  t.after(() => reopened.dispose());
  const [record] = ok(await reopened.read(env.binding)).records;
  assert.equal(record.action, 'fund');
  assert.equal(record.state, 'prepared');
  assert.equal(record.signature, null);
  assert.equal(record.sendMarkedAt, null);
  error(await env.client.confirm(handle, session), 'CONFLICT');
});
