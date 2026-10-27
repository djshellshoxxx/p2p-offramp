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
import { parseStrictJsonBytes, ValidationError, type DeploymentV1, type NetworkV1 } from '../../schemas/index.ts';
import { encodeCapabilities, encodePrivateAgreement, MAX_ESCROW_SECONDS, MIN_ESCROW_SECONDS, TermsError, type CapabilityV1,
  type PrivateAgreementV1 } from './trade-terms.ts';

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

const reject = (code: TermsReviewRejection): TermsReviewResult => Object.freeze({ ok: false, code });
const defaultSha256: Sha256 = bytes => globalThis.crypto.subtle.digest('SHA-256', bytes);

const CONTAINER_KEYS = ['format', 'terms', 'privateAgreement'] as const;
const TERMS_KEYS = ['orderId', 'revision', 'networkId', 'deploymentId', 'seller', 'buyer', 'assetKind', 'asset', 'amountBaseUnits',
  'privateAgreementHash', 'capabilitiesHash', 'sellerNonce', 'acceptBeforeSeconds', 'escrowExpirySeconds'] as const;
/** G16 capability-count limit, enforced by encodeCapabilities; the copy below only needs to preserve "more than this". */
const MAX_CAPABILITIES = 8;
// Same canonical rules as packages/wallet tradeTermsStructHash and the G11 registry parser (not importable from core).
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HEX32 = /^[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
const U64 = (1n << 64n) - 1n, U256 = (1n << 256n) - 1n;

/**
 * Exact own-enumerable key set, each value read exactly once into a null-prototype record, so a getter or proxy
 * cannot show one value to validation and another to the result. Null when not a non-array object; may throw for hostile input.
 */
function exactFields<K extends string>(input: unknown, keys: readonly K[]): Record<K, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const actual = Object.keys(input);
  if (actual.length !== keys.length || !keys.every(key => actual.includes(key))) return null;
  const out = Object.create(null) as Record<K, unknown>;
  for (const key of keys) out[key] = (input as Record<K, unknown>)[key];
  return out;
}
/** Shallow own-enumerable copy (null-prototype); null for non-objects and arrays. May throw for hostile input. */
function copyRecord(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(input)) out[key] = (input as Record<string, unknown>)[key];
  return out;
}
/**
 * Plain-data copy of the private agreement for encodePrivateAgreement, which then performs every field check.
 * Replacements keep the encoder's classification: non-records become null (INVALID_INPUT) and an over-long capability
 * list becomes MAX_CAPABILITIES + 1 nulls (LIMIT_EXCEEDED) without reading its entries.
 */
function copyAgreement(input: unknown): Record<string, unknown> | null {
  const agreement = copyRecord(input);
  if (agreement === null) return null;
  const capabilities = agreement.capabilities;
  if (!Array.isArray(capabilities)) { agreement.capabilities = null; return agreement; }
  const length: unknown = capabilities.length;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) agreement.capabilities = null;
  else if (length > MAX_CAPABILITIES) agreement.capabilities = new Array<null>(MAX_CAPABILITIES + 1).fill(null);
  else agreement.capabilities = Array.from({ length }, (_, index) => copyRecord(capabilities[index]));
  return agreement;
}

/** Canonical unsigned decimal (no sign, leading zero, exponent or fraction) in [minimum, max]; length-bounded before BigInt. */
function canonicalUnsigned(value: string, max: bigint, minimum: bigint): boolean {
  if (value.length > max.toString().length || !/^(0|[1-9][0-9]*)$/.test(value)) return false;
  const parsed = BigInt(value);
  return parsed >= minimum && parsed <= max;
}
const identifier = (value: string): boolean => ID.test(value) && !value.includes('..');
const account = (value: string): boolean => ADDRESS.test(value) && value !== ZERO_ADDRESS;

