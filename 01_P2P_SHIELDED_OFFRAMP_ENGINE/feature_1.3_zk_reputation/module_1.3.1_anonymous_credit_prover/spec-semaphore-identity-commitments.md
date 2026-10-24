# Semaphore identity commitments

## 1. Metadata

- **Specification:** spec-semaphore-identity-commitments
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 3 (optional reputation)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Use the actual Semaphore V4 identity/proof model without inventing compatibility with earlier trapdoor/nullifier versions.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface IdentityProfile {protocol:"semaphore-v4";packageVersion:string;
 sourceCommit:string;artifactHashes:readonly string[];fieldModulus:string;
 supportedTreeDepths:readonly number[];}
interface LocalIdentity {v:1;profileId:string;vaultRecordId:string;
 commitment:string;createdAtLocalMs:number;}
// Secret is opaque provider-native serialized identity, encrypted in G02;
// commitment/public inputs canonical unsigned field-element strings.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Use selected upstream V4 identity serialization/generation and cryptographic randomness through its reviewed API. No wallet-signature-derived identity or custom Poseidon/curve/key generation. Validate field elements 0<=x<p without modular reduction of arbitrary input. Profile binds exact SDK, circuit/verifying key/depth artifacts. Scope and message are actual V4 proof inputs; do not transplant V3 external-nullifier fields as if identical. G03 backup exports encrypted identity state with recovery limitations; messaging and wallet spending keys remain separate.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Locked vault cannot prove. Unsupported profile/depth returns UNSUPPORTED_PROVIDER, malformed commitment INVALID_INPUT. Lost secret cannot be recreated from public commitment; enroll a fresh identity under issuer rules rather than fabricate history. Identity rotation requires issuer update, not automatic old credential transfer.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Identity reuse may enable issuer/timing correlation; public commitment does not prove unique human or creditworthiness. Malicious generation/backup compromise can expose every related proof. Upstream audits do not audit this app or its integration.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Round-trip encrypted restore; upstream vectors for exact selected V4 profile; zero/negative/p>=modulus; wrong depth/key; cross-version parsing; corrupted serialized identity; RNG failure and locked vault. Assert no secret is sent to issuer/relay.

Sources: [Semaphore V4 documentation](https://docs.semaphore.pse.dev/), [Semaphore source](https://github.com/semaphore-protocol/semaphore). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Candidate protocol is V4; exact patch/commit, artifacts and cross-implementation vectors must be pinned in G06 before enabling. No upstream vector values are fabricated here.
