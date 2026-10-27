/**
 * SYNTHETIC, TEST-ONLY demo source. Only the `demo` build imports this module (dynamic import behind the
 * compile-time `__P2P_SYNTHETIC_DEMO__` flag). Every sample still goes through the same registry load and terms
 * review as a user-selected file; nothing here bypasses validation, signs, connects or funds.
 */
import { RegistryService, encodeCapabilities, encodePrivateAgreement, sha256Hex } from '../../../../packages/domain/index.ts';
import type { RegistrySource, TermsSample } from '../trade/review-controller.ts';
import { FROZEN_ERC20_DOCUMENT, FROZEN_NATIVE_DOCUMENT, SYNTHETIC_REGISTRY_JSON, SYNTHETIC_REGISTRY_SHA256 } from './synthetic-data.ts';

const utf8 = new TextEncoder();
const SELLER = '0xacf7b7c8271e99b3be70c3f476c7c20963e06b8e';
const BUYER = '0x3b0d3efcce062566bd2a28c2f2bba7e1d1504ee5';

/**
 * A core (zero-capability) native sample whose deadlines are relative to `nowSeconds`: accept within one hour,
 * escrow expiry one day later. Hashes are computed with the same domain encoders the review re-checks.
 */
export async function freshCoreNativeDocument(nowSeconds: bigint): Promise<Uint8Array> {
  const orderId = 'c3'.repeat(32);
  const privateAgreement = {
    v: 1 as const, orderId, revision: '1', fiatCurrency: 'EUR', fiatMinorUnits: '12345', fiatScale: 2,
    paymentInstructions: 'SYNTHETIC demo instructions.\nDo not send real money.', capabilities: [], agreementSalt: '5d'.repeat(32),
  };
  const acceptBefore = nowSeconds + 3600n;
  const terms = {
    orderId, revision: '1', networkId: 'local-evm', deploymentId: 'escrow-local-v1', seller: SELLER, buyer: BUYER,
    assetKind: 'native', asset: `0x${'0'.repeat(40)}`, amountBaseUnits: '250000000000000000',
    privateAgreementHash: await sha256Hex(encodePrivateAgreement(privateAgreement)),
    capabilitiesHash: await sha256Hex(encodeCapabilities([])),
    sellerNonce: '6e'.repeat(32), acceptBeforeSeconds: acceptBefore.toString(), escrowExpirySeconds: (acceptBefore + 86_400n).toString(),
  };
  return utf8.encode(JSON.stringify({ format: 'p2p-offramp/local-terms-review/v1', terms, privateAgreement }, null, 2) + '\n');
}

export const SYNTHETIC_SAMPLES: readonly TermsSample[] = Object.freeze([
  Object.freeze({ id: 'fresh-native', label: 'Core native sample (deadlines from now)', load: (now: bigint) => freshCoreNativeDocument(now) }),
  Object.freeze({ id: 'frozen-native', label: 'Frozen scenario: native (expired, has capability)', load: async () => utf8.encode(FROZEN_NATIVE_DOCUMENT) }),
  Object.freeze({ id: 'frozen-erc20', label: 'Frozen scenario: ERC-20 (expired, has capability)', load: async () => utf8.encode(FROZEN_ERC20_DOCUMENT) }),
]);

/** Loads the synthetic registry through the real digest-first RegistryService. Refuses anything not `local`. */
export const syntheticDemoSource: RegistrySource = async () => {
  const registry = new RegistryService();
  const loaded = await registry.load(utf8.encode(SYNTHETIC_REGISTRY_JSON), SYNTHETIC_REGISTRY_SHA256);
  if (!loaded.ok || loaded.value.networks.some(network => network.environment !== 'local')) return { kind: 'failed' };
  return { kind: 'ready', label: 'synthetic-demo', registry, samples: SYNTHETIC_SAMPLES };
};
