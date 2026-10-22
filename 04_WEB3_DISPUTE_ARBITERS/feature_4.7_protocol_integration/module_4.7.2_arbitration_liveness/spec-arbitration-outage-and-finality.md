# Arbitration outage and finality

- **Specification ID:** G34
- **Section:** 04_WEB3_DISPUTE_ARBITERS
- **Feature:** feature_4.7_protocol_integration
- **Module:** module_4.7.2_arbitration_liveness
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 6

## Scope

Define bounded recovery when jurors, randomness, or evidence services fail. Preserve deterministic terminal outcomes under the agreed dispute policy.

## Required behavior

1. Specify retry bounds, quorum failure, replacement rounds, appeal limits, maximum locked duration, and a precommitted final fallback.
2. Require contract-enforced deadlines rather than trusting an always-online coordinator.
3. Document fairness tradeoffs of every fallback; a timeout is not factual adjudication.

## Dependencies

- [G33: Arbitration version binding](../../../04_WEB3_DISPUTE_ARBITERS/feature_4.7_protocol_integration/module_4.7.1_arbitration_opt_in/spec-arbitration-version-binding.md)

## Acceptance evidence

- No-reveal, VRF outage, collusion, and unavailable evidence scenarios terminate under bounded rules.
- Settlement certificates cannot replay across rounds, chains, or escrows.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
