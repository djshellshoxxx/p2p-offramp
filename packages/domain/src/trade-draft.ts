/** Fresh local G16 preview construction. No signing, messaging, persistence or economic action. */
import { parseTradeDraftDefaults, parseTradeDraftInput, ValidationError, type TradeDraftDefaultsV1 } from '../../schemas/index.ts';
import { checkFundingWindow, encodeCapabilities, encodePrivateAgreement, sha256Hex, type PrivateAgreementV1 } from './trade-terms.ts';
import { MAX_TERMS_REVIEW_BYTES, TERMS_REVIEW_FORMAT, type EvmTradeTermsV1, type RegistryLookup, type ReviewedEvmTerms,
  type Sha256, type TermsReviewRejection } from './terms-review.ts';

export interface TradeDraftBuildOptions {
  readonly nowSeconds: () => bigint;
  readonly isCurrent: () => boolean;
  readonly signal?: AbortSignal;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly sha256?: Sha256;
}
export type TradeDraftBuildResult = { readonly ok: true; readonly bytes: Uint8Array } |
  { readonly ok: false; readonly code: TermsReviewRejection };
class Refusal { readonly code: TermsReviewRejection; constructor(code: TermsReviewRejection) { this.code = code; } }
const stop = (code: TermsReviewRejection): never => { throw new Refusal(code); };
const ZERO = `0x${'0'.repeat(40)}`, U64 = (1n << 64n) - 1n;
const lengthOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;

/** Deliberately names only seven primitives; never copies the source document/party/private bytes. */
export function draftDefaultsFromReviewed(review: ReviewedEvmTerms): TradeDraftDefaultsV1 {
  return parseTradeDraftDefaults({ networkId: review.network.id, deploymentId: review.deployment.id, assetId: review.asset.id,
    amountBaseUnits: review.amountBaseUnits, fiatCurrency: review.agreement.fiatCurrency,
    fiatMinorUnits: review.agreement.fiatMinorUnits, fiatScale: review.agreement.fiatScale });
}

export async function buildTradeDraftDocument(registry: RegistryLookup, input: unknown, options: TradeDraftBuildOptions): Promise<TradeDraftBuildResult> {
  const owned = new Set<Uint8Array>();
  let output: Uint8Array | undefined;
  try {
    const draft = (() => {
      try { return parseTradeDraftInput(input); }
      catch (error) { return stop(error instanceof ValidationError && error.code === 'LIMIT_EXCEEDED' ? 'TOO_LARGE' : 'INVALID_TERMS'); }
    })();
    const guard = (): void => {
      try { if (options.signal?.aborted || options.isCurrent() !== true || options.signal?.aborted) return stop('UNAVAILABLE'); }
      catch { return stop('UNAVAILABLE'); }
    };
    const checkWindow = (): void => {
      guard(); let now: bigint;
      try { now = options.nowSeconds(); if (typeof now !== 'bigint' || now < 0n || now > U64) return stop('UNAVAILABLE'); }
      catch { return stop('UNAVAILABLE'); }
      guard();
      try { checkFundingWindow(draft.acceptBeforeSeconds, draft.escrowExpirySeconds, now.toString()); }
      catch { return stop('UNFUNDABLE_WINDOW'); }
    };
    const resolve = () => {
      guard();
      const network = registry.network(draft.networkId); guard();
      if (!network || network.id !== draft.networkId) return stop('UNKNOWN_NETWORK');
      if (network.chain !== 'evm') return stop('NOT_EVM_NETWORK');
      const deployment = registry.deployment(draft.networkId, draft.deploymentId); guard();
      if (!deployment || deployment.id !== draft.deploymentId) return stop('UNKNOWN_DEPLOYMENT');
      const asset = network.assets.find(entry => entry.id === draft.assetId);
      if (!asset || asset.kind !== 'native' && asset.kind !== 'erc20' || asset.transferPolicy !== 'exact-transfer' || !deployment.supportedAssetIds.includes(asset.id)) return stop('UNSUPPORTED_ASSET');
      return Object.freeze({ chainId: network.chainIdentity, environment: network.environment, deploymentAddress: deployment.address,
        kind: asset.kind, address: asset.address, decimals: asset.decimals });
    };
    checkWindow(); const initial = resolve(), pin = JSON.stringify(initial);
    const current = (): void => { checkWindow(); if (JSON.stringify(resolve()) !== pin) return stop('UNAVAILABLE'); guard(); };
    const random = (): string => {
      guard();
      const bytes = (options.randomBytes ?? (length => crypto.getRandomValues(new Uint8Array(length))))(32); guard();
      if (!(bytes instanceof Uint8Array) || lengthOf.call(bytes) !== 32) return stop('UNAVAILABLE');
      const copy = new Uint8Array(32); Uint8Array.prototype.set.call(copy, bytes); owned.add(copy);
      try { return Array.from(copy, byte => byte.toString(16).padStart(2, '0')).join(''); }
      finally { copy.fill(0); owned.delete(copy); }
    };
    const orderId = random(), sellerNonce = random(), agreementSalt = random();
    if (new Set([orderId, sellerNonce, agreementSalt]).size !== 3) return stop('UNAVAILABLE');
    const digest: Sha256 = async bytes => {
      guard(); const result = await (options.sha256 ?? (data => crypto.subtle.digest('SHA-256', data)))(bytes); current();
      if (!(result instanceof ArrayBuffer) || result.byteLength !== 32) return stop('UNAVAILABLE'); return result;
    };
    const hash = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
      owned.add(bytes);
      try { const value = await sha256Hex(bytes, digest); current(); return value; }
      finally { bytes.fill(0); owned.delete(bytes); }
    };
    const privateAgreement: PrivateAgreementV1 = Object.freeze({ v: 1, orderId, revision: '1', fiatCurrency: draft.fiatCurrency,
      fiatMinorUnits: draft.fiatMinorUnits, fiatScale: draft.fiatScale, paymentInstructions: draft.paymentInstructions,
      capabilities: Object.freeze([]), agreementSalt });
    const privateAgreementHash = await hash(encodePrivateAgreement(privateAgreement)); current();
    const capabilitiesHash = await hash(encodeCapabilities([])); current();
    const terms: EvmTradeTermsV1 = Object.freeze({ orderId, revision: '1', networkId: draft.networkId, deploymentId: draft.deploymentId,
      seller: draft.seller, buyer: draft.buyer, assetKind: initial.kind, asset: initial.address ?? ZERO,
      amountBaseUnits: draft.amountBaseUnits, privateAgreementHash, capabilitiesHash, sellerNonce,
      acceptBeforeSeconds: draft.acceptBeforeSeconds, escrowExpirySeconds: draft.escrowExpirySeconds });
    output = new TextEncoder().encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms, privateAgreement }));
    if (output.byteLength > MAX_TERMS_REVIEW_BYTES) return stop('TOO_LARGE');
    current(); const bytes = output; output = undefined;
    return Object.freeze({ ok: true as const, bytes });
  } catch (error) {
    let code: TermsReviewRejection = 'UNAVAILABLE';
    try { if (error instanceof Refusal) code = error.code; } catch { /* Foreign rejection reflection has no authority. */ }
    return Object.freeze({ ok: false as const, code });
  } finally { output?.fill(0); for (const bytes of owned) bytes.fill(0); }
}
