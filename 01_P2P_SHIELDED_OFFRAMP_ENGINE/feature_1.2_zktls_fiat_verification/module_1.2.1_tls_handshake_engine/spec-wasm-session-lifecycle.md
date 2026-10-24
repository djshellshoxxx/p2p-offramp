# WASM proof session lifecycle

## 1. Metadata

- **Specification:** spec-wasm-session-lifecycle
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Give each proof attempt a single consented lifecycle with deterministic cancellation and no secret resume queue.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type ProofPhase="idle"|"consented"|"initializing"|"attesting"|
 "proving"|"verifying"|"complete"|"cancelled"|"failed";
interface ProofSession {v:1;jobId:string;termsHash:string;generation:number;
 phase:ProofPhase;policyHash:string;challenge:string;startedMonotonicMs:number;}
// Challenge >=128 random bits; one active session per trade and one per tab.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Transition in listed order; failure/cancellation from every nonterminal phase is terminal. Complete requires local verification under same profile, disclosure policy and immutable trade binding. Each retry creates a new job/challenge/consent; old output cannot attach to new attempt. Lock, account/terms/source-policy change, tab navigation or permission revocation cancels worker/network. Browser suspension does not reset budget; on resume cancel if elapsed unknown or over policy. Do not persist credentials, TLS keys, transcripts or a plaintext job queue.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Failed sessions retain only encrypted minimal phase/error/timestamp metadata on explicit retention choice. Reload starts idle, never auto-authenticates bank or resumes a network action. G12 unresolved transactions survive independently and cannot be cancelled by this proof lifecycle.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Old consent can disclose new data after source/page changes; bind exact parser/policy hash and preview. Timing and notary interaction remain linkable. Cancellation cannot retract bytes already transmitted.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Every legal edge and illegal skip; complete before verification; two tab sessions; permission revoke during attestation; worker crash; browser suspend/reload; wrong challenge output; changed terms; cancellation race. Assert no plaintext queue or hidden restart.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
