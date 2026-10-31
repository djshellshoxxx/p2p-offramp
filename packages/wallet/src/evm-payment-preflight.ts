/** Canonical BasicEscrow read-only G18 adapter, excluded from the shipped app.
 * The injected G11 lookup and RPC selection are trusted composition inputs; this
 * adapter authenticates neither a registry signer nor an RPC operator. It checks
 * the selected registry identity against native responses and never sends/signs.
 * A successful result reduces payment-guidance risk, not fiat or spend authority.
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { parseTradeBinding, type CoreErrorCode, type CoreResult, type DeploymentV1, type NetworkV1, type TradeBinding } from '../../schemas/index.ts';
import { buildGetTrade, buildTradeIdOf, decodeTrade, tradeMatchesTerms } from './evm-escrow.ts';
import { evmTermsHash, keccak256, snapshotEvmTerms, type EvmTermsInput } from './evm-terms.ts';
import type { Eip1193Request } from './evm-submit.ts';

export const NATIVE_PAYMENT_PREFLIGHT_LIMITS = Object.freeze({ freshnessMs: 30_000, paymentBufferSeconds: 900, maxRuntimeBytes: 24_576, defaultReadTimeoutMs: 10_000 });
export interface NativePaymentPreflight {
  readonly evidence: 'native-rpc'; readonly economicPreparationAllowed: false;
  readonly binding: TradeBinding; readonly termsHash: string; readonly finalizedAnchor: string;
  readonly checkedChainTime: string; readonly expiry: string; readonly remainingSeconds: string;
  readonly decision: 'allow-guidance' | 'block';
  readonly reason: 'ok' | 'unfunded' | 'stale' | 'mismatch' | 'near-expiry';
}
export interface EvmPaymentPreflightOptions {
  readonly registry: { network(id: string): NetworkV1 | null; deployment(networkId: string, deploymentId: string): DeploymentV1 | null };
  readonly binding: TradeBinding;
  /** Exact previously reviewed terms. Signature/peer acceptance remains a separate prerequisite. */
  readonly terms: EvmTermsInput;
  readonly request: Eip1193Request;
  readonly monotonicNow?: () => number;
  readonly readTimeoutMs?: number;
}
export interface EvmPaymentPreflight {
  /** Every new request hides previous guidance until the complete native read succeeds. No automatic retries. */
  read(signal?: AbortSignal): Promise<CoreResult<Readonly<NativePaymentPreflight>>>;
  /** Re-evaluates monotonic freshness; stale guidance cannot become fresh by moving the clock backwards. */
  view(): CoreResult<Readonly<NativePaymentPreflight>>;
  /** Call on browser resume, account/chain generation changes or another scope revocation. */
  invalidate(): void;
  dispose(): void;
}

const errors = new WeakMap<object, CoreErrorCode>();
class ReadFailure extends Error {
  constructor(code: CoreErrorCode) { super('Native payment guidance unavailable.'); errors.set(this, code); }
}
const stop = (code: CoreErrorCode): never => { throw new ReadFailure(code); };
const failed = (code: CoreErrorCode): CoreResult<never> => Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) });
const classify = (error: unknown, fallback: CoreErrorCode): CoreErrorCode =>
  typeof error === 'object' && error !== null ? errors.get(error) ?? fallback : fallback;
