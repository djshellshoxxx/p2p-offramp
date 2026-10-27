# Locker command interface

## 1. Metadata

- **Specification ID:** CIT-10
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5, optional M5; no Phase 2 dependency
- **Module:** module_3.4.1_smart_locker_adapter
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective

Define a vendor-neutral boundary that refuses unsupported hardware instead of simulating authenticated locker control.

This extension MUST be explicitly negotiated in new signed trade terms. Removing it MUST preserve core release, refund and recovery. Basic escrow remains seller-authorized release before its immutable deadline and refund to the seller at/after expiry; a courier message grants no settlement authority. Any monetary authority change requires a separately versioned opt-in escrow with its own audit and exits.

## 3. Architecture and data contracts

```typescript
type Hex32 = string; // exactly 64 lowercase hexadecimal characters
type Key = string; // canonical key under the terms-bound signing profile
type Seconds = number; // nonnegative safe integer Unix seconds
type Units = string; // canonical unsigned decimal, no leading zeros except "0"; <=78 digits
interface LockerCommand { commandId: Hex32; shipmentId: Hex32; lockerId: string;
 profileId: string; operation: "reserve"|"unlock"|"status"|"releaseReservation";
 reservationId: string|null; expectedCounter: number; capabilityHash: Hex32; expiresAt: Seconds; }
interface LockerObservation { commandId: Hex32; counter: number; status: "locked"|"unlocked"|"jammed"|"unknown"; authenticated: boolean; }
```

Validate revision, generation and counter fields as nonnegative safe integers; reject overflow rather than wrap. Asset adapters impose their own narrower integer limits before monetary operations. Key and signature decoders MUST enforce the exact pinned profile lengths; display labels are never keys. These are domain payloads carried inside an authenticated, encrypted extension message. Bind the envelope to version, trade binding (chain, network, deployment, tradeId), shipment terms hash, message ID, sender and recipient. Reject unknown versions/fields, duplicate JSON keys, invalid encodings and payloads above 16 KiB before signature work. Use RFC 8785 canonical JSON for the signed payload and a module/version domain separator; signatures use the reviewed terms-bound key profile, never an invented hardware key scheme. Event order is not authority: validate signatures, dependencies and expected revision. Store private payloads only in the authenticated local vault.

## 4. Algorithms and invariants

Negotiate profile before reservation. It must specify vendor protocol revision, identity provisioning, transport authentication, key rotation, replay defense and response meaning. Validate command binding and monotonic counter; serialize unlock operations per reservation. Persist intent before send and reconcile commandId after timeout; never blindly resend an uncertain unlock. A door status is a sensor assertion and never a custody receipt. Baseline adapter list is empty; unsupported lockers return refusal without network side effects.

All transitions MUST be deterministic over validated inputs. Process at most 128 events per reconciliation batch, yield between batches, and stop on missing dependencies rather than infer success. Retries preserve command IDs; economic commands use the chain journal. Local clocks govern advisory coordination only; authoritative chain guards govern monetary deadlines.

## 5. Interfaces, errors and lifecycle

`LockerAdapter.capabilities`, `execute` and `reconcile` are abstract interfaces only. Errors include unsupported-profile, identity-mismatch, denied, expired, unknown-outcome and device-fault. A demo/mock adapter must be unmistakably test-only and excluded from supported hardware UI.

Return typed results `{ok:true,value}` or `{ok:false,code,retryable}`; common codes are malformed, unsupported-version, unauthorized, stale-revision, expired, missing-dependency, conflict and unavailable. A network timeout is unknown delivery, not failed custody. Locking the vault removes plaintext UI access; reload restores signed history and reconciles before offering actions. Redacted diagnostics contain error codes and random incident references, never cash amounts, coordinates, secrets or contact identities.

## 6. Threat assessment

A cloned QR, rogue endpoint, replayed unlock and compromised operator may expose the container. User-provided locker URL cannot become a trusted endpoint automatically. Unlock credentials must not enter relays, logs or photos.

Container secrets, photographs, signatures and sensor assertions cannot guarantee cash contents, authenticity, custody or delivery. Route observers, recipients and compromised unlocked clients can retain disclosed information; expiry or deletion requests cannot guarantee remote erasure. Explicit consent and truthful claim labels are mandatory before physical coordination.

## 7. Verification and references

Required module fixtures: Unknown profile refuses reserve. Timeout after accepted unlock yields unknown-outcome and reconcile, not second unlock. Device counter rollback quarantines the reservation. A reported locked door cannot auto-complete delivery.

Also test malformed/oversized input, wrong shipment/network/deployment, duplicate IDs, denied permissions, crash/reload, offline reconciliation and optional-package removal. Verify no fixture permits a courier action to release/refund basic principal. Evidence must include deterministic unit fixtures, two-client integration, fault injection and independent review before activation; this design has no passing implementation evidence.

**Open gates:** No fictional REST endpoint, BLE integration or manufacturer guarantee is specified; selecting and independently testing real hardware is an M5 blocker.

Authority and sequencing: [roadmap](../../../DEVELOPMENT_ROADMAP.md), [development status](../../../docs/DEVELOPMENT_STATUS.md), [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md). Canonical bytes: [RFC 8785, June 2020](https://www.rfc-editor.org/rfc/rfc8785.html). Browser randomness/hash boundary: [W3C Web Cryptography API Recommendation, 26 January 2017](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/). These sources define software primitives, not physical assurance. Implementation MUST pin the evaluated library/protocol revisions and record interoperability vectors; device-specific claims require actual manufacturer documentation and hardware evidence.
