// Payout preparation (review C-L2): release/refund alone, then a payout planned from finalized state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTokenAccount, planNativePayout, planSplPayout } from '../src/payout.ts';
import { settlementActions } from '../src/policy.ts';
import { isSolanaEscrowSnapshot } from '../src/reader.ts';
import { nextSettlementStep } from '../src/settlement.ts';
import {
  account,
  ata,
  b64,
  CLOCK,
  error,
  key,
  makeTerms,
  MINT,
  ok,
  PROGRAM,
  PROGRAM_DATA,
  RENT,
  request,
  setAccount,
  setup,
  SPL_2022_PROGRAM,
  SPL_PROGRAM,
  SYSTEM,
  tokenBytes,
  vaultPda,
} from './support.mjs';

const WALLET_RENT = 128 * 6960, ATA_RENT = (128 + 165) * 6960;
const BUYER = key('buyer'), SELLER = key('seller');
const BUYER_ATA = ata(BUYER, MINT), SELLER_ATA = ata(SELLER, MINT);
const shallow = (bytes, owner = SPL_PROGRAM, o = {}) => ({
  owner, executable: false, lamports: ATA_RENT, dataLength: bytes.length, data: bytes, ...o,
});
const tokenView = changes => classifyTokenAccount(shallow(tokenBytes({ owner: BUYER, ...changes })));

// ---- pure classification and plans ----
test('classify: {absent,prefunded,token-2022,size,executable,token,frozen,delegated,native,close}', () => {
  assert.deepEqual(classifyTokenAccount(null), { kind: 'absent' });
  assert.deepEqual(classifyTokenAccount(shallow(new Uint8Array(0), SYSTEM)), { kind: 'system-prefunded' });
  const bytes = tokenBytes({ owner: BUYER });
  assert.deepEqual(classifyTokenAccount(shallow(bytes, SPL_2022_PROGRAM)), {
    kind: 'foreign', programOwner: SPL_2022_PROGRAM,
  });
  assert.equal(classifyTokenAccount(shallow(new Uint8Array(8), SYSTEM)).kind, 'foreign', 'System with data');
  assert.equal(classifyTokenAccount(shallow(new Uint8Array(166))).kind, 'foreign');
  assert.equal(classifyTokenAccount(shallow(bytes, SPL_PROGRAM, { executable: true })).kind, 'foreign');
  assert.deepEqual(tokenView({ amount: 5 }), {
    kind: 'token', mint: MINT, owner: BUYER, amount: '5', state: 'initialized', delegated: false, native: false,
    closeAuthority: false,
  });
  assert.equal(tokenView({ state: 0 }).state, 'uninitialized');
  assert.equal(tokenView({ state: 2 }).state, 'frozen');
  assert.equal(tokenView({ delegate: 1 }).delegated, true);
  assert.equal(tokenView({ delegated: 3 }).delegated, true, 'a delegated amount without a delegate counts too');
  assert.equal(tokenView({ isNative: 1 }).native, true);
  assert.equal(tokenView({ close: 1 }).closeAuthority, true);
  assert.throws(() => tokenView({ state: 3 }), { code: 'INTEGRITY_FAILURE' });
  assert.throws(() => tokenView({ delegate: 2 }), { code: 'INTEGRITY_FAILURE' });
});

const spl = (view, custodyBlockedBy = [], rentLamports = String(ATA_RENT)) =>
  ok(planSplPayout({ recipient: BUYER, mint: MINT, destination: BUYER_ATA, view, custodyBlockedBy, rentLamports }));
const blockedSpl = reason => ({ kind: 'blocked', destination: BUYER_ATA, reason });

