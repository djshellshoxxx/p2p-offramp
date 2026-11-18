/**
 * Pure settlement planner over one finalized snapshot that `SolanaChainReader.read()` returned. It names at most
 * one D5 instruction to submit next and never a bundle: a transaction holding `release` (or `refund`) and
 * `payout_*` rolls back entirely when the payout fails (program README, Rules), so each goes alone.
 *
 * The planner has no memory and no clock, and does not track transactions. A step is a statement about the
 * snapshot it was given, never a claim that sending is safe after an earlier send: after any uncertain outcome,
 * G12 (the journal) must reconcile the transaction and re-observe finalized state before planning a retry.
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import type { CoreResult } from '../../schemas/index.ts';
import { decimalU64 } from './codec.ts';
import { isSolanaEscrowSnapshot, type SolanaEscrowSnapshot } from './reader.ts';
import { settlementWindow } from './window.ts';

export type SettlementRole = 'seller' | 'buyer' | 'third-party';
export interface SettlementContext {
  /** Who would sign: release needs the seller; refund and payout are permissionless. */
  readonly role: SettlementRole;
  /** Finalized chain time (`live.timestampSeconds` of this snapshot or a later `validateLive`), u64 decimal. */
  readonly chainTime: string;
  /** Seconds kept clear before the deadline for a release, u64 decimal (see `settlementWindow`). */
  readonly releaseMargin: string;
}
export const SETTLEMENT_REASONS = Object.freeze([
  'escrow-absent', 'payout-complete', 'release-open', 'refund-open', 'payout-pending', 'awaiting-seller-release',
  'release-margin', 'rent-shortfall', 'rent-unknown', 'vault-frozen',
] as const);
export type SettlementReason = (typeof SETTLEMENT_REASONS)[number];
type PayoutBlocker = 'rent-shortfall' | 'rent-unknown' | 'vault-frozen';
export type SettlementStep =
  | { readonly action: 'release'; readonly reason: 'release-open' }
  | { readonly action: 'refund'; readonly reason: 'refund-open' }
  | { readonly action: 'payout'; readonly reason: 'payout-pending'; readonly outcome: 'released' | 'refunded' }
  | { readonly action: 'wait'; readonly reason: 'awaiting-seller-release' | 'release-margin' | PayoutBlocker }
  | { readonly action: 'none'; readonly reason: 'escrow-absent' | 'payout-complete' };

const ROLES: readonly string[] = Object.freeze(['seller', 'buyer', 'third-party']);
const invalid = (): CoreResult<never> => ({
  ok: false, error: createCoreError('INVALID_INPUT', { operationId: createOperationId(), readOnly: true }),
});
const step = (value: SettlementStep): CoreResult<SettlementStep> => ({ ok: true, value: Object.freeze(value) });

/**
 * Rules, in order: absent or paid -> none; released/refunded and unpaid -> payout of that outcome unless custody
 * reports a payout blocker (then wait with it); funded -> refund once refund is open (any role), release while
 * release is open (seller only; others wait), else wait in the margin gap. Payout blockers never hold back a
 * release or refund, which change escrow state only. Every input is checked in every state.
 */
export function nextSettlementStep(
  snapshot: SolanaEscrowSnapshot, context: SettlementContext,
): CoreResult<SettlementStep> {
  let role: unknown, chainTime: unknown, releaseMargin: unknown;
  try {
    if (!isSolanaEscrowSnapshot(snapshot) || snapshot.observation.finality !== 'finalized') return invalid();
    if (typeof context !== 'object' || context === null || Array.isArray(context)) return invalid();
    ({ role, chainTime, releaseMargin } = context);
    if (typeof role !== 'string' || !ROLES.includes(role)) return invalid();
    // A chain time older than the snapshot's own finalized Clock would reopen a window the chain already closed.
    if (decimalU64(chainTime) < BigInt(snapshot.live.timestampSeconds)) return invalid();
  } catch { return invalid(); }
  const escrow = snapshot.escrow;
  // The deadline is needed only while funded; '0' still validates chainTime and releaseMargin in other states.
  const window = settlementWindow(escrow?.deadlineSeconds ?? '0', chainTime as string, releaseMargin as string);
  if (!window.ok) return window;
  if (escrow === null) return step({ action: 'none', reason: 'escrow-absent' });
  if (snapshot.payout === 'complete') return step({ action: 'none', reason: 'payout-complete' });
  if (escrow.state !== 'funded') {
    const blocker = snapshot.custody?.payoutBlockedBy[0];
    if (blocker !== undefined) return step({ action: 'wait', reason: blocker });
    return step({ action: 'payout', reason: 'payout-pending', outcome: escrow.state });
  }
  if (window.value.refundOpen) return step({ action: 'refund', reason: 'refund-open' });
  if (!window.value.releaseOpen) return step({ action: 'wait', reason: 'release-margin' });
  return role === 'seller' ? step({ action: 'release', reason: 'release-open' })
    : step({ action: 'wait', reason: 'awaiting-seller-release' });
}
