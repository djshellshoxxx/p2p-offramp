import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSolanaTrade } from '../src/bind.ts';
import { buildPayout } from '../src/instructions.ts';
import { isSolanaEscrowSnapshot } from '../src/reader.ts';
import { nextSettlementStep, SETTLEMENT_REASONS } from '../src/settlement.ts';
import {
  account,
  CHAIN_TIME,
  CLOCK,
  clockBytes,
  DEPLOYMENT_ID,
  error,
  escrowBytes,
  NETWORK_ID,
  ok,
  PROGRAM,
  RENT,
  RENT_MIN,
  rentBytes,
  request,
  setAccount,
  setup,
  SLOT,
  SYSTEM,
  SYSVAR,
  vaultPda,
} from './support.mjs';

const DEADLINE = CHAIN_TIME + 3600;
const MARGIN = '60';
const ROLES = ['seller', 'buyer', 'third-party'];
/** Chain times against the default deadline and a 60 s release margin. */
const WINDOWS = {
  'release-open': CHAIN_TIME,
  'release-last-second': DEADLINE - 61,
  'margin-gap': DEADLINE - 60,
  'margin-gap-end': DEADLINE - 1,
  'refund-open': DEADLINE,
  'refund-late': DEADLINE + 100_000,
};
const windowOf = name => (name.startsWith('release') ? 'release' : name.startsWith('margin') ? 'gap' : 'refund');

const unknownRent = world => setAccount(world, RENT, account(rentBytes(6960, '000000000000f83f'), SYSVAR));
const absentEscrow = world => setAccount(world, world.escrow.address, null);
const absentSpl = world => {
  absentEscrow(world);
  setAccount(world, vaultPda(world.escrow.address).address, null);
};
const donation = account(new Uint8Array(0), SYSTEM, { lamports: 5 });
const frozenVault = { vault: { state: 2 } };
/** [label, kind, setup options, expected chain state, paid, payout blocker or null]. */
const SNAPSHOTS = [
  ['absent', 'native', { mutate: absentEscrow }, 'absent', false, null],
  ['absent-prefunded', 'native', { mutate: world => setAccount(world, world.escrow.address, donation) }, 'absent',
    false, null],
  ['absent-spl', 'spl', { mutate: absentSpl }, 'absent', false, null],
  ['funded', 'native', {}, 'funded', false, null],
  ['funded-rent-shortfall', 'native', { world: { lamports: 500_001_000 } }, 'funded', false, null],
  ['funded-rent-unknown', 'native', { mutate: unknownRent }, 'funded', false, null],
  ['funded-spl', 'spl', {}, 'funded', false, null],
  ['funded-spl-frozen', 'spl', { world: frozenVault }, 'funded', false, null],
  ...['released', 'refunded'].flatMap((state, index) => {
    const escrow = { state: index + 1 };
    return [
      [state, 'native', { world: { escrow } }, state, false, null],
      [`${state}-rent-shortfall`, 'native', { world: { escrow, lamports: 500_001_000 } }, state, false,
        'rent-shortfall'],
      [`${state}-rent-unknown`, 'native', { world: { escrow }, mutate: unknownRent }, state, false, 'rent-unknown'],
      [`${state}-spl`, 'spl', { world: { escrow } }, state, false, null],
      [`${state}-spl-frozen`, 'spl', { world: { escrow, ...frozenVault } }, state, false, 'vault-frozen'],
      [`${state}-paid`, 'native', { world: { escrow: { ...escrow, paid: 1 } } }, state, true, null],
      [`${state}-paid-rent-unknown`, 'native', { world: { escrow: { ...escrow, paid: 1 } }, mutate: unknownRent },
        state, true, null],
      [`${state}-paid-spl-frozen`, 'spl', { world: { escrow: { ...escrow, paid: 1 }, vaultAmount: 3, ...frozenVault } },
        state, true, null],
    ];
  }),
];

