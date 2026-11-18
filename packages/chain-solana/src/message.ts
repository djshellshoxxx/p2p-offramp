/**
 * Legacy Solana messages and wire transactions: compile, serialize and strictly parse. Pure: no RPC, no keys.
 *
 * Wire format, from the Solana docs "Transaction Structure" (solana-foundation/solana-com@14537348,
 * apps/docs/content/docs/en/core/transactions/transaction-structure.mdx) and solana-sdk@129a6da7
 * (message/src/legacy.rs, message/src/compiled_keys.rs, message/src/compiled_instruction.rs, short-vec/src/lib.rs):
 *
 *   message     = num_required_signatures u8 ‖ num_readonly_signed u8 ‖ num_readonly_unsigned u8
 *                 ‖ compact-u16 n ‖ n × 32-byte account keys ‖ recent_blockhash (32 bytes)
 *                 ‖ compact-u16 m ‖ m × (program_id_index u8 ‖ compact-u16 k ‖ k × u8 ‖ compact-u16 d ‖ d bytes)
 *   transaction = compact-u16 s ‖ s × 64-byte Ed25519 signatures ‖ message, at most 1232 bytes (PACKET_DATA_SIZE)
 *
 * Account keys are ordered writable signers, readonly signers, writable non-signers, readonly non-signers, with the
 * fee payer first. Flags of a key used twice are OR-ed. Inside each group the keys follow CompiledKeys (a BTreeMap,
 * so ascending key bytes), which makes the bytes equal `solana_message::legacy::Message::new(ixs, Some(payer))`.
 * The parser applies the legacy `Message::sanitize` rules (signing and readonly-unsigned areas do not overlap, at
 * least one writable signer, every index in range, program index never 0) and also refuses duplicate keys,
 * non-canonical compact-u16, a versioned prefix and trailing bytes.
 */
import { concatBytes, decodeKey, encodeBase58, fail } from './codec.ts';
import type { SolanaAccountMeta, SolanaInstruction } from './instructions.ts';

/** PACKET_DATA_SIZE: the whole serialized transaction, signatures included. */
export const MAX_TRANSACTION_BYTES = 1232;
export const SIGNATURE_BYTES = 64;
const MAX_KEYS = 255;

export interface LegacyMessageHeader {
  readonly numRequiredSignatures: number; readonly numReadonlySigned: number; readonly numReadonlyUnsigned: number;
}
export interface CompiledInstructionV1 {
  readonly programIdIndex: number; readonly accounts: readonly number[]; readonly data: Uint8Array;
}
export interface LegacyMessageV1 {
  readonly header: LegacyMessageHeader; readonly accountKeys: readonly string[]; readonly recentBlockhash: string;
  readonly instructions: readonly CompiledInstructionV1[];
}

/** compact-u16 (ShortU16): 7 bits per byte, low bits first, continuation bit 0x80, at most 3 bytes. */
export function encodeCompactU16(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) return fail('INVALID_INPUT');
  const out: number[] = [];
  for (let rest = value; ; rest >>= 7) {
    if (rest < 0x80) { out.push(rest); return Uint8Array.from(out); }
    out.push((rest & 0x7f) | 0x80);
  }
}
/** Canonical decode: no zero continuation byte (alias), no fourth byte, no overflow above 0xffff. */
export function decodeCompactU16(bytes: Uint8Array, offset: number): { readonly value: number; readonly next: number } {
  let value = 0;
  for (let index = 0; index < 3; index++) {
    const byte = bytes[offset + index];
    if (byte === undefined) return fail();
    if (byte === 0 && index > 0) return fail();
    value |= (byte & 0x7f) << (7 * index);
    if ((byte & 0x80) === 0) {
      if (value > 0xffff) return fail();
      return { value, next: offset + index + 1 };
    }
    if (index === 2) return fail();
  }
  return fail();
}

interface KeyFlags { signer: boolean; writable: boolean }
const groupOf = (flags: KeyFlags) => (flags.signer ? 0 : 2) + (flags.writable ? 0 : 1);
function compareKeys(a: string, b: string): number {
  const left = decodeKey(a, 'INVALID_INPUT'), right = decodeKey(b, 'INVALID_INPUT');
  for (let index = 0; index < 32; index++) if (left[index] !== right[index]) return left[index]! - right[index]!;
  return 0;
}

