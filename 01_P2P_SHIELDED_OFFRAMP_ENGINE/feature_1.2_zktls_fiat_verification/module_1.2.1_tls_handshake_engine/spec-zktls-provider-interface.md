# zkTLS provider boundary

## 1. Metadata

- **Specification:** spec-zktls-provider-interface
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Expose bounded provider capabilities and exact-statement verification; unknown or unevaluated providers are unsupported.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface FiatProofRequest {v:1;binding:TradeBinding;termsHash:string;
 sourcePolicyId:string;statementVersion:1;challenge:string;disclosureHash:string;}
interface FiatProof {v:1;profileId:string;verificationKeyHash:string;
 statement:ReceiptStatementV1;proofBytes:Uint8Array;}
interface FiatProofProvider {
 capabilities():Readonly<{profileId:string;enabled:boolean;maxProofBytes:number}>;
 attest(r:FiatProofRequest,signal:AbortSignal):Promise<CoreResult<FiatProof>>;
 verify(p:FiatProof,expected:FiatProofRequest,signal:AbortSignal):Promise<CoreResult<VerifiedReceipt>>;
 cancel(jobId:string):void;
}
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Select exact allowlisted profile and check negotiated capability before input collection. Bound proof to 2 MiB and witness to 1 MiB. Verify key/profile, canonical public inputs, authenticated source, challenge, terms, time and recipient/amount predicates independently of provider success boolean. Return VerifiedReceipt with verified predicates and unverified assumptions explicitly enumerated; no boolean paid/final. Verification must be local or an explicitly negotiated trust model, never a bare remote JSON true.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unsupported browser/provider/key/version fails closed. Read/prover network cancellation never cancels existing escrow. Error normalization excludes raw bank response. A different provider requires fresh consent and job, not a silent fallback.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Provider may lie about supported TLS coverage, proof privacy or field extraction. Proof system validity requires exact circuit/parser semantics and pinned artifacts; origin proofs do not imply settlement authority.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Wrong provider/key/origin/trade/amount/beneficiary/challenge; oversized malformed proof; proof that passes crypto but mismatches expected fields; offline verification; disabled capability; profile substitution and cancellation.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Provider registry starts empty. Enablement requires upstream profile/version/digests, publicly checkable vectors plus independently generated fixtures, notary governance and scoped independent security review.
