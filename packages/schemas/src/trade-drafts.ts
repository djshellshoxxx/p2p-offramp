/** Local reusable inputs only. This format contains no accepted agreement or spending authority. */
import { intentData } from './intent.ts';
import { decodeBase64url, encodeBase64url, ValidationError } from './vault.ts';
import { parseStrictJsonBytes } from './registry.ts';

export const TRADE_DRAFT_LIBRARY_FORMAT = 'p2p-offramp/local-trade-drafts/v1';
export const TRADE_DRAFT_SCHEMA_VERSION = 1;
export const TRADE_DRAFT_RECORD_ID = '7032702d64726166742d763100000000';
export const MAX_TRADE_TEMPLATES = 8;
export const MAX_TRADE_DRAFT_LIBRARY_BYTES = 8192;
export const MAX_DRAFT_INSTRUCTIONS_BYTES = 4096;
export interface TradeDraftDefaultsV1 {
  readonly networkId: string; readonly deploymentId: string; readonly assetId: string;
  readonly amountBaseUnits: string; readonly fiatCurrency: string; readonly fiatMinorUnits: string; readonly fiatScale: number;
}
export interface TradeDraftInputV1 extends TradeDraftDefaultsV1 {
  readonly seller: string; readonly buyer: string; readonly paymentInstructions: string;
  readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
}
export interface TradeDraftLibraryV1 {
  readonly format: typeof TRADE_DRAFT_LIBRARY_FORMAT; readonly version: 1;
  readonly templates: readonly { readonly slot: number; readonly defaults: TradeDraftDefaultsV1 }[];
  readonly repeatDefaultSlot: number | null;
}
export type TradeDraftChangeV1 =
  { readonly kind: 'put-template'; readonly slot: number; readonly defaults: TradeDraftDefaultsV1 } |
  { readonly kind: 'remove-template'; readonly slot: number } |
  { readonly kind: 'set-repeat-default'; readonly slot: number | null };

