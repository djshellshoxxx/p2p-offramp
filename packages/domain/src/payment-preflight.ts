/** Private fixture evaluator for the existing funded-trade payment-guidance contract.
 * Decoded values, finality, identity and clock provenance are fixture assertions, never authentication.
 * Expected hash/term consistency and acceptance signatures require separate verification.
 * No RPC/ABI decoder, registry approval, app export, wallet or submission capability exists here.
 */
import { CoreSchemaError, intentData, parseTradeBinding, sameBinding, type TradeBinding, type CoreResult, type CoreErrorCode } from '../../schemas/index.ts';
import { DISPLAY_MAX_AGE_MS } from './authority.ts';
import { createCoreError, createOperationId, normalizeError } from './errors.ts';

export const PAYMENT_GUIDANCE_BUFFER_SECONDS = 900n;
const U64 = (1n << 64n) - 1n, U256 = (1n << 256n) - 1n;
const TRADE_FIELDS = ['termsHash', 'seller', 'buyer', 'asset', 'amountBaseUnits', 'expiry'] as const;
const IDENTITY_FIELDS = ['binding', 'chainId', 'verifyingContract'] as const;
interface TradeTerms { readonly termsHash: string; readonly seller: string; readonly buyer: string; readonly asset: string; readonly amountBaseUnits: string; readonly expiry: string; }
export interface FixturePaymentPreflight {
  readonly evidence: 'fixture-only'; readonly economicPreparationAllowed: false;
  readonly binding: TradeBinding; readonly termsHash: string; readonly finalizedAnchor: string;
  readonly checkedChainTime: string; readonly expiry: string; readonly remainingSeconds: string;
  readonly decision: 'allow-guidance' | 'block';
  readonly reason: 'ok' | 'unfunded' | 'stale' | 'mismatch' | 'near-expiry' | 'unknown';
}
const invalid = (): never => { throw new CoreSchemaError(); };
function unsigned(input: unknown, maximum: bigint, positive = false): string {
  if (typeof input !== 'string') return invalid();
  if (input.length > 78) throw new CoreSchemaError('LIMIT_EXCEEDED');
  if (!/^(0|[1-9][0-9]*)$/.test(input)) return invalid();
  const value = BigInt(input);
  if (value > maximum || positive && value === 0n) return invalid();
  return input;
}
function hex(input: unknown, bytes: number, prefix = true): string {
  if (typeof input !== 'string') return invalid();
  const length = bytes * 2 + (prefix ? 2 : 0);
  if (input.length > length) throw new CoreSchemaError('LIMIT_EXCEEDED');
  if (input.length !== length || !(prefix ? /^0x[0-9a-fA-F]+$/ : /^[0-9a-f]+$/).test(input)) return invalid();
  return input.toLowerCase();
}
function clock(input: unknown, integer = false): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > Number.MAX_SAFE_INTEGER || integer && !Number.isSafeInteger(input)) return invalid();
  return input;
}
function choice<T extends string>(input: unknown, choices: readonly T[]): T {
  if (typeof input !== 'string' || !choices.includes(input as T)) return invalid();
  return input as T;
}
function terms(data: Record<string, unknown>): TradeTerms {
  return Object.freeze({ termsHash: hex(data.termsHash, 32, false), seller: hex(data.seller, 20), buyer: hex(data.buyer, 20),
    asset: hex(data.asset, 20), amountBaseUnits: unsigned(data.amountBaseUnits, U256), expiry: unsigned(data.expiry, U64) });
}

/** Missing/contradictory native evidence returns a fixed error, with no fabricated canonical preflight fields.
 * An ok result still grants only fixture guidance. Production evidence requires separately reviewed adapters.
 */
