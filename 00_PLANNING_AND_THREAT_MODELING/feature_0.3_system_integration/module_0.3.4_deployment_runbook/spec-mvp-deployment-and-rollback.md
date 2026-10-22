# MVP deployment and rollback

- **Specification ID:** G25
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.3_system_integration
- **Module:** module_0.3.4_deployment_runbook
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define reproducible deployment of contracts, static frontend, and endpoint configuration. Provide rollback and independent fund-recovery procedures.

## Required behavior

1. Deploy and verify EVM contract and Solana program identities independently; record immutable versus upgradeable authority explicitly and reject hidden administrative release powers.
2. Publish network/asset allowlists, static CID, RPC/relay endpoints, dependency versions, and recovery instructions in a signed release bundle.
3. Rollback means restoring a compatible client and disabling new trades where appropriate; it cannot reverse finalized settlements or erase deployed contracts.

## Dependencies

- [G15: IPFS origin and update policy](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md)
- [G24: MVP end-to-end test matrix](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.10_quality_assurance/module_0.10.1_mvp_validation/spec-mvp-end-to-end-test-matrix.md)

## Acceptance evidence

- A clean machine deploys a test environment from the release runbook.
- Recovery release/refund works without the primary frontend and with an unavailable relay.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
