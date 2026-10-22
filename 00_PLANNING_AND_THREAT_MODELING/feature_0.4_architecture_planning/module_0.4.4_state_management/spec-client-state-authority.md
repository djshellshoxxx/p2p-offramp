# Client state authority

- **Specification ID:** G08
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.4_architecture_planning
- **Module:** module_0.4.4_state_management
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define canonical, cached, and transient client state. Prevent optimistic UI changes from being mistaken for finalized escrow outcomes.

## Required behavior

1. Chain-confirmed escrow state is authoritative; relay orders are advertisements and local payment claims are unverified assertions.
2. Use explicit loading, stale, pending, confirmed, finalized, failed, and reorged states with chain-specific meanings.
3. Persist only schema-validated minimal recovery state; document reducer/event ordering and multi-tab ownership.

## Dependencies

- [G02: IndexedDB encrypted records](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md)
- [G07: Static frontend architecture](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.3_frontend_shell/spec-static-frontend-architecture.md)

## Acceptance evidence

- Out-of-order duplicate events converge to the same state.
- Reorganization rolls back optimistic success and prevents premature payment instructions.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
