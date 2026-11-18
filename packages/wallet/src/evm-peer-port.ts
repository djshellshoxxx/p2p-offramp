/**
 * D1 composition: implements the exchange's PeerAcceptanceVerifierPort and PeerReplayStorePort with this package's
 * account-classifying verifier and the encrypted replay ledger. The exchange declares the ports and never imports this
 * module; the application (or a test) injects the returned ports into `createTermsExchange({ peerAcceptance })`.
 *
 * Trust: the verifier derives the domain from the injected local registry; the exchange's reviewed terms must name the
 * same chain and escrow, and its termsHash must equal the one recomputed here. Ledger calls are serialized per vault
 * session (the ledger refuses overlapping calls); another tab's commit still surfaces as CONFLICT and locks this vault
 * session, as for every vault consumer. Nothing here signs, sends, prompts a wallet or prepares a transaction.
 */
import type { PeerAcceptanceCode, PeerAcceptanceVerifierPort, PeerPortResult, PeerReplayScope as ExchangeReplayScope, PeerReplayStorePort,
  PeerVerificationRequest, PeerVerifiedEvidence } from '../../exchange/index.ts';
import type { CoreErrorCode, CoreResult, VaultService, VaultSession, VaultSessionAuthority } from '../../schemas/index.ts';
import { evmTermsHash, type EvmTermsInput } from './evm-terms.ts';
import { resolvePeerDomain, type PeerRegistryView } from './evm-peer-acceptance.ts';
import { createPeerAcceptanceVerifier, isPeerAcceptanceEvidence, type PeerAcceptanceEvidence, type PeerVerifyCode } from './evm-peer-verifier.ts';
import { CandidatePeerReplayLedger, type PeerReplayScope as LedgerScope } from './evm-peer-replay.ts';
import type { Eip1193Request } from './evm-submit.ts';

export interface EvmPeerPortOptions {
  readonly registry: PeerRegistryView;
  /** Read-only EIP-1193 request for the user's chosen RPC (eth_chainId, eth_getBlockByNumber, eth_getCode, eth_call). */
  readonly request: Eip1193Request;
  readonly vault: Pick<VaultService, 'read' | 'commit'> & VaultSessionAuthority;
  readonly session: VaultSession;
  readonly timeoutMs?: number;
}
export interface EvmPeerPorts {
  readonly verifier: PeerAcceptanceVerifierPort;
  readonly replay: PeerReplayStorePort;
  dispose(): void;
}
const ZERO = `0x${'0'.repeat(40)}`;
const hexBytes = (value: string): Uint8Array => Uint8Array.from(value.slice(2).match(/../g) ?? [], pair => parseInt(pair, 16));
const mapCore = (code: CoreErrorCode): PeerPortResult<never> => {
  const known: PeerAcceptanceCode = code === 'CONFLICT' ? 'CONFLICT' : code === 'LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED'
    : code === 'EXPIRED' ? 'EXPIRED' : code === 'LOCKED' ? 'LOCKED' : code === 'INVALID_INPUT' ? 'INVALID_INPUT' : code === 'UNAUTHORIZED' ? 'UNAUTHORIZED'
      : code === 'INTEGRITY_FAILURE' || code === 'UNSUPPORTED_VERSION' ? 'INTEGRITY_FAILURE' : code === 'CANCELLED' ? 'CANCELLED' : 'UNAVAILABLE';
  return Object.freeze({ ok: false as const, code: known });
};
/** The verifier vocabulary is a subset of the port vocabulary. */
const fromVerifier = (code: PeerVerifyCode): PeerAcceptanceCode => code;

/** The exact TradeTerms input for locally reviewed terms (the same mapping the escrow's tradeIdOf uses). */
export function evmTermsFromReviewed(reviewed: PeerVerificationRequest['reviewed']): EvmTermsInput {
  return Object.freeze({ orderId: reviewed.orderId, revision: reviewed.revision, networkId: reviewed.network.id, deploymentId: reviewed.deployment.id,
    seller: reviewed.seller, buyer: reviewed.buyer, assetKind: reviewed.asset.kind, asset: reviewed.asset.address ?? ZERO,
    amountBaseUnits: reviewed.amountBaseUnits, privateAgreementHash: reviewed.privateAgreementSha256, capabilitiesHash: reviewed.capabilitiesSha256,
    sellerNonce: reviewed.sellerNonce, acceptBeforeSeconds: reviewed.acceptBeforeSeconds, escrowExpirySeconds: reviewed.escrowExpirySeconds });
}

