import test from 'node:test';
import assert from 'node:assert/strict';
import { planPayout, readTrustedSnapshot } from '../src/plan.ts';
import { SolanaChainReader } from '../src/reader.ts';
import {
  bindRecoveryTrade, buildRecoveryMessage, createRecoveryDocument, recoveryExits, recoveryRegistry,
} from '../src/recovery.ts';
import { connected, MARGINS, setupClient } from './lifecycle-support.mjs';
import { account, error, key, ok, RENT, RENT_MIN, rentBytes, request, SYSTEM, SYSVAR } from './support.mjs';

const BLOCKHASH = key('rent-readiness-blockhash');
const unknownRent = env => env.cluster.world.accounts.set(RENT, account(rentBytes(6960, '000000000000f83f'), SYSVAR));
const knownRent = env => env.cluster.world.accounts.set(RENT, account(rentBytes(), SYSVAR));
const sends = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;
function fixture(t, state = 1) {
  const env = setupClient('native', { clusterOptions: { world: { escrow: { state } } } });
  t.after(() => env.client.dispose());
  const document = ok(createRecoveryDocument(env.trade)), trade = ok(bindRecoveryTrade(document));
  // The document's registry and the real reader mint the trusted snapshot, without a hand-built brand.
  const reader = new SolanaChainReader({ rpc: env.cluster.rpc, registry: recoveryRegistry(document), now: () => 1 });
  const read = async () => ok(await readTrustedSnapshot(reader, trade, request()));
  const exits = snapshot => ok(recoveryExits(document, trade, snapshot, MARGINS)).exits;
  const payout = (snapshot, role, options = {}) =>
    buildRecoveryMessage(document, trade, snapshot, 'payout', role, MARGINS, BLOCKHASH, options);
  return { ...env, document, recoveryTrade: trade, read, exits, payout };
}

test('unknown rent blocks native payout plans and recovery messages for both outcomes and payers', async t => {
  for (const state of [1, 2]) {
    const env = fixture(t, state);
    unknownRent(env);
    for (const lamports of [500001000, 10000000000, 9000000000000]) {
      env.cluster.setEscrow({ state }, lamports);
      const snapshot = await env.read();
      assert.deepEqual(snapshot.custody.payoutBlockedBy, ['rent-unknown']);
      assert.equal(snapshot.custody.rentExemptMinimum, null);
      for (const role of ['seller', 'buyer']) for (const cap of ['0', '18446744073709551615']) {
        const options = { maxRentTopUpLamports: cap };
        error(planPayout(env.recoveryTrade, snapshot, role, options), 'CONFLICT');
        error(env.payout(snapshot, role, options), 'CONFLICT');
      }
    }
  }
});

test('recovery exits describe native rent blockers and retain paid-out precedence', async t => {
  for (const state of [1, 2]) {
    const env = fixture(t, state), amount = Number(env.terms.amountBaseUnits);
    for (const reason of ['rent-shortfall', 'rent-unknown']) {
      knownRent(env);
      env.cluster.setEscrow({ state }, amount + RENT_MIN - 1000);
      if (reason === 'rent-unknown') unknownRent(env);
      const payout = env.exits(await env.read()).find(exit => exit.exit === 'payout');
      assert.deepEqual(payout, { exit: 'payout', roles: ['seller', 'buyer'], open: false, reason });
    }
    env.cluster.setEscrow({ state, paid: 1 });
    assert.equal(env.exits(await env.read()).find(exit => exit.exit === 'payout').reason, 'paid-out');
    knownRent(env);
    env.cluster.setEscrow({ state });
    assert.equal(env.exits(await env.read()).find(exit => exit.exit === 'payout').open, true);
    assert.equal(ok(env.payout(await env.read(), 'buyer')).plan.shape.rentTopUpLamports, null);
  }
});

