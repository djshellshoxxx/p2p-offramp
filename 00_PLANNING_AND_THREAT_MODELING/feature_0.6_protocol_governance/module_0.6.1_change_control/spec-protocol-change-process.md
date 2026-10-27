# Protocol change and compatibility process

## 1. Metadata

- **Specification ID:** GOV02
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Turn protocol changes into explicit versioned decisions and compatibility evidence. No software update silently changes a signed trade's settlement semantics or upgrades already funded escrow.

## 3. Proposal and compatibility contracts

```typescript
interface ProtocolProposalV1 {
  version: 1;
  id: string; // stable repo ID
  kind: "wire" | "storage" | "escrow" | "crypto-profile" | "ui-only";
  priorVersion: string;
  proposedVersion: string;
  affectedSpecs: readonly string[];
  compatibleReaders: readonly string[];
  compatibleWriters: readonly string[];
  migrationId: string | null;
  recoveryArtifactHashes: readonly string[];
  threatImpactPath: string;
  testEvidencePaths: readonly string[];
  status: "draft" | "review" | "accepted" | "rejected" | "implemented" | "retired";
}
```

One proposal addresses one observable protocol change. Versioned wire/storage/contract schemas are independent of the frontend package version. Evidence paths and exact selected dependency/deployment revisions are part of the decision. UI wording changes that alter privacy or economic claims are security-impacting even if no ABI changes.

## 4. Review and rollout algorithm

Draft includes before/after examples, affected authorities, alternative designs, privacy impact and rollback/recovery plan. Review checks schema compatibility, old exits, mixed-client negotiation, reorg/restart behavior and required evidence. Accepted means design approved; implemented requires actual committed code/tests; neither means independently audited.

Breaking wire changes use a new supported protocol version and explicit negotiation. Unknown required versions refuse before signing/funding. Storage changes follow G09, preserving source profiles and downgrade export. Escrow changes deploy a new immutable version and do not migrate funded positions through frontend assumptions. Crypto changes update G06 profile/version and independent vectors, with no silent primitive/KDF downgrade.

Roll out to local fixtures, testnet/browser matrix, then separately reviewed release. Removing support requires published recovery artifacts for funded positions, not a package deletion that strands them. An emergency rollback selects a prior complete artifact/configuration set; it never writes a newer vault using an old schema or relabels chain state.

## 5. Interfaces and failure recovery

`validateProposal(input): CoreResult<ProtocolProposalV1>` enforces IDs <=64 ASCII bytes, at most 128 affected specs/evidence entries, valid repo-relative paths and known kind/status. `evaluateCompatibility(readerVersion, writerVersion, proposal)` returns compatible/read-only/unsupported with fixed rationale code. Implementation CI verifies exact spec paths and evidence files exist and that enabled profiles match release manifests. Missing evidence holds status at review; a failed upgrade leaves old authenticated data intact. Stakeholder comments are inputs, not votes that can seize funds or override contract authority.

## 6. Threat assessment

Semantic version labels can hide authority changes, mixed-version peers may negotiate down protection, and discarded recovery assets can lock users out. Bind exact capabilities and versions into terms; reject unknown required features. Reviewed proposal records reduce ambiguity but do not validate implementation correctness. Hostile proposals may contain links/code; review in inert text and never execute imported artifacts merely to inspect them.

## 7. Verification and references

Use a version compatibility table with old/new readers and writers. Test unknown required wire version, newer-record downgrade write refusal, old funded escrow recovery after UI upgrade, missing/dead recovery artifacts and altered crypto fixture hashes. Rejected/withdrawn proposals must not enable capabilities. Sources: [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G09 migrations](../../feature_0.4_architecture_planning/module_0.4.4_state_management/spec-storage-schema-migrations.md), [G14 extensions](../../feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md).
