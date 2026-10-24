# Portable reputation proof consumption

## 1. Metadata

- **Specification:** G28
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 3 (optional reputation)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Negotiate optional eligibility predicates for new offers while preserving manual trade availability and existing custody.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface EligibilityPolicyV1 {v:1;termsHash:string;required:boolean;
 predicate:"membership"|"score-threshold";issuerIds:readonly string[];
 policyHash:string;rootEpoch:string;verifierProfileId:string;scope:string;
 threshold:number|null;consumer:"local-advisory"|"authoritative";}
// Output: eligible/ineligible/unavailable with verified predicate, not trusted-human.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Maker signs eligibility policy in offer terms; buyer explicitly consents to exact disclosure. Validate issuer/root/revocation/profile/freshness, terms-bound message and purpose-scoped nullifier before acceptance. Required predicate with missing verifier/authoritative consumer blocks that offer; optional absent capability can be removed only through a new signed revision. Local-advisory mode cannot enforce globally single-use. Cache proof only for identical immutable terms/root/profile and at most 300 s; new revision revalidates. No retrofit to funded trade and no escrow release path.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Return fixed unavailable reason and permit finding a different basic offer. Unavailable proof package must not load in core-only build or break recovery. Overdisclosure request or unsupported score circuit returns UNSUPPORTED_PROVIDER before credential access.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Portable credential formats are not universally compatible or unlinkable. Issuer/routing metadata and repeated thresholds may correlate; never claim physical identity or guarantee honest behavior.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Wrong issuer/group/policy/threshold, required missing module, stale root, proof replay another trade, issuer revoked key, scope mismatch, forced overdisclosure and extension removed after funding. Assert core-only release/refund regression passes.

Sources: [Semaphore V4 documentation](https://docs.semaphore.pse.dev/), [Semaphore source](https://github.com/semaphore-protocol/semaphore). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
