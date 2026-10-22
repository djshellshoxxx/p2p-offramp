# Decoy profile data model

## 1. Metadata

- **Specification ID:** PRIV-DECOY-PROFILE-DATA-MODEL
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.7_local_data_isolation
- **Module:** module_5.7.1_decoy_storage
- **Delivery:** Core messaging/policy/display where consumed by Phase 2; other privacy extensions are opt-in Phase 3 or later, subject to the roadmap.
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective and boundary

Define a separate optional profile containing user-configured decoy data. Specify consistency requirements without promising forensic indistinguishability.

The system authority contract governs this module: external wallets authorize spending; deployed escrow and reconciled chain observations establish custody state; relay and local data are untrusted claims. This specification creates no operator release path, automatic bank payment or authority over an already funded trade. Missing optional infrastructure MUST preserve basic release/refund and encrypted recovery paths.

## 3. Architecture and data contracts

Each decoy is an independent G02 profile with a random profileId and independent DEK/passphrase. A profile is not nested inside the real plaintext snapshot. Synthetic sample trades are explicitly local demonstration records and contain no genuine counterparty PII, spend keys or live escrow bindings.

Runtime validation MUST reject unknown versions/properties, unsafe integers, duplicate identities and oversized inputs before expensive work. Network, deployment, trade and account generation are explicit bindings where economic state is involved. Amounts are unsigned decimal base-unit strings, never floating point. Immutable results and defensive copies prevent consumers mutating validated state. Protocol-specific limits override broader application limits.

## 4. Algorithms, transitions and invariants

Create and unlock the decoy through the unchanged G02 APIs; never clone real messaging identities or journals. Profile switching locks all prior sessions and clears rendered references before loading another. Decoy operations are read-only/demo unless the user separately establishes an ordinary wallet session; no fake success may be represented as a real chain receipt.

Asynchronous jobs carry a generation and AbortSignal. Revoked generations MUST NOT publish late plaintext, restore stale coverage or initiate new economic work. Dispose removes subscriptions and closes owned resources. Cancellation after broadcast is an uncertain transaction outcome requiring journal reconciliation, not proof of rollback. Existing signed/funded terms cannot be renegotiated by changing a local preference.

## 5. Interfaces, errors and recovery

createDecoy(passphrase), switchProfile(profileId), renderDemo(record) use supported G02 record kinds and consumer schema versions. No new vault envelope fields, KDF parameters or session semantics are added.

All interfaces return the shared core result/error contract. Distinguish INVALID_INPUT, UNSUPPORTED_VERSION, UNSUPPORTED_PROVIDER, UNAUTHORIZED, LOCKED, CANCELLED and unavailable external service; map concrete errors to registered G13 codes without exposing private content. No unbounded retry, secret-bearing diagnostics, destructive reset or silent downgrade is permitted. Operations that propose economic effects pass core preflight, durable G12 reservation and fresh external-wallet consent; this module cannot bypass them.

## 6. Threat assessment and privacy limits

Profile existence, encrypted size and browser artifacts remain visible. Decoy mode cannot hide public wallet activity, synchronize erased data or provide forensic deniability.

Active origin compromise, malicious extensions and a compromised OS can read unlocked state; capability wrappers are not a same-origin JavaScript sandbox. Transport encryption, payload encryption and chain privacy are independent properties. G02 remains the exact v1 storage authority: no alternative KDF, AAD, record kind or session token is introduced here. G03 alone governs authenticated fresh-key restore. No physical erasure, global anonymity or provider availability guarantee is made.

## 7. Verification, references and release gates

Test cross-profile record/session access, distinct keys and IDs, accidental real data import, demo/live binding rejection and switch during decrypt. Verify G02 exact v1 schema remains unchanged.

For each supported profile record source/dependency commit, integrity digest, protocol revision, deployment/network IDs, fixture provenance, browser/provider matrix and named review. Mutable documentation links below identify primary protocols; they are not an evaluated implementation pin. Where no concrete profile is approved the implementation MUST return unsupported, not emulate success. Unit fixtures alone do not establish browser routing, wallet support or custody safety.

Acceptance requires positive interoperability and negative boundary cases, cancellation/reload fault injection, redacted logging checks, and a core-only build with advanced packages absent completing basic trading recovery. Record actual results separately; this expanded design is not test evidence. Independent review and applicable roadmap milestone gates remain pending.

- [DEVELOPMENT_ROADMAP](../../../DEVELOPMENT_ROADMAP.md).
- [spec-system-context-contract](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md).
- [spec-optional-module-interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md).
- [spec-indexeddb-encrypted-records](../module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md).
- [spec-transport-policy-enforcement](../../feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md).
- [Primary protocol reference](https://www.w3.org/TR/IndexedDB/).
- [Primary protocol reference](https://www.w3.org/TR/WebCryptoAPI/).