/** Ordered keys and header for one fee payer and instruction list (CompiledKeys::compile semantics). */
function compileKeys(feePayer: string, instructions: readonly SolanaInstruction[]) {
  const flags = new Map<string, KeyFlags>();
  const add = (key: string, signer: boolean, writable: boolean) => {
    decodeKey(key, 'INVALID_INPUT');
    const entry = flags.get(key) ?? { signer: false, writable: false };
    flags.set(key, { signer: entry.signer || signer, writable: entry.writable || writable });
  };
  for (const instruction of instructions) {
    add(instruction.programId, false, false);
    for (const account of instruction.accounts) add(account.pubkey, account.isSigner, account.isWritable);
  }
  add(feePayer, true, true);
  const rest = [...flags.entries()].filter(([key]) => key !== feePayer);
  const ordered = [feePayer, ...rest.sort(([a, x], [b, y]) => groupOf(x) - groupOf(y) || compareKeys(a, b))
    .map(([key]) => key)];
  if (ordered.length > MAX_KEYS) return fail('LIMIT_EXCEEDED');
  const counts = [0, 0, 0, 0];
  for (const key of ordered) counts[groupOf(flags.get(key)!)]!++;
  const header: LegacyMessageHeader = Object.freeze({
    numRequiredSignatures: counts[0]! + counts[1]!, numReadonlySigned: counts[1]!, numReadonlyUnsigned: counts[3]!,
  });
  return { ordered, header };
}

/** Serializes a legacy message. Throws a fixed-code SolanaFailure on any invalid input. */
export function compileLegacyMessage(
  feePayer: string, instructions: readonly SolanaInstruction[], recentBlockhash: string,
): Uint8Array {
  if (instructions.length < 1 || instructions.length > 64) return fail('INVALID_INPUT');
  const { ordered, header } = compileKeys(feePayer, instructions);
  const index = new Map(ordered.map((key, position) => [key, position]));
  const compiled = instructions.map(instruction => concatBytes([
    Uint8Array.of(index.get(instruction.programId)!),
    encodeCompactU16(instruction.accounts.length),
    Uint8Array.from(instruction.accounts, meta => index.get(meta.pubkey)!),
    encodeCompactU16(instruction.data.length), instruction.data,
  ]));
  const message = concatBytes([
    Uint8Array.of(header.numRequiredSignatures, header.numReadonlySigned, header.numReadonlyUnsigned),
    encodeCompactU16(ordered.length), ...ordered.map(key => decodeKey(key, 'INVALID_INPUT')),
    decodeKey(recentBlockhash, 'INVALID_INPUT'), encodeCompactU16(instructions.length), ...compiled,
  ]);
  if (transactionLength(header.numRequiredSignatures, message.length) > MAX_TRANSACTION_BYTES) {
    return fail('LIMIT_EXCEEDED');
  }
  return message;
}
const transactionLength = (signatures: number, messageLength: number) =>
  encodeCompactU16(signatures).length + signatures * SIGNATURE_BYTES + messageLength;

/** Strict legacy parse; see the module comment for the refused forms. */
export function parseLegacyMessage(bytes: Uint8Array): LegacyMessageV1 {
  if (!(bytes instanceof Uint8Array) || bytes.length < 3 || bytes.length > MAX_TRANSACTION_BYTES) return fail();
  if ((bytes[0]! & 0x80) !== 0) return fail();
  const header: LegacyMessageHeader = Object.freeze({
    numRequiredSignatures: bytes[0]!, numReadonlySigned: bytes[1]!, numReadonlyUnsigned: bytes[2]!,
  });
  const keyCount = decodeCompactU16(bytes, 3);
  let offset = keyCount.next;
  const keys: string[] = [];
  for (let index = 0; index < keyCount.value; index++, offset += 32) {
    if (offset + 32 > bytes.length) return fail();
    keys.push(encodeBase58(bytes.subarray(offset, offset + 32)));
  }
  if (offset + 32 > bytes.length) return fail();
  const recentBlockhash = encodeBase58(bytes.subarray(offset, offset + 32));
  offset += 32;
  const count = decodeCompactU16(bytes, offset);
  offset = count.next;
  const instructions: CompiledInstructionV1[] = [];
  for (let index = 0; index < count.value; index++) {
    const programIdIndex = bytes[offset];
    if (programIdIndex === undefined) return fail();
    const accountCount = decodeCompactU16(bytes, offset + 1);
    offset = accountCount.next;
    if (offset + accountCount.value > bytes.length) return fail();
    const accounts = Array.from(bytes.subarray(offset, offset + accountCount.value));
    offset += accountCount.value;
    const dataLength = decodeCompactU16(bytes, offset);
    offset = dataLength.next;
    if (offset + dataLength.value > bytes.length) return fail();
    instructions.push(Object.freeze({ programIdIndex, accounts: Object.freeze(accounts),
      data: bytes.slice(offset, offset + dataLength.value) }));
    offset += dataLength.value;
  }
  if (offset !== bytes.length) return fail();
  sanitize(header, keys, instructions);
  return Object.freeze({ header, accountKeys: Object.freeze(keys), recentBlockhash,
    instructions: Object.freeze(instructions) });
}

