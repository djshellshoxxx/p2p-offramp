/**
 * Wallet permission port, modelled on the Wallet Standard (`standard:connect` from wallet-standard/wallet-standard
 * @c49b56d6 packages/core/features/src/connect.ts; `solana:signTransaction` from anza-xyz/wallet-standard@c4d06f9f
 * packages/core/features/src/signTransaction.ts). The port is injected; this module never looks for a wallet.
 *
 * - `connectWalletRole` is an explicit, user-triggered `connect()` (no `silent`). The account used must equal the
 *   stored key of the role (seller or buyer), its `publicKey` bytes must match its address, and it must list the
 *   configured chain and `solana:signTransaction`.
 * - Sign-only: `signTransaction` returns signed bytes, so the signature (the transaction id) is known and durably
 *   journaled before this client broadcasts. `solana:signAndSendTransaction` is deliberately not used.
 * - The returned wire transaction must carry exactly one signature over exactly the message we built (so no fee
 *   payer, instruction, account or blockhash substitution), and that signature must verify with Ed25519 (strict
 *   RFC 8032 verification, `zip215: false`) for the session's key.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { createCoreError, createOperationId, normalizeError } from '../../domain/index.ts';
import type { CoreErrorCode, CoreResult } from '../../schemas/index.ts';
import { isBoundSolanaTrade, type BoundSolanaTrade } from './bind.ts';
import { decodeKey, encodeBase58, equalBytes, fail, failureCode } from './codec.ts';
import { decodeTransaction, unsignedTransaction, SIGNATURE_BYTES } from './message.ts';
import { roleKey, type SolanaRole } from './plan.ts';

export const STANDARD_CONNECT = 'standard:connect';
export const SOLANA_SIGN_TRANSACTION = 'solana:signTransaction';
export interface SolanaWalletAccount {
  readonly address: string; readonly publicKey: Uint8Array; readonly chains: readonly string[];
  readonly features: readonly string[];
}
export interface SolanaSignTransactionInput {
  readonly account: SolanaWalletAccount; readonly transaction: Uint8Array; readonly chain?: string;
}
/** The two Wallet Standard features this client uses; other wallet features are never touched. */
export interface SolanaWalletPort {
  readonly features: {
    readonly [STANDARD_CONNECT]: {
      readonly version: string;
      connect(input?: { readonly silent?: boolean }): Promise<{ readonly accounts: readonly SolanaWalletAccount[] }>;
    };
    readonly [SOLANA_SIGN_TRANSACTION]: {
      readonly version: string; readonly supportedTransactionVersions: readonly ('legacy' | 0 | 1)[];
      signTransaction(...inputs: readonly SolanaSignTransactionInput[]):
        Promise<readonly { readonly signedTransaction: Uint8Array }[]>;
    };
  };
}
export interface SolanaWalletSession {
  readonly role: SolanaRole; readonly address: string; readonly chain: string; readonly tradeId: string;
}
export interface SignedSolanaTransaction { readonly signature: string; readonly wire: Uint8Array }

interface SessionState { readonly wallet: SolanaWalletPort; readonly account: SolanaWalletAccount }
const SESSIONS = new WeakMap<object, SessionState>();
const CHAIN = /^solana:[a-z0-9-]{1,32}$/;

function own(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null) return fail();
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}
function strings(input: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum) return fail();
  const out: string[] = [];
  for (let index = 0; index < input.length; index++) {
    const entry = own(input, String(index));
    if (typeof entry !== 'string' || entry.length > 128) return fail();
    out.push(entry);
  }
  return out;
}
function bytesOf(input: unknown, maximum: number): Uint8Array {
  if (!(input instanceof Uint8Array) || input.length > maximum) return fail();
  return Uint8Array.from(input);
}

/** Strict canonical base58 of exactly 64 bytes (a transaction signature). */
export function decodeSignature(input: unknown): Uint8Array {
  if (typeof input !== 'string' || input.length < 64 || input.length > 88) return fail('INVALID_INPUT');
  let value = 0n;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  for (const character of input) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return fail('INVALID_INPUT');
    value = value * 58n + BigInt(digit);
  }
  const out = new Uint8Array(SIGNATURE_BYTES);
  for (let index = SIGNATURE_BYTES - 1; index >= 0; index--, value >>= 8n) out[index] = Number(value & 0xffn);
  if (value !== 0n || encodeBase58(out) !== input) return fail('INVALID_INPUT');
  return out;
}
/** Strict Ed25519 verification of a base58 signature over `message` for a base58 key. Never throws. */
export function verifySignature(signature: string, message: Uint8Array, key: string): boolean {
  try {
    const bytes = decodeSignature(signature);
    if (bytes.every(byte => byte === 0)) return false;
    return ed25519.verify(bytes, message, decodeKey(key), { zip215: false });
  } catch { return false; }
}

