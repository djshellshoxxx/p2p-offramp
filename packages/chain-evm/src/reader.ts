/** Read-only EVM boundary. No endpoint, transport, wallet or signing authority is constructed here. */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { parseTradeBinding, type ChainObservation, type CoreErrorCode, type CoreResult, type DeploymentV1, type NetworkV1, type TradeBinding } from '../../schemas/index.ts';

export const MAX_RPC_READS = 4;
export const MAX_RUNTIME_CODE_BYTES = 24_576;
export interface EvmReadRpc { request(input: { readonly method: string; readonly params?: readonly unknown[]; readonly signal?: AbortSignal }): Promise<unknown>; }
export interface EvmRegistryView { network(id: string): NetworkV1 | null; deployment(networkId: string, deploymentId: string): DeploymentV1 | null; }
export interface EvmReaderOptions { readonly rpc: EvmReadRpc; readonly registry: EvmRegistryView; readonly now?: () => number; readonly timeoutMs?: number; }
export interface LiveAnchor { readonly height: string; readonly hash: string; readonly timestampSeconds: string; readonly codeKeccak256: string; }
export interface EscrowExpectation { readonly seller: string; readonly buyer: string; readonly asset: string; readonly amountBaseUnits: string; readonly expirySeconds: string; }
export interface DecodedEscrow extends EscrowExpectation { readonly state: ChainObservation['state']; }
export interface EvmEscrowSnapshot { readonly observation: ChainObservation; readonly escrow: DecodedEscrow; }
export interface EvmReadRequest { readonly generation: number; readonly requestSequence: number; readonly signal: AbortSignal; }
export interface ExpectedEscrowTransaction { readonly hash: string; readonly from: string; readonly to: string; readonly data: string; readonly value: string; readonly nonce?: string; }
export interface ReceiptObservation {
  readonly kind: 'unknown' | 'pending' | 'finalized' | 'reorged';
  readonly transactionHash: string;
  readonly anchor: { readonly height: string; readonly hash: string } | null;
  readonly succeeded: boolean | null;
  readonly nonce: string | null;
}
class ReadFailure extends Error { readonly code: CoreErrorCode; constructor(code: CoreErrorCode) { super('EVM read unavailable.'); this.code = code; } }
const fail = (code: CoreErrorCode = 'INTEGRITY_FAILURE'): never => { throw new ReadFailure(code); };
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], byte => parseInt(byte, 16));
const SELECTOR = hex(keccak_256(new TextEncoder().encode('escrows(bytes32)'))).slice(0, 8);
const ZERO = `0x${'0'.repeat(40)}`;
const STATES = ['absent', 'funded', 'released', 'refunded'] as const;
function own(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}
function optionalOwn(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null) return fail();
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field) return undefined;
    if (!('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) return fail(); return value; }
function address(value: unknown, zero = false): string { if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value) || !zero && value === ZERO) return fail(); return value; }
function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || value.length > 66 || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)) return fail();
  return BigInt(value);
}
function decimal(value: unknown, bits = 256, nonzero = false): string {
  if (typeof value !== 'string' || value.length > 78 || !/^(?:0|[1-9][0-9]*)$/.test(value)) return fail('INVALID_INPUT');
  const parsed = BigInt(value);
  if (parsed >= 1n << BigInt(bits) || nonzero && parsed === 0n) return fail('INVALID_INPUT');
  return value;
}
function calldata(value: unknown): string { if (typeof value !== 'string' || value.length > 2 + 65_536 * 2 || !/^0x(?:[0-9a-f]{2}){4,}$/.test(value)) return fail('INVALID_INPUT'); return value; }
function counter(value: number): number { if (!Number.isSafeInteger(value) || value < 0) return fail('INVALID_INPUT'); return value; }
function header(input: unknown): { height: bigint; hash: string; timestamp: bigint } {
  return { height: quantity(own(input, 'number')), hash: hash(own(input, 'hash')), timestamp: quantity(own(input, 'timestamp')) };
}
function expectation(input: EscrowExpectation): EscrowExpectation {
  const seller = address(own(input, 'seller')), buyer = address(own(input, 'buyer'));
  if (seller === buyer) return fail('INVALID_INPUT');
  return Object.freeze({seller, buyer, asset: address(own(input, 'asset'), true), amountBaseUnits: decimal(own(input, 'amountBaseUnits'), 256, true), expirySeconds: decimal(own(input, 'expirySeconds'), 64, true)});
}
function decodeEscrow(input: unknown): DecodedEscrow {
  if (typeof input !== 'string' || !/^0x[0-9a-f]{384}$/.test(input)) return fail();
  const words = input.slice(2).match(/.{64}/g)!;
  const addr = (index: number) => { const word = words[index]!; if (!/^0{24}/.test(word)) return fail(); return `0x${word.slice(24)}`; };
  const state = BigInt(`0x${words[5]!}`), expiry = BigInt(`0x${words[4]!}`);
  if (state > 3n || expiry >= 1n << 64n) return fail();
  const result = Object.freeze({ seller: addr(0), buyer: addr(1), asset: addr(2), amountBaseUnits: BigInt(`0x${words[3]!}`).toString(), expirySeconds: expiry.toString(), state: STATES[Number(state)]! });
  if (state === 0n) { if (words.some(word => /[1-9a-f]/.test(word))) return fail(); }
  else if (result.seller === ZERO || result.buyer === ZERO || result.seller === result.buyer || result.amountBaseUnits === '0' || expiry === 0n) return fail();
  return result;
}
interface Context { readonly signal: AbortSignal; guard(): void; call(method: string, params?: readonly unknown[]): Promise<unknown>; }
interface Live { readonly network: NetworkV1; readonly deployment: DeploymentV1; readonly anchor: LiveAnchor; readonly blockTag: string; }