/** The finalized Clock (at slot S) reads `chainTime`; a snapshot is planned only at its own Clock time. */
const clockAt = (world, chainTime) => setAccount(world, CLOCK, account(clockBytes(world.slot, chainTime), SYSVAR));
async function snapshotOf(kind, options, chainTime = CHAIN_TIME) {
  const mutate = (world, terms) => {
    clockAt(world, chainTime);
    options.mutate?.(world, terms);
  };
  const s = setup(kind, { ...options, mutate });
  try {
    return { ...s, snapshot: ok(await s.reader.read(s.binding, request(), s.terms)) };
  } finally {
    s.reader.dispose();
  }
}
const plan = (snapshot, role, chainTime, releaseMargin = MARGIN) =>
  nextSettlementStep(snapshot, { role, chainTime: String(chainTime), releaseMargin });

/** Independent statement of the rules, written from the task text rather than from src. */
function expected(state, paid, blocker, role, window) {
  if (state === 'absent') return { action: 'none', reason: 'escrow-absent' };
  if (paid) return { action: 'none', reason: 'payout-complete' };
  if (state !== 'funded') {
    if (blocker) return { action: 'wait', reason: blocker };
    return { action: 'payout', reason: 'payout-pending', outcome: state };
  }
  // Funded: payout blockers never hold back release or refund, which change state only.
  if (window === 'refund') return { action: 'refund', reason: 'refund-open' };
  if (window === 'gap') return { action: 'wait', reason: 'release-margin' };
  return role === 'seller' ? { action: 'release', reason: 'release-open' }
    : { action: 'wait', reason: 'awaiting-seller-release' };
}

test('exhaustive-{state,role,window,blockers}', async () => {
  let checked = 0;
  const reasons = new Set();
  for (const [label, kind, options, state, paid, blocker] of SNAPSHOTS) {
    for (const [name, chainTime] of Object.entries(WINDOWS)) {
      const { snapshot } = await snapshotOf(kind, options, chainTime);
      assert.equal(snapshot.observation.state, state, label);
      assert.equal(snapshot.payout === 'complete', paid, label);
      if (blocker) assert.ok(snapshot.custody.payoutBlockedBy.includes(blocker), label);
      for (const role of ROLES) {
        const step = ok(plan(snapshot, role, chainTime));
        assert.deepEqual(step, expected(state, paid, blocker, role, windowOf(name)), `${label}/${role}/${name}`);
        assert.ok(Object.isFrozen(step), label);
        assert.equal('outcome' in step, step.action === 'payout', label);
        assert.ok(SETTLEMENT_REASONS.includes(step.reason), step.reason);
        reasons.add(step.reason);
        checked++;
      }
    }
  }
  assert.equal(checked, SNAPSHOTS.length * ROLES.length * Object.keys(WINDOWS).length);
  assert.deepEqual([...reasons].sort(), [...SETTLEMENT_REASONS].sort(), 'every reason is reachable');
  assert.ok(Object.isFrozen(SETTLEMENT_REASONS));
});

test('spot-checks', async () => {
  const funded = (await snapshotOf('native', {})).snapshot;
  assert.deepEqual(ok(plan(funded, 'seller', CHAIN_TIME)), { action: 'release', reason: 'release-open' });
  assert.deepEqual(ok(plan(funded, 'buyer', CHAIN_TIME)), { action: 'wait', reason: 'awaiting-seller-release' });
  const atDeadline = (await snapshotOf('native', {}, DEADLINE)).snapshot;
  assert.deepEqual(ok(plan(atDeadline, 'third-party', DEADLINE)), { action: 'refund', reason: 'refund-open' });
  const lastSecond = (await snapshotOf('native', {}, DEADLINE - 1)).snapshot;
  assert.deepEqual(ok(plan(lastSecond, 'seller', DEADLINE - 1, '0')), { action: 'release', reason: 'release-open' });
  assert.deepEqual(ok(plan(lastSecond, 'seller', DEADLINE - 1, '1')), { action: 'wait', reason: 'release-margin' });
  const frozen = (await snapshotOf('spl', { world: frozenVault })).snapshot;
  assert.deepEqual(ok(plan(frozen, 'seller', CHAIN_TIME)), { action: 'release', reason: 'release-open' });
  const frozenLate = (await snapshotOf('spl', { world: frozenVault }, DEADLINE)).snapshot;
  assert.deepEqual(ok(plan(frozenLate, 'buyer', DEADLINE)), { action: 'refund', reason: 'refund-open' });
  const released = (await snapshotOf('spl', { world: { escrow: { state: 1 }, ...frozenVault } }, DEADLINE)).snapshot;
  assert.deepEqual(ok(plan(released, 'buyer', DEADLINE)), { action: 'wait', reason: 'vault-frozen' });
  const refunded = (await snapshotOf('native', { world: { escrow: { state: 2 } } })).snapshot;
  assert.deepEqual(ok(plan(refunded, 'buyer', CHAIN_TIME)), {
    action: 'payout',
    reason: 'payout-pending',
    outcome: 'refunded',
  });
});

