import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  key,
  NETWORK_ID,
  MINT,
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
/** [role, sellerDecision]: only the seller states a decision, and only `release` releases. */
const CONTEXTS = [['seller', 'release'], ['seller', 'hold'], ['buyer', undefined], ['third-party', undefined]];
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
/** A seller states a decision; tests that do not vary it use the seller's confirmed `release`. */
const decisionOf = role => (role === 'seller' ? 'release' : undefined);
const plan = (snapshot, role, chainTime, releaseMargin = MARGIN, sellerDecision = decisionOf(role)) =>
  nextSettlementStep(snapshot, { role, chainTime: String(chainTime), releaseMargin, sellerDecision });

/** Independent statement of the rules, written from the task text rather than from src. */
function expected(state, paid, blocker, role, decision, window) {
  if (state === 'absent') return { action: 'none', reason: 'escrow-absent' };
  if (paid) return { action: 'none', reason: 'payout-complete' };
  if (state !== 'funded') {
    if (blocker) return { action: 'wait', reason: blocker };
    return { action: 'payout', reason: 'payout-pending', outcome: state };
  }
  // Funded: payout blockers never hold back release or refund, which change state only.
  if (window === 'refund') return { action: 'refund', reason: 'refund-open' };
  if (window === 'gap') return { action: 'wait', reason: 'release-margin' };
  // Release is the seller's irreversible decision after confirmed fiat receipt; a holding seller waits too.
  return role === 'seller' && decision === 'release' ? { action: 'release', reason: 'release-open' }
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
      for (const [role, decision] of CONTEXTS) {
        const step = ok(plan(snapshot, role, chainTime, MARGIN, decision));
        const want = expected(state, paid, blocker, role, decision, windowOf(name));
        assert.deepEqual(step, want, `${label}/${role}/${decision}/${name}`);
        assert.ok(Object.isFrozen(step), label);
        assert.equal('outcome' in step, step.action === 'payout', label);
        assert.ok(SETTLEMENT_REASONS.includes(step.reason), step.reason);
        reasons.add(step.reason);
        checked++;
      }
    }
  }
  assert.equal(checked, SNAPSHOTS.length * CONTEXTS.length * Object.keys(WINDOWS).length);
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
    const context = { role: 'seller', chainTime: String(CHAIN_TIME), releaseMargin, sellerDecision: 'release' };
    error(nextSettlementStep(snapshot, context), 'INVALID_INPUT');
  }
  // A chain time other than the snapshot's own finalized Clock is not that snapshot's time.
  error(plan(snapshot, 'seller', CHAIN_TIME - 1), 'INVALID_INPUT');
  error(plan(snapshot, 'seller', CHAIN_TIME + 1), 'INVALID_INPUT');
  // An array or a function is not a context object, even when it carries valid own properties.
  const props = { role: 'seller', chainTime: String(CHAIN_TIME), releaseMargin: MARGIN, sellerDecision: 'release' };
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
      const context = { role: 'seller', chainTime: String(CHAIN_TIME), releaseMargin, sellerDecision: 'hold' };
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

