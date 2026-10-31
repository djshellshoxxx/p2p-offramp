/**
 * The one network the Sepolia testnet trust root may cover. Identity is the chain id and genesis hash, never the
 * registry's own `environment` label: a registry signed with the testnet key by mistake or after compromise must not
 * be able to present another chain (mainnet included) as "testnet". Used by the app runtime, the testnet build and the
 * scripts/sepolia tooling, so all of them agree.
 *
 * Source: go-ethereum `params/chainspecs/sepolia.json` (chainId) and `params/config.go` (`SepoliaGenesisHash`), read
 * 2026-10-28.
 */
import type { NetworkV1, RegistryV1 } from '../../../../packages/schemas/index.ts';

export const SEPOLIA_NETWORK = Object.freeze({
  id: 'sepolia', chain: 'evm', chainIdentity: '11155111',
  genesisHash: '0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9', environment: 'testnet',
} as const);

/** Owner-approved testnet release keyId. Null means no trust root is configured: every ordinary path refuses. */
export const SEPOLIA_RELEASE_KEY_ID: string | null = null;

/** True only for a well-formed keyId equal to an independently configured nonnull pin. */
export function isPinnedReleaseKey(keyId: string, pinned: string | null = SEPOLIA_RELEASE_KEY_ID): boolean {
  return typeof pinned === 'string' && /^[0-9a-f]{64}$/.test(pinned) && keyId === pinned;
}

/** `genesisHash` is overridable only by local proofs on a node started with Sepolia's chain id. */
export function isSepolia(network: NetworkV1 | null | undefined, genesisHash: string = SEPOLIA_NETWORK.genesisHash): network is NetworkV1 {
  return network !== null && network !== undefined && network.id === SEPOLIA_NETWORK.id && network.chain === SEPOLIA_NETWORK.chain &&
    network.chainIdentity === SEPOLIA_NETWORK.chainIdentity && network.genesisHash === genesisHash && network.environment === SEPOLIA_NETWORK.environment;
}

/** True only for a registry whose single network is exactly Sepolia. */
export function isSepoliaOnly(registry: RegistryV1, genesisHash?: string): boolean {
  return registry.networks.length === 1 && isSepolia(registry.networks[0], genesisHash);
}
