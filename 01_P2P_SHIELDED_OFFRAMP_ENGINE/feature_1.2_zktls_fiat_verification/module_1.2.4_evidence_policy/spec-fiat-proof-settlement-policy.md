# Fiat proof settlement policy

- **Specification ID:** G30
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.2_zktls_fiat_verification
- **Module:** module_1.2.4_evidence_policy
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 4

## Scope

Define whether a verified bank claim is advisory or settlement-authorizing. Separate authenticated receipt content from payment finality.

## Required behavior

1. Default to advisory proofs; autonomous release needs an audited rail-specific contract/policy version accepted before funding.
2. Specify provider identity, statement digest, currency, recipient, amount, freshness, replay identifier, and reversal assumptions.
3. Reject unsupported banks, ambiguous status, and policy mismatch without falling back to automatic release.

## Dependencies

- [G29: Proof job resource budget](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.3_proof_jobs/spec-proof-job-resource-budget.md)
- [G17: Manual settlement risk policy](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.3_basic_settlement/spec-manual-settlement-risk-policy.md)

## Acceptance evidence

- A valid proof of pending/reversible payment cannot satisfy an irreversible-settlement policy.
- Provider outage leaves basic manual trades functional.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
