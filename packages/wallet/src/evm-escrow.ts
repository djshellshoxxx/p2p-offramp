/**
 * BasicEscrow client bindings: pure calldata builders and a read-side decoder. TEST-ONLY, like evm-adapter: not
 * exported from any entry point, not bundled, and it never signs, sends, or contacts an RPC. Keccak-256 and the
 * G16 word encoders come from evm-terms.ts (pinned @noble/hashes); no other crypto dependency is added.
 *
 * Write side: fundNative / fundToken / release / refund / withdraw (+ tradeIdOf, getTrade and ERC-20 approve) are
 * encoded from the exact contract ABI (contracts/evm/abi/BasicEscrow.json; the unit test pins every selector and
 * topic to that file). The `TradeTerms` tuple is built from the same validated G16 input as `evmTermsHash`, so the
 * calldata can only describe terms whose on-chain tradeId equals the off-chain termsHash.
 *
 * Read side: strict log / return-data / revert decoding producing a `ChainObservation` for the domain authority
 * reducer (packages/domain/src/authority.ts). Decoded data is untrusted node output: any malformed, contradictory
 * or out-of-range input throws EvmEscrowError('INTEGRITY_FAILURE'); a bad caller argument throws 'INVALID_INPUT'.
 */
import type { CoreErrorCode } from '../../domain/index.ts';
import { parseChainObservation, type ChainObservation, type TradeBinding } from '../../schemas/index.ts';
import { addressWord, bytes32Word, evmTermsHash, keccak256, tradeTermsStructHash, uintWord, type EvmDomainInput, type EvmTermsInput } from './evm-terms.ts';

export class EvmEscrowError extends Error {
  readonly code: Extract<CoreErrorCode, 'INVALID_INPUT' | 'INTEGRITY_FAILURE'>;
  constructor(code: 'INVALID_INPUT' | 'INTEGRITY_FAILURE' = 'INVALID_INPUT') {
    super(code === 'INVALID_INPUT' ? 'Invalid escrow call input.' : 'Invalid escrow chain data.'); this.name = 'EvmEscrowError'; this.code = code;
  }
}
const bad = (): never => { throw new EvmEscrowError('INVALID_INPUT'); };
const corrupt = (): never => { throw new EvmEscrowError('INTEGRITY_FAILURE'); };

const U8 = 255n, U64 = (1n << 64n) - 1n, U256 = (1n << 256n) - 1n;
const utf8 = new TextEncoder();
const hexOf = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const bytesOf = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16));
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

/** First four bytes of keccak256(signature). */
export function selectorOf(signature: string): string { return hexOf(keccak256(utf8.encode(signature)).subarray(0, 4)); }
/** Full keccak256 topic of an event signature, 64 lowercase hex characters. */
export function topicOf(signature: string): string { return hexOf(keccak256(utf8.encode(signature))); }

