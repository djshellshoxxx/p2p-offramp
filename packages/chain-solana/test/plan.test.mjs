import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreateAtaIdempotent, buildSystemTransfer } from '../src/auxiliary.ts';
import { bindSolanaTrade } from '../src/bind.ts';
import { buildFundNative, buildPayout, buildRefund, buildRelease } from '../src/instructions.ts';
import { compileLegacyMessage, parseLegacyMessage } from '../src/message.ts';
import {
  compilePlan,
  parseMargins,
  planFund,
  planPayout,
  planRefund,
  planRelease,
  readTrustedSnapshot,
  verifyPlanMessage,
} from '../src/plan.ts';
import { SolanaChainReader } from '../src/reader.ts';
import { BUYER, makeCluster, MARGINS, SELLER } from './lifecycle-support.mjs';
import { bindingOf, CHAIN_TIME, error, key, makeRegistry, makeTerms, MINT, ok, request, SYSTEM } from './support.mjs';

const code = expected => thrown => thrown?.code === expected;
const BLOCKHASH = key('plan-blockhash');
function env(kind = 'native', o = {}) {
  const terms = makeTerms(kind, { seller: SELLER.address, buyer: BUYER.address, ...o.terms });
  const cluster = makeCluster(terms, o.cluster);
  const trade = ok(bindSolanaTrade(makeRegistry(), bindingOf(terms), terms));
  const reader = new SolanaChainReader({ rpc: cluster.rpc, registry: makeRegistry(), now: () => 7 });
  const snapshot = async () => ok(await readTrustedSnapshot(reader, trade, request()));
  return { terms, cluster, trade, snapshot };
}
const ix = built => ok(built);
const programsOf = plan => plan.instructions.map(entry => entry.programId);

test('payout-only-after-finalized-terminal-trusted-read', async () => {
  const native = env('native');
  error(planPayout(native.trade, await native.snapshot(), 'seller'), 'CONFLICT');
  native.cluster.setEscrow({ state: 1 });
  const released = await native.snapshot();
  error(planPayout(native.trade, structuredClone(released), 'seller'), 'INVALID_INPUT');
  error(planPayout(native.trade, { ...released }, 'seller'), 'INVALID_INPUT');
  const plan = ok(planPayout(native.trade, released, 'buyer'));
  assert.deepEqual(programsOf(plan), [native.trade.deployment.address]);
  assert.equal(plan.feePayer, BUYER.address);
  assert.equal(plan.expectedEscrowState, 'released');
  native.cluster.setEscrow({ state: 1, paid: 1 });
  error(planPayout(native.trade, await native.snapshot(), 'seller'), 'CONFLICT');

  const spl = env('spl');
  spl.cluster.setEscrow({ state: 2 });
  const refunded = await spl.snapshot();
  const withAta = ok(planPayout(spl.trade, refunded, 'seller'));
  assert.deepEqual(programsOf(withAta), ['ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', spl.trade.deployment.address]);
  // Refunded: the canonical ATA created and paid is the seller's own.
  const ata = buildCreateAtaIdempotent(SELLER.address, SELLER.address, MINT);
  assert.equal(withAta.instructions[0].accounts[1].pubkey, ata.accounts[1].pubkey);
  assert.equal(withAta.instructions[1].accounts[3].pubkey, ata.accounts[1].pubkey);
  assert.equal(ok(planPayout(spl.trade, refunded, 'seller', { createAta: false })).instructions.length, 1);
});