test('plan-spl: create, ready, blocked(reason) for each recipient-ATA view', () => {
  const create = { kind: 'create-ata-idempotent', destination: BUYER_ATA, owner: BUYER, mint: MINT,
    rentLamports: String(ATA_RENT) };
  assert.deepEqual(spl({ kind: 'absent' }), create);
  assert.deepEqual(spl({ kind: 'system-prefunded' }), create, 'CreateIdempotent accepts a lamport donation');
  assert.deepEqual(spl({ kind: 'absent' }, [], null).rentLamports, null);
  assert.deepEqual(spl(tokenView({})), { kind: 'ready', destination: BUYER_ATA });
  assert.deepEqual(spl(tokenView({ close: 1 })), { kind: 'ready', destination: BUYER_ATA },
    'a close authority cannot close a non-zero token account');
  assert.deepEqual(spl(tokenView({ owner: key('new-owner') })), blockedSpl('destination-wrong-owner'));
  assert.deepEqual(spl(tokenView({ mint: key('other-mint') })), blockedSpl('destination-wrong-mint'));
  assert.deepEqual(spl(tokenView({ state: 2 })), blockedSpl('destination-frozen'));
  assert.deepEqual(spl(tokenView({ state: 0 })), blockedSpl('destination-uninitialized'));
  assert.deepEqual(spl(tokenView({ delegate: 1 })), blockedSpl('destination-delegated'));
  assert.deepEqual(spl(tokenView({ isNative: 1 })), blockedSpl('destination-native'));
  assert.deepEqual(spl({ kind: 'foreign', programOwner: SPL_2022_PROGRAM }), blockedSpl('destination-not-spl-token'));
  // A frozen vault blocks every payout whatever the destination; only a thaw fixes it.
  for (const view of [{ kind: 'absent' }, tokenView({}), tokenView({ state: 2 })]) {
    assert.deepEqual(spl(view, ['vault-frozen']), blockedSpl('vault-frozen'));
  }
});

const native = (wallet, principal = '500000', custodyBlockedBy = []) =>
  ok(planNativePayout({ recipient: BUYER, principal, wallet, custodyBlockedBy }));
const wallet = (lamports, o = {}) => ({
  lamports: String(lamports), dataLength: 0, executable: false, rentExemptMinimum: String(WALLET_RENT), ...o,
});

test('plan-native: rent top-up for an empty wallet below the rent-exempt minimum, boundaries', () => {
  assert.deepEqual(native(wallet(0)), {
    kind: 'rent-top-up', recipient: BUYER, lamports: String(WALLET_RENT - 500_000),
    rentExemptMinimum: String(WALLET_RENT),
  });
  assert.deepEqual(native(wallet(0), String(WALLET_RENT - 1)).lamports, '1');
  assert.deepEqual(native(wallet(0), String(WALLET_RENT)), { kind: 'ready', recipient: BUYER });
  assert.deepEqual(native(wallet(0), String(WALLET_RENT + 1)), { kind: 'ready', recipient: BUYER });
  assert.deepEqual(native(wallet(WALLET_RENT - 500_000)), { kind: 'ready', recipient: BUYER });
  assert.equal(native(wallet(WALLET_RENT - 500_001)).lamports, '1', 'a rent-paying balance still needs a top-up');
  assert.deepEqual(native(wallet(1, { executable: true })), { kind: 'blocked', recipient: BUYER,
    reason: 'recipient-executable' });
  assert.equal(native(wallet(0, { rentExemptMinimum: null })).reason, 'rent-unknown');
  assert.equal(native(wallet(10 ** 9), '500000', ['rent-shortfall']).reason, 'rent-shortfall');
  assert.equal(native(wallet(10 ** 9), '500000', ['rent-unknown', 'rent-shortfall']).reason, 'rent-unknown');
});

test('plan-*: malformed input gives INVALID_INPUT', () => {
  const good = { recipient: BUYER, mint: MINT, destination: BUYER_ATA, view: { kind: 'absent' }, custodyBlockedBy: [],
    rentLamports: null };
  for (const changes of [{ recipient: 'x' }, { view: { kind: 'other' } }, { view: null },
    { view: { ...tokenView({}), state: 'gone' } }, { custodyBlockedBy: ['rent-unknown'] }, { rentLamports: -1 },
    { custodyBlockedBy: 'vault-frozen' }]) {
    error(planSplPayout({ ...good, ...changes }), 'INVALID_INPUT');
  }
  const nativeGood = { recipient: BUYER, principal: '1', wallet: wallet(0), custodyBlockedBy: [] };
  for (const changes of [{ principal: '01' }, { wallet: { ...wallet(0), lamports: '1.5' } }, { wallet: null },
    { wallet: { ...wallet(0), dataLength: -1 } }, { custodyBlockedBy: ['vault-frozen'] }]) {
    error(planNativePayout({ ...nativeGood, ...changes }), 'INVALID_INPUT');
  }
});

// ---- reader: readPayout at one slot ----
async function readPayout(kind, o = {}) {
  const s = setup(kind, o);
  try {
    return { ...s, result: await s.reader.readPayout(s.binding, request(), s.terms) };
  } finally {
    s.reader.dispose();
  }
}
const put = (address, entry) => world => setAccount(world, address, entry);
const both = (...mutations) => (world, terms) => mutations.forEach(mutate => mutate(world, terms));

