/**
 * G12 EVM binding for the domain transaction lifecycle (packages/domain/src/tx-lifecycle.ts). TEST-ONLY, like
 * evm-adapter and evm-escrow: not exported from any entry point and not bundled.
 *
 * - `createEip1193ChainReader` implements the lifecycle's idempotent reader port over an injected EIP-1193
 *   `request` function (eth_chainId, eth_getBlockByNumber, eth_getTransactionCount, eth_getTransactionByHash,
 *   eth_getTransactionReceipt, eth_call getTrade). It never calls a send/sign method. Provider output is untrusted:
 *   malformed values become INTEGRITY_FAILURE, thrown errors are normalized (no message is copied).
 * - `escrowCallFor` builds the calldata of one lifecycle action from evm-escrow.ts, with the escrow state the
 *   action requires before it is prepared.
 *
 * The reader port shape is structural (the domain package is imported only through its public facade).
 */
import { createCoreError, createOperationId, normalizeError, type CoreErrorCode, type CoreResult } from '../../domain/index.ts';
import type { ChainObservation, TradeBinding } from '../../schemas/index.ts';
import { buildChainObservation, buildErc20Approve, buildFundNative, buildFundToken, buildGetTrade, buildRefund, buildRelease, decodeTrade, type EscrowCall, type EscrowState } from './evm-escrow.ts';
import type { EvmDomainInput, EvmTermsInput } from './evm-terms.ts';

export type Eip1193Request = (args: { readonly method: string; readonly params?: readonly unknown[] }) => Promise<unknown>;
export interface ReaderRequest { readonly signal: AbortSignal; readonly generation: number; readonly requestSequence: number }

const HASH = /^0x[0-9a-f]{64}$/, ADDRESS = /^0x[0-9a-f]{40}$/, QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/, DATA = /^0x(?:[0-9a-f]{2})*$/;
class ReaderFailure extends Error { readonly code: CoreErrorCode; constructor(code: CoreErrorCode) { super('EVM read unavailable.'); this.code = code; } }
const corrupt = (): never => { throw new ReaderFailure('INTEGRITY_FAILURE'); };
const quantity = (input: unknown): string => typeof input === 'string' && QUANTITY.test(input.toLowerCase()) ? BigInt(input).toString() : corrupt();
const hash = (input: unknown): string => typeof input === 'string' && HASH.test(input.toLowerCase()) ? input.toLowerCase() : corrupt();
const address = (input: unknown): string => typeof input === 'string' && ADDRESS.test(input.toLowerCase()) ? input.toLowerCase() : corrupt();
const data = (input: unknown): string => typeof input === 'string' && DATA.test(input.toLowerCase()) ? input.toLowerCase() : corrupt();
const hex = (decimal: string): string => /^(0|[1-9][0-9]{0,77})$/.test(decimal) ? `0x${BigInt(decimal).toString(16)}` : (() => { throw new ReaderFailure('INVALID_INPUT'); })();
function field(input: unknown, key: string): unknown {
  if (typeof input !== 'object' || input === null) return corrupt();
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor && 'value' in descriptor ? descriptor.value : corrupt();
}

