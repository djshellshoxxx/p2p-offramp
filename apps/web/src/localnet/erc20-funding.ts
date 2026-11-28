/** Read-only ERC-20 funding guidance. Each state query is bound to a checked canonical block hash. */
import { addressWord, buildErc20BalanceOf, selectorOf, type Eip1193Request } from '../../../../packages/wallet/localnet.ts';
import type { LiveAnchor } from '../../../../packages/chain-evm/localnet.ts';
import { fail } from './validation.ts';

export interface Erc20FundingState {
  readonly allowanceBaseUnits: string; readonly balanceBaseUnits: string;
  /** Mutable latest state can veto finalized state; it cannot independently authorize a subsequent action. */
  readonly settled: boolean;
}
interface Options {
  readonly request: Eip1193Request; readonly anchor: LiveAnchor; readonly genesisHash: string;
  readonly token: string; readonly seller: string; readonly spender: string;
  readonly signal: AbortSignal; readonly assertCurrent: () => void;
}
const word = (value: unknown): string => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value) ? BigInt(value).toString() : fail('INTEGRITY_FAILURE');
function own(input: unknown, key: string): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INTEGRITY_FAILURE');
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor && 'value' in descriptor ? descriptor.value : fail('INTEGRITY_FAILURE');
}
const quantity = (input: unknown): string => typeof input === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(input) ? BigInt(input).toString() : fail('INTEGRITY_FAILURE');
function header(raw: unknown) {
  const hash = own(raw, 'hash');
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/.test(hash)) return fail('INTEGRITY_FAILURE');
  return { height: quantity(own(raw, 'number')), hash, timestampSeconds: quantity(own(raw, 'timestamp')) };
}
const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const tag = (height: string): string => `0x${BigInt(height).toString(16)}`;
const at = (hash: string) => ({ blockHash: hash, requireCanonical: true });
const same = (left: ReturnType<typeof header>, right: ReturnType<typeof header>): boolean =>
  left.height === right.height && left.hash === right.hash && left.timestampSeconds === right.timestampSeconds;

/** Only the approved principal or zero can be proposed. Existing non-exact allowance is reset before replacement. */
export function nextErc20Approval(amountBaseUnits: string, state: Erc20FundingState): string | null {
  if (!state.settled || BigInt(state.balanceBaseUnits) < BigInt(amountBaseUnits) || state.allowanceBaseUnits === amountBaseUnits) return null;
  return state.allowanceBaseUnits === '0' ? amountBaseUnits : '0';
}
export function erc20FundingReady(amountBaseUnits: string, state: Erc20FundingState): boolean {
  return state.settled && state.allowanceBaseUnits === amountBaseUnits && BigInt(state.balanceBaseUnits) >= BigInt(amountBaseUnits);
}

/** The caller first validates the registry's chain/genesis/escrow runtime with EvmChainReader.validateLive. */
export async function readErc20FundingState(options: Options): Promise<Erc20FundingState> {
  const allowanceData = `0x${selectorOf('allowance(address,address)')}${hex(addressWord(options.seller))}${hex(addressWord(options.spender))}`;
  const balance = buildErc20BalanceOf(options.token, options.seller);
  let active = true, stop!: () => void;
  const guard = (): void => { if (!active || options.signal.aborted) fail('CANCELLED'); options.assertCurrent(); };
  const stopped = new Promise<never>((_, reject) => { stop = () => { active = false; try { fail(options.signal.aborted ? 'CANCELLED' : 'TIMEOUT'); } catch (error) { reject(error); } }; });
  const timer = setTimeout(stop, 10_000); options.signal.addEventListener('abort', stop, { once: true });
  const request = options.request;
  const call = async (method: string, params: readonly unknown[]) => { guard(); const result = await request({ method, params }); guard(); return result; };
  const read = async () => {
    guard(); const { anchor } = options;
    const latest = header(await call('eth_getBlockByNumber', ['latest', false]));
    if (BigInt(latest.height) < BigInt(anchor.height) || BigInt(latest.timestampSeconds) < BigInt(anchor.timestampSeconds) ||
        latest.height === anchor.height && !same(latest, anchor)) fail('INTEGRITY_FAILURE');
    const state = async (blockHash: string) => {
      const code = await call('eth_getCode', [options.token, at(blockHash)]);
      if (typeof code !== 'string' || code.length > 2 + 24_576 * 2 || !/^0x(?:[0-9a-f]{2})+$/.test(code)) fail('INTEGRITY_FAILURE');
      const allowanceBaseUnits = word(await call('eth_call', [{ to: options.token, data: allowanceData }, at(blockHash)]));
      const balanceBaseUnits = word(await call('eth_call', [{ to: balance.to, data: balance.data }, at(blockHash)]));
      return { allowanceBaseUnits, balanceBaseUnits, code };
    };
    const finalized = await state(anchor.hash), current = latest.hash === anchor.hash ? finalized : await state(latest.hash);
    if (!same(anchor, header(await call('eth_getBlockByNumber', [tag(anchor.height), false]))) ||
        !same(latest, header(await call('eth_getBlockByNumber', [tag(latest.height), false])))) fail('INTEGRITY_FAILURE');
    if (quantity(await call('eth_chainId', [])) !== '31337') fail('WRONG_CHAIN');
    const genesis = header(await call('eth_getBlockByNumber', ['0x0', false]));
    if (genesis.height !== '0' || genesis.hash !== options.genesisHash) fail('WRONG_CHAIN');
    guard();
    return { allowanceBaseUnits: finalized.allowanceBaseUnits,
      balanceBaseUnits: (BigInt(finalized.balanceBaseUnits) < BigInt(current.balanceBaseUnits) ? finalized : current).balanceBaseUnits,
      settled: finalized.allowanceBaseUnits === current.allowanceBaseUnits && finalized.code === current.code };
  };
  try { return await Promise.race([read(), stopped]); }
  finally { active = false; clearTimeout(timer); options.signal.removeEventListener('abort', stop); }
}
