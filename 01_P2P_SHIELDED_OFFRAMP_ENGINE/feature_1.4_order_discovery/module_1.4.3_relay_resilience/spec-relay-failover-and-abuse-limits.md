# Relay failover and abuse limits

- **Specification ID:** G21
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.4_order_discovery
- **Module:** module_1.4.3_relay_resilience
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define relay selection, reconnect behavior, and bounded resource use. Keep malicious relay input from exhausting the client or changing trade authority.

## Required behavior

1. Enforce event size, signature-validation cost, subscription, queue, and per-peer message limits before expensive work.
2. Use configurable relay sets with bounded reconnects and event deduplication; keep private routing policy during failover.
3. Treat relay acknowledgments as publication evidence only; never infer trade settlement or globally complete liquidity from them.

## Dependencies

- [G13: Typed errors and retries](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.5_failure_contract/spec-typed-errors-and-retries.md)
- [G19: Orderbook visibility and expiry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.2_discovery_policy/spec-orderbook-visibility-and-expiry.md)
- [G20: NIP-17 trade chat](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_encrypted_messaging/module_5.3.2_private_chat/spec-nip17-trade-chat.md)

## Acceptance evidence

- A malicious relay replaying oversized events cannot exhaust memory beyond configured bounds.
- Loss of one relay permits recovery through another without duplicate fills.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
