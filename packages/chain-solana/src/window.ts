/**
 * Funding and settlement windows against a finalized chain time (`live.timestampSeconds`). The finalized
 * Clock lags the tip, so an open window is necessary but not sufficient. Neither helper reads a wall clock.
 */
import { checkFundingWindow, createCoreError, createOperationId, TermsError } from '../../domain/index.ts';
import type { CoreResult } from '../../schemas/index.ts';
import { decimalU64, U64_MAX } from './codec.ts';

const MAX_SUBMIT_MARGIN = 3600n;
const MAX_RELEASE_MARGIN = 604_800n;
type FundingWindow = 'open' | 'acceptance-expired' | 'deadline-out-of-range';

const invalid = (): CoreResult<never> => ({
  ok: false, error: createCoreError('INVALID_INPUT', { operationId: createOperationId(), readOnly: true }),
});
function margin(input: unknown, maximum: bigint): bigint | null {
  try { const value = decimalU64(input); return value <= maximum ? value : null; } catch { return null; }
}
function u64(input: unknown): bigint | null { try { return decimalU64(input); } catch { return null; } }

/** Program error 6004 (AcceptanceExpired) or 6005 (DeadlineOutOfRange) at one chain time, else open. */
function fundingAt(acceptBefore: string, expiry: string, chainTime: bigint): FundingWindow {
  if (chainTime > U64_MAX) return 'acceptance-expired';
  try { checkFundingWindow(acceptBefore, expiry, chainTime.toString()); return 'open'; } catch (error) {
    return error instanceof TermsError && error.code === 'EXPIRED' ? 'acceptance-expired' : 'deadline-out-of-range';
  }
}

/**
 * Open only if funding would pass at both `chainTime` and `chainTime + submitMargin`. The feasible chain times
 * form one interval (t < acceptBefore, expiry - 604800 <= t <= expiry - 1800), so the two endpoints suffice.
 */
export function fundingWindow(
  acceptBefore: string, expiry: string, chainTime: string, submitMargin: string,
): CoreResult<FundingWindow> {
  const now = u64(chainTime), slack = margin(submitMargin, MAX_SUBMIT_MARGIN);
  if (u64(acceptBefore) === null || u64(expiry) === null || now === null || slack === null) return invalid();
  const first = fundingAt(acceptBefore, expiry, now);
  return { ok: true, value: first !== 'open' ? first : fundingAt(acceptBefore, expiry, now + slack) };
}

/** Program rules: release needs now < deadline (kept `releaseMargin` clear); refund needs now >= deadline. */
export function settlementWindow(
  deadline: string, chainTime: string, releaseMargin: string,
): CoreResult<{ readonly releaseOpen: boolean; readonly refundOpen: boolean }> {
  const end = u64(deadline), now = u64(chainTime), slack = margin(releaseMargin, MAX_RELEASE_MARGIN);
  if (end === null || now === null || slack === null) return invalid();
  return { ok: true, value: Object.freeze({ releaseOpen: now + slack < end, refundOpen: now >= end }) };
}