test('known native shortfalls remain recoverable only within the explicit top-up cap', async t => {
  for (const state of [1, 2]) {
    const env = fixture(t, state), amount = Number(env.terms.amountBaseUnits);
    for (const shortfall of [1, 1000, RENT_MIN - 1]) {
      env.cluster.setEscrow({ state }, amount + RENT_MIN - shortfall);
      const snapshot = await env.read();
      for (const role of ['seller', 'buyer']) {
        error(env.payout(snapshot, role), 'LIMIT_EXCEEDED');
        error(env.payout(snapshot, role, { maxRentTopUpLamports: String(shortfall - 1) }), 'LIMIT_EXCEEDED');
        const { plan } = ok(env.payout(snapshot, role, { maxRentTopUpLamports: String(shortfall) }));
        assert.equal(plan.shape.rentTopUpLamports, String(shortfall));
        assert.equal(plan.instructions.length, 2);
        assert.equal(plan.instructions[0].programId, SYSTEM);
        assert.equal(Buffer.from(plan.instructions[0].data).readBigUInt64LE(4), BigInt(shortfall));
      }
    }
  }
});

test('unknown rent reaches neither wallet signing, intent writes nor send through the full client', async t => {
  for (const state of [1, 2]) for (const role of ['seller', 'buyer']) {
    const env = fixture(t, state), session = await connected(env, role);
    unknownRent(env);
    error(await env.client.payout(env.trade, session, { maxRentTopUpLamports: '18446744073709551615' }), 'CONFLICT');
    error(await env.client.prepare(env.trade, session, 'payout'), 'CONFLICT');
    assert.equal(env.walletFake.calls.sign.length, 0);
    assert.equal(sends(env), 0);
    assert.deepEqual(env.journalFake.writes, []);
    // A changed, supported Rent sysvar and a new explicit action are required; no automatic retry exists.
    knownRent(env);
    assert.equal(ok(await env.client.payout(env.trade, session)).state, 'sent');
    assert.equal(env.walletFake.calls.sign.length, 1);
    assert.equal(sends(env), 1);
  }
});

test('a prepared payout rechecks rent before signing and before physical send', async t => {
  for (const phase of ['before-sign', 'after-sign']) {
    const env = fixture(t), session = await connected(env, 'buyer');
    const prepared = ok(await env.client.prepare(env.trade, session, 'payout'));
    if (phase === 'before-sign') unknownRent(env);
    else {
      const feature = env.walletFake.wallet.features['solana:signTransaction'], original = feature.signTransaction;
      feature.signTransaction = async (...inputs) => {
        const result = await original(...inputs);
        unknownRent(env);
        return result;
      };
    }
    error(await env.client.confirm(prepared, session), 'CONFLICT');
    assert.equal(env.walletFake.calls.sign.length, phase === 'before-sign' ? 0 : 1);
    assert.equal(sends(env), 0);
    assert.equal(env.journalFake.records(env.binding)[0].state, 'cancelled');
    assert.equal(env.journalFake.records(env.binding)[0].sendMarkedAt, null);
  }
});

test('native rent blockers leave funded release and refund recovery and full-client actions available', async t => {
  for (const reason of ['rent-shortfall', 'rent-unknown']) for (const action of ['release', 'refund']) {
    const env = fixture(t, 0), amount = Number(env.terms.amountBaseUnits);
    env.cluster.setEscrow({ state: 0 }, amount + RENT_MIN - 1000);
    if (reason === 'rent-unknown') unknownRent(env);
    if (action === 'refund') env.cluster.advance(1, Number(env.terms.escrowExpirySeconds) - env.cluster.time);
    const snapshot = await env.read();
    assert.deepEqual(snapshot.custody.payoutBlockedBy, [reason]);
    assert.equal(env.exits(snapshot).find(exit => exit.exit === action).open, true);
    assert.equal(env.exits(snapshot).find(exit => exit.exit === 'payout').reason, 'not-terminal');
    const message = ok(buildRecoveryMessage(
      env.document, env.recoveryTrade, snapshot, action, 'seller', MARGINS, BLOCKHASH));
    assert.equal(message.plan.instructions.length, 1);
    assert.equal(message.plan.shape.action, action);
    assert.equal(ok(await env.client[action](env.trade, await connected(env, 'seller'))).state, 'sent');
    assert.equal(env.walletFake.calls.sign.length, 1);
    assert.equal(sends(env), 1);
  }
});
