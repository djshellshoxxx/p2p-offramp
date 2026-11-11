/**
 * Unsigned D5 instruction builders. Pure data: no message, blockhash, fee payer, signature or send. No
 * System Program instruction is ever produced, so a durable-nonce advance cannot be smuggled in here.
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import type { CoreErrorCode, CoreResult } from '../../schemas/index.ts';
import { associatedTokenAddress, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID } from './address.ts';
import { isBoundSolanaTrade, type BoundSolanaTrade } from './bind.ts';
import { canonicalKey, concatBytes, decimalU64, decodeKey, failureCode, fail, fromHex32, u64LE } from './codec.ts';

export interface SolanaAccountMeta { readonly pubkey: string; readonly isSigner: boolean; readonly isWritable: boolean }
/** `data` is a fresh copy per call (typed arrays cannot be frozen); everything else is frozen. */
export interface SolanaInstruction {
  readonly programId: string; readonly accounts: readonly SolanaAccountMeta[]; readonly data: Uint8Array;
}

const DISCRIMINATOR = Object.freeze({
  fundNative: 'ecf06fea0be6652b', fundSpl: '7eaf579ec83b6a50', release: 'fdf90fce1c7fc1f1', refund: '0260b7fb3fd02e2e',
  payoutNative: '241ed8ee67326263', payoutSpl: '890a23c66dc09e25',
});
const discriminator = (value: string) => Uint8Array.from(value.match(/../g)!, pair => parseInt(pair, 16));
const meta = (pubkey: string, isWritable: boolean, isSigner = false): SolanaAccountMeta =>
  Object.freeze({ pubkey, isSigner, isWritable });

function result(build: () => SolanaInstruction): CoreResult<SolanaInstruction> {
  try { return { ok: true, value: build() }; } catch (error) {
    const code: CoreErrorCode = failureCode(error, 'INVALID_INPUT');
    return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) };
  }
}
type Metas = readonly SolanaAccountMeta[];
function instruction(trade: BoundSolanaTrade, accounts: Metas, data: Uint8Array): SolanaInstruction {
  const programId = trade.deployment.address;
  return Object.freeze({ programId, accounts: Object.freeze([...accounts]), data: Uint8Array.from(data) });
}
/** Only branded trades from bindSolanaTrade, of the expected asset kind. */
function branded(trade: unknown, kind?: 'native' | 'spl'): BoundSolanaTrade {
  if (!isBoundSolanaTrade(trade)) return fail('INVALID_INPUT');
  if (kind !== undefined && trade.terms.assetKind !== kind) return fail('INVALID_INPUT');
  return trade;
}

/** FundArgs (192 bytes): order_id, buyer, private_agreement_hash, capabilities_hash, seller_nonce, then 4 u64 LE. */
function fundArgs(trade: BoundSolanaTrade): Uint8Array {
  const terms = trade.terms;
  const u64 = (value: string) => u64LE(decimalU64(value));
  return concatBytes([fromHex32(terms.orderId), decodeKey(terms.buyer, 'INVALID_INPUT'),
    fromHex32(terms.privateAgreementHash), fromHex32(terms.capabilitiesHash), fromHex32(terms.sellerNonce),
    u64(terms.revision), u64(terms.amountBaseUnits), u64(terms.acceptBeforeSeconds), u64(terms.escrowExpirySeconds)]);
}

export function buildFundNative(trade: BoundSolanaTrade): CoreResult<SolanaInstruction> {
  return result(() => {
    const bound = branded(trade, 'native');
    return instruction(bound, [meta(bound.terms.seller, true, true), meta(bound.escrow.address, true),
      meta(bound.terms.buyer, true), meta(SYSTEM_PROGRAM_ID, false)],
    concatBytes([discriminator(DISCRIMINATOR.fundNative), fundArgs(bound)]));
  });
}

export function buildFundSpl(trade: BoundSolanaTrade, sellerTokenAccount: string): CoreResult<SolanaInstruction> {
  return result(() => {
    const bound = branded(trade, 'spl'), mint = bound.terms.mint!, vault = bound.vault!.address;
    const source = canonicalKey(sellerTokenAccount, 'INVALID_INPUT');
    if (source === bound.escrow.address || source === vault || source === mint) return fail('INVALID_INPUT');
    return instruction(bound, [meta(bound.terms.seller, true, true), meta(bound.escrow.address, true),
      meta(mint, false), meta(source, true), meta(vault, true), meta(TOKEN_PROGRAM_ID, false),
      meta(SYSTEM_PROGRAM_ID, false)],
    concatBytes([discriminator(DISCRIMINATOR.fundSpl), fundArgs(bound)]));
  });
}

/** Seller signs read-only; the program requires it to equal the stored seller. */
export function buildRelease(trade: BoundSolanaTrade): CoreResult<SolanaInstruction> {
  return result(() => {
    const bound = branded(trade);
    return instruction(bound, [meta(bound.terms.seller, false, true), meta(bound.escrow.address, true)],
      discriminator(DISCRIMINATOR.release));
  });
}

/** Permissionless after the deadline: only the escrow account. */
export function buildRefund(trade: BoundSolanaTrade): CoreResult<SolanaInstruction> {
  return result(() => {
    const bound = branded(trade);
    return instruction(bound, [meta(bound.escrow.address, true)], discriminator(DISCRIMINATOR.refund));
  });
}

/** Recipient follows the terminal state: buyer after release, seller after refund. */
export function buildPayout(trade: BoundSolanaTrade, outcome: 'released' | 'refunded'): CoreResult<SolanaInstruction> {
  return result(() => {
    const bound = branded(trade);
    if (outcome !== 'released' && outcome !== 'refunded') return fail('INVALID_INPUT');
    const recipient = outcome === 'released' ? bound.terms.buyer : bound.terms.seller;
    if (bound.terms.assetKind === 'native') {
      const accounts = [meta(bound.escrow.address, true), meta(recipient, true)];
      return instruction(bound, accounts, discriminator(DISCRIMINATOR.payoutNative));
    }
    const mint = bound.terms.mint!;
    return instruction(bound, [meta(bound.escrow.address, true), meta(bound.vault!.address, true), meta(mint, false),
      meta(associatedTokenAddress(recipient, mint).address, true), meta(TOKEN_PROGRAM_ID, false)],
    discriminator(DISCRIMINATOR.payoutSpl));
  });
}
