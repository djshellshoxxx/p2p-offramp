/** Private strict request/reply SCHEMA for the in-memory EVM agreement consistency check. Structural parsing only:
 * it proves no signature, payment, chain state, trust or funding, and carries no authority. Header IDs are data;
 * the future host owns current request/generation, cancellation and job state. Synchronous, stateless, no timers.
 * Fixed outer arity (5 request / 6 reply fields); the body is delegated unchanged to parseEvmAgreementInput after the
 * whole header is accepted. Failures carry only a fixed core code, never foreign error objects or messages.
 * Caller must wipe the returned owned signature bytes. Not exported by any package facade.
 */
import { CoreSchemaError, type CoreErrorCode } from './core.ts';
import { MAX_RUNTIME_SEQUENCE } from './runtime.ts';
import { parseEvmAgreementInput, type EvmAgreementInputSnapshot } from './evm-agreement-input.ts';

export type EvmAgreementFailureCode = CoreErrorCode | 'BUSY';
export interface EvmAgreementCheckRequest {
  readonly version: 1; readonly requestId: number; readonly generation: number;
  readonly operation: 'checkEvmAgreement'; readonly input: Readonly<EvmAgreementInputSnapshot>;
}
export interface EvmAgreementCheckValue {
  readonly testOnly: true; readonly economicPreparationAllowed: false; readonly termsHash: string;
  readonly accounts: Readonly<{ readonly seller: string; readonly buyer: string }>;
}
export type EvmAgreementCheckResult =
  | Readonly<{ ok: true; value: Readonly<EvmAgreementCheckValue> }>
  | Readonly<{ ok: false; error: Readonly<{ code: EvmAgreementFailureCode }> }>;
export interface EvmAgreementCheckReply {
  readonly version: 1; readonly requestId: number; readonly generation: number;
  readonly operation: 'checkEvmAgreement'; readonly kind: 'response'; readonly result: EvmAgreementCheckResult;
}

const FAILURE_CODES: readonly string[] = ['INVALID_INPUT', 'UNSUPPORTED_VERSION', 'UNSUPPORTED_PROVIDER', 'WRONG_CHAIN', 'UNAUTHORIZED',
  'USER_REJECTED', 'LOCKED', 'CONFLICT', 'UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'LIMIT_EXCEEDED', 'INTEGRITY_FAILURE',
  'BROADCAST_UNKNOWN', 'EXPIRED', 'BUSY'];
const HEX64 = /^[0-9a-f]{64}$/, ADDR = /^0x[0-9a-f]{40}$/, ZERO = /^0x0{40}$/;
const ownKeys = Reflect.ownKeys, getDesc = Object.getOwnPropertyDescriptor, getProto = Object.getPrototypeOf, isArr = Array.isArray;

const fail = (): never => { throw new CoreSchemaError('INVALID_INPUT'); };
/** Untrusted meta-operation boundary: whatever a hostile trap throws is discarded uninspected. */
function meta<T>(read: () => T): T {
  try { return read(); } catch { return fail(); }
}
/** Exact-field plain/null-prototype data record. Returns the own data values only (no copy of nested graphs). */
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return fail();
  const arr = meta(() => isArr(input));
  if (arr) return fail();
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

/** Header (version/ids/operation) is fully validated BEFORE the body is read, copied or parsed. */
export function parseEvmAgreementCheckRequest(input: unknown): Readonly<EvmAgreementCheckRequest> {
  const r = exact(input, ['version', 'requestId', 'generation', 'operation', 'input']);
  if (r.version !== 1 || r.operation !== 'checkEvmAgreement') return fail();
  const requestId = counter(r.requestId, 1), generation = counter(r.generation, 0);
  const snapshot = parseEvmAgreementInput(r.input);
  return Object.freeze({ version: 1 as const, requestId, generation, operation: 'checkEvmAgreement' as const, input: snapshot });
}

function failureCode(v: unknown): EvmAgreementFailureCode {
  if (typeof v !== 'string' || !FAILURE_CODES.includes(v)) return fail();
  return v as EvmAgreementFailureCode;
}
function result(input: unknown): EvmAgreementCheckResult {
  if (typeof input !== 'object' || input === null || meta(() => isArr(input))) return fail();
  const ok = meta(() => {
    const d = getDesc(input, 'ok');
    return d && d.enumerable && 'value' in d ? d.value : undefined;
  });
  if (ok === true) {
    const r = exact(input, ['ok', 'value']);
    if (r.ok !== true) return fail();
    const v = exact(r.value, ['testOnly', 'economicPreparationAllowed', 'termsHash', 'accounts']);
    if (v.testOnly !== true || v.economicPreparationAllowed !== false) return fail();
    if (typeof v.termsHash !== 'string' || !HEX64.test(v.termsHash)) return fail();
    const a = exact(v.accounts, ['seller', 'buyer']);
    const seller = a.seller, buyer = a.buyer;
    if (typeof seller !== 'string' || typeof buyer !== 'string' || !ADDR.test(seller) || !ADDR.test(buyer) ||
        ZERO.test(seller) || ZERO.test(buyer) || seller === buyer) return fail();
    return Object.freeze({ ok: true as const, value: Object.freeze({ testOnly: true as const, economicPreparationAllowed: false as const,
      termsHash: v.termsHash, accounts: Object.freeze({ seller, buyer }) }) });
  }
  if (ok === false) {
    const r = exact(input, ['ok', 'error']);
    if (r.ok !== false) return fail();
    const e = exact(r.error, ['code']);
    return Object.freeze({ ok: false as const, error: Object.freeze({ code: failureCode(e.code) }) });
  }
  return fail();
}

export function parseEvmAgreementCheckReply(input: unknown): Readonly<EvmAgreementCheckReply> {
  const r = exact(input, ['version', 'requestId', 'generation', 'operation', 'kind', 'result']);
  if (r.version !== 1 || r.operation !== 'checkEvmAgreement' || r.kind !== 'response') return fail();
  const requestId = counter(r.requestId, 1), generation = counter(r.generation, 0);
  return Object.freeze({ version: 1 as const, requestId, generation, operation: 'checkEvmAgreement' as const,
    kind: 'response' as const, result: result(r.result) });
}
