# NIP-17 trade chat

- **Specification ID:** G20
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.3_encrypted_messaging
- **Module:** module_5.3.2_private_chat
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define trade-bound private messaging using NIP-17, NIP-44, and NIP-59. Keep legacy NIP-04 disabled for new conversations.

## Required behavior

1. Use evaluated implementations and published vectors; NIP-44 is payload encryption, not an entire messaging protocol.
2. Bind sender, recipient, trade, sequence/nonce, and expiry inside authenticated application messages; reject unknown sessions and replays.
3. Do not promise forward secrecy, relay erasure, or guaranteed offline delivery; declare encrypted local retention and resynchronization policy.

## Dependencies

- [G01: Client key lifecycle](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.11_key_management/module_5.11.1_key_lifecycle/spec-client-key-lifecycle.md)
- [G02: IndexedDB encrypted records](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md)
- [G16: Signed trade terms](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md)

## Acceptance evidence

- Two independent clients exchange valid messages and reject modified, replayed, and wrong-trade payloads.
- Reconnect with delayed and duplicate messages preserves consistent conversation state.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
