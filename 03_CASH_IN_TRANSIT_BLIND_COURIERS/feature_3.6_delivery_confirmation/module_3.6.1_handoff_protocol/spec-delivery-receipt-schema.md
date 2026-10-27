# Delivery receipt schema

## 1. Metadata

- **Specification ID:** CIT-16
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5, optional M5; no Phase 2 dependency
- **Module:** module_3.6.1_handoff_protocol
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective

Represent signed custody assertions, conflicts and optional content observations without converting them into payment proof.

This extension MUST be explicitly negotiated in new signed trade terms. Removing it MUST preserve core release, refund and recovery. Basic escrow remains seller-authorized release before its immutable deadline and refund to the seller at/after expiry; a courier message grants no settlement authority. Any monetary authority change requires a separately versioned opt-in escrow with its own audit and exits.

## 3. Architecture and data contracts

```typescript
type Hex32 = string; // exactly 64 lowercase hexadecimal characters
type Key = string; // canonical key under the terms-bound signing profile
type Seconds = number; // nonnegative safe integer Unix seconds
type Units = string; // canonical unsigned decimal, no leading zeros except "0"; <=78 digits
interface CustodyReceipt { version: 1; shipmentId: Hex32; legId: Hex32;
 challengeHash: Hex32; predecessor: Hex32|null; giver: Key; taker: Key;
 containerCommitment: Hex32; inspectionHashes: Hex32[]; observedAt: Seconds;
 claim: "containerTransferred"|"returnTransferred"; contents: "notInspected"|"countClaimed";
 declaredCurrency: string|null; declaredMinorUnits: Units|null; }
interface SignedReceipt { body: CustodyReceipt; giverSignature: string; takerSignature: string; }
```

Validate revision, generation and counter fields as nonnegative safe integers; reject overflow rather than wrap. Asset adapters impose their own narrower integer limits before monetary operations. Key and signature decoders MUST enforce the exact pinned profile lengths; display labels are never keys. These are domain payloads carried inside an authenticated, encrypted extension message. Bind the envelope to version, trade binding (chain, network, deployment, tradeId), shipment terms hash, message ID, sender and recipient. Reject unknown versions/fields, duplicate JSON keys, invalid encodings and payloads above 16 KiB before signature work. Use RFC 8785 canonical JSON for the signed payload and a module/version domain separator; signatures use the reviewed terms-bound key profile, never an invented hardware key scheme. Event order is not authority: validate signatures, dependencies and expected revision. Store private payloads only in the authenticated local vault.

## 4. Algorithms and invariants

Hash canonical body under p2p-offramp/custody-receipt/v1 domain; require both signatures on exactly that body. Cap inspection hashes at eight; declared value is optional and requires countClaimed, but remains human assertion even if both signed. Link predecessor exactly; store at most 128 receipt candidates per shipment then reject excess into explicit export/recovery mode. Conflicting receipts are immutable branches tagged disputed. Never merge signatures over different bodies or erase a branch when a later receipt arrives.

All transitions MUST be deterministic over validated inputs. Process at most 128 events per reconciliation batch, yield between batches, and stop on missing dependencies rather than infer success. Retries preserve command IDs; economic commands use the chain journal. Local clocks govern advisory coordination only; authoritative chain guards govern monetary deadlines.

## 5. Interfaces, errors and lifecycle

`validateReceipt` yields attributed-mutual-claim, one-sided-claim or invalid; only the first may advance routine local custody. `exportEvidence` excludes attachments and locations by default. Retention/erasure follows consent; a hash may still be linkable personal metadata.

Return typed results `{ok:true,value}` or `{ok:false,code,retryable}`; common codes are malformed, unsupported-version, unauthorized, stale-revision, expired, missing-dependency, conflict and unavailable. A network timeout is unknown delivery, not failed custody. Locking the vault removes plaintext UI access; reload restores signed history and reconciles before offering actions. Redacted diagnostics contain error codes and random incident references, never cash amounts, coordinates, secrets or contact identities.

## 6. Threat assessment

Counterparties can collude, lie about counts or sign under duress. A receipt proves key statements, not authentic banknotes, physical transfer or final fiat settlement. No receipt directly invokes release, refund or deduction.

Container secrets, photographs, signatures and sensor assertions cannot guarantee cash contents, authenticity, custody or delivery. Route observers, recipients and compromised unlocked clients can retain disclosed information; expiry or deletion requests cannot guarantee remote erasure. Explicit consent and truthful claim labels are mandatory before physical coordination.

## 7. Verification and references

Required module fixtures: Same body with two authorized signatures advances custody; signatures on differing amounts do not combine. A countClaimed receipt for 10000 remains advisory. A fork with same predecessor stays visible. A 129th candidate is bounded without deleting the first 128.

Also test malformed/oversized input, wrong shipment/network/deployment, duplicate IDs, denied permissions, crash/reload, offline reconciliation and optional-package removal. Verify no fixture permits a courier action to release/refund basic principal. Evidence must include deterministic unit fixtures, two-client integration, fault injection and independent review before activation; this design has no passing implementation evidence.

**Open gates:** Receipt signing vectors, key profile revisions and encrypted evidence retention policy require review; content-verification services are not approved.

Authority and sequencing: [roadmap](../../../DEVELOPMENT_ROADMAP.md), [development status](../../../docs/DEVELOPMENT_STATUS.md), [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md). Canonical bytes: [RFC 8785, June 2020](https://www.rfc-editor.org/rfc/rfc8785.html). Browser randomness/hash boundary: [W3C Web Cryptography API Recommendation, 26 January 2017](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/). These sources define software primitives, not physical assurance. Implementation MUST pin the evaluated library/protocol revisions and record interoperability vectors; device-specific claims require actual manufacturer documentation and hardware evidence.
