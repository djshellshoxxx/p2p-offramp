# Orderbook visibility and expiry

- **Specification ID:** G19
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.4_order_discovery
- **Module:** module_1.4.2_discovery_policy
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define the distinction between discoverable order advertisements and encrypted trade details. Specify application expiry without promising relay deletion.

## Required behavior

1. Public discovery exposes only opted-in coarse market fields and a contact key; private invite-only orders encrypt details to known recipients.
2. Document that universally discoverable offers cannot also hide all terms from every potential counterparty; do not use a publicly shared key as a confidentiality claim.
3. Use signed expiry/revision/cancellation and revalidate before funding; choose and register application event kinds after compatibility review rather than calling all order events ephemeral.

## Dependencies

- [G16: Signed trade terms](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md)
- [G05: Transport policy enforcement](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md)

## Acceptance evidence

- Expired or canceled offers cannot initiate a trade even when a relay replays them.
- Offline/late subscribers see no false guarantee of delivery or deletion.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
