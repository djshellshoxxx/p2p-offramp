/**
 * Payout preparation, read side and pure. Review C-L2: the client sends `release` or `refund` alone and prepares
 * the payout only after that terminal state is finalized, so a failing payout can never roll back a release. These
 * helpers decide what the permissionless payout needs (an idempotent ATA creation, a rent top-up, or nothing) or
 * why it would fail on chain. They build no instruction and read no RPC.
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import type { CoreResult } from '../../schemas/index.ts';
import { SPL_PROGRAM_ID, SYSTEM_PROGRAM_ID } from './address.ts';
import { canonicalKey, decimalU64, encodeBase58, fail, failureCode, readU32, readU64 } from './codec.ts';
import { TOKEN_ACCOUNT_BYTES } from './layout.ts';

/** An account as the reader saw it at slot S. `data` is decoded only for a 165-byte SPL Token account. */
export interface ShallowAccount {
  readonly owner: string; readonly executable: boolean; readonly lamports: number; readonly dataLength: number;
  readonly data: Uint8Array | null;
}
/** The reader's view of a recipient's canonical ATA. Classification refuses nothing; the plan decides. */
export type RecipientTokenAccountView =
  | { readonly kind: 'absent' }
  /** A data-less System account: lamports donated to the ATA address before creation (CreateIdempotent works). */
  | { readonly kind: 'system-prefunded' }
  /** Owned by a program other than SPL Token (Token-2022 included), executable, or not 165 bytes. */
  | { readonly kind: 'foreign'; readonly programOwner: string }
  | {
    readonly kind: 'token'; readonly mint: string; readonly owner: string; readonly amount: string;
    readonly state: 'uninitialized' | 'initialized' | 'frozen'; readonly delegated: boolean;
    readonly native: boolean; readonly closeAuthority: boolean;
  };
/** The reader's view of a native recipient. An absent account is 0 lamports and 0 bytes. */
export interface RecipientWalletView {
  /** Lamports, capped at 2^53-1 (any larger balance is far above every rent-exempt minimum). */
  readonly lamports: string; readonly dataLength: number; readonly executable: boolean;
  /** Rent-exempt minimum for `dataLength`, or null when the Rent sysvar threshold is not understood. */
  readonly rentExemptMinimum: string | null;
}

/** Escrow-side blockers come from the snapshot custody; destination blockers from the recipient view. */
export type SplPayoutBlocker =
  | 'vault-frozen' | 'destination-not-spl-token' | 'destination-uninitialized' | 'destination-wrong-mint'
  | 'destination-wrong-owner' | 'destination-frozen' | 'destination-native' | 'destination-delegated';
export type SplPayoutPlan =
  | { readonly kind: 'ready'; readonly destination: string }
  | {
    readonly kind: 'create-ata-idempotent'; readonly destination: string; readonly owner: string;
    readonly mint: string; readonly rentLamports: string | null;
  }
  | { readonly kind: 'blocked'; readonly destination: string; readonly reason: SplPayoutBlocker };
export type NativePayoutBlocker = 'rent-shortfall' | 'rent-unknown' | 'recipient-executable';
export type NativePayoutPlan =
  | { readonly kind: 'ready'; readonly recipient: string }
  | {
    readonly kind: 'rent-top-up'; readonly recipient: string; readonly lamports: string;
    readonly rentExemptMinimum: string;
  }
  | { readonly kind: 'blocked'; readonly recipient: string; readonly reason: NativePayoutBlocker };

const STATES = ['uninitialized', 'initialized', 'frozen'] as const;
const ABSENT = Object.freeze({ kind: 'absent' as const });
const PREFUNDED = Object.freeze({ kind: 'system-prefunded' as const });
const keyAt = (bytes: Uint8Array, offset: number) => encodeBase58(bytes.subarray(offset, offset + 32));
function optionTag(bytes: Uint8Array, offset: number): boolean {
  const tag = readU32(bytes, offset);
  if (tag > 1) return fail();
  return tag === 1;
}