function canonicalTerms(fields: Record<(typeof TERMS_KEYS)[number], unknown>): EvmTradeTermsV1 | null {
  if (!TERMS_KEYS.every(key => typeof fields[key] === 'string')) return null;
  const terms = fields as EvmTradeTermsV1;
  const valid = identifier(terms.networkId) && identifier(terms.deploymentId)
    && [terms.orderId, terms.sellerNonce, terms.privateAgreementHash, terms.capabilitiesHash].every(value => HEX32.test(value))
    && account(terms.seller) && account(terms.buyer) && terms.seller !== terms.buyer
    && canonicalUnsigned(terms.revision, U64, 1n) && canonicalUnsigned(terms.amountBaseUnits, U256, 1n)
    && canonicalUnsigned(terms.acceptBeforeSeconds, U64, 0n) && canonicalUnsigned(terms.escrowExpirySeconds, U64, 0n)
    && (terms.assetKind === 'native' ? terms.asset === ZERO_ADDRESS : terms.assetKind === 'erc20' && account(terms.asset));
  return valid ? terms : null;
}

/**
 * True iff some integer chain time t >= 0 satisfies t < acceptBefore and 1800 <= expiry - t <= 604800 (G16 funding rule),
 * i.e. max(0, expiry - 604800) <= min(acceptBefore - 1, expiry - 1800); this already rejects acceptBefore = 0 and
 * expiry < 1800. Inputs are already canonical u64 strings.
 */
function fundable(acceptBeforeSeconds: string, escrowExpirySeconds: string): boolean {
  const accept = BigInt(acceptBeforeSeconds), expiry = BigInt(escrowExpirySeconds);
  const minimum = BigInt(MIN_ESCROW_SECONDS), maximum = BigInt(MAX_ESCROW_SECONDS);
  const earliest = expiry > maximum ? expiry - maximum : 0n;
  const latest = accept - 1n < expiry - minimum ? accept - 1n : expiry - minimum;
  return earliest <= latest;
}

