# Encrypted backup and recovery

- **Specification ID:** G03
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.7_local_data_isolation
- **Module:** module_5.7.2_indexeddb_vault
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 0

## Scope

Define portable encrypted vault export and restore. Preserve user custody across device loss and content-addressed origin changes.

## Required behavior

1. Export a versioned authenticated bundle without wallet spending keys; include recovery instructions and a checksum for transport corruption.
2. Restore into a staging vault, verify completely, then atomically switch; never overwrite a healthy vault after failed authentication.
3. Distinguish local identity recovery from wallet recovery and recoverable chain state; document loss of unbacked-up chat keys.

## Dependencies

- [G02: IndexedDB encrypted records](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md)

## Acceptance evidence

- Restore into a fresh browser origin and recover pending trade references.
- Reject truncated, wrong-password, and unsupported-version bundles without deleting existing data.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
