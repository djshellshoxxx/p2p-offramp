/** CTX01/CTX02/G08/G13 structural contracts. Parsing is not adapter/deployment authentication. */
import { decodeBase64url } from './vault.ts';

export const MAX_OBSERVATION_BYTES = 65_536;
export type ChainFamily = 'evm' | 'solana';
export interface TradeBinding { readonly chain: ChainFamily; readonly networkId: string; readonly deploymentId: string; readonly tradeId: string; }
export interface ChainObservation {
  readonly binding: TradeBinding;
  readonly generation: number;
  readonly requestSequence: number;
  readonly anchor: { readonly height: string; readonly hash: string };
  readonly state: 'absent' | 'funded' | 'released' | 'refunded';
  readonly finality: 'pending' | 'confirmed' | 'finalized';
  readonly observedAt: number;
}
export interface TradeView {
  readonly binding: TradeBinding;
  readonly chain: ChainObservation | null;
  readonly chainHealth: 'loading' | 'fresh' | 'stale' | 'unavailable' | 'reorged';
  readonly pendingIntentIds: readonly string[];
  readonly fiatClaim: 'none' | 'buyer-claims-paid' | 'seller-attests-received';
  readonly walletGeneration: number;
}
export type RecoveryAction = 'none' | 'edit-input' | 'unlock' | 'reconnect' | 'reload' | 'reconcile' | 'export' | 'change-provider';
export type CoreErrorCode = 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'UNSUPPORTED_PROVIDER' | 'WRONG_CHAIN' | 'UNAUTHORIZED' | 'USER_REJECTED' | 'LOCKED' | 'CONFLICT' | 'UNAVAILABLE' | 'TIMEOUT' | 'CANCELLED' | 'LIMIT_EXCEEDED' | 'INTEGRITY_FAILURE' | 'BROADCAST_UNKNOWN' | 'EXPIRED';
export interface CoreError { readonly code: CoreErrorCode; readonly retryable: boolean; readonly action: RecoveryAction; readonly correlationId: string; readonly messageKey: string; }
export type CoreResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CoreError };
interface EnvelopeBase {
  readonly version: 1; readonly eventId: string; readonly binding: TradeBinding;
  readonly generation: number; readonly sequence: number; readonly observedAt: number;
}
/** Relay/journal payloads stay unsupported here until their native schemas and authority adapters exist. */
export type ObservationEnvelope =
  | (EnvelopeBase & { readonly source: 'chain'; readonly kind: 'chain-snapshot'; readonly data: ChainObservation })
  | (EnvelopeBase & { readonly source: 'wallet'; readonly kind: 'wallet-invalidated'; readonly data: { readonly walletGeneration: number } });
export class CoreSchemaError extends Error {
  readonly code: 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'LIMIT_EXCEEDED';
  constructor(code: 'INVALID_INPUT' | 'UNSUPPORTED_VERSION' | 'LIMIT_EXCEEDED' = 'INVALID_INPUT') {
    super('Invalid core data.'); this.name = 'CoreSchemaError'; this.code = code;
  }
}
function fail(code: CoreSchemaError['code'] = 'INVALID_INPUT'): never { throw new CoreSchemaError(code); }
function reflect<T>(read: () => T): T { try { return read(); } catch { return fail(); } }
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || reflect(() => Array.isArray(input))) fail();
  const prototype: unknown = reflect(() => Object.getPrototypeOf(input));
  if (prototype !== Object.prototype && prototype !== null) fail();
  const actual = reflect(() => Reflect.ownKeys(input));
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) fail();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = reflect(() => Object.getOwnPropertyDescriptor(input, key));
    if (!descriptor || !('value' in descriptor)) fail();
    out[key] = descriptor.value;
  }
  return out;
}
function integer(input: unknown): number { if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) fail(); return input; }
function text(input: unknown, max = 256): string {
  if (typeof input !== 'string') fail();
  if (input.length > max) fail('LIMIT_EXCEEDED');
  if (input.length === 0 || !/^[A-Za-z0-9._:~-]+$/.test(input)) fail();
  return input;
}
function choice<T extends string>(input: unknown, values: readonly T[]): T { if (typeof input !== 'string' || !values.includes(input as T)) fail(); return input as T; }
export function parseTradeBinding(input: unknown): TradeBinding {
  const raw = exact(input, ['chain', 'networkId', 'deploymentId', 'tradeId']);
  return Object.freeze({ chain: choice(raw.chain, ['evm', 'solana']), networkId: text(raw.networkId), deploymentId: text(raw.deploymentId), tradeId: text(raw.tradeId) });
}
export function sameBinding(a: TradeBinding, b: TradeBinding): boolean {
  return a.chain === b.chain && a.networkId === b.networkId && a.deploymentId === b.deploymentId && a.tradeId === b.tradeId;
}
export function parseChainObservation(input: unknown): ChainObservation {
  const raw = exact(input, ['binding', 'generation', 'requestSequence', 'anchor', 'state', 'finality', 'observedAt']);
  const anchor = exact(raw.anchor, ['height', 'hash']);
  if (typeof anchor.height !== 'string') fail();
  if (anchor.height.length > 78) fail('LIMIT_EXCEEDED');
  if (!/^(0|[1-9][0-9]*)$/.test(anchor.height)) fail();
  return Object.freeze({
    binding: parseTradeBinding(raw.binding), generation: integer(raw.generation), requestSequence: integer(raw.requestSequence),
    anchor: Object.freeze({ height: anchor.height, hash: text(anchor.hash) }),
    state: choice(raw.state, ['absent', 'funded', 'released', 'refunded']), finality: choice(raw.finality, ['pending', 'confirmed', 'finalized']), observedAt: integer(raw.observedAt),
  });
}
export function parseObservationEnvelope(input: unknown): ObservationEnvelope {
  const raw = exact(input, ['version', 'eventId', 'binding', 'source', 'kind', 'generation', 'sequence', 'observedAt', 'data']);
  if (raw.version !== 1) fail('UNSUPPORTED_VERSION');
  try { decodeBase64url(raw.eventId, 32, 32); } catch { fail(); }
  const base = { version: 1 as const, eventId: raw.eventId as string, binding: parseTradeBinding(raw.binding), generation: integer(raw.generation), sequence: integer(raw.sequence), observedAt: integer(raw.observedAt) };
  let result: ObservationEnvelope;
  if (raw.source === 'chain' && raw.kind === 'chain-snapshot') {
    const data = parseChainObservation(raw.data);
    if (!sameBinding(data.binding, base.binding) || data.generation !== base.generation || data.requestSequence !== base.sequence || data.observedAt !== base.observedAt) fail();
    result = Object.freeze({ ...base, source: 'chain', kind: 'chain-snapshot', data });
  } else if (raw.source === 'wallet' && raw.kind === 'wallet-invalidated') {
    const data = exact(raw.data, ['walletGeneration']);
    result = Object.freeze({ ...base, source: 'wallet', kind: 'wallet-invalidated', data: Object.freeze({ walletGeneration: integer(data.walletGeneration) }) });
  } else return fail();
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_OBSERVATION_BYTES) fail('LIMIT_EXCEEDED');
  return result;
}
export function parseObservationJson(input: unknown): ObservationEnvelope {
  if (typeof input !== 'string') fail();
  if (input.length > MAX_OBSERVATION_BYTES || new TextEncoder().encode(input).byteLength > MAX_OBSERVATION_BYTES) fail('LIMIT_EXCEEDED');
  let value: unknown;
  try { value = JSON.parse(input) as unknown; } catch { return fail(); }
  return parseObservationEnvelope(value);
}
