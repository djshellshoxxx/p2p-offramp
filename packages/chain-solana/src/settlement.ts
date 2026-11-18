/**
 * Pure settlement planner over one finalized snapshot that `SolanaChainReader.read()` returned. It names at most
 * one D5 instruction to submit next and never a bundle: a transaction holding `release` (or `refund`) and
 * `payout_*` rolls back entirely when the payout fails (program README, Rules), so each goes alone.
 *
 * The planner has no memory and no clock, and does not track transactions. A step is a statement about the
 * snapshot it was given, never a claim that sending is safe after an earlier send: after any uncertain outcome,
 * G12 (the journal) must reconcile the transaction and re-observe finalized state before planning a retry.
 *
 * `release` is the seller's irreversible decision, taken only after the seller explicitly confirms fiat receipt
 * (G18/G22): the planner plans it only from `sellerDecision: 'release'`, and a step is never auto-submitted.
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import type { CoreResult } from '../../schemas/index.ts';
import { decimalU64 } from './codec.ts';
import { isSolanaEscrowSnapshot, type SolanaEscrowSnapshot } from './reader.ts';
import { settlementWindow } from './window.ts';

export type SettlementRole = 'seller' | 'buyer' | 'third-party';
/** The seller's own choice: `release` only after confirmed fiat receipt, otherwise `hold`. */
export type SellerDecision = 'release' | 'hold';
export interface SettlementContext {
  /** Who would sign: release needs the seller; refund and payout are permissionless. */
  readonly role: SettlementRole;
  /**
   * This snapshot's own finalized chain time (`snapshot.live.timestampSeconds`), u64 decimal. Escrow state and time
   * must come from one slot: a later time needs a fresh `read()` (the same 5 calls as `validateLive`).
   */
  readonly chainTime: string;
  /** Seconds kept clear before the deadline for a release, u64 decimal in 0..604800 (see `settlementWindow`). */
  readonly releaseMargin: string;
  /**
   * Required when `role` is `seller`, absent otherwise. Release is irreversible: pass `release` only once the
   * seller has explicitly confirmed fiat receipt; with `hold` the seller waits like everyone else until refund opens.
   */
  readonly sellerDecision?: SellerDecision;
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
const DECISIONS: readonly unknown[] = Object.freeze(['release', 'hold']);
const invalid = (): CoreResult<never> => ({
  ok: false, error: createCoreError('INVALID_INPUT', { operationId: createOperationId(), readOnly: true }),
});
const step = (value: SettlementStep): CoreResult<SettlementStep> => ({ ok: true, value: Object.freeze(value) });

/**
 * Rules, in order: absent or paid -> none; released/refunded and unpaid -> payout of that outcome unless custody
 * reports a payout blocker (then wait with it); funded -> refund once refund is open (any role), release while
 * release is open (only a seller whose `sellerDecision` is `release`; a holding seller and others wait), else wait
 * in the margin gap. Payout blockers never hold back a release or refund, which change escrow state only. Every
 * input is checked in every state, and each context field is read once.
 *
 * Waiting alone never clears a payout blocker. `rent-shortfall` clears once anyone sends the escrow PDA at least
 * `rentExemptMinimum - (lamports - principalHeld)` lamports. `rent-unknown` depends only on the cluster's Rent
 * sysvar threshold (not 1.0 or 2.0), so no transfer or authority action clears it: it lasts until the cluster
 * threshold changes or this adapter learns it (a code or owner decision); `payout_native` stays permissionless.
 * `vault-frozen` needs the mint freeze authority to thaw the vault; when `custody.mintFreezeAuthority` is null,
 * nothing can thaw it, so the payout is permanently blocked and needs an owner decision, not a wait. Only a fresh
 * finalized `read()` after that plans the payout.
 */
export function nextSettlementStep(
  snapshot: SolanaEscrowSnapshot, context: SettlementContext,
): CoreResult<SettlementStep> {
  let role: unknown, chainTime: unknown, releaseMargin: unknown, sellerDecision: unknown;
  try {
    if (!isSolanaEscrowSnapshot(snapshot) || snapshot.observation.finality !== 'finalized') return invalid();
    if (typeof context !== 'object' || context === null || Array.isArray(context)) return invalid();
    ({ role, chainTime, releaseMargin, sellerDecision } = context);
    if (typeof role !== 'string' || !ROLES.includes(role)) return invalid();
    // Only the seller decides, and must say so: a missing decision is never read as consent to release.
    if (role === 'seller' ? !DECISIONS.includes(sellerDecision) : sellerDecision !== undefined) return invalid();
    // An older time would reopen a closed window; a later one pairs old state with a newer Clock (a refund planned
    // for an escrow the seller released in between). Only the snapshot's own finalized Clock describes it.
    if (decimalU64(chainTime) !== BigInt(snapshot.live.timestampSeconds)) return invalid();
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
  return role === 'seller' && sellerDecision === 'release' ? step({ action: 'release', reason: 'release-open' })
    : step({ action: 'wait', reason: 'awaiting-seller-release' });
}