const TUPLE = '(bytes32,uint64,string,string,address,address,uint8,address,uint256,bytes32,bytes32,bytes32,uint64,uint64)';
export const FUNCTION_SIGNATURES = Object.freeze({
  fundNative: `fundNative(${TUPLE})`, fundToken: `fundToken(${TUPLE})`, release: 'release(bytes32)', refund: 'refund(bytes32)',
  withdraw: 'withdraw(address,address)', tradeIdOf: `tradeIdOf(${TUPLE})`, getTrade: 'getTrade(bytes32)',
  approve: 'approve(address,uint256)', balanceOf: 'balanceOf(address)', pendingWithdrawals: 'pendingWithdrawals(address,address)',
} as const);
/** Test-only mock receiver (contracts/evm/test/mocks/Mocks.sol `RevertingReceiver`); not part of BasicEscrow's ABI. */
export const RECEIVER_FUNCTION_SIGNATURES = Object.freeze({ setAccept: 'setAccept(bool)' } as const);
export const EVENT_SIGNATURES = Object.freeze({
  Funded: 'Funded(bytes32,address,address,address,uint256,uint64)', Released: 'Released(bytes32,address,address,uint256)',
  Refunded: 'Refunded(bytes32,address,address,address,uint256)', PayoutDeferred: 'PayoutDeferred(bytes32,address,address,uint256)',
  Withdrawn: 'Withdrawn(address,address,address,uint256)',
} as const);
export const ERROR_SIGNATURES = Object.freeze({
  InvalidTerms: 'InvalidTerms()', SellerNonceUsed: 'SellerNonceUsed(address,bytes32)', AcceptanceExpired: 'AcceptanceExpired(uint64)',
  TradeIdUsed: 'TradeIdUsed(bytes32)', InvalidBuyer: 'InvalidBuyer(address)', ZeroAmount: 'ZeroAmount()', UnsupportedAsset: 'UnsupportedAsset(address)',
  DeadlineOutOfRange: 'DeadlineOutOfRange(uint64,uint256,uint256)', IncorrectDeposit: 'IncorrectDeposit(uint256,uint256)',
  InvalidState: 'InvalidState(bytes32,uint8)', Unauthorized: 'Unauthorized(address)', DeadlinePassed: 'DeadlinePassed(uint64)',
  DeadlineNotReached: 'DeadlineNotReached(uint64)', InsufficientGas: 'InsufficientGas(uint256,uint256)', NothingToWithdraw: 'NothingToWithdraw()',
  WithdrawalFailed: 'WithdrawalFailed()', InvalidAllowlistEntry: 'InvalidAllowlistEntry(address)', AllowlistTooLarge: 'AllowlistTooLarge(uint256)',
  ReentrancyGuardReentrantCall: 'ReentrancyGuardReentrantCall()', SafeERC20FailedOperation: 'SafeERC20FailedOperation(address)',
} as const);

/** A transaction request body: `value` is a decimal wei string, `data` is 0x-prefixed calldata. */
export interface EscrowCall { readonly to: string; readonly data: string; readonly value: string; }
export interface FundCall extends EscrowCall { readonly tradeId: string; }

// ---------- encoding ----------
function dynamicString(value: string): Uint8Array {
  const raw = utf8.encode(value), padded = new Uint8Array(Math.ceil(raw.byteLength / 32) * 32);
  padded.set(raw); return concat([uintWord(BigInt(raw.byteLength), U256), padded]);
}
function decimal(input: string, max: bigint): bigint { return BigInt(input) <= max ? BigInt(input) : bad(); }
/** ABI body of the TradeTerms tuple (v and mode are hashed constants and are not part of the struct). */
function encodeTuple(terms: EvmTermsInput): Uint8Array {
  const networkTail = dynamicString(terms.networkId), deploymentTail = dynamicString(terms.deploymentId);
  const headWords = 14, networkOffset = headWords * 32, deploymentOffset = networkOffset + networkTail.byteLength;
  return concat([bytes32Word(terms.orderId), uintWord(decimal(terms.revision, U64), U64), uintWord(BigInt(networkOffset), U256), uintWord(BigInt(deploymentOffset), U256),
    addressWord(terms.seller), addressWord(terms.buyer), uintWord(terms.assetKind === 'native' ? 0n : 1n, U8), addressWord(terms.asset, true),
    uintWord(decimal(terms.amountBaseUnits, U256), U256), bytes32Word(terms.privateAgreementHash), bytes32Word(terms.capabilitiesHash),
    bytes32Word(terms.sellerNonce), uintWord(decimal(terms.acceptBeforeSeconds, U64), U64), uintWord(decimal(terms.escrowExpirySeconds, U64), U64),
    networkTail, deploymentTail]);
}
/** Runs the full G16 validation (strict keys, ids, addresses, ranges) and the contract-only extras. */
function validate(domain: EvmDomainInput, terms: EvmTermsInput): string {
  try { tradeTermsStructHash(terms); return evmTermsHash(domain, terms); } catch { return bad(); }
}
function tupleCall(name: 'fundNative' | 'fundToken' | 'tradeIdOf', domain: EvmDomainInput, terms: EvmTermsInput): string {
  validate(domain, terms);
  if (terms.buyer === domain.verifyingContract || terms.seller === domain.verifyingContract) bad();
  return `0x${selectorOf(FUNCTION_SIGNATURES[name])}${hexOf(concat([uintWord(32n, U256), encodeTuple(terms)]))}`;
}
const hash = (input: unknown): Uint8Array => {
  try { return bytes32Word(input); } catch { return bad(); }
};
const address = (input: unknown, allowZero = false): Uint8Array => {
  try { return addressWord(input, allowZero); } catch { return bad(); }
};

