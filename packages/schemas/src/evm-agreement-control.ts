/** Private strict SCHEMA for tiny EVM agreement host control frames (request, ack, closed). Structural parsing only:
 * an ack or closed frame is a structural CLAIM, never authentication, physical settlement or Worker-replacement
 * authority. Request IDs and generations are validated integers; the future adapter owns correlation and replay.
 * Synchronous, stateless, no timers/RNG/crypto/storage/network. Failures are always a fresh fixed CoreSchemaError;
 * foreign errors thrown by hostile meta traps are discarded uninspected. Not exported by any package facade.
 */
import { CoreSchemaError } from './core.ts';
import { MAX_RUNTIME_SEQUENCE } from './runtime.ts';

export type EvmAgreementControlOperation = 'invalidateEvmAgreement' | 'disposeEvmAgreementHost';
export interface EvmAgreementControlRequest {
  readonly version: 1; readonly requestId: number; readonly generation: number;
  readonly operation: EvmAgreementControlOperation; readonly kind: 'control';
}
export type EvmAgreementControlAckResult =
  | Readonly<{ ok: true; value: Readonly<{ held: boolean }> }>
  | Readonly<{ ok: false; error: Readonly<{ code: 'CONFLICT' | 'INVALID_INPUT' }> }>;
export interface EvmAgreementControlAck {
  readonly version: 1; readonly requestId: number; readonly generation: number;
  readonly operation: EvmAgreementControlOperation; readonly kind: 'ack';
  readonly result: EvmAgreementControlAckResult;
}
export interface EvmAgreementHostClosed {
  readonly version: 1; readonly generation: number; readonly kind: 'closed';
  readonly reason: 'TIMEOUT' | 'LIMIT_EXCEEDED' | 'INVALID_INPUT' | 'DISPOSED';
}

const OPERATIONS: readonly string[] = ['invalidateEvmAgreement', 'disposeEvmAgreementHost'];
const REASONS: readonly string[] = ['TIMEOUT', 'LIMIT_EXCEEDED', 'INVALID_INPUT', 'DISPOSED'];
const ACK_CODES: readonly string[] = ['CONFLICT', 'INVALID_INPUT'];
const ownKeys = Reflect.ownKeys, getDesc = Object.getOwnPropertyDescriptor, getProto = Object.getPrototypeOf, isArr = Array.isArray;

const fail = (): never => { throw new CoreSchemaError('INVALID_INPUT'); };
/** Untrusted meta-operation boundary: whatever a hostile trap throws is discarded uninspected. */
function meta<T>(read: () => T): T {
  try { return read(); } catch { return fail(); }
}
/** Exact-field plain/null-prototype data record; reads own enumerable data values only, never getters. */
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return fail();
  if (meta(() => isArr(input))) return fail();
  const proto = meta(() => getProto(input));
  if (proto !== Object.prototype && proto !== null) return fail();
  const actual = meta(() => ownKeys(input));
  if (actual.length !== keys.length) return fail();
  for (const k of actual) if (typeof k !== 'string' || !keys.includes(k)) return fail();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const d = meta(() => getDesc(input, key));
    if (!d || !d.enumerable || !('value' in d)) return fail();
    out[key] = d.value;
  }
  return out;
}
function counter(v: unknown, min: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > MAX_RUNTIME_SEQUENCE) return fail();
  return v;
}
function operation(v: unknown): EvmAgreementControlOperation {
  if (typeof v !== 'string' || !OPERATIONS.includes(v)) return fail();
  return v as EvmAgreementControlOperation;
}

export function parseEvmAgreementControlRequest(input: unknown): Readonly<EvmAgreementControlRequest> {
  const r = exact(input, ['version', 'requestId', 'generation', 'operation', 'kind']);
  if (r.version !== 1 || r.kind !== 'control') return fail();
  const op = operation(r.operation);
  const requestId = counter(r.requestId, 1), generation = counter(r.generation, 0);
  return Object.freeze({ version: 1 as const, requestId, generation, operation: op, kind: 'control' as const });
}

function ackResult(input: unknown): EvmAgreementControlAckResult {
  if (typeof input !== 'object' || input === null || meta(() => isArr(input))) return fail();
  const ok = meta(() => {
    const d = getDesc(input, 'ok');
    return d && d.enumerable && 'value' in d ? d.value : undefined;
  });
  if (ok === true) {
    const r = exact(input, ['ok', 'value']);
    if (r.ok !== true) return fail();
    const v = exact(r.value, ['held']);
    if (typeof v.held !== 'boolean') return fail();
    return Object.freeze({ ok: true as const, value: Object.freeze({ held: v.held }) });
  }
  if (ok === false) {
    const r = exact(input, ['ok', 'error']);
    if (r.ok !== false) return fail();
    const e = exact(r.error, ['code']);
    if (typeof e.code !== 'string' || !ACK_CODES.includes(e.code)) return fail();
    return Object.freeze({ ok: false as const, error: Object.freeze({ code: e.code as 'CONFLICT' | 'INVALID_INPUT' }) });
  }
  return fail();
}

export function parseEvmAgreementControlAck(input: unknown): Readonly<EvmAgreementControlAck> {
  const r = exact(input, ['version', 'requestId', 'generation', 'operation', 'kind', 'result']);
  if (r.version !== 1 || r.kind !== 'ack') return fail();
  const op = operation(r.operation);
  const requestId = counter(r.requestId, 1), generation = counter(r.generation, 0);
  return Object.freeze({ version: 1 as const, requestId, generation, operation: op, kind: 'ack' as const, result: ackResult(r.result) });
}

export function parseEvmAgreementHostClosed(input: unknown): Readonly<EvmAgreementHostClosed> {
  const r = exact(input, ['version', 'generation', 'kind', 'reason']);
  if (r.version !== 1 || r.kind !== 'closed') return fail();
  if (typeof r.reason !== 'string' || !REASONS.includes(r.reason)) return fail();
  const generation = counter(r.generation, 0);
  return Object.freeze({ version: 1 as const, generation, kind: 'closed' as const,
    reason: r.reason as EvmAgreementHostClosed['reason'] });
}
