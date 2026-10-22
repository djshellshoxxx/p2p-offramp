# Private reputation score proof

## 1. Metadata

- **Specification:** spec-reputation-score-statement
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 3 (optional reputation)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Specify authenticated score threshold semantics separately from Semaphore membership, which by itself proves no score.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface ScorePolicyV1 {issuerId:string;policyHash:string;epoch:string;
 minScore:0;maxScore:1000000;threshold:number;expiresAtSeconds:string;
 credentialSchema:"score-v1";verifierProfileId:string;}
// Private witness: issuer-authenticated identity-bound credential and score.
// Public predicate: same credential holder, 0<=score<=1000000,
// score>=threshold, fresh epoch/policy, terms-bound message and scoped nullifier.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Reject threshold outside integer range and require credential signature/commitment authenticated by approved issuer. Circuit must constrain credential identity to proof identity, range bound to prevent field wrap, issuer/policy/epoch/expiry and threshold predicate. No client-supplied unsigned score. Semaphore ordinary membership cannot substitute for credential predicate: until separate reviewed score circuit exists, this capability is unsupported. Issuance policy must define finalized trade evidence, rating authorization, unique contribution and collusion limits; on-chain crypto release alone does not prove honest fiat exchange.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unavailable score verifier is UNSUPPORTED_PROVIDER; expired/revoked credential fails eligibility. Updating score must issue authenticated new credential and revoke/expire prior policy as specified, not allow arbitrary addition of user ratings.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Issuer fabrication, self-trades and Sybil farming remain economic limitations. Range proof hides score but threshold probing can reveal intervals; user consent per disclosure, no automated query cascade. Score must not grant basic escrow spend authority.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Negative/overflow/wrapped score; threshold below/above bounds; wrong identity binding/issuer/epoch; forged credential; reused trade contribution; threshold probing UI; membership proof substituted for score proof. Cross-implementation verification and circuit constraint audit required.

Sources: [Semaphore V4 documentation](https://docs.semaphore.pse.dev/), [Semaphore source](https://github.com/semaphore-protocol/semaphore). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Score circuit, issuance economics, revocation integration and concrete provider artifacts are explicit enablement gates; no claimed off-the-shelf Semaphore score feature.