export function createEvmPeerAcceptancePorts(options: EvmPeerPortOptions): EvmPeerPorts {
  const { registry } = options;
  const verifier = createPeerAcceptanceVerifier({ registry, request: options.request, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
  const ledger = new CandidatePeerReplayLedger(options.vault, options.session);
  // One ledger operation at a time per vault session; results are never retried automatically.
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
  const scope = (input: ExchangeReplayScope): LedgerScope | null => {
    if (typeof input !== 'object' || input === null || !Number.isSafeInteger(input.nowSeconds) || input.nowSeconds < 0 ||
        !Number.isSafeInteger(input.closesAtSeconds) || input.closesAtSeconds < 0 || typeof input.priority !== 'boolean') return null;
    return { ad: input.ad, peer: input.peer, acceptBeforeSeconds: input.acceptBeforeSeconds, nowSeconds: String(input.nowSeconds),
      closesAtSeconds: String(input.closesAtSeconds), priority: input.priority };
  };
  const done = <T>(result: CoreResult<T>): PeerPortResult<T> => result.ok ? Object.freeze({ ok: true as const, value: result.value }) : mapCore(result.error.code);

  const verifierPort: PeerAcceptanceVerifierPort = Object.freeze({
    async verify(request: PeerVerificationRequest, signal?: AbortSignal): Promise<PeerPortResult<PeerVerifiedEvidence>> {
      let terms: EvmTermsInput;
      try {
        terms = evmTermsFromReviewed(request.reviewed);
        const domain = resolvePeerDomain(registry, terms);
        // The exchange reviewed against a registry; it must be this one, with the same escrow and termsHash.
        if (domain === null || request.reviewed.network.chainId !== domain.chainId || request.reviewed.deployment.address !== domain.verifyingContract)
          return Object.freeze({ ok: false as const, code: 'WRONG_CHAIN' as const });
        if (evmTermsHash(domain, terms) !== request.termsHash) return Object.freeze({ ok: false as const, code: 'INTEGRITY_FAILURE' as const });
      } catch { return Object.freeze({ ok: false as const, code: 'INVALID_INPUT' as const }); }
      const wire = request.acceptance;
      const result = await verifier.verify({
        terms, role: request.role, signerMessagingKey: request.signerMessagingKey, counterpartyMessagingKey: request.counterpartyMessagingKey,
        nowSeconds: String(request.nowSeconds), envelopeExpiresAtSeconds: request.envelopeExpiresAtSeconds === null ? null : String(request.envelopeExpiresAtSeconds),
        binding: wire.binding, termsSignature: hexBytes(wire.termsSignature), bindingSignature: hexBytes(wire.bindingSignature),
      }, signal);
      if (!result.ok) return Object.freeze(result.reason === undefined ? { ok: false as const, code: fromVerifier(result.code) }
        : { ok: false as const, code: fromVerifier(result.code), reason: result.reason });
      return Object.freeze({ ok: true as const, value: result.value });
    },
  });
  const replayPort: PeerReplayStorePort = Object.freeze({
    admit(evidence: PeerVerifiedEvidence, input: ExchangeReplayScope) {
      const stable = scope(input);
      if (stable === null || !isPeerAcceptanceEvidence(evidence)) return Promise.resolve(Object.freeze({ ok: false as const, code: 'INVALID_INPUT' as const }));
      return serial(async () => {
        const result = await ledger.admitVerified(evidence as PeerAcceptanceEvidence, stable);
        if (result.ok) return Object.freeze({ ok: true as const, value: Object.freeze({ status: result.value.status }) });
        if (result.error.code !== 'CONFLICT') return mapCore(result.error.code);
        // The ledger reports a tombstone and a conflicting binding alike; a refused admission wrote nothing, so a
        // fresh read tells them apart (a live tombstone is never removed).
        const status = await ledger.status(evidence.termsHash, stable.nowSeconds, stable.acceptBeforeSeconds);
        return Object.freeze({ ok: false as const, code: status.ok && status.value.tombstoned ? 'TOMBSTONED' as const : 'CONFLICT' as const });
      });
    },
    tombstone(termsHash: string, input: ExchangeReplayScope) {
      const stable = scope(input);
      if (stable === null) return Promise.resolve(Object.freeze({ ok: false as const, code: 'INVALID_INPUT' as const }));
      return serial(async () => done(await ledger.tombstoneScoped(termsHash, stable)));
    },
    status(termsHash: string, input: ExchangeReplayScope) {
      const stable = scope(input);
      if (stable === null) return Promise.resolve(Object.freeze({ ok: false as const, code: 'INVALID_INPUT' as const }));
      return serial(async () => {
        // With the deadline, a termsHash retired past the high-water mark stays withdrawn (never resurrected).
        const result = await ledger.status(termsHash, stable.nowSeconds, stable.acceptBeforeSeconds);
        return result.ok ? Object.freeze({ ok: true as const, value: Object.freeze({ tombstoned: result.value.tombstoned }) }) : mapCore(result.error.code);
      });
    },
  });
  return Object.freeze({ verifier: verifierPort, replay: replayPort, dispose(): void { verifier.dispose(); ledger.dispose(); } });
}
