/**
 * C-L2 message plans: the only way this package turns escrow instructions into a message.
 *
 * Integration review C-L2 overrides the D5 packet's "release and payout in one transaction" for the client: a
 * failed payout leg (frozen destination, rent) would roll back the release with it. So a message carries exactly
 * one escrow instruction. `fund`, `release` and `refund` messages hold that instruction alone; a payout message
 * is `[CreateIdempotent ATA]? ‖ [System transfer rent top-up]? ‖ payout_*` and is planned only from a FINALIZED
 * reader snapshot that shows `Released`/`Refunded` and an unpaid principal. There is no API that takes an
 * instruction list, and `verifyPlanMessage` rebuilds the expected bytes and refuses anything else.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { createCoreError, createOperationId, encodeCapabilities } from '../../domain/index.ts';
import type { CoreErrorCode, CoreResult } from '../../schemas/index.ts';
import { associatedTokenAddress, ATA_PROGRAM_ID, SYSTEM_PROGRAM_ID } from './address.ts';
import { buildCreateAtaIdempotent, buildSystemTransfer } from './auxiliary.ts';
import { isBoundSolanaTrade, type BoundSolanaTrade } from './bind.ts';
import { decimalU64, equalBytes, fail, failureCode, hex, readU64 } from './codec.ts';
import {
  buildFundNative, buildFundSpl, buildPayout, buildRefund, buildRelease, type SolanaInstruction,
} from './instructions.ts';
import { compileLegacyMessage, parseLegacyMessage } from './message.ts';
import { SolanaChainReader, type SolanaEscrowSnapshot, type SolanaReadRequest } from './reader.ts';
import { fundingWindow, settlementWindow } from './window.ts';

export type SolanaAction = 'fund' | 'release' | 'refund' | 'payout';
export type SolanaRole = 'seller' | 'buyer';
export type ExpectedEscrowState = 'absent' | 'funded' | 'released' | 'refunded';
/** Required client margins in seconds (u64 decimal). The default policy is not chosen here. */
export interface SolanaMargins { readonly submitMarginSeconds: string; readonly releaseMarginSeconds: string }
export interface PayoutOptions {
  /** Prepend CreateIdempotent for the recipient's canonical ATA (SPL only). Default true. */
  readonly createAta?: boolean;
  /** Largest native rent top-up the payer accepts, u64 decimal. Default '0' (a shortfall is refused). */
  readonly maxRentTopUpLamports?: string;
}
export interface FundOptions { readonly sellerTokenAccount?: string }
/** The variable parts of a message; together with trade, fee payer and blockhash they fix every byte. */
export type PlanShape =
  | { readonly action: 'fund'; readonly sellerTokenAccount: string | null }
  | { readonly action: 'release' } | { readonly action: 'refund' }
  | { readonly action: 'payout'; readonly outcome: 'released' | 'refunded'; readonly createAta: boolean;
    readonly rentTopUpLamports: string | null };
export interface SolanaMessagePlan {
  readonly trade: BoundSolanaTrade; readonly action: SolanaAction; readonly role: SolanaRole;
  readonly feePayer: string; readonly shape: PlanShape; readonly expectedEscrowState: ExpectedEscrowState;
  readonly instructions: readonly SolanaInstruction[];
  /** Finalized slot and block height of the snapshot the plan was checked against. */
  readonly snapshotSlot: string; readonly snapshotBlockHeight: string;
}

const PLANS = new WeakSet<object>();
const TRUSTED = new WeakSet<object>();
const CORE_CAPABILITIES_HASH = hex(sha256(encodeCapabilities([])));
export const isSolanaMessagePlan = (value: unknown): value is SolanaMessagePlan =>
  typeof value === 'object' && value !== null && PLANS.has(value);
export const isTrustedSnapshot = (value: unknown): value is SolanaEscrowSnapshot =>
  typeof value === 'object' && value !== null && TRUSTED.has(value);

const failure = (code: CoreErrorCode): CoreResult<never> =>
  ({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) });
