# Courier compensation accounting

## 1. Metadata

- **Specification ID:** CIT-01
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5, optional M5; no Phase 2 dependency
- **Module:** module_3.1.1_three_party_escrow
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective

Account for agreed courier fees separately from cash value and the basic crypto principal.

This extension MUST be explicitly negotiated in new signed trade terms. Removing it MUST preserve core release, refund and recovery. Basic escrow remains seller-authorized release before its immutable deadline and refund to the seller at/after expiry; a courier message grants no settlement authority. Any monetary authority change requires a separately versioned opt-in escrow with its own audit and exits.

## 3. Architecture and data contracts

```typescript
type Hex32 = string; // exactly 64 lowercase hexadecimal characters
type Key = string; // canonical key under the terms-bound signing profile
type Seconds = number; // nonnegative safe integer Unix seconds
type Units = string; // canonical unsigned decimal, no leading zeros except "0"; <=78 digits
interface FeeSchedule { shipmentId: Hex32; assetId: string; payer: Key;
 total: Units; pickupFee: Units; deliveryFee: Units; cancellationFee: Units;
 refundTo: string; payTo: string; policyHash: Hex32; }
interface FeeAllocation { allocationId: Hex32; earned: Units; refunded: Units; pending: Units; basis: "cooperative"|"timeoutRefund"; }
```

Validate revision, generation and counter fields as nonnegative safe integers; reject overflow rather than wrap. Asset adapters impose their own narrower integer limits before monetary operations. Key and signature decoders MUST enforce the exact pinned profile lengths; display labels are never keys. These are domain payloads carried inside an authenticated, encrypted extension message. Bind the envelope to version, trade binding (chain, network, deployment, tradeId), shipment terms hash, message ID, sender and recipient. Reject unknown versions/fields, duplicate JSON keys, invalid encodings and payloads above 16 KiB before signature work. Use RFC 8785 canonical JSON for the signed payload and a module/version domain separator; signatures use the reviewed terms-bound key profile, never an invented hardware key scheme. Event order is not authority: validate signatures, dependencies and expected revision. Store private payloads only in the authenticated local vault.

## 4. Algorithms and invariants

Validate all amounts in asset smallest units with arbitrary precision integers and total bounds. Reserve total once. Before pickup, cooperative cancellation allocates at most the signed cancellationFee; after pickup partial fees require an allocation signed by payer and courier. No-response timeout refunds pending fees to the prebound payer; this is an economic choice, not a finding against the courier. Enforce earned+refunded+pending=total and monotonically consumed allocation IDs. Missing agreement holds only until resolveBy then uses the pre-agreed refund rule.

All transitions MUST be deterministic over validated inputs. Process at most 128 events per reconciliation batch, yield between batches, and stop on missing dependencies rather than infer success. Retries preserve command IDs; economic commands use the chain journal. Local clocks govern advisory coordination only; authoritative chain guards govern monetary deadlines.

## 5. Interfaces, errors and lifecycle

`quote` is advisory; `acceptSchedule` freezes fields. `allocate` requires matching policy and signatures; `withdraw` is a separate chain-journaled operation. Unknown broadcast means pending until reconciliation, never a second payment.

Return typed results `{ok:true,value}` or `{ok:false,code,retryable}`; common codes are malformed, unsupported-version, unauthorized, stale-revision, expired, missing-dependency, conflict and unavailable. A network timeout is unknown delivery, not failed custody. Locking the vault removes plaintext UI access; reload restores signed history and reconciles before offering actions. Redacted diagnostics contain error codes and random incident references, never cash amounts, coordinates, secrets or contact identities.

## 6. Threat assessment

Courier can obtain a receipt without delivery and payer can deny real service. Advisory receipts alone cannot pay fees. No fee deduction may consume basic trade principal or change its release deadline.

Container secrets, photographs, signatures and sensor assertions cannot guarantee cash contents, authenticity, custody or delivery. Route observers, recipients and compromised unlocked clients can retain disclosed information; expiry or deletion requests cannot guarantee remote erasure. Explicit consent and truthful claim labels are mandatory before physical coordination.

## 7. Verification and references

Required module fixtures: total=100, pickupFee=30, deliveryFee=70; cooperative partial allocation of 30 yields refund 70. Duplicate allocation cannot pay twice. Proposed earned=101 rejects. A timeout with no agreement refunds 100 without labeling fraud.

Also test malformed/oversized input, wrong shipment/network/deployment, duplicate IDs, denied permissions, crash/reload, offline reconciliation and optional-package removal. Verify no fixture permits a courier action to release/refund basic principal. Evidence must include deterministic unit fixtures, two-client integration, fault injection and independent review before activation; this design has no passing implementation evidence.

**Open gates:** No live fee vault or asset profile is approved; deployment requires separate audited custody, token accounting and chain parity.

Authority and sequencing: [roadmap](../../../DEVELOPMENT_ROADMAP.md), [development status](../../../docs/DEVELOPMENT_STATUS.md), [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md). Canonical bytes: [RFC 8785, June 2020](https://www.rfc-editor.org/rfc/rfc8785.html). Browser randomness/hash boundary: [W3C Web Cryptography API Recommendation, 26 January 2017](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/). These sources define software primitives, not physical assurance. Implementation MUST pin the evaluated library/protocol revisions and record interoperability vectors; device-specific claims require actual manufacturer documentation and hardware evidence.