/** `fundNative(terms)`: the seller sends exactly `amountBaseUnits` as value. Returns the expected tradeId. */
export function buildFundNative(domain: EvmDomainInput, terms: EvmTermsInput): FundCall {
  const tradeId = validate(domain, terms);
  if (terms.assetKind !== 'native') bad();
  return Object.freeze({ to: domain.verifyingContract, data: tupleCall('fundNative', domain, terms), value: terms.amountBaseUnits, tradeId });
}
/** `fundToken(terms)`: requires a prior ERC-20 allowance of `approveAmountFor(terms)` from the seller to the escrow. */
export function buildFundToken(domain: EvmDomainInput, terms: EvmTermsInput): FundCall {
  const tradeId = validate(domain, terms);
  if (terms.assetKind !== 'erc20') bad();
  return Object.freeze({ to: domain.verifyingContract, data: tupleCall('fundToken', domain, terms), value: '0', tradeId });
}
/** On-chain `tradeIdOf(terms)` view call, for cross-checking the off-chain termsHash against a live deployment. */
export function buildTradeIdOf(domain: EvmDomainInput, terms: EvmTermsInput): EscrowCall {
  validate(domain, terms);
  return Object.freeze({ to: domain.verifyingContract, data: tupleCall('tradeIdOf', domain, terms), value: '0' });
}
function tradeCall(name: 'release' | 'refund' | 'getTrade', escrow: string, tradeId: string): EscrowCall {
  address(escrow);
  return Object.freeze({ to: escrow, data: `0x${selectorOf(FUNCTION_SIGNATURES[name])}${hexOf(hash(tradeId))}`, value: '0' });
}
/** Seller-only, strictly before the deadline; pays the bound buyer. */
export const buildRelease = (escrow: string, tradeId: string): EscrowCall => tradeCall('release', escrow, tradeId);
/** Anyone, at or after the deadline; pays only the bound seller. */
export const buildRefund = (escrow: string, tradeId: string): EscrowCall => tradeCall('refund', escrow, tradeId);
export const buildGetTrade = (escrow: string, tradeId: string): EscrowCall => tradeCall('getTrade', escrow, tradeId);
/** Pays a deferred credit to `recipient` only. `token` is the zero address for native. */
export function buildWithdraw(escrow: string, recipient: string, token: string): EscrowCall {
  address(escrow);
  return Object.freeze({ to: escrow, data: `0x${selectorOf(FUNCTION_SIGNATURES.withdraw)}${hexOf(concat([address(recipient), address(token, true)]))}`, value: '0' });
}
/** The exact allowance the seller must grant before `fundToken`: the principal, never more. Native terms throw. */
export function approveAmountFor(terms: EvmTermsInput): string {
  if (typeof terms !== 'object' || terms === null || terms.assetKind !== 'erc20') return bad();
  try { addressWord(terms.asset); } catch { return bad(); }
  if (typeof terms.amountBaseUnits !== 'string' || !/^[1-9][0-9]{0,77}$/.test(terms.amountBaseUnits)) return bad();
  return decimal(terms.amountBaseUnits, U256).toString();
}
/** ERC-20 `approve(escrow, amount)` on `token`. Zero is allowed (allowance reset); the amount is range-checked. */
export function buildErc20Approve(token: string, spender: string, amountBaseUnits: string): EscrowCall {
  address(token); address(spender);
  if (typeof amountBaseUnits !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(amountBaseUnits)) bad();
  return Object.freeze({ to: token, data: `0x${selectorOf(FUNCTION_SIGNATURES.approve)}${hexOf(concat([address(spender), uintWord(decimal(amountBaseUnits, U256), U256)]))}`, value: '0' });
}
/** `pendingWithdrawals(recipient, token)` view call: the principal credited after a failed push. `token` is zero for native. */
export function buildPendingWithdrawals(escrow: string, recipient: string, token: string): EscrowCall {
  address(escrow);
  return Object.freeze({ to: escrow, data: `0x${selectorOf(FUNCTION_SIGNATURES.pendingWithdrawals)}${hexOf(concat([address(recipient), address(token, true)]))}`, value: '0' });
}
/** Test-only: flips the mock receiver's `accept` flag, which gates its native `receive`. Not an escrow call. */
export function buildSetAccept(receiver: string, accept: boolean): EscrowCall {
  address(receiver);
  if (typeof accept !== 'boolean') bad();
  return Object.freeze({ to: receiver, data: `0x${selectorOf(RECEIVER_FUNCTION_SIGNATURES.setAccept)}${hexOf(uintWord(accept ? 1n : 0n, U8))}`, value: '0' });
}
/** ERC-20 `balanceOf(account)` view call. */
export function buildErc20BalanceOf(token: string, account: string): EscrowCall {
  address(token);
  return Object.freeze({ to: token, data: `0x${selectorOf(FUNCTION_SIGNATURES.balanceOf)}${hexOf(address(account, true))}`, value: '0' });
}

