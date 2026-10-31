/**
 * G12 EVM transaction lifecycle: reserve -> prepare -> durable send-started -> one wallet send -> record hash ->
 * reconcile to the registry finality policy. TEST-ONLY: not exported from the domain facade, not wired into the
 * app, and it owns no provider. Chain reads arrive through an injected reader port (implemented over EIP-1193 by
 * packages/wallet/src/evm-submit.ts) and are retried only through read-retry.ts; the single send-capable call is
 * an injected EIP-1193 `request` and is never retried.
 *
 * Reconciliation never resends. It classifies an intent from chain state alone: the transaction receipt (checked
 * against the canonical block hash at its height), the transaction body (sender, nonce, destination, calldata,
 * value), the account nonce compared with the recorded nonce, and the escrow trade state read through the G08
 * authority reducer (authority.ts), whose contradiction detection is the reorg signal.
 */
import type { ChainObservation, CoreErrorCode, CoreResult, IntentV1, NetworkV1, TradeBinding } from '../../schemas/index.ts';
import { encodeBase64url, parseTradeBinding } from '../../schemas/index.ts';
import { createTradeAuthority, type ReconcileRequest, type TradeAuthority } from './authority.ts';
import { createCoreError, createOperationId } from './errors.ts';
import { LIFECYCLE_TRANSITIONS, type LifecycleJournal } from './intent-journal.ts';
import { retryRead, type ReadRetryOptions } from './read-retry.ts';

