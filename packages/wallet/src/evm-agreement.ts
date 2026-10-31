/** Private/test-only G16 commitment + EOA acceptance verification; no wallet/provider prompt or transport.
 * Supplied domain consistency is not registry/deployment/finality approval, funding or fiat-payment evidence.
 * Reuses existing encoders, hashes and EOA verifier; this adds no crypto algorithm/provider qualification.
 */
import { encodePrivateAgreement, encodeCapabilities, sha256Hex, createCoreError, createOperationId, normalizeError,
  type PrivateAgreementV1, type CapabilityV1, type CoreResult, type CoreErrorCode } from '../../domain/index.ts';
import { intentData, CoreSchemaError } from '../../schemas/index.ts';
import { snapshotEvmDomain, snapshotEvmTerms, evmTermsHash, verifyEoaAcceptance } from './evm-terms.ts';

export interface EvmAgreementContext {
  /** Worker-owned captured generation/lease guard, never an imported approval flag. */
  readonly isCurrent: () => boolean;
  readonly signal?: AbortSignal;
  /** Trusted test instrumentation for the existing SHA-256 helper; default is native WebCrypto. */
  readonly sha256?: (bytes: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>;
}
export interface VerifiedEvmAgreement {
  readonly testOnly: true; readonly economicPreparationAllowed: false; readonly termsHash: string;
  readonly accounts: Readonly<{ readonly seller: string; readonly buyer: string }>;
}
const PRIVATE_FIELDS = ['v', 'orderId', 'revision', 'fiatCurrency', 'fiatMinorUnits', 'fiatScale', 'paymentInstructions', 'capabilities', 'agreementSalt'];
const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
type Acceptance = { readonly termsHash: string; readonly role: 'seller' | 'buyer'; readonly walletAccount: string; readonly signature: Uint8Array<ArrayBuffer> };

function snapshotAcceptances(input: unknown, owned: Uint8Array<ArrayBuffer>[]): readonly Acceptance[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new CoreSchemaError();
  if (input.length > 2) throw new CoreSchemaError('LIMIT_EXCEEDED');
  if (input.length !== 2 || Reflect.ownKeys(input).length !== 3) throw new CoreSchemaError();
  const result: Acceptance[] = [];
  for (let index = 0; index < 2; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !('value' in descriptor)) throw new CoreSchemaError();
    const raw = intentData(descriptor.value, ['termsHash', 'role', 'walletAccount', 'signature']);
    if (typeof raw.termsHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.termsHash) ||
        raw.role !== 'seller' && raw.role !== 'buyer' || typeof raw.walletAccount !== 'string' || !/^0x[0-9a-f]{40}$/.test(raw.walletAccount)) throw new CoreSchemaError();
    let signature: Uint8Array<ArrayBuffer>;
    try {
      if (!(raw.signature instanceof Uint8Array) || byteLength.call(raw.signature) !== 65) throw new CoreSchemaError();
      signature = new Uint8Array(raw.signature);
    } catch { throw new CoreSchemaError(); }
    owned.push(signature);
    if (result.some(acceptance => acceptance.role === raw.role)) throw new CoreSchemaError();
    result.push(Object.freeze({ termsHash: raw.termsHash, role: raw.role, walletAccount: raw.walletAccount, signature }));
  }
  return Object.freeze(result);
}

/** Snapshot and encode everything before awaits; outputs contain no private agreement or signatures.
 * Owned byte arrays clear on abort and every exit. Caller strings/inputs and native crypto internals are
 * outside that ownership: this is not a physical-memory-erasure guarantee. Hashing may finish after abort.
 */
export async function verifyEvmAgreementBundle(input: unknown, context: EvmAgreementContext): Promise<CoreResult<Readonly<VerifiedEvmAgreement>>> {
  const operationId = createOperationId(), owned: Uint8Array<ArrayBuffer>[] = [];
  const failure = (code: CoreErrorCode): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: true }) });
  const wipe = (): void => { for (const bytes of owned) bytes.fill(0); };
  let signal: AbortSignal | undefined, isCurrent: (() => boolean) | undefined;
  const current = (): boolean => { try { return !signal?.aborted && isCurrent?.() === true && !signal?.aborted; } catch { return false; } };
  try {
    signal = context.signal; isCurrent = context.isCurrent; const digest = context.sha256;
    if (typeof isCurrent !== 'function' || digest !== undefined && typeof digest !== 'function') return failure('INVALID_INPUT');
    if (!current()) return failure('CANCELLED');
    signal?.addEventListener('abort', wipe, { once: true });
    const raw = intentData(input, ['privateAgreement', 'domain', 'terms', 'acceptances']);
    const domain = snapshotEvmDomain(raw.domain as Parameters<typeof snapshotEvmDomain>[0]);
    const terms = snapshotEvmTerms(raw.terms as Parameters<typeof snapshotEvmTerms>[0]);
    const agreement = intentData(raw.privateAgreement, PRIVATE_FIELDS);
    // Existing encoders validate the exact nested data, native integer widths and byte/count caps.
    const privateBytes = encodePrivateAgreement(agreement as unknown as PrivateAgreementV1); owned.push(privateBytes);
    const capabilityBytes = encodeCapabilities(agreement.capabilities as readonly CapabilityV1[]); owned.push(capabilityBytes);
    const acceptances = snapshotAcceptances(raw.acceptances, owned);
    if (!current()) return failure('CANCELLED');
    const termsHash = evmTermsHash(domain, terms);
    if (agreement.orderId !== terms.orderId || agreement.revision !== terms.revision) return failure('INTEGRITY_FAILURE');
    for (const acceptance of acceptances) {
      if (acceptance.termsHash !== termsHash) return failure('INTEGRITY_FAILURE');
      if (acceptance.walletAccount !== terms[acceptance.role] || !verifyEoaAcceptance(domain, terms, acceptance.role, acceptance.signature)) return failure('UNAUTHORIZED');
    }
    if (!current()) return failure('CANCELLED');
    const privateHash = await sha256Hex(privateBytes, digest);
    privateBytes.fill(0);
    if (!current()) return failure('CANCELLED');
    if (privateHash !== terms.privateAgreementHash) return failure('INTEGRITY_FAILURE');
    const capabilitiesHash = await sha256Hex(capabilityBytes, digest);
    if (!current()) return failure('CANCELLED');
    if (capabilitiesHash !== terms.capabilitiesHash) return failure('INTEGRITY_FAILURE');
    return { ok: true, value: Object.freeze({ testOnly: true, economicPreparationAllowed: false, termsHash,
      accounts: Object.freeze({ seller: terms.seller, buyer: terms.buyer }) }) };
  } catch (error) { return !current() ? failure('CANCELLED') : { ok: false, error: normalizeError(error, { operationId, phase: 'read' }) }; }
  finally { signal?.removeEventListener('abort', wipe); wipe(); }
}