const DEFAULT_KEYS = ['networkId', 'deploymentId', 'assetId', 'amountBaseUnits', 'fiatCurrency', 'fiatMinorUnits', 'fiatScale'];
const INPUT_KEYS = [...DEFAULT_KEYS, 'seller', 'buyer', 'paymentInstructions', 'acceptBeforeSeconds', 'escrowExpirySeconds'];
const U64 = (1n << 64n) - 1n, U128 = (1n << 128n) - 1n, U256 = (1n << 256n) - 1n;
const fail = (code: ValidationError['code'] = 'INVALID_INPUT'): never => { throw new ValidationError(code); };
function owns(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try { return intentData(input, keys); } catch { return fail(); }
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value) || value.includes('..')) return fail();
  return value;
}
function uint(value: unknown, maximum: bigint, minimum = 1n): string {
  if (typeof value !== 'string' || value.length > maximum.toString().length || !/^(0|[1-9][0-9]*)$/.test(value)) return fail();
  const number = BigInt(value); if (number < minimum || number > maximum) return fail(); return value;
}
function slot(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= MAX_TRADE_TEMPLATES) return fail(); return value;
}
function defaults(raw: Record<string, unknown>): TradeDraftDefaultsV1 {
  if (typeof raw.fiatCurrency !== 'string' || !/^[A-Z]{3}$/.test(raw.fiatCurrency) ||
      typeof raw.fiatScale !== 'number' || !Number.isInteger(raw.fiatScale) || raw.fiatScale < 0 || raw.fiatScale > 6) return fail();
  return Object.freeze({ networkId: id(raw.networkId), deploymentId: id(raw.deploymentId), assetId: id(raw.assetId),
    amountBaseUnits: uint(raw.amountBaseUnits, U256), fiatCurrency: raw.fiatCurrency,
    fiatMinorUnits: uint(raw.fiatMinorUnits, U128), fiatScale: raw.fiatScale });
}
export function parseTradeDraftDefaults(input: unknown): TradeDraftDefaultsV1 { return defaults(owns(input, DEFAULT_KEYS)); }
export function parseTradeDraftInput(input: unknown): TradeDraftInputV1 {
  const raw = owns(input, INPUT_KEYS), values = defaults(raw);
  for (const account of [raw.seller, raw.buyer]) if (typeof account !== 'string' || !/^0x[0-9a-f]{40}$/.test(account) || /^0x0{40}$/.test(account)) return fail();
  if (raw.seller === raw.buyer || typeof raw.paymentInstructions !== 'string') return fail();
  const text = raw.paymentInstructions;
  if (text.length > MAX_DRAFT_INSTRUCTIONS_BYTES) return fail('LIMIT_EXCEEDED');
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)) return fail();
  const bytes = new TextEncoder().encode(text);
  try { if (bytes.length > MAX_DRAFT_INSTRUCTIONS_BYTES) return fail('LIMIT_EXCEEDED'); } finally { bytes.fill(0); }
  return Object.freeze({ ...values, seller: raw.seller as string, buyer: raw.buyer as string, paymentInstructions: text,
    acceptBeforeSeconds: uint(raw.acceptBeforeSeconds, U64, 0n), escrowExpirySeconds: uint(raw.escrowExpirySeconds, U64, 0n) });
}
export function parseTradeDraftLibrary(input: unknown): TradeDraftLibraryV1 {
  const raw = owns(input, ['format', 'version', 'templates', 'repeatDefaultSlot']);
  if (raw.format !== TRADE_DRAFT_LIBRARY_FORMAT || raw.version !== 1) return fail('UNSUPPORTED_VERSION');
  const items = raw.templates;
  try {
    if (!Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype) return fail();
    const length = Object.getOwnPropertyDescriptor(items, 'length')?.value as unknown;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return fail();
    if (length > MAX_TRADE_TEMPLATES) return fail('LIMIT_EXCEEDED');
    if (Reflect.ownKeys(items).length !== length + 1) return fail();
    const templates: { readonly slot: number; readonly defaults: TradeDraftDefaultsV1 }[] = [];
    let previous = -1;
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(items, String(index)); if (!descriptor || !('value' in descriptor)) return fail();
      const entry = owns(descriptor.value, ['slot', 'defaults']), next = slot(entry.slot);
      if (next <= previous) return fail(); previous = next;
      templates.push(Object.freeze({ slot: next, defaults: parseTradeDraftDefaults(entry.defaults) }));
    }
    const repeatDefaultSlot = raw.repeatDefaultSlot === null ? null : slot(raw.repeatDefaultSlot);
    if (repeatDefaultSlot !== null && !templates.some(entry => entry.slot === repeatDefaultSlot)) return fail();
    return Object.freeze({ format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: Object.freeze(templates), repeatDefaultSlot });
  } catch (error) {
    let code: ValidationError['code'] = 'INVALID_INPUT';
    try {
      if (error instanceof ValidationError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
        if (descriptor && 'value' in descriptor && ['INVALID_INPUT', 'LIMIT_EXCEEDED', 'UNSUPPORTED_VERSION'].includes(descriptor.value)) code = descriptor.value;
      }
    } catch { /* Foreign reflection cannot replace a fixed schema refusal. */ }
    return fail(code);
  }
}
export function parseTradeDraftChange(input: unknown): TradeDraftChangeV1 {
  let kind: unknown;
  try { const descriptor = Object.getOwnPropertyDescriptor(input, 'kind'); if (!descriptor || !('value' in descriptor)) return fail(); kind = descriptor.value; } catch { return fail(); }
  if (kind === 'put-template') { const raw = owns(input, ['kind', 'slot', 'defaults']); return Object.freeze({ kind, slot: slot(raw.slot), defaults: parseTradeDraftDefaults(raw.defaults) }); }
  if (kind === 'remove-template') { const raw = owns(input, ['kind', 'slot']); return Object.freeze({ kind, slot: slot(raw.slot) }); }
  if (kind === 'set-repeat-default') { const raw = owns(input, ['kind', 'slot']); return Object.freeze({ kind, slot: raw.slot === null ? null : slot(raw.slot) }); }
  return fail();
}
export function encodeTradeDraftLibraryPayload(input: unknown): string {
  const library = parseTradeDraftLibrary(input), bytes = new TextEncoder().encode(JSON.stringify(library));
  try { if (bytes.length > MAX_TRADE_DRAFT_LIBRARY_BYTES) return fail('LIMIT_EXCEEDED'); return encodeBase64url(bytes); } finally { bytes.fill(0); }
}
export function decodeTradeDraftLibraryPayload(payload: unknown, schemaVersion: unknown): TradeDraftLibraryV1 {
  if (schemaVersion !== TRADE_DRAFT_SCHEMA_VERSION) return fail('UNSUPPORTED_VERSION');
  const bytes = decodeBase64url(payload, 1, MAX_TRADE_DRAFT_LIBRARY_BYTES);
  try {
    const library = parseTradeDraftLibrary(parseStrictJsonBytes(bytes, MAX_TRADE_DRAFT_LIBRARY_BYTES));
    if (encodeTradeDraftLibraryPayload(library) !== payload) return fail(); return library;
  } finally { bytes.fill(0); }
}
