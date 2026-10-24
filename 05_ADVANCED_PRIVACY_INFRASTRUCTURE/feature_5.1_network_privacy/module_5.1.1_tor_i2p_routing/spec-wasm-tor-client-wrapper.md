# Wasm tor client wrapper

## 1. Metadata

- **Specification ID:** PRIV-WASM-TOR-CLIENT-WRAPPER
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.1_network_privacy
- **Module:** module_5.1.1_tor_i2p_routing
- **Delivery:** Core messaging/policy/display where consumed by Phase 2; other privacy extensions are opt-in Phase 3 or later, subject to the roadmap.
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective and boundary

Define a feasibility-gated interface for browser privacy routing. Specify browser networking limits and alternatives such as compatible browsers or native companions.

The system authority contract governs this module: external wallets authorize spending; deployed escrow and reconciled chain observations establish custody state; relay and local data are untrusted claims. This specification creates no operator release path, automatic bank payment or authority over an already funded trade. Missing optional infrastructure MUST preserve basic release/refund and encrypted recovery paths.

## 3. Architecture and data contracts

This is a conditional adapter contract, not an assertion that a production browser Tor implementation exists. Registry entries identify exact WASM source revision, binary digest, build flags, bootstrap bridge protocol, worker origin and audited transport boundary. Default registry is empty/unsupported.

Runtime validation MUST reject unknown versions/properties, unsafe integers, duplicate identities and oversized inputs before expensive work. Network, deployment, trade and account generation are explicit bindings where economic state is involved. Amounts are unsigned decimal base-unit strings, never floating point. Immutable results and defensive copies prevent consumers mutating validated state. Protocol-specific limits override broader application limits.

## 4. Algorithms, transitions and invariants

WASM has no native raw TCP privilege in a normal browser. A candidate must declare its WebSocket/WebTransport bridge and trust model, bootstrap without unapproved direct requests, and establish connection-scoped evidence through G05. Run in a dedicated bounded worker; cap initialization at 60 seconds and stop on cancellation. Never ship a dummy circuit that returns protected.

Asynchronous jobs carry a generation and AbortSignal. Revoked generations MUST NOT publish late plaintext, restore stale coverage or initiate new economic work. Dispose removes subscriptions and closes owned resources. Cancellation after broadcast is an uncertain transaction outcome requiring journal reconciliation, not proof of rollback. Existing signed/funded terms cannot be renegotiated by changing a local preference.

## 5. Interfaces, errors and recovery

initialize(profileId, signal), openStream(destinationId, signal), health() and dispose() return unsupported until an independently reviewed profile is registered. Bridge URLs are fixed release configuration, not relay-supplied code.

All interfaces return the shared core result/error contract. Distinguish INVALID_INPUT, UNSUPPORTED_VERSION, UNSUPPORTED_PROVIDER, UNAUTHORIZED, LOCKED, CANCELLED and unavailable external service; map concrete errors to registered G13 codes without exposing private content. No unbounded retry, secret-bearing diagnostics, destructive reset or silent downgrade is permitted. Operations that propose economic effects pass core preflight, durable G12 reservation and fresh external-wallet consent; this module cannot bypass them.

## 6. Threat assessment and privacy limits

A bridge sees client IP and destination metadata depending on architecture; malicious bootstrap and binary supply chain can defeat privacy. Worker termination limits activity, not forensic erasure.

Active origin compromise, malicious extensions and a compromised OS can read unlocked state; capability wrappers are not a same-origin JavaScript sandbox. Transport encryption, payload encryption and chain privacy are independent properties. G02 remains the exact v1 storage authority: no alternative KDF, AAD, record kind or session token is introduced here. G03 alone governs authenticated fresh-key restore. No physical erasure, global anonymity or provider availability guarantee is made.

## 7. Verification, references and release gates

Empty registry refuses; blocked bridge cannot fall back; inspect all bootstrap traffic; kill worker during handshake and verify no late sockets/results. Production enabling requires independent protocol review and controlled egress capture.

For each supported profile record source/dependency commit, integrity digest, protocol revision, deployment/network IDs, fixture provenance, browser/provider matrix and named review. Mutable documentation links below identify primary protocols; they are not an evaluated implementation pin. Where no concrete profile is approved the implementation MUST return unsupported, not emulate success. Unit fixtures alone do not establish browser routing, wallet support or custody safety.

Acceptance requires positive interoperability and negative boundary cases, cancellation/reload fault injection, redacted logging checks, and a core-only build with advanced packages absent completing basic trading recovery. Record actual results separately; this expanded design is not test evidence. Independent review and applicable roadmap milestone gates remain pending.

- [DEVELOPMENT_ROADMAP](../../../DEVELOPMENT_ROADMAP.md).
- [spec-system-context-contract](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md).
- [spec-optional-module-interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md).
- [spec-indexeddb-encrypted-records](../../feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md).
- [spec-transport-policy-enforcement](../module_5.1.2_transport_policy/spec-transport-policy-enforcement.md).
- [Primary protocol reference](https://spec.torproject.org/).
- [Primary protocol reference](https://webassembly.github.io/spec/core/).
