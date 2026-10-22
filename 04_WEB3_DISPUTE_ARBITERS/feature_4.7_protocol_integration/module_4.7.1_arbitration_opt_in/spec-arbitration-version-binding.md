# Arbitration version binding

- **Specification ID:** G33
- **Section:** 04_WEB3_DISPUTE_ARBITERS
- **Feature:** feature_4.7_protocol_integration
- **Module:** module_4.7.1_arbitration_opt_in
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 6

## Scope

Define opt-in arbitration contracts and their relationship to basic escrow versions. Prevent later juries from acquiring authority over existing trades.

## Required behavior

1. Bind tribunal, fee policy, appeal bounds, evidence rules, and finality to terms before funding.
2. Use separately versioned escrow deployments; Phase 2 contracts retain their original release/refund authority.
3. Failed tribunal capability negotiation rejects the arbitration order rather than silently using manual mode.

## Dependencies

- [G14: Optional module interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md)
- [G16: Signed trade terms](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md)
- [G32: Physical handoff failure policy](../../../03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.7_coordination_recovery/module_3.7.1_custody_timeouts/spec-physical-handoff-failure-policy.md)

## Acceptance evidence

- A jury certificate cannot release a basic escrow.
- Unsupported or changed tribunal policies fail before funding.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
