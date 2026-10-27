/** G12 encrypted private journal format. Structural validity is never chain or wallet authority. */
import { parseTradeBinding, type TradeBinding } from './core.ts';
import { decodeBase64url, encodeBase64url, MAX_PAYLOAD_BYTES, ValidationError } from './vault.ts';
export const MAX_PREPARED_REQUEST_BYTES = 65_536;
export type IntentState = 'prepared' | 'broadcast-unknown' | 'pending' | 'confirmed' | 'finalized' | 'failed' | 'reorged' | 'expired' | 'replaced';
export interface IntentV1 {
  readonly version: 1; readonly intentId: string; readonly binding: TradeBinding; readonly account: string;
  readonly action: 'approve' | 'fund' | 'release' | 'refund'; readonly state: IntentState;
  readonly walletGeneration: number; readonly expectedEscrowState: 'absent' | 'funded'; readonly preparedRequest: string;
  readonly submission: { readonly chain: 'evm'; readonly hash: string | null; readonly nonce: string | null } |
    { readonly chain: 'solana'; readonly signature: string | null; readonly blockhash: string; readonly lastValidBlockHeight: string };
  readonly replacementOf: string | null; readonly createdAt: number; readonly updatedAt: number;
}
export class IntentSchemaError extends Error {
  readonly code: 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'LIMIT_EXCEEDED';
  constructor(code: IntentSchemaError['code'] = 'INVALID_INPUT') { super('Invalid private intent data.'); this.name = 'IntentSchemaError'; this.code = code; }
}
function fail(code?: IntentSchemaError['code']): never { throw new IntentSchemaError(code); }
export function intentData(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const prototype: unknown = Object.getPrototypeOf(input); if (prototype !== Object.prototype && prototype !== null) return fail();
    const actual = Reflect.ownKeys(input); if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) return fail();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(input, key); if (!descriptor || !('value' in descriptor)) return fail(); result[key] = descriptor.value; }
    return result;
  } catch { return fail(); }
}
function counter(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return fail(); return value; }
function choice<T extends string>(value: unknown, allowed: readonly T[]): T { if (typeof value !== 'string' || !allowed.includes(value as T)) return fail(); return value as T; }
function decimal(value: unknown): string { if (typeof value !== 'string' || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value)) return fail(); return value; }
function base58(value: unknown, minimum: number, maximum: number): string { if (typeof value !== 'string' || value.length < minimum || value.length > maximum || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) return fail(); return value; }
export function parseIntentId(value: unknown): string { let bytes: Uint8Array | undefined; try { bytes = decodeBase64url(value, 32, 32); return value as string; } catch { return fail(); } finally { bytes?.fill(0); } }
export function parseIntentAccount(value: unknown, chain: TradeBinding['chain']): string {
  if (chain === 'solana') return base58(value, 32, 44);
  if (chain !== 'evm' || typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) return fail(); return value;
}
function preparedRequest(value: unknown): string {
  if (typeof value !== 'string') return fail();
  if (value.length > MAX_PREPARED_REQUEST_BYTES) return fail('LIMIT_EXCEEDED');
  if (!value.length) return fail();
  for (let index = 0; index < value.length; index++) { const code = value.charCodeAt(index); if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) return fail(); } else if (code >= 0xdc00 && code <= 0xdfff) return fail(); }
  const bytes = new TextEncoder().encode(value); try { if (bytes.length > MAX_PREPARED_REQUEST_BYTES) return fail('LIMIT_EXCEEDED'); } finally { bytes.fill(0); } return value;
}
export function parseIntent(input: unknown): IntentV1 {
  const raw = intentData(input, ['version', 'intentId', 'binding', 'account', 'action', 'state', 'walletGeneration', 'expectedEscrowState', 'preparedRequest', 'submission', 'replacementOf', 'createdAt', 'updatedAt']);
  if (raw.version !== 1) return fail('UNSUPPORTED_VERSION');
  let binding: TradeBinding;
  try { binding = parseTradeBinding(raw.binding); } catch { return fail(); }
  let chain: unknown;
  try { const descriptor = Object.getOwnPropertyDescriptor(raw.submission, 'chain'); if (!descriptor || !('value' in descriptor)) return fail(); chain = descriptor.value; }
  catch { return fail(); }
  let submission: IntentV1['submission'];
  if (chain === 'evm' && binding.chain === 'evm') {
    const value = intentData(raw.submission, ['chain', 'hash', 'nonce']);
    if (value.hash !== null && (typeof value.hash !== 'string' || !/^0x[0-9a-f]{64}$/.test(value.hash))) return fail();
    submission = Object.freeze({ chain, hash: value.hash as string | null, nonce: value.nonce === null ? null : decimal(value.nonce) });
  } else if (chain === 'solana' && binding.chain === 'solana') {
    const value = intentData(raw.submission, ['chain', 'signature', 'blockhash', 'lastValidBlockHeight']);
    submission = Object.freeze({ chain, signature: value.signature === null ? null : base58(value.signature, 64, 88), blockhash: base58(value.blockhash, 32, 44), lastValidBlockHeight: decimal(value.lastValidBlockHeight) });
  } else return fail();
  return Object.freeze({ version: 1, intentId: parseIntentId(raw.intentId), binding, account: parseIntentAccount(raw.account, binding.chain), action: choice(raw.action, ['approve', 'fund', 'release', 'refund']), state: choice(raw.state, ['prepared', 'broadcast-unknown', 'pending', 'confirmed', 'finalized', 'failed', 'reorged', 'expired', 'replaced']), walletGeneration: counter(raw.walletGeneration), expectedEscrowState: choice(raw.expectedEscrowState, ['absent', 'funded']), preparedRequest: preparedRequest(raw.preparedRequest), submission, replacementOf: raw.replacementOf === null ? null : parseIntentId(raw.replacementOf), createdAt: counter(raw.createdAt), updatedAt: counter(raw.updatedAt) });
}
export function encodeIntentPayload(input: IntentV1): string {
  const bytes = new TextEncoder().encode(JSON.stringify(parseIntent(input)));
  try { if (bytes.length > MAX_PAYLOAD_BYTES) return fail('LIMIT_EXCEEDED'); return encodeBase64url(bytes); } finally { bytes.fill(0); }
}
export function decodeIntentPayload(input: unknown): IntentV1 {
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(input, 1, MAX_PAYLOAD_BYTES);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const parsed = parseIntent(JSON.parse(text) as unknown);
    if (JSON.stringify(parsed) !== text) return fail();
    return parsed;
  } catch (error) {
    // Foreign throws can themselves trap during instanceof or code access.
    // Recreate a fixed local error rather than rethrowing an inspected object.
    let code: IntentSchemaError['code'] = 'INVALID_INPUT';
    try {
      if (error instanceof IntentSchemaError || error instanceof ValidationError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
        if (descriptor && 'value' in descriptor && (descriptor.value === 'INVALID_INPUT' || descriptor.value === 'UNSUPPORTED_VERSION' || descriptor.value === 'LIMIT_EXCEEDED')) code = descriptor.value;
      }
    } catch { /* Classification failure remains invalid input, without foreign diagnostics. */ }
    return fail(code);
  }
  finally { bytes?.fill(0); }
}