export type EscrowState = ChainObservation['state'];
export type Eip1193Request = (args: { readonly method: string; readonly params?: readonly unknown[] }) => Promise<unknown>;
/** Decimal block number and 0x-prefixed lowercase 32-byte hash. */
export interface EvmBlockRef { readonly number: string; readonly hash: string }
export interface EvmReceiptView { readonly transactionHash: string; readonly blockNumber: string; readonly blockHash: string; readonly status: 'success' | 'reverted' }
export interface EvmTransactionView {
  readonly hash: string; readonly from: string; readonly to: string | null; readonly nonce: string; readonly input: string; readonly value: string;
  readonly blockNumber: string | null;
}
/** Idempotent chain reads only. Every method is retried by read-retry.ts; none may send or sign. */
export interface EvmChainReader {
  chainId(signal: AbortSignal): Promise<CoreResult<string>>;
  head(tag: 'latest' | 'finalized', signal: AbortSignal): Promise<CoreResult<EvmBlockRef | null>>;
  blockHashAt(number: string, signal: AbortSignal): Promise<CoreResult<string | null>>;
  transactionCount(account: string, tag: 'latest' | 'pending', signal: AbortSignal): Promise<CoreResult<string>>;
  transaction(hash: string, signal: AbortSignal): Promise<CoreResult<EvmTransactionView | null>>;
  receipt(hash: string, signal: AbortSignal): Promise<CoreResult<EvmReceiptView | null>>;
  /** Escrow trade state for `binding` at a decimal block number. */
  escrowState(binding: TradeBinding, blockNumber: string, signal: AbortSignal): Promise<CoreResult<EscrowState>>;
  /** Native-decoded observation for the authority reducer (G08); `request` is the authority's reconcile request. */
  escrowObservation(binding: TradeBinding, request: ReconcileRequest): Promise<CoreResult<ChainObservation>>;
}
/** Registry finality (`evm-finalized-tag`) plus the confirmation depth that labels an intent `confirmed`. */
export interface EvmFinalityPolicy {
  readonly finality: { readonly kind: 'evm-finalized-tag' };
  /** Blocks including the receipt block: 1 = included in the latest block. */
  readonly confirmations: number;
  /** Blocks after preparation with the nonce unused and nothing pending before an intent may be declared dropped. */
  readonly dropAfterBlocks: number;
}
export function evmFinalityPolicy(network: Pick<NetworkV1, 'chain' | 'finality'>, confirmations: number, dropAfterBlocks: number): EvmFinalityPolicy {
  if (network.chain !== 'evm' || network.finality.kind !== 'evm-finalized-tag') throw new TypeError('EVM finalized-tag network required.');
  if (!Number.isSafeInteger(confirmations) || confirmations < 1 || confirmations > 10_000) throw new RangeError('confirmations out of range.');
  if (!Number.isSafeInteger(dropAfterBlocks) || dropAfterBlocks < 1 || dropAfterBlocks > 1_000_000) throw new RangeError('dropAfterBlocks out of range.');
  return Object.freeze({ finality: Object.freeze({ kind: 'evm-finalized-tag' as const }), confirmations, dropAfterBlocks });
}
/** The connected wallet as last reported by the adapter; `chainId` is decimal. */
export interface EvmWalletContext { readonly account: string; readonly chainId: string; readonly generation: number }
export interface EvmCall { readonly to: string; readonly data: string; readonly value: string }
/** Canonical, bounded preparedRequest content. No key, signature or raw provider data. */
export interface EvmPreparedRequest {
  readonly v: 1; readonly chainId: string; readonly from: string; readonly to: string; readonly data: string; readonly value: string;
  readonly nonce: string; readonly preparedAtBlock: string;
}
export interface EvmPrepareInput {
  readonly binding: TradeBinding; readonly action: IntentV1['action']; readonly expectedEscrowState: 'absent' | 'funded'; readonly call: EvmCall;
  /** Explicit user action only: the dropped (expired) or replaced intent this one supersedes. A dropped intent is superseded at its own nonce. */
  readonly supersedes?: string;
}
/** An in-memory prepare result. It is invalidated by any wallet account/chain change and never survives restart. */
export interface PreparedEvmIntent { readonly intentId: string; readonly request: EvmPreparedRequest; readonly generation: number }
export type EvmOutcome = 'prepared' | 'pending' | 'confirmed' | 'finalized' | 'replaced' | 'dropped' | 'reverted' | 'reorged';
export interface EvmReconciliation {
  readonly outcome: EvmOutcome; readonly intent: IntentV1; readonly escrowState: EscrowState | null;
  readonly evidence: 'none' | 'receipt' | 'nonce' | 'escrow-effect' | 'authority-conflict';
}
export interface EvmSubmission { readonly intent: IntentV1; readonly hash: string }
type Retrier = <T>(operation: (signal: AbortSignal) => Promise<CoreResult<T>>, options: ReadRetryOptions) => Promise<CoreResult<T>>;
export interface EvmTxLifecycleOptions {
  readonly journal: LifecycleJournal;
  readonly reader: EvmChainReader;
  /** The wallet's EIP-1193 request function. Used for eth_accounts/eth_chainId preflight and one eth_sendTransaction per intent. */
  readonly wallet: Eip1193Request;
  readonly policy: EvmFinalityPolicy;
  readonly now?: () => number;
  /** Test injection of the G13 retrier (fake clocks); defaults to read-retry.ts `retryRead`. */
  readonly retry?: Retrier;
}
export interface EvmTxLifecycle {
  /** Adapter wallet event: a changed or lost account/chain invalidates every prepare result and cancels un-sent intents. */
  walletChanged(next: EvmWalletContext | null): Promise<void>;
  prepare(input: EvmPrepareInput, signal?: AbortSignal): Promise<CoreResult<PreparedEvmIntent>>;
  submit(prepared: PreparedEvmIntent, signal?: AbortSignal): Promise<CoreResult<EvmSubmission>>;
  reconcile(intentId: string, signal?: AbortSignal): Promise<CoreResult<EvmReconciliation>>;
  /** Session restart: cancels prepared (never sent) intents and returns those that still need reconciliation. */
  recover(signal?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>>;
  dispose(): void;
}

const HASH = /^0x[0-9a-f]{64}$/, ADDRESS = /^0x[0-9a-f]{40}$/, DECIMAL = /^(0|[1-9][0-9]{0,77})$/, DATA = /^0x(?:[0-9a-f]{2})*$/;
const EFFECTS: Readonly<Record<IntentV1['action'], readonly EscrowState[] | null>> = Object.freeze({
  fund: Object.freeze(['funded', 'released', 'refunded'] as const), release: Object.freeze(['released'] as const), refund: Object.freeze(['refunded'] as const), approve: null,
});
const LATCHED: readonly IntentV1['state'][] = ['confirmed', 'finalized'];
const TERMINAL: readonly IntentV1['state'][] = ['failed', 'expired', 'replaced'];
const OUTCOME_OF: Readonly<Partial<Record<IntentV1['state'], EvmOutcome>>> = Object.freeze({ failed: 'reverted', expired: 'dropped', replaced: 'replaced', prepared: 'prepared' });

class LifecycleFailure extends Error {
  readonly code: CoreErrorCode;
  constructor(code: CoreErrorCode) { super('EVM transaction lifecycle step unavailable.'); this.code = code; }
}
const stop = (code: CoreErrorCode): never => { throw new LifecycleFailure(code); };
function unwrap<T>(result: CoreResult<T>): T { if (result.ok) return result.value; return stop(result.error.code); }
const lower = (value: string): string => value.toLowerCase();

function canonicalRequest(request: EvmPreparedRequest): string {
  return JSON.stringify({ v: 1, chainId: request.chainId, from: request.from, to: request.to, data: request.data, value: request.value, nonce: request.nonce, preparedAtBlock: request.preparedAtBlock });
}
function parsePreparedRequest(text: string): EvmPreparedRequest {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return stop('INTEGRITY_FAILURE'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return stop('INTEGRITY_FAILURE');
  const value = raw as Record<string, unknown>;
  const fields = ['chainId', 'from', 'to', 'data', 'value', 'nonce', 'preparedAtBlock'] as const;
  if (value.v !== 1 || Object.keys(value).length !== 8 || fields.some(key => typeof value[key] !== 'string')) return stop('INTEGRITY_FAILURE');
  const request = Object.freeze({ v: 1 as const, chainId: value.chainId as string, from: value.from as string, to: value.to as string, data: value.data as string,
    value: value.value as string, nonce: value.nonce as string, preparedAtBlock: value.preparedAtBlock as string });
  if (!DECIMAL.test(request.chainId) || !ADDRESS.test(request.from) || !ADDRESS.test(request.to) || !DATA.test(request.data) || !DECIMAL.test(request.value) ||
    !DECIMAL.test(request.nonce) || !DECIMAL.test(request.preparedAtBlock) || canonicalRequest(request) !== text) return stop('INTEGRITY_FAILURE');
  return request;
}
/** Only an EIP-1193 numeric code is read from a wallet error; messages and data are never copied. */
function providerCode(error: unknown): number | undefined {
  try {
    if (typeof error !== 'object' || error === null) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'number' ? descriptor.value : undefined;
  } catch { return undefined; }
}
const checked = <T>(value: T, valid: (value: T) => boolean): T => valid(value) ? value : stop('INTEGRITY_FAILURE');
const isBlock = (block: EvmBlockRef | null): boolean => block === null || (typeof block === 'object' && DECIMAL.test(block.number) && HASH.test(block.hash));

class EvmLifecycle implements EvmTxLifecycle {
  readonly #journal: LifecycleJournal;
  readonly #reader: EvmChainReader;
  readonly #wallet: Eip1193Request;
  readonly #policy: EvmFinalityPolicy;
  readonly #now: () => number;
  readonly #retry: Retrier;
  readonly #authorities = new Map<string, TradeAuthority>();
  readonly #prepared = new Map<string, { readonly generation: number; readonly intent: IntentV1 }>();
  readonly #sending = new Set<string>();
  #context: EvmWalletContext | null = null;
  #generation = 0;
  #disposed = false;
  #queue: Promise<unknown> = Promise.resolve();
  constructor(options: EvmTxLifecycleOptions) {
    if (typeof options.wallet !== 'function' || typeof options.reader !== 'object' || options.reader === null) throw new TypeError('reader and wallet required.');
    this.#journal = options.journal; this.#reader = options.reader; this.#wallet = options.wallet;
    this.#policy = evmFinalityPolicy({ chain: 'evm', finality: options.policy.finality }, options.policy.confirmations, options.policy.dropAfterBlocks);
    this.#now = options.now ?? Date.now; this.#retry = options.retry ?? retryRead;
  }
  /** The journal admits one operation at a time; lifecycle steps queue rather than racing into CONFLICT. */
  #serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(work, work);
    this.#queue = run.then(() => undefined, () => undefined);
    return run;
  }
  #fail(code: CoreErrorCode, readOnly = false): CoreResult<never> { return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly }) }; }
  async #guarded<T>(work: () => Promise<T>, fallback: CoreErrorCode): Promise<CoreResult<T>> {
    if (this.#disposed) return this.#fail('LOCKED');
    try { return { ok: true, value: await work() }; }
    catch (error) {
      try { if (error instanceof LifecycleFailure) return this.#fail(error.code); } catch { /* fall through */ }
      return this.#fail(fallback);
    }
  }
  #read<T>(signal: AbortSignal, read: (signal: AbortSignal) => Promise<CoreResult<T>>, isCurrent?: () => boolean): Promise<T> {
    const options: ReadRetryOptions = isCurrent === undefined ? { signal, operationId: createOperationId() } : { signal, operationId: createOperationId(), isCurrent };
    return this.#retry(read, options).then(unwrap);
  }
  #authority(binding: TradeBinding): TradeAuthority {
    const key = JSON.stringify([binding.networkId, binding.deploymentId, binding.tradeId]);
    let authority = this.#authorities.get(key);
    if (authority === undefined) {
      authority = createTradeAuthority({ binding, generation: 0, walletGeneration: 0,
        readValidated: (target, request) => this.#retry(signal => this.#reader.escrowObservation(target, { ...request, signal }), { signal: request.signal, operationId: createOperationId() }) });
      this.#authorities.set(key, authority);
    }
    return authority;
  }
  async #cancelPrepared(intentIds: readonly string[]): Promise<void> {
    for (const intentId of intentIds) {
      this.#prepared.delete(intentId);
      // Durable cancel before any send-capable call; a conflict means another step already moved it.
      await this.#serial(() => this.#journal.observe(intentId, { state: 'failed', hash: null }));
    }
  }
  /** Synchronous invalidation first (no prepare result survives it), then durable cancellation of un-sent intents. */
  #invalidate(next: EvmWalletContext | null, extra: readonly string[] = []): Promise<void> {
    this.#generation++;
    this.#context = next === null ? null : Object.freeze({ account: lower(next.account), chainId: next.chainId, generation: next.generation });
    return this.#cancelPrepared([...new Set([...this.#prepared.keys(), ...extra])]);
  }
  async walletChanged(next: EvmWalletContext | null): Promise<void> {
    const previous = this.#context;
    const same = previous !== null && next !== null && lower(previous.account) === lower(next.account) && previous.chainId === next.chainId && previous.generation === next.generation;
    if (same) return;
    await this.#invalidate(next);
  }
  prepare(input: EvmPrepareInput, external?: AbortSignal): Promise<CoreResult<PreparedEvmIntent>> {
    return this.#guarded(async () => {
      const context = this.#context, generation = this.#generation;
      if (context === null) return stop('LOCKED');
      if (external?.aborted) return stop('CANCELLED');
      const signal = external ?? new AbortController().signal;
      const current = (): boolean => !this.#disposed && this.#generation === generation;
      let binding: TradeBinding;
      try { binding = parseTradeBinding(input.binding); } catch { return stop('INVALID_INPUT'); }
      const call = input.call;
      if (binding.chain !== 'evm' || typeof call !== 'object' || call === null || typeof call.to !== 'string' || !ADDRESS.test(lower(call.to)) || typeof call.data !== 'string' ||
        !DATA.test(call.data) || typeof call.value !== 'string' || !DECIMAL.test(call.value) || !['approve', 'fund', 'release', 'refund'].includes(input.action) ||
        (input.expectedEscrowState !== 'absent' && input.expectedEscrowState !== 'funded')) return stop('INVALID_INPUT');
      // Fresh reconciliation of chain identity and escrow state before anything is reserved.
      const chainId = await this.#read(signal, s => this.#reader.chainId(s), current);
      if (chainId !== context.chainId) return stop('WRONG_CHAIN');
      const observation = await this.#authority(binding).refresh(binding, signal);
      if (!observation.ok) return stop(observation.error.code);
      if (observation.value.state !== input.expectedEscrowState) return stop('CONFLICT');
      const head = checked(await this.#read(signal, s => this.#reader.head('latest', s), current), isBlock);
      if (head === null) return stop('UNAVAILABLE');
      let nonce: string;
      if (input.supersedes !== undefined) {
        const records = unwrap(await this.#serial(() => this.#journal.unresolved(binding, context.account, signal)));
        const original = records.find(record => record.intentId === input.supersedes);
        if (!original || original.submission.chain !== 'evm' || (original.state !== 'expired' && original.state !== 'replaced')) return stop('CONFLICT');
        const latest = checked(await this.#read(signal, s => this.#reader.transactionCount(context.account, 'latest', s), current), value => DECIMAL.test(value));
        if (original.state === 'expired') {
          // Same-nonce successor: if the dropped transaction ever reappears, at most one of the two can be included.
          if (original.submission.nonce === null || BigInt(latest) !== BigInt(original.submission.nonce)) return stop('CONFLICT');
          nonce = original.submission.nonce;
        } else nonce = checked(await this.#read(signal, s => this.#reader.transactionCount(context.account, 'pending', s), current), value => DECIMAL.test(value));
      } else nonce = checked(await this.#read(signal, s => this.#reader.transactionCount(context.account, 'pending', s), current), value => DECIMAL.test(value));
      const previousRecords = unwrap(await this.#serial(() => this.#journal.list(signal)));
      for (const previous of previousRecords) {
        if (previous.binding.chain !== 'evm' || previous.binding.networkId !== binding.networkId || lower(previous.account) !== context.account ||
            !['finalized', ...TERMINAL].includes(previous.state) ||
            !(previous.binding.deploymentId === binding.deploymentId && previous.binding.tradeId === binding.tradeId || previous.submission.chain === 'evm' && previous.submission.nonce === nonce)) continue;
        // Only a live prepared cancellation has local never-sent proof. Everything restored must be re-read.
        if (previous.state === 'failed' && previous.submission.chain === 'evm' && previous.submission.hash === null && this.#journal.isTerminalVerified(previous.intentId)) continue;
        unwrap(await this.reconcile(previous.intentId, signal));
      }
      if (!current()) return stop('CANCELLED');
      const request: EvmPreparedRequest = Object.freeze({ v: 1, chainId, from: context.account, to: lower(call.to), data: lower(call.data), value: call.value, nonce, preparedAtBlock: head.number });
      const random = crypto.getRandomValues(new Uint8Array(32));
      let intentId: string;
      try { intentId = encodeBase64url(random); } finally { random.fill(0); }
      const now = this.#now();
      if (!Number.isSafeInteger(now) || now < 0) return stop('INVALID_INPUT');
      const intent: IntentV1 = { version: 1, intentId, binding, account: context.account, action: input.action, state: 'prepared', walletGeneration: context.generation,
        expectedEscrowState: input.expectedEscrowState, preparedRequest: canonicalRequest(request), submission: { chain: 'evm', hash: null, nonce },
        replacementOf: input.supersedes ?? null, createdAt: now, updatedAt: now };
      const reserved = await this.#serial(() => {
        const revision = this.#journal.currentRevision();
        return revision === null ? Promise.resolve(this.#fail('LOCKED')) : this.#journal.reserve(intent, revision, signal);
      });
      unwrap(reserved);
      if (!current()) { await this.#cancelPrepared([intentId]); return stop('CANCELLED'); }
      this.#prepared.set(intentId, Object.freeze({ generation, intent }));
      return Object.freeze({ intentId, request, generation });
    }, 'UNAVAILABLE');
  }
  submit(prepared: PreparedEvmIntent, external?: AbortSignal): Promise<CoreResult<EvmSubmission>> {
    let sendStarted = false;
    return this.#guarded(async () => {
      const intentId = typeof prepared === 'object' && prepared !== null ? prepared.intentId : undefined;
      const entry = typeof intentId === 'string' ? this.#prepared.get(intentId) : undefined;
      // Only a live prepare result of the current wallet generation may submit, and only once.
      if (intentId === undefined || entry === undefined || entry.generation !== this.#generation || prepared.generation !== entry.generation || this.#sending.has(intentId)) return stop('CONFLICT');
      if (external?.aborted) return stop('CANCELLED');
      this.#prepared.delete(intentId); this.#sending.add(intentId);
      const request = parsePreparedRequest(entry.intent.preparedRequest), generation = this.#generation, context = this.#context;
      if (context === null || context.account !== request.from || context.chainId !== request.chainId) { await this.#cancelPrepared([intentId]); return stop('LOCKED'); }
      // Preflight the wallet immediately before the marker: a changed account/chain never reaches eth_sendTransaction.
      let accounts: unknown, chain: unknown;
      try { accounts = await this.#wallet({ method: 'eth_accounts' }); chain = await this.#wallet({ method: 'eth_chainId' }); }
      catch { await this.#cancelPrepared([intentId]); return stop('UNAVAILABLE'); }
      const walletAccount = Array.isArray(accounts) && typeof accounts[0] === 'string' ? lower(accounts[0]) : null;
      const walletChain = typeof chain === 'string' && /^0x[0-9a-f]{1,16}$/i.test(chain) ? BigInt(chain).toString() : null;
      if (walletAccount !== request.from || walletChain !== request.chainId || this.#generation !== generation) {
        // The wallet moved without (or before) its adapter event: treat it as an account/chain change.
        if (this.#generation === generation) await this.#invalidate(null, [intentId]); else await this.#cancelPrepared([intentId]);
        return stop(walletChain !== request.chainId ? 'WRONG_CHAIN' : 'LOCKED');
      }
      if (external?.aborted) { await this.#cancelPrepared([intentId]); return stop('CANCELLED'); }
      // Durable send-started marker (prepared -> broadcast-unknown CAS). Its failure means the wallet is never called.
      unwrap(await this.#serial(() => this.#journal.markSending(intentId)));
      // The marker is conservative: if the wallet changed meanwhile, stop here and leave reconciliation to classify it.
      if (this.#generation !== generation || this.#disposed) return stop('BROADCAST_UNKNOWN');
      sendStarted = true;
      let result: unknown;
      try {
        result = await this.#wallet({ method: 'eth_sendTransaction', params: [{ from: request.from, to: request.to, data: request.data,
          value: `0x${BigInt(request.value).toString(16)}`, nonce: `0x${BigInt(request.nonce).toString(16)}`, chainId: `0x${BigInt(request.chainId).toString(16)}` }] });
      } catch (error) {
        // EIP-1193 4001: the wallet reports the user rejected the request before signing; nothing was submitted.
        if (providerCode(error) === 4001) {
          const failed = await this.#serial(() => this.#journal.observe(intentId, { state: 'failed', hash: null }));
          if (failed.ok) unwrap(await this.#serial(() => this.#journal.authorizeTerminal(intentId, { state: 'failed', hash: null })));
          return stop(failed.ok ? 'USER_REJECTED' : 'BROADCAST_UNKNOWN');
        }
        return stop('BROADCAST_UNKNOWN');
      }
      if (typeof result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result)) return stop('BROADCAST_UNKNOWN');
      const hash = lower(result);
      const recorded = await this.#serial(() => this.#journal.observe(intentId, { state: 'pending', hash }));
      if (!recorded.ok) return stop('BROADCAST_UNKNOWN');
      return Object.freeze({ intent: recorded.value, hash });
    }, 'UNAVAILABLE').then(result => {
      if (!result.ok && sendStarted && result.error.code !== 'USER_REJECTED' && result.error.code !== 'BROADCAST_UNKNOWN') return this.#fail('BROADCAST_UNKNOWN');
      return result;
    });
  }
  async #find(intentId: string, signal: AbortSignal): Promise<IntentV1> {
    const records = unwrap(await this.#serial(() => this.#journal.list(signal)));
    return records.find(record => record.intentId === intentId) ?? stop('CONFLICT');
  }
  reconcile(intentId: string, external?: AbortSignal): Promise<CoreResult<EvmReconciliation>> {
    return this.#guarded(async () => {
      if (typeof intentId !== 'string') return stop('INVALID_INPUT');
      const signal = external ?? new AbortController().signal;
      const intent = await this.#find(intentId, signal);
      const done = (outcome: EvmOutcome, value: IntentV1, escrowState: EscrowState | null, evidence: EvmReconciliation['evidence']): EvmReconciliation =>
        Object.freeze({ outcome, intent: value, escrowState, evidence });
      const settledOutcome = OUTCOME_OF[intent.state];
      if (intent.state === 'prepared' || intent.state === 'failed' && intent.submission.chain === 'evm' && intent.submission.hash === null && this.#journal.isTerminalVerified(intentId)) return done(settledOutcome!, intent, null, 'none');
      this.#journal.revokeTerminalVerification(intentId);
      if (intent.submission.chain !== 'evm' || intent.submission.nonce === null) return stop('UNSUPPORTED_PROVIDER');
      const request = parsePreparedRequest(intent.preparedRequest), nonce = BigInt(intent.submission.nonce), account = request.from;
      const read = <T>(work: (signal: AbortSignal) => Promise<CoreResult<T>>): Promise<T> => this.#read(signal, work);
      if (await read(s => this.#reader.chainId(s)) !== request.chainId) return stop('WRONG_CHAIN');
      const authority = this.#authority(intent.binding);
      const observed = await authority.refresh(intent.binding, signal);
      const conflict = !observed.ok && authority.readConflict() !== null;
      if (!observed.ok && !conflict) return stop(observed.error.code);
      const escrowState = observed.ok ? observed.value.state : null;
      const latest = checked(await read(s => this.#reader.head('latest', s)), isBlock) ?? stop('UNAVAILABLE');
      const finalizedHead = checked(await read(s => this.#reader.head('finalized', s)), isBlock);
      const latestNumber = BigInt(latest.number), finalizedNumber = finalizedHead === null ? -1n : BigInt(finalizedHead.number);
      const effects = EFFECTS[intent.action];
      const latched = LATCHED.includes(intent.state);
      let outcome: EvmOutcome, evidence: EvmReconciliation['evidence'];
      const hash = intent.submission.hash;

      let receipt: EvmReceiptView | null = null;
      if (hash !== null) {
        const knownHash = hash;
        receipt = await read(s => this.#reader.receipt(knownHash, s));
        if (receipt !== null) {
          if (receipt.transactionHash !== knownHash || !DECIMAL.test(receipt.blockNumber) || !HASH.test(receipt.blockHash) || (receipt.status !== 'success' && receipt.status !== 'reverted')) return stop('INTEGRITY_FAILURE');
          const receiptBlock = receipt.blockNumber;
          // A receipt is only evidence while its block is still canonical at that height.
          const canonical = await read(s => this.#reader.blockHashAt(receiptBlock, s));
          if (canonical !== receipt.blockHash) receipt = null;
        }
        if (receipt !== null) {
          const tx = await read(s => this.#reader.transaction(knownHash, s));
          if (tx === null || tx.hash !== knownHash || lower(tx.from) !== account || tx.to === null || lower(tx.to) !== request.to || !DECIMAL.test(tx.nonce) ||
            BigInt(tx.nonce) !== nonce || lower(tx.input) !== request.data || tx.value !== request.value) return stop('INTEGRITY_FAILURE');
        }
      }
      if (receipt !== null) {
        const block = BigInt(receipt.blockNumber);
        if (block > latestNumber) return stop('INTEGRITY_FAILURE');
        const deep = latestNumber - block + 1n >= BigInt(this.#policy.confirmations);
        evidence = 'receipt';
        if (receipt.status === 'reverted') outcome = deep ? 'reverted' : 'pending';
        else {
          // A successful receipt must agree with the escrow's own state; a contradiction is never latched.
          if (effects !== null && escrowState !== null && !effects.includes(escrowState)) return stop('INTEGRITY_FAILURE');
          outcome = finalizedNumber >= block ? 'finalized' : deep ? 'confirmed' : 'pending';
        }
      } else if (latched && hash !== null) {
        // The anchor of an earlier confirmation disappeared: unlatch and reconcile again later.
        outcome = 'reorged'; evidence = 'receipt';
      } else {
        const latestCount = BigInt(checked(await read(s => this.#reader.transactionCount(account, 'latest', s)), value => DECIMAL.test(value)));
        if (latestCount > nonce) {
          evidence = 'nonce';
          if (hash !== null) outcome = 'replaced';
          else if (effects === null) outcome = 'pending';
          else if (escrowState !== null && effects.includes(escrowState)) {
            // Unknown hash: the nonce was consumed and the escrow shows this intent's effect. Depth is measured on the escrow itself.
            evidence = 'escrow-effect';
            const depthBlock = latestNumber - BigInt(this.#policy.confirmations) + 1n;
            const atFinalized = finalizedHead === null ? null : await read(s => this.#reader.escrowState(intent.binding, finalizedHead.number, s));
            const atDepth = depthBlock < 0n ? null : await read(s => this.#reader.escrowState(intent.binding, depthBlock.toString(), s));
            outcome = atFinalized !== null && effects.includes(atFinalized) ? 'finalized' : atDepth !== null && effects.includes(atDepth) ? 'confirmed' : 'pending';
          } else outcome = latched ? 'reorged' : conflict ? 'pending' : 'replaced';
        } else if (latched) {
          // Confirmed by escrow effect earlier, but the nonce is unused again: the inclusion was reorganized away.
          outcome = 'reorged'; evidence = 'nonce';
        } else {
          evidence = 'nonce';
          const knownHash = hash;
          const inPool = knownHash === null ? null : await read(s => this.#reader.transaction(knownHash, s));
          const pendingCount = BigInt(checked(await read(s => this.#reader.transactionCount(account, 'pending', s)), value => DECIMAL.test(value)));
          const expired = latestNumber >= BigInt(request.preparedAtBlock) + BigInt(this.#policy.dropAfterBlocks);
          outcome = inPool === null && pendingCount <= nonce && expired ? 'dropped' : 'pending';
        }
      }
      if (conflict && (outcome === 'confirmed' || outcome === 'finalized' || latched)) { outcome = 'reorged'; evidence = 'authority-conflict'; }

      let target: IntentV1['state'] | null = outcome === 'pending' ? (hash !== null ? 'pending' : null) : outcome === 'confirmed' ? 'confirmed' : outcome === 'finalized' ? 'finalized' :
        outcome === 'replaced' ? 'replaced' : outcome === 'dropped' ? 'expired' : outcome === 'reverted' ? 'failed' : outcome === 'reorged' ? 'reorged' : null;
      // The recorded terminal label is not proof after restoration (or a later native contradiction).
      if (TERMINAL.includes(intent.state) && target !== intent.state) { target = 'reorged'; outcome = 'reorged'; }
      const authorize = async (value: IntentV1): Promise<void> => {
        const finalizedReceipt = receipt !== null && BigInt(receipt.blockNumber) <= finalizedNumber;
        if (outcome === 'finalized' || outcome === 'reverted' && finalizedReceipt || outcome === 'replaced' || outcome === 'dropped')
          unwrap(await this.#serial(() => this.#journal.authorizeTerminal(intentId, { state: value.state, hash }, signal)));
      };
      if (target === null || target === intent.state || (target === 'reorged' && !['pending', 'confirmed', 'finalized', ...TERMINAL].includes(intent.state))) {
        await authorize(intent); return done(outcome, intent, escrowState, evidence);
      }
      // An observation that would move a latched label backwards is itself a contradiction: unlatch instead.
      let next = target;
      if (!LIFECYCLE_TRANSITIONS[intent.state].includes(next)) {
        if (!latched) return done(outcome, intent, escrowState, evidence);
        next = 'reorged'; outcome = 'reorged';
      }
      const written = unwrap(await this.#serial(() => this.#journal.observe(intentId, { state: next, hash })));
      await authorize(written); return done(outcome, written, escrowState, evidence);
    }, 'UNAVAILABLE');
  }
  recover(external?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>> {
    return this.#guarded(async () => {
      const signal = external ?? new AbortController().signal;
      const records = unwrap(await this.#serial(() => this.#journal.list(signal)));
      // Prepare results never survive restart: a prepared (never marked) intent is cancelled before anything else.
      const prepared = records.filter(record => record.state === 'prepared' && !this.#prepared.has(record.intentId) && !this.#sending.has(record.intentId));
      for (const record of prepared) unwrap(await this.#serial(() => this.#journal.observe(record.intentId, { state: 'failed', hash: null })));
      return Object.freeze(records.filter(record => record.state !== 'prepared' && (!['finalized', ...TERMINAL].includes(record.state) || !this.#journal.isTerminalVerified(record.intentId))));
    }, 'UNAVAILABLE');
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#generation++; this.#prepared.clear();
    for (const authority of this.#authorities.values()) authority.dispose();
    this.#authorities.clear();
  }
}
export function createEvmTxLifecycle(options: EvmTxLifecycleOptions): EvmTxLifecycle { return new EvmLifecycle(options); }