export function evaluatePaymentPreflightFixture(input: unknown): CoreResult<Readonly<FixturePaymentPreflight>> {
  const operationId = createOperationId();
  const failure = (code: CoreErrorCode): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: true }) });
  try {
    const raw = intentData(input, ['expected', 'observation', 'timing']);
    const expected = intentData(raw.expected, [...IDENTITY_FIELDS, ...TRADE_FIELDS]);
    const binding = parseTradeBinding(expected.binding), chainId = unsigned(expected.chainId, U256, true);
    const contract = hex(expected.verifyingContract, 20), wanted = terms(expected);
    const zero = '0x' + '0'.repeat(40);
    if (binding.chain !== 'evm') return failure('UNSUPPORTED_PROVIDER');
    if (contract === zero || wanted.seller === zero || wanted.buyer === zero || wanted.seller === wanted.buyer || wanted.amountBaseUnits === '0' || wanted.expiry === '0') return invalid();
    const timing = intentData(raw.timing, ['readStartedMonotonicMs', 'nowMonotonicMs', 'readGeneration', 'currentGeneration']);
    const started = clock(timing.readStartedMonotonicMs), now = clock(timing.nowMonotonicMs);
    const readGeneration = clock(timing.readGeneration, true), currentGeneration = clock(timing.currentGeneration, true);
    if (raw.observation === null) return failure('UNAVAILABLE');
    const observed = intentData(raw.observation, [...IDENTITY_FIELDS, 'anchor', 'chainTime', 'finality', 'chainHealth', 'state', 'trade']);
    const observedBinding = parseTradeBinding(observed.binding), observedChainId = unsigned(observed.chainId, U256, true);
    const observedContract = hex(observed.verifyingContract, 20);
    const anchor = intentData(observed.anchor, ['hash', 'height']);
    const anchorHash = hex(anchor.hash, 32), anchorHeight = unsigned(anchor.height, U256);
    const finality = choice(observed.finality, ['pending', 'confirmed', 'finalized']);
    const health = choice(observed.chainHealth, ['loading', 'fresh', 'stale', 'unavailable', 'reorged']);
    const state = choice(observed.state, ['absent', 'funded', 'released', 'refunded']);
    const stored = observed.trade === null ? null : terms(intentData(observed.trade, TRADE_FIELDS));
    if (health === 'reorged') return failure('INTEGRITY_FAILURE');
    if (health === 'loading' || health === 'unavailable' || finality !== 'finalized' || observed.chainTime === null) return failure('UNAVAILABLE');
    const time = intentData(observed.chainTime, ['anchorHash', 'anchorHeight', 'seconds']);
    const timeHash = hex(time.anchorHash, 32), timeHeight = unsigned(time.anchorHeight, U256), seconds = unsigned(time.seconds, U64);
    if (timeHash !== anchorHash || timeHeight !== anchorHeight) return failure('INTEGRITY_FAILURE');
    if (state === 'funded' && stored === null) return failure('UNAVAILABLE');
    const remaining = BigInt(wanted.expiry) - BigInt(seconds);
    const finish = (reason: FixturePaymentPreflight['reason']): CoreResult<Readonly<FixturePaymentPreflight>> => ({ ok: true, value: Object.freeze({
      evidence: 'fixture-only', economicPreparationAllowed: false, binding, termsHash: wanted.termsHash,
      finalizedAnchor: anchorHash, checkedChainTime: seconds, expiry: wanted.expiry, remainingSeconds: remaining.toString(),
      decision: reason === 'ok' ? 'allow-guidance' : 'block', reason }) });
    if (!sameBinding(binding, observedBinding) || chainId !== observedChainId || contract !== observedContract || stored !== null && TRADE_FIELDS.some(field => wanted[field] !== stored[field])) return finish('mismatch');
    if (state !== 'funded') return finish('unfunded');
    if (health === 'stale' || readGeneration !== currentGeneration || now < started || now - started >= DISPLAY_MAX_AGE_MS) return finish('stale');
    return finish(remaining <= PAYMENT_GUIDANCE_BUFFER_SECONDS ? 'near-expiry' : 'ok');
  } catch (error) { return { ok: false, error: normalizeError(error, { operationId, phase: 'read' }) }; }
}