function result<T>(work: () => T): CoreResult<T> {
  try { return { ok: true, value: work() }; } catch (error) { return failure(failureCode(error, 'INVALID_INPUT')); }
}
const value = <T>(built: CoreResult<T>): T => built.ok ? built.value : fail(built.error.code);

/**
 * A finalized read through a genuine `SolanaChainReader` (the prototype method, so a look-alike object or an own
 * `read` property cannot inject a snapshot). Only snapshots returned here can be planned against.
 */
export async function readTrustedSnapshot(
  reader: SolanaChainReader, trade: BoundSolanaTrade, request: SolanaReadRequest,
): Promise<CoreResult<SolanaEscrowSnapshot>> {
  if (!isBoundSolanaTrade(trade)) return failure('INVALID_INPUT');
  let read: CoreResult<SolanaEscrowSnapshot>;
  try { read = await SolanaChainReader.prototype.read.call(reader, trade.binding, request, trade.terms); }
  catch { return failure('INVALID_INPUT'); }
  if (read.ok) TRUSTED.add(read.value);
  return read;
}

export function roleKey(trade: BoundSolanaTrade, role: SolanaRole): string {
  if (role === 'seller') return trade.terms.seller;
  if (role === 'buyer') return trade.terms.buyer;
  return fail('INVALID_INPUT');
}
/** Strict margins: exactly the two keys, as u64 decimal strings (the window helpers bound them). */
export function parseMargins(input: unknown): SolanaMargins {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('INVALID_INPUT');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2) return fail('INVALID_INPUT');
  const read = (key: string) => {
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !('value' in field)) return fail('INVALID_INPUT');
    decimalU64(field.value);
    return field.value as string;
  };
  return Object.freeze({ submitMarginSeconds: read('submitMarginSeconds'),
    releaseMarginSeconds: read('releaseMarginSeconds') });
}

/** Snapshot of exactly this trade, read through `readTrustedSnapshot`, at finalized commitment. */
function checkedSnapshot(trade: BoundSolanaTrade, snapshot: unknown): SolanaEscrowSnapshot {
  if (!isBoundSolanaTrade(trade) || !isTrustedSnapshot(snapshot)) return fail('INVALID_INPUT');
  const binding = snapshot.observation.binding;
  if (snapshot.observation.finality !== 'finalized' || snapshot.escrowAddress !== trade.escrow.address ||
      binding.tradeId !== trade.binding.tradeId || binding.networkId !== trade.binding.networkId ||
      binding.deploymentId !== trade.binding.deploymentId) return fail('INVALID_INPUT');
  return snapshot;
}
function payer(trade: BoundSolanaTrade, role: SolanaRole, allowed: readonly SolanaRole[]): string {
  if (!allowed.includes(role)) return fail('UNAUTHORIZED');
  return roleKey(trade, role);
}

/** Instructions for one shape. Every message this package compiles comes from here. */
export function shapeInstructions(
  trade: BoundSolanaTrade, feePayer: string, shape: PlanShape,
): readonly SolanaInstruction[] {
  switch (shape.action) {
    case 'fund': return [trade.terms.assetKind === 'native' ? value(buildFundNative(trade))
      : value(buildFundSpl(trade, shape.sellerTokenAccount ?? fail('INVALID_INPUT')))];
    case 'release': return [value(buildRelease(trade))];
    case 'refund': return [value(buildRefund(trade))];
    case 'payout': {
      const out: SolanaInstruction[] = [];
      const recipient = shape.outcome === 'released' ? trade.terms.buyer : trade.terms.seller;
      if (shape.createAta) {
        if (trade.terms.assetKind !== 'spl') return fail('INVALID_INPUT');
        out.push(buildCreateAtaIdempotent(feePayer, recipient, trade.terms.mint!));
      }
      if (shape.rentTopUpLamports !== null) {
        if (trade.terms.assetKind !== 'native') return fail('INVALID_INPUT');
        out.push(buildSystemTransfer(feePayer, trade.escrow.address, decimalU64(shape.rentTopUpLamports)));
      }
      out.push(value(buildPayout(trade, shape.outcome)));
      return out;
    }
    default: return fail('INVALID_INPUT');
  }
}

