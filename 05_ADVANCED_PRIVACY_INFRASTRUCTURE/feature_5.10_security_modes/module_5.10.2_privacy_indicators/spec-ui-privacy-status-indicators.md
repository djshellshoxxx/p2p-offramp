# UI privacy status indicators

- **Specification ID:** G23
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.10_security_modes
- **Module:** module_5.10.2_privacy_indicators
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define privacy and verification status shown during each trade. Display observed capability state without implying guarantees from configuration alone.

## Required behavior

1. Show chain visibility, direct/private/unknown routing, messaging encryption, proof availability, and manual settlement mode separately.
2. Distinguish selected settings from verified operation and unsupported integrations; block prohibited downgrades.
3. Never label a wallet address or public escrow anonymous merely because chat is encrypted.

## Dependencies

- [G05: Transport policy enforcement](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md)
- [G14: Optional module interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md)
- [G22: MVP trade user journey](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.9_trade_interface/module_1.9.1_trade_journey/spec-mvp-trade-user-journey.md)

## Acceptance evidence

- Unsupported proxy verification displays unknown rather than protected.
- Switching modes during an active trade cannot silently alter signed terms.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
