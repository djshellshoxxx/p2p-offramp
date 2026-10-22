# Eip5564 announcement scanner

## 1. Metadata

- **Specification ID:** PRIV-EIP5564-ANNOUNCEMENT-SCANNER
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.2_financial_privacy
- **Module:** module_5.2.1_stealth_addresses
- **Delivery:** Core messaging/policy/display where consumed by Phase 2; other privacy extensions are opt-in Phase 3 or later, subject to the roadmap.
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective and boundary

Define event scanning, view-tag filtering, checkpoints, and reorganization recovery. Specify provider metadata exposure and malformed-announcement handling.

The system authority contract governs this module: external wallets authorize spending; deployed escrow and reconciled chain observations establish custody state; relay and local data are untrusted claims. This specification creates no operator release path, automatic bank payment or authority over an already funded trade. Missing optional infrastructure MUST preserve basic release/refund and encrypted recovery paths.

## 3. Architecture and data contracts

Scan records bind network, announcer deployment, schemeId, block hash/height, transaction hash and log index. Checkpoints include canonical anchor and a reviewed chain-specific reorg window; discovery results are encrypted G02 records, not proof of balance.

Runtime validation MUST reject unknown versions/properties, unsafe integers, duplicate identities and oversized inputs before expensive work. Network, deployment, trade and account generation are explicit bindings where economic state is involved. Amounts are unsigned decimal base-unit strings, never floating point. Immutable results and defensive copies prevent consumers mutating validated state. Protocol-specific limits override broader application limits.

## 4. Algorithms, transitions and invariants

Fetch bounded log ranges (at most 2000 blocks/request and 1000 logs/page; provider-specific smaller limits apply). Validate emitter/deployment, scheme, point and metadata lengths before curve operations. Apply the scheme-1 view tag as an optimization only, then perform full recipient derivation and chain balance verification. Advance checkpoint only after all pages persist atomically. On anchor mismatch roll back affected observations and rescan; never mark orphaned payments spendable.

Asynchronous jobs carry a generation and AbortSignal. Revoked generations MUST NOT publish late plaintext, restore stale coverage or initiate new economic work. Dispose removes subscriptions and closes owned resources. Cancellation after broadcast is an uncertain transaction outcome requiring journal reconciliation, not proof of rollback. Existing signed/funded terms cannot be renegotiated by changing a local preference.

## 5. Interfaces, errors and recovery

scan(fromAnchor, signal) emits bounded candidate batches; pause() preserves checkpoint; reconcile(anchor) reports reorged. A viewing key handle cannot sign spending transactions.

All interfaces return the shared core result/error contract. Distinguish INVALID_INPUT, UNSUPPORTED_VERSION, UNSUPPORTED_PROVIDER, UNAUTHORIZED, LOCKED, CANCELLED and unavailable external service; map concrete errors to registered G13 codes without exposing private content. No unbounded retry, secret-bearing diagnostics, destructive reset or silent downgrade is permitted. Operations that propose economic effects pass core preflight, durable G12 reservation and fresh external-wallet consent; this module cannot bypass them.

## 6. Threat assessment and privacy limits

RPC range queries reveal scan interests; view-tag collisions and malicious logs cause CPU load. Use worker budgets, 10000 candidate derivations/job and resumable cursors. Public logs and dust cannot establish payment intent.

Active origin compromise, malicious extensions and a compromised OS can read unlocked state; capability wrappers are not a same-origin JavaScript sandbox. Transport encryption, payload encryption and chain privacy are independent properties. G02 remains the exact v1 storage authority: no alternative KDF, AAD, record kind or session token is introduced here. G03 alone governs authenticated fresh-key restore. No physical erasure, global anonymity or provider availability guarantee is made.

## 7. Verification, references and release gates

Test false-positive view tags, malformed points, duplicate logs, paginated provider truncation, crash before checkpoint, reorg across checkpoint and unavailable historical logs. Require independent RPC/chain fixtures.

For each supported profile record source/dependency commit, integrity digest, protocol revision, deployment/network IDs, fixture provenance, browser/provider matrix and named review. Mutable documentation links below identify primary protocols; they are not an evaluated implementation pin. Where no concrete profile is approved the implementation MUST return unsupported, not emulate success. Unit fixtures alone do not establish browser routing, wallet support or custody safety.

Acceptance requires positive interoperability and negative boundary cases, cancellation/reload fault injection, redacted logging checks, and a core-only build with advanced packages absent completing basic trading recovery. Record actual results separately; this expanded design is not test evidence. Independent review and applicable roadmap milestone gates remain pending.

- [DEVELOPMENT_ROADMAP](../../../DEVELOPMENT_ROADMAP.md).
- [spec-system-context-contract](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md).
- [spec-optional-module-interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md).
- [spec-indexeddb-encrypted-records](../../feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md).
- [spec-transport-policy-enforcement](../../feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md).
- [Primary protocol reference](https://eips.ethereum.org/EIPS/eip-5564).
