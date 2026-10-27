# Anonymous reputation revocation

## 1. Metadata

- **Specification:** spec-reputation-revocation
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 3 (optional reputation)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Publish signed root evolution and freshness requirements without retroactive escrow seizure.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface RootCheckpoint {issuerId:string;groupId:string;epoch:string;
 previousRoot:string|null;root:string;issuedAtSeconds:string;
 validUntilSeconds:string;policyHash:string;keyId:string;signature:Uint8Array;}
// Basic profile: new acceptance needs latest authenticated checkpoint,
// no grace root; checkpoint observation <=300 s old, root validity <=24 h.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Issuer governance publishes checkpoint/removal and key rotation signed by pinned active authority. Client stores highest observed epoch and rejects lower epoch even if signature valid. Root signature authenticates issuer statement, not proof it is globally latest; require fresh configured registry observation and explicitly report rollback/equivocation. Refresh witness only after root authentication and user choice; do not send identity secret. Key rotations require old-key-authenticated transition or release-manifest update; unknown keys fail closed.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

No network/current checkpoint means eligibility unavailable; optional basic trades can use no reputation if terms permit, never silently bypass a required predicate. Removed identity may appeal through issuer policy but app cannot guarantee reinstatement. Funded escrow rights remain immutable.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Issuer censorship, compromised keys, witness requests and timing de-anonymization persist. No client-only cache can prove worldwide latest root. Do not expose old trade history as revocation evidence.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Revoked member against stale root; epoch rollback; same epoch conflicting root; key rotation without authorization; offline refresh; backup with old checkpoint; removal during pending acceptance and already funded trade. Ensure funded release/refund unchanged.

Sources: [Semaphore V4 documentation](https://docs.semaphore.pse.dev/), [Semaphore source](https://github.com/semaphore-protocol/semaphore). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