test('readPayout-native: same-slot keys, top-up for an empty buyer, pending follows the terminal state', async () => {
  const termsChanges = { amountBaseUnits: '500000' };
  const funded = await readPayout('native', { termsChanges });
  const value = ok(funded.result);
  const escrow = value.snapshot.escrowAddress;
  assert.deepEqual(funded.calls[1].params[0], [PROGRAM, PROGRAM_DATA, CLOCK, escrow, RENT, BUYER, SELLER]);
  assert.equal(funded.calls.length, 5);
  assert.deepEqual(value.buyer, { kind: 'rent-top-up', recipient: BUYER, lamports: String(WALLET_RENT - 500_000),
    rentExemptMinimum: String(WALLET_RENT) });
  assert.equal(value.pending, null, 'funded: nothing to pay out yet');
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.buyer));
  const seller = put(SELLER, account(new Uint8Array(0), SYSTEM, { lamports: 5 * 10 ** 9 }));
  const released = ok((await readPayout('native', { termsChanges, world: { escrow: { state: 1 } },
    mutate: seller })).result);
  assert.deepEqual(released.pending, released.buyer);
  assert.deepEqual(released.seller, { kind: 'ready', recipient: SELLER });
  const refunded = ok((await readPayout('native', { termsChanges, world: { escrow: { state: 2 } },
    mutate: seller })).result);
  assert.deepEqual(refunded.pending, { kind: 'ready', recipient: SELLER });
  const paid = ok((await readPayout('native', { world: { escrow: { state: 1, paid: 1 } } })).result);
  assert.deepEqual([paid.buyer, paid.seller, paid.pending, paid.snapshot.payout], [null, null, null, 'complete']);
  // `read` keeps its own five keys: readPayout adds the destinations only when asked.
  const plain = setup('native');
  try {
    ok(await plain.reader.read(plain.binding, request(), plain.terms));
    assert.equal(plain.calls[1].params[0].length, 5);
  } finally {
    plain.reader.dispose();
  }
});

test('readPayout-native: large or whale recipients are read by metadata only', async () => {
  const big = 1024 * 1024, data = [b64(new Uint8Array(big)), 'base64'];
  const program = { data, executable: false, lamports: 10, owner: key('some-program'), space: big };
  const value = ok((await readPayout('native', { termsChanges: { amountBaseUnits: '500000' },
    world: { escrow: { state: 1 } }, mutate: put(BUYER, program) })).result);
  const minimum = (128 + big) * 6960;
  assert.deepEqual(value.pending, { kind: 'rent-top-up', recipient: BUYER, lamports: String(minimum - 500_010),
    rentExemptMinimum: String(minimum) });
  const whale = { ...account(new Uint8Array(0), SYSTEM), lamports: 2 ** 60 };
  assert.equal(ok((await readPayout('native', { mutate: put(BUYER, whale) })).result).buyer.kind, 'ready');
  const executable = account(new Uint8Array(0), key('loader'), { executable: true });
  assert.equal(ok((await readPayout('native', { world: { escrow: { state: 1 } }, mutate: put(BUYER, executable) }))
    .result).pending.reason, 'recipient-executable');
  for (const bad of [
    { ...program, space: big + 1 },
    { ...program, space: big - 1 },
    { ...program, data: [`${data[0].slice(0, -4)}AAA=`, 'base64'] },
    { ...program, space: 10 * 1024 * 1024 + 1, data: [b64(new Uint8Array(10 * 1024 * 1024 + 1)), 'base64'] },
    (({ space: _, ...rest }) => rest)(program),
    { ...program, lamports: -1 },
    { ...program, lamports: 1.5 },
    { ...program, data: [data[0], 'base58'] },
  ]) {
    error((await readPayout('native', { mutate: put(BUYER, bad) })).result, 'INTEGRITY_FAILURE');
  }
});

