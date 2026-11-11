/** Account byte decoders for the D5 escrow and the loader, sysvar and SPL Token accounts it depends on. */
import { sha256 } from '@noble/hashes/sha2.js';
import { SPL_PROGRAM_ID } from './address.ts';
import { encodeBase58, equalBytes, fail, hex, readI64, readU32, readU64 } from './codec.ts';

/** PROPOSED (pending release-owner confirmation): SHA-256 of ProgramData bytes [45..end), untrimmed. */
export const PROGRAM_DATA_HASH_METHOD = 'loader-v3-programdata-region/v1';
export const MAX_PROGRAM_DATA_REGION_BYTES = 1_048_576;
export const PROGRAM_DATA_HEADER_BYTES = 45;
export const ESCROW_BYTES = 222;
export const PROGRAM_BYTES = 36;
export const CLOCK_BYTES = 40;
export const RENT_BYTES = 17;
export const TOKEN_ACCOUNT_BYTES = 165;
export const MINT_BYTES = 82;
const ESCROW_DISCRIMINATOR = '1a5ac1dabcfb8bd3';
const STATES = ['funded', 'released', 'refunded'] as const;
const ZERO_KEY = new Uint8Array(32);

export interface EscrowAccountV1 {
  readonly escrowBump: number; readonly vaultBump: number; readonly state: 'funded' | 'released' | 'refunded';
  readonly paidOut: boolean; readonly assetKind: 'native' | 'spl'; readonly seller: string; readonly buyer: string;
  readonly mint: string | null; readonly tokenProgram: string | null; readonly amountBaseUnits: string;
  readonly deadlineSeconds: string; readonly termsHash: string; readonly sellerNonce: string;
}
export interface TokenAccountV1 {
  readonly mint: string; readonly owner: string; readonly amount: bigint; readonly frozen: boolean;
}
export interface MintV1 { readonly decimals: number; readonly freezeAuthority: string | null }
export interface ClockV1 { readonly slot: bigint; readonly unixTimestamp: bigint }
export interface ProgramDataV1 { readonly deploySlot: bigint; readonly sha256: string }

const slice32 = (bytes: Uint8Array, offset: number) => bytes.subarray(offset, offset + 32);
const keyAt = (bytes: Uint8Array, offset: number) => encodeBase58(slice32(bytes, offset));
const exactLength = (bytes: Uint8Array, length: number) => { if (bytes.length !== length) fail(); };

/** COption tags are exactly [0,0,0,0] (None) or [1,0,0,0] (Some); the body of None is ignored. */
function optionTag(bytes: Uint8Array, offset: number): boolean {
  const tag = readU32(bytes, offset);
  if (tag > 1) return fail();
  return tag === 1;
}

/** ProgramData hash: requires tag 3, option byte 0/1 and a 1..1 MiB region; padding is included. */
export function programDataSha256(accountData: Uint8Array): string {
  const length = accountData.length;
  if (length <= PROGRAM_DATA_HEADER_BYTES || length > PROGRAM_DATA_HEADER_BYTES + MAX_PROGRAM_DATA_REGION_BYTES) {
    return fail();
  }
  if (readU32(accountData, 0) !== 3 || accountData[12]! > 1) return fail();
  return hex(sha256(accountData.subarray(PROGRAM_DATA_HEADER_BYTES)));
}
/** Registry pin from a verifiable build: sha256(elf ‖ zero padding up to the deployed region length). */
export function programDataSha256FromElf(elf: Uint8Array, programDataLength: number): string {
  if (!Number.isSafeInteger(programDataLength) || elf.length < 1) return fail('INVALID_INPUT');
  const padding = programDataLength - PROGRAM_DATA_HEADER_BYTES - elf.length;
  if (padding < 0 || programDataLength > PROGRAM_DATA_HEADER_BYTES + MAX_PROGRAM_DATA_REGION_BYTES) {
    return fail('INVALID_INPUT');
  }
  return hex(sha256.create().update(elf).update(new Uint8Array(padding)).digest());
}
/** Reader view: additionally requires the authority option to be None ([13..45) is never read). */
export function decodeProgramData(bytes: Uint8Array): ProgramDataV1 {
  const digest = programDataSha256(bytes);
  if (bytes[12] !== 0) return fail();
  return Object.freeze({ deploySlot: readU64(bytes, 4), sha256: digest });
}
/** Loader-v3 Program account: tag 2 and the programdata pointer. */
export function decodeProgramAccount(bytes: Uint8Array): string {
  exactLength(bytes, PROGRAM_BYTES);
  if (readU32(bytes, 0) !== 2) return fail();
  return keyAt(bytes, 4);
}
export function decodeClock(bytes: Uint8Array): ClockV1 {
  exactLength(bytes, CLOCK_BYTES);
  return Object.freeze({ slot: readU64(bytes, 0), unixTimestamp: readI64(bytes, 32) });
}
const THRESHOLD_ONE = '000000000000f03f', THRESHOLD_TWO = '0000000000000040';
/**
 * Rent-exempt minimum of a 222-byte escrow: (128 + 222) * lamportsPerByteYear * threshold. Only the two
 * exact f64 thresholds 1.0 and 2.0 are understood (no floats); any other value is unknown (null).
 */