// Release is irreversible: it is planned only when the seller states `release` after confirming fiat receipt.
// A seller who holds (or has not been paid) is never told to release, and is planned the refund at the deadline.
test('seller-release-needs-explicit-decision-{hold-waits,hold-refunds,missing,invalid,non-seller}', async () => {
  const funded = (await snapshotOf('native', {})).snapshot;
  const at = (snapshot, chainTime, extra) =>
    nextSettlementStep(snapshot, { role: 'seller', chainTime: String(chainTime), releaseMargin: MARGIN, ...extra });
  assert.deepEqual(ok(at(funded, CHAIN_TIME, { sellerDecision: 'hold' })), {
    action: 'wait', reason: 'awaiting-seller-release',
  });
  assert.deepEqual(ok(at(funded, CHAIN_TIME, { sellerDecision: 'release' })), {
    action: 'release', reason: 'release-open',
  });
  const gap = (await snapshotOf('native', {}, DEADLINE - 1)).snapshot;
  assert.deepEqual(ok(at(gap, DEADLINE - 1, { sellerDecision: 'hold' })), { action: 'wait', reason: 'release-margin' });
  const late = (await snapshotOf('native', {}, DEADLINE)).snapshot;
  for (const sellerDecision of ['hold', 'release']) {
    assert.deepEqual(ok(at(late, DEADLINE, { sellerDecision })), { action: 'refund', reason: 'refund-open' });
  }
  // The decision is required from a seller, in every state, and is one of two exact strings.
  const refunded = (await snapshotOf('native', { world: { escrow: { state: 2 } } })).snapshot;
  for (const snapshot of [funded, refunded]) {
    error(at(snapshot, CHAIN_TIME, {}), 'INVALID_INPUT');
    for (const sellerDecision of [undefined, null, '', 'Release', 'release ', true, 1, ['release'], { release: 1 }]) {
      error(at(snapshot, CHAIN_TIME, { sellerDecision }), 'INVALID_INPUT');
    }
  }
  // Only the seller can make it: a buyer or third party stating one is refused, never treated as a release.
  for (const role of ['buyer', 'third-party']) {
    for (const sellerDecision of ['release', 'hold', null]) {
      const context = { role, chainTime: String(CHAIN_TIME), releaseMargin: MARGIN, sellerDecision };
      error(nextSettlementStep(funded, context), 'INVALID_INPUT');
    }
    const omitted = { role, chainTime: String(CHAIN_TIME), releaseMargin: MARGIN };
    assert.deepEqual(ok(nextSettlementStep(funded, omitted)), { action: 'wait', reason: 'awaiting-seller-release' });
  }
});

// The context is read exactly once, inside the planner's guard: a hostile getter or Proxy gives INVALID_INPUT
// (never a raw throw), and a getter answering differently on a later read cannot change the plan.
test('context-read-once-{throwing-getter,proxy,revoked,stateful-getter}', async () => {
  const { snapshot } = await snapshotOf('native', {});
  const base = { role: 'seller', chainTime: String(CHAIN_TIME), releaseMargin: MARGIN, sellerDecision: 'release' };
  const thrower = () => {
    throw Error('SECRET');
  };
  const hostile = Object.keys(base).map(field => Object.defineProperty({ ...base }, field, { get: thrower }));
  hostile.push(new Proxy({ ...base }, { get: thrower }));
  const revocable = Proxy.revocable({ ...base }, {});
  revocable.revoke();
  hostile.push(revocable.proxy);
  const guarded = context => {
    let result;
    assert.doesNotThrow(() => {
      result = nextSettlementStep(snapshot, context);
    });
    return result;
  };
  for (const context of hostile) error(guarded(context), 'INVALID_INPUT');
  // Each field answers the snapshot's own value on its first read and something else (or a throw) afterwards.
  let reads;
  const stateful = fields => {
    reads = {};
    const context = {};
    for (const [name, [first, later]] of Object.entries(fields)) {
      Object.defineProperty(context, name, {
        get() {
          reads[name] = (reads[name] ?? 0) + 1;
          return reads[name] === 1 ? first : later();
        },
      });
    }
    return context;
  };
  const third = stateful({
    role: ['third-party', () => 'seller'],
    chainTime: [String(CHAIN_TIME), () => String(CHAIN_TIME + 7200)],
    releaseMargin: [MARGIN, thrower],
    sellerDecision: [undefined, () => 'release'],
  });
  assert.deepEqual(ok(guarded(third)), { action: 'wait', reason: 'awaiting-seller-release' });
  assert.deepEqual(reads, { role: 1, chainTime: 1, releaseMargin: 1, sellerDecision: 1 });
  const holding = stateful({
    role: ['seller', thrower],
    chainTime: [String(CHAIN_TIME), thrower],
    releaseMargin: [MARGIN, () => '604801'],
    sellerDecision: ['hold', () => 'release'],
  });
  assert.deepEqual(ok(guarded(holding)), { action: 'wait', reason: 'awaiting-seller-release' });
  assert.deepEqual(reads, { role: 1, chainTime: 1, releaseMargin: 1, sellerDecision: 1 });
  const releasing = stateful({
    role: ['seller', thrower],
    chainTime: [String(CHAIN_TIME), thrower],
    releaseMargin: [MARGIN, thrower],
    sellerDecision: ['release', thrower],
  });
  assert.deepEqual(ok(guarded(releasing)), { action: 'release', reason: 'release-open' });
  assert.deepEqual(reads, { role: 1, chainTime: 1, releaseMargin: 1, sellerDecision: 1 });
});

