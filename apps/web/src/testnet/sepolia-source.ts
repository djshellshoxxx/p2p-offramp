/**
 * Sepolia TESTNET registry source. Owner decisions (2026-10-28): Ethereum Sepolia, and an owner-held, testnet-only
 * P-256 key as the registry trust root. Only the `testnet` build imports this module (dynamic import behind the
 * compile-time `__P2P_TESTNET__` flag). The build embeds the trusted public key, the registry, the canonical escrow ABI
 * and their one signed G15 manifest after verifying them; this module verifies them again with the device clock and the
 * same exact two-asset set (D3 Option A, PROPOSED), so an expired, altered or registry-only bundle yields `failed` instead
 * of serving deployments. The app does not use the ABI bytes; it carries them only so the one manifest verifies here. The signed registry must name exactly one network, Sepolia by
 * chain id and genesis (sepolia-network.ts); anything else fails closed. Lookups stay bound to the verified manifest.
 * Nothing here connects, signs or funds; ReleaseEnabled stays 0.
 */
import { createReleaseRegistry, verifyRelease } from '../../../../packages/security/index.ts';
import { parseRegistryBytes } from '../../../../packages/schemas/index.ts';
import type { RegistryLookup } from '../../../../packages/domain/index.ts';
import type { RegistrySource } from '../trade/review-controller.ts';
import { isPinnedReleaseKey, isSepolia, isSepoliaOnly, SEPOLIA_RELEASE_ASSETS, SEPOLIA_RELEASE_CHANNEL, SEPOLIA_RELEASE_KEY_ID } from './sepolia-network.ts';

/**
 * Bundle format. PROPOSAL pending owner approval (D3 leaves the name to the owner): v2 carries the signed ABI bytes.
 * Must equal TESTNET_TRUST_FORMAT in apps/web/scripts/testnet-trust.mjs.
 */
export const TESTNET_TRUST_FORMAT = 'p2p-offramp/testnet-trust/v2';
/** Registry-only bundles from before D3 Option A: refused explicitly, never upgraded. None was ever committed or shipped. */
export const LEGACY_TESTNET_TRUST_FORMATS: readonly string[] = Object.freeze(['p2p-offramp/testnet-trust/v1']);
export const TESTNET_CHANNEL = SEPOLIA_RELEASE_CHANNEL;
export const TESTNET_REGISTRY_PATH = SEPOLIA_RELEASE_ASSETS.registry;
export const TESTNET_ABI_PATH = SEPOLIA_RELEASE_ASSETS.abi;
const BUNDLE_KEYS = Object.freeze(['format', 'keyId', 'publicKey', 'registry', 'abi', 'manifest', 'envelope']);
const MAX_BUNDLE_FIELD_CHARS = 2 * 1024 * 1024;

function field(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !('value' in descriptor)) throw new Error('BUNDLE');
  return descriptor.value;
}
function plainObject(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('BUNDLE');
  const own = Reflect.ownKeys(input);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) throw new Error('BUNDLE');
  return Object.fromEntries(keys.map(key => [key, field(input as Record<string, unknown>, key)]));
}
function base64url(input: unknown): Uint8Array {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_BUNDLE_FIELD_CHARS || !/^[A-Za-z0-9_-]+$/.test(input)) throw new Error('BUNDLE');
  const binary = atob(input.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/**
 * Registry source for the embedded bundle; `nowSeconds` is injectable for tests and defaults to the device clock.
 * `pinnedKeyId` defaults to SEPOLIA_RELEASE_KEY_ID; an unset or mismatched pin fails.
 * The explicit localProof argument labels test-owned fixture composition; it grants no release authority.
 */
export function sepoliaRegistrySource(bundle: unknown, nowSeconds?: () => number, pinnedKeyId: string | null = SEPOLIA_RELEASE_KEY_ID, localProof = false): RegistrySource {
  return async () => {
    try {
      if (pinnedKeyId === null || !isPinnedReleaseKey(pinnedKeyId, pinnedKeyId)) return { kind: 'failed' };
      // A legacy registry-only bundle is refused by its format alone, before any shape or signature work.
      if (typeof bundle === 'object' && bundle !== null && LEGACY_TESTNET_TRUST_FORMATS.includes(Object.getOwnPropertyDescriptor(bundle, 'format')?.value as string)) return { kind: 'failed' };
      const raw = plainObject(bundle, BUNDLE_KEYS);
      if (raw.format !== TESTNET_TRUST_FORMAT || typeof raw.keyId !== 'string' || !/^[0-9a-f]{64}$/.test(raw.keyId)) return { kind: 'failed' };
      const registryBytes = base64url(raw.registry), abiBytes = base64url(raw.abi), manifestBytes = base64url(raw.manifest);
      const verified = await verifyRelease(manifestBytes, raw.envelope, [raw.publicKey], 0,
        { channel: TESTNET_CHANNEL, assets: [{ path: TESTNET_REGISTRY_PATH, bytes: registryBytes }, { path: TESTNET_ABI_PATH, bytes: abiBytes }], ...(nowSeconds ? { nowSeconds } : {}) });
      if (!verified.ok || verified.value.keyId !== raw.keyId || !isPinnedReleaseKey(verified.value.keyId, pinnedKeyId)) return { kind: 'failed' };
      const bound = await createReleaseRegistry(verified.value, TESTNET_REGISTRY_PATH, registryBytes);
      if (!bound.ok) return { kind: 'failed' };
      // The bytes matched the verified manifest above; any network other than Sepolia refuses the whole bundle.
      if (!isSepoliaOnly(parseRegistryBytes(registryBytes))) return { kind: 'failed' };
      const guarded = bound.value;
      const registry: RegistryLookup = Object.freeze({
        network: (id: string) => { const network = guarded.network(id); return isSepolia(network) ? network : null; },
        deployment: (networkId: string, deploymentId: string) => registry.network(networkId) ? guarded.deployment(networkId, deploymentId) : null,
      });
      return { kind: 'ready', label: localProof ? 'sepolia-local-proof' : 'sepolia-testnet', registry, samples: [],
        trust: Object.freeze({ keyId: raw.keyId, sequence: verified.value.manifest.sequence, expiresAt: verified.value.manifest.expiresAt }) };
    } catch { return { kind: 'failed' }; }
  };
}
