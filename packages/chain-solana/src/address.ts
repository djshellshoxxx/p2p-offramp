/** Solana program IDs, the ed25519 on-curve test and PDA/ATA derivation. Pure: no RPC, no key material. */
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, decodeKey, encodeBase58, fail, fromHex32 } from './codec.ts';

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
/** Known only so it can be refused: v1 supports the original SPL Token program alone. */
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const LOADER_V3_ID = 'BPFLoaderUpgradeab1e11111111111111111111111';
export const SYSVAR_OWNER_ID = 'Sysvar1111111111111111111111111111111111111';
export const CLOCK_SYSVAR_ID = 'SysvarC1ock11111111111111111111111111111111';
export const RENT_SYSVAR_ID = 'SysvarRent111111111111111111111111111111111';
/** Wrapped-SOL mints of SPL Token and Token-2022; the program refuses both (network.rs). */
export const WRAPPED_SOL_MINTS: readonly string[] = Object.freeze([
  'So11111111111111111111111111111111111111112', '9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP',
]);
const ESCROW_SEED = new TextEncoder().encode('p2p-offramp-escrow-v1');
const VAULT_SEED = new TextEncoder().encode('p2p-offramp-vault-v1');
const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');
const MAX_SEEDS = 15;
const MAX_SEED_BYTES = 32;

export interface ProgramAddress { readonly address: string; readonly bump: number }

const P = (1n << 255n) - 19n;
function modPow(base: bigint, exponent: bigint): bigint {
  let result = 1n, factor = base % P;
  for (let rest = exponent; rest > 0n; rest >>= 1n) {
    if (rest & 1n) result = result * factor % P;
    factor = factor * factor % P;
  }
  return result;
}
const D = (P - 121665n) * modPow(121666n, P - 2n) % P;

/**
 * Matches curve25519-dalek `CompressedEdwardsY::decompress().is_some()`: the sign bit is dropped, y is
 * reduced mod p (non-canonical y is accepted), and the point exists iff (y²-1)/(d·y²+1) is a square or 0.
 * v = d·y²+1 is never 0 because d is a non-square, so Euler's criterion on u·v decides it.
 */
export function isOnCurve(bytes32: Uint8Array): boolean {
  if (bytes32.length !== 32) return fail('INVALID_INPUT');
  let y = 0n;
  for (let index = 31; index >= 0; index--) y = (y << 8n) | BigInt(bytes32[index]!);
  y = (y & ((1n << 255n) - 1n)) % P;
  const y2 = y * y % P;
  const u = (y2 - 1n + P) % P, v = (D * y2 + 1n) % P;
  const legendre = modPow(u * v % P, (P - 1n) / 2n);
  return legendre === 0n || legendre === 1n;
}

/** First off-curve sha256(seeds ‖ [bump] ‖ programId ‖ marker), bump counting down from 255. */
export function findProgramAddress(seeds: readonly Uint8Array[], programId: Uint8Array): ProgramAddress {
  if (seeds.length > MAX_SEEDS || seeds.some(seed => seed.length > MAX_SEED_BYTES) || programId.length !== 32) {
    return fail('INVALID_INPUT');
  }
  for (let bump = 255; bump >= 0; bump--) {
    const candidate = sha256(concatBytes([...seeds, Uint8Array.of(bump), programId, PDA_MARKER]));
    if (!isOnCurve(candidate)) return Object.freeze({ address: encodeBase58(candidate), bump });
  }
  return fail('INVALID_INPUT');
}

const key = (value: string) => decodeKey(value, 'INVALID_INPUT');
export function escrowAddress(programId: string, seller: string, sellerNonceHex: string): ProgramAddress {
  return findProgramAddress([ESCROW_SEED, key(seller), fromHex32(sellerNonceHex)], key(programId));
}
export function vaultAddress(programId: string, escrow: string): ProgramAddress {
  return findProgramAddress([VAULT_SEED, key(escrow)], key(programId));
}
/** Canonical ATA for the original SPL Token program only. */
export function associatedTokenAddress(owner: string, mint: string): ProgramAddress {
  return findProgramAddress([key(owner), key(TOKEN_PROGRAM_ID), key(mint)], key(ATA_PROGRAM_ID));
}
/** Loader-v3 ProgramData account: PDA of [programId] under the upgradeable loader. */
export function programDataAddress(programId: string): ProgramAddress {
  return findProgramAddress([key(programId)], key(LOADER_V3_ID));
}