/** Lenient SPL Token account decode for a destination: delegates, freezes and close authorities are reported. */
export function classifyTokenAccount(account: ShallowAccount | null): RecipientTokenAccountView {
  if (account === null) return ABSENT;
  if (account.owner === SYSTEM_PROGRAM_ID && account.dataLength === 0 && !account.executable) return PREFUNDED;
  const bytes = account.data;
  if (account.owner !== SPL_PROGRAM_ID || account.executable || account.dataLength !== TOKEN_ACCOUNT_BYTES ||
      bytes === null || bytes.length !== TOKEN_ACCOUNT_BYTES) {
    return Object.freeze({ kind: 'foreign', programOwner: account.owner });
  }
  const state = STATES[bytes[108]!];
  if (state === undefined) return fail();
  // delegate @72 (with delegated_amount @121), is_native @109, close_authority @129.
  const delegated = optionTag(bytes, 72) || readU64(bytes, 121) !== 0n;
  return Object.freeze({
    kind: 'token', mint: keyAt(bytes, 0), owner: keyAt(bytes, 32), amount: readU64(bytes, 64).toString(), state,
    delegated, native: optionTag(bytes, 109), closeAuthority: optionTag(bytes, 129),
  });
}

/** Precedence follows what fails first on chain or matters most to the user; the first match wins. */
function splPlan(
  recipient: string, mint: string, destination: string, view: RecipientTokenAccountView,
  custodyBlockedBy: readonly string[], rentLamports: string | null,
): SplPayoutPlan {
  const blocked = (reason: SplPayoutBlocker): SplPayoutPlan => Object.freeze({ kind: 'blocked', destination, reason });
  // A frozen vault makes transfer_checked fail (AccountFrozen) whatever the destination; only a thaw fixes it.
  if (custodyBlockedBy.includes('vault-frozen')) return blocked('vault-frozen');
  if (view.kind === 'absent' || view.kind === 'system-prefunded') {
    return Object.freeze({ kind: 'create-ata-idempotent', destination, owner: recipient, mint, rentLamports });
  }
  if (view.kind === 'foreign') return blocked('destination-not-spl-token');
  if (view.state === 'uninitialized') return blocked('destination-uninitialized');
  if (view.mint !== mint) return blocked('destination-wrong-mint');
  // SetAuthority can reassign the canonical ATA; the program then refuses it (WrongRecipient, 6015).
  if (view.owner !== recipient) return blocked('destination-wrong-owner');
  if (view.state === 'frozen') return blocked('destination-frozen');
  if (view.native) return blocked('destination-native');
  // Client policy, stricter than the program: a delegate could move the payout as soon as it lands.
  if (view.delegated) return blocked('destination-delegated');
  return Object.freeze({ kind: 'ready', destination });
}

/**
 * Native payout credits exactly the principal. A recipient left between 0 and its rent-exempt minimum fails the
 * transaction (InsufficientFundsForRent), so the plan asks for a top-up in the same payout transaction.
 */
function nativePlan(
  recipient: string, principal: bigint, wallet: RecipientWalletView, custodyBlockedBy: readonly string[],
): NativePayoutPlan {
  const blocked = (reason: NativePayoutBlocker): NativePayoutPlan =>
    Object.freeze({ kind: 'blocked', recipient, reason });
  if (custodyBlockedBy.includes('rent-unknown')) return blocked('rent-unknown');
  // The escrow itself is below its reserve (rent rose): anyone may top the escrow up, then the payout works.
  if (custodyBlockedBy.includes('rent-shortfall')) return blocked('rent-shortfall');
  if (wallet.executable) return blocked('recipient-executable');
  if (wallet.rentExemptMinimum === null) return blocked('rent-unknown');
  const minimum = BigInt(wallet.rentExemptMinimum), after = BigInt(wallet.lamports) + principal;
  if (after >= minimum) return Object.freeze({ kind: 'ready', recipient });
  return Object.freeze({
    kind: 'rent-top-up', recipient, lamports: (minimum - after).toString(), rentExemptMinimum: minimum.toString(),
  });
}