test('readPayout-spl: create-ata, frozen destination blocks payout only, frozen vault precedence', async () => {
  const funded = await readPayout('spl');
  const value = ok(funded.result), escrow = value.snapshot.escrowAddress;
  assert.deepEqual(funded.calls[1].params[0], [PROGRAM, PROGRAM_DATA, CLOCK, escrow, vaultPda(escrow).address, MINT,
    RENT, BUYER_ATA, SELLER_ATA]);
  assert.deepEqual(value.buyer, { kind: 'create-ata-idempotent', destination: BUYER_ATA, owner: BUYER, mint: MINT,
    rentLamports: String(ATA_RENT) });
  const frozenDestination = put(BUYER_ATA, account(tokenBytes({ owner: BUYER, state: 2 }), SPL_PROGRAM));
  const sellerAta = put(SELLER_ATA, account(tokenBytes({ owner: SELLER }), SPL_PROGRAM));
  // Funded with a frozen buyer ATA: release is still offered (it is state-only); only the later payout waits.
  const before = ok((await readPayout('spl', { mutate: both(frozenDestination, sellerAta) })).result);
  assert.deepEqual(before.buyer, { kind: 'blocked', destination: BUYER_ATA, reason: 'destination-frozen' });
  assert.deepEqual(before.seller, { kind: 'ready', destination: SELLER_ATA });
  assert.equal(before.pending, null);
  assert.deepEqual(ok(settlementActions(before.snapshot, '300')), { release: true, refund: false });
  const released = await readPayout('spl', { world: { escrow: { state: 1 } }, mutate: frozenDestination });
  assert.equal(ok(released.result).snapshot.observation.state, 'released');
  assert.equal(ok(released.result).pending.reason, 'destination-frozen');
  // Frozen vault (C-L3): reported funded, both plans blocked by the vault until a thaw.
  const permits = { freezeAuthorityPermits: [{ mint: MINT, freezeAuthority: key('freezer') }] };
  const frozen = ok((await readPayout('spl', { world: { vault: { state: 2 }, mint: { freeze: key('freezer') },
    escrow: { state: 1 } }, mutate: sellerAta, options: permits })).result);
  assert.equal(frozen.snapshot.observation.state, 'released');
  assert.deepEqual([frozen.pending.reason, frozen.seller.reason], ['vault-frozen', 'vault-frozen']);
  // A Token-2022 account or a reassigned owner at the canonical address.
  const foreign = put(BUYER_ATA, account(tokenBytes({ owner: BUYER }), SPL_2022_PROGRAM));
  assert.equal(ok((await readPayout('spl', { world: { escrow: { state: 1 } }, mutate: foreign })).result)
    .pending.reason, 'destination-not-spl-token');
  const reassigned = put(BUYER_ATA, account(tokenBytes({ owner: key('thief') }), SPL_PROGRAM));
  assert.equal(ok((await readPayout('spl', { world: { escrow: { state: 1 } }, mutate: reassigned })).result)
    .pending.reason, 'destination-wrong-owner');
  // An oversized account at the ATA address is classified, not decoded.
  const oversized = { ...account(new Uint8Array(0), SPL_PROGRAM), data: [b64(new Uint8Array(300)), 'base64'],
    space: 300 };
  assert.equal(ok((await readPayout('spl', { mutate: put(BUYER_ATA, oversized) })).result).buyer.reason,
    'destination-not-spl-token');
  const unknownRent = put(RENT, account(Uint8Array.from([...new Uint8Array(8), ...new Uint8Array(8), 50]), key('x')));
  error((await readPayout('spl', { mutate: unknownRent })).result, 'INTEGRITY_FAILURE');
});

test('readPayout: refused like read on every pre-RPC and identity failure', async () => {
  const s = setup('spl', { termsChanges: { mint: key('unlisted-mint') } });
  try {
    error(await s.reader.readPayout(s.binding, request(), s.terms), 'UNSUPPORTED_PROVIDER');
    assert.equal(s.calls.length, 0);
  } finally {
    s.reader.dispose();
  }
  error((await readPayout('native', { mutate: put(PROGRAM_DATA, null) })).result, 'INTEGRITY_FAILURE');
  const terms = makeTerms('native');
  assert.equal(terms.buyer, BUYER);
});


test('payout-read-shares-snapshot-brand-and-request-guards', async () => {
  const s = setup('native', { world: { escrow: { state: 1 } } });
  try {
    const readiness = ok(await s.reader.readPayout(s.binding, request(), s.terms));
    assert.ok(isSolanaEscrowSnapshot(readiness.snapshot));
    assert.deepEqual(ok(nextSettlementStep(readiness.snapshot, {
      role: 'buyer', chainTime: readiness.snapshot.live.timestampSeconds, releaseMargin: '300',
    })), { action: 'payout', reason: 'payout-pending', outcome: 'released' });
    const calls = s.calls.length;
    for (const bad of [null, { ...request(), signal: {} },
      { ...request(), get signal() { throw new Error('caller'); } },
      { ...request(), get generation() { throw new Error('caller'); } },
      { ...request(), get requestSequence() { throw new Error('caller'); } }]) {
      error(await s.reader.readPayout(s.binding, bad, s.terms), 'INVALID_INPUT');
    }
    assert.equal(s.calls.length, calls);
  } finally {
    s.reader.dispose();
  }
});