// ---------- decoding ----------
function strictHex(input: unknown, exactBytes?: number): Uint8Array {
  if (typeof input !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(input) || input.length > 2 + 2 * 65_536) return corrupt();
  const out = bytesOf(input.slice(2).toLowerCase());
  if (exactBytes !== undefined && out.byteLength !== exactBytes) return corrupt();
  return out;
}
function wordUint(word: Uint8Array, max: bigint): bigint {
  const value = word.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  return value > max ? corrupt() : value;
}
function wordAddress(word: Uint8Array): string {
  for (let index = 0; index < 12; index++) if (word[index] !== 0) return corrupt();
  return `0x${hexOf(word.subarray(12))}`;
}
const words = (data: Uint8Array, count: number): Uint8Array[] => {
  if (data.byteLength !== count * 32) return corrupt();
  return Array.from({ length: count }, (_, index) => data.subarray(index * 32, index * 32 + 32));
};
function w(list: readonly Uint8Array[], index: number): Uint8Array { return list[index] ?? corrupt(); }

export type EscrowEvent =
  | { readonly kind: 'Funded'; readonly tradeId: string; readonly seller: string; readonly buyer: string; readonly token: string; readonly amount: string; readonly deadline: string }
  | { readonly kind: 'Released'; readonly tradeId: string; readonly buyer: string; readonly token: string; readonly amount: string }
  | { readonly kind: 'Refunded'; readonly tradeId: string; readonly seller: string; readonly caller: string; readonly token: string; readonly amount: string }
  | { readonly kind: 'PayoutDeferred'; readonly tradeId: string; readonly recipient: string; readonly token: string; readonly amount: string }
  | { readonly kind: 'Withdrawn'; readonly recipient: string; readonly caller: string; readonly token: string; readonly amount: string };
/** The fields of an eth_getLogs entry this decoder reads. Everything else is ignored. */
export interface RawLog { readonly address: string; readonly topics: readonly string[]; readonly data: string; }
const TOPICS: Readonly<Record<string, EscrowEvent['kind']>> = Object.freeze(Object.fromEntries(
  (Object.entries(EVENT_SIGNATURES) as [EscrowEvent['kind'], string][]).map(([name, signature]) => [topicOf(signature), name])));

/**
 * Decodes one escrow log. `escrow` is the registry-bound deployment address (lowercase): a log emitted by any other
 * address is rejected, since anyone can deploy a contract that emits look-alike events.
 */
