/**
 * D1 Option B composed statement verifier. For one signer it checks, in order:
 * 1. the trusted context (role, both messaging keys, clock) against the strict binding and the locally reviewed terms;
 * 2. the EIP-712 domain, derived only from the locally loaded registry entry (never from a message or caller domain);
 * 3. the account class, from native `eth_getCode` at one recorded block:
 *    - empty code: EOA. Both signatures are strict 65-byte low-s v=27/28 recoveries to the account. Anything else
 *      (for example an ERC-6492 wrapper of an undeployed contract wallet) is refused UNSUPPORTED (counterfactual).
 *    - an EIP-7702 delegation designator (0xef0100 || 20-byte address): refused UNSUPPORTED (delegated). An account
 *      that has both a key and delegated code needs its own policy decision before it can be supported.
 *    - other code starting 0xef (reserved by EIP-3541): refused UNSUPPORTED.
 *    - other code: contract wallet. ERC-1271 `isValidSignature` must return the magic value for BOTH digests, via
 *      eth_call at the same recorded block. No EOA fallback, no low-s rule (deduplication never uses signature bytes).
 * 4. that the block is still canonical, the account code unchanged, the chain and genesis unchanged, the escrow
 *    deployment code equal to the registry's runtime hash, and the block timestamp before the deadline.
 * The recorded block is the provider's 'latest', which must be within maxAnchorAgeSeconds of the local clock (and not
 * ahead of it); every code read and eth_call is pinned to it by EIP-1898 `{blockHash, requireCanonical: true}`, and a
 * provider that does not support that fails closed.
 *
 * Results are point-in-time and unfinalized. Every economic recheck calls verify again at a fresh block; a contract
 * wallet's policy is mutable and a proxy's code hash cannot freeze it. Read-only: no signing, sending or wallet prompt.
 * Requests go through an injected EIP-1193 read port; tests use fakes or a loopback Anvil node.
 */
import type { NetworkV1, DeploymentV1 } from '../../schemas/index.ts';
import { intentData } from '../../schemas/index.ts';
import { evmTermsHash, keccak256, snapshotEvmTerms, verifyEoaSignature, type EvmTermsInput } from './evm-terms.ts';
import { peerAcceptanceHash, resolvePeerDomain, snapshotPeerAcceptance, type PeerAcceptanceV1, type PeerRegistryView } from './evm-peer-acceptance.ts';
import type { Eip1193Request } from './evm-submit.ts';

export const PEER_VERIFIER_LIMITS = Object.freeze({
  /** Decoded bytes per contract-wallet signature (the exchange carrier budget). EOA signatures are exactly 65. */
  contractSignatureBytes: 2048,
  /** EIP-170 runtime size bound for any code read. */
  runtimeBytes: 24_576,
  /** Gas for each isValidSignature eth_call. */
  gas: 100_000,
  /** Concurrent verifications per verifier. The exchange also runs at most one per session and dedupes rumors. */
  pending: 16,
  timeoutMs: 10_000,
  /** The recorded 'latest' block must be at most this old against the trusted local clock... */
  maxAnchorAgeSeconds: 900,
  /** ...and at most this far ahead of it. */
  maxAnchorFutureSeconds: 300,
});
export const EIP7702_DESIGNATOR_PREFIX = '0xef0100';
const ERC1271_MAGIC = '0x1626ba7e' + '0'.repeat(56);
const ERC6492_SUFFIX = '6492'.repeat(16);
export type PeerVerifyCode = 'INVALID_INPUT' | 'UNAUTHORIZED' | 'EXPIRED' | 'WRONG_CHAIN' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'TIMEOUT'
  | 'CANCELLED' | 'INTEGRITY_FAILURE' | 'LIMIT_EXCEEDED' | 'CONFLICT';
export type PeerUnsupportedReason = 'eip7702-delegated' | 'counterfactual-or-undeployed' | 'reserved-code-prefix'
  /** UNAVAILABLE: the provider's 'latest' block is too old or ahead of the local clock. */
  | 'stale-block' | 'future-block';