test('bundles-and-foreign-instructions-refused', async () => {
  const { trade } = env('spl');
  const seller = SELLER.address,
    payout = ix(buildPayout(trade, 'released')),
    refundPayout = ix(buildPayout(trade, 'refunded'));
  const ata = buildCreateAtaIdempotent(seller, BUYER.address, MINT);
  const nonce = {
    programId: SYSTEM,
    accounts: [
      { pubkey: key('nonce'), isSigner: false, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: false },
    ],
    data: Uint8Array.of(4, 0, 0, 0),
  };
  const foreign = { programId: key('foreign-program'), accounts: [], data: Uint8Array.of(9) };
  const bundles = {
    'release+payout': [
      ['payout', 'released'],
      [ix(buildRelease(trade)), payout],
    ],
    'release+ata+payout': [
      ['payout', 'released'],
      [ix(buildRelease(trade)), ata, payout],
    ],
    'refund+payout': [
      ['payout', 'refunded'],
      [ix(buildRefund(trade)), refundPayout],
    ],
    'release+payout as release': [
      ['release', 'funded'],
      [ix(buildRelease(trade)), payout],
    ],
    'release twice': [
      ['release', 'funded'],
      [ix(buildRelease(trade)), ix(buildRelease(trade))],
    ],
    'release+refund': [
      ['release', 'funded'],
      [ix(buildRelease(trade)), ix(buildRefund(trade))],
    ],
    'payout twice': [
      ['payout', 'released'],
      [payout, payout],
    ],
    'payout then ata': [
      ['payout', 'released'],
      [payout, ata],
    ],
    'durable nonce + release': [
      ['release', 'funded'],
      [nonce, ix(buildRelease(trade))],
    ],
    'foreign + release': [
      ['release', 'funded'],
      [foreign, ix(buildRelease(trade))],
    ],
    'ata for another owner': [
      ['payout', 'released'],
      [buildCreateAtaIdempotent(seller, key('x'), MINT), payout],
    ],
    'spl payout with transfer': [
      ['payout', 'released'],
      [buildSystemTransfer(seller, trade.escrow.address, 5n), payout],
    ],
  };
  for (const [name, [[action, state], instructions]] of Object.entries(bundles)) {
    const message = compileLegacyMessage(seller, instructions, BLOCKHASH);
    assert.throws(() => verifyPlanMessage(trade, action, state, seller, message), code('INVALID_INPUT'), name);
  }
  // The exact shapes are accepted.
  const good = compileLegacyMessage(seller, [ata, payout], BLOCKHASH);
  assert.equal(verifyPlanMessage(trade, 'payout', 'released', seller, good).createAta, true);
  const release = compileLegacyMessage(seller, [ix(buildRelease(trade))], BLOCKHASH);
  assert.deepEqual(verifyPlanMessage(trade, 'release', 'funded', seller, release), { action: 'release' });
});

