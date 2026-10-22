# Anonymous reputation group membership

## 1. Metadata

- **Specification:** spec-reputation-group-membership
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 3 (optional reputation)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Verify anonymous inclusion under a trusted issuer root while separating admission policy from human uniqueness and score.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface GroupRootV1 {v:1;issuerId:string;groupId:string;epoch:string;
 root:string;issuedAtSeconds:string;validUntilSeconds:string;
 profileId:string;signature:Uint8Array;}
interface MembershipRequest {root:GroupRootV1;scope:string;message:string;
 proofBytes:Uint8Array;expectedPolicyHash:string;}
// Root interval <=86400 s; max proof envelope 256 KiB; issuer policy digest required.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Verify pinned issuer signing key, profile, root signature and monotonic epoch, validity interval and expected group admission policy. Verify Semaphore membership for exact root/scope/message using approved depth/artifact; do not accept a prover-supplied root. Eligibility is boolean membership under that issuer policy, not a score or guarantee against collusion. Bind message to terms digest and scope to defined relying purpose. Require revocation freshness before new acceptance; already funded custody is unaffected.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unknown issuer/root/profile or unavailable root refresh fails eligibility, not base wallet recovery. Root rollback/overlapping conflicting epoch is INTEGRITY_FAILURE. Display issuer and stale/revoked/unsupported status distinctly.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Issuer may admit Sybils, censor members or correlate enrollment/proof timing. Anonymous set size can be one; small set disclosure must be shown. Public roots reveal group evolution.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Valid/forged member; genuine proof for unapproved root; stale root; altered message/scope; wrong group/depth; revoked member old root; issuer equivocation; outage and one-member privacy warning. Assert no release authority follows membership.

Sources: [Semaphore V4 documentation](https://docs.semaphore.pse.dev/), [Semaphore source](https://github.com/semaphore-protocol/semaphore). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
