/**
 * Public facade: G15 release-manifest verification and the registry binding it guards. Used by the Sepolia testnet
 * build's registry source (apps/web/src/testnet). No signing, trust-root choice, storage, network or install authority.
 */
export { verifyRelease, createReleaseRegistry, RELEASE_LIMITS } from './src/release-manifest.ts';
export { revalidateRelease } from './src/release-proof.ts';
export { verifyReleaseLocator, RELEASE_LOCATOR_LIMITS } from './src/release-locator.ts';
export type { ReleaseLocator, ReleaseLocatorOptions, ReleaseLocatorResult } from './src/release-locator.ts';
export { evaluateGate, ACCEPTANCE_LIMITS } from './src/acceptance-gates.ts';
export type { AcceptanceCandidate, AcceptanceRequirement, AcceptanceTarget, AcceptanceOptions, AcceptanceResult,
  GateRecord, GateEvaluation, AcceptanceFinding, AcceptanceCode, EvidenceOutcome, ReviewRole, TargetKind,
  Milestone, SpecDigest, ArtifactDigest } from './src/acceptance-gates.ts';
export type { ReleaseBoundRegistry, ReleaseErrorCode, ReleaseManifest, ReleaseResult, ReleaseRegistryResult } from './src/release-manifest.ts';