export function escrowRentMinimum(bytes: Uint8Array): bigint | null {
  exactLength(bytes, RENT_BYTES);
  const lamportsPerByteYear = readU64(bytes, 0), threshold = hex(bytes.subarray(8, 16));
  if (threshold === THRESHOLD_ONE) return 350n * lamportsPerByteYear;
  if (threshold === THRESHOLD_TWO) return 700n * lamportsPerByteYear;
  return null;
}
/** SPL Token account; refuses delegate, close authority, native wrapping and uninitialized state. */
export function decodeTokenAccount(bytes: Uint8Array): TokenAccountV1 {
  exactLength(bytes, TOKEN_ACCOUNT_BYTES);
  const state = bytes[108]!;
  if (state !== 1 && state !== 2) return fail();
  // delegate @72, is_native @109 and close_authority @129 must be None; delegated_amount @121 must be 0.
  if (optionTag(bytes, 72) || optionTag(bytes, 109) || optionTag(bytes, 129)) return fail();
  if (readU64(bytes, 121) !== 0n) return fail();
  const amount = readU64(bytes, 64);
  return Object.freeze({ mint: keyAt(bytes, 0), owner: keyAt(bytes, 32), amount, frozen: state === 2 });
}
export function decodeMint(bytes: Uint8Array): MintV1 {
  exactLength(bytes, MINT_BYTES);
  optionTag(bytes, 0);
  if (bytes[45] !== 1) return fail();
  const freezeAuthority = optionTag(bytes, 46) ? keyAt(bytes, 50) : null;
  return Object.freeze({ decimals: bytes[44]!, freezeAuthority });
}

/** Structural EscrowV1 decode. Relational checks (PDA bumps, terms) belong to the reader. */
export function decodeEscrow(bytes: Uint8Array): EscrowAccountV1 {
  exactLength(bytes, ESCROW_BYTES);
  if (hex(bytes.subarray(0, 8)) !== ESCROW_DISCRIMINATOR || bytes[8] !== 1) return fail();
  const stateIndex = bytes[11]!, paid = bytes[12]!, kind = bytes[13]!;
  if (stateIndex > 2 || paid > 1 || (paid === 1 && stateIndex === 0) || (kind !== 0 && kind !== 2)) return fail();
  const mint = slice32(bytes, 78), tokenProgram = slice32(bytes, 110), amount = readU64(bytes, 142);
  if (amount < 1n) return fail();
  const zeroAssets = equalBytes(mint, ZERO_KEY) && equalBytes(tokenProgram, ZERO_KEY);
  if (kind === 0 && (!zeroAssets || bytes[10] !== 0)) return fail();
  // Token-2022 and any other token program are refused: v1 binds the original SPL Token program only.
  if (kind === 2 && (keyAt(bytes, 110) !== SPL_PROGRAM_ID || equalBytes(mint, ZERO_KEY))) return fail();
  return Object.freeze({
    escrowBump: bytes[9]!, vaultBump: bytes[10]!, state: STATES[stateIndex]!, paidOut: paid === 1,
    assetKind: kind === 0 ? 'native' as const : 'spl' as const, seller: keyAt(bytes, 14), buyer: keyAt(bytes, 46),
    mint: kind === 0 ? null : encodeBase58(mint), tokenProgram: kind === 0 ? null : SPL_PROGRAM_ID,
    amountBaseUnits: amount.toString(), deadlineSeconds: readU64(bytes, 150).toString(),
    termsHash: hex(slice32(bytes, 158)), sellerNonce: hex(slice32(bytes, 190)),
  });
}
