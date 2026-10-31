/**
 * Public facade: G15 release-manifest verification and the registry binding it guards. Used by the Sepolia testnet
 * build's registry source (apps/web/src/testnet). No signing, trust-root choice, storage, network or install authority.
 */
export { verifyRelease, createReleaseRegistry, RELEASE_LIMITS } from './src/release-manifest.ts';
export type { ReleaseBoundRegistry, ReleaseErrorCode, ReleaseManifest, ReleaseResult, ReleaseRegistryResult } from './src/release-manifest.ts';
