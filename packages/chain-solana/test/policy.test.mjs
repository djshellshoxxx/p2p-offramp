// Client policies: explicit deadline margins and the permitted-mint / freeze-authority policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOCKHASH_VALIDITY_BLOCKS,
  DEFAULT_FUNDING_SUBMIT_MARGIN_SECONDS as FUND_MARGIN,
  DEFAULT_RELEASE_MARGIN_SECONDS as RELEASE_MARGIN,
  FINALIZED_LAG_SLOTS,
  freezeAuthorityPermitted,
  LANDING_BOUND_SECONDS,
  parseFreezeAuthorityPermits,
  settlementActions,
} from '../src/policy.ts';
import { SolanaChainReader } from '../src/reader.ts';
import { fundingWindow, settlementWindow } from '../src/window.ts';
import {
  account,
  CHAIN_TIME,
  CLOCK,
  clockBytes,
  error,
  key,
  makeRegistry,
  makeRpc,
  makeTerms,
  makeWorld,
  MINT,
  mintBytes,
  ok,
  request,
  setAccount,
  setup,
  SLOT,
  SPL_2022_PROGRAM,
  SPL_PROGRAM,
  SYSVAR,
  vaultPda,
  WSOL,
  WSOL_2022,
  bindingOf,
} from './support.mjs';

