# Reputation proof consumption

- **Specification ID:** G28
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.3_zk_reputation
- **Module:** module_1.3.3_reputation_portability
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 3

## Scope

Define how optional reputation claims affect order eligibility. Keep group membership distinct from verified trustworthiness.

## Required behavior

1. Bind proof scope and freshness to the accepted policy and trade context.
2. Validate roots, nullifiers, expiry, and verifier version through a stable adapter; unsupported claims fail closed for orders requiring them.
3. Allow ordinary orders to operate without reputation and document issuer/Sybil assumptions.

## Dependencies

- [G14: Optional module interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md)
- [G16: Signed trade terms](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md)

## Acceptance evidence

- Stale, replayed, or wrong-domain proofs fail.
- Basic orders still execute when the proof service is unavailable.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
