# Stealth recipient trade binding

- **Specification ID:** G27
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.2_financial_privacy
- **Module:** module_5.2.2_stealth_trade_binding
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 3

## Scope

Define how a stealth recipient is authenticated within signed trade terms. Preserve address-scheme isolation while exposing gas and withdrawal linkability.

## Required behavior

1. Bind recipient authorization to chain, escrow, scheme, and trade digest before funding.
2. Separate scan/view keys from spend keys and do not reuse public order identity as an automatic viewing credential.
3. Add new trade versions only; do not rewrite recipient fields of funded basic escrows.

## Dependencies

- [G14: Optional module interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md)
- [G16: Signed trade terms](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md)

## Acceptance evidence

- Wrong-scheme, wrong-chain, or substituted recipients are rejected.
- Disabling stealth support leaves basic escrow funding and recovery usable.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