export interface Eip1193ChainReaderOptions {
  readonly request: Eip1193Request;
  /** Registry-bound escrow deployment address (lowercase). */
  readonly escrow: string;
  readonly now?: () => number;
}
export function createEip1193ChainReader(options: Eip1193ChainReaderOptions) {
  const { request } = options, escrow = address(options.escrow), now = options.now ?? Date.now;
  async function read<T>(signal: AbortSignal, work: () => Promise<T>): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    if (signal.aborted) return { ok: false, error: createCoreError('CANCELLED', { operationId, readOnly: true }) };
    try {
      const value = await work();
      if (signal.aborted) return { ok: false, error: createCoreError('CANCELLED', { operationId, readOnly: true }) };
      return { ok: true, value };
    } catch (error) {
      if (error instanceof ReaderFailure) return { ok: false, error: createCoreError(error.code, { operationId, readOnly: true }) };
      return { ok: false, error: normalizeError(error, { operationId, phase: 'read' }) };
    }
  }
  const call = (method: string, params: readonly unknown[]): Promise<unknown> => request({ method, params });
  const block = async (tag: string): Promise<{ number: string; hash: string } | null> => {
    const raw = await call('eth_getBlockByNumber', [tag, false]);
    if (raw === null) return null;
    return Object.freeze({ number: quantity(field(raw, 'number')), hash: hash(field(raw, 'hash')) });
  };
  const escrowStateAt = async (binding: TradeBinding, blockTag: string): Promise<EscrowState> => {
    if (binding.chain !== 'evm') throw new ReaderFailure('INVALID_INPUT');
    const getTrade = buildGetTrade(escrow, binding.tradeId);
    return decodeTrade(data(await call('eth_call', [{ to: getTrade.to, data: getTrade.data }, blockTag]))).state;
  };
  return Object.freeze({
    chainId: (signal: AbortSignal) => read(signal, async () => quantity(await call('eth_chainId', []))),
    head: (tag: 'latest' | 'finalized', signal: AbortSignal) => read(signal, () => block(tag)),
    blockHashAt: (number: string, signal: AbortSignal) => read(signal, async () => (await block(hex(number)))?.hash ?? null),
    transactionCount: (account: string, tag: 'latest' | 'pending', signal: AbortSignal) =>
      read(signal, async () => quantity(await call('eth_getTransactionCount', [address(account), tag]))),
    transaction: (txHash: string, signal: AbortSignal) => read(signal, async () => {
      const raw = await call('eth_getTransactionByHash', [hash(txHash)]);
      if (raw === null) return null;
      const to = field(raw, 'to'), blockNumber = field(raw, 'blockNumber');
      return Object.freeze({ hash: hash(field(raw, 'hash')), from: address(field(raw, 'from')), to: to === null ? null : address(to), nonce: quantity(field(raw, 'nonce')),
        input: data(field(raw, 'input')), value: quantity(field(raw, 'value')), blockNumber: blockNumber === null ? null : quantity(blockNumber) });
    }),
    receipt: (txHash: string, signal: AbortSignal) => read(signal, async () => {
      const raw = await call('eth_getTransactionReceipt', [hash(txHash)]);
      if (raw === null) return null;
      const status = field(raw, 'status');
      if (status !== '0x1' && status !== '0x0') return corrupt();
      return Object.freeze({ transactionHash: hash(field(raw, 'transactionHash')), blockNumber: quantity(field(raw, 'blockNumber')), blockHash: hash(field(raw, 'blockHash')),
        status: status === '0x1' ? 'success' as const : 'reverted' as const });
    }),
    escrowState: (binding: TradeBinding, blockNumber: string, signal: AbortSignal) => read(signal, () => escrowStateAt(binding, hex(blockNumber))),
    /** Escrow state at the latest block, anchored to that block; finality is reported as 'pending' (the lifecycle applies policy). */
    escrowObservation: (binding: TradeBinding, reconcile: ReaderRequest) => read<ChainObservation>(reconcile.signal, async () => {
      const head = await block('latest');
      if (head === null) return corrupt();
      const getTrade = buildGetTrade(escrow, binding.tradeId);
      const getTradeReturn = data(await call('eth_call', [{ to: getTrade.to, data: getTrade.data }, hex(head.number)]));
      return buildChainObservation(escrow, { binding, generation: reconcile.generation, requestSequence: reconcile.requestSequence, getTradeReturn,
        anchor: { height: head.number, hash: head.hash }, finality: 'pending', observedAt: now() });
    }),
  });
}

export type EscrowAction =
  | { readonly action: 'fund'; readonly domain: EvmDomainInput; readonly terms: EvmTermsInput }
  | { readonly action: 'release' | 'refund'; readonly escrow: string; readonly tradeId: string }
  | { readonly action: 'approve'; readonly token: string; readonly spender: string; readonly amountBaseUnits: string };
/** Calldata for one lifecycle action, all from evm-escrow.ts, plus the escrow state required before preparing it. */
export function escrowCallFor(input: EscrowAction): { readonly call: EscrowCall; readonly expectedEscrowState: 'absent' | 'funded' } {
  switch (input.action) {
    case 'fund': {
      const built = input.terms.assetKind === 'native' ? buildFundNative(input.domain, input.terms) : buildFundToken(input.domain, input.terms);
      return Object.freeze({ call: Object.freeze({ to: built.to, data: built.data, value: built.value }), expectedEscrowState: 'absent' });
    }
    case 'release': return Object.freeze({ call: buildRelease(input.escrow, input.tradeId), expectedEscrowState: 'funded' });
    case 'refund': return Object.freeze({ call: buildRefund(input.escrow, input.tradeId), expectedEscrowState: 'funded' });
    case 'approve': return Object.freeze({ call: buildErc20Approve(input.token, input.spender, input.amountBaseUnits), expectedEscrowState: 'absent' });
  }
}
