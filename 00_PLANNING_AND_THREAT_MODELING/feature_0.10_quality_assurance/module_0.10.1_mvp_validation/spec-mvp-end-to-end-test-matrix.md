# MVP end-to-end test matrix

- **Specification ID:** G24
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.10_quality_assurance
- **Module:** module_0.10.1_mvp_validation
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define release evidence for the independently usable Phase 2 application. Exercise real adapter boundaries as well as deterministic fault injection.

## Required behavior

1. Cover EVM and Solana local/dev networks, supported wallet/browser pairs, native assets, and each allowlisted token configuration.
2. Test conservation, unauthorized actions, refund races, refresh recovery, bad RPC, relay outage, reorg/rollback, storage failures, and account changes.
3. Require an installed/build-time-disabled advanced-module run; simulation-only results are insufficient for deployment compatibility claims.

## Dependencies

- [G21: Relay failover and abuse limits](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.3_relay_resilience/spec-relay-failover-and-abuse-limits.md)
- [G22: MVP trade user journey](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.9_trade_interface/module_1.9.1_trade_journey/spec-mvp-trade-user-journey.md)
- [G23: UI privacy status indicators](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.10_security_modes/module_5.10.2_privacy_indicators/spec-ui-privacy-status-indicators.md)

## Acceptance evidence

- Every required matrix cell has a passing artifact tied to source commit and configuration.
- No unresolved critical/high findings affect enabled custody or authorization paths.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