function account(entry: unknown, address: string, chain: string): SolanaWalletAccount | null {
  if (own(entry, 'address') !== address) return null;
  const publicKey = bytesOf(own(entry, 'publicKey'), 32);
  if (!equalBytes(publicKey, decodeKey(address))) return fail('INTEGRITY_FAILURE');
  const chains = strings(own(entry, 'chains'), 16), features = strings(own(entry, 'features'), 64);
  if (!chains.includes(chain) || !features.includes(SOLANA_SIGN_TRANSACTION)) return fail('UNSUPPORTED_PROVIDER');
  // The original account object is what the wallet expects back; our checks used own data properties only.
  return entry as SolanaWalletAccount;
}
/** A Wallet Standard feature method; a wallet without it (or with accessors there) is unsupported. */
function feature(wallet: SolanaWalletPort, name: string, method: string): (...args: unknown[]) => Promise<unknown> {
  let entry: unknown, call: unknown;
  try { entry = own(own(wallet, 'features'), name); call = own(entry, method); } catch {
    return fail('UNSUPPORTED_PROVIDER');
  }
  if (typeof call !== 'function') return fail('UNSUPPORTED_PROVIDER');
  return (...args: unknown[]) => Promise.resolve(Reflect.apply(call, entry, args));
}

const failure = (code: CoreErrorCode): CoreResult<never> =>
  ({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) });
/** Wallet errors are the wallet's claim; only their numeric/string code is read (4001 => USER_REJECTED). */
function walletError(error: unknown): CoreResult<never> {
  const code = failureCode(error, normalizeError(error, { operationId: createOperationId(), phase: 'prepare' }).code);
  return failure(code);
}

/** Explicit connect for one role of one trade; refuses any account but the role's stored key. */
export async function connectWalletRole(
  wallet: SolanaWalletPort, trade: BoundSolanaTrade, role: SolanaRole, chain: string,
): Promise<CoreResult<SolanaWalletSession>> {
  try {
    if (!isBoundSolanaTrade(trade) || typeof chain !== 'string' || !CHAIN.test(chain)) return failure('INVALID_INPUT');
    const address = roleKey(trade, role), connect = feature(wallet, STANDARD_CONNECT, 'connect');
    feature(wallet, SOLANA_SIGN_TRANSACTION, 'signTransaction');
    let output: unknown;
    try { output = await connect(); } catch (error) { return walletError(error); }
    const accounts = own(output, 'accounts');
    if (!Array.isArray(accounts) || accounts.length > 16) return failure('INTEGRITY_FAILURE');
    let chosen: SolanaWalletAccount | null = null;
    for (let index = 0; index < accounts.length && chosen === null; index++) {
      chosen = account(own(accounts, String(index)), address, chain);
    }
    if (chosen === null) return failure('UNAUTHORIZED');
    const session: SolanaWalletSession = Object.freeze({ role, address, chain, tradeId: trade.binding.tradeId });
    SESSIONS.set(session, { wallet, account: chosen });
    return { ok: true, value: session };
  } catch (error) { return failure(failureCode(error, 'INTEGRITY_FAILURE')); }
}
export const isWalletSession = (value: unknown): value is SolanaWalletSession =>
  typeof value === 'object' && value !== null && SESSIONS.has(value);

/** Validates wallet output: one signature, our exact message bytes, a valid signature by the session key. */
export function checkSignedTransaction(
  output: unknown, message: Uint8Array, signer: string,
): SignedSolanaTransaction {
  if (!Array.isArray(output) || output.length !== 1) return fail('INTEGRITY_FAILURE');
  const wire = bytesOf(own(own(output, '0'), 'signedTransaction'), 1232);
  let decoded: ReturnType<typeof decodeTransaction>;
  try { decoded = decodeTransaction(wire); } catch { return fail('INTEGRITY_FAILURE'); }
  if (decoded.signatures.length !== 1 || !equalBytes(decoded.message, message)) return fail('INTEGRITY_FAILURE');
  const signature = encodeBase58(decoded.signatures[0]!);
  if (!verifySignature(signature, message, signer)) return fail('INTEGRITY_FAILURE');
  return Object.freeze({ signature, wire });
}

/** One `signTransaction` call for our unsigned wire transaction; the wallet must not change a byte of the message. */
export async function signWithWallet(
  session: SolanaWalletSession, message: Uint8Array,
): Promise<CoreResult<SignedSolanaTransaction>> {
  try {
    const state = SESSIONS.get(session);
    if (!state) return failure('UNAUTHORIZED');
    const sign = feature(state.wallet, SOLANA_SIGN_TRANSACTION, 'signTransaction');
    const input = { account: state.account, transaction: unsignedTransaction(message), chain: session.chain };
    let output: unknown;
    try { output = await sign(input); } catch (error) { return walletError(error); }
    return { ok: true, value: checkSignedTransaction(output, message, session.address) };
  } catch (error) { return failure(failureCode(error, 'INTEGRITY_FAILURE')); }
}