export interface PeerVerifyInput {
  /** Locally reviewed terms (EvmTermsInput shape). */
  readonly terms: EvmTermsInput;
  /** From the authenticated session, never from the message. */
  readonly role: 'seller' | 'buyer'; readonly signerMessagingKey: string; readonly counterpartyMessagingKey: string;
  /** Trusted local clock, canonical decimal seconds. */
  readonly nowSeconds: string;
  /** Authenticated envelope deadline on arrival, or null for a recheck of a stored statement. */
  readonly envelopeExpiresAtSeconds: string | null;
  readonly binding: PeerAcceptanceV1; readonly termsSignature: Uint8Array; readonly bindingSignature: Uint8Array;
}
export interface PeerAcceptanceEvidence {
  readonly scheme: 'eoa' | 'erc1271';
  readonly binding: Readonly<PeerAcceptanceV1>;
  readonly termsHash: string; readonly bindingHash: string;
  readonly networkId: string; readonly deploymentId: string; readonly chainId: string; readonly verifyingContract: string;
  readonly effectiveNotAfterSeconds: string;
  readonly anchor: Readonly<{ height: string; hash: string; timestamp: string }>;
  /** keccak256 of the contract wallet's runtime code at the anchor; null for an EOA. */
  readonly walletCodeKeccak256: string | null;
  readonly finality: 'unfinalized';
  readonly economicPreparationAllowed: false;
}
export type PeerVerifyResult = { readonly ok: true; readonly value: Readonly<PeerAcceptanceEvidence> } |
  { readonly ok: false; readonly code: PeerVerifyCode; readonly reason?: PeerUnsupportedReason };
export interface PeerVerifierOptions {
  readonly registry: PeerRegistryView;
  readonly request: Eip1193Request;
  readonly timeoutMs?: number;
  readonly monotonicNow?: () => number;
  /** Bound on the recorded block's age against the local clock (default PEER_VERIFIER_LIMITS.maxAnchorAgeSeconds). */
  readonly maxAnchorAgeSeconds?: number;
}
export interface PeerAcceptanceVerifier {
  verify(input: PeerVerifyInput, signal?: AbortSignal): Promise<PeerVerifyResult>;
  dispose(): void;
}

/** Evidence objects minted by a verifier in this module. Replay admission accepts only these (identity, not shape). */
const minted = new WeakSet<object>();
export function isPeerAcceptanceEvidence(value: unknown): value is PeerAcceptanceEvidence {
  return typeof value === 'object' && value !== null && minted.has(value);
}

const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const HASH = /^0x[0-9a-f]{64}$/, QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/, CODE = /^0x(?:[0-9a-f]{2})*$/;
const U64 = (1n << 64n) - 1n;
const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
class Refusal extends Error {
  readonly code: PeerVerifyCode; readonly reason: PeerUnsupportedReason | undefined;
  constructor(code: PeerVerifyCode, reason?: PeerUnsupportedReason) { super('Peer acceptance unavailable.'); this.code = code; this.reason = reason; }
}
const stop = (code: PeerVerifyCode, reason?: PeerUnsupportedReason): never => { throw new Refusal(code, reason); };
function seconds(value: unknown, allowZero: boolean): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/.test(value)) return stop('INVALID_INPUT');
  const number = BigInt(value);
  if (number > U64 || (!allowZero && number === 0n)) return stop('INVALID_INPUT');
  return number;
}
function signatureCopy(value: unknown): Uint8Array {
  let size: number;
  try { if (!(value instanceof Uint8Array)) return stop('INVALID_INPUT'); size = byteLength.call(value) as number; } catch { return stop('INVALID_INPUT'); }
  if (size < 1 || size > PEER_VERIFIER_LIMITS.contractSignatureBytes) return stop('LIMIT_EXCEEDED');
  const copy = new Uint8Array(size); Uint8Array.prototype.set.call(copy, value); return copy;
}
function own(value: unknown, key: string): unknown {
  try {
    if (typeof value !== 'object' || value === null) return stop('INTEGRITY_FAILURE');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return stop('INTEGRITY_FAILURE');
    return descriptor.value;
  } catch { return stop('INTEGRITY_FAILURE'); }
}
const quantity = (value: unknown): bigint => typeof value === 'string' && value.length <= 66 && QUANTITY.test(value) ? BigInt(value) : stop('INTEGRITY_FAILURE');
const blockHash = (value: unknown): string => typeof value === 'string' && HASH.test(value) ? value : stop('INTEGRITY_FAILURE');
function header(raw: unknown): Readonly<{ height: string; hash: string; timestamp: string }> {
  return Object.freeze({ height: quantity(own(raw, 'number')).toString(), hash: blockHash(own(raw, 'hash')), timestamp: quantity(own(raw, 'timestamp')).toString() });
}
function code(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2 + 2 * PEER_VERIFIER_LIMITS.runtimeBytes || !CODE.test(value)) return stop('INTEGRITY_FAILURE');
  return value;
}
const codeHash = (value: string): string => hex(keccak256(Uint8Array.from(value.slice(2).match(/../g) ?? [], pair => parseInt(pair, 16))));
/** ABI calldata for isValidSignature(bytes32,bytes). */
function isValidSignatureCall(digest: string, signature: Uint8Array): string {
  return '0x1626ba7e' + digest + '40'.padStart(64, '0') + signature.length.toString(16).padStart(64, '0') +
    hex(signature).padEnd(Math.ceil(signature.length / 32) * 64, '0');
}

