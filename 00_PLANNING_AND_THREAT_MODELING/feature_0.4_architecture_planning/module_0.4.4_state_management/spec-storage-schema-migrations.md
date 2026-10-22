# Storage schema migrations

- **Specification ID:** G09
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.4_architecture_planning
- **Module:** module_0.4.4_state_management
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define versioned vault migrations and compatibility checks. Preserve existing trades when application versions or origins change.

## Required behavior

1. Stage migrations and verify record counts and authenticated content before atomic activation.
2. Block unsupported downgrade writes while offering read-only recovery/export.
3. Never infer a new chain contract or capability for an existing trade during migration.

## Dependencies

- [G02: IndexedDB encrypted records](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md)
- [G08: Client state authority](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.4_state_management/spec-client-state-authority.md)

## Acceptance evidence

- Interrupted migration resumes or restores the previous schema without data loss.
- Older clients cannot silently corrupt newer records.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
