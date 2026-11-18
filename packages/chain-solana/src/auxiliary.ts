/**
 * The two non-escrow instructions a payout message may carry. Pure data, frozen like instructions.ts.
 *
 * - Associated Token Account `CreateIdempotent` (solana-program/associated-token-account@fbf5379e,
 *   interface/src/instruction.rs): data `[1]`; accounts funding(w,s), ata(w), wallet, mint, System program, token
 *   program. Only the original SPL Token program and the canonical ATA are ever used here.
 * - System `Transfer` (solana-sdk@129a6da7, system-interface/src/instruction.rs): bincode u32 LE variant 2 then
 *   u64 LE lamports; accounts from(w,s), to(w). Used only to top up a native escrow's rent reserve (D5 "Rent").
 *
 * Nothing here can build `AdvanceNonceAccount` (variant 4): durable-nonce transactions are refused.
 */
import { associatedTokenAddress, ATA_PROGRAM_ID, SPL_PROGRAM_ID, SYSTEM_PROGRAM_ID } from './address.ts';
import { canonicalKey, concatBytes, fail, u64LE } from './codec.ts';
import type { SolanaAccountMeta, SolanaInstruction } from './instructions.ts';

const SYSTEM_TRANSFER = 2;
const meta = (pubkey: string, isWritable: boolean, isSigner = false): SolanaAccountMeta =>
  Object.freeze({ pubkey, isSigner, isWritable });
const u32LE = (value: number) => Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24);

/** CreateIdempotent for the canonical original-SPL-Token ATA of `owner`; `payer` funds its rent if created. */
export function buildCreateAtaIdempotent(payer: string, owner: string, mint: string): SolanaInstruction {
  const funder = canonicalKey(payer, 'INVALID_INPUT'), wallet = canonicalKey(owner, 'INVALID_INPUT');
  const tokenMint = canonicalKey(mint, 'INVALID_INPUT');
  const ata = associatedTokenAddress(wallet, tokenMint).address;
  return Object.freeze({
    programId: ATA_PROGRAM_ID,
    accounts: Object.freeze([meta(funder, true, true), meta(ata, true), meta(wallet, false), meta(tokenMint, false),
      meta(SYSTEM_PROGRAM_ID, false), meta(SPL_PROGRAM_ID, false)]),
    data: Uint8Array.of(1),
  });
}

/** System transfer of `lamports` (1..u64) from a signer to a different account. */
export function buildSystemTransfer(from: string, to: string, lamports: bigint): SolanaInstruction {
  const source = canonicalKey(from, 'INVALID_INPUT'), target = canonicalKey(to, 'INVALID_INPUT');
  if (typeof lamports !== 'bigint' || lamports < 1n || source === target) return fail('INVALID_INPUT');
  return Object.freeze({
    programId: SYSTEM_PROGRAM_ID, accounts: Object.freeze([meta(source, true, true), meta(target, true)]),
    data: concatBytes([u32LE(SYSTEM_TRANSFER), u64LE(lamports)]),
  });
}
