# Physical handoff failure policy

- **Specification ID:** G32
- **Section:** 03_CASH_IN_TRANSIT_BLIND_COURIERS
- **Feature:** feature_3.7_coordination_recovery
- **Module:** module_3.7.1_custody_timeouts
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 5

## Scope

Define recovery for incomplete courier and locker custody transitions. Prevent software acknowledgments from being treated as proof of cash value.

## Required behavior

1. Bind each handoff to fresh challenges, custody records, expiry, and negotiated collateral policy.
2. Ambiguous handoff cannot automatically authorize slashing or cash-value conclusions.
3. Before Phase 6, permit only explicit cooperative settlement or pre-agreed deterministic timeout behavior; adversarial courier guarantees remain disabled.

## Dependencies

- [G17: Manual settlement risk policy](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.3_basic_settlement/spec-manual-settlement-risk-policy.md)
- [G31: Location consent lifecycle](../../../02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.7_consent_management/module_2.7.1_location_permissions/spec-location-consent-lifecycle.md)

## Acceptance evidence

- Missing, conflicting, or replayed acknowledgments do not settle silently.
- A locker outage follows an explicit recovery path without altering basic escrow rules.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
