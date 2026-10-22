# IPFS origin and update policy

- **Specification ID:** G15
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.3_system_integration
- **Module:** module_0.3.3_release_distribution
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define verified static artifact publication and client update discovery. Preserve custody and local state across IPFS origins.

## Required behavior

1. Pin built artifacts through at least two independently administered services and record CID, digest, source commit, dependency inventory, and deployment manifest.
2. Prefer origin-isolated subdomain gateways where supported; never assume IndexedDB follows the user across CIDs or gateways.
3. Provide signed update metadata, explicit encrypted export/import, and an archived compatible recovery client; v1 uses no service worker to reduce stale-client complexity.

## Dependencies

- [G03: Encrypted backup and recovery](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-encrypted-backup-recovery.md)
- [G07: Static frontend architecture](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.3_frontend_shell/spec-static-frontend-architecture.md)
- [G09: Storage schema migrations](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.4_state_management/spec-storage-schema-migrations.md)
- [G11: Chain network registry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.2_rpc_registry/spec-chain-network-registry.md)

## Acceptance evidence

- Cold-load both pins, verify manifest integrity, and restore data to the new origin.
- Rollback UI retains ability to view and settle old contract versions.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
