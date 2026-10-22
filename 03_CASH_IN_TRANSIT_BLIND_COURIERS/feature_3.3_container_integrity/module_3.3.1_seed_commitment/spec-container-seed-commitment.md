# Container seed commitment

## 1. Metadata

- **Specification ID:** CIT-08
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5, optional M5; no Phase 2 dependency
- **Module:** module_3.3.1_seed_commitment
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective

Bind a high-entropy container secret to one shipment revision without claiming a cryptographic proof of physical contents.

This extension MUST be explicitly negotiated in new signed trade terms. Removing it MUST preserve core release, refund and recovery. Basic escrow remains seller-authorized release before its immutable deadline and refund to the seller at/after expiry; a courier message grants no settlement authority. Any monetary authority change requires a separately versioned opt-in escrow with its own audit and exits.

## 3. Architecture and data contracts

```typescript
type Hex32 = string; // exactly 64 lowercase hexadecimal characters
type Key = string; // canonical key under the terms-bound signing profile
type Seconds = number; // nonnegative safe integer Unix seconds
type Units = string; // canonical unsigned decimal, no leading zeros except "0"; <=78 digits
interface ContainerCommitment { version: 1; shipmentId: Hex32; containerId: Hex32;
 generation: number; commitment: Hex32; creator: Key; publishedAt: Seconds; }
interface SecretOpening { shipmentId: Hex32; containerId: Hex32; generation: number; secret: Hex32; }
```

Validate revision, generation and counter fields as nonnegative safe integers; reject overflow rather than wrap. Asset adapters impose their own narrower integer limits before monetary operations. Key and signature decoders MUST enforce the exact pinned profile lengths; display labels are never keys. These are domain payloads carried inside an authenticated, encrypted extension message. Bind the envelope to version, trade binding (chain, network, deployment, tradeId), shipment terms hash, message ID, sender and recipient. Reject unknown versions/fields, duplicate JSON keys, invalid encodings and payloads above 16 KiB before signature work. Use RFC 8785 canonical JSON for the signed payload and a module/version domain separator; signatures use the reviewed terms-bound key profile, never an invented hardware key scheme. Event order is not authority: validate signatures, dependencies and expected revision. Store private payloads only in the authenticated local vault.

## 4. Algorithms and invariants

Generate 32 random bytes through Web Crypto getRandomValues; do not derive from passwords, serial numbers or wallet keys. Define commitment=SHA-256(UTF8("p2p-offramp/container/v1\0") || JCS({shipmentId,containerId,generation,secret})), with secret as lowercase hex. Publish signed commitment before any opening. Verify byte lengths and recompute; reject cross-shipment openings. Cap at one active generation and 16 historical generations. Opening proves knowledge of committed bytes only; never use it as sole delivery, value or slashing authority.

All transitions MUST be deterministic over validated inputs. Process at most 128 events per reconciliation batch, yield between batches, and stop on missing dependencies rather than infer success. Retries preserve command IDs; economic commands use the chain journal. Local clocks govern advisory coordination only; authoritative chain guards govern monetary deadlines.

## 5. Interfaces, errors and lifecycle

`commit` requires available secure randomness; `verifyOpening` returns match, mismatch or malformed. Once disclosed, the secret is public evidence and cannot be reused as an access credential.

Return typed results `{ok:true,value}` or `{ok:false,code,retryable}`; common codes are malformed, unsupported-version, unauthorized, stale-revision, expired, missing-dependency, conflict and unavailable. A network timeout is unknown delivery, not failed custody. Locking the vault removes plaintext UI access; reload restores signed history and reconciles before offering actions. Redacted diagnostics contain error codes and random incident references, never cash amounts, coordinates, secrets or contact identities.

## 6. Threat assessment

A courier may copy the secret or move its label to an empty container. The creator may pre-share it. A hash binds bytes, not notes, authenticity, possession or delivery. Physical seals supply fallible observation only.

Container secrets, photographs, signatures and sensor assertions cannot guarantee cash contents, authenticity, custody or delivery. Route observers, recipients and compromised unlocked clients can retain disclosed information; expiry or deletion requests cannot guarantee remote erasure. Explicit consent and truthful claim labels are mandatory before physical coordination.

## 7. Verification and references

Required module fixtures: Fixed fixture secret=32 zero bytes is test-only; calculate and publish canonical bytes and digest during implementation. Mutation of containerId or generation must fail. Production RNG failure must refuse creation; no timestamp fallback.

Also test malformed/oversized input, wrong shipment/network/deployment, duplicate IDs, denied permissions, crash/reload, offline reconciliation and optional-package removal. Verify no fixture permits a courier action to release/refund basic principal. Evidence must include deterministic unit fixtures, two-client integration, fault injection and independent review before activation; this design has no passing implementation evidence.

**Open gates:** Executable commitment vector and reviewed canonicalizer are implementation gates; no secure-element or tamper-proof container is assumed.

Authority and sequencing: [roadmap](../../../DEVELOPMENT_ROADMAP.md), [development status](../../../docs/DEVELOPMENT_STATUS.md), [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md). Canonical bytes: [RFC 8785, June 2020](https://www.rfc-editor.org/rfc/rfc8785.html). Browser randomness/hash boundary: [W3C Web Cryptography API Recommendation, 26 January 2017](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/). These sources define software primitives, not physical assurance. Implementation MUST pin the evaluated library/protocol revisions and record interoperability vectors; device-specific claims require actual manufacturer documentation and hardware evidence.