export function createPeerAcceptanceVerifier(options: PeerVerifierOptions): PeerAcceptanceVerifier {
  const { registry, request } = options;
  const clock = options.monotonicNow ?? (() => performance.now());
  const timeout = options.timeoutMs ?? PEER_VERIFIER_LIMITS.timeoutMs;
  const maxAge = options.maxAnchorAgeSeconds ?? PEER_VERIFIER_LIMITS.maxAnchorAgeSeconds;
  if (typeof request !== 'function' || typeof registry?.network !== 'function' || typeof registry.deployment !== 'function' ||
      typeof clock !== 'function' || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000 ||
      !Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > 86_400) throw new TypeError('Invalid peer verifier configuration.');
  const jobs = new Set<AbortController>();
  let disposed = false;

  async function verify(input: PeerVerifyInput, signal?: AbortSignal): Promise<PeerVerifyResult> {
    const refused = (refusal: PeerVerifyCode, reason?: PeerUnsupportedReason): PeerVerifyResult =>
      Object.freeze(reason === undefined ? { ok: false as const, code: refusal } : { ok: false as const, code: refusal, reason });
    let aborted = false;
    try { if (signal !== undefined) aborted = abortedGetter.call(signal) as boolean; } catch { return refused('INVALID_INPUT'); }
    if (disposed || aborted) return refused('CANCELLED');
    if (jobs.size >= PEER_VERIFIER_LIMITS.pending) return refused('LIMIT_EXCEEDED');
    // Snapshot every caller value before the first await; later caller mutation cannot change what is verified.
    const owned: Uint8Array[] = [];
    let terms: Readonly<EvmTermsInput>, binding: Readonly<PeerAcceptanceV1>, role: 'seller' | 'buyer';
    let now: bigint, deadline: bigint, termsSignature: Uint8Array, bindingSignature: Uint8Array;
    let network: NetworkV1, deployment: DeploymentV1, domain: { chainId: string; verifyingContract: string }, termsHash: string, bindingHash: string;
    try {
      const raw = intentData(input, ['terms', 'role', 'signerMessagingKey', 'counterpartyMessagingKey', 'nowSeconds', 'envelopeExpiresAtSeconds',
        'binding', 'termsSignature', 'bindingSignature']);
      terms = snapshotEvmTerms(raw.terms as EvmTermsInput); binding = snapshotPeerAcceptance(raw.binding);
      if (raw.role !== 'seller' && raw.role !== 'buyer') return refused('INVALID_INPUT');
      role = raw.role;
      now = seconds(raw.nowSeconds, true);
      const envelope = raw.envelopeExpiresAtSeconds === null ? null : seconds(raw.envelopeExpiresAtSeconds, false);
      termsSignature = signatureCopy(raw.termsSignature); owned.push(termsSignature);
      bindingSignature = signatureCopy(raw.bindingSignature); owned.push(bindingSignature);
      const trusted = resolvePeerDomain(registry, terms);
      if (trusted === null) { owned.forEach(bytes => bytes.fill(0)); return refused('WRONG_CHAIN'); }
      domain = { chainId: trusted.chainId, verifyingContract: trusted.verifyingContract };
      network = registry.network(terms.networkId)!; deployment = registry.deployment(terms.networkId, terms.deploymentId)!;
      termsHash = evmTermsHash(domain, terms); bindingHash = peerAcceptanceHash(domain, binding);
      if (binding.termsHash !== termsHash || binding.role !== role || binding.account !== terms[role] ||
          binding.ownMessagingKey !== raw.signerMessagingKey || binding.counterpartyMessagingKey !== raw.counterpartyMessagingKey) {
        owned.forEach(bytes => bytes.fill(0)); return refused('UNAUTHORIZED');
      }
      deadline = [BigInt(binding.notAfterSeconds), seconds(terms.acceptBeforeSeconds, true), ...(envelope === null ? [] : [envelope])]
        .reduce((earliest, value) => value < earliest ? value : earliest);
      if (now >= deadline) { owned.forEach(bytes => bytes.fill(0)); return refused('EXPIRED'); }
    } catch (error) {
      owned.forEach(bytes => bytes.fill(0));
      return refused(error instanceof Refusal ? error.code : 'INVALID_INPUT');
    }
    if (disposed || jobs.size >= PEER_VERIFIER_LIMITS.pending) { owned.forEach(bytes => bytes.fill(0)); return refused(disposed ? 'CANCELLED' : 'LIMIT_EXCEEDED'); }

    const controller = new AbortController(); jobs.add(controller);
    let reason: PeerVerifyCode = 'CANCELLED';
    const onAbort = (): void => controller.abort();
    try { if (signal !== undefined) { EventTarget.prototype.addEventListener.call(signal, 'abort', onAbort, { once: true }); if (abortedGetter.call(signal)) onAbort(); } }
    catch { owned.forEach(bytes => bytes.fill(0)); jobs.delete(controller); return refused('INVALID_INPUT'); }
    const timer = setTimeout(() => { reason = 'TIMEOUT'; controller.abort(); }, timeout);
    let started = 0;
    const guard = (): void => {
      if (disposed || controller.signal.aborted) return stop(reason);
      const elapsed = clock();
      if (!Number.isFinite(elapsed) || elapsed < started) return stop('UNAVAILABLE');
      if (elapsed - started >= timeout) return stop('TIMEOUT');
    };
    const call = async (method: string, params: readonly unknown[] = []): Promise<unknown> => {
      guard();
      let result: unknown;
      try { result = await request({ method, params }); } catch { guard(); return stop('UNAVAILABLE'); }
      guard(); return result;
    };
    const work = async (): Promise<PeerVerifyResult> => {
      try {
        started = clock(); if (!Number.isFinite(started) || started < 0) return refused('UNAVAILABLE');
        if (quantity(await call('eth_chainId')).toString() !== domain.chainId) return refused('WRONG_CHAIN');
        const genesis = header(await call('eth_getBlockByNumber', ['0x0', false]));
        if (genesis.height !== '0' || genesis.hash !== network.genesisHash) return refused('WRONG_CHAIN');
        const anchor = header(await call('eth_getBlockByNumber', ['latest', false])), tag = '0x' + BigInt(anchor.height).toString(16);
        // A stale or future 'latest' (stuck provider, wrong chain view, bad clock) is not a current observation.
        if (BigInt(anchor.timestamp) + BigInt(maxAge) < now) return refused('UNAVAILABLE', 'stale-block');
        if (BigInt(anchor.timestamp) > now + BigInt(PEER_VERIFIER_LIMITS.maxAnchorFutureSeconds)) return refused('UNAVAILABLE', 'future-block');
        // Every state read is pinned to the recorded block by hash (EIP-1898) and must be canonical; a provider that
        // does not support this fails closed (UNAVAILABLE).
        const pin = Object.freeze({ blockHash: anchor.hash, requireCanonical: true });
        // The registry's escrow deployment must be the code at verifyingContract: the domain is the escrow it names.
        const runtime = deployment.runtime;
        if (runtime.kind !== 'evm-code' || codeHash(code(await call('eth_getCode', [deployment.address, pin]))) !== runtime.keccak256) return refused('INTEGRITY_FAILURE');
        // Chain time: the contract compares acceptBeforeSeconds against block.timestamp.
        if (BigInt(anchor.timestamp) >= deadline) return refused('EXPIRED');
        const walletCode = code(await call('eth_getCode', [binding.account, pin]));
        let scheme: 'eoa' | 'erc1271';
        if (walletCode === '0x') {
          scheme = 'eoa';
          if (termsSignature.length !== 65 || bindingSignature.length !== 65 ||
              hex(termsSignature).endsWith(ERC6492_SUFFIX) || hex(bindingSignature).endsWith(ERC6492_SUFFIX)) return refused('UNSUPPORTED', 'counterfactual-or-undeployed');
          let valid: boolean;
          try { valid = verifyEoaSignature(termsHash, termsSignature, binding.account) && verifyEoaSignature(bindingHash, bindingSignature, binding.account); }
          catch { return refused('INVALID_INPUT'); }
          if (!valid) return refused('UNAUTHORIZED');
        } else if (walletCode.startsWith(EIP7702_DESIGNATOR_PREFIX) && walletCode.length === 2 + 46) {
          return refused('UNSUPPORTED', 'eip7702-delegated');
        } else if (walletCode.startsWith('0xef')) {
          return refused('UNSUPPORTED', 'reserved-code-prefix');
        } else {
          scheme = 'erc1271';
          for (const [digest, signature] of [[termsHash, termsSignature], [bindingHash, bindingSignature]] as const) {
            const returned = await call('eth_call', [{ to: binding.account, data: isValidSignatureCall(digest, signature), gas: '0x' + PEER_VERIFIER_LIMITS.gas.toString(16) }, pin]);
            if (returned !== ERC1271_MAGIC) return refused('UNAUTHORIZED');
          }
          if (code(await call('eth_getCode', [binding.account, pin])) !== walletCode) return refused('INTEGRITY_FAILURE');
        }
        // The recorded block must still be canonical, on the same chain and genesis, with an unchanged registry view.
        const repeated = header(await call('eth_getBlockByNumber', [tag, false]));
        if (repeated.height !== anchor.height || repeated.hash !== anchor.hash || repeated.timestamp !== anchor.timestamp) return refused('INTEGRITY_FAILURE');
        if (quantity(await call('eth_chainId')).toString() !== domain.chainId) return refused('WRONG_CHAIN');
        const finalGenesis = header(await call('eth_getBlockByNumber', ['0x0', false]));
        if (finalGenesis.hash !== genesis.hash) return refused('WRONG_CHAIN');
        if (registry.network(terms.networkId) !== network || registry.deployment(terms.networkId, terms.deploymentId) !== deployment) return refused('CONFLICT');
        guard();
        const evidence: PeerAcceptanceEvidence = Object.freeze({
          scheme, binding, termsHash, bindingHash, networkId: terms.networkId, deploymentId: terms.deploymentId,
          chainId: domain.chainId, verifyingContract: domain.verifyingContract, effectiveNotAfterSeconds: deadline.toString(),
          anchor, walletCodeKeccak256: scheme === 'erc1271' ? codeHash(walletCode) : null, finality: 'unfinalized' as const,
          economicPreparationAllowed: false as const,
        });
        minted.add(evidence);
        return Object.freeze({ ok: true as const, value: evidence });
      } catch (error) {
        return refused(error instanceof Refusal ? error.code : 'UNAVAILABLE', error instanceof Refusal ? error.reason : undefined);
      } finally {
        owned.forEach(bytes => bytes.fill(0)); jobs.delete(controller); clearTimeout(timer);
        if (signal !== undefined) EventTarget.prototype.removeEventListener.call(signal, 'abort', onAbort);
      }
    };
    let release: () => void = () => undefined;
    const cancelled = new Promise<PeerVerifyResult>(resolve => {
      release = () => { owned.forEach(bytes => bytes.fill(0)); resolve(refused(reason)); };
      controller.signal.addEventListener('abort', release, { once: true });
      if (controller.signal.aborted) release();
    });
    try { return await Promise.race([work(), cancelled]); }
    finally { controller.signal.removeEventListener('abort', release); }
  }
  return Object.freeze({
    verify,
    dispose(): void { disposed = true; for (const controller of jobs) controller.abort(); },
  });
}
