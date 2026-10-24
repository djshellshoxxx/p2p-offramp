# Proof system upgrade and retirement policy

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M3/M4 optional.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Upgrade optional proof capabilities without changing the statement or authority of already signed/funded trades. Circuit version, proving artifacts and verification key form one immutable identity. An update is never authorization to replace a verifier silently.

## 3. Architecture and data contracts

Registry entry: `{capabilityId,statementVersion,circuitDigest,vkDigest,proverDigest,verifierDigest,setupDigest,policyDigest,sourceCommit,status,activatedAt,retiredAt,reason,successorId}`. All digests use SHA-256 exact artifact bytes; registry updates are signed release data under G15. State is proposed → reviewed → enabled-for-new-trades → deprecated → retired; emergency quarantine may occur from any enabled state. Existing signed terms bind the registry entry digest and must retain their original interpretation.

## 4. Algorithms and lifecycle

For every change, classify statement semantics, setup, verifier code and artifact-format impact. Any changed circuit, verification key or policy gets a new immutable capability ID; no in-place alias. Generate positive/negative cross-version corpus and publish diff/review evidence. Enable for new trades only after G06 provenance, independent review and measured bounds pass. Deprecation stops offering new sessions; existing verification may remain available read-only with an explicit warning. Quarantine stops reliance on affected proofs and preserves exports. Basic escrow exits remain seller release before expiry or seller refund at/after expiry; maintainers cannot override these through registry changes. If an optional contract binds a verifier, its own pre-agreed timeout/failure mechanism governs and must be independently specified.

## 5. Interfaces and integration

`resolveCapability(id,digest)` returns exact entry or unsupported; never latest-version substitution. `checkUpgrade(old,new)` emits compatibility report with statement differences, migration steps and rollback bounds. Client caches verified historical public verifiers as data only under content policy; arbitrary remote code loading is forbidden. Restored receipts can be inspected using recorded historical metadata even if active verification is disabled.

## 6. Errors, abuse and residual threats

CAPABILITY_RETIRED, ARTIFACT_DIGEST_MISMATCH, REGISTRY_ROLLBACK and VERSION_CONFLICT prohibit new proof-dependent terms. Revocation information can be withheld by a stale host; display last verified registry time and offline/stale status. Retirement cannot erase public proofs or repair an unsound historical decision. A compromised release key is an incident under G26, not automatically cured by fetching another key from the same origin.

## 7. Verification and primary references

Test new/old proof × verifier matrix, malicious same-ID artifact replacement, offline historical receipts, registry rollback, missing historical verifier and interrupted upgrade. A basic core-only trade must complete after every optional capability is disabled. Release evidence includes exact artifact hashes, reviewers and accepted residual risk; no “audited” label without linked scope and report.

Primary references (exact implementation revisions must be pinned in the evidence record): [WebAssembly security](https://webassembly.org/docs/security/); [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).