function sanitize(
  header: LegacyMessageHeader, keys: readonly string[], instructions: readonly CompiledInstructionV1[],
): void {
  const { numRequiredSignatures: signers, numReadonlySigned: readonlySigned } = header;
  if (signers + header.numReadonlyUnsigned > keys.length || readonlySigned >= signers) return fail();
  if (new Set(keys).size !== keys.length) return fail();
  for (const instruction of instructions) {
    if (instruction.programIdIndex === 0 || instruction.programIdIndex >= keys.length) return fail();
    if (instruction.accounts.some(index => index >= keys.length)) return fail();
  }
}

/** Account metas as the runtime derives them from the header (static writability, no demotion). */
export function decompileInstructions(message: LegacyMessageV1): readonly SolanaInstruction[] {
  const { header, accountKeys } = message, signers = header.numRequiredSignatures;
  const writable = (index: number) => index < signers ? index < signers - header.numReadonlySigned
    : index < accountKeys.length - header.numReadonlyUnsigned;
  const metaAt = (index: number): SolanaAccountMeta =>
    Object.freeze({ pubkey: accountKeys[index]!, isSigner: index < signers, isWritable: writable(index) });
  return Object.freeze(message.instructions.map(instruction => Object.freeze({
    programId: accountKeys[instruction.programIdIndex]!,
    accounts: Object.freeze(instruction.accounts.map(metaAt)), data: Uint8Array.from(instruction.data),
  })));
}

/** Wire transaction with zeroed signature slots, the input the Wallet Standard `signTransaction` expects. */
export function unsignedTransaction(message: Uint8Array): Uint8Array {
  const signers = parseLegacyMessage(message).header.numRequiredSignatures;
  return concatBytes([encodeCompactU16(signers), new Uint8Array(signers * SIGNATURE_BYTES), message]);
}
export function encodeTransaction(signatures: readonly Uint8Array[], message: Uint8Array): Uint8Array {
  const parsed = parseLegacyMessage(message);
  if (signatures.length !== parsed.header.numRequiredSignatures) return fail('INVALID_INPUT');
  if (signatures.some(signature => signature.length !== SIGNATURE_BYTES)) return fail('INVALID_INPUT');
  return concatBytes([encodeCompactU16(signatures.length), ...signatures, message]);
}
/** Strict wire decode: signature count equals the header's, the message parses, size at most 1232 bytes. */
export function decodeTransaction(wire: Uint8Array): {
  readonly signatures: readonly Uint8Array[]; readonly message: Uint8Array;
} {
  if (!(wire instanceof Uint8Array) || wire.length > MAX_TRANSACTION_BYTES) return fail();
  const count = decodeCompactU16(wire, 0);
  const start = count.next + count.value * SIGNATURE_BYTES;
  if (count.value < 1 || start >= wire.length) return fail();
  const signatures = Array.from({ length: count.value },
    (_, index) => wire.slice(count.next + index * SIGNATURE_BYTES, count.next + (index + 1) * SIGNATURE_BYTES));
  const message = wire.slice(start);
  if (parseLegacyMessage(message).header.numRequiredSignatures !== count.value) return fail();
  return Object.freeze({ signatures: Object.freeze(signatures), message });
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** RFC 4648 standard base64 with padding (the inverse of codec.ts `decodeBase64`). */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index]! << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const left = bytes.length - index;
    out += BASE64[(chunk >> 18) & 63]! + BASE64[(chunk >> 12) & 63]! +
      (left > 1 ? BASE64[(chunk >> 6) & 63]! : '=') + (left > 2 ? BASE64[chunk & 63]! : '=');
  }
  return out;
}
