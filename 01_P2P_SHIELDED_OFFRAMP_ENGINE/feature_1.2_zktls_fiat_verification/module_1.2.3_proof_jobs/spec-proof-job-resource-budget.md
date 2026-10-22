# Proof job resource budget

- **Specification ID:** G29
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.2_zktls_fiat_verification
- **Module:** module_1.2.3_proof_jobs
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 4

## Scope

Define cancellation, worker isolation, and resource budgets for browser proof generation. Prevent proof work from blocking custody or recovery controls.

## Required behavior

1. Enforce memory/time/concurrency budgets measured on supported devices and terminate cancelled workers.
2. Never expose credentials, transcript secrets, or witness data in logs or shared event buses.
3. A failed proof leaves escrow unchanged and follows pre-agreed manual or expiry rules.

## Dependencies

- [G04: Client content security policy](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.12_browser_security/module_5.12.1_content_boundary/spec-client-content-security-policy.md)
- [G13: Typed errors and retries](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.5_failure_contract/spec-typed-errors-and-retries.md)
- [G14: Optional module interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md)

## Acceptance evidence

- Oversized input, cancellation, and worker crash do not freeze release/refund UI.
- Secrets do not survive in persisted job metadata.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
