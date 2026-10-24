# Administrative authority and immutable exits

## 1. Metadata

- **Specification ID:** GOV01
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Enumerate exactly what maintainers can change and prevent off-chain administration from becoming undisclosed custody. Core v1 escrow is immutable with no admin withdraw, pause-release/refund, confiscation, arbitrary call, operator release or upgrade authority. Publishing software is distinct from controlling already-deployed escrow.

## 3. Authority architecture

| Actor | Allowed authority | Forbidden authority |
|---|---|---|
| Repository maintainer | Reviewed source changes and new version proposals | Moving users' funds or rewriting funded terms |
| Release signer | Sign reviewed artifact/registry version | Changing a deployed immutable escrow |
| Registry curator | Approve new deployment/assets; deprecate new use | Reassign an existing funded trade |
| Relay/directory operator | Host/distribute/censor messages | Authorize escrow release from message status |
| Seller | Release bound crypto before deadline | Change buyer/asset/amount after funding |
| Any refund trigger | Invoke eligible timeout refund | Change refund destination from seller |
| Optional arbiter/courier | Only explicitly opted-in separately deployed terms | Authority over basic escrow |

Release trust roots belong to G15; app binaries may be replaced by hosting operators, so users must verify independently trusted artifacts. No on-chain governance contract is introduced by this administrative model.

## 4. Change and emergency algorithms

A new deployment has a new registry identity and immutable code; existing funded trades retain their ABI/IDL and exit metadata. A signed off-chain pause/deprecation may hide new-funding buttons and warn users but cannot lock deployed exits or force a migration. Emergency UI releases default to recovery/watch-only for the affected new-entry feature; existing compatible release/refund commands remain accessible after fresh chain/wallet checks.

Production release policy requires two distinct reviewed attestations: implementation/change owner and security/release reviewer. A sole developer may produce local/testnet builds with one signature but cannot label that independent review. If no independent reviewer is available, record the gate pending rather than invent an identity. Key revocation is published through the prior trusted release-key policy; replacing a public key downloaded from the same compromised site is not independent recovery.

## 5. Interfaces and audit records

```typescript
interface AuthorityDecisionV1 {
  version: 1;
  decisionId: string; // 32 lowercase hex
  scope: "source" | "release" | "registry" | "incident";
  affectedCapability: string;
  previousArtifactHash: string | null;
  nextArtifactHash: string | null;
  reviewers: readonly string[];
  evidencePaths: readonly string[];
  status: "proposed" | "accepted" | "rejected" | "withdrawn";
}
```

Decisions are public sanitized repo artifacts, never private trade logs. Schema rejects unknown fields, duplicate reviewer identities and nonexistent evidence paths. Hashes are exact lowercase SHA-256 artifact digests; chain runtime hashes remain G11 family-specific. Missing accepted decisions block release-enabled configuration changes; they do not delete existing recovery data.

## 6. Threat assessment

A maintainer/release key compromise can deliver malicious client code even with immutable escrow, so immutability alone does not protect signing requests. Separate software provenance from contract authority, retain old artifact/recovery instructions and expose all enabled privilege surfaces. A malicious relay can censor coordination; it cannot acquire a settlement role. Multiple names controlled by one person are not independent review. Optional upgrade/admin mechanisms stay outside core and need separate explicit terms before funds are committed.

## 7. Verification and references

Contract tests and ABI/IDL inspection assert absence of admin sweep/upgrade/pause-exit paths. Test signed deprecation prevents new default funding without disabling compatible old release/refund recovery. Simulate compromised release-key notice, missing reviewer and false duplicate identities. Validate decision records and exact artifact linkage. Sources: [system context](../../feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [registry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.2_rpc_registry/spec-chain-network-registry.md), [release policy](../../feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md).
