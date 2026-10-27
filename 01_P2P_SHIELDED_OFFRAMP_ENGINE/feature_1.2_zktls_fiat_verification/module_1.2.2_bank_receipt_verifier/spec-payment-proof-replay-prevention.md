# Payment-proof replay prevention

## 1. Metadata

- **Specification:** spec-payment-proof-replay-prevention
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Distinguish job challenges from receipt uniqueness and define the limits of local advisory evidence deduplication.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface ReceiptReplayKey {v:1;sourcePolicyId:string;railId:string;
 referenceCommitment:string;beneficiaryCommitment:string;}
interface ProofUse {binding:TradeBinding;termsHash:string;challenge:string;
 verifierProfileId:string;proofDigest:string;state:"verified"|"consumed";}
// Challenges >=128 random bits and single-use per verification request.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Verifier first checks full binding/version/key/challenge/freshness. On advisory receipt acceptance use atomic G02 CAS to associate proof digest with one trade locally; duplicates for same trade return existing evidence, cross-trade attempts conflict. This cannot stop use in another browser or with fresh commitment salts. Global receipt uniqueness requires a separately reviewed authoritative registry and a provider-proven deterministic rail reference nullifier, scoped to actual economic purpose; a trade-scoped nonce alone cannot prevent the same receipt backing two trades. Basic escrow exposes no proof-consumption call.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Concurrent local verification must yield one CAS winner. Imported backups are stale observations and reverify before display. A future on-chain consumer must atomically verify/check/consume and roll back on failure/reorg; it must not infer consumption from relay ACK. No such consumer is enabled here.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Salt changes, bank reference reuse, issuer equivocation and cross-chain domains defeat naive dedup. Do not publish bare receipt references or universal account identifiers. UI labels local replay checks as local, never global double-spend prevention.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Same proof twice, same receipt new challenge, two trades/tabs/browsers, altered salt, colliding bank reference, wrong chain/verifier, expired key and reorged hypothetical consumer. Assert local mode makes no global uniqueness claim.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Any settlement-authorizing proof consumer remains unavailable until authoritative uniqueness scope, nullifier circuit and cross-domain policy have separate review.
