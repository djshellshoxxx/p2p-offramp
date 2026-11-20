import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCaseSchedule, phaseAt, encodeVoteVector, calculateTally, createRoundModel, createDraftModel, createAppealModel,
  calculateNonRevealPenalty, quoteFeeReserve, calculateFeeConservation, checkBondConservation, quoteSeatBond, HARD_STOP_SECONDS, MAX_DRAW_ATTEMPTS } from '../index.ts';
const val = r => { assert.equal(r.ok, true, JSON.stringify(r, (_, value) => typeof value === 'bigint' ? String(value) : value)); return r.value; };
const fail = (r, code) => { assert.equal(r.ok, false); if (code) assert.equal(r.error.code, code); assert.doesNotMatch(JSON.stringify(r), /SECRET|private provider|https:\/\//); };
const H = i => '0x' + BigInt(i).toString(16).padStart(64, '0'), A = i => '0x' + BigInt(i).toString(16).padStart(40, '0');
const B = Object.freeze({ chainId: 31337n, escrow: A(1), tribunal: A(2), policyHash: H(3), tradeId: H(4), caseId: H(5) });
const MAX = (1n << 256n) - 1n, OPENED = 1000n, plan = val(buildCaseSchedule(OPENED));
function roundWorld(round = 0, over = {}) {
  const clock = { now: (round === 0 ? plan.initial : plan.appeal).commitStart, live: true, authenticated: true };
  const panel = Array.from({ length: round === 0 ? 5 : 9 }, (_, i) => ({ jurorId: H(i + 10), votingAddress: A(i + 10), operatorGroup: H(i + 100) }));
  const ports = { isCurrent: () => clock.live, readChainTime: () => clock.now,
    authenticate: request => clock.authenticated && request.binding.chainId === B.chainId && request.binding.caseId === B.caseId && panel.some(seat => seat.jurorId === request.jurorId && seat.votingAddress === request.actor), ...over };
  const model = val(createRoundModel({ binding: B, openedAt: OPENED, round, panel, evidenceRoot: H(6), ports }));
  const vote = (index, choice, salt = H(index + 200)) => ({ chainId: B.chainId, tribunal: B.tribunal, policyHash: B.policyHash, caseId: B.caseId,
    round, jurorId: panel[index].jurorId, evidenceRoot: H(6), choice, salt });
  return { clock, panel, model, ports, vote };
}
function draftWorld(round = 0, { size = round === 0 ? 30 : 40, word = () => 0n, excluded = [], over = {} } = {}) {
  const clock = { now: round === 0 ? OPENED : plan.appeal.startsAt, live: true, authorized: true, bond: true }, calls = [];
  const pool = Array.from({ length: size }, (_, i) => H(i + 100));
  const ports = { isCurrent: () => clock.live, readChainTime: () => clock.now,
    authenticate: request => clock.authorized && request.binding.caseId === B.caseId && request.actor === A(9),
    validateSnapshot: snapshot => snapshot.binding.chainId === B.chainId && snapshot.round === round,
    drawWord: request => { assert.equal(Object.isFrozen(request), true); calls.push(request); return word(request); }, bondAvailable: () => clock.bond, ...over };
  const built = createDraftModel({ binding: B, openedAt: OPENED, round, poolRoot: H(7), seed: H(8), pool, excluded, ports });
  return { clock, pool, calls, model: built.ok ? built.value : null, built, ports };
}
function appealWorld(initial = 'seller', appeal = 'inconclusive', over = {}) {
  const clock = { now: plan.initial.revealEnd, live: true, auth: true, reserve: true }, closeCalls = [];
  const states = [
    { binding: B, round: 0, closed: false, result: null, failure: null },
    { binding: B, round: 1, closed: false, result: null, failure: null },
  ];
  const ports = { isCurrent: () => clock.live, readChainTime: () => clock.now,
    authenticate: request => clock.auth && request.binding.chainId === B.chainId && request.round === 0 && request.jurorId === null,
    hasBoundAppealReserve: () => clock.reserve,
    readRound: (_, round) => structuredClone(states[round]),
    closeRound: (_, round) => { closeCalls.push(round); states[round] = { ...states[round], closed: true, result: round === 0 ? initial : appeal }; }, ...over };
  const model = val(createAppealModel({ binding: B, openedAt: OPENED, seller: A(30), buyer: A(31), ports }));
  return { clock, states, model, closeCalls, ports };
}
const assertDiagnostic = value => { assert.equal(value.diagnosticOnly, true); assert.equal(value.economicAuthority, false); assert.equal(Object.isFrozen(value), true); };

test('maximum G34 schedule is fixed10days with14day hard stop and half-open phase boundaries', () => {
  assert.equal(plan.maximumScheduledEnd - OPENED, 10n * 86400n); assert.equal(plan.hardStop - OPENED, 14n * 86400n);
  assert.equal(plan.appeal.startsAt, plan.initial.appealEnd); assert.equal(plan.appeal.appealEnd, null);
  for (const round of [0, 1]) {
    const c = round === 0 ? plan.initial : plan.appeal;
    for (const [end, before, after] of [[c.randomnessEnd, 'randomness', 'acceptance'], [c.acceptanceEnd, 'acceptance', 'evidence'],
      [c.evidenceEnd, 'evidence', 'commit'], [c.commitEnd, 'commit', 'reveal'], [c.revealEnd, 'reveal', round === 0 ? 'appeal' : 'round-closed']]) {
      assert.equal(val(phaseAt(OPENED, round, end - 1n)).phase, before); assert.equal(val(phaseAt(OPENED, round, end)).phase, after);
      assert.equal(val(phaseAt(OPENED, round, end + 1n)).phase, after);
    }
    assert.equal(val(phaseAt(OPENED, round, plan.hardStop)).phase, 'hard-stop');
  }
  assert.equal(val(phaseAt(OPENED, 0, OPENED - 1n)).phase, 'not-open');
  fail(buildCaseSchedule(MAX), 'OVERFLOW'); fail(buildCaseSchedule(1), 'INVALID_INPUT'); assertDiagnostic(plan);
});
test('Vote preimage, all10fixed ABI words and hash match independently generated pinned cast fixtures', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/vote-cast-vectors.json', import.meta.url), 'utf8'));
  assert.match(fixture.toolchain, /1\.5\.1-v1\.5\.1/); assert.equal(fixture.vectors.length, 3);
  for (const row of fixture.vectors) {
    const vector = val(encodeVoteVector({ ...row.input, chainId: BigInt(row.input.chainId) }));
    assert.equal(vector.typeHash, row.typeHash); assert.deepEqual(vector.words, row.words); assert.equal(vector.preimage, row.preimage); assert.equal(vector.digest, row.digest);
    assert.equal(vector.preimage.length, 642); assert.equal(vector.words.length, 10); assertDiagnostic(vector);
  }
});
test('Vote binding mutations and uint bounds cannot silently alias another chain/case/round/root/seat/choice', () => {
  const w = roundWorld(), input = w.vote(0, 0), original = val(encodeVoteVector(input)).digest;
  for (const over of [{ chainId: 1n }, { tribunal: A(99) }, { policyHash: H(99) }, { caseId: H(99) }, { round: 1 }, { jurorId: H(99) }, { evidenceRoot: H(99) }, { choice: 2 }, { salt: H(99) }]) assert.notEqual(val(encodeVoteVector({ ...input, ...over })).digest, original);
  for (const over of [{ chainId: MAX + 1n }, { chainId: -1n }, { chainId: 1 }, { round: 2 }, { choice: 3 }, { tribunal: A(1).toUpperCase() }, { salt: '0x00' }, { extra: true }]) fail(encodeVoteVector({ ...input, ...over }));
  w.model.dispose();
});
test('enumerate all N5/N9 count partitions: participation and directional thresholds stay independent', () => {
  let partitions = 0;
  for (const round of [0, 1]) {
    const n = round === 0 ? 5 : 9, quorum = round === 0 ? 4 : 6, direction = round === 0 ? 3 : 5;
    for (let seller = 0; seller <= n; seller++) for (let buyer = 0; buyer <= n - seller; buyer++) for (let abstain = 0; abstain <= n - seller - buyer; abstain++) {
      const missing = n - seller - buyer - abstain, votes = [...Array(seller).fill(0), ...Array(buyer).fill(1), ...Array(abstain).fill(2), ...Array(missing).fill(null)];
      const actual = val(calculateTally(round, votes)), enough = n - missing >= quorum;
      assert.equal(actual.result, enough && seller >= direction ? 'seller' : enough && buyer >= direction ? 'buyer' : 'inconclusive');
      assert.equal(actual.seller + actual.buyer + actual.abstain + actual.missing, n); assert.equal(actual.closed, false); assertDiagnostic(actual); partitions++;
    }
  }
  assert.equal(partitions, 276); fail(calculateTally(0, [0, 0, 0]), 'INVALID_INPUT'); fail(calculateTally(1, Array(9).fill(3)), 'INVALID_INPUT');
});
test('round refuses early/duplicate/foreign commits and invalid reveals without consuming the valid reveal slot', () => {
  const w = roundWorld(), v = w.vote(0, 0), digest = val(encodeVoteVector(v)).digest;
  w.clock.now = plan.initial.commitStart - 1n; fail(w.model.commit(w.panel[0].votingAddress, w.panel[0].jurorId, digest), 'WRONG_PHASE');
  w.clock.now = plan.initial.commitStart; fail(w.model.commit(A(90), w.panel[0].jurorId, digest), 'NOT_SEATED');
  val(w.model.commit(w.panel[0].votingAddress, w.panel[0].jurorId, digest)); fail(w.model.commit(w.panel[0].votingAddress, w.panel[0].jurorId, digest), 'ALREADY_COMMITTED');
  fail(w.model.reveal(w.panel[0].votingAddress, w.panel[0].jurorId, 0, v.salt), 'WRONG_PHASE');
  w.clock.now = plan.initial.commitEnd; fail(w.model.reveal(w.panel[0].votingAddress, w.panel[0].jurorId, 1, v.salt), 'INVALID_PREIMAGE');
  assert.equal(val(w.model.inspect()).revealed, 0); val(w.model.reveal(w.panel[0].votingAddress, w.panel[0].jurorId, 0, v.salt));
  fail(w.model.reveal(w.panel[0].votingAddress, w.panel[0].jurorId, 0, v.salt), 'ALREADY_REVEALED');
  w.clock.now = plan.initial.revealEnd; fail(w.model.reveal(w.panel[1].votingAddress, w.panel[1].jurorId, 0, H(201)), 'WRONG_PHASE');
  const closed = val(w.model.close()); assert.equal(closed.result, 'inconclusive'); assert.equal(closed.closed, true); assert.deepEqual(val(w.model.close()), closed); w.model.dispose();
});
test('all reveals or current majority cannot close early; abstention counts toward participation but earns no directional support', () => {
  for (const [round, choices, expected] of [[0, [0,0,0,2,2], 'seller'], [0,[2,2,2,2,2], 'inconclusive'], [1,[1,1,1,1,1,2,2,2,2], 'buyer']]) {
    const w = roundWorld(round), c = round === 0 ? plan.initial : plan.appeal;
    choices.forEach((choice, i) => val(w.model.commit(w.panel[i].votingAddress, w.panel[i].jurorId, val(encodeVoteVector(w.vote(i, choice))).digest)));
    w.clock.now = c.commitEnd; choices.forEach((choice, i) => val(w.model.reveal(w.panel[i].votingAddress, w.panel[i].jurorId, choice, w.vote(i, choice).salt)));
    fail(w.model.close(), 'WRONG_PHASE'); w.clock.now = c.revealEnd; assert.equal(val(w.model.close()).result, expected);
    assert.doesNotMatch(JSON.stringify(val(w.model.inspect()), (_, v) => typeof v === 'bigint' ? String(v) : v), /salt|preimage/); w.model.dispose();
  }
});
test('trusted auth/current/time callbacks refuse false claims, clock reversal and reentrant admission', () => {
  const w = roundWorld(); w.clock.authenticated = false; fail(w.model.commit(w.panel[0].votingAddress, w.panel[0].jurorId, H(9)), 'NOT_SEATED');
  w.clock.authenticated = true; val(w.model.commit(w.panel[0].votingAddress, w.panel[0].jurorId, H(9))); w.clock.now--;
  fail(w.model.commit(w.panel[1].votingAddress, w.panel[1].jurorId, H(10)), 'CLOCK_REVERSED'); fail(w.model.inspect(), 'CANCELLED');
  let nested, model;
  const r = roundWorld(0, { authenticate: () => { nested = model.inspect(); return true; } }); model = r.model;
  val(model.commit(r.panel[0].votingAddress, r.panel[0].jurorId, H(11))); fail(nested, 'CONFLICT'); assert.equal(val(model.inspect()).committed, 1); model.dispose();
  const foreign = roundWorld(0, { authenticate: () => { throw Error('SECRET private provider https://private.invalid'); } });
  fail(foreign.model.commit(foreign.panel[0].votingAddress, foreign.panel[0].jurorId, H(12)), 'UNAVAILABLE'); foreign.model.dispose();
});
test('draft known-zero words keep frozen order; batches and caller mutation cannot change the3Ncandidate set', () => {
  const a = draftWorld(), b = draftWorld(); const expected = [...a.pool].slice(0, 15); a.pool.reverse();
  const all = val(a.model.process(64)); for (let i = 0; i < 15; i++) val(b.model.process(1));
  assert.deepEqual(all.candidates, expected); assert.deepEqual(val(b.model.inspect()).candidates, expected); assert.equal(all.status, 'offered');
  assert.equal(new Set(all.candidates).size, 15); assert.equal(a.calls.length, 15); assertDiagnostic(all);
  assert.equal(Object.isFrozen(a.calls[0].binding), true); a.model.dispose(); b.model.dispose();
});
test('draft uses rejection sampling boundaries,256total attempts and bounded64step batches without fallback', () => {
  const w = draftWorld(0, { size: 15, word: request => request.counter === 0n ? MAX : MAX - 1n });
  const first = val(w.model.process(2)); assert.equal(first.cursor, 1); assert.equal(first.attempts, 2); assert.equal(first.candidates[0], H(114)); w.model.dispose();
  const rejects = draftWorld(0, { size: 15, word: () => MAX });
  fail(rejects.model.process(65), 'INVALID_INPUT'); for (let i = 0; i < 4; i++) val(rejects.model.process(64));
  const ended = val(rejects.model.inspect()); assert.equal(ended.status, 'inconclusive'); assert.equal(ended.cursor, 0); assert.equal(ended.attempts, MAX_DRAW_ATTEMPTS);
  val(rejects.model.process(64)); assert.equal(rejects.calls.length, 256); rejects.model.dispose();
});
test('candidate accepts are authenticated/once/window-bound and final seats follow candidate order rather than transaction order', () => {
  const w = draftWorld(); val(w.model.process(64)); fail(w.model.acceptSeat(A(9), H(100)), 'WRONG_PHASE');
  w.clock.now = plan.initial.randomnessEnd; fail(w.model.acceptSeat(A(90), H(100)), 'NOT_SEATED');
  w.clock.bond = false; fail(w.model.acceptSeat(A(9), H(100)), 'BOND_UNAVAILABLE'); w.clock.bond = true;
  for (const i of [9,8,7,6,5,4,3,2,1,0]) val(w.model.acceptSeat(A(9), H(100 + i)));
  fail(w.model.acceptSeat(A(9), H(100)), 'ALREADY_ACCEPTED'); fail(w.model.closeAcceptance(), 'WRONG_PHASE');
  w.clock.now = plan.initial.acceptanceEnd; const done = val(w.model.closeAcceptance()); assert.equal(done.status, 'formed'); assert.deepEqual(done.seated, [100,101,102,103,104].map(H));
  fail(w.model.acceptSeat(A(9), H(110)), 'WRONG_PHASE'); assert.deepEqual(val(w.model.closeAcceptance()), done); w.model.dispose();
});
test('small/duplicate/excluded pools, wrong snapshot, malformed word and expired draft fail closed', () => {
  const tiny = draftWorld(1, { size: 26 }); assert.equal(val(tiny.model.inspect()).status, 'inconclusive'); tiny.model.dispose();
  fail(draftWorld(1, { excluded: [H(100)] }).built, 'INVALID_INPUT');
  fail(draftWorld(0, { over: { validateSnapshot: () => false } }).built, 'BINDING_MISMATCH');
  const bad = draftWorld(0, { word: () => MAX + 1n }); assert.equal(val(bad.model.process(1)).reason, 'word-unavailable'); bad.model.dispose();
  const expired = draftWorld(); expired.clock.now = plan.initial.acceptanceEnd; assert.equal(val(expired.model.process(1)).reason, 'draft-expired'); assert.equal(expired.calls.length, 0); expired.model.dispose();
});
test('one appeal may be opened by either bound trader, closes delayed initial round and needs no new quote/top-up', () => {
  const w = appealWorld('inconclusive'); fail(w.model.requestAppeal(A(99)), 'NOT_PARTY');
  w.clock.reserve = false; fail(w.model.requestAppeal(A(30)), 'INSUFFICIENT_RESERVE'); w.clock.reserve = true;
  const opened = val(w.model.requestAppeal(A(31))); assert.equal(opened.requested, true); assert.deepEqual(w.closeCalls, [0]);
  fail(w.model.requestAppeal(A(30)), 'APPEAL_ALREADY_OPEN'); fail(w.model.finalize(), 'NOT_FINAL');
  w.clock.now = plan.appeal.revealEnd; assert.equal(val(w.model.finalize()).outcome, 'seller'); w.model.dispose();
  const boundary = appealWorld(); boundary.clock.now = plan.initial.appealEnd; fail(boundary.model.requestAppeal(A(30)), 'WRONG_PHASE'); boundary.model.dispose();
});
test('all initial/appeal outcome combinations preserve a conclusive initial result on inconclusive appeal and otherwise use seller fallback', () => {
  for (const initial of ['seller', 'buyer', 'inconclusive']) {
    const noAppeal = appealWorld(initial); noAppeal.clock.now = plan.initial.appealEnd;
    const first = val(noAppeal.model.finalize()); assert.equal(first.outcome, initial === 'buyer' ? 'buyer' : 'seller'); assert.equal(first.reason, initial === 'inconclusive' ? 'fallback' : 'jury'); noAppeal.model.dispose();
    for (const second of ['seller', 'buyer', 'inconclusive']) {
      const w = appealWorld(initial, second); val(w.model.requestAppeal(A(30))); w.clock.now = plan.appeal.revealEnd;
      const final = val(w.model.finalize()), selected = second === 'inconclusive' ? initial : second;
      assert.equal(final.outcome, selected === 'buyer' ? 'buyer' : 'seller'); assert.equal(final.winningRound, second !== 'inconclusive' ? 1 : initial !== 'inconclusive' ? 0 : null);
      assert.equal(final.reason, selected === 'inconclusive' ? 'fallback' : 'jury'); assertDiagnostic(final);
      w.states[1] = { ...w.states[1], closed: true, result: second === 'buyer' ? 'seller' : 'buyer' };
      assert.deepEqual(val(w.model.finalize()), final); fail(w.model.requestAppeal(A(31)), 'FINAL'); w.model.dispose();
    }
  }
});
test('unavailable appeal honors fixed failure boundary and cannot resurrect through late randomness', () => {
  const w = appealWorld('buyer'); val(w.model.requestAppeal(A(30)));
  w.states[1] = { ...w.states[1], closed: true, result: 'inconclusive', failure: 'randomness-timeout' };
  w.clock.now = plan.appeal.randomnessEnd - 1n; fail(w.model.finalize(), 'NOT_FINAL');
  w.clock.now++; const final = val(w.model.finalize()); assert.equal(final.outcome, 'buyer'); assert.equal(final.winningRound, 0);
  w.states[1] = { ...w.states[1], result: 'seller', failure: null }; assert.deepEqual(val(w.model.finalize()), final); w.model.dispose();
});
test('hard stop counts only actually closed rounds and never a partial tally or changing case/round claim', () => {
  for (const initial of ['buyer', 'inconclusive']) {
    const w = appealWorld(initial); val(w.model.requestAppeal(A(31))); w.clock.now = plan.hardStop;
    const final = val(w.model.finalize()); assert.equal(final.outcome, initial === 'buyer' ? 'buyer' : 'seller'); assert.equal(final.hardStopReached, true); w.model.dispose();
  }
  const missing = appealWorld(); missing.clock.now = plan.hardStop; const fallback = val(missing.model.finalize()); assert.equal(fallback.reason, 'fallback'); missing.model.dispose();
  const foreign = appealWorld(); foreign.states[0] = { ...foreign.states[0], binding: { ...B, caseId: H(99) } }; fail(foreign.model.requestAppeal(A(30)), 'BINDING_MISMATCH'); foreign.model.dispose();
});
test('objective nonreveal penalty floors10percent, never penalizes valid minority/abstain/nonseated/unstarted rounds and does not execute', () => {
  const base = { reservedBond: 101n, reservedRemaining: 101n, seated: true, accepted: true, enteredCommit: true, validTimelyReveal: false, roundClosed: true };
  const penalty = val(calculateNonRevealPenalty(base)); assert.equal(penalty.deduction, 10n); assert.equal(penalty.residualBond, 91n); assert.equal(penalty.applied, false); assertDiagnostic(penalty);
  for (const change of [{ seated: false }, { enteredCommit: false }, { validTimelyReveal: true }, { reservedBond: 9n, reservedRemaining: 9n }]) assert.equal(val(calculateNonRevealPenalty({ ...base, ...change })).deduction, 0n);
  assert.equal(val(calculateNonRevealPenalty({ ...base, reservedRemaining: 3n })).deduction, 3n);
  fail(calculateNonRevealPenalty({ ...base, roundClosed: false }), 'ROUND_NOT_CLOSED'); fail(calculateNonRevealPenalty({ ...base, reservedRemaining: 102n }), 'RESERVATION_INCONSISTENT');
});
test('fee projections reserve14equal seat fees, preserve exact U256 conservation and never spend principal', () => {
  const quote = val(quoteFeeReserve({ feePerSeat: 7n, providerRound0: 11n, providerRound1: 13n, executionCap: 17n }));
  assert.equal(quote.totalReserve, 14n * 7n + 11n + 13n + 17n); assert.equal(quote.principalContribution, 0n);
  for (let r0 = 0; r0 <= 5; r0++) for (let r1 = 0; r1 <= 9; r1++) {
    const credit = BigInt(r0 + r1) * 7n, projection = val(calculateFeeConservation({ reserve: 1000n, feePerSeat: 7n, validReveal0: r0, validReveal1: r1,
      providerSpent: 17n, executionSpent: 11n, executionCap: 11n, claimed: credit / 2n }));
    assert.equal(projection.credited + projection.providerSpent + projection.executionSpent + projection.refunded, projection.reserve);
    assert.equal(projection.claimed + projection.unclaimedCredit, projection.credited); assert.equal(projection.principalContribution, 0n); assertDiagnostic(projection);
  }
  fail(quoteFeeReserve({ feePerSeat: MAX, providerRound0: 0n, providerRound1: 0n, executionCap: 0n }), 'OVERFLOW');
  fail(calculateFeeConservation({ reserve: 1n, feePerSeat: 2n, validReveal0: 1, validReveal1: 0, providerSpent: 0n, executionSpent: 0n, executionCap: 0n, claimed: 0n }), 'INSUFFICIENT_RESERVE');
  val(checkBondConservation({ deposited: MAX, available: MAX - 3n, reserved: 1n, withdrawn: 1n, penalties: 1n }));
  fail(checkBondConservation({ deposited: MAX, available: MAX, reserved: 1n, withdrawn: 0n, penalties: 0n }), 'OVERFLOW');
  fail(checkBondConservation({ deposited: 100n, available: 1n, reserved: 1n, withdrawn: 1n, penalties: 1n }), 'RESERVATION_INCONSISTENT');
});
test('JSON flags/certificates, unknown fields, accessors and float amounts cannot grant auth or become native evidence', () => {
  let getterCalls = 0; const dangerous = Object.defineProperty({}, 'chainId', { enumerable: true, get() { getterCalls++; return 1n; } });
  fail(encodeVoteVector(dangerous)); assert.equal(getterCalls, 0);
  const w = roundWorld(); fail(createRoundModel({ binding: B, openedAt: OPENED, round: 0, panel: w.panel, evidenceRoot: H(6), ports: { isCurrent: true, readChainTime: '100', authenticate: true } }));
  fail(quoteFeeReserve({ feePerSeat: 0.1, providerRound0: 0n, providerRound1: 0n, executionCap: 0n }), 'INVALID_INPUT');
  fail(createAppealModel({ binding: B, openedAt: OPENED, seller: A(30), buyer: A(31), ports: { certificate: { finalized: true } } }));
  w.model.dispose(); assert.equal(typeof H, 'function'); assert.equal(HARD_STOP_SECONDS, 1209600n);
});
test('seven-day aged bond quote cannot overcommit or increase weight and respects hard-stop grace arithmetic', () => {
  const input = { snapshotBalance: 100n, reservedElsewhere: 40n, bondPerSeat: 30n, depositedAt: 10n, chainTime: 10n + 7n * 86400n, hardStop: 2_000_000n };
  const quoted = val(quoteSeatBond(input)); assert.equal(quoted.unreservedAfterQuote, 30n); assert.equal(quoted.voteWeight, 1); assert.equal(quoted.maximumAccountingAfter, 2_086_400n);
  fail(quoteSeatBond({ ...input, chainTime: input.chainTime - 1n }), 'UNAGED_STAKE');
  fail(quoteSeatBond({ ...input, reservedElsewhere: 80n }), 'BOND_UNAVAILABLE'); fail(quoteSeatBond({ ...input, reservedElsewhere: 101n }), 'RESERVATION_INCONSISTENT');
  fail(quoteSeatBond({ ...input, chainTime: input.hardStop }), 'WRONG_PHASE'); fail(quoteSeatBond({ ...input, hardStop: MAX }), 'OVERFLOW');
});
test('duplicate/oversized draft pools refuse, appeal excludes prior seats and revoked word callbacks cannot resume', () => {
  const source = draftWorld(), common = { binding: B, openedAt: OPENED, round: 0, poolRoot: H(7), seed: H(8), excluded: [], ports: source.ports };
  fail(createDraftModel({ ...common, pool: [H(100), H(100), ...source.pool.slice(2)] }), 'INVALID_INPUT');
  fail(createDraftModel({ ...common, pool: Array.from({ length: 4097 }, (_, i) => H(i)) }), 'LIMIT_EXCEEDED'); source.model.dispose();
  const appeal = draftWorld(1, { excluded: [H(1), H(2), H(3), H(4), H(5)] }); const offered = val(appeal.model.process(64));
  assert.equal(offered.candidates.length, 27); assert.equal(offered.candidates.some(id => [H(1), H(2), H(3), H(4), H(5)].includes(id)), false); appeal.model.dispose();
  let model, calls = 0; const cancelled = draftWorld(0, { word: () => { calls++; model.dispose(); return 0n; } }); model = cancelled.model;
  fail(model.process(64), 'CANCELLED'); assert.equal(calls, 1); fail(model.inspect(), 'CANCELLED');
});
test('hard-stop read unavailability and contradictory closed-round claims preserve uncertainty rather than fabricate a certificate', () => {
  const unavailable = appealWorld('buyer', 'seller', { readRound: () => { throw Error('SECRET private provider'); } }); unavailable.clock.now = plan.hardStop;
  fail(unavailable.model.finalize(), 'UNAVAILABLE'); unavailable.model.dispose();
  const contradictory = appealWorld('buyer'); val(contradictory.model.requestAppeal(A(30)));
  contradictory.states[0] = { ...contradictory.states[0], result: 'seller' }; contradictory.clock.now = plan.hardStop;
  fail(contradictory.model.finalize(), 'BINDING_MISMATCH'); contradictory.model.dispose();
});
