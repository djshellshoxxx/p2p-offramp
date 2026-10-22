# Bank receipt proof statement

## 1. Metadata

- **Specification:** spec-bank-receipt-proof-statement
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Define the exact predicate authenticated receipt evidence can establish without asserting irrevocable bank settlement.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface ReceiptStatementV1 {v:1;binding:TradeBinding;termsHash:string;
 sourcePolicyId:string;parserVersion:string;challenge:string;
 currency:string;minorUnits:string;currencyScale:number;
 beneficiaryCommitment:string;referenceCommitment:string;
 transactionTimeSeconds:string;observedAtSeconds:string;
 status:"initiated"|"pending"|"posted"|"reversed"|"unknown";
 responseCommitment:string;verifierProfileId:string;}
// Currency uppercase ISO-style 3 letters from approved rail profile;
// scale 0..6, amount uint128 decimal integer >0, time uint64 seconds.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Statement asserts approved source bytes, at authenticated observation time, parsed by exact profile, contain the specified reference/status and exact amount/currency/beneficiary predicates bound to accepted terms and challenge. All claimed fields MUST be inside authenticated transcript and circuit/verifier coverage. No sum of partial payments or FX tolerance in v1. Beneficiary/reference commitments use reviewed domain-separated commitment profile with >=128-bit secret salts; never unsalted hashes of enumerable account data. Hash/encoding choice belongs to pinned provider profile, not an invented compatible circuit.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unknown/pending/reversed status never yields posted predicate. Missing authenticated timestamp or ambiguous parser yields INVALID_INPUT/INTEGRITY_FAILURE. A fresh later reversal can mark advisory evidence contradicted; earlier proof remains a statement about past observation, not false crypto.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Source may show stale/pending or reversible transaction. Proof does not establish payer physical identity, ownership, ultimate settlement, receipt by escrow seller or uniqueness without rail reference policy. Commitment disclosures can still correlate.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Valid transcript but wrong amount/currency/recipient; partial amount; unknown status mapping; unauthenticated DOM-inserted field; changed time zone; replayed challenge; reversed status; commitment salt substitution and integer overflow.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
