# MVP trade user journey

- **Specification ID:** G22
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.9_trade_interface
- **Module:** module_1.9.1_trade_journey
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define the complete user flow from setup to release or refund. Make manual settlement assumptions and recovery actions visible.

## Required behavior

1. Provide onboarding, encrypted backup, wallet/network selection, discovery, terms acceptance, funding, encrypted chat, payment coordination, release/refund, and receipt views.
2. Require confirmed funded state before payment guidance and seller confirmation before release; warn against further payment when stale or near deadline.
3. Support keyboard navigation, clear amounts/fees, accessible status changes, and recovery from refresh or disconnect.

## Dependencies

- [G03: Encrypted backup and recovery](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-encrypted-backup-recovery.md)
- [G12: Transaction lifecycle journal](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.7_transaction_recovery/module_1.7.1_transaction_journal/spec-transaction-lifecycle-journal.md)
- [G17: Manual settlement risk policy](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.3_basic_settlement/spec-manual-settlement-risk-policy.md)
- [G18: Escrow deadline preflight](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.3_basic_settlement/spec-escrow-deadline-preflight.md)
- [G19: Orderbook visibility and expiry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.2_discovery_policy/spec-orderbook-visibility-and-expiry.md)
- [G20: NIP-17 trade chat](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_encrypted_messaging/module_5.3.2_private_chat/spec-nip17-trade-chat.md)

## Acceptance evidence

- Two fresh clients complete funded-release and no-payment-timeout-refund paths.
- Account changes, rejected signatures, stale listings, and interrupted sessions have actionable UI states.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
