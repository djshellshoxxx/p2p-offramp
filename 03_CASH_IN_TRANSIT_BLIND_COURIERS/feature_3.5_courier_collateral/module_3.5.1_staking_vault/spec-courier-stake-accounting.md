# Courier stake accounting

## 1. Metadata

- **Specification ID:** CIT-14
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5, optional M5; no Phase 2 dependency
- **Module:** module_3.5.1_staking_vault
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective

Keep collateral solvent across concurrent courier commitments without implying that collateral authenticates cash.

This extension MUST be explicitly negotiated in new signed trade terms. Removing it MUST preserve core release, refund and recovery. Basic escrow remains seller-authorized release before its immutable deadline and refund to the seller at/after expiry; a courier message grants no settlement authority. Any monetary authority change requires a separately versioned opt-in escrow with its own audit and exits.

## 3. Architecture and data contracts

```typescript
type Hex32 = string; // exactly 64 lowercase hexadecimal characters
type Key = string; // canonical key under the terms-bound signing profile
type Seconds = number; // nonnegative safe integer Unix seconds
type Units = string; // canonical unsigned decimal, no leading zeros except "0"; <=78 digits
interface StakePosition { vaultId: string; courier: Key; assetId: string;
 deposited: Units; reserved: Units; unbonding: Units; withdrawable: Units; }
interface StakeReservation { reservationId: Hex32; shipmentId: Hex32; amount: Units;
 policyHash: Hex32; resolveBy: Seconds; state: "active"|"released"|"deducted"; }
```

Validate revision, generation and counter fields as nonnegative safe integers; reject overflow rather than wrap. Asset adapters impose their own narrower integer limits before monetary operations. Key and signature decoders MUST enforce the exact pinned profile lengths; display labels are never keys. These are domain payloads carried inside an authenticated, encrypted extension message. Bind the envelope to version, trade binding (chain, network, deployment, tradeId), shipment terms hash, message ID, sender and recipient. Reject unknown versions/fields, duplicate JSON keys, invalid encodings and payloads above 16 KiB before signature work. Use RFC 8785 canonical JSON for the signed payload and a module/version domain separator; signatures use the reviewed terms-bound key profile, never an invented hardware key scheme. Event order is not authority: validate signatures, dependencies and expected revision. Store private payloads only in the authenticated local vault.

## 4. Algorithms and invariants

Use checked integer arithmetic in smallest units; deposited=reserved+unbonding+withdrawable for the current accounted position. Reserve atomically only from withdrawable, once per reservation ID. Cap active reservations per courier at 64; no client-side sum may establish solvency. Resolve reservations at the immutable resolveBy using pre-agreed release rules unless a valid separately negotiated deduction already finalized. Unbond only unreserved funds; withdrawal follows chain finality and cannot bypass active reservations. Asset transfer accounting must use actual accepted balances under an allowlisted standard asset profile.

All transitions MUST be deterministic over validated inputs. Process at most 128 events per reconciliation batch, yield between batches, and stop on missing dependencies rather than infer success. Retries preserve command IDs; economic commands use the chain journal. Local clocks govern advisory coordination only; authoritative chain guards govern monetary deadlines.

## 5. Interfaces, errors and lifecycle

`deposit`, `reserve`, `beginUnbond`, `releaseReservation` and `withdraw` require a separately audited vault. Until that exists the feature is unsupported, with no simulated stake badge. Chain observation is pending until finality policy; reorgs roll back cached eligibility.

Return typed results `{ok:true,value}` or `{ok:false,code,retryable}`; common codes are malformed, unsupported-version, unauthorized, stale-revision, expired, missing-dependency, conflict and unavailable. A network timeout is unknown delivery, not failed custody. Locking the vault removes plaintext UI access; reload restores signed history and reconciles before offering actions. Redacted diagnostics contain error codes and random incident references, never cash amounts, coordinates, secrets or contact identities.

## 6. Threat assessment

Concurrent assignments can overbook collateral; only atomic on-chain reservations prevent it. Fee-on-transfer or rebasing assets can break accounting and are unsupported without explicit profiles. A large stake is neither identity nor delivery proof.

Container secrets, photographs, signatures and sensor assertions cannot guarantee cash contents, authenticity, custody or delivery. Route observers, recipients and compromised unlocked clients can retain disclosed information; expiry or deletion requests cannot guarantee remote erasure. Explicit consent and truthful claim labels are mandatory before physical coordination.

## 7. Verification and references

Required module fixtures: Deposit 100; two concurrent reserves of 70 result in one success. Release reservation twice changes balance once. Reorg removes deposit and invalidates unfinalized assignment eligibility. Refund 100 from a 90 balance refuses.

Also test malformed/oversized input, wrong shipment/network/deployment, duplicate IDs, denied permissions, crash/reload, offline reconciliation and optional-package removal. Verify no fixture permits a courier action to release/refund basic principal. Evidence must include deterministic unit fixtures, two-client integration, fault injection and independent review before activation; this design has no passing implementation evidence.

**Open gates:** EVM and Solana vault implementations, unbond delay, supported assets and audits remain absent; monetary collateral is gated off.

Authority and sequencing: [roadmap](../../../DEVELOPMENT_ROADMAP.md), [development status](../../../docs/DEVELOPMENT_STATUS.md), [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md). Canonical bytes: [RFC 8785, June 2020](https://www.rfc-editor.org/rfc/rfc8785.html). Browser randomness/hash boundary: [W3C Web Cryptography API Recommendation, 26 January 2017](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/). These sources define software primitives, not physical assurance. Implementation MUST pin the evaluated library/protocol revisions and record interoperability vectors; device-specific claims require actual manufacturer documentation and hardware evidence.