const HASH = /^0x[0-9a-f]{64}$/, DIGEST = /^[0-9a-f]{64}$/, ADDRESS = /^0x[0-9a-f]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
const ZERO = `0x${'0'.repeat(40)}`;
function field(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return stop('INTEGRITY_FAILURE');
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return stop('INTEGRITY_FAILURE');
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return stop('INTEGRITY_FAILURE');
    return descriptor.value;
  } catch { return stop('INTEGRITY_FAILURE'); }
}
function list(input: unknown, maximum: number): readonly unknown[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return stop('INTEGRITY_FAILURE');
    const size = Object.getOwnPropertyDescriptor(input, 'length')?.value;
    if (!Number.isSafeInteger(size) || size < 0 || size > maximum || Reflect.ownKeys(input).length !== size + 1) return stop('INTEGRITY_FAILURE');
    const copy: unknown[] = [];
    for (let index = 0; index < size; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !('value' in descriptor)) return stop('INTEGRITY_FAILURE');
      copy.push(descriptor.value);
    }
    return copy;
  } catch { return stop('INTEGRITY_FAILURE'); }
}
function text(input: unknown, expression: RegExp): string { return typeof input === 'string' && expression.test(input) ? input : stop('INTEGRITY_FAILURE'); }
function quantity(input: unknown): string {
  if (typeof input !== 'string' || input.length > 66 || !QUANTITY.test(input.toLowerCase())) return stop('INTEGRITY_FAILURE');
  return BigInt(input).toString();
}
function hash(input: unknown): string {
  return typeof input === 'string' && input.length === 66 ? text(input.toLowerCase(), HASH) : stop('INTEGRITY_FAILURE');
}
interface Block { readonly number: string; readonly hash: string; readonly timestamp: string }
function block(raw: unknown): Readonly<Block> {
  if (raw === null) return stop('UNAVAILABLE');
  const timestamp = quantity(field(raw, 'timestamp'));
  if (BigInt(timestamp) > (1n << 64n) - 1n) return stop('INTEGRITY_FAILURE');
  return Object.freeze({ number: quantity(field(raw, 'number')), hash: hash(field(raw, 'hash')), timestamp });
}
const hex = (value: string): string => `0x${BigInt(value).toString(16)}`;
const sameBlock = (left: Block, right: Block): boolean => left.number === right.number && left.hash === right.hash && left.timestamp === right.timestamp;
function runtimeHash(input: unknown): string {
  if (typeof input !== 'string' || input.length <= 2 || input.length > 2 + 2 * NATIVE_PAYMENT_PREFLIGHT_LIMITS.maxRuntimeBytes || !/^0x(?:[0-9a-fA-F]{2})+$/.test(input)) return stop('INTEGRITY_FAILURE');
  const code = Uint8Array.from(input.slice(2).match(/../g)!, pair => parseInt(pair, 16));
  return Array.from(keccak256(code), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createEvmPaymentPreflight(options: EvmPaymentPreflightOptions): CoreResult<EvmPaymentPreflight> {
  try {
    const binding = parseTradeBinding(options.binding), terms = snapshotEvmTerms(options.terms);
    if (binding.chain !== 'evm') return failed('UNSUPPORTED_PROVIDER');
    if (binding.networkId !== terms.networkId || binding.deploymentId !== terms.deploymentId) return failed('INVALID_INPUT');
    const network = options.registry.network(binding.networkId), deployment = options.registry.deployment(binding.networkId, binding.deploymentId);
    if (network === null || deployment === null) return failed('UNSUPPORTED_PROVIDER');
    if (field(network, 'id') !== binding.networkId || field(deployment, 'id') !== binding.deploymentId || field(network, 'chain') !== 'evm' ||
        field(field(network, 'finality'), 'kind') !== 'evm-finalized-tag' || field(deployment, 'protocolVersion') !== 1) return failed('UNSUPPORTED_PROVIDER');
    const chainId = text(field(network, 'chainIdentity'), /^[1-9][0-9]{0,77}$/), genesis = text(field(network, 'genesisHash'), HASH);
    if (BigInt(chainId) > (1n << 256n) - 1n) return failed('UNSUPPORTED_PROVIDER');
    const escrow = text(field(deployment, 'address'), ADDRESS), runtime = field(deployment, 'runtime');
    if (escrow === ZERO || field(runtime, 'kind') !== 'evm-code' || field(runtime, 'upgradeable') !== false) return failed('UNSUPPORTED_PROVIDER');
    const codeDigest = text(field(runtime, 'keccak256'), DIGEST);
    const supported = list(field(deployment, 'supportedAssetIds'), 64);
    const admitted = list(field(network, 'assets'), 64).some(asset => field(asset, 'kind') === terms.assetKind &&
      field(asset, 'address') === (terms.assetKind === 'native' ? null : terms.asset) && field(asset, 'transferPolicy') === 'exact-transfer' && supported.includes(field(asset, 'id')));
    if (!admitted) return failed('UNSUPPORTED_PROVIDER');
    const domain = Object.freeze({ chainId, verifyingContract: escrow });
    const termsHash = evmTermsHash(domain, terms);
    if (termsHash !== binding.tradeId) return failed('INVALID_INPUT');
    const idCall = buildTradeIdOf(domain, terms), tradeCall = buildGetTrade(escrow, termsHash);
    const request = options.request, monotonic = options.monotonicNow ?? (() => globalThis.performance.now());
    const timeout = options.readTimeoutMs ?? NATIVE_PAYMENT_PREFLIGHT_LIMITS.defaultReadTimeoutMs;
    if (typeof request !== 'function' || typeof monotonic !== 'function' || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000) return failed('INVALID_INPUT');
    let generation = 0, disposed = false;
    let active: AbortController | undefined, last: Readonly<NativePaymentPreflight> | undefined, startedAt = 0;
    const clock = (): number => {
      const value = monotonic();
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return stop('UNAVAILABLE');
      return value;
    };
    const stale = (): boolean => { const now = clock(); return now < startedAt || now - startedAt >= NATIVE_PAYMENT_PREFLIGHT_LIMITS.freshnessMs; };
    const freezeStale = (value: Readonly<NativePaymentPreflight>): Readonly<NativePaymentPreflight> => Object.freeze({ ...value, decision: 'block', reason: 'stale' });
    const adapter: EvmPaymentPreflight = {
      async read(external) {
        if (disposed) return failed('LOCKED');
        if (external?.aborted) return failed('CANCELLED');
        if (active) return failed('CONFLICT');
        const controller = new AbortController(), epoch = generation; active = controller; last = undefined;
        let stopReason: CoreErrorCode = 'CANCELLED', readingStarted = false;
        const abort = (): void => controller.abort();
        external?.addEventListener('abort', abort, { once: true });
        if (external?.aborted) abort();
        const timer = setTimeout(() => { stopReason = 'TIMEOUT'; controller.abort(); }, timeout);
        const guard = (): void => {
          if (disposed) return stop('LOCKED');
          if (controller.signal.aborted || generation !== epoch) return stop(stopReason);
          if (readingStarted) {
            const now = clock();
            if (now < startedAt) return stop('UNAVAILABLE');
            if (now - startedAt >= timeout) return stop('TIMEOUT');
          }
        };
        const call = async (method: string, params: readonly unknown[]): Promise<unknown> => { guard(); const result = await request({ method, params }); guard(); return result; };
        const work = async (): Promise<CoreResult<Readonly<NativePaymentPreflight>>> => {
          try {
            guard(); startedAt = clock(); readingStarted = true;
            if (quantity(await call('eth_chainId', [])) !== chainId) return stop('WRONG_CHAIN');
            const initialGenesis = block(await call('eth_getBlockByNumber', ['0x0', false]));
            if (initialGenesis.number !== '0' || initialGenesis.hash !== genesis) return stop('WRONG_CHAIN');
            const finalized = block(await call('eth_getBlockByNumber', ['finalized', false])), tag = hex(finalized.number);
            if (!sameBlock(finalized, block(await call('eth_getBlockByNumber', [tag, false])))) return stop('INTEGRITY_FAILURE');
            if (runtimeHash(await call('eth_getCode', [escrow, tag])) !== codeDigest) return stop('INTEGRITY_FAILURE');
            if (hash(await call('eth_call', [{ to: idCall.to, data: idCall.data }, tag])) !== `0x${termsHash}`) return stop('INTEGRITY_FAILURE');
            const rawTrade = await call('eth_call', [{ to: tradeCall.to, data: tradeCall.data }, tag]);
            if (typeof rawTrade !== 'string' || rawTrade.length !== 386) return stop('INTEGRITY_FAILURE');
            let trade;
            try { trade = decodeTrade(rawTrade); } catch { return stop('INTEGRITY_FAILURE'); }
            if (!sameBlock(finalized, block(await call('eth_getBlockByNumber', [tag, false])))) return stop('INTEGRITY_FAILURE');
            if (quantity(await call('eth_chainId', [])) !== chainId) return stop('WRONG_CHAIN');
            const finalGenesis = block(await call('eth_getBlockByNumber', ['0x0', false]));
            if (!sameBlock(initialGenesis, finalGenesis)) return stop('WRONG_CHAIN');
            const remaining = BigInt(terms.escrowExpirySeconds) - BigInt(finalized.timestamp);
            const reason: NativePaymentPreflight['reason'] = trade.state !== 'funded' ? 'unfunded' : !tradeMatchesTerms(trade, terms) ? 'mismatch' :
              stale() ? 'stale' : remaining <= BigInt(NATIVE_PAYMENT_PREFLIGHT_LIMITS.paymentBufferSeconds) ? 'near-expiry' : 'ok';
            guard();
            last = Object.freeze({ evidence: 'native-rpc', economicPreparationAllowed: false, binding, termsHash,
              finalizedAnchor: finalized.hash, checkedChainTime: finalized.timestamp, expiry: terms.escrowExpirySeconds,
              remainingSeconds: remaining.toString(), decision: reason === 'ok' ? 'allow-guidance' : 'block', reason });
            return { ok: true, value: last };
          } catch (error) { return failed(classify(error, 'UNAVAILABLE')); }
          finally { clearTimeout(timer); external?.removeEventListener('abort', abort); if (active === controller) active = undefined; }
        };
        const stopped = new Promise<CoreResult<never>>(resolve => {
          const finish = (): void => resolve(failed(disposed ? 'LOCKED' : stopReason));
          controller.signal.addEventListener('abort', finish, { once: true });
          if (controller.signal.aborted) finish();
        });
        return Promise.race([work(), stopped]);
      },
      view() {
        if (disposed) return failed('LOCKED');
        if (!last) return failed('UNAVAILABLE');
        try { if (last.reason !== 'stale' && stale()) last = freezeStale(last); return { ok: true, value: last }; }
        catch { last = undefined; return failed('UNAVAILABLE'); }
      },
      invalidate() { generation++; last = undefined; active?.abort(); },
      dispose() { disposed = true; generation++; last = undefined; active?.abort(); },
    };
    return { ok: true, value: Object.freeze(adapter) };
  } catch (error) { return failed(classify(error, 'INVALID_INPUT')); }
}