test('program-account-mint-substitution-refused', async () => {
  const { trade, terms } = env('spl');
  const seller = SELLER.address;
  const other = makeTerms('spl', { seller, buyer: BUYER.address, sellerNonce: 'ab'.repeat(32) });
  const otherTrade = ok(bindSolanaTrade(makeRegistry(), bindingOf(other), other));
  const release = ix(buildRelease(trade)),
    payout = ix(buildPayout(trade, 'released'));
  const swap = (instruction, index, pubkey) => ({
    ...instruction,
    accounts: instruction.accounts.map((m, i) => (i === index ? { ...m, pubkey } : m)),
  });
  const cases = {
    'other escrow': [['release', 'funded'], [ix(buildRelease(otherTrade))]],
    'program id': [['release', 'funded'], [{ ...release, programId: key('evil-program') }]],
    'escrow account': [['release', 'funded'], [swap(release, 1, key('evil-escrow'))]],
    'payout vault': [['payout', 'released'], [swap(payout, 1, key('evil-vault'))]],
    'payout mint': [['payout', 'released'], [swap(payout, 2, key('evil-mint'))]],
    'payout destination': [['payout', 'released'], [swap(payout, 3, key('evil-ata'))]],
    'token program 2022': [['payout', 'released'], [swap(payout, 4, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')]],
    'refund recipient under release': [['payout', 'released'], [ix(buildPayout(trade, 'refunded'))]],
  };
  for (const [name, [[action, state], instructions]] of Object.entries(cases)) {
    const message = compileLegacyMessage(seller, instructions, BLOCKHASH);
    assert.throws(() => verifyPlanMessage(trade, action, state, seller, message), code('INVALID_INPUT'), name);
  }
  // Fee payer must be the stated one and the only signer.
  const message = compileLegacyMessage(seller, [release], BLOCKHASH);
  assert.throws(() => verifyPlanMessage(trade, 'release', 'funded', BUYER.address, message), code('INVALID_INPUT'));
  const twoSigners = compileLegacyMessage(BUYER.address, [release], BLOCKHASH);
  assert.equal(parseLegacyMessage(twoSigners).header.numRequiredSignatures, 2);
  assert.throws(() => verifyPlanMessage(trade, 'release', 'funded', BUYER.address, twoSigners), code('INVALID_INPUT'));
  assert.equal(terms.assetKind, 'spl');
});

test('release-and-refund-windows-on-finalized-clock', async () => {
  const at = async (time, call) => {
    const e = env('native');
    e.cluster.time = time;
    e.cluster.sync();
    return call(e.trade, await e.snapshot());
  };
  const expiry = CHAIN_TIME + 3600;
  // releaseOpen: now + 300 < deadline.
  ok(await at(expiry - 301, (trade, snap) => planRelease(trade, snap, 'seller', MARGINS)));
  error(await at(expiry - 300, (trade, snap) => planRelease(trade, snap, 'seller', MARGINS)), 'EXPIRED');
  // refundOpen: now >= deadline.
  error(await at(expiry - 1, (trade, snap) => planRefund(trade, snap, 'seller', MARGINS)), 'EXPIRED');
  const refund = ok(await at(expiry, (trade, snap) => planRefund(trade, snap, 'seller', MARGINS)));
  assert.equal(refund.instructions.length, 1);
  assert.equal(refund.expectedEscrowState, 'funded');
});

test('roles-and-fund-preconditions', async () => {
  const e = env('native');
  const snap = await e.snapshot();
  error(planRelease(e.trade, snap, 'buyer', MARGINS), 'UNAUTHORIZED');
  error(planRefund(e.trade, snap, 'buyer', MARGINS), 'UNAUTHORIZED');
  error(planFund(e.trade, snap, 'seller', MARGINS), 'CONFLICT');
  const absent = env('native', { cluster: { absent: true } });
  const empty = await absent.snapshot();
  error(planFund(absent.trade, empty, 'buyer', MARGINS), 'UNAUTHORIZED');
  const fund = ok(planFund(absent.trade, empty, 'seller', MARGINS));
  assert.deepEqual(fund.instructions[0].data, ix(buildFundNative(absent.trade)).data);
  assert.equal(compilePlan(fund, BLOCKHASH)[0], 1);
  absent.cluster.time = Number(absent.terms.acceptBeforeSeconds) - 30;
  absent.cluster.sync();
  error(planFund(absent.trade, await absent.snapshot(), 'seller', MARGINS), 'EXPIRED');
  const spl = env('spl', { cluster: { absent: true } });
  const splFund = ok(planFund(spl.trade, await spl.snapshot(), 'seller', MARGINS));
  assert.equal(
    splFund.shape.sellerTokenAccount,
    buildCreateAtaIdempotent(SELLER.address, SELLER.address, MINT).accounts[1].pubkey,
  );
});

test('native-rent-top-up-bounded', async () => {
  const e = env('native');
  const amount = Number(e.terms.amountBaseUnits);
  e.cluster.setEscrow({ state: 1 }, amount + 2_436_000 - 1_000);
  const snap = await e.snapshot();
  assert.deepEqual(snap.custody.payoutBlockedBy, ['rent-shortfall']);
  error(planPayout(e.trade, snap, 'buyer'), 'LIMIT_EXCEEDED');
  error(planPayout(e.trade, snap, 'buyer', { maxRentTopUpLamports: '999' }), 'LIMIT_EXCEEDED');
  const plan = ok(planPayout(e.trade, snap, 'buyer', { maxRentTopUpLamports: '1000' }));
  const transfer = plan.instructions[0];
  assert.equal(transfer.programId, SYSTEM);
  assert.deepEqual(
    transfer.accounts.map(m => m.pubkey),
    [BUYER.address, e.trade.escrow.address],
  );
  assert.equal(Buffer.from(transfer.data).readBigUInt64LE(4), 1000n);
  const message = compilePlan(plan, BLOCKHASH);
  assert.equal(verifyPlanMessage(e.trade, 'payout', 'released', BUYER.address, message).rentTopUpLamports, '1000');
  // A top-up is never added to an SPL payout or without a shortfall.
  e.cluster.setEscrow({ state: 1 });
  assert.equal(
    ok(planPayout(e.trade, await e.snapshot(), 'buyer', { maxRentTopUpLamports: '5000' })).instructions.length,
    1,
  );
});

test('frozen-vault-release-allowed-payout-refused', async () => {
  const e = env('spl', { cluster: { world: { vault: { state: 2 } } } });
  const funded = await e.snapshot();
  assert.equal(funded.custody.vaultFrozen, true);
  ok(planRelease(e.trade, funded, 'seller', MARGINS));
  e.cluster.setEscrow({ state: 1 });
  error(planPayout(e.trade, await e.snapshot(), 'buyer'), 'CONFLICT');
});

test('margins-are-required-and-strict', () => {
  for (const bad of [
    undefined,
    {},
    { submitMarginSeconds: '60' },
    { ...MARGINS, extra: '1' },
    { submitMarginSeconds: 60, releaseMarginSeconds: '300' },
    { submitMarginSeconds: '-1', releaseMarginSeconds: '1' },
  ]) {
    assert.throws(() => parseMargins(bad), code('INVALID_INPUT'), JSON.stringify(bad));
  }
  assert.deepEqual(parseMargins(MARGINS), MARGINS);
});
