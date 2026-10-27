# Physical handoff failure policy

## 1. Metadata

- **Specification ID:** G32
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5, optional M5; no Phase 2 dependency
- **Module:** module_3.7.1_custody_timeouts
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective

Provide bounded coordination recovery for missing couriers, conflicting receipts and lockers while preserving the basic trade exits.

This extension MUST be explicitly negotiated in new signed trade terms. Removing it MUST preserve core release, refund and recovery. Basic escrow remains seller-authorized release before its immutable deadline and refund to the seller at/after expiry; a courier message grants no settlement authority. Any monetary authority change requires a separately versioned opt-in escrow with its own audit and exits.

## 3. Architecture and data contracts

```typescript
type Hex32 = string; // exactly 64 lowercase hexadecimal characters
type Key = string; // canonical key under the terms-bound signing profile
type Seconds = number; // nonnegative safe integer Unix seconds
type Units = string; // canonical unsigned decimal, no leading zeros except "0"; <=78 digits
interface RecoveryCase { caseId: Hex32; shipmentId: Hex32; termsHash: Hex32;
 cause: "noShow"|"late"|"missingAck"|"conflictingCustody"|"lockerFailure"|"secretExposure";
 openedAt: Seconds; responseBy: Seconds; resolveBy: Seconds; receiptHeads: Hex32[];
 outcome: "open"|"cooperativeReturn"|"cooperativeDelivery"|"financialTimeout"|"unresolvedPhysical"; }
```

Validate revision, generation and counter fields as nonnegative safe integers; reject overflow rather than wrap. Asset adapters impose their own narrower integer limits before monetary operations. Key and signature decoders MUST enforce the exact pinned profile lengths; display labels are never keys. These are domain payloads carried inside an authenticated, encrypted extension message. Bind the envelope to version, trade binding (chain, network, deployment, tradeId), shipment terms hash, message ID, sender and recipient. Reject unknown versions/fields, duplicate JSON keys, invalid encodings and payloads above 16 KiB before signature work. Use RFC 8785 canonical JSON for the signed payload and a module/version domain separator; signatures use the reviewed terms-bound key profile, never an invented hardware key scheme. Event order is not authority: validate signatures, dependencies and expected revision. Store private payloads only in the authenticated local vault.

## 4. Algorithms and invariants

Require pre-pickup signed responseBy/resolveBy policy with response interval 1–24 hours and recovery horizon at most seven days. These limits coordinate messages, not guarantee retrieval. On failure freeze new leg assignments, preserve up to 16 competing heads and contact only consented participants. Permit at most three reminder attempts; no responseBy means escalate to cooperative recovery, not guilt. At resolveBy apply explicit fee/stake timeout rules; record unresolvedPhysical if custody is still uncertain. Basic escrow independently uses chain time: seller release before deadline, refund to seller at/after deadline. Warn against starting physical movement without adequate pre-agreed safety margin.

All transitions MUST be deterministic over validated inputs. Process at most 128 events per reconciliation batch, yield between batches, and stop on missing dependencies rather than infer success. Retries preserve command IDs; economic commands use the chain journal. Local clocks govern advisory coordination only; authoritative chain guards govern monetary deadlines.

## 5. Interfaces, errors and lifecycle

`openRecovery`, `submitStatement`, `agreeOutcome` and `exportCase` work offline for local evidence; remote delivery is explicitly pending. A cooperative physical outcome needs affected custodian/recipient signatures. No local timer changes economic authority.

Return typed results `{ok:true,value}` or `{ok:false,code,retryable}`; common codes are malformed, unsupported-version, unauthorized, stale-revision, expired, missing-dependency, conflict and unavailable. A network timeout is unknown delivery, not failed custody. Locking the vault removes plaintext UI access; reload restores signed history and reconciles before offering actions. Redacted diagnostics contain error codes and random incident references, never cash amounts, coordinates, secrets or contact identities.

## 6. Threat assessment

A party can stall until the crypto refund while holding cash. Software cannot solve that seller-withholding/courier risk. Photos, seed knowledge, locker telemetry and no-show claims are allegations, never sufficient unilateral slashing. Safety concerns permit stopping travel without fabricated delivery.

Container secrets, photographs, signatures and sensor assertions cannot guarantee cash contents, authenticity, custody or delivery. Route observers, recipients and compromised unlocked clients can retain disclosed information; expiry or deletion requests cannot guarantee remote erasure. Explicit consent and truthful claim labels are mandatory before physical coordination.

## 7. Verification and references

Required module fixtures: Missing acknowledgment at pickup creates open case with unknown custodian. At resolveBy fee timeout occurs while physical outcome remains unresolved. Locker outage cannot prevent direct core refund. A later valid receipt appends history without reversing finalized chain settlement.

Also test malformed/oversized input, wrong shipment/network/deployment, duplicate IDs, denied permissions, crash/reload, offline reconciliation and optional-package removal. Verify no fixture permits a courier action to release/refund basic principal. Evidence must include deterministic unit fixtures, two-client integration, fault injection and independent review before activation; this design has no passing implementation evidence.

**Open gates:** Adversarial cash guarantees remain disabled before a separately specified, audited opt-in settlement mechanism. Jurisdiction, return contacts, insurance and actual device recovery are deployment blockers.

Authority and sequencing: [roadmap](../../../DEVELOPMENT_ROADMAP.md), [development status](../../../docs/DEVELOPMENT_STATUS.md), [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md). Canonical bytes: [RFC 8785, June 2020](https://www.rfc-editor.org/rfc/rfc8785.html). Browser randomness/hash boundary: [W3C Web Cryptography API Recommendation, 26 January 2017](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/). These sources define software primitives, not physical assurance. Implementation MUST pin the evaluated library/protocol revisions and record interoperability vectors; device-specific claims require actual manufacturer documentation and hardware evidence.
