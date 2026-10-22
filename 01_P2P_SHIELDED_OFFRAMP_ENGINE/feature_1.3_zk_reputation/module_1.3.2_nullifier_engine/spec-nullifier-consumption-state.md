# Nullifier consumption state

## 1. Metadata

- **Specification:** spec-nullifier-consumption-state
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 3 (optional reputation)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Make authoritative one-use policy atomic when a consumer exists, and distinguish local observations from global guarantees.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface NullifierUse {v:1;domainHash:string;nullifier:string;
 messageHash:string;consumerId:string;anchor:string|null;
 state:"observed-local"|"provisional"|"finalized";}
// Authoritative optional consumer key: (domainHash,nullifier).
// consume(proof, expectedDomain, expectedMessage): verify+check+insert atomically.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

A deployed consumer checks exact profile/root/domain/message/proof and unconsumed key in one transaction, marks consumed before dependent action under reentrancy/CPI protection, and reverts all on failure. Duplicate exact submission reads existing result; different message with same key conflicts. Chain-specific state/finality/reorg rules determine provisional/finalized consumption. Basic core has no consumer: local G02 CAS dedup is labeled observed-local and cannot promise multi-device or global uniqueness. Relay ACK cannot consume.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Concurrent authoritative submissions permit one winner. Reorg removes provisional consumption and triggers reverify/reconcile. Unknown consumer or unavailable chain means required reputation action unavailable, never optimistic success. No pruning before every relevant proof/root expiry and replay horizon; default retain keys permanently for consumer lifetime.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Malicious consumer, fork and provider false state remain. Public nullifier/events can correlate purpose use; emit only necessary domain/key digest, never identity/score/witness.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Duplicate/concurrent call, callback reentry, wrong domain/message, reverted dependent action, fork rollback, old root, alternate verifier, unauthorized state write and local backup restore. Demonstrate two-browser local dedup does not claim authoritative prevention.

Sources: [Semaphore V4 documentation](https://docs.semaphore.pse.dev/), [Semaphore source](https://github.com/semaphore-protocol/semaphore). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