/** Internal entry points for the reader, whose inputs are already validated. */
export const payoutPlanners = Object.freeze({ spl: splPlan, native: nativePlan });

// ---- exported, validating wrappers (fixed INVALID_INPUT on any malformed input) ----
const SPL_BLOCKERS: readonly string[] = ['vault-frozen'];
const NATIVE_BLOCKERS: readonly string[] = ['rent-shortfall', 'rent-unknown'];
function result<T>(build: () => T): CoreResult<T> {
  try { return { ok: true, value: build() }; } catch (error) {
    const code = failureCode(error, 'INVALID_INPUT');
    return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) };
  }
}
const key = (input: unknown) => canonicalKey(input, 'INVALID_INPUT');
function blockers(input: unknown, allowed: readonly string[]): readonly string[] {
  if (!Array.isArray(input) || input.some(entry => !allowed.includes(entry as string))) return fail('INVALID_INPUT');
  return [...input as string[]];
}
function decimalOrNull(input: unknown): string | null {
  return input === null ? null : decimalU64(input).toString();
}
function tokenView(input: unknown): RecipientTokenAccountView {
  if (typeof input !== 'object' || input === null) return fail('INVALID_INPUT');
  const view = input as Record<string, unknown>;
  if (view.kind === 'absent') return ABSENT;
  if (view.kind === 'system-prefunded') return PREFUNDED;
  if (view.kind === 'foreign') return Object.freeze({ kind: 'foreign', programOwner: key(view.programOwner) });
  const flags = [view.delegated, view.native, view.closeAuthority];
  if (view.kind !== 'token' || !STATES.includes(view.state as never) || flags.some(flag => typeof flag !== 'boolean')) {
    return fail('INVALID_INPUT');
  }
  return Object.freeze({
    kind: 'token', mint: key(view.mint), owner: key(view.owner), amount: decimalU64(view.amount).toString(),
    state: view.state as (typeof STATES)[number], delegated: flags[0] as boolean, native: flags[1] as boolean,
    closeAuthority: flags[2] as boolean,
  });
}

export interface SplPayoutPlanInput {
  readonly recipient: string; readonly mint: string; readonly destination: string;
  readonly view: RecipientTokenAccountView; readonly custodyBlockedBy: readonly 'vault-frozen'[];
  /** Rent-exempt minimum of a 165-byte token account, shown separately when the ATA must be created. */
  readonly rentLamports: string | null;
}
/** `destination` is the recipient's canonical ATA (`associatedTokenAddress(recipient, mint)`). */
export function planSplPayout(input: SplPayoutPlanInput): CoreResult<SplPayoutPlan> {
  return result(() => splPlan(key(input.recipient), key(input.mint), key(input.destination), tokenView(input.view),
    blockers(input.custodyBlockedBy, SPL_BLOCKERS), decimalOrNull(input.rentLamports)));
}

export interface NativePayoutPlanInput {
  readonly recipient: string; readonly principal: string; readonly wallet: RecipientWalletView;
  readonly custodyBlockedBy: readonly ('rent-shortfall' | 'rent-unknown')[];
}
export function planNativePayout(input: NativePayoutPlanInput): CoreResult<NativePayoutPlan> {
  return result(() => {
    const wallet = input.wallet;
    if (typeof wallet !== 'object' || wallet === null || typeof wallet.executable !== 'boolean' ||
        !Number.isSafeInteger(wallet.dataLength) || wallet.dataLength < 0) return fail('INVALID_INPUT');
    const view: RecipientWalletView = {
      lamports: decimalU64(wallet.lamports).toString(), dataLength: wallet.dataLength, executable: wallet.executable,
      rentExemptMinimum: decimalOrNull(wallet.rentExemptMinimum),
    };
    return nativePlan(key(input.recipient), decimalU64(input.principal), view,
      blockers(input.custodyBlockedBy, NATIVE_BLOCKERS));
  });
}
