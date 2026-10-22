# Order lifecycle reconciliation

## 1. Metadata

- **Specification:** spec-order-lifecycle-reconciliation
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Reconcile signed advertisements and funded single-fill trades without granting relay messages custody authority.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type OrderState="draft"|"advertised"|"negotiating"|"agreed"|
 "funding-uncertain"|"funded"|"closed"|"expired"|"cancelled"|"conflicted";
interface OrderRevision {v:1;maker:string;orderId:string;revision:number;
 previousTermsHash:string|null;termsHash:string;expiresAtSeconds:string;
 sellerNonce:string;state:OrderState;}
// A seller nonce is unique across all seller funded orders within deployment.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Apply authenticated highest known monotonic revision per maker/order; reject lower revision for new acceptance and flag same revision/different digest. Negotiation is not reservation authority. Both G16 signatures create agreed terms; G12 uncertain broadcast becomes funding-uncertain. Only verified chain snapshot creates funded or terminal closed. Chain funding of seller nonce prevents multiple fills even if seller signs multiple buyers; contract must reject nonce reuse, not merely duplicate trade ID. A cancellation controls only unfilled local negotiation, cannot revoke funded custody. On startup restore encrypted terms/journal, reconcile chain first, then bounded relay revisions.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Missing relay revisions mark stale/unavailable; no assumption that silence means cancelled. A reorg rolls funded observation back to uncertain and rereads nonce/state, never blindly allows replacement. Conflict blocks new acceptance pending explicit new maker revision.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Maker can sell fake liquidity or sign conflicting buyers; single-fill contract nonce limits funded crypto but cannot prove availability at advertisement time. Relays can hide cancellations or newer versions.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Concurrent accept to two buyers sharing nonce -> at most one fund; new order same nonce; stale cancellation after funding; offline expiry; same revision equivocation; relay gap; chain reorg; duplicate events and backup recovery. Assert only chain state changes escrow.

Sources: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