export function decodeEscrowLog(escrow: string, log: RawLog): EscrowEvent {
  address(escrow);
  if (typeof log !== 'object' || log === null || typeof log.address !== 'string' || log.address.toLowerCase() !== escrow || !Array.isArray(log.topics) || log.topics.length < 1 || log.topics.length > 4) return corrupt();
  const topics = (log.topics as unknown[]).map(topic => strictHex(topic, 32));
  const kind = TOPICS[hexOf(topics[0] ?? corrupt())];
  if (kind === undefined) return corrupt();
  const data = strictHex(log.data);
  const t = (index: number): Uint8Array => topics[index] ?? corrupt();
  const id = (index: number): string => hexOf(t(index));
  const expectTopics = (count: number, dataWords: number): Uint8Array[] => { if (topics.length !== count) return corrupt(); return words(data, dataWords); };
  switch (kind) {
    case 'Funded': { const d = expectTopics(4, 3);
      return Object.freeze({ kind, tradeId: id(1), seller: wordAddress(t(2)), buyer: wordAddress(t(3)), token: wordAddress(w(d, 0)), amount: wordUint(w(d, 1), U256).toString(), deadline: wordUint(w(d, 2), U64).toString() }); }
    case 'Released': { const d = expectTopics(3, 2);
      return Object.freeze({ kind, tradeId: id(1), buyer: wordAddress(t(2)), token: wordAddress(w(d, 0)), amount: wordUint(w(d, 1), U256).toString() }); }
    case 'Refunded': { const d = expectTopics(4, 2);
      return Object.freeze({ kind, tradeId: id(1), seller: wordAddress(t(2)), caller: wordAddress(t(3)), token: wordAddress(w(d, 0)), amount: wordUint(w(d, 1), U256).toString() }); }
    case 'PayoutDeferred': { const d = expectTopics(3, 2);
      return Object.freeze({ kind, tradeId: id(1), recipient: wordAddress(t(2)), token: wordAddress(w(d, 0)), amount: wordUint(w(d, 1), U256).toString() }); }
    case 'Withdrawn': { const d = expectTopics(3, 2);
      return Object.freeze({ kind, recipient: wordAddress(t(1)), caller: wordAddress(t(2)), token: wordAddress(w(d, 0)), amount: wordUint(w(d, 1), U256).toString() }); }
  }
}

export type EscrowState = 'absent' | 'funded' | 'released' | 'refunded';
export interface EscrowTrade {
  readonly state: EscrowState; readonly seller: string; readonly buyer: string; readonly token: string; readonly amount: string; readonly deadline: string;
}
const STATES: readonly EscrowState[] = ['absent', 'funded', 'released', 'refunded'];
/** Decodes the `getTrade` return value `(seller, deadline, state, buyer, token, amount)`. An absent trade must be all-zero. */
export function decodeTrade(returnData: string): EscrowTrade {
  const d = words(strictHex(returnData), 6);
  const seller = wordAddress(w(d, 0)), deadline = wordUint(w(d, 1), U64), stateIndex = Number(wordUint(w(d, 2), 3n));
  const buyer = wordAddress(w(d, 3)), token = wordAddress(w(d, 4)), amount = wordUint(w(d, 5), U256);
  const state = STATES[stateIndex] ?? corrupt();
  const empty = seller === ZERO_ADDRESS && buyer === ZERO_ADDRESS && token === ZERO_ADDRESS && deadline === 0n && amount === 0n;
  if ((state === 'absent') !== empty) return corrupt();
  if (state !== 'absent' && (seller === ZERO_ADDRESS || buyer === ZERO_ADDRESS || amount === 0n)) return corrupt();
  return Object.freeze({ state, seller, buyer, token, amount: amount.toString(), deadline: deadline.toString() });
}
/** Whether a bound escrow record is exactly what `terms` describe (seller, buyer, asset, amount and deadline). */
export function tradeMatchesTerms(trade: EscrowTrade, terms: EvmTermsInput): boolean {
  tradeTermsStructHash(terms);
  return trade.seller === terms.seller && trade.buyer === terms.buyer && trade.token === (terms.assetKind === 'native' ? ZERO_ADDRESS : terms.asset)
    && trade.amount === terms.amountBaseUnits && trade.deadline === terms.escrowExpirySeconds;
}

/**
 * Folds the escrow events of ONE trade (in log order) into a state. Only absent -> funded -> released|refunded is
 * legal; a duplicate, reordered or contradictory sequence is an integrity failure, never silently resolved.
 */
