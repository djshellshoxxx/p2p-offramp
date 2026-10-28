/**
 * Sepolia TESTNET registry source. Owner decisions (2026-10-28): Ethereum Sepolia, and an owner-held, testnet-only
 * P-256 key as the registry trust root. Only the `testnet` build imports this module (dynamic import behind the
 * compile-time `__P2P_TESTNET__` flag). The build embeds the trusted public key, the registry and its signed G15
 * manifest after verifying them; this module verifies them again with the device clock, so an expired or altered
 * bundle yields `failed` instead of serving deployments. Lookups stay bound to the verified manifest and answer only
 * for `testnet` networks. Nothing here connects, signs or funds; ReleaseEnabled stays 0.
 */
import { createReleaseRegistry, verifyRelease } from '../../../../packages/security/index.ts';
import type { RegistryLookup } from '../../../../packages/domain/index.ts';
import type { RegistrySource } from '../trade/review-controller.ts';

export const TESTNET_TRUST_FORMAT = 'p2p-offramp/testnet-trust/v1';
export const TESTNET_CHANNEL = 'sepolia-testnet';
export const TESTNET_REGISTRY_PATH = 'registry/testnet/sepolia.registry.json';
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

/** Registry source for the embedded bundle; `nowSeconds` is injectable for tests and defaults to the device clock. */
export function sepoliaRegistrySource(bundle: unknown, nowSeconds?: () => number): RegistrySource {
  return async () => {
    try {
      const raw = plainObject(bundle, ['format', 'keyId', 'publicKey', 'registry', 'manifest', 'envelope']);
      if (raw.format !== TESTNET_TRUST_FORMAT || typeof raw.keyId !== 'string' || !/^[0-9a-f]{64}$/.test(raw.keyId)) return { kind: 'failed' };
      const registryBytes = base64url(raw.registry), manifestBytes = base64url(raw.manifest);
      const verified = await verifyRelease(manifestBytes, raw.envelope, [raw.publicKey], 0,
        { channel: TESTNET_CHANNEL, assets: [{ path: TESTNET_REGISTRY_PATH, bytes: registryBytes }], ...(nowSeconds ? { nowSeconds } : {}) });
      if (!verified.ok || verified.value.keyId !== raw.keyId) return { kind: 'failed' };
      const bound = await createReleaseRegistry(verified.value, TESTNET_REGISTRY_PATH, registryBytes);
      if (!bound.ok) return { kind: 'failed' };
      const guarded = bound.value;
      // Testnet build: a non-testnet network in the signed registry is never served.
      const registry: RegistryLookup = Object.freeze({
        network: (id: string) => { const network = guarded.network(id); return network && network.environment === 'testnet' ? network : null; },
        deployment: (networkId: string, deploymentId: string) => registry.network(networkId) ? guarded.deployment(networkId, deploymentId) : null,
      });
      return { kind: 'ready', label: 'sepolia-testnet', registry, samples: [],
        trust: Object.freeze({ keyId: raw.keyId, sequence: verified.value.manifest.sequence, expiresAt: verified.value.manifest.expiresAt }) };
    } catch { return { kind: 'failed' }; }
  };
}