/** Lowercase hex SHA-256 of a fresh copy, or null if the provider throws, rejects or returns anything but a 32-byte ArrayBuffer. */
async function digestHex(sha256: Sha256, bytes: Uint8Array): Promise<string | null> {
  try {
    const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
    const digest: unknown = await sha256(copy);
    if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32) return null;
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/** Bytes → frozen result. Never throws for any input; size is checked before decoding. */
export async function reviewTermsBytes(registry: RegistryLookup, bytes: Uint8Array, sha256?: Sha256): Promise<TermsReviewResult> {
  let copy: Uint8Array;
  try {
    if (!(bytes instanceof Uint8Array)) return reject('MALFORMED');
    if (bytes.byteLength > MAX_TERMS_REVIEW_BYTES) return reject('TOO_LARGE');
    // Copies by the real internal length, so a subclass misreporting byteLength is still bounded by the parser below.
    copy = new Uint8Array(bytes);
  } catch { return reject('MALFORMED'); }
  let parsed: unknown;
  try { parsed = parseStrictJsonBytes(copy, MAX_TERMS_REVIEW_BYTES); }
  catch (error) { return reject(error instanceof ValidationError && error.code === 'LIMIT_EXCEEDED' ? 'TOO_LARGE' : 'MALFORMED'); }
  return reviewTermsDocument(registry, parsed, sha256);
}

/** Already-parsed document → frozen result. Never throws for any input. */
export async function reviewTermsDocument(registry: RegistryLookup, input: unknown, sha256: Sha256 = defaultSha256): Promise<TermsReviewResult> {
  let container: Record<(typeof CONTAINER_KEYS)[number], unknown> | null;
  try { container = exactFields(input, CONTAINER_KEYS); } catch { return reject('MALFORMED'); }
  if (container === null || typeof container.format !== 'string') return reject('MALFORMED');
  if (container.format !== TERMS_REVIEW_FORMAT) return reject('UNSUPPORTED_FORMAT');

  let terms: EvmTradeTermsV1 | null;
  try { const fields = exactFields(container.terms, TERMS_KEYS); terms = fields && canonicalTerms(fields); } catch { return reject('INVALID_TERMS'); }
  if (terms === null) return reject('INVALID_TERMS');

  let agreement: PrivateAgreementV1, agreementBytes: Uint8Array<ArrayBuffer>, capabilityBytes: Uint8Array<ArrayBuffer>;
  try {
    const copied = copyAgreement(container.privateAgreement);
    if (copied === null) return reject('INVALID_AGREEMENT');
    agreement = copied as unknown as PrivateAgreementV1;
  } catch { return reject('INVALID_AGREEMENT'); }
  try { agreementBytes = encodePrivateAgreement(agreement); capabilityBytes = encodeCapabilities(agreement.capabilities); }
  catch (error) {
    // The encoders only ever see the plain-data copy, so anything thrown is a TermsError from this repository.
    const code = error instanceof TermsError ? error.code : undefined;
    return reject(code === 'UNSUPPORTED_VERSION' ? 'UNSUPPORTED_FORMAT' : code === 'LIMIT_EXCEEDED' ? 'TOO_LARGE' : 'INVALID_AGREEMENT');
  }
  if (agreement.orderId !== terms.orderId || agreement.revision !== terms.revision) return reject('AGREEMENT_MISMATCH');

  const privateAgreementSha256 = await digestHex(sha256, agreementBytes);
  if (privateAgreementSha256 === null) return reject('UNAVAILABLE');
  if (privateAgreementSha256 !== terms.privateAgreementHash) return reject('AGREEMENT_HASH_MISMATCH');
  const capabilitiesSha256 = await digestHex(sha256, capabilityBytes);
  if (capabilitiesSha256 === null) return reject('UNAVAILABLE');
  if (capabilitiesSha256 !== terms.capabilitiesHash) return reject('CAPABILITIES_HASH_MISMATCH');

  // Registry entries are read once into primitives; a lookup that throws or answers for another ID fails at its own step.
  let network: NetworkV1 | null, chainId: string, environment: NetworkV1['environment'];
  try {
    network = registry.network(terms.networkId);
    if (network === null || typeof network !== 'object' || network.id !== terms.networkId) return reject('UNKNOWN_NETWORK');
  } catch { return reject('UNKNOWN_NETWORK'); }
  try {
    if (network.chain !== 'evm') return reject('NOT_EVM_NETWORK');
    chainId = network.chainIdentity; environment = network.environment;
  } catch { return reject('NOT_EVM_NETWORK'); }
  let deployment: DeploymentV1 | null, deploymentAddress: string, protocolVersion: number;
  try {
    deployment = registry.deployment(terms.networkId, terms.deploymentId);
    if (deployment === null || typeof deployment !== 'object' || deployment.id !== terms.deploymentId) return reject('UNKNOWN_DEPLOYMENT');
    deploymentAddress = deployment.address; protocolVersion = deployment.protocolVersion;
  } catch { return reject('UNKNOWN_DEPLOYMENT'); }
  let asset: ReviewedEvmTerms['asset'];
  try {
    const kind = terms.assetKind, address = terms.asset;
    const entry = kind === 'native' ? network.assets.find(value => value.kind === 'native')
      : network.assets.find(value => value.kind === 'erc20' && value.address === address);
    if (entry === undefined) return reject('UNSUPPORTED_ASSET');
    const id = entry.id, decimals = entry.decimals;
    if (!deployment.supportedAssetIds.includes(id)) return reject('UNSUPPORTED_ASSET');
    asset = Object.freeze({ id, kind, address: kind === 'native' ? null : address, decimals });
  } catch { return reject('UNSUPPORTED_ASSET'); }

  if (!fundable(terms.acceptBeforeSeconds, terms.escrowExpirySeconds)) return reject('UNFUNDABLE_WINDOW');

  const capabilities = Object.freeze(agreement.capabilities.map(({ id, version, policyHash }) => Object.freeze({ id, version, policyHash })));
  const value: ReviewedEvmTerms = Object.freeze({
    network: Object.freeze({ id: terms.networkId, chainId, environment }),
    deployment: Object.freeze({ id: terms.deploymentId, address: deploymentAddress, protocolVersion }),
    asset,
    orderId: terms.orderId, revision: terms.revision, sellerNonce: terms.sellerNonce,
    seller: terms.seller, buyer: terms.buyer, amountBaseUnits: terms.amountBaseUnits,
    acceptBeforeSeconds: terms.acceptBeforeSeconds, escrowExpirySeconds: terms.escrowExpirySeconds,
    agreement: Object.freeze({ fiatCurrency: agreement.fiatCurrency, fiatMinorUnits: agreement.fiatMinorUnits, fiatScale: agreement.fiatScale,
      paymentInstructions: agreement.paymentInstructions, capabilities }),
    privateAgreementSha256, capabilitiesSha256,
    unsupportedCapabilities: Object.freeze(capabilities.map(capability => capability.id)),
  });
  return Object.freeze({ ok: true, value });
}