export function stateFromLogs(escrow: string, tradeId: string, logs: readonly RawLog[]): EscrowState {
  hash(tradeId);
  let state: EscrowState = 'absent';
  for (const log of logs) {
    const event = decodeEscrowLog(escrow, log);
    if (event.kind === 'Withdrawn' || !('tradeId' in event) || event.tradeId !== tradeId) continue;
    if (event.kind === 'Funded') { if (state !== 'absent') return corrupt(); state = 'funded'; }
    else if (event.kind === 'Released') { if (state !== 'funded') return corrupt(); state = 'released'; }
    else if (event.kind === 'Refunded') { if (state !== 'funded') return corrupt(); state = 'refunded'; }
    else if (state !== 'released' && state !== 'refunded') return corrupt();
  }
  return state;
}

export interface ObservationInput {
  readonly binding: TradeBinding;
  /** The authority generation and request sequence this read was issued under (ReconcileRequest). */
  readonly generation: number; readonly requestSequence: number;
  /** Raw `getTrade` return data, read at the block named by `anchor`. */
  readonly getTradeReturn: string;
  /** Optional trade logs up to the same block; when given they must agree with the stored state. */
  readonly logs?: readonly RawLog[];
  readonly anchor: { readonly height: string; readonly hash: string };
  readonly finality: ChainObservation['finality'];
  readonly observedAt: number;
}
/**
 * Builds the `ChainObservation` the domain authority consumes from the escrow's own return data (and optionally
 * logs). The binding's chain must be 'evm' and its tradeId the 64-hex termsHash. The result is parsed by the
 * schema, so a hostile anchor or counter is rejected before it can reach the reducer. This does not authenticate
 * the node: the caller's reader is still responsible for chain/deployment identity (G08).
 */
export function buildChainObservation(escrow: string, input: ObservationInput): ChainObservation {
  address(escrow);
  if (typeof input !== 'object' || input === null || typeof input.binding !== 'object' || input.binding === null || input.binding.chain !== 'evm') bad();
  hash(input.binding.tradeId);
  if (typeof input.anchor?.hash !== 'string' || !/^0x[0-9a-f]{64}$/.test(input.anchor.hash)) bad();
  const trade = decodeTrade(input.getTradeReturn);
  if (input.logs !== undefined && stateFromLogs(escrow, input.binding.tradeId, input.logs) !== trade.state) corrupt();
  try {
    return parseChainObservation({ binding: input.binding, generation: input.generation, requestSequence: input.requestSequence,
      anchor: { height: input.anchor.height, hash: input.anchor.hash }, state: trade.state, finality: input.finality, observedAt: input.observedAt });
  } catch { return bad(); }
}

// ---------- revert decoding ----------
const ERROR_TYPES: Readonly<Record<string, readonly string[]>> = Object.freeze(Object.fromEntries(Object.values(ERROR_SIGNATURES).map(signature =>
  [selectorOf(signature), (signature.slice(signature.indexOf('(') + 1, -1).split(',').filter(type => type !== ''))])));
const ERROR_NAMES: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(Object.entries(ERROR_SIGNATURES).map(([name, signature]) => [selectorOf(signature), name])));
export interface EscrowRevert { readonly name: string; readonly args: readonly string[]; }
/** Decodes custom-error revert data from the escrow. Unknown selectors and malformed arguments are integrity failures. */
export function decodeEscrowRevert(revertData: string): EscrowRevert {
  const data = strictHex(revertData);
  if (data.byteLength < 4) return corrupt();
  const selector = hexOf(data.subarray(0, 4)), types = ERROR_TYPES[selector], name = ERROR_NAMES[selector];
  if (types === undefined || name === undefined) return corrupt();
  const d = words(data.subarray(4), types.length);
  const args = types.map((type, index) => {
    const word = w(d, index);
    if (type === 'address') return wordAddress(word);
    if (type === 'bytes32') return hexOf(word);
    if (type === 'uint8') return wordUint(word, U8).toString();
    if (type === 'uint64') return wordUint(word, U64).toString();
    if (type === 'uint256') return wordUint(word, U256).toString();
    return corrupt();
  });
  return Object.freeze({ name, args: Object.freeze(args) });
}