export class EvmChainReader {
  readonly #options: EvmReaderOptions;
  readonly #timeoutMs: number;
  #disposed = false;
  readonly #jobs = new Set<AbortController>();
  constructor(options: EvmReaderOptions) {
    this.#options = options;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 60_000) throw new Error('Invalid EVM reader timeout.');
  }
  #run<T>(external: AbortSignal | undefined, work: (context: Context) => Promise<T>): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    const failure = (code: CoreErrorCode): CoreResult<never> => ({ok:false,error:createCoreError(code,{operationId,readOnly:true})});
    if (this.#disposed || external?.aborted) return Promise.resolve(failure('CANCELLED'));
    if (this.#jobs.size >= MAX_RPC_READS) return Promise.resolve(failure('LIMIT_EXCEEDED'));
    const controller = new AbortController(); this.#jobs.add(controller);
    let abortCode: CoreErrorCode = 'CANCELLED';
    const onExternal = () => controller.abort(); external?.addEventListener('abort', onExternal, {once:true});
    const timer = setTimeout(() => { abortCode = 'TIMEOUT'; controller.abort(); }, this.#timeoutMs);
    const guard = () => { if (this.#disposed || controller.signal.aborted) fail(abortCode); };
    const context: Context = {
      signal: controller.signal, guard,
      call: async (method, params = []) => {
        guard();
        const value = await this.#options.rpc.request({method, params, signal:controller.signal});
        guard(); return value;
      },
    };
    let onAbort!: () => void;
    const aborted = new Promise<CoreResult<T>>(resolve => { onAbort = () => resolve(failure(abortCode)); controller.signal.addEventListener('abort', onAbort, {once:true}); });
    const physical = Promise.resolve().then(() => { guard(); return work(context); }).then(value => { guard(); return {ok:true as const,value}; }).catch(error => { let code: CoreErrorCode = 'UNAVAILABLE'; try { if (error instanceof ReadFailure) code = error.code; } catch { /* fixed diagnostic */ } return failure(code); }).finally(() => { this.#jobs.delete(controller); clearTimeout(timer); external?.removeEventListener('abort', onExternal); });
    return Promise.race([physical, aborted]).finally(() => { controller.signal.removeEventListener('abort', onAbort); external?.removeEventListener('abort', onExternal); });
  }
  async #live(networkId: string, deploymentId: string, context: Context): Promise<Live> {
    const network = this.#options.registry.network(networkId), deployment = this.#options.registry.deployment(networkId,deploymentId);
    if (!network || !deployment || network.chain !== 'evm' || network.finality.kind !== 'evm-finalized-tag' || deployment.runtime.kind !== 'evm-code' || deployment.runtime.upgradeable !== false) return fail('UNSUPPORTED_PROVIDER');
    if (quantity(await context.call('eth_chainId')).toString() !== network.chainIdentity) return fail('WRONG_CHAIN');
    const genesis = header(await context.call('eth_getBlockByNumber', ['0x0',false]));
    if (genesis.height !== 0n || genesis.hash !== network.genesisHash) return fail('WRONG_CHAIN');
    const block = header(await context.call('eth_getBlockByNumber',['finalized',false]));
    const blockTag = `0x${block.height.toString(16)}`;
    const code = await context.call('eth_getCode',[deployment.address,blockTag]);
    if (typeof code !== 'string' || code.length > 2 + MAX_RUNTIME_CODE_BYTES * 2 || !/^0x(?:[0-9a-f]{2})+$/.test(code)) return fail();
    const codeKeccak256 = hex(keccak_256(fromHex(code.slice(2))));
    if (codeKeccak256 !== deployment.runtime.keccak256) return fail();
    return { network, deployment, blockTag, anchor:Object.freeze({height:block.height.toString(),hash:block.hash,timestampSeconds:block.timestamp.toString(),codeKeccak256}) };
  }
  async #recheck(live: Live, context: Context): Promise<void> {
    const block = header(await context.call('eth_getBlockByNumber',[live.blockTag,false]));
    if (block.height.toString() !== live.anchor.height || block.hash !== live.anchor.hash || block.timestamp.toString() !== live.anchor.timestampSeconds) return fail();
  }
  validateLive(networkId: string, deploymentId: string, signal?: AbortSignal): Promise<CoreResult<LiveAnchor>> {
    return this.#run(signal,async context => { const live = await this.#live(networkId,deploymentId,context); await this.#recheck(live,context); return live.anchor; });
  }
  read(input: TradeBinding, request: EvmReadRequest, expected: EscrowExpectation): Promise<CoreResult<EvmEscrowSnapshot>> {
    return this.#run(request.signal, async context => {
      let binding: TradeBinding;
      try { binding = parseTradeBinding(input); } catch { return fail('INVALID_INPUT'); }
      if (binding.chain !== 'evm' || !/^[0-9a-f]{64}$/.test(binding.tradeId)) return fail('INVALID_INPUT');
      const generation = counter(request.generation), requestSequence = counter(request.requestSequence), wanted = expectation(expected);
      const live = await this.#live(binding.networkId,binding.deploymentId,context);
      const asset = live.network.assets.find(value => wanted.asset === ZERO ? value.kind === 'native' : value.kind === 'erc20' && value.address === wanted.asset);
      if (!asset || !live.deployment.supportedAssetIds.includes(asset.id)) return fail('UNSUPPORTED_PROVIDER');
      const escrow = decodeEscrow(await context.call('eth_call',[{to:live.deployment.address,data:`0x${SELECTOR}${binding.tradeId}`},live.blockTag]));
      if (escrow.state !== 'absent' && (escrow.seller !== wanted.seller || escrow.buyer !== wanted.buyer || escrow.asset !== wanted.asset || escrow.amountBaseUnits !== wanted.amountBaseUnits || escrow.expirySeconds !== wanted.expirySeconds)) return fail();
      await this.#recheck(live,context);
      const observedAt = counter((this.#options.now ?? Date.now)());
      return Object.freeze({escrow,observation:Object.freeze({binding,generation,requestSequence,anchor:Object.freeze({height:live.anchor.height,hash:live.anchor.hash}),state:escrow.state,finality:'finalized' as const,observedAt})});
    });
  }
  async readValidated(binding: TradeBinding, request: EvmReadRequest, expected: EscrowExpectation): Promise<CoreResult<ChainObservation>> {
    const result = await this.read(binding,request,expected);
    return result.ok ? {ok:true,value:result.value.observation} : result;
  }
  receipt(input: TradeBinding, expected: ExpectedEscrowTransaction, signal?: AbortSignal): Promise<CoreResult<ReceiptObservation>> {
    return this.#run(signal, async context => {
      let binding: TradeBinding;
      try { binding = parseTradeBinding(input); } catch { return fail('INVALID_INPUT'); }
      if (binding.chain !== 'evm' || !/^[0-9a-f]{64}$/.test(binding.tradeId)) return fail('INVALID_INPUT');
      const transactionHash = hash(own(expected,'hash')), from = address(own(expected,'from')), to = address(own(expected,'to'));
      const optionalNonce = optionalOwn(expected,'nonce');
      const nonceExpected = optionalNonce === undefined ? undefined : decimal(optionalNonce);
      const expectedData = calldata(own(expected,'data')), expectedValue = decimal(own(expected,'value'));
      const live = await this.#live(binding.networkId,binding.deploymentId,context);
      if (to !== live.deployment.address) return fail('WRONG_CHAIN');
      const receipt = await context.call('eth_getTransactionReceipt',[transactionHash]);
      if (receipt === null) { await this.#recheck(live,context); return Object.freeze({kind:'unknown' as const,transactionHash,anchor:null,succeeded:null,nonce:null}); }
      const receiptHash = hash(own(receipt,'transactionHash')), blockHash = hash(own(receipt,'blockHash')), height = quantity(own(receipt,'blockNumber'));
      const status = quantity(own(receipt,'status'));
      if (status > 1n || receiptHash !== transactionHash || address(own(receipt,'from')) !== from || address(own(receipt,'to')) !== to) return fail();
      const transaction = await context.call('eth_getTransactionByHash',[transactionHash]);
      if (hash(own(transaction,'hash')) !== transactionHash || address(own(transaction,'from')) !== from || address(own(transaction,'to')) !== to || hash(own(transaction,'blockHash')) !== blockHash || quantity(own(transaction,'blockNumber')) !== height) return fail();
      if (own(transaction,'input') !== expectedData || quantity(own(transaction,'value')).toString() !== expectedValue) return fail();
      const nonce = quantity(own(transaction,'nonce')).toString();
      if (nonceExpected !== undefined && nonce !== nonceExpected) return fail();
      const canonical = header(await context.call('eth_getBlockByNumber',[`0x${height.toString(16)}`,false]));
      if (canonical.height !== height) return fail();
      await this.#recheck(live,context);
      return Object.freeze({kind:canonical.hash !== blockHash ? 'reorged' as const : height <= BigInt(live.anchor.height) ? 'finalized' as const : 'pending' as const,transactionHash,anchor:Object.freeze({height:height.toString(),hash:blockHash}),succeeded:canonical.hash === blockHash ? status === 1n : null,nonce});
    });
  }
  dispose(): void { if (this.#disposed) return; this.#disposed = true; for (const controller of this.#jobs) controller.abort(); }
}
