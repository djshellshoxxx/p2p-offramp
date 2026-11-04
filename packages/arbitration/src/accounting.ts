/** Checked uint256 projections. Claimed balances/charges remain claims; these functions move or credit no funds. */
import { add, data, diagnostic, integer, multiply, result, stop, uint } from './shared.ts';
export function quoteFeeReserve(input: unknown) {
  return result(() => {
    const raw = data(input, ['feePerSeat', 'providerRound0', 'providerRound1', 'executionCap']);
    const seats = multiply(uint(raw.feePerSeat), 14n), providers = add(uint(raw.providerRound0), uint(raw.providerRound1)), executionCap = uint(raw.executionCap);
    return diagnostic({ seatReserve: seats, providerReserve: providers, executionCap, totalReserve: add(add(seats, providers), executionCap), principalContribution: 0n });
  });
}
export function calculateFeeConservation(input: unknown) {
  return result(() => {
    const raw = data(input, ['reserve', 'feePerSeat', 'validReveal0', 'validReveal1', 'providerSpent', 'executionSpent', 'executionCap', 'claimed']);
    const reserve = uint(raw.reserve), perSeat = uint(raw.feePerSeat), r0 = integer(raw.validReveal0, 5), r1 = integer(raw.validReveal1, 9);
    const providerSpent = uint(raw.providerSpent), executionSpent = uint(raw.executionSpent), executionCap = uint(raw.executionCap), claimed = uint(raw.claimed);
    if (executionSpent > executionCap) return stop('RESERVATION_INCONSISTENT');
    const credited = multiply(perSeat, BigInt(r0 + r1)), used = add(add(providerSpent, executionSpent), credited);
    if (used > reserve) return stop('INSUFFICIENT_RESERVE'); if (claimed > credited) return stop('RESERVATION_INCONSISTENT');
    return diagnostic({ reserve, providerSpent, executionSpent, credited, claimed, unclaimedCredit: credited - claimed, refunded: reserve - used, principalContribution: 0n });
  });
}
export function checkBondConservation(input: unknown) {
  return result(() => {
    const raw = data(input, ['deposited', 'available', 'reserved', 'withdrawn', 'penalties']);
    const deposited = uint(raw.deposited), available = uint(raw.available), reserved = uint(raw.reserved), withdrawn = uint(raw.withdrawn), penalties = uint(raw.penalties);
    if (add(add(available, reserved), add(withdrawn, penalties)) !== deposited) return stop('RESERVATION_INCONSISTENT');
    return diagnostic({ deposited, available, reserved, withdrawn, penalties, voteWeightPerSeatedOperator: 1 as const });
  });
}
export function quoteSeatBond(input: unknown) {
  return result(() => {
    const raw = data(input, ['snapshotBalance', 'reservedElsewhere', 'bondPerSeat', 'depositedAt', 'chainTime', 'hardStop']);
    const balance = uint(raw.snapshotBalance), reserved = uint(raw.reservedElsewhere), bond = uint(raw.bondPerSeat);
    const depositedAt = uint(raw.depositedAt), now = uint(raw.chainTime), hardStop = uint(raw.hardStop);
    if (reserved > balance) return stop('RESERVATION_INCONSISTENT');
    if (now < depositedAt || now - depositedAt < 7n * 86400n) return stop('UNAGED_STAKE');
    if (now >= hardStop) return stop('WRONG_PHASE'); if (balance - reserved < bond) return stop('BOND_UNAVAILABLE');
    return diagnostic({ bondPerSeat: bond, unreservedAfterQuote: balance - reserved - bond, maximumAccountingAfter: add(hardStop, 86400n), voteWeight: 1 as const });
  });
}