function makePlan(
  trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, role: SolanaRole, feePayer: string, shape: PlanShape,
  expectedEscrowState: ExpectedEscrowState,
): SolanaMessagePlan {
  const plan: SolanaMessagePlan = Object.freeze({
    trade, action: shape.action, role, feePayer, shape: Object.freeze({ ...shape }), expectedEscrowState,
    instructions: Object.freeze(shapeInstructions(trade, feePayer, shape)),
    snapshotSlot: snapshot.live.height, snapshotBlockHeight: snapshot.live.blockHeight,
  });
  PLANS.add(plan);
  return plan;
}

/** Seller funds an absent escrow while the funding window stays open for `submitMarginSeconds`. */
export function planFund(
  trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, role: SolanaRole, margins: SolanaMargins,
  options: FundOptions = {},
): CoreResult<SolanaMessagePlan> {
  return result(() => {
    const read = checkedSnapshot(trade, snapshot), limits = parseMargins(margins);
    const feePayer = payer(trade, role, ['seller']);
    if (read.escrow !== null || read.occupant === 'escrow') return fail('CONFLICT');
    const terms = trade.terms;
    // Accepted D4: new funding is core-only; historical decoding and all exit plans remain policy-neutral.
    if (terms.capabilitiesHash !== CORE_CAPABILITIES_HASH) return fail('UNSUPPORTED_PROVIDER');
    const window = value(fundingWindow(terms.acceptBeforeSeconds, terms.escrowExpirySeconds,
      read.live.timestampSeconds, limits.submitMarginSeconds));
    if (window !== 'open') return fail('EXPIRED');
    const source = terms.assetKind === 'spl'
      ? options.sellerTokenAccount ?? associatedTokenAddress(terms.seller, terms.mint!).address : null;
    return makePlan(trade, read, role, feePayer, { action: 'fund', sellerTokenAccount: source }, 'absent');
  });
}

/** Seller releases a `Funded` escrow strictly before `deadline - releaseMarginSeconds` (finalized Clock). */
export function planRelease(
  trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, role: SolanaRole, margins: SolanaMargins,
): CoreResult<SolanaMessagePlan> {
  return result(() => {
    const read = checkedSnapshot(trade, snapshot), limits = parseMargins(margins);
    const feePayer = payer(trade, role, ['seller']);
    if (read.escrow?.state !== 'funded') return fail('CONFLICT');
    const window = value(settlementWindow(read.escrow.deadlineSeconds, read.live.timestampSeconds,
      limits.releaseMarginSeconds));
    if (!window.releaseOpen) return fail('EXPIRED');
    return makePlan(trade, read, role, feePayer, { action: 'release' }, 'funded');
  });
}

/** Seller refunds a `Funded` escrow once the finalized Clock has reached the deadline. */
export function planRefund(
  trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, role: SolanaRole, margins: SolanaMargins,
): CoreResult<SolanaMessagePlan> {
  return result(() => {
    const read = checkedSnapshot(trade, snapshot), limits = parseMargins(margins);
    const feePayer = payer(trade, role, ['seller']);
    if (read.escrow?.state !== 'funded') return fail('CONFLICT');
    const window = value(settlementWindow(read.escrow.deadlineSeconds, read.live.timestampSeconds,
      limits.releaseMarginSeconds));
    if (!window.refundOpen) return fail('EXPIRED');
    return makePlan(trade, read, role, feePayer, { action: 'refund' }, 'funded');
  });
}

/** Native rent shortfall, or null; unknown rent and amounts above the payer's limit are refused. */
function rentTopUp(snapshot: SolanaEscrowSnapshot, maxTopUp: bigint): string | null {
  const custody = snapshot.custody;
  if (custody?.kind === 'native' && custody.payoutBlockedBy.includes('rent-unknown')) return fail('CONFLICT');
  if (custody?.kind !== 'native' || !custody.payoutBlockedBy.includes('rent-shortfall')) return null;
  const minimum = BigInt(custody.rentExemptMinimum!), spare = BigInt(custody.lamports) - BigInt(custody.principalHeld);
  const shortfall = minimum - spare;
  if (shortfall < 1n) return fail('INTEGRITY_FAILURE');
  if (shortfall > maxTopUp) return fail('LIMIT_EXCEEDED');
  return shortfall.toString();
}