// One instruction per transaction: release and payout are separate steps, each planned from a fresh finalized read.
test('release-then-payout-are-separate-steps', async () => {
  const s = setup('spl');
  try {
    const read = async () => ok(await s.reader.read(s.binding, request(), s.terms));
    assert.equal(ok(plan(await read(), 'seller', CHAIN_TIME)).action, 'release');
    // The planner has no memory: until a re-read shows the release finalized, it plans the release again.
    assert.equal(ok(plan(await read(), 'seller', CHAIN_TIME)).action, 'release');
    const escrow = s.world.accounts.get(s.world.escrow.address);
    const bytes = Buffer.from(escrow.data[0], 'base64');
    bytes[11] = 1;
    setAccount(s.world, s.world.escrow.address, { ...escrow, data: [bytes.toString('base64'), 'base64'] });
    const step = ok(plan(await read(), 'seller', CHAIN_TIME));
    assert.deepEqual(step, { action: 'payout', reason: 'payout-pending', outcome: 'released' });
    const trade = ok(bindSolanaTrade(s.registry, s.binding, s.terms));
    assert.equal(ok(buildPayout(trade, step.outcome)).accounts.length, 5, 'the outcome feeds buildPayout unchanged');
  } finally {
    s.reader.dispose();
  }
});

test('INVALID_INPUT: {unbranded-snapshot,role,chainTime,margin,stale-chainTime,context}', async () => {
  const { snapshot } = await snapshotOf('native', {});
  assert.ok(isSolanaEscrowSnapshot(snapshot));
  const copies = [{ ...snapshot }, structuredClone(snapshot), null, undefined, snapshot.observation];
  for (const copy of copies) {
    assert.equal(isSolanaEscrowSnapshot(copy), false);
    error(plan(copy, 'seller', CHAIN_TIME), 'INVALID_INPUT');
  }
  for (const role of ['arbiter', 'Seller', '', undefined, 1]) error(plan(snapshot, role, CHAIN_TIME), 'INVALID_INPUT');
  for (const chainTime of ['01', '-1', '1.5', '18446744073709551616']) {
    error(plan(snapshot, 'seller', chainTime), 'INVALID_INPUT');
  }
  for (const releaseMargin of ['604801', undefined, '', 60]) {
    const context = { role: 'seller', chainTime: String(CHAIN_TIME), releaseMargin };
    error(nextSettlementStep(snapshot, context), 'INVALID_INPUT');
  }
  // A chain time other than the snapshot's own finalized Clock is not that snapshot's time.
  error(plan(snapshot, 'seller', CHAIN_TIME - 1), 'INVALID_INPUT');
  error(plan(snapshot, 'seller', CHAIN_TIME + 1), 'INVALID_INPUT');
  // An array or a function is not a context object, even when it carries valid own properties.
  const props = { role: 'seller', chainTime: String(CHAIN_TIME), releaseMargin: MARGIN };
  const shaped = [Object.assign([], props), Object.assign(() => {}, props)];
  for (const context of [null, undefined, 'seller', [], ...shaped]) {
    error(nextSettlementStep(snapshot, context), 'INVALID_INPUT');
  }
  // Inputs are validated in every state, even where the window is not needed.
  const paid = (await snapshotOf('native', { world: { escrow: { state: 1, paid: 1 } } })).snapshot;
  error(plan(paid, 'arbiter', CHAIN_TIME), 'INVALID_INPUT');
  error(plan(paid, 'seller', 'x'), 'INVALID_INPUT');
  const absent = (await snapshotOf('native', { mutate: absentEscrow })).snapshot;
  const refunded = (await snapshotOf('native', { world: { escrow: { state: 2 } } })).snapshot;
  for (const state of [absent, paid, refunded]) {
    error(plan(state, 'seller', CHAIN_TIME - 1), 'INVALID_INPUT');
    error(plan(state, 'seller', CHAIN_TIME + 1), 'INVALID_INPUT');
    for (const releaseMargin of ['604801', undefined, '', 60]) {
      const context = { role: 'seller', chainTime: String(CHAIN_TIME), releaseMargin };
      error(nextSettlementStep(state, context), 'INVALID_INPUT');
    }
  }
});

