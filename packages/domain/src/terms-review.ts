/**
 * Local, offline review of G16 EVM trade terms against an already loaded G11 registry. Review is not acceptance:
 * nothing here signs, verifies a signature, computes the EIP-712 digest, contacts a chain or enables funding.
 *
 * FROZEN CONTRACT (coordinator-owned). Implementations may change function bodies only; changing exported names,
 * shapes or rejection codes needs the integrator.
 *
 * Input format `p2p-offramp/local-terms-review/v1` is a local file/preview container, not a relay wire protocol:
 * { "format": TERMS_REVIEW_FORMAT, "terms": EvmTradeTermsV1, "privateAgreement": PrivateAgreementV1 }.
 * `terms` uses the established local EVM field convention (packages/wallet EvmTermsInput, scenario fixtures):
 * v=1 and mode=basic-manual-v1 are implied; native assets use assetKind "native" with the zero address.
 */
import type { DeploymentV1, NetworkV1 } from '../../schemas/index.ts';
import type { CapabilityV1, PrivateAgreementV1 } from './trade-terms.ts';

export const TERMS_REVIEW_FORMAT = 'p2p-offramp/local-terms-review/v1';
/** Private agreement is <= 16 KiB; the container adds public terms and JSON overhead. */
export const MAX_TERMS_REVIEW_BYTES = 64 * 1024;

export interface EvmTradeTermsV1 {
  readonly orderId: string; readonly revision: string; readonly networkId: string; readonly deploymentId: string;
  readonly seller: string; readonly buyer: string; readonly assetKind: 'native' | 'erc20'; readonly asset: string;
  readonly amountBaseUnits: string; readonly privateAgreementHash: string; readonly capabilitiesHash: string;
  readonly sellerNonce: string; readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
}
export interface TermsReviewDocumentV1 {
  readonly format: typeof TERMS_REVIEW_FORMAT;
  readonly terms: EvmTradeTermsV1;
  readonly privateAgreement: PrivateAgreementV1;
}

/**
 * Fixed rejection codes, in check order. The first failing check wins so results are deterministic.
 * - TOO_LARGE: byte length > MAX_TERMS_REVIEW_BYTES, or a G16 size limit (instructions/agreement/capabilities count).
 * - MALFORMED: not strict UTF-8/bounded JSON, or the container is not exactly {format, terms, privateAgreement}.
 * - UNSUPPORTED_FORMAT: `format` is a string other than TERMS_REVIEW_FORMAT, or agreement v != 1.
 * - INVALID_TERMS: public terms fail exact-key/canonical-encoding checks (see implementation notes).
 * - INVALID_AGREEMENT: private agreement fails encodePrivateAgreement validation.
 * - AGREEMENT_MISMATCH: agreement orderId/revision differ from the public terms.
 * - AGREEMENT_HASH_MISMATCH / CAPABILITIES_HASH_MISMATCH: recomputed SHA-256 differs from the public field.
 * - UNKNOWN_NETWORK, NOT_EVM_NETWORK, UNKNOWN_DEPLOYMENT: registry lookup failures.
 * - UNSUPPORTED_ASSET: no registry asset of that kind/address on the network, or the deployment does not list it.
 * - UNFUNDABLE_WINDOW: no chain time t < acceptBefore satisfies 1800 <= escrowExpiry - t <= 604800 (G16).
 * - UNAVAILABLE: the SHA-256 provider failed.
 */
export type TermsReviewRejection =
  | 'TOO_LARGE' | 'MALFORMED' | 'UNSUPPORTED_FORMAT' | 'INVALID_TERMS' | 'INVALID_AGREEMENT' | 'AGREEMENT_MISMATCH'
  | 'AGREEMENT_HASH_MISMATCH' | 'CAPABILITIES_HASH_MISMATCH' | 'UNKNOWN_NETWORK' | 'NOT_EVM_NETWORK' | 'UNKNOWN_DEPLOYMENT'
  | 'UNSUPPORTED_ASSET' | 'UNFUNDABLE_WINDOW' | 'UNAVAILABLE';

/** Narrow read-only registry view; RegistryService satisfies it. */
export interface RegistryLookup {
  network(id: string): NetworkV1 | null;
  deployment(networkId: string, deploymentId: string): DeploymentV1 | null;
}
export type Sha256 = (bytes: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>;

/** Frozen, display-ready result. Every string is the exact validated input or registry value; nothing is reformatted. */
export interface ReviewedEvmTerms {
  readonly network: { readonly id: string; readonly chainId: string; readonly environment: NetworkV1['environment'] };
  readonly deployment: { readonly id: string; readonly address: string; readonly protocolVersion: number };
  /** Native: address null (terms carry the zero address). ERC-20: the registry token address. */
  readonly asset: { readonly id: string; readonly kind: 'native' | 'erc20'; readonly address: string | null; readonly decimals: number };
  readonly orderId: string; readonly revision: string; readonly sellerNonce: string;
  readonly seller: string; readonly buyer: string; readonly amountBaseUnits: string;
  readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
  readonly agreement: {
    readonly fiatCurrency: string; readonly fiatMinorUnits: string; readonly fiatScale: number;
    readonly paymentInstructions: string; readonly capabilities: readonly CapabilityV1[];
  };
  readonly privateAgreementSha256: string; readonly capabilitiesSha256: string;
  /** This core build supports no optional capabilities, so every listed capability ID appears here (G16: reject before wallet). */
  readonly unsupportedCapabilities: readonly string[];
}
export type TermsReviewResult =
  | { readonly ok: true; readonly value: ReviewedEvmTerms }
  | { readonly ok: false; readonly code: TermsReviewRejection };

/** Bytes → frozen result. Never throws for any input; size is checked before decoding. */
export declare function reviewTermsBytes(registry: RegistryLookup, bytes: Uint8Array, sha256?: Sha256): Promise<TermsReviewResult>;
/** Already-parsed document → frozen result. Never throws for any input. */
export declare function reviewTermsDocument(registry: RegistryLookup, document: unknown, sha256?: Sha256): Promise<TermsReviewResult>;