/** Anyone in the trade pays out after a FINALIZED `Released`/`Refunded` read with the principal unpaid. */
export function planPayout(
  trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, role: SolanaRole, options: PayoutOptions = {},
): CoreResult<SolanaMessagePlan> {
  return result(() => {
    const read = checkedSnapshot(trade, snapshot), feePayer = payer(trade, role, ['seller', 'buyer']);
    const state = read.escrow?.state;
    if ((state !== 'released' && state !== 'refunded') || read.escrow!.paidOut || read.payout !== 'pending') {
      return fail('CONFLICT');
    }
    if (read.custody?.kind === 'spl' && read.custody.vaultFrozen) return fail('CONFLICT');
    const spl = trade.terms.assetKind === 'spl';
    const createAta = spl && options.createAta !== false;
    const topUp = spl ? null : rentTopUp(read, decimalU64(options.maxRentTopUpLamports ?? '0'));
    const shape: PlanShape = { action: 'payout', outcome: state, createAta, rentTopUpLamports: topUp };
    return makePlan(trade, read, role, feePayer, shape, state);
  });
}

/** Legacy message bytes of a plan; re-checks the plan brand. */
export function compilePlan(plan: SolanaMessagePlan, recentBlockhash: string): Uint8Array {
  if (!isSolanaMessagePlan(plan)) return fail('INVALID_INPUT');
  return compileLegacyMessage(plan.feePayer, plan.instructions, recentBlockhash);
}

/** Reads the variable parts back from a message, then requires byte equality with the rebuilt message. */
function shapeOf(
  trade: BoundSolanaTrade, action: SolanaAction, expected: ExpectedEscrowState, message: Uint8Array,
): PlanShape {
  const parsed = parseLegacyMessage(message), keys = parsed.accountKeys;
  const programs = parsed.instructions.map(instruction => keys[instruction.programIdIndex]!);
  if (action === 'fund') {
    const fund = parsed.instructions[0];
    const source = trade.terms.assetKind === 'spl' && fund ? keys[fund.accounts[3] ?? 0] ?? null : null;
    return { action, sellerTokenAccount: source };
  }
  if (action === 'release' || action === 'refund') return { action };
  if (expected !== 'released' && expected !== 'refunded') return fail('INVALID_INPUT');
  const createAta = programs[0] === ATA_PROGRAM_ID;
  const transfer = parsed.instructions.find((_, index) => programs[index] === SYSTEM_PROGRAM_ID);
  const topUp = transfer && transfer.data.length === 12 ? readU64(transfer.data, 4).toString() : null;
  return { action, outcome: expected, createAta, rentTopUpLamports: topUp };
}

/**
 * Throws unless `message` is exactly what this package would compile for (trade, action, fee payer, blockhash):
 * one escrow instruction, never a state instruction beside a payout, no foreign or durable-nonce instruction.
 */
export function verifyPlanMessage(
  trade: BoundSolanaTrade, action: SolanaAction, expected: ExpectedEscrowState, feePayer: string,
  message: Uint8Array,
): PlanShape {
  if (!isBoundSolanaTrade(trade)) return fail('INVALID_INPUT');
  const parsed = parseLegacyMessage(message);
  if (parsed.accountKeys[0] !== feePayer || parsed.header.numRequiredSignatures !== 1) return fail('INVALID_INPUT');
  let shape: PlanShape, rebuilt: Uint8Array;
  try {
    shape = shapeOf(trade, action, expected, message);
    rebuilt = compileLegacyMessage(feePayer, shapeInstructions(trade, feePayer, shape), parsed.recentBlockhash);
  } catch { return fail('INVALID_INPUT'); }
  if (!equalBytes(rebuilt, message)) return fail('INVALID_INPUT');
  return shape;
}
