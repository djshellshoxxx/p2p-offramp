/** Objective nonreveal arithmetic only. No native liability, penalty execution or guilt finding is created. */
import { bool, data, diagnostic, result, stop, uint } from './shared.ts';
export function calculateNonRevealPenalty(input: unknown) {
  return result(() => {
    const raw = data(input, ['reservedBond', 'reservedRemaining', 'seated', 'accepted', 'enteredCommit', 'validTimelyReveal', 'roundClosed']);
    const bond = uint(raw.reservedBond), remaining = uint(raw.reservedRemaining), seated = bool(raw.seated), accepted = bool(raw.accepted);
    const entered = bool(raw.enteredCommit), revealed = bool(raw.validTimelyReveal), closed = bool(raw.roundClosed);
    if (!closed) return stop('ROUND_NOT_CLOSED'); if (remaining > bond || seated && !accepted) return stop('RESERVATION_INCONSISTENT');
    const nominal = bond / 10n, deduction = seated && accepted && entered && !revealed ? (nominal < remaining ? nominal : remaining) : 0n;
    return diagnostic({ basis: 'accepted-no-reveal' as const, deduction, creditedToFeePayer: deduction, residualBond: remaining - deduction, applied: false as const });
  });
}