// releaseMargin is 0..604800 inclusive in every state; a canonical u64 above that is still INVALID_INPUT.
test('release-margin-range-{0,604800,604801}', async () => {
  const funded = (await snapshotOf('native', {})).snapshot;
  const refunded = (await snapshotOf('native', { world: { escrow: { state: 2 } } })).snapshot;
  for (const snapshot of [funded, refunded]) {
    ok(plan(snapshot, 'buyer', CHAIN_TIME, '0'));
    ok(plan(snapshot, 'buyer', CHAIN_TIME, '604800'));
    error(plan(snapshot, 'buyer', CHAIN_TIME, '604801'), 'INVALID_INPUT');
  }
  // A 604800 s margin exceeds the 3600 s left before this deadline, so release is not open with it.
  assert.deepEqual(ok(plan(funded, 'seller', CHAIN_TIME, '604800')), { action: 'wait', reason: 'release-margin' });
});

// rent-unknown depends only on the cluster's Rent sysvar threshold: no top-up and no amount of waiting clears it,
// even with a surplus far above any rent minimum.
test('rent-unknown-not-cleared-by-top-up-or-time', async () => {
  for (const state of [1, 2]) {
    for (const lamports of [500_001_000, 10_000_000_000, 9_000_000_000_000]) {
      for (const chainTime of [CHAIN_TIME, DEADLINE + 10_000_000]) {
        const options = { world: { escrow: { state }, lamports }, mutate: unknownRent };
        const { snapshot } = await snapshotOf('native', options, chainTime);
        assert.equal(snapshot.custody.rentExemptMinimum, null);
        assert.deepEqual(snapshot.custody.payoutBlockedBy, ['rent-unknown']);
        assert.deepEqual(ok(plan(snapshot, 'third-party', chainTime)), { action: 'wait', reason: 'rent-unknown' });
      }
    }
  }
});

// A frozen vault whose mint has no freeze authority can never be thawed (SPL ThawAccount: MintCannotFreeze). The
// step is the same `wait` / `vault-frozen`; `custody.mintFreezeAuthority === null` tells the permanent case apart.
test('vault-frozen-{thawable,permanent}-told-apart-by-mint-freeze-authority', async () => {
  const released = { escrow: { state: 1 }, ...frozenVault };
  const permanent = (await snapshotOf('spl', { world: released })).snapshot;
  const thawable = (await snapshotOf('spl', {
    world: { ...released, mint: { freeze: key('freezer') } },
    options: { freezeAuthorityPermits: [{ mint: MINT, freezeAuthority: key('freezer') }] },
  })).snapshot;
  for (const [snapshot, authority] of [[permanent, null], [thawable, key('freezer')]]) {
    assert.equal(snapshot.custody.vaultFrozen, true);
    assert.equal(snapshot.custody.mintFreezeAuthority, authority);
    assert.deepEqual(snapshot.custody.payoutBlockedBy, ['vault-frozen']);
    assert.deepEqual(ok(plan(snapshot, 'buyer', CHAIN_TIME)), { action: 'wait', reason: 'vault-frozen' });
  }
});

/** The prose a caller acts on: the planner JSDoc and the package README must each say these things. */
test('docs-state-{seller-decision,blocker-exits,margin-ranges}', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const source = readFileSync(new URL('../src/settlement.ts', import.meta.url), 'utf8')
    .replace(/^[ \t]*\* ?/gm, '')
    .replace(/\s+/g, ' ');
  const exitsOf = text => text.slice(text.indexOf('Waiting alone'), text.indexOf('Waiting alone') + 1200);
  for (const [name, text] of [['README', readme], ['settlement.ts', source]]) {
    for (const phrase of [/sellerDecision/, /irreversible/, /fiat receipt/, /never auto-submitted/, /0\.\.604800/]) {
      assert.match(text, phrase, name);
    }
    const exits = exitsOf(text);
    for (const phrase of [/rent-shortfall/, /rent-unknown/, /Rent sysvar threshold/, /vault-frozen/,
      /mintFreezeAuthority/, /permanent/]) {
      assert.match(exits, phrase, name);
    }
  }
  assert.match(readme, /0\.\.3600/);
  assert.match(readme, /out-of-range `releaseMargin`/);
});
