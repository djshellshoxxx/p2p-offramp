# Coinjoin capability interface

## 1. Metadata

- **Specification ID:** PRIV-COINJOIN-CAPABILITY-INTERFACE
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.5_collaborative_transactions
- **Module:** module_5.5.1_coinjoin_adapter
- **Delivery:** Core messaging/policy/display where consumed by Phase 2; other privacy extensions are opt-in Phase 3 or later, subject to the roadmap.
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective and boundary

Define optional adapters for compatible UTXO collaborative transactions. Specify transaction-model and privacy differences from account-based shielded pools.

The system authority contract governs this module: external wallets authorize spending; deployed escrow and reconciled chain observations establish custody state; relay and local data are untrusted claims. This specification creates no operator release path, automatic bank payment or authority over an already funded trade. Missing optional infrastructure MUST preserve basic release/refund and encrypted recovery paths.

## 3. Architecture and data contracts

CoinJoin is a UTXO collaborative transaction capability, outside initial EVM/Solana core support. Initial coordinator/protocol registry is empty. A candidate profile pins network, coordinator protocol/version, wallet, source revision, transaction/PSBT versions, fee/denomination policy and independent privacy/custody review. BIP-174 PSBT is a transaction container, not a CoinJoin anonymity protocol.

Runtime validation MUST reject unknown versions/properties, unsafe integers, duplicate identities and oversized inputs before expensive work. Network, deployment, trade and account generation are explicit bindings where economic state is involved. Amounts are unsigned decimal base-unit strings, never floating point. Immutable results and defensive copies prevent consumers mutating validated state. Protocol-specific limits override broader application limits.

## 4. Algorithms, transitions and invariants

Before joining, wallet verifies ownership and availability of its inputs, destination/change ownership, all amounts and fee cap, locktime/sequence and every signing scope. Never sign a transaction that can divert funds or omit expected outputs. Coordinator cannot obtain private keys. No account-based asset may be presented as a compatible UTXO input.

Asynchronous jobs carry a generation and AbortSignal. Revoked generations MUST NOT publish late plaintext, restore stale coverage or initiate new economic work. Dispose removes subscriptions and closes owned resources. Cancellation after broadcast is an uncertain transaction outcome requiring journal reconciliation, not proof of rollback. Existing signed/funded terms cannot be renegotiated by changing a local preference.

## 5. Interfaces, errors and recovery

capabilities(profileId), proposeRound(inputRefs, approvedOutputs), reviewTransaction(psbt), signApproved(intentId) and status(roundId) remain unsupported without a pinned profile. Signing requires explicit wallet consent for the exact reviewed transaction.

All interfaces return the shared core result/error contract. Distinguish INVALID_INPUT, UNSUPPORTED_VERSION, UNSUPPORTED_PROVIDER, UNAUTHORIZED, LOCKED, CANCELLED and unavailable external service; map concrete errors to registered G13 codes without exposing private content. No unbounded retry, secret-bearing diagnostics, destructive reset or silent downgrade is permitted. Operations that propose economic effects pass core preflight, durable G12 reservation and fresh external-wallet consent; this module cannot bypass them.

## 6. Threat assessment and privacy limits

Coordinator learns metadata; Sybil participants, input ownership, amount and later consolidation can break privacy. Mixing is not guaranteed anonymity or final settlement. Coordinator custody is excluded from this interface.

Active origin compromise, malicious extensions and a compromised OS can read unlocked state; capability wrappers are not a same-origin JavaScript sandbox. Transport encryption, payload encryption and chain privacy are independent properties. G02 remains the exact v1 storage authority: no alternative KDF, AAD, record kind or session token is introduced here. G03 alone governs authenticated fresh-key restore. No physical erasure, global anonymity or provider availability guarantee is made.

## 7. Verification, references and release gates

Test empty registry, output substitution, excessive fees, wrong network, foreign inputs, incompatible PSBT, unsafe sighash and coordinator outage. Require independent transaction verification and protocol-specific adversarial tests.

For each supported profile record source/dependency commit, integrity digest, protocol revision, deployment/network IDs, fixture provenance, browser/provider matrix and named review. Mutable documentation links below identify primary protocols; they are not an evaluated implementation pin. Where no concrete profile is approved the implementation MUST return unsupported, not emulate success. Unit fixtures alone do not establish browser routing, wallet support or custody safety.

Acceptance requires positive interoperability and negative boundary cases, cancellation/reload fault injection, redacted logging checks, and a core-only build with advanced packages absent completing basic trading recovery. Record actual results separately; this expanded design is not test evidence. Independent review and applicable roadmap milestone gates remain pending.

- [DEVELOPMENT_ROADMAP](../../../DEVELOPMENT_ROADMAP.md).
- [spec-system-context-contract](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md).
- [spec-optional-module-interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md).
- [spec-indexeddb-encrypted-records](../../feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md).
- [spec-transport-policy-enforcement](../../feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md).
- [Primary protocol reference](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki).
- [Primary protocol reference](https://github.com/bitcoin/bips/blob/master/bip-0370.mediawiki).