// ---- deadline margins ----
test('margins: explicit-defaults-cover-the-landing-bound', () => {
  assert.equal(BLOCKHASH_VALIDITY_BLOCKS, 150);
  assert.equal(FINALIZED_LAG_SLOTS, 32);
  assert.equal(LANDING_BOUND_SECONDS, 182);
  for (const margin of [FUND_MARGIN, RELEASE_MARGIN]) {
    assert.equal(typeof margin, 'string', 'u64 decimal strings, as the window helpers take');
    assert.ok(Number(margin) >= LANDING_BOUND_SECONDS);
  }
  // They are never applied silently: the window helpers still refuse a missing margin.
  error(fundingWindow(String(CHAIN_TIME + 600), String(CHAIN_TIME + 3600), String(CHAIN_TIME)), 'INVALID_INPUT');
  error(settlementWindow(String(CHAIN_TIME), String(CHAIN_TIME)), 'INVALID_INPUT');
  const sources = ['window.ts', 'reader.ts', 'bind.ts', 'instructions.ts'].map(name =>
    readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'));
  for (const text of sources) assert.doesNotMatch(text, /DEFAULT_(?:FUNDING|RELEASE)_/);
});

test('margins: funding-acceptBefore-{-m-1,-m,-m+1}', () => {
  const m = Number(FUND_MARGIN), acceptBefore = CHAIN_TIME + 10_000, expiry = acceptBefore + 3600;
  const at = now => ok(fundingWindow(String(acceptBefore), String(expiry), String(now), FUND_MARGIN));
  assert.equal(at(acceptBefore - m - 1), 'open');
  assert.equal(at(acceptBefore - m), 'acceptance-expired', 'now + margin == acceptBefore would land too late');
  assert.equal(at(acceptBefore - m + 1), 'acceptance-expired');
});

test('margins: funding-min-duration-{-m-1,-m,-m+1}', () => {
  // The program needs deadline - now >= 1800 when the funding lands; the margin covers the landing delay.
  const m = Number(FUND_MARGIN), expiry = CHAIN_TIME + 10_000, edge = expiry - 1800 - m;
  const at = now => ok(fundingWindow(String(expiry - 1), String(expiry), String(now), FUND_MARGIN));
  assert.equal(at(edge - 1), 'open');
  assert.equal(at(edge), 'open', 'deadline - (now + margin) == 1800 is the program minimum');
  assert.equal(at(edge + 1), 'deadline-out-of-range');
});

test('margins: release-{deadline-m-1,deadline-m,deadline-m+1} and refund-{d-1,d,d+1}', () => {
  const m = Number(RELEASE_MARGIN), deadline = CHAIN_TIME + 5000;
  const at = now => ok(settlementWindow(String(deadline), String(now), RELEASE_MARGIN));
  assert.deepEqual(at(deadline - m - 1), { releaseOpen: true, refundOpen: false });
  assert.deepEqual(at(deadline - m), { releaseOpen: false, refundOpen: false });
  assert.deepEqual(at(deadline - m + 1), { releaseOpen: false, refundOpen: false });
  assert.deepEqual(at(deadline - 1), { releaseOpen: false, refundOpen: false });
  assert.deepEqual(at(deadline), { releaseOpen: false, refundOpen: true });
  assert.deepEqual(at(deadline + 1), { releaseOpen: false, refundOpen: true });
});

/** A funded native trade read at a finalized Clock `clock`; the deadline is CHAIN_TIME + 3600. */
async function snapshotAt(clock, escrow = {}) {
  const s = setup('native', {
    world: { escrow },
    mutate: world => setAccount(world, CLOCK, account(clockBytes(SLOT, clock), SYSVAR)),
  });
  try {
    const snapshot = ok(await s.reader.read(s.binding, request(), s.terms));
    assert.deepEqual(s.calls[1].params[1], { commitment: 'finalized', encoding: 'base64' });
    return snapshot;
  } finally {
    s.reader.dispose();
  }
}

test('settlementActions: refund-only-after-the-same-read-finalized-clock-reaches-the-deadline', async () => {
  const deadline = CHAIN_TIME + 3600, m = Number(RELEASE_MARGIN);
  const actions = async (clock, escrow) => ok(settlementActions(await snapshotAt(clock, escrow), RELEASE_MARGIN));
  assert.deepEqual(await actions(deadline - m - 1), { release: true, refund: false });
  assert.deepEqual(await actions(deadline - m), { release: false, refund: false });
  assert.deepEqual(await actions(deadline - m + 1), { release: false, refund: false });
  assert.deepEqual(await actions(deadline - 1), { release: false, refund: false });
  assert.deepEqual(await actions(deadline), { release: false, refund: true });
  assert.deepEqual(await actions(deadline + 1), { release: false, refund: true });
  // Only a Funded escrow can be released or refunded.
  assert.deepEqual(await actions(deadline + 1, { state: 1 }), { release: false, refund: false });
  assert.deepEqual(await actions(deadline - m - 1, { state: 2, paid: 1 }), { release: false, refund: false });
  const snapshot = await snapshotAt(deadline);
  for (const margin of [undefined, '', '-1', '604801', 300]) {
    error(settlementActions(snapshot, margin), 'INVALID_INPUT');
  }
});

// ---- permitted mints and freeze authority ----
const FREEZER = key('freezer');
async function readSpl(o = {}) {
  const s = setup('spl', o);
  try {
    return { ...s, result: await s.reader.read(s.binding, request(), s.terms) };
  } finally {
    s.reader.dispose();
  }
}
const permit = (freezeAuthority = FREEZER, mint = MINT) => ({ freezeAuthorityPermits: [{ mint, freezeAuthority }] });

test('freeze-authority: pre-funding-refusal-without-permit-and-existing-exits-preserved', async () => {
  // Admission is an explicit choice per mint. A funded escrow remains readable without that admission permit.
  const s = await readSpl({ world: { mint: { freeze: FREEZER } } });
  assert.equal(ok(s.result).observation.state, 'funded');
  assert.equal(ok(s.result).mint.freezeAuthority, FREEZER);
  assert.equal(s.calls.length, 5, 'all finalized identity and block checks still execute');
  const absent = world => {
    setAccount(world, world.escrow.address, null);
    setAccount(world, vaultPda(world.escrow.address).address, null);
  };
  error((await readSpl({ world: { mint: { freeze: FREEZER } }, mutate: absent })).result, 'UNSUPPORTED_PROVIDER');
  const permitted = ok((await readSpl({ world: { mint: { freeze: FREEZER } }, options: permit() })).result);
  assert.deepEqual(permitted.mint, { address: MINT, decimals: 6, freezeAuthority: FREEZER });
  assert.equal(permitted.custody.mintFreezeAuthority, FREEZER);
  const freezable = { world: { mint: { freeze: FREEZER } }, mutate: absent, options: permit() };
  const before = ok((await readSpl(freezable)).result);
  assert.equal(before.custody, null);
  assert.deepEqual(before.mint, { address: MINT, decimals: 6, freezeAuthority: FREEZER }, 'warn before funding');
});

test('freeze-authority: rotated-key, other-mint permit refused before funding; None always accepted', async () => {
  const absent = world => {
    setAccount(world, world.escrow.address, null);
    setAccount(world, vaultPda(world.escrow.address).address, null);
  };
  error((await readSpl({ world: { mint: { freeze: key('rotated') } }, mutate: absent, options: permit() })).result,
    'UNSUPPORTED_PROVIDER');
  error((await readSpl({ world: { mint: { freeze: FREEZER } }, mutate: absent,
    options: permit(FREEZER, key('other-mint')) })).result,
    'UNSUPPORTED_PROVIDER');
  const none = ok((await readSpl({ options: permit() })).result);
  assert.equal(none.mint.freezeAuthority, null, 'a freeze authority set to None can never be set again');
  assert.equal(freezeAuthorityPermitted(new Map(), MINT, null), true);
  assert.equal(freezeAuthorityPermitted(new Map([[MINT, FREEZER]]), MINT, FREEZER), true);
  assert.equal(freezeAuthorityPermitted(new Map([[MINT, FREEZER]]), MINT, key('rotated')), false);
  // Native trades have no mint and are unaffected.
  const native = setup('native', { options: permit() });
  try {
    assert.equal(ok(await native.reader.read(native.binding, request(), native.terms)).mint, null);
  } finally {
    native.reader.dispose();
  }
});

test('freeze-authority: malformed-permits-refused-at-construction', () => {
  const build = permits => () =>
    new SolanaChainReader({ rpc: { request: async () => null }, registry: makeRegistry(), freezeAuthorityPermits:
      permits });
  let touched = 0;
  const getter = Object.defineProperty({ mint: MINT }, 'freezeAuthority', {
    enumerable: true,
    get() {
      touched++;
      return FREEZER;
    },
  });
  const sparse = [];
  sparse[1] = { mint: MINT, freezeAuthority: FREEZER };
  const many = Array.from({ length: 65 }, (_, index) => ({ mint: key(`m${index}`), freezeAuthority: FREEZER }));
  const cases = [
    null, {}, 'x', [null], [{ mint: MINT }], [{ mint: MINT, freezeAuthority: FREEZER, extra: 1 }],
    [{ mint: 'x', freezeAuthority: FREEZER }], [{ mint: MINT, freezeAuthority: `${FREEZER}1` }],
    [{ mint: MINT, freezeAuthority: FREEZER }, { mint: MINT, freezeAuthority: key('second') }],
    [getter], sparse, many, new Proxy([], { getPrototypeOf() { throw Error('SECRET'); } }),
  ];
  for (const permits of cases) assert.throws(build(permits), { message: 'Invalid Solana freeze-authority permits.' });
  assert.equal(touched, 0, 'accessors are never invoked');
  assert.doesNotThrow(build(undefined));
  assert.doesNotThrow(build([]));
  assert.doesNotThrow(build(many.slice(0, 64)));
  assert.equal(parseFreezeAuthorityPermits([{ mint: MINT, freezeAuthority: FREEZER }]).get(MINT), FREEZER);
});

test('mint-policy: allowlist, Tokenkeg-only, wrapped-SOL, decimals (pre-RPC refusals make no calls)', async () => {
  const preRpc = async (terms, registry) => {
    const { rpc, calls } = makeRpc(makeWorld(terms));
    const reader = new SolanaChainReader({ rpc, registry, now: () => 1 });
    try {
      error(await reader.read(bindingOf(terms), request(), terms), 'UNSUPPORTED_PROVIDER');
      assert.equal(calls.length, 0);
    } finally {
      reader.dispose();
    }
  };
  // Listed by the network but not supported by this deployment.
  await preRpc(makeTerms('spl'), makeRegistry({ deployment: { supportedAssetIds: ['sol'] } }));
  await preRpc(makeTerms('spl', { mint: key('unlisted-mint') }), makeRegistry());
  await preRpc(makeTerms('spl', { tokenProgram: SPL_2022_PROGRAM }), makeRegistry());
  for (const mint of [WSOL, WSOL_2022]) {
    const asset = { id: 'wsol', kind: 'spl', address: mint, decimals: 9, transferPolicy: 'exact-transfer' };
    const registry = makeRegistry({ network: { assets: [asset] }, deployment: { supportedAssetIds: ['wsol'] } });
    await preRpc(makeTerms('spl', { mint }), registry);
  }
  // On-chain facts: owner and decimals of the live mint must match.
  error((await readSpl({ mutate: world => setAccount(world, MINT, account(mintBytes(), SPL_2022_PROGRAM)) })).result,
    'INTEGRITY_FAILURE');
  error((await readSpl({ world: { mint: { decimals: 9 } } })).result, 'INTEGRITY_FAILURE');
  const usd9 = { id: 'usd6', kind: 'spl', address: MINT, decimals: 9, transferPolicy: 'exact-transfer' };
  error((await readSpl({ registryChanges: { network: { assets: [usd9] } } })).result, 'INTEGRITY_FAILURE');
  assert.equal(ok((await readSpl()).result).mint.decimals, 6);
  assert.equal(SPL_PROGRAM, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
});
