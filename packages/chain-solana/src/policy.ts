/**
 * Client policies for the D5 Solana escrow, as explicit values that the composition entry passes in. Nothing here
 * is applied silently: `fundingWindow` and `settlementWindow` still require a margin argument, and the reader admits
 * a mint with a freeze authority only through an explicit permit. The defaults are PROPOSED, pending owner
 * confirmation (D5 open question 4: "the owner sets the margin, because the drift bound is wide").
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import type { CoreResult } from '../../schemas/index.ts';
import { canonicalKey } from './codec.ts';
import type { SolanaEscrowSnapshot } from './reader.ts';
import { settlementWindow } from './window.ts';

/** A signed transaction lands at most this many blocks after its recent blockhash (`lastValidBlockHeight`). */
export const BLOCKHASH_VALIDITY_BLOCKS = 150;
/** A `finalized` read trails the cluster tip by about the full vote lockout (31 votes, plus one slot). */
export const FINALIZED_LAG_SLOTS = 32;
/** Agave's target slot time (DEFAULT_MS_PER_SLOT). Real slots are often slower, which only adds chain seconds. */
export const TARGET_SLOT_MILLISECONDS = 400;
/**
 * Clock::unix_timestamp is a stake-weighted median clamped to 75..250 % of the slot-implied elapsed time in an
 * epoch (Agave 4.1.2 stake_weighted_timestamp.rs), so chain seconds can run 2.5 times faster than slots imply.
 */
export const CLOCK_FAST_PERCENT = 250;

/**
 * Chain seconds between a finalized Clock reading and the latest moment a transaction built from it can execute:
 * (32 lag slots + 150 validity blocks) * 400 ms * 250 % = 182 s. A margin below this bound is unsafe by design.
 */
export const LANDING_BOUND_SECONDS = Math.ceil(
  (FINALIZED_LAG_SLOTS + BLOCKHASH_VALIDITY_BLOCKS) * TARGET_SLOT_MILLISECONDS * CLOCK_FAST_PERCENT / 100_000,
);

/**
 * PROPOSED default for `fundingWindow(…, submitMargin)`: funding must still pass the program's checks (now <
 * acceptBefore, deadline - now >= 1800) when it lands. 300 s is the 182 s landing bound plus 118 s for finality
 * stalls, slower slots and wallet relay. Too small a margin offers funding that the program refuses (6004/6005),
 * which costs only the fee; too large a margin refuses terms that would still fund.
 */
export const DEFAULT_FUNDING_SUBMIT_MARGIN_SECONDS = '300';

/**
 * PROPOSED default for `settlementWindow(…, releaseMargin)`: the client stops offering release this long before
 * the deadline, so a release built from a finalized Clock still executes before it (`now < deadline`, else 6012).
 * Same 182 s bound plus headroom. Refund needs no margin: it is offered only once a finalized Clock from the
 * current read has reached the deadline, and the Clock never goes backwards, so the tip has reached it too.
 */
export const DEFAULT_RELEASE_MARGIN_SECONDS = '300';

/** Owner choice for one allowlisted mint: it may carry exactly this freeze authority (D5 open question 2). */
export interface SolanaFreezeAuthorityPermit { readonly mint: string; readonly freezeAuthority: string }
/** mint -> the only freeze authority it may carry. A mint without an entry must have no freeze authority. */
export type FreezeAuthorityPermits = ReadonlyMap<string, string>;

const MAX_PERMITS = 64;
const invalid = (): never => { throw new Error('Invalid Solana freeze-authority permits.'); };
function field(entry: object, name: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(entry, name);
  if (!descriptor || !('value' in descriptor)) return invalid();
  try { return canonicalKey(descriptor.value, 'INVALID_INPUT'); } catch { return invalid(); }
}

function copyPermits(input: unknown): Map<string, string> {
  const permits = new Map<string, string>();
  if (input === undefined) return permits;
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const lengthField = Object.getOwnPropertyDescriptor(input, 'length');
  const length: unknown = lengthField && 'value' in lengthField ? lengthField.value : undefined;
  if (typeof length !== 'number' || length > MAX_PERMITS || Reflect.ownKeys(input).length !== length + 1) {
    return invalid();
  }
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    const entry: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof entry !== 'object' || entry === null || Reflect.ownKeys(entry).length !== 2) return invalid();
    const mint = field(entry, 'mint'), freezeAuthority = field(entry, 'freezeAuthority');
    if (permits.has(mint)) return invalid();
    permits.set(mint, freezeAuthority);
  }
  return permits;
}

/**
 * Validates permits (a dense plain array of at most 64 `{ mint, freezeAuthority }` own data properties with
 * canonical keys and unique mints) into a private copy. Accessors are never invoked. Throws a fixed-message
 * Error, like the reader's timeout check, so a bad configuration never starts a reader.
 */
export function parseFreezeAuthorityPermits(input: unknown): FreezeAuthorityPermits {
  try { return copyPermits(input); } catch { return invalid(); }
}

/**
 * Fail closed: a mint with no freeze authority is always acceptable (None can never be set again); a mint with one
 * is acceptable only when its permit names that exact key, so a rotated freeze authority needs a new owner choice.
 */
export function freezeAuthorityPermitted(
  permits: FreezeAuthorityPermits, mint: string, freezeAuthority: string | null,
): boolean {
  return freezeAuthority === null || permits.get(mint) === freezeAuthority;
}

/**
 * What the client may offer from one snapshot, with an explicit release margin (no default is applied). The
 * deadline is the escrow's stored one and the time is the same read's finalized Clock, so state and time come
 * from one slot. Refund opens only once that Clock has reached the deadline; the Clock never goes backwards, so
 * the tip has reached it too. Payout readiness is `readPayout`'s plans, not this.
 */
export function settlementActions(
  snapshot: SolanaEscrowSnapshot, releaseMargin: string,
): CoreResult<{ readonly release: boolean; readonly refund: boolean }> {
  const funded = snapshot.escrow?.state === 'funded';
  const window = settlementWindow(snapshot.escrow?.deadlineSeconds ?? '0', snapshot.live.timestampSeconds,
    releaseMargin);
  if (!window.ok) {
    return { ok: false, error: createCoreError('INVALID_INPUT', { operationId: createOperationId(), readOnly: true }) };
  }
  return {
    ok: true,
    value: Object.freeze({ release: funded && window.value.releaseOpen, refund: funded && window.value.refundOpen }),
  };
}