// Escrow state and chain time come from one finalized slot. An old funded snapshot paired with the Clock of a
// later validateLive would plan a refund for an escrow the seller already released (handle_refund: InvalidState).
test('chainTime-bound-to-snapshot-{later-validateLive-refused,fresh-read-plans-payout}', async () => {
  const s = setup('native');
  try {
    const old = ok(await s.reader.read(s.binding, request(), s.terms));
    const lamports = s.world.accounts.get(s.world.escrow.address).lamports;
    setAccount(s.world, s.world.escrow.address, account(escrowBytes(s.terms, { state: 1 }), PROGRAM, { lamports }));
    s.world.slot = SLOT + 50;
    s.world.block = { ...s.world.block, blockHeight: SLOT + 40, parentSlot: SLOT + 49 };
    clockAt(s.world, DEADLINE + 5);
    const live = ok(await s.reader.validateLive(NETWORK_ID, DEPLOYMENT_ID));
    assert.equal(live.timestampSeconds, String(DEADLINE + 5));
    const context = { role: 'third-party', chainTime: live.timestampSeconds, releaseMargin: MARGIN };
    error(nextSettlementStep(old, context), 'INVALID_INPUT');
    const fresh = ok(await s.reader.read(s.binding, request(), s.terms));
    assert.deepEqual(ok(nextSettlementStep(fresh, context)), {
      action: 'payout', reason: 'payout-pending', outcome: 'released',
    });
  } finally {
    s.reader.dispose();
  }
});

// Waiting never clears rent-shortfall: anyone must top the escrow PDA up by rentExemptMinimum - (lamports -
// principalHeld) lamports, and only a fresh finalized read after that plans the payout.
test('rent-shortfall-cleared-only-by-top-up', async () => {
  const lamports = 500_001_000;
  const short = { world: { escrow: { state: 1 }, lamports } };
  for (const chainTime of [CHAIN_TIME, CHAIN_TIME + 10_000_000]) {
    const { snapshot } = await snapshotOf('native', short, chainTime);
    assert.deepEqual(ok(plan(snapshot, 'third-party', chainTime)), { action: 'wait', reason: 'rent-shortfall' });
  }
  const { snapshot } = await snapshotOf('native', short);
  const topUp = Number(snapshot.custody.rentExemptMinimum) - (lamports - Number(snapshot.custody.principalHeld));
  assert.equal(topUp, RENT_MIN - 1000);
  const under = (await snapshotOf('native', { world: { escrow: { state: 1 }, lamports: lamports + topUp - 1 } }))
    .snapshot;
  assert.deepEqual(ok(plan(under, 'third-party', CHAIN_TIME)), { action: 'wait', reason: 'rent-shortfall' });
  const topped = (await snapshotOf('native', { world: { escrow: { state: 1 }, lamports: lamports + topUp } })).snapshot;
  assert.deepEqual(ok(plan(topped, 'third-party', CHAIN_TIME)), {
    action: 'payout', reason: 'payout-pending', outcome: 'released',
  });
});

test('pure-{no-clock,no-io}', async () => {
  const { snapshot } = await snapshotOf('native', {});
  const originals = { fetch: globalThis.fetch, now: Date.now };
  let touched = 0;
  globalThis.fetch = Date.now = () => {
    touched++;
    throw Error('SECRET');
  };
  try {
    assert.deepEqual(ok(plan(snapshot, 'seller', CHAIN_TIME)), { action: 'release', reason: 'release-open' });
  } finally {
    globalThis.fetch = originals.fetch;
    Date.now = originals.now;
  }
  assert.equal(touched, 0);
});
